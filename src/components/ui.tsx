"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Link2, Lock, RefreshCw, X, XCircle, WifiOff, Image as ImageIcon } from "lucide-react";
import type { ApiError } from "@/lib/client/api";

/* ---------------- Ngữ cảnh ứng dụng ---------------- */
export interface Me {
  user: { id: string; name: string; role: string; role_label: string; employee_id: string | null };
  login_user_id: string;
  tenant: { id: string; name: string; mode: "DEMO" | "REAL"; now: string };
  branches: { id: string; name: string }[];
  all_branches_allowed: boolean;
  perms: string[];
  personas: { id: string; display_name: string; role: string; role_label: string }[];
  integration: { provider: string; health: string; mode: string };
}
export const AppCtx = createContext<{
  me: Me | null;
  branch: string;
  setBranch: (b: string) => void;
  reloadMe: () => Promise<void>;
  can: (p: string) => boolean;
  now: () => Date;
}>({ me: null, branch: "all", setBranch: () => {}, reloadMe: async () => {}, can: () => false, now: () => new Date() });
export const useApp = () => useContext(AppCtx);

/* ---------------- Thông báo nhanh ---------------- */
type Toast = { id: number; tone: "ok" | "warn" | "danger" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "danger" ? 7000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === "ok" ? <CheckCircle2 size={18} color="var(--ok)" /> : t.tone === "danger" ? <XCircle size={18} color="var(--danger)" /> : t.tone === "warn" ? <AlertTriangle size={18} color="var(--gold-600)" /> : <Info size={18} color="var(--primary)" />}
            <div>{t.text}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Gọi API kèm thông báo lỗi chuẩn */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string | ((r: T) => string | null)): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        const msg = typeof ok === "function" ? ok(r) : ok;
        if (msg) toast("ok", msg);
        return r;
      } catch (e) {
        const err = e as ApiError;
        toast(err.status === 503 || err.status === 409 ? "warn" : "danger", err.message || "Có lỗi xảy ra.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

/* ---------------- Modal giữ focus ---------------- */
export function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  size,
  dirty,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "wide" | "xl";
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (dirty && !window.confirm("Bạn có thay đổi chưa lưu. Đóng và bỏ thay đổi?")) return;
    onClose();
  }, [dirty, onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && el) {
        const f = el.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const a = f[0];
        const b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [close]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${size ?? ""}`} role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        <div className="modal-head">
          {icon}
          <h3>{title}</h3>
          <button className="icon-btn" onClick={close} aria-label="Đóng" data-close>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, icon, onClose, children, footer }: { title: React.ReactNode; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon}
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </aside>
    </>
  );
}

/* ---------------- Biểu mẫu ---------------- */
export function Field({ label, req, error, hint, children, className }: { label?: React.ReactNode; req?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className ?? ""}`}>
      {label && (
        <label>
          {label}
          {req && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function ReasonDialog({
  title,
  label,
  confirmText,
  tone,
  onClose,
  onSubmit,
  required = true,
  extra,
}: {
  title: string;
  label: string;
  confirmText: string;
  tone?: "danger" | "primary";
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  required?: boolean;
  extra?: React.ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={!!reason}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            disabled={busy}
            onClick={async () => {
              if (required && !reason.trim()) return setErr("Vui lòng nhập lý do");
              setBusy(true);
              try {
                await onSubmit(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang xử lý..." : confirmText}
          </button>
        </>
      }
    >
      {extra}
      <Field label={label} req={required} error={err}>
        <textarea className="textarea" value={reason} maxLength={500} onChange={(e) => (setReason(e.target.value), setErr(""))} />
      </Field>
    </Modal>
  );
}

/* ---------------- Hiển thị ---------------- */
export function PageHead({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Stat({ tone, icon, num, label, onClick, href }: { tone: string; icon: React.ReactNode; num: React.ReactNode; label: React.ReactNode; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="ico">{icon}</span>
      <span>
        <div className="num">{num}</div>
        <div className="lbl">{label}</div>
      </span>
    </>
  );
  if (href)
    return (
      <Link href={href} className={`stat ${tone}`}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button className={`stat ${tone}`} onClick={onClick}>
        {inner}
      </button>
    );
  return <div className={`stat ${tone}`}>{inner}</div>;
}

export function Badge({ tone = "gray", children, icon }: { tone?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={`badge b-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function Avatar({ name, src, size }: { name: string; src?: string | null; size?: "sm" | "lg" }) {
  const letter = name.replace(/\(.*?\)/g, "").trim().split(" ").pop()?.charAt(0).toUpperCase() || "?";
  const idx = (letter.charCodeAt(0) - 65 + 8) % 8;
  return (
    <span className={`avatar av-${idx} ${size ?? ""}`} aria-hidden>
      {src ? <img src={src} alt="" /> : letter}
    </span>
  );
}

export function SourceChip({ label, href }: { label: string; href?: string }) {
  if (!href)
    return (
      <span className="source-chip" title="Nguồn dữ liệu">
        <Link2 /> {label}
      </span>
    );
  return (
    <Link className="source-chip" href={href} title="Mở nguồn">
      <Link2 /> {label}
    </Link>
  );
}

export function Progress({ value, gold }: { value: number | null; gold?: boolean }) {
  return (
    <div className={`progress ${gold ? "gold" : ""}`} role="progressbar" aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

export function Skeleton({ h = 120, className }: { h?: number; className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} style={{ height: h }} />;
}
export function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Đang tải">
      <Skeleton h={56} />
      <div className="grid g-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={104} />
        ))}
      </div>
      <div className="split">
        <Skeleton h={320} />
        <Skeleton h={320} />
      </div>
    </div>
  );
}

export function Empty({ title, text, action, img = true }: { title: string; text?: string; action?: React.ReactNode; img?: boolean }) {
  return (
    <div className="state">
      {img && <img src="/brand/empty-tasks.png" alt="" />}
      <h3>{title}</h3>
      {text && <div className="small">{text}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.status === 403) return <NoPermission message={error.message} />;
  if (error.status === 0)
    return (
      <div className="state">
        <span className="ico">
          <WifiOff />
        </span>
        <h3>Mất kết nối</h3>
        <div className="small">{error.message}</div>
        {onRetry && (
          <button className="btn btn-outline" onClick={onRetry}>
            <RefreshCw /> Thử lại
          </button>
        )}
      </div>
    );
  return (
    <div className="state">
      <span className="ico" style={{ background: "var(--danger-50)", color: "var(--danger)" }}>
        <AlertTriangle />
      </span>
      <h3>Không tải được dữ liệu</h3>
      <div className="small">
        {error.message} {error.extra?.request_id && <span className="tiny">(mã: {error.extra.request_id})</span>}
      </div>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>
          <RefreshCw /> Thử lại
        </button>
      )}
    </div>
  );
}

export function NoPermission({ message }: { message?: string }) {
  return (
    <div className="card">
      <div className="state">
        <span className="ico">
          <Lock />
        </span>
        <h3>Không có quyền truy cập</h3>
        <div className="small">{message ?? "Vai trò hiện tại chưa được cấp quyền cho màn hình này."}</div>
        <div className="small">Quyền được kiểm tra tại máy chủ theo doanh nghiệp, chi nhánh và vai trò. Liên hệ chủ doanh nghiệp nếu cần mở quyền.</div>
      </div>
    </div>
  );
}

/** Bọc trạng thái tải / lỗi / không quyền cho mỗi trang */
export function PageState<T>({ q, children, skeleton }: { q: { data: T | null; error: ApiError | null; loading: boolean; hardReload: () => void }; children: (d: T) => React.ReactNode; skeleton?: React.ReactNode }) {
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.hardReload} />;
  if (q.loading && !q.data) return <>{skeleton ?? <PageSkeleton />}</>;
  if (!q.data) return null;
  return <>{children(q.data)}</>;
}

export function DefPopover({ title, rows, children }: { title: string; rows: [string, string][]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button className="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {children}
      </button>
      {open && (
        <div className="popover" style={{ top: "calc(100% + 6px)", right: 0 }} role="dialog">
          <div className="row-between">
            <b>{title}</b>
            <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} aria-label="Đóng">
              <X size={16} />
            </button>
          </div>
          <dl className="kv mt-8" style={{ gridTemplateColumns: "96px 1fr", fontSize: 13 }}>
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd style={{ fontWeight: 500 }}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}

/* ---------------- Ảnh thiết kế gốc ---------------- */
export const DESIGN_REFS: Record<string, { file: string; title: string; ui: string }> = {
  dashboard: { file: "UI_01_tong_quan", title: "Tổng quan điều hành", ui: "UI-01" },
  people: { file: "UI_02_nhan_su", title: "Nhân sự & hồ sơ", ui: "UI-02" },
  shifts: { file: "UI_03_lich_lam_viec", title: "Lịch làm việc", ui: "UI-03" },
  tasks: { file: "UI_04_cong_viec", title: "Công việc & checklist", ui: "UI-04" },
  performance: { file: "UI_05_kpi", title: "KPI & hỗ trợ nhân sự", ui: "UI-05" },
  knowledge: { file: "UI_06_sop_dao_tao", title: "SOP & đào tạo", ui: "UI-06" },
  customers: { file: "UI_07_khach_hang", title: "Khách hàng & hành trình", ui: "UI-07" },
  customer: { file: "UI_08_ho_so_khach", title: "Hồ sơ khách hàng", ui: "UI-08" },
  inbox: { file: "UI_09_hoi_thoai", title: "Hội thoại & Zalo", ui: "UI-09" },
  appointments: { file: "UI_10_lich_hen", title: "Lịch hẹn khách hàng", ui: "UI-10" },
  care: { file: "UI_11_cham_soc", title: "Chăm sóc sau dịch vụ", ui: "UI-11" },
  reports: { file: "UI_12_bao_cao", title: "Báo cáo điều hành", ui: "UI-12" },
  assistant: { file: "UI_13_ai_assistant", title: "AI Executive Assistant", ui: "UI-13" },
  approvals: { file: "UI_14_phe_duyet", title: "Phê duyệt & lịch sử AI", ui: "UI-14" },
  settings: { file: "UI_15_cai_dat", title: "Cài đặt & tích hợp", ui: "UI-15" },
  login: { file: "UI_16_dang_nhap", title: "Đăng nhập & trạng thái hệ thống", ui: "UI-16" },
};

export function DesignRefModal({ refKey, onClose }: { refKey: string; onClose: () => void }) {
  const r = DESIGN_REFS[refKey];
  if (!r) return null;
  return (
    <Modal title={`${r.ui} · ${r.title} — ảnh thiết kế tham chiếu`} onClose={onClose} size="xl">
      <div className="banner warn mb-16">
        <ImageIcon />
        <div>Ảnh thiết kế tạo bằng ImageGen trong gói bàn giao, dùng làm tham chiếu bố cục. Số liệu và tên trong ảnh là minh họa; màn hình thật đọc dữ liệu runtime.</div>
      </div>
      <img src={`/design/${r.file}.webp`} alt={`Thiết kế ${r.title}`} style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }} />
    </Modal>
  );
}

export function DesignRefButton({ refKey }: { refKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)} title="Xem ảnh thiết kế gốc của màn hình này">
        <ImageIcon /> Thiết kế gốc
      </button>
      {open && <DesignRefModal refKey={refKey} onClose={() => setOpen(false)} />}
    </>
  );
}

export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

export function fe(err: unknown, key: string): string | undefined {
  return (err as ApiError | null)?.field_errors?.[key];
}
