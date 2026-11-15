export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field_errors?: Record<string, string>,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const bad = (message: string, field_errors?: Record<string, string>) =>
  new ApiError(400, "VALIDATION", message, field_errors);
export const unauthorized = (message = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.") =>
  new ApiError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Không tìm thấy dữ liệu trong phạm vi của bạn.") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string, extra?: Record<string, unknown>) =>
  new ApiError(409, "CONFLICT", message, undefined, extra);
export const tooMany = (message = "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.") =>
  new ApiError(429, "RATE_LIMITED", message);
export const unavailable = (message: string, extra?: Record<string, unknown>) =>
  new ApiError(503, "SERVICE_UNAVAILABLE", message, undefined, extra);

/** Kiểm tra trường bắt buộc, trả lỗi tại trường */
export function requireFields(body: any, fields: Record<string, string>) {
  const fe: Record<string, string> = {};
  for (const [k, label] of Object.entries(fields)) {
    const v = body?.[k];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) fe[k] = `${label} là bắt buộc`;
  }
  if (Object.keys(fe).length) throw bad("Vui lòng kiểm tra lại các trường được đánh dấu.", fe);
}

export function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function parseIso(v: unknown, label: string, field: string): Date {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) throw bad(`${label} không hợp lệ`, { [field]: `${label} không hợp lệ` });
  return d;
}

/** Khoá phiên bản lạc quan: PATCH phải gửi expected_version */
export function checkVersion(current: number, expected: unknown) {
  if (expected === undefined || expected === null) return;
  if (Number(expected) !== Number(current))
    throw conflict("Dữ liệu đã được người khác cập nhật. Vui lòng tải lại trước khi lưu.", {
      current_version: current,
    });
}
