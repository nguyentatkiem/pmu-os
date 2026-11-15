import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid, type Q } from "../db";
import { bad, checkVersion, conflict, forbidden, notFound, parseIso, requireFields, str } from "../http";
import type { Ctx } from "../auth";
import {
  appointmentConflicts,
  cancelJobsFor,
  lockEmployee,
  nextCode,
  scheduleApptReminders,
  suggestSlot,
  visibleCustomerIds,
} from "../domain";
import { addDays, fmtDate, fmtRange, fmtTime, vnDayKey, vnToDate, weekStart } from "../../shared/format";
import { APPT_STATUS_LABEL } from "../../shared/labels";

async function loadAppt(ctx: Ctx, id: string, qq: Q = q, lock = false) {
  const a = (
    await qq<any>(`SELECT * FROM appointments WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3)${lock ? " FOR UPDATE" : ""}`, [id, ctx.tenantId, ctx.allowedBranchIds])
  )[0];
  if (!a) throw notFound("Không tìm thấy lịch hẹn.");
  if (!ctx.can("appointments.view_all") && a.employee_id !== ctx.employeeId) throw notFound("Không tìm thấy lịch hẹn trong phạm vi của bạn.");
  return a;
}

async function custEvent(qq: Q, ctx: Ctx, customerId: string, title: string, body: string, status: string, refId: string) {
  await qq(
    "INSERT INTO customer_events (id, tenant_id, customer_id, type, title, body, employee_id, status_label, ref_type, ref_id, occurred_at) VALUES ($1,$2,$3,'BOOKING',$4,$5,$6,$7,'appointment',$8,$9)",
    [uid(), ctx.tenantId, customerId, title, body, ctx.employeeId, status, refId, ctx.now()],
  );
}

const transitions: Record<string, { from: string[]; to: string; label: string }> = {
  confirm: { from: ["PENDING"], to: "CONFIRMED", label: "Xác nhận lịch" },
  "check-in": { from: ["PENDING", "CONFIRMED"], to: "ARRIVED", label: "Khách đã đến" },
  complete: { from: ["ARRIVED"], to: "COMPLETED", label: "Hoàn thành" },
  "no-show": { from: ["PENDING", "CONFIRMED"], to: "NO_SHOW", label: "Không đến" },
};

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/appointments",
    handler: async ({ ctx, query }) => {
      const viewAll = ctx.can("appointments.view_all");
      if (!viewAll && !ctx.employeeId) throw forbidden("Bạn không có quyền xem lịch hẹn.");
      const now = ctx.now();
      const view = query.get("view") === "week" ? "week" : "day";
      const day = query.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(query.get("date")!) ? query.get("date")! : addDays(vnDayKey(now), 1);
      const from = view === "week" ? weekStart(day) : day;
      const to = addDays(from, view === "week" ? 7 : 1);
      const rows = await q<any>(
        `SELECT a.*, c.display_name AS customer, c.avatar, s.name AS service, s.duration_min, e.display_name AS employee
           FROM appointments a JOIN customers c ON c.id=a.customer_id JOIN services s ON s.id=a.service_id JOIN employees e ON e.id=a.employee_id
          WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND a.start_at >= $3 AND a.start_at < $4 AND ($5::uuid IS NULL OR a.employee_id=$5::uuid)
          ORDER BY a.start_at`,
        [ctx.tenantId, ctx.branchFilter, vnToDate(from), vnToDate(to), viewAll ? null : ctx.employeeId],
      );
      const shifts = await q<any>(
        `SELECT s.employee_id, s.start_at, s.end_at, e.display_name, e.position FROM shifts s JOIN employees e ON e.id=s.employee_id
          WHERE s.tenant_id=$1 AND s.branch_id = ANY($2) AND s.status='APPROVED' AND s.start_at >= $3 AND s.start_at < $4 AND e.active
            AND ($5::uuid IS NULL OR s.employee_id=$5::uuid)`,
        [ctx.tenantId, ctx.branchFilter, vnToDate(from), vnToDate(to), viewAll ? null : ctx.employeeId],
      );
      const colIds = [...new Set([...rows.map((r) => r.employee_id), ...shifts.filter((s) => s.position === "TECHNICIAN").map((s) => s.employee_id)])];
      const columns = (await q<any>("SELECT id, display_name, position, code FROM employees WHERE id = ANY($1) ORDER BY code", [colIds])).map((e) => ({
        ...e,
        shifts: shifts.filter((s) => s.employee_id === e.id).map((s) => ({ start_at: s.start_at, end_at: s.end_at })),
      }));
      const active = rows.filter((r) => r.status !== "CANCELLED");
      const services = await q<any>("SELECT id, name, duration_min FROM services WHERE tenant_id=$1 AND active ORDER BY name", [ctx.tenantId]);
      const custIds = await visibleCustomerIds(ctx);
      const customers = custIds.length ? await q<any>("SELECT id, display_name FROM customers WHERE id = ANY($1) ORDER BY display_name", [custIds]) : [];
      const staff = await q<any>("SELECT id, display_name, position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active AND position IN ('TECHNICIAN','CONSULTANT') ORDER BY code", [ctx.tenantId, ctx.branchFilter]);
      return {
        view,
        date: day,
        from,
        days: Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => addDays(from, i)),
        items: rows,
        columns,
        stats: {
          total: active.length,
          confirmed: active.filter((r) => ["CONFIRMED", "ARRIVED", "COMPLETED"].includes(r.status)).length,
          pending: active.filter((r) => r.status === "PENDING").length,
          cancelled: rows.filter((r) => ["CANCELLED", "NO_SHOW"].includes(r.status)).length,
        },
        services,
        customers,
        staff,
        can_manage: ctx.can("appointments.manage"),
        now: now.toISOString(),
      };
    },
  },
  {
    method: "GET",
    path: "/appointments/:id",
    handler: async ({ ctx, params }) => {
      const a = await loadAppt(ctx, params.id);
      const detail = await one<any>(
        "SELECT c.display_name AS customer, c.id AS customer_id, s.name AS service, e.display_name AS employee FROM appointments a JOIN customers c ON c.id=a.customer_id JOIN services s ON s.id=a.service_id JOIN employees e ON e.id=a.employee_id WHERE a.id=$1",
        [a.id],
      );
      const jobs = await q<any>("SELECT id, run_at, status, result, attempts FROM jobs WHERE ref_id=$1 ORDER BY run_at", [a.id]);
      return { appointment: { ...a, ...detail, status_label: APPT_STATUS_LABEL[a.status] }, reminders: jobs, can_manage: ctx.can("appointments.manage") };
    },
  },
  {
    method: "POST",
    path: "/appointments/check",
    handler: async ({ ctx, body }) => {
      ctx.require("appointments.manage");
      requireFields(body, { employee_id: "Nhân sự", service_id: "Dịch vụ", start_at: "Thời gian bắt đầu" });
      const sv = await one<any>("SELECT * FROM services WHERE id=$1 AND tenant_id=$2", [body.service_id, ctx.tenantId]);
      if (!sv) throw bad("Dịch vụ không hợp lệ.", { service_id: "Chọn dịch vụ" });
      const start = parseIso(body.start_at, "Thời gian bắt đầu", "start_at");
      const dur = Number(body.duration_min) || sv.duration_min;
      const end = new Date(start.getTime() + dur * 60000);
      const conflicts = await appointmentConflicts(q, ctx.tenantId, body.employee_id, start, end, body.exclude_id ?? null);
      const suggestion = conflicts.length ? await suggestSlot(q, ctx.tenantId, body.employee_id, start, dur, body.exclude_id ?? null) : null;
      return { conflicts, suggestion, end_at: end.toISOString() };
    },
  },
  {
    method: "POST",
    path: "/appointments",
    handler: async ({ ctx, body }) => {
      ctx.require("appointments.manage", "Bạn không có quyền tạo lịch hẹn.");
      requireFields(body, { customer_id: "Khách hàng", service_id: "Dịch vụ", employee_id: "Nhân sự", start_at: "Thời gian bắt đầu" });
      const ids = await visibleCustomerIds(ctx);
      if (!ids.includes(body.customer_id)) throw bad("Khách hàng không nằm trong phạm vi.", { customer_id: "Không hợp lệ" });
      const sv = await one<any>("SELECT * FROM services WHERE id=$1 AND tenant_id=$2 AND active", [body.service_id, ctx.tenantId]);
      if (!sv) throw bad("Dịch vụ không hợp lệ.", { service_id: "Chọn dịch vụ" });
      const emp = await one<any>("SELECT * FROM employees WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3)", [body.employee_id, ctx.tenantId, ctx.allowedBranchIds]);
      if (!emp) throw bad("Nhân sự không hợp lệ.", { employee_id: "Chọn nhân sự" });
      const start = parseIso(body.start_at, "Thời gian bắt đầu", "start_at");
      if (start.getTime() < ctx.now().getTime()) throw bad("Không thể đặt lịch trong quá khứ.", { start_at: "Chọn thời gian sau hiện tại" });
      const dur = Number(body.duration_min) || sv.duration_min;
      if (dur < 15 || dur > 480) throw bad("Thời lượng không hợp lệ.", { duration_min: "15–480 phút" });
      const end = new Date(start.getTime() + dur * 60000);
      const result = await tx(async (qq) => {
        await lockEmployee(qq, emp.id); // tuần tự hóa đặt lịch cùng nhân sự
        const c = await appointmentConflicts(qq, ctx.tenantId, emp.id, start, end, null);
        if (c.length) {
          const suggestion = await suggestSlot(qq, ctx.tenantId, emp.id, start, dur, null);
          throw conflict(c[0].message, { conflicts: c, suggestion });
        }
        const id = uid();
        const code = await nextCode(qq, ctx.tenantId, "appointments", "LH");
        await qq(
          `INSERT INTO appointments (id, tenant_id, branch_id, code, customer_id, service_id, employee_id, start_at, end_at, status, note, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11,$12)`,
          [id, ctx.tenantId, emp.branch_id, code, body.customer_id, sv.id, emp.id, start, end, str(body.note, 300) || null, ctx.userId, ctx.now()],
        );
        await scheduleApptReminders(qq, ctx, { id, start_at: start });
        await qq("UPDATE customers SET lifecycle_stage=GREATEST(lifecycle_stage, 3), updated_at=now(), version=version+1 WHERE id=$1 AND lifecycle_stage < 3", [body.customer_id]);
        await custEvent(qq, ctx, body.customer_id, "Đặt lịch", `${sv.name} ${fmtRange(start, end)} ${fmtDate(start)} với ${emp.display_name}.`, "Chờ xác nhận", id);
        await audit(ctx, "appointment.create", "appointment", id, { code }, "OK", qq);
        return { id, code };
      });
      return result;
    },
  },
  {
    method: "POST",
    path: "/appointments/:id/reschedule",
    handler: async ({ ctx, params, body }) => {
      ctx.require("appointments.manage", "Bạn không có quyền đổi lịch.");
      const reason = str(body.reason, 300);
      if (!reason) throw bad("Vui lòng ghi lý do đổi lịch.", { reason: "Bắt buộc" });
      return tx(async (qq) => {
        const a = await loadAppt(ctx, params.id, qq, true);
        checkVersion(a.version, body.expected_version);
        if (!["PENDING", "CONFIRMED"].includes(a.status)) throw conflict("Chỉ đổi được lịch đang chờ hoặc đã xác nhận.");
        const empId = body.employee_id ?? a.employee_id;
        const start = parseIso(body.start_at, "Thời gian mới", "start_at");
        const dur = (new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60000;
        const end = new Date(start.getTime() + dur * 60000);
        await lockEmployee(qq, empId);
        const c = await appointmentConflicts(qq, ctx.tenantId, empId, start, end, a.id);
        if (c.length) throw conflict(c[0].message, { conflicts: c, suggestion: await suggestSlot(qq, ctx.tenantId, empId, start, dur, a.id) });
        const cancelled = await cancelJobsFor(qq, ctx.tenantId, a.id, "Hủy nhắc cũ: lịch đã đổi giờ");
        await qq("UPDATE appointments SET start_at=$2, end_at=$3, employee_id=$4, status='PENDING', note=COALESCE(note,'') || $5, updated_at=now(), version=version+1 WHERE id=$1", [
          a.id,
          start,
          end,
          empId,
          ` | Đổi lịch: ${reason}`,
        ]);
        await scheduleApptReminders(qq, ctx, { id: a.id, start_at: start });
        await custEvent(qq, ctx, a.customer_id, "Đổi lịch", `${fmtTime(a.start_at)} ${fmtDate(a.start_at)} → ${fmtRange(start, end)} ${fmtDate(start)}. Lý do: ${reason}`, "Chờ xác nhận", a.id);
        await audit(ctx, "appointment.reschedule", "appointment", a.id, { reason, reminders_cancelled: cancelled }, "OK", qq);
        return { ok: true, reminders_cancelled: cancelled };
      });
    },
  },
  {
    method: "POST",
    path: "/appointments/:id/cancel",
    handler: async ({ ctx, params, body }) => {
      ctx.require("appointments.manage", "Bạn không có quyền hủy lịch.");
      const reason = str(body.reason, 300);
      if (!reason) throw bad("Vui lòng ghi lý do hủy.", { reason: "Bắt buộc" });
      return tx(async (qq) => {
        const a = await loadAppt(ctx, params.id, qq, true);
        if (!["PENDING", "CONFIRMED"].includes(a.status)) throw conflict("Lịch đã đóng, không thể hủy.");
        await qq("UPDATE appointments SET status='CANCELLED', cancel_reason=$2, updated_at=now(), version=version+1 WHERE id=$1", [a.id, reason]);
        const cancelled = await cancelJobsFor(qq, ctx.tenantId, a.id, "Hủy nhắc: lịch đã hủy");
        await custEvent(qq, ctx, a.customer_id, "Hủy lịch", `Lịch ${fmtTime(a.start_at)} ${fmtDate(a.start_at)} đã hủy. Lý do: ${reason}`, "Đã hủy", a.id);
        await audit(ctx, "appointment.cancel", "appointment", a.id, { reason, reminders_cancelled: cancelled }, "OK", qq);
        return { ok: true, reminders_cancelled: cancelled };
      });
    },
  },
  ...Object.entries(transitions).map(
    ([action, tr]): RouteDef => ({
      method: "POST",
      path: `/appointments/:id/${action}`,
      handler: async ({ ctx, params }) => {
        ctx.require("appointments.manage", "Bạn không có quyền cập nhật lịch hẹn.");
        return tx(async (qq) => {
          const a = await loadAppt(ctx, params.id, qq, true);
          if (!tr.from.includes(a.status)) throw conflict(`Không thể chuyển từ “${APPT_STATUS_LABEL[a.status]}” sang “${APPT_STATUS_LABEL[tr.to]}”.`);
          await qq(`UPDATE appointments SET status=$2${tr.to === "CONFIRMED" ? ", confirmed_at=$3" : ""}, updated_at=now(), version=version+1 WHERE id=$1`, tr.to === "CONFIRMED" ? [a.id, tr.to, ctx.now()] : [a.id, tr.to]);
          if (["ARRIVED", "COMPLETED", "NO_SHOW"].includes(tr.to)) await cancelJobsFor(qq, ctx.tenantId, a.id, `Không cần nhắc: ${APPT_STATUS_LABEL[tr.to].toLowerCase()}`);
          if (tr.to === "ARRIVED") await qq("UPDATE customers SET lifecycle_stage=GREATEST(lifecycle_stage,4), updated_at=now() WHERE id=$1", [a.customer_id]);
          if (tr.to === "COMPLETED") await qq("UPDATE customers SET lifecycle_stage=GREATEST(lifecycle_stage,5), updated_at=now() WHERE id=$1", [a.customer_id]);
          await custEvent(qq, ctx, a.customer_id, tr.label, `Lịch ${fmtTime(a.start_at)} ${fmtDate(a.start_at)}: ${APPT_STATUS_LABEL[tr.to]}.`, APPT_STATUS_LABEL[tr.to], a.id);
          await audit(ctx, `appointment.${action}`, "appointment", a.id, {}, "OK", qq);
          return { ok: true, status: tr.to };
        });
      },
    }),
  ),
  {
    method: "POST",
    path: "/appointments/:id/remind",
    handler: async ({ ctx, params }) => {
      ctx.require("appointments.manage", "Bạn không có quyền nhắc lịch.");
      const a = await loadAppt(ctx, params.id);
      if (!["PENDING", "CONFIRMED"].includes(a.status)) throw conflict("Chỉ nhắc được lịch đang hiệu lực.");
      const cust = await one<any>("SELECT display_name, assigned_to FROM customers WHERE id=$1", [a.customer_id]);
      const owner = cust.assigned_to ?? ctx.employeeId;
      if (!owner) throw bad("Khách chưa có người phụ trách để giao việc nhắc thủ công.");
      // Kênh Zalo chưa kết nối: tạo việc gọi nhắc thủ công thay vì giả lập "đã gửi"
      return tx(async (qq) => {
        const dup = await qq<any>("SELECT id, code FROM tasks WHERE tenant_id=$1 AND description=$2 AND status IN ('TODO','IN_PROGRESS','SUBMITTED')", [ctx.tenantId, `remind-appt:${a.id}`]);
        if (dup[0]) return { ok: true, duplicate: true, message: `Đã có việc nhắc ${dup[0].code} đang mở, không tạo trùng.` };
        const code = await nextCode(qq, ctx.tenantId, "tasks", "CV");
        const id = uid();
        const due = new Date(Math.min(new Date(a.start_at).getTime() - 60 * 60000, ctx.now().getTime() + 3 * 3600000));
        await qq(
          `INSERT INTO tasks (id, tenant_id, branch_id, code, title, description, owner_id, created_by, customer_id, due_at, priority, status, biz_created_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'HIGH','TODO',$11,$11)`,
          [id, ctx.tenantId, a.branch_id, code, `Gọi nhắc lịch ${cust.display_name} (${fmtTime(a.start_at)} ${fmtDate(a.start_at)})`, `remind-appt:${a.id}`, owner, ctx.userId, a.customer_id, due < ctx.now() ? new Date(ctx.now().getTime() + 30 * 60000) : due, ctx.now()],
        );
        for (const [i, t] of ["Liên hệ khách", "Cập nhật xác nhận"].entries())
          await qq("INSERT INTO checklist_items (id, tenant_id, task_id, title, required, position) VALUES ($1,$2,$3,$4,true,$5)", [uid(), ctx.tenantId, id, t, i]);
        await audit(ctx, "appointment.remind_manual", "appointment", a.id, { task: code }, "OK", qq);
        return { ok: true, message: `Zalo chưa kết nối nên chưa gửi nhắc tự động. Đã tạo việc ${code} để gọi nhắc thủ công.` };
      });
    },
  },
];
