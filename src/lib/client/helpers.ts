import { fmtTime, vnParts } from "../shared/format";

export function shiftLabel(s: { start_at: string; end_at: string }) {
  const a = fmtTime(s.start_at);
  const b = fmtTime(s.end_at);
  if (a === "08:00" && b === "12:00") return "Sáng";
  if (a === "13:00" && b === "17:00") return "Chiều";
  return `${a}–${b}`;
}

export function slotOf(s: { start_at: string }) {
  return vnParts(s.start_at).hh < 12 ? "Sáng" : "Chiều";
}

export const POSITION_TONE: Record<string, string> = {
  MANAGER: "gold",
  CONSULTANT: "teal",
  TECHNICIAN: "blue",
  CUSTOMER_CARE: "green",
  RECEPTION: "red",
};

export function qs(params: Record<string, string | number | null | undefined>) {
  const s = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
}

/** Chuyển input datetime-local (giờ VN) sang ISO */
export function localInputToIso(v: string) {
  if (!v) return "";
  const [d, t] = v.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, dd, hh, mm) - 7 * 3600000).toISOString();
}
export function isoToLocalInput(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600000);
  return d.toISOString().slice(0, 16);
}
