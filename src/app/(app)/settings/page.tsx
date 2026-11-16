"use client";
import { Fragment, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, Building2, ChevronRight, Crown, FileText, Headset, Info, Link2, Moon, Play, Plus, Radio, RotateCcw, ShieldCheck, Sparkles, UserRound, Users, Unplug, ArrowRight } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, DesignRefButton, Field, Modal, PageHead, PageState, useAction } from "@/components/ui";
import { PROPOSAL_TYPE_LABEL } from "@/lib/shared/labels";
import { fmtDateTime } from "@/lib/shared/format";

const TABS = [
  ["company", "Doanh nghiệp", Building2],
  ["members", "Thành viên & quyền", Users],
  ["ai", "AI policies", Sparkles],
  ["integrations", "Tích hợp", Link2],
  ["log", "Nhật ký", FileText],
] as const;

const LEVEL_LABEL: Record<string, string> = { L0: "L0 · Chỉ đọc & đề xuất", L1: "L1 · Đề xuất và chờ duyệt", L2: "L2 · Tự thực hiện (rủi ro thấp)" };
const POLICY_KEYS: [string, string][] = [
  ["INTERNAL_REMINDER", "Nhắc việc nội bộ"],
  ["TASK_ASSIGN", "Giao việc"],
  ["SHIFT_CHANGE", "Đổi ca / phân ca"],
  ["CUSTOMER_MESSAGE", "Nội dung gửi khách"],
  ["CARE_MESSAGE", "Nội dung chăm sóc"],
  ["SOP_PUBLISH", "Xuất bản SOP"],
];

export default function SettingsPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<string>(sp.get("tab") ?? "integrations");
  const q = useApi<any>("/settings");
  return (
    <>
      <PageHead title="Cài đặt & tích hợp" sub="Quản lý thông tin doanh nghiệp, thành viên, quyền, chính sách AI và các tích hợp hệ thống." actions={<DesignRefButton refKey="settings" />} />
      <div className="pill-tabs mb-16" role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {TABS.map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} style={{ justifyContent: "center", padding: 14, fontSize: 16 }}>
            <Icon size={20} /> {l}
          </button>
        ))}
      </div>
      <PageState q={q}>
        {(d) => (
          <>
            {tab === "integrations" && <Integrations d={d} reload={q.reload} />}
            {tab === "company" && <Company d={d} reload={q.reload} />}
            {tab === "members" && <Members d={d} reload={q.reload} />}
            {tab === "ai" && <AiPolicies d={d} reload={q.reload} />}
            {tab === "log" && <Logs d={d} reload={q.reload} />}
          </>
        )}
      </PageState>
    </>
  );
}

function Integrations({ d, reload }: { d: any; reload: () => void }) {
  const { run, busy } = useAction();
  const [check, setCheck] = useState<any>(null);
  const [guide, setGuide] = useState(false);
  const [qh, setQh] = useState(d.settings.quiet_hours ?? { enabled: true, from: "21:00", to: "08:00" });
  const i = d.integration;
  const mini = [
    ["BRANCH_MANAGER", "Quản lý", Crown],
    ["CONSULTANT", "Tư vấn", Users],
    ["CUSTOMER_CARE", "CSKH", Headset],
  ] as const;
  const has = (role: string, perms: string[]) => d.matrix.find((m: any) => m.role === role)?.perms.some((p: string) => perms.includes(p));
  return (
    <div className="three-col" style={{ gridTemplateColumns: "250px minmax(0,1fr) 430px" }}>
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h3>
              <Users /> Thành viên ({d.members.filter((m: any) => m.employee_id).length})
            </h3>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            {d.members
              .filter((m: any) => m.employee_id)
              .map((m: any) => (
                <div key={m.id} className="list-item" style={{ alignItems: "center", padding: "8px 0" }}>
                  <span className="avatar sm" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
                    <UserRound size={15} />
                  </span>
                  <span style={{ flex: 1 }}>{m.display_name}</span>
                  <ChevronRight size={16} />
                </div>
              ))}
          </div>
        </section>
        {d.customers.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h3>
                <Users /> Khách hàng mẫu ({d.customers.length})
              </h3>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {d.customers.map((c: any) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="list-item" style={{ alignItems: "center", padding: "8px 0" }}>
                  <span className="avatar sm" style={{ background: "var(--gold-50)", color: "var(--gold-600)" }}>
                    <UserRound size={15} />
                  </span>
                  <span style={{ flex: 1 }}>{c.display_name}</span>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <h2>
              <Link2 /> Tích hợp hệ thống
            </h2>
            <div className="sub">Kết nối và đồng bộ dữ liệu với các nền tảng bên ngoài.</div>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <div className="card row" style={{ boxShadow: "none", padding: 16, flexWrap: "nowrap", alignItems: "flex-start" }}>
              <img src="/brand/zalo.png" alt="Zalo" style={{ width: 70, height: 70 }} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 22 }}>Zalo</b>
                <div className="small muted">Tích hợp Zalo để đồng bộ hội thoại và hỗ trợ chăm sóc khách hàng (sau khi xác minh repo).</div>
                {i.last_checked_at && <div className="tiny muted mt-8">Kiểm tra gần nhất: {fmtDateTime(i.last_checked_at)}</div>}
              </div>
              <Badge tone={i.health === "CONNECTED" ? "green" : "red"}>● {i.health === "CONNECTED" ? "Đã kết nối" : "Chưa kết nối"}</Badge>
            </div>
            <b>Chế độ hoạt động</b>
            <div className="grid g-2" style={{ gap: 12 }}>
              <label className="card" style={{ boxShadow: "none", padding: 14, display: "flex", gap: 12, background: i.mode === "DEMO" ? "#eaf7f6" : undefined, borderColor: i.mode === "DEMO" ? "var(--primary)" : undefined, cursor: "pointer" }}>
                <input type="radio" name="mode" checked={i.mode === "DEMO"} readOnly style={{ accentColor: "var(--primary)", width: 20, height: 20 }} />
                <span>
                  <b>Dữ liệu mô phỏng (Demo)</b>
                  <div className="small muted">Dùng dữ liệu giả lập để trải nghiệm đầy đủ tính năng. Không gửi ra ngoài.</div>
                </span>
              </label>
              <label className="card" style={{ boxShadow: "none", padding: 14, display: "flex", gap: 12, cursor: d.can_integrations ? "pointer" : "not-allowed" }}>
                <input
                  type="radio"
                  name="mode"
                  checked={i.mode === "LIVE"}
                  disabled={!d.can_integrations}
                  onChange={() => run(() => api("/integrations/zalo/mode", { body: { mode: "LIVE" } }))}
                  style={{ width: 20, height: 20 }}
                />
                <span>
                  <b>Kết nối thực tế</b>
                  <div className="small muted">Kết nối Zalo của doanh nghiệp (sau khi cấu hình và xác minh repo).</div>
                </span>
              </label>
            </div>
            <div className="banner info">
              <Info />
              <div style={{ flex: 1 }}>
                <b>Cần cấu hình repo Zalo</b>
                <div className="small">Chuẩn bị và kiểm tra repo Zalo (README, license, xác thực, API) trước khi kích hoạt kết nối. Secret chỉ lưu ở máy chủ.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setGuide(true)}>
                <BookOpen /> Xem hướng dẫn
              </button>
            </div>
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                className="btn btn-dark btn-lg"
                style={{ minWidth: 300 }}
                disabled={busy || !d.can_integrations}
                onClick={async () => {
                  const r = await run(() => api("/integrations/zalo/check", { body: {} }));
                  if (r) (setCheck(r), reload());
                }}
              >
                <Radio /> Kiểm tra kết nối
              </button>
              {d.can_integrations && (
                <button className="btn btn-outline" disabled={busy} onClick={() => window.confirm("Ngắt tích hợp Zalo? Mọi lượt gửi sẽ bị chặn.") && run(() => api("/integrations/zalo/disconnect", { body: {} }), (r: any) => r.message).then(reload)}>
                  <Unplug /> Ngắt tích hợp
                </button>
              )}
            </div>
            {check && (
              <div className={`banner ${check.status === "CONNECTED" ? "ok" : "danger"}`} role="status">
                <Radio />
                <div>
                  <b>Kết quả kiểm tra ({fmtDateTime(check.checked_at)}): {check.status === "CONNECTED" ? "Đã kết nối" : "Chưa kết nối"}</b>
                  <div className="small">{check.message}</div>
                  <div className="tiny">Khả năng: gửi {check.capabilities.send ? "có" : "không"} · nhận {check.capabilities.receive ? "có" : "không"} · trạng thái giao tin {check.capabilities.delivery_status ? "có" : "không"}</div>
                </div>
              </div>
            )}
            {!d.can_integrations && <div className="tiny muted">Vai trò hiện tại không có quyền quản lý tích hợp.</div>}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>
              <BookOpen /> Hướng dẫn tích hợp
            </h3>
            <div className="sub">Kiểm tra repo Zalo hiện có trước khi cấu hình.</div>
          </div>
          <div className="card-body">
            <div className="banner warn">
              <Info />
              <div>
                <b>Trạng thái:</b> Chưa xác minh khả năng kết nối. Hệ thống dùng adapter mô phỏng; mọi nút gửi chỉ tạo bản nháp/đề xuất.
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="stack">
        <section className="card gold-head">
          <div className="card-head">
            <h3>
              <ShieldCheck /> Ma trận phân quyền
            </h3>
            <div className="sub">Rút gọn theo module Khách hàng. Ma trận đầy đủ ở tab “Thành viên & quyền”.</div>
          </div>
          <div className="card-body">
            <table className="t" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Vai trò</th>
                  <th>Xem</th>
                  <th>Sửa</th>
                  <th>Duyệt</th>
                </tr>
              </thead>
              <tbody>
                {mini.map(([role, label, Icon]) => (
                  <tr key={role}>
                    <td>
                      <span className="row" style={{ flexWrap: "nowrap" }}>
                        <Icon size={18} color="var(--gold-600)" /> {label}
                      </span>
                    </td>
                    <td>
                      <input type="checkbox" readOnly checked={!!has(role, ["customers.view_all", "customers.view_assigned"])} style={{ accentColor: "var(--ok)", width: 18, height: 18 }} aria-label={`${label} xem`} />
                    </td>
                    <td>
                      <input type="checkbox" readOnly checked={!!has(role, ["customers.edit"])} style={{ accentColor: "var(--ok)", width: 18, height: 18 }} aria-label={`${label} sửa`} />
                    </td>
                    <td>
                      <input type="checkbox" readOnly checked={!!has(role, ["approvals.decide"])} style={{ accentColor: "var(--ok)", width: 18, height: 18 }} aria-label={`${label} duyệt`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card gold-head">
          <div className="card-head">
            <h3>
              <Sparkles /> Chính sách AI
            </h3>
            <div className="sub">Thiết lập cách AI hoạt động và phê duyệt kết quả.</div>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            <Field label="Chính sách mặc định">
              <select className="select" value={d.settings.ai_policy?.default_level ?? "L1"} disabled>
                <option value="L1">Đề xuất và chờ duyệt</option>
              </select>
            </Field>
            <div className="banner info small">
              <Info /> AI sẽ đưa ra đề xuất (nội dung, gợi ý, phương án...) và gửi đến người có thẩm quyền duyệt trước khi áp dụng.
            </div>
          </div>
        </section>
        <section className="card gold-head">
          <div className="card-head">
            <h3>
              <Moon /> Khung giờ yên tĩnh
            </h3>
            <div className="sub">Giới hạn thời gian gửi thông báo, đề xuất hoặc tin nhắn tự động.</div>
          </div>
          <div className="card-body row" style={{ alignItems: "flex-end" }}>
            <Field label="Từ">
              <input className="input" type="time" value={qh.from} onChange={(e) => setQh({ ...qh, from: e.target.value })} disabled={!d.can_manage} style={{ width: 130 }} />
            </Field>
            <ArrowRight style={{ marginBottom: 12 }} />
            <Field label="Đến">
              <input className="input" type="time" value={qh.to} onChange={(e) => setQh({ ...qh, to: e.target.value })} disabled={!d.can_manage} style={{ width: 130 }} />
            </Field>
            <button className={`toggle ${qh.enabled ? "on" : ""}`} disabled={!d.can_manage} onClick={() => setQh({ ...qh, enabled: !qh.enabled })} aria-pressed={qh.enabled} aria-label="Bật giờ yên tĩnh" style={{ marginBottom: 10 }} />
            <span style={{ marginBottom: 10 }}>{qh.enabled ? "Bật" : "Tắt"}</span>
            {d.can_manage && (
              <button className="btn btn-primary btn-sm" style={{ marginBottom: 6 }} disabled={busy} onClick={() => run(() => api("/settings/policies", { method: "PATCH", body: { quiet_hours: qh } }), "Đã lưu giờ yên tĩnh.").then(reload)}>
                Lưu
              </button>
            )}
          </div>
        </section>
      </div>
      {guide && (
        <Modal title="Hướng dẫn chuẩn bị repo Zalo" onClose={() => setGuide(false)}>
          <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
            <li>Bàn giao repo Zalo đang dùng (đường dẫn, quyền đọc).</li>
            <li>Kiểm tra README, license, cấu hình, cơ chế xác thực và API thực tế.</li>
            <li>Xác nhận kênh (OA/tài khoản), khả năng gửi/nhận, giới hạn và webhook.</li>
            <li>Khai báo secret ở biến môi trường máy chủ (không đưa vào trình duyệt).</li>
            <li>Viết adapter LIVE theo hợp đồng nội bộ: capabilities, health, listConversations, receiveEvent, sendMessage, getDeliveryStatus.</li>
            <li>Kiểm thử ở môi trường thử; chống gửi lặp bằng idempotency key + outbox đã có.</li>
          </ol>
        </Modal>
      )}
    </div>
  );
}

function Company({ d, reload }: { d: any; reload: () => void }) {
  const { run, busy } = useAction();
  const [name, setName] = useState(d.tenant.name);
  const [branch, setBranch] = useState("");
  const [svc, setSvc] = useState({ name: "", duration_min: 30, price_vnd: "" });
  return (
    <div className="grid g-2">
      <section className="card">
        <div className="card-head">
          <h3>
            <Building2 /> Doanh nghiệp
          </h3>
        </div>
        <div className="card-body stack" style={{ gap: 12 }}>
          <Field label="Tên doanh nghiệp" req>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!d.can_manage} />
          </Field>
          <dl className="kv small">
            <dt>Chế độ</dt>
            <dd>{d.tenant.mode === "DEMO" ? "Demo (dữ liệu mô phỏng, tách khỏi dữ liệu thật)" : "Thật"}</dd>
            <dt>Múi giờ</dt>
            <dd>{d.tenant.timezone} (lưu UTC, hiển thị giờ Việt Nam)</dd>
            <dt>Cơ sở dữ liệu</dt>
            <dd>{d.db === "pg" ? "PostgreSQL" : "PGlite (máy cá nhân)"}</dd>
            <dt>AI</dt>
            <dd style={{ fontWeight: 400 }}>{d.ai.engine}</dd>
          </dl>
          {d.can_manage && (
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => run(() => api("/settings/tenant", { method: "PATCH", body: { name } }), "Đã lưu.").then(reload)}>
              Lưu thông tin
            </button>
          )}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h3>
            <Building2 /> Chi nhánh
          </h3>
        </div>
        <div className="card-body">
          {d.branches.map((b: any) => (
            <div key={b.id} className="list-item" style={{ alignItems: "center" }}>
              <span style={{ flex: 1 }}>{b.name}</span>
              <Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status === "ACTIVE" ? "Hoạt động" : "Ngừng"}</Badge>
              {d.can_manage && (
                <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/settings/branches/${b.id}`, { method: "PATCH", body: { status: b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } }), "Đã cập nhật chi nhánh.").then(reload)}>
                  {b.status === "ACTIVE" ? "Ngừng" : "Mở lại"}
                </button>
              )}
            </div>
          ))}
          {d.can_manage && (
            <div className="row mt-12" style={{ flexWrap: "nowrap" }}>
              <input className="input" placeholder="Tên chi nhánh mới" value={branch} onChange={(e) => setBranch(e.target.value)} />
              <button className="btn btn-outline" disabled={busy || !branch.trim()} onClick={() => run(() => api("/settings/branches", { body: { name: branch } }), "Đã thêm chi nhánh.").then(() => (setBranch(""), reload()))}>
                <Plus /> Thêm
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head">
          <h3>
            <BookOpen /> Dịch vụ
          </h3>
          <div className="sub">Bảng giá chỉ hiển thị khi đã được duyệt; giá lưu số nguyên VND. Không tạo KPI doanh thu.</div>
        </div>
        <div className="card-body table-wrap">
          <table className="t cards">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                <th>Thời lượng</th>
                <th>Giá đã duyệt</th>
                <th>FAQ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {d.services.map((s: any) => (
                <tr key={s.id}>
                  <td data-label="Dịch vụ">{s.name}</td>
                  <td data-label="Thời lượng">{s.duration_min} phút</td>
                  <td data-label="Giá">{s.price_vnd ? `${Number(s.price_vnd).toLocaleString("vi-VN")} đ` : "Chưa có bảng giá đã duyệt"}</td>
                  <td data-label="FAQ">{s.faq_version ?? "—"}</td>
                  <td data-label="Trạng thái">
                    {d.can_manage ? (
                      <button className={`toggle ${s.active ? "on" : ""}`} onClick={() => run(() => api(`/settings/services/${s.id}`, { method: "PATCH", body: { active: !s.active } })).then(reload)} aria-label="Bật/tắt dịch vụ" />
                    ) : (
                      <Badge tone={s.active ? "green" : "gray"}>{s.active ? "Đang dùng" : "Tắt"}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.can_manage && (
            <div className="row mt-12">
              <input className="input" style={{ maxWidth: 260 }} placeholder="Tên dịch vụ" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} />
              <input className="input" style={{ maxWidth: 140 }} type="number" min={15} max={480} value={svc.duration_min} onChange={(e) => setSvc({ ...svc, duration_min: Number(e.target.value) })} aria-label="Thời lượng (phút)" />
              <input className="input" style={{ maxWidth: 200 }} type="number" min={0} placeholder="Giá đã duyệt (tùy chọn)" value={svc.price_vnd} onChange={(e) => setSvc({ ...svc, price_vnd: e.target.value })} />
              <button className="btn btn-outline" disabled={busy || !svc.name.trim()} onClick={() => run(() => api("/settings/services", { body: svc }), "Đã thêm dịch vụ.").then(() => (setSvc({ name: "", duration_min: 30, price_vnd: "" }), reload()))}>
                <Plus /> Thêm dịch vụ
              </button>
            </div>
          )}
        </div>
      </section>
      <SimulatedData d={d} />
    </div>
  );
}

function SimulatedData({ d }: { d: any }) {
  const { run, busy } = useAction();
  const [word, setWord] = useState("");
  const sim = d.simulated ?? {};
  if (sim.mode === "DEMO")
    return (
      <section className="card">
        <div className="card-head">
          <h3>
            <Info /> Dữ liệu mô phỏng
          </h3>
        </div>
        <div className="card-body small">Bản demo luôn dùng DỮ LIỆU MÔ PHỎNG (tên hư cấu, số điện thoại không có thật). Đặt lại tại menu tài khoản › Đặt lại dữ liệu demo.</div>
      </section>
    );
  if (!sim.can_toggle) return null;
  const need = sim.active ? "XOA" : "NAP";
  return (
    <section className="card">
      <div className="card-head">
        <h3>
          <Info /> Dữ liệu mô phỏng
        </h3>
        <div className="sub">{sim.active ? "Tài khoản đang chứa bộ DỮ LIỆU MÔ PHỎNG để chạy thử. Xóa trước khi nhập dữ liệu thật." : "Tài khoản đang ở trạng thái dữ liệu thật."}</div>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        <div className={`banner ${sim.active ? "warn" : "info"} small`}>
          <Info />
          <div>
            {sim.active
              ? "Xóa sẽ gỡ toàn bộ nhân sự, khách, lịch hẹn, công việc, hội thoại, SOP, đề xuất và nhật ký agent mô phỏng. Giữ lại tài khoản chủ và một chi nhánh. Không hoàn tác được."
              : "Nạp bộ mô phỏng gồm 2 chi nhánh, 22 nhân sự, 560 khách hư cấu. Chỉ nạp khi doanh nghiệp chưa có nhân sự nào để tránh trộn với dữ liệu thật."}
          </div>
        </div>
        <Field label={`Gõ ${need} để xác nhận`}>
          <input className="input" value={word} onChange={(e) => setWord(e.target.value.toUpperCase())} placeholder={need} style={{ maxWidth: 200 }} />
        </Field>
        <div>
          <button
            className={`btn ${sim.active ? "btn-danger" : "btn-primary"}`}
            disabled={busy || word !== need}
            onClick={async () => {
              const r: any = await run(() => api(`/settings/simulated/${sim.active ? "clear" : "seed"}`, { body: { confirm: word } }), (x: any) => x.message);
              if (r) window.location.href = "/dashboard";
            }}
          >
            {busy ? "Đang xử lý..." : sim.active ? "Xóa dữ liệu mô phỏng" : "Nạp dữ liệu mô phỏng"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Members({ d, reload }: { d: any; reload: () => void }) {
  const { run, busy } = useAction();
  const modules = [...new Set(d.permissions.map((p: any) => p.module))] as string[];
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h3>
            <Users /> Thành viên ({d.members.length})
          </h3>
          <div className="right">
            <Link href="/people" className="btn btn-outline btn-sm">
              Quản lý hồ sơ nhân sự
            </Link>
          </div>
        </div>
        <div className="card-body table-wrap">
          <table className="t cards">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Vai trò</th>
                <th>Email</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {d.members.map((m: any) => (
                <tr key={m.id}>
                  <td data-label="Thành viên">{m.display_name}</td>
                  <td data-label="Vai trò">
                    <Badge tone={m.role === "OWNER" ? "gold" : "teal"}>{m.role_label}</Badge>
                  </td>
                  <td data-label="Email">{m.email ?? "Ẩn theo quyền"}</td>
                  <td data-label="Trạng thái">
                    <Badge tone={m.status === "ACTIVE" ? "green" : m.status === "INVITED" ? "blue" : "gray"}>{m.status === "ACTIVE" ? "Hoạt động" : m.status === "INVITED" ? "Đã mời" : "Ngừng truy cập"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h3>
            <ShieldCheck /> Ma trận quyền theo module × hành động
          </h3>
          <div className="sub">Kiểm tra tại máy chủ theo doanh nghiệp, chi nhánh, quyền sở hữu bản ghi. Mặc định từ chối. Cột Chủ doanh nghiệp luôn đủ quyền.</div>
          {d.can_permissions && (
            <div className="right">
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => window.confirm("Khôi phục ma trận quyền mặc định?") && run(() => api("/settings/permissions/reset", { body: {} }), "Đã khôi phục mặc định.").then(reload)}>
                <RotateCcw /> Khôi phục mặc định
              </button>
            </div>
          )}
        </div>
        <div className="card-body table-wrap">
          <table className="t" style={{ fontSize: 13.5 }}>
            <thead>
              <tr>
                <th>Quyền</th>
                {d.matrix.map((m: any) => (
                  <th key={m.role} style={{ textAlign: "center", whiteSpace: "normal", minWidth: 90 }}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <Fragment key={mod}>
                  <tr>
                    <td colSpan={d.matrix.length + 1} style={{ background: "#fbf5e8", fontWeight: 700 }}>
                      {mod}
                    </td>
                  </tr>
                  {d.permissions
                    .filter((p: any) => p.module === mod)
                    .map((p: any) => (
                      <tr key={p.key}>
                        <td>
                          {p.label} <div className="tiny muted">{p.key}</div>
                        </td>
                        {d.matrix.map((m: any) => {
                          const on = m.perms.includes(p.key);
                          const changed = on !== d.defaults[m.role].includes(p.key);
                          return (
                            <td key={m.role} style={{ textAlign: "center", background: changed ? "#fff4dd" : undefined }}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!d.can_permissions || m.locked || busy}
                                onChange={(e) => run(() => api("/settings/permissions", { method: "PATCH", body: { role: m.role, perm: p.key, value: e.target.checked } }), "Đã cập nhật quyền.").then(reload)}
                                style={{ accentColor: "var(--ok)", width: 18, height: 18 }}
                                aria-label={`${m.label}: ${p.label}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AiPolicies({ d, reload }: { d: any; reload: () => void }) {
  const { run, busy } = useAction();
  const [levels, setLevels] = useState<Record<string, string>>(d.settings.ai_policy?.levels ?? {});
  const locked = ["CUSTOMER_MESSAGE", "CARE_MESSAGE", "SHIFT_CHANGE", "SOP_PUBLISH"];
  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 420px" }}>
      <section className="card">
        <div className="card-head">
          <h3>
            <Sparkles /> Mức tự chủ theo loại hành động
          </h3>
          <div className="sub">L0 chỉ đọc & đề xuất · L1 cần duyệt · L2 tự thực hiện danh sách tác vụ ít rủi ro do chủ hệ thống cấp. Gửi nội dung khách, đổi ca, xuất bản SOP tối đa L1.</div>
        </div>
        <div className="card-body">
          {POLICY_KEYS.map(([k, label]) => (
            <div key={k} className="list-item" style={{ alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                <b>{label}</b>
                <div className="tiny muted">{PROPOSAL_TYPE_LABEL[k] ?? k}</div>
              </span>
              <select className="select" style={{ width: 280 }} value={levels[k] ?? "L1"} disabled={!d.can_manage} onChange={(e) => setLevels({ ...levels, [k]: e.target.value })}>
                {["L0", "L1", "L2"].map((l) => (
                  <option key={l} value={l} disabled={l === "L2" && locked.includes(k)}>
                    {LEVEL_LABEL[l]}
                    {l === "L2" && locked.includes(k) ? " (không cho phép)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {d.can_manage && (
            <button className="btn btn-primary mt-12" disabled={busy} onClick={() => run(() => api("/settings/policies", { method: "PATCH", body: { ai_policy: { levels } } }), "Đã lưu chính sách AI.").then(reload)}>
              Lưu chính sách
            </button>
          )}
        </div>
      </section>
      <section className="card gold-head">
        <div className="card-head">
          <h3>
            <ShieldCheck /> Kiểm soát an toàn
          </h3>
        </div>
        <div className="card-body small stack" style={{ gap: 8 }}>
          <div>• Đầu ra AI có cấu trúc: tóm tắt, dữ kiện kèm nguồn, điểm chưa chắc chắn, hành động đề xuất. Máy chủ kiểm schema và quyền.</div>
          <div>• AI kế thừa phạm vi quyền người hỏi; không có quyền quản trị riêng.</div>
          <div>• Nội dung tin nhắn/tài liệu là dữ liệu, không nâng quyền hay thay chính sách.</div>
          <div>• Quyết định nhân sự, khiếu nại nghiêm trọng, chuyên môn PMU luôn chuyển người có thẩm quyền.</div>
          <div>• Duyệt có snapshot trước/sau, hạn duyệt, phiên bản; duyệt hai lần không thực thi hai lần.</div>
          {d.ai.configured ? (
            <div className="banner teal mt-8">
              <Info /> Bộ não trợ lý giao việc: Claude ({d.ai.model}). Đã dùng {d.ai.used}/{d.ai.budget} lượt trong 24 giờ; hết lượt tự chuyển chế độ quy tắc. Trang AI Assistant cũ vẫn chạy chế độ quy tắc có nguồn.
            </div>
          ) : (
            <div className="banner warn mt-8">
              <Info /> Chưa có khóa Claude (biến ANTHROPIC_API_KEY trên máy chủ). Trợ lý giao việc đang chạy chế độ quy tắc: {d.ai.engine}.
            </div>
          )}
          <Link href="/agents" className="btn btn-outline btn-sm mt-8" style={{ alignSelf: "flex-start" }}>
            Mở Trung tâm AI Agent
          </Link>
        </div>
      </section>
    </div>
  );
}

function Logs({ d, reload }: { d: any; reload: () => void }) {
  const q = useApi<any>(d.can_audit ? "/audit?limit=80" : null);
  const { run, busy } = useAction();
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h3>
            <Play /> Hàng đợi nhắc & gửi (outbox)
          </h3>
          <div className="sub">
            Đang chờ: {d.jobs.SCHEDULED ?? 0} · Chờ điều kiện: {d.jobs.WAITING ?? 0} · Bị chặn: {d.jobs.BLOCKED ?? 0} · Đã hủy: {d.jobs.CANCELLED ?? 0} · Xong: {d.jobs.DONE ?? 0}. Bản triển khai này không có tiến trình nền liên tục; bấm “Chạy hàng đợi đến hạn” để xử lý.
          </div>
          {d.can_integrations && (
            <div className="right">
              <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => run(() => api("/jobs/run-due", { body: {} }), (r: any) => r.message).then(() => (reload(), q.reload()))}>
                <Play /> Chạy hàng đợi đến hạn
              </button>
            </div>
          )}
        </div>
        {q.data && (
          <div className="card-body table-wrap">
            <table className="t cards" style={{ fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th>Thời điểm chạy</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {q.data.jobs.map((j: any) => (
                  <tr key={j.id}>
                    <td data-label="Chạy lúc">{fmtDateTime(j.run_at)}</td>
                    <td data-label="Loại">{j.type === "APPT_REMINDER" ? "Nhắc lịch hẹn" : "Điểm chạm chăm sóc"}</td>
                    <td data-label="Trạng thái">
                      <Badge tone={j.status === "SCHEDULED" ? "blue" : j.status === "BLOCKED" ? "red" : j.status === "WAITING" ? "gold" : j.status === "DONE" ? "green" : "gray"}>{j.status}</Badge>
                    </td>
                    <td data-label="Kết quả">{j.result ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head">
          <h3>
            <FileText /> Nhật ký hệ thống
          </h3>
          <div className="sub">Ai làm gì, lúc nào (giờ hệ thống thực). Không ghi token hay mật khẩu.</div>
        </div>
        <div className="card-body table-wrap">
          {!d.can_audit ? (
            <div className="muted">Vai trò hiện tại không có quyền xem nhật ký.</div>
          ) : (
            <table className="t cards" style={{ fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.events.map((e: any) => (
                  <tr key={e.id}>
                    <td data-label="Thời gian">{fmtDateTime(e.created_at)}</td>
                    <td data-label="Người">{e.actor_label}</td>
                    <td data-label="Hành động">
                      <code>{e.action}</code>
                    </td>
                    <td data-label="Đối tượng">{e.resource_type}</td>
                    <td data-label="Kết quả">
                      <Badge tone={e.result === "OK" ? "green" : "red"}>{e.result}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

