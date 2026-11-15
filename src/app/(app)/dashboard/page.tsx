"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarDays, ChartColumn, CircleCheck, ClipboardCheck, Hourglass, ListChecks, PieChart, Sparkles, TriangleAlert, Users } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, PageHead, PageState, SourceChip, Stat, useApp } from "@/components/ui";
import { BarChart, Donut } from "@/components/charts";
import { WEEKDAY_LABEL, dowOfDay, fmtDate, fmtDateTime, fmtShortDay, pct, vnDayKey } from "@/lib/shared/format";

export default function DashboardPage() {
  const { now } = useApp();
  const [date, setDate] = useState(vnDayKey(now()));
  const q = useApi<any>(`/dashboard?date=${date}`, [date]);
  const router = useRouter();
  return (
    <>
      <PageHead
        title="Tổng quan điều hành"
        sub="Bức tranh tổng thể hoạt động của DOANH NGHIỆP PMU"
        actions={
          <>
            <DesignRefButton refKey="dashboard" />
            <label className="row" style={{ gap: 8 }}>
              <CalendarDays size={20} color="var(--primary)" />
              <span className="sr-only">Chọn ngày</span>
              <input className="input" type="date" value={date} max={vnDayKey(now())} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 170 }} />
            </label>
          </>
        }
      />
      <PageState q={q}>
        {(d) => {
          const k = d.kpis;
          const open = k.active + k.todo;
          return (
            <div className="stack">
              <div className="grid g-4">
                <Stat tone="teal" icon={<Users />} num={k.staff} label="Nhân sự" href="/people" />
                <Stat tone="gold" icon={<ClipboardCheck />} num={k.total} label="Công việc" href="/tasks" />
                <Stat tone="green" icon={<CircleCheck />} num={k.done} label="Hoàn thành" href="/tasks?filter=done" />
                <Stat tone="red" icon={<TriangleAlert />} num={k.overdue} label="Quá hạn" href="/tasks?filter=overdue" />
              </div>
              <div className="split">
                <div className="stack">
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <ChartColumn /> Công việc theo tuần
                      </h2>
                      <div className="sub">
                        Số lượng công việc (tạo mới, hoàn thành) trong 7 ngày đến {fmtDate(d.cutoff)} · tập lọc: chi nhánh đang chọn
                      </div>
                    </div>
                    <div className="card-body">
                      <BarChart
                        series={[
                          { name: "Công việc tạo mới", color: "#0a5e6e" },
                          { name: "Công việc hoàn thành", color: "#d7b06b" },
                        ]}
                        data={d.weekly.map((w: any) => ({ label: WEEKDAY_LABEL[dowOfDay(w.day)], sub: fmtShortDay(w.day), values: [w.created, w.done] }))}
                      />
                    </div>
                  </section>
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <ListChecks /> Công việc cần xử lý
                      </h2>
                      <div className="right">
                        <Link href="/tasks" className="link">
                          Xem tất cả <ArrowRight size={16} />
                        </Link>
                      </div>
                    </div>
                    <div className="card-body">
                      {d.tasks.length ? (
                        <div className="table-wrap">
                          <table className="t cards">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Công việc</th>
                                <th>Người phụ trách</th>
                                <th>Hạn hoàn thành</th>
                                <th>Trạng thái</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.tasks.map((t: any, i: number) => (
                                <tr key={t.id} className="clickable" onClick={() => router.push(`/tasks?open=${t.id}`)}>
                                  <td data-label="#">{i + 1}</td>
                                  <td data-label="Công việc">{t.title}</td>
                                  <td data-label="Người phụ trách">
                                    <Badge tone="teal">{t.owner}</Badge>
                                  </td>
                                  <td data-label="Hạn hoàn thành">{fmtDateTime(t.due_at)}</td>
                                  <td data-label="Trạng thái">
                                    {t.state === "OVERDUE" ? (
                                      <Badge tone="red" icon={<AlertTriangle />}>Quá hạn</Badge>
                                    ) : t.state === "DONE" ? (
                                      <Badge tone="green" icon={<CircleCheck />}>Hoàn thành</Badge>
                                    ) : t.state === "SUBMITTED" ? (
                                      <Badge tone="gold" icon={<Hourglass />}>Chờ duyệt</Badge>
                                    ) : t.state === "TODO" ? (
                                      <Badge tone="gray">Cần làm</Badge>
                                    ) : (
                                      <Badge tone="blue" icon={<Hourglass />}>Đang thực hiện</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty title="Chưa có công việc" text="Chưa có dữ liệu công việc trong phạm vi đã chọn." action={<Link className="btn btn-primary" href="/tasks">Tạo công việc</Link>} />
                      )}
                    </div>
                  </section>
                </div>
                <div className="stack">
                  <section className="card ai-card">
                    <div className="card-head">
                      <h2 style={{ color: "var(--sidebar)" }}>
                        <Sparkles color="var(--gold)" /> Cần chú ý{k.overdue ? `: ${k.overdue} công việc quá hạn` : ""}
                      </h2>
                    </div>
                    <div className="card-body">
                      {d.issues.length ? (
                        d.issues.map((it: any, i: number) => (
                          <div className="list-item" key={i}>
                            <span className="avatar" style={{ background: it.tone === "danger" ? "var(--danger-50)" : it.tone === "warn" ? "var(--gold-50)" : "var(--primary-50)", color: it.tone === "danger" ? "var(--danger)" : "var(--primary)" }}>
                              {it.tone === "danger" ? <TriangleAlert size={20} /> : <CalendarDays size={20} />}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <b>{it.title}</b>
                              <div className="small muted">{it.detail}</div>
                              <div className="mt-8">
                                <SourceChip label={it.source.label} href={it.source.href} />
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="muted small">Không có vấn đề cần chú ý trong dữ liệu.</div>
                      )}
                      <Link href="/assistant" className="btn btn-primary btn-block mt-12">
                        Hỏi AI về tình hình hôm nay <ArrowRight />
                      </Link>
                    </div>
                  </section>
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <PieChart /> Phân bố công việc
                      </h2>
                    </div>
                    <div className="card-body row" style={{ gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                      <Donut
                        center={k.total}
                        sub="Công việc"
                        segments={[
                          { value: k.done, color: "#2fa35c", label: "Hoàn thành" },
                          { value: open, color: "#5b8def", label: "Đang thực hiện" },
                          { value: k.overdue, color: "#e05a5a", label: "Quá hạn" },
                        ]}
                      />
                      <div className="stack" style={{ gap: 12, flex: 1, minWidth: 170 }}>
                        <Legend color="#2fa35c" label="Hoàn thành" n={k.done} total={k.total} />
                        <Legend color="#5b8def" label={k.todo ? "Đang mở (đúng hạn)" : "Đang thực hiện"} n={open} total={k.total} />
                        <Legend color="#e05a5a" label="Quá hạn" n={k.overdue} total={k.total} />
                      </div>
                    </div>
                    {d.appointments && (
                      <div className="card-body" style={{ paddingTop: 0 }}>
                        <div className="banner teal">
                          <CalendarDays />
                          <div>
                            Lịch hẹn {fmtDate(d.appointments.tomorrow)}: <b>{d.appointments.confirmed}/{d.appointments.total}</b> đã xác nhận ({pct(d.appointments.confirmed, d.appointments.total)}%). Nguồn: Lịch hẹn.
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                  <div className="muted tiny" style={{ textAlign: "right" }}>
                    Cập nhật lúc {fmtDateTime(d.last_updated)} · Mốc dữ liệu {fmtDateTime(d.cutoff)}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </PageState>
    </>
  );
}

function Legend({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  const p = pct(n, total);
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, marginTop: 6 }} />
      <div style={{ flex: 1 }}>
        <div className="row-between">
          <b>{label}:</b> <b style={{ fontSize: 18 }}>{n}</b>
        </div>
        <div className="muted small">{p === null ? "Chưa đủ dữ liệu" : `(${p}%)`}</div>
      </div>
    </div>
  );
}
