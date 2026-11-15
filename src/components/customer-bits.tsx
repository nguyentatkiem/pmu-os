"use client";
import { useState } from "react";
import { Flame, Link2, SlidersHorizontal, Snowflake, Sparkles, Target } from "lucide-react";
import { api, useApi } from "@/lib/client/api";
import { Badge, Field, Modal, fe, useAction } from "@/components/ui";
import { READINESS_DESC, READINESS_LABEL } from "@/lib/shared/labels";

export const READY_TONE: Record<string, string> = { HOT: "red", WARM: "gold", COLD: "blue" };
export const ReadyIcon = ({ r }: { r: string }) => (r === "COLD" ? <Snowflake /> : <Flame />);

export function AiSuggest({ c, canEdit, onDone }: { c: any; canEdit: boolean; onDone: () => void }) {
  const q = useApi<any>(`/customers/${c.id}/ai-readiness`, [c.id]);
  const [adjust, setAdjust] = useState(false);
  const s = q.data;
  return (
    <aside className="card gold-head">
      <div className="card-head">
        <h2>
          <Sparkles /> Đề xuất AI
        </h2>
        <div className="sub">
          Phân loại khách hàng: <b style={{ color: "var(--text)" }}>{c.display_name}</b>
        </div>
      </div>
      <div className="card-body stack" style={{ gap: 12 }}>
        {!s ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (
          <>
            <div className={`banner ${s.readiness === "HOT" ? "danger" : s.readiness === "WARM" ? "warn" : "info"}`} style={{ alignItems: "center" }}>
              <span style={{ fontSize: 30 }}>
                <ReadyIcon r={s.readiness} />
              </span>
              <div>
                Đề xuất mức sẵn sàng:
                <div>
                  <Badge tone={READY_TONE[s.readiness]}>
                    <b style={{ fontSize: 17 }}>{s.label}</b>
                  </Badge>
                </div>
              </div>
            </div>
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <Target size={20} color="var(--primary)" style={{ flex: "none" }} />
              <div>
                <b>Lý do đề xuất:</b>
                <div className="small muted">{s.reason}</div>
              </div>
            </div>
            <div className="row">
              <Link2 size={18} color="var(--primary)" /> <b>Mức độ tin cậy:</b> <Badge tone="gold">{s.confidence_text}</Badge>
            </div>
            <div className="tiny muted">{s.note}</div>
            {canEdit && (
              <button className="btn btn-dark btn-lg btn-block" onClick={() => setAdjust(true)}>
                <SlidersHorizontal /> Điều chỉnh
              </button>
            )}
          </>
        )}
      </div>
      {adjust && s && <ReadinessModal c={c} suggestion={s} onClose={() => setAdjust(false)} onDone={() => (setAdjust(false), onDone(), q.reload())} />}
    </aside>
  );
}

export function ReadinessModal({ c, suggestion, onClose, onDone }: { c: any; suggestion?: any; onClose: () => void; onDone: () => void }) {
  const [r, setR] = useState<string>(suggestion?.readiness ?? c.readiness ?? "WARM");
  const [reason, setReason] = useState<string>(suggestion?.reason ?? c.readiness_reason ?? "");
  const [err, setErr] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Modal
      title={`Xác nhận mức sẵn sàng · ${c.display_name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setErr(null);
              try {
                await api(`/customers/${c.id}/readiness`, { body: { readiness: r, reason } });
                onDone();
              } catch (e) {
                setErr(e);
              }
            }}
          >
            Lưu phân loại
          </button>
        </>
      }
    >
      <div className="seg">
        {(["HOT", "WARM", "COLD"] as const).map((k) => (
          <button key={k} className={r === k ? "on" : ""} onClick={() => setR(k)}>
            <ReadyIcon r={k} /> {READINESS_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="small muted mt-8">{READINESS_DESC[r]}</div>
      <Field label="Lý do" req error={fe(err, "reason")} className="mt-12">
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="tiny muted mt-8">Lưu lại người cập nhật và thời điểm; có thể sửa bất cứ lúc nào.</div>

    </Modal>
  );
}

