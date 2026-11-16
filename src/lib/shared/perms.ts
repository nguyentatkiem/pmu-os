import type { Role } from "./labels";

// Ma trận quyền theo module × hành động. Server là nơi kiểm tra; client chỉ dùng để ẩn/hiện.
export const PERMISSIONS: { key: string; module: string; label: string }[] = [
  { key: "dashboard.view", module: "Tổng quan", label: "Xem tổng quan điều hành" },
  { key: "people.view", module: "Nhân sự", label: "Xem danh sách & hồ sơ nhân sự" },
  { key: "people.manage", module: "Nhân sự", label: "Thêm/sửa hồ sơ, mời, ngừng truy cập" },
  { key: "shifts.view_all", module: "Lịch làm việc", label: "Xem lịch toàn chi nhánh" },
  { key: "shifts.manage", module: "Lịch làm việc", label: "Tạo/đổi ca, gửi đề xuất" },
  { key: "shifts.approve", module: "Lịch làm việc", label: "Duyệt đề xuất ca" },
  { key: "tasks.view_all", module: "Công việc", label: "Xem toàn bộ công việc chi nhánh" },
  { key: "tasks.create", module: "Công việc", label: "Tạo & giao việc" },
  { key: "tasks.review", module: "Công việc", label: "Duyệt kết quả / yêu cầu làm lại" },
  { key: "performance.view_all", module: "KPI", label: "Xem KPI toàn đội" },
  { key: "performance.export", module: "KPI", label: "Xuất báo cáo KPI" },
  { key: "knowledge.view", module: "SOP & đào tạo", label: "Đọc SOP đã xuất bản" },
  { key: "knowledge.draft", module: "SOP & đào tạo", label: "Tạo/sửa bản nháp SOP" },
  { key: "knowledge.publish", module: "SOP & đào tạo", label: "Duyệt xuất bản SOP" },
  { key: "training.assign", module: "SOP & đào tạo", label: "Giao bài học, đánh giá bài kiểm tra" },
  { key: "customers.view_all", module: "Khách hàng", label: "Xem toàn bộ khách chi nhánh" },
  { key: "customers.view_assigned", module: "Khách hàng", label: "Xem khách được phân công" },
  { key: "customers.view_sensitive", module: "Khách hàng", label: "Xem ghi chú, hội thoại, phản hồi" },
  { key: "customers.create", module: "Khách hàng", label: "Tạo khách hàng" },
  { key: "customers.edit", module: "Khách hàng", label: "Sửa, phân công, phân loại, đồng ý liên hệ" },
  { key: "contact.reveal", module: "Khách hàng", label: "Xem số liên hệ đầy đủ" },
  { key: "inbox.view", module: "Hội thoại", label: "Xem hội thoại" },
  { key: "inbox.reply", module: "Hội thoại", label: "Soạn trả lời, gửi phê duyệt" },
  { key: "appointments.view_all", module: "Lịch hẹn", label: "Xem toàn bộ lịch hẹn" },
  { key: "appointments.manage", module: "Lịch hẹn", label: "Tạo/đổi/hủy, xác nhận, check-in" },
  { key: "care.view", module: "Chăm sóc", label: "Xem kế hoạch chăm sóc" },
  { key: "care.manage", module: "Chăm sóc", label: "Tạo kế hoạch, ghi nhận liên hệ" },
  { key: "reports.view", module: "Báo cáo", label: "Xem báo cáo" },
  { key: "reports.manage", module: "Báo cáo", label: "Tạo & xuất báo cáo" },
  { key: "reports.approve", module: "Báo cáo", label: "Duyệt báo cáo" },
  { key: "assistant.use", module: "AI Assistant", label: "Hỏi AI trong phạm vi quyền" },
  { key: "marketing.view", module: "Marketing", label: "Xem hệ thống marketing, phễu, kênh, lô video" },
  { key: "marketing.manage", module: "Marketing", label: "Quản lý kênh, lô video, đề xuất xây kênh" },
  { key: "marketing.review", module: "Marketing", label: "Kiểm duyệt video trước khi đăng" },
  { key: "approvals.view", module: "Phê duyệt", label: "Xem hộp phê duyệt" },
  { key: "approvals.decide", module: "Phê duyệt", label: "Duyệt / từ chối đề xuất" },
  { key: "settings.view", module: "Cài đặt", label: "Xem cài đặt" },
  { key: "settings.manage", module: "Cài đặt", label: "Sửa doanh nghiệp, chi nhánh, dịch vụ, chính sách" },
  { key: "permissions.manage", module: "Cài đặt", label: "Sửa ma trận quyền" },
  { key: "integrations.manage", module: "Cài đặt", label: "Kiểm tra / ngắt tích hợp, chạy hàng đợi" },
  { key: "audit.view", module: "Cài đặt", label: "Xem nhật ký hệ thống" },
];

const ALL = PERMISSIONS.map((p) => p.key);
const MANAGER = ALL.filter(
  (k) => !["settings.view", "settings.manage", "permissions.manage", "integrations.manage", "audit.view"].includes(k),
);

export const DEFAULT_MATRIX: Record<Role, string[]> = {
  OWNER: ALL,
  BRANCH_MANAGER: MANAGER,
  CONSULTANT: [
    "knowledge.view",
    "customers.view_assigned",
    "customers.view_sensitive",
    "customers.create",
    "customers.edit",
    "contact.reveal",
    "inbox.view",
    "inbox.reply",
    "appointments.view_all",
    "appointments.manage",
    "care.view",
    "assistant.use",
  ],
  CUSTOMER_CARE: [
    "knowledge.view",
    "customers.view_assigned",
    "customers.view_sensitive",
    "customers.edit",
    "contact.reveal",
    "inbox.view",
    "inbox.reply",
    "appointments.view_all",
    "appointments.manage",
    "care.view",
    "care.manage",
    "assistant.use",
  ],
  TECHNICIAN: ["knowledge.view", "assistant.use"],
  RECEPTION: [
    "knowledge.view",
    "customers.view_all",
    "customers.create",
    "contact.reveal",
    "appointments.view_all",
    "appointments.manage",
    "assistant.use",
  ],
  SYSTEM_ADMIN: ["settings.view", "settings.manage", "integrations.manage", "audit.view"],
};

export type PermissionOverrides = Partial<Record<Role, Record<string, boolean>>>;

export function resolvePerms(role: Role, overrides?: PermissionOverrides): Set<string> {
  const base = new Set(DEFAULT_MATRIX[role] ?? []);
  if (role === "OWNER") return base; // Chủ doanh nghiệp luôn đủ quyền, không chỉnh được
  const o = overrides?.[role];
  if (o) for (const [k, v] of Object.entries(o)) v ? base.add(k) : base.delete(k);
  return base;
}
