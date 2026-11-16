// Hộp phê duyệt: đề xuất → duyệt → thực thi một lần (idempotency) → nhật ký.
import { q, tx, uid, j, type Q } from "./db";
import type { Ctx } from "./auth";
import { audit } from "./router";
import { bad, conflict, forbidden, notFound } from "./http";
import {
  appointmentConflicts,
  getMessagingAdapter,
  hasCareConsent,
  inQuietHours,
  lockEmployee,
  nextCode,
  shiftConflicts,
  AdapterNotConnected,
} from "./domain";
import { fmtDate, fmtRange, vnDayKey } from "../shared/format";
import { PROPOSAL_TYPE_LABEL } from "../shared/labels";

export const ACTION_PERMISSION: Record<string, string> = {
  SHIFT_REASSIGN: "shifts.approve",
  SHIFT_CREATE: "shifts.approve",
  SHIFT_ADJUST: "shifts.approve",
  TASK_ASSIGN: "tasks.create",
  CUSTOMER_MESSAGE: "inbox.reply",
  CARE_MESSAGE: "care.manage",
  SOP_PUBLISH: "knowledge.publish",
};

async function proposalCode(qq: Q, ctx: Ctx) {
  const d = vnDayKey(ctx.now()).replace(/-/g, "");
  const r = await qq<{ n: number }>("SELECT count(*)::int AS n FROM ai_proposals WHERE tenant_id=$1", [ctx.tenantId]);
  return `DX-${d}-${String(r[0].n + 1).padStart(3, "0")}`;
}

export interface NewProposal {
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  reason: string;
  source_refs: unknown[];
  requested_label?: string;
  owner_employee_id?: string | null;
  before?: unknown;
  after?: unknown;
  affected?: unknown[];
  target_type?: string | null;
  target_id?: string | null;
  target_version?: number | null;
  dedupe_key?: string | null;
  agent?: string | null;
}

/** Tạo đề xuất (L1). Server kiểm schema theo loại hành động, không nhận văn bản tùy ý để thực thi. */
export async function createProposal(ctx: Ctx, p: NewProposal, qq?: Q) {
  if (!ACTION_PERMISSION[p.action_type]) throw bad("Loại hành động không được hỗ trợ.");
  if (!p.reason?.trim()) throw bad("Đề xuất cần nêu lý do.", { reason: "Bắt buộc" });
  const run = async (qx: Q) => {
    if (p.dedupe_key) {
      const d = await qx<any>("SELECT id, code FROM ai_proposals WHERE tenant_id=$1 AND dedupe_key=$2 AND status='PENDING'", [ctx.tenantId, p.dedupe_key]);
      if (d[0]) throw conflict(`Đã có đề xuất ${d[0].code} đang chờ duyệt cho việc này.`, { proposal_id: d[0].id });
    }
    // Chống tạo trùng đề xuất đang chờ cho cùng đối tượng
    if (p.target_id) {
      const dup = await qx<any>(
        "SELECT id, code FROM ai_proposals WHERE tenant_id=$1 AND target_id=$2 AND action_type=$3 AND status='PENDING'",
        [ctx.tenantId, p.target_id, p.action_type],
      );
      if (dup[0]) throw conflict(`Đã có đề xuất ${dup[0].code} đang chờ duyệt cho đối tượng này.`, { proposal_id: dup[0].id });
    }
    const id = uid();
    const code = await proposalCode(qx, ctx);
    await qx(
      `INSERT INTO ai_proposals (id, tenant_id, branch_id, code, action_type, title, summary, proposed_payload, before_snapshot, after_snapshot,
         affected, source_refs, reason, requested_by, requested_label, owner_employee_id, required_permission, target_type, target_id, target_version,
         status, expires_at, biz_created_at, dedupe_key, agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,'PENDING',$21,$22,$23,$24)`,
      [
        id,
        ctx.tenantId,
        ctx.selectedBranch === "all" ? ctx.allowedBranchIds[0] ?? null : ctx.selectedBranch,
        code,
        p.action_type,
        PROPOSAL_TYPE_LABEL[p.action_type],
        p.summary,
        j(p.payload),
        j(p.before ?? null),
        j(p.after ?? null),
        j(p.affected ?? []),
        j(p.source_refs ?? []),
        p.reason,
        ctx.userId,
        p.requested_label ?? ctx.actorLabel,
        p.owner_employee_id ?? ctx.employeeId,
        ACTION_PERMISSION[p.action_type],
        p.target_type ?? null,
        p.target_id ?? null,
        p.target_version ?? null,
        new Date(ctx.now().getTime() + 48 * 3600000),
        ctx.now(),
        p.dedupe_key ?? null,
        p.agent ?? null,
      ],
    );
    await audit(ctx, "proposal.create", "ai_proposal", id, { code, action_type: p.action_type }, "OK", qx);
    return { id, code };
  };
  return qq ? run(qq) : tx(run);
}

async function targetVersion(qq: Q, type: string | null, id: string | null): Promise<number | null> {
  if (!type || !id) return null;
  const table: Record<string, string> = { shift: "shifts", conversation: "conversations", sop_version: "sop_versions", care_touchpoint: "care_touchpoints" };
  if (!table[type]) return null;
  const r = await qq<any>(`SELECT version, status FROM ${table[type]} WHERE id=$1`, [id]);
  return r[0] ? r[0].version : -1;
}

export async function decideProposal(ctx: Ctx, id: string, decision: "APPROVE" | "REJECT" | "RETURN", reason: string) {
  ctx.require("approvals.decide", "Bạn không có quyền duyệt đề xuất.");
  if ((decision !== "APPROVE" || true) && !reason?.trim() && decision !== "APPROVE")
    throw bad("Vui lòng nhập lý do.", { reason: "Lý do là bắt buộc khi từ chối hoặc trả chỉnh sửa" });
  return tx(async (qq) => {
    const p = (await qq<any>("SELECT * FROM ai_proposals WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [id, ctx.tenantId]))[0];
    if (!p) throw notFound("Không tìm thấy đề xuất.");
    if (p.branch_id && !ctx.allowedBranchIds.includes(p.branch_id)) throw notFound("Không tìm thấy đề xuất trong phạm vi của bạn.");
    if (!ctx.can(p.required_permission)) throw forbidden("Bạn không đủ thẩm quyền cho loại đề xuất này.");
    if (p.status !== "PENDING") {
      // Duyệt lần hai không thực thi lại
      const ex = (await qq<any>("SELECT status, result FROM executions WHERE proposal_id=$1", [id]))[0];
      return { already_decided: true, status: p.status, execution: ex ?? null, message: "Đề xuất đã được xử lý trước đó; không thực thi lại." };
    }
    const now = ctx.now();
    if (new Date(p.expires_at) < now) {
      await qq("UPDATE ai_proposals SET status='EXPIRED', updated_at=now(), version=version+1 WHERE id=$1", [id]);
      await audit(ctx, "proposal.expired", "ai_proposal", id, {}, "OK", qq);
      return { status: "EXPIRED", message: "Đề xuất đã hết hạn, cần tạo lại để xem xét." };
    }
    await qq(
      "INSERT INTO approvals (id, tenant_id, proposal_id, approver_id, approver_label, decision, reason, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [uid(), ctx.tenantId, id, ctx.userId, ctx.actorLabel, decision, reason || null, now],
    );
    if (decision === "REJECT" || decision === "RETURN") {
      const st = decision === "REJECT" ? "REJECTED" : "RETURNED";
      await qq("UPDATE ai_proposals SET status=$2, updated_at=now(), version=version+1 WHERE id=$1", [id, st]);
      if (p.action_type === "SOP_PUBLISH" && p.target_id)
        await qq("UPDATE sop_versions SET status='DRAFT', updated_at=now(), version=version+1 WHERE id=$1 AND status='PENDING_APPROVAL'", [p.target_id]);
      await audit(ctx, `proposal.${decision.toLowerCase()}`, "ai_proposal", id, { reason }, "OK", qq);
      return { status: st };
    }
    // Kiểm tra phiên bản đối tượng ngay lúc duyệt
    if (p.target_version !== null && p.target_version !== undefined) {
      const cur = await targetVersion(qq, p.target_type, p.target_id);
      if (cur !== null && cur !== p.target_version) {
        await qq("UPDATE ai_proposals SET status='RETURNED', updated_at=now(), version=version+1 WHERE id=$1", [id]);
        await audit(ctx, "proposal.stale", "ai_proposal", id, { expected: p.target_version, current: cur }, "OK", qq);
        return { status: "RETURNED", message: "Dữ liệu gốc đã thay đổi sau khi tạo đề xuất. Đề xuất được trả lại để xem xét lại." };
      }
    }
    const key = `proposal:${id}`;
    const ins = await qq<any>(
      "INSERT INTO executions (id, tenant_id, proposal_id, idempotency_key, status) VALUES ($1,$2,$3,$4,'RUNNING') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",
      [uid(), ctx.tenantId, id, key],
    );
    if (!ins.length) return { already_decided: true, status: p.status, message: "Đề xuất đang/đã được thực thi; không thực thi lại." };
    const outcome = await execute(qq, ctx, p);
    await qq("UPDATE executions SET status=$2, result=$3::jsonb, updated_at=now() WHERE idempotency_key=$1", [key, outcome.status, j(outcome.result)]);
    const pStatus = outcome.status === "SUCCEEDED" ? "EXECUTED" : outcome.status === "BLOCKED" ? "APPROVED" : "FAILED";
    await qq("UPDATE ai_proposals SET status=$2, updated_at=now(), version=version+1 WHERE id=$1", [id, pStatus]);
    await audit(ctx, "proposal.approve", "ai_proposal", id, { execution: outcome.status, result: outcome.result }, outcome.status === "FAILED" ? "ERROR" : "OK", qq);
    return { status: pStatus, execution: outcome };
  });
}

/** Thử lại an toàn: chỉ với thực thi bị chặn/lỗi, dùng lại khoá idempotency */
export async function retryProposal(ctx: Ctx, id: string) {
  ctx.require("approvals.decide");
  return tx(async (qq) => {
    const p = (await qq<any>("SELECT * FROM ai_proposals WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [id, ctx.tenantId]))[0];
    if (!p) throw notFound();
    const ex = (await qq<any>("SELECT * FROM executions WHERE proposal_id=$1 FOR UPDATE", [id]))[0];
    if (!ex || !["BLOCKED", "FAILED"].includes(ex.status)) throw conflict("Chỉ thử lại được với thực thi đang bị chặn hoặc lỗi.");
    const outcome = await execute(qq, ctx, p);
    await qq("UPDATE executions SET status=$2, result=$3::jsonb, attempts=attempts+1, updated_at=now() WHERE id=$1", [ex.id, outcome.status, j(outcome.result)]);
    if (outcome.status === "SUCCEEDED") await qq("UPDATE ai_proposals SET status='EXECUTED', updated_at=now(), version=version+1 WHERE id=$1", [id]);
    await audit(ctx, "proposal.retry", "ai_proposal", id, { execution: outcome.status }, "OK", qq);
    return { execution: outcome };
  });
}

export async function cancelProposal(ctx: Ctx, id: string) {
  const p = (await q<any>("SELECT * FROM ai_proposals WHERE id=$1 AND tenant_id=$2", [id, ctx.tenantId]))[0];
  if (!p) throw notFound();
  if (p.requested_by !== ctx.userId && !ctx.can("approvals.decide")) throw forbidden("Chỉ người tạo hoặc người duyệt được hủy đề xuất.");
  if (!["PENDING", "RETURNED"].includes(p.status)) throw conflict("Đề xuất đã được xử lý, không thể hủy.");
  await q("UPDATE ai_proposals SET status='CANCELLED', updated_at=now(), version=version+1 WHERE id=$1", [id]);
  if (p.action_type === "SOP_PUBLISH" && p.target_id)
    await q("UPDATE sop_versions SET status='DRAFT', updated_at=now(), version=version+1 WHERE id=$1 AND status='PENDING_APPROVAL'", [p.target_id]);
  await audit(ctx, "proposal.cancel", "ai_proposal", id);
  return { status: "CANCELLED" };
}

type Outcome = { status: "SUCCEEDED" | "FAILED" | "BLOCKED"; result: Record<string, unknown> };

async function execute(qq: Q, ctx: Ctx, p: any): Promise<Outcome> {
  const pl = p.proposed_payload || {};
  const now = ctx.now();
  switch (p.action_type) {
    case "SHIFT_REASSIGN": {
      const s = (await qq<any>("SELECT * FROM shifts WHERE id=$1 AND tenant_id=$2", [pl.shift_id, ctx.tenantId]))[0];
      if (!s || s.status === "CANCELLED") return { status: "FAILED", result: { message: "Ca gốc không còn tồn tại." } };
      await lockEmployee(qq, pl.to_employee_id);
      const c = await shiftConflicts(qq, ctx.tenantId, pl.to_employee_id, new Date(s.start_at), new Date(s.end_at), s.id);
      if (c.length) return { status: "FAILED", result: { message: "Không thể đổi ca do xung đột.", conflicts: c } };
      const appts = await qq<any>(
        "SELECT * FROM appointments WHERE tenant_id=$1 AND employee_id=$2 AND status IN ('PENDING','CONFIRMED') AND start_at >= $3 AND end_at <= $4",
        [ctx.tenantId, s.employee_id, s.start_at, s.end_at],
      );
      const moved: string[] = [];
      for (const a of appts) {
        const ac = await appointmentConflicts(qq, ctx.tenantId, pl.to_employee_id, new Date(a.start_at), new Date(a.end_at), a.id);
        const blocking = ac.filter((x) => x.type !== "OUTSIDE_SHIFT");
        if (blocking.length) return { status: "FAILED", result: { message: `Lịch ${a.code} bị trùng với nhân sự mới.`, conflicts: blocking } };
      }
      await qq("UPDATE shifts SET employee_id=$2, approved_by=$3, updated_at=now(), version=version+1 WHERE id=$1", [s.id, pl.to_employee_id, ctx.userId]);
      for (const a of appts) {
        await qq("UPDATE appointments SET employee_id=$2, updated_at=now(), version=version+1 WHERE id=$1", [a.id, pl.to_employee_id]);
        moved.push(a.code);
      }
      return { status: "SUCCEEDED", result: { message: `Đã chuyển ca ${fmtRange(s.start_at, s.end_at)} ${fmtDate(s.start_at)}.`, moved_appointments: moved } };
    }
    case "SHIFT_CREATE": {
      if (pl.batch) return { status: "SUCCEEDED", result: { message: "Đã ghi nhận" } };
      await lockEmployee(qq, pl.employee_id);
      const start = new Date(pl.start_at);
      const end = new Date(pl.end_at);
      const c = await shiftConflicts(qq, ctx.tenantId, pl.employee_id, start, end, null);
      if (c.length) return { status: "FAILED", result: { message: "Không thể tạo ca do xung đột.", conflicts: c } };
      const emp = (await qq<any>("SELECT branch_id FROM employees WHERE id=$1", [pl.employee_id]))[0];
      const sid = uid();
      await qq(
        "INSERT INTO shifts (id, tenant_id, branch_id, employee_id, start_at, end_at, status, approved_by, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,'APPROVED',$7,$8,$9)",
        [sid, ctx.tenantId, emp.branch_id, pl.employee_id, start, end, ctx.userId, `Tạo từ đề xuất ${p.code}`, now],
      );
      return { status: "SUCCEEDED", result: { message: `Đã tạo ca ${fmtRange(start, end)} ${fmtDate(start)}.`, shift_id: sid } };
    }
    case "SHIFT_ADJUST": {
      const s = (await qq<any>("SELECT * FROM shifts WHERE id=$1 AND tenant_id=$2", [pl.shift_id, ctx.tenantId]))[0];
      if (!s) return { status: "FAILED", result: { message: "Ca không còn tồn tại." } };
      await lockEmployee(qq, s.employee_id);
      const start = new Date(pl.start_at);
      const end = new Date(pl.end_at);
      const c = await shiftConflicts(qq, ctx.tenantId, s.employee_id, start, end, s.id);
      if (c.length) return { status: "FAILED", result: { message: "Ca mới vẫn bị trùng.", conflicts: c } };
      await qq("UPDATE shifts SET start_at=$2, end_at=$3, status='APPROVED', approved_by=$4, updated_at=now(), version=version+1 WHERE id=$1", [s.id, start, end, ctx.userId]);
      return { status: "SUCCEEDED", result: { message: `Đã điều chỉnh ca thành ${fmtRange(start, end)} ${fmtDate(start)}.` } };
    }
    case "TASK_ASSIGN": {
      const owner = (await qq<any>("SELECT * FROM employees WHERE id=$1 AND tenant_id=$2", [pl.owner_id, ctx.tenantId]))[0];
      if (!owner || !owner.active) return { status: "FAILED", result: { message: "Người phụ trách không còn hoạt động." } };
      const code = await nextCode(qq, ctx.tenantId, "tasks", "CV");
      const tid = uid();
      await qq(
        `INSERT INTO tasks (id, tenant_id, branch_id, code, title, description, owner_id, created_by, due_at, priority, status, biz_created_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TODO',$11,$11)`,
        [tid, ctx.tenantId, owner.branch_id, code, pl.title, `Tạo từ đề xuất ${p.code}`, owner.id, ctx.userId, new Date(pl.due_at), pl.priority ?? "MEDIUM", now],
      );
      let i = 0;
      for (const item of (pl.checklist as string[]) ?? [])
        await qq("INSERT INTO checklist_items (id, tenant_id, task_id, title, required, position) VALUES ($1,$2,$3,$4,true,$5)", [uid(), ctx.tenantId, tid, item, i++]);
      await qq(
        "INSERT INTO task_events (id, tenant_id, task_id, actor_id, actor_label, type, payload, occurred_at) VALUES ($1,$2,$3,$4,$5,'CREATED',$6::jsonb,$7)",
        [uid(), ctx.tenantId, tid, ctx.userId, ctx.actorLabel, j({ proposal: p.code }), now],
      );
      return { status: "SUCCEEDED", result: { message: `Đã tạo công việc ${code} cho ${owner.display_name}.`, task_code: code, task_id: tid } };
    }
    case "CUSTOMER_MESSAGE":
    case "CARE_MESSAGE": {
      let conversationId: string | null = pl.conversation_id ?? null;
      let customerId: string | null = null;
      let body: string = pl.body ?? "";
      if (p.action_type === "CARE_MESSAGE") {
        const t = (await qq<any>("SELECT * FROM care_touchpoints WHERE id=$1 AND tenant_id=$2", [pl.touchpoint_id, ctx.tenantId]))[0];
        if (!t) return { status: "FAILED", result: { message: "Điểm chạm không còn tồn tại." } };
        customerId = t.customer_id;
        const cv = (await qq<any>("SELECT id FROM conversations WHERE customer_id=$1 ORDER BY last_message_at DESC NULLS LAST LIMIT 1", [customerId]))[0];
        conversationId = cv?.id ?? null;
      } else {
        const cv = (await qq<any>("SELECT * FROM conversations WHERE id=$1 AND tenant_id=$2", [conversationId, ctx.tenantId]))[0];
        if (!cv) return { status: "FAILED", result: { message: "Hội thoại không còn tồn tại." } };
        customerId = cv.customer_id;
      }
      if (!body.trim()) return { status: "FAILED", result: { message: "Nội dung rỗng, không gửi." } };
      if (!(await hasCareConsent(qq, ctx.tenantId, customerId!)))
        return { status: "BLOCKED", result: { message: "Dừng: khách chưa đồng ý hoặc đã rút đồng ý liên hệ. Không gửi." } };
      if (inQuietHours(ctx.settings, now))
        return { status: "BLOCKED", result: { message: "Đang trong giờ yên tĩnh. Chưa gửi; có thể thử lại sau giờ yên tĩnh." } };
      const adapter = await getMessagingAdapter(ctx.tenantId);
      let delivery = "not_sent";
      let outcome: Outcome;
      try {
        const r = await adapter.sendMessage({ to: customerId!, body }, `proposal:${p.id}`);
        delivery = r.status;
        outcome = { status: "SUCCEEDED", result: { message: "Đã gửi qua kênh đã kết nối.", delivery } };
      } catch (e) {
        outcome = {
          status: "BLOCKED",
          result: {
            message: e instanceof AdapterNotConnected ? "Chưa gửi: Zalo chưa kết nối (chế độ mô phỏng). Cần liên hệ thủ công." : "Chưa gửi: kênh trả lỗi.",
            delivery: "not_sent",
          },
        };
      }
      if (conversationId) {
        await qq(
          `INSERT INTO messages (id, tenant_id, conversation_id, direction, body, delivery_status, source_ref, author_id, author_label, idempotency_key, sent_at)
           VALUES ($1,$2,$3,'OUT',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [uid(), ctx.tenantId, conversationId, body, delivery, p.code, ctx.userId, ctx.actorLabel, `proposal:${p.id}`, now],
        );
        await qq("UPDATE conversations SET draft=NULL, updated_at=now(), version=version+1 WHERE id=$1", [conversationId]);
      }
      return outcome;
    }
    case "SOP_PUBLISH": {
      const v = (await qq<any>("SELECT * FROM sop_versions WHERE id=$1 AND tenant_id=$2", [pl.version_id, ctx.tenantId]))[0];
      if (!v) return { status: "FAILED", result: { message: "Phiên bản SOP không tồn tại." } };
      await qq("UPDATE sop_versions SET status='ARCHIVED', updated_at=now(), version=version+1 WHERE document_id=$1 AND status='PUBLISHED'", [v.document_id]);
      await qq("UPDATE sop_versions SET status='PUBLISHED', approved_by=$2, effective_at=$3, updated_at=now(), version=version+1 WHERE id=$1", [v.id, ctx.userId, now]);
      return { status: "SUCCEEDED", result: { message: `Đã xuất bản phiên bản ${v.version_label}.` } };
    }
  }
  return { status: "FAILED", result: { message: "Loại hành động chưa hỗ trợ." } };
}
