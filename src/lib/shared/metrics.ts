// Định nghĩa chỉ số: hiển thị tử số, mẫu số, cửa sổ, loại trừ và nguồn. Mẫu số 0 => "Chưa đủ dữ liệu".
export interface MetricDef {
  code: string;
  label: string;
  desc: string;
  numerator: string;
  denominator: string;
  window: string;
  exclusions: string;
  sources: string[];
  unit: "ratio" | "minutes";
  note?: string;
}

export const METRIC_DEFS: Record<string, MetricDef> = {
  task_progress: {
    code: "task_progress",
    label: "Tiến độ công việc",
    desc: "Công việc đã hoàn thành trong các việc có hạn trong kỳ",
    numerator: "Số công việc DONE có hạn trong kỳ",
    denominator: "Số công việc có hạn trong kỳ (trừ đã hủy)",
    window: "Theo hạn hoàn thành (due_at) trong kỳ đã chọn",
    exclusions: "Công việc đã hủy",
    sources: ["Công việc"],
    unit: "ratio",
  },
  task_ontime: {
    code: "task_ontime",
    label: "Hoàn thành đúng hạn",
    desc: "Công việc hoàn thành trước hoặc đúng hạn",
    numerator: "Công việc DONE có completed_at ≤ due_at",
    denominator: "Công việc DONE có hạn trong kỳ",
    window: "Theo hạn hoàn thành trong kỳ",
    exclusions: "Công việc chưa xong, đã hủy",
    sources: ["Công việc"],
    unit: "ratio",
  },
  checklist: {
    code: "checklist",
    label: "Tuân thủ checklist",
    desc: "Mục bắt buộc đã hoàn tất theo quy trình",
    numerator: "Số mục bắt buộc đã hoàn tất",
    denominator: "Số mục bắt buộc được giao trong các việc có hạn trong kỳ",
    window: "Theo hạn hoàn thành của công việc",
    exclusions: "Mục không bắt buộc; công việc đã hủy",
    sources: ["Công việc", "Checklist"],
    unit: "ratio",
    note: "Không thay thế đánh giá chất lượng chuyên môn.",
  },
  response_time: {
    code: "response_time",
    label: "Tốc độ phản hồi",
    desc: "Trung vị thời gian từ tin nhắn đến tới phản hồi đầu tiên",
    numerator: "Trung vị (median) số phút",
    denominator: "Số mẫu (cặp tin đến – phản hồi đầu tiên)",
    window: "Tin đến trong kỳ, hội thoại được phân công",
    exclusions: "Tin chưa được trả lời. Quy tắc ngoài giờ và tin rác chưa được cấu hình.",
    sources: ["Hội thoại"],
    unit: "minutes",
  },
  booking_rate: {
    code: "booking_rate",
    label: "Tỷ lệ đặt lịch",
    desc: "Khách được tư vấn có lịch hẹn tạo trong cửa sổ quy đổi",
    numerator: "Khách duy nhất được tư vấn trong kỳ có lịch tạo trong 7 ngày sau tư vấn",
    denominator: "Khách duy nhất được tư vấn trong kỳ",
    window: "Cohort theo ngày tư vấn; cửa sổ quy đổi 7 ngày",
    exclusions: "Loại trùng theo mã khách",
    sources: ["Hội thoại", "Hồ sơ khách", "Lịch hẹn"],
    unit: "ratio",
  },
  confirm_rate: {
    code: "confirm_rate",
    label: "Lịch xác nhận",
    desc: "Lịch hẹn đã xác nhận trong các lịch còn hiệu lực",
    numerator: "Lịch Đã xác nhận / Đã đến / Hoàn thành",
    denominator: "Lịch còn hiệu lực có ngày hẹn trong kỳ",
    window: "Theo ngày hẹn trong kỳ",
    exclusions: "Lịch đã hủy. Thiếu trạng thái không được coi là đã xác nhận.",
    sources: ["Lịch hẹn"],
    unit: "ratio",
  },
  care_ontime: {
    code: "care_ontime",
    label: "Chăm sóc đúng hạn",
    desc: "Điểm chạm chăm sóc đã liên hệ trước hoặc đúng hạn",
    numerator: "Điểm chạm đã liên hệ trước/đúng hạn",
    denominator: "Điểm chạm đến hạn trong kỳ",
    window: "Theo hạn điểm chạm trong kỳ (đến thời điểm hiện tại)",
    exclusions: "Điểm chạm tạm dừng hoặc chưa đến hạn",
    sources: ["Chăm sóc"],
    unit: "ratio",
  },
  feedback_positive: {
    code: "feedback_positive",
    label: "Phản hồi khách hàng",
    desc: "Phản hồi đánh giá Tốt hoặc Rất tốt",
    numerator: "Phản hồi Tốt/Rất tốt",
    denominator: "Phản hồi có đánh giá cho lịch do nhân sự thực hiện",
    window: "Theo thời điểm ghi nhận phản hồi trong kỳ",
    exclusions: "Phản hồi không có đánh giá",
    sources: ["Phản hồi", "Lịch hẹn"],
    unit: "ratio",
  },
  learning: {
    code: "learning",
    label: "Hoàn thành đào tạo SOP",
    desc: "Bài học SOP đã làm bài kiểm tra",
    numerator: "Bài học đã nộp hoặc đã đánh giá",
    denominator: "Bài học được giao",
    window: "Tất cả bài học đang hiệu lực",
    exclusions: "Không",
    sources: ["SOP & đào tạo"],
    unit: "ratio",
  },
  team_progress: {
    code: "team_progress",
    label: "Tiến độ đội",
    desc: "Công việc toàn chi nhánh đã hoàn thành",
    numerator: "Công việc DONE có hạn trong kỳ",
    denominator: "Công việc có hạn trong kỳ (trừ đã hủy)",
    window: "Theo hạn hoàn thành trong kỳ",
    exclusions: "Công việc đã hủy",
    sources: ["Công việc"],
    unit: "ratio",
  },
  issues_resolved: {
    code: "issues_resolved",
    label: "Xử lý vấn đề",
    desc: "Phản hồi/vấn đề phát sinh đã được xử lý",
    numerator: "Phản hồi đã xử lý",
    denominator: "Phản hồi phát sinh trong kỳ",
    window: "Theo thời điểm ghi nhận trong kỳ",
    exclusions: "Không",
    sources: ["Phản hồi"],
    unit: "ratio",
  },
};

export const ROLE_METRICS: Record<string, string[]> = {
  CONSULTANT: ["task_progress", "response_time", "booking_rate", "checklist"],
  TECHNICIAN: ["task_progress", "checklist", "feedback_positive", "learning"],
  CUSTOMER_CARE: ["confirm_rate", "care_ontime", "task_ontime", "response_time"],
  MANAGER: ["team_progress", "issues_resolved", "task_ontime", "checklist"],
  RECEPTION: ["task_ontime", "checklist", "confirm_rate", "learning"],
};
