import { NextResponse } from "next/server";
import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid, j } from "../db";
import { conflict, notFound } from "../http";
import { buildReportContent } from "../ai";
import { resolveCutoff } from "./dashboard";
import { fmtDateTime, fmtDayKey } from "../../shared/format";
import { APPT_STATUS_LABEL } from "../../shared/labels";

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/reports",
    handler: async ({ ctx, query }) => {
      ctx.require("reports.view", "Bạn không có quyền xem báo cáo.");
      const { day } = resolveCutoff(ctx, query.get("date"));
      const branch = ctx.selectedBranch === "all" ? null : ctx.selectedBranch;
      const report = await one<any>(
        `SELECT r.*, u.display_name AS reviewer FROM reports r LEFT JOIN users u ON u.id=r.reviewed_by
          WHERE r.tenant_id=$1 AND r.period_date=$2 AND (r.branch_id IS NOT DISTINCT FROM $3::uuid OR ($3::uuid IS NULL AND r.branch_id = ANY($4)))
          ORDER BY r.created_at DESC LIMIT 1`,
        [ctx.tenantId, day, branch, ctx.allowedBranchIds],
      );
      const history = await q<any>(
        "SELECT id, period_date, status, scope, created_at FROM reports WHERE tenant_id=$1 AND (branch_id IS NULL OR branch_id = ANY($2)) ORDER BY period_date DESC LIMIT 10",
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      return { day, report, history, can_manage: ctx.can("reports.manage"), can_approve: ctx.can("reports.approve") };
    },
  },
  {
    method: "POST",
    path: "/reports",
    handler: async ({ ctx, body }) => {
      ctx.require("reports.manage", "Bạn không có quyền tạo báo cáo.");
      const { day, cutoff } = resolveCutoff(ctx, body.date ?? null);
      const branchIds = ctx.branchFilter;
      const content = await buildReportContent(q, { tenantId: ctx.tenantId, branchIds, day, now: cutoff });
      const names = await q<any>("SELECT name FROM branches WHERE id = ANY($1)", [branchIds]);
      const id = uid();
      await q(
        "INSERT INTO reports (id, tenant_id, branch_id, period_date, scope, source_cutoff, content, status, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'DRAFT',$8,$9)",
        [id, ctx.tenantId, ctx.selectedBranch === "all" ? (branchIds.length === 1 ? branchIds[0] : null) : ctx.selectedBranch, day, names.map((n) => n.name).join(", "), cutoff, j(content), ctx.userId, ctx.now()],
      );
      await audit(ctx, "report.create", "report", id, { day });
      return { id };
    },
  },
  {
    method: "POST",
    path: "/reports/:id/approve",
    handler: async ({ ctx, params }) => {
      ctx.require("reports.approve", "Bạn không có quyền duyệt báo cáo.");
      const r = await one<any>("SELECT * FROM reports WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!r || (r.branch_id && !ctx.allowedBranchIds.includes(r.branch_id))) throw notFound();
      if (r.status === "APPROVED") throw conflict("Báo cáo đã được duyệt.");
      await q("UPDATE reports SET status='APPROVED', reviewed_by=$2, reviewed_at=$3, updated_at=now(), version=version+1 WHERE id=$1", [r.id, ctx.userId, ctx.now()]);
      await audit(ctx, "report.approve", "report", r.id);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "/reports/:id/export",
    handler: async ({ ctx, params, query }) => {
      ctx.require("reports.manage", "Bạn không có quyền xuất báo cáo.");
      const r = await one<any>("SELECT * FROM reports WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!r || (r.branch_id && !ctx.allowedBranchIds.includes(r.branch_id))) throw notFound();
      const c = r.content;
      const fmt = query.get("format") === "csv" ? "csv" : "html";
      await audit(ctx, "report.export", "report", r.id, { format: fmt });
      if (fmt === "csv") {
        const rows = [
          ["Mục", "Chỉ số", "Giá trị", "Nguồn"],
          ["Nhân sự", "Tổng hồ sơ hoạt động", c.staff.total, "Nhân sự"],
          ["Nhân sự", "Có ca trong ngày", c.staff.on_shift, "Lịch làm việc"],
          ["Công việc", "Tổng", c.tasks.total, "Công việc"],
          ["Công việc", "Hoàn thành", c.tasks.done, "Công việc"],
          ["Công việc", "Đang thực hiện (đúng hạn)", c.tasks.active, "Công việc"],
          ["Công việc", "Quá hạn", c.tasks.overdue, "Công việc"],
          ["Lịch khách", "Trong ngày", c.appointments.today.length, "Lịch hẹn"],
          ["Lịch khách", "Ngày mai (chưa xác nhận)", c.appointments.tomorrow.pending, "Lịch hẹn"],
          ...c.issues.map((i: any) => ["Vấn đề", i.text, i.status, i.source.label]),
          ...c.priorities.map((p: string, i: number) => ["Ưu tiên", `${i + 1}`, p, "Dự thảo AI"]),
        ];
        const csv = "﻿" + rows.map((l) => l.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bao-cao-${r.period_date}.csv"` } });
      }
      const esc = (s: string) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
      const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo ${fmtDayKey(r.period_date)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#172B34;max-width:820px;margin:32px auto;padding:0 16px;line-height:1.55}h1{color:#063C4C}h2{color:#087E91;border-bottom:1px solid #e3ecec;padding-bottom:4px}.tag{display:inline-block;background:#f5ecd9;color:#7a5a1c;padding:2px 8px;border-radius:8px;font-size:12px}td,th{padding:4px 8px;border-bottom:1px solid #eef3f3;text-align:left}table{border-collapse:collapse;width:100%}.muted{color:#5b6d74;font-size:13px}</style></head><body>
<p class="tag">${ctx.mode === "DEMO" ? "DỮ LIỆU MÔ PHỎNG · " : ""}${r.status === "APPROVED" ? "Đã duyệt" : "Bản nháp — cần kiểm tra số liệu nguồn"}</p>
<h1>Báo cáo điều hành cuối ngày ${fmtDayKey(r.period_date)}</h1>
<p class="muted">${esc(ctx.tenantName)} · Phạm vi: ${esc(r.scope)} · Mốc dữ liệu: ${fmtDateTime(r.source_cutoff)} · Xuất lúc ${fmtDateTime(ctx.now())}</p>
<h2>1. Tình hình nhân sự</h2><p>${c.staff.total} hồ sơ hoạt động; ${c.staff.on_shift} có ca trong ngày; ${c.staff.on_leave} nghỉ phép. <span class="muted">Nguồn: Nhân sự, Lịch làm việc</span></p>
<h2>2. Tiến độ công việc</h2><p>Tổng ${c.tasks.total}: ${c.tasks.done} hoàn thành, ${c.tasks.active} đang thực hiện (đúng hạn), ${c.tasks.overdue} quá hạn. <span class="muted">Nguồn: Công việc</span></p>
<h2>3. Lịch khách hàng</h2><table><tr><th>Mã</th><th>Khách</th><th>Giờ</th><th>Trạng thái</th></tr>${c.appointments.today.map((a: any) => `<tr><td>${a.code}</td><td>${esc(a.customer)}</td><td>${a.time}</td><td>${APPT_STATUS_LABEL[a.status]}</td></tr>`).join("") || '<tr><td colspan="4">Không có lịch trong ngày</td></tr>'}</table>
<p>Ngày mai: ${c.appointments.tomorrow.total} lịch, ${c.appointments.tomorrow.confirmed} đã xác nhận, ${c.appointments.tomorrow.pending} chờ xác nhận.</p>
<h2>4. Vấn đề phát sinh (dữ kiện)</h2><ul>${c.issues.map((i: any) => `<li>${esc(i.text)} — <b>${esc(i.status)}</b> <span class="muted">(${esc(i.source.label)})</span></li>`).join("") || "<li>Không có</li>"}</ul>
<h2>5. Ba ưu tiên tiếp theo (dự thảo)</h2><ol>${c.priorities.map((p: string) => `<li>${esc(p)}</li>`).join("")}</ol>
<h2>Điểm còn chưa chắc chắn (giả thuyết)</h2><ul>${c.ai_summary.uncertainties.map((u: string) => `<li>${esc(u)}</li>`).join("")}</ul>
<p class="muted">${esc(c.engine)}. Báo cáo không đưa ra quyết định nhân sự hay chuyên môn.</p></body></html>`;
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="bao-cao-${r.period_date}.html"` } });
    },
  },
];
