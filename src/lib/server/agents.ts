// Hệ điều hành AI Agent của PMU OS: các agent chuyên trách quét dữ liệu theo quyền người kích hoạt,
// tạo đề xuất chờ duyệt (L1) hoặc tự làm tác vụ rủi ro thấp được cấp quyền (L2, ví dụ nhắc việc nội bộ).
import { q, uid, j } from "./db";
import type { Ctx } from "./auth";
import { forbidden } from "./http";
import { analyzeWeek, buildReportContent, inboxSuggest } from "./ai";
import { createProposal } from "./proposals";
import { brainPropose, brainSearch, intentCounts } from "./brain";
import { ensureMarketing, funnel, needsExpert, VIDEO_STATUS_LABEL } from "./marketing";
import { addDays, fmtDate, fmtDateTime, fmtShortDay, fmtTime, vnDayKey, vnToDate, weekStart } from "../shared/format";

export interface AgentDef {
  key: string;
  name: string;
  mission: string;
  scope: string[];
  tools: string[];
  produces: string[];
  icon: string;
}

export const AGENTS: AgentDef[] = [
  {
    key: "coordinator",
    name: "Agent Điều phối",
    mission: "Nhận việc từ khung chat, hiểu yêu cầu, tra dữ liệu và giao cho agent chuyên trách. Mọi thay đổi dữ liệu đều thành đề xuất chờ duyệt.",
    scope: ["Theo quyền người đang chat"],
    tools: ["Tra cứu nhân sự, khách, lịch hẹn, công việc, SOP", "Tạo đề xuất giao việc / nhắn khách", "Gọi agent chuyên trách"],
    produces: ["Trả lời có nguồn", "Đề xuất chờ duyệt"],
    icon: "Sparkles",
  },
  {
    key: "hr",
    name: "Agent Nhân sự",
    mission: "Theo dõi việc quá hạn, ca thiếu người, ca trùng giờ; nhắc việc nội bộ và đề xuất bổ sung/điều chỉnh ca.",
    scope: ["Công việc", "Lịch làm việc", "Nghỉ phép"],
    tools: ["Quét việc quá hạn", "Phân tích lịch tuần", "Nhắc việc nội bộ (L2)", "Đề xuất ca (L1)"],
    produces: ["Nhắc việc nội bộ", "Đề xuất bổ sung/điều chỉnh ca"],
    icon: "Users",
  },
  {
    key: "care",
    name: "Agent Chăm sóc khách",
    mission: "Theo dõi lịch chưa xác nhận, hội thoại chưa trả lời, phản hồi cần chuyên viên; soạn trả lời theo FAQ đã duyệt và đề xuất việc gọi xác nhận.",
    scope: ["Lịch hẹn", "Hội thoại", "Phản hồi", "Chăm sóc sau dịch vụ"],
    tools: ["Quét lịch chờ xác nhận", "Soạn trả lời theo FAQ", "Đề xuất giao việc", "Đề xuất nội dung gửi khách (L1)"],
    produces: ["Đề xuất giao việc gọi xác nhận", "Bản trả lời chờ duyệt", "Đề xuất xử lý phản hồi"],
    icon: "Heart",
  },
  {
    key: "report",
    name: "Agent Báo cáo",
    mission: "Tổng hợp báo cáo điều hành cuối ngày có nguồn, mốc dữ liệu và phần chưa chắc chắn để quản lý duyệt.",
    scope: ["Công việc", "Nhân sự", "Lịch hẹn", "Phản hồi"],
    tools: ["Truy vấn số liệu theo phạm vi", "Tạo báo cáo nháp"],
    produces: ["Báo cáo nháp chờ duyệt"],
    icon: "FileChartColumn",
  },
  {
    key: "channel",
    name: "Agent Xây kênh",
    mission: "Dựng và vận hành kênh video “Tiệm nói thật” (phun xăm, nhân vật AI trên Google Flow): lên lô video, kiểm luật kịch bản, theo dõi kiểm duyệt, đề xuất quyết định kênh và đọc phễu khách.",
    scope: ["Kênh nội dung", "Lô video", "Kiểm duyệt", "Phễu"],
    tools: ["Kiểm luật kịch bản (nhãn AI, không trước/sau, không hứa)", "Giao thợ thật duyệt câu chuyên môn", "Đề xuất quyết định kênh (L1)", "Đề xuất xếp lịch đăng (L1)"],
    produces: ["Đề xuất chờ duyệt", "Phát hiện về lô video và phễu"],
    icon: "Clapperboard",
  },
  {
    key: "sop",
    name: "Agent Đào tạo SOP",
    mission: "Theo dõi bài học SOP chưa hoàn thành và SOP chờ duyệt; đề xuất giao việc học, không tự xuất bản tài liệu.",
    scope: ["SOP & đào tạo"],
    tools: ["Quét bài học sắp đến hạn", "Đề xuất giao việc học"],
    produces: ["Đề xuất giao việc học SOP"],
    icon: "GraduationCap",
  },
];

export const AGENT_NAME: Record<string, string> = Object.fromEntries(AGENTS.map((a) => [a.key, a.name]));

interface RunOut {
  proposals: { id: string; code: string; summary: string }[];
  actions: string[];
  findings: string[];
  skipped: string[];
  brain: { query: string; hits: { label: string; href: string }[] }[];
}

async function recall(ctx: Ctx, out: RunOut, query: string, agent: string) {
  const hits = await brainSearch(ctx, query, agent, 4);
  out.brain.push({ query, hits: hits.map((h) => ({ label: h.label, href: h.href })) });
  return hits;
}

async function tryPropose(ctx: Ctx, out: RunOut, p: Parameters<typeof createProposal>[1]) {
  try {
    const r = await createProposal(ctx, p);
    out.proposals.push({ id: r.id, code: r.code, summary: p.summary });
  } catch (e: any) {
    out.skipped.push(e?.message ?? "Bỏ qua đề xuất trùng");
  }
}

export async function runAgent(ctx: Ctx, key: string, trigger: "manual" | "chat" | "schedule" | "event") {
  if (!ctx.can("approvals.view")) throw forbidden("Chỉ quản lý hoặc chủ doanh nghiệp được kích hoạt agent.");
  const def = AGENTS.find((a) => a.key === key && a.key !== "coordinator");
  if (!def) throw forbidden("Agent không tồn tại hoặc không chạy độc lập.");
  const started = Date.now();
  const now = ctx.now();
  const out: RunOut = { proposals: [], actions: [], findings: [], skipped: [], brain: [] };
  const runId = uid();
  let status = "SUCCEEDED";
  let summary = "";
  if (ctx.settings.agents_paused) {
    status = "SKIPPED";
    summary = "Hệ AI Agent đang ở chế độ dừng khẩn cấp; không chạy.";
  } else if (ctx.settings.agents?.[key]?.enabled === false) {
    status = "SKIPPED";
    summary = `${def.name} đang tắt.`;
  } else {
    try {
      if (key === "hr") await runHr(ctx, out);
      if (key === "care") await runCare(ctx, out);
      if (key === "report") await runReport(ctx, out);
      if (key === "sop") await runSop(ctx, out);
      if (key === "channel") await runChannel(ctx, out);
      summary = `${out.proposals.length} đề xuất mới, ${out.actions.length} thao tác tự động, ${out.findings.length} phát hiện.`;
    } catch (e: any) {
      status = "FAILED";
      summary = `Lỗi khi chạy: ${e?.message ?? "không rõ"}. Các thao tác thủ công vẫn hoạt động bình thường.`;
    }
  }
  await q(
    `INSERT INTO agent_runs (id, tenant_id, agent, trigger, requested_by, requested_label, status, summary, output, biz_started_at, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    [runId, ctx.tenantId, key, trigger, ctx.userId, ctx.actorLabel, status, summary, j(out), now, Date.now() - started],
  );
  return { id: runId, agent: key, name: def.name, status, summary, ...out };
}

// ---------- Agent Nhân sự ----------
async function runHr(ctx: Ctx, out: RunOut) {
  const now = ctx.now();
  const overdue = await q<any>(
    `SELECT t.id, t.code, t.title, t.due_at, e.display_name FROM tasks t JOIN employees e ON e.id=t.owner_id
      WHERE t.tenant_id=$1 AND t.branch_id = ANY($2) AND t.status IN ('TODO','IN_PROGRESS') AND t.due_at < $3 ORDER BY t.due_at LIMIT 20`,
    [ctx.tenantId, ctx.branchFilter, now],
  );
  await recall(ctx, out, "nhắc việc quá hạn, ca chiều thiếu người, lịch làm việc", "hr");
  const l2 = (ctx.settings.ai_policy?.levels?.INTERNAL_REMINDER ?? "L1") === "L2";
  for (const t of overdue) {
    out.findings.push(`${t.code} “${t.title}” của ${t.display_name} quá hạn từ ${fmtDateTime(t.due_at)}.`);
    if (!l2) continue;
    const bucket = now.toISOString().slice(0, 13);
    const r = await q<any>(
      `INSERT INTO task_events (id, tenant_id, task_id, actor_id, actor_label, type, payload, dedupe_key, occurred_at)
       VALUES ($1,$2,$3,$4,'Agent Nhân sự','REMINDER',$5::jsonb,$6,$7) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [uid(), ctx.tenantId, t.id, null, j({ message: `Nhắc nhở tự động: “${t.title}” đã quá hạn (${fmtDateTime(t.due_at)}).` }), `remind:${t.id}:${bucket}`, now],
    );
    if (r.length) out.actions.push(`Nhắc việc nội bộ ${t.code} cho ${t.display_name} (mức L2).`);
  }
  const MAX_SHIFT_PROPOSALS = 6;
  let shiftProps = 0;
  for (const ws of [weekStart(addDays(vnDayKey(now), 1)), weekStart(addDays(vnDayKey(now), 8))]) {
    const has = await q<any>("SELECT count(*)::int AS n FROM shifts WHERE tenant_id=$1 AND branch_id = ANY($2) AND status <> 'CANCELLED' AND start_at >= $3 AND start_at < $4", [
      ctx.tenantId,
      ctx.branchFilter,
      vnToDate(ws),
      vnToDate(addDays(ws, 7)),
    ]);
    if (!has[0].n) {
      out.findings.push(`Tuần ${fmtShortDay(ws)} chưa xếp lịch làm việc. Quản lý cần lập lịch tuần trước; agent không tự đề xuất từng ca cho tuần trống.`);
      continue;
    }
    const a = await analyzeWeek(ctx, ws);
    for (const c of a.conflicts) out.findings.push(c.message);
    for (const g of a.gaps) out.findings.push(g.message);
    if (a.gaps.length) {
      const r = await brainPropose(ctx, {
        kind: "LESSON",
        title: `Tuần ${fmtShortDay(ws)}: ${a.gaps.length} ca thiếu người`,
        body: `Agent Nhân sự phát hiện ${a.gaps.length} ca dưới mức tối thiểu trong tuần bắt đầu ${fmtShortDay(ws)}: ${a.gaps.slice(0, 4).map((g: any) => g.message).join(" · ")}. Đề xuất rà và xếp ca sớm.`,
        tags: ["ca", "thiếu người", "lịch làm việc"],
        agent: "hr",
        author: "Agent Nhân sự",
        source_label: `Lịch làm việc tuần ${fmtShortDay(ws)}`,
        source_href: `/shifts?week=${ws}`,
        dedupe_key: `lesson:hr:gaps:${ws}`,
      });
      if (r.created) out.actions.push(`Ghi bài học “ca thiếu người tuần ${fmtShortDay(ws)}” vào Bộ não (chờ duyệt).`);
    }
    for (const s of a.suggestions as any[]) {
      if (shiftProps >= MAX_SHIFT_PROPOSALS) {
        out.findings.push(`Còn ${(a.suggestions as any[]).length - shiftProps} gợi ý ca khác; agent dừng ở ${MAX_SHIFT_PROPOSALS} đề xuất mỗi lượt để quản lý duyệt kịp.`);
        break;
      }
      shiftProps++;
      const target = s.target_id ? (await q<any>("SELECT version FROM shifts WHERE id=$1", [s.target_id]))[0] : null;
      await tryPropose(ctx, out, {
        action_type: s.action_type,
        summary: s.detail,
        payload: s.payload,
        reason: s.reason,
        source_refs: [{ type: "module", id: null, label: `Lịch làm việc tuần ${fmtShortDay(ws)}`, href: `/shifts?week=${ws}` }],
        requested_label: "Agent Nhân sự",
        target_type: s.target_id ? "shift" : null,
        target_id: s.target_id,
        target_version: target?.version ?? null,
        before: { note: s.action_type === "SHIFT_ADJUST" ? "Ca chưa duyệt đang trùng" : "Ca đang thiếu nhân sự" },
        after: { note: s.detail },
        dedupe_key: `agent:hr:${s.key}`,
        agent: "hr",
      });
    }
  }
}

// ---------- Agent Chăm sóc khách ----------
async function runCare(ctx: Ctx, out: RunOut) {
  const now = ctx.now();
  const tomorrow = addDays(vnDayKey(now), 1);
  const pend = await q<any>(
    `SELECT a.id, a.code, a.start_at, a.branch_id, c.display_name AS customer FROM appointments a JOIN customers c ON c.id=a.customer_id
      WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND a.status='PENDING' AND a.start_at >= $3 AND a.start_at < $4 ORDER BY a.start_at`,
    [ctx.tenantId, ctx.branchFilter, vnToDate(tomorrow), vnToDate(addDays(tomorrow, 1))],
  );
  const byBranch = new Map<string, any[]>();
  for (const a of pend) byBranch.set(a.branch_id, [...(byBranch.get(a.branch_id) ?? []), a]);
  for (const [branchId, list] of byBranch) {
    out.findings.push(`${list.length} lịch ngày ${fmtShortDay(tomorrow)} còn chờ xác nhận.`);
    const owner = (
      await q<any>(
        `SELECT e.id, e.display_name, (SELECT count(*)::int FROM tasks t WHERE t.owner_id=e.id AND t.status IN ('TODO','IN_PROGRESS','SUBMITTED')) AS load
           FROM employees e WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.active AND e.position IN ('CUSTOMER_CARE','RECEPTION')
          ORDER BY (e.position='CUSTOMER_CARE') DESC, load ASC LIMIT 1`,
        [ctx.tenantId, branchId],
      )
    )[0];
    if (!owner) continue;
    const due = now.getTime() < vnToDate(vnDayKey(now), "16:00").getTime() ? vnToDate(vnDayKey(now), "17:00") : vnToDate(tomorrow, "08:00");
    await tryPropose(ctx, out, {
      action_type: "TASK_ASSIGN",
      summary: `Giao ${owner.display_name} gọi xác nhận ${list.length} lịch ngày ${fmtShortDay(tomorrow)}, hạn ${fmtTime(due)} ${fmtDate(due)}`,
      payload: {
        title: `Gọi xác nhận ${list.length} lịch ngày ${fmtShortDay(tomorrow)}`,
        owner_id: owner.id,
        due_at: due.toISOString(),
        priority: "HIGH",
        checklist: ["Xem danh sách lịch chờ", ...list.slice(0, 8).map((a: any) => `Liên hệ ${a.customer} (${fmtTime(a.start_at)})`), "Cập nhật xác nhận"],
      },
      reason: "Lịch chưa xác nhận; nhắc tự động không gửi được khi Zalo chưa kết nối.",
      source_refs: list.slice(0, 5).map((a: any) => ({ type: "appointment", id: a.id, label: `Lịch hẹn #${a.code}`, href: `/appointments?date=${tomorrow}&open=${a.id}` })),
      requested_label: "Agent Chăm sóc khách",
      owner_employee_id: owner.id,
      before: { note: `${list.length} lịch chờ xác nhận` },
      after: { title: `Gọi xác nhận lịch ${fmtShortDay(tomorrow)}`, owner: owner.display_name, due: fmtDateTime(due) },
      dedupe_key: `agent:care:confirm:${tomorrow}:${branchId}`,
      agent: "care",
    });
  }
  // Hội thoại mới chưa trả lời: soạn bản trả lời theo FAQ đã duyệt
  const convs = await q<any>(
    `SELECT cv.id, cv.version, c.display_name, c.id AS customer_id FROM conversations cv JOIN customers c ON c.id=cv.customer_id
      WHERE cv.tenant_id=$1 AND cv.branch_id = ANY($2) AND cv.status='NEW' ORDER BY cv.last_message_at DESC LIMIT 5`,
    [ctx.tenantId, ctx.branchFilter],
  );
  for (const cv of convs) {
    const last = (await q<any>("SELECT body FROM messages WHERE conversation_id=$1 AND direction='IN' ORDER BY sent_at DESC LIMIT 1", [cv.id]))[0];
    const hits = last ? await recall(ctx, out, last.body, "care") : [];
    const s = await inboxSuggest(ctx, cv.id);
    if (!s.draft || s.needs_specialist) {
      out.findings.push(`Hội thoại của ${cv.display_name} cần chuyên viên trả lời (chưa có FAQ phù hợp hoặc câu hỏi chuyên môn).`);
      continue;
    }
    await tryPropose(ctx, out, {
      action_type: "CUSTOMER_MESSAGE",
      summary: `Trả lời ${cv.display_name} theo FAQ đã duyệt`,
      payload: { conversation_id: cv.id, body: s.draft },
      reason: "Khách nhắn chưa được trả lời; nội dung lấy từ FAQ đã duyệt.",
      source_refs: [...s.sources, ...hits.filter((h) => h.type === "note").map((h) => ({ type: "brain", id: h.id, label: `Bộ não · ${h.label}`, href: h.href }))],
      requested_label: "Agent Chăm sóc khách",
      dedupe_key: `agent:care:msg:${cv.id}`,
      before: { status: "Chưa trả lời" },
      after: { body: s.draft },
      affected: [{ type: "customer", id: cv.customer_id, label: cv.display_name }],
      target_type: "conversation",
      target_id: cv.id,
      target_version: cv.version,
      agent: "care",
    });
  }
  // Phản hồi cần chuyên viên chưa phân công
  const fbs = await q<any>(
    `SELECT f.id, f.body, c.display_name, c.branch_id FROM feedback f JOIN customers c ON c.id=f.customer_id
      WHERE f.tenant_id=$1 AND c.branch_id = ANY($2) AND f.status='OPEN' AND f.needs_specialist AND f.assigned_to IS NULL LIMIT 5`,
    [ctx.tenantId, ctx.branchFilter],
  );
  for (const f of fbs) {
    const mgr = (await q<any>("SELECT id, display_name FROM employees WHERE tenant_id=$1 AND branch_id=$2 AND position='MANAGER' AND active LIMIT 1", [ctx.tenantId, f.branch_id]))[0];
    if (!mgr) continue;
    out.findings.push(`${f.display_name}: “${f.body}” — cần chuyên viên xử lý.`);
    await tryPropose(ctx, out, {
      action_type: "TASK_ASSIGN",
      summary: `Giao ${mgr.display_name} xử lý phản hồi của ${f.display_name}`,
      payload: { title: `Xử lý phản hồi của ${f.display_name}`, owner_id: mgr.id, due_at: vnToDate(addDays(vnDayKey(now), 1), "12:00").toISOString(), priority: "HIGH", checklist: ["Đọc phản hồi", "Liên hệ khách", "Ghi kết quả xử lý"] },
      reason: "Phản hồi cần người có thẩm quyền xử lý; AI không tư vấn chuyên môn thay chuyên viên.",
      source_refs: [{ type: "feedback", id: f.id, label: `Phản hồi · ${f.display_name}`, href: "/care" }],
      requested_label: "Agent Chăm sóc khách",
      owner_employee_id: mgr.id,
      dedupe_key: `agent:care:fb:${f.id}`,
      agent: "care",
    });
  }
  const late = await q<any>(
    `SELECT count(*)::int AS n FROM care_touchpoints t JOIN customers c ON c.id=t.customer_id
      WHERE t.tenant_id=$1 AND c.branch_id = ANY($2) AND t.status='TO_CONTACT' AND t.due_at < $3`,
    [ctx.tenantId, ctx.branchFilter, now],
  );
  if (late[0].n) out.findings.push(`${late[0].n} điểm chạm chăm sóc đã đến hạn nhưng chưa liên hệ.`);
  const ic = await intentCounts(ctx, 7);
  if (ic.total) {
    const top = ic.counts.filter((c) => c.n > 0);
    const r = await brainPropose(ctx, {
      kind: "INSIGHT",
      title: `Ý định khách nhắn Zalo 7 ngày đến ${fmtShortDay(vnDayKey(now))}`,
      body: `${ic.total} tin khách gửi đến trong 7 ngày (đếm theo từ khóa): ${top.map((c) => `${c.label} ${c.n}`).join(" · ")}.`,
      tags: ["zalo", "ý định", "insight"],
      agent: "care",
      author: "Agent Chăm sóc khách",
      source_label: "Hội thoại 7 ngày",
      source_href: "/inbox",
      confidence: "MEDIUM",
      dedupe_key: `insight:intents:${vnDayKey(now)}`,
    });
    out.actions.push(r.created ? "Ghi insight ý định khách 7 ngày vào Bộ não (chờ duyệt)." : "Cập nhật insight ý định khách 7 ngày trong Bộ não.");
  }
}

// ---------- Agent Báo cáo ----------
async function runReport(ctx: Ctx, out: RunOut) {
  const now = ctx.now();
  const day = vnDayKey(now);
  const content = await buildReportContent(q, { tenantId: ctx.tenantId, branchIds: ctx.branchFilter, day, now });
  await recall(ctx, out, "báo cáo cuối ngày", "report");
  const names = await q<any>("SELECT name FROM branches WHERE id = ANY($1)", [ctx.branchFilter]);
  const branchId = ctx.branchFilter.length === 1 ? ctx.branchFilter[0] : null;
  const scope = names.map((n) => n.name).join(", ");
  const existing = (
    await q<any>("SELECT id FROM reports WHERE tenant_id=$1 AND period_date=$2 AND status='DRAFT' AND scope=$3 AND branch_id IS NOT DISTINCT FROM $4::uuid LIMIT 1", [ctx.tenantId, day, scope, branchId])
  )[0];
  if (existing) {
    await q("UPDATE reports SET content=$2::jsonb, source_cutoff=$3, updated_at=now() WHERE id=$1", [existing.id, j(content), now]);
  } else {
    await q(
      "INSERT INTO reports (id, tenant_id, branch_id, period_date, scope, source_cutoff, content, status, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'DRAFT',$8,$9)",
      [uid(), ctx.tenantId, branchId, day, scope, now, j(content), ctx.userId, now],
    );
  }
  out.actions.push(`${existing ? "Cập nhật" : "Tạo"} báo cáo nháp ngày ${fmtShortDay(day)} (${content.tasks.done}/${content.tasks.total} việc hoàn thành, ${content.tasks.overdue} quá hạn). Chờ quản lý duyệt.`);
  for (const i of content.issues.slice(0, 5)) out.findings.push(i.text);
}

// ---------- Agent Đào tạo SOP ----------
async function runSop(ctx: Ctx, out: RunOut) {
  const now = ctx.now();
  await recall(ctx, out, "đào tạo SOP bài học quy trình", "sop");
  const due = await q<any>(
    `SELECT la.id, la.due_at, e.id AS employee_id, e.display_name, d.title, v.version_label FROM learning_assignments la
       JOIN employees e ON e.id=la.employee_id JOIN sop_versions v ON v.id=la.sop_version_id JOIN sop_documents d ON d.id=v.document_id
      WHERE la.tenant_id=$1 AND e.branch_id = ANY($2) AND la.status='ASSIGNED' AND la.due_at <= $3 AND e.active ORDER BY la.due_at LIMIT 10`,
    [ctx.tenantId, ctx.branchFilter, new Date(now.getTime() + 3 * 86400000)],
  );
  for (const l of due) {
    out.findings.push(`${l.display_name} chưa làm bài SOP “${l.title}” v${l.version_label} (hạn ${fmtDate(l.due_at)}).`);
    await tryPropose(ctx, out, {
      action_type: "TASK_ASSIGN",
      summary: `Giao ${l.display_name} hoàn thành bài học SOP “${l.title}”`,
      payload: { title: `Hoàn thành bài học SOP “${l.title}” v${l.version_label}`, owner_id: l.employee_id, due_at: new Date(Math.max(new Date(l.due_at).getTime(), now.getTime() + 4 * 3600000)).toISOString(), priority: "MEDIUM", checklist: ["Đọc SOP", "Làm bài kiểm tra"] },
      reason: "Bài học SOP sắp đến hạn hoặc quá hạn.",
      source_refs: [{ type: "learning", id: l.id, label: `Đào tạo · ${l.title} v${l.version_label}`, href: "/knowledge" }],
      requested_label: "Agent Đào tạo SOP",
      owner_employee_id: l.employee_id,
      dedupe_key: `agent:sop:${l.id}`,
      agent: "sop",
    });
  }
  const pend = await q<any>(
    "SELECT d.title, v.version_label FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id WHERE v.tenant_id=$1 AND v.status='PENDING_APPROVAL'",
    [ctx.tenantId],
  );
  for (const p of pend) out.findings.push(`SOP “${p.title}” v${p.version_label} đang chờ người có thẩm quyền duyệt xuất bản.`);
}

// ---------- Agent Xây kênh ----------
async function runChannel(ctx: Ctx, out: RunOut) {
  const now = ctx.now();
  const chId = await ensureMarketing(ctx);
  if (!chId) {
    out.findings.push("Chưa có kênh nội dung nào. Vào Đề xuất xây kênh để dựng kênh đầu tiên.");
    return;
  }
  await recall(ctx, out, "kênh video phun xăm kiểm duyệt nhãn AI kịch bản", "channel");
  const vids = await q<any>("SELECT id, code, title, status, script, expert_ok, biz_created_at, updated_at FROM mkt_videos WHERE tenant_id=$1 AND channel_id=$2", [ctx.tenantId, chId]);
  const by = (s: string) => vids.filter((v) => v.status === s);
  for (const v of by("IN_REVIEW")) {
    const last = await q<any>("SELECT biz_at FROM mkt_reviews WHERE video_id=$1 ORDER BY biz_at DESC LIMIT 1", [v.id]);
    const since = last[0] ? new Date(last[0].biz_at) : new Date(v.biz_created_at);
    const hours = Math.round((now.getTime() - since.getTime()) / 3600000);
    out.findings.push(`Video ${v.code} “${v.title}” chờ kiểm duyệt${hours >= 1 ? ` ${hours} giờ` : ""}: cần người nghe lời, giọng, khớp miệng.`);
  }
  // Câu chuyên môn chưa có thợ duyệt → giao thợ thật (L1)
  const tech = (await q<any>("SELECT id, display_name, branch_id FROM employees WHERE tenant_id=$1 AND position='TECHNICIAN' AND active AND branch_id = ANY($2) ORDER BY code LIMIT 1", [ctx.tenantId, ctx.branchFilter]))[0];
  for (const v of vids.filter((x) => ["SCRIPTED", "PRODUCED", "IN_REVIEW", "REVISE"].includes(x.status) && !x.expert_ok && needsExpert(x.script ?? []))) {
    out.findings.push(`Video ${v.code} có câu chuyên môn chưa được thợ thật duyệt.`);
    if (!tech) continue;
    const lines = (v.script ?? []).flatMap((c: any) => c.lines ?? []).filter((l: any) => l.expert).map((l: any) => `Đọc câu: “${l.text}”`);
    await tryPropose(ctx, out, {
      action_type: "TASK_ASSIGN",
      summary: `Giao ${tech.display_name} duyệt câu chuyên môn của video ${v.code} kênh Tiệm nói thật`,
      payload: { title: `Duyệt câu chuyên môn video ${v.code} (kênh Tiệm nói thật)`, owner_id: tech.id, due_at: new Date(now.getTime() + 24 * 3600000).toISOString(), priority: "MEDIUM", checklist: [...lines.slice(0, 6), "Xác nhận đúng chuyên môn hoặc đề xuất câu thay", "Báo lại quản lý kênh"] },
      reason: "Luật kênh: câu về độ bền, màu mực, thời gian bong phải được thợ thật duyệt trước khi đăng.",
      source_refs: [{ type: "video", id: v.id, label: `Video ${v.code} · ${v.title}`, href: `/marketing?video=${v.id}` }],
      requested_label: "Agent Xây kênh",
      owner_employee_id: tech.id,
      dedupe_key: `agent:channel:expert:${v.id}`,
      agent: "channel",
    });
  }
  // Video đã duyệt → đề xuất xếp lịch đăng khung 06:30 sáng kế tiếp
  let slot = 1;
  for (const v of by("APPROVED")) {
    const dayKey = addDays(vnDayKey(now), slot++);
    const at = vnToDate(dayKey, "06:30");
    await tryPropose(ctx, out, {
      action_type: "VIDEO_PUBLISH",
      summary: `Xếp lịch đăng video ${v.code} “${v.title}” lúc 06:30 ${fmtDate(at)} (riêng tư trước)`,
      payload: { video_id: v.id, scheduled_at: at.toISOString() },
      reason: "Video đã qua kiểm duyệt. Khung 06:00–07:00 theo số đo kênh tham chiếu. Hệ thống chưa nối nền tảng: người phụ trách đăng thủ công, bật nhãn AI.",
      source_refs: [{ type: "video", id: v.id, label: `Video ${v.code}`, href: `/marketing?video=${v.id}` }],
      requested_label: "Agent Xây kênh",
      before: { trang_thai: VIDEO_STATUS_LABEL.APPROVED },
      after: { trang_thai: VIDEO_STATUS_LABEL.SCHEDULED, lich_dang: `06:30 ${fmtDate(at)}` },
      target_type: "mkt_video",
      target_id: v.id,
      dedupe_key: `agent:channel:publish:${v.id}`,
      agent: "channel",
    });
  }
  // Lô kế tiếp: ý tưởng chưa có kịch bản, nhân vật chưa tạo
  const ideas = by("IDEA");
  if (ideas.length) out.findings.push(`${ideas.length} video ở lô kế hoạch mới là ý tưởng, chưa có kịch bản (${ideas.map((v) => v.code).join(", ")}). Có thể nhờ trợ lý chat viết kịch bản.`);
  const planned = await q<any>("SELECT name FROM mkt_characters WHERE channel_id=$1 AND status<>'CREATED'", [chId]);
  if (planned.length) out.findings.push(`${planned.length} nhân vật chưa tạo trên Flow: ${planned.map((c) => c.name).join(", ")}.`);
  // Phễu: điểm nghẽn
  const f = await funnel(ctx);
  if (f.bottleneck && f.bottleneck.rate !== null)
    out.findings.push(`Phễu: chặng ${f.bottleneck.from} → ${f.bottleneck.to} có tỷ lệ chuyển thấp nhất (${Math.round((f.bottleneck.rate as number) * 100)}%). Nội dung dạng A, B, C nhắm vào niềm tin trước khi đặt lịch.`);
  if (!f.content.published) out.findings.push("Kênh chưa đăng video nào nên chưa có số view thật để nối với phễu.");
}
