"use client";
// Màn Tổng quan: tiến trình vận hành toàn bộ luồng AI Agent, cập nhật trực tiếp.
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Bot,
  Brain,
  CalendarClock,
  FileChartColumn,
  GraduationCap,
  Heart,
  MessageCircle,
  OctagonPause,
  Play,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Zap,
  Loader2,
  X,
  Clapperboard,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useToast } from "./ui";
import { fmtTime, relativeDay } from "@/lib/shared/format";

const ICON: Record<string, React.ElementType> = { Users, Heart, FileChartColumn, GraduationCap, Clapperboard };
const STAGES: [string, string][] = [
  ["scan", "Quét dữ liệu"],
  ["brain", "Tra Bộ não"],
  ["proposed", "Chờ duyệt"],
  ["approved_today", "Duyệt hôm nay"],
  ["actions", "Tự làm (L2)"],
];
const FEED_ICON: Record<string, React.ElementType> = { run: Activity, proposal: ShieldCheck, decision: BadgeCheck, brain: Brain };
const POLL_MS = 20000;

export default function AgentPipeline() {
  const { now } = useApp();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [lit, setLit] = useState(-1);
  const [sim, setSim] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (tick = true) => {
    try {
      const r = await api(`/agents/pipeline${tick ? "?tick=1" : ""}`);
      setD(r);
      setErr(null);
      if (r.ticked) toast("info", `${r.ticked.name} vừa chạy theo lịch: ${r.ticked.summary}`);
    } catch (e: any) {
      setErr(e?.message ?? "Không tải được luồng agent.");
    }
  }, [toast]);

  useEffect(() => {
    load(true);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Hiệu ứng chạy qua từng chặng khi một agent đang làm việc
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!running) {
      setLit(-1);
      return;
    }
    setLit(0);
    timer.current = setInterval(() => setLit((x) => (x + 1) % STAGES.length), 450);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  const runAll = async () => {
    if (!d) return;
    setBusy(true);
    let props = 0;
    let acts = 0;
    for (const lane of d.lanes.filter((l: any) => l.enabled)) {
      setRunning(lane.key);
      try {
        const r = await api(`/agents/${lane.key}/run`, { body: {} });
        props += r.proposals.length;
        acts += r.actions.length;
      } catch (e: any) {
        toast("danger", `${lane.name}: ${e?.message ?? "lỗi"}`);
      }
      await load(false);
    }
    setRunning(null);
    setBusy(false);
    toast("ok", `Đã chạy toàn bộ luồng: ${props} đề xuất mới, ${acts} thao tác tự động.`);
  };

  const simulate = async () => {
    setBusy(true);
    setSim({ loading: true });
    setRunning("care");
    try {
      const r = await api("/agents/simulate-inbound", { body: {} });
      setSim(r);
      await load(false);
    } catch (e: any) {
      setSim(null);
      toast("danger", e?.message ?? "Không mô phỏng được tin nhắn.");
    } finally {
      setRunning(null);
      setBusy(false);
    }
  };

  if (err && !d)
    return (
      <div className="banner warn">
        <TriangleAlert /> {err}
      </div>
    );
  if (!d) return <div className="skeleton" style={{ height: 340, borderRadius: 18 }} />;

  const s = d.signals;
  const signals: [React.ElementType, number, string, string, boolean][] = [
    [MessageCircle, s.zalo_new, "Tin Zalo chưa trả lời", "/inbox", s.zalo_new > 0],
    [CalendarClock, s.appt_pending, "Lịch ngày mai chờ xác nhận", "/appointments", s.appt_pending > 0],
    [TriangleAlert, s.overdue, "Việc quá hạn", "/tasks?filter=overdue", s.overdue > 0],
    [Heart, s.feedback_open, "Phản hồi cần chuyên viên", "/care", s.feedback_open > 0],
    [GraduationCap, s.learning_due, "Bài học SOP sắp hạn", "/knowledge", s.learning_due > 0],
    [Clapperboard, s.video_review ?? 0, "Video chờ kiểm duyệt", "/marketing?tab=review", (s.video_review ?? 0) > 0],
  ];

  return (
    <section className="agent-live" aria-label="Luồng AI Agent đang vận hành">
      <div className="al-head">
        <h2>
          <span className={`agent-live-dot ${d.paused ? "off" : ""}`} aria-hidden /> Luồng AI Agent {d.paused ? "đang dừng khẩn cấp" : "đang vận hành"}
        </h2>
        <small>
          Cập nhật {fmtTime(d.now)} · tự làm mới mỗi {POLL_MS / 1000} giây · agent quá {d.schedule_min} phút chưa chạy sẽ tự chạy khi Tổng quan đang mở
          {d.simulated ? " · DỮ LIỆU MÔ PHỎNG" : ""}
        </small>
        <div className="actions">
          {d.simulated && (
            <button className="al-btn" onClick={simulate} disabled={busy || d.paused}>
              <MessageCircle size={16} /> Mô phỏng khách nhắn Zalo
            </button>
          )}
          <button className="al-btn gold" onClick={runAll} disabled={busy || d.paused}>
            {busy && !sim ? <Loader2 size={16} className="spin" /> : <Play size={16} />} Chạy toàn bộ luồng
          </button>
          <Link className="al-btn" href="/agents">
            <Bot size={16} /> Trung tâm AI Agent
          </Link>
        </div>
      </div>

      {d.paused && (
        <div className="banner danger" style={{ marginTop: 12 }}>
          <OctagonPause /> Hệ AI Agent đang dừng khẩn cấp. Bật lại tại Trung tâm AI Agent.
        </div>
      )}

      <div className="al-grid">
        <div className="al-col sig">
          <div className="al-col-title">1 · Tín hiệu vào</div>
          {signals.map(([Icon, n, label, href, hot]) => (
            <Link key={label} href={href} className={`al-sig ${hot ? "hot" : ""}`}>
              <Icon size={18} />
              <b>{n}</b>
              <span>{label}</span>
            </Link>
          ))}
        </div>

        <div className="al-col">
          <div className="al-col-title">2 · Agent Điều phối → agent chuyên trách</div>
          <div className="al-hub">
            <span className="hico">
              <Sparkles size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <b style={{ color: "#fff" }}>Agent Điều phối</b>
              <small style={{ display: "block" }}>
                Nhận việc từ khung chat “Giao việc AI” · {d.coordinator.pending} đề xuất chờ duyệt · bộ não {d.ai.configured ? `${d.ai.engine === "cli" ? "Claude CLI, gói Claude trên máy" : "Claude"} (${d.ai.used}/${d.ai.budget} lượt)` : "chế độ quy tắc"}
              </small>
            </div>
          </div>
          <div className="al-lanes">
            {d.lanes.map((l: any) => {
              const Icon = ICON[l.icon] ?? Bot;
              const isRun = running === l.key;
              return (
                <div key={l.key} className={`lane ${isRun ? "running" : ""} ${l.enabled ? "" : "off"}`}>
                  <div className="lane-name">
                    <span className="lico">{isRun ? <Loader2 size={17} className="spin" /> : <Icon size={17} />}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{l.name}</b>
                      <small>
                        {!l.enabled
                          ? "Đang tắt"
                          : isRun
                            ? "Đang chạy..."
                            : l.last_run
                              ? `${relativeDay(l.last_run.at, now())} ${fmtTime(l.last_run.at)} · ${l.last_run.trigger === "schedule" ? "theo lịch" : l.last_run.trigger === "event" ? "tin đến" : l.last_run.trigger === "chat" ? "từ chat" : "chạy tay"}`
                              : "Chưa chạy"}
                      </small>
                    </span>
                  </div>
                  <div className="lane-track">
                    {STAGES.map(([k, label], i) => (
                      <React.Fragment key={k}>
                        {i > 0 && (
                          <span className="lane-gap" aria-hidden>
                            {l.enabled && !d.paused && <i className="lane-dot" style={{ animationDelay: `${(i * 0.35 + d.lanes.indexOf(l) * 0.5) % 2.4}s` }} />}
                          </span>
                        )}
                        <div className={`lane-stage ${isRun && lit === i ? "lit" : ""}`} title={label}>
                          <b>{l.stages[k]}</b>
                          <small>{label}</small>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="al-col side">
          <div className="al-col-title">3 · Bộ não & phê duyệt</div>
          <Link href="/brain" className="al-box">
            <b style={{ color: "#fff", display: "flex", gap: 8, alignItems: "center" }}>
              <Brain size={18} /> Bộ não thứ 2
            </b>
            <div className="kv2">
              <span>Mục tri thức đang dùng</span>
              <b>{d.brain.active}</b>
            </div>
            <div className="kv2">
              <span>Bài học chờ duyệt</span>
              <b>{d.brain.pending}</b>
            </div>
            <div className="kv2">
              <span>Lượt agent tra hôm nay</span>
              <b>{d.brain.lookups_today}</b>
            </div>
          </Link>
          <Link href="/approvals" className="al-box">
            <b style={{ color: "#fff", display: "flex", gap: 8, alignItems: "center" }}>
              <ShieldCheck size={18} /> Con người duyệt
            </b>
            <div className="kv2">
              <span>Đề xuất của agent chờ duyệt</span>
              <b>{d.totals.pending}</b>
            </div>
            <div className="kv2">
              <span>Đã duyệt hôm nay</span>
              <b>{d.totals.approved_today}</b>
            </div>
            <div className="kv2">
              <span>Từ chối / trả lại hôm nay</span>
              <b>{d.totals.rejected_today}</b>
            </div>
          </Link>
          <div className="al-box" style={{ fontSize: 12, lineHeight: 1.45 }}>
            <Zap size={14} style={{ verticalAlign: -2 }} /> Agent chỉ tự làm việc rủi ro thấp (nhắc việc nội bộ). Gửi khách, đổi ca, xuất bản SOP luôn chờ người duyệt.
          </div>
        </div>
      </div>

      {sim && (
        <div className="al-sim">
          {sim.loading ? (
            <div className="row">
              <Loader2 size={16} className="spin" /> Khách mô phỏng đang nhắn Zalo, Agent Chăm sóc khách đang đọc tin và tra Bộ não...
            </div>
          ) : (
            <>
              <div className="row-between">
                <b>
                  <MessageCircle size={16} style={{ verticalAlign: -3 }} /> Tin Zalo đến từ {sim.customer} (mô phỏng)
                </b>
                <button className="icon-btn" onClick={() => setSim(null)} aria-label="Đóng">
                  <X size={16} />
                </button>
              </div>
              <div className="small mt-8">“{sim.inbound}”</div>
              <div className="small mt-8">
                <Brain size={14} style={{ verticalAlign: -2 }} color="var(--gold-600)" /> <b>Agent tra Bộ não:</b>{" "}
                {sim.brain?.length ? sim.brain.map((h: any) => h.label).join(" · ") : "không có mục khớp"}
              </div>
              {sim.draft ? (
                <>
                  <div className="small mt-8">
                    <b>Bản trả lời agent soạn sẵn:</b>
                  </div>
                  <div className="bubble out small" style={{ maxWidth: "100%", marginTop: 6 }}>
                    {sim.draft}
                  </div>
                  {sim.proposal && (
                    <Link href={`/approvals?open=${sim.proposal.id}`} className="btn btn-primary btn-sm mt-8">
                      <ShieldCheck size={16} /> Duyệt đề xuất {sim.proposal.code}
                    </Link>
                  )}
                </>
              ) : (
                <div className="small mt-8 muted">Agent không soạn trả lời (câu hỏi cần chuyên viên hoặc đã có đề xuất chờ duyệt). {sim.run?.summary}</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="al-col-title" style={{ marginTop: 16 }}>
        4 · Diễn biến mới nhất
      </div>
      <div className="al-feed">
        {d.feed.length === 0 && <div className="small muted">Chưa có diễn biến. Bấm “Chạy toàn bộ luồng”.</div>}
        {d.feed.map((e: any, i: number) => {
          const Icon = FEED_ICON[e.type] ?? Activity;
          return (
            <Link key={i} href={e.href} className="al-ev">
              <span className="t">
                {relativeDay(e.at, now()) === "Hôm nay" ? "" : `${relativeDay(e.at, now())} `}
                {fmtTime(e.at)}
              </span>
              <Icon size={14} color={e.type === "brain" ? "#fde68a" : e.type === "decision" ? "#86efac" : "#67e8f9"} />
              <span className="x">{e.text}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
