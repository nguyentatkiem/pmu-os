"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, CheckCircle2, CheckSquare, ClipboardList, Database, Download, Flag, Hourglass, Play, Plus, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { api, download, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, PageHead, PageState, SourceChip, Stat, useAction, useApp } from "@/components/ui";
import { Donut } from "@/components/charts";
import { APPT_STATUS_LABEL } from "@/lib/shared/labels";
import { fmtDateTime, pct, vnDayKey } from "@/lib/shared/format";

export default function ReportsPage() {
  const { now } = useApp();
  const [date, setDate] = useState(vnDayKey(now()));
  const q = useApi<any>(`/reports?date=${date}`, [date]);
  const { run, busy } = useAction();
  const [exp, setExp] = useState(false);
  const r = q.data?.report;
  return (
    <>
      <PageHead
        title="Báo cáo điều hành cuối ngày"
        sub="Tổng hợp tình hình vận hành trong ngày tại DOANH NGHIỆP PMU"
        actions={
          <>
            {r && <span className={`badge ${r.status === "APPROVED" ? "b-green" : "b-blue"}`} style={{ padding: "8px 14px" }}>{r.status === "APPROVED" ? `Đã duyệt bởi ${r.reviewer ?? "quản lý"}` : "Báo cáo mẫu — cần kiểm tra số liệu nguồn."}</span>}
            <DesignRefButton refKey="reports" />
            <label className="row" style={{ gap: 6 }}>
              <CalendarDays size={20} color="var(--primary)" />
              <input className="input" type="date" value={date} max={vnDayKey(now())} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 170 }} aria-label="Ngày báo cáo" />
            </label>
          </>
        }
      />
      {q.data && (
        <div className="row mb-16" style={{ justifyContent: "flex-end" }}>
          {q.data.can_manage && (
            <button className="btn btn-gold" disabled={busy} onClick={() => run(() => api("/reports", { body: { date } }), "Đã tạo báo cáo mới từ dữ liệu hiện tại.").then(q.reload)}>
              <Plus /> Tạo báo cáo
            </button>
          )}
          {q.data.can_approve && r && (
            <button className="btn btn-outline" disabled={busy || r.status === "APPROVED"} onClick={() => run(() => api(`/reports/${r.id}/approve`, { body: {} }), "Đã duyệt báo cáo.").then(q.reload)}>
              <ShieldCheck /> Duyệt báo cáo
            </button>
          )}
          {q.data.can_manage && r && (
            <div style={{ position: "relative" }}>
              <button className="btn btn-outline" onClick={() => setExp((v) => !v)} aria-expanded={exp}>
                <Download /> Xuất file
              </button>
              {exp && (
                <div className="menu" style={{ minWidth: 220 }}>
                  <button className="menu-item" onClick={() => (setExp(false), run(() => download(`/reports/${r.id}/export?format=html`), "Đã xuất báo cáo HTML."))}>
                    Báo cáo (HTML, in được)
                  </button>
                  <button className="menu-item" onClick={() => (setExp(false), run(() => download(`/reports/${r.id}/export?format=csv`), "Đã xuất bảng CSV."))}>
                    Bảng số liệu (CSV)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <PageState q={q}>
        {(d) => {
          if (!d.report)
            return (
              <div className="card">
                <Empty
                  title={`Chưa có báo cáo cho ngày ${date.split("-").reverse().join("/")}`}
                  text="Báo cáo được tạo từ dữ liệu tại thời điểm bấm “Tạo báo cáo” và cần quản lý kiểm tra."
                  action={d.can_manage ? <button className="btn btn-primary" onClick={() => run(() => api("/reports", { body: { date } }), "Đã tạo báo cáo.").then(q.reload)}><Plus /> Tạo báo cáo</button> : undefined}
                />
              </div>
            );
          const c = d.report.content;
          return (
            <div className="stack">
              <div className="grid g-4">
                <Stat tone="teal" icon={<ClipboardList />} num={c.tasks.total} label="Tổng công việc" href="/tasks" />
                <Stat tone="green" icon={<CheckCircle2 />} num={c.tasks.done} label="Hoàn thành" href="/tasks?filter=done" />
                <Stat tone="blue" icon={<Play />} num={c.tasks.active + c.tasks.todo} label="Đang thực hiện (đúng hạn)" href="/tasks" />
                <Stat tone="red" icon={<TriangleAlert />} num={c.tasks.overdue} label="Quá hạn" href="/tasks?filter=overdue" />
              </div>
              <div className="three-col" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 380px" }}>
                <div className="stack">
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <Users /> 1. Tình hình nhân sự
                      </h3>
                    </div>
                    <div className="card-body">
                      <div className="row" style={{ gap: 18, flexWrap: "nowrap" }}>
                        <span className="avatar lg" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
                          <Users size={34} />
                        </span>
                        <div>
                          <div style={{ fontSize: 30, fontWeight: 800 }}>{c.staff.total}</div>
                          <div className="muted">Nhân sự</div>
                        </div>
                        <div className="stack small" style={{ gap: 4, borderLeft: "1px solid var(--border)", paddingLeft: 14, flex: 1 }}>
                          <span className="row-between">
                            <span className="dot-status" style={{ color: "var(--ok)" }}>
                              <span style={{ color: "var(--text)" }}>Có ca trong ngày:</span>
                            </span>
                            <b>{c.staff.on_shift}</b>
                          </span>
                          <span className="row-between">
                            <span className="dot-status" style={{ color: "#999" }}>
                              <span style={{ color: "var(--text)" }}>Nghỉ phép:</span>
                            </span>
                            <b>{c.staff.on_leave}</b>
                          </span>
                          <span className="row-between">
                            <span className="dot-status" style={{ color: "var(--gold)" }}>
                              <span style={{ color: "var(--text)" }}>Không có ca:</span>
                            </span>
                            <b>{Math.max(0, c.staff.other)}</b>
                          </span>
                        </div>
                      </div>
                      <div className="card mt-12" style={{ boxShadow: "none", padding: 10, background: "#f6fafa" }}>
                        <div className="small">Danh sách nhân sự ({c.staff.names.length}):</div>
                        <div className="row mt-8" style={{ gap: 6 }}>
                          {c.staff.names.map((n: string) => (
                            <span key={n} className="badge b-gray" style={{ background: "#fff", border: "1px solid var(--border)" }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <CalendarDays /> 3. Lịch khách hàng
                      </h3>
                    </div>
                    <div className="card-body">
                      <div className="row small" style={{ gap: 16 }}>
                        <span>
                          Trong ngày: <b>{c.appointments.today.length}</b> lịch
                        </span>
                        <span>
                          Ngày mai: <b>{c.appointments.tomorrow.total}</b> lịch ({c.appointments.tomorrow.confirmed} đã xác nhận, {c.appointments.tomorrow.pending} chờ)
                        </span>
                      </div>
                      <table className="t mt-12" style={{ fontSize: 13.5 }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Khách hàng</th>
                            <th>Thời gian</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.appointments.today.map((a: any, i: number) => (
                            <tr key={a.id}>
                              <td>{i + 1}</td>
                              <td>{a.customer}</td>
                              <td>{a.time}</td>
                              <td>
                                <Badge tone={a.status === "COMPLETED" ? "green" : a.status === "PENDING" ? "gold" : "blue"}>{APPT_STATUS_LABEL[a.status]}</Badge>
                              </td>
                            </tr>
                          ))}
                          {c.appointments.today.length === 0 && (
                            <tr>
                              <td colSpan={4} className="muted">
                                Không có lịch hẹn trong ngày.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <div className="stack">
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <CheckSquare /> 2. Tiến độ công việc
                      </h3>
                    </div>
                    <div className="card-body row" style={{ gap: 18, flexWrap: "wrap" }}>
                      <Donut
                        size={170}
                        center={c.tasks.total}
                        sub="Công việc"
                        segments={[
                          { value: c.tasks.done, color: "#2fa35c", label: "Hoàn thành" },
                          { value: c.tasks.active + c.tasks.todo, color: "#5b8def", label: "Đang thực hiện" },
                          { value: c.tasks.overdue, color: "#e05a5a", label: "Quá hạn" },
                        ]}
                      />
                      <div className="stack small" style={{ gap: 10, flex: 1, minWidth: 150 }}>
                        <Row color="#2fa35c" label="Hoàn thành" n={c.tasks.done} total={c.tasks.total} />
                        <Row color="#5b8def" label="Đang thực hiện (đúng hạn)" n={c.tasks.active + c.tasks.todo} total={c.tasks.total} />
                        <Row color="#e05a5a" label="Quá hạn" n={c.tasks.overdue} total={c.tasks.total} />
                      </div>
                    </div>
                  </section>
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <TriangleAlert /> 4. Vấn đề phát sinh
                      </h3>
                    </div>
                    <div className="card-body stack" style={{ gap: 8 }}>
                      {c.issues.length === 0 && <div className="muted small">Không có vấn đề phát sinh trong dữ liệu.</div>}
                      {c.issues.map((it: any, i: number) => (
                        <div key={i} className="banner danger" style={{ alignItems: "flex-start" }}>
                          <TriangleAlert />
                          <div style={{ flex: 1 }}>
                            <b>{it.text}</b>
                            <div className="row mt-8">
                              <Badge tone="blue">{it.status}</Badge>
                              <Badge tone="gray">Dữ kiện</Badge>
                              <SourceChip label={it.source.label} href={it.source.href} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <Flag /> 5. Ba ưu tiên tiếp theo <span className="muted small" style={{ fontWeight: 400 }}>(dự thảo)</span>
                      </h3>
                    </div>
                    <div className="card-body">
                      {c.priorities.map((p: string, i: number) => (
                        <div key={i} className="list-item" style={{ alignItems: "center" }}>
                          <span className="avatar sm" style={{ background: "var(--gold-50)", color: "var(--gold-600)" }}>
                            {i + 1}
                          </span>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <aside className="stack">
                  <section className="card gold-head">
                    <div className="card-head">
                      <h3>
                        <Sparkles /> Tóm tắt AI điều hành
                      </h3>
                    </div>
                    <div className="card-body stack" style={{ gap: 12 }}>
                      <div className="card" style={{ boxShadow: "none", padding: 12, background: "#f6fafa" }}>
                        <b className="row">
                          <Bot size={20} color="var(--primary)" /> Nhận định nhanh (dữ kiện)
                        </b>
                        <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                          {c.ai_summary.facts.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="card" style={{ boxShadow: "none", padding: 12, background: "#fffaf0", borderColor: "#f1e3c5" }}>
                        <b className="row">
                          <TriangleAlert size={20} color="var(--gold-600)" /> Các điểm còn chưa chắc chắn
                        </b>
                        <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                          {c.ai_summary.uncertainties.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                      <Link className="btn btn-dark btn-lg btn-block" href="/tasks">
                        <Database /> Xem dữ liệu nguồn <ArrowRight />
                      </Link>
                      <div className="row">
                        <span className="small">Nguồn:</span>
                        {c.sources.map((s: any) => (
                          <SourceChip key={s.label} label={s.label} href={s.href} />
                        ))}
                      </div>
                      <div className="tiny muted">
                        Mốc dữ liệu: {fmtDateTime(d.report.source_cutoff)} · Phạm vi: {d.report.scope} · Tạo lúc {fmtDateTime(d.report.created_at)}. {c.engine}. Báo cáo không đưa ra quyết định nhân sự hay chuyên môn.
                      </div>
                    </div>
                  </section>
                  {d.history.length > 1 && (
                    <section className="card">
                      <div className="card-head">
                        <h3>
                          <Hourglass /> Lịch sử báo cáo
                        </h3>
                      </div>
                      <div className="card-body small">
                        {d.history.map((h: any) => (
                          <div key={h.id} className="row-between list-item">
                            <span>{h.period_date.split("-").reverse().join("/")}</span>
                            <Badge tone={h.status === "APPROVED" ? "green" : "gray"}>{h.status === "APPROVED" ? "Đã duyệt" : "Nháp"}</Badge>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </aside>
              </div>
            </div>
          );
        }}
      </PageState>
    </>
  );
}

function Row({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: color, marginTop: 5, flex: "none" }} />
      <div style={{ flex: 1 }}>
        <div className="row-between">
          <b>{label}:</b> <b>{n}</b>
        </div>
        <div className="muted">{pct(n, total) === null ? "Chưa đủ dữ liệu" : `(${pct(n, total)}%)`}</div>
      </div>
    </div>
  );
}
