import { tx, uid, j, type Q } from "./db";
import { hashPassword, type TenantSettings } from "./auth";
import { addDays, vnDayKey } from "../shared/format";
import { buildReportContent } from "./ai";
import { generateBusiness } from "./generator";
import { seedBrain, seedZaloScenarios } from "./scenarios";
import { seedMarketing } from "./marketing";

export const DEMO_NOW_ISO = "2026-11-15T10:30:00Z"; // 17:30 ngày 15/11/2026 giờ Việt Nam

export const DEFAULT_SETTINGS: TenantSettings = {
  quiet_hours: { enabled: true, from: "21:00", to: "08:00" },
  reminder_offsets_hours: [24, 2],
  shift_templates: {
    S: { label: "Sáng", start: "08:00", end: "12:00" },
    C: { label: "Chiều", start: "13:00", end: "17:00" },
  },
  shift_min_staff: { S: 3, C: 3 },
  ai_policy: {
    default_level: "L1",
    levels: {
      INTERNAL_REMINDER: "L2",
      TASK_ASSIGN: "L1",
      SHIFT_CHANGE: "L1",
      CUSTOMER_MESSAGE: "L1",
      CARE_MESSAGE: "L1",
      SOP_PUBLISH: "L1",
    },
    budget_per_day: 200,
  },
  permission_overrides: {},
  notifications: { overdue_tasks: true, pending_approvals: true, new_conversations: true, blocked_jobs: true },
  booking_window_days: 7,
  agents: { hr: { enabled: true }, care: { enabled: true }, report: { enabled: true }, sop: { enabled: true } },
  agents_paused: false,
};

async function ins(qq: Q, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    if (v instanceof Date || v === null || v === undefined) return v ?? null;
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });
  await qq(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, vals);
}

async function addReports(qq: Q, tenantId: string, branchIds: string[], now: Date, ownerUserId: string) {
  const today = vnDayKey(now);
  const yesterday = addDays(today, -1);
  const prev = await buildReportContent(qq, { tenantId, branchIds: [branchIds[0]], day: yesterday, now });
  await ins(qq, "reports", {
    id: uid(),
    tenant_id: tenantId,
    branch_id: branchIds[0],
    period_date: yesterday,
    scope: "Chi nhánh Cầu Giấy",
    source_cutoff: new Date(prev.cutoff),
    content: prev,
    status: "APPROVED",
    created_by: ownerUserId,
    reviewed_by: ownerUserId,
    reviewed_at: new Date(now.getTime() - 20 * 3600000),
  });
  const content = await buildReportContent(qq, { tenantId, branchIds: [branchIds[0]], day: today, now });
  await ins(qq, "reports", { id: uid(), tenant_id: tenantId, branch_id: branchIds[0], period_date: today, scope: "Chi nhánh Cầu Giấy", source_cutoff: now, content, status: "DRAFT", created_by: ownerUserId });
}

export async function createRealTenant(ownerEmail: string, ownerPassword: string) {
  return tx(async (qq) => {
    const tenantId = uid();
    const branchId = uid();
    const userId = uid();
    await ins(qq, "tenants", { id: tenantId, name: "DOANH NGHIỆP PMU", mode: "REAL", settings: DEFAULT_SETTINGS });
    await ins(qq, "branches", { id: branchId, tenant_id: tenantId, name: "Chi nhánh chính" });
    await ins(qq, "users", { id: userId, tenant_id: tenantId, email: ownerEmail.toLowerCase(), display_name: "Chủ doanh nghiệp", password_hash: hashPassword(ownerPassword) });
    await ins(qq, "memberships", { id: uid(), tenant_id: tenantId, user_id: userId, role: "OWNER" });
    await ins(qq, "integrations", { id: uid(), tenant_id: tenantId, provider: "ZALO", mode: "DEMO", health: "NOT_CONNECTED" });
    return { tenantId, userId };
  });
}

export async function seedDemoTenant() {
  return tx(async (qq) => {
    const tenantId = uid();
    const demoNow = new Date(DEMO_NOW_ISO);
    await ins(qq, "tenants", {
      id: tenantId,
      name: "DOANH NGHIỆP PMU",
      mode: "DEMO",
      demo_now: demoNow,
      clock_anchor: new Date(),
      settings: { ...DEFAULT_SETTINGS, simulated_data: true, ai_policy: { ...DEFAULT_SETTINGS.ai_policy!, budget_per_day: 40 } },
    });
    const r = await generateBusiness(qq, { tenantId, now: demoNow, mode: "DEMO" });
    await seedZaloScenarios(qq, tenantId, demoNow);
    await seedBrain(qq, tenantId, demoNow);
    await seedMarketing(qq, tenantId, demoNow);
    await addReports(qq, tenantId, r.branchIds, demoNow, r.ownerUserId);
    return { tenantId, ownerUserId: r.ownerUserId };
  });
}

/** Nạp bộ dữ liệu mô phỏng dày vào doanh nghiệp thật (chỉ khi chưa có nhân sự) */
export async function seedRealTenant(tenantId: string) {
  return tx(async (qq) => {
    const t = (await qq<any>("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [tenantId]))[0];
    if (!t || t.mode !== "REAL") return { seeded: false, reason: "Không phải doanh nghiệp thật." };
    const n = (await qq<any>("SELECT count(*)::int AS n FROM employees WHERE tenant_id=$1", [tenantId]))[0].n;
    if (n > 0) return { seeded: false, reason: "Doanh nghiệp đã có dữ liệu nhân sự, không nạp chồng." };
    const owner = (await qq<any>("SELECT user_id FROM memberships WHERE tenant_id=$1 AND role='OWNER' ORDER BY created_at LIMIT 1", [tenantId]))[0];
    const branch = (await qq<any>("SELECT id FROM branches WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId]))[0];
    await qq("UPDATE branches SET name='Chi nhánh Cầu Giấy', updated_at=now() WHERE id=$1", [branch.id]);
    const now = new Date();
    const r = await generateBusiness(qq, { tenantId, now, mode: "REAL", ownerUserId: owner.user_id, existingBranchId: branch.id, seed: 7301 });
    await seedZaloScenarios(qq, tenantId, now);
    await seedBrain(qq, tenantId, now);
    await seedMarketing(qq, tenantId, now);
    await addReports(qq, tenantId, r.branchIds, now, owner.user_id);
    const settings = { ...DEFAULT_SETTINGS, ...(t.settings ?? {}), simulated_data: true, simulated_seeded: true, simulated_cleared: false };
    await qq("UPDATE tenants SET settings=$2::jsonb, updated_at=now(), version=version+1 WHERE id=$1", [tenantId, j(settings)]);
    return { seeded: true };
  });
}

const BUSINESS_TABLES = [
  "mkt_reviews",
  "mkt_videos",
  "mkt_batches",
  "mkt_characters",
  "mkt_channels",
  "brain_lookups",
  "brain_notes",
  "ai_messages",
  "ai_threads",
  "agent_runs",
  "ai_usage",
  "executions",
  "approvals",
  "ai_proposals",
  "reports",
  "support_notes",
  "learning_assignments",
  "sop_versions",
  "sop_documents",
  "jobs",
  "care_touchpoints",
  "care_plans",
  "feedback",
  "messages",
  "conversations",
  "task_events",
  "checklist_items",
  "tasks",
  "appointments",
  "customer_events",
  "customer_notes",
  "consents",
  "customers",
  "leaves",
  "shifts",
  "care_templates",
  "knowledge_items",
  "services",
];

/** Xóa toàn bộ dữ liệu mô phỏng của doanh nghiệp thật, giữ tài khoản chủ và một chi nhánh */
export async function clearSimulatedData(tenantId: string) {
  return tx(async (qq) => {
    const t = (await qq<any>("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [tenantId]))[0];
    if (!t || t.mode !== "REAL") return { cleared: false };
    for (const table of BUSINESS_TABLES) await qq(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
    const owners = (await qq<any>("SELECT user_id FROM memberships WHERE tenant_id=$1 AND role='OWNER'", [tenantId])).map((r) => r.user_id);
    await qq("DELETE FROM sessions WHERE tenant_id=$1 AND NOT (user_id = ANY($2))", [tenantId, owners]);
    await qq("DELETE FROM memberships WHERE tenant_id=$1 AND NOT (user_id = ANY($2))", [tenantId, owners]);
    await qq("UPDATE memberships SET employee_id=NULL WHERE tenant_id=$1", [tenantId]);
    await qq("DELETE FROM employees WHERE tenant_id=$1", [tenantId]);
    await qq("DELETE FROM users WHERE tenant_id=$1 AND NOT (id = ANY($2))", [tenantId, owners]);
    const first = (await qq<any>("SELECT id FROM branches WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId]))[0];
    await qq("DELETE FROM branches WHERE tenant_id=$1 AND id <> $2", [tenantId, first.id]);
    await qq("UPDATE branches SET name='Chi nhánh chính', status='ACTIVE', updated_at=now() WHERE id=$1", [first.id]);
    const settings = { ...(t.settings ?? {}), simulated_data: false, simulated_cleared: true };
    await qq("UPDATE tenants SET settings=$2::jsonb, updated_at=now(), version=version+1 WHERE id=$1", [tenantId, j(settings)]);
    return { cleared: true };
  });
}

/** Xoá các doanh nghiệp demo không hoạt động quá 3 ngày */
export async function cleanupDemoTenants(qq: Q) {
  await qq("DELETE FROM tenants WHERE mode = 'DEMO' AND last_active_at < now() - interval '3 days'");
}
