"use client";
import React from "react";
import Link from "next/link";
import { ArrowDown, CalendarClock, Clapperboard, Funnel, MessageCircle, Sparkles, TriangleAlert, Users } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { PageHead, PageState, Stat } from "@/components/ui";

const pctText = (r: number | null) => (r === null ? "chưa đủ dữ liệu" : `${(r * 100).toFixed(1).replace(".", ",").replace(/,0$/, "")}%`);
const COLORS = ["#0a5e6e", "#0b6b7c", "#0e7b8d", "#16899b", "#2d98a8", "#c79a4c", "#d7b06b", "#e3c58f"];

export default function FunnelPage() {
  const q = useApi<any>("/marketing/funnel");
  return (
    <>
      <PageHead title="Phễu khách hàng" sub="Từ người xem nội dung tới khách quay lại: số khách ở từng chặng, tỷ lệ chuyển, điểm nghẽn và dạng nội dung nuôi từng chặng." />
      <PageState q={q}>
        {(d) => {
          const max = Math.max(1, d.stages[0]?.count ?? 1);
          return (
            <div className="stack" style={{ gap: 16 }}>
              {d.simulated && (
                <div className="banner warn">
                  <TriangleAlert />
                  <div>Số liệu tính từ DỮ LIỆU MÔ PHỎNG trong hệ thống. {d.note}</div>
                </div>
              )}
              <div className="grid g-4">
                <Stat tone="teal" icon={<Users />} num={d.total} label="Khách trong phễu" href="/customers" />
                <Stat tone="blue" icon={<MessageCircle />} num={d.last30.zalo_30d} label="Hội thoại Zalo có tin khách 30 ngày" href="/inbox" />
                <Stat tone="gold" icon={<CalendarClock />} num={d.last30.consult_30d} label="Lịch tư vấn 30 ngày" href="/appointments" />
                <Stat tone="green" icon={<Clapperboard />} num={d.content.published} label="Video đã đăng" href="/marketing" />
              </div>

              <div className="split" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)" }}>
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Funnel /> Phễu 8 chặng theo hành trình khách
                    </h2>
                    <div className="sub">Mỗi chặng đếm khách đã đi tới chặng đó trở lên.</div>
                  </div>
                  <div className="card-body">
                    <div className="funnel">
                      {d.stages.map((s: any, i: number) => (
                        <React.Fragment key={s.stage}>
                          <div className="funnel-row">
                            <span className="funnel-label">
                              {s.stage}. {s.label}
                            </span>
                            <span className="funnel-bar-wrap">
                              <span className="funnel-bar" style={{ width: `${Math.max(6, (s.count / max) * 100)}%`, background: COLORS[i] }}>
                                {s.count}
                              </span>
                            </span>
                          </div>
                          {i < d.conv.length && (
                            <div className={`funnel-conv ${d.bottleneck && d.bottleneck.from === s.label ? "neck" : ""}`}>
                              <ArrowDown size={14} /> {pctText(d.conv[i].rate)}
                              {d.bottleneck && d.bottleneck.from === s.label ? " · điểm nghẽn trước khi làm dịch vụ" : ""}
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="stack" style={{ gap: 16 }}>
                  {d.bottleneck && (
                    <section className="card ai-card">
                      <div className="card-head">
                        <h2>
                          <Sparkles color="var(--gold)" /> Agent Xây kênh đọc phễu
                        </h2>
                      </div>
                      <div className="card-body small stack" style={{ gap: 8 }}>
                        <div>
                          Chặng <b>{d.bottleneck.from} → {d.bottleneck.to}</b> có tỷ lệ chuyển thấp nhất trước khi làm dịch vụ: <b>{pctText(d.bottleneck.rate)}</b>.
                        </div>
                        <div>Nội dung nhắm vào chặng này là dạng A (khách đòi, thợ từ chối), B (ca khó, nói thật), C (giải nghề): xây niềm tin và trả lời trước câu hỏi hay gặp.</div>
                        <div className="muted">
                          Kênh video chưa nối TikTok/Reels nên chưa đo được video nào kéo khách vào phễu. Sau khi đăng, theo dõi khách mới có nguồn TikTok trong hồ sơ khách.
                        </div>
                        <Link href="/channels" className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }}>
                          Xem đề xuất xây kênh
                        </Link>
                      </div>
                    </section>
                  )}
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <Users /> Theo nguồn khách
                      </h2>
                    </div>
                    <div className="table-wrap">
                      <table className="t">
                        <thead>
                          <tr>
                            <th>Nguồn</th>
                            <th>Khách</th>
                            <th>Đặt lịch</th>
                            <th>Dịch vụ</th>
                            <th>Quay lại</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.sources.map((r: any) => (
                            <tr key={r.source}>
                              <td className="strong">{r.source}</td>
                              <td>{r.total}</td>
                              <td>
                                {r.booked} <span className="tiny muted">({pctText(r.total ? r.booked / r.total : null)})</span>
                              </td>
                              <td>
                                {r.served} <span className="tiny muted">({pctText(r.total ? r.served / r.total : null)})</span>
                              </td>
                              <td>{r.returned}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>

              <section className="card">
                <div className="card-head">
                  <h2>
                    <Clapperboard /> Nội dung nuôi từng chặng phễu
                  </h2>
                  <div className="sub">
                    Kênh Tiệm nói thật: {d.content.producing} video đang sản xuất, {d.content.in_review} chờ kiểm duyệt, {d.content.scheduled} đã xếp lịch, {d.content.published} đã đăng. Số view: chưa có (chưa nối nền tảng).
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Chặng</th>
                        <th>Dạng nội dung</th>
                        <th>Mục tiêu</th>
                        <th>Đo bằng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.mapping.map((m: any) => (
                        <tr key={m.stage}>
                          <td className="strong">{m.stage}</td>
                          <td className="small">{m.formats}</td>
                          <td className="small">{m.goal}</td>
                          <td className="small">{m.metric}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          );
        }}
      </PageState>
    </>
  );
}
