// Nghiệp vụ dùng chung: phạm vi dữ liệu, kiểm tra xung đột lịch, hàng đợi nhắc, adapter Zalo.
import { q, uid, type Q } from "./db";
import type { Ctx, TenantSettings } from "./auth";
import { forbidden, notFound, unavailable } from "./http";
import { fmtDateTime, fmtRange, fmtTime, vnParts, vnDayKey, vnToDate } from "../shared/format";

// ---------------- Phạm vi dữ liệu ----------------
export async function visibleCustomerIds(ctx: Ctx, qq: Q = q): Promise<string[]> {
  const b = ctx.branchFilter;
  if (ctx.can("customers.view_all")) {
    return (await qq<{ id: string }>("SELECT id FROM customers WHERE tenant_id=$1 AND branch_id = ANY($2)", [ctx.tenantId, b])).map((r) => r.id);
  }
  if (!ctx.employeeId) return [];
  if (ctx.can("customers.view_assigned")) {
    return (
      await qq<{ id: string }>(
        `SELECT id FROM customers WHERE tenant_id=$1 AND branch_id = ANY($2) AND (assigned_to=$3
           OR id IN (SELECT customer_id FROM conversations WHERE tenant_id=$1 AND (assigned_to=$3 OR specialist_id=$3)))`,
        [ctx.tenantId, b, ctx.employeeId],
      )
    ).map((r) => r.id);
  }
  // Kỹ thuật viên: chỉ khách trong lịch của mình (thông tin tối thiểu)
  return (
    await qq<{ id: string }>(
      "SELECT DISTINCT customer_id AS id FROM appointments WHERE tenant_id=$1 AND branch_id = ANY($2) AND employee_id=$3",
      [ctx.tenantId, b, ctx.employeeId],
    )
  ).map((r) => r.id);
}

export async function assertCustomerVisible(ctx: Ctx, customerId: string, qq: Q = q) {
  const ids = await visibleCustomerIds(ctx, qq);
  if (!ids.includes(customerId)) throw notFound("Không tìm thấy khách hàng trong phạm vi của bạn.");
}

export function canSeeSensitive(ctx: Ctx) {
  return ctx.can("customers.view_sensitive");
}

export async function getEmployee(ctx: Ctx, id: string, qq: Q = q) {
  const e = await qq<any>("SELECT * FROM employees WHERE tenant_id=$1 AND id=$2 AND branch_id = ANY($3)", [
    ctx.tenantId,
    id,
    ctx.allowedBranchIds,
  ]);
  if (!e[0]) throw notFound("Không tìm thấy nhân sự trong phạm vi của bạn.");
  return e[0];
}

export async function employeeNames(tenantId: string, qq: Q = q) {
  const rows = await qq<{ id: string; display_name: string; code: string; position: string }>(
    "SELECT id, display_name, code, position FROM employees WHERE tenant_id=$1",
    [tenantId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export async function nextCode(qq: Q, tenantId: string, table: "tasks" | "appointments" | "customers", prefix: string) {
  const r = await qq<{ n: number }>(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0)::int AS n FROM ${table} WHERE tenant_id=$1`,
    [tenantId],
  );
  return `${prefix}${String((r[0]?.n ?? 0) + 1).padStart(4, "0")}`;
}

// ---------------- Xung đột lịch ----------------
export async function lockEmployee(qq: Q, employeeId: string) {
  await qq("SELECT pg_advisory_xact_lock(hashtext($1))", [employeeId]);
}

export interface Conflict {
  type: "SHIFT_OVERLAP" | "LEAVE" | "APPOINTMENT_OVERLAP" | "OUTSIDE_SHIFT" | "INACTIVE";
  message: string;
  ref_id?: string;
}

export async function shiftConflicts(
  qq: Q,
  tenantId: string,
  employeeId: string,
  start: Date,
  end: Date,
  excludeShiftId?: string | null,
): Promise<Conflict[]> {
  const out: Conflict[] = [];
  const emp = (await qq<any>("SELECT display_name, active FROM employees WHERE tenant_id=$1 AND id=$2", [tenantId, employeeId]))[0];
  if (!emp) return [{ type: "INACTIVE", message: "Nhân sự không tồn tại." }];
  if (!emp.active) out.push({ type: "INACTIVE", message: `${emp.display_name} đã ngừng hoạt động.` });
  const ov = await qq<any>(
    `SELECT id, start_at, end_at, status FROM shifts WHERE tenant_id=$1 AND employee_id=$2 AND status <> 'CANCELLED'
       AND start_at < $4 AND end_at > $3 AND ($5::uuid IS NULL OR id <> $5::uuid)`,
    [tenantId, employeeId, start, end, excludeShiftId ?? null],
  );
  for (const s of ov)
    out.push({
      type: "SHIFT_OVERLAP",
      message: `${emp.display_name} đã có ca ${fmtRange(s.start_at, s.end_at)} ngày ${fmtDateTime(s.start_at).slice(6)}.`,
      ref_id: s.id,
    });
  const lv = await qq<any>(
    "SELECT id, reason FROM leaves WHERE tenant_id=$1 AND employee_id=$2 AND status='APPROVED' AND start_at < $4 AND end_at > $3",
    [tenantId, employeeId, start, end],
  );
  for (const l of lv) out.push({ type: "LEAVE", message: `${emp.display_name} đang nghỉ phép trong khung giờ này.`, ref_id: l.id });
  return out;
}

export async function appointmentConflicts(
  qq: Q,
  tenantId: string,
  employeeId: string,
  start: Date,
  end: Date,
  excludeApptId?: string | null,
): Promise<Conflict[]> {
  const out: Conflict[] = [];
  const emp = (await qq<any>("SELECT display_name, active FROM employees WHERE tenant_id=$1 AND id=$2", [tenantId, employeeId]))[0];
  if (!emp) return [{ type: "INACTIVE", message: "Nhân sự không tồn tại." }];
  if (!emp.active) out.push({ type: "INACTIVE", message: `${emp.display_name} đã ngừng hoạt động.` });
  const ov = await qq<any>(
    `SELECT a.id, a.start_at, a.end_at, c.display_name AS customer FROM appointments a JOIN customers c ON c.id=a.customer_id
      WHERE a.tenant_id=$1 AND a.employee_id=$2 AND a.status IN ('PENDING','CONFIRMED','ARRIVED')
        AND a.start_at < $4 AND a.end_at > $3 AND ($5::uuid IS NULL OR a.id <> $5::uuid)`,
    [tenantId, employeeId, start, end, excludeApptId ?? null],
  );
  for (const a of ov)
    out.push({
      type: "APPOINTMENT_OVERLAP",
      message: `${emp.display_name} đã có lịch tại khung giờ này. Lịch hiện có: ${a.customer} (${fmtRange(a.start_at, a.end_at)}).`,
      ref_id: a.id,
    });
  const cover = await qq<any>(
    "SELECT id FROM shifts WHERE tenant_id=$1 AND employee_id=$2 AND status='APPROVED' AND start_at <= $3 AND end_at >= $4 LIMIT 1",
    [tenantId, employeeId, start, end],
  );
  if (!cover.length)
    out.push({ type: "OUTSIDE_SHIFT", message: `${emp.display_name} không có ca làm đã duyệt bao trùm ${fmtRange(start, end)}.` });
  const lv = await qq<any>(
    "SELECT id FROM leaves WHERE tenant_id=$1 AND employee_id=$2 AND status='APPROVED' AND start_at < $4 AND end_at > $3",
    [tenantId, employeeId, start, end],
  );
  if (lv.length) out.push({ type: "LEAVE", message: `${emp.display_name} đang nghỉ phép.` });
  return out;
}

/** Tìm khung giờ trống gần nhất trong ngày (bước 30 phút) cho nhân sự, rồi tới nhân sự khác cùng vị trí */
export async function suggestSlot(qq: Q, tenantId: string, employeeId: string, start: Date, durationMin: number, excludeApptId?: string | null) {
  const day = vnDayKey(start);
  const shifts = await qq<any>(
    `SELECT s.employee_id, s.start_at, s.end_at, e.display_name, e.position FROM shifts s JOIN employees e ON e.id = s.employee_id
      WHERE s.tenant_id=$1 AND s.status='APPROVED' AND s.start_at >= $2 AND s.start_at < $3 AND e.active
      ORDER BY (s.employee_id = $4) DESC, s.start_at`,
    [tenantId, vnToDate(day, "00:00"), vnToDate(day, "23:59"), employeeId],
  );
  const pos = (await qq<any>("SELECT position FROM employees WHERE id=$1", [employeeId]))[0]?.position;
  for (const s of shifts) {
    if (s.employee_id !== employeeId && s.position !== pos) continue;
    let t = Math.max(new Date(s.start_at).getTime(), s.employee_id === employeeId ? start.getTime() : new Date(s.start_at).getTime());
    t = Math.ceil(t / (30 * 60000)) * 30 * 60000;
    while (t + durationMin * 60000 <= new Date(s.end_at).getTime()) {
      const a = new Date(t);
      const b = new Date(t + durationMin * 60000);
      const c = await appointmentConflicts(qq, tenantId, s.employee_id, a, b, excludeApptId);
      if (!c.length) return { employee_id: s.employee_id, employee_name: s.display_name, start_at: a.toISOString(), end_at: b.toISOString() };
      t += 30 * 60000;
    }
  }
  return null;
}

// ---------------- Giờ yên tĩnh ----------------
export function inQuietHours(settings: TenantSettings, at: Date) {
  const qh = settings.quiet_hours;
  if (!qh?.enabled) return false;
  const p = vnParts(at);
  const m = p.hh * 60 + p.mm;
  const [fh, fm] = qh.from.split(":").map(Number);
  const [th, tm] = qh.to.split(":").map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  return from > to ? m >= from || m < to : m >= from && m < to;
}

// ---------------- Adapter Zalo (hợp đồng nội bộ đề xuất) ----------------
export interface MessagingAdapter {
  capabilities(): { send: boolean; receive: boolean; delivery_status: boolean; mode: string };
  health(): Promise<{ status: "NOT_CONNECTED" | "CONNECTED" | "ERROR"; message: string }>;
  sendMessage(req: { to: string; body: string }, idempotencyKey: string): Promise<{ status: string; provider_message_id?: string }>;
  getDeliveryStatus(messageId: string): Promise<string>;
}

export class AdapterNotConnected extends Error {}

/** Adapter DEMO: không bao giờ gửi thật. Chưa có repo Zalo được xác minh. */
export class DemoZaloAdapter implements MessagingAdapter {
  capabilities() {
    return { send: false, receive: false, delivery_status: false, mode: "DEMO" };
  }
  async health() {
    return {
      status: "NOT_CONNECTED" as const,
      message:
        "Chưa kết nối Zalo. Repo Zalo chưa được cung cấp/kiểm tra (README, license, cơ chế xác thực, API). Hệ thống đang ở chế độ mô phỏng, không gửi tin thật.",
    };
  }
  async sendMessage(): Promise<{ status: string }> {
    throw new AdapterNotConnected("Zalo chưa kết nối — tin nhắn chưa được gửi.");
  }
  async getDeliveryStatus() {
    return "unknown";
  }
}

export async function getMessagingAdapter(_tenantId: string): Promise<MessagingAdapter> {
  // Khi đã xác minh repo Zalo thật, khởi tạo adapter LIVE tại đây (secret chỉ đọc ở server).
  return new DemoZaloAdapter();
}

export async function hasCareConsent(qq: Q, tenantId: string, customerId: string) {
  const r = await qq<any>(
    `SELECT status FROM consents WHERE tenant_id=$1 AND customer_id=$2 AND purpose='CARE' AND channel='ZALO'
      ORDER BY recorded_at DESC, created_at DESC LIMIT 1`,
    [tenantId, customerId],
  );
  return r[0]?.status === "GRANTED";
}

// ---------------- Hàng đợi nhắc ----------------
export async function scheduleApptReminders(qq: Q, ctx: Ctx, appt: { id: string; start_at: Date | string }) {
  const start = new Date(appt.start_at);
  const now = ctx.now();
  for (const h of ctx.settings.reminder_offsets_hours ?? [24, 2]) {
    const runAt = new Date(start.getTime() - h * 3600000);
    if (runAt.getTime() <= now.getTime()) continue;
    await qq(
      `INSERT INTO jobs (id, tenant_id, type, ref_type, ref_id, run_at, status, dedupe_key)
       VALUES ($1,$2,'APPT_REMINDER','appointment',$3,$4,'SCHEDULED',$5) ON CONFLICT (dedupe_key) DO NOTHING`,
      [uid(), ctx.tenantId, appt.id, runAt, `appt:${appt.id}:${start.toISOString()}:${h}h`],
    );
  }
}

export async function cancelJobsFor(qq: Q, tenantId: string, refId: string, reason: string) {
  const r = await qq<{ id: string }>(
    `UPDATE jobs SET status='CANCELLED', result=$3, updated_at=now(), version=version+1
      WHERE tenant_id=$1 AND ref_id=$2 AND status IN ('SCHEDULED','WAITING') RETURNING id`,
    [tenantId, refId, reason],
  );
  return r.length;
}

export async function runDueJobs(ctx: Ctx) {
  const now = ctx.now();
  const jobs = await q<any>(
    "SELECT * FROM jobs WHERE tenant_id=$1 AND status IN ('SCHEDULED','WAITING') AND run_at <= $2 ORDER BY run_at LIMIT 100",
    [ctx.tenantId, now],
  );
  const adapter = await getMessagingAdapter(ctx.tenantId);
  const health = await adapter.health();
  const summary: Record<string, number> = { processed: 0, blocked: 0, waiting: 0, cancelled: 0, sent: 0 };
  for (const job of jobs) {
    summary.processed++;
    let status = "BLOCKED";
    let result = "";
    let customerId: string | null = null;
    if (job.type === "APPT_REMINDER") {
      const a = (await q<any>("SELECT * FROM appointments WHERE id=$1 AND tenant_id=$2", [job.ref_id, ctx.tenantId]))[0];
      if (!a || !["PENDING", "CONFIRMED"].includes(a.status) || !job.dedupe_key.includes(new Date(a.start_at).toISOString())) {
        status = "CANCELLED";
        result = "Không gửi: lịch hẹn đã hủy hoặc đã đổi giờ.";
      } else customerId = a.customer_id;
    } else if (job.type === "CARE_TOUCHPOINT") {
      const t = (
        await q<any>(
          "SELECT t.*, p.status AS plan_status FROM care_touchpoints t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=$1 AND t.tenant_id=$2",
          [job.ref_id, ctx.tenantId],
        )
      )[0];
      if (!t || t.status === "DONE") {
        status = "CANCELLED";
        result = "Không gửi: điểm chạm đã hoàn tất hoặc không còn.";
      } else if (t.plan_status === "PAUSED" || t.status === "PAUSED") {
        status = "WAITING";
        result = "Chờ: kế hoạch chăm sóc đang tạm dừng.";
      } else {
        customerId = t.customer_id;
        if (t.status === "PLANNED")
          await q("UPDATE care_touchpoints SET status='TO_CONTACT', updated_at=now(), version=version+1 WHERE id=$1", [t.id]);
      }
    }
    if (customerId) {
      if (!(await hasCareConsent(q, ctx.tenantId, customerId))) {
        status = "BLOCKED";
        result = "Dừng: khách chưa đồng ý hoặc đã rút đồng ý liên hệ chăm sóc. Không gửi.";
      } else if (inQuietHours(ctx.settings, now)) {
        status = "WAITING";
        result = `Chờ: đang trong giờ yên tĩnh (${ctx.settings.quiet_hours?.from}–${ctx.settings.quiet_hours?.to}).`;
      } else if (health.status !== "CONNECTED") {
        status = "BLOCKED";
        result = "Chưa gửi: Zalo chưa kết nối. Cần liên hệ thủ công.";
      } else {
        try {
          await adapter.sendMessage({ to: customerId, body: "" }, `job:${job.id}`);
          status = "DONE";
          result = "Đã gửi qua kênh đã kết nối.";
          summary.sent++;
        } catch {
          status = "BLOCKED";
          result = "Chưa gửi: kênh trả lỗi, cần kiểm tra.";
        }
      }
    }
    if (status === "BLOCKED") summary.blocked++;
    if (status === "WAITING") summary.waiting++;
    if (status === "CANCELLED") summary.cancelled++;
    await q(
      "UPDATE jobs SET status=$2, result=$3, attempts=attempts+1, updated_at=now(), version=version+1 WHERE id=$1",
      [job.id, status, `${result} (lần chạy ${fmtTime(now)} ${vnDayKey(now).split("-").reverse().join("/")})`],
    );
  }
  return summary;
}

export function requireEmployee(ctx: Ctx) {
  if (!ctx.employeeId) throw forbidden("Tài khoản này không gắn với hồ sơ nhân sự.");
  return ctx.employeeId;
}

export async function integrationRow(tenantId: string, qq: Q = q) {
  let r = (await qq<any>("SELECT * FROM integrations WHERE tenant_id=$1 AND provider='ZALO'", [tenantId]))[0];
  if (!r) {
    await qq("INSERT INTO integrations (id, tenant_id, provider) VALUES ($1,$2,'ZALO') ON CONFLICT DO NOTHING", [uid(), tenantId]);
    r = (await qq<any>("SELECT * FROM integrations WHERE tenant_id=$1 AND provider='ZALO'", [tenantId]))[0];
  }
  return r;
}

export function assertSendable(): never {
  throw unavailable("Zalo chưa kết nối — tin nhắn chưa được gửi. Bạn có thể lưu bản nháp hoặc gửi phê duyệt.", {
    integration: "ZALO",
    health: "NOT_CONNECTED",
  });
}
