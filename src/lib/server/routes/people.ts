import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid, j } from "../db";
import { bad, checkVersion, conflict, forbidden, notFound, requireFields, str } from "../http";
import { getEmployee } from "../domain";
import { POSITION_TO_ROLE, POSITION_LABEL } from "../../shared/labels";
import { addDays, vnDayKey, vnToDate, weekStart } from "../../shared/format";

const POSITIONS = Object.keys(POSITION_LABEL);

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/people",
    handler: async ({ ctx, query }) => {
      ctx.require("people.view", "Bạn không có quyền xem danh sách nhân sự.");
      const term = (query.get("q") ?? "").trim().toLowerCase();
      const pos = query.get("position");
      const today = vnDayKey(ctx.now());
      const rows = await q<any>(
        `SELECT e.*, b.name AS branch_name, u.email, u.status AS user_status,
            (SELECT json_agg(json_build_object('start_at', s.start_at, 'end_at', s.end_at) ORDER BY s.start_at) FROM shifts s
              WHERE s.employee_id=e.id AND s.status='APPROVED' AND s.start_at >= $3 AND s.start_at < $4) AS today_shifts,
            (SELECT count(*)::int FROM tasks t WHERE t.owner_id=e.id AND t.status IN ('TODO','IN_PROGRESS','SUBMITTED')) AS open_tasks
           FROM employees e JOIN branches b ON b.id=e.branch_id LEFT JOIN users u ON u.id=e.user_id
          WHERE e.tenant_id=$1 AND e.branch_id = ANY($2)
            AND ($5 = '' OR lower(e.display_name) LIKE '%' || $5 || '%' OR lower(e.code) = $5)
            AND ($6::text IS NULL OR e.position = $6)
          ORDER BY e.active DESC, e.code`,
        [ctx.tenantId, ctx.branchFilter, vnToDate(today), vnToDate(addDays(today, 1)), term, pos || null],
      );
      const counts = await q<any>(
        "SELECT position, count(*)::int AS n FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active GROUP BY position",
        [ctx.tenantId, ctx.branchFilter],
      );
      return {
        items: rows.map((r) => ({ ...r, contact_phone: undefined })),
        counts: Object.fromEntries(counts.map((c) => [c.position, c.n])),
        can_manage: ctx.can("people.manage"),
      };
    },
  },
  {
    method: "GET",
    path: "/people/:id",
    handler: async ({ ctx, params }) => {
      if (!ctx.can("people.view") && params.id !== ctx.employeeId) throw forbidden("Bạn chỉ xem được hồ sơ của chính mình.");
      const e = await getEmployee(ctx, params.id);
      const branch = await one<any>("SELECT name FROM branches WHERE id=$1", [e.branch_id]);
      const user = e.user_id ? await one<any>("SELECT email, status FROM users WHERE id=$1", [e.user_id]) : null;
      const role = e.user_id ? await one<any>("SELECT role FROM memberships WHERE user_id=$1", [e.user_id]) : null;
      const today = vnDayKey(ctx.now());
      const ws = weekStart(today);
      const shifts = await q<any>(
        "SELECT id, start_at, end_at, status FROM shifts WHERE employee_id=$1 AND status <> 'CANCELLED' AND start_at >= $2 AND start_at < $3 ORDER BY start_at",
        [e.id, vnToDate(today), vnToDate(addDays(ws, 14))],
      );
      const tasks = await q<any>(
        `SELECT id, code, title, status, due_at FROM tasks WHERE owner_id=$1 AND status <> 'CANCELLED'
          ORDER BY (status IN ('TODO','IN_PROGRESS','SUBMITTED')) DESC, due_at DESC LIMIT 8`,
        [e.id],
      );
      const leaves = await q<any>("SELECT start_at, end_at, reason FROM leaves WHERE employee_id=$1 AND end_at >= $2 ORDER BY start_at", [e.id, ctx.now()]);
      const learning = await q<any>(
        `SELECT la.status, la.score, la.total, d.title, v.version_label FROM learning_assignments la JOIN sop_versions v ON v.id=la.sop_version_id
           JOIN sop_documents d ON d.id=v.document_id WHERE la.employee_id=$1`,
        [e.id],
      );
      return {
        employee: { ...e, contact_phone: ctx.can("people.manage") || params.id === ctx.employeeId ? e.contact_phone : null },
        branch_name: branch?.name,
        account: user ? { email: user.email, status: user.status, role: role?.role } : null,
        shifts,
        tasks,
        leaves,
        learning,
        can_manage: ctx.can("people.manage"),
      };
    },
  },
  {
    method: "POST",
    path: "/people",
    handler: async ({ ctx, body }) => {
      ctx.require("people.manage", "Bạn không có quyền thêm nhân sự.");
      requireFields(body, { display_name: "Tên nhân sự", position: "Vị trí", branch_id: "Chi nhánh" });
      if (!POSITIONS.includes(body.position)) throw bad("Vị trí không hợp lệ.", { position: "Chọn vị trí trong danh sách" });
      if (!ctx.allowedBranchIds.includes(body.branch_id)) throw forbidden("Bạn không quản lý chi nhánh này.");
      const name = str(body.display_name, 80);
      const exists = await one<any>("SELECT id FROM employees WHERE tenant_id=$1 AND lower(display_name)=lower($2)", [ctx.tenantId, name]);
      if (exists) throw conflict("Đã có nhân sự cùng tên trong doanh nghiệp.", { field: "display_name" });
      const codeRow = await one<any>("SELECT count(*)::int AS n FROM employees WHERE tenant_id=$1", [ctx.tenantId]);
      const id = uid();
      const skills = Array.isArray(body.skills) ? body.skills.map((s: unknown) => str(s, 60)).filter(Boolean) : [];
      await q(
        `INSERT INTO employees (id, tenant_id, branch_id, code, display_name, position, skills, availability, work_status, contact_phone, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'AVAILABLE',$9,$10)`,
        [id, ctx.tenantId, body.branch_id, `NS${(codeRow?.n ?? 0) + 1}`, name, body.position, skills, j({ days: body.days ?? [1, 2, 3, 4, 5, 6], slots: body.slots ?? ["S", "C"] }), str(body.contact_phone, 20) || null, ctx.now()],
      );
      await audit(ctx, "people.create", "employee", id, { name });
      return { id };
    },
  },
  {
    method: "PATCH",
    path: "/people/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("people.manage", "Bạn không có quyền sửa hồ sơ nhân sự.");
      const e = await getEmployee(ctx, params.id);
      checkVersion(e.version, body.expected_version);
      const fe: Record<string, string> = {};
      const name = body.display_name !== undefined ? str(body.display_name, 80) : e.display_name;
      if (!name) fe.display_name = "Tên nhân sự là bắt buộc";
      const position = body.position ?? e.position;
      if (!POSITIONS.includes(position)) fe.position = "Vị trí không hợp lệ";
      if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại các trường.", fe);
      const skills = Array.isArray(body.skills) ? body.skills.map((s: unknown) => str(s, 60)).filter(Boolean) : e.skills;
      const availability = body.availability ?? e.availability;
      const ws = body.work_status ?? e.work_status;
      await q(
        `UPDATE employees SET display_name=$2, position=$3, skills=$4, availability=$5::jsonb, work_status=$6, updated_at=now(), version=version+1 WHERE id=$1`,
        [e.id, name, position, skills, j(availability), ws],
      );
      if (position !== e.position && e.user_id)
        await q("UPDATE memberships SET role=$2, updated_at=now(), version=version+1 WHERE user_id=$1 AND role <> 'OWNER'", [e.user_id, POSITION_TO_ROLE[position]]);
      await audit(ctx, "people.update", "employee", e.id, { fields: Object.keys(body).filter((k) => k !== "expected_version") });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/people/:id/invite",
    handler: async ({ ctx, params, body }) => {
      ctx.require("people.manage", "Bạn không có quyền mời thành viên.");
      const e = await getEmployee(ctx, params.id);
      const email = str(body.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("Email không hợp lệ.", { email: "Email không hợp lệ" });
      if (e.user_id) throw conflict("Nhân sự này đã có tài khoản.");
      const dup = await one<any>("SELECT id FROM users WHERE lower(email)=$1", [email]);
      if (dup) throw conflict("Email đã được dùng cho một tài khoản khác.", { field: "email" });
      const userId = uid();
      await tx(async (qq) => {
        await qq("INSERT INTO users (id, tenant_id, email, display_name, status) VALUES ($1,$2,$3,$4,'INVITED')", [userId, ctx.tenantId, email, e.display_name]);
        await qq("INSERT INTO memberships (id, tenant_id, user_id, role, branch_ids, employee_id) VALUES ($1,$2,$3,$4,$5,$6)", [uid(), ctx.tenantId, userId, POSITION_TO_ROLE[e.position], [e.branch_id], e.id]);
        await qq("UPDATE employees SET user_id=$2, updated_at=now(), version=version+1 WHERE id=$1", [e.id, userId]);
      });
      await audit(ctx, "people.invite", "employee", e.id, { email });
      return {
        ok: true,
        message: "Đã tạo lời mời ở trạng thái “Đã mời”. Hệ thống chưa cấu hình gửi email nên lời mời chưa được gửi tự động; quản trị cần trao đổi trực tiếp với nhân sự.",
      };
    },
  },
  {
    method: "POST",
    path: "/people/:id/deactivate",
    handler: async ({ ctx, params, body }) => {
      ctx.require("people.manage", "Bạn không có quyền ngừng truy cập.");
      const e = await getEmployee(ctx, params.id);
      if (e.id === ctx.employeeId) throw forbidden("Không thể tự ngừng truy cập tài khoản của mình.");
      const reason = str(body.reason, 300);
      if (!reason) throw bad("Vui lòng nhập lý do ngừng truy cập.", { reason: "Bắt buộc" });
      const open = await one<any>("SELECT count(*)::int AS n FROM tasks WHERE owner_id=$1 AND status IN ('TODO','IN_PROGRESS','SUBMITTED')", [e.id]);
      await tx(async (qq) => {
        await qq("UPDATE employees SET active=false, updated_at=now(), version=version+1 WHERE id=$1", [e.id]);
        if (e.user_id) {
          await qq("UPDATE users SET status='DISABLED', updated_at=now(), version=version+1 WHERE id=$1", [e.user_id]);
          await qq("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [e.user_id]);
        }
      });
      await audit(ctx, "people.deactivate", "employee", e.id, { reason });
      return { ok: true, open_tasks: open?.n ?? 0, message: open?.n ? `Nhân sự còn ${open.n} công việc đang mở, cần giao lại.` : "Đã ngừng truy cập." };
    },
  },
  {
    method: "POST",
    path: "/people/:id/activate",
    handler: async ({ ctx, params }) => {
      ctx.require("people.manage");
      const e = await getEmployee(ctx, params.id);
      await q("UPDATE employees SET active=true, updated_at=now(), version=version+1 WHERE id=$1", [e.id]);
      if (e.user_id) await q("UPDATE users SET status='ACTIVE', updated_at=now() WHERE id=$1 AND status='DISABLED'", [e.user_id]);
      await audit(ctx, "people.activate", "employee", e.id);
      return { ok: true };
    },
  },
];

export const _nf = notFound;
