/**
 * book.js - TableReserve Booking Page Controller
 * Hỗ trợ:
 * - Bản đồ tương tác Leaflet hiển thị các chi nhánh nhà hàng.
 * - Danh sách Top 5 nhà hàng gần nhất bên phải.
 * - Nhấp vào mục nhà hàng sẽ làm nổi bật vị trí trên bản đồ (pan/zoom, mở popup, highlight marker).
 * - Nút chọn chi nhánh cập nhật trực tiếp vào đơn đặt bàn.
 * - Quy trình tinh gọn: Chọn ngày giờ, số lượng khách, thông tin liên hệ (họ tên, sđt) và xác nhận.
 */

// Danh sách các chi nhánh (có thể load từ API)
let currentBranches = [];

/**
 * Dữ liệu dự phòng — đồng bộ với 30 chi nhánh Hà Nội trong seed_hanoi.py.
 * Chỉ dùng khi backend chưa chạy hoặc chưa seed dữ liệu, nhờ vậy bản đồ
 * vẫn tìm được 5 chi nhánh gần nhất thay vì hiển thị dữ liệu giả.
 */
const HANOI_SEED_BRANCHES = [
    { name: "Phở Thìn Lò Đúc", address: "13 Lò Đúc, Hai Bà Trưng, Hà Nội", lat: 21.0177, lng: 105.8569 },
    { name: "Bún Chả Hương Liên", address: "24 Lê Văn Hưu, Hai Bà Trưng, Hà Nội", lat: 21.0169, lng: 105.8523 },
    { name: "Chả Cá Lã Vọng", address: "14 Chả Cá, Hoàn Kiếm, Hà Nội", lat: 21.0347, lng: 105.8486 },
    { name: "Quán Ăn Ngon", address: "18 Phan Bội Châu, Hoàn Kiếm, Hà Nội", lat: 21.0261, lng: 105.8427 },
    { name: "Bún Ốc Bà Giao", address: "Ngõ 433 Bạch Mai, Hai Bà Trưng, Hà Nội", lat: 21.0028, lng: 105.8507 },
    { name: "Phở Bát Đàn", address: "49 Bát Đàn, Hoàn Kiếm, Hà Nội", lat: 21.0315, lng: 105.8465 },
    { name: "Kem Thủy Tạ", address: "1 Lý Thái Tổ, Hoàn Kiếm, Hà Nội", lat: 21.0313, lng: 105.8546 },
    { name: "Pizza 4P's Tràng Tiền", address: "43 Tràng Tiền, Hoàn Kiếm, Hà Nội", lat: 21.0245, lng: 105.8540 },
    { name: "Maison Sen Buffet", address: "61 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", lat: 21.0219, lng: 105.8475 },
    { name: "Nhà Hàng Sen Tây Hồ", address: "614 Lạc Long Quân, Tây Hồ, Hà Nội", lat: 21.0743, lng: 105.8118 },
    { name: "Bún Bò Huế O Xuân", address: "3 Quang Trung, Hoàn Kiếm, Hà Nội", lat: 21.0244, lng: 105.8488 },
    { name: "Sushi Hokkaido Sachi", address: "Vincom Metropolis, Liễu Giai, Ba Đình, Hà Nội", lat: 21.0316, lng: 105.8152 },
    { name: "Haidilao Vincom Center", address: "Vincom Center Phạm Ngọc Thạch, Đống Đa, Hà Nội", lat: 21.0069, lng: 105.8329 },
    { name: "King BBQ Buffet", address: "Lotte Center, 54 Liễu Giai, Ba Đình, Hà Nội", lat: 21.0319, lng: 105.8122 },
    { name: "Kichi Kichi", address: "101B Phạm Ngọc Thạch, Đống Đa, Hà Nội", lat: 21.0075, lng: 105.8321 },
    { name: "Manwah Taiwanese Hotpot", address: "Thái Hà, Đống Đa, Hà Nội", lat: 21.0118, lng: 105.8213 },
    { name: "Nhà hàng Ngon Garden", address: "70 Nguyễn Du, Hai Bà Trưng, Hà Nội", lat: 21.0194, lng: 105.8447 },
    { name: "Trúc Lâm Trai (Chay)", address: "39 Lê Ngọc Hân, Hai Bà Trưng, Hà Nội", lat: 21.0152, lng: 105.8530 },
    { name: "KFC Cầu Giấy", address: "292 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội", lat: 21.0340, lng: 105.7950 },
    { name: "Highlands Coffee Cột Cờ", address: "28A Điện Biên Phủ, Ba Đình, Hà Nội", lat: 21.0322, lng: 105.8385 },
    { name: "Cộng Cà Phê", address: "15 Trúc Bạch, Ba Đình, Hà Nội", lat: 21.0452, lng: 105.8378 },
    { name: "Gogi House", address: "B4 Phạm Ngọc Thạch, Đống Đa, Hà Nội", lat: 21.0076, lng: 105.8335 },
    { name: "Sumo BBQ", address: "Hoàng Quốc Việt, Cầu Giấy, Hà Nội", lat: 21.0461, lng: 105.7925 },
    { name: "Lẩu Phan", address: "Giải Phóng, Hoàng Mai, Hà Nội", lat: 20.9852, lng: 105.8419 },
    { name: "Bia Hơi Hải Xồm", address: "Hoàng Quốc Việt, Cầu Giấy, Hà Nội", lat: 21.0470, lng: 105.7950 },
    { name: "Dookki Vietnam", address: "Vincom Trần Duy Hưng, Cầu Giấy, Hà Nội", lat: 21.0084, lng: 105.7936 },
    { name: "Mcdonald's Hồ Gươm", address: "2 Hàng Bài, Hoàn Kiếm, Hà Nội", lat: 21.0249, lng: 105.8524 },
    { name: "Starbucks Lan Viên", address: "32 Hàng Bài, Hoàn Kiếm, Hà Nội", lat: 21.0310, lng: 105.8517 },
    { name: "Bánh Cuốn Gia Truyền", address: "14 Hàng Gà, Hoàn Kiếm, Hà Nội", lat: 21.0355, lng: 105.8466 },
    { name: "Xôi Yến", address: "35B Nguyễn Hữu Huân, Hoàn Kiếm, Hà Nội", lat: 21.0326, lng: 105.8537 }
];

/**
 * Chuẩn hoá 1 bản ghi chi nhánh từ backend / localStorage / dữ liệu seed
 * về cùng một cấu trúc để phần còn lại của trang sử dụng thống nhất.
 */
function normalizeBranch(b, index = 0) {
    const lat = Number(b.latitude != null ? b.latitude : b.lat);
    const lng = Number(b.longitude != null ? b.longitude : b.lng);
    const fallbackId = Number(b.id) || index + 1;
    const fallbackRating = (4.3 + (fallbackId % 7) / 10).toFixed(1);
    const totalTables = b.total_tables != null ? b.total_tables : 10 + (fallbackId % 40);
    const availableTables = b.available_tables != null
        ? b.available_tables
        : Math.max(0, totalTables - (fallbackId % 7));

    return {
        id: b.id != null ? b.id : index + 1,
        restaurantName: b.restaurant_name || b.name || "Chi nhánh",
        name: b.name || b.restaurant_name || "Chi nhánh",
        address: b.address || "",
        cuisine: b.cuisine || "Ẩm thực Việt Nam",
        rating: b.rating || fallbackRating,
        reviewsCount: b.reviews_count || 0,
        distanceKm: b.distance_km != null ? Number(b.distance_km) : null,
        durationMin: b.duration_min != null ? Number(b.duration_min) : (b.estimated_time_minutes != null ? Number(b.estimated_time_minutes) : null),
        totalTables,
        availableTables,
        lat,
        lng,
        image: b.image || ""
    };
}

/**
 * Khoảng cách đường chim bay giữa 2 toạ độ (km) — công thức Haversine.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // bán kính Trái Đất (km)
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Tính khoảng cách + thời gian ước tính từ vị trí khách tới mọi chi nhánh.
 */
function computeBranchDistances(lat, lng) {
    currentBranches.forEach((branch) => {
        if (!Number.isFinite(branch.lat) || !Number.isFinite(branch.lng)) {
            branch.distanceKm = null;
            branch.durationMin = null;
            return;
        }
        const km = haversineKm(lat, lng, branch.lat, branch.lng);
        branch.distanceKm = Math.round(km * 100) / 100;
        branch.durationMin = Math.max(1, Math.round((km / 30) * 60));
    });
}

// Trạng thái đơn đặt chỗ hiện tại
const bookingState = {
    selectedBranch: null,
    date: "",
    time: "",
    guestCount: 2,
    customerName: "",
    customerPhone: "",
    userLat: null,
    userLng: null
};

// Biến quản lý Leaflet Map
let bookingMap = null;
let branchLayer = null;
let userMarker = null;
const branchMarkers = new Map(); // id -> L.marker
let activeHighlightedBranchId = null;

/**
 * Format ngày hiển thị tiếng Việt (VD: Thứ Tư, 15/10/2026)
 */
function formatDateVi(dateStr) {
    if (!dateStr) return "--";
    try {
        const d = new Date(dateStr);
        const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
        const dayName = days[d.getDay()];
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${dayName}, ${day}/${month}/${year}`;
    } catch {
        return dateStr;
    }
}

/**
 * Tính ngày theo offset (0 = hôm nay, 1 = ngày mai, ...)
 */
function getDateStringOffset(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function userInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Khởi tạo header người dùng
 */
function initUserHeader(user) {
    const name = displayName(user) || "Khách";
    const avatarEl = document.getElementById("dash-avatar");
    const nameEl = document.getElementById("dash-user-name");

    if (avatarEl) {
        avatarEl.textContent = userInitials(name);
    }
    if (nameEl) {
        nameEl.textContent = name;
    }

    // Điền thông tin người đặt bàn mặc định
    bookingState.customerName = user.name || (name !== "Khách" ? name : "");
    bookingState.customerPhone = user.phone || "";

    const nameInput = document.getElementById("book-cust-name");
    const phoneInput = document.getElementById("book-cust-phone");

    if (nameInput && !nameInput.value) nameInput.value = bookingState.customerName;
    if (phoneInput && !phoneInput.value) phoneInput.value = bookingState.customerPhone;
}

/**
 * Load danh sách chi nhánh: ưu tiên API backend (dữ liệu thật đã seed),
 * sau đó localStorage, cuối cùng là dữ liệu seed Hà Nội đóng gói sẵn.
 */
async function loadBranchesData() {
    // 1) API công khai của backend — trả về toàn bộ chi nhánh đang hoạt động
    try {
        const data = await api.get("/customer/branches");
        if (Array.isArray(data) && data.length > 0) {
            currentBranches = data.map(normalizeBranch);
            console.info(`[book] Đã tải ${currentBranches.length} chi nhánh từ backend.`);
            return;
        }
    } catch (err) {
        console.warn("[book] Không tải được /customer/branches:", err.message);
    }

    // 2) Fallback: dữ liệu do trang quản lý chi nhánh lưu trong localStorage
    try {
        const stored = localStorage.getItem("restaurant_branches");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                currentBranches = parsed.map(normalizeBranch);
                console.info(`[book] Đã tải ${currentBranches.length} chi nhánh từ localStorage.`);
                return;
            }
        }
    } catch {
        // Ignore
    }

    // 3) Fallback cuối: dữ liệu seed Hà Nội (giống seed_hanoi.py)
    currentBranches = HANOI_SEED_BRANCHES.map(normalizeBranch);
    console.info(`[book] Backend offline — dùng ${currentBranches.length} chi nhánh seed Hà Nội.`);
}

/**
 * Lấy danh sách Top 5 nhà hàng gần nhất (sắp xếp theo khoảng cách đã tính).
 */
function getTop5Branches() {
    const candidates = currentBranches.filter(
        (b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)
    );

    if (bookingState.userLat != null && bookingState.userLng != null) {
        candidates.forEach((b) => {
            if (b.distanceKm == null) {
                b.distanceKm = Math.round(
                    haversineKm(bookingState.userLat, bookingState.userLng, b.lat, b.lng) * 100
                ) / 100;
            }
        });
    }

    return candidates
        .sort((a, b) => {
            const da = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
            const db = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
            return da - db;
        })
        .slice(0, 5);
}

/**
 * Khởi tạo Leaflet Map (chỉ tạo 1 lần, không destroy để tránh lỗi
 * "Map container is already initialized").
 */
function initBookingMap() {
    const mapContainer = document.getElementById("booking-map");
    if (!mapContainer || typeof L === "undefined") {
        console.warn("[book] Leaflet chưa sẵn sàng hoặc không tìm thấy #booking-map.");
        return null;
    }

    if (bookingMap) {
        bookingMap.invalidateSize();
        return bookingMap;
    }

    // Trung tâm mặc định: Hà Nội (khu vực dữ liệu seed)
    bookingMap = L.map(mapContainer, {
        scrollWheelZoom: true,
        zoomControl: true
    }).setView([21.0285, 105.8542], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(bookingMap);

    branchLayer = L.layerGroup().addTo(bookingMap);

    // Leaflet cần biết kích thước thật của container sau khi CSS/layout chạy xong
    setTimeout(() => bookingMap && bookingMap.invalidateSize(), 200);
    return bookingMap;
}

/**
 * Vẽ marker vị trí khách hàng (nếu đã có toạ độ).
 */
function renderUserMarker() {
    if (!bookingMap) return;
    if (userMarker) {
        userMarker.remove();
        userMarker = null;
    }
    if (bookingState.userLat == null || bookingState.userLng == null) return;

    userMarker = L.marker([bookingState.userLat, bookingState.userLng], {
        icon: L.divIcon({
            className: "custom-user-marker",
            html: `<div style="background:#2e7d32; color:white; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        })
    }).bindPopup("<b>Vị trí của bạn</b>").addTo(bookingMap);
}

/**
 * Vẽ lại marker cho danh sách chi nhánh truyền vào.
 * @param {Array} branches Danh sách chi nhánh cần vẽ
 * @param {boolean} numbered true = đánh số thứ tự (Top 5), false = chấm tròn
 */
function renderMapMarkers(branches, numbered = true) {
    initBookingMap();
    if (!bookingMap || !branchLayer) return;

    branchLayer.clearLayers();
    branchMarkers.clear();

    (branches || []).forEach((branch, idx) => {
        if (!Number.isFinite(branch.lat) || !Number.isFinite(branch.lng)) return;

        const isSelected = bookingState.selectedBranch && bookingState.selectedBranch.id === branch.id;
        const pinIcon = L.divIcon({
            className: `custom-leaflet-marker ${isSelected ? "selected-pin" : ""}`,
            html: `
                <div class="map-pin-inner">
                    <span class="map-pin-label">${numbered ? idx + 1 : "•"}</span>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -38]
        });

        const marker = L.marker([branch.lat, branch.lng], { icon: pinIcon }).addTo(branchLayer);

        const distanceText = branch.distanceKm != null
            ? `Khoảng cách: <strong>${branch.distanceKm.toFixed(1)} km</strong>`
            : "Khoảng cách: <em>chưa xác định</em>";

        marker.bindPopup(`
            <div class="popup-branch-box">
                <div class="top5-cuisine">${branch.cuisine}</div>
                <h4 class="popup-branch-title">${branch.name}</h4>
                <div class="popup-branch-addr">${branch.address}</div>
                <div class="popup-branch-meta">
                    <span>${distanceText}</span>
                    <span class="top5-rating">★ ${branch.rating}</span>
                </div>
                <button type="button" class="btn-popup-select" id="btn-popup-pick-${branch.id}">
                    ${isSelected ? "✓ Đang chọn chi nhánh này" : "Chọn chi nhánh này"}
                </button>
            </div>
        `);

        marker.on("click", () => highlightBranch(branch.id, false));
        marker.on("popupopen", () => {
            const btn = document.getElementById(`btn-popup-pick-${branch.id}`);
            if (btn) btn.onclick = () => selectBranch(branch);
        });

        branchMarkers.set(branch.id, marker);
    });

    renderUserMarker();
}

/**
 * Đưa bản đồ về góc nhìn bao quát toàn bộ chi nhánh đang hiển thị
 * (mặc định là Top 5 gần nhất, nếu truyền vào thì dùng danh sách đó).
 */
function fitAllBranchesOnMap(branches) {
    if (!bookingMap) return;

    const list = (branches && branches.length ? branches : getTop5Branches())
        .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng));

    const latLngs = list.map((b) => [b.lat, b.lng]);
    if (bookingState.userLat != null && bookingState.userLng != null) {
        latLngs.push([bookingState.userLat, bookingState.userLng]);
    }

    if (latLngs.length === 0) {
        bookingMap.setView([21.0285, 105.8542], 12);
        return;
    }

    if (latLngs.length === 1) {
        bookingMap.setView(latLngs[0], 15);
        return;
    }

    bookingMap.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 14 });
}

/**
 * Làm nổi bật vị trí nhà hàng trên bản đồ và trong danh sách Top 5
 * @param {number} branchId ID của chi nhánh
 * @param {boolean} flyToMap Có bay bản đồ tới vị trí đó không
 */
function highlightBranch(branchId, flyToMap = true) {
    activeHighlightedBranchId = branchId;
    const branch = currentBranches.find((b) => b.id === branchId);
    if (!branch) return;

    // 1. Cập nhật giao diện trong danh sách thẻ Top 5
    document.querySelectorAll(".top5-card-item").forEach((card) => {
        const id = parseInt(card.dataset.branchId, 10);
        card.classList.toggle("highlighted", id === branchId);
    });

    // Cuộn thẻ tương ứng vào khung nhìn nếu chưa thấy
    const targetCard = document.querySelector(`.top5-card-item[data-branch-id="${branchId}"]`);
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // 2. Cập nhật marker trên Leaflet Map
    branchMarkers.forEach((marker, id) => {
        const markerEl = marker.getElement();
        if (markerEl) {
            markerEl.classList.toggle("active-pin", id === branchId);
        }
    });

    // 3. Pan/zoom tới vị trí marker nếu flyToMap = true
    if (flyToMap && bookingMap) {
        bookingMap.flyTo([branch.lat, branch.lng], 15, {
            animate: true,
            duration: 0.8
        });

        const marker = branchMarkers.get(branchId);
        if (marker) {
            marker.openPopup();
        }
    }
}

/**
 * Render danh sách Top 5 nhà hàng gần nhất ở cột bên phải.
 * Markup khớp với CSS .top5-card-item trong style.css.
 */
function renderTop5Branches(branchesList) {
    const container = document.getElementById("top-branches-list");
    const countEl = document.getElementById("top5-count");
    if (!container) return;

    container.innerHTML = "";
    if (countEl) countEl.textContent = branchesList ? branchesList.length : 0;

    if (!branchesList || branchesList.length === 0) {
        container.innerHTML = `
            <div class="top5-empty-state">
                <span class="top5-empty-icon">📍</span>
                <p class="top5-empty-text">
                    Nhập địa chỉ hoặc bấm <strong>Lấy vị trí hiện tại</strong>,
                    sau đó bấm <strong>Hiển thị 5 chi nhánh gần nhất</strong>.
                </p>
            </div>
        `;
        return;
    }

    branchesList.slice(0, 5).forEach((branch, idx) => {
        const isSelected = bookingState.selectedBranch && bookingState.selectedBranch.id === branch.id;
        const distanceText = branch.distanceKm != null
            ? `📍 ${branch.distanceKm.toFixed(1)} km`
            : "📍 ? km";
        const durationText = branch.durationMin != null ? `~${branch.durationMin} phút` : "";
        const tables = branch.availableTables != null && branch.availableTables > 0
            ? `🪑 ${branch.availableTables} bàn trống`
            : `🪑 ${branch.totalTables || 0} bàn`;

        const card = document.createElement("div");
        card.className = `top5-card-item ${isSelected ? "selected" : ""}`;
        card.dataset.branchId = branch.id;
        card.setAttribute("role", "listitem");
        card.innerHTML = `
            <div class="top5-card-header">
                <div class="top5-rank-badge">${idx + 1}</div>
                <div class="top5-card-thumb" style="display:grid;place-items:center;font-size:1.6rem;">🍽️</div>
                <div class="top5-card-meta">
                    <div class="top5-card-name" title="${branch.name}">${branch.name}</div>
                    <div class="top5-card-cuisine">${branch.cuisine}</div>
                    <div class="top5-card-rating">★ ${branch.rating}</div>
                </div>
            </div>
            <div class="top5-card-details">
                <div class="top5-card-distance">${distanceText}${durationText ? " · " + durationText : ""}</div>
                <div class="top5-card-tables">${tables}</div>
            </div>
            <div class="top5-card-actions">
                <button type="button" class="btn-select-branch" data-branch-id="${branch.id}">
                    ${isSelected ? "✓ Đã chọn" : "Chọn chi nhánh"}
                </button>
            </div>
        `;

        // Click vào thẻ: bay tới marker; click nút: chọn chi nhánh
        card.addEventListener("click", (e) => {
            if (e.target.closest(".btn-select-branch")) {
                selectBranch(branch);
                return;
            }
            highlightBranch(branch.id, true);
        });

        container.appendChild(card);
    });
}

/**
 * Chọn chi nhánh để đặt bàn
 */
function selectBranch(branch) {
    if (!branch) return;
    bookingState.selectedBranch = branch;

    // Cập nhật giao diện danh sách
    renderTop5Branches(getTop5Branches());

    // Cập nhật marker styles trên bản đồ
    branchMarkers.forEach((marker, id) => {
        const markerEl = marker.getElement();
        if (markerEl) {
            markerEl.classList.toggle("selected-pin", id === branch.id);
        }
        if (id === branch.id && marker.isPopupOpen()) {
            const btn = document.getElementById(`btn-popup-pick-${id}`);
            if (btn) {
                btn.textContent = "✓ Đang chọn chi nhánh này";
            }
        }
    });

    // Làm nổi bật vị trí chi nhánh vừa chọn
    highlightBranch(branch.id, true);

    // Cập nhật tóm tắt thông tin đặt bàn
    updateSummary();

    showToast(`Đã chọn chi nhánh: ${branch.name}`, "success", 2400);

    // Scroll mượt đến phần nhập ngày/giờ trên thiết bị di động
    if (window.innerWidth < 768) {
        document.getElementById("form-heading")?.scrollIntoView({ behavior: "smooth" });
    }
}

// Cho phép gọi chọn chi nhánh từ popup của Leaflet
window.selectBranchById = function(id) {
    const branch = currentBranches.find((b) => b.id === id);
    if (branch) selectBranch(branch);
};

/**
 * Lọc chi nhánh theo từ khóa tìm kiếm
 */
function filterBranches(keyword) {
    const term = (keyword || "").toLowerCase().trim();
    const top5 = getTop5Branches();

    if (!term) {
        renderTop5Branches(top5);
        return;
    }

    const filtered = top5.filter((b) =>
        b.restaurantName.toLowerCase().includes(term) ||
        b.name.toLowerCase().includes(term) ||
        b.address.toLowerCase().includes(term) ||
        b.cuisine.toLowerCase().includes(term)
    );

    renderTop5Branches(filtered.length ? filtered : top5);

    if (filtered.length > 0) {
        highlightBranch(filtered[0].id, true);
    }
}

/**
 * Khởi tạo chọn ngày và giờ (Step 2)
 */
function initDateTimeSection() {
    const dateInput = document.getElementById("book-date-input");
    const todayStr = getDateStringOffset(0);

    // Không gán mặc định — để trống cho đến khi khách chọn
    if (dateInput) {
        dateInput.min = todayStr;
        dateInput.value = "";
        dateInput.addEventListener("change", (e) => {
            bookingState.date = e.target.value;
            bookingState._dateTouched = !!e.target.value;
            document.querySelectorAll(".quick-chip-btn").forEach((b) => b.classList.remove("active"));
            updateSummary();
        });
    }

    // Quick chip buttons (Hôm nay, Ngày mai, ...) — hỗ trợ toggle bỏ chọn khi nhấn lần 2
    document.querySelectorAll(".quick-chip-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const wasActive = btn.classList.contains("active");
            document.querySelectorAll(".quick-chip-btn").forEach((b) => b.classList.remove("active"));

            if (wasActive) {
                // Nhấn lần 2 — bỏ chọn
                bookingState.date = "";
                bookingState._dateTouched = false;
                if (dateInput) dateInput.value = "";
            } else {
                btn.classList.add("active");
                const offset = parseInt(btn.dataset.offset || "0", 10);
                const targetDate = getDateStringOffset(offset);
                bookingState.date = targetDate;
                bookingState._dateTouched = true;
                if (dateInput) dateInput.value = targetDate;
            }
            updateSummary();
        });
    });

    // Time slot buttons — hỗ trợ toggle bỏ chọn khi nhấn lần 2
    document.querySelectorAll(".time-slot-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const wasSelected = btn.classList.contains("selected");
            document.querySelectorAll(".time-slot-btn").forEach((b) => b.classList.remove("selected"));

            if (wasSelected) {
                // Nhấn lần 2 — bỏ chọn giờ
                bookingState.time = "";
                bookingState._timeTouched = false;
            } else {
                btn.classList.add("selected");
                bookingState.time = btn.dataset.time || btn.textContent.trim();
                bookingState._timeTouched = true;
            }
            updateSummary();
        });
    });
}

/**
 * Khởi tạo bộ đếm số lượng khách (Đã lược bỏ vị trí bàn mong muốn)
 */
function initGuestPicker() {
    const counterDisplay = document.getElementById("guest-counter-val");
    const btnMinus = document.getElementById("btn-guest-minus");
    const btnPlus = document.getElementById("btn-guest-plus");
    const guestDesc = document.getElementById("guest-type-desc");

    function updateGuestUI() {
        if (counterDisplay) counterDisplay.textContent = bookingState.guestCount;
        if (btnMinus) btnMinus.disabled = bookingState.guestCount <= 1;
        if (btnPlus) btnPlus.disabled = bookingState.guestCount >= 20;

        if (guestDesc) {
            if (bookingState.guestCount === 1) guestDesc.textContent = "Bàn 1 người thư giãn, yên tĩnh";
            else if (bookingState.guestCount === 2) guestDesc.textContent = "Bàn 2 người lãng mạn, ấm cúng";
            else if (bookingState.guestCount <= 4) guestDesc.textContent = "Bàn gia đình hoặc bạn bè thân mật";
            else if (bookingState.guestCount <= 8) guestDesc.textContent = "Bàn tiệc họp mặt nhóm, đối tác";
            else guestDesc.textContent = "Tiệc đoàn đông người (Nhà hàng sẽ chuẩn bị trước)";
        }

        document.querySelectorAll(".guest-pill-btn").forEach((pill) => {
            const val = parseInt(pill.dataset.guests || "0", 10);
            pill.classList.toggle("active", bookingState._guestTouched && val === bookingState.guestCount);
        });

        updateSummary();
    }

    if (btnMinus) {
        btnMinus.addEventListener("click", () => {
            if (bookingState.guestCount > 1) {
                bookingState.guestCount--;
                bookingState._guestTouched = true;
                updateGuestUI();
            }
        });
    }

    if (btnPlus) {
        btnPlus.addEventListener("click", () => {
            if (bookingState.guestCount < 20) {
                bookingState.guestCount++;
                bookingState._guestTouched = true;
                updateGuestUI();
            }
        });
    }

    // Guest pill buttons — hỗ trợ toggle bỏ chọn khi nhấn lần 2
    document.querySelectorAll(".guest-pill-btn").forEach((pill) => {
        pill.addEventListener("click", () => {
            const pillVal = parseInt(pill.dataset.guests || "2", 10);
            const wasActive = bookingState._guestTouched && bookingState.guestCount === pillVal;

            if (wasActive) {
                // Nhấn lần 2 — bỏ chọn, ẩn dòng số khách trong tóm tắt
                bookingState._guestTouched = false;
            } else {
                bookingState.guestCount = pillVal;
                bookingState._guestTouched = true;
            }
            updateGuestUI();
        });
    });

    updateGuestUI();
}

/**
 * Cập nhật cột tóm tắt thông tin đặt bàn trực quan (Sticky Sidebar)
 * Đã lược bỏ: vị trí bàn mong muốn, món ăn đặt trước, chi phí đặt chỗ và số bàn tạm tính
 * Các dòng thời gian, số khách ẩn mặc định — chỉ hiện khi khách hàng chọn giá trị
 */
function updateSummary() {
    const branch = bookingState.selectedBranch;
    const nameEl = document.getElementById("sum-branch");
    const distEl = document.getElementById("sum-branch-dist");
    const infoEl = document.getElementById("map-selected-info");

    if (nameEl) nameEl.textContent = branch ? branch.name : "Chưa chọn";
    if (distEl) {
        if (branch && branch.distanceKm != null) {
            const duration = branch.durationMin != null ? ` · ~${branch.durationMin} phút` : "";
            distEl.textContent = `${branch.distanceKm.toFixed(1)} km${duration}`;
        } else {
            distEl.textContent = "";
        }
    }
    if (infoEl) {
        infoEl.textContent = branch
            ? `Đã chọn: ${branch.name}`
            : "Chưa chọn chi nhánh nào";
    }
}

/**
 * Định dạng mã đặt chỗ hiển thị: số id từ backend -> "#TR-000012",
 * chuỗi dự phòng "TR-123456" -> "#TR-123456".
 */
function formatReservationCode(id) {
    if (typeof id === "number") {
        return `#TR-${String(id).padStart(6, "0")}`;
    }
    if (id) return `#${String(id).replace(/^#/, "")}`;
    return "#TR-" + Math.floor(100000 + Math.random() * 900000);
}

/**
 * Hiển thị vé đặt chỗ thành công (Ticket Modal)
 */
function showConfirmationTicket(resData) {
    const modal = document.getElementById("ticket-modal");
    if (!modal) return;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("ticket-res-code", formatReservationCode(resData.id));
    setText("ticket-res-restaurant", resData.restaurant_name || resData.branch_name || "—");
    setText("ticket-res-address", resData.branch_address || "—");
    setText("ticket-res-datetime", resData.reservation_time || "—");
    setText("ticket-res-guests", `${resData.guest_count || 0} khách`);
    setText("ticket-res-customer", `${resData.customer_name || ""} • ${resData.customer_phone || ""}`);
    setText("ticket-res-table", resData.table_number
        ? `Bàn số ${resData.table_number}`
        : "Sẽ được sắp xếp khi bạn đến nhà hàng");

    // Cập nhật badge trạng thái theo kết quả trả về (mặc định PENDING)
    const statusEl = document.getElementById("ticket-res-status");
    if (statusEl) {
        const statusMap = {
            PENDING: ["pending", "CHỜ XÁC NHẬN"],
            CONFIRMED: ["confirmed", "ĐÃ XÁC NHẬN"],
            REJECTED: ["rejected", "TỪ CHỐI"],
            CANCELLED: ["cancelled", "ĐÃ HUỶ"]
        };
        const [cls, label] = statusMap[resData.status] || statusMap.PENDING;
        statusEl.className = `status-badge ${cls}`;
        statusEl.textContent = label;
    }

    modal.hidden = false;
    // Ghi lại thời điểm vé vừa hiện — dùng để chặn cú click/tap "đúp" còn sót
    // từ nút Xác nhận rơi trúng nút Đóng ngay sau khi vé mở ra.
    modal.dataset.openedAt = String(Date.now());
}

/**
 * Xử lý xác nhận gửi đơn đặt bàn
 */
async function handleBookingSubmit() {
    // Validation
    if (!bookingState.selectedBranch) {
        showToast("Vui lòng chọn một chi nhánh nhà hàng.", "danger");
        document.getElementById("booking-map")?.scrollIntoView({ behavior: "smooth" });
        return;
    }

    if (!bookingState.date) {
        showToast("Vui lòng chọn ngày dùng bữa.", "danger");
        return;
    }

    if (!bookingState.time) {
        showToast("Vui lòng chọn khung giờ nhận bàn.", "danger");
        return;
    }

    const nameInput = document.getElementById("book-cust-name");
    const phoneInput = document.getElementById("book-cust-phone");

    const custName = nameInput ? nameInput.value.trim() : bookingState.customerName;
    const custPhone = phoneInput ? phoneInput.value.trim() : bookingState.customerPhone;

    if (!custName) {
        showToast("Vui lòng nhập họ và tên người liên hệ nhận bàn.", "danger");
        nameInput?.focus();
        return;
    }

    if (!custPhone) {
        showToast("Vui lòng nhập số điện thoại để nhà hàng giữ chỗ.", "danger");
        phoneInput?.focus();
        return;
    }

    const submitBtn = document.getElementById("btn-submit-booking");
    if (submitBtn) submitBtn.disabled = true;

    setLoading(true, "Đang gửi yêu cầu đặt chỗ tới nhà hàng...");

    const reservationPayload = {
        branch_id: bookingState.selectedBranch.id,
        reservation_time: `${bookingState.date}T${bookingState.time}:00`,
        guest_count: bookingState.guestCount,
        customer_name: custName,
        customer_phone: custPhone
    };

    try {
        let resultReservation = null;
        let usedDemoMode = false;

        // Gửi tới backend API
        try {
            const apiRes = await api.post("/customer/reservations", reservationPayload);
            
            // Map dữ liệu từ backend sang format frontend mong muốn
            resultReservation = {
                id: apiRes.id,
                branch_id: apiRes.branch_id,
                branch_name: apiRes.branch?.name,
                restaurant_name: apiRes.branch?.name,
                branch_address: apiRes.branch?.address,
                reservation_time: `${bookingState.time} • ${formatDateVi(bookingState.date)}`,
                raw_time: apiRes.reservation_time,
                guest_count: apiRes.guest_count,
                // Backend chỉ gán số bàn khi chủ quán xác nhận -> giữ null để vé ghi
                // "Sẽ được sắp xếp khi bạn đến nhà hàng" thay vì bịa số bàn ngẫu nhiên
                table_number: apiRes.table_number ?? null,
                customer_name: apiRes.customer?.full_name || custName,
                customer_phone: apiRes.customer?.phone || custPhone,
                status: apiRes.status,
                created_at: apiRes.created_at
            };
        } catch (err) {
            // Backend trả lỗi nghiệp vụ thật (400 giờ quá khứ, 409 hết bàn, 404...)
            // -> Ném lên để hiện đúng nguyên nhân, KHÔNG mở vé thành công giả.
            if (!err.isNetworkError) {
                throw err;
            }

            // Backend offline hoàn toàn -> Demo mode lưu vào localStorage
            usedDemoMode = true;
            console.warn("Backend offline, using local demo mode", err);
            const randCode = "TR-" + Math.floor(100000 + Math.random() * 900000);
            resultReservation = {
                id: randCode,
                branch_id: bookingState.selectedBranch.id,
                branch_name: bookingState.selectedBranch.name,
                restaurant_name: bookingState.selectedBranch.restaurantName,
                branch_address: bookingState.selectedBranch.address,
                reservation_time: `${bookingState.time} • ${formatDateVi(bookingState.date)}`,
                raw_time: `${bookingState.date}T${bookingState.time}:00`,
                guest_count: bookingState.guestCount,
                table_number: Math.floor(1 + Math.random() * 12),
                customer_name: custName,
                customer_phone: custPhone,
                status: "PENDING",
                created_at: new Date().toISOString()
            };
        }

        // Chỉ đơn demo (backend offline) mới lưu localStorage.
        // Đơn thành công qua API đã nằm trong DB backend và lịch sử sẽ đọc từ API,
        // tránh hai nguồn dữ liệu lệch nhau.
        if (usedDemoMode) {
            try {
                const savedList = JSON.parse(localStorage.getItem("customer_reservations") || "[]");
                savedList.unshift(resultReservation);
                localStorage.setItem("customer_reservations", JSON.stringify(savedList));
            } catch (e) {
                console.warn("Could not save to localStorage", e);
            }
        }

        // Cập nhật số bàn trống của chi nhánh vừa đặt
        if (bookingState.selectedBranch.availableTables > 0) {
            bookingState.selectedBranch.availableTables--;
            renderTop5Branches(getTop5Branches());
        }

        showToast(
            usedDemoMode
                ? "Đặt bàn (chế độ offline): đơn chỉ lưu trên trình duyệt vì backend đang không kết nối."
                : "Đặt bàn thành công! Mã đặt chỗ của bạn đã sẵn sàng.",
            usedDemoMode ? "warning" : "success"
        );
        showConfirmationTicket(resultReservation);

    } catch (err) {
        showToast(err.message || "Đặt bàn thất bại. Vui lòng thử lại sau.", "danger");
    } finally {
        setLoading(false);
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Khởi chạy khi tài liệu sẵn sàng
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Kiểm tra xác thực
    const user = requireAuth("CUSTOMER");
    if (!user) return;

    // 2. Khởi tạo header
    initUserHeader(user);

    // 3. Load danh sách chi nhánh thật từ backend / localStorage / seed
    await loadBranchesData();

    // 4. Khởi tạo bản đồ và hiển thị toàn bộ chi nhánh hiện có
    initBookingMap();
    renderMapMarkers(currentBranches, false);
    fitAllBranchesOnMap(currentBranches);
    setMapStatus("Nhập địa chỉ hoặc lấy vị trí hiện tại để tìm 5 chi nhánh gần nhất");

    // Danh sách Top 5 để trống kèm hướng dẫn cho tới khi có vị trí
    renderTop5Branches([]);
    updateSummary();

    // 5. Khởi tạo chọn ngày giờ và số khách
    initDateTimeSection();
    initGuestPicker();

    // 6. Nút lấy địa chỉ + tìm 5 chi nhánh gần nhất
    initAddressTools(user);

    /* ============================================================
     * Địa chỉ & tìm 5 chi nhánh gần nhất
     * ============================================================ */

    function setMapStatus(text) {
        const el = document.getElementById("map-status");
        if (el) el.textContent = text;
    }

    function findBranchByText(text) {
        const term = String(text || "").toLowerCase().trim();
        if (!term) return null;
        const shortTerm = term.split(",")[0].trim();

        const exact = currentBranches.find((b) => {
            const name = b.name.toLowerCase();
            const address = b.address.toLowerCase();
            return (
                name.includes(term) ||
                address.includes(term) ||
                term.includes(name) ||
                (shortTerm.length >= 3 && (name.includes(shortTerm) || address.includes(shortTerm)))
            );
        });
        if (exact) return exact;

        // Khớp mờ theo từ khóa: tách địa chỉ thành các cụm (đường, quận, phường)
        // rồi tìm chi nhánh chia sẻ nhiều cụm nhất — VD "Cầu Giấy" trong
        // "292 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội".
        const IGNORE = new Set([" hà nội ", " hà nôi ", " việt nam ", " số ", " đường ", " phố ", " phường ", " quận ", " huyện ", " thành phố "]);
        const tokens = term
            .split(/[,;]+/)
            .map((p) => ` ${p.trim()} `)
            .filter((p) => !IGNORE.has(p) && p.trim().length >= 3);
        if (!tokens.length) return null;

        let best = null;
        let bestScore = 0;
        currentBranches.forEach((b) => {
            const haystack = ` ${b.name.toLowerCase()} ${b.address.toLowerCase()} `;
            const score = tokens.filter((t) => haystack.includes(t)).length;
            if (score > bestScore) {
                bestScore = score;
                best = b;
            }
        });
        return bestScore > 0 ? best : null;
    }

    /**
     * Chuẩn hoá địa chỉ tiếng Việt trước khi geocode.
     * Nominatim/Photon rất khó khớp khi chuỗi chứa các tiền từ hành chính
     * ("Số 298 đường Cầu Diễn, phường Tây Tựu, quận Bắc Từ Liêm..."),
     * nhưng khớp tốt với dạng gọn "298 Cầu Diễn, Bắc Từ Liêm, Hà Nội".
     */
    function normalizeVietnameseAddress(address) {
        let s = String(address || "").trim();
        // Dùng lookaround Unicode (\p{L}) vì \b của JS không nhận ký tự tiếng Việt (đ, à...)
        // Cụm đa từ phải bỏ TRƯỚC để không bị tách rời ("thành phố" -> "thành").
        s = s.replace(/(?<![\p{L}\p{N}])thành phố(?=\s|$)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])số(?=\s*\d)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])đường(?=\s)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])phố(?=\s+[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ])/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])phường(?=\s)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])quận(?=\s)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])huyện(?=\s)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])xã(?=\s)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])thị trấn(?=\s|$)/giu, " ");
        // Viết tắt có dấu chấm: "P. Tây Tựu", "Q. Bắc Từ Liêm", "TP. Hà Nội"
        s = s.replace(/(?<![\p{L}\p{N}])tp\.(?=\s|$)/giu, " ");
        s = s.replace(/(?<![\p{L}\p{N}])[pqt]\.(?=\s|$)/giu, " ");
        s = s.replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
        return s;
    }

    /**
     * Tạo các biến thể truy giảm dần độ cụ thể, VD:
     * "Số 298 đường Cầu Diễn, phường Tây Tựu, quận Bắc Từ Liêm, thành phố Hà Nội"
     *   → "298 Cầu Diễn, Bắc Từ Liêm, Hà Nội"
     *   → "Cầu Diễn, Bắc Từ Liêm, Hà Nội"
     *   → "Cầu Diễn, Hà Nội"
     */
    function buildAddressCandidates(address) {
        const normalized = normalizeVietnameseAddress(address);
        const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);

        const housePart = parts[0] || "";
        const hasHouseNumber = /^\d+/.test(housePart);
        const tail = parts.slice(1).filter((p) => !/^(việt nam|vietnam)$/i.test(p));

        // Luôn thử nguyên văn địa chỉ người dùng nhập trước, rồi tới các bản chuẩn hoá
        const candidates = [String(address || "").trim(), normalized];
        if (hasHouseNumber && tail.length) {
            // Bỏ dần các cụm trung gian (phường...), giữ số nhà + quận + thành phố
            candidates.push([housePart, ...tail.slice(1)].join(", "));
            // Chỉ số nhà + thành phố cuối
            candidates.push([housePart, tail[tail.length - 1]].join(", "));
        }
        if (parts.length > 1) {
            // Không có số nhà: lấy tên đường + thành phố
            const street = hasHouseNumber ? housePart.replace(/^\d+\s*/, "") : housePart;
            candidates.push([street, tail[tail.length - 1] || "Hà Nội"].join(", "));
        }
        // Loại trùng lặp và các chuỗi rỗng
        return [...new Set(candidates.filter((c) => c && c.replace(/[,.\s]/g, "").length > 2))];
    }

    async function queryNominatim(query) {
        const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=" +
            encodeURIComponent(query);
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                label: data[0].display_name || query
            };
        }
        return null;
    }

    async function queryPhoton(query) {
        const res = await fetch(
            "https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(query),
            { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const feature = data && data.features && data.features[0];
        if (feature && feature.geometry && Array.isArray(feature.geometry.coordinates)) {
            const name = feature.properties &&
                [feature.properties.name, feature.properties.district, feature.properties.city]
                    .filter(Boolean).join(", ");
            return {
                lat: Number(feature.geometry.coordinates[1]),
                lng: Number(feature.geometry.coordinates[0]),
                label: name || query
            };
        }
        return null;
    }

    async function geocodeAddress(address) {
        const candidates = buildAddressCandidates(address);

        // Thử lần lượt từng biến thể địa chỉ trên 2 provider
        for (const q of candidates) {
            try {
                const hit = await queryNominatim(q);
                if (hit) return hit;
            } catch {
                // Nominatim lỗi mạng/quá giới hạn → thử provider dự phòng
            }
            try {
                const hit = await queryPhoton(q);
                if (hit) return hit;
            } catch {
                // tiếp tục biến thể kế tiếp
            }
        }

        throw new Error("Không tìm thấy địa chỉ này. Hãy nhập rõ hơn (VD: 13 Lò Đúc, Hà Nội).");
    }

    /**
     * Tính khoảng cách từ (lat,lng) tới toàn bộ chi nhánh, vẽ Top 5 lên bản đồ
     * và render danh sách bên phải.
     */
    async function showNearestBranches(lat, lng, label) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new Error("Toạ độ không hợp lệ.");
        }
        if (!currentBranches.length) await loadBranchesData();

        bookingState.userLat = lat;
        bookingState.userLng = lng;
        computeBranchDistances(lat, lng);

        const top5 = getTop5Branches();
        if (!top5.length) {
            showToast("Không có chi nhánh nào trong hệ thống.", "danger");
            return [];
        }

        renderTop5Branches(top5);
        renderMapMarkers(top5, true); // 5 marker đánh số 1..5
        fitAllBranchesOnMap(top5);
        setMapStatus(`Đã tìm thấy ${top5.length} chi nhánh gần ${label}`);
        showToast(`Đã hiển thị ${top5.length} chi nhánh gần nhất trên bản đồ.`, "success");
        return top5;
    }

    /** Địa chỉ -> toạ độ (Nominatim), fallback khớp tên chi nhánh có sẵn. */
    async function resolveAddress(address) {
        // Người dùng có thể đã bấm "Lấy vị trí hiện tại" → ô địa chỉ chứa toạ độ
        const coordMatch = String(address).match(/(-?\d{1,2}[.,]\d+)\s*[,;]\s*(-?\d{1,3}[.,]\d+)/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1].replace(",", "."));
            const lng = parseFloat(coordMatch[2].replace(",", "."));
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng, label: "toạ độ đã nhập" };
            }
        }

        try {
            return await geocodeAddress(address);
        } catch (err) {
            const local = findBranchByText(address);
            if (local) {
                return { lat: local.lat, lng: local.lng, label: local.name };
            }
            throw err;
        }
    }

    /** Hàm dùng chung cho các nút (và có thể gọi từ ngoài). */
    window.findNearestBranches = async function (input = {}) {
        setLoading(true, "Đang tìm 5 chi nhánh gần nhất...");
        try {
            if (input.lat != null && input.lng != null) {
                return await showNearestBranches(Number(input.lat), Number(input.lng), "vị trí của bạn");
            }
            if (input.address) {
                const point = await resolveAddress(input.address);
                return await showNearestBranches(point.lat, point.lng, input.address);
            }
            throw new Error("Chưa có địa chỉ hoặc toạ độ.");
        } catch (err) {
            showToast(err.message || "Không thể tìm chi nhánh gần nhất.", "danger");
            setMapStatus(err.message || "Không tìm được chi nhánh gần nhất");
            return [];
        } finally {
            setLoading(false);
        }
    };

    /**
     * Gắn sự kiện cho ô địa chỉ và 3 nút: lấy vị trí / địa chỉ mặc định / tìm chi nhánh.
     */
    function initAddressTools(user) {
        const addressInput = document.getElementById("book-address");
        const btnGet = document.getElementById("btn-get-location");
        const btnDefault = document.getElementById("btn-default-address");
        const btnShow = document.getElementById("btn-show-nearest");

        const savedAddress =
            (user && user.address ? String(user.address).trim() : "") ||
            localStorage.getItem("tr-default-address") || "";

        if (addressInput) {
            if (savedAddress && !addressInput.value) addressInput.value = savedAddress;
            addressInput.addEventListener("change", () => {
                const val = addressInput.value.trim();
                if (val) {
                    localStorage.setItem("tr-default-address", val);
                    setMapStatus("Đã lưu địa chỉ mặc định.");
                }
            });
            addressInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (btnShow) btnShow.click();
                }
            });
        }

        /* 📍 Lấy vị trí hiện tại */
        if (btnGet) {
            btnGet.addEventListener("click", () => {
                if (!navigator.geolocation) {
                    showToast("Trình duyệt không hỗ trợ định vị.", "danger");
                    return;
                }
                const originalText = btnGet.textContent;
                btnGet.disabled = true;
                btnGet.textContent = "📍 Đang xác định...";
                setMapStatus("Đang lấy vị trí hiện tại...");

                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        if (addressInput) {
                            addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                        }
                        await window.findNearestBranches({ lat, lng });
                        btnGet.disabled = false;
                        btnGet.textContent = originalText;
                    },
                    (error) => {
                        btnGet.disabled = false;
                        btnGet.textContent = originalText;
                        const reason = error && error.code === 1
                            ? "Bạn chưa cho phép truy cập vị trí."
                            : "Không lấy được vị trí hiện tại.";
                        showToast(`${reason} Vui lòng nhập địa chỉ thủ công.`, "danger");
                        setMapStatus("Không lấy được vị trí — hãy nhập địa chỉ thủ công");
                    },
                    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
                );
            });
        }

        /* 🏠 Địa chỉ mặc định */
        if (btnDefault) {
            btnDefault.addEventListener("click", () => {
                const saved = localStorage.getItem("tr-default-address") ||
                    (user && user.address ? String(user.address).trim() : "");
                if (!saved) {
                    showToast("Chưa có địa chỉ mặc định. Hãy nhập địa chỉ rồi thử lại.", "danger");
                    if (addressInput) addressInput.focus();
                    return;
                }
                if (addressInput) addressInput.value = saved;
                window.findNearestBranches({ address: saved });
            });
        }

        /* 🔍 Hiển thị 5 chi nhánh gần nhất */
        if (btnShow) {
            btnShow.addEventListener("click", () => {
                const address = addressInput ? addressInput.value.trim() : "";
                if (!address) {
                    showToast("Vui lòng nhập địa chỉ hoặc bấm Lấy vị trí hiện tại trước.", "danger");
                    if (addressInput) addressInput.focus();
                    return;
                }
                localStorage.setItem("tr-default-address", address);
                setMapStatus("Đang tìm 5 chi nhánh gần nhất...");
                window.findNearestBranches({ address });
            });
        }
    }

    // 7.6 Nút Đặt bàn (Xác nhận)
    const submitBtn = document.getElementById("btn-submit-booking");
    if (submitBtn) {
        submitBtn.addEventListener("click", handleBookingSubmit);
    }

    // 9. Nút Đăng xuất
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    // 10. Đóng modal vé xác nhận — CHỈ đóng khi người dùng chủ động bấm nút Đóng.
    // (Modal không có timer tự tắt; overlay nền cũng không bấm-để-đóng.)
    const closeModalBtn = document.getElementById("btn-close-ticket");
    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            const modal = document.getElementById("ticket-modal");
            if (!modal) return;

            // Chặn cú click/tap "đúp" còn sót từ nút Xác nhận rơi trúng nút Đóng
            // ngay sau khi vé vừa mở — vé phải hiện đủ lâu để người dùng kịp đọc.
            const openedAt = Number(modal.dataset.openedAt || 0);
            if (Date.now() - openedAt < 1000) return;

            modal.hidden = true;
        });
    }
});
