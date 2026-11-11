# Quy Tắc Trình Bày Code — TableReserve

> **Mục đích:** Tài liệu này quy định các chuẩn mực viết code, đặt tên, cấu trúc file và chú thích áp dụng cho toàn bộ dự án. Mọi thành viên phải tuân thủ trước khi tạo Pull Request.

---

## 1. Nguyên Tắc Chung

| Nguyên tắc | Mô tả |
|---|---|
| **Rõ ràng hơn thông minh** | Ưu tiên code dễ đọc, dễ hiểu hơn code "clever" ngắn gọn |
| **Một trách nhiệm** | Mỗi hàm / class chỉ làm một việc duy nhất |
| **Không có số ma** | Tất cả hằng số phải được đặt tên (không viết thẳng `86400`, phải dùng `CANCELLATION_WINDOW_SECONDS = 86400`) |
| **Tự giải thích** | Tên biến / hàm phải đủ rõ để không cần comment giải thích *cái gì* — comment chỉ giải thích *tại sao* |
| **Xử lý lỗi bắt buộc** | Không bao giờ để lỗi âm thầm (silent exception). Luôn log hoặc re-raise |

---

## 2. Python (Backend — FastAPI)

### 2.1 Định dạng & Công cụ

| Công cụ | Mục đích | Cấu hình |
|---|---|---|
| **Black** | Auto-format code | `line-length = 88` |
| **isort** | Sắp xếp import | `profile = "black"` |
| **flake8** | Linting | `max-line-length = 88` |

```bash
# Chạy trước khi commit
black backend/
isort backend/
flake8 backend/
```

### 2.2 Đặt tên

```python
# ✅ Đúng
CANCELLATION_WINDOW_HOURS = 24          # Hằng số: SCREAMING_SNAKE_CASE
MAX_NEARBY_BRANCHES = 5

class ReservationStatus(str, enum.Enum): # Class: PascalCase
    PENDING = "PENDING"

class ReservationService:               # Class: PascalCase
    pass

def create_reservation(db, customer):   # Hàm: snake_case, verb đầu tiên
    pass

async def get_branch_lock(branch_id):   # Async hàm: vẫn snake_case
    pass

branch_id: int                          # Biến: snake_case, có type hint
available_tables: int

# ❌ Sai
def CreateReservation(): ...            # Không dùng PascalCase cho hàm
def rsv(d, c): ...                      # Không viết tắt mờ nghĩa
x = 86400                               # Không dùng số ma
```

### 2.3 Type Hints (bắt buộc)

```python
# ✅ Tất cả tham số và return type phải có type hint
from typing import Optional, List

def find_nearest_branches(
    customer_lat: float,
    customer_lon: float,
    branches: List[dict],
    limit: int = 5,
) -> List[dict]:
    ...

async def cancel_reservation(
    db: Session,
    reservation_id: int,
    customer: models.User,
) -> models.Reservation:
    ...

# ❌ Sai
def cancel_reservation(db, reservation_id, customer):
    ...
```

### 2.4 Docstring

```python
# ✅ Module-level docstring (bắt buộc cho mỗi file)
"""
reservation_service.py

Chứa toàn bộ business logic cho việc tạo, hủy, xác nhận và từ chối
đặt bàn. Sử dụng asyncio.Lock để ngăn race condition.
"""

# ✅ Docstring cho hàm phức tạp (dùng format Google Style)
async def create_reservation(
    db: Session,
    customer: models.User,
    branch_id: int,
    ...
) -> models.Reservation:
    """
    Tạo đặt bàn mới với cơ chế khóa tránh race condition.

    Args:
        db: SQLAlchemy session.
        customer: Người dùng đang đặt bàn.
        branch_id: ID chi nhánh muốn đặt.

    Returns:
        Đối tượng Reservation vừa tạo.

    Raises:
        HTTPException(409): Khi chi nhánh đã hết bàn trống.
        HTTPException(404): Khi chi nhánh không tồn tại.
    """
```

### 2.5 Cấu trúc Import

```python
# Thứ tự import (isort tự xử lý):
# 1. Standard library
import asyncio
import json
from datetime import datetime

# 2. Third-party
from fastapi import HTTPException
from sqlalchemy.orm import Session

# 3. Local
import models
from services.email_service import email_service
```

### 2.6 Hằng số — đặt ở đầu file hoặc file `constants.py`

```python
# ✅ Đúng
CANCELLATION_WINDOW_HOURS: int = 24
MAX_NEARBY_BRANCHES: int = 5
OSM_GRAPH_RADIUS_METERS: int = 10_000
AVG_DRIVING_SPEED_KMH: int = 40
JWT_EXPIRE_HOURS: int = 24

# ❌ Sai
if (res_time - now).total_seconds() < 86400:   # Số ma
```

### 2.7 Xử lý lỗi

```python
# ✅ Đúng — luôn raise HTTPException với detail rõ ràng
if branch.available_tables <= 0:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Xin lỗi, chi nhánh này đã hết bàn trống.",
    )

# ✅ Đúng — log exception trước khi xử lý
try:
    G = ox.graph_from_point(...)
except Exception as exc:
    logger.warning("OSMnx graph download failed: %s", exc)
    # fallback...

# ❌ Sai — nuốt exception
try:
    do_something()
except Exception:
    pass
```

### 2.8 Router & Endpoint

```python
# ✅ Mỗi endpoint phải có:
# - response_model rõ ràng
# - status_code tường minh (không mặc định 200 cho POST)
# - Dependency injection qua Depends()

@router.post("/reservations", response_model=schemas.ReservationResponse, status_code=201)
async def create_reservation_endpoint(
    data: schemas.ReservationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ...
```

---

## 3. JavaScript (Frontend)

### 3.1 Đặt tên

```javascript
// ✅ Đúng
const API_BASE = 'http://localhost:8000/api';   // Hằng: SCREAMING_SNAKE_CASE
let currentLat = null;                           // Biến: camelCase
let _branchMarkers = [];                         // Biến module-private: _camelCase

function initMap(lat, lng) { ... }               // Hàm: camelCase, verb đầu tiên
async function fetchNearbyBranches() { ... }     // Async hàm: vẫn camelCase

// ❌ Sai
var x = null;                                    // Không dùng var
function Init_Map() { ... }                      // Không dùng PascalCase/snake_case
```

### 3.2 `const` / `let` — không dùng `var`

```javascript
// ✅
const user = getUser();          // Giá trị không đổi → const
let currentPage = 1;             // Giá trị thay đổi → let

// ❌
var currentPage = 1;
```

### 3.3 Async/Await — không dùng callback lồng nhau

```javascript
// ✅ Đúng
async function loadReservations() {
    try {
        const data = await api.get('/customer/reservations');
        renderTable(data);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ❌ Sai — callback hell
api.get('/customer/reservations', function(data) {
    renderTable(data, function() { ... });
});
```

### 3.4 Chú thích trong JS

```javascript
// ✅ Comment giải thích TẠI SAO, không giải thích CÁI GÌ
// Reconnect sau 5 giây thay vì ngay lập tức để tránh bão kết nối
_reconnectTimer = setTimeout(() => _connectWS(onNewReservation), 5000);

// ❌ Comment thừa (code đã tự giải thích)
// Tăng currentPage lên 1
currentPage++;
```

### 3.5 Bảo mật — luôn escape HTML trước khi inject vào DOM

```javascript
// ✅ Bắt buộc dùng escHtml() cho mọi dữ liệu từ server
function escHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
}

// Ví dụ sử dụng
row.innerHTML = `<td>${escHtml(reservation.customer_name)}</td>`;

// ❌ Sai — XSS vulnerability
row.innerHTML = `<td>${reservation.customer_name}</td>`;
```

---

## 4. HTML

### 4.1 Cấu trúc chuẩn mỗi trang

```html
<!DOCTYPE html>
<html lang="vi">           <!-- ✅ lang phù hợp nội dung -->
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tên trang — TableReserve</title>   <!-- ✅ Format: "Tên trang — Tên hệ thống" -->
  <meta name="description" content="Mô tả ngắn gọn trang này.">
  <!-- CSS: Bootstrap trước, custom.css sau -->
  <link href="https://cdn.../bootstrap.min.css" rel="stylesheet">
  <link href="../css/custom.css" rel="stylesheet">
</head>
<body>
  <!-- Nội dung -->

  <!-- JS: Bootstrap bundle cuối cùng, sau đó các file JS local -->
  <script src="https://cdn.../bootstrap.bundle.min.js"></script>
  <script src="../js/auth.js"></script>
  <script src="../js/api.js"></script>
</body>
</html>
```

### 4.2 ID và Class

```html
<!-- ✅ ID: kebab-case, mô tả chức năng cụ thể -->
<button id="btn-gps-detect">Dùng GPS</button>
<div id="branches-list"></div>
<span id="nav-user-name"></span>

<!-- ✅ Class: dùng class Bootstrap hoặc custom từ custom.css -->
<div class="card branch-card">

<!-- ❌ Sai -->
<div id="div1">
<div class="myDiv">
```

### 4.3 Semantic HTML

```html
<!-- ✅ Đúng — dùng thẻ semantic -->
<nav class="navbar">...</nav>
<main class="container">...</main>
<section id="features">...</section>
<footer>...</footer>

<!-- ❌ Sai — div cho tất cả -->
<div class="navbar">...</div>
<div class="main">...</div>
```

---

## 5. CSS (`custom.css`)

### 5.1 Thứ tự khai báo trong block

```css
/* Thứ tự: Box model → Typography → Visual → Animation */
.card {
  /* 1. Box model */
  display: flex;
  width: 100%;
  padding: 24px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);

  /* 2. Typography */
  font-size: 14px;
  font-weight: 500;
  color: var(--text);

  /* 3. Visual */
  background: var(--bg-card);
  box-shadow: var(--shadow-card);

  /* 4. Animation */
  transition: transform var(--transition), box-shadow var(--transition);
}
```

### 5.2 CSS Variables — bắt buộc cho màu sắc và kích thước lặp lại

```css
/* ✅ Định nghĩa ở :root, dùng ở khắp nơi */
:root {
  --primary: #7c3aed;
  --radius: 14px;
}

.btn-primary { background: var(--primary); }

/* ❌ Sai — hardcode màu rải rác */
.btn-primary { background: #7c3aed; }
.card { background: #7c3aed; }
```

### 5.3 Không dùng `!important` (trừ override Bootstrap có lý do)

```css
/* ✅ Có thể dùng !important khi override Bootstrap */
.form-control:focus {
  box-shadow: 0 0 0 3px rgba(124,58,237,.2) !important; /* Override Bootstrap default */
}

/* ❌ Sai — dùng !important vì lười tăng specificity */
.my-button { color: red !important; }
```

---

## 6. API Design

### 6.1 URL Convention

```
# ✅ Đúng — RESTful, lowercase, dùng dấu gạch ngang
POST   /api/auth/register
GET    /api/customer/branches/nearby
POST   /api/customer/reservations
PATCH  /api/customer/reservations/{id}/cancel
GET    /api/restaurant/me/branches
PATCH  /api/restaurant/me/reservations/{id}/reject

# ❌ Sai
POST   /api/Auth/Register          # PascalCase
GET    /api/customer/getNearby     # Verb trong URL
POST   /api/cancelReservation      # Không RESTful
```

### 6.2 HTTP Status Code chuẩn

| Code | Dùng khi |
|---|---|
| `200 OK` | GET thành công, PATCH thành công |
| `201 Created` | POST tạo resource mới thành công |
| `400 Bad Request` | Dữ liệu đầu vào sai (validation) |
| `401 Unauthorized` | Chưa đăng nhập / token hết hạn |
| `403 Forbidden` | Đã đăng nhập nhưng không có quyền |
| `404 Not Found` | Resource không tồn tại |
| `409 Conflict` | Race condition, duplicate |
| `422 Unprocessable Entity` | Pydantic validation error (FastAPI tự xử lý) |

### 6.3 Response Format nhất quán

```json
// ✅ Lỗi luôn có trường "detail"
{ "detail": "Không thể hủy đặt bàn trước dưới 24 giờ." }

// ✅ Thành công trả về object hoặc list, không wrap thêm
{ "id": 1, "status": "PENDING", ... }
```

---

## 7. Database & Model

### 7.1 Đặt tên bảng và cột

```python
# ✅ Tên bảng: số nhiều, snake_case
class User(Base):
    __tablename__ = "users"

class Reservation(Base):
    __tablename__ = "reservations"

# ✅ Tên cột: snake_case
customer_id = Column(Integer, ForeignKey("users.id"))
reservation_time = Column(DateTime)
available_tables = Column(Integer)

# ❌ Sai
class User(Base):
    __tablename__ = "User"          # PascalCase
    customerID = Column(...)        # camelCase
```

### 7.2 Luôn khai báo `ondelete` cho ForeignKey

```python
# ✅
customer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

# ❌
customer_id = Column(Integer, ForeignKey("users.id"))
```

---

## 8. Git & Commit

### 8.1 Branch Naming

```
feature/ten-tinh-nang      # Tính năng mới
fix/mo-ta-loi              # Sửa bug
docs/ten-tai-lieu          # Cập nhật tài liệu
refactor/ten-phan          # Refactor không thay đổi behavior
```

### 8.2 Commit Message Format (Conventional Commits)

```
<type>(<scope>): <mô tả ngắn gọn bằng tiếng Việt>

# type: feat | fix | docs | refactor | test | chore
# scope: auth | customer | restaurant | dijkstra | email | ws | frontend

# Ví dụ:
feat(customer): thêm tính năng hủy đặt bàn với quy tắc 24 giờ
fix(dijkstra): xử lý fallback haversine khi graph OSMnx không tải được
docs(scope): cập nhật phạm vi hệ thống
refactor(reservation): tách logic khóa race condition ra hàm riêng
```

---

## 9. Bảo Mật

| Quy tắc | Chi tiết |
|---|---|
| **Không hardcode secret** | Mọi key, password đều phải đọc từ `.env` qua `os.getenv()` |
| **Không commit `.env`** | File `.env` phải có trong `.gitignore` |
| **Escape output** | Luôn dùng `escHtml()` trước khi inject vào DOM |
| **Validate server-side** | Không tin tưởng validation phía client, luôn validate Pydantic ở backend |
| **JWT expire** | Token phải có thời hạn (`exp`), không dùng token vĩnh viễn |
| **HTTPS production** | Khi deploy, bắt buộc dùng HTTPS; trong dev mới dùng HTTP |

---

## 10. Checklist Trước Khi Commit

- [ ] Code đã chạy `black` và `isort`
- [ ] Không có `print()` debug còn sót lại (dùng `logger` thay thế)
- [ ] Mọi hàm public có type hint
- [ ] Không có số ma trong code
- [ ] Mọi secret lấy từ `os.getenv()`
- [ ] HTML output đã escape qua `escHtml()`
- [ ] Commit message đúng format Conventional Commits
