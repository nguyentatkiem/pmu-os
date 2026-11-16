# PMU OS — Trung tâm vận hành DOANH NGHIỆP PMU

HR AI Command Center + Customer Care Center cho DOANH NGHIỆP PMU, dựng theo gói bàn giao
`PMU_MO_TA_VA_BO_GIAO_DIEN.zip` (bản mô tả 1.0 ngày 15/11/2026, 16 ảnh giao diện).

> Dữ liệu demo là **DỮ LIỆU MÔ PHỎNG**: 2 chi nhánh (Cầu Giấy, Hà Đông), 22 nhân sự và 560 khách mang tên Việt hư cấu, số điện thoại dạng `0123…` không có thật, 20 kịch bản hội thoại Zalo có AI Agent trả lời sẵn. Zalo **chưa kết nối**: không có tin nào được gửi ra ngoài.

## Chạy trên máy

```bash
npm install
npm run dev        # http://localhost:3730
```

- Không cần cài Postgres: khi `DATABASE_URL` trống, hệ thống dùng PGlite (Postgres nhúng) lưu ở `./.data/pglite`.
- Mở trang đăng nhập → **Khám phá bản demo**: mỗi lượt tạo một doanh nghiệp demo riêng (tách dữ liệu, có thể đặt lại).
- Đổi vai trò trong menu tài khoản (góc phải trên) để thử quyền: Chủ doanh nghiệp, Quản lý chi nhánh (Phạm Quốc Hưng, Trịnh Hoàng Nam), tư vấn, kỹ thuật viên, CSKH (Nguyễn Thị Lan…), lễ tân, Quản trị hệ thống.
- Tài khoản thật (`OWNER_EMAIL`) lần đăng nhập đầu được nạp sẵn cùng bộ DỮ LIỆU MÔ PHỎNG; xóa tại **Cài đặt › Doanh nghiệp › Dữ liệu mô phỏng** (gõ `XOA`).

## Hệ điều hành AI Agent

- **Trung tâm AI Agent** (`/agents`): Agent Điều phối + 4 agent chuyên trách (Nhân sự, Chăm sóc khách, Báo cáo, Đào tạo SOP), bật/tắt từng agent, dừng khẩn cấp, nhật ký từng lượt chạy.
- **Khung chat “Giao việc AI”** nổi ở mọi màn hình: “Giao [họ tên] … trước 10:00 ngày mai”, “Chạy agent chăm sóc khách”, “Tra bộ não: khách hỏi giá”. Mọi thay đổi chỉ thành **đề xuất chờ duyệt**.
- **Bộ não thứ 2** (`/brain`): quy tắc, bài học, insight khách, ghi nhớ, quyết định + FAQ/SOP đã duyệt. Agent tra trước khi làm và trích nguồn; mục agent tự rút ra phải được quản lý duyệt mới dùng.
- **Tổng quan** hiện luồng agent chạy trực tiếp (tín hiệu vào → agent → Bộ não → chờ duyệt), làm mới 20 giây; agent quá 60 phút chưa chạy sẽ tự chạy khi Tổng quan đang mở. Nút “Mô phỏng khách nhắn Zalo” để xem agent xử lý một tin đến.
- Mỗi menu có **sơ đồ hình khối chạy** mô tả luồng vận hành (vàng: AI làm, xanh: con người làm).
- Bộ não ngôn ngữ: có `ANTHROPIC_API_KEY` thì khung chat dùng Claude (`claude-opus-5-5`, công cụ chạy tại máy chủ theo quyền người chat, bật dự phòng phía máy chủ `fallbacks: "default"`), ngân sách lượt/ngày trong `ai_policy.budget_per_day` (demo 40, thật 200). Không có khóa → chế độ quy tắc.

## Biến môi trường (`.env.example`)

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL (Neon trên Vercel). Trống = PGlite cục bộ. |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Tài khoản chủ doanh nghiệp thật. Lần đăng nhập đầu tiên đúng cặp này sẽ tạo doanh nghiệp thật và nạp DỮ LIỆU MÔ PHỎNG (xóa được). |
| `ANTHROPIC_API_KEY` | Tùy chọn. Bật Claude cho khung chat giao việc. Trống = chế độ quy tắc. |

Không có secret nào nằm trong mã nguồn hay gửi xuống trình duyệt.

## Kiểm thử nghiệm thu

```bash
BASE_URL=http://localhost:3730 npm run test:ac
```

Kịch bản tự động kiểm AC01–AC09, AC11, AC12 và AG01–AG07 cho hệ AI Agent (xem `docs/NGHIEM-THU.md`).

## Kiến trúc

- Next.js 16 (App Router) + React 19 + TypeScript. Một route API tổng `src/app/api/[...path]/route.ts` → bộ định tuyến `src/lib/server/router.ts`.
- PostgreSQL (Neon) / PGlite qua `src/lib/server/db.ts`; migration SQL ở `db/migrations`, tự chạy khi khởi động (khóa advisory).
- Phân quyền tại máy chủ: `src/lib/shared/perms.ts` (module × hành động) + phạm vi doanh nghiệp/chi nhánh/bản ghi trong `src/lib/server/domain.ts`.
- AI có kiểm soát: `src/lib/server/ai.ts` (chế độ quy tắc có nguồn, chưa nối nhà cung cấp mô hình). Hộp phê duyệt + idempotency: `src/lib/server/proposals.ts`.
- Adapter Zalo DEMO (hợp đồng nội bộ đề xuất): `DemoZaloAdapter` trong `domain.ts`.
- Ảnh trong gói bàn giao: `public/design/*` (16 màn hình + tổng quan), logo/nền đăng nhập/avatar/hình trống/biểu tượng Zalo cắt từ ảnh gốc ở `public/brand`, `public/avatars`. Mỗi màn hình có nút **Thiết kế gốc**; trang `/thiet-ke` hiển thị toàn bộ bộ ảnh.

Chi tiết: `docs/KIEN-TRUC.md`, `docs/NGHIEM-THU.md`.

NGUYỄN TẤT KIỂM - TAKI.VN
