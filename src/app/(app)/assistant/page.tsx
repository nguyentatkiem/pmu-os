"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ClipboardCheck, Flag, Info, MessageSquareText, Mic, Paperclip, Plus, Send, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert, Users, X, UserRound } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { DesignRefButton, Field, Modal, SourceChip, Skeleton, useAction, useApp } from "@/components/ui";
import { fmtDateTime, fmtTime, relativeDay, vnDayKey } from "@/lib/shared/format";
import { isoToLocalInput, localInputToIso } from "@/lib/client/helpers";

const SAMPLES = ["Hôm nay doanh nghiệp có vấn đề gì?", "Việc nào đang quá hạn?", "Lịch nào cần xác nhận?", "Nhân sự nào cần hỗ trợ?", "Ba ưu tiên ngày mai là gì?", "Quy trình tiếp nhận khách mới gồm những bước nào?"];
const CARD_ICON: Record<string, any> = { overdue: TriangleAlert, support: Users, confirm: CalendarDays, priorities: Flag };
const CARD_COLOR: Record<string, string> = { overdue: "var(--danger)", support: "var(--primary)", confirm: "var(--gold-600)", priorities: "var(--ok)" };

export default function AssistantPage() {
  const { now } = useApp();
  const threads = useApi<any>("/assistant/threads");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState(false);
  const { run, busy } = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!threadId) return setMessages([]);
    setLoading(true);
    api(`/assistant/threads/${threadId}`)
      .then((r) => setMessages(r.messages))
      .finally(() => setLoading(false));
  }, [threadId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const ask = async (text?: string) => {
    const qtext = (text ?? question).trim();
    if (!qtext) return;
    const r: any = await run(() => api("/assistant/ask", { body: { question: qtext, thread_id: threadId } }));
    if (!r) return;
    setQuestion("");
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: { text: qtext }, biz_at: r.answer.generated_at }, { id: `a${Date.now()}`, role: "assistant", content: r.answer, biz_at: r.answer.generated_at }]);
    if (!threadId) setThreadId(r.thread_id);
    threads.reload();
  };

  return (
    <div className="split bleed" style={{ gridTemplateColumns: "250px minmax(0,1fr)", gap: 0, minHeight: "calc(100vh - 140px)" }}>
      <aside className="desktop-only" style={{ borderRight: "1px solid var(--border)", padding: 16, background: "#fbfdfd" }}>
        <b className="row" style={{ fontSize: 18 }}>
          <MessageSquareText color="var(--primary)" /> Hội thoại AI
        </b>
        <button className="btn btn-gold btn-block mt-16" onClick={() => setThreadId(null)}>
          <Plus /> Hội thoại mới
        </button>
        <div className="small strong mt-24">Lịch sử gần đây</div>
        {threads.loading && !threads.data && <Skeleton h={80} className="mt-8" />}
        {threads.data?.threads.map((t: any) => (
          <button
            key={t.id}
            className="menu-item mt-8"
            style={{ background: threadId === t.id ? "var(--primary-50)" : undefined, alignItems: "flex-start" }}
            onClick={() => setThreadId(t.id)}
          >
            <MessageSquareText size={18} style={{ flex: "none", marginTop: 2 }} />
            <span>
              <b style={{ fontWeight: 600 }}>{t.title}</b>
              <div className="tiny muted">
                {relativeDay(t.biz_updated_at, now())}, {fmtTime(t.biz_updated_at)}
              </div>
            </span>
          </button>
        ))}
      </aside>
      <section style={{ padding: "22px 28px", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
          <span className="avatar lg" style={{ background: "linear-gradient(180deg,#fff3da,#f6e2b5)", color: "var(--gold-600)", borderRadius: 18 }}>
            <Sparkles size={36} />
          </span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800 }}>AI Executive Assistant</h1>
            <div className="muted">Trợ lý vận hành cho nhà quản lý DOANH NGHIỆP PMU — trả lời theo quyền của người hỏi</div>
          </div>
          <DesignRefButton refKey="assistant" />
        </div>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", margin: "28px 0 18px" }}>
            <h2 style={{ fontSize: 36, fontWeight: 800 }}>Hôm nay doanh nghiệp có vấn đề gì?</h2>
            <div className="muted" style={{ fontSize: 17, marginTop: 6 }}>
              Hỏi, giao nhiệm vụ, yêu cầu tổng hợp hoặc phân tích dữ liệu vận hành.
            </div>
          </div>
        )}
        <div className="card" style={{ padding: 14, borderColor: "#ecd9b0", marginTop: messages.length ? 18 : 0 }}>
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <Sparkles size={26} color="var(--gold)" style={{ flex: "none", marginTop: 6 }} />
            <textarea
              className="textarea"
              style={{ border: 0, boxShadow: "none", minHeight: 56, fontSize: 16 }}
              placeholder="Nhập yêu cầu của bạn... (ví dụ: “Tổng hợp tình hình hôm nay và đề xuất việc cần làm”)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              aria-label="Yêu cầu cho AI"
            />
          </div>
          <div className="row">
            <button className="icon-btn" style={{ border: "1px solid var(--border)" }} disabled title="Đính kèm: chưa cấu hình kho lưu trữ riêng tư" aria-label="Đính kèm (chưa sẵn sàng)">
              <Paperclip size={18} />
            </button>
            <div style={{ position: "relative" }}>
              <button className="icon-btn" style={{ border: "1px solid var(--border)" }} onClick={() => setTools((v) => !v)} aria-label="Câu hỏi mẫu">
                <SlidersHorizontal size={18} />
              </button>
              {tools && (
                <div className="menu" style={{ left: 0, right: "auto", minWidth: 340 }}>
                  {SAMPLES.map((s) => (
                    <button key={s} className="menu-item" onClick={() => (setTools(false), ask(s))}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={{ flex: 1 }} />
            <button className="icon-btn" style={{ border: "1px solid var(--border)" }} disabled title="Nhập giọng nói chưa được bật" aria-label="Giọng nói (chưa sẵn sàng)">
              <Mic size={18} />
            </button>
            <button className="btn btn-gold" disabled={busy || !question.trim()} onClick={() => ask()} aria-label="Gửi">
              <Send /> {busy ? "Đang phân tích..." : "Gửi"}
            </button>
          </div>
        </div>
        {messages.length === 0 && !loading && (
          <div className="row mt-16" style={{ justifyContent: "center" }}>
            {SAMPLES.slice(0, 4).map((s) => (
              <button key={s} className="btn btn-outline btn-sm" onClick={() => ask(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="stack mt-16" style={{ gap: 18, flex: 1 }}>
          {loading && <Skeleton h={240} />}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="row" style={{ justifyContent: "flex-end" }}>
                <div className="bubble out" style={{ background: "#e2f1f8", fontSize: 15.5 }}>
                  <UserRound size={14} /> {m.content.text}
                </div>
              </div>
            ) : (
              <Answer key={m.id} a={m.content} at={m.biz_at} />
            ),
          )}
          <div ref={endRef} />
        </div>
        <div className="banner teal mt-24" style={{ alignItems: "center" }}>
          <Info /> Phân tích có nguồn · Quyết định do con người. {messages.find((m) => m.role === "assistant")?.content.engine ?? "AI chạy chế độ quy tắc có nguồn, chưa nối nhà cung cấp mô hình."}
        </div>
      </section>
    </div>
  );
}

function Answer({ a, at }: { a: any; at: string }) {
  const { now } = useApp();
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <span className="avatar" style={{ background: "linear-gradient(180deg,#fff3da,#f6e2b5)", color: "var(--gold-600)", borderRadius: 12 }}>
          <Sparkles size={20} />
        </span>
        <div>
          <b style={{ fontSize: 17 }}>AI Assistant</b>{" "}
          <span className="small muted">
            {relativeDay(at, now())}, {fmtTime(at)}
          </span>
          <div className="mt-8">{a.summary}</div>
        </div>
      </div>
      {a.cards && (
        <div className={`grid ${a.cards.length >= 4 ? "g-4" : a.cards.length === 1 ? "" : "g-2"}`} style={{ gap: 14 }}>
          {a.cards.map((c: any) => {
            const Icon = CARD_ICON[c.key] ?? ClipboardCheck;
            return (
              <div key={c.key} className="card" style={{ display: "flex", flexDirection: "column" }}>
                <div className="card-head" style={{ background: c.key === "overdue" ? "#fff3f3" : c.key === "confirm" ? "#fff8ea" : c.key === "priorities" ? "#f2faf5" : "#f1f8f9", borderRadius: "14px 14px 0 0" }}>
                  <h3 style={{ fontSize: 16.5, color: CARD_COLOR[c.key] }}>
                    <Icon color={CARD_COLOR[c.key]} /> {c.title}
                  </h3>
                </div>
                <div className="card-body" style={{ flex: 1 }}>
                  {c.key !== "priorities" && (
                    <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 32, fontWeight: 800, color: CARD_COLOR[c.key] }}>{c.value}</span>
                      <span style={{ fontSize: 18 }}>{c.unit}</span>
                    </div>
                  )}
                  {c.key === "priorities" ? (
                    <ol style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                      {c.lines.map((l: string, i: number) => (
                        <li key={i} className="row small" style={{ flexWrap: "nowrap", alignItems: "flex-start", marginBottom: 10 }}>
                          <span className="avatar sm" style={{ background: "var(--ok-50)", color: "var(--ok)", width: 24, height: 24, fontSize: 12 }}>
                            {i + 1}
                          </span>
                          {l}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <ul className="small" style={{ paddingLeft: 18, margin: "8px 0 0" }}>
                      {c.lines.map((l: string, i: number) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={{ padding: "0 14px 14px" }} className="row">
                  {c.sources.slice(0, 3).map((s: any, i: number) => (
                    <SourceChip key={i} label={`Nguồn: ${s.label}`} href={s.href} />
                  ))}
                  {c.sources.length === 0 && <span className="tiny muted">Không có nguồn cần mở.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!a.cards && a.facts.length > 0 && (
        <div className="card card-pad">
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {a.facts.map((f: any, i: number) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      {!a.cards && a.sources.length > 0 && (
        <div className="row">
          {a.sources.map((s: any, i: number) => (
            <SourceChip key={i} label={s.label} href={s.href} />
          ))}
        </div>
      )}
      {a.uncertainties?.length > 0 && (
        <details className="small">
          <summary className="link">Điểm chưa chắc chắn ({a.uncertainties.length})</summary>
          <ul style={{ paddingLeft: 18 }}>
            {a.uncertainties.map((u: string, i: number) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </details>
      )}
      {a.proposed_actions?.map((p: any, i: number) => (
        <ActionDraft key={i} p={p} />
      ))}
    </div>
  );
}

function ActionDraft({ p }: { p: any }) {
  const [state, setState] = useState<"draft" | "sent" | "cancelled">("draft");
  const [edit, setEdit] = useState(false);
  const [payload, setPayload] = useState(p.payload);
  const { run, busy } = useAction();
  const staff = useApi<any>(edit ? "/tasks" : null);
  if (state === "cancelled")
    return (
      <div className="banner info small">
        Đã hủy đề xuất dự thảo “{p.title}”. Không có thay đổi nào được ghi vào hệ thống.
      </div>
    );
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <b className="row" style={{ fontSize: 18 }}>
            <ClipboardCheck color="var(--gold-600)" /> Đề xuất hành động (dự thảo)
          </b>
          <div className="mt-8" style={{ fontSize: 16 }}>
            Giao nhiệm vụ “{payload.title}” cho{" "}
            <span className="badge b-teal" style={{ fontSize: 15 }}>
              {payload.owner_name}
            </span>
            , hạn hoàn thành:{" "}
            <span className="badge b-gold" style={{ fontSize: 15 }}>
              {fmtDateTime(payload.due_at)}
            </span>
            .
          </div>
          <div className="small muted mt-8">Lý do: {p.reason}</div>
          <div className="small muted">Checklist: {payload.checklist.join(" · ")}</div>
        </div>
        <div className="stack" style={{ gap: 8, alignItems: "stretch", minWidth: 260 }}>
          {state === "sent" ? (
            <div className="banner ok small">
              <ShieldCheck /> Đã gửi quản lý phê duyệt. Chưa tự động thực thi.
            </div>
          ) : (
            <>
              <button
                className="btn btn-dark btn-lg"
                disabled={busy}
                onClick={async () => {
                  const r = await run(() => api("/assistant/actions", { body: { type: p.type, payload, reason: p.reason } }), (x: any) => x.message);
                  if (r) setState("sent");
                }}
              >
                <ShieldCheck /> Gửi quản lý phê duyệt
              </button>
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>
                  Sửa đề xuất
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setState("cancelled")}>
                  <X size={14} /> Hủy đề xuất
                </button>
              </div>
              <div className="tiny muted" style={{ textAlign: "center" }}>
                (Chỉ tạo đề xuất, không tự động thực thi)
              </div>
            </>
          )}
        </div>
      </div>
      {edit && (
        <Modal
          title="Sửa đề xuất trước khi gửi"
          onClose={() => setEdit(false)}
          footer={
            <button className="btn btn-primary" onClick={() => setEdit(false)}>
              Áp dụng
            </button>
          }
        >
          <div className="form-grid">
            <Field label="Tên công việc" className="full">
              <input className="input" value={payload.title} onChange={(e) => setPayload({ ...payload, title: e.target.value })} />
            </Field>
            <Field label="Người nhận">
              <select
                className="select"
                value={payload.owner_id}
                onChange={(e) => {
                  const o = staff.data?.owners.find((x: any) => x.id === e.target.value);
                  setPayload({ ...payload, owner_id: e.target.value, owner_name: o?.display_name ?? payload.owner_name });
                }}
              >
                <option value={payload.owner_id}>{payload.owner_name}</option>
                {staff.data?.owners
                  .filter((o: any) => o.id !== payload.owner_id)
                  .map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.display_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Hạn hoàn thành">
              <input className="input" type="datetime-local" value={isoToLocalInput(payload.due_at)} onChange={(e) => setPayload({ ...payload, due_at: localInputToIso(e.target.value) })} />
            </Field>
            <Field label="Checklist (mỗi dòng một mục)" className="full">
              <textarea className="textarea" value={payload.checklist.join("\n")} onChange={(e) => setPayload({ ...payload, checklist: e.target.value.split("\n") })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

