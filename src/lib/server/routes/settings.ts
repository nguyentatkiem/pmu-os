import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid, j, dbKind } from "../db";
import { bad, conflict, forbidden, notFound, str } from "../http";
import type { Ctx, TenantSettings } from "../auth";
import { getMessagingAdapter, integrationRow, runDueJobs } from "../domain";
import { DEFAULT_MATRIX, PERMISSIONS, resolvePerms } from "../../shared/perms";
import { ROLES, ROLE_LABEL } from "../../shared/labels";
import { ENGINE_LABEL } from "../ai";
import { aiStatus } from "../agent-chat";
import { clearSimulatedData, seedRealTenant } from "../seed";

async function saveSettings(ctx: Ctx, patch: Partial<TenantSettings>) {
  const t = await one<any>("SELECT settings FROM tenants WHERE id=$1", [ctx.tenantId]);
  const next = { ...(t?.settings ?? {}), ...patch };
  await q("UPDATE tenants SET settings=$2::jsonb, updated_at=now(), version=version+1 WHERE id=$1", [ctx.tenantId, j(next)]);
  return next;
}

const hhmm = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/settings",
    handler: async ({ ctx }) => {
      ctx.require("settings.view", "Bạn không có quyền xem cài đặt.");
      const tenant = await one<any>("SELECT id, name, mode, timezone, status FROM tenants WHERE id=$1", [ctx.tenantId]);
      const branches = await q<any>("SELECT * FROM branches WHERE tenant_id=$1 ORDER BY created_at", [ctx.tenantId]);
      const services = await q<any>("SELECT * FROM services WHERE tenant_id=$1 ORDER BY name", [ctx.tenantId]);
      const members = await q<any>(
        `SELECT u.id, u.display_name, u.email, u.status, m.role, m.branch_ids, m.employee_id FROM users u JOIN memberships m ON m.user_id=u.id
          WHERE u.tenant_id=$1 ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'SYSTEM_ADMIN' THEN 1 WHEN 'BRANCH_MANAGER' THEN 2 ELSE 3 END, u.display_name`,
        [ctx.tenantId],
      );
      const customers = ctx.can("customers.view_all")
        ? await q<any>("SELECT id, display_name FROM customers WHERE tenant_id=$1 AND branch_id = ANY($2) ORDER BY display_name", [ctx.tenantId, ctx.allowedBranchIds])
        : [];
      const integ = await integrationRow(ctx.tenantId);
      const adapter = await getMessagingAdapter(ctx.tenantId);
      const overrides = ctx.settings.permission_overrides ?? {};
      const matrix = ROLES.map((r) => ({ role: r, label: ROLE_LABEL[r], perms: [...resolvePerms(r, overrides)], locked: r === "OWNER" }));
      const jobs = await q<any>(
        "SELECT status, count(*)::int AS n FROM jobs WHERE tenant_id=$1 GROUP BY status",
        [ctx.tenantId],
      );
      return {
        tenant,
        branches,
        services,
        members: members.map((m) => ({ ...m, email: ctx.can("settings.manage") ? m.email : undefined, role_label: ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] })),
        customers,
        permissions: PERMISSIONS,
        matrix,
        defaults: DEFAULT_MATRIX,
        settings: { ...ctx.settings, permission_overrides: undefined },
        integration: {
          provider: "ZALO",
          mode: integ.mode,
          health: integ.health,
          last_checked_at: integ.last_checked_at,
          last_error: integ.last_error,
          capabilities: adapter.capabilities(),
          has_secret: !!integ.credential_secret_ref,
        },
        ai: { engine: ENGINE_LABEL, provider: null, ...(await aiStatus(ctx)) },
        simulated: {
          mode: tenant?.mode,
          active: tenant?.mode === "DEMO" || !!ctx.settings.simulated_data,
          can_toggle: tenant?.mode === "REAL" && ctx.role === "OWNER",
        },
        jobs: Object.fromEntries(jobs.map((x) => [x.status, x.n])),
        db: await dbKind(),
        can_manage: ctx.can("settings.manage"),
        can_permissions: ctx.can("permissions.manage"),
        can_integrations: ctx.can("integrations.manage"),
        can_audit: ctx.can("audit.view"),
      };
    },
  },
  {
    method: "PATCH",
    path: "/settings/tenant",
    handler: async ({ ctx, body }) => {
      ctx.require("settings.manage", "Bạn không có quyền sửa thông tin doanh nghiệp.");
      const name = str(body.name, 120);
      if (!name) throw bad("Tên doanh nghiệp là bắt buộc.", { name: "Bắt buộc" });
      await q("UPDATE tenants SET name=$2, updated_at=now(), version=version+1 WHERE id=$1", [ctx.tenantId, name]);
      await audit(ctx, "settings.tenant", "tenant", ctx.tenantId, { name });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/settings/branches",
    handler: async ({ ctx, body }) => {
      ctx.require("settings.manage", "Bạn không có quyền thêm chi nhánh.");
      const name = str(body.name, 120);
      if (!name) throw bad("Tên chi nhánh là bắt buộc.", { name: "Bắt buộc" });
      const dup = await one<any>("SELECT id FROM branches WHERE tenant_id=$1 AND lower(name)=lower($2)", [ctx.tenantId, name]);
      if (dup) throw conflict("Tên chi nhánh đã tồn tại.", { field: "name" });
      const id = uid();
      await q("INSERT INTO branches (id, tenant_id, name) VALUES ($1,$2,$3)", [id, ctx.tenantId, name]);
      await audit(ctx, "settings.branch_create", "branch", id, { name });
      return { id };
    },
  },
  {
    method: "PATCH",
    path: "/settings/branches/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("settings.manage");
      const b = await one<any>("SELECT * FROM branches WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!b) throw notFound();
      const name = body.name !== undefined ? str(body.name, 120) : b.name;
      if (!name) throw bad("Tên chi nhánh là bắt buộc.", { name: "Bắt buộc" });
      const status = body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
      if (status === "INACTIVE") {
        const n = await one<any>("SELECT count(*)::int AS n FROM employees WHERE branch_id=$1 AND active", [b.id]);
        if (n?.n) throw conflict(`Chi nhánh còn ${n.n} nhân sự hoạt động, không thể ngừng.`);
      }
      await q("UPDATE branches SET name=$2, status=$3, updated_at=now(), version=version+1 WHERE id=$1", [b.id, name, status]);
      await audit(ctx, "settings.branch_update", "branch", b.id, { name, status });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/settings/services",
    handler: async ({ ctx, body }) => {
      ctx.require("settings.manage", "Bạn không có quyền thêm dịch vụ.");
      const name = str(body.name, 120);
      const dur = Number(body.duration_min);
      const fe: Record<string, string> = {};
      if (!name) fe.name = "Tên dịch vụ là bắt buộc";
      if (!(dur >= 15 && dur <= 480)) fe.duration_min = "Thời lượng 15–480 phút";
      const price = body.price_vnd === "" || body.price_vnd === undefined || body.price_vnd === null ? null : Number(body.price_vnd);
      if (price !== null && (!Number.isInteger(price) || price < 0)) fe.price_vnd = "Giá là số nguyên VND, không âm";
      if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại.", fe);
      const id = uid();
      await q("INSERT INTO services (id, tenant_id, name, duration_min, price_vnd) VALUES ($1,$2,$3,$4,$5)", [id, ctx.tenantId, name, dur, price]);
      await audit(ctx, "settings.service_create", "service", id, { name });
      return { id };
    },
  },
  {
    method: "PATCH",
    path: "/settings/services/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("settings.manage");
      const s = await one<any>("SELECT * FROM services WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!s) throw notFound();
      await q("UPDATE services SET active=$2, updated_at=now(), version=version+1 WHERE id=$1", [s.id, body.active !== false]);
      await audit(ctx, "settings.service_update", "service", s.id, { active: body.active !== false });
      return { ok: true };
    },
  },
  {
    method: "PATCH",
    path: "/settings/permissions",
    handler: async ({ ctx, body }) => {
      ctx.require("permissions.manage", "Chỉ chủ doanh nghiệp được sửa ma trận quyền.");
      const role = body.role;
      if (!ROLES.includes(role) || role === "OWNER") throw bad("Không thể sửa quyền của vai trò này.");
      if (!PERMISSIONS.some((p) => p.key === body.perm)) throw bad("Quyền không hợp lệ.");
      const overrides = { ...(ctx.settings.permission_overrides ?? {}) } as Record<string, Record<string, boolean>>;
      const def = DEFAULT_MATRIX[role as keyof typeof DEFAULT_MATRIX].includes(body.perm);
      const value = !!body.value;
      overrides[role] = { ...(overrides[role] ?? {}) };
      if (value === def) delete overrides[role][body.perm];
      else overrides[role][body.perm] = value;
      await saveSettings(ctx, { permission_overrides: overrides });
      await audit(ctx, "settings.permission", "role", role, { perm: body.perm, value });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/settings/permissions/reset",
    handler: async ({ ctx }) => {
      ctx.require("permissions.manage");
      await saveSettings(ctx, { permission_overrides: {} });
      await audit(ctx, "settings.permission_reset", "tenant", ctx.tenantId);
      return { ok: true };
    },
  },
  {
    method: "PATCH",
    path: "/settings/policies",
    handler: async ({ ctx, body }) => {
      ctx.require("settings.manage", "Bạn không có quyền sửa chính sách.");
      const patch: Partial<TenantSettings> = {};
      if (body.quiet_hours) {
        const qh = body.quiet_hours;
        if (!hhmm(qh.from) || !hhmm(qh.to)) throw bad("Giờ yên tĩnh không hợp lệ (HH:mm).", { quiet_hours: "Định dạng HH:mm" });
        patch.quiet_hours = { enabled: !!qh.enabled, from: qh.from, to: qh.to };
      }
      if (body.ai_policy) {
        const allowed = ["L0", "L1", "L2"];
        const levels: Record<string, string> = {};
        for (const [k, v] of Object.entries(body.ai_policy.levels ?? {})) {
          if (!allowed.includes(String(v))) throw bad("Mức chính sách AI không hợp lệ.");
          // Gửi nội dung khách, đổi ca, xuất bản SOP không được tự thực hiện (tối đa L1)
          if (["CUSTOMER_MESSAGE", "CARE_MESSAGE", "SHIFT_CHANGE", "SOP_PUBLISH"].includes(k) && v === "L2")
            throw bad("Gửi nội dung khách, đổi ca và xuất bản SOP không được đặt mức tự thực hiện (L2).");
          levels[k] = String(v);
        }
        patch.ai_policy = { ...(ctx.settings.ai_policy ?? { default_level: "L1", levels: {} }), levels: { ...(ctx.settings.ai_policy?.levels ?? {}), ...levels } };
      }
      if (body.reminder_offsets_hours) {
        const arr = (body.reminder_offsets_hours as unknown[]).map(Number).filter((n) => n > 0 && n <= 168);
        if (!arr.length) throw bad("Mốc nhắc lịch không hợp lệ.");
        patch.reminder_offsets_hours = arr;
      }
      if (body.shift_min_staff) patch.shift_min_staff = { S: Number(body.shift_min_staff.S) || 0, C: Number(body.shift_min_staff.C) || 0 };
      if (body.notifications) patch.notifications = body.notifications;
      await saveSettings(ctx, patch);
      await audit(ctx, "settings.policies", "tenant", ctx.tenantId, { keys: Object.keys(patch) });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/integrations/zalo/check",
    handler: async ({ ctx }) => {
      ctx.require("integrations.manage", "Bạn không có quyền kiểm tra tích hợp.");
      const adapter = await getMessagingAdapter(ctx.tenantId);
      const h = await adapter.health();
      await q("UPDATE integrations SET health=$2, last_checked_at=now(), last_error=$3, updated_at=now() WHERE tenant_id=$1 AND provider='ZALO'", [
        ctx.tenantId,
        h.status,
        h.status === "CONNECTED" ? null : h.message,
      ]);
      await audit(ctx, "integration.check", "integration", "ZALO", { status: h.status });
      return { status: h.status, message: h.message, capabilities: adapter.capabilities(), checked_at: new Date().toISOString() };
    },
  },
  {
    method: "POST",
    path: "/integrations/zalo/mode",
    handler: async ({ ctx, body }) => {
      ctx.require("integrations.manage");
      if (body.mode === "LIVE")
        throw conflict(
          "Chưa thể bật kết nối thực tế: repo Zalo chưa được cung cấp và xác minh (README, license, cơ chế xác thực, API, giới hạn). Hệ thống giữ chế độ mô phỏng.",
        );
      await q("UPDATE integrations SET mode='DEMO', health='NOT_CONNECTED', updated_at=now() WHERE tenant_id=$1 AND provider='ZALO'", [ctx.tenantId]);
      await audit(ctx, "integration.mode", "integration", "ZALO", { mode: "DEMO" });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/integrations/zalo/disconnect",
    handler: async ({ ctx }) => {
      ctx.require("integrations.manage");
      await q("UPDATE integrations SET mode='DEMO', health='NOT_CONNECTED', credential_secret_ref=NULL, updated_at=now() WHERE tenant_id=$1 AND provider='ZALO'", [ctx.tenantId]);
      await audit(ctx, "integration.disconnect", "integration", "ZALO");
      return { ok: true, message: "Đã ngắt tích hợp. Mọi lượt gửi sẽ bị chặn cho đến khi kết nối lại." };
    },
  },
  {
    method: "GET",
    path: "/audit",
    handler: async ({ ctx, query }) => {
      ctx.require("audit.view", "Bạn không có quyền xem nhật ký hệ thống.");
      const limit = Math.min(200, Number(query.get("limit")) || 60);
      const rows = await q<any>("SELECT id, actor_label, action, resource_type, resource_id, result, detail, created_at FROM audit_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2", [ctx.tenantId, limit]);
      const jobs = await q<any>("SELECT id, type, run_at, status, result, attempts FROM jobs WHERE tenant_id=$1 ORDER BY run_at DESC LIMIT 40", [ctx.tenantId]);
      return { events: rows, jobs };
    },
  },
  {
    method: "POST",
    path: "/jobs/run-due",
    handler: async ({ ctx }) => {
      ctx.require("integrations.manage", "Bạn không có quyền chạy hàng đợi.");
      const r = await runDueJobs(ctx);
      await audit(ctx, "jobs.run_due", "jobs", null, r);
      return {
        ...r,
        message: `Đã xử lý ${r.processed} lượt: ${r.blocked} bị chặn, ${r.waiting} chờ, ${r.cancelled} hủy, ${r.sent} đã gửi.`,
      };
    },
  },
  {
    method: "POST",
    path: "/settings/simulated/seed",
    handler: async ({ ctx, body }) => {
      if (ctx.mode !== "REAL" || ctx.role !== "OWNER") throw forbidden("Chỉ chủ doanh nghiệp (tài khoản thật) được nạp dữ liệu mô phỏng.");
      if (body.confirm !== "NAP") throw bad("Cần xác nhận bằng chữ NAP.", { confirm: "Gõ NAP để xác nhận" });
      const r = await seedRealTenant(ctx.tenantId);
      if (!r.seeded) throw conflict(r.reason ?? "Không nạp được dữ liệu mô phỏng.");
      await audit(ctx, "simulated.seed", "tenant", ctx.tenantId);
      return { ok: true, message: "Đã nạp bộ DỮ LIỆU MÔ PHỎNG (2 chi nhánh, 22 nhân sự, 560 khách hư cấu)." };
    },
  },
  {
    method: "POST",
    path: "/settings/simulated/clear",
    handler: async ({ ctx, body }) => {
      if (ctx.mode !== "REAL" || ctx.role !== "OWNER") throw forbidden("Chỉ chủ doanh nghiệp (tài khoản thật) được xóa dữ liệu mô phỏng.");
      if (body.confirm !== "XOA") throw bad("Cần xác nhận bằng chữ XOA.", { confirm: "Gõ XOA để xác nhận" });
      if (!ctx.settings.simulated_data) throw conflict("Doanh nghiệp không đang dùng dữ liệu mô phỏng; không xóa để tránh mất dữ liệu thật.");
      await clearSimulatedData(ctx.tenantId);
      await audit(ctx, "simulated.clear", "tenant", ctx.tenantId);
      return { ok: true, message: "Đã xóa toàn bộ dữ liệu mô phỏng. Tài khoản chủ và một chi nhánh được giữ lại." };
    },
  },
];

export const _f = forbidden;
