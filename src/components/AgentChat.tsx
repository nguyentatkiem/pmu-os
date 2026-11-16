"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Cpu, ExternalLink, Loader2, Plus, Send, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useToast } from "./ui";
import { fmtTime } from "@/lib/shared/format";

type Msg = { id: string; role: "user" | "assistant"; content: any; biz_at?: string };
type Status = { configured: boolean; model: string; budget: number; used: number; paused: boolean };

const SAMPLES = [
  "Giao Nguyễn Thị Lan gọi xác nhận các lịch hẹn ngày mai trước 10:00",
  "Hôm nay có việc nào quá hạn?",
  "Chạy agent chăm sóc khách",
  "Khách nóng nào chưa có lịch hẹn?",
  "Chạy agent nhân sự",
  "Quy trình tiếp nhận khách mới gồm những bước nào?",
];

function storageKey(tenant: string, user: string) {
  return `pmu_agent_thread_${tenant}_${user}`;
}

function msgText(c: any): string {
  if (!c) return "";
  if (typeof c.text === "string") return c.text;
  const lines: string[] = [];
  if (c.summary) lines.push(c.summary);
  for (const card of c.cards ?? []) {
    lines.push(`${card.title}: ${card.value} ${card.unit ?? ""}`.trim());
    for (const l of card.lines ?? []) lines.push(`  • ${l}`);
  }
  for (const f of c.facts ?? []) lines.push(`• ${f.text}`);
  return lines.join("\n");
}

export function ChatPanel({ height = 560, onClose, embedded }: { height?: number | string; onClose?: () => void; embedded?: boolean }) {
  const { me } = useApp();
  const toast = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const key = me ? storageKey(me.tenant.id, me.user.id) : "";

  useEffect(() => {
    api("/agent/threads")
      .then((r) => setStatus(r.ai))
      .catch(() => {});
    let saved: string | null = null;
    try {
      saved = key ? sessionStorage.getItem(key) : null;
    } catch {}
    if (saved) {
      api(`/agent/threads/${saved}`)
        .then((r) => {
          setThreadId(saved);
          setMessages(r.messages);
        })
        .catch(() => {
          try {
            sessionStorage.removeItem(key);
          } catch {}
        });
    }
  }, [key]);

  useEffect(() => {
    const el = endRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const send = useCallback(
    async (text?: string) => {
      const t = (text ?? input).trim();
      if (!t || sending) return;
      setSending(true);
      setInput("");
      const tmp: Msg = { id: `u${Date.now()}`, role: "user", content: { text: t } };
      setMessages((m) => [...m, tmp]);
      try {
        const r = await api("/agent/chat", { body: { message: t, thread_id: threadId } });
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: { kind: "chat", ...r.reply } }]);
        if (r.thread_id !== threadId) {
          setThreadId(r.thread_id);
          try {
            sessionStorage.setItem(key, r.thread_id);
          } catch {}
        }
        if (r.reply.actions?.some((a: any) => a.type === "proposal")) window.dispatchEvent(new CustomEvent("pmu:proposals-changed"));
        api("/agent/threads")
          .then((x) => setStatus(x.ai))
          .catch(() => {});
      } catch (e: any) {
        setMessages((m) => m.filter((x) => x.id !== tmp.id));
        setInput(t);
        toast(e?.status === 409 ? "warn" : "danger", e?.message || "Trợ lý chưa xử lý được yêu cầu.");
      } finally {
        setSending(false);
        taRef.current?.focus();
      }
    },
    [input, sending, threadId, key, toast],
  );

  const reset = () => {
    setThreadId(null);
    setMessages([]);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };

  const engineLabel = status?.paused ? "Đang dừng khẩn cấp" : status?.configured ? (status.used >= status.budget ? "Hết lượt AI hôm nay · chế độ quy tắc" : "Claude · có công cụ") : "Chế độ quy tắc";

  return (
    <div className={`agent-panel ${embedded ? "embedded" : ""}`} style={{ height }}>
      <div className="agent-panel-head">
        <span className="agent-ava">
          <Bot size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Trợ lý giao việc AI</b>
          <div className="tiny" style={{ opacity: 0.85 }}>
            <Cpu size={12} style={{ verticalAlign: -2 }} /> {engineLabel}
            {status?.configured ? ` · ${status.used}/${status.budget} lượt/24h` : ""}
          </div>
        </div>
        <button className="icon-btn ghost-light" onClick={reset} title="Hội thoại mới" aria-label="Hội thoại mới">
          <Plus size={18} />
        </button>
        {onClose && (
          <button className="icon-btn ghost-light" onClick={onClose} aria-label="Đóng khung chat">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="agent-msgs" aria-live="polite">
        {messages.length === 0 && (
          <div className="agent-empty">
            <Sparkles size={28} color="var(--gold)" />
            <b>Giao việc bằng một câu</b>
            <div className="small muted">Trợ lý tra dữ liệu theo đúng quyền của anh/chị. Mọi thay đổi chỉ thành đề xuất chờ duyệt, không tự gửi khách.</div>
            <div className="agent-samples">
              {SAMPLES.map((s) => (
                <button key={s} className="agent-sample" onClick={() => send(s)} disabled={sending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="bubble out" style={{ maxWidth: "86%" }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{msgText(m.content)}</div>
              {m.biz_at && <div className="meta">{fmtTime(m.biz_at)}</div>}
            </div>
          ) : (
            <div key={m.id} className="bubble in" style={{ maxWidth: "92%" }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{msgText(m.content)}</div>
              {m.content?.note && <div className="agent-note">{m.content.note}</div>}
              {!!m.content?.actions?.length && (
                <div className="agent-actions">
                  {m.content.actions.map((a: any) => (
                    <Link key={a.id} href={a.href} className="agent-action" onClick={() => onClose?.()}>
                      {a.type === "proposal" ? <ShieldCheck size={14} /> : <Zap size={14} />}
                      <span>{a.label}</span>
                      <ExternalLink size={12} />
                    </Link>
                  ))}
                </div>
              )}
              <div className="meta">
                {m.content?.engine === "claude" ? "Claude" : m.content?.engine === "rules" ? "Chế độ quy tắc" : "AI Assistant"}
                {m.content?.tool_trace?.length ? ` · ${m.content.tool_trace.length} bước tra cứu` : ""}
                {m.biz_at ? ` · ${fmtTime(m.biz_at)}` : ""}
              </div>
            </div>
          ),
        )}
        {sending && (
          <div className="bubble in agent-typing">
            <Loader2 size={16} className="spin" /> Trợ lý đang tra dữ liệu và xử lý...
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="agent-input">
        <textarea
          ref={taRef}
          className="textarea"
          rows={2}
          placeholder="Ví dụ: Giao Lê Thu Hà chuẩn bị phòng dịch vụ trước 8:30 ngày mai"
          value={input}
          maxLength={1200}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Nội dung giao việc cho trợ lý AI"
        />
        <button className="btn btn-primary" onClick={() => send()} disabled={sending || !input.trim()} aria-label="Gửi">
          {sending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

export function ChatWidget() {
  const { can } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);
  if (!can("assistant.use") || pathname.startsWith("/agents")) return null;
  return (
    <>
      {open && (
        <div className="agent-float" role="dialog" aria-label="Trợ lý giao việc AI">
          <ChatPanel height="100%" onClose={() => setOpen(false)} />
        </div>
      )}
      {!open && (
        <button className="agent-fab" onClick={() => setOpen(true)} aria-label="Mở trợ lý giao việc AI">
          <Bot size={22} />
          <span className="desktop-only">Giao việc AI</span>
        </button>
      )}
    </>
  );
}
