import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid } from "../db";
import { bad, conflict, notFound, str } from "../http";
import { BRAIN_KIND_LABEL, brainSearch, intentCounts } from "../brain";
import { AGENT_NAME } from "../agents";
import { norm } from "../ai";

const KINDS = ["RULE", "LESSON", "INSIGHT", "MEMORY", "DECISION"];

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/brain",
    handler: async ({ ctx, query }) => {
      ctx.require("approvals.view", "Bộ não thứ 2 dành cho quản lý và chủ doanh nghiệp.");
      const kind = query.get("kind") || "";
      const term = norm(query.get("q") ?? "");
      const notes = await q<any>(
        `SELECT id, kind, title, body, tags, source_label, source_href, author_label, agent, confidence, status, uses, last_used_at, reviewed_by_label, biz_created_at
           FROM brain_notes WHERE tenant_id=$1 AND status <> 'ARCHIVED' ORDER BY (status='PENDING') DESC, biz_created_at DESC`,
        [ctx.tenantId],
      );
      const kn = await q<any>("SELECT id, kind, code, title, body, keywords, version_label, approved_at FROM knowledge_items WHERE tenant_id=$1 AND status='APPROVED' ORDER BY code", [ctx.tenantId]);
      const sops = await q<any>(
        `SELECT v.id, d.title, v.version_label, v.effective_at FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id WHERE v.tenant_id=$1 AND v.status='PUBLISHED' ORDER BY d.title`,
        [ctx.tenantId],
      );
      const since = new Date(ctx.now().getTime() - 7 * 86400000);
      const lookups = await q<any>("SELECT id, agent, query, hits, biz_at FROM brain_lookups WHERE tenant_id=$1 ORDER BY biz_at DESC LIMIT 25", [ctx.tenantId]);
      const look7 = await one<any>("SELECT count(*)::int AS n FROM brain_lookups WHERE tenant_id=$1 AND biz_at >= $2", [ctx.tenantId, since]);
      const items = [
        ...notes.map((n) => ({ ...n, source: "note", kind_label: BRAIN_KIND_LABEL[n.kind] })),
        ...kn.map((k) => ({ id: k.id, kind: k.kind, title: `${k.code} · ${k.title}`, body: k.body, tags: k.keywords, source: "knowledge", status: "ACTIVE", author_label: k.version_label, source_label: "Thư viện FAQ đã duyệt", source_href: "/knowledge", confidence: "HIGH", kind_label: BRAIN_KIND_LABEL[k.kind], biz_created_at: k.approved_at })),
        ...sops.map((s) => ({ id: s.id, kind: "SOP", title: `${s.title} v${s.version_label}`, body: "Quy trình đã xuất bản; agent trích dẫn khi trả lời câu hỏi quy trình.", tags: [], source: "sop", status: "ACTIVE", author_label: "SOP & đào tạo", source_label: "SOP & đào tạo", source_href: "/knowledge", confidence: "HIGH", kind_label: BRAIN_KIND_LABEL.SOP, biz_created_at: s.effective_at })),
      ];
      const filtered = items.filter(
        (i) =>
          (!kind || (kind === "KNOWLEDGE" ? ["FAQ", "POLICY", "SOP"].includes(i.kind) : kind === "PENDING" ? i.status === "PENDING" : i.kind === kind)) &&
          (!term || norm(`${i.title} ${i.body} ${(i.tags ?? []).join(" ")}`).includes(term)),
      );
      return {
        items: filtered,
        counts: {
          all: items.length,
          knowledge: items.filter((i) => ["FAQ", "POLICY", "SOP"].includes(i.kind)).length,
          pending: notes.filter((n) => n.status === "PENDING").length,
          ...Object.fromEntries(KINDS.map((k) => [k, notes.filter((n) => n.kind === k).length])),
        },
        stats: {
          active: items.filter((i) => i.status === "ACTIVE").length,
          pending: notes.filter((n) => n.status === "PENDING").length,
          lookups_7d: look7?.n ?? 0,
          uses: notes.reduce((n, x) => n + (x.uses ?? 0), 0),
        },
        lookups: lookups.map((l) => ({ ...l, agent_name: AGENT_NAME[l.agent] ?? l.agent })),
        intents: await intentCounts(ctx, 7),
        can_review: ctx.can("approvals.decide"),
        simulated: ctx.mode === "DEMO" || !!ctx.settings.simulated_data,
      };
    },
  },
  {
    method: "GET",
    path: "/brain/search",
    handler: async ({ ctx, query }) => {
      ctx.require("approvals.view");
      const term = str(query.get("q"), 200);
      if (!term) throw bad("Nhập nội dung cần tra.", { q: "Bắt buộc" });
      return { hits: await brainSearch(ctx, term, "coordinator", 6) };
    },
  },
  {
    method: "POST",
    path: "/brain",
    handler: async ({ ctx, body }) => {
      ctx.require("approvals.decide", "Chỉ quản lý hoặc chủ doanh nghiệp được thêm vào Bộ não.");
      const kind = KINDS.includes(body.kind) ? body.kind : "MEMORY";
      const title = str(body.title, 140);
      const text = str(body.body, 1200);
      const fe: Record<string, string> = {};
      if (!title) fe.title = "Bắt buộc";
      if (!text) fe.body = "Bắt buộc";
      if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại các trường được đánh dấu.", fe);
      const tags = String(body.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      const id = uid();
      await q(
        `INSERT INTO brain_notes (id, tenant_id, kind, title, body, tags, source_label, author_label, confidence, status, reviewed_by_label, biz_created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Nhập tay',$7,'HIGH','ACTIVE',$7,$8)`,
        [id, ctx.tenantId, kind, title, text, tags, ctx.actorLabel, ctx.now()],
      );
      await audit(ctx, "brain.create", "brain_note", id, { kind, title });
      return { ok: true, id };
    },
  },
  {
    method: "POST",
    path: "/brain/:id/review",
    handler: async ({ ctx, params, body }) => {
      ctx.require("approvals.decide", "Chỉ quản lý hoặc chủ doanh nghiệp được duyệt mục trong Bộ não.");
      const n = await one<any>("SELECT id, status, title FROM brain_notes WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!n) throw notFound("Không tìm thấy mục trong Bộ não.");
      const action = body.action;
      if (!["approve", "archive"].includes(action)) throw bad("Hành động không hợp lệ.");
      if (action === "approve" && n.status !== "PENDING") throw conflict("Mục này không ở trạng thái chờ duyệt.");
      await q("UPDATE brain_notes SET status=$2, reviewed_by_label=$3, updated_at=now(), version=version+1 WHERE id=$1", [n.id, action === "approve" ? "ACTIVE" : "ARCHIVED", ctx.actorLabel]);
      await audit(ctx, action === "approve" ? "brain.approve" : "brain.archive", "brain_note", n.id, { title: n.title });
      return { ok: true, message: action === "approve" ? "Đã duyệt; agent sẽ dùng mục này từ lượt chạy tiếp theo." : "Đã lưu trữ; agent không dùng mục này nữa." };
    },
  },
];
