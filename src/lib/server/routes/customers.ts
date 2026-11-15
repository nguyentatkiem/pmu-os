import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid } from "../db";
import { bad, checkVersion, conflict, forbidden, notFound, requireFields, str } from "../http";
import type { Ctx } from "../auth";
import { assertCustomerVisible, canSeeSensitive, nextCode, visibleCustomerIds } from "../domain";
import { classifyCustomer } from "../ai";
import { maskPhone, normalizePhone } from "../../shared/format";
import { CONSENT_PURPOSE_LABEL, CONSENT_STATUS_LABEL, READINESS_LABEL, STAGES } from "../../shared/labels";

async function event(ctx: Ctx, customerId: string, type: string, title: string, body: string, status_label: string | null = null) {
  await q(
    "INSERT INTO customer_events (id, tenant_id, customer_id, type, title, body, employee_id, status_label, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [uid(), ctx.tenantId, customerId, type, title, body, ctx.employeeId, status_label, ctx.now()],
  );
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/customers",
    handler: async ({ ctx, query }) => {
      if (!ctx.can("customers.view_all") && !ctx.can("customers.view_assigned") && ctx.role !== "TECHNICIAN")
        throw forbidden("Bạn không có quyền xem khách hàng.");
      const ids = await visibleCustomerIds(ctx);
      const term = (query.get("q") ?? "").trim().toLowerCase();
      const digits = term.replace(/\D/g, "");
      const stage = Number(query.get("stage")) || null;
      const readiness = query.get("readiness") || null;
      const rows = await q<any>(
        `SELECT c.id, c.code, c.display_name, c.avatar, c.contact_phone, c.lifecycle_stage, c.readiness, c.readiness_confirmed, c.readiness_by, c.next_followup_at,
                c.assigned_to, e.display_name AS assigned_name, c.version
           FROM customers c LEFT JOIN employees e ON e.id=c.assigned_to
          WHERE c.id = ANY($1)
            AND ($2 = '' OR lower(c.display_name) LIKE '%' || $2 || '%' OR lower(c.code) LIKE '%' || $2 || '%' OR ($3 <> '' AND c.contact_norm LIKE '%' || $3 || '%'))
            AND ($4::int IS NULL OR c.lifecycle_stage=$4) AND ($5::text IS NULL OR c.readiness=$5)
          ORDER BY c.display_name`,
        [ids, term, digits, stage, readiness],
      );
      const stageCounts = await q<any>("SELECT lifecycle_stage AS s, count(*)::int AS n FROM customers WHERE id = ANY($1) GROUP BY lifecycle_stage", [ids]);
      const aiPending = await q<any>("SELECT id, display_name FROM customers WHERE id = ANY($1) AND readiness_by='AI' AND NOT readiness_confirmed ORDER BY updated_at DESC LIMIT 1", [ids]);
      const staff = ctx.can("customers.edit")
        ? await q<any>("SELECT id, display_name, position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active AND position IN ('CONSULTANT','CUSTOMER_CARE','MANAGER') ORDER BY code", [ctx.tenantId, ctx.branchFilter])
        : [];
      return {
        items: rows.map((r) => ({ ...r, contact_phone: maskPhone(r.contact_phone) })),
        stage_counts: Object.fromEntries(stageCounts.map((s) => [s.s, s.n])),
        ai_focus: aiPending[0] ?? rows.find((r) => r.readiness === "HOT") ?? rows[0] ?? null,
        staff,
        can_create: ctx.can("customers.create"),
        can_edit: ctx.can("customers.edit"),
        minimal: !canSeeSensitive(ctx),
      };
    },
  },
  {
    method: "GET",
    path: "/customers/:id",
    handler: async ({ ctx, params }) => {
      await assertCustomerVisible(ctx, params.id);
      const c = await one<any>(
        "SELECT c.*, e.display_name AS assigned_name, b.name AS branch_name FROM customers c LEFT JOIN employees e ON e.id=c.assigned_to JOIN branches b ON b.id=c.branch_id WHERE c.id=$1",
        [params.id],
      );
      const sensitive = canSeeSensitive(ctx);
      const appts = await q<any>(
        `SELECT a.id, a.code, a.start_at, a.end_at, a.status, a.note, s.name AS service, e.display_name AS employee FROM appointments a
           JOIN services s ON s.id=a.service_id JOIN employees e ON e.id=a.employee_id WHERE a.customer_id=$1 ORDER BY a.start_at DESC`,
        [c.id],
      );
      const consents = await q<any>("SELECT * FROM consents WHERE customer_id=$1 ORDER BY recorded_at DESC, created_at DESC", [c.id]);
      const latest: Record<string, any> = {};
      for (const k of consents) if (!latest[k.purpose]) latest[k.purpose] = k;
      const base = {
        customer: {
          ...c,
          contact_phone: maskPhone(c.contact_phone),
          contact_norm: undefined,
          readiness_label: READINESS_LABEL[c.readiness] ?? null,
          stage_label: STAGES[c.lifecycle_stage - 1],
        },
        appointments: appts,
        consent: ["CARE", "MARKETING"].map((p) => ({
          purpose: p,
          label: CONSENT_PURPOSE_LABEL[p],
          status: latest[p]?.status ?? null,
          status_label: latest[p] ? CONSENT_STATUS_LABEL[latest[p].status] : "Chưa ghi nhận",
          recorded_at: latest[p]?.recorded_at ?? null,
          source: latest[p]?.source ?? null,
        })),
        sensitive,
        can_edit: ctx.can("customers.edit"),
        can_reveal: ctx.can("contact.reveal"),
        can_book: ctx.can("appointments.manage"),
        can_task: ctx.can("tasks.create") || ctx.can("care.manage"),
      };
      if (!sensitive) return { ...base, minimal_note: "Bạn chỉ xem được thông tin tối thiểu phục vụ lịch hẹn." };
      const events = await q<any>(
        "SELECT ev.*, e.display_name AS employee FROM customer_events ev LEFT JOIN employees e ON e.id=ev.employee_id WHERE ev.customer_id=$1 ORDER BY ev.occurred_at DESC",
        [c.id],
      );
      const notes = await q<any>("SELECT * FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC", [c.id]);
      const tasks = await q<any>("SELECT id, code, title, status, due_at FROM tasks WHERE customer_id=$1 AND status<>'CANCELLED' ORDER BY (status='DONE'), due_at", [c.id]);
      const care = await q<any>("SELECT t.*, e.display_name AS owner FROM care_touchpoints t LEFT JOIN employees e ON e.id=t.owner_id WHERE t.customer_id=$1 ORDER BY t.due_at", [c.id]);
      const feedback = await q<any>("SELECT * FROM feedback WHERE customer_id=$1 ORDER BY biz_created_at DESC", [c.id]);
      const conv = await one<any>("SELECT id, status FROM conversations WHERE customer_id=$1 ORDER BY last_message_at DESC NULLS LAST LIMIT 1", [c.id]);
      const messages = conv ? await q<any>("SELECT id, direction, body, delivery_status, author_label, sent_at FROM messages WHERE conversation_id=$1 ORDER BY sent_at", [conv.id]) : [];
      const auditRows = await q<any>(
        "SELECT action, actor_label, detail, created_at FROM audit_events WHERE tenant_id=$1 AND resource_id=$2 ORDER BY created_at DESC LIMIT 30",
        [ctx.tenantId, c.id],
      );
      return { ...base, events, notes, tasks, care, feedback, conversation: conv, messages, audit: auditRows, consents };
    },
  },
  {
    method: "POST",
    path: "/customers",
    handler: async ({ ctx, body }) => {
      ctx.require("customers.create", "Bạn không có quyền tạo khách hàng.");
      requireFields(body, { display_name: "Tên khách hàng", branch_id: "Chi nhánh" });
      if (!ctx.allowedBranchIds.includes(body.branch_id)) throw forbidden("Bạn không có quyền ở chi nhánh này.");
      const phone = body.contact_phone ? normalizePhone(body.contact_phone) : null;
      if (body.contact_phone && !phone) throw bad("Số liên hệ không hợp lệ.", { contact_phone: "Nhập 9–11 chữ số" });
      if (phone) {
        const dup = await one<any>("SELECT id, display_name FROM customers WHERE tenant_id=$1 AND contact_norm=$2", [ctx.tenantId, phone]);
        if (dup) throw conflict(`Số liên hệ đã thuộc hồ sơ ${dup.display_name}.`, { duplicate_id: dup.id, field: "contact_phone" });
      }
      const assigned = body.assigned_to || (ctx.employeeId && ["CONSULTANT", "CUSTOMER_CARE"].includes(ctx.role) ? ctx.employeeId : null);
      return tx(async (qq) => {
        const code = await nextCode(qq, ctx.tenantId, "customers", "KH-");
        const id = uid();
        await qq(
          `INSERT INTO customers (id, tenant_id, branch_id, code, display_name, contact_phone, contact_norm, source, assigned_to, lifecycle_stage, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`,
          [id, ctx.tenantId, body.branch_id, code, str(body.display_name, 120), phone, phone, str(body.source, 60) || null, assigned, ctx.now()],
        );
        await qq(
          "INSERT INTO customer_events (id, tenant_id, customer_id, type, title, body, employee_id, occurred_at) VALUES ($1,$2,$3,'CREATED','Tạo hồ sơ',$4,$5,$6)",
          [uid(), ctx.tenantId, id, `Hồ sơ được tạo bởi ${ctx.actorLabel}.`, ctx.employeeId, ctx.now()],
        );
        await audit(ctx, "customer.create", "customer", id, { code }, "OK", qq);
        return { id };
      });
    },
  },
  {
    method: "PATCH",
    path: "/customers/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("customers.edit", "Bạn không có quyền sửa hồ sơ khách.");
      await assertCustomerVisible(ctx, params.id);
      const c = await one<any>("SELECT * FROM customers WHERE id=$1", [params.id]);
      checkVersion(c.version, body.expected_version);
      const name = body.display_name !== undefined ? str(body.display_name, 120) : c.display_name;
      if (!name) throw bad("Tên khách hàng là bắt buộc.", { display_name: "Bắt buộc" });
      const stage = body.lifecycle_stage !== undefined ? Number(body.lifecycle_stage) : c.lifecycle_stage;
      if (!(stage >= 1 && stage <= 8)) throw bad("Giai đoạn không hợp lệ.", { lifecycle_stage: "1–8" });
      await q("UPDATE customers SET display_name=$2, lifecycle_stage=$3, source=$4, segment=$5, next_followup_at=$6, updated_at=now(), version=version+1 WHERE id=$1", [
        c.id,
        name,
        stage,
        body.source !== undefined ? str(body.source, 60) : c.source,
        body.segment !== undefined ? str(body.segment, 80) : c.segment,
        body.next_followup_at !== undefined ? (body.next_followup_at ? new Date(body.next_followup_at) : null) : c.next_followup_at,
      ]);
      if (stage !== c.lifecycle_stage) await event(ctx, c.id, "STAGE", "Chuyển giai đoạn", `${STAGES[c.lifecycle_stage - 1]} → ${STAGES[stage - 1]}`);
      await audit(ctx, "customer.update", "customer", c.id, { stage_from: c.lifecycle_stage, stage_to: stage });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/customers/:id/assign",
    handler: async ({ ctx, params, body }) => {
      ctx.require("customers.edit", "Bạn không có quyền phân công.");
      await assertCustomerVisible(ctx, params.id);
      const e = await one<any>("SELECT id, display_name FROM employees WHERE id=$1 AND tenant_id=$2 AND active AND branch_id = ANY($3)", [body.employee_id, ctx.tenantId, ctx.allowedBranchIds]);
      if (!e) throw bad("Chọn nhân sự đang hoạt động.", { employee_id: "Bắt buộc" });
      await q("UPDATE customers SET assigned_to=$2, updated_at=now(), version=version+1 WHERE id=$1", [params.id, e.id]);
      await event(ctx, params.id, "ASSIGN", "Phân công phụ trách", `Phụ trách mới: ${e.display_name}`);
      await audit(ctx, "customer.assign", "customer", params.id, { to: e.display_name });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/customers/:id/reveal-contact",
    handler: async ({ ctx, params }) => {
      ctx.require("contact.reveal", "Bạn không có quyền xem số liên hệ đầy đủ.");
      await assertCustomerVisible(ctx, params.id);
      const c = await one<any>("SELECT contact_phone FROM customers WHERE id=$1", [params.id]);
      await audit(ctx, "customer.reveal_contact", "customer", params.id);
      return { contact_phone: c?.contact_phone ?? null, note: "Lượt xem số đã được ghi nhật ký." };
    },
  },
  {
    method: "POST",
    path: "/customers/:id/notes",
    handler: async ({ ctx, params, body }) => {
      if (!canSeeSensitive(ctx)) throw forbidden("Bạn không có quyền ghi chú hồ sơ khách.");
      await assertCustomerVisible(ctx, params.id);
      const text = str(body.body, 2000);
      if (!text) throw bad("Nội dung ghi chú trống.", { body: "Bắt buộc" });
      await q("INSERT INTO customer_notes (id, tenant_id, customer_id, author_id, author_label, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        uid(),
        ctx.tenantId,
        params.id,
        ctx.userId,
        ctx.actorLabel,
        text,
        ctx.now(),
      ]);
      await event(ctx, params.id, "NOTE", "Ghi chú", text);
      await audit(ctx, "customer.note", "customer", params.id);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "/customers/:id/ai-readiness",
    handler: async ({ ctx, params }) => {
      await assertCustomerVisible(ctx, params.id);
      return classifyCustomer(ctx, params.id);
    },
  },
  {
    method: "POST",
    path: "/customers/:id/readiness",
    handler: async ({ ctx, params, body }) => {
      ctx.require("customers.edit", "Bạn không có quyền phân loại khách.");
      await assertCustomerVisible(ctx, params.id);
      if (!["HOT", "WARM", "COLD"].includes(body.readiness)) throw bad("Mức sẵn sàng không hợp lệ.", { readiness: "Chọn Nóng/Ấm/Lạnh" });
      const reason = str(body.reason, 500);
      if (!reason) throw bad("Vui lòng nêu lý do phân loại.", { reason: "Bắt buộc" });
      const c = await one<any>("SELECT readiness FROM customers WHERE id=$1", [params.id]);
      await q(
        "UPDATE customers SET readiness=$2, readiness_reason=$3, readiness_by=$4, readiness_at=$5, readiness_confirmed=true, updated_at=now(), version=version+1 WHERE id=$1",
        [params.id, body.readiness, reason, ctx.userId, ctx.now()],
      );
      await event(ctx, params.id, "READINESS", "Cập nhật mức sẵn sàng", `${READINESS_LABEL[c?.readiness] ?? "—"} → ${READINESS_LABEL[body.readiness]}: ${reason}`);
      await audit(ctx, "customer.readiness", "customer", params.id, { from: c?.readiness, to: body.readiness });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/customers/:id/consents",
    handler: async ({ ctx, params, body }) => {
      ctx.require("customers.edit", "Bạn không có quyền cập nhật đồng ý liên hệ.");
      await assertCustomerVisible(ctx, params.id);
      if (!["CARE", "MARKETING"].includes(body.purpose)) throw bad("Mục đích không hợp lệ.");
      if (!["GRANTED", "DENIED", "REVOKED"].includes(body.status)) throw bad("Trạng thái không hợp lệ.");
      const source = str(body.source, 200);
      if (!source) throw bad("Vui lòng ghi nguồn ghi nhận (ví dụ: khách xác nhận qua điện thoại).", { source: "Bắt buộc" });
      const now = ctx.now();
      await q(
        "INSERT INTO consents (id, tenant_id, customer_id, channel, purpose, status, source, recorded_by, recorded_at, revoked_at, created_at) VALUES ($1,$2,$3,'ZALO',$4,$5,$6,$7,$8,$9,$8)",
        [uid(), ctx.tenantId, params.id, body.purpose, body.status, source, ctx.userId, now, body.status === "REVOKED" ? now : null],
      );
      let paused = 0;
      if (body.status !== "GRANTED" && body.purpose === "CARE") {
        // Dừng các lượt gửi chưa chạy
        const r = await q<any>(
          `UPDATE jobs SET status='BLOCKED', result='Dừng: khách đã rút/không đồng ý liên hệ chăm sóc', updated_at=now(), version=version+1
            WHERE tenant_id=$1 AND status IN ('SCHEDULED','WAITING') AND (
              ref_id IN (SELECT id FROM appointments WHERE customer_id=$2) OR ref_id IN (SELECT id FROM care_touchpoints WHERE customer_id=$2)) RETURNING id`,
          [ctx.tenantId, params.id],
        );
        paused = r.length;
      }
      await event(ctx, params.id, "CONSENT", "Đồng ý liên hệ", `${CONSENT_PURPOSE_LABEL[body.purpose]}: ${CONSENT_STATUS_LABEL[body.status]} (${source})`);
      await audit(ctx, "customer.consent", "customer", params.id, { purpose: body.purpose, status: body.status, jobs_stopped: paused });
      return { ok: true, jobs_stopped: paused };
    },
  },
];

export const _nf = notFound;
