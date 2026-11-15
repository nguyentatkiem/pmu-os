// Định dạng thời gian theo Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè).
export const VN_OFFSET_MS = 7 * 3600 * 1000;

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));
const pad = (n: number) => String(n).padStart(2, "0");

/** Lấy các thành phần ngày giờ theo giờ Việt Nam */
export function vnParts(v: string | number | Date) {
  const d = new Date(toDate(v).getTime() + VN_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    dow: d.getUTCDay(), // 0 = Chủ nhật
  };
}

/** 'YYYY-MM-DD' theo giờ Việt Nam */
export function vnDayKey(v: string | number | Date) {
  const p = vnParts(v);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Chuyển 'YYYY-MM-DD' + 'HH:mm' (giờ Việt Nam) sang Date UTC */
export function vnToDate(day: string, time = "00:00") {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) - VN_OFFSET_MS);
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Thứ Hai của tuần chứa ngày */
export function weekStart(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(day, diff);
}

export function dowOfDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const WEEKDAY_LONG = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export function fmtDate(v?: string | number | Date | null) {
  if (!v) return "—";
  const p = vnParts(v);
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}
export function fmtDayKey(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
export function fmtShortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
export function fmtTime(v?: string | number | Date | null) {
  if (!v) return "—";
  const p = vnParts(v);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}
export function fmtDateTime(v?: string | number | Date | null) {
  if (!v) return "—";
  return `${fmtTime(v)} ${fmtDate(v)}`;
}
export function fmtDateTimeShort(v?: string | number | Date | null) {
  if (!v) return "—";
  return `${fmtDate(v)} ${fmtTime(v)}`;
}
export function fmtRange(a: string | Date, b: string | Date) {
  return `${fmtTime(a)} – ${fmtTime(b)}`;
}
export function fmtWeekday(v: string | number | Date) {
  return WEEKDAY_LONG[vnParts(v).dow];
}
export function relativeDay(v: string | number | Date, now: Date) {
  const a = vnDayKey(v);
  const b = vnDayKey(now);
  if (a === b) return "Hôm nay";
  if (a === addDays(b, -1)) return "Hôm qua";
  if (a === addDays(b, 1)) return "Ngày mai";
  return fmtDate(v);
}
export function pct(num: number, den: number, digits = 1) {
  if (!den) return null;
  const v = (num / den) * 100;
  return v.toFixed(digits).replace(".", ",").replace(/,0$/, "");
}
export function maskPhone(p?: string | null) {
  if (!p) return "Chưa có";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${digits.slice(0, 2)}•• ••• •${digits.slice(-2)}`;
}
export function normalizePhone(p?: string | null) {
  if (!p) return null;
  let d = p.replace(/\D/g, "");
  if (d.startsWith("84")) d = "0" + d.slice(2);
  return d.length >= 9 ? d : null;
}
export function minutesBetween(a: string | Date, b: string | Date) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000);
}
export function fmtMinutes(m: number) {
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}
