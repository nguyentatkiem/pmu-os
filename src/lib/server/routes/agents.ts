import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, j, uid } from "../db";
import { bad, notFound, str } from "../http";
import type { Ctx, TenantSettings } from "../auth";
import { AGENTS, AGENT_NAME, runAgent } from "../agents";
import { agentChat, aiStatus } from "../agent-chat";
import { addDays, vnDayKey, vnToDate } from "../../shared/format";

const LANES = ["hr", "care", "sop", "report", "channel"];
const SCHEDULE_MIN = 60;
const SIM_INQ = [
  "Chào em, chiều mai chị muốn qua tư vấn phun mày được không?",
  "Bên mình có làm phun môi không em?",
  "Phun mí mất khoảng bao lâu vậy em?",
  "Em ơi cho chị đổi lịch sang thứ hai tuần sau nhé.",
  "Cho mình hỏi chi phí làm mày bên mình thế nào?",
  "Thứ bảy này còn lịch trống buổi sáng không em?",
  "Chị muốn đặt lịch dặm màu, tuần sau được không?",
];

async function lastRuns(tenantId: string) {
  return q<any>(
    "SELECT DISTINCT ON (agent) agent, id, status, summary, output, biz_started_at, trigger FROM agent_runs WHERE tenant_id=$1 ORDER BY agent, biz_started_at DESC",
    [tenantId],
  );
}

async function saveSettings(ctx: Ctx, patch: Partial<TenantSettings>) {
  const t = await one<any>("SELECT settings FROM tenants WHERE id=$1", [ctx.tenantId]);
  const next = { ...(t?.settings ?? {}), ...patch };
  await q("UPDATE tenants SET settings=$2::jsonb, updated_at=now(), version=version+1 WHERE id=$1", [ctx.tenantId, j(next)]);
  ctx.settings = next;
  return next as TenantSettings;
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/agents",
    handler: async ({ ctx }) => {
      ctx.require("approvals.view", "Trung tâm AI Agent dành cho quản lý và chủ doanh nghiệp.");
      const since = new Date(ctx.now().getTime() - 7 * 86400000);
      const stats = await q<any>(
        `SELECT agent, count(*)::int AS runs, max(biz_started_at) AS last_at,
                sum(CASE WHEN status='FAILED' THEN 1 ELSE 0 END)::int AS failed
           FROM agent_runs WHERE tenant_id=$1 AND biz_started_at >= $2 GROUP BY agent`,
        [ctx.tenantId, since],
      );
      const props = await q<any>(
        `SELECT coalesce(agent,'coordinator') AS agent, status, count(*)::int AS n FROM ai_proposals
          WHERE tenant_id=$1 AND (branch_id IS NULL OR branch_id = ANY($2)) AND agent IS NOT NULL GROUP BY 1,2`,
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const last = await q<any>(
        `SELECT DISTINCT ON (agent) agent, status, summary, biz_started_at FROM agent_runs WHERE tenant_id=$1 ORDER BY agent, biz_started_at DESC`,
        [ctx.tenantId],
      );
      const pendingAll = await one<any>(
        "SELECT count(*)::int AS n FROM ai_proposals WHERE tenant_id=$1 AND status='PENDING' AND (branch_id IS NULL OR branch_id = ANY($2))",
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const chats = await one<any>(
        "SELECT count(*)::int AS n FROM ai_messages WHERE tenant_id=$1 AND role='user' AND biz_at >= $2",
        [ctx.tenantId, since],
      );
      const agents = AGENTS.map((a) => {
        const s = stats.find((x) => x.agent === a.key);
        const l = last.find((x) => x.agent === a.key);
        const p = props.filter((x) => x.agent === a.key);
        return {
          ...a,
          enabled: ctx.settings.agents?.[a.key]?.enabled !== false,
          runs_7d: s?.runs ?? 0,
          failed_7d: s?.failed ?? 0,
          last_run: l ? { status: l.status, summary: l.summary, at: l.biz_started_at } : null,
          proposals: {
            pending: p.filter((x) => x.status === "PENDING").reduce((n, x) => n + x.n, 0),
            approved: p.filter((x) => ["APPROVED", "EXECUTED"].includes(x.status)).reduce((n, x) => n + x.n, 0),
            rejected: p.filter((x) => ["REJECTED", "RETURNED", "EXPIRED", "CANCELLED"].includes(x.status)).reduce((n, x) => n + x.n, 0),
          },
        };
      });
      return {
        agents,
        ai: await aiStatus(ctx),
        paused: !!ctx.settings.agents_paused,
        levels: ctx.settings.ai_policy?.levels ?? {},
        pending_total: pendingAll?.n ?? 0,
        chats_7d: chats?.n ?? 0,
        can_manage: ctx.can("settings.manage"),
        can_run: ctx.can("approvals.view"),
        simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data,
        now: ctx.now().toISOString(),
      };
    },
  },
  {
    method: "GET",
    path: "/agents/pipeline",
    handler: async ({ ctx, query }) => {
      ctx.require("approvals.view", "Luồng AI Agent dành cho quản lý và chủ doanh nghiệp.");
      const now = ctx.now();
      // Nhịp chạy theo lịch: khi có người mở Tổng quan, agent nào quá 60 phút chưa chạy sẽ được chạy (mỗi lượt tải tối đa 1 agent)
      let ticked: any = null;
      if (query.get("tick") === "1" && !ctx.settings.agents_paused) {
        const lr = await lastRuns(ctx.tenantId);
        const stale = LANES.filter((k) => ctx.settings.agents?.[k]?.enabled !== false)
          .map((k) => ({ k, at: lr.find((r) => r.agent === k)?.biz_started_at }))
          .filter((x) => !x.at || now.getTime() - new Date(x.at).getTime() > SCHEDULE_MIN * 60000)
          .sort((a, b) => (a.at ? new Date(a.at).getTime() : 0) - (b.at ? new Date(b.at).getTime() : 0))[0];
        if (stale) {
          const r = await runAgent(ctx, stale.k, "schedule");
          ticked = { agent: r.agent, name: r.name, summary: r.summary, status: r.status };
        }
      }
      const today = vnDayKey(now);
      const dayStart = vnToDate(today);
      const tomorrow = addDays(today, 1);
      const [sig] = await q<any>(
        `SELECT
          (SELECT count(*)::int FROM conversations WHERE tenant_id=$1 AND branch_id = ANY($2) AND status='NEW') AS zalo_new,
          (SELECT count(*)::int FROM appointments WHERE tenant_id=$1 AND branch_id = ANY($2) AND status='PENDING' AND start_at >= $4 AND start_at < $5) AS appt_pending,
          (SELECT count(*)::int FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND status IN ('TODO','IN_PROGRESS') AND due_at < $3) AS overdue,
          (SELECT count(*)::int FROM feedback f JOIN customers c ON c.id=f.customer_id WHERE f.tenant_id=$1 AND c.branch_id = ANY($2) AND f.status='OPEN' AND f.needs_specialist) AS feedback_open,
          (SELECT count(*)::int FROM learning_assignments la JOIN employees e ON e.id=la.employee_id WHERE la.tenant_id=$1 AND e.branch_id = ANY($2) AND la.status='ASSIGNED' AND la.due_at <= $6) AS learning_due,
          (SELECT count(*)::int FROM mkt_videos WHERE tenant_id=$1 AND status IN ('IN_REVIEW','REVISE')) AS video_review`,
        [ctx.tenantId, ctx.branchFilter, now, vnToDate(tomorrow), vnToDate(addDays(tomorrow, 1)), new Date(now.getTime() + 3 * 86400000)],
      );
      const [br] = await q<any>(
        `SELECT (SELECT count(*)::int FROM brain_notes WHERE tenant_id=$1 AND status='ACTIVE') + (SELECT count(*)::int FROM knowledge_items WHERE tenant_id=$1 AND status='APPROVED') AS active,
                (SELECT count(*)::int FROM brain_notes WHERE tenant_id=$1 AND status='PENDING') AS pending,
                (SELECT count(*)::int FROM brain_lookups WHERE tenant_id=$1 AND biz_at >= $2) AS lookups_today`,
        [ctx.tenantId, dayStart],
      );
      const props = await q<any>(
        `SELECT p.agent, p.status, p.biz_created_at, (SELECT max(decided_at) FROM approvals a WHERE a.proposal_id=p.id) AS decided_at
           FROM ai_proposals p WHERE p.tenant_id=$1 AND p.agent IS NOT NULL AND (p.branch_id IS NULL OR p.branch_id = ANY($2))`,
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const lr = await lastRuns(ctx.tenantId);
      const isToday = (d: any) => d && new Date(d).getTime() >= dayStart.getTime();
      const lanes = AGENTS.filter((a) => a.key !== "coordinator").map((a) => {
        const r = lr.find((x) => x.agent === a.key);
        const p = props.filter((x) => x.agent === a.key);
        const o = r?.output ?? {};
        return {
          key: a.key,
          name: a.name,
          icon: a.icon,
          enabled: ctx.settings.agents?.[a.key]?.enabled !== false,
          last_run: r ? { id: r.id, status: r.status, summary: r.summary, at: r.biz_started_at, trigger: r.trigger } : null,
          stages: {
            scan: (o.findings?.length ?? 0) + (o.proposals?.length ?? 0) + (o.skipped?.length ?? 0),
            brain: (o.brain ?? []).reduce((n: number, b: any) => n + (b.hits?.length ?? 0), 0),
            proposed: p.filter((x) => x.status === "PENDING").length,
            approved_today: p.filter((x) => ["APPROVED", "EXECUTED"].includes(x.status) && isToday(x.decided_at)).length,
            actions: o.actions?.length ?? 0,
          },
          next_at: r ? new Date(new Date(r.biz_started_at).getTime() + SCHEDULE_MIN * 60000).toISOString() : now.toISOString(),
        };
      });
      const coordinator = props.filter((x) => x.agent === "coordinator");
      const runs = await q<any>("SELECT agent, status, summary, biz_started_at AS at, trigger FROM agent_runs WHERE tenant_id=$1 ORDER BY biz_started_at DESC LIMIT 8", [ctx.tenantId]);
      const newProps = await q<any>(
        "SELECT id, code, summary, agent, biz_created_at AS at FROM ai_proposals WHERE tenant_id=$1 AND agent IS NOT NULL AND (branch_id IS NULL OR branch_id = ANY($2)) ORDER BY biz_created_at DESC LIMIT 8",
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const decisions = await q<any>(
        `SELECT a.decision, a.approver_label, a.decided_at AS at, p.code, p.id, p.agent FROM approvals a JOIN ai_proposals p ON p.id=a.proposal_id
          WHERE a.tenant_id=$1 AND p.agent IS NOT NULL ORDER BY a.decided_at DESC LIMIT 6`,
        [ctx.tenantId],
      );
      const looks = await q<any>("SELECT agent, query, hits, biz_at AS at FROM brain_lookups WHERE tenant_id=$1 ORDER BY biz_at DESC LIMIT 6", [ctx.tenantId]);
      const feed = [
        ...runs.map((r) => ({ type: "run", at: r.at, agent: r.agent, text: `${AGENT_NAME[r.agent]} ${r.trigger === "schedule" ? "chạy theo lịch" : r.trigger === "event" ? "chạy khi có tin Zalo đến" : r.trigger === "chat" ? "chạy theo lệnh chat" : "chạy tay"}: ${r.summary}`, status: r.status, href: "/agents" })),
        ...newProps.map((p) => ({ type: "proposal", at: p.at, agent: p.agent, text: `${AGENT_NAME[p.agent] ?? "Agent"} tạo đề xuất ${p.code}: ${p.summary}`, href: `/approvals?open=${p.id}` })),
        ...decisions.map((d) => ({ type: "decision", at: d.at, agent: d.agent, text: `${d.approver_label} ${d.decision === "APPROVE" ? "duyệt" : d.decision === "REJECT" ? "từ chối" : "trả lại"} ${d.code}`, href: `/approvals?open=${d.id}` })),
        ...looks.map((l) => ({ type: "brain", at: l.at, agent: l.agent, text: `${AGENT_NAME[l.agent] ?? "Agent"} tra Bộ não “${l.query}” → ${(l.hits ?? []).length} mục`, href: "/brain" })),
      ]
        .filter((e) => new Date(e.at).getTime() <= now.getTime() + 60000)
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, 14);
      return {
        now: now.toISOString(),
        paused: !!ctx.settings.agents_paused,
        ai: await aiStatus(ctx),
        signals: sig,
        brain: br,
        lanes,
        coordinator: { pending: coordinator.filter((x) => x.status === "PENDING").length, approved_today: coordinator.filter((x) => ["APPROVED", "EXECUTED"].includes(x.status) && isToday(x.decided_at)).length },
        totals: {
          pending: props.filter((x) => x.status === "PENDING").length,
          approved_today: props.filter((x) => ["APPROVED", "EXECUTED"].includes(x.status) && isToday(x.decided_at)).length,
          rejected_today: props.filter((x) => ["REJECTED", "RETURNED"].includes(x.status) && isToday(x.decided_at)).length,
        },
        feed,
        ticked,
        schedule_min: SCHEDULE_MIN,
        simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data,
        can_manage: ctx.can("settings.manage"),
      };
    },
  },
  {
    method: "POST",
    path: "/agents/simulate-inbound",
    handler: async ({ ctx }) => {
      ctx.require("approvals.view");
      if (!(ctx.mode === "DEMO" || ctx.settings.simulated_data)) throw bad("Chỉ mô phỏng được khi doanh nghiệp đang dùng DỮ LIỆU MÔ PHỎNG.");
      const now = ctx.now();
      const c = await one<any>(
        `SELECT c.id, c.display_name, cv.id AS conv_id FROM customers c JOIN conversations cv ON cv.customer_id=c.id
          WHERE c.tenant_id=$1 AND c.branch_id = ANY($2) AND cv.status='DONE'
            AND EXISTS (SELECT 1 FROM consents k WHERE k.customer_id=c.id AND k.purpose='CARE' AND k.status='GRANTED')
          ORDER BY random() LIMIT 1`,
        [ctx.tenantId, ctx.branchFilter],
      );
      if (!c) throw bad("Không còn khách mô phỏng phù hợp để tạo tin nhắn.");
      const body = SIM_INQ[Math.floor(Math.random() * SIM_INQ.length)];
      await q(
        "INSERT INTO messages (id, tenant_id, conversation_id, direction, body, delivery_status, author_label, external_event_id, sent_at) VALUES ($1,$2,$3,'IN',$4,'received',$5,$6,$7)",
        [uid(), ctx.tenantId, c.conv_id, body, c.display_name, `sim-live-${uid().slice(0, 12)}`, now],
      );
      await q("UPDATE conversations SET status='NEW', last_message_at=$2, updated_at=now(), version=version+1 WHERE id=$1", [c.conv_id, now]);
      const run = await runAgent(ctx, "care", "event");
      const prop = run.proposals.find((p) => p.summary.includes(c.display_name));
      const draft = prop ? await one<any>("SELECT proposed_payload FROM ai_proposals WHERE id=$1", [prop.id]) : null;
      await audit(ctx, "agent.simulate_inbound", "conversation", c.conv_id, { customer: c.display_name });
      return {
        customer: c.display_name,
        conversation_id: c.conv_id,
        inbound: body,
        draft: draft?.proposed_payload?.body ?? null,
        proposal: prop ?? null,
        brain: run.brain.find((b) => b.query === body)?.hits ?? [],
        run: { id: run.id, status: run.status, summary: run.summary },
      };
    },
  },
  {
    method: "GET",
    path: "/agents/runs",
    handler: async ({ ctx, query }) => {
      ctx.require("approvals.view");
      const agent = query.get("agent") || null;
      const rows = await q<any>(
        `SELECT id, agent, trigger, requested_label, status, summary, output, biz_started_at, duration_ms FROM agent_runs
          WHERE tenant_id=$1 AND ($2::text IS NULL OR agent=$2) ORDER BY biz_started_at DESC LIMIT 60`,
        [ctx.tenantId, agent],
      );
      return { runs: rows.map((r) => ({ ...r, name: AGENT_NAME[r.agent] ?? r.agent })) };
    },
  },
  {
    method: "POST",
    path: "/agents/:key/run",
    handler: async ({ ctx, params }) => {
      const r = await runAgent(ctx, params.key, "manual");
      await audit(ctx, "agent.run", "agent", params.key, { status: r.status, proposals: r.proposals.length, actions: r.actions.length });
      return r;
    },
  },
  {
    method: "PATCH",
    path: "/agents/:key",
    handler: async ({ ctx, params, body }) => {
      ctx.require("settings.manage", "Chỉ chủ doanh nghiệp hoặc quản trị được bật/tắt agent.");
      if (!AGENTS.some((a) => a.key === params.key)) throw notFound("Agent không tồn tại.");
      if (typeof body.enabled !== "boolean") throw bad("Thiếu trạng thái bật/tắt.", { enabled: "Bắt buộc" });
      const agents = { ...(ctx.settings.agents ?? {}), [params.key]: { enabled: body.enabled } };
      await saveSettings(ctx, { agents });
      await audit(ctx, body.enabled ? "agent.enable" : "agent.disable", "agent", params.key, {});
      return { ok: true, enabled: body.enabled };
    },
  },
  {
    method: "POST",
    path: "/agents/pause",
    handler: async ({ ctx, body }) => {
      ctx.require("settings.manage", "Chỉ chủ doanh nghiệp hoặc quản trị được dừng khẩn cấp.");
      const paused = !!body.paused;
      await saveSettings(ctx, { agents_paused: paused });
      await audit(ctx, paused ? "agent.pause_all" : "agent.resume_all", "agent", null, {});
      return { ok: true, paused };
    },
  },
  {
    method: "POST",
    path: "/agent/chat",
    handler: async ({ ctx, body }) => {
      ctx.require("assistant.use", "Bạn không có quyền dùng trợ lý AI.");
      const message = str(body.message, 1200);
      if (!message) throw bad("Vui lòng nhập yêu cầu.", { message: "Bắt buộc" });
      const r = await agentChat(ctx, typeof body.thread_id === "string" ? body.thread_id : null, message);
      await audit(ctx, "agent.chat", "ai_thread", r.thread_id, { engine: r.reply.engine, tools: r.reply.tool_trace, actions: r.reply.actions.length });
      return r;
    },
  },
  {
    method: "GET",
    path: "/agent/threads",
    handler: async ({ ctx }) => {
      ctx.require("assistant.use");
      const threads = await q<any>(
        "SELECT id, title, biz_updated_at FROM ai_threads WHERE tenant_id=$1 AND user_id=$2 ORDER BY biz_updated_at DESC LIMIT 20",
        [ctx.tenantId, ctx.userId],
      );
      return { threads, ai: await aiStatus(ctx) };
    },
  },
  {
    method: "GET",
    path: "/agent/threads/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("assistant.use");
      const t = await one<any>("SELECT * FROM ai_threads WHERE id=$1 AND tenant_id=$2 AND user_id=$3", [params.id, ctx.tenantId, ctx.userId]);
      if (!t) throw notFound("Không tìm thấy hội thoại.");
      const messages = await q<any>("SELECT id, role, content, biz_at FROM ai_messages WHERE thread_id=$1 ORDER BY biz_at, created_at", [t.id]);
      return { thread: t, messages };
    },
  },
];
