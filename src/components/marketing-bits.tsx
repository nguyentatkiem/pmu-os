"use client";
// Thành phần dùng chung cho Hệ thống Marketing: thẻ video, trình phát, ngăn chi tiết và kiểm duyệt.
import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, Ban, CheckCircle2, Clapperboard, Film, Pencil, Play, Send, ShieldCheck, Sparkles, UserRound, XCircle } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Drawer, Field, Skeleton, useAction } from "./ui";
import { fmtDateTime } from "@/lib/shared/format";

export const FORMAT_TONE: Record<string, string> = { A: "teal", B: "violet", C: "blue", D: "gold" };
export const STATUS_TONE: Record<string, string> = {
  IDEA: "gray",
  SCRIPTED: "blue",
  PRODUCED: "teal",
  IN_REVIEW: "gold",
  REVISE: "red",
  APPROVED: "green",
  SCHEDULED: "green",
  PUBLISHED: "green",
  REJECTED: "red",
};

export function VideoThumb({ v, onOpen, size = "md" }: { v: any; onOpen?: () => void; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const w = size === "sm" ? 92 : 150;
  return (
    <button className="vthumb" style={{ width: w, height: Math.round((w * 16) / 9) }} onClick={onOpen} aria-label={`Mở video ${v.code} ${v.title}`}>
      {v.media_available && !broken ? (
        <img src={`/api/media/poster/${v.id}`} alt="" onError={() => setBroken(true)} loading="lazy" />
      ) : (
        <span className={`vthumb-ph f-${v.format}`}>
          <b>{v.code}</b>
          <small>{v.has_media_ref ? "Video trên máy nội bộ" : v.status === "IDEA" ? "Ý tưởng" : "Chưa quay"}</small>
        </span>
      )}
      {v.media_available && (
        <span className="vthumb-play">
          <Play size={size === "sm" ? 16 : 22} />
        </span>
      )}
      <span className="vthumb-code">{v.code}</span>
    </button>
  );
}

export function VideoCard({ v, onOpen }: { v: any; onOpen: () => void }) {
  return (
    <div className="vcard">
      <VideoThumb v={v} onOpen={onOpen} />
      <div className="vcard-body">
        <div className="row" style={{ gap: 6 }}>
          <Badge tone={FORMAT_TONE[v.format]}>Dạng {v.format}</Badge>
          <Badge tone={STATUS_TONE[v.status]}>{v.status_label}</Badge>
        </div>
        <button className="vcard-title" onClick={onOpen}>
          {v.title}
        </button>
        {v.headline && <div className="tiny" style={{ color: "#c0262d", fontWeight: 700 }}>“{v.headline}”</div>}
        <div className="tiny muted">
          {v.duration_s ? `${String(v.duration_s).replace(".", ",")} giây · ` : ""}
          {v.credits ? `${v.credits} tín dụng · ` : ""}
          {(v.characters ?? []).join(", ")}
        </div>
        {v.needs_expert && !v.expert_ok && (
          <div className="tiny" style={{ color: "var(--warn)" }}>
            <AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Có câu chờ thợ duyệt
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const q = useApi<any>(`/marketing/videos/${id}`, [id]);
  const { run, busy } = useAction();
  const [check, setCheck] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [tech, setTech] = useState("");
  const d = q.data;
  const v = d?.video;
  const act = async (fn: () => Promise<any>) => {
    const r = await run(fn, (x: any) => x?.message ?? "Đã lưu.");
    if (r) {
      q.reload();
      onChanged();
    }
  };
  return (
    <Drawer title={v ? `${v.code} · ${v.title}` : "Video"} icon={<Clapperboard />} onClose={onClose}>
      {!d && <Skeleton h={400} />}
      {v && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="vplayer-wrap">
            {v.media_available ? (
              <video className="vplayer" src={`/api/media/video/${v.id}`} controls playsInline preload="metadata" poster={`/api/media/poster/${v.id}`} />
            ) : (
              <div className={`vplayer ph f-${v.format}`}>
                <Film size={34} />
                <b>{v.has_media_ref ? "Video lưu trên máy nội bộ" : "Chưa có video dựng xong"}</b>
                <small>{v.has_media_ref ? "File video thật chỉ phát trên máy của chủ doanh nghiệp, không đưa lên máy chủ công khai." : "Video ở giai đoạn ý tưởng hoặc kịch bản."}</small>
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone={FORMAT_TONE[v.format]}>{v.format_label}</Badge>
            <Badge tone={STATUS_TONE[v.status]}>{v.status_label}</Badge>
            {d.batch && <Badge tone="gray">{d.batch.title}</Badge>}
            {v.expert_ok && <Badge tone="green" icon={<BadgeCheck />}>Thợ đã duyệt chuyên môn</Badge>}
          </div>
          {v.headline && (
            <div>
              <div className="tiny muted">Tiêu đề đỏ trên video</div>
              <div style={{ color: "#c0262d", fontWeight: 800, fontSize: 18 }}>{v.headline}</div>
            </div>
          )}
          {v.situation && <div className="small">{v.situation}</div>}
          {d.pending_script && (
            <div className="banner warn small">
              <ShieldCheck />
              <div>
                Có kịch bản đề xuất <b>{d.pending_script.code}</b> đang chờ duyệt.{" "}
                <a className="link" href={`/approvals?open=${d.pending_script.id}`}>
                  Mở để duyệt
                </a>
                {(d.pending_script.after_snapshot?.clips ?? []).map((c: any, i: number) => (
                  <div key={i} className="script-clip" style={{ background: "#fff" }}>
                    <div className="tiny muted">Clip {c.name}</div>
                    {(c.lines ?? []).map((l: any, k: number) => (
                      <div key={k} className="script-line">
                        <b>{l.speaker}</b>
                        <span>{l.text}</span>
                        {l.expert ? <Badge tone="gold">Chờ thợ duyệt</Badge> : <span />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <b>Kịch bản</b>
            {!(v.script ?? []).length && <div className="small muted mt-8">Chưa có kịch bản. Có thể nhờ trợ lý “Giao việc AI” viết theo luật kênh.</div>}
            {(v.script ?? []).map((c: any, i: number) => (
              <div key={i} className="script-clip">
                <div className="tiny muted">
                  Clip {c.name} · {v.words?.[i] ?? 0} từ · {(c.lines ?? []).length} lượt lời
                </div>
                {(c.lines ?? []).map((l: any, k: number) => (
                  <div key={k} className="script-line">
                    <b>{l.speaker}</b>
                    <span>{l.text}</span>
                    {l.expert && <Badge tone={v.expert_ok ? "green" : "gold"}>{v.expert_ok ? "Thợ đã duyệt" : "Chờ thợ duyệt"}</Badge>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {v.caption && (
            <div>
              <b>Caption</b>
              <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                {v.caption}
              </div>
              <div className="tiny muted">{v.hashtags}</div>
            </div>
          )}
          <div>
            <b className="row" style={{ gap: 6 }}>
              <ShieldCheck size={16} color="var(--primary)" /> Máy kiểm luật kênh
            </b>
            {d.checks.map((c: any, i: number) => (
              <div key={i} className="small" style={{ color: c.level === "block" ? "var(--danger)" : c.level === "warn" ? "var(--warn)" : "var(--ok)", marginTop: 4 }}>
                {c.level === "ok" ? <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> : c.level === "block" ? <XCircle size={14} style={{ verticalAlign: -2 }} /> : <AlertTriangle size={14} style={{ verticalAlign: -2 }} />} {c.text}
              </div>
            ))}
          </div>
          {Object.keys(v.production ?? {}).length > 0 && (
            <dl className="kv small">
              {v.production.loi && (
                <>
                  <dt>Kiểm lời</dt>
                  <dd>{v.production.loi}</dd>
                </>
              )}
              {v.production.giong && (
                <>
                  <dt>Kiểm giọng</dt>
                  <dd>{v.production.giong}</dd>
                </>
              )}
              {v.production.mieng && (
                <>
                  <dt>Nghe bằng tai</dt>
                  <dd>{v.production.mieng}</dd>
                </>
              )}
              {v.production.nguon && (
                <>
                  <dt>Nguồn</dt>
                  <dd>{v.production.nguon}</dd>
                </>
              )}
              {v.duration_s && (
                <>
                  <dt>Thời lượng</dt>
                  <dd>{String(v.duration_s).replace(".", ",")} giây · {v.credits} tín dụng Flow</dd>
                </>
              )}
            </dl>
          )}

          {v.status === "IN_REVIEW" && d.can_review && (
            <section className="review-box">
              <b className="row" style={{ gap: 6 }}>
                <BadgeCheck size={18} color="var(--gold-600)" /> Kiểm duyệt trước khi đăng
              </b>
              {v.needs_expert && !v.expert_ok && (
                <div className="banner warn small mt-8">
                  <AlertTriangle />
                  <div style={{ flex: 1 }}>
                    Có câu chuyên môn chưa được thợ thật duyệt. Ghi tên thợ đã duyệt:
                    <div className="row mt-8" style={{ gap: 6 }}>
                      <input className="input" style={{ height: 36, maxWidth: 220 }} placeholder="Tên thợ đã duyệt" value={tech} onChange={(e) => setTech(e.target.value)} />
                      <button className="btn btn-outline btn-sm" disabled={busy || !tech.trim()} onClick={() => act(() => api(`/marketing/videos/${v.id}/expert`, { body: { technician: tech } }))}>
                        <UserRound size={14} /> Ghi nhận
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="stack mt-8" style={{ gap: 6 }}>
                {d.checklist.map((c: any) => (
                  <label key={c.key} className="row small" style={{ gap: 8, flexWrap: "nowrap", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!check[c.key]} onChange={(e) => setCheck({ ...check, [c.key]: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--primary)" }} />
                    <span>
                      {c.label}
                      {c.required ? "" : " (khuyến nghị)"}
                    </span>
                  </label>
                ))}
              </div>
              <Field label="Ghi chú / lý do (bắt buộc khi yêu cầu sửa hoặc loại)">
                <textarea className="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api(`/marketing/videos/${v.id}/review`, { body: { decision: "APPROVE", checklist: check, reason } }))}>
                  <CheckCircle2 size={16} /> Duyệt
                </button>
                <button className="btn btn-outline" disabled={busy} onClick={() => act(() => api(`/marketing/videos/${v.id}/review`, { body: { decision: "REVISE", checklist: check, reason } }))}>
                  <Pencil size={16} /> Yêu cầu sửa
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api(`/marketing/videos/${v.id}/review`, { body: { decision: "REJECT", checklist: check, reason } }))}>
                  <Ban size={16} /> Loại
                </button>
              </div>
            </section>
          )}
          {["PRODUCED", "REVISE", "SCRIPTED"].includes(v.status) && d.can_manage && (v.script ?? []).length > 0 && (
            <button className="btn btn-outline" disabled={busy} onClick={() => act(() => api(`/marketing/videos/${v.id}/submit`, { body: {} }))}>
              <Send size={16} /> Gửi kiểm duyệt
            </button>
          )}
          {v.status === "APPROVED" && d.can_manage && (
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api(`/marketing/videos/${v.id}/schedule`, { body: {} }))}>
              <Sparkles size={16} /> Đề xuất lịch đăng 06:30
            </button>
          )}
          <div>
            <b>Lịch sử kiểm duyệt</b>
            {d.reviews.length === 0 && <div className="small muted mt-8">Chưa có.</div>}
            {d.reviews.map((r: any) => (
              <div key={r.id} className="list-item small" style={{ padding: "8px 0" }}>
                <Badge tone={r.decision === "APPROVE" || r.decision === "EXPERT_OK" ? "green" : r.decision === "SUBMIT" ? "blue" : "red"}>
                  {{ APPROVE: "Duyệt", REVISE: "Yêu cầu sửa", REJECT: "Loại", SUBMIT: "Gửi kiểm duyệt", EXPERT_OK: "Thợ duyệt" }[r.decision as string]}
                </Badge>
                <span style={{ flex: 1 }}>
                  <b>{r.reviewer_label}</b> · {fmtDateTime(r.biz_at)}
                  {r.reason && <div className="muted">{r.reason}</div>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}
