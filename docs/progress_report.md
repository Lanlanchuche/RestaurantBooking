# BÁO CÁO TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS REPORT)
**Dự án:** TableReserve (Hệ thống Đặt bàn Nhà hàng)
**Cập nhật lần cuối:** 07/10/2026
**Trạng thái:** 🟢 Đang chạy nước rút (Sprint) - Giai đoạn Frontend (Phase 4)

---

## 📊 TỔNG QUAN (OVERVIEW)

Dự án hiện tại đang đi vào những khâu cuối cùng. Toàn bộ phần Backend (Cơ sở dữ liệu, Xác thực, Thuật toán tìm đường Dijkstra, Gửi Email, và WebSockets) **đã được hoàn tất 100% và chạy ổn định**. 
Hệ thống hiện tại đã có sẵn 30 nhà hàng mẫu tại khu vực Hà Nội. Trọng tâm công việc hiện đang được dồn toàn bộ cho nhóm Frontend (Dev 4) để hoàn thiện giao diện Dashboard nhà hàng và Bản đồ tương tác.

---

## 📝 CHI TIẾT TỪNG GIAI ĐOẠN (PHASES STATUS)

### 🟢 Phase 1: Core & Khởi tạo hệ thống (DEV 1) - Hoàn thành 100%
*Nền tảng của toàn bộ hệ thống.*
- [x] Khởi tạo dự án, thiết lập `.gitignore`, quản lý thư viện `requirements.txt`.
- [x] Thiết kế Cơ sở dữ liệu SQLite (`tablereserve.db`), các Entity/Models SQLAlchemy (`models.py`, `schemas.py`).
- [x] Xây dựng hệ thống Xác thực bằng JWT Token, băm mật khẩu bảo mật với Bcrypt (`auth.py`, `dependencies.py`).
- [x] Đăng ký API đăng nhập, đăng ký (`auth_router.py`) và kết nối thành công ứng dụng FastAPI (`main.py`).

### 🟢 Phase 2: Restaurant Backend (DEV 3) - Hoàn thành 100%
*Các tính năng dành riêng cho Chủ Nhà Hàng.*
- [x] API quản lý chi nhánh (`Branch`), quản lý đặt bàn (`Reservation`) trong `restaurant_router.py`.
- [x] Hệ thống gửi Email tự động thông báo đặt chỗ, xác nhận, hủy bàn tới Khách hàng và Nhà hàng (`email_service.py`).
- [x] Tích hợp WebSocket Server để đẩy thông báo realtime về Dashboard nhà hàng khi có đơn đặt bàn mới (`websocket_manager.py`).

### 🟢 Phase 3: Customer Backend & AI Routing (DEV 2) - Hoàn thành 100%
*Tính năng cho Khách hàng & Thuật toán tìm đường.*
- [x] API đặt bàn cho khách hàng, xem lịch sử các đơn hàng (`customer_router.py`, `reservation_service.py`).
- [x] **Thuật toán cốt lõi:** Tính toán khoảng cách và thời gian di chuyển thực tế từ vị trí khách hàng tới các chi nhánh bằng thuật toán Dijkstra trên bản đồ OpenStreetMap (OSMnx & NetworkX).
- [x] Xây dựng cơ chế fallback dự phòng sang công thức Haversine (đường chim bay) để chống lỗi (`dijkstra_service.py`).

### 🟡 Phase 4: Frontend UI & Realtime Map (DEV 4) - Đang tiến hành (70%)
*Trải nghiệm người dùng.*
- [x] Giao diện Đăng nhập, Đăng ký và điều hướng.
- [x] Giao diện Khách hàng (Dashboard, Quản lý tài khoản, Xem lịch sử).
- [x] API Client (`api.js`, `auth.js`) để kết nối Frontend với Backend.
- [ ] **(Đang làm)** Giao diện quản lý Đơn hàng cho Nhà hàng (`restaurant/dashboard.html`).
- [ ] **(Đang làm)** Giao diện tạo/sửa Chi nhánh (`restaurant/branches.html`).
- [ ] **(Đang làm)** Tích hợp WebSockets vào Dashboard nhà hàng để tự động cập nhật đơn mới không cần Reload trang.
- [ ] **(Đang làm)** Tích hợp bản đồ trực quan Leaflet.js để hiển thị nhà hàng trên bản đồ (`map.js`).

### 🟢 Task phụ: Dữ liệu mẫu (Mock Data) - Hoàn thành 100%
- [x] Viết script `seed_hanoi_data.py`.
- [x] Tự động sinh 10 chủ nhà hàng và 30 chi nhánh được phân bổ tọa độ chân thực xung quanh trung tâm Hà Nội để dễ dàng kiểm thử Bản đồ và tìm đường.

---

## 🚀 KẾ HOẠCH TIẾP THEO (NEXT STEPS)

1. Tập trung xây dựng layout cho **Dashboard Nhà Hàng** (`restaurant/dashboard.html` & `branches.html`).
2. Code logic **JavaScript (Leaflet)** vẽ bản đồ, hiện marker cho 30 chi nhánh tại Hà Nội.
3. Code logic **JavaScript (WebSockets)** lắng nghe sự kiện để nối dữ liệu realtime.
4. Kiểm thử luồng từ A-Z (Đăng nhập -> Xem bản đồ -> Đặt bàn -> Nhận Email/Websocket -> Nhà hàng xác nhận).
