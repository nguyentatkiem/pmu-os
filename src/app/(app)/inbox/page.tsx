"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Info,
  LayoutList,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  UserRound,
  Users,
  Wrench,
  Flag,
  Radio,
  ArrowLeft,
} from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Avatar, Badge, DesignRefButton, Empty, Modal, PageHead, PageState, SourceChip, Skeleton, useAction, useApp } from "@/components/ui";
import { DELIVERY_LABEL, STAGE_SHORT } from "@/lib/shared/labels";
import { fmtTime, relativeDay, vnDayKey, fmtDate, fmtWeekday } from "@/lib/shared/format";
import { qs } from "@/lib/client/helpers";

const TABS: [string, string][] = [
  ["zalo", "Zalo"],
  ["all", "Tất cả"],
  ["new", "Chưa xử lý"],
  ["open", "Đang xử lý"],
  ["done", "Đã hoàn thành"],
  ["follow", "Cần theo dõi"],
];
const PAGE = 5;

export default function InboxPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState("zalo");
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState<string | null>(sp.get("open"));
  const [page, setPage] = useState(0);
  const [guide, setGuide] = useState(false);
  const q = useApi<any>(`/conversations${qs({ tab, q: term })}`, [tab, term]);
  const { now } = useApp();
  useEffect(() => {
    if (!sel && q.data?.items?.length && typeof window !== "undefined" && window.innerWidth > 860) setSel(q.data.items[0].id);
  }, [q.data, sel]);
  useEffect(() => setPage(0), [tab, term]);

  return (
    <>
      <PageHead title="Hội thoại & Zalo" sub="Quản lý hội thoại khách hàng đa kênh, soạn thảo trả lời bằng AI và phân công xử lý." actions={<DesignRefButton refKey="inbox" />} />
      <PageState q={q}>
        {(d) => {
          const pageItems = d.items.slice(page * PAGE, page * PAGE + PAGE);
          return (
            <div className="stack">
              {d.integration.health !== "CONNECTED" && (
                <div className="card" style={{ background: "linear-gradient(90deg,#fff4f4,#fff)", borderColor: "#f3cccc" }}>
                  <div className="card-pad row" style={{ gap: 18 }}>
                    <img src="/brand/zalo.png" alt="Zalo" style={{ width: 64, height: 64 }} />
                    <div style={{ flex: 1, minWidth: 240, borderLeft: "2px solid #e8a3a3", paddingLeft: 18 }}>
                      <b style={{ color: "var(--danger)", fontSize: 21 }}>ZALO CHƯA KẾT NỐI — Chế độ mô phỏng</b>
                      <div className="muted">Đây là dữ liệu mô phỏng để trải nghiệm giao diện và quy trình. Chưa có kết nối Zalo thực tế; không tin nào được gửi ra ngoài.</div>
                    </div>
                    <Link className="btn btn-outline-gold" href="/settings?tab=integrations">
                      <Wrench /> Kết nối Zalo
                    </Link>
                    <button className="btn btn-ghost" onClick={() => setGuide(true)}>
                      <Info /> Hướng dẫn kết nối
                    </button>
                  </div>
                </div>
              )}
              <div className="pill-tabs" role="tablist">
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                    {k === "zalo" ? <img src="/brand/zalo.png" alt="" style={{ width: 22, height: 22 }} /> : k === "all" ? <MessageSquare size={18} /> : k === "new" ? <UserRound size={18} /> : k === "open" ? <Clock size={18} /> : k === "done" ? <CheckCircle2 size={18} /> : <Flag size={18} />}
                    {label} ({d.counts[k]})
                  </button>
                ))}
              </div>
              <div className="three-col" style={{ gridTemplateColumns: "330px minmax(0,1fr) 400px" }}>
                <section className={`card ${sel ? "desktop-only" : ""}`} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="card-pad row" style={{ flexWrap: "nowrap" }}>
                    <div className="input-icon" style={{ flex: 1 }}>
                      <Search />
                      <input className="input" placeholder="Tìm theo tên hoặc nội dung..." value={term} onChange={(e) => setTerm(e.target.value)} />
                    </div>
                    <span className="icon-btn" title="Lọc theo tab phía trên" aria-hidden>
                      <Filter />
                    </span>
                  </div>
                  {pageItems.length === 0 && <Empty title="Không có hội thoại" text="Không có hội thoại trong mục này." img={false} />}
                  {pageItems.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => setSel(c.id)}
                      className="row"
                      style={{ border: 0, borderTop: "1px solid var(--border)", padding: "14px 16px", background: sel === c.id ? "linear-gradient(90deg,#fdf0d6,#fff8ea)" : "#fff", textAlign: "left", flexWrap: "nowrap", alignItems: "flex-start", cursor: "pointer", width: "100%" }}
                    >
                      <Avatar name={c.customer} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b>{c.customer}</b>
                        <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {c.last_direction === "OUT" ? "Bạn: " : ""}
                          {c.last_body}
                        </div>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <div className="tiny muted">{vnDayKey(c.last_message_at) === vnDayKey(now()) ? fmtTime(c.last_message_at) : relativeDay(c.last_message_at, now())}</div>
                        <img src="/brand/zalo.png" alt="Zalo" style={{ width: 22, height: 22, marginTop: 6 }} />
                        {c.status === "NEW" && <div className="badge b-gold" style={{ padding: "0 6px", fontSize: 11 }}>Mới</div>}
                      </span>
                    </button>
                  ))}
                  <div className="row-between" style={{ padding: 14, borderTop: "1px solid var(--border)", marginTop: "auto" }}>
                    <span className="small">
                      {d.items.length ? `${page * PAGE + 1} – ${Math.min(d.items.length, page * PAGE + PAGE)} / ${d.items.length}` : "0"}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="icon-btn" style={{ border: "1px solid var(--border)" }} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Trang trước">
                        <ChevronLeft />
                      </button>
                      <button className="icon-btn" style={{ border: "1px solid var(--border)" }} disabled={(page + 1) * PAGE >= d.items.length} onClick={() => setPage(page + 1)} aria-label="Trang sau">
                        <ChevronRight />
                      </button>
                    </span>
                  </div>
                </section>
                {sel ? <Conversation key={sel} id={sel} onBack={() => setSel(null)} onChanged={q.reload} demo={d.demo} /> : <section className="card desktop-only"><Empty title="Chọn một hội thoại" img={false} /></section>}
              </div>
            </div>
          );
        }}
      </PageState>
      {guide && (
        <Modal title="Hướng dẫn kết nối Zalo" onClose={() => setGuide(false)}>
          <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Cung cấp repo Zalo đang dùng (đề cập trong yêu cầu gốc, chưa được bàn giao).</li>
            <li>Kiểm tra README, license, cấu hình, cơ chế xác thực và API thực tế của repo.</li>
            <li>Xác nhận kênh, khả năng gửi/nhận, giới hạn và trạng thái giao tin.</li>
            <li>Lưu secret ở máy chủ (biến môi trường), không đưa vào trình duyệt.</li>
            <li>Bật adapter LIVE sau khi kiểm thử; chống gửi lặp bằng idempotency + outbox đã có sẵn.</li>
          </ol>
          <div className="banner warn mt-12 small">Hệ thống không đoán API Zalo. Khi chưa xác minh, mọi nút gửi chỉ tạo bản nháp/đề xuất chờ duyệt.</div>
        </Modal>
      )}
    </>
  );
}

function Conversation({ id, onBack, onChanged, demo }: { id: string; onBack: () => void; onChanged: () => void; demo: boolean }) {
  const q = useApi<any>(`/conversations/${id}`, [id]);
  const { run, busy } = useAction();
  const [text, setText] = useState("");
  const [sim, setSim] = useState(false);
  const [lastEvt, setLastEvt] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.data && text === "") setText(q.data.conversation.draft ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.conversation?.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [q.data?.messages?.length]);
  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const m of q.data?.messages ?? []) (g[vnDayKey(m.sent_at)] ||= []).push(m);
    return Object.entries(g);
  }, [q.data]);
  const { now } = useApp();
  if (q.error) return <section className="card card-pad">{q.error.message}</section>;
  if (!q.data) return <Skeleton h={520} />;
  const { conversation: cv, customer, suggestion, staff, pending_proposals, can_reply } = q.data;
  const refresh = () => (q.reload(), onChanged());
  const notConnected = q.data.integration.health !== "CONNECTED";
  return (
    <>
      <section className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="card-pad row" style={{ borderBottom: "1px solid var(--border)", flexWrap: "nowrap" }}>
          <button className="icon-btn mobile-only" onClick={onBack} aria-label="Quay lại danh sách">
            <ArrowLeft />
          </button>
          <Avatar name={customer.display_name} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 18 }}>
              {customer.display_name} <img src="/brand/zalo.png" alt="Zalo" style={{ width: 24, height: 24, verticalAlign: "middle" }} />
            </b>
            <div className="small muted">
              {customer.segment ?? STAGE_SHORT[customer.lifecycle_stage - 1]} · {customer.contact_phone}
            </div>
          </div>
          <Link className="icon-btn" href={`/customers/${customer.id}`} aria-label="Mở hồ sơ khách">
            <Info />
          </Link>
          <button className={`btn btn-sm ${cv.follow_up ? "btn-gold" : "btn-outline"}`} disabled={!can_reply} onClick={() => run(() => api(`/conversations/${cv.id}/follow-up`, { body: { value: !cv.follow_up } })).then(refresh)}>
            <Flag /> {cv.follow_up ? "Đang theo dõi" : "Cần theo dõi"}
          </button>
        </div>
        <div className="chat" style={{ flex: 1, maxHeight: 460, overflow: "auto" }}>
          {groups.map(([day, msgs]) => (
            <div key={day} className="stack" style={{ gap: 10 }}>
              <div style={{ alignSelf: "center" }} className="badge b-gray">
                {(() => {
                  const r = relativeDay(msgs[0].sent_at, now());
                  return r.includes("/") ? fmtWeekday(msgs[0].sent_at) : r;
                })()}
                , {fmtDate(msgs[0].sent_at)}
              </div>
              {msgs.map((m: any) => (
                <div key={m.id} className={`bubble ${m.direction === "IN" ? "in" : "out"}`}>
                  {m.body}
                  <div className="meta">
                    {fmtTime(m.sent_at)} · {m.direction === "IN" ? m.author_label : `${m.author_label} · ${DELIVERY_LABEL[m.delivery_status]}`}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {pending_proposals.length > 0 && (
          <div className="banner warn" style={{ margin: "10px 14px 0" }}>
            <ShieldCheck />
            <div>
              Bản trả lời đang {pending_proposals[0].status === "PENDING" ? "chờ duyệt" : "được trả lại để sửa"} ({pending_proposals[0].code}). Chưa gửi cho khách.{" "}
              <Link className="link" href="/approvals">
                Xem phê duyệt
              </Link>
            </div>
          </div>
        )}
        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Nhập tin nhắn hoặc chọn gợi ý từ AI..." value={text} onChange={(e) => setText(e.target.value)} disabled={!can_reply} aria-label="Soạn trả lời" />
          <div className="row mt-8" style={{ gap: 6 }}>
            <button className="icon-btn" title="Đính kèm: chưa cấu hình kho lưu trữ riêng tư" disabled aria-label="Đính kèm (chưa sẵn sàng)">
              <Paperclip size={19} />
            </button>
            <button className="icon-btn" title="Chèn biểu tượng cảm xúc" onClick={() => setText((t) => t + " 🙂")} aria-label="Chèn biểu tượng">
              <Smile size={19} />
            </button>
            <button className="icon-btn" title="Chèn gợi ý AI" disabled={!suggestion.draft} onClick={() => setText(suggestion.draft)} aria-label="Chèn gợi ý AI">
              <LayoutList size={19} />
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-outline-gold btn-sm" disabled={busy || !can_reply} onClick={() => run(() => api(`/conversations/${cv.id}/draft`, { body: { body: text } }), (r: any) => r.message).then(q.reload)}>
              <Save /> Lưu bản nháp
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !can_reply || !text.trim()}
              onClick={() =>
                run(() => api(`/conversations/${cv.id}/propose`, { body: { body: text, sources: suggestion.draft && text.trim() === suggestion.draft ? suggestion.sources : undefined } }), (r: any) => r.message).then(refresh)
              }
            >
              <ShieldCheck /> Gửi phê duyệt
            </button>
            <button className="btn btn-outline btn-sm" disabled={notConnected} title={notConnected ? "Zalo chưa kết nối — không thể gửi trực tiếp" : undefined}>
              <Send /> Gửi tin nhắn
            </button>
          </div>
          {notConnected && <div className="tiny muted mt-8">“Gửi tin nhắn” bị khóa vì Zalo chưa kết nối. Có thể lưu bản nháp, gửi phê duyệt, hoặc ghi nhận câu trả lời đã gửi ngoài hệ thống.</div>}
          {can_reply && notConnected && text.trim() && (
            <button className="link tiny mt-8" onClick={() => run(() => api(`/conversations/${cv.id}/record-reply`, { body: { body: text } }), (r: any) => r.message).then(() => (setText(""), refresh()))}>
              Ghi nhận đã trả lời ngoài hệ thống (điện thoại/ứng dụng khác)
            </button>
          )}
        </div>
      </section>
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h3>
              <Sparkles color="var(--gold)" /> Gợi ý trả lời bằng AI
            </h3>
            <div className="sub">Dựa trên FAQ đã phê duyệt và lịch hẹn khả dụng.</div>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <span className="avatar" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
                <Bot size={20} />
              </span>
              <div className="bubble out" style={{ maxWidth: "100%", fontSize: 16 }}>
                {suggestion.draft ?? suggestion.summary}
              </div>
            </div>
            {suggestion.needs_specialist && <div className="banner warn small">Nội dung cần chuyên viên xác nhận trước khi trả lời khách.</div>}
            <div className="row-between">
              <div className="row">{suggestion.sources.map((s: any, i: number) => <SourceChip key={i} label={s.label} />)}</div>
              <button className="link small" onClick={() => q.hardReload()}>
                <RefreshCw size={14} /> Tạo lại gợi ý
              </button>
            </div>
            {suggestion.draft && can_reply && (
              <button className="btn btn-outline btn-sm" onClick={() => setText(suggestion.draft)}>
                Dùng gợi ý vào ô soạn
              </button>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>
              <CalendarDays /> Thông tin đặt lịch <span className="muted" style={{ fontWeight: 400 }}>(tham chiếu)</span>
            </h3>
          </div>
          <div className="card-body">
            <div className="banner warn" style={{ background: "#fffaf0" }}>
              <CalendarDays color="var(--gold-600)" />
              <div className="small">
                Khung tư vấn còn trống:
                {suggestion.slots.map((s: any) => (
                  <div key={s.day}>
                    <b>{s.label}:</b> {s.times.length ? s.times.join(", ") : "Không còn khung trống"}
                  </div>
                ))}
              </div>
            </div>
            <Link className="link small mt-8" href={`/appointments?book=${customer.id}`}>
              Đặt lịch cho {customer.display_name} →
            </Link>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>
              <Users /> Phân công xử lý
            </h3>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            <label className="row-between" style={{ gap: 12 }}>
              <span>Gán nhân viên</span>
              <select className="select" style={{ maxWidth: 220 }} value={cv.assigned_to ?? ""} disabled={!can_reply} onChange={(e) => run(() => api(`/conversations/${cv.id}/assign`, { body: { employee_id: e.target.value } }), "Đã gán người xử lý.").then(refresh)}>
                <option value="">— Chưa gán —</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row-between" style={{ gap: 12 }}>
              <span>
                <ArrowLeftRight size={16} /> Chuyển chuyên viên
              </span>
              <select className="select" style={{ maxWidth: 220 }} value={cv.specialist_id ?? ""} disabled={!can_reply} onChange={(e) => e.target.value && run(() => api(`/conversations/${cv.id}/specialist`, { body: { employee_id: e.target.value } }), (r: any) => r.message).then(refresh)}>
                <option value="">Chuyên viên PMU…</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <span className="small muted">Trạng thái:</span>
              {(["NEW", "OPEN", "DONE"] as const).map((s) => (
                <button key={s} className={`btn btn-sm ${cv.status === s ? "btn-primary" : "btn-outline"}`} disabled={!can_reply} onClick={() => run(() => api(`/conversations/${cv.id}/status`, { body: { status: s } })).then(refresh)}>
                  {s === "NEW" ? "Chưa xử lý" : s === "OPEN" ? "Đang xử lý" : "Hoàn thành"}
                </button>
              ))}
            </div>
            {demo && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSim(true)}>
                <Radio /> Mô phỏng tin đến (kiểm chống trùng)
              </button>
            )}
          </div>
        </section>
      </div>
      {sim && (
        <SimModal
          lastEvt={lastEvt}
          onClose={() => setSim(false)}
          onSend={async (body, evt) => {
            setLastEvt(evt);
            await run(() => api("/integrations/zalo/simulate-inbound", { body: { conversation_id: cv.id, body, external_event_id: evt } }), (r: any) => r.message);
            refresh();
          }}
        />
      )}
    </>
  );
}

function SimModal({ lastEvt, onClose, onSend }: { lastEvt: string; onClose: () => void; onSend: (body: string, evt: string) => Promise<void> }) {
  const [body, setBody] = useState("Cho tôi hỏi lịch trống chiều mai.");
  const [evt, setEvt] = useState(lastEvt || `sim-${Date.now()}`);
  return (
    <Modal
      title="Mô phỏng webhook tin nhắn đến"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={() => setEvt(`sim-${Date.now()}`)}>
            Mã sự kiện mới
          </button>
          <button className="btn btn-primary" onClick={() => onSend(body, evt)}>
            Gửi sự kiện
          </button>
        </>
      }
    >
      <div className="banner info small mb-16">Gửi lại cùng mã sự kiện để kiểm tra chống nhận lặp (external_event_id UNIQUE): lần thứ hai sẽ bị bỏ qua.</div>
      <div className="stack" style={{ gap: 10 }}>
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Nội dung" />
        <input className="input" value={evt} onChange={(e) => setEvt(e.target.value)} aria-label="Mã sự kiện" />
      </div>
    </Modal>
  );
}
