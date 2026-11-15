"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  LayoutGrid,
  List,
  ListChecks,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  X,
  RotateCcw,
} from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, Progress, ReasonDialog, Skeleton, Stat, fe, useAction, useApp } from "@/components/ui";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/shared/labels";
import { fmtDate, fmtDateTime, vnDayKey, addDays } from "@/lib/shared/format";
import { localInputToIso, qs } from "@/lib/client/helpers";

export default function TasksPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const [customer, setCustomer] = useState(sp.get("customer") ?? "");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filter, setFilter] = useState(sp.get("filter") ?? "");
  const [sel, setSel] = useState<string | null>(sp.get("open"));
  const [showAllDone, setShowAllDone] = useState(false);
  const [creating, setCreating] = useState(sp.get("new") === "1");
  const q = useApi<any>(`/tasks${qs({ owner, customer })}`, [owner, customer]);

  useEffect(() => {
    const id = sp.get("open");
    if (id) setSel(id);
  }, [sp]);

  return (
    <>
      <PageHead
        title="Công việc & checklist"
        sub="Quản lý công việc, theo dõi tiến độ và checklist thực hiện"
        actions={
          <>
            <DesignRefButton refKey="tasks" />
            {q.data?.can_create && (
              <button className="btn btn-dark" onClick={() => setCreating(true)}>
                <Plus /> Tạo công việc
              </button>
            )}
          </>
        }
      />
      <PageState q={q}>
        {(d) => {
          const items = d.items.filter((t: any) => (filter === "overdue" ? t.overdue : filter === "done" ? t.status === "DONE" : true));
          const todo = items.filter((t: any) => t.status === "TODO");
          const doing = items.filter((t: any) => ["IN_PROGRESS", "SUBMITTED"].includes(t.status));
          const done = items.filter((t: any) => t.status === "DONE").sort((a: any, b: any) => +new Date(b.completed_at) - +new Date(a.completed_at));
          const overdue = doing.concat(todo).filter((t: any) => t.overdue).length;
          return (
            <div className="split" style={{ gridTemplateColumns: sel ? "minmax(0,1fr) minmax(340px, 430px)" : "minmax(0,1fr)" }}>
              <div className={`stack ${sel ? "compact" : ""}`}>
                <div className="grid g-4">
                  <Stat tone="teal" icon={<ClipboardCheck />} num={d.items.length} label="Tổng công việc" onClick={() => setFilter("")} />
                  <Stat tone="gold" icon={<Play />} num={d.items.filter((t: any) => t.status === "TODO").length} label="Cần làm" />
                  <Stat tone="blue" icon={<RefreshCw />} num={d.items.filter((t: any) => ["IN_PROGRESS", "SUBMITTED"].includes(t.status)).length} label="Đang thực hiện" onClick={() => setFilter("")} />
                  <Stat tone="green" icon={<CheckCircle2 />} num={d.items.filter((t: any) => t.status === "DONE").length} label="Hoàn thành" onClick={() => setFilter("done")} />
                </div>
                <div className="row" style={{ gap: 14 }}>
                  {d.owners.length > 0 && (
                    <label className="row" style={{ gap: 8 }}>
                      Nhân sự:
                      <select className="select" style={{ width: 190 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
                        <option value="">Tất cả nhân sự</option>
                        {d.owners.map((o: any) => (
                          <option key={o.id} value={o.id}>
                            {o.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="row" style={{ gap: 8 }}>
                    Khách hàng:
                    <select className="select" style={{ width: 190 }} value={customer} onChange={(e) => setCustomer(e.target.value)}>
                      <option value="">Tất cả khách mẫu</option>
                      {d.customers.map((o: any) => (
                        <option key={o.id} value={o.id}>
                          {o.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="seg dark">
                    <button className={view === "kanban" ? "on" : ""} onClick={() => setView("kanban")}>
                      <LayoutGrid size={16} /> Kanban
                    </button>
                    <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
                      <List size={16} /> Danh sách
                    </button>
                  </div>
                  {filter && (
                    <button className="badge b-gold" onClick={() => setFilter("")} style={{ border: 0, cursor: "pointer" }}>
                      Lọc: {filter === "overdue" ? "Quá hạn" : "Hoàn thành"} <X size={14} />
                    </button>
                  )}
                  {!d.can_create && <span className="small muted">Bạn đang xem công việc được giao cho mình.</span>}
                </div>
                {view === "kanban" ? (
                  <div className="kanban">
                    <div className="kcol todo">
                      <div className="kcol-head">
                        <ClipboardList color="var(--gold-600)" /> Cần làm ({todo.length})
                        {d.can_create && (
                          <button className="icon-btn right" style={{ width: 32, height: 32 }} onClick={() => setCreating(true)} aria-label="Tạo công việc">
                            <Plus size={18} />
                          </button>
                        )}
                      </div>
                      <div className="kcol-body">
                        {todo.length === 0 ? (
                          <Empty title="Chưa có công việc" action={d.can_create ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> Tạo công việc</button> : undefined} />
                        ) : (
                          todo.map((t: any) => <Card key={t.id} t={t} sel={sel} onOpen={setSel} />)
                        )}
                      </div>
                    </div>
                    <div className="kcol doing">
                      <div className="kcol-head">
                        <RefreshCw color="var(--info)" /> Đang thực hiện ({doing.length})
                      </div>
                      <div className="kcol-body">
                        {overdue > 0 && (
                          <span className="badge b-red" style={{ alignSelf: "flex-start", padding: "6px 12px" }}>
                            <Clock /> {overdue} việc quá hạn
                          </span>
                        )}
                        {doing.length === 0 && <div className="muted small" style={{ padding: 12 }}>Không có việc đang thực hiện.</div>}
                        {doing
                          .sort((a: any, b: any) => Number(b.overdue) - Number(a.overdue))
                          .map((t: any) => (
                            <Card key={t.id} t={t} sel={sel} onOpen={setSel} />
                          ))}
                      </div>
                    </div>
                    <div className="kcol done">
                      <div className="kcol-head">
                        <CheckCircle2 color="var(--ok)" /> Hoàn thành ({done.length})
                      </div>
                      <div className="kcol-body">
                        {(showAllDone ? done : done.slice(0, 3)).map((t: any) => (
                          <Card key={t.id} t={t} sel={sel} onOpen={setSel} />
                        ))}
                        {done.length > 3 && (
                          <button className="btn btn-outline" onClick={() => setShowAllDone((v) => !v)}>
                            {showAllDone ? "Thu gọn" : `Xem tất cả ${done.length} công việc`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <section className="card">
                    <div className="card-body table-wrap" style={{ paddingTop: 16 }}>
                      <table className="t cards">
                        <thead>
                          <tr>
                            <th>Mã</th>
                            <th>Công việc</th>
                            <th>Người phụ trách</th>
                            <th>Hạn</th>
                            <th>Checklist</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((t: any) => (
                            <tr key={t.id} className={`clickable ${sel === t.id ? "selected" : ""}`} onClick={() => setSel(t.id)}>
                              <td data-label="Mã">{t.code}</td>
                              <td data-label="Công việc">{t.title}</td>
                              <td data-label="Người phụ trách">{t.owner_name}</td>
                              <td data-label="Hạn">{fmtDateTime(t.due_at)}</td>
                              <td data-label="Checklist">
                                {t.items_done}/{t.items}
                              </td>
                              <td data-label="Trạng thái">
                                <StatusBadge t={t} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
              {sel && (
                <TaskPanel
                  id={sel}
                  onClose={() => {
                    setSel(null);
                    router.replace("/tasks");
                  }}
                  onChanged={q.reload}
                />
              )}
            </div>
          );
        }}
      </PageState>
      {creating && q.data && <CreateTask owners={q.data.owners} customers={q.data.customers} onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), q.reload(), setSel(id))} />}
    </>
  );
}

function StatusBadge({ t }: { t: any }) {
  if (t.overdue) return <Badge tone="red" icon={<Clock />}>Quá hạn</Badge>;
  if (t.status === "SUBMITTED") return <Badge tone="gold">Chờ duyệt</Badge>;
  if (t.status === "DONE") return <Badge tone="green">Hoàn thành</Badge>;
  if (t.status === "TODO") return <Badge tone="gray">Cần làm</Badge>;
  return <Badge tone="blue">Đang thực hiện</Badge>;
}

function Card({ t, sel, onOpen }: { t: any; sel: string | null; onOpen: (id: string) => void }) {
  return (
    <button className={`kcard ${t.overdue ? "overdue" : ""} ${t.status === "DONE" ? "done" : ""} ${sel === t.id ? "selected" : ""}`} onClick={() => onOpen(t.id)}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        {t.status === "DONE" ? <CheckCircle2 size={20} color="var(--ok)" style={{ flex: "none" }} /> : <span style={{ width: 18, height: 18, border: "2px solid #9aabb0", borderRadius: 5, flex: "none", marginTop: 2 }} />}
        <div style={{ flex: 1 }}>
          <div className="title">{t.title}</div>
          <div className="meta">
            <span>
              <UserRound /> {t.owner_name}
            </span>
            {t.customer_name ? (
              <span>
                <RefreshCw /> {t.customer_name}
              </span>
            ) : t.sop_title ? (
              <span>
                <FileText /> SOP
              </span>
            ) : (
              <span>
                <CalendarDays /> {fmtDate(t.due_at)}
              </span>
            )}
            <span>
              <ListChecks /> {t.items_done}/{t.items}
            </span>
          </div>
          {(t.status === "SUBMITTED" || t.overdue) && (
            <div className="row mt-8">
              {t.status === "SUBMITTED" && <Badge tone="gold">Chờ duyệt</Badge>}
              {t.overdue && <Badge tone="red">Quá hạn · {fmtDateTime(t.due_at)}</Badge>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function TaskPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const q = useApi<any>(`/tasks/${id}`, [id]);
  const { run, busy } = useAction();
  const [comment, setComment] = useState("");
  const [evidence, setEvidence] = useState("");
  const [rework, setRework] = useState(false);
  const [cancel, setCancel] = useState(false);
  const refresh = () => {
    q.reload();
    onChanged();
  };
  if (q.error) return <section className="card card-pad">{q.error.message}</section>;
  if (!q.data) return <Skeleton h={600} />;
  const { task: t, owner, items, events, is_owner, can_review, customer } = q.data;
  const doneN = items.filter((i: any) => i.done_at).length;
  const canCheck = is_owner && ["TODO", "IN_PROGRESS"].includes(t.status);
  const reminders = events.filter((e: any) => e.type === "REMINDER");
  const comments = events.filter((e: any) => ["COMMENT", "EVIDENCE", "SUBMITTED", "REWORK", "APPROVED"].includes(e.type));
  return (
    <aside className="card" style={{ position: "sticky", top: 88, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflow: "auto" }}>
      <div className="card-head" style={{ alignItems: "flex-start" }}>
        <h2 style={{ fontSize: 18 }}>
          <ClipboardList color="var(--gold-600)" /> {t.title}
        </h2>
        <div className="right">
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X />
          </button>
        </div>
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="row">
          <StatusBadge t={t} />
          <span className="tiny muted">{t.code}</span>
        </div>
        <dl className="kv">
          <dt>
            <UserRound size={16} /> Nhân sự phụ trách
          </dt>
          <dd>{owner.display_name}</dd>
          <dt>
            <CalendarDays size={16} /> Hạn hoàn thành
          </dt>
          <dd style={{ color: t.overdue ? "var(--danger)" : undefined }}>{fmtDateTime(t.due_at)}</dd>
          <dt>
            <Flag size={16} /> Mức độ ưu tiên
          </dt>
          <dd>
            <Badge tone={t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "gold" : "gray"} icon={<Flag />}>
              {PRIORITY_LABEL[t.priority]}
            </Badge>
          </dd>
          {customer && (
            <>
              <dt>Khách hàng</dt>
              <dd>
                <Link className="link" href={`/customers/${customer.id}`}>
                  {customer.display_name}
                </Link>
              </dd>
            </>
          )}
        </dl>
        {t.description && <div className="banner teal small">{t.description}</div>}
        <hr className="hr" />
        <div>
          <div className="row-between">
            <b className="row">
              <ListChecks size={18} /> Checklist thực hiện ({doneN}/{items.length})
            </b>
            <span>
              {doneN}/{items.length}
            </span>
          </div>
          <div className="mt-8">
            <Progress value={items.length ? (doneN / items.length) * 100 : 0} />
          </div>
          <div className="card mt-12" style={{ boxShadow: "none" }}>
            {items.map((it: any) => (
              <label key={it.id} className="list-item check" style={{ padding: "10px 14px", cursor: canCheck ? "pointer" : "default" }}>
                <input
                  type="checkbox"
                  checked={!!it.done_at}
                  disabled={!canCheck || busy}
                  onChange={(e) => run(() => api(`/tasks/${t.id}/checklist/${it.id}`, { body: { done: e.target.checked } })).then(refresh)}
                />
                <span style={{ flex: 1 }}>
                  {it.title} {!it.required && <span className="tiny muted">(không bắt buộc)</span>}
                  {it.evidence_ref && <div className="tiny muted">Bằng chứng: {it.evidence_ref}</div>}
                </span>
              </label>
            ))}
            {items.length === 0 && <div className="muted small" style={{ padding: 12 }}>Công việc không có checklist.</div>}
          </div>
          {!is_owner && ["TODO", "IN_PROGRESS"].includes(t.status) && <div className="tiny muted mt-8">Chỉ người được giao mới đánh dấu checklist. Đổi vai trò sang {owner.display_name} (demo) để thực hiện.</div>}
        </div>
        <hr className="hr" />
        <div>
          <b className="row">
            <Bell size={18} /> Lịch sử nhắc nhở
          </b>
          {reminders.length === 0 && <div className="muted small mt-8">Chưa có nhắc nhở.</div>}
          {reminders.map((r: any) => (
            <div key={r.id} className="row mt-8" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--primary)", marginTop: 8, flex: "none" }} />
              <div>
                <b>{fmtDateTime(r.occurred_at)}</b>
                <div className="small muted">{r.payload.message ?? "Nhắc nhở"}</div>
              </div>
            </div>
          ))}
          {can_review && ["TODO", "IN_PROGRESS"].includes(t.status) && (
            <button className="btn btn-outline btn-sm mt-8" disabled={busy} onClick={() => run(() => api(`/tasks/${t.id}/remind`, { body: {} }), (r: any) => r.message).then(refresh)}>
              <Bell /> Nhắc việc (nội bộ)
            </button>
          )}
        </div>
        <hr className="hr" />
        <div>
          <b className="row">
            <MessageSquare size={18} /> Bình luận & bằng chứng
          </b>
          {comments.map((c: any) => (
            <div key={c.id} className="small mt-8" style={{ background: "#f6fafa", borderRadius: 10, padding: "8px 10px" }}>
              <b>{c.actor_label}</b> · <span className="muted">{fmtDateTime(c.occurred_at)}</span>
              <div>
                {c.type === "EVIDENCE" ? "📎 " + c.payload.text : c.type === "SUBMITTED" ? `Đã nộp kết quả${c.payload.note ? ": " + c.payload.note : ""}` : c.type === "REWORK" ? `Yêu cầu làm lại: ${c.payload.reason}` : c.type === "APPROVED" ? "Đã duyệt hoàn thành" : c.payload.body}
              </div>
            </div>
          ))}
          <div className="row mt-8" style={{ flexWrap: "nowrap" }}>
            <input className="input" placeholder="Viết bình luận..." value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn btn-outline" disabled={!comment.trim() || busy} onClick={() => run(() => api(`/tasks/${t.id}/comment`, { body: { body: comment } })).then(() => (setComment(""), refresh()))}>
              Gửi
            </button>
          </div>
          {is_owner && ["TODO", "IN_PROGRESS"].includes(t.status) && (
            <div className="row mt-8" style={{ flexWrap: "nowrap" }}>
              <input className="input" placeholder="Bằng chứng (mô tả/đường dẫn)..." value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              <button className="btn btn-outline" disabled={!evidence.trim() || busy} onClick={() => run(() => api(`/tasks/${t.id}/evidence`, { body: { text: evidence } }), "Đã thêm bằng chứng.").then(() => (setEvidence(""), refresh()))}>
                Thêm
              </button>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {is_owner && t.status === "TODO" && (
            <button className="btn btn-dark btn-lg btn-block" disabled={busy} onClick={() => run(() => api(`/tasks/${t.id}/accept`, { body: {} }), "Đã nhận việc.").then(refresh)}>
              <Play /> Nhận việc
            </button>
          )}
          {is_owner && t.status === "IN_PROGRESS" && (
            <button className="btn btn-dark btn-lg btn-block" disabled={busy} onClick={() => run(() => api(`/tasks/${t.id}/submit`, { body: {} }), "Đã nộp kết quả, chờ quản lý duyệt.").then(refresh)}>
              <Send /> Nộp kết quả
            </button>
          )}
          {!is_owner && t.status === "IN_PROGRESS" && (
            <button className="btn btn-dark btn-lg btn-block" disabled title="Chỉ người được giao mới nộp kết quả">
              <Send /> Nộp kết quả
            </button>
          )}
          {can_review && t.status === "SUBMITTED" && !is_owner && (
            <div className="grid g-2" style={{ gap: 10 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api(`/tasks/${t.id}/review`, { body: { decision: "APPROVE" } }), "Đã duyệt hoàn thành.").then(refresh)}>
                <CheckCircle2 /> Duyệt hoàn thành
              </button>
              <button className="btn btn-danger" onClick={() => setRework(true)}>
                <RotateCcw /> Yêu cầu làm lại
              </button>
            </div>
          )}
          {can_review && !["DONE", "CANCELLED"].includes(t.status) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCancel(true)}>
              Hủy công việc
            </button>
          )}
        </div>
      </div>
      {rework && (
        <ReasonDialog
          title="Yêu cầu làm lại"
          label="Lý do / việc cần bổ sung"
          confirmText="Gửi yêu cầu"
          onClose={() => setRework(false)}
          onSubmit={async (reason) => {
            const r = await run(() => api(`/tasks/${t.id}/review`, { body: { decision: "REWORK", reason } }), "Đã trả về để làm lại.");
            if (r) (setRework(false), refresh());
          }}
        />
      )}
      {cancel && (
        <ReasonDialog
          title="Hủy công việc"
          label="Lý do hủy"
          confirmText="Hủy công việc"
          tone="danger"
          onClose={() => setCancel(false)}
          onSubmit={async (reason) => {
            const r = await run(() => api(`/tasks/${t.id}/cancel`, { body: { reason } }), "Đã hủy công việc.");
            if (r) (setCancel(false), refresh());
          }}
        />
      )}
    </aside>
  );
}

function CreateTask({ owners, customers, onClose, onDone }: { owners: any[]; customers: any[]; onClose: () => void; onDone: (id: string) => void }) {
  const { now } = useApp();
  const tomorrow = addDays(vnDayKey(now()), 1);
  const [f, setF] = useState({ title: "", description: "", owner_id: "", due: `${tomorrow}T17:00`, priority: "MEDIUM", customer_id: "", checklist: "Xem lịch\nLiên hệ khách\nCập nhật xác nhận" });
  const [err, setErr] = useState<any>(null);
  const [sug, setSug] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const due = useMemo(() => localInputToIso(f.due), [f.due]);
  return (
    <Modal
      title="Tạo công việc"
      icon={<ClipboardList color="var(--primary)" />}
      onClose={onClose}
      dirty={!!f.title}
      size="wide"
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
                const r = await api("/tasks", {
                  body: { title: f.title, description: f.description, owner_id: f.owner_id, due_at: due, priority: f.priority, customer_id: f.customer_id || null, checklist: f.checklist.split("\n").map((s) => s.trim()).filter(Boolean) },
                });
                onDone(r.id);
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang lưu..." : "Tạo & giao việc"}
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Tên công việc" req error={fe(err, "title")} className="full">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ví dụ: Xác nhận lịch khách ngày mai" />
        </Field>
        <Field label="Hạn hoàn thành" req error={fe(err, "due_at")}>
          <input className="input" type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </Field>
        <Field label="Mức độ ưu tiên">
          <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Người phụ trách" req error={fe(err, "owner_id")}>
          <select className="select" value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>
            <option value="">— Chọn nhân sự —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Khách hàng liên quan">
          <select className="select" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
            <option value="">Không</option>
            {customers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="full">
          <button
            className="btn btn-outline-gold btn-sm"
            onClick={async () => {
              const r = await api(`/tasks/suggest-assignee${qs({ due_at: due, keyword: f.title })}`);
              setSug(r.suggestions);
            }}
          >
            <Sparkles /> AI đề xuất người nhận
          </button>
          {sug && (
            <div className="card mt-8" style={{ boxShadow: "none", padding: 10 }}>
              <div className="tiny muted">Dựa trên kỹ năng, ca làm và số việc đang mở. Quản lý xác nhận người nhận.</div>
              {sug.map((s) => (
                <div key={s.employee_id} className="list-item" style={{ alignItems: "center" }}>
                  <b style={{ minWidth: 100 }}>{s.name}</b>
                  <span className="small muted" style={{ flex: 1 }}>
                    {s.reason}
                  </span>
                  <button className="btn btn-sm btn-outline" onClick={() => setF({ ...f, owner_id: s.employee_id })}>
                    Chọn
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Field label="Mô tả" className="full">
          <textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Checklist (mỗi dòng một mục bắt buộc)" className="full">
          <textarea className="textarea" value={f.checklist} onChange={(e) => setF({ ...f, checklist: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
