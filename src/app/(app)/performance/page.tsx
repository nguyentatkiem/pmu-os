"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChartColumn, ClipboardCheck, Download, Info, Layers, MessageSquare, PencilLine, Star, TriangleAlert, Users, Sparkles, Timer } from "lucide-react";
import { api, download, useApi } from "@/lib/client/api";
import { Badge, DefPopover, DesignRefButton, Field, PageHead, PageState, Progress, SourceChip, useAction, useApp } from "@/components/ui";
import { POSITION_LABEL } from "@/lib/shared/labels";
import { addDays, fmtDate, fmtDateTime, fmtMinutes, vnDayKey, vnToDate, weekStart } from "@/lib/shared/format";
import { qs } from "@/lib/client/helpers";

const ICONS: Record<string, React.ReactNode> = {
  task_progress: <ClipboardCheck />,
  team_progress: <ClipboardCheck />,
  task_ontime: <Timer />,
  checklist: <Layers />,
  response_time: <MessageSquare />,
  booking_rate: <CalendarDays />,
  confirm_rate: <CalendarDays />,
  care_ontime: <Star />,
  feedback_positive: <MessageSquare />,
  learning: <Layers />,
  issues_resolved: <TriangleAlert />,
};
const TONES = ["teal", "gold", "green", "red"];

function fmtVal(def: any, m: any) {
  if (!m || m.value === null || m.den === 0) return "Chưa đủ dữ liệu";
  if (def.unit === "minutes") return fmtMinutes(m.value);
  return `${Math.round(m.value)}%`;
}

export default function PerformancePage() {
  const { now } = useApp();
  const ws = weekStart(vnDayKey(now()));
  const [role, setRole] = useState("CONSULTANT");
  const [from, setFrom] = useState(ws);
  const [to, setTo] = useState(addDays(ws, 6));
  const q = useApi<any>(`/performance${qs({ role, from, to })}`, [role, from, to]);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState("");
  const { run, busy } = useAction();

  return (
    <>
      <PageHead
        title="KPI & hỗ trợ nhân sự"
        sub="Theo dõi hiệu suất làm việc và hỗ trợ nhân sự kịp thời — không xếp hạng tự động"
        actions={
          <>
            <DesignRefButton refKey="performance" />
            {q.data?.can_export && (
              <button className="btn btn-outline" onClick={() => run(() => download(`/performance/export${qs({ role: q.data.role, from, to })}`), "Đã xuất file CSV.")}>
                <Download /> Xuất báo cáo
              </button>
            )}
          </>
        }
      />
      <div className="row mb-16" style={{ gap: 14 }}>
        {q.data?.roles?.length > 1 && (
          <label className="row" style={{ gap: 8 }}>
            Vai trò:
            <select className="select" style={{ width: 230 }} value={q.data.role} onChange={(e) => setRole(e.target.value)}>
              {q.data.roles.map((r: string) => (
                <option key={r} value={r}>
                  {POSITION_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="row small muted" style={{ gap: 6 }}>
          <Info size={16} /> Mỗi chỉ số hiển thị tử số/mẫu số; mẫu số 0 hiển thị “Chưa đủ dữ liệu”.
        </span>
        <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
          <CalendarDays size={20} color="var(--primary)" />
          <input className="input" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} style={{ width: 160 }} aria-label="Từ ngày" />
          –
          <input className="input" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} style={{ width: 160 }} aria-label="Đến ngày" />
        </div>
      </div>
      <PageState q={q}>
        {(d) => (
          <div className="stack">
            <div className="split" style={{ gridTemplateColumns: d.can_note ? "minmax(0,1fr) 390px" : "minmax(0,1fr)" }}>
              <section className="card">
                <div className="card-head">
                  <h2>
                    <ChartColumn /> Hiệu suất {fmtDate(vnToDate(d.from))} – {fmtDate(vnToDate(d.to))} ({d.role_label})
                  </h2>
                  <div className="right">
                    <Badge tone="teal" icon={<Users />}>
                      Đối tượng: {d.rows.map((r: any) => r.employee.name.replace("Nhân sự ", "")).join(", ") || "—"}
                    </Badge>
                  </div>
                </div>
                <div className="card-body grid g-2">
                  {d.codes.map((c: string, i: number) => {
                    const def = d.defs[c];
                    const m = d.totals[c];
                    return (
                      <div key={c} className={`stat ${TONES[i % 4]}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <span className="ico" style={{ width: 52, height: 52 }}>
                            {ICONS[c]}
                          </span>
                          <div style={{ flex: 1 }}>
                            <b style={{ fontSize: 17 }}>{def.label}</b>
                            <div className="small muted">{def.desc}</div>
                          </div>
                          <DefPopover
                            title={def.label}
                            rows={[
                              ["Tử số", def.numerator],
                              ["Mẫu số", def.denominator],
                              ["Cửa sổ", def.window],
                              ["Loại trừ", def.exclusions],
                              ["Nguồn", def.sources.join(", ")],
                              ["Kỳ", `${fmtDate(vnToDate(d.from))} – ${fmtDate(vnToDate(d.to))}`],
                              ...(def.note ? ([["Lưu ý", def.note]] as [string, string][]) : []),
                            ]}
                          >
                            <Info size={16} /> Định nghĩa
                          </DefPopover>
                        </div>
                        <div className="row-between">
                          <span className="num" style={{ color: "var(--primary)", fontSize: m.den ? 32 : 18 }}>
                            {fmtVal(def, m)}
                          </span>
                          <span className="strong">{def.unit === "minutes" ? `${m.den} mẫu` : `${m.num} / ${m.den}`}</span>
                        </div>
                        {def.unit === "ratio" && <Progress value={m.value} />}
                      </div>
                    );
                  })}
                </div>
              </section>
              {d.can_note && (
                <aside className="card gold-head">
                  <div className="card-head">
                    <h2>
                      <Sparkles /> AI Insight: Cần hỗ trợ
                    </h2>
                  </div>
                  <div className="card-body stack" style={{ gap: 12 }}>
                    {d.insights.length === 0 && <div className="muted">Chưa có tín hiệu cần hỗ trợ với vai trò này trong kỳ.</div>}
                    {d.insights.map((ins: any, i: number) => (
                      <div key={i} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                        <span className="avatar" style={{ background: "var(--danger-50)", color: "var(--danger)" }}>
                          <TriangleAlert size={20} />
                        </span>
                        <div>
                          <b>{ins.text}</b>
                          <div className="row mt-8">
                            {ins.sources.map((s: any, k: number) => (
                              <SourceChip key={k} label={s.label} href={s.href} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    {d.insights[0] && (
                      <Link className="btn btn-primary btn-block" href={d.insights[0].sources[0]?.href ?? "/tasks"}>
                        Xem nguồn <ArrowRight />
                      </Link>
                    )}
                    <hr className="hr" />
                    <b className="row">
                      <PencilLine size={18} /> Ghi chú quản lý
                    </b>
                    <Field label="Nhân sự">
                      <select className="select" value={noteFor} onChange={(e) => setNoteFor(e.target.value)}>
                        <option value="">— Chọn nhân sự —</option>
                        {d.rows.map((r: any) => (
                          <option key={r.employee.id} value={r.employee.id}>
                            {r.employee.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <textarea className="textarea" placeholder="Nhập ghi chú hỗ trợ, kế hoạch theo dõi..." value={note} onChange={(e) => setNote(e.target.value)} />
                    <button
                      className="btn btn-gold"
                      style={{ alignSelf: "flex-end" }}
                      disabled={busy || !note.trim() || !noteFor}
                      onClick={async () => {
                        const r = await run(() => api("/performance/notes", { body: { employee_id: noteFor, body: note, period: `${d.from}..${d.to}` } }), "Đã lưu ghi chú hỗ trợ.");
                        if (r) (setNote(""), q.reload());
                      }}
                    >
                      Lưu ghi chú
                    </button>
                  </div>
                </aside>
              )}
            </div>
            <section className="card">
              <div className="card-head">
                <h2>
                  <Users /> Chi tiết hiệu suất nhân sự ({d.role_label})
                </h2>
                <div className="sub">Trạng thái trung tính “Chưa đánh giá”: số liệu là tín hiệu hỗ trợ, không phải kết luận đánh giá nhân sự. Tính lúc {fmtDateTime(d.computed_at)}.</div>
              </div>
              <div className="card-body table-wrap">
                <table className="t cards">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nhân sự</th>
                      {d.codes.map((c: string) => (
                        <th key={c}>{d.defs[c].label}</th>
                      ))}
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r: any, i: number) => (
                      <tr key={r.employee.id}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="Nhân sự">
                          <b style={{ fontWeight: 600 }}>{r.employee.name}</b>
                          {r.note && <div className="tiny muted">Ghi chú: {r.note.body}</div>}
                        </td>
                        {d.codes.map((c: string) => {
                          const m = r.metrics[c];
                          const def = d.defs[c];
                          return (
                            <td key={c} data-label={def.label} style={{ minWidth: 150 }}>
                              <div className="small">
                                {def.unit === "minutes" ? (m.den ? `${fmtMinutes(m.value)} (${m.den} mẫu)` : "Chưa đủ dữ liệu") : m.den ? `${Math.round(m.value)}% (${m.num} / ${m.den})` : "Chưa đủ dữ liệu"}
                              </div>
                              {def.unit === "ratio" && m.den > 0 && <Progress value={m.value} />}
                            </td>
                          );
                        })}
                        <td data-label="Trạng thái">
                          <Badge tone="gray">Chưa đánh giá</Badge>
                        </td>
                      </tr>
                    ))}
                    {d.rows.length === 0 && (
                      <tr>
                        <td colSpan={d.codes.length + 3} className="muted">
                          Chưa có nhân sự thuộc vai trò này trong phạm vi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </PageState>
    </>
  );
}
