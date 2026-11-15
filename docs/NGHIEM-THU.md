# Nghiệm thu AC01–AC13 (15/11/2026)

Chạy: `BASE_URL=https://pmu-os-xi.vercel.app npm run test:ac` → **15/15 kiểm tra đạt** trên production (Neon PostgreSQL) và trên máy (PGlite).

| AC | Trạng thái | Cách kiểm |
| --- | --- | --- |
| AC01 Phạm vi tenant/chi nhánh | Đạt (tự động) | Doanh nghiệp B gọi API trực tiếp vào dữ liệu A → 404; Quản lý chi nhánh chọn chi nhánh khác → 403; Kỹ thuật viên không xem nhân sự, chỉ thấy khách trong lịch của mình; Quản trị hệ thống không xem khách |
| AC02 Giao việc end-to-end | Đạt (tự động) | Tạo → nhận → checklist → nộp → duyệt; nộp khi thiếu checklist 409; tự duyệt 403; tổng quan 25/21 |
| AC03 Đặt lịch trùng đồng thời | Đạt (tự động) | 2 request song song: 200 + 409 kèm gợi ý giờ trống (khóa advisory trong giao dịch) |
| AC04 Hủy/đổi lịch, chống lặp | Đạt (tự động) | Hủy lịch vô hiệu nhắc chưa gửi; webhook cùng external_event_id lần 2 bị bỏ qua; nhắc việc lặp trong giờ không gửi lại |
| AC05 AI có nguồn | Đạt (tự động) | SOP trả lời kèm “SOP … v1.2, mục 2”; hỏi doanh thu → chưa đủ dữ liệu; yêu cầu “bỏ qua chính sách” → từ chối; nội dung bản nháp không được dùng |
| AC06 Duyệt hai lần | Đạt (tự động) | 2 lệnh duyệt song song chỉ 1 lần thực thi; dữ liệu gốc đổi → đề xuất bị trả lại, không thực thi |
| AC07 Rút đồng ý / mất kết nối | Đạt (tự động) | Rút đồng ý dừng job chưa chạy; duyệt gửi bị chặn, không gửi |
| AC08 Bộ số demo & bộ lọc | Đạt (tự động) | 8/24/20/3/1; chi nhánh không có dữ liệu → KPI “Chưa đủ dữ liệu” |
| AC09 Secret | Đạt một phần | API cài đặt không trả secret; chuỗi kết nối chỉ ở biến môi trường máy chủ. Chưa có kho tệp riêng tư (đính kèm đang khóa) |
| AC10 Bàn phím & responsive | Kiểm thủ công một phần | Đã xem 375px và 1536px; modal giữ focus, Esc đóng; chưa kiểm đủ 768/1920 và trình đọc màn hình |
| AC11 Zalo chưa kết nối | Đạt (tự động) | Gửi trực tiếp → 503; duyệt gửi → BLOCKED, tin “Chưa gửi — kênh chưa kết nối” |
| AC12 Báo cáo có nguồn | Đạt (tự động) | Có mốc dữ liệu, nguồn, mục “Các điểm còn chưa chắc chắn”, không đưa quyết định nhân sự |
| AC13 Backup/rollback/giám sát | **Chưa làm** | Cần môi trường thử + quy trình khôi phục Neon; chưa có giám sát lỗi hàng đợi/API |

## Giới hạn đã biết

- AI chạy chế độ quy tắc có nguồn, chưa nối nhà cung cấp mô hình (chờ chốt nhà cung cấp/ngân sách).
- Không có tiến trình nền liên tục trên Vercel: nhắc lịch/chăm sóc xử lý khi bấm “Chạy hàng đợi đến hạn”.
- Chưa cấu hình gửi email (mời thành viên, quên mật khẩu báo rõ là chưa gửi).
- Repo Zalo chưa được cung cấp → adapter DEMO.
