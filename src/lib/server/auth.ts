import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { q, one, uid } from "./db";
import { forbidden, unauthorized } from "./http";
import { resolvePerms, type PermissionOverrides } from "../shared/perms";
import type { Role } from "../shared/labels";

export const SESSION_COOKIE = "pmu_session";

export interface Ctx {
  requestId: string;
  tenantId: string;
  tenantName: string;
  mode: "DEMO" | "REAL";
  sessionId: string;
  loginUserId: string;
  userId: string;
  userName: string;
  role: Role;
  employeeId: string | null;
  allowedBranchIds: string[];
  branchFilter: string[];
  selectedBranch: string | "all";
  perms: Set<string>;
  settings: TenantSettings;
  nowDate: Date;
  now: () => Date;
  can: (perm: string) => boolean;
  require: (perm: string, message?: string) => void;
  actorLabel: string;
}

export interface TenantSettings {
  quiet_hours?: { enabled: boolean; from: string; to: string };
  reminder_offsets_hours?: number[];
  shift_templates?: Record<string, { label: string; start: string; end: string }>;
  shift_min_staff?: Record<string, number>;
  ai_policy?: { default_level: string; levels: Record<string, string>; budget_per_day?: number };
  permission_overrides?: PermissionOverrides;
  notifications?: Record<string, boolean>;
  booking_window_days?: number;
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pw, salt, 32).toString("hex");
  return `scrypt$${salt}$${h}`;
}
export function verifyPassword(pw: string, stored?: string | null) {
  if (!stored) return false;
  const [kind, salt, h] = stored.split("$");
  if (kind !== "scrypt" || !salt || !h) return false;
  const calc = scryptSync(pw, salt, 32);
  const want = Buffer.from(h, "hex");
  return want.length === calc.length && timingSafeEqual(calc, want);
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(tenantId: string, userId: string, days = 7) {
  const token = randomBytes(32).toString("base64url");
  await q(
    "INSERT INTO sessions (id, tenant_id, user_id, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' days')::interval)",
    [hashToken(token), tenantId, userId, String(days)],
  );
  return token;
}

export async function destroySession(token?: string | null) {
  if (!token) return;
  await q("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
}

export function tenantClock(t: { demo_now?: Date | string | null; clock_anchor?: Date | string | null }) {
  if (t.demo_now && t.clock_anchor) {
    const base = new Date(t.demo_now).getTime();
    const anchor = new Date(t.clock_anchor).getTime();
    return () => new Date(base + (Date.now() - anchor));
  }
  return () => new Date();
}

export async function buildCtx(token: string | undefined | null, branchHeader: string | null): Promise<Ctx> {
  if (!token) throw unauthorized("Bạn chưa đăng nhập.");
  const s = await one<any>(
    `SELECT s.id AS session_id, s.tenant_id, s.user_id, s.acting_user_id, s.expires_at,
            t.name AS tenant_name, t.mode, t.demo_now, t.clock_anchor, t.settings, t.status AS tenant_status, t.last_active_at
       FROM sessions s JOIN tenants t ON t.id = s.tenant_id
      WHERE s.id = $1`,
    [hashToken(token)],
  );
  if (!s || new Date(s.expires_at).getTime() < Date.now()) throw unauthorized();
  const actingId = s.acting_user_id || s.user_id;
  const u = await one<any>(
    `SELECT u.id, u.display_name, u.status, m.role, m.branch_ids, m.employee_id
       FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2`,
    [actingId, s.tenant_id],
  );
  if (!u || u.status !== "ACTIVE") throw unauthorized("Tài khoản đã bị ngừng truy cập hoặc không còn hiệu lực.");
  const branches = await q<{ id: string }>(
    "SELECT id FROM branches WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY created_at",
    [s.tenant_id],
  );
  const allIds = branches.map((b) => b.id);
  const allowed: string[] = u.branch_ids && u.branch_ids.length ? allIds.filter((id) => u.branch_ids.includes(id)) : allIds;
  let selected: string | "all" = "all";
  let filter = allowed;
  if (branchHeader && branchHeader !== "all") {
    if (!allowed.includes(branchHeader)) throw forbidden("Bạn không có quyền xem chi nhánh này.");
    selected = branchHeader;
    filter = [branchHeader];
  }
  const settings: TenantSettings = s.settings || {};
  const perms = resolvePerms(u.role as Role, settings.permission_overrides);
  const now = tenantClock(s);
  if (Date.now() - new Date(s.last_active_at).getTime() > 10 * 60 * 1000) {
    q("UPDATE tenants SET last_active_at = now() WHERE id = $1", [s.tenant_id]).catch(() => {});
  }
  const ctx: Ctx = {
    requestId: uid().slice(0, 8),
    tenantId: s.tenant_id,
    tenantName: s.tenant_name,
    mode: s.mode,
    sessionId: s.session_id,
    loginUserId: s.user_id,
    userId: u.id,
    userName: u.display_name,
    role: u.role,
    employeeId: u.employee_id,
    allowedBranchIds: allowed,
    branchFilter: filter,
    selectedBranch: selected,
    perms,
    settings,
    nowDate: now(),
    now,
    can: (p) => perms.has(p),
    require: (p, message) => {
      if (!perms.has(p)) throw forbidden(message);
    },
    actorLabel: u.display_name,
  };
  return ctx;
}
