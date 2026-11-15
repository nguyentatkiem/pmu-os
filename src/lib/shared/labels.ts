// Nhãn hiển thị dùng chung cho client và server
export const ROLES = [
  "OWNER",
  "BRANCH_MANAGER",
  "CONSULTANT",
  "CUSTOMER_CARE",
  "TECHNICIAN",
  "RECEPTION",
  "SYSTEM_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Chủ doanh nghiệp",
  BRANCH_MANAGER: "Quản lý chi nhánh",
  CONSULTANT: "Tư vấn",
  CUSTOMER_CARE: "Chăm sóc khách hàng",
  TECHNICIAN: "Kỹ thuật viên",
  RECEPTION: "Lễ tân",
  SYSTEM_ADMIN: "Quản trị hệ thống",
};

export const POSITION_LABEL: Record<string, string> = {
  MANAGER: "Quản lý",
  CONSULTANT: "Tư vấn",
  TECHNICIAN: "Kỹ thuật viên",
  CUSTOMER_CARE: "Chăm sóc khách hàng",
  RECEPTION: "Lễ tân",
};
export const POSITION_TO_ROLE: Record<string, Role> = {
  MANAGER: "BRANCH_MANAGER",
  CONSULTANT: "CONSULTANT",
  TECHNICIAN: "TECHNICIAN",
  CUSTOMER_CARE: "CUSTOMER_CARE",
  RECEPTION: "RECEPTION",
};

export const WORK_STATUS_LABEL: Record<string, string> = {
  WORKING: "Đang làm việc",
  AVAILABLE: "Sẵn sàng",
  ON_LEAVE: "Nghỉ phép",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "Cần làm",
  IN_PROGRESS: "Đang thực hiện",
  SUBMITTED: "Chờ duyệt",
  DONE: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao" };

export const STAGES = [
  "Quan tâm",
  "Tư vấn",
  "Đặt lịch",
  "Đến doanh nghiệp",
  "Sử dụng dịch vụ",
  "Chăm sóc sau dịch vụ",
  "Lịch dặm/kiểm tra",
  "Quay lại/giới thiệu",
];
export const STAGE_SHORT = [
  "Quan tâm",
  "Tư vấn",
  "Đặt lịch",
  "Đến doanh nghiệp",
  "Sử dụng dịch vụ",
  "Chăm sóc",
  "Dặm/kiểm tra",
  "Quay lại/giới thiệu",
];

export const READINESS_LABEL: Record<string, string> = { HOT: "Nóng", WARM: "Ấm", COLD: "Lạnh" };
export const READINESS_DESC: Record<string, string> = {
  HOT: "Sẵn sàng đặt lịch, nên ưu tiên liên hệ theo mốc đã cấu hình.",
  WARM: "Đã quan tâm, đang cân nhắc, cần tư vấn thêm.",
  COLD: "Mới tìm hiểu, chưa rõ nhu cầu, cần cung cấp thêm thông tin.",
};

export const APPT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  ARRIVED: "Đã đến",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  NO_SHOW: "Không đến",
};

export const TOUCHPOINT_STATUS_LABEL: Record<string, string> = {
  PLANNED: "Theo lịch",
  TO_CONTACT: "Cần liên hệ",
  WAITING_REPLY: "Chờ phản hồi",
  DONE: "Hoàn tất",
  PAUSED: "Tạm dừng",
};

export const CONV_STATUS_LABEL: Record<string, string> = { NEW: "Chưa xử lý", OPEN: "Đang xử lý", DONE: "Đã hoàn thành" };

export const DELIVERY_LABEL: Record<string, string> = {
  received: "Đã nhận",
  recorded: "Ghi nhận thủ công (gửi ngoài hệ thống)",
  draft: "Bản nháp",
  not_sent: "Chưa gửi — kênh chưa kết nối",
  pending: "Đang gửi",
  sent: "Đã gửi",
  delivered: "Đã nhận",
  failed: "Lỗi gửi",
  unknown: "Chưa rõ trạng thái",
};

export const PROPOSAL_TYPE_LABEL: Record<string, string> = {
  SHIFT_REASSIGN: "Đổi ca",
  SHIFT_CREATE: "Bổ sung ca",
  SHIFT_ADJUST: "Điều chỉnh ca trùng",
  TASK_ASSIGN: "Giao việc",
  CUSTOMER_MESSAGE: "Nội dung gửi khách",
  CARE_MESSAGE: "Nội dung chăm sóc",
  SOP_PUBLISH: "Xuất bản SOP",
};
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  RETURNED: "Trả chỉnh sửa",
  REJECTED: "Từ chối",
  EXPIRED: "Hết hạn",
  APPROVED: "Đã duyệt",
  EXECUTED: "Đã thực hiện",
  FAILED: "Thực thi lỗi",
  CANCELLED: "Đã hủy",
};

export const SOP_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_APPROVAL: "Chờ duyệt xuất bản",
  PUBLISHED: "Đã xuất bản",
  ARCHIVED: "Lưu trữ",
};

export const CONSENT_PURPOSE_LABEL: Record<string, string> = { CARE: "Liên hệ chăm sóc", MARKETING: "Tiếp thị" };
export const CONSENT_STATUS_LABEL: Record<string, string> = {
  GRANTED: "Đã đồng ý",
  DENIED: "Chưa đồng ý",
  REVOKED: "Đã rút đồng ý",
};
export const RATING_LABEL: Record<string, string> = {
  VERY_GOOD: "Rất tốt",
  GOOD: "Tốt",
  NEUTRAL: "Bình thường",
  BAD: "Chưa hài lòng",
};
