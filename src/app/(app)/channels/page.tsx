"use client";
import React, { useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, Circle, Clapperboard, Coins, Lightbulb, ListChecks, Megaphone, Play, Route, ShieldCheck, Target, Undo2, XCircle } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Empty, PageHead, PageState, useAction, useApp } from "@/components/ui";
import { VideoCard, VideoDrawer } from "@/components/marketing-bits";
import { PROPOSAL_STATUS_LABEL, PROPOSAL_TYPE_LABEL } from "@/lib/shared/labels";
import { fmtDateTime, fmtTime, relativeDay } from "@/lib/shared/format";

const ST_TONE: Record<string, string> = { PENDING: "gold", EXECUTED: "green", APPROVED: "teal", REJECTED: "red", RETURNED: "blue", EXPIRED: "gray", FAILED: "red", CANCELLED: "gray" };

export default function ChannelsPage() {
  const { now } = useApp();
  const q = useApi<any>("/marketing/channel");
  const { run, busy } = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const decide = async (id: string, action: "approve" | "return" | "reject") => {
    const r = await run(() => api(`/approvals/${id}/${action}`, { body: { reason: note[id] || (action === "approve" ? "Đồng ý" : "") } }), (x: any) =>
      x?.status === "EXECUTED" ? `Đã duyệt và thực hiện: ${x?.execution?.result?.message ?? ""}` : x?.message ?? "Đã ghi nhận quyết định.",
    );
    if (r) q.reload();
  };
  return (
    <>
      <PageHead
        title="Đề xuất xây kênh"
        sub="Kế hoạch kênh do Agent Xây kênh lập từ số đo thật, kèm các việc chờ Sếp chốt. Duyệt ngay tại đây hoặc trong hộp Phê duyệt."
        actions={
          q.data?.channel && (
            <>
              <Link href="/marketing" className="btn btn-outline">
                <Clapperboard /> Hệ thống Marketing
              </Link>
              {q.data.can_run && (
                <button className="btn btn-primary" disabled={busy} onClick={async () => (await run(() => api("/agents/channel/run", { body: {} }), (r: any) => `Agent Xây kênh: ${r.summary}`)) && q.reload()}>
                  <Play /> Chạy Agent Xây kênh
                </button>
              )}
            </>
          )
        }
      />
      <PageState q={q}>
        {(d) =>
          !d.channel ? (
            <Empty title="Chưa có kênh" text="Doanh nghiệp chưa có kế hoạch kênh nào." />
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <section className="card ai-card">
                <div className="card-head">
                  <h2>
                    <Megaphone color="var(--gold)" /> Kênh “{d.channel.name}”
                  </h2>
                  <div className="right">
                    <Badge tone={d.channel.status === "TRIAL" ? "gold" : "green"}>{d.channel.status === "TRIAL" ? "Đang chạy thử" : "Đang chạy"}</Badge>
                  </div>
                  <div className="sub">
                    {d.channel.platform} · Agent Xây kênh
                    {d.last_run ? ` · chạy gần nhất ${relativeDay(d.last_run.biz_started_at, now())} ${fmtTime(d.last_run.biz_started_at)}: ${d.last_run.summary}` : ""}
                  </div>
                </div>
                <div className="card-body">
                  <p className="small" style={{ marginTop: 0 }}>
                    {d.channel.concept}
                  </p>
                  <dl className="kv small">
                    <dt>Giọng vùng miền</dt>
                    <dd>{d.channel.settings.giong}</dd>
                    <dt>Tốc độ dựng</dt>
                    <dd>{d.channel.settings.toc_do}</dd>
                    <dt>Giờ đăng</dt>
                    <dd>{d.channel.settings.gio_dang}</dd>
                    <dt>Chế độ đăng</dt>
                    <dd>{d.channel.settings.che_do_dang}</dd>
                    <dt>Nhân vật</dt>
                    <dd>
                      {d.characters.filter((c: any) => c.status === "CREATED").length} đã tạo / {d.characters.length} · {d.characters.map((c: any) => c.name).join(", ")}
                    </dd>
                  </dl>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>
                    <ListChecks /> Việc chờ Sếp chốt ({d.proposals.filter((p: any) => p.status === "PENDING").length})
                  </h2>
                  <div className="sub">Agent chỉ đề xuất. Duyệt thì hệ thống cập nhật kế hoạch kênh, lô video hoặc giao việc tương ứng.</div>
                </div>
                <div className="card-body">
                  {d.proposals.length === 0 && <div className="small muted">Chưa có đề xuất.</div>}
                  {d.proposals.map((p: any) => (
                    <div key={p.id} className="prop-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <Badge tone="gray">{p.code}</Badge>
                          <Badge tone="teal">{PROPOSAL_TYPE_LABEL[p.action_type] ?? p.action_type}</Badge>
                          <Badge tone={ST_TONE[p.status]}>{PROPOSAL_STATUS_LABEL[p.status]}</Badge>
                        </div>
                        <b style={{ display: "block", marginTop: 6 }}>{p.summary}</b>
                        <div className="small muted">{p.reason}</div>
                        <div className="tiny muted">
                          {fmtDateTime(p.biz_created_at)}
                          {p.decided_by ? ` · quyết định bởi ${p.decided_by}` : ""}
                        </div>
                      </div>
                      {p.status === "PENDING" && d.can_decide && (
                        <div className="prop-actions">
                          <input className="input" style={{ height: 34 }} placeholder="Ghi chú (khi trả lại / từ chối)" value={note[p.id] ?? ""} onChange={(e) => setNote({ ...note, [p.id]: e.target.value })} />
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(p.id, "approve")}>
                              <CheckCircle2 size={14} /> Duyệt
                            </button>
                            <button className="btn btn-outline btn-sm" disabled={busy || !note[p.id]} onClick={() => decide(p.id, "return")} title="Cần ghi chú">
                              <Undo2 size={14} /> Trả lại
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={busy || !note[p.id]} onClick={() => decide(p.id, "reject")} title="Cần ghi chú">
                              <XCircle size={14} /> Từ chối
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid g-2">
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <BarChart3 /> Bằng chứng từ số đo
                    </h2>
                    <div className="sub">
                      Quét {d.channel.evidence.channels} kênh phun xăm, {Number(d.channel.evidence.videos).toLocaleString("vi-VN")} video ngày {d.channel.evidence.scanned_on}.
                    </div>
                  </div>
                  <div className="card-body">
                    {(d.channel.evidence.insights ?? []).map((t: string, i: number) => (
                      <div key={i} className="list-item small">
                        <Lightbulb size={16} color="var(--gold-600)" style={{ flex: "none", marginTop: 2 }} />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Clapperboard /> Dạng video và tỷ trọng
                    </h2>
                    <div className="sub">{d.channel.plan.ratio}</div>
                  </div>
                  <div className="card-body">
                    {(d.channel.formats ?? []).map((f: any) => (
                      <div key={f.key} style={{ marginBottom: 12 }}>
                        <div className="row-between small">
                          <b>
                            {f.key} · {f.name}
                          </b>
                          <span>{f.weight}%</span>
                        </div>
                        <div className="progress gold" style={{ marginTop: 4 }}>
                          <span style={{ width: `${f.weight}%` }} />
                        </div>
                        <div className="tiny muted mt-8">
                          {f.stage}. {f.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid g-2">
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Route /> Lộ trình xây kênh
                    </h2>
                    <div className="sub">{d.channel.plan.cadence}</div>
                  </div>
                  <div className="card-body">
                    {(d.channel.plan.phases ?? []).map((ph: any, i: number) => (
                      <div key={i} className="phase">
                        <span className="phase-dot">{i + 1}</span>
                        <div>
                          <b>{ph.name}</b>
                          {ph.items.map((it: string, k: number) => (
                            <div key={k} className="small">
                              • {it}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Target /> Việc cần chuẩn bị và cách đo
                    </h2>
                  </div>
                  <div className="card-body">
                    {(d.channel.plan.prerequisites ?? []).map((p: any, i: number) => (
                      <div key={i} className="row small" style={{ gap: 8, flexWrap: "nowrap", marginBottom: 6 }}>
                        {p.done ? <CheckCircle2 size={16} color="var(--ok)" style={{ flex: "none" }} /> : <Circle size={16} color="var(--subtle)" style={{ flex: "none" }} />}
                        <span style={{ color: p.done ? "var(--muted)" : undefined }}>{p.text}</span>
                      </div>
                    ))}
                    <div className="mt-12 small strong">Đo lường</div>
                    {(d.channel.plan.kpi ?? []).map((k: string, i: number) => (
                      <div key={i} className="small">
                        • {k}
                      </div>
                    ))}
                    <div className="mt-12 small">
                      <Coins size={14} style={{ verticalAlign: -2 }} color="var(--gold-600)" /> {d.channel.plan.cost}
                    </div>
                  </div>
                </section>
              </div>

              {d.next_batch && (
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Lightbulb /> {d.next_batch.title}: ý tưởng đề xuất
                    </h2>
                    <div className="sub">Mở từng thẻ để xem; nhờ khung chat “Giao việc AI” viết kịch bản theo luật kênh (ví dụ: “Viết kịch bản video A2 cô dâu vội cho kênh Tiệm nói thật”).</div>
                  </div>
                  <div className="card-body">
                    <div className="vgrid">
                      {d.next_batch.ideas.map((v: any) => (
                        <VideoCard key={v.id} v={v} onOpen={() => setOpen(v.id)} />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {d.scan && (
                <section className="card scan-card">
                  <div className="card-head">
                    <h2>
                      <ShieldCheck /> Số liệu quét kênh gốc (chỉ hiện trên máy có dữ liệu quét)
                    </h2>
                    <div className="sub">Đọc trực tiếp từ thư mục quét trên máy, không lưu vào phần mềm. Chỉ dùng để phân tích, không chép nội dung kênh khác.</div>
                  </div>
                  <div className="table-wrap">
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Kênh</th>
                          <th>Số video</th>
                          <th>Video 12 tháng</th>
                          <th>Trung vị view 12 tháng</th>
                          <th>Dài (giây)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.scan.map((r: any) => (
                          <tr key={r.kenh}>
                            <td className="strong">@{r.kenh}</td>
                            <td>{r.video}</td>
                            <td>{r.video_12_thang}</td>
                            <td>{Number(r.trung_vi_12_thang ?? 0).toLocaleString("vi-VN")}</td>
                            <td>{r.dai_s}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {open && <VideoDrawer id={open} onClose={() => setOpen(null)} onChanged={() => q.reload()} />}
            </div>
          )
        }
      </PageState>
    </>
  );
}
