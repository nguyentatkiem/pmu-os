"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleCheck, CircleX, ClipboardList, Clock, FileClock, Layers, List, MessageCircle, RefreshCw, RotateCcw, ShieldCheck, Sparkles, UserRound, X, Ellipsis, Circle } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Empty, PageHead, PageState, Skeleton, SourceChip, Stat, useAction } from "@/components/ui";
import { PROPOSAL_STATUS_LABEL, PROPOSAL_TYPE_LABEL } from "@/lib/shared/labels";
import { fmtDateTime, fmtDateTimeShort } from "@/lib/shared/format";
import { qs } from "@/lib/client/helpers";

const TYPE_ICON: Record<string, any> = { SHIFT_REASSIGN: CalendarDays, SHIFT_CREATE: CalendarDays, SHIFT_ADJUST: CalendarDays, TASK_ASSIGN: ClipboardList, CUSTOMER_MESSAGE: MessageCircle, CARE_MESSAGE: MessageCircle, SOP_PUBLISH: BookOpen };
const ST_TONE: Record<string, string> = { PENDING: "gold", EXECUTED: "green", APPROVED: "teal", REJECTED: "red", RETURNED: "blue", EXPIRED: "gray", FAILED: "red", CANCELLED: "gray" };

export default function ApprovalsPage() {
  const [tab, setTab] = useState("pending");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const q = useApi<any>(`/approvals${qs({ tab, type, owner })}`, [tab, type, owner]);
  const want = useRef<string | null>(null);
  const openId = useSearchParams().get("open");
  // Mở thẳng một đề xuất từ khung chat AI / trang AI Agent: /approvals?open=<id>
  useEffect(() => {
    const id = openId;
    if (!id) return;
    want.current = id;
    api(`/approvals/${id}`)
      .then((r) => {
        const st = r.proposal.status;
        setType("");
        setOwner("");
        setTab(st === "PENDING" ? "pending" : ["APPROVED", "EXECUTED", "FAILED"].includes(st) ? "approved" : ["REJECTED", "RETURNED"].includes(st) ? "rejected" : "history");
        q.reload();
      })
      .catch(() => (want.current = null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  useEffect(() => {
    if (!q.data) return;
    if (want.current && q.data.items.some((x: any) => x.id === want.current)) {
      setSel(want.current);
      want.current = null;
      return;
    }
    if (!sel || !q.data.items.some((x: any) => x.id === sel)) setSel(q.data.items[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  useEffect(() => {
    const h = () => q.reload();
    window.addEventListener("pmu:proposals-changed", h);
    return () => window.removeEventListener("pmu:proposals-changed", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHead title="Phê duyệt & Lịch sử AI" sub="Xem, phê duyệt và theo dõi các đề xuất do AI và nhân sự tạo ra trước khi áp dụng" actions={<DesignRefButton refKey="approvals" />} />
      <PageState q={q}>
        {(d) => (
          <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(340px, 470px)" }}>
            <div className="stack compact">
              <div className="grid g-4">
                <Stat tone="teal" icon={<FileClock />} num={d.counts.pending} label="Đề xuất chờ duyệt" onClick={() => setTab("pending")} />
                <Stat tone="gold" icon={<CircleCheck />} num={d.counts.approved} label="Đã duyệt" onClick={() => setTab("approved")} />
                <Stat tone="red" icon={<CircleX />} num={d.counts.rejected} label="Từ chối / trả lại" onClick={() => setTab("rejected")} />
                <Stat tone="green" icon={<CalendarDays />} num={d.counts.history} label="Đã xử lý" onClick={() => setTab("history")} />
              </div>
              <div className="seg" style={{ width: "100%", justifyContent: "space-between" }}>
                {[
                  ["pending", `Chờ duyệt (${d.counts.pending})`],
                  ["approved", `Đã duyệt (${d.counts.approved})`],
                  ["rejected", `Từ chối (${d.counts.rejected})`],
                  ["history", `Lịch sử (${d.counts.history})`],
                ].map(([k, l]) => (
                  <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} style={{ flex: 1, justifyContent: "center", ...(tab === k ? { background: "var(--primary)", color: "#fff" } : {}) }}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="row">
                <select className="select" style={{ width: 220 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Loại đề xuất">
                  <option value="">Tất cả loại đề xuất</option>
                  {Object.entries(PROPOSAL_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select className="select" style={{ width: 230 }} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Người phụ trách">
                  <option value="">Tất cả người phụ trách</option>
                  {d.owners.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <section className="card">
                <div className="card-head">
                  <h2>
                    <List /> {tab === "pending" ? `Danh sách đề xuất chờ duyệt (${d.items.length})` : `Đề xuất ${tab === "approved" ? "đã duyệt" : tab === "rejected" ? "bị từ chối / trả lại" : "đã xử lý"} (${d.items.length})`}
                  </h2>
                </div>
                <div className="card-body table-wrap">
                  {d.items.length === 0 ? (
                    <Empty title="Không có đề xuất" text={tab === "pending" ? "Hộp chờ duyệt đang trống." : "Chưa có đề xuất trong mục này."} />
                  ) : (
                    <table className="t cards">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Đề xuất</th>
                          <th>Người phụ trách</th>
                          <th>Nguồn</th>
                          <th>Thời gian đề xuất</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((p: any, i: number) => {
                          const Icon = TYPE_ICON[p.action_type] ?? Layers;
                          return (
                            <tr key={p.id} className={`clickable ${sel === p.id ? "selected" : ""}`} onClick={() => setSel(p.id)}>
                              <td data-label="#">{i + 1}</td>
                              <td data-label="Đề xuất" style={{ minWidth: 230 }}>
                                <span className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                                  <Icon size={20} color="var(--primary)" style={{ flex: "none" }} />
                                  <span>
                                    <b>{p.title}</b>
                                    <div className="tiny muted">{p.summary}</div>
                                  </span>
                                </span>
                              </td>
                              <td data-label="Người phụ trách">{p.owner_name ? <Badge tone="teal">{p.owner_name}</Badge> : "—"}</td>
                              <td data-label="Nguồn">
                                <Badge tone="violet">{(p.source_refs?.[0]?.label ?? "—").split("·")[0].trim().slice(0, 22)}</Badge>
                              </td>
                              <td data-label="Thời gian">{fmtDateTimeShort(p.biz_created_at)}</td>
                              <td data-label="Trạng thái">
                                <Badge tone={ST_TONE[p.status]} icon={<Clock />}>
                                  {p.status === "APPROVED" && p.exec_status === "BLOCKED" ? "Đã duyệt · chưa gửi" : PROPOSAL_STATUS_LABEL[p.status]}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>
            {sel ? <Detail key={sel} id={sel} onChanged={q.reload} /> : <div />}
          </div>
        )}
      </PageState>
    </>
  );
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const q = useApi<any>(`/approvals/${id}`, [id]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const { run, busy } = useAction();
  if (!q.data) return <Skeleton h={640} />;
  const { proposal: p, decisions, execution, can_decide, expired } = q.data;
  const Icon = TYPE_ICON[p.action_type] ?? Layers;
  const refresh = () => (q.reload(), onChanged());
  const decide = async (kind: "approve" | "reject" | "return") => {
    setErr("");
    if (kind !== "approve" && !reason.trim()) return setErr("Lý do là bắt buộc khi từ chối hoặc trả chỉnh sửa.");
    const r: any = await run(() => api(`/approvals/${p.id}/${kind}`, { body: { reason } }), (x: any) =>
      x.already_decided ? x.message : x.message ?? (kind === "approve" ? (x.execution?.status === "SUCCEEDED" ? `Đã duyệt và thực thi: ${x.execution.result.message}` : `Đã duyệt. Kết quả thực thi: ${x.execution?.result?.message ?? x.status}`) : kind === "reject" ? "Đã từ chối đề xuất." : "Đã trả đề xuất để chỉnh sửa."),
    );
    if (r) (setReason(""), refresh());
  };
  const steps = [
    { label: "Đề xuất", sub: `${fmtDateTimeShort(p.biz_created_at)} (${p.requested_label})`, state: "done" },
    {
      label: p.status === "PENDING" ? "Chờ duyệt" : decisions.length ? (decisions[decisions.length - 1].decision === "APPROVE" ? "Đã duyệt" : decisions[decisions.length - 1].decision === "REJECT" ? "Từ chối" : "Trả chỉnh sửa") : PROPOSAL_STATUS_LABEL[p.status],
      sub: decisions.length ? `${decisions[decisions.length - 1].approver_label} · ${fmtDateTimeShort(decisions[decisions.length - 1].decided_at)}` : "Đang chờ phê duyệt của người có thẩm quyền",
      state: p.status === "PENDING" ? "current" : "done",
    },
    {
      label: execution ? (execution.status === "SUCCEEDED" ? "Đã thực hiện" : execution.status === "BLOCKED" ? "Bị chặn" : execution.status === "FAILED" ? "Lỗi thực thi" : "Đang chạy") : "Chưa thực hiện",
      sub: execution ? execution.result?.message ?? "" : "Sẽ thực hiện sau khi được duyệt",
      state: execution ? (execution.status === "SUCCEEDED" ? "done" : "warn") : "todo",
    },
  ];
  const pl = p.proposed_payload ?? {};
  return (
    <aside className="card" style={{ position: "sticky", top: 88, alignSelf: "start", maxHeight: "calc(100vh - 110px)", overflow: "auto" }}>
      <div className="card-head" style={{ background: "linear-gradient(180deg,#fff8ea,#fff)", borderRadius: "14px 14px 0 0", alignItems: "flex-start" }}>
        <span className="avatar lg" style={{ background: "#fdf1d8", color: "var(--gold-600)", borderRadius: 14, width: 58, height: 58 }}>
          <Icon size={28} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22 }}>Đề xuất {p.title.toLowerCase()}</h2>
          <div className="small muted">Mã đề xuất: {p.code}</div>
        </div>
        <Badge tone={ST_TONE[p.status]} icon={<Clock />}>
          {PROPOSAL_STATUS_LABEL[p.status]}
        </Badge>
      </div>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div>
          <b className="row" style={{ borderLeft: "3px solid var(--gold)", paddingLeft: 8 }}>
            Thông tin đề xuất
          </b>
          <dl className="kv mt-8" style={{ fontSize: 14 }}>
            <dt>
              <UserRound size={14} /> Người đề xuất
            </dt>
            <dd>{p.requested_label}</dd>
            <dt>
              <CalendarDays size={14} /> Thời gian đề xuất
            </dt>
            <dd>{fmtDateTime(p.biz_created_at)}</dd>
            <dt>
              <UserRound size={14} /> Người phụ trách
            </dt>
            <dd>{p.owner_name ? <Badge tone="teal">{p.owner_name}</Badge> : "—"}</dd>
            <dt>
              <Layers size={14} /> Nguồn
            </dt>
            <dd className="row" style={{ gap: 6 }}>
              {(p.source_refs ?? []).map((s: any, i: number) => (
                <SourceChip key={i} label={s.label} href={s.href} />
              ))}
            </dd>
            <dt>Hết hạn</dt>
            <dd style={{ color: expired ? "var(--danger)" : undefined }}>{fmtDateTime(p.expires_at)}</dd>
          </dl>
        </div>
        <div>
          <b className="row" style={{ borderLeft: "3px solid var(--gold)", paddingLeft: 8 }}>
            Nội dung điều chỉnh
          </b>
          <div className="row mt-8" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
            <div className="card" style={{ flex: 1, boxShadow: "none", padding: 12, background: "#eef7fb" }}>
              <div className="small" style={{ color: "var(--info)" }}>
                Trước điều chỉnh
              </div>
              <Snapshot v={p.before_snapshot} />
            </div>
            <ArrowRight color="var(--gold)" style={{ alignSelf: "center", flex: "none" }} />
            <div className="card" style={{ flex: 1, boxShadow: "none", padding: 12, background: "#eef8f1" }}>
              <div className="small" style={{ color: "var(--ok)" }}>
                Sau điều chỉnh
              </div>
              <Snapshot v={p.after_snapshot ?? (pl.body ? { body: pl.body } : null)} />
            </div>
          </div>
          <dl className="kv mt-12" style={{ fontSize: 14 }}>
            <dt>
              <MessageCircle size={14} /> Lý do đề xuất
            </dt>
            <dd style={{ fontWeight: 400 }}>{p.reason}</dd>
            <dt>
              <CalendarDays size={14} /> Ảnh hưởng
            </dt>
            <dd>
              {(p.affected ?? []).length ? (
                p.affected.map((a: any, i: number) => (
                  <div key={i} style={{ fontWeight: 500 }}>
                    {a.label}
                  </div>
                ))
              ) : (
                <span className="muted" style={{ fontWeight: 400 }}>
                  Không có đối tượng khác bị ảnh hưởng
                </span>
              )}
            </dd>
          </dl>
        </div>
        <div>
          <b className="row" style={{ borderLeft: "3px solid var(--gold)", paddingLeft: 8 }}>
            Luồng thực thi
          </b>
          <div className="row mt-12" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 0 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
                <div style={{ display: "grid", placeItems: "center" }}>
                  <span
                    className="avatar"
                    style={{
                      width: 34,
                      height: 34,
                      background: s.state === "done" ? "var(--ok)" : s.state === "current" ? "#fff" : s.state === "warn" ? "var(--gold-50)" : "#fff",
                      color: s.state === "done" ? "#fff" : s.state === "warn" ? "var(--gold-600)" : "var(--gold-600)",
                      border: s.state === "done" ? 0 : `2px solid ${s.state === "todo" ? "#c8d3d3" : "var(--gold)"}`,
                    }}
                  >
                    {s.state === "done" ? <CheckCircle2 size={18} /> : s.state === "current" ? <Ellipsis size={18} /> : s.state === "warn" ? <RefreshCw size={16} /> : <Circle size={12} color="#c8d3d3" />}
                  </span>
                </div>
                <b className="small">{s.label}</b>
                <div className="tiny muted" style={{ padding: "0 4px" }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
        {decisions.length > 0 && (
          <div className="small">
            {decisions.map((x: any) => (
              <div key={x.id} className="list-item">
                <Badge tone={x.decision === "APPROVE" ? "green" : x.decision === "REJECT" ? "red" : "blue"}>{x.decision === "APPROVE" ? "Duyệt" : x.decision === "REJECT" ? "Từ chối" : "Trả lại"}</Badge>
                <span>
                  {x.approver_label} · {fmtDateTime(x.decided_at)}
                  {x.reason && <div className="muted">Lý do: {x.reason}</div>}
                </span>
              </div>
            ))}
          </div>
        )}
        {execution && ["BLOCKED", "FAILED"].includes(execution.status) && can_decide && (
          <div className="banner warn">
            <ShieldCheck />
            <div style={{ flex: 1 }}>
              {execution.result?.message}
              <div className="tiny">Số lần thực thi: {execution.attempts}. Thử lại dùng cùng khóa chống trùng, không tạo bản ghi lặp.</div>
            </div>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => api(`/approvals/${p.id}/retry`, { body: {} }), (r: any) => `Kết quả: ${r.execution.result.message}`).then(refresh)}>
              <RotateCcw /> Thử lại an toàn
            </button>
          </div>
        )}
        {p.status === "PENDING" && (
          <>
            {can_decide ? (
              <>
                <div className="field">
                  <label>
                    Lý do <span className="req">*</span> <span className="tiny muted">(bắt buộc khi từ chối / trả chỉnh sửa)</span>
                  </label>
                  <textarea className="textarea" maxLength={500} placeholder="Nhập lý do phê duyệt hoặc từ chối..." value={reason} onChange={(e) => (setReason(e.target.value), setErr(""))} />
                  <div className="row-between">
                    <span className="err">{err}</span>
                    <span className="tiny muted">{reason.length}/500</span>
                  </div>
                </div>
                {expired && <div className="banner danger small">Đề xuất đã quá hạn; khi bấm duyệt hệ thống sẽ đánh dấu hết hạn và không thực thi.</div>}
                <div className="grid g-2" style={{ gap: 10 }}>
                  <button className="btn btn-dark btn-lg" disabled={busy} onClick={() => decide("approve")}>
                    <CheckCircle2 /> Duyệt đề xuất
                  </button>
                  <button className="btn btn-danger btn-lg" disabled={busy} onClick={() => decide("reject")}>
                    <X /> Từ chối
                  </button>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => decide("return")}>
                  <RotateCcw /> Trả chỉnh sửa
                </button>
              </>
            ) : (
              <div className="banner info small">Bạn không đủ thẩm quyền duyệt loại đề xuất này ({p.required_permission}).</div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/approvals/${p.id}/cancel`, { body: {} }), "Đã hủy đề xuất.").then(refresh)}>
              Hủy đề xuất (người tạo)
            </button>
          </>
        )}
        <div className="tiny muted">
          <Sparkles size={12} /> Duyệt hai lần không thực thi hai lần; nếu dữ liệu gốc thay đổi, đề xuất được trả lại để xem xét.
        </div>
      </div>
    </aside>
  );
}

function Snapshot({ v }: { v: any }) {
  if (!v) return <div className="small muted">—</div>;
  if (v.employee)
    return (
      <div className="mt-8">
        <div className="row strong">
          <UserRound size={16} /> {v.employee}
        </div>
        <div className="row">
          <Clock size={16} /> {v.time}
        </div>
        {v.day && <div className="tiny muted">{v.day.split("-").reverse().join("/")}</div>}
      </div>
    );
  if (v.body) return <div className="small mt-8">“{v.body}”</div>;
  if (v.title)
    return (
      <div className="small mt-8">
        <b>{v.title}</b>
        <div>{v.owner}</div>
        <div className="muted">{v.due}</div>
      </div>
    );
  return <div className="small mt-8 strong">{v.status ?? v.note ?? JSON.stringify(v)}</div>;
}
