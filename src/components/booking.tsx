"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarPlus, Clock, Layers, Sparkles, Timer, UserRound, Users } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Field, Modal, fe, useApp, useToast } from "./ui";
import { addDays, fmtDate, fmtRange, fmtTime, vnDayKey, vnToDate } from "@/lib/shared/format";
import { POSITION_LABEL } from "@/lib/shared/labels";

export interface BookingInit {
  customer_id?: string;
  service_id?: string;
  employee_id?: string;
  day?: string;
  time?: string;
}

/** Form đặt lịch: kiểm tra xung đột trực tiếp và gợi ý giờ trống; máy chủ kiểm lại trong giao dịch */
export function BookingForm({ init, onDone, onCancel, compact }: { init?: BookingInit; onDone: (r: any) => void; onCancel?: () => void; compact?: boolean }) {
  const { now } = useApp();
  const toast = useToast();
  const meta = useApi<any>(`/appointments?date=${init?.day ?? addDays(vnDayKey(now()), 1)}`);
  const [f, setF] = useState({
    customer_id: init?.customer_id ?? "",
    service_id: init?.service_id ?? "",
    employee_id: init?.employee_id ?? "",
    day: init?.day ?? addDays(vnDayKey(now()), 1),
    time: init?.time ?? "10:00",
    duration: 30,
    note: "",
  });
  const [check, setCheck] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const d = meta.data;
  useEffect(() => {
    if (!d) return;
    setF((x) => ({
      ...x,
      customer_id: x.customer_id || d.customers[0]?.id || "",
      service_id: x.service_id || d.services.find((s: any) => s.name === "Tư vấn PMU")?.id || d.services[0]?.id || "",
      employee_id: x.employee_id || d.staff.find((s: any) => s.position === "TECHNICIAN")?.id || d.staff[0]?.id || "",
    }));
  }, [d]);
  useEffect(() => {
    const sv = d?.services.find((s: any) => s.id === f.service_id);
    if (sv) setF((x) => ({ ...x, duration: sv.duration_min }));
  }, [f.service_id, d]);
  const start = useMemo(() => vnToDate(f.day, f.time).toISOString(), [f.day, f.time]);
  useEffect(() => {
    if (!f.employee_id || !f.service_id) return;
    const t = setTimeout(() => {
      api("/appointments/check", { body: { employee_id: f.employee_id, service_id: f.service_id, start_at: start, duration_min: f.duration } })
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 250);
    return () => clearTimeout(t);
  }, [f.employee_id, f.service_id, start, f.duration]);
  if (!d) return <div className="skeleton" style={{ height: 320 }} />;
  const empName = d.staff.find((s: any) => s.id === f.employee_id)?.display_name ?? "";
  const conflicts = check?.conflicts ?? [];
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api("/appointments", { body: { customer_id: f.customer_id, service_id: f.service_id, employee_id: f.employee_id, start_at: start, duration_min: f.duration, note: f.note } });
      toast("ok", `Đã tạo lịch ${r.code} ở trạng thái Chờ xác nhận. Nhắc lịch được lên lịch theo cấu hình (gửi thật chỉ khi kênh đã kết nối).`);
      onDone(r);
    } catch (e: any) {
      setErr(e);
      if (e.extra?.conflicts) setCheck({ conflicts: e.extra.conflicts, suggestion: e.extra.suggestion });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      {err && !err.field_errors && !err.extra?.conflicts && <div className="banner danger">{err.message}</div>}
      <Field label="Khách hàng" req error={fe(err, "customer_id")}>
        <div className="input-icon">
          <UserRound />
          <select className="select" style={{ paddingLeft: 44 }} value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
            {d.customers.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Dịch vụ" req error={fe(err, "service_id")}>
        <div className="input-icon">
          <Layers />
          <select className="select" style={{ paddingLeft: 44 }} value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })}>
            {d.services.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration_min} phút)
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Nhân sự" req error={fe(err, "employee_id")}>
        <div className="input-icon">
          <Users />
          <select className="select" style={{ paddingLeft: 44 }} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            {d.staff.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.display_name} · {POSITION_LABEL[s.position]}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <div className="form-grid" style={{ gridTemplateColumns: compact ? "1fr 1fr" : "1fr 1fr 1fr" }}>
        <Field label="Ngày" req>
          <div className="input-icon">
            <CalendarDays />
            <input className="input" type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          </div>
        </Field>
        <Field label="Thời gian bắt đầu" req error={fe(err, "start_at")}>
          <div className="input-icon">
            <Clock />
            <input className="input" type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
        </Field>
        <Field label="Thời lượng" req error={fe(err, "duration_min")}>
          <div className="input-icon">
            <Timer />
            <select className="select" style={{ paddingLeft: 44 }} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} phút
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>
      {conflicts.length > 0 ? (
        <div className="banner danger" role="alert" style={{ flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <AlertTriangle />
            <div>
              {conflicts.map((c: any, i: number) => (
                <div key={i}>
                  <b>{c.message}</b>
                </div>
              ))}
            </div>
          </div>
          {check?.suggestion && (
            <div className="banner warn" style={{ width: "100%" }}>
              <Sparkles color="var(--gold-600)" />
              <div>
                <b>Đề xuất:</b> Chọn khung giờ <b>{fmtRange(check.suggestion.start_at, check.suggestion.end_at)}</b> {fmtDate(check.suggestion.start_at)}
                {check.suggestion.employee_id !== f.employee_id ? ` với ${check.suggestion.employee_name}` : ""} (còn trống).
              </div>
            </div>
          )}
        </div>
      ) : check ? (
        <div className="banner ok small">
          {empName} còn trống {fmtRange(start, new Date(new Date(start).getTime() + f.duration * 60000))} {fmtDate(start)} trong ca đã duyệt.
        </div>
      ) : null}
      <Field label="Ghi chú">
        <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ví dụ: Tư vấn chi tiết dịch vụ" />
      </Field>
      <div className="grid g-2" style={{ gap: 10 }}>
        <button
          className="btn btn-outline btn-lg"
          style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
          disabled={!check?.suggestion}
          onClick={() => {
            const s = check.suggestion;
            setF({ ...f, employee_id: s.employee_id, day: vnDayKey(s.start_at), time: fmtTime(s.start_at) });
          }}
        >
          <CalendarDays /> Chọn giờ khác
        </button>
        <button className="btn btn-primary btn-lg" disabled={busy || conflicts.length > 0} onClick={submit}>
          <CalendarPlus /> {busy ? "Đang lưu..." : "Tạo lịch hẹn"}
        </button>
      </div>
      {onCancel && (
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Đóng
        </button>
      )}
    </div>
  );
}

export function BookingModal({ init, onClose, onDone }: { init?: BookingInit; onClose: () => void; onDone: (r: any) => void }) {
  return (
    <Modal title="Tạo lịch hẹn khách hàng" icon={<CalendarPlus color="var(--gold-600)" />} onClose={onClose} size="wide">
      <BookingForm init={init} onDone={onDone} />
    </Modal>
  );
}
