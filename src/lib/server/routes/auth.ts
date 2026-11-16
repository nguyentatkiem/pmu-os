import { NextResponse } from "next/server";
import type { RouteDef } from "../router";
import { audit, rateLimit } from "../router";
import { q, one, tx } from "../db";
import { createSession, destroySession, hashPassword, SESSION_COOKIE, verifyPassword } from "../auth";
import { bad, forbidden, tooMany, unauthorized, notFound } from "../http";
import { cleanupDemoTenants, createRealTenant, seedDemoTenant, seedRealTenant } from "../seed";
import { ROLE_LABEL } from "../../shared/labels";
import { visibleCustomerIds, integrationRow } from "../domain";
import { fmtDateTime } from "../../shared/format";

function withCookie(body: unknown, token: string | null, days = 7) {
  const res = NextResponse.json(body);
  if (token)
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: days * 86400,
    });
  else res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export const routes: RouteDef[] = [
  {
    method: "POST",
    path: "/auth/login",
    public: true,
    handler: async ({ body, ip }) => {
      if (!rateLimit(`login:${ip}`, 8)) throw tooMany("Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 1 phút.");
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fe: Record<string, string> = {};
      if (!email) fe.email = "Vui lòng nhập email";
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fe.email = "Email không hợp lệ";
      if (!password) fe.password = "Vui lòng nhập mật khẩu";
      if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại thông tin đăng nhập.", fe);
      let user = await one<any>("SELECT u.*, t.mode FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE lower(u.email)=$1", [email]);
      const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
      const ownerPw = process.env.OWNER_PASSWORD;
      if (!user && ownerEmail && ownerPw && email === ownerEmail && password === ownerPw) {
        const r = await createRealTenant(email, password);
        user = await one<any>("SELECT u.*, 'REAL' AS mode FROM users u WHERE id=$1", [r.userId]);
      }
      // Thông báo lỗi chung, không tiết lộ email có tồn tại hay không
      if (!user || user.status !== "ACTIVE" || !verifyPassword(password, user.password_hash))
        throw unauthorized("Email hoặc mật khẩu không đúng. Nếu cần hỗ trợ, vui lòng liên hệ quản trị hệ thống.");
      if (user.mode === "REAL") {
        // Doanh nghiệp thật còn trống và chưa từng xóa dữ liệu mô phỏng => nạp bộ dữ liệu mô phỏng dày (Sếp chốt 16/11/2026)
        const t = await one<any>("SELECT settings, (SELECT count(*)::int FROM employees e WHERE e.tenant_id=tenants.id) AS n FROM tenants WHERE id=$1", [user.tenant_id]);
        if (t && t.n === 0 && !t.settings?.simulated_cleared && !t.settings?.simulated_seeded) await seedRealTenant(user.tenant_id).catch((e) => console.error("seed real", e));
      }
      const token = await createSession(user.tenant_id, user.id, 7);
      await audit({ tenantId: user.tenant_id, userId: user.id, actorLabel: user.display_name, selectedBranch: "all" }, "auth.login", "user", user.id);
      return withCookie({ ok: true }, token, 7);
    },
  },
  {
    method: "POST",
    path: "/auth/demo",
    public: true,
    handler: async ({ ip }) => {
      if (!rateLimit(`demo:${ip}`, 6, 10 * 60_000)) throw tooMany("Bạn đã tạo nhiều bản demo. Vui lòng thử lại sau ít phút.");
      await tx(async (qq) => cleanupDemoTenants(qq)).catch(() => {});
      const { tenantId, ownerUserId } = await seedDemoTenant();
      const token = await createSession(tenantId, ownerUserId, 3);
      await audit({ tenantId, userId: ownerUserId, actorLabel: "Chủ doanh nghiệp (demo)", selectedBranch: "all" }, "auth.demo_start", "tenant", tenantId);
      return withCookie({ ok: true }, token, 3);
    },
  },
  {
    method: "POST",
    path: "/auth/logout",
    public: true,
    handler: async ({ req }) => {
      await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
      return withCookie({ ok: true }, null);
    },
  },
  {
    method: "POST",
    path: "/auth/forgot",
    public: true,
    handler: async ({ body, ip }) => {
      if (!rateLimit(`forgot:${ip}`, 5)) throw tooMany();
      const email = String(body.email ?? "").trim();
      if (!email) throw bad("Vui lòng nhập email.", { email: "Vui lòng nhập email" });
      return {
        ok: true,
        message:
          "Hệ thống chưa cấu hình gửi email khôi phục. Vui lòng liên hệ quản trị hệ thống của DOANH NGHIỆP PMU để được cấp lại mật khẩu.",
      };
    },
  },
  {
    method: "POST",
    path: "/auth/change-password",
    handler: async ({ ctx, body, ip }) => {
      if (!rateLimit(`pw:${ip}`, 5)) throw tooMany();
      if (ctx.mode === "DEMO") throw forbidden("Tài khoản demo không dùng mật khẩu.");
      if (ctx.userId !== ctx.loginUserId) throw forbidden();
      const u = await one<any>("SELECT password_hash FROM users WHERE id=$1", [ctx.loginUserId]);
      const cur = String(body.current ?? "");
      const next = String(body.next ?? "");
      const fe: Record<string, string> = {};
      if (!verifyPassword(cur, u?.password_hash)) fe.current = "Mật khẩu hiện tại không đúng";
      if (next.length < 10) fe.next = "Mật khẩu mới tối thiểu 10 ký tự";
      else if (next === cur) fe.next = "Mật khẩu mới phải khác mật khẩu hiện tại";
      if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại các trường được đánh dấu.", fe);
      await q("UPDATE users SET password_hash=$2, updated_at=now(), version=version+1 WHERE id=$1", [ctx.loginUserId, hashPassword(next)]);
      await q("DELETE FROM sessions WHERE user_id=$1 AND id<>$2", [ctx.loginUserId, ctx.sessionId]);
      await audit(ctx, "auth.change_password", "user", ctx.loginUserId);
      return { ok: true, message: "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất." };
    },
  },
  {
    method: "GET",
    path: "/me",
    handler: async ({ ctx }) => {
      const branches = await q<any>("SELECT id, name FROM branches WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY created_at", [ctx.tenantId]);
      const personas =
        ctx.mode === "DEMO"
          ? await q<any>(
              `SELECT u.id, u.display_name, m.role FROM users u JOIN memberships m ON m.user_id=u.id
                WHERE u.tenant_id=$1 AND u.is_demo_persona AND u.status='ACTIVE' ORDER BY
                  CASE m.role WHEN 'OWNER' THEN 0 WHEN 'BRANCH_MANAGER' THEN 1 WHEN 'SYSTEM_ADMIN' THEN 9 ELSE 2 END, u.display_name`,
              [ctx.tenantId],
            )
          : [];
      const integ = await integrationRow(ctx.tenantId);
      return {
        user: { id: ctx.userId, name: ctx.userName, role: ctx.role, role_label: ROLE_LABEL[ctx.role], employee_id: ctx.employeeId },
        login_user_id: ctx.loginUserId,
        tenant: { id: ctx.tenantId, name: ctx.tenantName, mode: ctx.mode, now: ctx.now().toISOString() },
        branches: branches.filter((b) => ctx.allowedBranchIds.includes(b.id)),
        all_branches_allowed: ctx.allowedBranchIds.length === branches.length,
        perms: [...ctx.perms],
        personas: personas.map((p) => ({ ...p, role_label: ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] })),
        integration: { provider: "ZALO", health: integ.health, mode: integ.mode },
        settings: { quiet_hours: ctx.settings.quiet_hours },
        simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data,
      };
    },
  },
  {
    method: "POST",
    path: "/demo/switch",
    handler: async ({ ctx, body }) => {
      if (ctx.mode !== "DEMO") throw forbidden("Chỉ dùng được trong chế độ demo.");
      const target = await one<any>("SELECT u.id FROM users u WHERE u.id=$1 AND u.tenant_id=$2 AND u.is_demo_persona", [body.user_id, ctx.tenantId]);
      if (!target) throw notFound("Không tìm thấy vai trò demo.");
      await q("UPDATE sessions SET acting_user_id=$2 WHERE id=$1", [ctx.sessionId, target.id === ctx.loginUserId ? null : target.id]);
      await audit(ctx, "demo.switch_role", "user", target.id);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/demo/reset",
    handler: async ({ ctx, req }) => {
      if (ctx.mode !== "DEMO") throw forbidden("Chỉ đặt lại được dữ liệu trong chế độ demo.");
      const old = ctx.tenantId;
      const { tenantId, ownerUserId } = await seedDemoTenant();
      const token = await createSession(tenantId, ownerUserId, 3);
      await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
      await q("DELETE FROM tenants WHERE id=$1 AND mode='DEMO'", [old]);
      return withCookie({ ok: true }, token, 3);
    },
  },
  {
    method: "GET",
    path: "/search",
    handler: async ({ ctx, query }) => {
      const term = (query.get("q") ?? "").trim();
      if (term.length < 1) return { results: [] };
      const like = `%${term.toLowerCase()}%`;
      const results: any[] = [];
      if (ctx.can("people.view")) {
        const r = await q<any>("SELECT id, display_name FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND lower(display_name) LIKE $3 LIMIT 5", [ctx.tenantId, ctx.branchFilter, like]);
        r.forEach((x) => results.push({ type: "Nhân sự", label: x.display_name, href: `/people?open=${x.id}` }));
      }
      const ids = await visibleCustomerIds(ctx);
      if (ids.length) {
        const r = await q<any>("SELECT id, display_name, code FROM customers WHERE id = ANY($1) AND (lower(display_name) LIKE $2 OR lower(code) LIKE $2) LIMIT 5", [ids, like]);
        r.forEach((x) => results.push({ type: "Khách hàng", label: x.display_name, href: `/customers/${x.id}` }));
      }
      const owner = ctx.can("tasks.view_all") ? null : ctx.employeeId;
      if (ctx.can("tasks.view_all") || ctx.employeeId) {
        const r = await q<any>(
          "SELECT id, code, title FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND (lower(title) LIKE $3 OR lower(code) LIKE $3) AND ($4::uuid IS NULL OR owner_id=$4::uuid) LIMIT 5",
          [ctx.tenantId, ctx.branchFilter, like, owner],
        );
        r.forEach((x) => results.push({ type: "Công việc", label: `${x.code} · ${x.title}`, href: `/tasks?open=${x.id}` }));
      }
      if (ctx.can("knowledge.view")) {
        const r = await q<any>("SELECT id, title FROM sop_documents WHERE tenant_id=$1 AND lower(title) LIKE $2 LIMIT 5", [ctx.tenantId, like]);
        r.forEach((x) => results.push({ type: "SOP", label: x.title, href: `/knowledge?doc=${x.id}` }));
      }
      return { results };
    },
  },
  {
    method: "GET",
    path: "/notifications",
    handler: async ({ ctx }) => {
      const now = ctx.now();
      const items: any[] = [];
      const owner = ctx.can("tasks.view_all") ? null : ctx.employeeId;
      if (ctx.can("tasks.view_all") || ctx.employeeId) {
        const od = await q<any>(
          `SELECT id, code, title, due_at FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND status IN ('TODO','IN_PROGRESS','SUBMITTED')
             AND due_at < $3 AND ($4::uuid IS NULL OR owner_id=$4::uuid)`,
          [ctx.tenantId, ctx.branchFilter, now, owner],
        );
        od.forEach((t) => items.push({ tone: "danger", title: `Quá hạn: ${t.title}`, detail: `${t.code} · hạn ${fmtDateTime(t.due_at)}`, href: `/tasks?open=${t.id}` }));
        const sub = ctx.can("tasks.review")
          ? await q<any>("SELECT id, code, title FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND status='SUBMITTED'", [ctx.tenantId, ctx.branchFilter])
          : [];
        sub.forEach((t) => items.push({ tone: "info", title: `Chờ duyệt kết quả: ${t.title}`, detail: t.code, href: `/tasks?open=${t.id}` }));
      }
      if (ctx.can("approvals.view")) {
        const n = await one<any>("SELECT count(*)::int AS n FROM ai_proposals WHERE tenant_id=$1 AND status='PENDING' AND (branch_id IS NULL OR branch_id = ANY($2))", [ctx.tenantId, ctx.allowedBranchIds]);
        if (n?.n) items.push({ tone: "warn", title: `${n.n} đề xuất đang chờ duyệt`, detail: "Hộp phê duyệt", href: "/approvals" });
      }
      if (ctx.can("inbox.view")) {
        const ids = await visibleCustomerIds(ctx);
        const n = await one<any>("SELECT count(*)::int AS n FROM conversations WHERE tenant_id=$1 AND customer_id = ANY($2) AND status='NEW'", [ctx.tenantId, ids]);
        if (n?.n) items.push({ tone: "info", title: `${n.n} hội thoại chưa xử lý`, detail: "Hội thoại & Zalo", href: "/inbox" });
      }
      if (ctx.can("appointments.view_all") || ctx.can("integrations.manage")) {
        const n = await one<any>("SELECT count(*)::int AS n FROM jobs WHERE tenant_id=$1 AND status='BLOCKED' AND run_at >= $2", [ctx.tenantId, new Date(now.getTime() - 86400000)]);
        if (n?.n) items.push({ tone: "warn", title: `${n.n} lượt nhắc bị chặn`, detail: "Zalo chưa kết nối — cần nhắc thủ công", href: "/settings?tab=log" });
      }
      return { items };
    },
  },
];
