# Phân Công Lại Công Việc (Sprint Chạy Nước Rút)

> **Dự án:** TableReserve — Restaurant Booking System  
> **Trạng thái:** Tái phân bổ do một số phần code sai vị trí hoặc chưa hoàn thiện  
> **Ngày cập nhật:** 01/10/2026  
> **Mục tiêu:** Khớp nối hệ thống và hoàn tất các file còn thiếu để ra bản Demo

---

## 1. DEV 1: Fix lỗi Phase 1 — "Cứu vãn máy chủ"
*(Phải làm ngay lập tức, nếu không toàn bộ hệ thống không thể chạy API)*

- [ ] **`backend/auth.py`**: Viết logic băm mật khẩu (dùng `passlib` bcrypt) và mã hóa JWT Token (dùng `python-jose`).
- [ ] **`backend/dependencies.py`**: Viết hàm `get_current_user` đọc token từ header để chặn các request trái phép.
- [ ] **`backend/routers/auth_router.py`**: Viết API `/api/auth/register`, `/api/auth/login`, và `/api/auth/me`.
- [ ] **`backend/main.py`**: Khởi tạo `FastAPI()`, thêm `CORSMiddleware`, setup cấu hình tạo DB, và mount tất cả routers (auth, customer, restaurant, websocket).

---

## 2. DEV 2: Dọn dẹp chiến trường & API Khách Hàng
*(Logic đã code xong nhưng để nhầm ở root folder, cần fix)*

- [ ] **Di chuyển file**: Chuyển `dijkstra_service.py` và `reservation_service.py` từ thư mục gốc (`/`) vào đúng thư mục là `backend/services/`.
- [ ] **Sửa đường dẫn Import**: Cập nhật lại các import bên trong 2 file trên để khớp với cấu trúc mới.
- [ ] **`backend/routers/customer_router.py`**: Hoàn thiện các API:
  - `GET /api/customer/branches/nearby` (Gọi dijkstra)
  - `POST /api/customer/reservations` (Tạo đặt bàn)
  - `GET /api/customer/reservations` (Lịch sử đặt bàn)
  - `PATCH /api/customer/reservations/{id}/cancel` (Hủy đặt bàn)

---

## 3. DEV 3: Hỗ trợ tích hợp & DevOps
*(Do đã hoàn thành 100% công việc cũ, chuyển sang Support)*

- [ ] **Khởi tạo môi trường**: Tạo file `.env.example` chứa các biến SMTP và JWT Secret. Tạo script `start.bat` hoặc tài liệu hướng dẫn chạy server Uvicorn.
- [ ] **Kiểm thử liên kết**: Phối hợp cùng Dev 2 để đảm bảo API xác nhận/từ chối đặt bàn gọi đúng hàm `confirm_reservation` và luồng thông báo WebSocket, Email hoạt động trơn tru.
- [ ] **Dữ liệu mẫu**: Viết script ngắn đổ một số dữ liệu giả (Mock data) vào SQLite để cả nhóm cùng test UI.

---

## 4. DEV 4: Hoàn thành giao diện Nhà Hàng & Bản Đồ
*(Phần Customer đã làm rất tốt, tập trung nốt phần Restaurant)*

- [ ] **HTML Nhà Hàng**: Dựng UI quản lý đơn hàng (`frontend/restaurant/dashboard.html`) và CRUD chi nhánh (`frontend/restaurant/branches.html`).
- [ ] **Bản Đồ (`frontend/js/map.js`)**: Viết logic khởi tạo bản đồ Leaflet.js, xin quyền GPS trình duyệt, gọi API Nominatim OpenStreetMap để geocode lấy địa chỉ.
- [ ] **Realtime (`frontend/js/dashboard.js`)**: Tích hợp client WebSocket, tự động nối lại (auto-reconnect) khi rớt mạng, append thẳng đơn hàng mới vào bảng HTML mà không cần reload.

---

### 🔥 Quy Trình Làm Việc Khuyến Nghị
1. **Pull mới nhất:** Tất cả mọi người chạy `git checkout develop` và `git pull origin develop` để lấy code mới.
2. **Tạo nhánh sửa lỗi:** Tạo nhánh mới từ `develop` (Ví dụ: `git checkout -b fix/dev2-move-files`).
3. **Tuân thủ ranh giới file:** Việc của ai người đó sửa. Hạn chế đụng vào `models.py` hoặc `schemas.py` lúc này vì dễ bị conflict (xung đột mã nguồn).
4. Xong phần nào commit phần đó và có thể nhờ Dev 3 review hộ.
