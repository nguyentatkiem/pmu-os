# Nghiệm thu AC01–AC13 + AG01–AG10 (16/11/2026)

Chạy: `BASE_URL=https://pmu-os-xi.vercel.app npm run test:ac` → **15/15 kiểm tra đạt** trên production (Neon PostgreSQL) và trên máy (PGlite).

| AC | Trạng thái | Cách kiểm |
| --- | --- | --- |
| AC01 Phạm vi tenant/chi nhánh | Đạt (tự động) | Doanh nghiệp B gọi API trực tiếp vào dữ liệu A → 404; Quản lý chi nhánh chọn chi nhánh khác → 403; Kỹ thuật viên không xem nhân sự, chỉ thấy khách trong lịch của mình; Quản trị hệ thống không xem khách |
| AC02 Giao việc end-to-end | Đạt (tự động) | Tạo → nhận → checklist → nộp → duyệt; nộp khi thiếu checklist 409; tự duyệt 403; tổng quan tăng đúng +1 việc, +1 hoàn thành |
| AC03 Đặt lịch trùng đồng thời | Đạt (tự động) | 2 request song song: 200 + 409 kèm gợi ý giờ trống (khóa advisory trong giao dịch) |
| AC04 Hủy/đổi lịch, chống lặp | Đạt (tự động) | Hủy lịch vô hiệu nhắc chưa gửi; webhook cùng external_event_id lần 2 bị bỏ qua; nhắc việc lặp trong giờ không gửi lại |
| AC05 AI có nguồn | Đạt (tự động) | SOP trả lời kèm “SOP … v1.2, mục 2”; hỏi doanh thu → chưa đủ dữ liệu; yêu cầu “bỏ qua chính sách” → từ chối; nội dung bản nháp không được dùng |
| AC06 Duyệt hai lần | Đạt (tự động) | 2 lệnh duyệt song song chỉ 1 lần thực thi; dữ liệu gốc đổi → đề xuất bị trả lại, không thực thi |
| AC07 Rút đồng ý / mất kết nối | Đạt (tự động) | Rút đồng ý dừng job chưa chạy; duyệt gửi bị chặn, không gửi |
| AC08 Bộ số demo & bộ lọc | Đạt (tự động) | Theo yêu cầu của chủ doanh nghiệp ngày 15/11, bộ số cố định 8/24/20/3/1 được thay bằng bộ dữ liệu dày (22 nhân sự, 2 chi nhánh). Kiểm: số việc tự khớp, lọc chi nhánh làm đổi KPI |
| AC09 Secret | Đạt một phần | API cài đặt không trả secret; chuỗi kết nối chỉ ở biến môi trường máy chủ. Chưa có kho tệp riêng tư (đính kèm đang khóa) |
| AC10 Bàn phím & responsive | Kiểm thủ công một phần | Đã xem 375px và 1536px; modal giữ focus, Esc đóng; chưa kiểm đủ 768/1920 và trình đọc màn hình |
| AC11 Zalo chưa kết nối | Đạt (tự động) | Gửi trực tiếp → 503; duyệt gửi → BLOCKED, tin “Chưa gửi — kênh chưa kết nối” |
| AC12 Báo cáo có nguồn | Đạt (tự động) | Có mốc dữ liệu, nguồn, mục “Các điểm còn chưa chắc chắn”, không đưa quyết định nhân sự |
| AC13 Backup/rollback/giám sát | **Chưa làm** | Cần môi trường thử + quy trình khôi phục Neon; chưa có giám sát lỗi hàng đợi/API |

## Hệ AI Agent (bổ sung theo yêu cầu 15/11/2026)

| Mã | Nội dung | Cách kiểm |
| --- | --- | --- |
| AG01 | Agent chạy, có tra Bộ não, không tạo đề xuất trùng | Chạy Agent CSKH 2 lần: lần 2 không có đề xuất mới; Agent Nhân sự tối đa 6 đề xuất ca/lượt |
| AG02 | Dừng khẩn cấp | Khi dừng: agent SKIPPED, chat không giao việc; bật lại chạy bình thường |
| AG03 | Chat giao việc | “Giao Nguyễn Thị Lan …” → đề xuất TASK_ASSIGN chờ duyệt đúng người, chưa tạo việc thật |
| AG04 | Phân quyền agent | Kỹ thuật viên gọi chạy agent / Bộ não / luồng agent → 403 |
| AG05 | Bộ não chỉ dùng mục đã duyệt | Bài học chờ duyệt không xuất hiện khi tra; duyệt xong mới xuất hiện |
| AG06 | 20 hội thoại Zalo mô phỏng | 11 trả lời agent soạn đã được duyệt, 7 bản soạn sẵn chờ duyệt, 2 chuyển chuyên viên |
| AG07 | Tin Zalo đến → agent xử lý; luồng trên Tổng quan | Mô phỏng tin đến → Agent CSKH tra Bộ não, soạn hoặc chuyển; Tổng quan đủ 5 làn |
| AG08 | Hệ thống Marketing | Kênh Tiệm nói thật, 2 lô, 3 video chờ kiểm duyệt; video phát được khi có file trên máy (206), máy chủ không có file thì báo 404; chưa đăng nhập 401 |
| AG09 | Kiểm duyệt video | Thiếu bảng kiểm → 400; câu chuyên môn chưa thợ duyệt → 409; đủ → duyệt; Agent Xây kênh đề xuất lịch đăng; duyệt → video vào lịch |
| AG10 | Đề xuất xây kênh và phễu | Duyệt quyết định giọng vùng miền → kế hoạch kênh cập nhật; phễu 8 chặng giảm dần, có điểm nghẽn |

## Giới hạn đã biết

- Khung chat giao việc dùng Claude khi có `ANTHROPIC_API_KEY`; trang AI Assistant cũ và các agent chuyên trách vẫn chạy quy tắc có nguồn.
- Agent “chạy theo lịch” chỉ chạy khi có người mở Tổng quan (Vercel không có tiến trình nền liên tục).
- Không có tiến trình nền liên tục trên Vercel: nhắc lịch/chăm sóc xử lý khi bấm “Chạy hàng đợi đến hạn”.
- Chưa cấu hình gửi email (mời thành viên, quên mật khẩu báo rõ là chưa gửi).
- Repo Zalo chưa được cung cấp → adapter DEMO.
