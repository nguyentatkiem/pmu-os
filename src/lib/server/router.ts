import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "./http";
import { buildCtx, SESSION_COOKIE, type Ctx } from "./auth";
import { q, uid, j } from "./db";

export interface Req {
  ctx: Ctx;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  req: NextRequest;
  ip: string;
}

export interface RouteDef {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  handler: (r: Req) => Promise<unknown>;
  public?: boolean;
}

type Compiled = RouteDef & { re: RegExp; keys: string[] };
let compiled: Compiled[] | null = null;

async function loadRoutes(): Promise<Compiled[]> {
  if (compiled) return compiled;
  const mods = await Promise.all([
    import("./routes/auth"),
    import("./routes/people"),
    import("./routes/shifts"),
    import("./routes/tasks"),
    import("./routes/performance"),
    import("./routes/knowledge"),
    import("./routes/customers"),
    import("./routes/inbox"),
    import("./routes/appointments"),
    import("./routes/care"),
    import("./routes/reports"),
    import("./routes/assistant"),
    import("./routes/approvals"),
    import("./routes/settings"),
    import("./routes/dashboard"),
    import("./routes/agents"),
    import("./routes/brain"),
    import("./routes/marketing"),
  ]);
  compiled = mods
    .flatMap((m) => m.routes as RouteDef[])
    .map((r) => {
      const keys: string[] = [];
      const pattern = r.path.replace(/:([a-zA-Z_]+)/g, (_, k) => {
        keys.push(k);
        return "([^/]+)";
      });
      return { ...r, keys, re: new RegExp(`^${pattern}$`) };
    });
  return compiled;
}

export async function audit(
  ctx: Pick<Ctx, "tenantId" | "userId" | "actorLabel" | "selectedBranch">,
  action: string,
  resource_type: string,
  resource_id: string | null,
  detail: Record<string, unknown> = {},
  result = "OK",
  qq = q,
) {
  await qq(
    `INSERT INTO audit_events (id, tenant_id, actor_id, actor_label, action, resource_type, resource_id, scope, result, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [uid(), ctx.tenantId, ctx.userId, ctx.actorLabel, action, resource_type, resource_id, ctx.selectedBranch, result, j(detail)],
  );
}

const loginHits = new Map<string, { n: number; t: number }>();
export function rateLimit(key: string, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const e = loginHits.get(key);
  if (!e || now - e.t > windowMs) {
    loginHits.set(key, { n: 1, t: now });
    return true;
  }
  e.n += 1;
  return e.n <= max;
}

export async function handle(req: NextRequest) {
  const requestId = uid().slice(0, 8);
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "") || "/";
    const routes = await loadRoutes();
    let match: { route: Compiled; params: Record<string, string> } | null = null;
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        match = { route: r, params };
        break;
      }
    }
    if (!match) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy API.");
    let body: any = {};
    if (req.method !== "GET" && req.method !== "DELETE") {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new ApiError(400, "VALIDATION", "Dữ liệu gửi lên không đúng định dạng JSON.");
        }
      }
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const ctx = match.route.public
      ? (null as unknown as Ctx)
      : await buildCtx(token, req.headers.get("x-pmu-branch") || url.searchParams.get("branch"));
    if (ctx) ctx.requestId = requestId;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const result = await match.route.handler({ ctx, params: match.params, query: url.searchParams, body, req, ip });
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { headers: { "x-request-id": requestId } });
  } catch (e: any) {
    if (e instanceof ApiError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message, field_errors: e.field_errors, request_id: requestId, ...e.extra } },
        { status: e.status },
      );
    }
    // Lỗi ràng buộc duy nhất của Postgres
    if (e?.code === "23505") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Dữ liệu bị trùng với bản ghi đã có.", request_id: requestId } },
        { status: 409 },
      );
    }
    console.error(`[api ${requestId}]`, e);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Hệ thống gặp lỗi. Vui lòng thử lại.", request_id: requestId } },
      { status: 500 },
    );
  }
}
