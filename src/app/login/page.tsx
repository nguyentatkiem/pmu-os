"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Database, Eye, EyeOff, Lock, Mail, Play, Sparkles, Users, UsersRound, Image as ImageIcon } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { DesignRefModal, Field, Modal } from "@/components/ui";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"" | "login" | "demo">("");
  const [err, setErr] = useState<ApiError | null>(null);
  const [forgot, setForgot] = useState(false);
  const [ref, setRef] = useState(false);
  const [notice, setNotice] = useState(sp.get("expired") ? "Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại." : "");

  useEffect(() => {
    api("/me")
      .then(() => router.replace("/dashboard"))
      .catch(() => {});
  }, [router]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("login");
    try {
      await api("/auth/login", { body: { email, password } });
      router.replace("/");
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy("");
    }
  }
  async function demo() {
    setErr(null);
    setBusy("demo");
    try {
      await api("/auth/demo", { body: {} });
      router.replace("/dashboard");
    } catch (x) {
      setErr(x as ApiError);
      setBusy("");
    }
  }

  return (
    <div className="login">
      <section className="login-art" aria-label="Giới thiệu PMU OS">
        <div className="brand-big">
          <img src="/brand/logo-mark.png" alt="" />
          <div>
            <b>PMU OS</b>
            <span>TAKI ACADEMY</span>
          </div>
        </div>
        <div className="rule" />
        <h1>Trung tâm vận hành doanh nghiệp PMU</h1>
        <div className="glass-pills">
          <span className="glass-pill">
            <Users /> Nhân sự
          </span>
          <span className="glass-pill">
            <UsersRound /> Khách hàng
          </span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setRef(true)}>
            <ImageIcon /> Thiết kế gốc
          </button>
          <span className="demo-badge">
            <Database size={18} /> DỮ LIỆU MÔ PHỎNG
          </span>
        </div>
        <div className="login-card">
          <div className="welcome">
            <span className="spark">
              <Sparkles size={32} />
            </span>
            <h2>Chào mừng trở lại</h2>
          </div>
          <p className="muted" style={{ fontSize: 18, marginTop: 14 }}>
            Đăng nhập vào PMU OS để quản trị Nhân sự, Khách hàng và vận hành doanh nghiệp hiệu quả.
          </p>
          <form className="login-box stack" onSubmit={login} noValidate style={{ gap: 16 }}>
            {notice && <div className="banner warn">{notice}</div>}
            {err && !err.field_errors && <div className="banner danger" role="alert">{err.message}</div>}
            <Field label="Email" error={err?.field_errors?.email}>
              <div className="input-icon">
                <Mail />
                <input className="input" type="email" autoComplete="username" placeholder="Nhập email của bạn" value={email} onChange={(e) => (setEmail(e.target.value), setNotice(""))} />
              </div>
            </Field>
            <Field label="Mật khẩu" error={err?.field_errors?.password}>
              <div className="input-icon" style={{ position: "relative" }}>
                <Lock />
                <input className="input" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 48 }} />
                <button type="button" className="icon-btn" style={{ position: "absolute", right: 2, top: 1 }} onClick={() => setShow((v) => !v)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {show ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <div style={{ textAlign: "right" }}>
              <button type="button" className="link" onClick={() => setForgot(true)}>
                Quên mật khẩu?
              </button>
            </div>
            <button className="btn btn-dark btn-lg btn-block" disabled={!!busy}>
              {busy === "login" ? "Đang đăng nhập..." : (
                <>
                  Đăng nhập <ArrowRight />
                </>
              )}
            </button>
            <button type="button" className="btn btn-outline-gold btn-lg btn-block" disabled={!!busy} onClick={demo}>
              {busy === "demo" ? "Đang tạo doanh nghiệp demo riêng..." : (
                <>
                  <Play /> Khám phá bản demo
                </>
              )}
            </button>
            <p className="tiny muted" style={{ margin: 0 }}>
              Bản demo tạo một doanh nghiệp mô phỏng riêng cho bạn (Nhân sự A–H, Khách mẫu A–F), tách khỏi dữ liệu thật và không gửi tin ra ngoài. Cần hỗ trợ tài khoản, vui lòng liên hệ quản trị hệ
              thống của DOANH NGHIỆP PMU.
            </p>
          </form>
        </div>
        <div style={{ marginTop: "auto", paddingTop: 24, borderTop: "1px solid var(--border)", textAlign: "right", fontWeight: 500, letterSpacing: 0.3 }}>NGUYỄN TẤT KIỂM - TAKI.VN</div>
      </section>
      {forgot && <ForgotModal onClose={() => setForgot(false)} />}
      {ref && <DesignRefModal refKey="login" onClose={() => setRef(false)} />}
    </div>
  );
}

function ForgotModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal
      title="Khôi phục tài khoản"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              setErr("");
              try {
                const r = await api("/auth/forgot", { body: { email } });
                setMsg(r.message);
              } catch (e) {
                setErr((e as ApiError).message);
              }
            }}
          >
            Gửi yêu cầu
          </button>
        </>
      }
    >
      <Field label="Email đăng nhập" error={err}>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {msg && <div className="banner info mt-12">{msg}</div>}
    </Modal>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
