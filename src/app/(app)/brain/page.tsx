"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, BadgeCheck, BookOpen, Brain, ChartColumn, Lightbulb, Plus, Scale, Search, ShieldCheck, Sparkles, StickyNote, Gavel } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Empty, Field, Modal, PageHead, PageState, Stat, useAction, useApp } from "@/components/ui";
import { fmtDate, fmtTime, relativeDay } from "@/lib/shared/format";

const TABS: [string, string][] = [
  ["", "Tất cả"],
  ["PENDING", "Chờ duyệt"],
  ["RULE", "Quy tắc"],
  ["LESSON", "Bài học"],
  ["INSIGHT", "Insight khách"],
  ["MEMORY", "Ghi nhớ"],
  ["DECISION", "Quyết định"],
  ["KNOWLEDGE", "FAQ & SOP"],
];
const KIND_ICON: Record<string, React.ElementType> = { RULE: Scale, LESSON: Lightbulb, INSIGHT: ChartColumn, MEMORY: StickyNote, DECISION: Gavel, FAQ: BookOpen, POLICY: ShieldCheck, SOP: BookOpen };
const KIND_TONE: Record<string, string> = { RULE: "red", LESSON: "gold", INSIGHT: "blue", MEMORY: "violet", DECISION: "teal", FAQ: "green", POLICY: "green", SOP: "green" };
const CONF: Record<string, string> = { HIGH: "Độ tin cậy cao", MEDIUM: "Độ tin cậy vừa", LOW: "Giả thuyết" };

export default function BrainPage() {
  const { now } = useApp();
  const sp = useSearchParams();
  const [kind, setKind] = useState("");
  const [term, setTerm] = useState("");
  const [qText, setQText] = useState("");
  const [adding, setAdding] = useState(false);
  const data = useApi<any>(`/brain?kind=${kind}&q=${encodeURIComponent(qText)}`, [kind, qText]);
  const { run, busy } = useAction();
  const openId = sp.get("open");
  useEffect(() => {
    const t = setTimeout(() => setQText(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => {
    if (!openId || !data.data) return;
    const el = document.getElementById(`note-${openId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
    }
  }, [openId, data.data]);

  const review = async (id: string, action: "approve" | "archive") => {
    const r = await run(() => api(`/brain/${id}/review`, { body: { action } }), (x: any) => x.message);
    if (r) data.reload();
  };

  return (
    <>
      <PageHead
        title="Bộ não thứ 2"
        sub="Kho tri thức dùng chung của đội AI Agent: quy tắc, bài học, insight khách, ghi nhớ vận hành, quyết định, FAQ và SOP đã duyệt. Agent chỉ dùng mục đã duyệt và luôn trích nguồn."
        actions={
          data.data?.can_review && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus /> Thêm ghi nhớ
            </button>
          )
        }
      />
      <PageState q={data}>
        {(d) => (
          <>
            {d.simulated && (
              <div className="banner warn mb-16">
                <Brain />
                <div>Nội dung đang hiển thị là DỮ LIỆU MÔ PHỎNG để chạy thử. Mục có nhãn “Giả thuyết” chưa được kiểm chứng bằng số liệu thật.</div>
              </div>
            )}
            <div className="grid g-4 mb-16">
              <Stat tone="teal" icon={<Brain />} num={d.stats.active} label="Mục tri thức agent đang dùng" />
              <Stat tone="gold" icon={<Lightbulb />} num={d.stats.pending} label="Bài học / insight chờ duyệt" onClick={() => setKind("PENDING")} />
              <Stat tone="blue" icon={<Search />} num={d.stats.lookups_7d} label="Lượt agent tra 7 ngày" />
              <Stat tone="green" icon={<Sparkles />} num={d.stats.uses} label="Lượt ghi nhớ được dùng" />
            </div>
            <div className="agent-layout" style={{ gridTemplateColumns: "minmax(0,1fr) 380px" }}>
              <div className="stack" style={{ gap: 14 }}>
                <div className="row" style={{ gap: 8 }}>
                  <div className="input-icon" style={{ flex: "1 1 260px" }}>
                    <Search />
                    <input className="input" placeholder="Tìm trong Bộ não: giá, đổi lịch, ca chiều..." value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Tìm trong Bộ não" />
                  </div>
                </div>
                <div className="seg" style={{ flexWrap: "wrap" }}>
                  {TABS.map(([k, l]) => {
                    const n = k === "" ? d.counts.all : k === "PENDING" ? d.counts.pending : k === "KNOWLEDGE" ? d.counts.knowledge : d.counts[k];
                    return (
                      <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                        {l} ({n ?? 0})
                      </button>
                    );
                  })}
                </div>
                {d.items.length === 0 && <Empty title="Không có mục phù hợp" text="Thử từ khóa khác hoặc chọn nhóm khác." />}
                <div className="grid g-2">
                  {d.items.map((n: any) => {
                    const Icon = KIND_ICON[n.kind] ?? Brain;
                    return (
                      <article key={`${n.source}-${n.id}`} id={`note-${n.id}`} className={`card card-pad brain-card ${n.status === "PENDING" ? "pending" : ""}`}>
                        <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                          <span className="brain-ico" data-tone={KIND_TONE[n.kind]}>
                            <Icon size={18} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="row" style={{ gap: 6 }}>
                              <Badge tone={KIND_TONE[n.kind] ?? "gray"}>{n.kind_label}</Badge>
                              {n.status === "PENDING" && <Badge tone="gold">Chờ duyệt</Badge>}
                              {n.confidence && n.source === "note" && <span className="tiny muted">{CONF[n.confidence]}</span>}
                            </div>
                            <b style={{ display: "block", marginTop: 6 }}>{n.title}</b>
                          </div>
                        </div>
                        <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                          {n.body}
                        </div>
                        {!!n.tags?.length && (
                          <div className="row" style={{ gap: 4, marginTop: 8 }}>
                            {n.tags.slice(0, 6).map((t: string) => (
                              <span key={t} className="brain-tag">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="tiny muted" style={{ marginTop: 8 }}>
                          {n.author_label}
                          {n.source_label ? ` · nguồn: ${n.source_label}` : ""}
                          {n.biz_created_at ? ` · ${fmtDate(n.biz_created_at)}` : ""}
                          {n.source === "note" ? ` · agent dùng ${n.uses ?? 0} lần` : ""}
                          {n.reviewed_by_label && n.status === "ACTIVE" && n.agent ? ` · duyệt bởi ${n.reviewed_by_label}` : ""}
                        </div>
                        {n.source === "note" && d.can_review && (
                          <div className="row" style={{ marginTop: 10, gap: 6 }}>
                            {n.status === "PENDING" && (
                              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => review(n.id, "approve")}>
                                <BadgeCheck size={16} /> Duyệt cho agent dùng
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => review(n.id, "archive")}>
                              <Archive size={16} /> Lưu trữ
                            </button>
                          </div>
                        )}
                        {n.source !== "note" && n.source_href && (
                          <Link href={n.source_href} className="link small" style={{ marginTop: 8, display: "inline-block" }}>
                            Mở tại {n.source_label}
                          </Link>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="stack" style={{ gap: 14 }}>
                <section className="card">
                  <div className="card-head">
                    <h3>
                      <ChartColumn /> Ý định khách 7 ngày
                    </h3>
                    <div className="sub">{d.intents.total} tin khách gửi đến, đếm theo từ khóa (không phải mô hình ngôn ngữ).</div>
                  </div>
                  <div className="card-body">
                    {d.intents.counts.map((c: any) => {
                      const max = Math.max(1, ...d.intents.counts.map((x: any) => x.n));
                      return (
                        <div key={c.label} style={{ marginBottom: 8 }}>
                          <div className="row-between small">
                            <span>{c.label}</span>
                            <b>{c.n}</b>
                          </div>
                          <div className="progress" style={{ marginTop: 4 }}>
                            <span style={{ width: `${(c.n / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="card">
                  <div className="card-head">
                    <h3>
                      <Search /> Agent vừa tra Bộ não
                    </h3>
                  </div>
                  <div className="card-body">
                    {d.lookups.length === 0 && <div className="small muted">Chưa có lượt tra cứu.</div>}
                    {d.lookups.map((l: any) => (
                      <div key={l.id} className="list-item" style={{ padding: "8px 0" }}>
                        <Brain size={16} color="var(--gold-600)" style={{ flex: "none", marginTop: 2 }} />
                        <div className="small" style={{ minWidth: 0 }}>
                          <b>{l.agent_name}</b> tra “{l.query}”
                          <div className="tiny muted">
                            {relativeDay(l.biz_at, now())} {fmtTime(l.biz_at)} · {(l.hits ?? []).length ? (l.hits ?? []).map((h: any) => h.label).join(" · ") : "không có mục khớp"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </PageState>
      {adding && <AddNote onClose={() => setAdding(false)} onSaved={() => (setAdding(false), data.reload())} />}
    </>
  );
}

function AddNote({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ kind: "MEMORY", title: "", body: "", tags: "" });
  const [err, setErr] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Modal
      title="Thêm vào Bộ não thứ 2"
      onClose={onClose}
      dirty={!!(f.title || f.body)}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setErr(null);
              try {
                await api("/brain", { body: f });
                onSaved();
              } catch (e) {
                setErr(e);
              }
            }}
          >
            {busy ? "Đang lưu..." : "Lưu, agent dùng ngay"}
          </button>
        </>
      }
    >
      {err && !err.field_errors && <div className="banner danger mb-16">{err.message}</div>}
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Loại">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="MEMORY">Ghi nhớ vận hành</option>
            <option value="RULE">Quy tắc</option>
            <option value="DECISION">Quyết định</option>
            <option value="LESSON">Bài học</option>
          </select>
        </Field>
        <Field label="Tiêu đề" req error={err?.field_errors?.title}>
          <input className="input" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ví dụ: Không xếp 2 lịch PMU mí trùng giờ tại Hà Đông" />
        </Field>
        <Field label="Nội dung" req error={err?.field_errors?.body}>
          <textarea className="textarea" rows={4} value={f.body} maxLength={1200} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <Field label="Từ khóa" hint="Cách nhau bằng dấu phẩy; agent dùng để tìm đúng mục">
          <input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="mí, hà đông, phòng" />
        </Field>
      </div>
    </Modal>
  );
}
