"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, CalendarCheck, CalendarDays, CalendarPlus, CalendarX, ChevronLeft, ChevronRight, CircleCheck, Hourglass, LogIn, Plus, RefreshCw, UserRound, X } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, ReasonDialog, Skeleton, Stat, useAction, useApp } from "@/components/ui";
import { BookingForm } from "@/components/booking";
import { APPT_STATUS_LABEL } from "@/lib/shared/labels";
import { WEEKDAY_LABEL, WEEKDAY_LONG, addDays, dowOfDay, fmtDate, fmtDayKey, fmtDateTime, fmtRange, fmtShortDay, fmtTime, vnDayKey, vnParts, vnToDate } from "@/lib/shared/format";
import { qs } from "@/lib/client/helpers";

const START_H = 8;
const END_H = 18;
const HOUR_PX = 64;
const TONE: Record<string, string> = { PENDING: "gold", CONFIRMED: "green", ARRIVED: "teal", COMPLETED: "green", CANCELLED: "gray", NO_SHOW: "red" };

export default function AppointmentsPage() {
  const sp = useSearchParams();
  const { now } = useApp();
  const [date, setDate] = useState(sp.get("date") ?? addDays(vnDayKey(now()), 1));
  const [view, setView] = useState<"day" | "week">("day");
  const [open, setOpen] = useState<string | null>(sp.get("open"));
  const [formKey, setFormKey] = useState(0);
  const [showForm, setShowForm] = useState(true);
  const q = useApi<any>(`/appointments${qs({ date, view })}`, [date, view]);
  const book = sp.get("book");
  return (
    <>
      <PageHead
        title="Lịch hẹn khách hàng"
        sub="Quản lý, sắp xếp lịch hẹn với khách hàng theo nhân sự và thời gian"
        actions={
          <>
            <DesignRefButton refKey="appointments" />
            <div className="seg">
              <button className={view === "day" ? "on" : ""} onClick={() => setView("day")} style={view === "day" ? { background: "linear-gradient(180deg,#fff6e2,#fbe8c2)" } : undefined}>
                <CalendarDays size={18} /> Theo ngày
              </button>
              <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
                <CalendarDays size={18} /> Theo tuần
              </button>
            </div>
            {q.data?.can_manage && (
              <button className="btn btn-dark" onClick={() => (setShowForm(true), setFormKey((k) => k + 1))}>
                <Plus /> Tạo lịch hẹn
              </button>
            )}
          </>
        }
      />
      <PageState q={q}>
        {(d) => (
          <div className="stack">
            <div className="grid g-4">
              <Stat tone="teal" icon={<CalendarDays />} num={d.stats.total} label={view === "day" ? (d.date === vnDayKey(now()) ? "Lịch hẹn hôm nay" : `Lịch hẹn ${fmtShortDay(d.date)}`) : "Lịch hẹn trong tuần"} />
              <Stat tone="gold" icon={<CircleCheck />} num={d.stats.confirmed} label="Đã xác nhận" />
              <Stat tone="blue" icon={<Hourglass />} num={d.stats.pending} label="Chờ xác nhận" />
              <Stat tone="red" icon={<CalendarX />} num={d.stats.cancelled} label="Hủy / không đến" />
            </div>
            <div className="split" style={{ gridTemplateColumns: d.can_manage && showForm ? "minmax(0,1fr) 480px" : "minmax(0,1fr)" }}>
              <section className="card">
                <div className="card-pad row" style={{ borderBottom: "1px solid var(--border)" }}>
                  <button className="icon-btn" style={{ border: "1px solid var(--border-2)" }} onClick={() => setDate(addDays(date, view === "day" ? -1 : -7))} aria-label="Trước">
                    <ChevronLeft />
                  </button>
                  <label className="btn btn-outline" style={{ fontWeight: 700 }}>
                    <CalendarDays />
                    {view === "day" ? (
                      <>
                        {fmtDayKey(d.date)} <span style={{ fontWeight: 400 }}>({WEEKDAY_LONG[dowOfDay(d.date)]})</span>
                      </>
                    ) : (
                      <>
                        {fmtShortDay(d.from)} – {fmtDayKey(addDays(d.from, 6))}
                      </>
                    )}
                    <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} aria-label="Chọn ngày" />
                  </label>
                  <button className="icon-btn" style={{ border: "1px solid var(--border-2)" }} onClick={() => setDate(addDays(date, view === "day" ? 1 : 7))} aria-label="Sau">
                    <ChevronRight />
                  </button>
                  <span className="row small" style={{ marginLeft: "auto" }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: "#bfe6cc" }} /> Đã xác nhận
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: "#fbe2ad" }} /> Chờ xác nhận
                  </span>
                </div>
                {view === "day" ? <DayGrid d={d} onOpen={setOpen} /> : <WeekAgenda d={d} onOpen={setOpen} />}
                <div className="mobile-block">
                  {view === "day" && <WeekAgenda d={d} onOpen={setOpen} />}
                </div>
              </section>
              {d.can_manage && showForm && (
                <aside className="card gold-head">
                  <div className="card-head">
                    <h2>
                      <CalendarPlus /> Tạo lịch hẹn khách hàng
                    </h2>
                    <div className="right">
                      <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Ẩn form">
                        <X />
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <BookingForm key={formKey} compact init={{ day: d.date, customer_id: book ?? undefined }} onDone={() => (q.reload(), setFormKey((k) => k + 1))} />
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}
      </PageState>
      {open && <ApptDetail id={open} onClose={() => setOpen(null)} onChanged={q.reload} />}
    </>
  );
}

function DayGrid({ d, onOpen }: { d: any; onOpen: (id: string) => void }) {
  const cols = d.columns;
  if (!cols.length) return <Empty title="Chưa có ca làm hoặc lịch hẹn trong ngày" text="Tạo ca làm ở Lịch làm việc trước khi đặt lịch." />;
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const top = (iso: string) => {
    const p = vnParts(iso);
    return (p.hh - START_H + p.mm / 60) * HOUR_PX;
  };
  return (
    <div className="table-wrap desktop-only">
      <div style={{ display: "grid", gridTemplateColumns: `90px repeat(${cols.length}, minmax(180px, 1fr))`, minWidth: 90 + cols.length * 180, padding: 12 }}>
        <div className="cal-head" style={{ borderRadius: "10px 0 0 0" }}>Thời gian</div>
        {cols.map((c: any, i: number) => (
          <div key={c.id} className="cal-head" style={{ background: ["#e3f3ef", "#fdf3e0", "#e7f0fb"][i % 3], marginLeft: 6, borderRadius: 10 }}>
            <UserRound size={16} /> {c.display_name}
          </div>
        ))}
        <div style={{ position: "relative", height: hours.length * HOUR_PX }}>
          {hours.map((h) => (
            <div key={h} style={{ position: "absolute", top: (h - START_H) * HOUR_PX, height: HOUR_PX, width: "100%", borderTop: "1px solid var(--border)", padding: "6px 8px", fontWeight: 600 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {cols.map((c: any) => (
          <div key={c.id} style={{ position: "relative", height: hours.length * HOUR_PX, borderLeft: "1px solid var(--border)", marginLeft: 6 }}>
            {hours.map((h) => (
              <div key={h} style={{ position: "absolute", top: (h - START_H) * HOUR_PX, height: HOUR_PX, width: "100%", borderTop: "1px solid var(--border)" }} />
            ))}
            {c.shifts.map((s: any, i: number) => (
              <div key={i} title={`Ca ${fmtRange(s.start_at, s.end_at)}`} style={{ position: "absolute", left: 0, right: 0, top: top(s.start_at), height: top(s.end_at) - top(s.start_at), background: "rgba(8,126,145,0.05)", borderLeft: "3px solid rgba(8,126,145,0.25)" }} />
            ))}
            {d.items
              .filter((a: any) => a.employee_id === c.id && vnDayKey(a.start_at) === d.date)
              .map((a: any) => (
                <button key={a.id} className={`appt-block ${a.status}`} style={{ top: top(a.start_at) + 2, height: Math.max(42, top(a.end_at) - top(a.start_at) - 4), textAlign: "left", border: 0, borderLeft: "4px solid" }} onClick={() => onOpen(a.id)}>
                  <div className="row-between" style={{ flexWrap: "nowrap" }}>
                    <b>{a.customer}</b>
                    <Badge tone={TONE[a.status]}>{APPT_STATUS_LABEL[a.status]}</Badge>
                  </div>
                  <div>
                    {fmtRange(a.start_at, a.end_at)} · {a.service}
                  </div>
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="tiny muted" style={{ padding: "0 14px 12px" }}>
        Vùng nền nhạt là ca làm đã duyệt. Lịch chỉ đặt được trong ca; xung đột được kiểm tra tại máy chủ.
      </div>
    </div>
  );
}

function WeekAgenda({ d, onOpen }: { d: any; onOpen: (id: string) => void }) {
  return (
    <div style={{ padding: 14 }}>
      {d.days.map((day: string) => {
        const list = d.items.filter((a: any) => vnDayKey(a.start_at) === day);
        return (
          <div key={day} className="mb-16">
            <b>
              {WEEKDAY_LABEL[dowOfDay(day)]}, {fmtShortDay(day)}
            </b>
            {list.length === 0 && <div className="small muted">Không có lịch hẹn.</div>}
            {list.map((a: any) => (
              <button key={a.id} className="list-item" style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }} onClick={() => onOpen(a.id)}>
                <b style={{ minWidth: 100 }}>{fmtRange(a.start_at, a.end_at)}</b>
                <span style={{ flex: 1 }}>
                  {a.customer} · {a.service}
                  <div className="tiny muted">{a.employee}</div>
                </span>
                <Badge tone={TONE[a.status]}>{APPT_STATUS_LABEL[a.status]}</Badge>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ApptDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const q = useApi<any>(`/appointments/${id}`, [id]);
  const { run, busy } = useAction();
  const [mode, setMode] = useState<"" | "cancel" | "resched">("");
  const refresh = () => (q.reload(), onChanged());
  const act = (path: string, msg: string) => run(() => api(`/appointments/${id}/${path}`, { body: {} }), msg).then(refresh);
  if (!q.data)
    return (
      <Modal title="Lịch hẹn" onClose={onClose}>
        <Skeleton h={200} />
      </Modal>
    );
  const a = q.data.appointment;
  const m = q.data.can_manage;
  return (
    <Modal title={`Lịch hẹn ${a.code}`} icon={<CalendarCheck color="var(--primary)" />} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row">
          <Badge tone={TONE[a.status]}>{a.status_label}</Badge>
          {a.cancel_reason && <span className="small muted">Lý do hủy: {a.cancel_reason}</span>}
        </div>
        <dl className="kv">
          <dt>Khách hàng</dt>
          <dd>
            <Link className="link" href={`/customers/${a.customer_id}`}>
              {a.customer}
            </Link>
          </dd>
          <dt>Dịch vụ</dt>
          <dd>{a.service}</dd>
          <dt>Thời gian</dt>
          <dd>
            {fmtRange(a.start_at, a.end_at)} · {WEEKDAY_LONG[vnParts(a.start_at).dow]} {fmtDate(a.start_at)}
          </dd>
          <dt>Nhân sự</dt>
          <dd>
            <Link className="link" href={`/shifts?week=${vnDayKey(a.start_at)}`}>
              {a.employee}
            </Link>
          </dd>
          {a.note && (
            <>
              <dt>Ghi chú</dt>
              <dd style={{ fontWeight: 400 }}>{a.note}</dd>
            </>
          )}
        </dl>
        <div>
          <b className="row">
            <Bell size={18} /> Nhắc lịch (hàng đợi)
          </b>
          {q.data.reminders.length === 0 && <div className="small muted mt-8">Không có lượt nhắc.</div>}
          {q.data.reminders.map((r: any) => (
            <div key={r.id} className="row small mt-8" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Badge tone={r.status === "SCHEDULED" ? "blue" : r.status === "CANCELLED" ? "gray" : r.status === "DONE" ? "green" : r.status === "WAITING" ? "gold" : "red"}>
                {r.status === "SCHEDULED" ? "Đã lên lịch" : r.status === "CANCELLED" ? "Đã hủy" : r.status === "DONE" ? "Đã gửi" : r.status === "WAITING" ? "Chờ" : "Bị chặn"}
              </Badge>
              <span>
                {fmtDateTime(r.run_at)} {r.result && <span className="muted">— {r.result}</span>}
              </span>
            </div>
          ))}
        </div>
        {m && (
          <div className="row" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            {a.status === "PENDING" && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("confirm", "Đã xác nhận lịch.")}>
                <CircleCheck /> Xác nhận
              </button>
            )}
            {["PENDING", "CONFIRMED"].includes(a.status) && (
              <>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => act("check-in", "Đã check-in: khách đã đến.")}>
                  <LogIn /> Check-in
                </button>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api(`/appointments/${id}/remind`, { body: {} }), (r: any) => r.message).then(refresh)}>
                  <Bell /> Nhắc lịch
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setMode("resched")}>
                  <RefreshCw /> Đổi lịch
                </button>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => window.confirm("Đánh dấu khách không đến?") && act("no-show", "Đã đánh dấu không đến.")}>
                  Không đến
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setMode("cancel")}>
                  <CalendarX /> Hủy lịch
                </button>
              </>
            )}
            {a.status === "ARRIVED" && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("complete", "Đã hoàn thành lịch hẹn.")}>
                <CircleCheck /> Hoàn thành
              </button>
            )}
          </div>
        )}
      </div>
      {mode === "cancel" && (
        <ReasonDialog
          title="Hủy lịch hẹn"
          label="Lý do hủy"
          confirmText="Hủy lịch"
          tone="danger"
          extra={<div className="banner warn small mb-16">Các lượt nhắc chưa gửi sẽ bị vô hiệu hóa.</div>}
          onClose={() => setMode("")}
          onSubmit={async (reason) => {
            const r: any = await run(() => api(`/appointments/${id}/cancel`, { body: { reason } }), (x: any) => `Đã hủy lịch, vô hiệu ${x.reminders_cancelled} lượt nhắc chưa gửi.`);
            if (r) (setMode(""), refresh());
          }}
        />
      )}
      {mode === "resched" && <Resched a={a} onClose={() => setMode("")} onDone={() => (setMode(""), refresh())} />}
    </Modal>
  );
}

function Resched({ a, onClose, onDone }: { a: any; onClose: () => void; onDone: () => void }) {
  const [day, setDay] = useState(vnDayKey(a.start_at));
  const [time, setTime] = useState(fmtTime(a.start_at));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Đổi lịch hẹn"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api(`/appointments/${a.id}/reschedule`, { body: { start_at: vnToDate(day, time).toISOString(), reason, expected_version: a.version } });
                onDone();
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Lưu lịch mới
          </button>
        </>
      }
    >
      {err && (
        <div className="banner danger mb-16">
          {err.message}
          {err.extra?.suggestion && (
            <div>
              Gợi ý: {fmtRange(err.extra.suggestion.start_at, err.extra.suggestion.end_at)} {fmtDate(err.extra.suggestion.start_at)} ({err.extra.suggestion.employee_name})
            </div>
          )}
        </div>
      )}
      <div className="form-grid">
        <Field label="Ngày mới" req>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Giờ bắt đầu" req>
          <input className="input" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Lý do đổi" req error={err?.field_errors?.reason} className="full">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="tiny muted mt-8">Nhắc lịch cũ được hủy và tạo lại theo giờ mới; lịch quay về trạng thái Chờ xác nhận.</div>
    </Modal>
  );
}
