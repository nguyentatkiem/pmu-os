import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid, j } from "../db";
import { bad, conflict, notFound, str } from "../http";
import { createProposal } from "../proposals";
import { checkScript, ensureMarketing, FORMAT_LABEL, funnel, mediaDir, needsExpert, resolveMedia, REVIEW_CHECKLIST, syncFromDisk, VIDEO_STATUS_LABEL } from "../marketing";
import { addDays, fmtDate, vnDayKey, vnToDate } from "../../shared/format";

const ORDER = ["IDEA", "SCRIPTED", "PRODUCED", "IN_REVIEW", "REVISE", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED"];

function videoOut(v: any) {
  const clips = v.script ?? [];
  return {
    ...v,
    status_label: VIDEO_STATUS_LABEL[v.status],
    format_label: FORMAT_LABEL[v.format],
    media_available: !!resolveMedia(v.media_ref),
    has_media_ref: !!v.media_ref,
    needs_expert: needsExpert(clips),
    words: clips.map((c: any) => (c.lines ?? []).reduce((s: number, l: any) => s + String(l.text).trim().split(/\s+/).filter(Boolean).length, 0)),
  };
}

async function loadVideo(tenantId: string, id: string) {
  const v = await one<any>("SELECT * FROM mkt_videos WHERE id=$1 AND tenant_id=$2", [id, tenantId]);
  if (!v) throw notFound("Không tìm thấy video.");
  return v;
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/marketing",
    handler: async ({ ctx }) => {
      ctx.require("marketing.view", "Bạn không có quyền xem hệ thống marketing.");
      const chId = await ensureMarketing(ctx);
      if (!chId) return { channel: null, can_manage: ctx.can("marketing.manage") };
      const ch = await one<any>("SELECT * FROM mkt_channels WHERE id=$1", [chId]);
      const batches = await q<any>("SELECT * FROM mkt_batches WHERE channel_id=$1 ORDER BY biz_created_at, code", [chId]);
      const vids = (await q<any>("SELECT * FROM mkt_videos WHERE channel_id=$1 ORDER BY code", [chId])).map(videoOut);
      const chars = await q<any>("SELECT * FROM mkt_characters WHERE channel_id=$1 ORDER BY (status='CREATED') DESC, created_at", [chId]);
      const props = await q<any>(
        `SELECT id, code, action_type, summary, status, biz_created_at FROM ai_proposals WHERE tenant_id=$1 AND status='PENDING'
          AND (agent='channel' OR action_type IN ('CHANNEL_DECISION','VIDEO_IDEA','VIDEO_PUBLISH')) ORDER BY biz_created_at`,
        [ctx.tenantId],
      );
      const count = (s: string[]) => vids.filter((v) => s.includes(v.status)).length;
      return {
        channel: ch,
        batches: batches.map((b) => ({ ...b, videos: vids.filter((v) => v.batch_id === b.id) })),
        pipeline: ORDER.filter((s) => s !== "REJECTED").map((s) => ({ status: s, label: VIDEO_STATUS_LABEL[s], videos: vids.filter((v) => v.status === s) })),
        characters: chars,
        proposals: props,
        stats: {
          videos: vids.length,
          producing: count(["IDEA", "SCRIPTED", "PRODUCED"]),
          in_review: count(["IN_REVIEW", "REVISE"]),
          approved: count(["APPROVED", "SCHEDULED", "PUBLISHED"]),
          credits: vids.reduce((s, v) => s + (v.credits ?? 0), 0),
          with_media: vids.filter((v) => v.media_available).length,
        },
        checklist: REVIEW_CHECKLIST,
        media: { available: !!mediaDir(), note: mediaDir() ? "Video phát từ thư mục trên máy đang chạy phần mềm." : "Video thật đang lưu trên máy của chủ doanh nghiệp, không đưa lên máy chủ công khai. Mở bản chạy trên máy để xem." },
        can_manage: ctx.can("marketing.manage"),
        can_review: ctx.can("marketing.review"),
        simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data,
      };
    },
  },
  {
    method: "GET",
    path: "/marketing/videos/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("marketing.view");
      const v = await loadVideo(ctx.tenantId, params.id);
      const reviews = await q<any>("SELECT * FROM mkt_reviews WHERE video_id=$1 ORDER BY biz_at DESC", [v.id]);
      const batch = v.batch_id ? await one<any>("SELECT code, title FROM mkt_batches WHERE id=$1", [v.batch_id]) : null;
      return {
        video: videoOut(v),
        batch,
        reviews,
        checks: checkScript({ headline: v.headline, clips: v.script ?? [], caption: v.caption }),
        checklist: REVIEW_CHECKLIST,
        can_manage: ctx.can("marketing.manage"),
        can_review: ctx.can("marketing.review"),
      };
    },
  },
  {
    method: "POST",
    path: "/marketing/videos/:id/submit",
    handler: async ({ ctx, params }) => {
      ctx.require("marketing.manage", "Bạn không có quyền gửi kiểm duyệt.");
      const v = await loadVideo(ctx.tenantId, params.id);
      if (!["PRODUCED", "REVISE", "SCRIPTED"].includes(v.status)) throw conflict(`Video đang ở trạng thái “${VIDEO_STATUS_LABEL[v.status]}”, không gửi kiểm duyệt được.`);
      if (!(v.script ?? []).length) throw bad("Video chưa có kịch bản.");
      const checks = checkScript({ headline: v.headline, clips: v.script, caption: v.caption });
      await q("UPDATE mkt_videos SET status='IN_REVIEW', updated_at=now(), version=version+1 WHERE id=$1", [v.id]);
      await q("INSERT INTO mkt_reviews (id, tenant_id, video_id, reviewer_id, reviewer_label, decision, auto_checks, reason, biz_at) VALUES ($1,$2,$3,$4,$5,'SUBMIT',$6::jsonb,$7,$8)", [
        uid(),
        ctx.tenantId,
        v.id,
        ctx.userId,
        ctx.actorLabel,
        j(checks),
        "Gửi kiểm duyệt",
        ctx.now(),
      ]);
      await audit(ctx, "marketing.submit", "mkt_video", v.id, { code: v.code });
      return { ok: true, message: `Đã gửi video ${v.code} vào hàng kiểm duyệt.` };
    },
  },
  {
    method: "POST",
    path: "/marketing/videos/:id/expert",
    handler: async ({ ctx, params, body }) => {
      ctx.require("marketing.review", "Bạn không có quyền ghi nhận duyệt chuyên môn.");
      const v = await loadVideo(ctx.tenantId, params.id);
      const by = str(body.technician, 80);
      if (!by) throw bad("Ghi rõ thợ nào đã duyệt câu chuyên môn.", { technician: "Bắt buộc" });
      const note = str(body.note, 400);
      await q("UPDATE mkt_videos SET expert_ok=true, expert_note=$2, updated_at=now(), version=version+1 WHERE id=$1", [v.id, `Thợ ${by} đã duyệt${note ? `: ${note}` : ""}`]);
      await q("INSERT INTO mkt_reviews (id, tenant_id, video_id, reviewer_id, reviewer_label, decision, reason, biz_at) VALUES ($1,$2,$3,$4,$5,'EXPERT_OK',$6,$7)", [
        uid(),
        ctx.tenantId,
        v.id,
        ctx.userId,
        ctx.actorLabel,
        `Câu chuyên môn đã được thợ ${by} duyệt${note ? `: ${note}` : ""}`,
        ctx.now(),
      ]);
      await audit(ctx, "marketing.expert_ok", "mkt_video", v.id, { technician: by });
      return { ok: true, message: "Đã ghi nhận thợ thật duyệt câu chuyên môn." };
    },
  },
  {
    method: "POST",
    path: "/marketing/videos/:id/review",
    handler: async ({ ctx, params, body }) => {
      ctx.require("marketing.review", "Bạn không có quyền kiểm duyệt video.");
      const v = await loadVideo(ctx.tenantId, params.id);
      if (v.status !== "IN_REVIEW") throw conflict("Video không ở hàng chờ kiểm duyệt.");
      const decision = String(body.decision ?? "");
      if (!["APPROVE", "REVISE", "REJECT"].includes(decision)) throw bad("Quyết định không hợp lệ.");
      const checklist = (body.checklist ?? {}) as Record<string, boolean>;
      const reason = str(body.reason, 600);
      const checks = checkScript({ headline: v.headline, clips: v.script ?? [], caption: v.caption });
      if (decision === "APPROVE") {
        const missing = REVIEW_CHECKLIST.filter((c) => c.required && !checklist[c.key]);
        if (missing.length) throw bad(`Chưa đánh dấu đủ mục kiểm duyệt bắt buộc: ${missing.map((m) => m.label).join("; ")}.`);
        if (checks.some((c) => c.level === "block")) throw conflict("Kịch bản còn vi phạm luật kênh, không duyệt được. Yêu cầu sửa.");
        if (needsExpert(v.script ?? []) && !v.expert_ok) throw conflict("Còn câu chuyên môn chưa được thợ thật duyệt. Ghi nhận duyệt chuyên môn trước.");
        if (!v.media_ref) throw conflict("Video chưa có file dựng xong.");
      } else if (!reason) throw bad("Nêu lý do yêu cầu sửa hoặc loại.", { reason: "Bắt buộc" });
      const next = decision === "APPROVE" ? "APPROVED" : decision === "REVISE" ? "REVISE" : "REJECTED";
      await q("UPDATE mkt_videos SET status=$2, updated_at=now(), version=version+1 WHERE id=$1", [v.id, next]);
      await q(
        "INSERT INTO mkt_reviews (id, tenant_id, video_id, reviewer_id, reviewer_label, decision, checklist, auto_checks, reason, biz_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)",
        [uid(), ctx.tenantId, v.id, ctx.userId, ctx.actorLabel, decision, j(checklist), j(checks), reason || null, ctx.now()],
      );
      await audit(ctx, `marketing.review.${decision.toLowerCase()}`, "mkt_video", v.id, { code: v.code, reason });
      return { ok: true, status: next, message: decision === "APPROVE" ? `Đã duyệt video ${v.code}. Agent Xây kênh sẽ đề xuất lịch đăng.` : decision === "REVISE" ? `Đã yêu cầu sửa video ${v.code}.` : `Đã loại video ${v.code}.` };
    },
  },
  {
    method: "POST",
    path: "/marketing/videos/:id/schedule",
    handler: async ({ ctx, params }) => {
      ctx.require("marketing.manage", "Bạn không có quyền đề xuất lịch đăng.");
      const v = await loadVideo(ctx.tenantId, params.id);
      if (v.status !== "APPROVED") throw conflict("Chỉ video đã duyệt mới đề xuất lịch đăng.");
      const at = vnToDate(addDays(vnDayKey(ctx.now()), 1), "06:30");
      const r = await createProposal(ctx, {
        action_type: "VIDEO_PUBLISH",
        summary: `Xếp lịch đăng video ${v.code} “${v.title}” lúc 06:30 ${fmtDate(at)} (riêng tư trước)`,
        payload: { video_id: v.id, scheduled_at: at.toISOString() },
        reason: "Video đã qua kiểm duyệt; khung 06:00–07:00 theo số đo kênh tham chiếu.",
        source_refs: [{ type: "video", id: v.id, label: `Video ${v.code}`, href: `/marketing?video=${v.id}` }],
        before: { trang_thai: VIDEO_STATUS_LABEL.APPROVED },
        after: { trang_thai: VIDEO_STATUS_LABEL.SCHEDULED, lich_dang: `06:30 ${fmtDate(at)}` },
        target_type: "mkt_video",
        target_id: v.id,
        agent: "channel",
      });
      return { ok: true, proposal: r, message: `Đã tạo đề xuất ${r.code} chờ duyệt.` };
    },
  },
  {
    method: "POST",
    path: "/marketing/sync",
    handler: async ({ ctx }) => {
      ctx.require("marketing.manage", "Bạn không có quyền nhập lô video.");
      if (!mediaDir()) throw conflict("Máy chủ này không có thư mục video của kênh (chỉ có trên máy của chủ doanh nghiệp).");
      const r = await syncFromDisk(ctx);
      await audit(ctx, "marketing.sync", "mkt_batch", null, { added: r.added });
      return { ...r, message: r.added.length ? `Đã nhập ${r.added.length} video mới: ${r.added.join(", ")}.` : "Không có video mới trong thư mục." };
    },
  },
  {
    method: "GET",
    path: "/marketing/funnel",
    handler: async ({ ctx }) => {
      ctx.require("marketing.view", "Bạn không có quyền xem phễu.");
      await ensureMarketing(ctx);
      return { ...(await funnel(ctx)), simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data };
    },
  },
  {
    method: "GET",
    path: "/marketing/channel",
    handler: async ({ ctx }) => {
      ctx.require("marketing.view", "Bạn không có quyền xem đề xuất xây kênh.");
      const chId = await ensureMarketing(ctx);
      if (!chId) return { channel: null };
      const ch = await one<any>("SELECT * FROM mkt_channels WHERE id=$1", [chId]);
      const chars = await q<any>("SELECT name, status, voice, formats FROM mkt_characters WHERE channel_id=$1", [chId]);
      const props = await q<any>(
        `SELECT p.id, p.code, p.action_type, p.summary, p.reason, p.status, p.biz_created_at, p.before_snapshot, p.after_snapshot,
                (SELECT a.approver_label FROM approvals a WHERE a.proposal_id=p.id ORDER BY a.decided_at DESC LIMIT 1) AS decided_by
           FROM ai_proposals p WHERE p.tenant_id=$1 AND (p.agent='channel' OR p.action_type IN ('CHANNEL_DECISION','VIDEO_IDEA','VIDEO_PUBLISH'))
          ORDER BY (p.status='PENDING') DESC, p.biz_created_at DESC LIMIT 40`,
        [ctx.tenantId],
      );
      const next = await one<any>("SELECT id, code, title FROM mkt_batches WHERE channel_id=$1 AND status='PLANNING' ORDER BY biz_created_at DESC LIMIT 1", [chId]);
      const ideas = next ? (await q<any>("SELECT * FROM mkt_videos WHERE batch_id=$1 ORDER BY code", [next.id])).map(videoOut) : [];
      // Số liệu quét kênh gốc: chỉ đọc khi có thư mục quét trên máy (không đưa lên mã nguồn công khai)
      let scan: any[] | null = null;
      const scanFile = process.env.VERCEL ? null : path.join(homedir(), "Documents/PHUN-XAM-QUET/tong-hop.json");
      if (scanFile && existsSync(scanFile)) {
        try {
          scan = (JSON.parse(readFileSync(scanFile, "utf8")) as any[]).slice(0, 10).map((r) => ({ kenh: r.kenh, video: r.n, trung_vi_12_thang: r.m365, video_12_thang: r.n365, dai_s: r.dur }));
        } catch {
          scan = null;
        }
      }
      const runs = await q<any>("SELECT status, summary, biz_started_at FROM agent_runs WHERE tenant_id=$1 AND agent='channel' ORDER BY biz_started_at DESC LIMIT 1", [ctx.tenantId]);
      return {
        channel: ch,
        characters: chars,
        proposals: props,
        next_batch: next ? { ...next, ideas } : null,
        scan,
        last_run: runs[0] ?? null,
        can_manage: ctx.can("marketing.manage"),
        can_decide: ctx.can("approvals.decide"),
        can_run: ctx.can("approvals.view"),
      };
    },
  },
  // ---------- Phát video và ảnh bìa từ thư mục máy (đã đăng nhập, đúng doanh nghiệp) ----------
  {
    method: "GET",
    path: "/media/video/:id",
    handler: async ({ ctx, params, req }) => {
      ctx.require("marketing.view");
      const v = await loadVideo(ctx.tenantId, params.id);
      const file = resolveMedia(v.media_ref);
      if (!file) throw notFound("Video không có trên máy chủ này (chỉ lưu trên máy của chủ doanh nghiệp).");
      const size = statSync(file).size;
      const range = req.headers.get("range");
      const headers: Record<string, string> = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "private, max-age=300" };
      let start = 0;
      let end = size - 1;
      let status = 200;
      const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
      if (m) {
        start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
        end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
        status = 206;
        headers["content-range"] = `bytes ${start}-${end}/${size}`;
      }
      headers["content-length"] = String(end - start + 1);
      const nodeStream = createReadStream(file, { start, end });
      const stream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (e) => controller.error(e));
        },
        cancel() {
          nodeStream.destroy();
        },
      });
      return new Response(stream, { status, headers });
    },
  },
  {
    method: "GET",
    path: "/media/poster/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("marketing.view");
      const v = await loadVideo(ctx.tenantId, params.id);
      const file = resolveMedia(v.media_ref);
      const base = mediaDir();
      if (!file || !base) throw notFound("Không có ảnh bìa.");
      const dir = path.join(base, ".posters");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `${path.basename(file, ".mp4")}.jpg`);
      if (!existsSync(out)) {
        await new Promise<void>((resolve) => {
          const p = spawn("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.5", "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", out], { stdio: "ignore", env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin` } });
          p.on("close", () => resolve());
          p.on("error", () => resolve());
        });
      }
      if (!existsSync(out)) throw notFound("Không tạo được ảnh bìa.");
      return new Response(readFileSync(out), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
    },
  },
];
