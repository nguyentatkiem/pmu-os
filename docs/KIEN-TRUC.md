# Kiến trúc & quyết định triển khai

## Quyết định (đề xuất triển khai, không phải yêu cầu gốc)

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Next.js 16 + React 19 + TypeScript, một dự án cho cả giao diện và API | Đúng gợi ý mục 10 của bản mô tả; triển khai một lệnh trên Vercel |
| 2 | PostgreSQL (Neon) khi chạy thật, PGlite khi chạy máy cá nhân | Cùng một bộ SQL, không cần Docker |
| 3 | Mỗi lượt “Khám phá bản demo” tạo một doanh nghiệp demo riêng | Tách dữ liệu giữa người xem; minh họa tenancy (AC01); tự xóa sau 3 ngày không dùng |
| 4 | Đồng hồ demo bắt đầu 17:30 ngày 15/11/2026 và chạy theo thời gian thực | Bộ số 8/24/20/3/1 luôn khớp đặc tả lúc mở demo |
| 5 | AI chế độ quy tắc có nguồn | Chưa chốt nhà cung cấp/ngân sách AI (mục 14); đảm bảo trả lời có nguồn, không bịa |
| 6 | Không có tiến trình nền liên tục trên Vercel | Hàng đợi nhắc chạy bằng nút “Chạy hàng đợi đến hạn” (Cài đặt → Nhật ký) |

## Ánh xạ UI-01 → UI-16

| UI | Route | File |
| --- | --- | --- |
| UI-01 Tổng quan điều hành | `/dashboard` | `src/app/(app)/dashboard/page.tsx` |
| UI-02 Nhân sự & hồ sơ | `/people` | `src/app/(app)/people/page.tsx` |
| UI-03 Lịch làm việc | `/shifts` | `src/app/(app)/shifts/page.tsx` |
| UI-04 Công việc & checklist | `/tasks` | `src/app/(app)/tasks/page.tsx` |
| UI-05 KPI & hỗ trợ nhân sự | `/performance` | `src/app/(app)/performance/page.tsx` |
| UI-06 SOP & đào tạo | `/knowledge` | `src/app/(app)/knowledge/page.tsx` |
| UI-07 Khách hàng & hành trình | `/customers` | `src/app/(app)/customers/page.tsx` |
| UI-08 Hồ sơ khách hàng | `/customers/:id` | `src/app/(app)/customers/[id]/page.tsx` |
| UI-09 Hội thoại & Zalo | `/inbox` | `src/app/(app)/inbox/page.tsx` |
| UI-10 Lịch hẹn khách hàng | `/appointments` | `src/app/(app)/appointments/page.tsx` |
| UI-11 Chăm sóc sau dịch vụ | `/care` | `src/app/(app)/care/page.tsx` |
| UI-12 Báo cáo điều hành | `/reports` | `src/app/(app)/reports/page.tsx` |
| UI-13 AI Executive Assistant | `/assistant` | `src/app/(app)/assistant/page.tsx` |
| UI-14 Phê duyệt & lịch sử AI | `/approvals` | `src/app/(app)/approvals/page.tsx` |
| UI-15 Cài đặt & tích hợp | `/settings` | `src/app/(app)/settings/page.tsx` |
| UI-16 Đăng nhập | `/login` | `src/app/login/page.tsx` |

## Dữ liệu

Bảng nghiệp vụ có `id` UUID, `tenant_id`, `created_at`, `updated_at`, `version`; mốc thời gian lưu UTC, hiển thị Asia/Ho_Chi_Minh.
`tenant_id` lấy từ phiên, không nhận từ client. Danh sách bảng: `db/migrations/001_init.sql`.

## Kiểm soát AI & thực thi

- Đầu ra AI có cấu trúc: `summary`, `facts[{text, source}]`, `uncertainties[]`, `proposed_actions[]`.
- Mức tự chủ L0/L1/L2 theo loại hành động; gửi nội dung khách, đổi ca, xuất bản SOP tối đa L1.
- Duyệt: khóa dòng `FOR UPDATE`, kiểm hạn, kiểm phiên bản đối tượng, `executions.idempotency_key UNIQUE` → duyệt hai lần không thực thi hai lần.
- Chống nhận lặp: `messages.external_event_id` duy nhất theo doanh nghiệp; nhắc lịch có `dedupe_key`.
- Hủy/đổi lịch hủy các lượt nhắc chưa gửi; rút đồng ý dừng các lượt chưa chạy.

## Zalo

Repo Zalo chưa được cung cấp nên chưa kiểm README/license/xác thực/API. Hệ thống dùng `DemoZaloAdapter` (NOT_CONNECTED),
không gửi thật, không hiển thị “Đã gửi” giả. Khi có repo: viết adapter LIVE theo hợp đồng `capabilities / health /
listConversations / receiveEvent / sendMessage / getDeliveryStatus`, secret chỉ đọc ở máy chủ.
