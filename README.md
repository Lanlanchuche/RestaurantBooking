# TableReserve — Hệ thống đặt bàn nhà hàng

Ứng dụng web đặt bàn nhà hàng (mô phỏng tại Hà Nội), hỗ trợ hai phía:

- **Khách hàng**: tìm chi nhánh gần nhất theo vị trí/địa chỉ, đặt bàn, theo dõi lịch sử, hủy đặt bàn (quy tắc 24h), nhận email xác nhận.
- **Chủ nhà hàng**: quản lý hệ thống chi nhánh, duyệt/từ chối yêu cầu đặt bàn theo thời gian thực (WebSocket), nhận email thông báo.

Giao diện toàn bộ bằng tiếng Việt.

---

## Công nghệ

| Tầng | Công nghệ |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Uvicorn |
| Database | SQLite (`tablereserve.db`) |
| Định tuyến đường bộ | OSMnx + NetworkX (thuật toán Dijkstra trên đồ thị OpenStreetMap), fallback Haversine |
| Geocoding địa chỉ | Nominatim / Photon (gọi phía client trong `frontend/js/book.js`) |
| Bản đồ | Leaflet 1.9 |
| Auth | JWT (`python-jose`) + bcrypt (`passlib`) |
| Email | `smtplib` + ThreadPoolExecutor (SMTP Gmail, có chế độ mock in ra log) |
| Frontend | HTML/CSS/JS thuần (không framework), WebSocket cho dashboard nhà hàng |

---

## Cấu trúc thư mục

```
RestaurantBooking/
├── backend/
│   ├── main.py                  # Khởi tạo FastAPI, CORS, lifespan
│   ├── models.py                # SQLAlchemy models (User, Customer, Restaurant, Branch, Reservation)
│   ├── schemas.py               # Pydantic schemas
│   ├── database.py              # Engine + SessionLocal + get_db
│   ├── auth.py                  # Băm mật khẩu, tạo/verify JWT
│   ├── dependencies.py          # get_current_user (Bearer token)
│   ├── routers/
│   │   ├── auth_router.py       # /api/auth     — đăng ký, đăng nhập, hồ sơ
│   │   ├── customer_router.py   # /api/customer — chi nhánh, đặt bàn, lịch sử, hủy
│   │   ├── restaurant_router.py # /api/restaurant — nhà hàng, chi nhánh, duyệt đơn
│   │   └── websocket_router.py  # /ws           — real-time cho dashboard nhà hàng
│   └── services/
│       ├── reservation_service.py   # Nghiệp vụ đặt bàn (validate, lock, trừ bàn trống, email)
│       ├── dijkstra_service.py      # Khoảng cách đường bộ OSMnx/Dijkstra + cache .pkl
│       ├── email_service.py         # Gửi email HTML bất đồng bộ, retry, mock mode
│       └── websocket_manager.py     # Quản lý kết nối WebSocket theo restaurant_id
├── frontend/
│   ├── index.html               # Trang giới thiệu
│   ├── login.html / register.html
│   ├── customer/
│   │   ├── book.html            # Đặt bàn: bản đồ, Top 5 chi nhánh gần nhất, vé xác nhận
│   │   ├── history.html         # Lịch sử đặt bàn + hủy (quy tắc 24h)
│   │   └── dashboard.html       # Bảng điều khiển khách hàng / hồ sơ cá nhân
│   ├── restaurant/
│   │   ├── dashboard.html       # Duyệt/từ chối đặt bàn real-time
│   │   └── branches.html        # Quản lý chi nhánh (thêm/sửa/xóa, geocode)
│   ├── css/                     # style.css, booking.css...
│   └── js/                      # api.js, auth.js, book.js, history.js, dashboard.js...
├── tests/                       # Pytest (email_service)
├── docs/                        # Tài liệu: use case, scope, phases, conventions...
├── scripts/send_test_email.py   # Script test gửi email
├── seed_hanoi.py                # Nạp dữ liệu mẫu 10 nhà hàng / 30 chi nhánh Hà Nội
├── requirements.txt
└── .env.example                 # Cấu hình SMTP / API key
```

---

## Cài đặt & chạy

### 1. Backend

```bash
# Tạo môi trường ảo (Windows)
python -m venv venv
venv\Scripts\activate        # Linux/macOS: source venv/bin/activate

pip install -r requirements.txt

# Cấu hình môi trường (tùy chọn khi dev)
copy .env.example .env       # điền SMTP_USER/SMTP_PASSWORD nếu muốn gửi email thật

# Nạp dữ liệu mẫu Hà Nội (10 chủ nhà hàng, 30 chi nhánh)
python seed_hanoi.py

# Chạy API tại http://localhost:8000 (Swagger: http://localhost:8000/docs)
uvicorn backend.main:app --reload
```

### 2. Frontend

Frontend là file tĩnh, gọi API tại `http://localhost:8000/api` (cấu hình trong `frontend/js/api.js`).

- Cách 1: mở `frontend/index.html` bằng **Live Server** của VS Code (cấu hình sẵn port `5501` trong `.vscode/settings.json`).
- Cách 2: phục vụ tĩnh bất kỳ, VD `npx serve frontend`.

### 3. Tài khoản mẫu (sau khi chạy `seed_hanoi.py`)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Chủ nhà hàng | `owner1@hanoi.vn` … `owner10@hanoi.vn` | `123456` |
| Khách hàng | tự đăng ký tại `register.html` | — |

---

## Mô hình dữ liệu

```
users ──1:1── customers                  users ──1:1── restaurants ──1:N── branches
   │                │                          │
   └────────────────┴────── N:1 ── reservations ──────┘
```

| Bảng | Mô tả |
|---|---|
| `users` | Tài khoản đăng nhập (email, bcrypt hash, `role`: `CUSTOMER` / `RESTAURANT_OWNER`) |
| `customers` | Hồ sơ khách hàng (họ tên, SĐT, địa chỉ mặc định) |
| `restaurants` | Hệ thống nhà hàng của chủ sở hữu |
| `branches` | Chi nhánh: tên, địa chỉ, toạ độ lat/lng, `total_tables`, `available_tables`, `is_active` |
| `reservations` | Đặt bàn: giờ hẹn, số khách, `table_number` (chỉ gán khi chủ quán duyệt), `status` |

Trạng thái đặt bàn: `PENDING` → `CONFIRMED` / `REJECTED` / `CANCELLED`.

---

## API chính

Tất cả prefix `/api`, trả JSON. Đăng nhập qua `Authorization: Bearer <JWT>`.

### Auth — `/api/auth`
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/register` | Đăng ký (role CUSTOMER hoặc RESTAURANT_OWNER) |
| POST | `/login` | Đăng nhập → trả `access_token` (JWT, hạn 7 ngày) |
| GET | `/me` | Hồ sơ hiện tại |
| PUT | `/me` | Cập nhật hồ sơ |
| DELETE | `/me` | Xoá tài khoản |

### Customer — `/api/customer`
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/branches` | Danh sách chi nhánh đang hoạt động (công khai) |
| GET | `/branches/nearby?lat=&lng=&limit=5` | Top 5 chi nhánh gần nhất — khoảng cách đường bộ Dijkstra, fallback Haversine |
| POST | `/reservations` | Tạo đặt bàn (giữ chỗ, trừ `available_tables`, gửi email) |
| GET | `/reservations` | Lịch sử đặt bàn (mới nhất theo `created_at` trước) |
| GET | `/reservations/{id}` | Chi tiết một đặt bàn |
| PATCH | `/reservations/{id}/cancel` | Hủy đặt bàn (chỉ khi còn ≥ 24h trước giờ hẹn) |

### Restaurant — `/api/restaurant`
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/` | Tạo hồ sơ nhà hàng cho chủ sở hữu |
| GET / PUT | `/me` | Xem / cập nhật hồ sơ nhà hàng |
| GET | `/me/info` | Thông tin tổng quan + thống kê |
| GET / POST | `/me/branches` | Liệt kê / thêm chi nhánh |
| PATCH / DELETE | `/me/branches/{id}` | Sửa / xóa chi nhánh |
| GET | `/me/reservations` | Danh sách đặt bàn của nhà hàng |
| PATCH | `/me/reservations/{id}/confirm` | Duyệt (gán số bàn, hoàn tất email xác nhận) |
| PATCH | `/me/reservations/{id}/reject` | Từ chối (bắt buộc lý do, email báo khách) |

### WebSocket
`ws://localhost:8000/ws/restaurant/{restaurant_id}?token=<JWT>` — nhận sự kiện đặt bàn mới theo thời gian thực trên dashboard nhà hàng (giữ kết nối bằng `ping`/`pong`).

Tài liệu Swagger đầy đủ: `http://localhost:8000/docs`.

---

## Quy tắc nghiệp vụ chính

- **Đặt bàn**: giờ hẹn phải ở tương lai; chi nhánh phải đang hoạt động và còn bàn trống; số bàn cụ thể **chỉ được gán khi chủ quán xác nhận** (vé hiển thị "Sẽ được sắp xếp khi bạn đến nhà hàng" với đơn `PENDING`).
- **Hủy (BR-01)**: chỉ hủy được đơn `PENDING`/`CONFIRMED` khi còn **≥ 24 giờ** trước giờ hẹn; bàn trống được hoàn lại.
- **Tìm chi nhánh gần nhất**: địa chỉ khách nhập được geocode phía client (Nominatim → Photon, với chuẩn hoá địa chỉ tiếng Việt và truy vấn giảm dần độ cụ thể), sau đó tính khoảng cách đường bộ bằng Dijkstra trên đồ thị OSM trong bán kính 10 km (cache `.pkl` tại `backend/cache/osm_graphs/`), tự động fallback khoảng cách Haversine khi đồ thị OSM không khả dụng.
- **Email thông báo**: gửi khi tạo đặt bàn, khi chủ quán duyệt/từ chối. Chưa cấu hình SMTP → email in ra log (chế độ mock) để phục vụ dev.

---

## Test

```bash
pytest tests/
```

- `tests/test_email_service.py` — kiểm thử email service (mock SMTP, định dạng, retry).
- `scripts/send_test_email.py` — script gửi email thật thủ công để kiểm tra cấu hình SMTP.

---

## Ghi chú cấu hình (`.env`)

| Biến | Ý nghĩa |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` | Server SMTP (mặc định `smtp.gmail.com:587` STARTTLS) |
| `SMTP_USER` / `SMTP_PASSWORD` | Để trống → chế độ mock (in email ra log). Gmail: dùng App Password |
| `SMTP_USE_SSL` | `true` cho cổng 465 |
| `SMTP_MAX_RETRIES` / `SMTP_RETRY_DELAY` | Retry lỗi SMTP tạm thời (backoff lũy thừa) |
| `GEMINI_API_KEY` | Placeholder cho tính năng AI tương lai (chưa dùng) |

`.env` đã nằm trong `.gitignore` — không commit thông tin bí mật.

---

## Tài liệu thêm

Thư mục `docs/` chứa: phạm vi hệ thống (`system_scope.md`), mô tả & sơ đồ use case, các giai đoạn phát triển, quy ước code (`code_conventions.md`), báo cáo tiến độ.
