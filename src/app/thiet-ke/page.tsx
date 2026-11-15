"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Image as ImageIcon } from "lucide-react";
import { DESIGN_REFS, Modal } from "@/components/ui";

const ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  people: "/people",
  shifts: "/shifts",
  tasks: "/tasks",
  performance: "/performance",
  knowledge: "/knowledge",
  customers: "/customers",
  customer: "/customers",
  inbox: "/inbox",
  appointments: "/appointments",
  care: "/care",
  reports: "/reports",
  assistant: "/assistant",
  approvals: "/approvals",
  settings: "/settings",
  login: "/login",
};

export default function DesignGallery() {
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="topbar" style={{ position: "sticky" }}>
        <Link href="/" className="row" style={{ gap: 10 }}>
          <img src="/brand/logo-mark.png" alt="" style={{ width: 34, background: "var(--sidebar)", borderRadius: 8, padding: 4 }} />
          <b>PMU OS</b>
        </Link>
        <span className="spacer" />
        <span className="demo-badge">BỘ THIẾT KẾ GỐC · 16 MÀN HÌNH</span>
        <span className="spacer" />
        <Link href="/" className="btn btn-outline btn-sm">
          <ArrowLeft /> Về ứng dụng
        </Link>
      </header>
      <main className="content" style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div className="page-head">
          <div>
            <h1>Bộ thiết kế tham chiếu PMU OS</h1>
            <p>
              16 ảnh giao diện trong gói bàn giao (ImageGen, 1536×1024) và ảnh tổng quan. Ảnh là tham chiếu bố cục và phong cách; số liệu, tên trong ảnh là minh họa. Ứng dụng thật đọc dữ liệu runtime theo đặc tả.
            </p>
          </div>
        </div>
        <section className="card mb-16" style={{ overflow: "hidden" }}>
          <img src="/design/TONG_QUAN_16_MAN_HINH.webp" alt="Tổng quan 16 màn hình" style={{ width: "100%", display: "block", cursor: "zoom-in" }} onClick={() => setZoom({ src: "/design/TONG_QUAN_16_MAN_HINH.webp", title: "Tổng quan 16 màn hình" })} />
        </section>
        <div className="ref-grid">
          {Object.entries(DESIGN_REFS).map(([k, r]) => (
            <section key={k} className="card ref-card">
              <img src={`/design/${r.file}.webp`} alt={r.title} loading="lazy" onClick={() => setZoom({ src: `/design/${r.file}.webp`, title: `${r.ui} · ${r.title}` })} />
              <div className="card-pad row-between">
                <div>
                  <div className="tiny muted">{r.ui}</div>
                  <b>{r.title}</b>
                  <div className="tiny muted">Route: {ROUTES[k] === "/customers" && k === "customer" ? "/customers/:id" : ROUTES[k]}</div>
                </div>
                <Link className="btn btn-outline btn-sm" href={ROUTES[k]}>
                  <ExternalLink /> Mở
                </Link>
              </div>
            </section>
          ))}
        </div>
        <footer className="footer" style={{ border: 0 }}>
          <span className="muted small">
            <ImageIcon size={14} /> Nguồn: PMU_MO_TA_VA_BO_GIAO_DIEN.zip · 02_GIAO_DIEN
          </span>
          <span>NGUYỄN TẤT KIỂM - TAKI.VN</span>
        </footer>
      </main>
      {zoom && (
        <Modal title={zoom.title} onClose={() => setZoom(null)} size="xl">
          <img src={zoom.src} alt={zoom.title} style={{ width: "100%", borderRadius: 12 }} />
        </Modal>
      )}
    </div>
  );
}
