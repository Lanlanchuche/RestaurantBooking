# Phạm Vi Hệ Thống — TableReserve

> **Phiên bản:** 1.0  
> **Ngày cập nhật:** 14/09/2026  
> **Trạng thái:** Đã duyệt

---

## 1. Tổng Quan Hệ Thống

**TableReserve** là nền tảng đặt bàn nhà hàng trực tuyến, cho phép khách hàng tìm kiếm và đặt bàn tại các chi nhánh nhà hàng gần nhất dựa trên khoảng cách di chuyển thực tế (thuật toán Dijkstra trên mạng lưới đường bộ OpenStreetMap), đồng thời cung cấp cho chủ nhà hàng công cụ quản lý đặt bàn theo thời gian thực.

### Sơ Đồ Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   HTML/CSS/JS + Bootstrap 5 + Leaflet.js                    │
│                                                             │
│  [Landing]  [Login/Register]  [Customer Pages]  [Restaurant Pages]  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP REST / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    BACKEND (FastAPI)                        │
│                                                             │
│  /api/auth/*     /api/customer/*    /api/restaurant/*       │
│  /ws/restaurant/{id}                                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Auth Service │  │  Dijkstra    │  │  Email Service   │  │
│  │  (JWT+bcrypt)│  │  (OSMnx+NX)  │  │  (smtplib)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Reservation Service (asyncio.Lock)             │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ SQLAlchemy ORM
┌──────────────────────▼──────────────────────────────────────┐
│              DATABASE (SQLite — WAL mode)                   │
│   users │ restaurants │ branches │ reservations             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Các Tác Nhân (Actors)

| Actor | Mô tả | Vai trò trong hệ thống |
|---|---|---|
| **Khách hàng** (Customer) | Người dùng cuối muốn đặt bàn tại nhà hàng | Tìm kiếm, đặt bàn, hủy bàn, xem lịch sử |
| **Chủ/Quản lý nhà hàng** (Restaurant Owner) | Chủ nhà hàng hoặc người được ủy quyền quản lý | Quản lý chi nhánh, xác nhận/từ chối đặt bàn |
| **Hệ thống** (System) | Các tác vụ tự động không cần người dùng tương tác | Gửi email, cập nhật số bàn, phát sự kiện WebSocket |

---

## 3. Phạm Vi Chức Năng (Trong Phạm Vi)

### 3.1 Module Khách Hàng

#### UC-C01: Đăng ký tài khoản
- **Actor:** Khách hàng
- **Đầu vào:** Họ tên, email, mật khẩu
- **Đầu ra:** Tài khoản tạo thành công, JWT token trả về
- **Điều kiện:** Email chưa tồn tại trong hệ thống

#### UC-C02: Đăng nhập
- **Actor:** Khách hàng
- **Đầu vào:** Email, mật khẩu
- **Đầu ra:** JWT access token (có hạn 24 giờ)
- **Điều kiện:** Tài khoản tồn tại và mật khẩu đúng

#### UC-C03: Thiết lập vị trí
- **Actor:** Khách hàng
- **Phương thức 1 — GPS tự động:** Trình duyệt yêu cầu quyền GPS, lấy tọa độ hiện tại
- **Phương thức 2 — Nhập tay:** Khách hàng nhập địa chỉ → hệ thống geocode qua Nominatim API (OpenStreetMap, miễn phí) → ra tọa độ lat/lng
- **Đầu ra:** Tọa độ (latitude, longitude) dùng cho UC-C04

#### UC-C04: Tìm kiếm nhà hàng gần nhất (Dijkstra)
- **Actor:** Khách hàng, Hệ thống
- **Đầu vào:** Tọa độ khách hàng (từ UC-C03)
- **Xử lý:**
  1. Backend tải graph mạng lưới đường bộ từ OpenStreetMap (OSMnx), cache vào file `.graphml`
  2. Tìm node trên graph gần khách hàng nhất và gần từng chi nhánh nhất
  3. Chạy thuật toán Dijkstra (NetworkX) để tính khoảng cách đường bộ thực tế
  4. Sắp xếp tăng dần theo khoảng cách
  5. Fallback về Haversine nếu graph không khả dụng
- **Đầu ra:** Danh sách 5 chi nhánh gần nhất kèm khoảng cách (km) và thời gian ước tính (phút)
- **Hiển thị:** Bản đồ Leaflet.js với marker đánh số 1–5 và đường nối từ khách hàng

#### UC-C05: Tạo đặt bàn
- **Actor:** Khách hàng
- **Đầu vào:** Chi nhánh, ngày giờ, số khách, món ăn đặt trước (tùy chọn), yêu cầu đặc biệt (tùy chọn)
- **Xử lý:**
  1. Acquire `asyncio.Lock` của chi nhánh → ngăn race condition
  2. Kiểm tra `available_tables > 0`
  3. Tạo bản ghi reservation với trạng thái `PENDING`
  4. Giảm `available_tables` của chi nhánh đi 1
  5. Gửi email thông báo cho cả khách hàng và nhà hàng
  6. Push sự kiện WebSocket tới dashboard nhà hàng
- **Đầu ra:** Đặt bàn tạo thành công với số bàn được gán
- **Xử lý lỗi:** Nếu `available_tables == 0` → trả HTTP 409, thông báo "Hết bàn"

#### UC-C06: Hủy đặt bàn
- **Actor:** Khách hàng
- **Điều kiện bắt buộc:** Thời điểm hủy phải **trước ít nhất 24 giờ** so với giờ đặt bàn
- **Xử lý:**
  1. Kiểm tra quy tắc 24 giờ → nếu vi phạm, trả HTTP 400
  2. Cập nhật trạng thái → `CANCELLED`
  3. Tăng `available_tables` của chi nhánh lên 1
  4. Gửi email thông báo hủy cho cả 2 bên
- **Trạng thái có thể hủy:** `PENDING`, `CONFIRMED`

#### UC-C07: Xem lịch sử đặt bàn
- **Actor:** Khách hàng
- **Đầu ra:** Danh sách phân trang các đặt bàn của khách hàng, sắp xếp mới nhất trước, kèm badge trạng thái
- **Lọc:** Theo trạng thái (PENDING / CONFIRMED / REJECTED / CANCELLED)

---

### 3.2 Module Nhà Hàng

#### UC-R01: Đăng ký tài khoản đối tác
- **Actor:** Chủ nhà hàng
- **Đầu vào:** Họ tên, email cá nhân, mật khẩu (role = RESTAURANT_OWNER)
- **Bước tiếp theo:** Tạo hồ sơ nhà hàng (UC-R02)

#### UC-R02: Tạo hồ sơ nhà hàng
- **Actor:** Chủ nhà hàng
- **Đầu vào:** Tên nhà hàng, email nhận thông báo, số điện thoại (tùy chọn)
- **Ràng buộc:** Mỗi tài khoản chỉ được liên kết với 1 nhà hàng

#### UC-R03: Quản lý mạng lưới chi nhánh
- **Actor:** Chủ nhà hàng
- **Thêm chi nhánh:** Tên, địa chỉ, tọa độ (lat/lng — click trên bản đồ), số bàn tổng
- **Sửa chi nhánh:** Cập nhật tọa độ, địa chỉ, tổng số bàn (số bàn trống được điều chỉnh tự động)
- **Xóa chi nhánh:** Xóa chi nhánh và toàn bộ dữ liệu liên quan
- **Hiển thị:** Bản đồ Leaflet.js với marker từng chi nhánh

#### UC-R04: Nhận đặt bàn theo thời gian thực
- **Actor:** Hệ thống → Chủ nhà hàng
- **Cơ chế:** WebSocket persistent connection tới `/ws/restaurant/{restaurant_id}`
- **Khi có đặt bàn mới:** Server push JSON event → Frontend chèn hàng mới vào bảng **không cần reload trang**
- **Fallback:** Polling REST API mỗi 15 giây nếu WebSocket ngắt
- **Hiển thị:** Dashboard bảng với cột: ID, Khách hàng, Chi nhánh, Số bàn, Số khách, Giờ, Món đặt trước, Yêu cầu, Trạng thái, Hành động

#### UC-R05: Xác nhận đặt bàn
- **Actor:** Chủ nhà hàng
- **Điều kiện:** Đặt bàn ở trạng thái `PENDING`
- **Xử lý:** Cập nhật trạng thái → `CONFIRMED`, gửi email xác nhận cho khách hàng

#### UC-R06: Từ chối đặt bàn
- **Actor:** Chủ nhà hàng
- **Điều kiện:** Đặt bàn ở trạng thái `PENDING`
- **Bắt buộc:** Phải nhập **lý do từ chối** (không được để trống)
- **Xử lý:**
  1. Cập nhật trạng thái → `REJECTED`
  2. Lưu lý do từ chối vào trường `rejection_reason`
  3. Tăng `available_tables` lên 1
  4. Gửi email cho khách hàng kèm lý do từ chối

---

### 3.3 Logic Lõi Hệ Thống

#### SYS-01: Xử lý Race Condition (Đặt bàn đồng thời)

- **Vấn đề:** 2 khách hàng cùng click "Đặt bàn" cho cùng chi nhánh, cùng thời điểm, khi chỉ còn 1 bàn trống
- **Giải pháp:** `asyncio.Lock` dạng từ điển, mỗi `branch_id` có 1 lock riêng
- **Luồng xử lý:**
  ```
  Request A ──► acquire lock[branch_1] ──► check available (=1) ──► decrement (=0) ──► commit ──► release lock
  Request B ──────────────────────────────────► acquire lock[branch_1] ──► check available (=0) ──► raise HTTP 409
  ```
- **Kết quả:** Đúng 1 request thành công, request còn lại nhận thông báo "Hết bàn"

#### SYS-02: Đồng Bộ Số Bàn Trống

| Sự kiện | Thay đổi `available_tables` |
|---|---|
| Đặt bàn tạo thành công | `-1` |
| Khách hàng hủy đặt bàn | `+1` |
| Nhà hàng từ chối | `+1` |
| Nhà hàng xác nhận | Không thay đổi |
| Chỉnh sửa `total_tables` của chi nhánh | Điều chỉnh tự động theo delta |

**Giới hạn:** `0 ≤ available_tables ≤ total_tables`

#### SYS-03: Hệ Thống Email Tự Động

| Trigger | Gửi tới | Nội dung chính |
|---|---|---|
| Khách đặt bàn → PENDING | Khách hàng | Mã đặt bàn, tên chi nhánh, địa chỉ, giờ, số bàn, trạng thái Pending |
| Khách đặt bàn → PENDING | Nhà hàng | Thông tin khách, chi tiết đặt bàn, link vào dashboard |
| Nhà hàng xác nhận → CONFIRMED | Khách hàng | Xác nhận thành công, đầy đủ thông tin giờ và địa điểm |
| Nhà hàng từ chối → REJECTED | Khách hàng | Lý do từ chối, gợi ý đặt lại |
| Khách hủy → CANCELLED | Khách hàng | Xác nhận hủy |
| Khách hủy → CANCELLED | Nhà hàng | Thông báo khách đã hủy, bàn đã được giải phóng |

---

## 4. Ngoài Phạm Vi (Out of Scope)

Các tính năng sau **không** được phát triển trong phiên bản này:

| Tính năng | Lý do |
|---|---|
| Thanh toán trực tuyến (VNPay, MoMo, Stripe) | Ngoài phạm vi MVP |
| Quản lý menu nhà hàng (thêm/sửa/xóa món) | Món đặt trước là free-text |
| Đánh giá và xếp hạng nhà hàng | Tính năng giai đoạn 2 |
| Hệ thống khuyến mãi / voucher | Tính năng giai đoạn 2 |
| Ứng dụng mobile (iOS/Android) | Chỉ có web |
| Quản lý nhân viên / phân quyền nội bộ nhà hàng | Một tài khoản = một nhà hàng |
| Tích hợp Google Maps / Mapbox | Dùng OpenStreetMap miễn phí |
| Đặt bàn qua QR code | Ngoài phạm vi |
| Thông báo SMS | Chỉ email |
| Dashboard báo cáo / thống kê nâng cao | Ngoài phạm vi |
| Multi-tenant SaaS (nhiều owner cùng 1 nhà hàng) | Kiến trúc 1 owner - 1 restaurant |

---

## 5. Ràng Buộc Nghiệp Vụ (Business Rules)

| Mã | Quy tắc |
|---|---|
| **BR-01** | Khách hàng chỉ được hủy đặt bàn nếu còn **ít nhất 24 giờ** trước giờ đặt |
| **BR-02** | Nhà hàng bắt buộc phải nhập **lý do từ chối** khi reject |
| **BR-03** | Mỗi tài khoản Restaurant Owner chỉ được liên kết với **1 nhà hàng** |
| **BR-04** | `available_tables` không được âm và không được vượt quá `total_tables` |
| **BR-05** | Chỉ đặt bàn ở trạng thái `PENDING` mới được Confirm hoặc Reject |
| **BR-06** | Chỉ đặt bàn ở trạng thái `PENDING` hoặc `CONFIRMED` mới được Cancel |
| **BR-07** | Email gửi thông báo là **bất đồng bộ** — thất bại email không làm thất bại transaction |
| **BR-08** | Nếu OSMnx không tải được graph, hệ thống fallback về Haversine (không báo lỗi cho user) |

---

## 6. Ràng Buộc Phi Chức Năng (Non-Functional Requirements)

| Loại | Yêu cầu |
|---|---|
| **Bảo mật** | JWT token hết hạn sau 24h; mật khẩu bcrypt; không lưu plaintext |
| **Đồng thời** | asyncio.Lock đảm bảo không race condition trong cùng 1 process |
| **Dữ liệu** | SQLite WAL mode cho phép đọc đồng thời trong khi ghi |
| **Real-time** | Sự kiện đặt bàn mới xuất hiện trên dashboard trong < 1 giây |
| **Routing** | Graph OSMnx được cache trên disk — chỉ download lần đầu |
| **Email** | Gửi bất đồng bộ qua thread pool — không block API response |
| **Tương thích** | Frontend chạy trên Chrome, Firefox, Edge (phiên bản 2 năm gần nhất) |
| **Môi trường** | Phát triển và chạy local trên Windows với Python 3.11+ |

---

## 7. Luồng Dữ Liệu Chính

### Luồng Đặt Bàn (Happy Path)

```
Khách hàng                Backend                    Nhà hàng
     │                       │                           │
     │── GPS/Địa chỉ ────────►│                           │
     │◄── 5 chi nhánh ────────│ (Dijkstra)                │
     │                       │                           │
     │── POST /reservations ─►│                           │
     │                       │── acquire Lock[branch] ──►│
     │                       │── check available > 0     │
     │                       │── available_tables -= 1   │
     │                       │── INSERT reservation      │
     │◄── 201 PENDING ────────│                           │
     │                       │── Email to customer ─────►│ (async)
     │                       │── Email to restaurant ───►│ (async)
     │                       │── WS push ───────────────►│ (real-time)
     │                       │                           │
     │                       │◄──── PATCH /confirm ───────│
     │                       │── UPDATE status=CONFIRMED │
     │◄── Email confirmed ────│──────────────────────────►│
```

### Luồng Race Condition

```
Request A ──────────────────────────────────────────────────────────►
Request B ──────────────────────────────────────────────────────────►
               │
               ▼ Lock[branch_1]
               ├── A acquire ✅ → check(avail=1) → decrement → commit → release
               └── B wait... → acquire ✅ → check(avail=0) → raise 409 ❌
```

---

## 8. Cấu Trúc Dữ Liệu (Database Schema)

```
users
├── id (PK)
├── email (UNIQUE)
├── password_hash
├── name
├── role (CUSTOMER | RESTAURANT_OWNER)
└── created_at

restaurants
├── id (PK)
├── owner_id (FK → users)
├── name
├── email
├── phone
└── created_at

branches
├── id (PK)
├── restaurant_id (FK → restaurants)
├── name
├── address
├── latitude
├── longitude
├── total_tables
├── available_tables     ← được sync tự động
└── created_at

reservations
├── id (PK)
├── customer_id (FK → users)
├── branch_id (FK → branches)
├── table_number
├── guest_count
├── reservation_time
├── status (PENDING | CONFIRMED | REJECTED | CANCELLED)
├── pre_ordered_dishes (JSON text)
├── special_requests
├── rejection_reason
├── created_at
└── cancelled_at
```

---

## 9. Phụ Lục — Danh Sách API Endpoints

| Method | Endpoint | Quyền truy cập | Mô tả |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Đăng ký tài khoản |
| POST | `/api/auth/login` | Public | Đăng nhập |
| GET | `/api/auth/me` | Authenticated | Thông tin tài khoản hiện tại |
| GET | `/api/customer/branches/nearby` | Customer | 5 chi nhánh gần nhất (Dijkstra) |
| POST | `/api/customer/reservations` | Customer | Tạo đặt bàn |
| GET | `/api/customer/reservations` | Customer | Lịch sử đặt bàn |
| GET | `/api/customer/reservations/{id}` | Customer | Chi tiết 1 đặt bàn |
| PATCH | `/api/customer/reservations/{id}/cancel` | Customer | Hủy đặt bàn |
| POST | `/api/restaurant/` | Owner | Tạo hồ sơ nhà hàng |
| GET | `/api/restaurant/me` | Owner | Thông tin nhà hàng của mình |
| PUT | `/api/restaurant/me` | Owner | Cập nhật hồ sơ nhà hàng |
| GET | `/api/restaurant/me/branches` | Owner | Danh sách chi nhánh |
| POST | `/api/restaurant/me/branches` | Owner | Thêm chi nhánh |
| PATCH | `/api/restaurant/me/branches/{id}` | Owner | Sửa chi nhánh |
| DELETE | `/api/restaurant/me/branches/{id}` | Owner | Xóa chi nhánh |
| GET | `/api/restaurant/me/reservations` | Owner | Danh sách đặt bàn |
| PATCH | `/api/restaurant/me/reservations/{id}/confirm` | Owner | Xác nhận |
| PATCH | `/api/restaurant/me/reservations/{id}/reject` | Owner | Từ chối (kèm lý do) |
| WS | `/ws/restaurant/{restaurant_id}` | Owner | Kênh real-time |
