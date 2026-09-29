/**
 * history.js - Reservation History Page Controller
 * Hiển thị danh sách lịch sử đặt bàn, bộ lọc theo trạng thái và xử lý hủy đặt bàn (Quy tắc 24h).
 */

const CANCELLATION_WINDOW_HOURS = 24;

// Dữ liệu mẫu nếu chưa có đặt bàn nào
const DEFAULT_SAMPLE_RESERVATIONS = [
    {
        id: "TR-892415",
        branch_id: 1,
        branch_name: "Chi nhánh Bến Nghé — Quận 1",
        restaurant_name: "Le Ciel Gourmet",
        branch_address: "72 Lê Thánh Tôn, P. Bến Nghé, Quận 1, TP. HCM",
        reservation_time: "19:00 • Thứ Bảy, 17/10/2026",
        raw_time: "2026-10-17T19:00:00",
        guest_count: 2,
        seating_area: "Gần cửa sổ",
        table_number: 4,
        customer_name: "Nguyễn Minh Khang",
        customer_phone: "0909 123 456",
        status: "CONFIRMED",
        pre_ordered_dishes: [
            { name: "Bò Wagyu A5 sốt tiêu đen thượng hạng", quantity: 1, price: 590000 },
            { name: "Set tráng miệng Tinh hoa bánh ngọt Pháp", quantity: 1, price: 180000 }
        ],
        special_requests: "🎂 Trang trí sinh nhật. Chuẩn bị nến & hoa tươi",
        created_at: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
        id: "TR-674120",
        branch_id: 2,
        branch_name: "Chi nhánh Thảo Điền — TP. Thủ Đức",
        restaurant_name: "Nhà Hàng Hương Sen",
        branch_address: "18 Xuân Thủy, Thảo Điền, TP. Thủ Đức, TP. HCM",
        reservation_time: "12:30 • Chủ Nhật, 18/10/2026",
        raw_time: "2026-10-18T12:30:00",
        guest_count: 4,
        seating_area: "Sân vườn ngoài trời",
        table_number: 8,
        customer_name: "Nguyễn Minh Khang",
        customer_phone: "0909 123 456",
        status: "PENDING",
        pre_ordered_dishes: [
            { name: "Tôm hùm Alaska bỏ lò phô mai Gruyère", quantity: 1, price: 720000 }
        ],
        special_requests: "👶 Chuẩn bị 01 ghế trẻ em",
        created_at: new Date(Date.now() - 3600000 * 20).toISOString()
    }
];

let reservations = [];
let currentFilter = "ALL";

function getLocalReservations() {
    try {
        const stored = localStorage.getItem("customer_reservations");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {
        // Fallback
    }
    // Khởi tạo dữ liệu mẫu nếu chưa có
    localStorage.setItem("customer_reservations", JSON.stringify(DEFAULT_SAMPLE_RESERVATIONS));
    return DEFAULT_SAMPLE_RESERVATIONS;
}

function saveLocalReservations(data) {
    localStorage.setItem("customer_reservations", JSON.stringify(data));
}

function updateStats(list) {
    const totalEl = document.getElementById("stat-total");
    const pendingEl = document.getElementById("stat-pending");
    const confirmedEl = document.getElementById("stat-confirmed");
    const cancelledEl = document.getElementById("stat-cancelled");

    const total = list.length;
    const pending = list.filter((r) => r.status === "PENDING").length;
    const confirmed = list.filter((r) => r.status === "CONFIRMED").length;
    const cancelled = list.filter((r) => r.status === "CANCELLED" || r.status === "REJECTED").length;

    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (confirmedEl) confirmedEl.textContent = confirmed;
    if (cancelledEl) cancelledEl.textContent = cancelled;
}

function getStatusBadgeHtml(status) {
    switch (status) {
        case "PENDING":
            return `<span class="status-badge pending">⏳ Chờ duyệt</span>`;
        case "CONFIRMED":
            return `<span class="status-badge confirmed">✓ Đã xác nhận</span>`;
        case "REJECTED":
            return `<span class="status-badge rejected">✕ Từ chối</span>`;
        case "CANCELLED":
            return `<span class="status-badge cancelled">⊘ Đã hủy</span>`;
        default:
            return `<span class="status-badge">${status || "Mới"}</span>`;
    }
}

/**
 * Kiểm tra quy tắc 24h (BR-01)
 */
function canCancelReservation(reservation) {
    if (reservation.status !== "PENDING" && reservation.status !== "CONFIRMED") {
        return { allowed: false, reason: "Đơn đặt này đã hoàn tất hoặc đã được xử lý." };
    }

    if (!reservation.raw_time) {
        return { allowed: true };
    }

    const resDate = new Date(reservation.raw_time);
    const now = new Date();
    const diffHours = (resDate - now) / (1000 * 60 * 60);

    if (diffHours < CANCELLATION_WINDOW_HOURS) {
        return {
            allowed: false,
            reason: `Quy tắc BR-01: Chỉ có thể hủy đặt bàn trước ít nhất ${CANCELLATION_WINDOW_HOURS} giờ so với giờ hẹn (còn lại ~${Math.max(0, Math.round(diffHours))} giờ). Vui lòng liên hệ trực tiếp nhà hàng.`
        };
    }

    return { allowed: true };
}

function renderReservationsList() {
    const container = document.getElementById("reservations-list-container");
    if (!container) return;

    let filtered = reservations;
    if (currentFilter !== "ALL") {
        filtered = reservations.filter((r) => r.status === currentFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:50px 20px; background:var(--paper); border:1px solid var(--line); border-radius:24px;">
                <span style="font-size:3rem; display:block; margin-bottom:12px;">🍽</span>
                <h3 style="font-family:Fraunces,serif; color:var(--wine-deep); margin:0 0 8px;">Không có đặt bàn nào</h3>
                <p style="color:var(--muted); margin:0 0 20px;">Bạn chưa có lịch hẹn nào trong danh mục này.</p>
                <a href="book.html" class="btn-primary" style="display:inline-block; text-decoration:none;">Đặt bàn ngay</a>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    filtered.forEach((res) => {
        const item = document.createElement("article");
        item.className = "reservation-card-item";

        const dishesText = Array.isArray(res.pre_ordered_dishes) && res.pre_ordered_dishes.length > 0
            ? res.pre_ordered_dishes.map((d) => `${d.name} (×${d.quantity || 1})`).join(", ")
            : "Gọi món tại nhà hàng";

        const canCancel = (res.status === "PENDING" || res.status === "CONFIRMED");

        item.innerHTML = `
            <div class="res-card-header">
                <div>
                    <h3 class="res-branch-name">${res.restaurant_name || res.branch_name}</h3>
                    <div style="font-size:0.88rem; color:var(--muted);">${res.branch_address || ""}</div>
                </div>
                <div style="text-align:right;">
                    <div style="margin-bottom:6px;">${getStatusBadgeHtml(res.status)}</div>
                    <span class="res-code-badge">Mã: ${res.id}</span>
                </div>
            </div>

            <div class="res-info-grid">
                <div class="res-info-item">
                    <div class="res-info-label">🕒 Thời gian dùng bữa</div>
                    <div class="res-info-val">${res.reservation_time}</div>
                </div>
                <div class="res-info-item">
                    <div class="res-info-label">👥 Số lượng khách</div>
                    <div class="res-info-val">${res.guest_count} khách (${res.seating_area || "Tiêu chuẩn"})</div>
                </div>
                <div class="res-info-item">
                    <div class="res-info-label">🪑 Số bàn</div>
                    <div class="res-info-val">${res.table_number ? `Bàn số ${res.table_number}` : "Sắp xếp khi nhận bàn"}</div>
                </div>
                <div class="res-info-item">
                    <div class="res-info-label">👤 Khách liên hệ</div>
                    <div class="res-info-val">${res.customer_name} • ${res.customer_phone}</div>
                </div>
                <div class="res-info-item" style="grid-column: 1 / -1;">
                    <div class="res-info-label">🍲 Món đặt trước</div>
                    <div class="res-info-val" style="color:var(--wine);">${dishesText}</div>
                </div>
                ${res.special_requests ? `
                <div class="res-info-item" style="grid-column: 1 / -1;">
                    <div class="res-info-label">📝 Yêu cầu đặc biệt</div>
                    <div class="res-info-val" style="color:var(--muted); font-style:italic;">${res.special_requests}</div>
                </div>
                ` : ""}
            </div>

            <div class="res-card-footer">
                <div class="res-rule-note">
                    <span>🛡</span>
                    <span>Quy tắc 24h: Hủy miễn phí trước giờ đặt 24 tiếng</span>
                </div>
                <div>
                    ${canCancel ? `
                        <button type="button" class="btn-danger btn-cancel-res" data-id="${res.id}" style="padding:7px 18px; font-size:0.86rem;">
                            Hủy đặt bàn
                        </button>
                    ` : ""}
                </div>
            </div>
        `;

        container.appendChild(item);
    });

    // Gắn sự kiện nút Hủy đặt bàn
    container.querySelectorAll(".btn-cancel-res").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            handleCancel(id);
        });
    });
}

function handleCancel(id) {
    const item = reservations.find((r) => r.id === id);
    if (!item) return;

    const check = canCancelReservation(item);
    if (!check.allowed) {
        showToast(check.reason, "danger", 5000);
        return;
    }

    const confirmCancel = confirm(`Bạn có chắc chắn muốn hủy đặt bàn tại ${item.restaurant_name || item.branch_name} (Mã: ${item.id}) không?`);
    if (!confirmCancel) return;

    item.status = "CANCELLED";
    saveLocalReservations(reservations);
    updateStats(reservations);
    renderReservationsList();

    showToast(`Đã hủy đặt bàn mã ${item.id} thành công. Bàn đã được hoàn lại cho chi nhánh.`, "success");
}

document.addEventListener("DOMContentLoaded", () => {
    const user = requireAuth("CUSTOMER");
    if (!user) return;

    // Header user display
    const name = displayName(user) || "Khách hàng";
    const nameEl = document.getElementById("hist-user-name");
    const avatarEl = document.getElementById("hist-user-avatar");
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.slice(0, 2).toUpperCase();

    // Tải dữ liệu đặt bàn
    reservations = getLocalReservations();
    updateStats(reservations);
    renderReservationsList();

    // Filter tabs
    document.querySelectorAll(".filter-tab-btn").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".filter-tab-btn").forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.dataset.filter || "ALL";
            renderReservationsList();
        });
    });

    const logoutBtn = document.getElementById("btn-hist-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }
});
