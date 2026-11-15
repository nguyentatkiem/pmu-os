"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  Database,
  FileChartColumn,
  GraduationCap,
  Heart,
  House,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareCheckBig,
  UserRound,
  Users,
  ChevronDown,
  Image as ImageIcon,
} from "lucide-react";
import { api, setApiBranch } from "@/lib/client/api";
import { AppCtx, Avatar, Modal, type Me, useToast, PageSkeleton, useApp } from "./ui";
import { fmtDateTime } from "@/lib/shared/format";

const NAV: { href: string; label: string; icon: React.ElementType; show: (me: Me, can: (p: string) => boolean) => boolean }[] = [
  { href: "/dashboard", label: "Tổng quan", icon: House, show: (_, c) => c("dashboard.view") },
  { href: "/people", label: "Nhân sự", icon: Users, show: (_, c) => c("people.view") },
  { href: "/shifts", label: "Lịch làm việc", icon: CalendarDays, show: (m, c) => c("shifts.view_all") || !!m.user.employee_id },
  { href: "/tasks", label: "Công việc", icon: SquareCheckBig, show: (m, c) => c("tasks.view_all") || !!m.user.employee_id },
  { href: "/performance", label: "KPI", icon: ChartColumn, show: (m, c) => c("performance.view_all") || !!m.user.employee_id },
  { href: "/knowledge", label: "SOP & đào tạo", icon: GraduationCap, show: (_, c) => c("knowledge.view") },
  { href: "/customers", label: "Khách hàng", icon: UserRound, show: (m, c) => c("customers.view_all") || c("customers.view_assigned") || m.user.role === "TECHNICIAN" },
  { href: "/inbox", label: "Hội thoại", icon: MessageSquare, show: (_, c) => c("inbox.view") },
  { href: "/appointments", label: "Lịch hẹn", icon: CalendarClock, show: (m, c) => c("appointments.view_all") || !!m.user.employee_id },
  { href: "/care", label: "Chăm sóc", icon: Heart, show: (_, c) => c("care.view") },
  { href: "/reports", label: "Báo cáo", icon: FileChartColumn, show: (_, c) => c("reports.view") },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles, show: (_, c) => c("assistant.use") },
  { href: "/approvals", label: "Phê duyệt", icon: ShieldCheck, show: (_, c) => c("approvals.view") },
  { href: "/settings", label: "Cài đặt", icon: Settings, show: (_, c) => c("settings.view") },
];

export function firstAllowed(me: Me) {
  const can = (p: string) => me.perms.includes(p);
  return NAV.find((n) => n.show(me, can))?.href ?? "/knowledge";
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [branch, setBranchState] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const [offline, setOffline] = useState(false);
  const [anchor, setAnchor] = useState<{ server: number; local: number } | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const reloadMe = useCallback(async () => {
    try {
      const m = await api<Me>("/me");
      setMe(m);
      setAnchor({ server: new Date(m.tenant.now).getTime(), local: Date.now() });
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(`pmu_branch_${m.tenant.id}`);
      } catch {}
      const ok = saved === "all" ? m.all_branches_allowed : !!saved && m.branches.some((b) => b.id === saved);
      const b = ok && saved ? saved : m.branches[0]?.id ?? "all";
      setApiBranch(b);
      setBranchState(b);
    } catch {
      /* 401 đã chuyển trang */
    }
  }, []);

  useEffect(() => {
    reloadMe();
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [reloadMe]);

  useEffect(() => setDrawer(false), [pathname]);

  const can = useCallback((p: string) => !!me?.perms.includes(p), [me]);
  const now = useCallback(() => (anchor ? new Date(anchor.server + (Date.now() - anchor.local)) : new Date()), [anchor]);
  const setBranch = useCallback(
    (b: string) => {
      setApiBranch(b);
      setBranchState(b);
      try {
        if (me) localStorage.setItem(`pmu_branch_${me.tenant.id}`, b);
      } catch {}
    },
    [me],
  );

  const ctx = useMemo(() => ({ me, branch, setBranch, reloadMe, can, now }), [me, branch, setBranch, reloadMe, can, now]);

  if (!me) {
    return (
      <div className="app">
        <aside className="sidebar desktop-only" />
        <div className="main">
          <div className="content">
            <PageSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => n.show(me, can));
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Điều hướng chính">
          <Link href={firstAllowed(me)} className="brand">
            <img src="/brand/logo-mark.png" alt="PMU OS" />
            <span className="brand-text">
              <b>PMU OS</b>
              <span>TAKI ACADEMY</span>
            </span>
          </Link>
          <nav className="nav">
            {items.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} title={n.label}>
                  <Icon />
                  <span className="nav-label">{n.href === "/settings" && active ? "Cài đặt & tích hợp" : n.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
        <div className="main">
          {offline && <div className="offline-bar">Mất kết nối mạng — dữ liệu có thể chưa cập nhật. Thao tác sẽ không được lưu cho đến khi có mạng.</div>}
          <Topbar onMenu={() => setDrawer(true)} />
          <div className="demo-strip mobile-block">{me.tenant.mode === "DEMO" ? "DỮ LIỆU MÔ PHỎNG · không phải dữ liệu thật" : "DỮ LIỆU DOANH NGHIỆP"}</div>
          <main className="content" id="noi-dung">
            <Suspense fallback={<PageSkeleton />}>
              <React.Fragment key={`${branch}:${me.user.id}`}>{children}</React.Fragment>
            </Suspense>
          </main>
          <footer className="footer">
            <span className="muted small">
              {me.tenant.mode === "DEMO" ? `Giờ hệ thống demo: ${fmtDateTime(now())}` : me.tenant.name} · Zalo: {me.integration.health === "CONNECTED" ? "đã kết nối" : "chưa kết nối"} ·{" "}
              <Link href="/thiet-ke" className="link small">
                Bộ thiết kế gốc
              </Link>
            </span>
            <span>NGUYỄN TẤT KIỂM - TAKI.VN</span>
          </footer>
        </div>
      </div>
    </AppCtx.Provider>
  );

}

function Topbar({ onMenu }: { onMenu: () => void }) {
    const { me, branch, setBranch, reloadMe, now } = useApp();
    const router = useRouter();
    const [menu, setMenu] = useState<"" | "user" | "bell">("");
    const [search, setSearch] = useState(false);
    const [help, setHelp] = useState(false);
    const [notes, setNotes] = useState<any[] | null>(null);
    const toast = useToast();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      api("/notifications")
        .then((r) => setNotes(r.items))
        .catch(() => setNotes([]));
    }, []);
    useEffect(() => {
      const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu("");
      document.addEventListener("mousedown", h);
      const k = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setSearch(true);
        }
      };
      document.addEventListener("keydown", k);
      return () => {
        document.removeEventListener("mousedown", h);
        document.removeEventListener("keydown", k);
      };
    }, []);
    const m = me!;
    return (
      <header className="topbar" ref={ref}>
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Mở menu">
          <Menu />
        </button>
        <div className="branch-select">
          <MapPin size={20} className="desktop-only" />
          <span className="desktop-only">Chi nhánh:</span>
          <select className="select" style={{ height: 40, width: "auto", minWidth: 150, maxWidth: 240 }} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Chọn chi nhánh">
            {(m.all_branches_allowed && m.branches.length > 1) || m.branches.length === 0 ? <option value="all">Tất cả chi nhánh</option> : null}
            {m.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="spacer" />
        <span className={`demo-badge top ${m.tenant.mode === "DEMO" ? "" : "real"}`} title={m.tenant.mode === "DEMO" ? `Dữ liệu mô phỏng, không phải dữ liệu thật. Giờ demo: ${fmtDateTime(now())}` : "Dữ liệu doanh nghiệp"}>
          <Database size={18} />
          <span className="desktop-only">{m.tenant.mode === "DEMO" ? "DỮ LIỆU MÔ PHỎNG" : "DỮ LIỆU DOANH NGHIỆP"}</span>
          <span className="mobile-inline">{m.tenant.mode === "DEMO" ? "MÔ PHỎNG" : "THẬT"}</span>
        </span>
        <div className="spacer desktop-only" />
        <button className="icon-btn" onClick={() => setSearch(true)} aria-label="Tìm kiếm (Ctrl+K)">
          <Search />
        </button>
        <div style={{ position: "relative" }}>
          <button className="icon-btn" onClick={() => setMenu(menu === "bell" ? "" : "bell")} aria-label="Thông báo" aria-expanded={menu === "bell"}>
            <Bell />
            {!!notes?.length && <span className="dot" />}
          </button>
          {menu === "bell" && (
            <div className="menu" style={{ width: 360 }}>
              <div className="strong" style={{ padding: "6px 10px" }}>
                Thông báo trong phạm vi của bạn
              </div>
              {notes === null ? <div className="muted small" style={{ padding: 10 }}>Đang tải...</div> : null}
              {notes?.length === 0 && <div className="muted small" style={{ padding: 10 }}>Không có thông báo mới.</div>}
              {notes?.map((n, i) => (
                <Link key={i} href={n.href} className="menu-item" onClick={() => setMenu("")}>
                  <span className={`badge b-${n.tone === "danger" ? "red" : n.tone === "warn" ? "gold" : "teal"}`} style={{ minWidth: 8, padding: 4 }} />
                  <span>
                    <b style={{ fontWeight: 600 }}>{n.title}</b>
                    <div className="muted tiny">{n.detail}</div>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <button className="icon-btn desktop-only" onClick={() => setHelp(true)} aria-label="Trợ giúp">
          <CircleHelp />
        </button>
        <div style={{ position: "relative" }}>
          <button className="user-chip" onClick={() => setMenu(menu === "user" ? "" : "user")} aria-expanded={menu === "user"} aria-label="Tài khoản">
            <Avatar name={m.user.name} size="sm" />
            <span className="desktop-only" style={{ textAlign: "left" }}>
              <b>{m.user.name}</b>
              <small>{m.user.role_label}</small>
            </span>
            <ChevronDown size={16} className="desktop-only" />
          </button>
          {menu === "user" && (
            <div className="menu" style={{ width: 320 }}>
              {m.tenant.mode === "DEMO" && (
                <>
                  <div className="tiny muted" style={{ padding: "6px 10px" }}>
                    XEM VỚI VAI TRÒ (DEMO) — quyền được kiểm tại máy chủ
                  </div>
                  <div style={{ maxHeight: 320, overflow: "auto" }}>
                    {m.personas.map((p) => (
                      <button
                        key={p.id}
                        className={`menu-item ${p.id === m.user.id ? "on" : ""}`}
                        onClick={async () => {
                          await api("/demo/switch", { body: { user_id: p.id } });
                          setMenu("");
                          await reloadMe();
                          toast("info", `Đang xem với vai trò ${p.role_label} (${p.display_name}).`);
                          router.push("/");
                        }}
                      >
                        <Avatar name={p.display_name} size="sm" />
                        <span>
                          {p.display_name}
                          <div className="muted tiny">{p.role_label}</div>
                        </span>
                      </button>
                    ))}
                  </div>
                  <hr className="hr" />
                  <button
                    className="menu-item"
                    onClick={async () => {
                      if (!window.confirm("Đặt lại toàn bộ dữ liệu demo về trạng thái ban đầu? Thao tác chỉ ảnh hưởng bản demo của bạn.")) return;
                      await api("/demo/reset", { body: {} });
                      window.location.href = "/dashboard";
                    }}
                  >
                    <RotateCcw size={18} /> Đặt lại dữ liệu demo
                  </button>
                </>
              )}
              <Link className="menu-item" href="/thiet-ke" onClick={() => setMenu("")}>
                <ImageIcon size={18} /> Bộ thiết kế gốc (16 màn hình)
              </Link>
              <button
                className="menu-item"
                onClick={async () => {
                  await api("/auth/logout", { body: {} });
                  window.location.href = "/login";
                }}
              >
                <LogOut size={18} /> Kết thúc phiên
              </button>
            </div>
          )}
        </div>
        {search && <SearchModal onClose={() => setSearch(false)} />}
        {help && <HelpModal onClose={() => setHelp(false)} />}
      </header>
    );
  }

function SearchModal({ onClose }: { onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      if (!term.trim()) return setRes([]);
      api(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => setRes(r.results))
        .catch(() => setRes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [term]);
  return (
    <Modal title="Tìm kiếm" onClose={onClose}>
      <div className="input-icon">
        <Search />
        <input className="input" placeholder="Tìm nhân sự, khách hàng, công việc, SOP..." value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <div className="mt-12">
        {term && !res.length && <div className="muted small">Không có kết quả trong phạm vi quyền của bạn.</div>}
        {res.map((r, i) => (
          <button
            key={i}
            className="menu-item"
            onClick={() => {
              onClose();
              router.push(r.href);
            }}
          >
            <span className="badge b-teal">{r.type}</span> {r.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Hướng dẫn nhanh PMU OS" onClose={onClose} size="wide">
      <div className="stack small" style={{ gap: 10 }}>
        <div className="banner warn">
          <Database />
          <div>
            Đây là bản demo với <b>DỮ LIỆU MÔ PHỎNG</b> (Nhân sự A–H, Khách mẫu A–F). Mỗi lượt “Khám phá bản demo” có một doanh nghiệp demo riêng, lưu thật trên cơ sở dữ liệu, có thể đặt lại. Zalo
            chưa kết nối: mọi tin gửi khách chỉ ở trạng thái bản nháp hoặc chờ duyệt.
          </div>
        </div>
        <div>
          <b>Hành trình gợi ý:</b>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            <li>Tổng quan: 8 nhân sự, 24 việc (20 xong, 3 đang làm đúng hạn, 1 quá hạn).</li>
            <li>AI Assistant: hỏi “Hôm nay doanh nghiệp có vấn đề gì?” → gửi đề xuất giao việc cho quản lý duyệt.</li>
            <li>Phê duyệt: duyệt đề xuất đổi ca / xuất bản SOP; duyệt hai lần không thực thi hai lần.</li>
            <li>Đổi vai trò (menu tài khoản) sang Nhân sự G để nhận việc, đánh dấu checklist, nộp kết quả; quay lại Chủ doanh nghiệp để duyệt.</li>
            <li>Lịch hẹn: thử đặt trùng giờ để thấy cảnh báo và gợi ý giờ trống.</li>
          </ol>
        </div>
        <div>
          <b>AI:</b> chạy chế độ quy tắc có nguồn, chưa nối nhà cung cấp mô hình. AI chỉ đề xuất; quyết định do con người duyệt.
        </div>
        <div>
          <b>Phím tắt:</b> Ctrl/⌘ + K để tìm kiếm. Esc để đóng cửa sổ.
        </div>
      </div>
    </Modal>
  );
}
