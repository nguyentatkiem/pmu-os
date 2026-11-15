# PMU OS — Trung tâm vận hành DOANH NGHIỆP PMU

HR AI Command Center + Customer Care Center cho DOANH NGHIỆP PMU, dựng theo gói bàn giao
`PMU_MO_TA_VA_BO_GIAO_DIEN.zip` (bản mô tả 1.0 ngày 15/11/2026, 16 ảnh giao diện).

> Dữ liệu demo là **DỮ LIỆU MÔ PHỎNG** (Nhân sự A–H, Khách mẫu A–F). Zalo **chưa kết nối**: không có tin nào được gửi ra ngoài.

## Chạy trên máy

```bash
npm install
npm run dev        # http://localhost:3730
```

- Không cần cài Postgres: khi `DATABASE_URL` trống, hệ thống dùng PGlite (Postgres nhúng) lưu ở `./.data/pglite`.
- Mở trang đăng nhập → **Khám phá bản demo**: mỗi lượt tạo một doanh nghiệp demo riêng (tách dữ liệu, có thể đặt lại).
- Đổi vai trò trong menu tài khoản (góc phải trên) để thử quyền: Chủ doanh nghiệp, Quản lý (A), Tư vấn (B, C), Kỹ thuật viên (D, E, F), CSKH (G), Lễ tân (H), Quản trị hệ thống.

## Biến môi trường (`.env.example`)

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL (Neon trên Vercel). Trống = PGlite cục bộ. |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Tài khoản chủ doanh nghiệp thật. Lần đăng nhập đầu tiên đúng cặp này sẽ tạo doanh nghiệp thật (rỗng). |

Không có secret nào nằm trong mã nguồn hay gửi xuống trình duyệt.

## Kiểm thử nghiệm thu

```bash
BASE_URL=http://localhost:3730 npm run test:ac
```

Kịch bản tự động kiểm AC01–AC09, AC11, AC12 (xem `docs/NGHIEM-THU.md`).

## Kiến trúc

- Next.js 16 (App Router) + React 19 + TypeScript. Một route API tổng `src/app/api/[...path]/route.ts` → bộ định tuyến `src/lib/server/router.ts`.
- PostgreSQL (Neon) / PGlite qua `src/lib/server/db.ts`; migration SQL ở `db/migrations`, tự chạy khi khởi động (khóa advisory).
- Phân quyền tại máy chủ: `src/lib/shared/perms.ts` (module × hành động) + phạm vi doanh nghiệp/chi nhánh/bản ghi trong `src/lib/server/domain.ts`.
- AI có kiểm soát: `src/lib/server/ai.ts` (chế độ quy tắc có nguồn, chưa nối nhà cung cấp mô hình). Hộp phê duyệt + idempotency: `src/lib/server/proposals.ts`.
- Adapter Zalo DEMO (hợp đồng nội bộ đề xuất): `DemoZaloAdapter` trong `domain.ts`.
- Ảnh trong gói bàn giao: `public/design/*` (16 màn hình + tổng quan), logo/nền đăng nhập/avatar/hình trống/biểu tượng Zalo cắt từ ảnh gốc ở `public/brand`, `public/avatars`. Mỗi màn hình có nút **Thiết kế gốc**; trang `/thiet-ke` hiển thị toàn bộ bộ ảnh.

Chi tiết: `docs/KIEN-TRUC.md`, `docs/NGHIEM-THU.md`.

NGUYỄN TẤT KIỂM - TAKI.VN
