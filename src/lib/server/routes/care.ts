import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid } from "../db";
import { bad, conflict, forbidden, notFound, parseIso, str } from "../http";
import type { Ctx } from "../auth";
import { hasCareConsent, visibleCustomerIds } from "../domain";
import { createProposal } from "../proposals";
import { fmtDate } from "../../shared/format";

function render(body: string, customer: string) {
  return body.replace(/\{ten_khach\}/g, customer);
}

async function loadTp(ctx: Ctx, id: string) {
  ctx.require("care.view", "Bạn không có quyền xem chăm sóc.");
  const t = await one<any>(
    `SELECT t.*, c.display_name AS customer, c.code AS customer_code, c.avatar, p.status AS plan_status, p.id AS plan_id, e.display_name AS owner,
            tp.name AS template_name, tp.body AS template_body, tp.version_label AS tpl_version
       FROM care_touchpoints t JOIN customers c ON c.id=t.customer_id JOIN care_plans p ON p.id=t.plan_id
       LEFT JOIN employees e ON e.id=t.owner_id LEFT JOIN care_templates tp ON tp.id=t.template_id
      WHERE t.id=$1 AND t.tenant_id=$2`,
    [id, ctx.tenantId],
  );
  if (!t) throw notFound("Không tìm thấy điểm chạm.");
  const ids = await visibleCustomerIds(ctx);
  if (!ids.includes(t.customer_id)) throw notFound("Không tìm thấy điểm chạm trong phạm vi của bạn.");
  return t;
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/care",
    handler: async ({ ctx, query }) => {
      ctx.require("care.view", "Bạn không có quyền xem chăm sóc.");
      const ids = await visibleCustomerIds(ctx);
      const now = ctx.now();
      const status = query.get("status") || null;
      const rows = await q<any>(
        `SELECT t.*, c.display_name AS customer, c.code AS customer_code, c.avatar, e.display_name AS owner, p.status AS plan_status, tp.version_label AS tpl_version
           FROM care_touchpoints t JOIN customers c ON c.id=t.customer_id JOIN care_plans p ON p.id=t.plan_id
           LEFT JOIN employees e ON e.id=t.owner_id LEFT JOIN care_templates tp ON tp.id=t.template_id
          WHERE t.tenant_id=$1 AND t.customer_id = ANY($2) AND ($3::text IS NULL OR t.status=$3)
          ORDER BY (t.status IN ('TO_CONTACT','WAITING_REPLY')) DESC, t.due_at`,
        [ctx.tenantId, ids, status],
      );
      const all = await q<any>("SELECT t.status, t.customer_id, t.due_at FROM care_touchpoints t WHERE t.tenant_id=$1 AND t.customer_id = ANY($2)", [ctx.tenantId, ids]);
      const plans = await q<any>("SELECT count(DISTINCT customer_id)::int AS n FROM care_plans WHERE tenant_id=$1 AND customer_id = ANY($2) AND status<>'DONE'", [ctx.tenantId, ids]);
      const feedback = ctx.can("customers.view_sensitive")
        ? await q<any>(
            `SELECT f.*, c.display_name AS customer, e.display_name AS assigned_name FROM feedback f JOIN customers c ON c.id=f.customer_id
               LEFT JOIN employees e ON e.id=f.assigned_to WHERE f.tenant_id=$1 AND f.customer_id = ANY($2) AND f.status<>'RESOLVED' AND f.needs_specialist ORDER BY f.biz_created_at`,
            [ctx.tenantId, ids],
          )
        : [];
      const staff = await q<any>("SELECT id, display_name, position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active ORDER BY code", [ctx.tenantId, ctx.branchFilter]);
      const templates = await q<any>("SELECT id, name, version_label, body FROM care_templates WHERE tenant_id=$1 AND status='APPROVED'", [ctx.tenantId]);
      const customers = ids.length ? await q<any>("SELECT id, display_name FROM customers WHERE id = ANY($1) ORDER BY display_name", [ids]) : [];
      return {
        items: rows.map((r) => ({ ...r, overdue: ["TO_CONTACT", "WAITING_REPLY"].includes(r.status) && new Date(r.due_at) < now })),
        stats: {
          customers: plans[0].n,
          to_contact: all.filter((t) => t.status === "TO_CONTACT").length,
          waiting: all.filter((t) => t.status === "WAITING_REPLY").length,
          done: all.filter((t) => t.status === "DONE").length,
        },
        feedback,
        staff,
        templates,
        customers,
        can_manage: ctx.can("care.manage"),
      };
    },
  },
  {
    method: "GET",
    path: "/care/touchpoints/:id",
    handler: async ({ ctx, params }) => {
      const t = await loadTp(ctx, params.id);
      const consent = await hasCareConsent(q, ctx.tenantId, t.customer_id);
      const pending = await one<any>("SELECT id, code, status FROM ai_proposals WHERE target_id=$1 AND action_type='CARE_MESSAGE' AND status IN ('PENDING','RETURNED','APPROVED') ORDER BY biz_created_at DESC LIMIT 1", [t.id]);
      const jobs = await q<any>("SELECT status, result, run_at FROM jobs WHERE ref_id=$1", [t.id]);
      return {
        touchpoint: t,
        preview: t.template_body ? render(t.template_body, t.customer) : null,
        source: t.template_name ? `${t.template_name} ${t.tpl_version}` : null,
        consent,
        pending_proposal: pending,
        jobs,
        can_manage: ctx.can("care.manage"),
      };
    },
  },
  {
    method: "POST",
    path: "/care/plans",
    handler: async ({ ctx, body }) => {
      ctx.require("care.manage", "Bạn không có quyền tạo kế hoạch chăm sóc.");
      const ids = await visibleCustomerIds(ctx);
      if (!ids.includes(body.customer_id)) throw bad("Chọn khách hàng trong phạm vi.", { customer_id: "Bắt buộc" });
      const tpl = await one<any>("SELECT * FROM care_templates WHERE id=$1 AND tenant_id=$2 AND status='APPROVED'", [body.template_id, ctx.tenantId]);
      if (!tpl) throw bad("Chỉ dùng mẫu chăm sóc đã duyệt.", { template_id: "Chọn mẫu đã duyệt" });
      const steps: { title: string; due_at: string }[] = Array.isArray(body.touchpoints) ? body.touchpoints : [];
      if (!steps.length) throw bad("Thêm ít nhất một điểm chạm.", { touchpoints: "Bắt buộc" });
      const owner = body.owner_id || ctx.employeeId;
      return tx(async (qq) => {
        const pid = uid();
        await qq("INSERT INTO care_plans (id, tenant_id, customer_id, template_id, owner_id, status, created_at) VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6)", [pid, ctx.tenantId, body.customer_id, tpl.id, owner, ctx.now()]);
        for (const s of steps) {
          const title = str(s.title, 120);
          if (!title) throw bad("Tên điểm chạm là bắt buộc.");
          const due = parseIso(s.due_at, "Hạn điểm chạm", "due_at");
          const tid = uid();
          await qq(
            "INSERT INTO care_touchpoints (id, tenant_id, plan_id, customer_id, title, due_at, owner_id, status, template_id, template_version, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'PLANNED',$8,$9,$10)",
            [tid, ctx.tenantId, pid, body.customer_id, title, due, owner, tpl.id, tpl.version_label, ctx.now()],
          );
          await qq("INSERT INTO jobs (id, tenant_id, type, ref_type, ref_id, run_at, status, dedupe_key) VALUES ($1,$2,'CARE_TOUCHPOINT','care_touchpoint',$3,$4,'SCHEDULED',$5)", [uid(), ctx.tenantId, tid, due, `care:${tid}`]);
        }
        await audit(ctx, "care.plan_create", "care_plan", pid, { steps: steps.length }, "OK", qq);
        return { id: pid };
      });
    },
  },
  {
    method: "POST",
    path: "/care/touchpoints/:id/propose",
    handler: async ({ ctx, params }) => {
      ctx.require("care.manage", "Bạn không có quyền gửi phê duyệt chăm sóc.");
      const t = await loadTp(ctx, params.id);
      if (!t.template_body) throw bad("Điểm chạm chưa gắn mẫu đã duyệt.");
      if (t.status === "DONE") throw conflict("Điểm chạm đã hoàn tất.");
      const body = render(t.template_body, t.customer);
      const r = await createProposal(ctx, {
        action_type: "CARE_MESSAGE",
        summary: `${t.title} — ${t.customer} (${t.template_name} ${t.tpl_version})`,
        payload: { touchpoint_id: t.id, body },
        reason: `Điểm chạm theo kế hoạch đã duyệt, hạn ${fmtDate(t.due_at)}.`,
        source_refs: [{ type: "care_template", id: t.template_id, label: `Nguồn: ${t.template_name} ${t.tpl_version}`, href: "/care" }],
        before: { status: "Cần liên hệ" },
        after: { body },
        affected: [{ type: "customer", id: t.customer_id, label: t.customer }],
        target_type: "care_touchpoint",
        target_id: t.id,
        target_version: t.version,
      });
      return { ok: true, proposal: r, message: `Đã gửi ${r.code} tới người duyệt. Nội dung chưa được gửi cho khách.` };
    },
  },
  {
    method: "POST",
    path: "/care/touchpoints/:id/record-contact",
    handler: async ({ ctx, params, body }) => {
      ctx.require("care.manage", "Bạn không có quyền ghi nhận liên hệ.");
      const t = await loadTp(ctx, params.id);
      const note = str(body.note, 500);
      if (!note) throw bad("Ghi lại nội dung đã liên hệ (kênh, kết quả).", { note: "Bắt buộc" });
      const next = body.done ? "DONE" : "WAITING_REPLY";
      await q("UPDATE care_touchpoints SET status=$2, note=$3, contacted_at=$4, updated_at=now(), version=version+1 WHERE id=$1", [t.id, next, note, ctx.now()]);
      await q("UPDATE jobs SET status='DONE', result='Đã ghi nhận liên hệ thủ công', updated_at=now() WHERE ref_id=$1 AND status IN ('SCHEDULED','WAITING','BLOCKED')", [t.id]);
      await q(
        "INSERT INTO customer_events (id, tenant_id, customer_id, type, title, body, employee_id, status_label, occurred_at) VALUES ($1,$2,$3,'CARE','Chăm sóc',$4,$5,$6,$7)",
        [uid(), ctx.tenantId, t.customer_id, `${t.title}: ${note}`, ctx.employeeId, next === "DONE" ? "Đã hoàn thành" : "Chờ phản hồi", ctx.now()],
      );
      await audit(ctx, "care.record_contact", "care_touchpoint", t.id, { status: next });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/care/touchpoints/:id/complete",
    handler: async ({ ctx, params }) => {
      ctx.require("care.manage");
      const t = await loadTp(ctx, params.id);
      await q("UPDATE care_touchpoints SET status='DONE', contacted_at=COALESCE(contacted_at,$2), updated_at=now(), version=version+1 WHERE id=$1", [t.id, ctx.now()]);
      await audit(ctx, "care.complete", "care_touchpoint", t.id);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/care/plans/:id/pause",
    handler: async ({ ctx, params, body }) => {
      ctx.require("care.manage", "Bạn không có quyền tạm dừng kế hoạch.");
      const p = await one<any>("SELECT * FROM care_plans WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!p) throw notFound();
      const ids = await visibleCustomerIds(ctx);
      if (!ids.includes(p.customer_id)) throw notFound();
      const pause = body.resume ? false : true;
      await q("UPDATE care_plans SET status=$2, updated_at=now(), version=version+1 WHERE id=$1", [p.id, pause ? "PAUSED" : "ACTIVE"]);
      await audit(ctx, pause ? "care.pause" : "care.resume", "care_plan", p.id, { reason: str(body.reason, 300) });
      return { ok: true, message: pause ? "Đã tạm dừng kế hoạch: các điểm chạm chưa chạy sẽ chờ." : "Đã tiếp tục kế hoạch." };
    },
  },
  {
    method: "POST",
    path: "/care/feedback/:id/assign",
    handler: async ({ ctx, params, body }) => {
      if (!ctx.can("care.manage") && !ctx.can("customers.edit")) throw forbidden("Bạn không có quyền chuyển người phụ trách.");
      const f = await one<any>("SELECT * FROM feedback WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!f) throw notFound();
      const ids = await visibleCustomerIds(ctx);
      if (!ids.includes(f.customer_id)) throw notFound();
      const e = await one<any>("SELECT id, display_name FROM employees WHERE id=$1 AND tenant_id=$2 AND active", [body.employee_id, ctx.tenantId]);
      if (!e) throw bad("Chọn người phụ trách.", { employee_id: "Bắt buộc" });
      await q("UPDATE feedback SET assigned_to=$2, status='IN_PROGRESS', updated_at=now(), version=version+1 WHERE id=$1", [f.id, e.id]);
      await audit(ctx, "feedback.assign", "feedback", f.id, { to: e.display_name });
      return { ok: true, message: `Đã chuyển phản hồi cho ${e.display_name}. AI không tư vấn chuyên môn thay chuyên viên.` };
    },
  },
  {
    method: "POST",
    path: "/care/feedback/:id/resolve",
    handler: async ({ ctx, params, body }) => {
      if (!ctx.can("care.manage") && !ctx.can("customers.edit")) throw forbidden();
      const f = await one<any>("SELECT * FROM feedback WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!f) throw notFound();
      const note = str(body.note, 500);
      if (!note) throw bad("Ghi kết quả xử lý.", { note: "Bắt buộc" });
      await q("UPDATE feedback SET status='RESOLVED', updated_at=now(), version=version+1 WHERE id=$1", [f.id]);
      await q("INSERT INTO customer_events (id, tenant_id, customer_id, type, title, body, employee_id, status_label, occurred_at) VALUES ($1,$2,$3,'FEEDBACK','Xử lý phản hồi',$4,$5,'Đã xử lý',$6)", [uid(), ctx.tenantId, f.customer_id, note, ctx.employeeId, ctx.now()]);
      await audit(ctx, "feedback.resolve", "feedback", f.id);
      return { ok: true };
    },
  },
];
