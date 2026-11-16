import { q, type Q } from "./db";

export interface MetricValue {
  num: number;
  den: number;
  value: number | null; // tỷ lệ % hoặc số phút (median)
  samples?: number;
}

const ratio = (num: number, den: number): MetricValue => ({ num, den, value: den ? (num / den) * 100 : null });

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export async function computeMetric(
  code: string,
  emp: { id: string; user_id: string | null; branch_id: string },
  tenantId: string,
  from: Date,
  to: Date,
  now: Date,
  qq: Q = q,
): Promise<MetricValue> {
  switch (code) {
    case "task_progress": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE status='DONE')::int AS num, count(*)::int AS den FROM tasks
          WHERE tenant_id=$1 AND owner_id=$2 AND status<>'CANCELLED' AND due_at >= $3 AND due_at < $4`,
        [tenantId, emp.id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "team_progress": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE status='DONE')::int AS num, count(*)::int AS den FROM tasks
          WHERE tenant_id=$1 AND branch_id=$2 AND status<>'CANCELLED' AND due_at >= $3 AND due_at < $4`,
        [tenantId, emp.branch_id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "task_ontime": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE completed_at <= due_at)::int AS num, count(*)::int AS den FROM tasks
          WHERE tenant_id=$1 AND owner_id=$2 AND status='DONE' AND due_at >= $3 AND due_at < $4`,
        [tenantId, emp.id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "checklist": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE ci.done_at IS NOT NULL)::int AS num, count(*)::int AS den
           FROM checklist_items ci JOIN tasks t ON t.id = ci.task_id
          WHERE t.tenant_id=$1 AND t.owner_id=$2 AND t.status<>'CANCELLED' AND ci.required AND t.due_at >= $3 AND t.due_at < $4`,
        [tenantId, emp.id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "response_time": {
      const msgs = await qq<any>(
        `SELECT m.conversation_id, m.direction, m.sent_at, m.delivery_status FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
          WHERE c.tenant_id=$1 AND c.assigned_to=$2 AND m.sent_at < $3
          ORDER BY m.conversation_id, m.sent_at`,
        [tenantId, emp.id, to],
      );
      const samples: number[] = [];
      let conv = "";
      let pending: Date | null = null;
      for (const m of msgs) {
        if (m.conversation_id !== conv) {
          conv = m.conversation_id;
          pending = null;
        }
        if (m.direction === "IN") {
          if (!pending && new Date(m.sent_at) >= from) pending = new Date(m.sent_at);
        } else if (pending && ["recorded", "sent", "delivered"].includes(m.delivery_status)) {
          samples.push(Math.round((new Date(m.sent_at).getTime() - pending.getTime()) / 60000));
          pending = null;
        }
      }
      return { num: median(samples) ?? 0, den: samples.length, value: median(samples), samples: samples.length };
    }
    case "booking_rate": {
      const consulted = await qq<any>(
        `SELECT customer_id, min(at) AS at FROM (
            SELECT customer_id, occurred_at AS at FROM customer_events WHERE tenant_id=$1 AND type='CONSULT' AND employee_id=$2 AND occurred_at >= $3 AND occurred_at < $4
            UNION ALL
            SELECT c.customer_id, m.sent_at AS at FROM messages m JOIN conversations c ON c.id=m.conversation_id
             WHERE c.tenant_id=$1 AND m.direction='OUT' AND m.author_id=$5 AND m.sent_at >= $3 AND m.sent_at < $4
          ) x GROUP BY customer_id`,
        [tenantId, emp.id, from, to, emp.user_id],
      );
      let booked = 0;
      for (const c of consulted) {
        const r = await qq<any>(
          `SELECT 1 FROM appointments WHERE tenant_id=$1 AND customer_id=$2 AND created_at >= $3::timestamptz - interval '1 day'
             AND created_at <= $3::timestamptz + interval '7 days' AND status <> 'CANCELLED' LIMIT 1`,
          [tenantId, c.customer_id, c.at],
        );
        if (r.length) booked++;
      }
      return ratio(booked, consulted.length);
    }
    case "confirm_rate": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE a.status IN ('CONFIRMED','ARRIVED','COMPLETED'))::int AS num, count(*)::int AS den
           FROM appointments a JOIN customers c ON c.id = a.customer_id
          WHERE a.tenant_id=$1 AND a.status <> 'CANCELLED' AND a.start_at >= $3 AND a.start_at < $4
            AND (c.assigned_to = $2 OR a.created_by = $5)`,
        [tenantId, emp.id, from, to, emp.user_id],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "care_ontime": {
      const end = to < now ? to : now;
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE contacted_at IS NOT NULL AND contacted_at <= due_at + interval '1 hour')::int AS num, count(*)::int AS den
           FROM care_touchpoints WHERE tenant_id=$1 AND owner_id=$2 AND status <> 'PAUSED' AND due_at >= $3 AND due_at < $4`,
        [tenantId, emp.id, from, end],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "feedback_positive": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE f.rating IN ('GOOD','VERY_GOOD'))::int AS num, count(*)::int AS den
           FROM feedback f JOIN appointments a ON a.id = f.appointment_id
          WHERE f.tenant_id=$1 AND a.employee_id=$2 AND f.rating IS NOT NULL AND f.biz_created_at >= $3 AND f.biz_created_at < $4`,
        [tenantId, emp.id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "issues_resolved": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE f.status='RESOLVED')::int AS num, count(*)::int AS den
           FROM feedback f JOIN customers c ON c.id = f.customer_id
          WHERE f.tenant_id=$1 AND c.branch_id=$2 AND f.biz_created_at >= $3 AND f.biz_created_at < $4`,
        [tenantId, emp.branch_id, from, to],
      );
      return ratio(r[0].num, r[0].den);
    }
    case "learning": {
      const r = await qq<any>(
        `SELECT count(*) FILTER (WHERE status IN ('SUBMITTED','REVIEWED'))::int AS num, count(*)::int AS den
           FROM learning_assignments WHERE tenant_id=$1 AND employee_id=$2`,
        [tenantId, emp.id],
      );
      return ratio(r[0].num, r[0].den);
    }
  }
  return { num: 0, den: 0, value: null };
}

/** Thống kê công việc dùng chung cho Tổng quan và Báo cáo: tập công việc tạo đến mốc cắt */
export async function taskStats(qq: Q, tenantId: string, branchIds: string[], cutoff: Date, ownerId?: string | null, since?: Date | null) {
  const rows = await qq<any>(
    `SELECT t.id, t.code, t.title, t.status, t.due_at, t.completed_at, t.owner_id, t.priority, t.customer_id, e.display_name AS owner_name
       FROM tasks t JOIN employees e ON e.id = t.owner_id
      WHERE t.tenant_id=$1 AND t.branch_id = ANY($2) AND t.status <> 'CANCELLED' AND t.biz_created_at <= $3
        AND ($4::uuid IS NULL OR t.owner_id = $4::uuid)
        AND ($5::timestamptz IS NULL OR t.biz_created_at >= $5::timestamptz OR t.status IN ('TODO','IN_PROGRESS','SUBMITTED') OR t.completed_at > $3)
      ORDER BY t.due_at`,
    [tenantId, branchIds, cutoff, ownerId ?? null, since ?? null],
  );
  const done = rows.filter((r) => r.status === "DONE" && (!r.completed_at || new Date(r.completed_at) <= cutoff));
  const open = rows.filter((r) => !done.includes(r));
  const overdue = open.filter((r) => new Date(r.due_at) < cutoff);
  const active = open.filter((r) => new Date(r.due_at) >= cutoff && r.status !== "TODO");
  const todo = open.filter((r) => new Date(r.due_at) >= cutoff && r.status === "TODO");
  return { rows, total: rows.length, done, open, overdue, active, todo };
}
