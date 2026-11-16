"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Eye, FileText, Flag, List, MessageCircle, Pause, Phone, Play, Plus, Send, UserRound, Users } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, ReasonDialog, Skeleton, SourceChip, Stat, useAction, useApp } from "@/components/ui";
import { TOUCHPOINT_STATUS_LABEL } from "@/lib/shared/labels";
import { addDays, fmtDate, fmtDateTime, vnDayKey } from "@/lib/shared/format";
import { localInputToIso, qs } from "@/lib/client/helpers";

const TP_TONE: Record<string, string> = { TO_CONTACT: "red", WAITING_REPLY: "gold", DONE: "green", PLANNED: "blue", PAUSED: "gray" };

export default function CarePage() {
  const sp = useSearchParams();
  const [status, setStatus] = useState("open");
  const [sel, setSel] = useState<string | null>(sp.get("open"));
  const [creating, setCreating] = useState(false);
  const q = useApi<any>(`/care${qs({ status })}`, [status]);
  useEffect(() => {
    if (!sel && q.data?.items?.length) setSel(q.data.items[0].id);
  }, [q.data, sel]);
  return (
    <>
      <PageHead
        title="Chăm sóc sau dịch vụ"
        sub="Theo dõi và triển khai chăm sóc khách hàng sau dịch vụ theo kế hoạch đã duyệt"
        actions={
          <>
            <DesignRefButton refKey="care" />
            {q.data?.can_manage && (
              <button className="btn btn-dark" onClick={() => setCreating(true)}>
                <Plus /> Tạo kế hoạch
              </button>
            )}
          </>
        }
      />
      <PageState q={q}>
        {(d) => (
          <div className="stack">
            <div className="grid g-4">
              <Stat tone="teal" icon={<Users />} num={d.stats.customers} label="Khách trong kế hoạch" />
              <Stat tone="gold" icon={<ClipboardCheck />} num={d.stats.to_contact} label="Cần liên hệ" onClick={() => setStatus("TO_CONTACT")} />
              <Stat tone="green" icon={<MessageCircle />} num={d.stats.waiting} label="Chờ phản hồi" onClick={() => setStatus("WAITING_REPLY")} />
              <Stat tone="green" icon={<CheckCircle2 />} num={d.stats.done} label="Hoàn tất" onClick={() => setStatus("DONE")} />
            </div>
            <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 470px" }}>
              <section className="card">
                <div className="card-head">
                  <h2>
                    <List /> Kế hoạch chăm sóc
                  </h2>
                  <div className="right">
                    <select className="select" style={{ width: 190, height: 38 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
                      <option value="open">Cần xử lý & 7 ngày tới</option>
                      <option value="">Tất cả trạng thái</option>
                      {Object.entries(TOUCHPOINT_STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sub">Danh sách khách hàng và mốc chăm sóc theo kế hoạch đã duyệt. Mốc dặm/kiểm tra chỉ theo chỉ định đã xác nhận.</div>
                </div>
                <div className="card-body table-wrap">
                  {d.items.length === 0 ? (
                    <Empty title="Chưa có điểm chạm" text="Tạo kế hoạch chăm sóc từ mẫu đã duyệt." />
                  ) : (
                    <table className="t cards">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Khách hàng</th>
                          <th>
                            Mốc chăm sóc <div className="tiny muted" style={{ fontWeight: 400 }}>(Theo kế hoạch đã duyệt)</div>
                          </th>
                          <th>Hạn xử lý</th>
                          <th>Người phụ trách</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((t: any, i: number) => (
                          <tr key={t.id} className={`clickable ${sel === t.id ? "selected" : ""}`} onClick={() => setSel(t.id)}>
                            <td data-label="#">{i + 1}</td>
                            <td data-label="Khách hàng">
                              <span className="row" style={{ flexWrap: "nowrap" }}>
                                <Avatar name={t.customer} src={t.avatar} size="sm" /> <b>{t.customer}</b>
                              </span>
                            </td>
                            <td data-label="Mốc chăm sóc">
                              <span className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                                <Flag size={16} color="var(--gold-600)" style={{ flex: "none", marginTop: 3 }} />
                                <span>
                                  {t.title}
                                  <div className="tiny muted">Mẫu chăm sóc {t.tpl_version}</div>
                                </span>
                              </span>
                            </td>
                            <td data-label="Hạn xử lý" style={{ color: t.overdue ? "var(--danger)" : undefined }}>
                              <span className="row nowrap" style={{ gap: 6 }}>
                                <CalendarDays size={16} /> {fmtDate(t.due_at)}
                              </span>
                            </td>
                            <td data-label="Người phụ trách">
                              <span className="row" style={{ flexWrap: "nowrap" }}>
                                <Avatar name={t.owner ?? "?"} size="sm" /> {t.owner ?? "—"}
                              </span>
                            </td>
                            <td data-label="Trạng thái">
                              <Badge tone={TP_TONE[t.status]} icon={t.status === "TO_CONTACT" ? <Phone /> : t.status === "WAITING_REPLY" ? <MessageCircle /> : t.status === "DONE" ? <CheckCircle2 /> : undefined}>
                                {t.plan_status === "PAUSED" ? "Tạm dừng" : TOUCHPOINT_STATUS_LABEL[t.status]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
              <div className="stack">
                {sel ? <Detail key={sel} id={sel} onChanged={q.reload} /> : <section className="card"><Empty title="Chọn một điểm chạm" img={false} /></section>}
                {d.feedback.map((f: any) => (
                  <FeedbackCard key={f.id} f={f} staff={d.staff} canManage={d.can_manage} onDone={q.reload} />
                ))}
              </div>
            </div>
          </div>
        )}
      </PageState>
      {creating && q.data && <PlanModal d={q.data} onClose={() => setCreating(false)} onDone={() => (setCreating(false), q.reload())} />}
    </>
  );
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const q = useApi<any>(`/care/touchpoints/${id}`, [id]);
  const { run, busy } = useAction();
  const [preview, setPreview] = useState(false);
  const [record, setRecord] = useState(false);
  const [pause, setPause] = useState(false);
  const refresh = () => (q.reload(), onChanged());
  if (!q.data) return <Skeleton h={380} />;
  const { touchpoint: t, preview: body, source, consent, pending_proposal, can_manage, jobs } = q.data;
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <UserRound /> Chi tiết chăm sóc
        </h2>
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Avatar name={t.customer} src={t.avatar?.replace("khach-a.png", "khach-a-lg.png")} size="lg" />
          <div style={{ flex: 1 }}>
            <Link href={`/customers/${t.customer_id}`} style={{ fontSize: 20, fontWeight: 700 }}>
              {t.customer}
            </Link>
            <div className="small muted">Mã khách: {t.customer_code}</div>
            <div className="small">
              {t.title} · hạn {fmtDateTime(t.due_at)}
            </div>
          </div>
          <Badge tone="gold" icon={<Flag />}>
            Theo kế hoạch đã duyệt
          </Badge>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="card-pad">
            <div className="row-between">
              <b className="row small">
                <FileText size={16} /> Nội dung chăm sóc <span className="muted" style={{ fontWeight: 400 }}>(Mẫu đã phê duyệt)</span>
              </b>
              {source && <Badge tone="blue">Nguồn: {source}</Badge>}
            </div>
            <div style={{ fontSize: 18, marginTop: 10, lineHeight: 1.5 }}>{body ? body.split(". ").slice(-1)[0] : "Chưa gắn mẫu đã duyệt."}</div>
          </div>
        </div>
        <div className="row small">
          Đồng ý liên hệ chăm sóc: {consent ? <Badge tone="green">Đã đồng ý</Badge> : <Badge tone="red">Chưa đồng ý — không được gửi</Badge>}
          {t.plan_status === "PAUSED" && <Badge tone="gray">Kế hoạch tạm dừng</Badge>}
        </div>
        {pending_proposal && (
          <div className="banner warn small">
            Đề xuất {pending_proposal.code}: {pending_proposal.status === "PENDING" ? "đang chờ duyệt" : pending_proposal.status === "APPROVED" ? "đã duyệt nhưng chưa gửi (kênh chưa kết nối)" : "được trả lại"}.{" "}
            <Link href="/approvals" className="link">
              Xem
            </Link>
          </div>
        )}
        {jobs.map((j: any, i: number) => (
          <div key={i} className="tiny muted">
            Hàng đợi: {j.status} · {j.result ?? `chạy lúc ${fmtDateTime(j.run_at)}`}
          </div>
        ))}
        <div className="grid g-2" style={{ gap: 10 }}>
          <button className="btn btn-outline btn-lg" onClick={() => setPreview(true)} disabled={!body}>
            <Eye /> Xem trước
          </button>
          <button className="btn btn-dark btn-lg" disabled={!can_manage || busy || t.status === "DONE" || !!pending_proposal} onClick={() => run(() => api(`/care/touchpoints/${t.id}/propose`, { body: {} }), (r: any) => r.message).then(refresh)}>
            <Send /> Gửi phê duyệt
          </button>
        </div>
        {can_manage && (
          <div className="row">
            {t.status !== "DONE" && (
              <button className="btn btn-outline btn-sm" onClick={() => setRecord(true)}>
                <Phone /> Ghi nhận đã liên hệ (thủ công)
              </button>
            )}
            {t.status === "WAITING_REPLY" && (
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api(`/care/touchpoints/${t.id}/complete`, { body: {} }), "Đã hoàn tất điểm chạm.").then(refresh)}>
                <CheckCircle2 /> Hoàn tất
              </button>
            )}
            {t.plan_status === "PAUSED" ? (
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api(`/care/plans/${t.plan_id}/pause`, { body: { resume: true } }), (r: any) => r.message).then(refresh)}>
                <Play /> Tiếp tục kế hoạch
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setPause(true)}>
                <Pause /> Tạm dừng kế hoạch
              </button>
            )}
          </div>
        )}
      </div>
      {preview && (
        <Modal title="Xem trước nội dung gửi khách" onClose={() => setPreview(false)}>
          <div className="chat" style={{ minHeight: 120, borderRadius: 12 }}>
            <div className="bubble out">{body}</div>
          </div>
          <div className="row mt-12">
            <SourceChip label={`Nguồn: ${source}`} />
          </div>
          <div className="banner info small mt-12">Nội dung lấy từ mẫu đã duyệt, không chứa tư vấn chuyên môn hay cam kết kết quả. Gửi thật chỉ khi có đồng ý, ngoài giờ yên tĩnh và kênh đã kết nối.</div>
        </Modal>
      )}
      {record && (
        <RecordModal
          onClose={() => setRecord(false)}
          onSubmit={async (note, done) => {
            const r = await run(() => api(`/care/touchpoints/${t.id}/record-contact`, { body: { note, done } }), "Đã ghi nhận liên hệ.");
            if (r) (setRecord(false), refresh());
          }}
        />
      )}
      {pause && (
        <ReasonDialog
          title="Tạm dừng kế hoạch chăm sóc"
          label="Lý do tạm dừng"
          confirmText="Tạm dừng"
          onClose={() => setPause(false)}
          onSubmit={async (reason) => {
            const r = await run(() => api(`/care/plans/${t.plan_id}/pause`, { body: { reason } }), (x: any) => x.message);
            if (r) (setPause(false), refresh());
          }}
        />
      )}
    </section>
  );
}

function RecordModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (note: string, done: boolean) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  return (
    <Modal
      title="Ghi nhận liên hệ thủ công"
      onClose={onClose}
      dirty={!!note}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={!note.trim()} onClick={() => onSubmit(note, done)}>
            Lưu
          </button>
        </>
      }
    >
      <Field label="Kênh & kết quả liên hệ" req>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Gọi điện 10:05, khách phản hồi ổn, hẹn gọi lại sau 3 ngày" />
      </Field>
      <label className="check mt-12">
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Đánh dấu hoàn tất điểm chạm (không chờ phản hồi)
      </label>
    </Modal>
  );
}

function FeedbackCard({ f, staff, canManage, onDone }: { f: any; staff: any[]; canManage: boolean; onDone: () => void }) {
  const [emp, setEmp] = useState("");
  const [assign, setAssign] = useState(false);
  const [resolve, setResolve] = useState(false);
  const { run, busy } = useAction();
  return (
    <section className="card" style={{ background: "linear-gradient(180deg,#fff2f2,#fff)", borderColor: "#f3cccc" }}>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <AlertTriangle size={34} color="var(--danger)" style={{ flex: "none" }} />
          <div>
            <b style={{ fontSize: 20, color: "var(--danger)" }}>Cần chuyên viên xử lý</b>
            <div className="muted">
              {f.customer}: “{f.body}” · ghi nhận {fmtDateTime(f.biz_created_at)}
            </div>
            {f.assigned_name && <div className="small mt-8">Đang phụ trách: <b>{f.assigned_name}</b></div>}
          </div>
        </div>
        <div className="small muted">AI không tư vấn chuyên môn hay hứa kết quả. Phản hồi được chuyển cho người có thẩm quyền.</div>
        {canManage && (
          <div className="row">
            <button className="btn btn-gold btn-lg" style={{ flex: 1 }} onClick={() => setAssign(true)}>
              <Users /> Chuyển người phụ trách
            </button>
            <button className="btn btn-outline" onClick={() => setResolve(true)}>
              Đã xử lý
            </button>
          </div>
        )}
      </div>
      {assign && (
        <Modal
          title="Chuyển người phụ trách"
          onClose={() => setAssign(false)}
          footer={
            <button className="btn btn-primary" disabled={!emp || busy} onClick={async () => (await run(() => api(`/care/feedback/${f.id}/assign`, { body: { employee_id: emp } }), (r: any) => r.message)) && (setAssign(false), onDone())}>
              Chuyển
            </button>
          }
        >
          <select className="select" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">— Chọn người có thẩm quyền —</option>
            {staff.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </Modal>
      )}
      {resolve && (
        <ReasonDialog
          title="Đánh dấu đã xử lý"
          label="Kết quả xử lý"
          confirmText="Lưu"
          onClose={() => setResolve(false)}
          onSubmit={async (note) => {
            const r = await run(() => api(`/care/feedback/${f.id}/resolve`, { body: { note } }), "Đã cập nhật phản hồi.");
            if (r) (setResolve(false), onDone());
          }}
        />
      )}
    </section>
  );
}

function PlanModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const { now, me } = useApp();
  const t = vnDayKey(now());
  const [f, setF] = useState({ customer_id: d.customers[0]?.id ?? "", template_id: d.templates[0]?.id ?? "", owner_id: me?.user.employee_id ?? "" });
  const [steps, setSteps] = useState([
    { title: "Hỏi thăm sau 1 ngày", due: `${addDays(t, 1)}T10:00` },
    { title: "Theo dõi phản hồi sau 3 ngày", due: `${addDays(t, 3)}T10:00` },
  ]);
  const [err, setErr] = useState<any>(null);
  return (
    <Modal
      title="Tạo kế hoạch chăm sóc"
      onClose={onClose}
      size="wide"
      dirty
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
                await api("/care/plans", { body: { ...f, owner_id: f.owner_id || null, touchpoints: steps.map((s) => ({ title: s.title, due_at: localInputToIso(s.due) })) } });
                onDone();
              } catch (e) {
                setErr(e);
              }
            }}
          >
            Tạo kế hoạch
          </button>
        </>
      }
    >
      {err && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Khách hàng" req>
          <select className="select" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
            {d.customers.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mẫu chăm sóc đã duyệt" req>
          <select className="select" value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })}>
            {d.templates.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.version_label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Người phụ trách" className="full">
          <select className="select" value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>
            <option value="">— Người tạo —</option>
            {d.staff.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h4 className="mt-16">Điểm chạm</h4>
      {steps.map((s, i) => (
        <div key={i} className="row mt-8" style={{ flexWrap: "nowrap" }}>
          <input className="input" value={s.title} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
          <input className="input" type="datetime-local" style={{ width: 230 }} value={s.due} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, due: e.target.value } : x)))} />
          <button className="icon-btn" onClick={() => setSteps(steps.filter((_, k) => k !== i))} aria-label="Xóa điểm chạm">
            ✕
          </button>
        </div>
      ))}
      <button className="btn btn-outline btn-sm mt-8" onClick={() => setSteps([...steps, { title: "", due: `${addDays(t, 7)}T10:00` }])}>
        <Plus /> Thêm điểm chạm
      </button>
      <div className="banner info small mt-12">Không tự đặt lịch dặm/kiểm tra; các mốc chuyên môn chỉ thêm khi có chỉ định đã xác nhận.</div>
    </Modal>
  );
}
