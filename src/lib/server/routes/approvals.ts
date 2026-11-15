import type { RouteDef } from "../router";
import { q, one } from "../db";
import { notFound, str } from "../http";
import { cancelProposal, decideProposal, retryProposal } from "../proposals";

export const routes: RouteDef[] = [
  {
    method: "GET",
    path: "/approvals",
    handler: async ({ ctx, query }) => {
      ctx.require("approvals.view", "Bạn không có quyền xem hộp phê duyệt.");
      const tab = query.get("tab") ?? "pending";
      const type = query.get("type") || null;
      const owner = query.get("owner") || null;
      const rows = await q<any>(
        `SELECT p.id, p.code, p.action_type, p.title, p.summary, p.status, p.biz_created_at, p.requested_label, p.source_refs, p.expires_at,
                e.display_name AS owner_name, p.owner_employee_id,
                (SELECT status FROM executions x WHERE x.proposal_id=p.id) AS exec_status
           FROM ai_proposals p LEFT JOIN employees e ON e.id=p.owner_employee_id
          WHERE p.tenant_id=$1 AND (p.branch_id IS NULL OR p.branch_id = ANY($2))
          ORDER BY p.biz_created_at DESC`,
        [ctx.tenantId, ctx.allowedBranchIds],
      );
      const match = (r: any) =>
        tab === "pending"
          ? r.status === "PENDING"
          : tab === "approved"
            ? ["APPROVED", "EXECUTED", "FAILED"].includes(r.status)
            : tab === "rejected"
              ? ["REJECTED", "RETURNED"].includes(r.status)
              : r.status !== "PENDING";
      const items = rows.filter((r) => match(r) && (!type || r.action_type === type) && (!owner || r.owner_employee_id === owner));
      return {
        items: tab === "pending" ? items.sort((a, b) => +new Date(a.biz_created_at) - +new Date(b.biz_created_at)) : items,
        counts: {
          pending: rows.filter((r) => r.status === "PENDING").length,
          approved: rows.filter((r) => ["APPROVED", "EXECUTED", "FAILED"].includes(r.status)).length,
          rejected: rows.filter((r) => ["REJECTED", "RETURNED"].includes(r.status)).length,
          history: rows.filter((r) => r.status !== "PENDING").length,
        },
        owners: [...new Map(rows.filter((r) => r.owner_employee_id).map((r) => [r.owner_employee_id, r.owner_name])).entries()].map(([id, name]) => ({ id, name })),
        can_decide: ctx.can("approvals.decide"),
        now: ctx.now().toISOString(),
      };
    },
  },
  {
    method: "GET",
    path: "/approvals/:id",
    handler: async ({ ctx, params }) => {
      ctx.require("approvals.view");
      const p = await one<any>(
        "SELECT p.*, e.display_name AS owner_name FROM ai_proposals p LEFT JOIN employees e ON e.id=p.owner_employee_id WHERE p.id=$1 AND p.tenant_id=$2",
        [params.id, ctx.tenantId],
      );
      if (!p || (p.branch_id && !ctx.allowedBranchIds.includes(p.branch_id))) throw notFound("Không tìm thấy đề xuất.");
      const decisions = await q<any>("SELECT * FROM approvals WHERE proposal_id=$1 ORDER BY decided_at", [p.id]);
      const execution = await one<any>("SELECT * FROM executions WHERE proposal_id=$1", [p.id]);
      return { proposal: p, decisions, execution, can_decide: ctx.can("approvals.decide") && ctx.can(p.required_permission), expired: new Date(p.expires_at) < ctx.now() };
    },
  },
  { method: "POST", path: "/approvals/:id/approve", handler: async ({ ctx, params, body }) => decideProposal(ctx, params.id, "APPROVE", str(body.reason, 500)) },
  { method: "POST", path: "/approvals/:id/reject", handler: async ({ ctx, params, body }) => decideProposal(ctx, params.id, "REJECT", str(body.reason, 500)) },
  { method: "POST", path: "/approvals/:id/return", handler: async ({ ctx, params, body }) => decideProposal(ctx, params.id, "RETURN", str(body.reason, 500)) },
  { method: "POST", path: "/approvals/:id/retry", handler: async ({ ctx, params }) => retryProposal(ctx, params.id) },
  { method: "POST", path: "/approvals/:id/cancel", handler: async ({ ctx, params }) => cancelProposal(ctx, params.id) },
];
