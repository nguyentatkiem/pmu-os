import type { RouteDef } from "../router";
import { q } from "../db";
import { taskStats } from "../metrics";
import { addDays, vnDayKey, vnToDate, fmtDateTime, fmtTime, fmtDate } from "../../shared/format";
import { bad } from "../http";
import type { Ctx } from "../auth";

export function resolveCutoff(ctx: Ctx, date: string | null) {
  const now = ctx.now();
  const today = vnDayKey(now);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  if (day > today) throw bad("Không thể xem số liệu của ngày trong tương lai.", { date: "Chọn ngày hôm nay hoặc trước đó" });
  const cutoff = day === today ? now : vnToDate(addDays(day, 1));
  return { day, cutoff, today };
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/dashboard",
    handler: async ({ ctx, query }) => {
      ctx.require("dashboard.view", "Bạn không có quyền xem tổng quan điều hành.");
      const { day, cutoff } = resolveCutoff(ctx, query.get("date"));
      const staff = await q<any>("SELECT count(*)::int AS n FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active", [ctx.tenantId, ctx.branchFilter]);
      const from = addDays(day, -6);
      const ts = await taskStats(q, ctx.tenantId, ctx.branchFilter, cutoff, null, vnToDate(from));
      const weekly: { day: string; created: number; done: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i);
        weekly.push({
          day: d,
          created: ts.rows.filter((r: any) => vnDayKey(r.biz_created_at ?? r.due_at) === d).length,
          done: ts.done.filter((r: any) => r.completed_at && vnDayKey(r.completed_at) === d).length,
        });
      }
      // biz_created_at chưa có trong taskStats => lấy riêng
      const created = await q<any>(
        `SELECT biz_created_at, completed_at, status FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND status <> 'CANCELLED'
           AND biz_created_at >= $3 AND biz_created_at <= $4`,
        [ctx.tenantId, ctx.branchFilter, vnToDate(from), cutoff],
      );
      for (const w of weekly) w.created = created.filter((r) => vnDayKey(r.biz_created_at) === w.day).length;
      const completed = await q<any>(
        "SELECT completed_at FROM tasks WHERE tenant_id=$1 AND branch_id = ANY($2) AND status='DONE' AND completed_at >= $3 AND completed_at <= $4",
        [ctx.tenantId, ctx.branchFilter, vnToDate(from), cutoff],
      );
      for (const w of weekly) w.done = completed.filter((r) => vnDayKey(r.completed_at) === w.day).length;

      const tomorrow = addDays(day, 1);
      const appts = await q<any>(
        `SELECT a.id, a.code, a.status, a.start_at, c.display_name AS customer FROM appointments a JOIN customers c ON c.id=a.customer_id
          WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND a.start_at >= $3 AND a.start_at < $4 AND a.status <> 'CANCELLED'`,
        [ctx.tenantId, ctx.branchFilter, vnToDate(day), vnToDate(addDays(day, 2))],
      );
      const tmr = appts.filter((a) => vnDayKey(a.start_at) === tomorrow);
      const confirmedTmr = tmr.filter((a) => ["CONFIRMED", "ARRIVED", "COMPLETED"].includes(a.status)).length;
      const issues: any[] = [];
      if (ts.overdue.length) {
        const t = ts.overdue[0];
        issues.push({
          tone: "danger",
          title: `Có ${ts.overdue.length} công việc đã quá hạn.`,
          detail: ts.overdue.slice(0, 3).map((x: any) => `${x.code} “${x.title}” — ${x.owner_name}, hạn ${fmtDateTime(x.due_at)}`).join("; ") + (ts.overdue.length > 3 ? `; và ${ts.overdue.length - 3} việc khác.` : ". Vui lòng kiểm tra và phân công xử lý."),
          source: { label: `Công việc #${t.code}`, href: `/tasks?filter=overdue` },
        });
      }
      const pendingTmr = tmr.filter((a) => a.status === "PENDING");
      if (pendingTmr.length)
        issues.push({ tone: "warn", title: "Kiểm tra lịch ngày mai.", detail: `${pendingTmr.length}/${tmr.length} lịch ngày ${fmtDate(vnToDate(tomorrow))} chưa xác nhận: ${pendingTmr.map((a) => a.customer).join(", ")}.`, source: { label: `Lịch hẹn #${pendingTmr[0].code}`, href: `/appointments?date=${tomorrow}` } });
      const blocked = await q<any>("SELECT count(*)::int AS n FROM jobs WHERE tenant_id=$1 AND status='BLOCKED' AND run_at >= $2 AND run_at <= $3", [ctx.tenantId, vnToDate(day), cutoff]);
      if (blocked[0].n)
        issues.push({ tone: "info", title: "Nhắc lịch tự động chưa gửi được.", detail: `${blocked[0].n} lượt nhắc bị chặn vì Zalo chưa kết nối — cần nhắc thủ công.`, source: { label: "Hàng đợi nhắc", href: "/settings?tab=log" } });
      const subm = ts.active.filter((t: any) => t.status === "SUBMITTED");
      if (subm.length)
        issues.push({ tone: "info", title: `${subm.length} kết quả đang chờ quản lý duyệt.`, detail: subm.map((t: any) => `${t.code} ${t.title}`).join("; "), source: { label: `Công việc #${subm[0].code}`, href: `/tasks?open=${subm[0].id}` } });

      const list = [...ts.overdue, ...ts.active, ...ts.todo, ...ts.done.slice().sort((a: any, b: any) => +new Date(b.completed_at) - +new Date(a.completed_at)).slice(0, 2)]
        .slice(0, 6)
        .map((t: any) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          owner: t.owner_name,
          due_at: t.due_at,
          state: ts.overdue.includes(t) ? "OVERDUE" : t.status,
        }));
      return {
        day,
        cutoff: cutoff.toISOString(),
        last_updated: ctx.now().toISOString(),
        kpis: {
          staff: staff[0].n,
          total: ts.total,
          done: ts.done.length,
          active: ts.active.length,
          todo: ts.todo.length,
          overdue: ts.overdue.length,
        },
        weekly,
        issues,
        tasks: list,
        appointments: tmr.length
          ? { tomorrow: tomorrow, total: tmr.length, confirmed: confirmedTmr, source: "Lịch hẹn" }
          : null,
        first_time: fmtTime(cutoff),
      };
    },
  },
];
