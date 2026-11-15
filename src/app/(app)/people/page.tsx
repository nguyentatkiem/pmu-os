"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Ban, CalendarDays, CheckCircle2, Clock, ClipboardList, MapPin, Pencil, Plus, Search, Star, UserPlus, UserRound, Users, X } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, ReasonDialog, Skeleton, fe, useAction, useApp } from "@/components/ui";
import { POSITION_LABEL, TASK_STATUS_LABEL, WORK_STATUS_LABEL } from "@/lib/shared/labels";
import { fmtDate, fmtDateTime, fmtRange, fmtWeekday } from "@/lib/shared/format";
import { POSITION_TONE, qs, shiftLabel } from "@/lib/client/helpers";

const WS_TONE: Record<string, string> = { WORKING: "var(--ok)", AVAILABLE: "#3b82f6", ON_LEAVE: "var(--gold-600)" };

export default function PeoplePage() {
  const sp = useSearchParams();
  const [term, setTerm] = useState("");
  const [pos, setPos] = useState("");
  const [sel, setSel] = useState<string | null>(sp.get("open"));
  const [adding, setAdding] = useState(false);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);
  const q = useApi<any>(`/people${qs({ q: debounced, position: pos })}`, [debounced, pos]);
  useEffect(() => {
    if (!sel && q.data?.items?.length) setSel(q.data.items.find((x: any) => x.code === "D")?.id ?? q.data.items[0].id);
  }, [q.data, sel]);

  return (
    <>
      <PageHead
        title="Nhân sự & hồ sơ"
        sub="Quản lý danh sách nhân sự, hồ sơ và phân công công việc"
        actions={
          <>
            <DesignRefButton refKey="people" />
            {q.data?.can_manage && (
              <button className="btn btn-dark" onClick={() => setAdding(true)}>
                <Plus /> Thêm nhân sự
              </button>
            )}
          </>
        }
      />
      <div className="row mb-16" style={{ gap: 14 }}>
        <div className="input-icon" style={{ flex: "1 1 320px", maxWidth: 540 }}>
          <Search />
          <input className="input" placeholder="Tìm kiếm nhân sự (A – H)..." value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Tìm kiếm nhân sự" />
        </div>
        <label className="row" style={{ gap: 8 }}>
          <span>Vị trí:</span>
          <select className="select" style={{ width: 230 }} value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">Tất cả vị trí</option>
            {Object.entries(POSITION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v} {q.data?.counts?.[k] ? `(${q.data.counts[k]})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PageState q={q}>
        {(d) => (
          <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px, 530px)" }}>
            <section className="card">
              <div className="card-head">
                <h2>
                  <Users /> Danh sách nhân sự ({d.items.filter((x: any) => x.active).length})
                </h2>
              </div>
              <div className="card-body">
                {d.items.length === 0 ? (
                  <Empty title="Không có nhân sự phù hợp" text="Thử đổi từ khóa hoặc bộ lọc vị trí." action={d.can_manage ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus /> Thêm nhân sự</button> : undefined} />
                ) : (
                  <div className="table-wrap">
                    <table className="t cards">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Nhân sự</th>
                          <th>Vị trí</th>
                          <th>Ca hôm nay</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((e: any, i: number) => (
                          <tr key={e.id} className={`clickable ${sel === e.id ? "selected" : ""}`} onClick={() => setSel(e.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && setSel(e.id)}>
                            <td data-label="#">{i + 1}</td>
                            <td data-label="Nhân sự">
                              <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                                <Avatar name={e.display_name} /> <b style={{ fontWeight: 500 }}>{e.display_name}</b>
                              </span>
                            </td>
                            <td data-label="Vị trí">
                              <Badge tone={POSITION_TONE[e.position]}>{POSITION_LABEL[e.position]}</Badge>
                            </td>
                            <td data-label="Ca hôm nay">
                              {e.today_shifts?.length ? (
                                e.today_shifts.map((s: any, k: number) => (
                                  <Badge key={k} tone="teal" icon={<CalendarDays />}>
                                    {shiftLabel(s).length > 6 ? shiftLabel(s) : `Ca ${shiftLabel(s).toLowerCase()}`}
                                  </Badge>
                                ))
                              ) : (
                                <Badge tone="gray">Không có ca</Badge>
                              )}
                            </td>
                            <td data-label="Trạng thái">
                              {!e.active ? (
                                <Badge tone="gray" icon={<Ban />}>Ngừng truy cập</Badge>
                              ) : (
                                <span className="dot-status" style={{ color: WS_TONE[e.work_status] }}>
                                  <span style={{ color: "var(--text)" }}>{WORK_STATUS_LABEL[e.work_status]}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
            {sel ? <Detail id={sel} onClose={() => setSel(null)} onChanged={q.reload} /> : null}
          </div>
        )}
      </PageState>
      {adding && <AddModal onClose={() => setAdding(false)} onDone={() => (setAdding(false), q.reload())} />}
    </>
  );
}

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const q = useApi<any>(`/people/${id}`, [id]);
  const [mode, setMode] = useState<"" | "edit" | "invite" | "off">("");
  const { run } = useAction();
  if (q.loading && !q.data) return <Skeleton h={560} />;
  if (!q.data) return null;
  const { employee: e, account, shifts, tasks, leaves, learning, branch_name, can_manage } = q.data;
  const today = shifts.filter((s: any) => fmtDate(s.start_at) === fmtDate(new Date()) || true).slice(0, 1);
  const avail = e.availability ?? {};
  const slotTxt = (avail.slots ?? []).map((s: string) => (s === "S" ? "Ca sáng" : "Ca chiều")).join(", ") || "Chưa khai báo";
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          <UserRound /> Hồ sơ nhân sự
        </h2>
        <div className="right">
          <button className="icon-btn" onClick={onClose} aria-label="Đóng hồ sơ">
            <X />
          </button>
        </div>
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Avatar name={e.display_name} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 22 }}>{e.display_name}</h3>
            <div className="row mt-8">
              <Badge tone={POSITION_TONE[e.position]}>{POSITION_LABEL[e.position]}</Badge>
              <span className="dot-status" style={{ color: e.active ? WS_TONE[e.work_status] : "#999" }}>
                <span style={{ color: "var(--text)" }}>{e.active ? WORK_STATUS_LABEL[e.work_status] : "Ngừng truy cập"}</span>
              </span>
            </div>
          </div>
          {can_manage && (
            <button className="btn btn-outline-gold" onClick={() => setMode("edit")}>
              <Pencil /> Chỉnh sửa
            </button>
          )}
        </div>
        <div className="grid g-2" style={{ gap: 12 }}>
          <Tile icon={<CalendarDays />} label="Ca sắp tới" value={today[0] ? `${fmtWeekday(today[0].start_at)} · ${fmtRange(today[0].start_at, today[0].end_at)}` : "Chưa có ca"} />
          <Tile icon={<MapPin />} label="Chi nhánh làm việc" value={branch_name} />
          <Tile icon={<Clock />} label="Khả dụng" value={<Badge tone="green">{e.work_status === "ON_LEAVE" ? "Đang nghỉ" : "Sẵn sàng nhận việc"}</Badge>} />
          <Tile icon={<CalendarDays />} label="Lịch khả dụng" value={slotTxt} />
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="card-pad">
            <b className="row">
              <Star size={18} color="var(--gold-600)" /> Kỹ năng
            </b>
            <div className="row mt-8">
              {e.skills.length ? e.skills.map((s: string) => <Badge key={s} tone="green" icon={<CheckCircle2 />}>{s}</Badge>) : <span className="muted small">Chưa khai báo kỹ năng</span>}
            </div>
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none" }}>
          <div className="card-pad">
            <b className="row">
              <ClipboardList size={18} color="var(--primary)" /> Công việc được phân công ({tasks.filter((t: any) => t.status !== "DONE").length} đang mở)
            </b>
            {tasks.length === 0 && <div className="muted small mt-8">Chưa có công việc.</div>}
            {tasks.map((t: any) => (
              <Link key={t.id} href={`/tasks?open=${t.id}`} className="list-item" style={{ alignItems: "center" }}>
                <input type="checkbox" readOnly checked={t.status === "DONE"} aria-label={TASK_STATUS_LABEL[t.status]} />
                <span style={{ flex: 1, textDecoration: t.status === "DONE" ? "line-through" : undefined, color: t.status === "DONE" ? "var(--muted)" : undefined }}>{t.title}</span>
                <Badge tone="gold" icon={<CalendarDays />}>{fmtDate(t.due_at)}</Badge>
              </Link>
            ))}
          </div>
        </div>
        {(leaves.length > 0 || learning.length > 0) && (
          <div className="small">
            {leaves.map((l: any, i: number) => (
              <div key={i} className="banner warn mt-8">
                Nghỉ phép {fmtDateTime(l.start_at)} → {fmtDateTime(l.end_at)}: {l.reason}
              </div>
            ))}
            {learning.map((l: any, i: number) => (
              <div key={i} className="row mt-8">
                <Badge tone={l.status === "ASSIGNED" ? "red" : "green"}>{l.status === "ASSIGNED" ? "Chưa làm bài" : l.status === "SUBMITTED" ? `Đã nộp ${l.score}/${l.total}` : `Đã đánh giá ${l.score}/${l.total}`}</Badge>
                SOP {l.title} v{l.version_label}
              </div>
            ))}
          </div>
        )}
        {can_manage && (
          <div className="row" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <span className="small muted" style={{ flex: 1 }}>
              Tài khoản: {account ? `${account.email} · ${account.status === "INVITED" ? "Đã mời" : account.status === "DISABLED" ? "Ngừng truy cập" : "Đang hoạt động"}` : "Chưa có tài khoản"}
            </span>
            {!account && (
              <button className="btn btn-outline btn-sm" onClick={() => setMode("invite")}>
                <UserPlus /> Mời thành viên
              </button>
            )}
            {e.active ? (
              <button className="btn btn-danger btn-sm" onClick={() => setMode("off")}>
                <Ban /> Ngừng truy cập
              </button>
            ) : (
              <button className="btn btn-outline btn-sm" onClick={() => run(() => api(`/people/${e.id}/activate`, { body: {} }), "Đã mở lại truy cập.").then(() => (q.reload(), onChanged()))}>
                Mở lại truy cập
              </button>
            )}
          </div>
        )}
      </div>
      {mode === "edit" && <EditModal e={e} onClose={() => setMode("")} onDone={() => (setMode(""), q.reload(), onChanged())} />}
      {mode === "invite" && <InviteModal id={e.id} onClose={() => setMode("")} onDone={() => (setMode(""), q.reload())} />}
      {mode === "off" && (
        <ReasonDialog
          title={`Ngừng truy cập ${e.display_name}`}
          label="Lý do (lưu nhật ký)"
          confirmText="Ngừng truy cập"
          tone="danger"
          extra={<div className="banner warn mb-16">Tài khoản sẽ bị đăng xuất và không đăng nhập được. Hồ sơ và lịch sử nghiệp vụ được giữ nguyên (không xóa cứng).</div>}
          onClose={() => setMode("")}
          onSubmit={async (reason) => {
            const r = await run(() => api(`/people/${e.id}/deactivate`, { body: { reason } }), (x: any) => x.message);
            if (r) {
              setMode("");
              q.reload();
              onChanged();
            }
          }}
        />
      )}
    </section>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="card" style={{ boxShadow: "none", padding: "12px 14px", display: "flex", gap: 12 }}>
      <span style={{ color: "var(--primary)" }}>{icon}</span>
      <div>
        <div className="small muted">{label}</div>
        <div className="strong">{value}</div>
      </div>
    </div>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useApp();
  const [f, setF] = useState({ display_name: "", position: "TECHNICIAN", branch_id: me?.branches[0]?.id ?? "", skills: "", contact_phone: "" });
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const dirty = !!f.display_name;
  return (
    <Modal
      title="Thêm nhân sự"
      onClose={onClose}
      dirty={dirty}
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
              try {
                await api("/people", { body: { ...f, skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean) } });
                onDone();
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang lưu..." : "Lưu hồ sơ"}
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Tên nhân sự" req error={fe(err, "display_name")} className="full">
          <input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Ví dụ: Nhân sự I" />
        </Field>
        <Field label="Vị trí" req error={fe(err, "position")}>
          <select className="select" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>
            {Object.entries(POSITION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chi nhánh" req error={fe(err, "branch_id")}>
          <select className="select" value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {me?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kỹ năng" hint="Phân tách bằng dấu phẩy" className="full">
          <input className="input" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
        </Field>
        <Field label="Số liên hệ nội bộ" className="full" hint="Không bắt buộc. Chỉ quản lý được xem.">
          <input className="input" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function EditModal({ e, onClose, onDone }: { e: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    display_name: e.display_name,
    position: e.position,
    skills: e.skills.join(", "),
    work_status: e.work_status,
    slots: e.availability?.slots ?? ["S", "C"],
    days: e.availability?.days ?? [1, 2, 3, 4, 5, 6, 0],
  });
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (arr: any[], v: any) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Modal
      title={`Chỉnh sửa ${e.display_name}`}
      onClose={onClose}
      dirty
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
              try {
                await api(`/people/${e.id}`, {
                  method: "PATCH",
                  body: {
                    expected_version: e.version,
                    display_name: f.display_name,
                    position: f.position,
                    work_status: f.work_status,
                    skills: f.skills.split(",").map((s: string) => s.trim()).filter(Boolean),
                    availability: { ...(e.availability ?? {}), slots: f.slots, days: f.days },
                  },
                });
                onDone();
              } catch (x) {
                setErr(x);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Tên nhân sự" req error={fe(err, "display_name")} className="full">
          <input className="input" value={f.display_name} onChange={(x) => setF({ ...f, display_name: x.target.value })} />
        </Field>
        <Field label="Vị trí" req>
          <select className="select" value={f.position} onChange={(x) => setF({ ...f, position: x.target.value })}>
            {Object.entries(POSITION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trạng thái làm việc">
          <select className="select" value={f.work_status} onChange={(x) => setF({ ...f, work_status: x.target.value })}>
            {Object.entries(WORK_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kỹ năng" hint="Phân tách bằng dấu phẩy" className="full">
          <input className="input" value={f.skills} onChange={(x) => setF({ ...f, skills: x.target.value })} />
        </Field>
        <Field label="Ca khả dụng" className="full">
          <div className="row">
            {[
              ["S", "Ca sáng"],
              ["C", "Ca chiều"],
            ].map(([k, v]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={f.slots.includes(k)} onChange={() => setF({ ...f, slots: toggle(f.slots, k) })} /> {v}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Ngày khả dụng" className="full">
          <div className="row">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="check">
                <input type="checkbox" checked={f.days.includes(d)} onChange={() => setF({ ...f, days: toggle(f.days, d) })} /> {d === 0 ? "CN" : `T${d + 1}`}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function InviteModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      title="Mời thành viên"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={async () => (await run(() => api(`/people/${id}/invite`, { body: { email } }), (r: any) => r.message)) && onDone()}>
            Tạo lời mời
          </button>
        </>
      }
    >
      <Field label="Email nhân sự" req hint="Vai trò được gán theo vị trí của hồ sơ.">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
    </Modal>
  );
}
