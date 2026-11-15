import { NextResponse } from "next/server";
import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, uid } from "../db";
import { bad, forbidden } from "../http";
import type { Ctx } from "../auth";
import { computeMetric } from "../metrics";
import { METRIC_DEFS, ROLE_METRICS } from "../../shared/metrics";
import { addDays, fmtDate, fmtDateTime, vnDayKey, vnToDate, weekStart } from "../../shared/format";
import { POSITION_LABEL } from "../../shared/labels";

function period(ctx: Ctx, fromQ: string | null, toQ: string | null) {
  const today = vnDayKey(ctx.now());
  const ws = weekStart(today);
  const from = fromQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) ? fromQ : ws;
  const to = toQ && /^\d{4}-\d{2}-\d{2}$/.test(toQ) ? toQ : addDays(ws, 6);
  if (to < from) throw bad("Kỳ không hợp lệ: ngày kết thúc trước ngày bắt đầu.");
  return { from, to, fromD: vnToDate(from), toD: vnToDate(addDays(to, 1)) };
}

async function build(ctx: Ctx, role: string, from: Date, to: Date) {
  const viewAll = ctx.can("performance.view_all");
  if (!viewAll && !ctx.employeeId) throw forbidden("Tài khoản không gắn hồ sơ nhân sự.");
  const emps = await q<any>(
    `SELECT id, user_id, branch_id, display_name, position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active
       AND position=$3 AND ($4::uuid IS NULL OR id=$4::uuid) ORDER BY code`,
    [ctx.tenantId, ctx.branchFilter, role, viewAll ? null : ctx.employeeId],
  );
  const codes = ROLE_METRICS[role] ?? [];
  const now = ctx.now();
  const rows = [];
  for (const e of emps) {
    const metrics: Record<string, any> = {};
    for (const c of codes) metrics[c] = await computeMetric(c, e, ctx.tenantId, from, to, now);
    const note = (await q<any>("SELECT body, author_label, created_at FROM support_notes WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 1", [e.id]))[0];
    rows.push({ employee: { id: e.id, name: e.display_name }, metrics, note: note ?? null });
  }
  const totals: Record<string, any> = {};
  for (const c of codes) {
    const def = METRIC_DEFS[c];
    if (def.unit === "minutes") {
      const samples = rows.map((r) => r.metrics[c]).filter((m: any) => m.den > 0);
      const n = samples.reduce((s: number, m: any) => s + m.den, 0);
      const vals = samples.map((m: any) => m.value).sort((a: number, b: number) => a - b);
      totals[c] = { num: vals.length ? vals[Math.floor(vals.length / 2)] : 0, den: n, value: vals.length ? vals[Math.floor(vals.length / 2)] : null, note: "Trung vị của trung vị từng nhân sự" };
    } else {
      const num = rows.reduce((s, r) => s + r.metrics[c].num, 0);
      const den = rows.reduce((s, r) => s + r.metrics[c].den, 0);
      totals[c] = { num, den, value: den ? (num / den) * 100 : null };
    }
  }
  return { rows, totals, codes };
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/performance",
    handler: async ({ ctx, query }) => {
      const p = period(ctx, query.get("from"), query.get("to"));
      let role = query.get("role") ?? "CONSULTANT";
      if (!ctx.can("performance.view_all")) {
        const me = (await q<any>("SELECT position FROM employees WHERE id=$1", [ctx.employeeId]))[0];
        role = me?.position ?? role;
      }
      if (!ROLE_METRICS[role]) throw bad("Vai trò không hợp lệ.");
      const { rows, totals, codes } = await build(ctx, role, p.fromD, p.toD);
      // Tín hiệu cần hỗ trợ: có nguồn, không xếp hạng
      const now = ctx.now();
      const insights: any[] = [];
      for (const r of rows) {
        const od = await q<any>(
          "SELECT id, code, title, due_at FROM tasks WHERE owner_id=$1 AND status IN ('TODO','IN_PROGRESS','SUBMITTED') AND due_at < $2",
          [r.employee.id, now],
        );
        const open = await q<any>("SELECT count(*)::int AS n FROM tasks WHERE owner_id=$1 AND status IN ('TODO','IN_PROGRESS','SUBMITTED')", [r.employee.id]);
        if (od.length)
          insights.push({
            employee_id: r.employee.id,
            text: `${r.employee.name} còn ${open[0].n} công việc đang mở, trong đó ${od.length} việc quá hạn. Kiểm tra nguồn trước khi đánh giá.`,
            sources: od.map((t: any) => ({ label: `Công việc #${t.code}`, href: `/tasks?open=${t.id}` })),
          });
        const lc = await q<any>("SELECT count(*)::int AS n FROM learning_assignments WHERE employee_id=$1 AND status='ASSIGNED'", [r.employee.id]);
        if (lc[0].n) insights.push({ employee_id: r.employee.id, text: `${r.employee.name} còn ${lc[0].n} bài học SOP chưa làm.`, sources: [{ label: "SOP & đào tạo", href: "/knowledge" }] });
      }
      const roles = ctx.can("performance.view_all")
        ? (await q<any>("SELECT DISTINCT position FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active", [ctx.tenantId, ctx.branchFilter])).map((r) => r.position)
        : [role];
      return {
        role,
        role_label: POSITION_LABEL[role],
        roles: Object.keys(ROLE_METRICS).filter((r) => roles.includes(r)),
        from: p.from,
        to: p.to,
        defs: Object.fromEntries(codes.map((c) => [c, METRIC_DEFS[c]])),
        codes,
        totals,
        rows,
        insights,
        computed_at: now.toISOString(),
        can_note: ctx.can("performance.view_all"),
        can_export: ctx.can("performance.export"),
      };
    },
  },
  {
    method: "POST",
    path: "/performance/notes",
    handler: async ({ ctx, body }) => {
      ctx.require("performance.view_all", "Chỉ quản lý được ghi chú hỗ trợ.");
      const text = String(body.body ?? "").trim().slice(0, 1000);
      if (!text) throw bad("Vui lòng nhập ghi chú.", { body: "Bắt buộc" });
      const e = (await q<any>("SELECT id FROM employees WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3)", [body.employee_id, ctx.tenantId, ctx.allowedBranchIds]))[0];
      if (!e) throw bad("Chọn nhân sự cần ghi chú.", { employee_id: "Bắt buộc" });
      await q("INSERT INTO support_notes (id, tenant_id, employee_id, author_id, author_label, period, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
        uid(),
        ctx.tenantId,
        e.id,
        ctx.userId,
        ctx.actorLabel,
        body.period ?? null,
        text,
        ctx.now(),
      ]);
      await audit(ctx, "performance.note", "employee", e.id);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "/performance/export",
    handler: async ({ ctx, query }) => {
      ctx.require("performance.export", "Bạn không có quyền xuất báo cáo KPI.");
      const p = period(ctx, query.get("from"), query.get("to"));
      const role = query.get("role") ?? "CONSULTANT";
      if (!ROLE_METRICS[role]) throw bad("Vai trò không hợp lệ.");
      const { rows, codes } = await build(ctx, role, p.fromD, p.toD);
      const head = ["Nhân sự", ...codes.flatMap((c) => [`${METRIC_DEFS[c].label} (tử số)`, `${METRIC_DEFS[c].label} (mẫu số)`, `${METRIC_DEFS[c].label} (giá trị)`]), "Trạng thái"];
      const lines = [head];
      for (const r of rows)
        lines.push([
          r.employee.name,
          ...codes.flatMap((c) => {
            const m = r.metrics[c];
            return [String(m.num), String(m.den), m.value === null ? "Chưa đủ dữ liệu" : METRIC_DEFS[c].unit === "minutes" ? `${m.value} phút` : `${m.value.toFixed(1)}%`];
          }),
          "Chưa đánh giá",
        ]);
      const csv =
        "﻿" +
        `# KPI ${POSITION_LABEL[role]} · ${fmtDate(vnToDate(p.from))} – ${fmtDate(vnToDate(p.to))} · xuất lúc ${fmtDateTime(ctx.now())} · ${ctx.mode === "DEMO" ? "DỮ LIỆU MÔ PHỎNG" : ctx.tenantName}\n` +
        lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      await audit(ctx, "performance.export", "report", null, { role, from: p.from, to: p.to });
      return new NextResponse(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kpi-${role.toLowerCase()}-${p.from}.csv"` },
      });
    },
  },
];
