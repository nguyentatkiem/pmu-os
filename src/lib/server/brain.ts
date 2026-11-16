// Bộ não thứ 2: tri thức dùng chung của các agent.
// Nguồn: ghi nhớ đã duyệt (brain_notes ACTIVE) + FAQ/chính sách đã duyệt + SOP đã xuất bản.
// Agent chỉ đọc mục đã duyệt; mục agent tự rút ra luôn ở trạng thái chờ quản lý duyệt.
import { q, one, uid, j } from "./db";
import type { Ctx } from "./auth";
import { norm } from "./ai";

export const BRAIN_KIND_LABEL: Record<string, string> = {
  RULE: "Quy tắc",
  LESSON: "Bài học",
  INSIGHT: "Insight khách",
  MEMORY: "Ghi nhớ vận hành",
  DECISION: "Quyết định",
  FAQ: "FAQ đã duyệt",
  POLICY: "Chính sách",
  SOP: "SOP đã xuất bản",
};

export interface BrainHit {
  type: "note" | "knowledge" | "sop";
  id: string;
  kind: string;
  label: string;
  body: string;
  score: number;
  href: string;
}

// Từ phổ biến trong tin nhắn tiếng Việt không mang nghĩa nghiệp vụ
const STOP = new Set(
  "cho minh hoi khach ben em chi anh oi a nhe nha the nao duoc khong co la va cua voi can lai thi vay roi nay do day toi ban muon lam gi sao nhu mot cac nhung se da dang hay neu khi tu den qua thu tuan sau truoc ngay hom luc".split(" "),
);
const words = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));

function score(query: string, title: string, body: string, tags: string[]) {
  const qText = ` ${norm(query).split(/[^a-z0-9]+/).filter(Boolean).join(" ")} `;
  const qw = new Set(words(query));
  let s = 0;
  for (const t of tags) {
    const tn = norm(t).split(/[^a-z0-9]+/).filter(Boolean).join(" ");
    if (tn && qText.includes(` ${tn} `)) s += 3 + tn.split(" ").length;
  }
  for (const w of new Set(words(title))) if (qw.has(w)) s += 1.5;
  for (const w of new Set(words(body))) if (qw.has(w) && w.length > 2) s += 0.4;
  return s;
}

/** Tra Bộ não; ghi nhật ký tra cứu và tăng lượt dùng cho mục được dùng. */
export async function brainSearch(ctx: Ctx, query: string, agent: string, limit = 5): Promise<BrainHit[]> {
  const notes = await q<any>("SELECT id, kind, title, body, tags FROM brain_notes WHERE tenant_id=$1 AND status='ACTIVE'", [ctx.tenantId]);
  const kn = await q<any>("SELECT id, kind, code, title, body, keywords FROM knowledge_items WHERE tenant_id=$1 AND status='APPROVED'", [ctx.tenantId]);
  const sops = await q<any>(
    `SELECT v.id, d.title, v.version_label, v.content FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id
      WHERE v.tenant_id=$1 AND v.status='PUBLISHED'`,
    [ctx.tenantId],
  );
  const hits: BrainHit[] = [
    ...notes.map((n) => ({ type: "note" as const, id: n.id, kind: n.kind, label: n.title, body: n.body, score: score(query, n.title, n.body, n.tags ?? []), href: `/brain?open=${n.id}` })),
    ...kn.map((k) => ({ type: "knowledge" as const, id: k.id, kind: k.kind, label: `${k.code} · ${k.title}`, body: k.body, score: score(query, k.title, k.body, k.keywords ?? []), href: "/knowledge" })),
    ...sops.map((s) => {
      const body = typeof s.content === "string" ? s.content : JSON.stringify(s.content ?? "");
      return { type: "sop" as const, id: s.id, kind: "SOP", label: `SOP ${s.title} v${s.version_label}`, body: body.slice(0, 400), score: score(query, s.title, body, []), href: "/knowledge" };
    }),
  ]
    .filter((h) => h.score >= 2.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const now = ctx.now();
  await q("INSERT INTO brain_lookups (id, tenant_id, agent, query, hits, biz_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)", [
    uid(),
    ctx.tenantId,
    agent,
    query.slice(0, 200),
    j(hits.map((h) => ({ label: h.label, kind: h.kind, href: h.href }))),
    now,
  ]);
  const noteIds = hits.filter((h) => h.type === "note").map((h) => h.id);
  if (noteIds.length) await q("UPDATE brain_notes SET uses=uses+1, last_used_at=$2 WHERE id = ANY($1)", [noteIds, now]);
  return hits;
}

/** Agent ghi một bài học / insight mới vào Bộ não ở trạng thái chờ duyệt (không trùng theo dedupe_key). */
export async function brainPropose(
  ctx: Ctx,
  n: { kind: "LESSON" | "INSIGHT"; title: string; body: string; tags: string[]; agent: string; author: string; source_label: string; source_href?: string; confidence?: "HIGH" | "MEDIUM" | "LOW"; dedupe_key: string },
) {
  const exists = await one<any>("SELECT id FROM brain_notes WHERE tenant_id=$1 AND dedupe_key=$2", [ctx.tenantId, n.dedupe_key]);
  if (exists) {
    await q("UPDATE brain_notes SET body=$2, updated_at=now() WHERE id=$1 AND status='PENDING'", [exists.id, n.body]);
    return { id: exists.id, created: false };
  }
  const id = uid();
  await q(
    `INSERT INTO brain_notes (id, tenant_id, kind, title, body, tags, source_label, source_href, author_label, agent, confidence, status, dedupe_key, biz_created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING',$12,$13)`,
    [id, ctx.tenantId, n.kind, n.title, n.body, n.tags, n.source_label, n.source_href ?? null, n.author, n.agent, n.confidence ?? "MEDIUM", n.dedupe_key, ctx.now()],
  );
  return { id, created: true };
}

// Nhóm ý định tin nhắn khách (đếm theo từ khóa, không phải mô hình ngôn ngữ)
export const INTENTS: [string, RegExp][] = [
  ["Đặt lịch / hỏi lịch trống", /dat lich|lich trong|qua duoc|dat \d|hen tu van|tu van vao|muon tu van|dat lich tu van/],
  ["Đổi / hủy lịch", /doi lich|doi sang|huy lich|huy |den muon|ban dot xuat/],
  ["Hỏi chi phí / ưu đãi", /gia|bao nhieu|chi phi|uu dai|khuyen mai/],
  ["Tìm hiểu dịch vụ", /co lam|dich vu|phun mi|dang may|nen lam|bao lau|chuan bi/],
  ["Sau dịch vụ / dặm màu", /sau dich vu|dam lai|dam mau|kiem tra sau|kho|ngua/],
  ["Gặp người phụ trách / góp ý", /quan ly|nguoi phu trach|chua hai long|khieu nai/],
];

export async function intentCounts(ctx: Ctx, days = 7) {
  const since = new Date(ctx.now().getTime() - days * 86400000);
  const rows = await q<any>(
    `SELECT m.body FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
      WHERE m.tenant_id=$1 AND cv.branch_id = ANY($2) AND m.direction='IN' AND m.sent_at >= $3 AND m.sent_at <= $4`,
    [ctx.tenantId, ctx.branchFilter, since, ctx.now()],
  );
  const counts = INTENTS.map(([label]) => ({ label, n: 0 }));
  let other = 0;
  for (const r of rows) {
    const b = norm(r.body);
    const i = INTENTS.findIndex(([, re]) => re.test(b));
    if (i >= 0) counts[i].n++;
    else other++;
  }
  return { total: rows.length, counts: [...counts.sort((a, b) => b.n - a.n), { label: "Khác", n: other }] };
}
