import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid } from "../db";
import { bad, checkVersion, conflict, forbidden, notFound, parseIso, requireFields, str } from "../http";
import { getEmployee, lockEmployee, shiftConflicts } from "../domain";
import { analyzeWeek } from "../ai";
import { createProposal } from "../proposals";
import { addDays, vnDayKey, vnToDate, weekStart, fmtRange, fmtDate } from "../../shared/format";

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/shifts",
    handler: async ({ ctx, query }) => {
      const viewAll = ctx.can("shifts.view_all");
      if (!viewAll && !ctx.employeeId) throw forbidden("Tài khoản không gắn hồ sơ nhân sự nên không có lịch làm việc.");
      const ws = weekStart(query.get("week") && /^\d{4}-\d{2}-\d{2}$/.test(query.get("week")!) ? query.get("week")! : vnDayKey(ctx.now()));
      const from = vnToDate(ws);
      const to = vnToDate(addDays(ws, 7));
      const emps = await q<any>(
        `SELECT id, code, display_name, position, active, availability FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2)
           AND ($3::uuid IS NULL OR id=$3::uuid) ORDER BY active DESC, code`,
        [ctx.tenantId, ctx.branchFilter, viewAll ? null : ctx.employeeId],
      );
      const empIds = emps.map((e) => e.id);
      const shifts = await q<any>(
        "SELECT id, employee_id, start_at, end_at, status, note, version FROM shifts WHERE tenant_id=$1 AND employee_id = ANY($2) AND status <> 'CANCELLED' AND start_at >= $3 AND start_at < $4 ORDER BY start_at",
        [ctx.tenantId, empIds, from, to],
      );
      const leaves = await q<any>("SELECT employee_id, start_at, end_at, reason FROM leaves WHERE tenant_id=$1 AND employee_id = ANY($2) AND start_at < $4 AND end_at > $3", [ctx.tenantId, empIds, from, to]);
      const appts = await q<any>(
        "SELECT employee_id, start_at FROM appointments WHERE tenant_id=$1 AND employee_id = ANY($2) AND status IN ('PENDING','CONFIRMED','ARRIVED','COMPLETED') AND start_at >= $3 AND start_at < $4",
        [ctx.tenantId, empIds, from, to],
      );
      const analysis = viewAll ? await analyzeWeek(ctx, ws) : { conflicts: [], gaps: [], suggestions: [] };
      const pending = await q<any>(
        "SELECT id, code, action_type, target_id, proposed_payload, status FROM ai_proposals WHERE tenant_id=$1 AND action_type LIKE 'SHIFT_%' AND status='PENDING'",
        [ctx.tenantId],
      );
      for (const s of analysis.suggestions as any[]) {
        const hit = pending.find(
          (p) =>
            p.action_type === s.action_type &&
            ((s.target_id && p.target_id === s.target_id) ||
              (!s.target_id && p.proposed_payload?.employee_id === s.payload.employee_id && p.proposed_payload?.start_at === s.payload.start_at)),
        );
        s.pending_proposal = hit ? { id: hit.id, code: hit.code } : null;
      }
      return {
        week_start: ws,
        days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)),
        employees: emps,
        shifts,
        leaves,
        appointment_counts: appts.reduce((acc: Record<string, number>, a) => {
          const k = `${a.employee_id}:${vnDayKey(a.start_at)}`;
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        ...analysis,
        pending_shift_proposals: pending.map((p) => ({ id: p.id, code: p.code, action_type: p.action_type, target_id: p.target_id })),
        templates: ctx.settings.shift_templates,
        min_staff: ctx.settings.shift_min_staff,
        can_manage: ctx.can("shifts.manage"),
        view_all: viewAll,
      };
    },
  },
  {
    method: "POST",
    path: "/shifts/check",
    handler: async ({ ctx, body }) => {
      ctx.require("shifts.manage");
      requireFields(body, { employee_id: "Nhân sự", start_at: "Bắt đầu", end_at: "Kết thúc" });
      await getEmployee(ctx, body.employee_id);
      const start = parseIso(body.start_at, "Thời gian bắt đầu", "start_at");
      const end = parseIso(body.end_at, "Thời gian kết thúc", "end_at");
      if (end <= start) throw bad("Thời điểm kết thúc phải sau thời điểm bắt đầu.", { end_at: "Phải sau thời điểm bắt đầu" });
      return { conflicts: await shiftConflicts(q, ctx.tenantId, body.employee_id, start, end, body.exclude_id ?? null) };
    },
  },
  {
    method: "POST",
    path: "/shifts",
    handler: async ({ ctx, body }) => {
      ctx.require("shifts.manage", "Bạn không có quyền tạo ca.");
      requireFields(body, { employee_id: "Nhân sự", start_at: "Bắt đầu", end_at: "Kết thúc" });
      const emp = await getEmployee(ctx, body.employee_id);
      if (!emp.active) throw bad("Nhân sự đã ngừng hoạt động.", { employee_id: "Nhân sự không còn hoạt động" });
      const start = parseIso(body.start_at, "Thời gian bắt đầu", "start_at");
      const end = parseIso(body.end_at, "Thời gian kết thúc", "end_at");
      if (end <= start) throw bad("Thời điểm kết thúc phải sau thời điểm bắt đầu.", { end_at: "Phải sau thời điểm bắt đầu" });
      const id = await tx(async (qq) => {
        await lockEmployee(qq, emp.id);
        const c = await shiftConflicts(qq, ctx.tenantId, emp.id, start, end, null);
        if (c.length) throw conflict("Ca bị xung đột, chưa được lưu.", { conflicts: c });
        const id = uid();
        await qq(
          "INSERT INTO shifts (id, tenant_id, branch_id, employee_id, start_at, end_at, status, approved_by, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,'APPROVED',$7,$8,$9)",
          [id, ctx.tenantId, emp.branch_id, emp.id, start, end, ctx.userId, str(body.note, 200) || null, ctx.now()],
        );
        await audit(ctx, "shift.create", "shift", id, { employee: emp.display_name, range: `${fmtRange(start, end)} ${fmtDate(start)}` }, "OK", qq);
        return id;
      });
      return { id };
    },
  },
  {
    method: "PATCH",
    path: "/shifts/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("shifts.manage", "Bạn không có quyền đổi ca.");
      return tx(async (qq) => {
        const s = (await qq<any>("SELECT * FROM shifts WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3) FOR UPDATE", [params.id, ctx.tenantId, ctx.allowedBranchIds]))[0];
        if (!s) throw notFound("Không tìm thấy ca.");
        checkVersion(s.version, body.expected_version);
        const empId = body.employee_id ?? s.employee_id;
        if (empId !== s.employee_id) await getEmployee(ctx, empId, qq);
        const start = body.start_at ? parseIso(body.start_at, "Bắt đầu", "start_at") : new Date(s.start_at);
        const end = body.end_at ? parseIso(body.end_at, "Kết thúc", "end_at") : new Date(s.end_at);
        if (end <= start) throw bad("Thời điểm kết thúc phải sau thời điểm bắt đầu.", { end_at: "Phải sau thời điểm bắt đầu" });
        await lockEmployee(qq, empId);
        const c = await shiftConflicts(qq, ctx.tenantId, empId, start, end, s.id);
        if (c.length) throw conflict("Ca bị xung đột, chưa được lưu.", { conflicts: c });
        await qq(
          "UPDATE shifts SET employee_id=$2, start_at=$3, end_at=$4, status='APPROVED', approved_by=$5, updated_at=now(), version=version+1 WHERE id=$1",
          [s.id, empId, start, end, ctx.userId],
        );
        await audit(ctx, "shift.update", "shift", s.id, { range: `${fmtRange(start, end)} ${fmtDate(start)}` }, "OK", qq);
        return { ok: true };
      });
    },
  },
  {
    method: "DELETE",
    path: "/shifts/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("shifts.manage", "Bạn không có quyền hủy ca.");
      const s = await one<any>("SELECT * FROM shifts WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3)", [params.id, ctx.tenantId, ctx.allowedBranchIds]);
      if (!s) throw notFound("Không tìm thấy ca.");
      const appts = await one<any>(
        "SELECT count(*)::int AS n FROM appointments WHERE employee_id=$1 AND status IN ('PENDING','CONFIRMED') AND start_at >= $2 AND end_at <= $3",
        [s.employee_id, s.start_at, s.end_at],
      );
      if (appts?.n) throw conflict(`Ca đang có ${appts.n} lịch hẹn. Hãy đổi người phụ trách lịch hẹn trước khi hủy ca.`);
      await q("UPDATE shifts SET status='CANCELLED', updated_at=now(), version=version+1 WHERE id=$1", [s.id]);
      await audit(ctx, "shift.cancel", "shift", s.id);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/shifts/propose",
    handler: async ({ ctx, body }) => {
      ctx.require("shifts.manage", "Bạn không có quyền gửi đề xuất ca.");
      const ws = weekStart(String(body.week ?? vnDayKey(ctx.now())));
      const analysis = await analyzeWeek(ctx, ws);
      const keys: string[] = Array.isArray(body.keys) ? body.keys : analysis.suggestions.map((s: any) => s.key);
      const created: any[] = [];
      const skipped: string[] = [];
      for (const key of keys) {
        const s: any = analysis.suggestions.find((x: any) => x.key === key);
        if (!s) {
          skipped.push(key);
          continue;
        }
        try {
          const target = s.target_id ? await one<any>("SELECT version FROM shifts WHERE id=$1", [s.target_id]) : null;
          const r = await createProposal(ctx, {
            action_type: s.action_type,
            summary: s.detail,
            payload: s.payload,
            reason: s.reason,
            source_refs: [{ type: "module", id: null, label: `Lịch làm việc tuần ${fmtDate(vnToDate(ws))}`, href: `/shifts?week=${ws}` }],
            requested_label: "AI Assistant (đề xuất phân ca)",
            target_type: s.target_id ? "shift" : null,
            target_id: s.target_id,
            target_version: target?.version ?? null,
            before: s.action_type === "SHIFT_ADJUST" ? { note: "Ca chưa duyệt đang trùng" } : { note: "Ca đang thiếu nhân sự" },
            after: { note: s.detail },
          });
          created.push(r);
        } catch (e: any) {
          skipped.push(e?.message ?? key);
        }
      }
      return { created, skipped, message: created.length ? `Đã gửi ${created.length} đề xuất tới hộp phê duyệt. Lịch chưa thay đổi cho đến khi được duyệt.` : "Không có đề xuất mới được gửi." };
    },
  },
];
