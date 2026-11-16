"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Activity, Bot, Brain, Cpu, FileChartColumn, GraduationCap, Heart, OctagonPause, Play, PlayCircle, ShieldCheck, Sparkles, TriangleAlert, Users, Zap } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Drawer, Empty, PageHead, PageState, Stat, useAction, useApp } from "@/components/ui";
import { ChatPanel } from "@/components/AgentChat";
import { fmtDateTime, relativeDay, fmtTime } from "@/lib/shared/format";

const ICON: Record<string, React.ElementType> = { Sparkles, Users, Heart, FileChartColumn, GraduationCap };
const TRIGGER: Record<string, string> = { manual: "Chạy tay", chat: "Từ khung chat", schedule: "Theo lịch" };
const RUN_TONE: Record<string, string> = { SUCCEEDED: "green", FAILED: "red", SKIPPED: "gray", RUNNING: "blue" };
const RUN_LABEL: Record<string, string> = { SUCCEEDED: "Hoàn tất", FAILED: "Lỗi", SKIPPED: "Bỏ qua", RUNNING: "Đang chạy" };
const LEVEL_LABEL: Record<string, string> = {
  INTERNAL_REMINDER: "Nhắc việc nội bộ",
  TASK_ASSIGN: "Giao việc",
  SHIFT_CHANGE: "Đổi / bổ sung ca",
  CUSTOMER_MESSAGE: "Tin nhắn gửi khách",
  CARE_MESSAGE: "Nội dung chăm sóc",
  SOP_PUBLISH: "Xuất bản SOP",
};
const LEVEL_DESC: Record<string, string> = { L0: "Chỉ gợi ý", L1: "Tạo đề xuất, chờ người duyệt", L2: "Tự làm, ghi nhật ký" };

export default function AgentsPage() {
  const { now } = useApp();
  const data = useApi<any>("/agents");
  const [agentFilter, setAgentFilter] = useState("");
  const runs = useApi<any>(`/agents/runs${agentFilter ? `?agent=${agentFilter}` : ""}`, [agentFilter]);
  const [result, setResult] = useState<any>(null);
  const [runDetail, setRunDetail] = useState<any>(null);
  const { run, busy } = useAction();
  const [running, setRunning] = useState("");

  const reload = () => {
    data.reload();
    runs.reload();
  };

  const runAgent = async (key: string) => {
    setRunning(key);
    const r: any = await run(() => api(`/agents/${key}/run`, { body: {} }));
    setRunning("");
    if (r) {
      setResult(r);
      reload();
    }
  };

  return (
    <PageState q={data}>
      {(d) => (
        <>
          <PageHead
            title="Trung tâm AI Agent"
            sub="Đội agent chuyên trách của DOANH NGHIỆP PMU quét dữ liệu theo quyền, tạo đề xuất chờ duyệt. Con người là người quyết định."
            actions={
              <>
                <Link href="/approvals" className="btn btn-outline">
                  <ShieldCheck /> Hộp phê duyệt ({d.pending_total})
                </Link>
                {d.can_manage && (
                  <button
                    className={`btn ${d.paused ? "btn-primary" : "btn-danger"}`}
                    disabled={busy}
                    onClick={async () => {
                      if (!d.paused && !window.confirm("Dừng khẩn cấp toàn bộ agent? Agent sẽ không chạy và khung chat không giao việc được cho đến khi bật lại.")) return;
                      const r = await run(() => api("/agents/pause", { body: { paused: !d.paused } }), d.paused ? "Đã bật lại hệ AI Agent." : "Đã dừng khẩn cấp toàn bộ agent.");
                      if (r) reload();
                    }}
                  >
                    {d.paused ? (
                      <>
                        <PlayCircle /> Bật lại agent
                      </>
                    ) : (
                      <>
                        <OctagonPause /> Dừng khẩn cấp
                      </>
                    )}
                  </button>
                )}
              </>
            }
          />

          {d.paused && (
            <div className="banner danger mb-16">
              <OctagonPause />
              <div>
                <b>Hệ AI Agent đang dừng khẩn cấp.</b> Không agent nào chạy, khung chat chỉ trả lời thông báo dừng. Các thao tác thủ công vẫn hoạt động bình thường.
              </div>
            </div>
          )}
          <div className={`banner ${d.ai.configured ? "teal" : "warn"} mb-16`}>
            <Cpu />
            <div>
              {d.ai.configured ? (
                <>
                  <b>Bộ não: Claude ({d.ai.model})</b> · đã dùng {d.ai.used}/{d.ai.budget} lượt trong 24 giờ. Hết lượt sẽ tự chuyển sang chế độ quy tắc. Agent chỉ dùng công cụ trong phạm vi quyền của người giao việc.
                </>
              ) : (
                <>
                  <b>Chưa có khóa Claude: trợ lý đang chạy chế độ quy tắc.</b> Vẫn hiểu lệnh “Giao [họ tên] ...”, “Chạy agent ...”, câu hỏi vận hành có nguồn. Thêm biến môi trường ANTHROPIC_API_KEY trên máy chủ để bật Claude.
                </>
              )}
              {d.simulated && <span> · Dữ liệu đang hiển thị là DỮ LIỆU MÔ PHỎNG.</span>}
            </div>
          </div>

          <div className="grid g-4 mb-16">
            <Stat tone="teal" icon={<Bot />} num={`${d.agents.filter((a: any) => a.enabled).length}/${d.agents.length}`} label="Agent đang bật" />
            <Stat tone="blue" icon={<Activity />} num={d.agents.reduce((n: number, a: any) => n + a.runs_7d, 0)} label="Lượt chạy 7 ngày" />
            <Stat tone="gold" icon={<ShieldCheck />} num={d.pending_total} label="Đề xuất chờ duyệt" href="/approvals" />
            <Stat tone="green" icon={<Sparkles />} num={d.chats_7d} label="Yêu cầu qua chat 7 ngày" />
          </div>

          <div className="agent-layout">
            <div className="stack" style={{ gap: 16 }}>
              <div className="grid g-2">
                {d.agents.map((a: any) => {
                  const Icon = ICON[a.icon] ?? Bot;
                  return (
                    <div key={a.key} className={`card card-pad agent-card ${a.enabled ? "" : "off"}`}>
                      <div className="ahead">
                        <span className="aico">
                          <Icon size={24} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <b style={{ fontSize: 16.5 }}>{a.name}</b>
                            {a.enabled ? <Badge tone="green">Đang bật</Badge> : <Badge tone="gray">Đang tắt</Badge>}
                          </div>
                          <div className="small muted mt-8">{a.mission}</div>
                        </div>
                        {d.can_manage && a.key !== "coordinator" && (
                          <button
                            className={`toggle ${a.enabled ? "on" : ""}`}
                            aria-label={`${a.enabled ? "Tắt" : "Bật"} ${a.name}`}
                            aria-pressed={a.enabled}
                            disabled={busy}
                            onClick={async () => {
                              const r = await run(() => api(`/agents/${a.key}`, { method: "PATCH", body: { enabled: !a.enabled } }), `${a.enabled ? "Đã tắt" : "Đã bật"} ${a.name}.`);
                              if (r) data.reload();
                            }}
                          />
                        )}
                      </div>
                      <div className="chips">
                        {a.scope.map((s: string) => (
                          <Badge key={s} tone="teal">
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <div className="tiny muted">
                        <b>Công cụ:</b> {a.tools.join(" · ")}
                      </div>
                      <div className="agent-mini">
                        <div>
                          <b>{a.runs_7d}</b>
                          <span>Lượt chạy 7 ngày</span>
                        </div>
                        <div>
                          <b>{a.proposals.pending}</b>
                          <span>Đề xuất chờ duyệt</span>
                        </div>
                        <div>
                          <b>{a.proposals.approved}</b>
                          <span>Đã được duyệt</span>
                        </div>
                        <div>
                          <b>{a.proposals.rejected}</b>
                          <span>Bị từ chối / hết hạn</span>
                        </div>
                      </div>
                      <div className="small">
                        {a.last_run ? (
                          <>
                            <Badge tone={RUN_TONE[a.last_run.status]}>{RUN_LABEL[a.last_run.status]}</Badge>{" "}
                            <span className="muted">
                              {relativeDay(a.last_run.at, now())}, {fmtTime(a.last_run.at)}:
                            </span>{" "}
                            {a.last_run.summary}
                          </>
                        ) : a.key === "coordinator" ? (
                          <span className="muted">Nhận việc qua khung chat bên cạnh.</span>
                        ) : (
                          <span className="muted">Chưa chạy lần nào.</span>
                        )}
                      </div>
                      {a.key !== "coordinator" && d.can_run && (
                        <div className="row">
                          <button className="btn btn-primary btn-sm" disabled={!!running || !a.enabled || d.paused} onClick={() => runAgent(a.key)}>
                            <Play size={16} /> {running === a.key ? "Đang chạy..." : "Chạy ngay"}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAgentFilter(a.key)}>
                            Xem nhật ký
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="card">
                <div className="card-head">
                  <h2>
                    <Zap /> Mức tự chủ của AI
                  </h2>
                  <div className="sub">L0 chỉ gợi ý · L1 tạo đề xuất chờ duyệt · L2 tự làm tác vụ rủi ro thấp và ghi nhật ký. Không tác vụ nào chạm khách hàng ở mức L2.</div>
                </div>
                <div className="card-body">
                  {Object.entries(d.levels).map(([k, v]: [string, any]) => (
                    <div key={k} className="list-item" style={{ alignItems: "center" }}>
                      <span style={{ flex: 1 }}>{LEVEL_LABEL[k] ?? k}</span>
                      <Badge tone={v === "L2" ? "gold" : v === "L1" ? "teal" : "gray"}>{v}</Badge>
                      <span className="small muted" style={{ width: 210 }}>
                        {LEVEL_DESC[v] ?? ""}
                      </span>
                    </div>
                  ))}
                  <div className="tiny muted mt-8">Đổi mức tự chủ tại Cài đặt › Chính sách AI.</div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h2>
                    <Activity /> Nhật ký agent
                  </h2>
                  <div className="right">
                    <select className="select" style={{ height: 38, width: 200 }} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} aria-label="Lọc theo agent">
                      <option value="">Tất cả agent</option>
                      {d.agents
                        .filter((a: any) => a.key !== "coordinator")
                        .map((a: any) => (
                          <option key={a.key} value={a.key}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="table-wrap">
                  {runs.data?.runs?.length === 0 && <Empty title="Chưa có lượt chạy" text="Bấm “Chạy ngay” ở một agent hoặc giao việc qua khung chat." img={false} />}
                  {!!runs.data?.runs?.length && (
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Thời điểm</th>
                          <th>Agent</th>
                          <th>Kích hoạt</th>
                          <th>Trạng thái</th>
                          <th>Kết quả</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.data.runs.map((r: any) => (
                          <tr key={r.id} className="clickable" onClick={() => setRunDetail(r)}>
                            <td className="nowrap">{fmtDateTime(r.biz_started_at)}</td>
                            <td className="nowrap">{r.name}</td>
                            <td className="small">
                              {TRIGGER[r.trigger] ?? r.trigger}
                              <div className="tiny muted">{r.requested_label}</div>
                            </td>
                            <td>
                              <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                            </td>
                            <td className="small">{r.summary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <ChatPanel embedded height="calc(100vh - 130px)" />
          </div>

          {result && <RunDrawer r={result} title={`${result.name}: kết quả lượt chạy`} onClose={() => setResult(null)} />}
          {runDetail && <RunDrawer r={{ ...runDetail, ...(runDetail.output ?? {}) }} title={`${runDetail.name} · ${fmtDateTime(runDetail.biz_started_at)}`} onClose={() => setRunDetail(null)} />}
        </>
      )}
    </PageState>
  );
}

function RunDrawer({ r, title, onClose }: { r: any; title: string; onClose: () => void }) {
  const section = (label: string, items: any[] | undefined, render: (x: any, i: number) => React.ReactNode) =>
    items?.length ? (
      <div className="mt-16">
        <b>
          {label} ({items.length})
        </b>
        <div className="mt-8">{items.map(render)}</div>
      </div>
    ) : null;
  return (
    <Drawer title={title} icon={<Bot />} onClose={onClose}>
      <div className={`banner ${r.status === "FAILED" ? "danger" : r.status === "SKIPPED" ? "warn" : "ok"}`}>
        {r.status === "FAILED" ? <TriangleAlert /> : <Activity />}
        <div>{r.summary}</div>
      </div>
      {section("Đề xuất chờ duyệt mới", r.proposals, (p, i) => (
        <Link key={i} href={`/approvals?open=${p.id}`} className="list-item" style={{ textDecoration: "none", color: "inherit" }}>
          <ShieldCheck size={18} color="var(--primary)" />
          <span>
            <b>{p.code}</b> · {p.summary}
          </span>
        </Link>
      ))}
      {section("Tra Bộ não thứ 2", r.brain, (b, i) => (
        <div key={i} className="list-item">
          <Brain size={18} color="var(--gold-600)" />
          <span className="small">
            “{b.query}” → {b.hits?.length ? b.hits.map((h: any) => h.label).join(" · ") : "không có mục khớp"}
          </span>
        </div>
      ))}
      {section("Thao tác tự động (L2)", r.actions, (a, i) => (
        <div key={i} className="list-item">
          <Zap size={18} color="var(--gold-600)" />
          <span>{a}</span>
        </div>
      ))}
      {section("Phát hiện", r.findings, (f, i) => (
        <div key={i} className="list-item">
          <TriangleAlert size={18} color="var(--warn)" />
          <span>{f}</span>
        </div>
      ))}
      {section("Bỏ qua (đã có đề xuất đang chờ)", r.skipped, (s, i) => (
        <div key={i} className="list-item small muted">
          {s}
        </div>
      ))}
      {!r.proposals?.length && !r.actions?.length && !r.findings?.length && r.status === "SUCCEEDED" && <div className="muted mt-16">Không phát hiện việc cần xử lý trong phạm vi hiện tại.</div>}
    </Drawer>
  );
}
