"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  Flame,
  Heart,
  Info,
  Layers,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Link2,
} from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Empty, Field, Modal, PageHead, PageState, fe, useAction, useApp } from "@/components/ui";
import { READINESS_DESC, READINESS_LABEL, STAGES, STAGE_SHORT } from "@/lib/shared/labels";
import { fmtDate } from "@/lib/shared/format";
import { qs } from "@/lib/client/helpers";
import { AiSuggest, READY_TONE, ReadyIcon } from "@/components/customer-bits";

const STAGE_ICONS = [UserPlus, MessageCircle, CalendarDays, Building2, Package, Heart, CalendarCheck, RotateCcw];

export default function CustomersPage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [deb, setDeb] = useState("");
  const [stage, setStage] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDeb(term), 250);
    return () => clearTimeout(t);
  }, [term]);
  const q = useApi<any>(`/customers${qs({ q: deb, stage })}`, [deb, stage]);
  return (
    <>
      <PageHead title="Khách hàng & hành trình" sub="Quản lý khách hàng, theo dõi hành trình và mức sẵn sàng đặt lịch" actions={<DesignRefButton refKey="customers" />} />
      <PageState q={q}>
        {(d) => (
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <h2>
                  <Layers /> Hành trình khách hàng (8 bước)
                </h2>
                {stage && (
                  <div className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => setStage(null)}>
                      Bỏ lọc giai đoạn
                    </button>
                  </div>
                )}
              </div>
              <div className="card-body">
                <div className="journey">
                  {STAGES.map((s, i) => {
                    const Icon = STAGE_ICONS[i];
                    return (
                      <button key={s} className={`jstep ${stage === i + 1 ? "on" : ""}`} onClick={() => setStage(stage === i + 1 ? null : i + 1)} title={s} aria-pressed={stage === i + 1}>
                        <Icon />
                        <span>
                          {i + 1}. {STAGE_SHORT[i]}
                        </span>
                        <span className="count">{d.stage_counts[i + 1] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-body split-wide" style={{ paddingTop: 16, gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)" }}>
                <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <Info size={26} style={{ flex: "none" }} />
                  <div>
                    <h3 style={{ fontSize: 18 }}>Phân loại mức sẵn sàng đặt lịch</h3>
                    <p className="small muted" style={{ margin: "6px 0 0" }}>
                      Mức độ khả năng khách đồng ý đặt lịch, dựa trên nhu cầu và tương tác đã ghi nhận. Đây không phải đánh giá con người; nhãn có lý do, thời điểm và sửa được. Mốc liên hệ theo cấu hình doanh nghiệp.
                    </p>
                  </div>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  {(["HOT", "WARM", "COLD"] as const).map((r) => (
                    <div key={r} className={`banner ${r === "HOT" ? "danger" : r === "WARM" ? "warn" : "info"}`} style={{ padding: "8px 12px", border: 0 }}>
                      <ReadyIcon r={r} />
                      <div>
                        <b>{READINESS_LABEL[r]}:</b> {READINESS_DESC[r]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
              <section className="card">
                <div className="card-head">
                  <h2>
                    <Users /> Danh sách khách hàng (CRM)
                  </h2>
                </div>
                <div className="card-body stack" style={{ gap: 12 }}>
                  <div className="row">
                    <div className="input-icon" style={{ flex: "1 1 240px" }}>
                      <Search />
                      <input className="input" placeholder="Tìm theo tên, mã, số điện thoại..." value={term} onChange={(e) => setTerm(e.target.value)} />
                    </div>
                    <select className="select" style={{ width: 230 }} value={stage ?? ""} onChange={(e) => setStage(e.target.value ? Number(e.target.value) : null)} aria-label="Lọc theo giai đoạn">
                      <option value="">Lọc theo giai đoạn</option>
                      {STAGES.map((s, i) => (
                        <option key={s} value={i + 1}>
                          {i + 1}. {s}
                        </option>
                      ))}
                    </select>
                    {d.can_create && (
                      <button className="btn btn-gold" onClick={() => setCreating(true)}>
                        <Plus /> Thêm khách hàng
                      </button>
                    )}
                  </div>
                  {d.items.length === 0 ? (
                    <Empty title="Không có khách hàng phù hợp" text={d.minimal ? "Bạn chỉ thấy khách trong lịch hẹn của mình." : "Thử đổi từ khóa hoặc giai đoạn."} />
                  ) : (
                    <div className="table-wrap">
                      <table className="t cards">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Khách hàng</th>
                            <th>Nhân sự phụ trách</th>
                            <th>Giai đoạn vòng đời</th>
                            <th>Mức sẵn sàng</th>
                            <th>Lần theo dõi tiếp theo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.items.map((c: any, i: number) => (
                            <tr key={c.id} className="clickable" onClick={() => router.push(`/customers/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(`/customers/${c.id}`)}>
                              <td data-label="#">{i + 1}</td>
                              <td data-label="Khách hàng">
                                <span className="row" style={{ flexWrap: "nowrap" }}>
                                  <Avatar name={c.display_name} src={c.avatar} size="sm" />
                                  <b>{c.display_name}</b>
                                </span>
                              </td>
                              <td data-label="Nhân sự phụ trách">{c.assigned_name ? <Badge tone="teal">{c.assigned_name}</Badge> : <Badge>Chưa phân công</Badge>}</td>
                              <td data-label="Giai đoạn">
                                <Badge tone={c.lifecycle_stage % 2 ? "teal" : "gold"}>{STAGE_SHORT[c.lifecycle_stage - 1]}</Badge>
                              </td>
                              <td data-label="Mức sẵn sàng">
                                {c.readiness ? (
                                  <Badge tone={READY_TONE[c.readiness]} icon={<ReadyIcon r={c.readiness} />}>
                                    {READINESS_LABEL[c.readiness]}
                                    {!c.readiness_confirmed && " · AI"}
                                  </Badge>
                                ) : (
                                  <Badge>Chưa phân loại</Badge>
                                )}
                              </td>
                              <td data-label="Theo dõi tiếp">
                                <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                                  <CalendarDays size={16} /> {fmtDate(c.next_followup_at)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
              {d.ai_focus && !d.minimal ? <AiSuggest c={d.ai_focus} canEdit={d.can_edit} onDone={q.reload} /> : <div />}
            </div>
          </div>
        )}
      </PageState>
      {creating && <CreateCustomer staff={q.data?.staff ?? []} onClose={() => setCreating(false)} onDone={(id) => router.push(`/customers/${id}`)} />}
    </>
  );
}

function CreateCustomer({ staff, onClose, onDone }: { staff: any[]; onClose: () => void; onDone: (id: string) => void }) {
  const { me } = useApp();
  const [f, setF] = useState({ display_name: "", contact_phone: "", source: "", assigned_to: "", branch_id: me?.branches[0]?.id ?? "" });
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Thêm khách hàng"
      onClose={onClose}
      dirty={!!f.display_name}
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
                const r = await api("/customers", { body: { ...f, assigned_to: f.assigned_to || null } });
                onDone(r.id);
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang lưu..." : "Tạo hồ sơ"}
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="form-grid">
        <Field label="Tên khách hàng" req error={fe(err, "display_name")} className="full">
          <input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Ví dụ: Khách mẫu G" />
        </Field>
        <Field label="Số liên hệ" error={fe(err, "contact_phone") ?? (err?.extra?.field === "contact_phone" ? err.message : undefined)} hint="Chuẩn hóa và kiểm tra trùng trong doanh nghiệp">
          <input className="input" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} inputMode="tel" />
        </Field>
        <Field label="Nguồn khách">
          <input className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Zalo, Facebook, giới thiệu..." />
        </Field>
        <Field label="Chi nhánh" req>
          <select className="select" value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {me?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nhân sự phụ trách">
          <select className="select" value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
            <option value="">— Tự gán theo người tạo —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
