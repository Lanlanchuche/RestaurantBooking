# Use Case Descriptions — TableReserve

> Tài liệu mô tả chi tiết use case của hệ thống đặt bàn nhà hàng TableReserve.
> Nguồn đối chiếu: `backend/routers/*`, `backend/services/*`, `frontend/js/*`.
> Sơ đồ liên quan: [`use_case_diagram.puml`](./use_case_diagram.puml) · [`use_case_diagram.md`](./use_case_diagram.md)

## Mục lục

| Mã | Tên use case | Actor chính |
|---|---|---|
| UC01 | Đăng ký tài khoản | Khách chưa đăng nhập |
| UC02 | Đăng nhập | Khách hàng / Chủ nhà hàng |
| UC11 | Tìm chi nhánh gần nhất | Khách hàng |
| UC13 | Đặt bàn | Khách hàng |
| UC15 | Hủy đặt bàn | Khách hàng |
| UC14 | Xem lịch sử đặt bàn | Khách hàng |
| UC21 | Quản lý chi nhánh | Chủ nhà hàng |
| UC22 | Xem real-time dashboard | Chủ nhà hàng |
| UC24 | Duyệt đơn đặt bàn | Chủ nhà hàng |

---

## UC01 — Đăng ký tài khoản

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC01 |
| **Tên use case** | Đăng ký tài khoản |
| **Actor** | Khách chưa đăng nhập (đăng ký với vai trò **Khách hàng** hoặc **Chủ nhà hàng**) |
| **Brief description** | Người dùng tạo tài khoản mới. Hệ thống tạo bản ghi `User` và hồ sơ tương ứng (`Customer` hoặc `Restaurant`) trong **cùng một transaction**, sau đó yêu cầu đăng nhập lại. |
| **Pre-conditions** | 1. Người dùng chưa đăng nhập.<br>2. Email chưa tồn tại trong hệ thống.<br>3. Email đúng định dạng, mật khẩu tối thiểu 6 ký tự (kiểm tra ở frontend).<br>4. Nếu chọn vai trò Chủ nhà hàng: đã có tên nhà hàng. |
| **Post-conditions** | 1. Tạo mới một `User` với mật khẩu đã băm (bcrypt), `is_active = true`.<br>2. Tạo hồ sơ `Customer` hoặc `Restaurant` liên kết 1-1 với user.<br>3. Không tự động đăng nhập; người dùng được chuyển sang trang đăng nhập.<br>4. Nếu có bất kỳ lỗi nào, toàn bộ transaction bị rollback (không tạo tài khoản thiếu hồ sơ). |

### Main flow

1. Người dùng mở `register.html`.
2. Chọn vai trò: **Khách hàng** hoặc **Chủ nhà hàng**.
3. Nhập họ tên, email, mật khẩu và xác nhận mật khẩu.
4. Nếu chọn **Chủ nhà hàng**: nhập tên nhà hàng (bắt buộc), email/SĐT nhà hàng (tùy chọn).
5. Nếu chọn **Khách hàng**: nhập số điện thoại, địa chỉ (tùy chọn).
6. Frontend kiểm tra dữ liệu và gửi `POST /api/auth/register`.
7. Backend kiểm tra: email chưa tồn tại, vai trò hợp lệ, họ tên không rỗng, chủ nhà hàng phải có tên nhà hàng.
8. Backend băm mật khẩu bằng bcrypt, tạo `User` và `flush()` để lấy `id`.
9. Backend tạo hồ sơ `Customer` hoặc `Restaurant` trong cùng transaction.
10. Commit và trả `201` kèm thông tin user (không trả mật khẩu/hash).
11. Frontend xoá phiên cũ, hiển thị thông báo thành công và chuyển tới `login.html?registered=1&email=...`.

### Alternative / Exception flow

- **A1 — Đăng ký Khách hàng:** bỏ qua bước nhập tên nhà hàng; tạo hồ sơ `Customer`.
- **E1 — Email đã tồn tại:** trả `400` "Email này đã được đăng ký."
- **E2 — Vai trò không hợp lệ:** trả `400` "Vai trò tài khoản không hợp lệ."
- **E3 — Chủ nhà hàng thiếu tên nhà hàng:** trả `400` "Vui lòng nhập tên nhà hàng."
- **E4 — Họ tên rỗng:** trả `400` "Vui lòng nhập họ và tên."
- **E5 — Lỗi ghi database / trùng email đồng thời:** rollback, trả `400` hoặc `500`; không để lại tài khoản nửa vời.
- **E6 — Mất kết nối backend:** hiển thị lỗi; không còn cơ chế đăng ký offline.

### Special requirements

- Mật khẩu phải được băm bằng bcrypt, không lưu plaintext.
- Transaction nguyên tử: `User` + profile phải cùng thành công hoặc cùng thất bại.
- Email là duy nhất (ràng buộc DB).
- Không trả về `hashed_password` trong response.

### Extension points

- **EP1 — Đăng ký Chủ nhà hàng:** có thể mở rộng sang bổ sung hồ sơ nhà hàng chi tiết (UC20).
- **EP2 — Xác thực email:** có thể bổ sung bước gửi email kích hoạt tài khoản (ngoài phạm vi hiện tại).

---

## UC02 — Đăng nhập

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC02 |
| **Tên use case** | Đăng nhập |
| **Actor** | Khách hàng, Chủ nhà hàng |
| **Brief description** | Người dùng xác thực bằng email/mật khẩu. Hệ thống cấp JWT và điều hướng về dashboard tương ứng với vai trò. |
| **Pre-conditions** | 1. Tài khoản đã được đăng ký trong database.<br>2. Tài khoản đang hoạt động (`is_active = true`).<br>3. Tài khoản có hồ sơ tương ứng (`Customer` hoặc `Restaurant`). |
| **Post-conditions** | 1. JWT được tạo và trả về (hạn 7 ngày).<br>2. Frontend lưu `token` + thông tin `user` vào `localStorage`.<br>3. Người dùng được chuyển tới dashboard theo vai trò. |

### Main flow

1. Người dùng mở `login.html`.
2. Nhập email và mật khẩu, bấm **Đăng nhập**.
3. Frontend kiểm tra dữ liệu không rỗng rồi gửi `POST /api/auth/login`.
4. Backend tìm user theo email (đã trim khoảng trắng).
5. Backend kiểm tra `is_active`.
6. Backend so khớp mật khẩu bằng bcrypt.
7. Backend kiểm tra hồ sơ tương ứng với vai trò tồn tại.
8. Backend tạo JWT chứa `sub = email`, `role`; thời hạn 7 ngày.
9. Backend trả `access_token` + thông tin user (`name`, `phone`, `address`).
10. Frontend lưu phiên và chuyển hướng: Khách hàng → `customer/dashboard.html`, Chủ nhà hàng → `restaurant/dashboard.html`.

### Alternative / Exception flow

- **E1 — Email chưa đăng ký:** trả `404` "Tài khoản chưa được đăng ký. Vui lòng đăng ký tài khoản trước khi đăng nhập."
- **E2 — Sai mật khẩu:** trả `401` "Mật khẩu không chính xác."
- **E3 — Tài khoản bị vô hiệu hóa:** trả `403` "Tài khoản đã bị vô hiệu hóa."
- **E4 — Chủ nhà hàng chưa có hồ sơ nhà hàng:** trả `403` kèm hướng dẫn đăng ký lại/liên hệ quản trị.
- **E5 — Khách hàng chưa có hồ sơ:** trả `403`.
- **E6 — Không kết nối được backend:** hiển thị lỗi; không cho đăng nhập offline.
- **E7 — Token demo cũ (`local-demo-token`):** bị coi là không hợp lệ và tự động xoá.

### Special requirements

- JWT dùng thuật toán HS256, hạn 7 ngày.
- Mật khẩu so khớp bằng bcrypt.
- Phân quyền theo `role` ở cả frontend (điều hướng) và backend (dependency `get_current_restaurant_owner`).
- Không lưu mật khẩu dưới bất kỳ hình thức plaintext nào.

### Extension points

- **EP1 — Quên mật khẩu / đổi mật khẩu:** ngoài phạm vi phiên bản hiện tại.
- **EP2 — Cập nhật hồ sơ sau đăng nhập:** UC04 (`PUT /api/auth/me`).

---

## UC11 — Tìm chi nhánh gần nhất

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC11 |
| **Tên use case** | Tìm chi nhánh gần nhất |
| **Actor** | Khách hàng (chính); Hệ thống Dijkstra, Nominatim/OpenStreetMap (phụ) |
| **Brief description** | Từ vị trí hiện tại (GPS hoặc địa chỉ nhập tay), hệ thống tính khoảng cách đường bộ thực tế bằng thuật toán Dijkstra trên graph OSM và trả về tối đa 5 chi nhánh đang hoạt động gần nhất kèm khoảng cách, thời gian ước tính. |
| **Pre-conditions** | 1. Khách hàng đã đăng nhập.<br>2. Xác định được tọa độ (GPS hoặc geocode thành công).<br>3. Có ít nhất một chi nhánh `is_active = true`. |
| **Post-conditions** | 1. Trả danh sách tối đa 5 chi nhánh, sắp xếp tăng dần theo khoảng cách.<br>2. Mỗi phần tử gồm thông tin chi nhánh, `distance_km`, `estimated_time_minutes`.<br>3. Frontend hiển thị bản đồ Leaflet với marker đánh số 1–5.<br>4. Không thay đổi dữ liệu trong database. |

### Main flow

1. Khách hàng mở trang đặt bàn (`book.html`).
2. Chọn **Dùng vị trí hiện tại** hoặc nhập địa chỉ.
3. Nếu dùng GPS: trình duyệt lấy `latitude`, `longitude` hiện tại.
4. Nếu nhập tay: frontend gọi Nominatim để geocode địa chỉ thành tọa độ.
5. Frontend gọi `GET /api/customer/branches/nearby?lat=...&lng=...&limit=5`.
6. Backend xác thực JWT và hồ sơ khách hàng.
7. Backend lấy toàn bộ chi nhánh đang hoạt động.
8. Backend tải graph mạng lưới đường bộ OSM (đã cache `.graphml`), ánh xạ tọa độ khách và từng chi nhánh về node gần nhất.
9. Chạy Dijkstra để tính khoảng cách đường bộ; nếu graph không khả dụng thì fallback Haversine.
10. Tính `distance_km` và `estimated_time_minutes` (vận tốc trung bình 30 km/h).
11. Sắp xếp tăng dần, lấy tối đa 5 kết quả và trả về.
12. Frontend render danh sách + marker + đường nối từ vị trí khách tới các chi nhánh.

### Alternative / Exception flow

- **A1 — Người dùng từ chối quyền GPS:** chuyển sang nhập địa chỉ thủ công.
- **A2 — Geocode địa chỉ thất bại:** thông báo không tìm thấy địa chỉ, yêu cầu nhập lại.
- **E1 — `lat`/`lng` ngoài phạm vi hợp lệ:** trả `422`.
- **E2 — Không có chi nhánh đang hoạt động:** trả danh sách rỗng; frontend hiển thị thông báo.
- **E3 — Không tải được graph OSM:** tự động fallback Haversine, không báo lỗi cho người dùng.
- **E4 — Token hết hạn/không hợp lệ:** trả `401`, frontend chuyển về trang đăng nhập.
- **E5 — Lỗi khác trong quá trình tính toán:** trả `500` "Không thể tìm chi nhánh gần nhất."

### Special requirements

- Dijkstra chạy trên graph OSM được cache trên disk — chỉ tải lần đầu.
- Fallback Haversine đảm bảo chức năng vẫn hoạt động khi thiếu graph.
- Nominatim là dịch vụ miễn phí, có giới hạn tần suất.
- Chỉ xét các chi nhánh `is_active = true`.
- `limit` nằm trong khoảng 1–5.

### Extension points

- **EP1 — Xem chi tiết chi nhánh:** mở rộng hiển thị địa chỉ, số điện thoại, giờ mở cửa.
- **EP2 — Đặt bàn tại chi nhánh đã chọn:** chuyển sang UC13 với `branch_id` được chọn.

---

## UC13 — Đặt bàn

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC13 |
| **Tên use case** | Đặt bàn |
| **Actor** | Khách hàng (chính); Hệ thống Email, WebSocket, khóa chi nhánh (phụ) |
| **Brief description** | Khách hàng tạo đơn đặt bàn tại một chi nhánh. Hệ thống giữ 1 bàn, tạo đơn ở trạng thái `PENDING`, gửi email cho khách và nhà hàng, đồng thời đẩy sự kiện realtime tới dashboard nhà hàng. |
| **Pre-conditions** | 1. Khách hàng đã đăng nhập.<br>2. Đã chọn chi nhánh đang hoạt động và còn bàn trống.<br>3. Thời gian đặt bàn ở tương lai.<br>4. Số khách ≥ 1.<br>5. Đã nhập họ tên và số điện thoại liên hệ. |
| **Post-conditions** | 1. Tạo bản ghi `Reservation` với trạng thái `PENDING`.<br>2. `available_tables` của chi nhánh giảm 1.<br>3. Họ tên/số điện thoại liên hệ được cập nhật vào hồ sơ khách hàng.<br>4. Email được gửi bất đồng bộ cho khách hàng và chủ nhà hàng.<br>5. Sự kiện WebSocket `new_reservation` được phát tới dashboard nhà hàng.<br>6. Khách hàng nhận mã đặt chỗ và vé xác nhận trên giao diện. |

### Main flow

1. Khách hàng chọn một chi nhánh từ danh sách gần nhất.
2. Chọn ngày, giờ, số khách; nhập họ tên, số điện thoại liên hệ và yêu cầu đặc biệt (tùy chọn).
3. Frontend kiểm tra tên, số điện thoại, ngày giờ hợp lệ.
4. Frontend gửi `POST /api/customer/reservations` với `branch_id`, `reservation_time`, `guest_count`, `customer_name`, `customer_phone`, `special_request`.
5. Backend xác thực JWT, lấy hồ sơ khách hàng; chuẩn hoá tên/số điện thoại (tối đa 15 ký tự).
6. Backend chuẩn hoá thời gian về UTC và kiểm tra thời gian ở tương lai.
7. Backend lấy `asyncio.Lock` của chi nhánh (chống race condition).
8. Trong vùng khóa: kiểm tra chi nhánh tồn tại, đang hoạt động, `available_tables` hợp lệ và > 0.
9. Cập nhật họ tên/số điện thoại vào hồ sơ `Customer`.
10. Tạo `Reservation` trạng thái `PENDING`, giảm `available_tables` đi 1, commit transaction.
11. Nạp đầy đủ thông tin khách/chi nhánh và tạo background task: gửi email cho khách, gửi email cho nhà hàng, phát sự kiện WebSocket.
12. Trả `201` kèm đơn đặt bàn; frontend hiển thị vé xác nhận và lưu vào lịch sử.

### Alternative / Exception flow

- **E1 — Chi nhánh hết bàn:** trả `409` "Xin lỗi, chi nhánh này đã hết bàn trống."; không giảm số bàn.
- **E2 — Chi nhánh không tồn tại:** trả `404`.
- **E3 — Chi nhánh ngừng hoạt động:** trả `400`.
- **E4 — Thời gian ở quá khứ:** trả `400` "Thời gian đặt bàn phải ở trong tương lai."
- **E5 — Số khách < 1:** trả `400`/`422`.
- **E6 — Số điện thoại dài quá 15 ký tự:** trả `400`.
- **E7 — Gửi email thất bại:** chỉ ghi log; transaction đặt bàn vẫn thành công (BR-07).
- **E8 — Hai khách đặt cùng lúc khi còn 1 bàn:** khóa chi nhánh đảm bảo chỉ một request thành công; request còn lại nhận `409`.

### Special requirements

- Chống race condition bằng `asyncio.Lock` theo từng `branch_id`.
- Ràng buộc `0 ≤ available_tables ≤ total_tables`.
- Email/WebSocket chạy bất đồng bộ, không làm hỏng transaction chính.
- Transaction tạo đơn và giảm số bàn phải nguyên tử.
- Thời gian lưu trong DB là UTC; hiển thị theo UTC+7.

### Extension points

- **EP1 — Hủy đơn sau khi đặt:** UC15.
- **EP2 — Xem lịch sử đặt bàn:** UC14.
- **EP3 — Nhà hàng duyệt đơn:** UC24.

---

## UC15 — Hủy đặt bàn

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC15 |
| **Tên use case** | Hủy đặt bàn |
| **Actor** | Khách hàng (chính); Hệ thống Email, khóa chi nhánh (phụ) |
| **Brief description** | Khách hàng hủy một đơn đặt bàn còn ít nhất 24 giờ trước giờ đặt. Hệ thống hoàn trả bàn và gửi email thông báo cho cả khách hàng và nhà hàng. |
| **Pre-conditions** | 1. Khách hàng đã đăng nhập.<br>2. Đơn đặt bàn thuộc về khách hàng.<br>3. Trạng thái đơn là `PENDING` hoặc `CONFIRMED`.<br>4. Còn ít nhất 24 giờ trước `reservation_time`. |
| **Post-conditions** | 1. Trạng thái đơn chuyển thành `CANCELLED`.<br>2. `available_tables` của chi nhánh tăng 1 (không vượt `total_tables`).<br>3. Email hủy được gửi bất đồng bộ cho khách hàng và nhà hàng.<br>4. Giao diện lịch sử cập nhật badge "Đã hủy". |

### Main flow

1. Khách hàng mở trang lịch sử đặt bàn.
2. Chọn một đơn `PENDING`/`CONFIRMED` còn đủ điều kiện hủy và bấm **Hủy**.
3. Frontend xác nhận thao tác và gửi `PATCH /api/customer/reservations/{id}/cancel`.
4. Backend tìm đơn theo `reservation_id` và `customer_id`.
5. Backend kiểm tra trạng thái đơn hợp lệ để hủy.
6. Backend kiểm tra quy tắc 24 giờ.
7. Backend lấy khóa chi nhánh, truy vấn lại đơn và kiểm tra lại trạng thái + quy tắc 24 giờ trong vùng khóa.
8. Backend kiểm tra dữ liệu bàn của chi nhánh nhất quán.
9. Tăng `available_tables` lên 1, đặt trạng thái `CANCELLED`, commit.
10. Tạo background task gửi email hủy cho khách hàng và nhà hàng.
11. Trả `200` kèm đơn đã cập nhật; frontend cập nhật danh sách.

### Alternative / Exception flow

- **E1 — Không tìm thấy đơn hoặc đơn không thuộc khách hàng:** trả `404`.
- **E2 — Trạng thái không hợp lệ (đã hủy/đã từ chối):** trả `400` "Đơn đặt bàn này đã được xử lý hoặc đã hủy."
- **E3 — Còn dưới 24 giờ:** trả `400` "Không thể hủy đặt bàn khi còn dưới 24 giờ."
- **E4 — Dữ liệu số bàn không nhất quán:** trả `500`, không thay đổi dữ liệu.
- **E5 — Gửi email thất bại:** chỉ ghi log, không ảnh hưởng kết quả hủy.

### Special requirements

- Tuân thủ **BR-01** (24 giờ) và **BR-06** (chỉ hủy `PENDING`/`CONFIRMED`).
- Kiểm tra lại điều kiện bên trong khóa chi nhánh để tránh race condition.
- `available_tables` không được vượt quá `total_tables`.

### Extension points

- **EP1 — Đặt lại bàn mới:** sau khi hủy, khách có thể chuyển sang UC13.
- **EP2 — Gửi email gợi ý đặt lại:** có thể bổ sung trong tương lai.

---

## UC14 — Xem lịch sử đặt bàn

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC14 |
| **Tên use case** | Xem lịch sử đặt bàn |
| **Actor** | Khách hàng |
| **Brief description** | Khách hàng xem danh sách các đơn đã đặt của mình, có phân trang, lọc theo trạng thái và xem chi tiết từng đơn. |
| **Pre-conditions** | 1. Khách hàng đã đăng nhập.<br>2. Có hồ sơ khách hàng tương ứng. |
| **Post-conditions** | 1. Danh sách đơn được hiển thị, mới nhất trước.<br>2. Không thay đổi dữ liệu.<br>3. Khách hàng có thể mở chi tiết đơn hoặc hủy đơn nếu đủ điều kiện. |

### Main flow

1. Khách hàng mở `customer/history.html`.
2. Frontend kiểm tra đăng nhập và gọi `GET /api/customer/reservations?page=1&limit=20&status=...`.
3. Backend xác thực JWT và lấy hồ sơ khách hàng.
4. Backend truy vấn các đơn theo `customer_id`, lọc trạng thái (nếu có), sắp xếp theo `reservation_time` giảm dần rồi `id` giảm dần.
5. Backend trả danh sách kèm thông tin chi nhánh và khách hàng.
6. Frontend render danh sách: mã đơn, chi nhánh, thời gian, số khách, trạng thái, nút hành động.
7. Khách hàng chọn một đơn → `GET /api/customer/reservations/{id}` → hiển thị modal chi tiết.

### Alternative / Exception flow

- **A1 — Chưa có đơn nào:** hiển thị trạng thái rỗng và gợi ý đặt bàn.
- **A2 — Lọc theo trạng thái:** gửi thêm query `status`, backend lọc tương ứng.
- **E1 — `page`/`limit` không hợp lệ:** trả `422`; `limit` bị giới hạn tối đa 100.
- **E2 — Token hết hạn:** trả `401`, frontend chuyển về đăng nhập.
- **E3 — Đơn không tồn tại/không thuộc khách:** trả `404`.

### Special requirements

- Mặc định 20 đơn/trang, tối đa 100.
- Chỉ trả về đơn thuộc đúng khách hàng đang đăng nhập.
- Sắp xếp mới nhất trước.
- Hỗ trợ lọc theo `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`.

### Extension points

- **EP1 — Hủy đơn:** UC15 nếu đơn đủ điều kiện.
- **EP2 — Xem chi tiết đơn:** modal chi tiết với thông tin bàn, món/yêu cầu đặc biệt, lý do từ chối.

---

## UC21 — Quản lý chi nhánh

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC21 |
| **Tên use case** | Quản lý chi nhánh |
| **Actor** | Chủ nhà hàng |
| **Brief description** | Chủ nhà hàng xem, thêm, sửa, xóa các chi nhánh thuộc nhà hàng của mình; chọn vị trí trên bản đồ; số bàn trống được đồng bộ tự động khi thay đổi tổng số bàn. |
| **Pre-conditions** | 1. Đã đăng nhập với vai trò `RESTAURANT_OWNER`.<br>2. Đã có hồ sơ nhà hàng (`Restaurant`). |
| **Post-conditions** | 1. Danh sách chi nhánh và bản đồ được cập nhật.<br>2. Với chi nhánh mới: `available_tables = total_tables`.<br>3. Khi sửa `total_tables`: `available_tables` được điều chỉnh theo chênh lệch và luôn nằm trong `[0, total_tables]`.<br>4. Khi xóa: chi nhánh và các đơn đặt bàn liên quan bị xóa theo (cascade). |

### Main flow

1. Chủ nhà hàng mở `restaurant/branches.html`.
2. Frontend gọi `GET /api/restaurant/me/branches`.
3. Backend xác thực quyền owner, lấy nhà hàng của owner và trả danh sách chi nhánh.
4. Frontend hiển thị danh sách + marker trên bản đồ Leaflet.
5. **Thêm chi nhánh:** mở modal, nhập tên, địa chỉ, tọa độ (click bản đồ hoặc geocode), tổng số bàn → `POST /api/restaurant/me/branches`.
6. Backend kiểm tra hồ sơ nhà hàng, tạo `Branch` với `available_tables = total_tables`.
7. **Sửa chi nhánh:** `PATCH /api/restaurant/me/branches/{id}`. Nếu chỉ đổi `total_tables`, backend tính chênh lệch và điều chỉnh `available_tables`, sau đó kẹp trong `[0, total_tables]`.
8. **Xóa chi nhánh:** `DELETE /api/restaurant/me/branches/{id}`; backend kiểm tra quyền sở hữu rồi xóa.
9. Frontend tải lại danh sách, marker và thông báo kết quả.

### Alternative / Exception flow

- **E1 — Chưa có hồ sơ nhà hàng:** trả `404` "Chưa có hồ sơ nhà hàng".
- **E2 — Chi nhánh không tồn tại hoặc không thuộc sở hữu:** trả `404`.
- **E3 — `total_tables` ≤ 0:** trả `422`.
- **E4 — Tọa độ/địa chỉ không hợp lệ:** trả `422`.
- **E5 — Tài khoản không phải chủ nhà hàng gọi API:** trả `403`.
- **E6 — Xóa chi nhánh còn đơn đặt bàn:** các đơn liên quan bị xóa theo cascade; frontend cần cảnh báo trước khi xác nhận.

### Special requirements

- Chỉ chủ sở hữu mới thao tác được trên chi nhánh của mình (kiểm tra `restaurant.owner_id`).
- Mỗi tài khoản chủ nhà hàng chỉ liên kết với một nhà hàng (BR-03).
- Đồng bộ `available_tables` theo **SYS-02**: thêm = `total`, sửa `total` = cộng/trừ chênh lệch, luôn kẹp `[0, total]`.
- Xóa chi nhánh là thao tác không thể hoàn tác.

### Extension points

- **EP1 — Xem dashboard lọc theo chi nhánh:** UC22.
- **EP2 — Xem đơn đặt bàn của chi nhánh:** liên kết sang danh sách đơn đã lọc.

---

## UC22 — Xem real-time dashboard

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC22 |
| **Tên use case** | Xem real-time dashboard (bao gồm UC23 — Nhận thông báo đặt bàn realtime) |
| **Actor** | Chủ nhà hàng (chính); Hệ thống WebSocket (phụ) |
| **Brief description** | Chủ nhà hàng theo dõi danh sách đơn đặt bàn trên dashboard, nhận đơn mới ngay khi phát sinh qua WebSocket, xem thống kê và lọc/tìm kiếm đơn. |
| **Pre-conditions** | 1. Đã đăng nhập với vai trò `RESTAURANT_OWNER`.<br>2. Có hồ sơ nhà hàng để lấy `restaurant_id`.<br>3. Có token hợp lệ để mở kết nối WebSocket. |
| **Post-conditions** | 1. Dashboard hiển thị danh sách đơn, thống kê theo trạng thái và bộ lọc.<br>2. Đơn mới xuất hiện trong bảng mà không cần tải lại trang.<br>3. Trạng thái kết nối WebSocket được hiển thị (đã kết nối / đang kết nối lại / ngoại tuyến).<br>4. Không thay đổi dữ liệu database (trừ khi người dùng thao tác duyệt đơn). |

### Main flow

1. Chủ nhà hàng mở `restaurant/dashboard.html`.
2. Frontend kiểm tra đăng nhập và vai trò `RESTAURANT_OWNER`; nếu không hợp lệ thì chuyển hướng.
3. Frontend gọi `GET /api/restaurant/me/info` để lấy `restaurant_id`.
4. Frontend gọi `GET /api/restaurant/me/reservations` để tải danh sách ban đầu (mặc định 50 đơn/trang).
5. Frontend render bảng đơn, thẻ thống kê và các bộ lọc trạng thái/chi nhánh/thời gian.
6. Frontend mở kết nối `WS /ws/restaurant/{restaurant_id}?token=...`.
7. Khi kết nối mở: hiển thị "Real-time: Kết nối"; cứ 25 giây gửi `ping` để giữ kết nối.
8. Khi nhận sự kiện `new_reservation`: thêm đơn vào bảng, hiển thị banner, phát âm thanh thông báo (nếu bật) và toast.
9. Người dùng lọc theo trạng thái/chi nhánh/thời gian hoặc tìm kiếm; frontend lọc phía client.
10. Khi WebSocket đóng: hiển thị trạng thái ngoại tuyến và tự động kết nối lại sau 5 giây.

### Alternative / Exception flow

- **A1 — WebSocket không kết nối được:** dashboard vẫn hiển thị dữ liệu tải qua REST; tiếp tục thử kết nối lại.
- **A2 — Người dùng tắt chuông:** không phát âm thanh nhưng vẫn cập nhật bảng và banner.
- **E1 — Token thiếu khi mở WebSocket:** server đóng kết nối với mã `1008`.
- **E2 — Token hết hạn khi gọi REST:** trả `401`, frontend xoá phiên và chuyển về đăng nhập.
- **E3 — Chưa có hồ sơ nhà hàng:** API trả danh sách rỗng/`404`, dashboard hiển thị trạng thái rỗng.
- **E4 — Mất mạng:** hiển thị "Ngoại tuyến", tự kết nối lại khi có mạng.

### Special requirements

- Cập nhật realtime trong vòng dưới 1 giây kể từ khi đơn được tạo.
- Ping giữ kết nối mỗi 25 giây; tự kết nối lại sau 5 giây.
- Dữ liệu WebSocket không thay đổi database.
- Phân quyền: chỉ chủ nhà hàng mới truy cập dashboard/API tương ứng.

### Extension points

- **EP1 — Duyệt đơn đặt bàn:** UC24 (xác nhận/từ chối).
- **EP2 — Làm mới dữ liệu thủ công:** nút "Làm mới".
- **EP3 — Bật/tắt âm thanh thông báo:** nút chuông.

---

## UC24 — Duyệt đơn đặt bàn (bao gồm UC25 — Từ chối đơn)

| Thuộc tính | Nội dung |
|---|---|
| **Mã use case** | UC24 |
| **Tên use case** | Duyệt đơn đặt bàn (Xác nhận / Từ chối) |
| **Actor** | Chủ nhà hàng (chính); Hệ thống Email (phụ) |
| **Brief description** | Chủ nhà hàng xử lý các đơn đang chờ: **xác nhận** để chuyển sang `CONFIRMED` hoặc **từ chối** kèm lý do bắt buộc để chuyển sang `REJECTED` và hoàn trả bàn. Hệ thống gửi email thông báo cho khách hàng. |
| **Pre-conditions** | 1. Đã đăng nhập với vai trò `RESTAURANT_OWNER`.<br>2. Đơn đặt bàn thuộc chi nhánh của nhà hàng mình.<br>3. Đơn đang ở trạng thái `PENDING`.<br>4. Nếu từ chối: đã nhập lý do từ chối. |
| **Post-conditions** | **Khi xác nhận:** trạng thái `CONFIRMED`, `available_tables` không đổi, khách nhận email xác nhận.<br>**Khi từ chối:** trạng thái `REJECTED`, lưu `rejection_reason`, `available_tables` tăng 1, khách nhận email kèm lý do.<br>Dashboard cập nhật dòng tương ứng. |

### Main flow — Xác nhận (Confirm)

1. Chủ nhà hàng xem đơn `PENDING` trên dashboard.
2. Chọn đơn và bấm **Xác nhận**.
3. Modal xác nhận hiển thị; người dùng có thể nhập số bàn cần gán (tùy chọn).
4. Frontend gửi `PATCH /api/restaurant/me/reservations/{id}/confirm`.
5. Backend kiểm tra tài khoản có hồ sơ nhà hàng và đơn thuộc nhà hàng đó.
6. `reservation_service.confirm_reservation` kiểm tra trạng thái `PENDING`.
7. Cập nhật trạng thái `CONFIRMED`, commit.
8. Background task gửi email xác nhận cho khách hàng.
9. Trả đơn đã cập nhật; frontend cập nhật dòng, đóng modal và thông báo thành công.

### Alternative / Exception flow

- **A1 — Từ chối đơn (UC25):**
  1. Chọn đơn `PENDING` → **Từ chối**.
  2. Nhập lý do từ chối (bắt buộc, tối thiểu 5 ký tự).
  3. Gửi `PATCH /api/restaurant/me/reservations/{id}/reject` kèm `rejection_reason`.
  4. Backend kiểm tra lý do không rỗng, quyền sở hữu, trạng thái `PENDING`.
  5. Cập nhật `REJECTED`, lưu lý do, tăng `available_tables` 1, commit.
  6. Gửi email từ chối cho khách kèm lý do.
- **E1 — Không tìm thấy đơn/không thuộc nhà hàng:** trả `404`.
- **E2 — Đơn không còn `PENDING`:** trả `400` "Chỉ có thể xác nhận/từ chối đơn đang PENDING."
- **E3 — Lý do từ chối rỗng:** trả `422` "Lý do từ chối không được để trống."
- **E4 — Chưa có hồ sơ nhà hàng:** trả `403`.
- **E5 — Dữ liệu số bàn không nhất quán khi hoàn bàn:** trả `500`.
- **E6 — Gửi email thất bại:** chỉ ghi log; trạng thái đơn vẫn được cập nhật.

### Special requirements

- Tuân thủ **BR-02** (bắt buộc lý do từ chối) và **BR-05** (chỉ duyệt đơn `PENDING`).
- Kiểm tra quyền sở hữu đơn theo `restaurant.owner_id` trước khi xử lý.
- Xác nhận không thay đổi số bàn; từ chối hoàn bàn `+1` (SYS-02).
- Email gửi bất đồng bộ, không làm hỏng transaction.
- Trạng thái đơn chỉ được chuyển một lần; thao tác lặp lại bị từ chối.

### Extension points

- **EP1 — Gán số bàn khi xác nhận:** frontend đã có ô nhập số bàn; backend hiện chỉ cập nhật trạng thái (xem ghi chú kỹ thuật cuối tài liệu).
- **EP2 — Gửi email tùy chỉnh kèm ghi chú của nhà hàng:** ngoài phạm vi hiện tại.

---

## Ghi chú kỹ thuật

- **Đăng nhập:** JWT hiện có thời hạn **7 ngày** (`ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7`), không phải 24 giờ như tài liệu phạm vi cũ.
- **Duyệt đơn — gán số bàn:** `PATCH /confirm` hiện **không nhận** `table_number` từ body; frontend có gửi nhưng backend bỏ qua. Nếu cần lưu số bàn khi xác nhận, phải bổ sung tham số vào endpoint và service.
- **WebSocket:** endpoint hiện chỉ kiểm tra token có tồn tại, chưa giải mã/kiểm tra hạn JWT.
- **Real-time dashboard:** code hiện dùng cơ chế tự kết nối lại sau 5 giây, không có polling REST định kỳ như mô tả trong tài liệu phạm vi cũ.
