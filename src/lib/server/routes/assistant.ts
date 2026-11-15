import type { RouteDef } from "../router";
import { audit } from "../router";
import { q, one, uid, j } from "../db";
import { bad, forbidden, notFound, str } from "../http";
import { askAssistant } from "../ai";
import { createProposal } from "../proposals";
import { getEmployee } from "../domain";
import { fmtDateTime } from "../../shared/format";

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/assistant/threads",
    handler: async ({ ctx }) => {
      ctx.require("assistant.use", "Bạn không có quyền dùng AI Assistant.");
      const threads = await q<any>("SELECT id, title, biz_updated_at FROM ai_threads WHERE tenant_id=$1 AND user_id=$2 ORDER BY biz_updated_at DESC LIMIT 20", [ctx.tenantId, ctx.userId]);
      return { threads };
    },
  },
  {
    method: "GET",
    path: "/assistant/threads/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("assistant.use");
      const t = await one<any>("SELECT * FROM ai_threads WHERE id=$1 AND tenant_id=$2 AND user_id=$3", [params.id, ctx.tenantId, ctx.userId]);
      if (!t) throw notFound("Không tìm thấy hội thoại AI.");
      const messages = await q<any>("SELECT id, role, content, biz_at FROM ai_messages WHERE thread_id=$1 ORDER BY biz_at, created_at", [t.id]);
      return { thread: t, messages };
    },
  },
  {
    method: "POST",
    path: "/assistant/ask",
    handler: async ({ ctx, body }) => {
      ctx.require("assistant.use", "Bạn không có quyền dùng AI Assistant.");
      const question = str(body.question, 600);
      if (!question) throw bad("Vui lòng nhập yêu cầu.", { question: "Bắt buộc" });
      let threadId = body.thread_id as string | undefined;
      const now = ctx.now();
      if (threadId) {
        const t = await one<any>("SELECT id FROM ai_threads WHERE id=$1 AND tenant_id=$2 AND user_id=$3", [threadId, ctx.tenantId, ctx.userId]);
        if (!t) throw notFound("Không tìm thấy hội thoại AI.");
      } else {
        threadId = uid();
        await q("INSERT INTO ai_threads (id, tenant_id, user_id, title, biz_updated_at) VALUES ($1,$2,$3,$4,$5)", [threadId, ctx.tenantId, ctx.userId, question.slice(0, 60), now]);
      }
      let answer;
      try {
        answer = await askAssistant(ctx, question);
      } catch (e) {
        console.error("AI error", e);
        answer = {
          kind: "insufficient",
          summary: "AI tạm thời không phản hồi. Các thao tác thủ công vẫn hoạt động bình thường.",
          facts: [],
          uncertainties: [],
          proposed_actions: [],
          sources: [],
          generated_at: now.toISOString(),
          engine: "",
        };
      }
      await q("INSERT INTO ai_messages (id, tenant_id, thread_id, role, content, biz_at) VALUES ($1,$2,$3,'user',$4::jsonb,$5)", [uid(), ctx.tenantId, threadId, j({ text: question }), now]);
      await q("INSERT INTO ai_messages (id, tenant_id, thread_id, role, content, biz_at) VALUES ($1,$2,$3,'assistant',$4::jsonb,$5)", [uid(), ctx.tenantId, threadId, j(answer), new Date(now.getTime() + 1000)]);
      await q("UPDATE ai_threads SET biz_updated_at=$2, updated_at=now() WHERE id=$1", [threadId, now]);
      await audit(ctx, "ai.ask", "ai_thread", threadId, { kind: answer.kind });
      return { thread_id: threadId, answer };
    },
  },
  {
    method: "POST",
    path: "/assistant/actions",
    handler: async ({ ctx, body }) => {
      ctx.require("assistant.use");
      if (body.type !== "TASK_ASSIGN") throw bad("Hành động chưa được hỗ trợ từ AI Assistant.");
      if (!ctx.can("tasks.create")) throw forbidden("Bạn không đủ quyền đề xuất giao việc.");
      const p = body.payload ?? {};
      const title = str(p.title, 160);
      if (!title) throw bad("Tên công việc là bắt buộc.", { title: "Bắt buộc" });
      const emp = await getEmployee(ctx, p.owner_id);
      const due = new Date(p.due_at);
      if (isNaN(due.getTime()) || due < ctx.now()) throw bad("Hạn hoàn thành phải sau hiện tại.", { due_at: "Không hợp lệ" });
      const checklist = (Array.isArray(p.checklist) ? p.checklist : []).map((s: unknown) => str(s, 120)).filter(Boolean);
      const r = await createProposal(ctx, {
        action_type: "TASK_ASSIGN",
        summary: `Giao “${title}” cho ${emp.display_name}, hạn ${fmtDateTime(due)}`,
        payload: { title, owner_id: emp.id, due_at: due.toISOString(), priority: p.priority ?? "HIGH", checklist },
        reason: str(body.reason, 500) || "Đề xuất từ AI Executive Assistant.",
        source_refs: Array.isArray(p.source_refs) ? p.source_refs.slice(0, 10) : [],
        requested_label: `${ctx.actorLabel} (qua AI Assistant)`,
        owner_employee_id: emp.id,
        before: { note: "Chưa có công việc" },
        after: { title, owner: emp.display_name, due: fmtDateTime(due), checklist },
        affected: [{ type: "employee", id: emp.id, label: emp.display_name }],
      });
      return { ok: true, proposal: r, message: `Đã gửi ${r.code} cho quản lý phê duyệt. Chưa tự động thực thi.` };
    },
  },
];
