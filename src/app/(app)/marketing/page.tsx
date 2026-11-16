"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, Clapperboard, Coins, Film, FolderSync, Gavel, ListVideo, Megaphone, Scale, ShieldCheck, Users } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Empty, PageHead, PageState, Stat, useAction } from "@/components/ui";
import { VideoCard, VideoDrawer, VideoThumb, STATUS_TONE } from "@/components/marketing-bits";

const TABS: [string, string, React.ElementType][] = [
  ["pipeline", "Dây chuyền sản xuất", Clapperboard],
  ["batches", "Lô video", ListVideo],
  ["review", "Kiểm duyệt", BadgeCheck],
  ["characters", "Nhân vật AI", Users],
  ["rules", "Luật kênh", Scale],
];

export default function MarketingPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") ?? "pipeline");
  const [open, setOpen] = useState<string | null>(sp.get("video"));
  const data = useApi<any>("/marketing");
  const { run, busy } = useAction();
  useEffect(() => {
    const v = sp.get("video");
    if (v) setOpen(v);
  }, [sp]);

  return (
    <>
      <PageHead
        title="Hệ thống Marketing"
        sub="Quản lý kênh nội dung, dây chuyền sản xuất video, lô video và kiểm duyệt trước khi đăng. Agent Xây kênh đề xuất, con người duyệt."
        actions={
          data.data?.channel && (
            <>
              <Link href="/channels" className="btn btn-outline">
                <Megaphone /> Đề xuất xây kênh ({data.data.proposals.length})
              </Link>
              {data.data.can_manage && data.data.media.available && (
                <button className="btn btn-primary" disabled={busy} onClick={async () => (await run(() => api("/marketing/sync", { body: {} }), (r: any) => r.message)) && data.reload()}>
                  <FolderSync /> Nhập lô mới từ máy
                </button>
              )}
            </>
          )
        }
      />
      <PageState q={data}>
        {(d) =>
          !d.channel ? (
            <Empty title="Chưa có kênh nội dung" text="Vào Đề xuất xây kênh để Agent Xây kênh lập kế hoạch kênh đầu tiên." />
          ) : (
            <>
              <div className="banner teal mb-16">
                <Film />
                <div>
                  <b>Kênh “{d.channel.name}”</b> · {d.channel.platform} · {d.channel.status === "TRIAL" ? "Đang chạy thử" : d.channel.status === "ACTIVE" ? "Đang chạy" : d.channel.status} · nhân vật do AI tạo trên Google Flow. {d.media.note}
                  {d.simulated ? " Dữ liệu khách và vận hành trong hệ thống là DỮ LIỆU MÔ PHỎNG." : ""}
                </div>
              </div>
              <div className="grid g-4 mb-16">
                <Stat tone="teal" icon={<Clapperboard />} num={d.stats.producing} label="Video đang sản xuất" onClick={() => setTab("pipeline")} />
                <Stat tone="gold" icon={<BadgeCheck />} num={d.stats.in_review} label="Chờ kiểm duyệt" onClick={() => setTab("review")} />
                <Stat tone="green" icon={<ShieldCheck />} num={d.stats.approved} label="Đã duyệt / lên lịch" />
                <Stat tone="blue" icon={<Coins />} num={d.stats.credits} label="Tín dụng Flow đã dùng" />
              </div>
              <div className="pill-tabs mb-16" role="tablist">
                {TABS.map(([k, l, Icon]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                    <Icon size={18} /> {l}
                    {k === "review" && d.stats.in_review > 0 ? ` (${d.stats.in_review})` : ""}
                  </button>
                ))}
              </div>

              {tab === "pipeline" && (
                <div className="mk-board">
                  {d.pipeline.map((col: any) => (
                    <div key={col.status} className="mk-col">
                      <div className="mk-col-head">
                        <Badge tone={STATUS_TONE[col.status]}>{col.label}</Badge>
                        <span className="muted small">{col.videos.length}</span>
                      </div>
                      <div className="mk-col-body">
                        {col.videos.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>Trống</div>}
                        {col.videos.map((v: any) => (
                          <button key={v.id} className="mk-item" onClick={() => setOpen(v.id)}>
                            <VideoThumb v={v} size="sm" />
                            <span style={{ minWidth: 0, textAlign: "left" }}>
                              <b>
                                {v.code} · {v.title}
                              </b>
                              <small>Dạng {v.format}{v.needs_expert && !v.expert_ok ? " · chờ thợ duyệt" : ""}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "batches" &&
                d.batches.map((b: any) => (
                  <section key={b.id} className="card mb-16">
                    <div className="card-head">
                      <h2>
                        <ListVideo /> {b.title}
                      </h2>
                      <div className="right">
                        <Badge tone={b.status === "REVIEW" ? "gold" : b.status === "PLANNING" ? "blue" : "green"}>
                          {{ PLANNING: "Đang lên kế hoạch", PRODUCING: "Đang sản xuất", REVIEW: "Đang kiểm duyệt", DONE: "Hoàn tất" }[b.status as string]}
                        </Badge>
                      </div>
                      {b.note && <div className="sub">{b.note}</div>}
                    </div>
                    <div className="card-body">
                      {b.videos.length === 0 ? (
                        <div className="small muted">Lô chưa có video.</div>
                      ) : (
                        <div className="vgrid">
                          {b.videos.map((v: any) => (
                            <VideoCard key={v.id} v={v} onOpen={() => setOpen(v.id)} />
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                ))}

              {tab === "review" && (
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <BadgeCheck /> Hàng chờ kiểm duyệt
                    </h2>
                    <div className="sub">Mỗi video phải có người nghe lại lời, giọng, khớp miệng; câu chuyên môn phải có thợ thật duyệt; máy kiểm luật kênh không còn lỗi chặn.</div>
                  </div>
                  <div className="card-body">
                    {d.pipeline.filter((c: any) => ["IN_REVIEW", "REVISE"].includes(c.status)).flatMap((c: any) => c.videos).length === 0 ? (
                      <Empty title="Không có video chờ kiểm duyệt" img={false} />
                    ) : (
                      <div className="vgrid">
                        {d.pipeline
                          .filter((c: any) => ["IN_REVIEW", "REVISE"].includes(c.status))
                          .flatMap((c: any) => c.videos)
                          .map((v: any) => (
                            <VideoCard key={v.id} v={v} onOpen={() => setOpen(v.id)} />
                          ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {tab === "characters" && (
                <section className="card">
                  <div className="card-head">
                    <h2>
                      <Users /> Nhân vật AI của kênh
                    </h2>
                    <div className="sub">Nhân vật hư cấu, người lớn, tạo trên Google Flow (0 tín dụng). Không dùng mặt, tên người thật.</div>
                  </div>
                  <div className="table-wrap">
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Nhân vật</th>
                          <th>Vai</th>
                          <th>Dạng</th>
                          <th>Giọng</th>
                          <th>Ngoại hình</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.characters.map((c: any) => (
                          <tr key={c.id}>
                            <td className="strong nowrap">{c.name}</td>
                            <td className="small">{c.role}</td>
                            <td className="small nowrap">{c.formats}</td>
                            <td className="small nowrap">{c.voice}</td>
                            <td className="small">{c.description}</td>
                            <td className="nowrap">
                              <Badge tone={c.status === "CREATED" ? "green" : c.status === "APPROVED" ? "teal" : "gray"}>
                                {c.status === "CREATED" ? `Đã tạo ${c.created_on ?? ""}` : c.status === "APPROVED" ? "Đã duyệt, chờ tạo" : "Dự kiến"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === "rules" && (
                <div className="grid g-2">
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <Scale /> Luật nội dung của kênh
                      </h2>
                    </div>
                    <div className="card-body">
                      {(d.channel.rules?.content ?? []).map((r: string, i: number) => (
                        <div key={i} className="list-item small">
                          <ShieldCheck size={16} color="var(--primary)" style={{ flex: "none", marginTop: 2 }} />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <div className="card-head">
                      <h2>
                        <Gavel /> Căn cứ pháp lý tham chiếu
                      </h2>
                      <div className="sub">{d.channel.rules?.legal_note}</div>
                    </div>
                    <div className="card-body">
                      {(d.channel.rules?.legal ?? []).map((r: string, i: number) => (
                        <div key={i} className="list-item small">
                          <Gavel size={16} color="var(--gold-600)" style={{ flex: "none", marginTop: 2 }} />
                          <span>{r}</span>
                        </div>
                      ))}
                      <div className="mt-12 small strong">Bảng kiểm duyệt trước khi đăng</div>
                      {d.checklist.map((c: any) => (
                        <div key={c.key} className="small">
                          • {c.label}
                          {c.required ? " (bắt buộc)" : ""}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              {open && <VideoDrawer id={open} onClose={() => setOpen(null)} onChanged={() => data.reload()} />}
            </>
          )
        }
      </PageState>
    </>
  );
}
