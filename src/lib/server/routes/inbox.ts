import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid } from "../db";
import { bad, conflict, forbidden, notFound, str } from "../http";
import type { Ctx } from "../auth";
import { assertSendable, integrationRow, visibleCustomerIds } from "../domain";
import { inboxSuggest } from "../ai";
import { createProposal } from "../proposals";
import { maskPhone } from "../../shared/format";
import { READINESS_LABEL } from "../../shared/labels";

async function loadConv(ctx: Ctx, id: string) {
  ctx.require("inbox.view", "Bạn không có quyền xem hội thoại.");
  const c = await one<any>("SELECT * FROM conversations WHERE id=$1 AND tenant_id=$2", [id, ctx.tenantId]);
  if (!c) throw notFound("Không tìm thấy hội thoại.");
  const ids = await visibleCustomerIds(ctx);
  if (!ids.includes(c.customer_id)) throw notFound("Không tìm thấy hội thoại trong phạm vi của bạn.");
  return c;
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/conversations",
    handler: async ({ ctx, query }) => {
      ctx.require("inbox.view", "Bạn không có quyền xem hội thoại.");
      const ids = await visibleCustomerIds(ctx);
      const tab = query.get("tab") ?? "all";
      const term = (query.get("q") ?? "").trim().toLowerCase();
      const rows = await q<any>(
        `SELECT cv.*, c.display_name AS customer, c.avatar, c.code AS customer_code, e.display_name AS assigned_name,
            (SELECT body FROM messages m WHERE m.conversation_id=cv.id ORDER BY sent_at DESC LIMIT 1) AS last_body,
            (SELECT direction FROM messages m WHERE m.conversation_id=cv.id ORDER BY sent_at DESC LIMIT 1) AS last_direction
           FROM conversations cv JOIN customers c ON c.id=cv.customer_id LEFT JOIN employees e ON e.id=cv.assigned_to
          WHERE cv.tenant_id=$1 AND cv.customer_id = ANY($2) AND cv.branch_id = ANY($3)
          ORDER BY cv.last_message_at DESC NULLS LAST`,
        [ctx.tenantId, ids, ctx.branchFilter],
      );
      const filtered = rows.filter(
        (r) =>
          (tab === "all" || tab === "zalo" ? true : tab === "new" ? r.status === "NEW" : tab === "open" ? r.status === "OPEN" : tab === "done" ? r.status === "DONE" : tab === "follow" ? r.follow_up : true) &&
          (!term || r.customer.toLowerCase().includes(term) || (r.last_body ?? "").toLowerCase().includes(term)),
      );
      const integ = await integrationRow(ctx.tenantId);
      return {
        items: filtered,
        counts: {
          zalo: rows.filter((r) => r.channel === "ZALO").length,
          all: rows.length,
          new: rows.filter((r) => r.status === "NEW").length,
          open: rows.filter((r) => r.status === "OPEN").length,
          done: rows.filter((r) => r.status === "DONE").length,
          follow: rows.filter((r) => r.follow_up).length,
        },
        integration: { health: integ.health, mode: integ.mode, last_error: integ.last_error },
        demo: ctx.mode === "DEMO",
      };
    },
  },
  {
    method: "GET",
    path: "/conversations/:id",
    handler: async ({ ctx, params }) => {
      const c = await loadConv(ctx, params.id);
      const customer = await one<any>(
        "SELECT c.id, c.display_name, c.code, c.avatar, c.contact_phone, c.readiness, c.lifecycle_stage, c.segment, e.display_name AS assigned_name FROM customers c LEFT JOIN employees e ON e.id=c.assigned_to WHERE c.id=$1",
        [c.customer_id],
      );
      const messages = await q<any>("SELECT * FROM messages WHERE conversation_id=$1 ORDER BY sent_at", [c.id]);
      const suggestion = await inboxSuggest(ctx, c.id);
      const staff = await q<any>(
        "SELECT id, display_name, position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active AND position IN ('CONSULTANT','CUSTOMER_CARE','MANAGER') ORDER BY code",
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const pending = await q<any>("SELECT id, code, status, proposed_payload FROM ai_proposals WHERE target_id=$1 AND action_type='CUSTOMER_MESSAGE' AND status IN ('PENDING','RETURNED') ORDER BY biz_created_at DESC", [c.id]);
      const integ = await integrationRow(ctx.tenantId);
      if (c.status === "NEW" && ctx.can("inbox.reply") && c.assigned_to === ctx.employeeId) {
        // Người phụ trách mở hội thoại => chuyển Đang xử lý
        await q("UPDATE conversations SET status='OPEN', updated_at=now() WHERE id=$1", [c.id]);
        c.status = "OPEN";
      }
      return {
        conversation: c,
        customer: { ...customer, contact_phone: maskPhone(customer.contact_phone), readiness_label: READINESS_LABEL[customer.readiness] ?? null },
        messages,
        suggestion,
        staff,
        pending_proposals: pending,
        integration: { health: integ.health, mode: integ.mode },
        can_reply: ctx.can("inbox.reply"),
      };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/assign",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply", "Bạn không có quyền phân công hội thoại.");
      const c = await loadConv(ctx, params.id);
      const e = await one<any>("SELECT id, display_name FROM employees WHERE id=$1 AND tenant_id=$2 AND active", [body.employee_id, ctx.tenantId]);
      if (!e) throw bad("Chọn nhân sự đang hoạt động.", { employee_id: "Bắt buộc" });
      await q("UPDATE conversations SET assigned_to=$2, updated_at=now(), version=version+1 WHERE id=$1", [c.id, e.id]);
      await audit(ctx, "conversation.assign", "conversation", c.id, { to: e.display_name });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/specialist",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply", "Bạn không có quyền chuyển chuyên viên.");
      const c = await loadConv(ctx, params.id);
      const e = await one<any>("SELECT id, display_name FROM employees WHERE id=$1 AND tenant_id=$2 AND active", [body.employee_id, ctx.tenantId]);
      if (!e) throw bad("Chọn chuyên viên.", { employee_id: "Bắt buộc" });
      await q("UPDATE conversations SET specialist_id=$2, follow_up=true, status='OPEN', updated_at=now(), version=version+1 WHERE id=$1", [c.id, e.id]);
      await audit(ctx, "conversation.specialist", "conversation", c.id, { to: e.display_name });
      return { ok: true, message: `Đã chuyển cho ${e.display_name} và đánh dấu cần theo dõi.` };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/follow-up",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply");
      const c = await loadConv(ctx, params.id);
      await q("UPDATE conversations SET follow_up=$2, updated_at=now(), version=version+1 WHERE id=$1", [c.id, !!body.value]);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/status",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply");
      const c = await loadConv(ctx, params.id);
      if (!["NEW", "OPEN", "DONE"].includes(body.status)) throw bad("Trạng thái không hợp lệ.");
      await q("UPDATE conversations SET status=$2, updated_at=now(), version=version+1 WHERE id=$1", [c.id, body.status]);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/draft",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply", "Bạn không có quyền soạn trả lời.");
      const c = await loadConv(ctx, params.id);
      const text = str(body.body, 2000);
      await q("UPDATE conversations SET draft=$2, updated_at=now() WHERE id=$1", [c.id, text || null]);
      return { ok: true, message: text ? "Đã lưu bản nháp (chưa gửi cho khách)." : "Đã xóa bản nháp." };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/send",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply");
      await loadConv(ctx, params.id);
      if (!str(body.body, 2000)) throw bad("Nội dung rỗng không thể gửi.", { body: "Bắt buộc" });
      const integ = await integrationRow(ctx.tenantId);
      if (integ.health !== "CONNECTED") assertSendable();
      throw forbidden("Gửi trực tiếp chưa được bật theo chính sách AI (mặc định L1: cần duyệt).");
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/propose",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply", "Bạn không có quyền gửi phê duyệt.");
      const c = await loadConv(ctx, params.id);
      const text = str(body.body, 2000);
      if (!text) throw bad("Nội dung rỗng không thể gửi phê duyệt.", { body: "Bắt buộc" });
      const cust = await one<any>("SELECT display_name FROM customers WHERE id=$1", [c.customer_id]);
      const r = await createProposal(ctx, {
        action_type: "CUSTOMER_MESSAGE",
        summary: `Trả lời ${cust.display_name} qua Zalo`,
        payload: { conversation_id: c.id, body: text },
        reason: str(body.reason, 300) || "Nhân sự soạn trả lời, cần duyệt trước khi gửi khách.",
        source_refs: Array.isArray(body.sources) && body.sources.length ? body.sources : [{ type: "conversation", id: c.id, label: "Hội thoại & Zalo", href: `/inbox?open=${c.id}` }],
        before: { status: "Chưa trả lời" },
        after: { body: text },
        affected: [{ type: "customer", id: c.customer_id, label: cust.display_name }],
        target_type: "conversation",
        target_id: c.id,
        target_version: c.version,
      });
      await q("UPDATE conversations SET draft=$2 WHERE id=$1", [c.id, text]);
      return { ok: true, proposal: r, message: `Đã gửi đề xuất ${r.code} tới người duyệt. Tin nhắn chưa được gửi cho khách.` };
    },
  },
  {
    method: "POST",
    path: "/conversations/:id/record-reply",
    handler: async ({ ctx, params, body }) => {
      ctx.require("inbox.reply");
      const c = await loadConv(ctx, params.id);
      const text = str(body.body, 2000);
      if (!text) throw bad("Nhập nội dung đã trả lời.", { body: "Bắt buộc" });
      await q(
        "INSERT INTO messages (id, tenant_id, conversation_id, direction, body, delivery_status, author_id, author_label, sent_at) VALUES ($1,$2,$3,'OUT',$4,'recorded',$5,$6,$7)",
        [uid(), ctx.tenantId, c.id, text, ctx.userId, ctx.actorLabel, ctx.now()],
      );
      await q("UPDATE conversations SET status='OPEN', draft=NULL, last_message_at=$2, updated_at=now(), version=version+1 WHERE id=$1", [c.id, ctx.now()]);
      await audit(ctx, "conversation.record_reply", "conversation", c.id);
      return { ok: true, message: "Đã ghi nhận câu trả lời gửi ngoài hệ thống (không gửi qua Zalo)." };
    },
  },
  {
    method: "POST",
    path: "/integrations/zalo/simulate-inbound",
    handler: async ({ ctx, body }) => {
      if (ctx.mode !== "DEMO") throw forbidden("Chỉ mô phỏng được trong chế độ demo.");
      ctx.require("inbox.view");
      const conv = await one<any>("SELECT * FROM conversations WHERE id=$1 AND tenant_id=$2", [body.conversation_id, ctx.tenantId]);
      if (!conv) throw notFound();
      const text = str(body.body, 1000);
      const ev = str(body.external_event_id, 120);
      if (!text || !ev) throw bad("Cần nội dung và mã sự kiện.", { body: "Bắt buộc" });
      const r = await q<any>(
        `INSERT INTO messages (id, tenant_id, conversation_id, direction, body, delivery_status, author_label, external_event_id, sent_at)
         VALUES ($1,$2,$3,'IN',$4,'received',$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
        [uid(), ctx.tenantId, conv.id, text, "Khách (mô phỏng)", ev, ctx.now()],
      );
      if (r.length) await q("UPDATE conversations SET last_message_at=$2, status=CASE WHEN status='DONE' THEN 'OPEN' ELSE status END, updated_at=now() WHERE id=$1", [conv.id, ctx.now()]);
      return { ok: true, duplicate: !r.length, message: r.length ? "Đã nhận 1 tin mô phỏng." : "Sự kiện đã nhận trước đó — bỏ qua để chống trùng." };
    },
  },
];

export const _c = conflict;
