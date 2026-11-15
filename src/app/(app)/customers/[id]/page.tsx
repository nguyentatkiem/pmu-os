"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Heart,
  History,
  LayoutGrid,
  ListChecks,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Plus,
  ShieldCheck,
  StickyNote,
  Tag,
  UserRound,
  Headset,
  CheckCircle2,
  X,
  FileText,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Field, Modal, NoPermission, PageHead, PageState, fe, useAction, useApp } from "@/components/ui";
import { BookingModal } from "@/components/booking";
import { READY_TONE, ReadyIcon, ReadinessModal } from "@/components/customer-bits";
import { APPT_STATUS_LABEL, CONSENT_STATUS_LABEL, DELIVERY_LABEL, RATING_LABEL, READINESS_LABEL, STAGES, TOUCHPOINT_STATUS_LABEL } from "@/lib/shared/labels";
import { addDays, fmtDate, fmtDateTime, fmtDateTimeShort, fmtRange, fmtWeekday, vnDayKey } from "@/lib/shared/format";
import { localInputToIso } from "@/lib/client/helpers";

const TABS = [
  ["overview", "Tổng quan", LayoutGrid],
  ["chat", "Hội thoại", MessageSquare],
  ["appts", "Lịch hẹn", CalendarDays],
  ["care", "Chăm sóc", Heart],
  ["consent", "Đồng ý liên hệ", ShieldCheck],
  ["audit", "Nhật ký thay đổi", History],
] as const;

const EV_ICON: Record<string, any> = { CONSULT: MessageSquare, MESSAGE: MessageSquare, BOOKING: CalendarDays, CARE: Heart, SERVICE: ListChecks, VISIT: CheckCircle2, FEEDBACK: Megaphone, NOTE: StickyNote };

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<any>(`/customers/${id}`, [id]);
  const list = useApi<any>("/customers");
  const router = useRouter();
  const [tab, setTab] = useState<string>("overview");
  const [phone, setPhone] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "note" | "book" | "task" | "consent" | "ready" | "assign">("");
  const [evFilter, setEvFilter] = useState("");
  const { run } = useAction();
  const ids: string[] = list.data?.items?.map((x: any) => x.id) ?? [];
  const idx = ids.indexOf(id);

  return (
    <>
      <PageHead title="Hồ sơ khách hàng" sub="Quản lý thông tin, lịch sử tương tác và kế hoạch chăm sóc khách hàng" actions={<DesignRefButton refKey="customer" />} />
      <PageState q={q}>
        {(d) => {
          const c = d.customer;
          const upcoming = d.appointments.filter((a: any) => ["PENDING", "CONFIRMED"].includes(a.status)).sort((a: any, b: any) => +new Date(a.start_at) - +new Date(b.start_at));
          const events = (d.events ?? []).filter((e: any) => !evFilter || e.type === evFilter);
          return (
            <div className="stack">
              <div className="row" style={{ gap: 18 }}>
                <Avatar name={c.display_name} src={c.avatar} size="lg" />
                <h2 style={{ fontSize: 30, fontWeight: 800 }}>{c.display_name}</h2>
                <span className="badge b-teal" style={{ fontSize: 17, padding: "8px 14px" }}>
                  <Phone size={18} /> {phone ?? c.contact_phone}
                  {d.can_reveal && !phone && (
                    <button
                      className="link small"
                      style={{ marginLeft: 6 }}
                      onClick={async () => {
                        const r: any = await run(() => api(`/customers/${id}/reveal-contact`, { body: {} }), "Lượt xem số đã được ghi nhật ký.");
                        if (r) setPhone(r.contact_phone ?? "Chưa có");
                      }}
                    >
                      <Eye size={14} /> Hiện số
                    </button>
                  )}
                </span>
                <span className="badge b-gray" style={{ fontSize: 15, padding: "8px 14px" }}>
                  <UserRound size={18} /> Phụ trách: <b>{c.assigned_name ?? "Chưa phân công"}</b>
                  {d.can_edit && (
                    <button className="link small" onClick={() => setModal("assign")}>
                      Đổi
                    </button>
                  )}
                </span>
                <span className="row" style={{ marginLeft: "auto", gap: 8 }}>
                  <button className="icon-btn" style={{ border: "1px solid var(--border-2)" }} disabled={idx <= 0} onClick={() => router.push(`/customers/${ids[idx - 1]}`)} aria-label="Khách trước">
                    <ChevronLeft />
                  </button>
                  <button className="icon-btn" style={{ border: "1px solid var(--border-2)" }} disabled={idx < 0 || idx >= ids.length - 1} onClick={() => router.push(`/customers/${ids[idx + 1]}`)} aria-label="Khách sau">
                    <ChevronRight />
                  </button>
                </span>
              </div>
              {!d.sensitive && <div className="banner info">{d.minimal_note}</div>}
              {d.sensitive && (
                <div className="pill-tabs" role="tablist">
                  {TABS.map(([k, label, Icon]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} style={tab === k ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)", boxShadow: "none" } : undefined}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </div>
              )}
              {(tab === "overview" || !d.sensitive) && (
                <div className="three-col">
                  <div className="stack">
                    <section className="card gold-head">
                      <div className="card-head">
                        <h3>
                          <UserRound /> Thông tin khách hàng
                        </h3>
                      </div>
                      <div className="card-body">
                        <div className="row" style={{ flexWrap: "nowrap", gap: 14 }}>
                          <Avatar name={c.display_name} src={c.id && c.avatar === "/avatars/khach-a.png" ? "/avatars/khach-a-lg.png" : c.avatar} size="lg" />
                          <div>
                            <b style={{ fontSize: 18 }}>{c.display_name}</b>
                            <div className="small">
                              <Phone size={14} /> {phone ?? c.contact_phone}
                            </div>
                            <div className="small">
                              <UserRound size={14} /> Phụ trách: {c.assigned_name ?? "—"}
                            </div>
                            {c.segment && <Badge tone="gold">{c.segment}</Badge>}
                          </div>
                        </div>
                        <hr className="hr" />
                        <dl className="kv" style={{ gridTemplateColumns: "120px 1fr", fontSize: 14 }}>
                          <dt>
                            <CalendarDays size={14} /> Ngày tạo hồ sơ
                          </dt>
                          <dd>{fmtDate(c.created_at)}</dd>
                          <dt>
                            <Users size={14} /> Nguồn khách
                          </dt>
                          <dd>{c.source ? <Badge tone="blue">{c.source}</Badge> : "—"}</dd>
                          <dt>
                            <Tag size={14} /> Giai đoạn
                          </dt>
                          <dd>
                            <Badge tone="gold">
                              {c.lifecycle_stage}. {c.stage_label}
                            </Badge>
                          </dd>
                          <dt>Mức sẵn sàng</dt>
                          <dd>
                            {c.readiness ? (
                              <Badge tone={READY_TONE[c.readiness]} icon={<ReadyIcon r={c.readiness} />}>
                                {c.readiness_label}
                                {!c.readiness_confirmed && " · đề xuất AI"}
                              </Badge>
                            ) : (
                              "Chưa phân loại"
                            )}
                            {d.can_edit && (
                              <button className="link small" style={{ marginLeft: 6 }} onClick={() => setModal("ready")}>
                                <SlidersHorizontal size={14} /> Điều chỉnh
                              </button>
                            )}
                            {c.readiness_reason && <div className="tiny muted" style={{ fontWeight: 400 }}>{c.readiness_reason}</div>}
                          </dd>
                          {d.notes?.[0] && (
                            <>
                              <dt>
                                <StickyNote size={14} /> Ghi chú chung
                              </dt>
                              <dd style={{ fontWeight: 500 }}>{d.notes[0].body}</dd>
                            </>
                          )}
                        </dl>
                        {d.sensitive && (
                          <button className="btn btn-outline btn-sm mt-12" onClick={() => setModal("note")}>
                            <StickyNote /> Ghi chú
                          </button>
                        )}
                      </div>
                    </section>
                    <ConsentCard d={d} onEdit={() => setModal("consent")} />
                  </div>
                  {d.sensitive ? (
                    <section className="card">
                      <div className="card-head">
                        <h3>
                          <ListChecks /> Lịch sử tương tác với khách hàng
                        </h3>
                        <div className="right">
                          <select className="select" style={{ height: 34, width: 170, fontSize: 13 }} value={evFilter} onChange={(e) => setEvFilter(e.target.value)}>
                            <option value="">Tất cả hoạt động</option>
                            <option value="CONSULT">Tư vấn</option>
                            <option value="BOOKING">Lịch hẹn</option>
                            <option value="CARE">Chăm sóc</option>
                            <option value="MESSAGE">Tin nhắn</option>
                            <option value="SERVICE">Dịch vụ</option>
                            <option value="FEEDBACK">Phản hồi</option>
                          </select>
                        </div>
                      </div>
                      <div className="card-body timeline">
                        {events.length === 0 && <div className="muted small">Chưa có hoạt động.</div>}
                        {events.map((e: any) => {
                          const Icon = EV_ICON[e.type] ?? FileText;
                          return (
                            <div key={e.id} className="tl-item">
                              <span className="tl-dot" style={e.type === "BOOKING" ? { background: "var(--gold-50)", color: "var(--gold-600)" } : e.type === "CARE" ? { background: "var(--ok-50)", color: "var(--ok)" } : undefined}>
                                <Icon />
                              </span>
                              <div className="tl-card">
                                <div className="row-between">
                                  <b style={{ fontSize: 16 }}>{e.title}</b>
                                  <span className="small muted">{fmtDateTimeShort(e.occurred_at)}</span>
                                </div>
                                <div className="small mt-8">{e.body}</div>
                                <div className="row mt-8">
                                  {e.employee && <Badge tone="blue" icon={<UserRound />}>{e.employee}</Badge>}
                                  {e.status_label && <Badge tone={/hủy|chưa|cần/i.test(e.status_label) ? "gold" : "green"}>{e.status_label}</Badge>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : (
                    <AppointmentsList d={d} />
                  )}
                  <div className="stack">
                    <section className="card">
                      <div className="card-head">
                        <h3>
                          <CalendarDays /> Lịch hẹn sắp tới
                        </h3>
                      </div>
                      <div className="card-body stack" style={{ gap: 10 }}>
                        {upcoming.length === 0 && <div className="muted small">Chưa có lịch hẹn sắp tới.</div>}
                        {upcoming.slice(0, 2).map((a: any) => (
                          <Link key={a.id} href={`/appointments?date=${vnDayKey(a.start_at)}&open=${a.id}`} className="card" style={{ boxShadow: "none", padding: 14, borderLeft: "4px solid var(--gold)", background: "#fffaf0", display: "block" }}>
                            <b>{a.note?.split("|")[0] || a.service}</b>
                            <div className="small mt-8">
                              <CalendarDays size={14} /> {fmtWeekday(a.start_at)}, {fmtDate(a.start_at)}
                            </div>
                            <div className="small">
                              <Clock size={14} /> {fmtRange(a.start_at, a.end_at)}
                            </div>
                            <div className="small">
                              <MapPin size={14} /> {c.branch_name}
                            </div>
                            <div className="small">
                              <UserRound size={14} /> Thực hiện: {a.employee}
                            </div>
                            <Badge tone={a.status === "PENDING" ? "gold" : "green"}>{APPT_STATUS_LABEL[a.status]}</Badge>
                          </Link>
                        ))}
                        {d.can_book && (
                          <button className="btn btn-dark btn-block" onClick={() => setModal("book")}>
                            <CalendarPlus /> Đặt lịch
                          </button>
                        )}
                      </div>
                    </section>
                    {d.sensitive && (
                      <section className="card">
                        <div className="card-head">
                          <h3>
                            <ListChecks /> Công việc chăm sóc
                          </h3>
                        </div>
                        <div className="card-body">
                          {d.tasks.length === 0 && d.care.length === 0 && <div className="muted small">Chưa có công việc chăm sóc.</div>}
                          {d.tasks.map((t: any) => (
                            <Link key={t.id} href={`/tasks?open=${t.id}`} className="list-item" style={{ alignItems: "center" }}>
                              <input type="checkbox" readOnly checked={t.status === "DONE"} aria-label="Trạng thái" />
                              <span style={{ flex: 1, textDecoration: t.status === "DONE" ? "line-through" : undefined }}>
                                {t.title}
                                <div className="tiny muted">
                                  <CalendarDays size={12} /> {t.status === "DONE" ? fmtDate(t.due_at) : `Trước ${fmtDateTime(t.due_at)}`}
                                </div>
                              </span>
                            </Link>
                          ))}
                          {d.care
                            .filter((t: any) => t.status !== "DONE")
                            .map((t: any) => (
                              <Link key={t.id} href={`/care?open=${t.id}`} className="list-item" style={{ alignItems: "center" }}>
                                <Heart size={16} color="var(--ok)" />
                                <span style={{ flex: 1 }}>
                                  {t.title}
                                  <div className="tiny muted">
                                    {TOUCHPOINT_STATUS_LABEL[t.status]} · hạn {fmtDate(t.due_at)}
                                  </div>
                                </span>
                              </Link>
                            ))}
                          {d.can_task && (
                            <button className="btn btn-dark btn-block mt-12" onClick={() => setModal("task")}>
                              <Plus /> Tạo việc chăm sóc
                            </button>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}
              {tab === "chat" && d.sensitive && (
                <section className="card">
                  <div className="card-head">
                    <h3>
                      <MessageSquare /> Hội thoại Zalo (mô phỏng)
                    </h3>
                    {d.conversation && (
                      <div className="right">
                        <Link className="btn btn-outline btn-sm" href={`/inbox?open=${d.conversation.id}`}>
                          Mở trong Hội thoại
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="chat">
                    {d.messages.length === 0 && <div className="muted small">Chưa có tin nhắn.</div>}
                    {d.messages.map((m: any) => (
                      <div key={m.id} className={`bubble ${m.direction === "IN" ? "in" : "out"}`}>
                        {m.body}
                        <div className="meta">
                          {m.author_label} · {fmtDateTimeShort(m.sent_at)} · {DELIVERY_LABEL[m.delivery_status]}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {tab === "appts" && d.sensitive && <AppointmentsList d={d} />}
              {tab === "care" && d.sensitive && (
                <section className="card">
                  <div className="card-head">
                    <h3>
                      <Heart /> Chăm sóc & phản hồi
                    </h3>
                  </div>
                  <div className="card-body table-wrap">
                    <table className="t cards">
                      <thead>
                        <tr>
                          <th>Mốc chăm sóc</th>
                          <th>Hạn</th>
                          <th>Phụ trách</th>
                          <th>Trạng thái</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.care.map((t: any) => (
                          <tr key={t.id}>
                            <td data-label="Mốc">{t.title}</td>
                            <td data-label="Hạn">{fmtDateTime(t.due_at)}</td>
                            <td data-label="Phụ trách">{t.owner}</td>
                            <td data-label="Trạng thái">
                              <Badge tone={t.status === "DONE" ? "green" : t.status === "TO_CONTACT" ? "red" : "gold"}>{TOUCHPOINT_STATUS_LABEL[t.status]}</Badge>
                            </td>
                            <td data-label="Ghi chú">{t.note ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <h4 className="mt-16">Phản hồi</h4>
                    {d.feedback.map((f: any) => (
                      <div key={f.id} className="list-item">
                        <Badge tone={f.status === "RESOLVED" ? "green" : "red"}>{f.status === "RESOLVED" ? "Đã xử lý" : f.needs_specialist ? "Cần chuyên viên" : "Đang mở"}</Badge>
                        <div>
                          <b>{f.category}</b> {f.rating && <Badge tone="teal">{RATING_LABEL[f.rating]}</Badge>}
                          <div className="small">{f.body}</div>
                          <div className="tiny muted">{fmtDateTime(f.biz_created_at)}</div>
                        </div>
                      </div>
                    ))}
                    {d.feedback.length === 0 && <div className="muted small">Chưa có phản hồi.</div>}
                  </div>
                </section>
              )}
              {tab === "consent" && d.sensitive && (
                <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                  <ConsentCard d={d} onEdit={() => setModal("consent")} />
                  <section className="card">
                    <div className="card-head">
                      <h3>
                        <History /> Lịch sử đồng ý
                      </h3>
                    </div>
                    <div className="card-body">
                      {d.consents.map((k: any) => (
                        <div key={k.id} className="list-item small">
                          <Badge tone={k.status === "GRANTED" ? "green" : "red"}>{CONSENT_STATUS_LABEL[k.status]}</Badge>
                          <div>
                            <b>{k.purpose === "CARE" ? "Liên hệ chăm sóc" : "Tiếp thị"}</b> · {fmtDateTime(k.recorded_at)}
                            <div className="muted">Nguồn: {k.source}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              {tab === "audit" && d.sensitive && (
                <section className="card">
                  <div className="card-head">
                    <h3>
                      <History /> Nhật ký thay đổi
                    </h3>
                    <div className="sub">Ghi nhận ai, làm gì, khi nào (giờ hệ thống thực). Không lưu nội dung nhạy cảm.</div>
                  </div>
                  <div className="card-body">
                    {d.audit.length === 0 && <div className="muted small">Chưa có thay đổi nào được ghi nhận từ khi tạo bản demo.</div>}
                    {d.audit.map((a: any, i: number) => (
                      <div key={i} className="list-item small">
                        <b style={{ minWidth: 160 }}>{fmtDateTime(a.created_at)}</b>
                        <span>
                          {a.actor_label} · <code>{a.action}</code> {a.detail && Object.keys(a.detail).length ? <span className="muted">{JSON.stringify(a.detail)}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {modal === "note" && <NoteModal id={id} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
              {modal === "book" && <BookingModal init={{ customer_id: id }} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
              {modal === "task" && <CareTaskModal c={c} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
              {modal === "consent" && <ConsentModal id={id} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
              {modal === "ready" && <ReadinessModal c={c} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
              {modal === "assign" && <AssignModal id={id} staff={list.data?.staff ?? []} onClose={() => setModal("")} onDone={() => (setModal(""), q.reload())} />}
            </div>
          );
        }}
      </PageState>
    </>
  );
}

function AppointmentsList({ d }: { d: any }) {
  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <CalendarDays /> Lịch hẹn
        </h3>
      </div>
      <div className="card-body table-wrap">
        <table className="t cards">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Thời gian</th>
              <th>Dịch vụ</th>
              <th>Nhân sự</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {d.appointments.map((a: any) => (
              <tr key={a.id}>
                <td data-label="Mã">
                  <Link className="link" href={`/appointments?date=${vnDayKey(a.start_at)}&open=${a.id}`}>
                    {a.code}
                  </Link>
                </td>
                <td data-label="Thời gian">
                  {fmtRange(a.start_at, a.end_at)} {fmtDate(a.start_at)}
                </td>
                <td data-label="Dịch vụ">{a.service}</td>
                <td data-label="Nhân sự">{a.employee}</td>
                <td data-label="Trạng thái">
                  <Badge tone={a.status === "CONFIRMED" || a.status === "COMPLETED" ? "green" : a.status === "PENDING" ? "gold" : "gray"}>{APPT_STATUS_LABEL[a.status]}</Badge>
                </td>
              </tr>
            ))}
            {d.appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Chưa có lịch hẹn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConsentCard({ d, onEdit }: { d: any; onEdit: () => void }) {
  return (
    <section className="card gold-head">
      <div className="card-head">
        <h3>
          <ShieldCheck /> Đồng ý liên hệ
        </h3>
        {d.can_edit && (
          <div className="right">
            <button className="btn btn-outline btn-sm" onClick={onEdit}>
              Cập nhật
            </button>
          </div>
        )}
      </div>
      <div className="card-body">
        {d.consent.map((k: any) => (
          <div key={k.purpose} className="list-item" style={{ alignItems: "center" }}>
            {k.purpose === "CARE" ? <Headset size={20} /> : <Megaphone size={20} />}
            <span style={{ flex: 1 }}>{k.label}</span>
            {k.status === "GRANTED" ? (
              <Badge tone="green" icon={<CheckCircle2 />}>
                {k.status_label}
              </Badge>
            ) : (
              <Badge tone={k.status ? "red" : "gray"} icon={<X />}>
                {k.status_label}
              </Badge>
            )}
          </div>
        ))}
        <div className="tiny muted mt-8">Gửi tin chăm sóc chỉ khi “Liên hệ chăm sóc” đã đồng ý và kênh đã kết nối.</div>
      </div>
    </section>
  );
}

function NoteModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      title="Thêm ghi chú"
      onClose={onClose}
      dirty={!!body}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={async () => (await run(() => api(`/customers/${id}/notes`, { body: { body } }), "Đã lưu ghi chú.")) && onDone()}>
            Lưu ghi chú
          </button>
        </>
      }
    >
      <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ghi chú nội bộ về nhu cầu, trao đổi..." />
      <div className="tiny muted mt-8">Không ghi thông tin nhạy cảm về sức khỏe hoặc chẩn đoán.</div>
    </Modal>
  );
}

function ConsentModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ purpose: "CARE", status: "GRANTED", source: "" });
  const [err, setErr] = useState<any>(null);
  return (
    <Modal
      title="Cập nhật đồng ý liên hệ"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                const r = await api(`/customers/${id}/consents`, { body: f });
                if (r.jobs_stopped) alert(`Đã dừng ${r.jobs_stopped} lượt gửi chưa chạy của khách này.`);
                onDone();
              } catch (e) {
                setErr(e);
              }
            }}
          >
            Lưu
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Mục đích">
          <select className="select" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
            <option value="CARE">Liên hệ chăm sóc</option>
            <option value="MARKETING">Tiếp thị</option>
          </select>
        </Field>
        <Field label="Trạng thái">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="GRANTED">Đã đồng ý</option>
            <option value="DENIED">Chưa đồng ý</option>
            <option value="REVOKED">Rút đồng ý</option>
          </select>
        </Field>
        <Field label="Nguồn ghi nhận" req error={fe(err, "source")} className="full">
          <input className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Ví dụ: Khách xác nhận qua điện thoại lúc 10:00" />
        </Field>
      </div>
      {f.status !== "GRANTED" && f.purpose === "CARE" && <div className="banner warn mt-12 small">Các lượt nhắc/chăm sóc chưa chạy của khách sẽ bị dừng ngay.</div>}
    </Modal>
  );
}

function CareTaskModal({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: () => void }) {
  const { can, now } = useApp();
  const tmr = addDays(vnDayKey(now()), 1);
  const staff = useApi<any>("/customers");
  const tpl = useApi<any>(can("care.view") ? "/care" : null);
  const [f, setF] = useState({ title: `Gọi hỏi thăm ${c.display_name}`, owner_id: c.assigned_to ?? "", due: `${tmr}T10:00` });
  const [err, setErr] = useState<any>(null);
  const asTask = can("tasks.create");
  const owners = useMemo(() => staff.data?.staff ?? [], [staff.data]);
  return (
    <Modal
      title="Tạo việc chăm sóc"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              setErr(null);
              try {
                if (asTask)
                  await api("/tasks", { body: { title: f.title, owner_id: f.owner_id, due_at: localInputToIso(f.due), priority: "MEDIUM", customer_id: c.id, checklist: ["Liên hệ khách", "Ghi nhận phản hồi"] } });
                else await api("/care/plans", { body: { customer_id: c.id, template_id: tpl.data?.templates?.[0]?.id, owner_id: f.owner_id || null, touchpoints: [{ title: f.title, due_at: localInputToIso(f.due) }] } });
                onDone();
              } catch (e) {
                setErr(e);
              }
            }}
          >
            Tạo
          </button>
        </>
      }
    >
      {err && <div className="banner danger mb-16">{err.message}</div>}
      <div className="banner info mb-16 small">{asTask ? "Tạo công việc nội bộ gắn với khách hàng." : "Tạo điểm chạm chăm sóc theo mẫu đã duyệt (bạn không có quyền giao việc)."}</div>
      <div className="form-grid">
        <Field label="Nội dung" req className="full" error={fe(err, "title")}>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Người phụ trách" req={asTask} error={fe(err, "owner_id")}>
          <select className="select" value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>
            <option value="">— Chọn —</option>
            {owners.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hạn" req error={fe(err, "due_at")}>
          <input className="input" type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function AssignModal({ id, staff, onClose, onDone }: { id: string; staff: any[]; onClose: () => void; onDone: () => void }) {
  const [emp, setEmp] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      title="Phân công phụ trách"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy || !emp} onClick={async () => (await run(() => api(`/customers/${id}/assign`, { body: { employee_id: emp } }), "Đã phân công.")) && onDone()}>
            Lưu
          </button>
        </>
      }
    >
      <select className="select" value={emp} onChange={(e) => setEmp(e.target.value)}>
        <option value="">— Chọn nhân sự —</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name}
          </option>
        ))}
      </select>
    </Modal>
  );
}

