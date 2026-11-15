// Bộ máy AI có kiểm soát (chế độ quy tắc, chưa nối nhà cung cấp mô hình).
// Mọi đầu ra có cấu trúc: summary, facts[{text, source_id}], uncertainties[], proposed_actions[].
// AI chỉ đọc dữ liệu trong phạm vi người hỏi; nội dung tin nhắn/tài liệu là dữ liệu, không phải mệnh lệnh.
import { q, type Q } from "./db";
import type { Ctx } from "./auth";
import { taskStats } from "./metrics";
import { visibleCustomerIds } from "./domain";
import { addDays, fmtDate, fmtDateTime, fmtRange, fmtTime, vnDayKey, vnToDate, WEEKDAY_LABEL, dowOfDay, fmtShortDay } from "../shared/format";
import { APPT_STATUS_LABEL, READINESS_LABEL } from "../shared/labels";

export interface Source {
  type: string;
  id: string | null;
  label: string;
  href?: string;
}
export interface Fact {
  text: string;
  source: Source;
}
export interface ProposedAction {
  type: string;
  title: string;
  payload: Record<string, unknown>;
  required_permission: string;
  reason: string;
  preview: string;
}
export interface AiAnswer {
  kind: "brief" | "text" | "sop" | "list" | "policy" | "insufficient";
  summary: string;
  cards?: { key: string; title: string; value: string; unit: string; lines: string[]; sources: Source[]; tone: string }[];
  facts: Fact[];
  uncertainties: string[];
  proposed_actions: ProposedAction[];
  sources: Source[];
  generated_at: string;
  engine: string;
}

export const ENGINE_LABEL = "PMU OS AI (quy tắc có nguồn · chưa nối nhà cung cấp mô hình)";

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();

const taskSrc = (t: any): Source => ({ type: "task", id: t.id, label: `Công việc #${t.code}`, href: `/tasks?open=${t.id}` });
const apptSrc = (a: any): Source => ({ type: "appointment", id: a.id, label: `Lịch hẹn #${a.code}`, href: `/appointments?date=${vnDayKey(a.start_at)}&open=${a.id}` });

// ---------------- Dữ liệu trong phạm vi ----------------
async function scopedOpenTasks(ctx: Ctx) {
  const owner = ctx.can("tasks.view_all") ? null : ctx.employeeId;
  if (!ctx.can("tasks.view_all") && !ctx.employeeId) return { overdue: [], active: [], done: [], total: 0, todo: [] } as any;
  return taskStats(q, ctx.tenantId, ctx.branchFilter, ctx.now(), owner);
}

async function scopedAppointments(ctx: Ctx, fromDay: string, toDay: string) {
  const viewAll = ctx.can("appointments.view_all");
  if (!viewAll && !ctx.employeeId) return [];
  return q<any>(
    `SELECT a.*, c.display_name AS customer, s.name AS service, e.display_name AS employee FROM appointments a
       JOIN customers c ON c.id=a.customer_id JOIN services s ON s.id=a.service_id JOIN employees e ON e.id=a.employee_id
      WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND a.start_at >= $3 AND a.start_at < $4 AND ($5::uuid IS NULL OR a.employee_id=$5::uuid)
      ORDER BY a.start_at`,
    [ctx.tenantId, ctx.branchFilter, vnToDate(fromDay), vnToDate(toDay), viewAll ? null : ctx.employeeId],
  );
}

async function learningGaps(ctx: Ctx) {
  if (!ctx.can("training.assign") && !ctx.employeeId) return [];
  return q<any>(
    `SELECT la.id, la.due_at, e.display_name, e.id AS employee_id, d.title, v.version_label FROM learning_assignments la
       JOIN employees e ON e.id=la.employee_id JOIN sop_versions v ON v.id=la.sop_version_id JOIN sop_documents d ON d.id=v.document_id
      WHERE la.tenant_id=$1 AND e.branch_id = ANY($2) AND la.status='ASSIGNED' AND la.due_at <= $3
        AND ($4::uuid IS NULL OR la.employee_id=$4::uuid)
      ORDER BY la.due_at`,
    [ctx.tenantId, ctx.branchFilter, new Date(ctx.now().getTime() + 2 * 86400000), ctx.can("training.assign") ? null : ctx.employeeId],
  );
}

async function blockedJobs(ctx: Ctx) {
  if (!ctx.can("appointments.view_all") && !ctx.can("care.view")) return [];
  return q<any>("SELECT id, type, result FROM jobs WHERE tenant_id=$1 AND status='BLOCKED' AND run_at >= $2", [
    ctx.tenantId,
    new Date(ctx.now().getTime() - 2 * 86400000),
  ]);
}

async function openFeedback(ctx: Ctx) {
  const ids = await visibleCustomerIds(ctx);
  if (!ids.length || !ctx.can("customers.view_sensitive")) return [];
  return q<any>(
    `SELECT f.*, c.display_name AS customer FROM feedback f JOIN customers c ON c.id=f.customer_id
      WHERE f.tenant_id=$1 AND f.customer_id = ANY($2) AND f.status <> 'RESOLVED' AND f.needs_specialist`,
    [ctx.tenantId, ids],
  );
}

// ---------------- Tóm tắt hôm nay ----------------
export async function dailyBrief(ctx: Ctx): Promise<AiAnswer> {
  const now = ctx.now();
  const today = vnDayKey(now);
  const tomorrow = addDays(today, 1);
  const ts = await scopedOpenTasks(ctx);
  const appts = await scopedAppointments(ctx, today, addDays(today, 2));
  const pending = appts.filter((a: any) => a.status === "PENDING");
  const learn = await learningGaps(ctx);
  const jobs = await blockedJobs(ctx);
  const fbs = await openFeedback(ctx);
  const facts: Fact[] = [];
  const cards: AiAnswer["cards"] = [];

  cards.push({
    key: "overdue",
    title: "Việc quá hạn",
    value: String(ts.overdue.length),
    unit: "công việc",
    tone: ts.overdue.length ? "danger" : "ok",
    lines: ts.overdue.length
      ? ts.overdue.map((t: any) => `${t.title} — ${t.owner_name}, hạn ${fmtDateTime(t.due_at)}`)
      : ["Không có công việc quá hạn trong phạm vi của bạn."],
    sources: ts.overdue.map(taskSrc),
  });
  ts.overdue.forEach((t: any) => facts.push({ text: `${t.code} “${t.title}” của ${t.owner_name} quá hạn từ ${fmtDateTime(t.due_at)}.`, source: taskSrc(t) }));

  const support: { name: string; text: string; src: Source }[] = [];
  for (const t of ts.overdue) support.push({ name: t.owner_name, text: `${t.owner_name} cần hỗ trợ: ${t.title.toLowerCase()}.`, src: taskSrc(t) });
  for (const l of learn)
    support.push({
      name: l.display_name,
      text: `${l.display_name} cần hướng dẫn SOP ${l.title.toLowerCase()} (hạn ${fmtDate(l.due_at)}).`,
      src: { type: "learning", id: l.id, label: `Đào tạo · ${l.title} v${l.version_label}`, href: "/knowledge" },
    });
  const names = [...new Set(support.map((s) => s.name))];
  cards.push({
    key: "support",
    title: "Nhân sự cần hỗ trợ",
    value: String(names.length),
    unit: "nhân sự",
    tone: names.length ? "info" : "ok",
    lines: support.length ? support.map((s) => s.text) : ["Chưa có tín hiệu cần hỗ trợ trong dữ liệu."],
    sources: support.map((s) => s.src),
  });
  support.forEach((s) => facts.push({ text: s.text, source: s.src }));

  cards.push({
    key: "confirm",
    title: "Lịch cần xác nhận",
    value: String(pending.length),
    unit: "lịch hẹn",
    tone: pending.length ? "warn" : "ok",
    lines: pending.length
      ? pending.map((a: any) => `${a.customer} cần xác nhận lịch ${a.service.toLowerCase()} ${fmtTime(a.start_at)} ${fmtDate(a.start_at)}.`)
      : ["Các lịch trong 2 ngày tới đã được xác nhận."],
    sources: pending.map(apptSrc),
  });
  pending.forEach((a: any) => facts.push({ text: `${a.code}: ${a.customer} ${fmtRange(a.start_at, a.end_at)} ${fmtDate(a.start_at)} đang chờ xác nhận.`, source: apptSrc(a) }));

  const priorities: { text: string; src: Source }[] = [];
  const tomorrowAppts = appts.filter((a: any) => vnDayKey(a.start_at) === tomorrow && a.status !== "CANCELLED");
  if (pending.length) priorities.push({ text: `Xác nhận ${pending.length} lịch khách đang chờ (ngày mai có ${tomorrowAppts.length} lịch).`, src: apptSrc(pending[0]) });
  if (ts.overdue.length) priorities.push({ text: `Hoàn thành ${ts.overdue.length} việc quá hạn.`, src: taskSrc(ts.overdue[0]) });
  if (fbs.length) priorities.push({ text: `Phân công chuyên viên xử lý phản hồi của ${fbs[0].customer}.`, src: { type: "feedback", id: fbs[0].id, label: `Phản hồi · ${fbs[0].customer}`, href: "/care" } });
  if (learn.length) priorities.push({ text: `Hướng dẫn SOP cho ${learn.map((l: any) => l.display_name).join(", ")}.`, src: { type: "learning", id: learn[0].id, label: "SOP & đào tạo", href: "/knowledge" } });
  if (ts.active?.length && priorities.length < 3) priorities.push({ text: `Theo dõi ${ts.active.length} việc đang thực hiện đúng hạn.`, src: { type: "task", id: null, label: "Công việc", href: "/tasks" } });
  const top3 = priorities.slice(0, 3);
  cards.push({
    key: "priorities",
    title: "Ba ưu tiên ngày mai",
    value: String(top3.length),
    unit: "ưu tiên (dự thảo)",
    tone: "ok",
    lines: top3.length ? top3.map((p) => p.text) : ["Chưa đủ dữ liệu để đề xuất ưu tiên."],
    sources: top3.map((p) => p.src),
  });

  const uncertainties: string[] = [`Số liệu tính đến ${fmtDateTime(now)} (giờ hệ thống của doanh nghiệp).`];
  if (jobs.length) uncertainties.push(`${jobs.length} lượt nhắc tự động đã bị chặn vì Zalo chưa kết nối; khách có thể chưa nhận được nhắc lịch.`);
  if (!ctx.can("tasks.view_all")) uncertainties.push("Bạn chỉ xem được công việc và lịch của chính mình; tổng hợp không bao gồm dữ liệu ngoài phạm vi.");
  uncertainties.push("Nguyên nhân quá hạn chưa được xác minh; cần hỏi trực tiếp người phụ trách trước khi đánh giá.");

  const proposed: ProposedAction[] = [];
  if (pending.length && ctx.can("tasks.create")) {
    const care = await q<any>(
      `SELECT e.id, e.display_name, (SELECT count(*)::int FROM tasks t WHERE t.owner_id=e.id AND t.status IN ('TODO','IN_PROGRESS','SUBMITTED')) AS load
         FROM employees e WHERE e.tenant_id=$1 AND e.branch_id = ANY($2) AND e.active AND e.position IN ('CUSTOMER_CARE','RECEPTION')
        ORDER BY (e.position='CUSTOMER_CARE') DESC, load ASC LIMIT 1`,
      [ctx.tenantId, ctx.branchFilter],
    );
    if (care[0]) {
      const before17 = now.getTime() < vnToDate(today, "17:00").getTime();
      const due = before17 ? vnToDate(today, "17:00") : vnToDate(tomorrow, "08:30");
      proposed.push({
        type: "TASK_ASSIGN",
        title: "Giao việc",
        required_permission: "tasks.create",
        reason: `${pending.length} lịch chưa xác nhận; nhắc tự động không gửi được khi Zalo chưa kết nối.`,
        preview: `Giao nhiệm vụ xác nhận lịch khách cho ${care[0].display_name}, hạn hoàn thành ${fmtTime(due)} ${before17 ? "hôm nay" : fmtDate(due)}.`,
        payload: {
          title: `Xác nhận lịch khách ${fmtShortDay(vnDayKey(pending[0].start_at))}`,
          owner_id: care[0].id,
          owner_name: care[0].display_name,
          due_at: due.toISOString(),
          priority: "HIGH",
          checklist: ["Xem lịch", ...pending.map((a: any) => `Liên hệ ${a.customer}`), "Cập nhật xác nhận"],
          source_refs: pending.map(apptSrc),
        },
      });
    }
  }
  const sources = [...cards.flatMap((c) => c.sources)];
  return {
    kind: "brief",
    summary: `Dưới đây là tổng hợp nhanh tình hình hôm nay và đề xuất hành động tiếp theo, dựa trên dữ liệu ${ctx.mode === "DEMO" ? "mô phỏng" : ""} trong phạm vi quyền của bạn.`,
    cards,
    facts,
    uncertainties,
    proposed_actions: proposed,
    sources,
    generated_at: now.toISOString(),
    engine: ENGINE_LABEL,
  };
}

// ---------------- Hỏi đáp SOP (chỉ bản đã xuất bản) ----------------
export async function sopAnswer(ctx: Ctx, question: string): Promise<AiAnswer> {
  const now = ctx.now();
  const base = { facts: [], uncertainties: [], proposed_actions: [], generated_at: now.toISOString(), engine: ENGINE_LABEL };
  if (!ctx.can("knowledge.view")) {
    return { ...base, kind: "insufficient", summary: "Bạn chưa được cấp quyền đọc SOP nên AI không thể truy xuất tài liệu.", sources: [] };
  }
  const versions = await q<any>(
    `SELECT v.id, v.version_label, v.content, d.title, d.id AS doc_id FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id
      WHERE v.tenant_id=$1 AND v.status='PUBLISHED'`,
    [ctx.tenantId],
  );
  const stop = new Set(["la", "gi", "nao", "nhung", "cac", "cua", "va", "co", "khong", "the", "bao", "nhieu", "gom", "cho", "toi", "ve", "trong", "mot", "duoc", "khi", "lam", "sao", "voi", "hay", "tat", "ca", "nay", "do", "de", "thi", "ma", "o", "a", "nhe", "em", "anh", "chi"]);
  const words = (t: string) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 0 && !stop.has(w));
  const qWords = words(question);
  const qBigrams = qWords.slice(1).map((w, i) => `${qWords[i]} ${w}`);
  let best: { score: number; v: any; sec: any } | null = null;
  for (const v of versions) {
    for (const sec of v.content.sections ?? []) {
      const tw = words([v.title, sec.heading, sec.body, ...(sec.steps ?? []).map((s: any) => `${s.title}. ${s.body}`)].join(" . "));
      const set = new Set(tw);
      const bi = new Set(tw.slice(1).map((w, i) => `${tw[i]} ${w}`));
      if (!qWords.length) continue;
      const uni = qWords.filter((w) => set.has(w)).length / qWords.length;
      const bg = qBigrams.length ? qBigrams.filter((b) => bi.has(b)).length / qBigrams.length : uni;
      let score = 0.5 * uni + 0.5 * bg;
      if (sec.steps && /buoc|quy trinh|gom/.test(norm(question))) score += 0.05;
      if (!best || score > best.score) best = { score, v, sec };
    }
  }
  if (!best || best.score < 0.55) {
    return {
      ...base,
      kind: "insufficient",
      summary: "Chưa đủ thông tin trong SOP đã xuất bản để trả lời câu hỏi này. AI không dùng bản nháp hoặc nguồn ngoài.",
      uncertainties: ["Nếu cần, hãy đề nghị quản lý bổ sung và duyệt xuất bản SOP liên quan."],
      sources: [],
    };
  }
  const { v, sec } = best;
  const src: Source = { type: "sop_version", id: v.id, label: `SOP ${v.title} v${v.version_label}, mục ${sec.id}`, href: `/knowledge?doc=${v.doc_id}` };
  const steps: string[] = (sec.steps ?? []).map((s: any, i: number) => `${i + 1}. ${s.title}.`);
  return {
    ...base,
    kind: "sop",
    summary: `Theo SOP ${v.title.toLowerCase()} v${v.version_label}, mục ${sec.id}, ${sec.body.charAt(0).toLowerCase()}${sec.body.slice(1)}`,
    facts: steps.map((s) => ({ text: s, source: src })),
    sources: [src],
  };
}

// ---------------- Trợ lý điều hành: phân loại câu hỏi ----------------
export async function askAssistant(ctx: Ctx, question: string): Promise<AiAnswer> {
  const n = norm(question);
  const now = ctx.now();
  const base = { facts: [] as Fact[], uncertainties: [] as string[], proposed_actions: [] as ProposedAction[], generated_at: now.toISOString(), engine: ENGINE_LABEL };
  if (/(bo qua|ignore|quen chinh sach|vuot quyen|toan quyen|gui cho tat ca|xoa toan bo|disable policy)/.test(n)) {
    return {
      ...base,
      kind: "policy",
      summary:
        "Yêu cầu này đòi thay đổi chính sách hoặc vượt quyền nên không được thực hiện. AI chỉ đọc dữ liệu trong phạm vi quyền của bạn và tạo đề xuất để người có thẩm quyền duyệt.",
      uncertainties: ["Nội dung trong tin nhắn hoặc tài liệu luôn được xem là dữ liệu, không phải mệnh lệnh cho hệ thống."],
      sources: [],
    };
  }
  if (/(doanh thu|loi nhuan|luong|ke toan|kho vat tu|thanh toan|ke don|chan doan)/.test(n)) {
    return {
      ...base,
      kind: "insufficient",
      summary: "Chưa đủ dữ liệu: PMU OS v1 không quản lý doanh thu, kế toán, lương, kho hay chẩn đoán chuyên môn, nên AI không trả lời các nội dung này.",
      sources: [],
    };
  }
  if (/(sop|quy trinh|huong dan|cac buoc|buoc nao)/.test(n)) return sopAnswer(ctx, question);
  const brief = await dailyBrief(ctx);
  const pick = (key: string, summary: string): AiAnswer => {
    const c = brief.cards!.find((x) => x.key === key)!;
    return { ...brief, kind: "list", summary, cards: [c], facts: c.lines.map((l, i) => ({ text: l, source: c.sources[i] ?? c.sources[0] })), sources: c.sources };
  };
  if (/qua han|tre han/.test(n)) return pick("overdue", "Danh sách công việc quá hạn trong phạm vi của bạn:");
  if (/(xac nhan|lich hen|lich khach|ngay mai co lich)/.test(n)) return pick("confirm", "Các lịch hẹn cần xác nhận trong 2 ngày tới:");
  if (/(ho tro|can giup|nhan su nao)/.test(n)) return pick("support", "Nhân sự có tín hiệu cần hỗ trợ (cần kiểm tra nguồn trước khi đánh giá):");
  if (/(uu tien|ke hoach|ngay mai)/.test(n)) return pick("priorities", "Ba ưu tiên dự thảo cho ngày mai (cần quản lý kiểm tra):");
  if (/(van de|hom nay|tinh hinh|tong hop|bao cao nhanh|co gi)/.test(n)) return brief;
  const m = n.match(/khach mau ([a-f])\b/);
  if (m) {
    const ids = await visibleCustomerIds(ctx);
    const c = (
      await q<any>("SELECT * FROM customers WHERE tenant_id=$1 AND display_name=$2 AND id = ANY($3)", [
        ctx.tenantId,
        `Khách mẫu ${m[1].toUpperCase()}`,
        ids,
      ])
    )[0];
    if (!c) return { ...base, kind: "insufficient", summary: "Khách hàng này không nằm trong phạm vi bạn được xem, hoặc không tồn tại.", sources: [] };
    const ap = await q<any>("SELECT * FROM appointments WHERE customer_id=$1 AND start_at >= $2 ORDER BY start_at LIMIT 1", [c.id, now]);
    const src: Source = { type: "customer", id: c.id, label: `Hồ sơ ${c.display_name}`, href: `/customers/${c.id}` };
    return {
      ...base,
      kind: "text",
      summary: `${c.display_name}: mức sẵn sàng ${READINESS_LABEL[c.readiness] ?? "chưa phân loại"}${c.readiness_confirmed ? "" : " (đề xuất AI, chưa xác nhận)"}. ${ap[0] ? `Lịch sắp tới ${fmtTime(ap[0].start_at)} ${fmtDate(ap[0].start_at)} — ${APPT_STATUS_LABEL[ap[0].status]}.` : "Chưa có lịch sắp tới."}`,
      facts: [{ text: c.readiness_reason ?? "Chưa có lý do phân loại.", source: src }],
      sources: [src],
    };
  }
  return {
    ...base,
    kind: "insufficient",
    summary:
      "Chưa đủ thông tin trong nguồn được phép để trả lời câu hỏi này. Bạn có thể hỏi về: vấn đề hôm nay, việc quá hạn, lịch cần xác nhận, nhân sự cần hỗ trợ, ưu tiên ngày mai, quy trình SOP hoặc một khách mẫu cụ thể.",
    sources: [],
  };
}

// ---------------- Gợi ý trả lời hội thoại ----------------
export async function inboxSuggest(ctx: Ctx, conversationId: string) {
  const msgs = await q<any>("SELECT * FROM messages WHERE conversation_id=$1 AND tenant_id=$2 ORDER BY sent_at", [conversationId, ctx.tenantId]);
  const lastIn = [...msgs].reverse().find((m) => m.direction === "IN");
  const items = await q<any>("SELECT * FROM knowledge_items WHERE tenant_id=$1 AND status='APPROVED'", [ctx.tenantId]);
  let best: any = null;
  let bestScore = 0;
  if (lastIn) {
    const text = norm(lastIn.body);
    for (const it of items) {
      let s = 0;
      for (const k of it.keywords) if (text.includes(norm(k))) s += norm(k).split(" ").length;
      if (s > bestScore) {
        bestScore = s;
        best = it;
      }
    }
  }
  const slots = await availableConsultSlots(ctx);
  if (!best) {
    return {
      draft: null,
      summary: "Chưa có nội dung FAQ/chính sách đã duyệt phù hợp với tin nhắn này. Đề xuất chuyển chuyên viên.",
      sources: [] as Source[],
      slots,
      needs_specialist: true,
      engine: ENGINE_LABEL,
    };
  }
  const needsSpecialist = best.kind === "POLICY" || best.code === "FAQ-03";
  return {
    draft: best.body,
    summary: `Dựa trên ${best.kind === "FAQ" ? "FAQ" : "chính sách"} đã phê duyệt: “${best.title}”.`,
    sources: [{ type: "faq", id: best.id, label: `Nguồn: ${best.version_label} · ${best.title}` }] as Source[],
    slots,
    needs_specialist: needsSpecialist,
    engine: ENGINE_LABEL,
  };
}

export async function availableConsultSlots(ctx: Ctx) {
  const now = ctx.now();
  const out: { day: string; label: string; times: string[] }[] = [];
  for (const [i, label] of [
    [0, "Hôm nay"],
    [1, "Ngày mai"],
  ] as const) {
    const day = addDays(vnDayKey(now), i);
    const shifts = await q<any>(
      `SELECT s.employee_id, s.start_at, s.end_at FROM shifts s JOIN employees e ON e.id=s.employee_id
        WHERE s.tenant_id=$1 AND s.branch_id = ANY($2) AND s.status='APPROVED' AND e.active AND e.position IN ('CONSULTANT','TECHNICIAN')
          AND s.start_at >= $3 AND s.start_at < $4`,
      [ctx.tenantId, ctx.branchFilter, vnToDate(day), vnToDate(addDays(day, 1))],
    );
    const appts = await q<any>(
      `SELECT employee_id, start_at, end_at FROM appointments WHERE tenant_id=$1 AND status IN ('PENDING','CONFIRMED','ARRIVED')
        AND start_at >= $2 AND start_at < $3`,
      [ctx.tenantId, vnToDate(day), vnToDate(addDays(day, 1))],
    );
    const times: string[] = [];
    for (let m = 8 * 60; m <= 16 * 60 + 30 && times.length < 3; m += 30) {
      const a = vnToDate(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      const b = new Date(a.getTime() + 30 * 60000);
      if (a.getTime() < now.getTime() + 60 * 60000) continue;
      const free = shifts.some(
        (s: any) =>
          new Date(s.start_at) <= a &&
          new Date(s.end_at) >= b &&
          !appts.some((x: any) => x.employee_id === s.employee_id && new Date(x.start_at) < b && new Date(x.end_at) > a),
      );
      if (free) times.push(fmtTime(a));
    }
    out.push({ day, label: `${label}, ${fmtShortDay(day)}`, times });
  }
  return out;
}

// ---------------- Đề xuất phân loại khách ----------------
export async function classifyCustomer(ctx: Ctx, customerId: string) {
  const c = (await q<any>("SELECT * FROM customers WHERE id=$1 AND tenant_id=$2", [customerId, ctx.tenantId]))[0];
  const now = ctx.now();
  const upcoming = await q<any>(
    "SELECT * FROM appointments WHERE customer_id=$1 AND status IN ('PENDING','CONFIRMED') AND start_at >= $2 ORDER BY start_at LIMIT 1",
    [customerId, now],
  );
  const lastIn = (
    await q<any>(
      `SELECT m.body, m.sent_at FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
        WHERE cv.customer_id=$1 AND m.direction='IN' ORDER BY m.sent_at DESC LIMIT 1`,
      [customerId],
    )
  )[0];
  const fb = await q<any>("SELECT 1 FROM feedback WHERE customer_id=$1 AND status<>'RESOLVED' AND needs_specialist", [customerId]);
  const signals: string[] = [];
  let readiness = "WARM";
  const text = lastIn ? norm(lastIn.body) : "";
  if (fb.length) {
    readiness = "COLD";
    signals.push("Có phản hồi đang chờ chuyên viên xử lý");
  } else if (/dat lich|muon hen|dat hen/.test(text)) {
    readiness = "HOT";
    signals.push(`Tin nhắn gần nhất (${fmtDateTime(lastIn.sent_at)}): “${lastIn.body}”`);
  } else if (/gia|bao nhieu|chi phi/.test(text) && c.lifecycle_stage <= 2) {
    readiness = "COLD";
    signals.push("Mới hỏi chi phí, chưa nêu nhu cầu cụ thể");
  } else if (upcoming[0]) {
    readiness = "WARM";
    signals.push(`Đã có lịch ${fmtTime(upcoming[0].start_at)} ${fmtDate(upcoming[0].start_at)} (${APPT_STATUS_LABEL[upcoming[0].status]})`);
  }
  if (c.lifecycle_stage >= 2) signals.push(`Giai đoạn hiện tại: ${c.lifecycle_stage}/8`);
  return {
    readiness,
    label: READINESS_LABEL[readiness],
    reason: signals.join(". ") || "Chưa đủ tín hiệu, giữ mức Ấm mặc định.",
    confidence_text: "Cần xác nhận",
    note: "Phân loại là mức sẵn sàng đặt lịch, không phải đánh giá con người. Nhân sự xác nhận hoặc điều chỉnh.",
    engine: ENGINE_LABEL,
  };
}

// ---------------- Đề xuất người nhận việc ----------------
export async function suggestAssignee(ctx: Ctx, opts: { due_at?: string; position?: string; keyword?: string }) {
  const due = opts.due_at ? new Date(opts.due_at) : ctx.now();
  const emps = await q<any>(
    `SELECT e.id, e.display_name, e.position, e.skills,
            (SELECT count(*)::int FROM tasks t WHERE t.owner_id=e.id AND t.status IN ('TODO','IN_PROGRESS','SUBMITTED')) AS load,
            EXISTS (SELECT 1 FROM shifts s WHERE s.employee_id=e.id AND s.status='APPROVED' AND s.start_at <= $3 AND s.end_at >= $3 - interval '4 hours') AS on_shift
       FROM employees e WHERE e.tenant_id=$1 AND e.branch_id = ANY($2) AND e.active`,
    [ctx.tenantId, ctx.branchFilter, due],
  );
  const kw = opts.keyword ? norm(opts.keyword) : "";
  const scored = emps
    .map((e: any) => {
      let s = 0;
      const why: string[] = [];
      if (opts.position && e.position === opts.position) {
        s += 3;
        why.push("đúng vị trí");
      }
      const skillHit = e.skills.find((k: string) => kw && kw.split(" ").some((w) => w.length > 2 && norm(k).includes(w)));
      if (skillHit) {
        s += 2;
        why.push(`kỹ năng “${skillHit}”`);
      }
      if (e.on_shift) {
        s += 2;
        why.push("có ca gần hạn");
      }
      s -= e.load * 0.5;
      why.push(`đang có ${e.load} việc mở`);
      return { employee_id: e.id, name: e.display_name, score: s, reason: why.join(", ") };
    })
    .sort((a: any, b: any) => b.score - a.score);
  return scored.slice(0, 3);
}

// ---------------- Phân tích lịch tuần ----------------
export async function analyzeWeek(ctx: Ctx, weekStartDay: string) {
  const from = vnToDate(weekStartDay);
  const to = vnToDate(addDays(weekStartDay, 7));
  const emps = await q<any>(
    "SELECT * FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active ORDER BY code",
    [ctx.tenantId, ctx.branchFilter],
  );
  const shifts = await q<any>(
    "SELECT * FROM shifts WHERE tenant_id=$1 AND branch_id = ANY($2) AND status <> 'CANCELLED' AND start_at >= $3 AND start_at < $4 ORDER BY start_at",
    [ctx.tenantId, ctx.branchFilter, from, to],
  );
  const leaves = await q<any>("SELECT * FROM leaves WHERE tenant_id=$1 AND status='APPROVED' AND start_at < $3 AND end_at > $2", [ctx.tenantId, from, to]);
  const tpl = ctx.settings.shift_templates ?? { S: { label: "Sáng", start: "08:00", end: "12:00" }, C: { label: "Chiều", start: "13:00", end: "17:00" } };
  const minStaff = ctx.settings.shift_min_staff ?? { S: 3, C: 3 };
  const conflicts: any[] = [];
  const gaps: any[] = [];
  const suggestions: any[] = [];
  const byEmp: Record<string, any[]> = {};
  for (const s of shifts) (byEmp[s.employee_id] ||= []).push(s);
  const nameOf = (id: string) => emps.find((e: any) => e.id === id)?.display_name ?? "Nhân sự";
  for (const [empId, list] of Object.entries(byEmp)) {
    for (let i = 0; i < list.length; i++)
      for (let k = i + 1; k < list.length; k++) {
        const a = list[i];
        const b = list[k];
        if (new Date(a.start_at) < new Date(b.end_at) && new Date(b.start_at) < new Date(a.end_at)) {
          const os = new Date(Math.max(+new Date(a.start_at), +new Date(b.start_at)));
          const oe = new Date(Math.min(+new Date(a.end_at), +new Date(b.end_at)));
          const draft = [a, b].find((x) => x.status === "DRAFT");
          const keep = draft === a ? b : a;
          conflicts.push({
            type: "OVERLAP",
            employee_id: empId,
            day: vnDayKey(a.start_at),
            shift_ids: [a.id, b.id],
            message: `${nameOf(empId)} trùng ca ${fmtRange(os, oe)} ngày ${fmtShortDay(vnDayKey(a.start_at))}.`,
          });
          if (draft && new Date(keep.end_at) < new Date(draft.end_at)) {
            suggestions.push({
              key: `adjust:${draft.id}`,
              action_type: "SHIFT_ADJUST",
              title: "Đề xuất quản lý điều chỉnh ca trùng",
              detail: `Đổi ca chưa duyệt của ${nameOf(empId)} thành ${fmtTime(keep.end_at)}–${fmtTime(draft.end_at)} ngày ${fmtShortDay(vnDayKey(draft.start_at))}.`,
              reason: `Hai ca giao nhau ${fmtRange(os, oe)}.`,
              payload: { shift_id: draft.id, start_at: new Date(keep.end_at).toISOString(), end_at: new Date(draft.end_at).toISOString() },
              target_id: draft.id,
            });
          }
        }
      }
  }
  for (const s of shifts)
    for (const l of leaves)
      if (l.employee_id === s.employee_id && new Date(s.start_at) < new Date(l.end_at) && new Date(l.start_at) < new Date(s.end_at))
        conflicts.push({ type: "LEAVE", employee_id: s.employee_id, day: vnDayKey(s.start_at), shift_ids: [s.id], message: `${nameOf(s.employee_id)} có ca trong ngày nghỉ phép ${fmtShortDay(vnDayKey(s.start_at))}.` });

  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStartDay, i);
    for (const [key, t] of Object.entries(tpl)) {
      const ss = vnToDate(day, t.start);
      const se = vnToDate(day, t.end);
      const inSlot = shifts.filter((s: any) => s.status === "APPROVED" && new Date(s.start_at) < se && new Date(s.end_at) > ss);
      const staffIds = [...new Set(inSlot.map((s: any) => s.employee_id))];
      const need = minStaff[key] ?? 0;
      if (staffIds.length < need) {
        const hasTech = staffIds.some((id) => emps.find((e: any) => e.id === id)?.position === "TECHNICIAN");
        const dow = dowOfDay(day);
        const candidates = emps
          .filter((e: any) => !shifts.some((s: any) => s.employee_id === e.id && vnDayKey(s.start_at) === day && s.status !== "CANCELLED"))
          .filter((e: any) => !leaves.some((l: any) => l.employee_id === e.id && new Date(l.start_at) < se && new Date(l.end_at) > ss))
          .filter((e: any) => (e.availability?.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(dow) && (e.availability?.slots ?? ["S", "C"]).includes(key))
          .map((e: any) => ({ e, n: shifts.filter((s: any) => s.employee_id === e.id).length }))
          .sort((a: any, b: any) => (!hasTech ? Number(b.e.position === "TECHNICIAN") - Number(a.e.position === "TECHNICIAN") : 0) || a.n - b.n);
        const gap = {
          type: "UNDERSTAFFED",
          day,
          slot: key,
          message: `Ca ${t.label} ${WEEKDAY_LABEL[dow]} (${fmtShortDay(day)}) có ${staffIds.length}/${need} nhân sự${hasTech ? "" : ", chưa có kỹ thuật viên"}.`,
        };
        gaps.push(gap);
        const c = candidates[0];
        if (c)
          suggestions.push({
            key: `create:${day}:${key}:${c.e.id}`,
            action_type: "SHIFT_CREATE",
            title: "Bổ sung nhân sự cho ca thiếu",
            detail: `Phân ca ${t.label} ${WEEKDAY_LABEL[dow]} ${fmtShortDay(day)} cho ${c.e.display_name}.`,
            reason: `${gap.message} ${c.e.display_name} không có ca ngày này, khả dụng buổi ${t.label.toLowerCase()} và đang có ${c.n} ca trong tuần.`,
            payload: { employee_id: c.e.id, start_at: ss.toISOString(), end_at: se.toISOString(), branch_id: c.e.branch_id },
            target_id: null,
          });
      }
    }
  }
  return { conflicts, gaps, suggestions };
}

// ---------------- Báo cáo cuối ngày ----------------
export async function buildReportContent(qq: Q, o: { tenantId: string; branchIds: string[]; day: string; now: Date }) {
  const dayEnd = vnToDate(addDays(o.day, 1));
  const cutoff = o.now < dayEnd ? o.now : dayEnd;
  const emps = await qq<any>("SELECT id, display_name, work_status FROM employees WHERE tenant_id=$1 AND branch_id = ANY($2) AND active ORDER BY code", [o.tenantId, o.branchIds]);
  const onShift = await qq<any>(
    "SELECT DISTINCT employee_id FROM shifts WHERE tenant_id=$1 AND branch_id = ANY($2) AND status='APPROVED' AND start_at >= $3 AND start_at < $4",
    [o.tenantId, o.branchIds, vnToDate(o.day), dayEnd],
  );
  const onLeave = await qq<any>("SELECT DISTINCT employee_id FROM leaves WHERE tenant_id=$1 AND start_at < $3 AND end_at > $2", [o.tenantId, vnToDate(o.day), dayEnd]);
  const ts = await taskStats(qq, o.tenantId, o.branchIds, cutoff);
  const appts = await qq<any>(
    `SELECT a.*, c.display_name AS customer FROM appointments a JOIN customers c ON c.id=a.customer_id
      WHERE a.tenant_id=$1 AND a.branch_id = ANY($2) AND a.start_at >= $3 AND a.start_at < $4 ORDER BY a.start_at`,
    [o.tenantId, o.branchIds, vnToDate(o.day), vnToDate(addDays(o.day, 2))],
  );
  const todayA = appts.filter((a: any) => vnDayKey(a.start_at) === o.day);
  const tomorrowA = appts.filter((a: any) => vnDayKey(a.start_at) !== o.day && a.status !== "CANCELLED");
  const fbs = await qq<any>(
    `SELECT f.*, c.display_name AS customer FROM feedback f JOIN customers c ON c.id=f.customer_id
      WHERE f.tenant_id=$1 AND c.branch_id = ANY($2) AND f.status<>'RESOLVED' AND f.biz_created_at <= $3`,
    [o.tenantId, o.branchIds, cutoff],
  );
  const blocked = await qq<any>("SELECT count(*)::int AS n FROM jobs WHERE tenant_id=$1 AND status='BLOCKED' AND run_at >= $2 AND run_at < $3", [o.tenantId, vnToDate(o.day), dayEnd]);
  const S = { tasks: { type: "module", id: null, label: "Công việc", href: "/tasks" }, appts: { type: "module", id: null, label: "Lịch hẹn", href: "/appointments" }, people: { type: "module", id: null, label: "Nhân sự", href: "/people" }, care: { type: "module", id: null, label: "Chăm sóc", href: "/care" } };
  const issues: any[] = [];
  for (const t of ts.overdue) issues.push({ kind: "fact", text: `${t.code} “${t.title}” (${t.owner_name}) quá hạn từ ${fmtDateTime(t.due_at)}.`, status: "Cần xử lý", source: { type: "task", id: t.id, label: `Công việc #${t.code}`, href: `/tasks?open=${t.id}` } });
  for (const f of fbs) issues.push({ kind: "fact", text: `${f.customer}: “${f.body}” — cần chuyên viên xử lý.`, status: f.assigned_to ? "Đang xử lý" : "Chưa phân công", source: { type: "feedback", id: f.id, label: `Phản hồi · ${f.customer}`, href: "/care" } });
  if (blocked[0].n) issues.push({ kind: "fact", text: `${blocked[0].n} lượt nhắc tự động bị chặn vì Zalo chưa kết nối.`, status: "Cần nhắc thủ công", source: { type: "module", id: null, label: "Hàng đợi nhắc", href: "/settings?tab=log" } });
  const pendingTomorrow = tomorrowA.filter((a: any) => a.status === "PENDING");
  const priorities: string[] = [];
  if (pendingTomorrow.length) priorities.push(`Xác nhận ${pendingTomorrow.length} lịch khách đang chờ (${pendingTomorrow.map((a: any) => a.customer).join(", ")}).`);
  if (ts.overdue.length) priorities.push(`Hoàn tất ${ts.overdue.length} công việc đang quá hạn.`);
  if (fbs.length) priorities.push(`Phân công chuyên viên phản hồi ${fbs.map((f: any) => f.customer).join(", ")}.`);
  if (priorities.length < 3 && ts.active.length) priorities.push(`Theo dõi ${ts.active.length} công việc đang thực hiện đúng hạn.`);
  if (priorities.length < 3 && tomorrowA.length) priorities.push(`Chuẩn bị ${tomorrowA.length} lịch hẹn ngày mai theo ca đã duyệt.`);
  const pctDone = ts.total ? Math.round((ts.done.length / ts.total) * 1000) / 10 : null;
  return {
    day: o.day,
    cutoff: cutoff.toISOString(),
    staff: {
      total: emps.length,
      on_shift: onShift.length,
      on_leave: onLeave.length,
      other: emps.length - onShift.length - onLeave.length,
      names: emps.map((e: any) => e.display_name),
      source: S.people,
    },
    tasks: { total: ts.total, done: ts.done.length, active: ts.active.length, todo: ts.todo.length, overdue: ts.overdue.length, source: S.tasks },
    appointments: {
      today: todayA.map((a: any) => ({ id: a.id, code: a.code, customer: a.customer, time: fmtTime(a.start_at), status: a.status })),
      tomorrow: { total: tomorrowA.length, confirmed: tomorrowA.filter((a: any) => a.status === "CONFIRMED").length, pending: pendingTomorrow.length },
      source: S.appts,
    },
    issues,
    priorities: priorities.slice(0, 3),
    ai_summary: {
      facts: [
        ts.total ? `Tiến độ công việc: ${ts.done.length}/${ts.total} hoàn thành (${String(pctDone).replace(".", ",")}%), ${ts.active.length} đang thực hiện đúng hạn, ${ts.overdue.length} quá hạn.` : "Chưa có công việc trong phạm vi báo cáo.",
        `Nhân sự: ${emps.length} hồ sơ đang hoạt động, ${onShift.length} có ca trong ngày, ${onLeave.length} nghỉ phép.`,
        `Lịch khách hôm nay: ${todayA.length} lịch (${todayA.filter((a: any) => a.status === "COMPLETED").length} hoàn thành). Ngày mai: ${tomorrowA.length} lịch, ${pendingTomorrow.length} chưa xác nhận.`,
        fbs.length ? `Có ${fbs.length} phản hồi khách cần chuyên viên xử lý.` : "Không có phản hồi khách tồn đọng.",
      ],
      uncertainties: [
        "Trạng thái các công việc đang thực hiện có thể thay đổi trước khi chốt ngày.",
        pendingTomorrow.length ? `${pendingTomorrow.length} lịch ngày mai chưa xác nhận; khách có thể chưa nhận nhắc lịch vì kênh Zalo chưa kết nối.` : "Thông tin xác nhận lịch đã cập nhật đến mốc cắt dữ liệu.",
        "Nguyên nhân các việc quá hạn chưa được xác minh — đây là giả thuyết cần người phụ trách xác nhận, không phải kết luận.",
      ],
    },
    sources: [S.tasks, S.appts, S.people, S.care],
    engine: ENGINE_LABEL,
  };
}

export const _f = { fmtRange };
