# Kế Hoạch Phân Chia Công Việc — 4 Thành Viên

> **Dự án:** TableReserve — Restaurant Booking System  
> **Nhóm:** 4 người  
> **Tổng thời gian ước tính:** ~3 tuần  
> **Nguyên tắc:** Phase 1 phải hoàn thành trước khi Phase 2 bắt đầu. Phase 2 các Dev làm song song độc lập nhau. Phase 3 là tích hợp chung.

---

## Tổng Quan Phân Công

| Thành viên | Tên gọi | Phụ trách chính | Kỹ năng yêu cầu |
|---|---|---|---|
| **Dev 1** | Foundation Dev | Nền tảng DB + Auth + Main app | Python, SQLAlchemy, JWT |
| **Dev 2** | Algorithm Dev | Dijkstra + Customer backend | Python, OSMnx/NetworkX, asyncio |
| **Dev 3** | Restaurant Dev | Restaurant backend + Email + WebSocket | Python, FastAPI WebSocket, smtplib |
| **Dev 4** | Frontend Dev | Toàn bộ giao diện | HTML/CSS/JS, Leaflet.js, Bootstrap 5 |

---

## Sơ Đồ Phụ Thuộc

```
Phase 1 ──────────────────────────────────────────────────────►
[DEV 1] database.py → models.py → schemas.py → auth.py → main.py
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
Phase 2 ────────────────────────────────────────────────────────►
[DEV 2]          Customer     [DEV 3]       [DEV 4]
              Backend+Dijkstra  Restaurant   Frontend
                                Backend+WS
                    └─────────────┴─────────────┘
                                  │
                                  ▼
Phase 3 ──────────────────────────────────────────────────────►
                    [ALL] Integration & Testing
```

---

## ═══════════════════════════════════════════
## PHASE 1 — Nền Tảng & Cấu Hình
### Thời gian: 2–3 ngày | Thành viên: DEV 1 (làm một mình)
## ═══════════════════════════════════════════

> ⚠️ **Ưu tiên cao nhất.** 3 người còn lại KHÔNG thể bắt đầu code cho đến khi Phase 1 hoàn thành.  
> Trong thời gian này, Dev 2/3/4 đọc tài liệu, cài môi trường, nghiên cứu thư viện.

### DEV 1 — Deliverables

#### 📁 `backend/database.py`
- Kết nối SQLite với WAL mode
- `SessionLocal`, `Base`, dependency `get_db()`

#### 📁 `backend/models.py`
- Enum: `UserRole`, `ReservationStatus`
- Model: `User`, `Restaurant`, `Branch`, `Reservation`
- Khai báo đầy đủ relationships, ForeignKey với `ondelete`

#### 📁 `backend/schemas.py`
- Pydantic v2 schemas cho **tất cả** request và response:
  - Auth: `UserRegister`, `UserLogin`, `Token`, `UserResponse`
  - Restaurant: `RestaurantCreate`, `RestaurantResponse`
  - Branch: `BranchCreate`, `BranchUpdate`, `BranchResponse`, `NearbyBranchResponse`
  - Reservation: `ReservationCreate`, `ReservationResponse`, `ReservationReject`
  - Generic: `MessageResponse`

#### 📁 `backend/auth.py`
- `get_password_hash()`, `verify_password()` — bcrypt
- `create_access_token()`, `decode_token()` — JWT (python-jose)
- Hằng số: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_HOURS`

#### 📁 `backend/dependencies.py`
- `get_current_user()` — FastAPI dependency, đọc Bearer token, trả về `models.User`

#### 📁 `backend/main.py` (skeleton)
- Khởi tạo FastAPI app
- CORS middleware
- Lifespan: `Base.metadata.create_all()`
- Mount các router (để trống function body, chỉ cần `include_router`)

#### 📁 `backend/routers/auth_router.py`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### ✅ Tiêu chí Done (Definition of Done — Phase 1)
- [ ] Chạy `uvicorn main:app --reload` không có lỗi
- [ ] `POST /api/auth/register` tạo user thành công, trả JWT
- [ ] `POST /api/auth/login` đăng nhập thành công
- [ ] `GET /api/auth/me` trả thông tin user từ token
- [ ] File `database.py`, `models.py`, `schemas.py`, `auth.py`, `dependencies.py` đã được **merge vào nhánh `main`**
- [ ] **Thông báo cho Dev 2, Dev 3, Dev 4** để bắt đầu Phase 2

---

## ═══════════════════════════════════════════
## PHASE 2 — Phát Triển Song Song
### Thời gian: 7–10 ngày | 3 thành viên làm đồng thời
## ═══════════════════════════════════════════

> ✅ **Điều kiện bắt đầu:** Phase 1 đã merge vào `main`.  
> Mỗi Dev tạo nhánh riêng: `feature/customer-backend`, `feature/restaurant-backend`, `feature/frontend`.

---

### 👤 DEV 2 — Customer Backend + Thuật Toán Dijkstra

**Nhánh Git:** `feature/customer-backend`

#### 📁 `backend/services/dijkstra_service.py`
**Đây là core algorithm — ưu tiên làm trước**

```
Nhiệm vụ:
├── Hàm _haversine(lat1, lon1, lat2, lon2) → float (metres)
├── Hàm _load_graph(lat, lon, radius_m) → NetworkX Graph
│     ├── Kiểm tra cache file .pkl trong backend/cache/osm_graphs/
│     ├── Nếu có → load từ file (offline)
│     └── Nếu chưa → OSMnx download + cache lại
└── Hàm find_nearest_branches(customer_lat, customer_lon, branches, limit) → List[dict]
      ├── Chạy Dijkstra qua networkx.shortest_path_length(..., method='dijkstra')
      ├── Fallback haversine nếu graph lỗi hoặc không có path
      └── Trả về list sắp xếp tăng dần theo distance_m
```

#### 📁 `backend/services/reservation_service.py`
**Bao gồm TẤT CẢ logic đặt bàn (cả confirm/reject để Dev 3 gọi vào)**

```
Nhiệm vụ:
├── _branch_locks: Dict[int, asyncio.Lock]  (toàn cục, thread-safe)
├── _get_branch_lock(branch_id) → asyncio.Lock
├── create_reservation(db, customer, branch_id, ...) → Reservation
│     ├── Acquire lock[branch_id]
│     ├── Kiểm tra available_tables > 0 → raise 409 nếu hết
│     ├── Gán table_number, INSERT reservation
│     ├── available_tables -= 1
│     ├── Gọi email_service.send_booking_received() (async task)
│     └── Gọi manager.broadcast_to_restaurant() (async task)
├── cancel_reservation(db, reservation_id, customer) → Reservation
│     ├── Kiểm tra quyền sở hữu
│     ├── Kiểm tra quy tắc 24 giờ → raise 400 nếu vi phạm
│     ├── Acquire lock, available_tables += 1
│     └── Gọi email_service.send_cancelled()
├── confirm_reservation(db, reservation_id, owner) → Reservation
│     ├── Kiểm tra PENDING
│     ├── UPDATE status = CONFIRMED
│     └── Gọi email_service.send_confirmed()
└── reject_reservation(db, reservation_id, reason, owner) → Reservation
      ├── Kiểm tra PENDING
      ├── Acquire lock, available_tables += 1
      ├── UPDATE status = REJECTED + rejection_reason
      └── Gọi email_service.send_rejected()
```

> 📌 **Lưu ý:** Dev 2 import `email_service` và `websocket_manager` từ Dev 3. Dùng **mock** (hàm rỗng) trong lúc Dev 3 chưa xong. Khi tích hợp sẽ bỏ mock.

#### 📁 `backend/routers/customer_router.py`

```
Endpoints cần implement:
├── GET  /api/customer/branches/nearby?lat=&lng=&limit=5
│         → Gọi dijkstra_service.find_nearest_branches()
├── POST /api/customer/reservations  (status 201)
│         → Gọi reservation_service.create_reservation()
├── GET  /api/customer/reservations?page=&limit=
│         → Query DB, filter by customer_id
├── GET  /api/customer/reservations/{id}
└── PATCH /api/customer/reservations/{id}/cancel
          → Gọi reservation_service.cancel_reservation()
```

#### ✅ Tiêu chí Done (Dev 2)
- [ ] `GET /api/customer/branches/nearby` trả về 5 chi nhánh sắp xếp theo khoảng cách
- [ ] `POST /api/customer/reservations` tạo đặt bàn, `available_tables` giảm 1
- [ ] Mở 2 tab đặt bàn cùng lúc → chỉ 1 thành công, 1 nhận 409
- [ ] `PATCH .../cancel` trả 400 nếu hủy trong vòng 24h
- [ ] `PATCH .../cancel` thành công nếu còn hơn 24h, `available_tables` tăng 1
- [ ] Unit test thủ công bằng Swagger `/docs`

---

### 👤 DEV 3 — Restaurant Backend + Email + WebSocket

**Nhánh Git:** `feature/restaurant-backend`

#### 📁 `backend/services/email_service.py`

```
Nhiệm vụ:
├── Class EmailService:
│     ├── __init__: đọc SMTP config từ .env
│     ├── _base_html(title, body) → str  (HTML template tối màu)
│     ├── _row(label, value) → str  (helper tạo info row)
│     ├── _send_sync(to, subject, html) → None  (blocking smtplib)
│     ├── _send(to, subject, html) → coroutine  (dùng run_in_executor)
│     ├── send_booking_received(customer, branch, reservation)
│     │     → Email to: customer + restaurant
│     ├── send_confirmed(customer, branch, reservation)
│     │     → Email to: customer
│     ├── send_rejected(customer, branch, reservation, reason)
│     │     → Email to: customer
│     └── send_cancelled(customer, branch, reservation)
│           → Email to: customer + restaurant
└── Singleton: email_service = EmailService()
```

> 📌 **Nếu SMTP chưa cấu hình:** In log ra console (không throw lỗi) để Dev 2 có thể test.

#### 📁 `backend/services/websocket_manager.py`

```
Nhiệm vụ:
├── Class ConnectionManager:
│     ├── _connections: Dict[int, List[WebSocket]]
│     ├── connect(websocket, restaurant_id) → None
│     ├── disconnect(websocket, restaurant_id) → None
│     └── broadcast_to_restaurant(restaurant_id, payload: dict) → None
│           (dọn dẹp dead connections sau khi send lỗi)
└── Singleton: manager = ConnectionManager()
```

#### 📁 `backend/routers/websocket_router.py`

```
Endpoint:
└── WS /ws/restaurant/{restaurant_id}?token=JWT
      ├── Validate token (soft-reject nếu invalid)
      ├── manager.connect(websocket, restaurant_id)
      ├── Loop: nhận text → echo pong nếu ping
      └── manager.disconnect() khi WebSocketDisconnect
```

#### 📁 `backend/routers/restaurant_router.py`

```
Endpoints cần implement:
├── POST   /api/restaurant/              → Tạo restaurant profile
├── GET    /api/restaurant/me            → Lấy thông tin nhà hàng
├── PUT    /api/restaurant/me            → Cập nhật nhà hàng
├── GET    /api/restaurant/me/branches   → Danh sách chi nhánh
├── POST   /api/restaurant/me/branches   → Thêm chi nhánh
├── PATCH  /api/restaurant/me/branches/{id}  → Sửa chi nhánh
│               (điều chỉnh available_tables khi total_tables thay đổi)
├── DELETE /api/restaurant/me/branches/{id}  → Xóa chi nhánh
├── GET    /api/restaurant/me/reservations?status=&page=&limit=
├── PATCH  /api/restaurant/me/reservations/{id}/confirm
│               → Gọi reservation_service.confirm_reservation()
└── PATCH  /api/restaurant/me/reservations/{id}/reject
              → Gọi reservation_service.reject_reservation()
```

#### ✅ Tiêu chí Done (Dev 3)
- [ ] `POST /api/restaurant/` + `GET /api/restaurant/me` hoạt động
- [ ] CRUD branches hoạt động, `available_tables` tự điều chỉnh khi sửa `total_tables`
- [ ] WebSocket: kết nối tới `ws://localhost:8000/ws/restaurant/1` không lỗi
- [ ] Confirm reservation → `GET .../reservations` trả status CONFIRMED
- [ ] Reject với reason rỗng → trả 422
- [ ] Email log ra console (không cần SMTP thật)

---

### 👤 DEV 4 — Toàn Bộ Frontend

**Nhánh Git:** `feature/frontend`

> 📌 **Chiến lược:** Dev 4 làm frontend với **hardcoded mock data** trước. Khi backend sẵn sàng sẽ thay bằng `api.get()`/`api.post()` thật. Không phụ thuộc vào Dev 2/3.

#### 📁 `frontend/css/custom.css`
**Làm đầu tiên — tất cả trang dùng chung**

```
Cần implement:
├── CSS Custom Properties (:root) — màu sắc, kích thước, shadow
├── Bootstrap 5 overrides: body, card, button, form, table, modal, navbar
├── Dark theme: --bg-base, --bg-card, --bg-input, --border, --primary, --accent
├── Component classes:
│     ├── .stat-card, .stat-icon-*
│     ├── .branch-card, .branch-rank, .distance-badge, .tables-badge
│     ├── .badge-pending/confirmed/rejected/cancelled
│     ├── .ws-indicator (connected/disconnected), .ws-dot (pulse animation)
│     ├── .auth-wrapper, .auth-card, .role-btn
│     ├── .hero, .hero-badge, .hero-cta-group
│     ├── .gradient-text
│     └── #map container + leaflet dark filter
├── Animations: fadeInUp, pulse-dot, highlightRow (row-new), shimmer (skeleton)
└── Responsive breakpoints (mobile-first)
```

#### 📁 `frontend/js/api.js`

```
Cần implement:
├── const API_BASE, WS_BASE
├── api.request(endpoint, options) → gắn Bearer token, handle 401 redirect
├── api.get/post/put/patch/delete shortcuts
├── api.wsUrl(path) → ws URL với token
├── showToast(message, type, duration) — Bootstrap Toast
├── setLoading(show, message) — full-page spinner overlay
├── fmtDateTime(dt) — format ngày giờ tiếng Việt
└── fmtStatus(status) — trả badge HTML
```

#### 📁 `frontend/js/auth.js`

```
Cần implement:
├── getUser(), getToken(), isLoggedIn()
├── setAuthData(token, user), clearAuth(), logout()
├── requireAuth(role) — guard + redirect nếu sai role
├── populateNavUser() — điền tên user vào navbar
└── redirectIfLoggedIn() — dùng trên trang login/register
```

#### 📁 `frontend/js/map.js`

```
Cần implement:
├── initMap(lat, lng) → Leaflet map instance
├── setCustomerMarker(lat, lng) — blue dot với pulse
├── clearBranchMarkers()
├── plotBranches(branches, customerLat, customerLng)
│     — Numbered colored markers (1-5) + dashed polylines
├── getGPSLocation() → Promise<{lat, lng}>
└── geocodeAddress(address) → Promise<{lat, lng}> (Nominatim API)
```

#### 📁 `frontend/js/dashboard.js`

```
Cần implement:
├── connectDashboardWS(restaurantId, onNewReservation)
├── disconnectDashboardWS()
├── _connectWS(onNewReservation) — với auto-reconnect 5s
├── _setWsStatus(connected) — cập nhật #ws-status indicator
├── buildReservationRow(r) → HTML string (hàng trong bảng dashboard)
└── Ping interval 25s để giữ kết nối alive
```

#### 📁 HTML Pages (thứ tự ưu tiên)

```
Ưu tiên 1 (làm trước):
├── login.html       — form đăng nhập, role-based redirect
├── register.html    — toggle Customer/Owner, restaurant fields
└── index.html       — landing page, hero + features + how-it-works

Ưu tiên 2:
├── customer/dashboard.html   — Navbar + Map + GPS/Address panel + 5 branch cards
├── customer/book.html        — Form đặt bàn (date, time, guest counter, dish chips)
└── customer/history.html     — Table + stats + filter + cancel modal

Ưu tiên 3:
├── restaurant/dashboard.html — Stats + WebSocket table + confirm/reject modal
└── restaurant/branches.html  — Branch list + main map + add/edit/delete modal
```

#### ✅ Tiêu chí Done (Dev 4)
- [ ] Tất cả trang hiển thị đúng giao diện dark theme, không lỗi console
- [ ] Login/register redirect đúng theo role
- [ ] Map hiển thị, GPS hoạt động, địa chỉ geocode được
- [ ] Dashboard WS indicator hiển thị trạng thái (connected/disconnected)
- [ ] Responsive trên màn hình mobile (≥ 375px)
- [ ] Tất cả form validation hiển thị lỗi rõ ràng

---

## ═══════════════════════════════════════════
## PHASE 3 — Tích Hợp & Kiểm Thử
### Thời gian: 3–4 ngày | Tất cả 4 thành viên
## ═══════════════════════════════════════════

### Thứ Tự Merge vào `main`

```
1. feature/restaurant-backend  →  main  (Dev 3 merge trước)
   └── Email + WebSocket services cần có để Dev 2's service hoạt động

2. feature/customer-backend    →  main  (Dev 2 merge sau)
   └── Reservation service gọi vào email + websocket

3. feature/frontend            →  main  (Dev 4 merge cuối)
   └── Kết nối API thật thay mock data
```

### Checklist Tích Hợp

#### 3.1 Frontend → Backend connection (Dev 4 + Dev 1)
- [ ] Thay `API_BASE` mock bằng `http://localhost:8000/api`
- [ ] Login/register gọi API thật, lưu JWT vào localStorage
- [ ] `requireAuth()` hoạt động, redirect đúng trang
- [ ] Navbar hiển thị tên user từ token

#### 3.2 Customer Flow (Dev 2 + Dev 4)
- [ ] Trang `customer/dashboard.html`: GPS → gọi `/api/customer/branches/nearby` → hiện map
- [ ] Trang `customer/book.html`: submit form → gọi `POST /api/customer/reservations`
- [ ] Trang `customer/history.html`: load từ `GET /api/customer/reservations`
- [ ] Nút Cancel → gọi `PATCH .../cancel`, hiện lỗi 24h nếu vi phạm

#### 3.3 Restaurant Flow (Dev 3 + Dev 4)
- [ ] Trang `restaurant/branches.html`: CRUD branches gọi API thật
- [ ] Trang `restaurant/dashboard.html`: kết nối WebSocket thật
- [ ] Confirm/Reject button gọi đúng endpoint
- [ ] Modal reject validate reason không rỗng

#### 3.4 End-to-End Scenarios (Cả nhóm test)

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| E2E-01 | Đăng ký customer → login → GPS → xem 5 nhà hàng trên map | Map hiển thị markers |
| E2E-02 | Đặt bàn → nhà hàng nhận ngay trên dashboard (không reload) | Row mới xuất hiện |
| E2E-03 | Mở 2 tab đặt cùng 1 bàn cùng lúc | 1 thành công, 1 nhận lỗi 409 |
| E2E-04 | Hủy bàn trong vòng 24h | Lỗi 400, thông báo rõ |
| E2E-05 | Hủy bàn trước 24h | Thành công, available_tables tăng |
| E2E-06 | Nhà hàng từ chối không nhập lý do | Form báo lỗi, không gửi |
| E2E-07 | Nhà hàng xác nhận đặt bàn | Status → CONFIRMED |
| E2E-08 | Thêm chi nhánh mới → xuất hiện trong Dijkstra search | Marker mới trên map |

---

## Lịch Thời Gian Gợi Ý

```
Tuần 1                Tuần 2                Tuần 3
Mo Tu We Th Fr   Mo Tu We Th Fr   Mo Tu We Th Fr
──────────────   ──────────────   ──────────────
[  Phase 1  ]   [────── Phase 2 ──────]   [Phase 3]
D1 D1 D1 D1 ✓   D2 D2 D2 D2 D2   ✓✓✓   I  I  I  ✓
               D3 D3 D3 D3 D3   ✓✓✓
               D4 D4 D4 D4 D4   ✓✓✓

D1=Dev1, D2=Dev2, D3=Dev3, D4=Dev4, I=Integration
✓ = Demo / Review ngày cuối
```

---

## Quy Tắc Làm Việc Nhóm

### Git Workflow

```bash
# Mỗi Dev tạo nhánh từ main
git checkout main
git pull origin main
git checkout -b feature/ten-cua-ban

# Commit hàng ngày (ngay cả code chưa xong)
git add .
git commit -m "feat(dijkstra): thêm haversine fallback khi graph lỗi"
git push origin feature/ten-cua-ban

# Không commit trực tiếp vào main
# Merge qua Pull Request
```

### Interface Contracts (Giao kèo giữa các Dev)

Để Dev 2 và Dev 3 không bị block nhau, thống nhất **interface** của các service trước khi code:

#### Dev 2 cần từ Dev 3

```python
# reservation_service.py gọi vào (Dev 2 dùng mock đến khi Dev 3 xong)

# Mock trong lúc chờ:
async def send_booking_received(customer, branch, reservation): pass
async def send_cancelled(customer, branch, reservation): pass
async def broadcast_to_restaurant(restaurant_id, payload): pass
```

#### Dev 3 cần từ Dev 2

```python
# restaurant_router.py gọi vào (Dev 3 dùng import thật)
from services.reservation_service import confirm_reservation, reject_reservation
```

#### Dev 4 cần từ Dev 1 + 2 + 3

```
Dev 4 không cần chờ backend. Làm với mock data:

const MOCK_BRANCHES = [
  { id:1, name:'Pho 24', distance_km:'0.8', available_tables:3, ... },
  ...
];

Khi Phase 3 bắt đầu → thay bằng: const branches = await api.get('/customer/branches/nearby?...')
```

### Điểm Đồng Bộ Nhóm

| Thời điểm | Hoạt động |
|---|---|
| **Cuối Phase 1** | Dev 1 demo auth flow. Merge + push `main`. Thông báo nhóm. |
| **Giữa Phase 2 (ngày 3-4)** | Mỗi Dev demo tiến độ, báo cáo blocking issues |
| **Cuối Phase 2** | Mỗi Dev demo module của mình độc lập. Code review chéo. |
| **Cuối Phase 3** | Chạy toàn bộ 8 kịch bản E2E. Demo cuối. |

---

## Bảng Tóm Tắt File Ownership

| File | Owner | Phase |
|---|---|---|
| `backend/database.py` | **Dev 1** | 1 |
| `backend/models.py` | **Dev 1** | 1 |
| `backend/schemas.py` | **Dev 1** | 1 |
| `backend/auth.py` | **Dev 1** | 1 |
| `backend/dependencies.py` | **Dev 1** | 1 |
| `backend/main.py` | **Dev 1** | 1 |
| `backend/routers/auth_router.py` | **Dev 1** | 1 |
| `backend/services/dijkstra_service.py` | **Dev 2** | 2 |
| `backend/services/reservation_service.py` | **Dev 2** | 2 |
| `backend/routers/customer_router.py` | **Dev 2** | 2 |
| `backend/services/email_service.py` | **Dev 3** | 2 |
| `backend/services/websocket_manager.py` | **Dev 3** | 2 |
| `backend/routers/restaurant_router.py` | **Dev 3** | 2 |
| `backend/routers/websocket_router.py` | **Dev 3** | 2 |
| `frontend/css/custom.css` | **Dev 4** | 2 |
| `frontend/js/api.js` | **Dev 4** | 2 |
| `frontend/js/auth.js` | **Dev 4** | 2 |
| `frontend/js/map.js` | **Dev 4** | 2 |
| `frontend/js/dashboard.js` | **Dev 4** | 2 |
| `frontend/index.html` | **Dev 4** | 2 |
| `frontend/login.html` | **Dev 4** | 2 |
| `frontend/register.html` | **Dev 4** | 2 |
| `frontend/customer/dashboard.html` | **Dev 4** | 2 |
| `frontend/customer/book.html` | **Dev 4** | 2 |
| `frontend/customer/history.html` | **Dev 4** | 2 |
| `frontend/restaurant/dashboard.html` | **Dev 4** | 2 |
| `frontend/restaurant/branches.html` | **Dev 4** | 2 |

> **Quy tắc:** Chỉ owner mới được chỉnh sửa file của mình. Nếu cần thay đổi file của người khác → tạo Pull Request và tag owner vào review.
