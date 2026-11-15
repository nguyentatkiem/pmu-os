import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid, j, type Q } from "../db";
import { bad, conflict, forbidden, notFound, parseIso, requireFields, str } from "../http";
import type { Ctx } from "../auth";
import { getEmployee, nextCode, visibleCustomerIds } from "../domain";
import { suggestAssignee } from "../ai";
import { fmtDateTime } from "../../shared/format";

async function loadTask(ctx: Ctx, id: string, qq: Q = q, lock = false) {
  const t = (
    await qq<any>(`SELECT * FROM tasks WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3)${lock ? " FOR UPDATE" : ""}`, [
      id,
      ctx.tenantId,
      ctx.allowedBranchIds,
    ])
  )[0];
  if (!t) throw notFound("Không tìm thấy công việc trong phạm vi của bạn.");
  if (!ctx.can("tasks.view_all") && t.owner_id !== ctx.employeeId) throw notFound("Không tìm thấy công việc trong phạm vi của bạn.");
  return t;
}

async function event(qq: Q, ctx: Ctx, taskId: string, type: string, payload: Record<string, unknown> = {}, dedupe?: string) {
  await qq(
    `INSERT INTO task_events (id, tenant_id, task_id, actor_id, actor_label, type, payload, dedupe_key, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT (dedupe_key) DO NOTHING`,
    [uid(), ctx.tenantId, taskId, ctx.userId, ctx.actorLabel, type, j(payload), dedupe ?? null, ctx.now()],
  );
}

const isOwner = (ctx: Ctx, t: any) => t.owner_id === ctx.employeeId;

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/tasks",
    handler: async ({ ctx, query }) => {
      const viewAll = ctx.can("tasks.view_all");
      if (!viewAll && !ctx.employeeId) throw forbidden("Tài khoản không gắn hồ sơ nhân sự nên không có công việc.");
      const now = ctx.now();
      const owner = viewAll ? query.get("owner") || null : ctx.employeeId;
      const customer = query.get("customer") || null;
      const rows = await q<any>(
        `SELECT t.*, e.display_name AS owner_name, c.display_name AS customer_name, d.title AS sop_title,
            (SELECT count(*)::int FROM checklist_items ci WHERE ci.task_id=t.id) AS items,
            (SELECT count(*)::int FROM checklist_items ci WHERE ci.task_id=t.id AND ci.done_at IS NOT NULL) AS items_done
           FROM tasks t JOIN employees e ON e.id=t.owner_id LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN sop_documents d ON d.id=t.sop_document_id
          WHERE t.tenant_id=$1 AND t.branch_id = ANY($2) AND t.status <> 'CANCELLED'
            AND ($3::uuid IS NULL OR t.owner_id=$3::uuid) AND ($4::uuid IS NULL OR t.customer_id=$4::uuid)
          ORDER BY t.due_at`,
        [ctx.tenantId, ctx.branchFilter, owner, customer],
      );
      const items = rows.map((t) => ({ ...t, overdue: ["TODO", "IN_PROGRESS", "SUBMITTED"].includes(t.status) && new Date(t.due_at) < now }));
      const owners = viewAll
        ? await q<any>("SELECT id, display_name FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active ORDER BY code", [ctx.tenantId, ctx.branchFilter])
        : [];
      const custIds = await visibleCustomerIds(ctx);
      const customers = custIds.length ? await q<any>("SELECT id, display_name FROM customers WHERE id = ANY($1) ORDER BY display_name", [custIds]) : [];
      return { items, owners, customers, now: now.toISOString(), can_create: ctx.can("tasks.create"), can_review: ctx.can("tasks.review"), my_employee_id: ctx.employeeId };
    },
  },
  {
    method: "GET",
    path: "/tasks/suggest-assignee",
    handler: async ({ ctx, query }) => {
      ctx.require("tasks.create");
      return {
        suggestions: await suggestAssignee(ctx, { due_at: query.get("due_at") ?? undefined, position: query.get("position") ?? undefined, keyword: query.get("keyword") ?? undefined }),
        note: "Đề xuất dựa trên vị trí, kỹ năng, ca làm và số việc đang mở. Quản lý xác nhận người nhận.",
      };
    },
  },
  {
    method: "GET",
    path: "/tasks/:id",
    handler: async ({ ctx, params }) => {
      const t = await loadTask(ctx, params.id);
      const owner = await one<any>("SELECT id, display_name, position FROM employees WHERE id=$1", [t.owner_id]);
      const items = await q<any>("SELECT * FROM checklist_items WHERE task_id=$1 ORDER BY position", [t.id]);
      const events = await q<any>("SELECT * FROM task_events WHERE task_id=$1 ORDER BY occurred_at", [t.id]);
      const customer = t.customer_id ? await one<any>("SELECT id, display_name FROM customers WHERE id=$1", [t.customer_id]) : null;
      const sop = t.sop_document_id ? await one<any>("SELECT id, title FROM sop_documents WHERE id=$1", [t.sop_document_id]) : null;
      const now = ctx.now();
      return {
        task: { ...t, overdue: ["TODO", "IN_PROGRESS", "SUBMITTED"].includes(t.status) && new Date(t.due_at) < now },
        owner,
        items,
        events,
        customer,
        sop,
        is_owner: isOwner(ctx, t),
        can_review: ctx.can("tasks.review"),
      };
    },
  },
  {
    method: "POST",
    path: "/tasks",
    handler: async ({ ctx, body }) => {
      ctx.require("tasks.create", "Bạn không có quyền tạo việc.");
      requireFields(body, { title: "Tên công việc", owner_id: "Người phụ trách", due_at: "Hạn hoàn thành" });
      const owner = await getEmployee(ctx, body.owner_id);
      if (!owner.active) throw bad("Người phụ trách đã ngừng hoạt động.", { owner_id: "Chọn nhân sự đang hoạt động" });
      const due = parseIso(body.due_at, "Hạn hoàn thành", "due_at");
      if (due.getTime() < ctx.now().getTime()) throw bad("Hạn hoàn thành phải sau thời điểm hiện tại.", { due_at: "Hạn đã qua" });
      const priority = ["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : "MEDIUM";
      if (body.customer_id) {
        const ids = await visibleCustomerIds(ctx);
        if (!ids.includes(body.customer_id)) throw bad("Khách hàng không nằm trong phạm vi.", { customer_id: "Không hợp lệ" });
      }
      const checklist: string[] = (Array.isArray(body.checklist) ? body.checklist : []).map((s: unknown) => str(s, 120)).filter(Boolean);
      return tx(async (qq) => {
        const code = await nextCode(qq, ctx.tenantId, "tasks", "CV");
        const id = uid();
        await qq(
          `INSERT INTO tasks (id, tenant_id, branch_id, code, title, description, owner_id, created_by, customer_id, due_at, priority, status, biz_created_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TODO',$12,$12)`,
          [id, ctx.tenantId, owner.branch_id, code, str(body.title, 160), str(body.description, 1000) || null, owner.id, ctx.userId, body.customer_id || null, due, priority, ctx.now()],
        );
        let i = 0;
        for (const it of checklist) await qq("INSERT INTO checklist_items (id, tenant_id, task_id, title, required, position) VALUES ($1,$2,$3,$4,true,$5)", [uid(), ctx.tenantId, id, it, i++]);
        await event(qq, ctx, id, "CREATED", { owner: owner.display_name });
        await audit(ctx, "task.create", "task", id, { code }, "OK", qq);
        return { id, code };
      });
    },
  },
  {
    method: "POST",
    path: "/tasks/:id/accept",
    handler: async ({ ctx, params }) =>
      tx(async (qq) => {
        const t = await loadTask(ctx, params.id, qq, true);
        if (!isOwner(ctx, t)) throw forbidden("Chỉ người được giao mới nhận việc.");
        if (t.status !== "TODO") throw conflict("Công việc không ở trạng thái Cần làm.");
        await qq("UPDATE tasks SET status='IN_PROGRESS', accepted_at=$2, updated_at=now(), version=version+1 WHERE id=$1", [t.id, ctx.now()]);
        await event(qq, ctx, t.id, "ACCEPTED");
        return { ok: true };
      }),
  },
  {
    method: "POST",
    path: "/tasks/:id/checklist/:itemId",
    handler: async ({ ctx, params, body }) =>
      tx(async (qq) => {
        const t = await loadTask(ctx, params.id, qq, true);
        if (!isOwner(ctx, t)) throw forbidden("Chỉ người được giao mới cập nhật checklist.");
        if (!["IN_PROGRESS", "TODO"].includes(t.status)) throw conflict("Công việc đã nộp hoặc đã hoàn thành, không thể sửa checklist.");
        const it = (await qq<any>("SELECT * FROM checklist_items WHERE id=$1 AND task_id=$2", [params.itemId, t.id]))[0];
        if (!it) throw notFound("Không tìm thấy mục checklist.");
        const done = !!body.done;
        await qq("UPDATE checklist_items SET done_at=$2, done_by=$3, evidence_ref=COALESCE($4, evidence_ref), updated_at=now(), version=version+1 WHERE id=$1", [
          it.id,
          done ? ctx.now() : null,
          done ? ctx.userId : null,
          str(body.evidence_ref, 300) || null,
        ]);
        if (t.status === "TODO") await qq("UPDATE tasks SET status='IN_PROGRESS', accepted_at=$2, updated_at=now(), version=version+1 WHERE id=$1", [t.id, ctx.now()]);
        await event(qq, ctx, t.id, done ? "CHECK" : "UNCHECK", { item: it.title });
        return { ok: true };
      }),
  },
  {
    method: "POST",
    path: "/tasks/:id/comment",
    handler: async ({ ctx, params, body }) => {
      const t = await loadTask(ctx, params.id);
      const text = str(body.body, 1000);
      if (!text) throw bad("Nội dung bình luận trống.", { body: "Bắt buộc" });
      await event(q, ctx, t.id, "COMMENT", { body: text });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/tasks/:id/evidence",
    handler: async ({ ctx, params, body }) => {
      const t = await loadTask(ctx, params.id);
      if (!isOwner(ctx, t)) throw forbidden("Chỉ người được giao mới thêm bằng chứng.");
      const text = str(body.text, 500);
      if (!text) throw bad("Vui lòng mô tả bằng chứng.", { text: "Bắt buộc" });
      await event(q, ctx, t.id, "EVIDENCE", { text });
      return { ok: true, note: "Bằng chứng dạng ghi chú/đường dẫn. Lưu tệp riêng tư chưa được cấu hình kho lưu trữ." };
    },
  },
  {
    method: "POST",
    path: "/tasks/:id/submit",
    handler: async ({ ctx, params, body }) =>
      tx(async (qq) => {
        const t = await loadTask(ctx, params.id, qq, true);
        if (!isOwner(ctx, t)) throw forbidden("Chỉ người được giao mới nộp kết quả.");
        if (t.status !== "IN_PROGRESS") throw conflict("Chỉ nộp được công việc đang thực hiện.");
        const missing = await qq<any>("SELECT title FROM checklist_items WHERE task_id=$1 AND required AND done_at IS NULL", [t.id]);
        if (missing.length) throw conflict(`Còn ${missing.length} mục bắt buộc chưa hoàn tất: ${missing.map((m) => m.title).join(", ")}.`, { missing: missing.map((m) => m.title) });
        await qq("UPDATE tasks SET status='SUBMITTED', submitted_at=$2, updated_at=now(), version=version+1 WHERE id=$1", [t.id, ctx.now()]);
        await event(qq, ctx, t.id, "SUBMITTED", { note: str(body.note, 500) || null });
        await audit(ctx, "task.submit", "task", t.id, {}, "OK", qq);
        return { ok: true, status: "SUBMITTED" };
      }),
  },
  {
    method: "POST",
    path: "/tasks/:id/review",
    handler: async ({ ctx, params, body }) => {
      ctx.require("tasks.review", "Bạn không có quyền duyệt kết quả.");
      return tx(async (qq) => {
        const t = await loadTask(ctx, params.id, qq, true);
        if (t.status !== "SUBMITTED") throw conflict("Công việc chưa được nộp, không thể duyệt.");
        if (isOwner(ctx, t)) throw forbidden("Không tự duyệt công việc của chính mình.");
        if (body.decision === "APPROVE") {
          await qq("UPDATE tasks SET status='DONE', completed_at=$2, approved_by=$3, updated_at=now(), version=version+1 WHERE id=$1", [t.id, ctx.now(), ctx.userId]);
          await event(qq, ctx, t.id, "APPROVED", { note: str(body.reason, 500) || null });
        } else if (body.decision === "REWORK") {
          const reason = str(body.reason, 500);
          if (!reason) throw bad("Vui lòng nêu lý do yêu cầu làm lại.", { reason: "Bắt buộc" });
          await qq("UPDATE tasks SET status='IN_PROGRESS', submitted_at=NULL, rework_count=rework_count+1, updated_at=now(), version=version+1 WHERE id=$1", [t.id]);
          await event(qq, ctx, t.id, "REWORK", { reason });
        } else throw bad("Quyết định không hợp lệ.");
        await audit(ctx, `task.review.${String(body.decision).toLowerCase()}`, "task", t.id, {}, "OK", qq);
        return { ok: true };
      });
    },
  },
  {
    method: "POST",
    path: "/tasks/:id/remind",
    handler: async ({ ctx, params }) => {
      ctx.require("tasks.review", "Bạn không có quyền nhắc việc.");
      const t = await loadTask(ctx, params.id);
      if (!["TODO", "IN_PROGRESS"].includes(t.status)) throw conflict("Chỉ nhắc được công việc đang mở.");
      const now = ctx.now();
      const bucket = `${now.toISOString().slice(0, 13)}`;
      const r = await q<any>(
        `INSERT INTO task_events (id, tenant_id, task_id, actor_id, actor_label, type, payload, dedupe_key, occurred_at)
         VALUES ($1,$2,$3,$4,$5,'REMINDER',$6::jsonb,$7,$8) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [uid(), ctx.tenantId, t.id, ctx.userId, ctx.actorLabel, j({ message: `Nhắc nhở: “${t.title}” (hạn ${fmtDateTime(t.due_at)})` }), `remind:${t.id}:${bucket}`, now],
      );
      return r.length
        ? { ok: true, message: "Đã ghi nhắc nhở nội bộ vào công việc (người được giao thấy trong ứng dụng)." }
        : { ok: true, duplicate: true, message: "Đã nhắc trong giờ này, không gửi lặp." };
    },
  },
  {
    method: "POST",
    path: "/tasks/:id/cancel",
    handler: async ({ ctx, params, body }) => {
      ctx.require("tasks.create", "Bạn không có quyền hủy việc.");
      const t = await loadTask(ctx, params.id);
      if (["DONE", "CANCELLED"].includes(t.status)) throw conflict("Công việc đã đóng.");
      const reason = str(body.reason, 300);
      if (!reason) throw bad("Vui lòng nhập lý do hủy.", { reason: "Bắt buộc" });
      await q("UPDATE tasks SET status='CANCELLED', updated_at=now(), version=version+1 WHERE id=$1", [t.id]);
      await event(q, ctx, t.id, "CANCELLED", { reason });
      await audit(ctx, "task.cancel", "task", t.id, { reason });
      return { ok: true };
    },
  },
];
