"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  status: number;
  code: string;
  field_errors?: Record<string, string>;
  extra: Record<string, any>;
  constructor(status: number, body: any) {
    super(body?.error?.message ?? "Có lỗi xảy ra.");
    this.status = status;
    this.code = body?.error?.code ?? "ERROR";
    this.field_errors = body?.error?.field_errors;
    this.extra = body?.error ?? {};
  }
}

let currentBranch = "all";
export function setApiBranch(b: string) {
  currentBranch = b;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", "x-pmu-branch": currentBranch },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, { error: { code: "OFFLINE", message: "Mất kết nối mạng. Vui lòng kiểm tra và thử lại." } });
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = new ApiError(res.status, body);
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth") && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=1";
    }
    throw err;
  }
  return body as T;
}

/** Tải file qua API (giữ cookie + header chi nhánh), lưu về máy */
export async function download(path: string) {
  const res = await fetch(`/api${path}`, { headers: { "x-pmu-branch": currentBranch }, credentials: "same-origin" });
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "tai-xuong";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const my = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api<T>(path);
        if (my === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (my === seq.current) setError(e as ApiError);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: () => load(true), hardReload: () => load(false), setData };
}
