/**
 * dashboard.js - Restaurant Real-time Order Management Dashboard Controller
 * Tuân thủ quy chuẩn dự án TableReserve & Module Dev 4.
 *
 * Chức năng chính:
 * ├── connectDashboardWS(restaurantId, onNewReservation)
 * ├── disconnectDashboardWS()
 * ├── _connectWS(onNewReservation) — auto-reconnect 5s
 * ├── _setWsStatus(status) — cập nhật #ws-status indicator (connected/reconnecting/disconnected)
 * ├── buildReservationRow(r) — render hàng dữ liệu trong bảng
 * ├── Ping interval 25s duy trì kết nối WebSocket
 * ├── Xử lý Confirm đơn & Reject đơn (validate lý do theo BR-02)
 * └── Bộ lọc đa chiều, tìm kiếm thời gian thực & âm thanh thông báo
 */

// ==========================================================================
// CONSTANTS & STATE
// ==========================================================================
const RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 25000;

let _ws = null;
let _reconnectTimer = null;
let _pingTimer = null;
let _restaurantId = 1;
let _reservations = [];
let _activeFilterStatus = "ALL";
let _activeFilterBranch = "ALL";
let _activeFilterTime = "ALL";
let _searchQuery = "";
let _soundEnabled = true;

// Active action targets for modals
let _selectedReservation = null;

// Default sample reservations for offline demonstration
const DEFAULT_RESTAURANT_RESERVATIONS = [
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
        customer_email: "minhkhang@tablereserve.vn",
        status: "CONFIRMED",
        pre_ordered_dishes: [
            { name: "Bò Wagyu A5 sốt tiêu đen thượng hạng", quantity: 1, price: 590000 },
            { name: "Set tráng miệng Tinh hoa bánh ngọt Pháp", quantity: 1, price: 180000 }
        ],
        special_requests: "🎂 Trang trí sinh nhật. Chuẩn bị nến & hoa tươi",
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
        id: "TR-674120",
        branch_id: 2,
        branch_name: "Chi nhánh Thảo Điền — TP. Thủ Đức",
        restaurant_name: "Le Ciel Gourmet",
        branch_address: "18 Xuân Thủy, Thảo Điền, TP. Thủ Đức, TP. HCM",
        reservation_time: "12:30 • Chủ Nhật, 18/10/2026",
        raw_time: "2026-10-18T12:30:00",
        guest_count: 4,
        seating_area: "Sân vườn ngoài trời",
        table_number: 8,
        customer_name: "Trần Bảo Ngọc",
        customer_phone: "0912 888 999",
        customer_email: "baongoc.tran@gmail.com",
        status: "PENDING",
        pre_ordered_dishes: [
            { name: "Tôm hùm Alaska bỏ lò phô mai Gruyère", quantity: 1, price: 720000 }
        ],
        special_requests: "👶 Chuẩn bị 01 ghế trẻ em",
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
        id: "TR-553109",
        branch_id: 1,
        branch_name: "Chi nhánh Bến Nghé — Quận 1",
        restaurant_name: "Le Ciel Gourmet",
        branch_address: "72 Lê Thánh Tôn, P. Bến Nghé, Quận 1, TP. HCM",
        reservation_time: "20:00 • Tối nay",
        raw_time: new Date(Date.now() + 3600000 * 3).toISOString(),
        guest_count: 6,
        seating_area: "Phòng VIP riêng tư",
        table_number: 12,
        customer_name: "Lê Hoàng Long",
        customer_phone: "0938 776 543",
        customer_email: "long.le@financecorp.vn",
        status: "PENDING",
        pre_ordered_dishes: [
            { name: "Vịt quay sốt mận & bánh bao chiên giòn", quantity: 2, price: 380000 },
            { name: "Cá hồi Na Uy áp chảo sốt bơ chanh dây", quantity: 2, price: 420000 }
        ],
        special_requests: "🍾 Khách mang theo 1 chai vang đỏ, xin hỗ trợ ướp lạnh ly pha lê.",
        created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    }
];

// ==========================================================================
// HELPER UTILITIES
// ==========================================================================

/**
 * Escape HTML để ngăn ngừa tấn công XSS theo quy chuẩn code_conventions.md
 */
function escHtml(str) {
    if (!str && str !== 0) return "";
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

/**
 * Format thời gian thân thiện (Ví dụ: 5 phút trước, 2 giờ trước)
 */
function formatTimeAgo(isoString) {
    if (!isoString) return "";
    try {
        const diffMs = Date.now() - new Date(isoString).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return "Vừa xong";
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        return `${Math.floor(hours / 24)} ngày trước`;
    } catch {
        return "";
    }
}

/**
 * Trả về badge HTML theo trạng thái chuẩn
 */
function fmtStatusBadge(status) {
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
            return `<span class="status-badge">${escHtml(status || "MỚI")}</span>`;
    }
}

/**
 * Tạo âm thanh thông báo bằng Web Audio API khi có đơn đặt bàn mới
 */
function playChimeSound() {
    if (!_soundEnabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        // Nốt nhạc 1: 523.25 Hz (C5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.35);

        // Nốt nhạc 2: 783.99 Hz (G5) sau 0.12s
        setTimeout(() => {
            if (ctx.state === "closed") return;
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(783.99, ctx.currentTime);
            gain2.gain.setValueAtTime(0.2, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start();
            osc2.stop(ctx.currentTime + 0.5);
        }, 120);
    } catch {
        // Fallback im lặng nếu trình duyệt không hỗ trợ Web Audio
    }
}

// ==========================================================================
// WEBSOCKET CLIENT & LIFECYCLE
// ==========================================================================

/**
 * Cập nhật giao diện trạng thái kết nối WebSocket
 * @param {'connected'|'reconnecting'|'disconnected'} status
 */
function _setWsStatus(status) {
    const badge = document.getElementById("ws-status-badge");
    const textEl = document.getElementById("ws-status-text");
    if (!badge || !textEl) return;

    badge.classList.remove("connected", "reconnecting", "disconnected");

    if (status === "connected") {
        badge.classList.add("connected");
        textEl.textContent = "Real-time: Kết nối";
        badge.title = "Kênh WebSocket đang hoạt động. Nhận đơn mới tức thì.";
    } else if (status === "reconnecting") {
        badge.classList.add("reconnecting");
        textEl.textContent = "Đang kết nối...";
        badge.title = "Đang thử kết nối lại máy chủ WebSocket...";
    } else {
        badge.classList.add("disconnected");
        textEl.textContent = "Ngoại tuyến (Demo)";
        badge.title = "Không kết nối WebSocket server. Dữ liệu đang chạy ở chế độ offline demo.";
    }
}

/**
 * Mở kết nối WebSocket tới server với auto-reconnect 5s
 */
function _connectWS(onNewReservation) {
    // Clear timer cũ
    if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
    }
    if (_pingTimer) {
        clearInterval(_pingTimer);
        _pingTimer = null;
    }

    _setWsStatus("reconnecting");

    try {
        const wsUrl = api.wsUrl(`/ws/restaurant/${_restaurantId}`);
        _ws = new WebSocket(wsUrl);

        _ws.onopen = () => {
            _setWsStatus("connected");

            // Ping interval 25s để giữ kết nối alive theo spec
            _pingTimer = setInterval(() => {
                if (_ws && _ws.readyState === WebSocket.OPEN) {
                    try {
                        _ws.send(JSON.stringify({ type: "ping" }));
                    } catch {
                        // Ignore ping error
                    }
                }
            }, PING_INTERVAL_MS);
        };

        _ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "new_reservation" || payload.event === "RESERVATION_CREATED") {
                    const resData = payload.data || payload.reservation || payload;
                    if (typeof onNewReservation === "function") {
                        onNewReservation(resData);
                    }
                }
            } catch (err) {
                console.warn("[WS] Parse message error:", err);
            }
        };

        _ws.onerror = () => {
            _setWsStatus("disconnected");
        };

        _ws.onclose = () => {
            _setWsStatus("disconnected");
            if (_pingTimer) {
                clearInterval(_pingTimer);
                _pingTimer = null;
            }
            // Reconnect sau 5s thay vì ngay lập tức để tránh bão kết nối (theo convention)
            _reconnectTimer = setTimeout(() => {
                _connectWS(onNewReservation);
            }, RECONNECT_DELAY_MS);
        };
    } catch {
        _setWsStatus("disconnected");
        _reconnectTimer = setTimeout(() => {
            _connectWS(onNewReservation);
        }, RECONNECT_DELAY_MS);
    }
}

/**
 * Hàm khởi tạo kết nối WebSocket cấp cao
 */
function connectDashboardWS(restaurantId, onNewReservation) {
    _restaurantId = restaurantId || 1;
    _connectWS(onNewReservation);
}

/**
 * Ngắt kết nối WebSocket an toàn
 */
function disconnectDashboardWS() {
    if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
    }
    if (_pingTimer) {
        clearInterval(_pingTimer);
        _pingTimer = null;
    }
    if (_ws) {
        try {
            _ws.close();
        } catch {
            // Ignore close error
        }
        _ws = null;
    }
    _setWsStatus("disconnected");
}

// ==========================================================================
// RESERVATION DATA RENDERING & LOGIC
// ==========================================================================

/**
 * Tạo chuỗi HTML của một dòng trong bảng đặt bàn theo chuẩn Dev 4 spec
 * @param {Object} r - Đối tượng đặt bàn
 * @returns {string} HTML string
 */
function buildReservationRow(r) {
    const dishes = Array.isArray(r.pre_ordered_dishes) ? r.pre_ordered_dishes : [];
    let dishesHtml = "";
    if (dishes.length > 0) {
        dishesHtml = `<div class="dish-chips-list">` +
            dishes.map((d) => `<span class="dish-chip" title="${escHtml(d.name || d)}">${escHtml(d.name || d)} ${d.quantity ? `×${d.quantity}` : ""}</span>`).join("") +
            `</div>`;
    }

    let reqHtml = "";
    if (r.special_requests) {
        reqHtml = `<div class="special-req-tag" title="${escHtml(r.special_requests)}">
            <span>📝</span>
            <span style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(r.special_requests)}</span>
        </div>`;
    }

    const timeAgoStr = formatTimeAgo(r.created_at);

    // Cột hành động
    let actionsHtml = "";
    if (r.status === "PENDING") {
        actionsHtml = `
            <button type="button" class="btn-action btn-confirm-act" data-action="confirm" data-id="${escHtml(r.id)}" title="Xác nhận đặt bàn">
                <span>✓ Duyệt</span>
            </button>
            <button type="button" class="btn-action btn-reject-act" data-action="reject" data-id="${escHtml(r.id)}" title="Từ chối đặt bàn">
                <span>✕ Từ chối</span>
            </button>
        `;
    }
    actionsHtml += `
        <button type="button" class="btn-action btn-detail-act" data-action="detail" data-id="${escHtml(r.id)}" title="Xem thông tin chi tiết">
            <span>👁 Chi tiết</span>
        </button>
    `;

    return `
        <tr id="res-row-${escHtml(r.id)}" data-id="${escHtml(r.id)}" data-status="${escHtml(r.status)}" data-branch="${escHtml(r.branch_id || '')}">
            <td>
                <div class="res-code-cell">
                    <span>${escHtml(r.id)}</span>
                    <span class="res-created-ago">${escHtml(timeAgoStr)}</span>
                </div>
            </td>
            <td>
                <div class="res-cust-name">${escHtml(r.customer_name || "Khách hàng")}</div>
                <div class="res-cust-contact">
                    <a href="tel:${escHtml(r.customer_phone || '')}" class="res-cust-phone">📞 ${escHtml(r.customer_phone || "Chưa có SĐT")}</a>
                </div>
            </td>
            <td>
                <div class="res-branch-badge">${escHtml(r.branch_name || "Chi nhánh chính")}</div>
                <div class="res-table-badge">Bàn số ${escHtml(r.table_number || "Tự động")}</div>
            </td>
            <td>
                <div class="res-time-main">${escHtml(r.reservation_time || "Chưa xếp giờ")}</div>
            </td>
            <td>
                <span class="res-guests-badge">👥 ${escHtml(r.guest_count || 1)} khách</span>
            </td>
            <td>
                ${dishesHtml || `<span style="font-size:0.8rem; color:var(--muted);">Không đặt trước</span>`}
                ${reqHtml}
            </td>
            <td>
                ${fmtStatusBadge(r.status)}
            </td>
            <td style="text-align:right;">
                <div class="res-actions-cell" style="justify-content:flex-end;">
                    ${actionsHtml}
                </div>
            </td>
        </tr>
    `;
}

/**
 * Lấy dữ liệu đặt bàn từ Server hoặc LocalStorage fallback
 */
async function loadReservations() {
    setLoading(true, "Đang tải danh sách đặt bàn...");
    try {
        // Thử lấy từ Backend REST API thật theo spec
        const data = await api.get("/restaurant/me/reservations");
        if (Array.isArray(data) && data.length > 0) {
            _reservations = data;
        } else {
            _reservations = getFallbackReservations();
        }
    } catch {
        // Khi backend chưa chạy, fallback mượt mà về dữ liệu đã lưu
        _reservations = getFallbackReservations();
    } finally {
        setLoading(false);
        populateBranchFilter();
        renderTableAndStats();
    }
}

/**
 * Lấy danh sách từ LocalStorage kết hợp mock mẫu
 */
function getFallbackReservations() {
    try {
        const stored = localStorage.getItem("customer_reservations");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Hợp nhất dữ liệu mẫu nếu danh sách hiện có ít
                const ids = new Set(parsed.map((x) => x.id));
                const combined = [...parsed];
                for (const item of DEFAULT_RESTAURANT_RESERVATIONS) {
                    if (!ids.has(item.id)) {
                        combined.push(item);
                    }
                }
                return combined;
            }
        }
    } catch {
        // Ignore fallback parse error
    }
    // Ghi dữ liệu mẫu mặc định
    localStorage.setItem("customer_reservations", JSON.stringify(DEFAULT_RESTAURANT_RESERVATIONS));
    return DEFAULT_RESTAURANT_RESERVATIONS;
}

/**
 * Lưu dữ liệu đặt bàn vào LocalStorage đồng bộ với phía Customer
 */
function saveReservationsLocally(data) {
    try {
        localStorage.setItem("customer_reservations", JSON.stringify(data));
    } catch {
        // Ignore local storage error
    }
}

/**
 * Đổ danh sách chi nhánh vào bộ lọc
 */
function populateBranchFilter() {
    const branchSelect = document.getElementById("filter-branch");
    if (!branchSelect) return;

    // Lấy các chi nhánh độc nhất từ danh sách đặt bàn
    const branchesMap = new Map();
    for (const r of _reservations) {
        if (r.branch_id && r.branch_name) {
            branchesMap.set(String(r.branch_id), r.branch_name);
        }
    }

    // Giữ lại option "Tất cả"
    branchSelect.innerHTML = `<option value="ALL">🏢 Tất cả chi nhánh</option>`;
    branchesMap.forEach((name, id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        branchSelect.appendChild(opt);
    });
}

/**
 * Cập nhật bảng và các khối thống kê
 */
function renderTableAndStats() {
    updateStats();
    renderFilteredRows();
}

/**
 * Tính toán và cập nhật 5 thẻ thống kê + badge bộ lọc
 */
function updateStats() {
    const totalEl = document.getElementById("stat-total");
    const pendingEl = document.getElementById("stat-pending");
    const confirmedEl = document.getElementById("stat-confirmed");
    const rejectedEl = document.getElementById("stat-rejected");
    const guestsEl = document.getElementById("stat-guests");

    const total = _reservations.length;
    const pending = _reservations.filter((r) => r.status === "PENDING").length;
    const confirmed = _reservations.filter((r) => r.status === "CONFIRMED").length;
    const rejected = _reservations.filter((r) => r.status === "REJECTED").length;
    const cancelled = _reservations.filter((r) => r.status === "CANCELLED").length;

    // Tổng số lượng khách hôm nay
    const totalGuests = _reservations.reduce((sum, r) => sum + (Number(r.guest_count) || 0), 0);

    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (confirmedEl) confirmedEl.textContent = confirmed;
    if (rejectedEl) rejectedEl.textContent = rejected + cancelled;
    if (guestsEl) guestsEl.textContent = totalGuests;

    // Cập nhật số đếm trên tab bộ lọc
    const badgeAll = document.getElementById("badge-count-all");
    const badgePending = document.getElementById("badge-count-pending");
    const badgeConfirmed = document.getElementById("badge-count-confirmed");
    const badgeRejected = document.getElementById("badge-count-rejected");
    const badgeCancelled = document.getElementById("badge-count-cancelled");

    if (badgeAll) badgeAll.textContent = total;
    if (badgePending) badgePending.textContent = pending;
    if (badgeConfirmed) badgeConfirmed.textContent = confirmed;
    if (badgeRejected) badgeRejected.textContent = rejected;
    if (badgeCancelled) badgeCancelled.textContent = cancelled;
}

/**
 * Lọc dữ liệu và vẽ các hàng ra bảng
 */
function renderFilteredRows() {
    const tbody = document.getElementById("reservations-tbody");
    const emptyState = document.getElementById("table-empty-state");
    if (!tbody) return;

    let filtered = [..._reservations];

    // Lọc theo trạng thái
    if (_activeFilterStatus !== "ALL") {
        filtered = filtered.filter((r) => r.status === _activeFilterStatus);
    }

    // Lọc theo chi nhánh
    if (_activeFilterBranch !== "ALL") {
        filtered = filtered.filter((r) => String(r.branch_id) === String(_activeFilterBranch));
    }

    // Lọc theo tìm kiếm (Mã đơn, Tên, Số điện thoại)
    if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        filtered = filtered.filter((r) => {
            const id = (r.id || "").toLowerCase();
            const name = (r.customer_name || "").toLowerCase();
            const phone = (r.customer_phone || "").toLowerCase();
            return id.includes(q) || name.includes(q) || phone.includes(q);
        });
    }

    // Sắp xếp: Mới nhất lên đầu
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (filtered.length === 0) {
        tbody.innerHTML = "";
        if (emptyState) emptyState.hidden = false;
        return;
    }

    if (emptyState) emptyState.hidden = true;
    tbody.innerHTML = filtered.map(buildReservationRow).join("");
}

/**
 * Xử lý khi có đơn đặt bàn mới đổ về (từ WebSocket hoặc nút mô phỏng)
 */
function handleNewIncomingReservation(newRes) {
    if (!newRes || !newRes.id) return;

    // Tránh trùng lặp
    const existingIndex = _reservations.findIndex((r) => r.id === newRes.id);
    if (existingIndex >= 0) {
        _reservations[existingIndex] = { ..._reservations[existingIndex], ...newRes };
    } else {
        _reservations.unshift(newRes);
    }

    saveReservationsLocally(_reservations);
    renderTableAndStats();

    // Hiệu ứng âm thanh thông báo
    playChimeSound();

    // Hiển thị banner nổi bật
    const banner = document.getElementById("live-order-banner");
    const details = document.getElementById("live-order-details");
    if (banner && details) {
        details.textContent = `${newRes.customer_name || "Khách hàng"} vừa đặt bàn tại ${newRes.branch_name || "chi nhánh"} (${newRes.guest_count || 2} khách).`;
        banner.hidden = false;
    }

    // Toast
    showToast(`🛎 Có đơn đặt bàn mới: ${newRes.id} (${newRes.customer_name || 'Khách'})`, "info", 4500);

    // Highlight hàng mới trong bảng
    const row = document.getElementById(`res-row-${newRes.id}`);
    if (row) {
        row.classList.add("new-arrival");
    }
}

// ==========================================================================
// MODAL ACTIONS (CONFIRM, REJECT, DETAILS)
// ==========================================================================

function openConfirmModal(res) {
    _selectedReservation = res;
    const modal = document.getElementById("modal-confirm");
    document.getElementById("confirm-modal-code").textContent = res.id;
    document.getElementById("confirm-modal-cust").textContent = res.customer_name || "Khách hàng";
    document.getElementById("confirm-modal-time").textContent = res.reservation_time || "Chưa xếp giờ";
    document.getElementById("confirm-modal-guests").textContent = `${res.guest_count || 2} khách`;
    document.getElementById("confirm-assign-table").value = res.table_number || "";

    if (modal) modal.hidden = false;
}

function openRejectModal(res) {
    _selectedReservation = res;
    const modal = document.getElementById("modal-reject");
    document.getElementById("reject-modal-code").textContent = res.id;
    document.getElementById("reject-modal-cust").textContent = res.customer_name || "Khách hàng";
    const reasonInput = document.getElementById("reject-reason-input");
    const errorMsg = document.getElementById("reject-error-msg");

    if (reasonInput) reasonInput.value = "";
    if (errorMsg) errorMsg.hidden = true;

    // Reset chips
    document.querySelectorAll(".reason-chip-btn").forEach((b) => b.classList.remove("active"));

    if (modal) modal.hidden = false;
}

function openDetailModal(res) {
    const modal = document.getElementById("modal-detail");
    document.getElementById("detail-code").textContent = res.id;
    document.getElementById("detail-status-pill").innerHTML = fmtStatusBadge(res.status);
    document.getElementById("detail-cust-name").textContent = res.customer_name || "Khách hàng";
    document.getElementById("detail-cust-contact").textContent = `${res.customer_phone || "Không có SĐT"} • ${res.customer_email || "Không có email"}`;
    document.getElementById("detail-branch-name").textContent = res.branch_name || "Chi nhánh chính";
    document.getElementById("detail-table-no").textContent = `Bàn số ${res.table_number || "Tự động"}`;
    document.getElementById("detail-res-time").textContent = res.reservation_time || "Chưa xếp giờ";
    document.getElementById("detail-guest-count").textContent = `${res.guest_count || 1} khách`;

    // Món ăn đặt trước
    const dishesBox = document.getElementById("detail-dishes-box");
    const dishes = Array.isArray(res.pre_ordered_dishes) ? res.pre_ordered_dishes : [];
    if (dishes.length > 0) {
        dishesBox.innerHTML = dishes.map((d) => `
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed var(--line); font-size:0.88rem;">
                <span>🍴 ${escHtml(d.name || d)}</span>
                <span style="font-weight:700; color:var(--wine);">${d.price ? (d.price * (d.quantity || 1)).toLocaleString("vi-VN") + " đ" : (d.quantity ? `×${d.quantity}` : "1")}</span>
            </div>
        `).join("");
    } else {
        dishesBox.innerHTML = `<span style="color:var(--muted); font-size:0.88rem;">Không có món đặt trước</span>`;
    }

    // Yêu cầu đặc biệt
    const reqBox = document.getElementById("detail-requests-box");
    reqBox.textContent = res.special_requests || "Không có yêu cầu đặc biệt nào.";

    // Lý do từ chối nếu có
    const rejRow = document.getElementById("detail-rejection-row");
    const rejBox = document.getElementById("detail-rejection-box");
    if (res.status === "REJECTED" && res.rejection_reason) {
        rejBox.textContent = res.rejection_reason;
        rejRow.hidden = false;
    } else {
        rejRow.hidden = true;
    }

    if (modal) modal.hidden = false;
}

function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => {
        m.hidden = true;
    });
    _selectedReservation = null;
}

/**
 * Thực hiện xác nhận đơn đặt bàn
 */
async function submitConfirmReservation() {
    if (!_selectedReservation) return;
    const resId = _selectedReservation.id;
    const assignTable = document.getElementById("confirm-assign-table").value.trim();

    setLoading(true, "Đang xác nhận đặt bàn...");
    try {
        // Gọi PATCH API backend theo spec 3.3
        await api.patch(`/restaurant/me/reservations/${resId}/confirm`, {
            table_number: assignTable ? parseInt(assignTable, 10) : undefined
        });
    } catch {
        // Fallback khi offline
    } finally {
        // Cập nhật trạng thái cục bộ
        const target = _reservations.find((r) => r.id === resId);
        if (target) {
            target.status = "CONFIRMED";
            if (assignTable) target.table_number = parseInt(assignTable, 10);
            saveReservationsLocally(_reservations);
        }
        setLoading(false);
        closeAllModals();
        renderTableAndStats();
        showToast(`Đã xác nhận đơn ${resId} thành công!`, "info");
    }
}

/**
 * Thực hiện từ chối đơn đặt bàn kèm lý do bắt buộc theo BR-02
 */
async function submitRejectReservation() {
    if (!_selectedReservation) return;
    const resId = _selectedReservation.id;
    const reasonInput = document.getElementById("reject-reason-input");
    const reason = reasonInput ? reasonInput.value.trim() : "";
    const errorMsg = document.getElementById("reject-error-msg");

    // BR-02: Bắt buộc lý do từ chối không được để trống
    if (!reason) {
        if (errorMsg) {
            errorMsg.hidden = false;
            errorMsg.textContent = "Vui lòng nhập lý do từ chối (bắt buộc theo quy định BR-02).";
        }
        if (reasonInput) reasonInput.focus();
        return;
    }

    if (errorMsg) errorMsg.hidden = true;

    setLoading(true, "Đang gửi phản hồi từ chối...");
    try {
        // Gọi PATCH API backend theo spec 3.3
        await api.patch(`/restaurant/me/reservations/${resId}/reject`, {
            rejection_reason: reason
        });
    } catch {
        // Fallback khi offline
    } finally {
        const target = _reservations.find((r) => r.id === resId);
        if (target) {
            target.status = "REJECTED";
            target.rejection_reason = reason;
            saveReservationsLocally(_reservations);
        }
        setLoading(false);
        closeAllModals();
        renderTableAndStats();
        showToast(`Đã từ chối đơn ${resId}. Bàn đã được hoàn trả.`, "info");
    }
}

// ==========================================================================
// DOM INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Kiểm tra xác thực (Quyền RESTAURANT_OWNER)
    const currentUser = requireAuth("RESTAURANT_OWNER");
    if (!currentUser) return;

    // Cập nhật thông tin định danh người quản lý trên Navbar
    const ownerNameEl = document.getElementById("owner-name");
    const ownerRestEl = document.getElementById("owner-restaurant");
    const ownerAvatarEl = document.getElementById("owner-avatar");

    if (ownerNameEl) ownerNameEl.textContent = displayName(currentUser);
    if (ownerRestEl) ownerRestEl.textContent = currentUser.restaurant_name || "Le Ciel Gourmet";
    if (ownerAvatarEl) {
        const nameInitial = (currentUser.name || "QL").substring(0, 2).toUpperCase();
        ownerAvatarEl.textContent = nameInitial;
    }

    // 2. Tải dữ liệu ban đầu
    loadReservations();

    // 3. Khởi tạo kết nối WebSocket với auto-reconnect
    connectDashboardWS(_restaurantId, handleNewIncomingReservation);

    // 4. Sự kiện Đăng xuất
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            disconnectDashboardWS();
            logout();
        });
    }

    // 5. Nút Làm mới dữ liệu
    const refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            loadReservations();
            showToast("Đã làm mới dữ liệu.", "info", 1800);
        });
    }

    // 6. Nút Bật / Tắt chuông thông báo
    const soundBtn = document.getElementById("btn-toggle-sound");
    if (soundBtn) {
        soundBtn.addEventListener("click", () => {
            _soundEnabled = !_soundEnabled;
            const icon = document.getElementById("sound-icon");
            const text = document.getElementById("sound-text");
            if (icon) icon.textContent = _soundEnabled ? "🔔" : "🔕";
            if (text) text.textContent = _soundEnabled ? "Chuông: Bật" : "Chuông: Tắt";
            showToast(_soundEnabled ? "Đã bật chuông thông báo." : "Đã tắt chuông thông báo.", "info", 1800);
        });
    }

    // 7. Nút Mô phỏng đơn mới từ WebSocket (phục vụ kiểm thử & demo)
    const simulateBtn = document.getElementById("btn-simulate-order");
    if (simulateBtn) {
        simulateBtn.addEventListener("click", () => {
            const randomCode = "TR-" + Math.floor(100000 + Math.random() * 900000);
            const mockNames = ["Phạm Nhật Minh", "Vũ Hoàng My", "Đỗ Quốc Trung", "Nguyễn Thu Hà"];
            const mockName = mockNames[Math.floor(Math.random() * mockNames.length)];
            const newOrder = {
                id: randomCode,
                branch_id: 1,
                branch_name: "Chi nhánh Bến Nghé — Quận 1",
                customer_name: mockName,
                customer_phone: "09" + Math.floor(10000000 + Math.random() * 90000000),
                customer_email: "khachhang@gmail.com",
                reservation_time: "19:30 • Hôm nay",
                guest_count: Math.floor(Math.random() * 6) + 2,
                status: "PENDING",
                table_number: Math.floor(Math.random() * 10) + 1,
                pre_ordered_dishes: [
                    { name: "Bò Wagyu A5 sốt tiêu đen", quantity: 1, price: 590000 }
                ],
                special_requests: "🌟 Vừa gửi đơn qua WebSocket test!",
                created_at: new Date().toISOString()
            };
            handleNewIncomingReservation(newOrder);
        });
    }

    // 8. Bộ lọc trạng thái (Status Filter Tabs)
    const filterGroup = document.getElementById("filter-status-group");
    if (filterGroup) {
        filterGroup.addEventListener("click", (e) => {
            const btn = e.target.closest(".filter-pill");
            if (!btn) return;
            filterGroup.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            _activeFilterStatus = btn.dataset.status || "ALL";
            renderFilteredRows();
        });
    }

    // 9. Bộ lọc chi nhánh (Branch Select)
    const branchSelect = document.getElementById("filter-branch");
    if (branchSelect) {
        branchSelect.addEventListener("change", (e) => {
            _activeFilterBranch = e.target.value;
            renderFilteredRows();
        });
    }

    // 10. Tìm kiếm theo từ khóa (Instant Search)
    const searchInput = document.getElementById("input-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            _searchQuery = e.target.value.trim();
            renderFilteredRows();
        });
    }

    // 11. Event delegation cho các nút hành động trong bảng (Confirm / Reject / Detail)
    const tbody = document.getElementById("reservations-tbody");
    if (tbody) {
        tbody.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const res = _reservations.find((r) => r.id === id);
            if (!res) return;

            if (action === "confirm") {
                openConfirmModal(res);
            } else if (action === "reject") {
                openRejectModal(res);
            } else if (action === "detail") {
                openDetailModal(res);
            }
        });
    }

    // 12. Gợi ý lý do nhanh trong modal từ chối
    document.querySelectorAll(".reason-chip-btn").forEach((chip) => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".reason-chip-btn").forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            const reasonInput = document.getElementById("reject-reason-input");
            if (reasonInput) {
                reasonInput.value = chip.dataset.reason || chip.textContent;
                const errorMsg = document.getElementById("reject-error-msg");
                if (errorMsg) errorMsg.hidden = true;
            }
        });
    });

    // 13. Nút submit Confirm & Reject trong Modal
    const submitConfirmBtn = document.getElementById("btn-submit-confirm");
    if (submitConfirmBtn) {
        submitConfirmBtn.addEventListener("click", submitConfirmReservation);
    }

    const submitRejectBtn = document.getElementById("btn-submit-reject");
    if (submitRejectBtn) {
        submitRejectBtn.addEventListener("click", submitRejectReservation);
    }

    // 14. Đóng các Modal
    document.querySelectorAll("[data-close-modal]").forEach((closeBtn) => {
        closeBtn.addEventListener("click", closeAllModals);
    });

    // Click ngoài viền modal để đóng
    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            closeAllModals();
        }
    });

    // 15. Nút đóng banner thông báo đơn mới
    const bannerDismiss = document.getElementById("btn-banner-dismiss");
    if (bannerDismiss) {
        bannerDismiss.addEventListener("click", () => {
            const banner = document.getElementById("live-order-banner");
            if (banner) banner.hidden = true;
        });
    }

    const bannerView = document.getElementById("btn-banner-view");
    if (bannerView) {
        bannerView.addEventListener("click", () => {
            const banner = document.getElementById("live-order-banner");
            if (banner) banner.hidden = true;
            // Chọn tab Chờ duyệt
            const pendingTab = document.querySelector('.filter-pill[data-status="PENDING"]');
            if (pendingTab) pendingTab.click();
        });
    }
});

// Clean up kết nối khi unload trang
window.addEventListener("beforeunload", () => {
    disconnectDashboardWS();
});
