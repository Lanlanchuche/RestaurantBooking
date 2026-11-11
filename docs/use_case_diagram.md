# Sơ đồ Use Case tổng thể — TableReserve

> Nguồn: `backend/routers/*` và `docs/system_scope.md`.
> Bản PlantUML chuẩn UML: [`use_case_diagram.puml`](./use_case_diagram.puml)

## 1. Sơ đồ

```mermaid
flowchart LR
    Guest(("Khách chưa<br/>đăng nhập"))
    Customer(("Khách hàng"))
    Owner(("Chủ nhà hàng"))
    System(("Hệ thống"))
    Ext(("OSM /<br/>Nominatim"))

    Guest <|-- Customer
    Guest <|-- Owner

    subgraph AUTH["Xác thực & Tài khoản"]
        UC01(["UC01 · Đăng ký tài khoản"])
        UC02(["UC02 · Đăng nhập"])
        UC03(["UC03 · Đăng xuất"])
        UC04(["UC04 · Xem / cập nhật hồ sơ"])
        UC05(["UC05 · Xóa tài khoản"])
    end

    subgraph CUS["Khách hàng"]
        UC10(["UC10 · Thiết lập vị trí<br/>(GPS / nhập địa chỉ)"])
        UC11(["UC11 · Tìm nhà hàng gần nhất"])
        UC12(["UC12 · Xem bản đồ &<br/>thông tin chi nhánh"])
        UC13(["UC13 · Đặt bàn"])
        UC14(["UC14 · Xem lịch sử /<br/>chi tiết đặt bàn"])
        UC15(["UC15 · Hủy đặt bàn<br/>(trước 24 giờ)"])
    end

    subgraph OWN["Chủ nhà hàng"]
        UC20(["UC20 · Tạo / cập nhật<br/>hồ sơ nhà hàng"])
        UC21(["UC21 · Quản lý chi nhánh<br/>(Thêm / Sửa / Xóa)"])
        UC22(["UC22 · Xem dashboard<br/>đặt bàn"])
        UC23(["UC23 · Nhận thông báo<br/>đặt bàn realtime"])
        UC24(["UC24 · Xác nhận đặt bàn"])
        UC25(["UC25 · Từ chối đặt bàn<br/>(kèm lý do)"])
    end

    subgraph SYS["Dịch vụ hệ thống"]
        UC30(["UC30 · Gửi email thông báo"])
        UC31(["UC31 · Phát sự kiện WebSocket"])
        UC32(["UC32 · Tính khoảng cách<br/>Dijkstra / Haversine"])
        UC33(["UC33 · Đồng bộ số bàn trống"])
        UC34(["UC34 · Khóa chi nhánh<br/>(asyncio.Lock)"])
    end

    Guest --> UC01
    Guest --> UC02

    Customer --> UC03
    Customer --> UC04
    Customer --> UC05
    Customer --> UC10
    Customer --> UC11
    Customer --> UC12
    Customer --> UC13
    Customer --> UC14
    Customer --> UC15

    Owner --> UC03
    Owner --> UC04
    Owner --> UC05
    Owner --> UC20
    Owner --> UC21
    Owner --> UC22
    Owner --> UC23
    Owner --> UC24
    Owner --> UC25

    UC11 -.->|include| UC10
    UC11 -.->|include| UC32
    UC10 -.- Ext

    UC13 -.->|include| UC34
    UC13 -.->|include| UC33
    UC13 -.->|include| UC30
    UC13 -.->|include| UC31

    UC15 -.->|include| UC33
    UC15 -.->|include| UC30

    UC24 -.->|include| UC30

    UC25 -.->|include| UC33
    UC25 -.->|include| UC30

    UC23 -.->|include| UC31

    UC30 -.- System
    UC31 -.- System
    UC32 -.- System
    UC33 -.- System
    UC34 -.- System
    UC32 -.- Ext
```

## 2. Danh sách Use Case

### 2.1 Dùng chung (Khách chưa đăng nhập)

| Mã | Use case | Tác nhân | API / Thành phần |
|---|---|---|---|
| UC01 | Đăng ký tài khoản (Customer / Restaurant Owner) | Khách chưa đăng nhập | `POST /api/auth/register` |
| UC02 | Đăng nhập | Khách chưa đăng nhập | `POST /api/auth/login` |
| UC03 | Đăng xuất | Khách hàng, Chủ nhà hàng | `frontend/js/auth.js` (xoá JWT) |
| UC04 | Xem / cập nhật hồ sơ | Khách hàng, Chủ nhà hàng | `GET/PUT /api/auth/me` |
| UC05 | Xóa tài khoản | Khách hàng, Chủ nhà hàng | `DELETE /api/auth/me` |

### 2.2 Khách hàng

| Mã | Use case | Tác nhân | API / Thành phần |
|---|---|---|---|
| UC10 | Thiết lập vị trí bằng GPS hoặc nhập địa chỉ | Khách hàng, Nominatim | `frontend/js/book.js` + Nominatim API |
| UC11 | Tìm 5 nhà hàng gần nhất | Khách hàng, Hệ thống | `GET /api/customer/branches/nearby` (Dijkstra) |
| UC12 | Xem bản đồ & thông tin chi nhánh | Khách hàng | Leaflet.js |
| UC13 | Đặt bàn | Khách hàng, Hệ thống | `POST /api/customer/reservations` |
| UC14 | Xem lịch sử / chi tiết đặt bàn | Khách hàng | `GET /api/customer/reservations[/{id}]` |
| UC15 | Hủy đặt bàn (trước 24 giờ) | Khách hàng, Hệ thống | `PATCH /api/customer/reservations/{id}/cancel` |

### 2.3 Chủ nhà hàng

| Mã | Use case | Tác nhân | API / Thành phần |
|---|---|---|---|
| UC20 | Tạo / cập nhật hồ sơ nhà hàng | Chủ nhà hàng | `POST /api/restaurant/`, `GET/PUT /api/restaurant/me` |
| UC21 | Quản lý chi nhánh (thêm / sửa / xóa) | Chủ nhà hàng | `/api/restaurant/me/branches` |
| UC22 | Xem dashboard đặt bàn | Chủ nhà hàng | `GET /api/restaurant/me/reservations` |
| UC23 | Nhận thông báo đặt bàn realtime | Hệ thống → Chủ nhà hàng | `WS /ws/restaurant/{id}` |
| UC24 | Xác nhận đặt bàn | Chủ nhà hàng, Hệ thống | `PATCH .../confirm` |
| UC25 | Từ chối đặt bàn (bắt buộc lý do) | Chủ nhà hàng, Hệ thống | `PATCH .../reject` |

### 2.4 Dịch vụ hệ thống

| Mã | Use case | Kích hoạt bởi |
|---|---|---|
| UC30 | Gửi email thông báo bất đồng bộ | UC13, UC15, UC24, UC25 |
| UC31 | Phát sự kiện WebSocket tới dashboard | UC13 |
| UC32 | Tính khoảng cách Dijkstra (fallback Haversine) | UC11 |
| UC33 | Đồng bộ `available_tables` | UC13 (−1), UC15 (+1), UC25 (+1) |
| UC34 | Khóa chi nhánh chống race condition | UC13 |

## 3. Quan hệ chính

- **Generalization:** Khách hàng và Chủ nhà hàng kế thừa các use case chung của "Khách chưa đăng nhập" (đăng ký, đăng nhập).
- **«include»:** Đặt bàn luôn bao gồm khóa chi nhánh, đồng bộ số bàn, gửi email và phát WebSocket.
- **«include»:** Hủy / Từ chối đặt bàn luôn bao gồm hoàn trả bàn và gửi email.
- **Tác nhân phụ:** Hệ thống (email, WebSocket, Dijkstra) và dịch vụ ngoài OSM/Nominatim.
