"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Info, Plus, Send, Sparkles, UserPlus, Users } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Field, Modal, PageHead, PageState, fe, useAction, useApp } from "@/components/ui";
import { WEEKDAY_LABEL, addDays, dowOfDay, fmtDate, fmtDayKey, fmtRange, fmtShortDay, vnDayKey, vnToDate, weekStart } from "@/lib/shared/format";
import { POSITION_LABEL } from "@/lib/shared/labels";
import { shiftLabel } from "@/lib/client/helpers";

export default function ShiftsPage() {
  const { now, me, branch } = useApp();
  const sp = useSearchParams();
  const [week, setWeek] = useState(sp.get("week") ?? weekStart(addDays(vnDayKey(now()), 1)));
  const q = useApi<any>(`/shifts?week=${week}`, [week]);
  const [edit, setEdit] = useState<any>(null);
  const [create, setCreate] = useState<any>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const { run, busy } = useAction();
  const branchName = me?.branches.find((b) => b.id === branch)?.name ?? "các chi nhánh";

  useEffect(() => setPicked(null), [week]);

  return (
    <>
      <PageHead
        title="Lịch làm việc"
        sub={`Phân ca và quản lý lịch làm việc của Nhân sự tại ${branchName}`}
        actions={
          <>
            <DesignRefButton refKey="shifts" />
            {q.data?.can_manage && (
              <button className="btn btn-dark" onClick={() => setCreate({ day: week })}>
                <Plus /> Tạo ca
              </button>
            )}
          </>
        }
      />
      <div className="row mb-16" style={{ gap: 12 }}>
        <span className="btn btn-outline" aria-hidden>
          <CalendarDays /> Tuần
        </span>
        <div className="row" style={{ gap: 0, border: "1px solid var(--border-2)", borderRadius: 12, background: "#fff" }}>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước">
            <ChevronLeft />
          </button>
          <span style={{ padding: "0 14px", fontWeight: 600, minWidth: 170, textAlign: "center" }}>
            {fmtShortDay(week).split("/")[0]} – {fmtDayKey(addDays(week, 6))}
          </span>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau">
            <ChevronRight />
          </button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeek(weekStart(vnDayKey(now())))}>
          Tuần này
        </button>
      </div>
      <PageState q={q}>
        {(d) => {
          const empMap = Object.fromEntries(d.employees.map((e: any) => [e.id, e]));
          const conflictIds = new Set<string>(d.conflicts.flatMap((c: any) => c.shift_ids));
          const gapDays = new Set(d.gaps.map((g: any) => g.day));
          const suggestedCells = new Set<string>(d.suggestions.filter((s: any) => s.action_type === "SHIFT_CREATE").map((s: any) => `${s.payload.employee_id}:${vnDayKey(s.payload.start_at)}`));
          const selectable = d.suggestions.filter((s: any) => !s.pending_proposal);
          const chosen = picked ?? selectable.map((s: any) => s.key);
          return (
            <div className="stack">
              {(d.conflicts.length > 0 || d.gaps.length > 0) && (
                <div className="grid g-2" style={{ maxWidth: 1000 }}>
                  {d.conflicts.length > 0 && (
                    <div className="banner danger">
                      <AlertTriangle />
                      <div>
                        <b style={{ fontSize: 17 }}>Trùng lịch</b>
                        {d.conflicts.map((c: any, i: number) => (
                          <div key={i}>{c.message}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.gaps.length > 0 && (
                    <div className="banner warn">
                      <Sparkles />
                      <div>
                        <b style={{ fontSize: 17 }}>Thiếu nhân sự</b>
                        {d.gaps.map((g: any, i: number) => (
                          <div key={i}>{g.message}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="split" style={{ gridTemplateColumns: d.view_all ? "minmax(0,1fr) 380px" : "minmax(0,1fr)" }}>
                <section className="card" style={{ overflow: "hidden" }}>
                  <div className="table-wrap desktop-only">
                    <div className="cal" style={{ gridTemplateColumns: `170px repeat(7, minmax(92px, 1fr))`, border: 0, borderRadius: 0, minWidth: 840 }}>
                      <div className="cal-head" style={{ textAlign: "left", paddingLeft: 16 }}>
                        <span className="row">
                          <Users size={20} color="var(--primary)" /> Nhân sự
                        </span>
                      </div>
                      {d.days.map((day: string) => (
                        <div key={day} className="cal-head" style={{ borderLeft: "1px solid var(--border)" }}>
                          {WEEKDAY_LABEL[dowOfDay(day)]}
                          <div style={{ fontWeight: 500 }}>
                            {fmtShortDay(day)} {gapDays.has(day) && <AlertTriangle size={14} color="var(--gold-600)" aria-label="Ca thiếu nhân sự" />}
                          </div>
                        </div>
                      ))}
                      {d.employees.map((e: any) => (
                        <Row
                          key={e.id}
                          e={e}
                          d={d}
                          conflictIds={conflictIds}
                          suggestedCells={suggestedCells}
                          onShift={(s) => d.can_manage && setEdit(s)}
                          onEmpty={(day) => d.can_manage && setCreate({ day, employee_id: e.id })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mobile-block" style={{ padding: 12 }}>
                    {d.days.map((day: string) => (
                      <div key={day} className="mb-16">
                        <b>
                          {WEEKDAY_LABEL[dowOfDay(day)]} {fmtShortDay(day)}
                        </b>
                        {d.shifts
                          .filter((s: any) => vnDayKey(s.start_at) === day)
                          .map((s: any) => (
                            <div key={s.id} className="list-item" onClick={() => d.can_manage && setEdit(s)}>
                              <Avatar name={empMap[s.employee_id]?.display_name ?? "?"} size="sm" />
                              <span style={{ flex: 1 }}>{empMap[s.employee_id]?.display_name}</span>
                              <span className={`shift-pill ${s.status === "DRAFT" ? "draft" : conflictIds.has(s.id) ? "conflict" : ""}`}>{shiftLabel(s)}</span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                  <div className="row small muted" style={{ padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
                    <span className="shift-pill" style={{ display: "inline-block", padding: "2px 10px" }}>Sáng</span> 08:00–12:00
                    <span className="shift-pill" style={{ display: "inline-block", padding: "2px 10px" }}>Chiều</span> 13:00–17:00
                    <span className="shift-pill draft" style={{ display: "inline-block", padding: "2px 10px" }}>Chưa duyệt</span>
                    <span className="shift-pill leave" style={{ display: "inline-block", padding: "2px 10px" }}>Nghỉ phép</span>
                    {d.can_manage ? " · Bấm ô trống để tạo ca, bấm ca để đổi." : " · Bạn đang xem lịch của chính mình."}
                  </div>
                </section>
                {d.view_all && (
                  <aside className="card gold-head">
                    <div className="card-head">
                      <h2>
                        <Sparkles /> AI đề xuất phân ca
                      </h2>
                    </div>
                    <div className="card-body stack" style={{ gap: 12 }}>
                      <div className="muted">Dựa trên lịch hiện tại, khả dụng và ngưỡng nhân sự mỗi ca, AI đề xuất điều chỉnh để giải quyết các vấn đề sau:</div>
                      {d.suggestions.length === 0 && <div className="banner ok">Không phát hiện trùng ca hay thiếu nhân sự trong tuần này.</div>}
                      {d.suggestions.map((s: any) => (
                        <label key={s.key} className="card" style={{ boxShadow: "none", padding: 14, display: "flex", gap: 12, cursor: s.pending_proposal ? "default" : "pointer", background: "#f8fbfb" }}>
                          {s.pending_proposal ? (
                            <span style={{ color: "var(--primary)" }}>{s.action_type === "SHIFT_CREATE" ? <UserPlus /> : <ArrowLeftRight />}</span>
                          ) : (
                            <input type="checkbox" checked={chosen.includes(s.key)} onChange={() => setPicked(chosen.includes(s.key) ? chosen.filter((k: string) => k !== s.key) : [...chosen, s.key])} style={{ width: 20, height: 20, accentColor: "var(--primary)" }} />
                          )}
                          <div>
                            <b>{s.title}</b>
                            <div className="small mt-8">
                              <b>Đề xuất:</b> {s.detail}
                            </div>
                            <div className="small mt-8">
                              <b>Lý do:</b> {s.reason}
                            </div>
                            {s.pending_proposal && (
                              <div className="mt-8">
                                <Link className="badge b-gold" href="/approvals">
                                  Đã gửi phê duyệt · {s.pending_proposal.code}
                                </Link>
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                      {d.pending_shift_proposals.length > 0 && (
                        <div className="small muted">
                          Đang chờ duyệt: {d.pending_shift_proposals.map((p: any) => p.code).join(", ")} ·{" "}
                          <Link href="/approvals" className="link small">
                            Mở hộp phê duyệt
                          </Link>
                        </div>
                      )}
                      {d.can_manage && (
                        <button
                          className="btn btn-dark btn-lg btn-block"
                          disabled={busy || !chosen.length}
                          onClick={async () => {
                            const r = await run(() => api("/shifts/propose", { body: { week, keys: chosen } }), (x: any) => x.message);
                            if (r) q.reload();
                          }}
                        >
                          <Send /> Gửi phê duyệt
                        </button>
                      )}
                      <div className="row small muted" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                        <Info size={18} style={{ flex: "none" }} /> Đề xuất cần được phê duyệt để áp dụng vào lịch làm việc. AI không tự duyệt.
                      </div>
                    </div>
                  </aside>
                )}
              </div>
            </div>
          );
        }}
      </PageState>
      {create && q.data && <ShiftModal init={create} employees={q.data.employees} onClose={() => setCreate(null)} onDone={() => (setCreate(null), q.reload())} />}
      {edit && q.data && <ShiftModal init={{ ...edit, day: vnDayKey(edit.start_at) }} employees={q.data.employees} onClose={() => setEdit(null)} onDone={() => (setEdit(null), q.reload())} />}
    </>
  );
}

function Row({ e, d, conflictIds, suggestedCells, onShift, onEmpty }: { e: any; d: any; conflictIds: Set<string>; suggestedCells: Set<string>; onShift: (s: any) => void; onEmpty: (day: string) => void }) {
  return (
    <>
      <div className="cal-cell row" style={{ borderLeft: 0, gap: 10, paddingLeft: 14 }}>
        <span className="avatar sm" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
          <Users size={16} />
        </span>
        <span>
          {e.display_name}
          <div className="tiny muted">{POSITION_LABEL[e.position]}</div>
        </span>
      </div>
      {d.days.map((day: string) => {
        const list = d.shifts.filter((s: any) => s.employee_id === e.id && vnDayKey(s.start_at) === day);
        const leave = d.leaves.find((l: any) => l.employee_id === e.id && new Date(l.start_at) < vnToDate(addDays(day, 1)) && new Date(l.end_at) > vnToDate(day));
        const appts = d.appointment_counts[`${e.id}:${day}`];
        const suggested = suggestedCells.has(`${e.id}:${day}`);
        return (
          <div key={day} className="cal-cell" style={{ background: suggested ? "#fffbea" : undefined }}>
            {list.map((s: any) => (
              <button
                key={s.id}
                className={`shift-pill ${s.status === "DRAFT" ? "draft" : conflictIds.has(s.id) ? "conflict" : ""}`}
                style={{ width: "100%", border: s.status === "DRAFT" || conflictIds.has(s.id) ? undefined : 0, cursor: "pointer" }}
                onClick={() => onShift(s)}
                title={`${fmtRange(s.start_at, s.end_at)}${s.status === "DRAFT" ? " · chưa duyệt" : ""}${s.note ? " · " + s.note : ""}`}
              >
                {conflictIds.has(s.id) || s.status === "DRAFT" ? fmtRange(s.start_at, s.end_at).replace(" – ", "–") : shiftLabel(s)}
              </button>
            ))}
            {leave && <span className="shift-pill leave">Nghỉ phép</span>}
            {!list.length && !leave && (
              <button className={`shift-pill ${suggested ? "gap" : "off"}`} style={{ width: "100%", border: suggested ? undefined : 0, cursor: "pointer" }} onClick={() => onEmpty(day)} aria-label={`Tạo ca cho ${e.display_name} ngày ${fmtShortDay(day)}`}>
                {suggested ? "– ⚠" : "-"}
              </button>
            )}
            {appts ? <div className="tiny muted" style={{ textAlign: "center" }}>{appts} lịch hẹn</div> : null}
          </div>
        );
      })}
    </>
  );
}

function ShiftModal({ init, employees, onClose, onDone }: { init: any; employees: any[]; onClose: () => void; onDone: () => void }) {
  const isEdit = !!init.id;
  const [f, setF] = useState({
    employee_id: init.employee_id ?? employees[0]?.id ?? "",
    day: init.day,
    start: init.start_at ? fmtRange(init.start_at, init.end_at).split(" – ")[0] : "08:00",
    end: init.end_at ? fmtRange(init.start_at, init.end_at).split(" – ")[1] : "12:00",
  });
  const [conf, setConf] = useState<any[]>([]);
  const [err, setErr] = useState<any>(null);
  const { run, busy } = useAction();
  const start = useMemo(() => vnToDate(f.day, f.start).toISOString(), [f.day, f.start]);
  const end = useMemo(() => vnToDate(f.day, f.end).toISOString(), [f.day, f.end]);
  useEffect(() => {
    if (!f.employee_id || f.end <= f.start) return setConf([]);
    const t = setTimeout(() => {
      api("/shifts/check", { body: { employee_id: f.employee_id, start_at: start, end_at: end, exclude_id: init.id ?? null } })
        .then((r) => setConf(r.conflicts))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [f.employee_id, start, end, init.id, f.end, f.start]);
  const save = async () => {
    setErr(null);
    try {
      if (isEdit) await api(`/shifts/${init.id}`, { method: "PATCH", body: { expected_version: init.version, employee_id: f.employee_id, start_at: start, end_at: end } });
      else await api("/shifts", { body: { employee_id: f.employee_id, start_at: start, end_at: end } });
      onDone();
    } catch (e: any) {
      setErr(e);
      if (e.extra?.conflicts) setConf(e.extra.conflicts);
    }
  };
  return (
    <Modal
      title={isEdit ? "Đổi ca" : "Tạo ca"}
      icon={<CalendarDays color="var(--primary)" />}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <button className="btn btn-danger" style={{ marginRight: "auto" }} disabled={busy} onClick={async () => (await run(() => api(`/shifts/${init.id}`, { method: "DELETE" }), "Đã hủy ca.")) && onDone()}>
              Hủy ca
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!!conf.length}>
            {isEdit ? "Lưu & duyệt ca" : "Tạo ca"}
          </button>
        </>
      }
    >
      {init.status === "DRAFT" && <div className="banner warn mb-16">Ca này chưa được duyệt{init.note ? `: ${init.note}` : ""}. Lưu sẽ duyệt ca nếu không còn xung đột.</div>}
      {err && !err.extra?.conflicts && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Nhân sự" req className="full" error={fe(err, "employee_id")}>
          <select className="select" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.display_name} · {POSITION_LABEL[e.position]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày" req className="full">
          <input className="input" type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </Field>
        <div className="full row">
          <button className="btn btn-outline btn-sm" onClick={() => setF({ ...f, start: "08:00", end: "12:00" })}>
            Ca sáng 08:00–12:00
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setF({ ...f, start: "13:00", end: "17:00" })}>
            Ca chiều 13:00–17:00
          </button>
        </div>
        <Field label="Bắt đầu" req error={fe(err, "start_at")}>
          <input className="input" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </Field>
        <Field label="Kết thúc" req error={f.end <= f.start ? "Phải sau thời điểm bắt đầu" : fe(err, "end_at")}>
          <input className="input" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </Field>
      </div>
      {conf.length > 0 && (
        <div className="banner danger mt-16" role="alert">
          <AlertTriangle />
          <div>
            <b>Phát hiện xung đột ({fmtDate(vnToDate(f.day))}):</b>
            {conf.map((c, i) => (
              <div key={i}>{c.message}</div>
            ))}
          </div>
        </div>
      )}
      {conf.length === 0 && f.end > f.start && <div className="banner ok mt-16">Không phát hiện trùng ca hoặc nghỉ phép. Máy chủ kiểm tra lại khi lưu.</div>}
    </Modal>
  );
}

