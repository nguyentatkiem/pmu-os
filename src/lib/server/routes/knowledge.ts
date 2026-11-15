import { NextResponse } from "next/server";
import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, tx, uid, j } from "../db";
import { bad, conflict, forbidden, notFound, str } from "../http";
import type { Ctx } from "../auth";
import { sopAnswer } from "../ai";
import { createProposal } from "../proposals";
import { fmtDate, fmtDateTime } from "../../shared/format";

const canSeeDrafts = (ctx: Ctx) => ctx.can("knowledge.draft") || ctx.can("knowledge.publish");

function sanitizeContent(c: any) {
  const sections = (Array.isArray(c?.sections) ? c.sections : []).slice(0, 20).map((s: any, i: number) => ({
    id: String(i + 1),
    heading: str(s.heading, 120) || `Mục ${i + 1}`,
    body: str(s.body, 3000),
    steps: Array.isArray(s.steps) ? s.steps.slice(0, 12).map((st: any) => ({ title: str(st.title, 120), body: str(st.body, 600) })).filter((st: any) => st.title) : undefined,
  }));
  const quiz = (Array.isArray(c?.quiz) ? c.quiz : []).slice(0, 10).map((x: any) => ({
    q: str(x.q, 300),
    options: (Array.isArray(x.options) ? x.options : []).map((o: unknown) => str(o, 160)).filter(Boolean).slice(0, 5),
    answer: Number(x.answer) || 0,
  }));
  return { sections, quiz };
}

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/knowledge",
    handler: async ({ ctx }) => {
      ctx.require("knowledge.view", "Bạn không có quyền xem SOP.");
      const drafts = canSeeDrafts(ctx);
      const docs = await q<any>(
        `SELECT d.id, d.title, d.category, d.owner_id, e.display_name AS owner_name,
           (SELECT json_agg(json_build_object('id', v.id, 'version_label', v.version_label, 'status', v.status, 'effective_at', v.effective_at, 'updated_at', v.updated_at) ORDER BY v.created_at DESC, v.version_label DESC)
              FROM sop_versions v WHERE v.document_id=d.id AND ($2 OR v.status='PUBLISHED')) AS versions
           FROM sop_documents d LEFT JOIN employees e ON e.id=d.owner_id WHERE d.tenant_id=$1 ORDER BY d.created_at`,
        [ctx.tenantId, drafts],
      );
      const visible = docs.filter((d) => d.versions && d.versions.length);
      const stats = {
        total: visible.length,
        published: visible.filter((d) => d.versions.some((v: any) => v.status === "PUBLISHED")).length,
        drafts: visible.filter((d) => !d.versions.some((v: any) => v.status === "PUBLISHED")).length,
      };
      const assignments = await q<any>(
        `SELECT la.id, la.status, la.score, la.total, la.due_at, la.review_note, la.employee_id, e.display_name, v.id AS version_id, v.version_label, d.title, d.id AS doc_id
           FROM learning_assignments la JOIN employees e ON e.id=la.employee_id JOIN sop_versions v ON v.id=la.sop_version_id JOIN sop_documents d ON d.id=v.document_id
          WHERE la.tenant_id=$1 AND e.branch_id = ANY($2) AND ($3::uuid IS NULL OR la.employee_id=$3::uuid) ORDER BY d.title, e.code`,
        [ctx.tenantId, ctx.branchFilter, ctx.can("training.assign") ? null : ctx.employeeId ?? "00000000-0000-0000-0000-000000000000"],
      );
      const courses = [...new Set(assignments.map((a) => a.version_id))].length;
      return {
        docs: visible,
        stats: { ...stats, courses },
        assignments,
        my_employee_id: ctx.employeeId,
        can_draft: ctx.can("knowledge.draft"),
        can_publish: ctx.can("knowledge.publish"),
        can_assign: ctx.can("training.assign"),
      };
    },
  },
  {
    method: "GET",
    path: "/knowledge/versions/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("knowledge.view");
      const v = await one<any>(
        `SELECT v.*, d.title, d.category, d.id AS doc_id, e.display_name AS owner_name FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id
           LEFT JOIN employees e ON e.id=d.owner_id WHERE v.id=$1 AND v.tenant_id=$2`,
        [params.id, ctx.tenantId],
      );
      if (!v || (v.status !== "PUBLISHED" && !canSeeDrafts(ctx))) throw notFound("Không tìm thấy phiên bản SOP trong phạm vi của bạn.");
      const approver = v.approved_by ? await one<any>("SELECT display_name FROM users WHERE id=$1", [v.approved_by]) : null;
      const pending = await one<any>("SELECT id, code FROM ai_proposals WHERE target_id=$1 AND status='PENDING'", [v.id]);
      const content = { ...v.content };
      // Không lộ đáp án cho người làm bài
      if (!ctx.can("training.assign")) content.quiz = (content.quiz ?? []).map((x: any) => ({ q: x.q, options: x.options }));
      return { version: { ...v, content }, approver: approver?.display_name ?? null, pending_proposal: pending };
    },
  },
  {
    method: "POST",
    path: "/knowledge",
    handler: async ({ ctx, body }) => {
      ctx.require("knowledge.draft", "Bạn không có quyền tạo bản nháp SOP.");
      const title = str(body.title, 160);
      if (!title) throw bad("Tên tài liệu là bắt buộc.", { title: "Bắt buộc" });
      const content = sanitizeContent(body.content ?? { sections: [{ heading: "Mục đích", body: str(body.purpose, 2000) }] });
      const docId = uid();
      const vId = uid();
      await tx(async (qq) => {
        await qq("INSERT INTO sop_documents (id, tenant_id, title, category, owner_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [docId, ctx.tenantId, title, str(body.category, 80) || null, ctx.employeeId, ctx.now()]);
        await qq("INSERT INTO sop_versions (id, tenant_id, document_id, version_label, content, status, created_by, created_at) VALUES ($1,$2,$3,'0.1',$4::jsonb,'DRAFT',$5,$6)", [vId, ctx.tenantId, docId, j(content), ctx.userId, ctx.now()]);
      });
      await audit(ctx, "sop.create", "sop_document", docId, { title });
      return { id: docId, version_id: vId };
    },
  },
  {
    method: "POST",
    path: "/knowledge/:docId/versions",
    handler: async ({ ctx, params }) => {
      ctx.require("knowledge.draft", "Bạn không có quyền tạo bản nháp.");
      const base = await one<any>("SELECT * FROM sop_versions WHERE document_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1", [params.docId, ctx.tenantId]);
      if (!base) throw notFound();
      const open = await one<any>("SELECT id FROM sop_versions WHERE document_id=$1 AND status IN ('DRAFT','PENDING_APPROVAL')", [params.docId]);
      if (open) throw conflict("Tài liệu đang có bản nháp hoặc bản chờ duyệt.", { version_id: open.id });
      const [maj, min] = String(base.version_label).split(".").map(Number);
      const label = `${maj}.${(min || 0) + 1}`;
      const id = uid();
      await q("INSERT INTO sop_versions (id, tenant_id, document_id, version_label, content, status, created_by, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,'DRAFT',$6,$7)", [id, ctx.tenantId, params.docId, label, j(base.content), ctx.userId, ctx.now()]);
      await audit(ctx, "sop.new_version", "sop_version", id, { label });
      return { id, version_label: label };
    },
  },
  {
    method: "PATCH",
    path: "/knowledge/versions/:id",
    handler: async ({ ctx, params, body }) => {
      ctx.require("knowledge.draft", "Bạn không có quyền sửa bản nháp.");
      const v = await one<any>("SELECT * FROM sop_versions WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!v) throw notFound();
      if (v.status !== "DRAFT") throw conflict("Chỉ sửa được bản nháp. Bản đã xuất bản cần tạo phiên bản mới.");
      if (body.expected_version !== undefined && Number(body.expected_version) !== v.version) throw conflict("Bản nháp đã được người khác cập nhật.");
      await q("UPDATE sop_versions SET content=$2::jsonb, updated_at=now(), version=version+1 WHERE id=$1", [v.id, j(sanitizeContent(body.content))]);
      await audit(ctx, "sop.edit", "sop_version", v.id);
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/knowledge/versions/:id/submit",
    handler: async ({ ctx, params, body }) => {
      ctx.require("knowledge.draft", "Bạn không có quyền gửi duyệt.");
      const v = await one<any>("SELECT v.*, d.title FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id WHERE v.id=$1 AND v.tenant_id=$2", [params.id, ctx.tenantId]);
      if (!v) throw notFound();
      if (v.status !== "DRAFT") throw conflict("Chỉ gửi duyệt được bản nháp.");
      if (!(v.content?.sections ?? []).some((s: any) => s.body)) throw bad("Bản nháp chưa có nội dung.");
      return tx(async (qq) => {
        await qq("UPDATE sop_versions SET status='PENDING_APPROVAL', updated_at=now(), version=version+1 WHERE id=$1", [v.id]);
        const nv = (await qq<any>("SELECT version FROM sop_versions WHERE id=$1", [v.id]))[0].version;
        const r = await createProposal(
          ctx,
          {
            action_type: "SOP_PUBLISH",
            summary: `Xuất bản SOP “${v.title}” v${v.version_label}`,
            payload: { version_id: v.id },
            reason: str(body.reason, 500) || "Bản nháp đã hoàn tất, cần người có thẩm quyền duyệt trước khi nhân sự sử dụng.",
            source_refs: [{ type: "sop_version", id: v.id, label: `SOP & đào tạo · ${v.title} v${v.version_label}`, href: `/knowledge?doc=${v.document_id}` }],
            before: { status: "Bản nháp" },
            after: { status: "Đã xuất bản", version: v.version_label },
            affected: [{ type: "sop", id: v.document_id, label: "Nhân sự đọc SOP này" }],
            target_type: "sop_version",
            target_id: v.id,
            target_version: nv,
          },
          qq,
        );
        return { ok: true, proposal: r, message: "Đã gửi đề xuất xuất bản tới hộp phê duyệt." };
      });
    },
  },
  {
    method: "POST",
    path: "/knowledge/ask",
    handler: async ({ ctx, body }) => {
      const question = str(body.question, 500);
      if (!question) throw bad("Vui lòng nhập câu hỏi.", { question: "Bắt buộc" });
      const answer = await sopAnswer(ctx, question);
      await audit(ctx, "ai.sop_ask", "ai", null, { question: question.slice(0, 120), kind: answer.kind });
      return answer;
    },
  },
  {
    method: "POST",
    path: "/knowledge/assign",
    handler: async ({ ctx, body }) => {
      ctx.require("training.assign", "Bạn không có quyền giao bài học.");
      const v = await one<any>("SELECT * FROM sop_versions WHERE id=$1 AND tenant_id=$2 AND status='PUBLISHED'", [body.version_id, ctx.tenantId]);
      if (!v) throw bad("Chỉ giao bài học từ SOP đã xuất bản.", { version_id: "Chọn SOP đã xuất bản" });
      const ids: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : [];
      if (!ids.length) throw bad("Chọn ít nhất một nhân sự.", { employee_ids: "Bắt buộc" });
      let created = 0;
      for (const id of ids) {
        const e = await one<any>("SELECT id FROM employees WHERE id=$1 AND tenant_id=$2 AND branch_id = ANY($3) AND active", [id, ctx.tenantId, ctx.allowedBranchIds]);
        if (!e) continue;
        const r = await q<any>(
          "INSERT INTO learning_assignments (id, tenant_id, employee_id, sop_version_id, status, due_at, created_at) VALUES ($1,$2,$3,$4,'ASSIGNED',$5,$6) ON CONFLICT (employee_id, sop_version_id) DO NOTHING RETURNING id",
          [uid(), ctx.tenantId, id, v.id, body.due_at ? new Date(body.due_at) : null, ctx.now()],
        );
        created += r.length;
      }
      await audit(ctx, "training.assign", "sop_version", v.id, { count: created });
      return { ok: true, created, message: created ? `Đã giao bài học cho ${created} nhân sự.` : "Các nhân sự đã được giao bài này trước đó." };
    },
  },
  {
    method: "POST",
    path: "/knowledge/assignments/:id/attempt",
    handler: async ({ ctx, params, body }) => {
      const a = await one<any>("SELECT la.*, v.content, v.status AS v_status FROM learning_assignments la JOIN sop_versions v ON v.id=la.sop_version_id WHERE la.id=$1 AND la.tenant_id=$2", [params.id, ctx.tenantId]);
      if (!a) throw notFound("Không tìm thấy bài học.");
      if (a.employee_id !== ctx.employeeId) throw forbidden("Chỉ nhân sự được giao mới làm bài kiểm tra này.");
      if (a.status === "REVIEWED") throw conflict("Bài học đã được quản lý đánh giá.");
      const quiz = a.content.quiz ?? [];
      const answers: number[] = Array.isArray(body.answers) ? body.answers.map(Number) : [];
      if (answers.length !== quiz.length || answers.some((x) => Number.isNaN(x))) throw bad("Vui lòng trả lời tất cả câu hỏi.");
      const score = quiz.reduce((s: number, x: any, i: number) => s + (x.answer === answers[i] ? 1 : 0), 0);
      await q("UPDATE learning_assignments SET status='SUBMITTED', score=$2, total=$3, answers=$4::jsonb, completed_at=$5, updated_at=now(), version=version+1 WHERE id=$1", [
        a.id,
        score,
        quiz.length,
        j(answers),
        ctx.now(),
      ]);
      // Tự cập nhật checklist "Làm bài kiểm tra" của việc học SOP nếu có
      await q(
        `UPDATE checklist_items SET done_at=$2, done_by=$3 WHERE done_at IS NULL AND title ILIKE '%bài kiểm tra%'
          AND task_id IN (SELECT id FROM tasks WHERE owner_id=$1 AND status IN ('TODO','IN_PROGRESS'))`,
        [a.employee_id, ctx.now(), ctx.userId],
      );
      await audit(ctx, "training.attempt", "learning_assignment", a.id, { score, total: quiz.length });
      return { score, total: quiz.length, message: `Bạn trả lời đúng ${score}/${quiz.length} câu. Kết quả chờ quản lý đánh giá.` };
    },
  },
  {
    method: "POST",
    path: "/knowledge/assignments/:id/review",
    handler: async ({ ctx, params, body }) => {
      ctx.require("training.assign", "Bạn không có quyền đánh giá.");
      const a = await one<any>("SELECT * FROM learning_assignments WHERE id=$1 AND tenant_id=$2", [params.id, ctx.tenantId]);
      if (!a) throw notFound();
      if (a.status !== "SUBMITTED") throw conflict("Nhân sự chưa nộp bài.");
      const note = str(body.note, 500);
      if (!note) throw bad("Vui lòng nhập nhận xét.", { note: "Bắt buộc" });
      await q("UPDATE learning_assignments SET status='REVIEWED', reviewed_by=$2, review_note=$3, updated_at=now(), version=version+1 WHERE id=$1", [a.id, ctx.userId, note]);
      await audit(ctx, "training.review", "learning_assignment", a.id);
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "/knowledge/versions/:id/export",
    handler: async ({ ctx, params }) => {
      ctx.require("knowledge.view");
      const v = await one<any>("SELECT v.*, d.title FROM sop_versions v JOIN sop_documents d ON d.id=v.document_id WHERE v.id=$1 AND v.tenant_id=$2", [params.id, ctx.tenantId]);
      if (!v || (v.status !== "PUBLISHED" && !canSeeDrafts(ctx))) throw notFound();
      const lines = [`SOP: ${v.title} — phiên bản ${v.version_label}`, `Trạng thái: ${v.status === "PUBLISHED" ? "Đã xuất bản" : v.status}`, `Hiệu lực: ${v.effective_at ? fmtDate(v.effective_at) : "—"}`, `Xuất lúc: ${fmtDateTime(ctx.now())}`, ctx.mode === "DEMO" ? "DỮ LIỆU MÔ PHỎNG" : "", ""];
      for (const s of v.content.sections ?? []) {
        lines.push(`${s.id}. ${s.heading}`, s.body);
        (s.steps ?? []).forEach((st: any, i: number) => lines.push(`   ${i + 1}) ${st.title}: ${st.body}`));
        lines.push("");
      }
      await audit(ctx, "sop.export", "sop_version", v.id);
      return new NextResponse(lines.join("\n"), {
        headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="sop-v${v.version_label}.txt"` },
      });
    },
  },
];

export const _u = forbidden;
