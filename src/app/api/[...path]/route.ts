import { handle } from "@/lib/server/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
