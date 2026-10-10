/**
 * book.js - TableReserve Booking Page Controller
 * Hỗ trợ:
 * - Bản đồ tương tác Leaflet hiển thị các chi nhánh nhà hàng.
 * - Danh sách Top 5 nhà hàng gần nhất bên phải.
 * - Nhấp vào mục nhà hàng sẽ làm nổi bật vị trí trên bản đồ (pan/zoom, mở popup, highlight marker).
 * - Nút chọn chi nhánh cập nhật trực tiếp vào đơn đặt bàn.
 * - Quy trình tinh gọn: Chọn ngày giờ, số lượng khách, thông tin liên hệ (họ tên, sđt) và xác nhận.
 */

// Danh sách các chi nhánh nhà hàng mẫu chuẩn hệ thống tại TP.HCM
const MOCK_BRANCHES = [
    {
        id: 1,
        restaurantName: "Le Ciel Gourmet",
        name: "Chi nhánh Bến Nghé — Quận 1",
        address: "72 Lê Thánh Tôn, P. Bến Nghé, Quận 1, TP. HCM",
        cuisine: "Ẩm thực Pháp & Âu Hiện Đại",
        rating: 4.9,
        reviewsCount: 328,
        distanceKm: 0.8,
        durationMin: 3,
        totalTables: 12,
        availableTables: 5,
        lat: 10.7769,
        lng: 106.7009,
        image: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 2,
        restaurantName: "Hoàng Gia Cuisine",
        name: "Chi nhánh Nguyễn Huệ — Quận 1",
        address: "98 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. HCM",
        cuisine: "Cơm Cung Đình & Hương Vị Việt",
        rating: 4.8,
        reviewsCount: 370,
        distanceKm: 1.1,
        durationMin: 4,
        totalTables: 15,
        availableTables: 7,
        lat: 10.7735,
        lng: 106.7042,
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 3,
        restaurantName: "The Olive Tree Dining",
        name: "Chi nhánh Pasteur — Quận 3",
        address: "215 Pasteur, P. Võ Thị Sáu, Quận 3, TP. HCM",
        cuisine: "Địa Trung Hải & Steak Thượng Hạng",
        rating: 4.9,
        reviewsCount: 286,
        distanceKm: 1.5,
        durationMin: 5,
        totalTables: 14,
        availableTables: 6,
        lat: 10.7832,
        lng: 106.6931,
        image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 4,
        restaurantName: "Nhà Hàng Hương Sen",
        name: "Chi nhánh Thảo Điền — TP. Thủ Đức",
        address: "18 Xuân Thủy, P. Thảo Điền, TP. Thủ Đức, TP. HCM",
        cuisine: "Ẩm thực Á Đông & Hải Sản Sống",
        rating: 4.8,
        reviewsCount: 245,
        distanceKm: 2.4,
        durationMin: 7,
        totalTables: 10,
        availableTables: 3,
        lat: 10.8035,
        lng: 106.7324,
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 5,
        restaurantName: "Sora & Umi Japanese Dining",
        name: "Chi nhánh Landmark 81 — Bình Thạnh",
        address: "Tầng 5, Vincom Landmark 81, 720A Điện Biên Phủ, Bình Thạnh, TP. HCM",
        cuisine: "Omakase & Sushi Tinh Hoa Nhật Bản",
        rating: 5.0,
        reviewsCount: 412,
        distanceKm: 3.1,
        durationMin: 9,
        totalTables: 8,
        availableTables: 4,
        lat: 10.7951,
        lng: 106.7218,
        image: "https://images.unsplash.com/photo-1578474846511-04ba529f0b88?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 6,
        restaurantName: "Bếp Quê Signature",
        name: "Chi nhánh Phú Mỹ Hưng — Quận 7",
        address: "102 Nguyễn Đức Cảnh, P. Tân Phong, Quận 7, TP. HCM",
        cuisine: "Cơm Niêu & Món Ngon 3 Miền",
        rating: 4.7,
        reviewsCount: 194,
        distanceKm: 5.2,
        durationMin: 14,
        totalTables: 14,
        availableTables: 2,
        lat: 10.7291,
        lng: 106.7099,
        image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=700&q=80"
    }
];

// Trạng thái đơn đặt chỗ hiện tại
const bookingState = {
    selectedBranch: null,
    date: "",
    time: "19:00",
    guestCount: 2,
    customerName: "",
    customerPhone: ""
};

// Biến quản lý Leaflet Map
let bookingMap = null;
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
 * Lấy danh sách Top 5 nhà hàng gần nhất sắp xếp theo khoảng cách
 */
function getTop5Branches() {
    return [...MOCK_BRANCHES]
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 5);
}

/**
 * Khởi tạo Leaflet Map và các Markers
 */
function initBookingMap() {
    const mapContainer = document.getElementById("booking-map");
    if (!mapContainer || typeof L === "undefined") {
        console.warn("Leaflet library not ready or container not found.");
        return;
    }

    const top5 = getTop5Branches();
    const defaultCenter = [top5[0].lat, top5[0].lng];

    // Tạo bản đồ Leaflet
    bookingMap = L.map("booking-map", {
        scrollWheelZoom: true,
        zoomControl: true
    }).setView(defaultCenter, 13);

    // Sử dụng OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(bookingMap);

    // Tạo Marker cho từng chi nhánh trong Top 5
    top5.forEach((branch, idx) => {
        const isSelected = bookingState.selectedBranch?.id === branch.id;
        const pinIcon = L.divIcon({
            className: `custom-leaflet-marker ${isSelected ? "selected-pin" : ""}`,
            html: `
                <div class="map-pin-inner" id="pin-branch-${branch.id}">
                    <span class="map-pin-label">${idx + 1}</span>
                </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -38]
        });

        const marker = L.marker([branch.lat, branch.lng], { icon: pinIcon }).addTo(bookingMap);

        // Nội dung popup khi click marker
        const popupContent = `
            <div class="popup-branch-box">
                <div class="top5-cuisine">${branch.cuisine}</div>
                <h4 class="popup-branch-title">${branch.restaurantName}</h4>
                <div class="popup-branch-addr">📍 ${branch.address}</div>
                <div class="popup-branch-meta">
                    <span>Khoảng cách: <strong>${branch.distanceKm} km</strong></span>
                    <span class="top5-rating">★ ${branch.rating}</span>
                </div>
                <button type="button" class="btn-popup-select" id="btn-popup-pick-${branch.id}">
                    ${isSelected ? "✓ Đang chọn chi nhánh này" : "Chọn chi nhánh này"}
                </button>
            </div>
        `;

        marker.bindPopup(popupContent);

        // Sự kiện click vào marker
        marker.on("click", () => {
            highlightBranch(branch.id, false);
            // Gắn sự kiện nút trong popup sau khi popup mở
            setTimeout(() => {
                const btn = document.getElementById(`btn-popup-pick-${branch.id}`);
                if (btn) {
                    btn.onclick = () => selectBranch(branch);
                }
            }, 50);
        });

        marker.on("popupopen", () => {
            const btn = document.getElementById(`btn-popup-pick-${branch.id}`);
            if (btn) {
                btn.onclick = () => selectBranch(branch);
            }
        });

        branchMarkers.set(branch.id, marker);
    });

    // Nút Toàn cảnh (Recenter Map)
    const recenterBtn = document.getElementById("btn-recenter-map");
    if (recenterBtn) {
        recenterBtn.addEventListener("click", () => {
            fitAllBranchesOnMap();
        });
    }

    // Sau khi render map xong, fit view để thấy toàn cảnh các marker
    setTimeout(() => {
        bookingMap.invalidateSize();
        fitAllBranchesOnMap();
    }, 200);
}

/**
 * Đưa bản đồ về góc nhìn bao quát toàn bộ Top 5 chi nhánh
 */
function fitAllBranchesOnMap() {
    if (!bookingMap) return;
    const top5 = getTop5Branches();
    const latLngs = top5.map((b) => [b.lat, b.lng]);
    const bounds = L.latLngBounds(latLngs);
    bookingMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

/**
 * Làm nổi bật vị trí nhà hàng trên bản đồ và trong danh sách Top 5
 * @param {number} branchId ID của chi nhánh
 * @param {boolean} flyToMap Có bay bản đồ tới vị trí đó không
 */
function highlightBranch(branchId, flyToMap = true) {
    activeHighlightedBranchId = branchId;
    const branch = MOCK_BRANCHES.find((b) => b.id === branchId);
    if (!branch) return;

    // 1. Cập nhật giao diện trong danh sách thẻ Top 5
    document.querySelectorAll(".top5-branch-card").forEach((card) => {
        const id = parseInt(card.dataset.branchId, 10);
        card.classList.toggle("active-map", id === branchId);
    });

    // Cuộn thẻ tương ứng vào khung nhìn nếu chưa thấy
    const targetCard = document.querySelector(`.top5-branch-card[data-branch-id="${branchId}"]`);
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // 2. Cập nhật marker trên Leaflet Map
    branchMarkers.forEach((marker, id) => {
        const pinEl = document.getElementById(`pin-branch-${id}`);
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
 * Render danh sách Top 5 nhà hàng gần nhất ở cột bên phải
 */
function renderTop5Branches(branchesList) {
    const container = document.getElementById("top-branches-list");
    if (!container) return;

    container.innerHTML = "";

    branchesList.forEach((branch, idx) => {
        const isSelected = bookingState.selectedBranch?.id === branch.id;
        const isHighlighted = activeHighlightedBranchId === branch.id;

        const card = document.createElement("div");
        card.className = `top5-branch-card ${isSelected ? "selected" : ""} ${isHighlighted ? "active-map" : ""}`;
        card.dataset.branchId = branch.id;
        card.setAttribute("role", "listitem");

        let availClass = "green";
        let availText = `Còn ${branch.availableTables} bàn`;
        if (branch.availableTables <= 0) {
            availClass = "red";
            availText = "Hết bàn";
        } else if (branch.availableTables <= 2) {
            availClass = "orange";
            availText = `Chỉ còn ${branch.availableTables} bàn`;
        }

        card.innerHTML = `
            <div class="top5-rank-badge">#${idx + 1}</div>
            <div class="top5-thumb-wrap">
                <img src="${branch.image}" alt="${branch.restaurantName}" class="top5-thumb" loading="lazy">
            </div>
            <div class="top5-info">
                <div class="top5-cuisine">${branch.cuisine}</div>
                <h4 class="top5-name" title="${branch.restaurantName}">${branch.restaurantName}</h4>
                <div class="top5-meta-row">
                    <span class="top5-dist-pill">📍 ${branch.distanceKm} km · ~${branch.durationMin}p</span>
                    <span class="top5-rating">★ ${branch.rating} (${branch.reviewsCount})</span>
                </div>
                <div class="top5-addr" title="${branch.address}">🏠 ${branch.address}</div>
                <div class="top5-action-row">
                    <div class="top5-tables">
                        <span class="avail-dot ${availClass}"></span>
                        <span>${availText}</span>
                    </div>
                    <button type="button" class="btn-select-branch ${isSelected ? "selected" : ""}" data-branch-id="${branch.id}">
                        ${isSelected ? "✓ Đã chọn" : "Chọn chi nhánh"}
                    </button>
                </div>
            </div>
        `;

        // Sự kiện click vào thẻ: Làm nổi bật vị trí trên bản đồ Leaflet
        card.addEventListener("click", (e) => {
            // Nếu bấm vào nút "Chọn chi nhánh"
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
    bookingState.selectedBranch = branch;

    // Cập nhật giao diện danh sách
    const top5 = getTop5Branches();
    renderTop5Branches(top5);

    // Cập nhật marker styles trên bản đồ
    branchMarkers.forEach((marker, id) => {
        const markerEl = marker.getElement();
        if (markerEl) {
            markerEl.classList.toggle("selected-pin", id === branch.id);
        }
        // Cập nhật nội dung popup
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

    showToast(`Đã chọn chi nhánh: ${branch.restaurantName}`, "success", 2400);

    // Scroll mượt đến bước tiếp theo trên thiết bị di động
    if (window.innerWidth < 768) {
        document.getElementById("section-datetime")?.scrollIntoView({ behavior: "smooth" });
    }
}

// Cho phép gọi chọn chi nhánh từ popup của Leaflet
window.selectBranchById = function(id) {
    const branch = MOCK_BRANCHES.find((b) => b.id === id);
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

    bookingState.date = todayStr;
    if (dateInput) {
        dateInput.min = todayStr;
        dateInput.value = todayStr;
        dateInput.addEventListener("change", (e) => {
            bookingState.date = e.target.value;
            document.querySelectorAll(".quick-chip-btn").forEach((b) => b.classList.remove("active"));
            updateSummary();
        });
    }

    // Quick chip buttons (Hôm nay, Ngày mai, ...)
    document.querySelectorAll(".quick-chip-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".quick-chip-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            const offset = parseInt(btn.dataset.offset || "0", 10);
            const targetDate = getDateStringOffset(offset);
            bookingState.date = targetDate;
            if (dateInput) dateInput.value = targetDate;
            updateSummary();
        });
    });

    // Time slot buttons
    document.querySelectorAll(".time-slot-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".time-slot-btn").forEach((b) => b.classList.remove("selected"));
            btn.classList.add("selected");
            bookingState.time = btn.dataset.time || btn.textContent.trim();
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
            pill.classList.toggle("active", val === bookingState.guestCount);
        });

        updateSummary();
    }

    if (btnMinus) {
        btnMinus.addEventListener("click", () => {
            if (bookingState.guestCount > 1) {
                bookingState.guestCount--;
                updateGuestUI();
            }
        });
    }

    if (btnPlus) {
        btnPlus.addEventListener("click", () => {
            if (bookingState.guestCount < 20) {
                bookingState.guestCount++;
                updateGuestUI();
            }
        });
    }

    document.querySelectorAll(".guest-pill-btn").forEach((pill) => {
        pill.addEventListener("click", () => {
            bookingState.guestCount = parseInt(pill.dataset.guests || "2", 10);
            updateGuestUI();
        });
    });

    updateGuestUI();
}

/**
 * Cập nhật cột tóm tắt thông tin đặt bàn trực quan (Sticky Sidebar)
 * Đã lược bỏ: vị trí bàn mong muốn, món ăn đặt trước và chi phí đặt chỗ
 */
function updateSummary() {
    // 1. Chi nhánh
    const branchNameEl = document.getElementById("sum-branch-name");
    const branchAddrEl = document.getElementById("sum-branch-addr");
    const branchImgEl = document.getElementById("sum-branch-img");

    if (bookingState.selectedBranch) {
        if (branchNameEl) branchNameEl.textContent = bookingState.selectedBranch.restaurantName;
        if (branchAddrEl) branchAddrEl.textContent = bookingState.selectedBranch.address;
        if (branchImgEl) branchImgEl.src = bookingState.selectedBranch.image;
    } else {
        if (branchNameEl) branchNameEl.textContent = "Chưa chọn chi nhánh";
        if (branchAddrEl) branchAddrEl.textContent = "Vui lòng chọn 1 nhà hàng bên cạnh";
    }

    // 2. Thời gian
    const timeEl = document.getElementById("sum-datetime-val");
    if (timeEl) {
        timeEl.textContent = `${bookingState.time} • ${formatDateVi(bookingState.date)}`;
    }

    // 3. Số khách
    const guestEl = document.getElementById("sum-guest-val");
    if (guestEl) {
        guestEl.textContent = `${bookingState.guestCount} Khách`;
    }
}

/**
 * Hiển thị vé đặt chỗ thành công (Ticket Modal)
 */
function showConfirmationTicket(resData) {
    const modal = document.getElementById("ticket-modal");
    if (!modal) return;

    document.getElementById("ticket-res-code").textContent = resData.id || ("#TR-" + Math.floor(100000 + Math.random() * 900000));
    document.getElementById("ticket-res-restaurant").textContent = resData.restaurant_name || resData.branch_name;
    document.getElementById("ticket-res-address").textContent = resData.branch_address;
    document.getElementById("ticket-res-datetime").textContent = `${resData.reservation_time}`;
    document.getElementById("ticket-res-guests").textContent = `${resData.guest_count} khách`;
    document.getElementById("ticket-res-table").textContent = `Bàn số ${resData.table_number || "Sắp xếp khi đến"}`;
    document.getElementById("ticket-res-customer").textContent = `${resData.customer_name} • ${resData.customer_phone}`;

    modal.hidden = false;
}

/**
 * Xử lý xác nhận gửi đơn đặt bàn
 */
async function handleBookingSubmit() {
    // Validation
    if (!bookingState.selectedBranch) {
        showToast("Vui lòng chọn một chi nhánh nhà hàng.", "danger");
        document.getElementById("section-branch")?.scrollIntoView({ behavior: "smooth" });
        return;
    }

    if (!bookingState.date) {
        showToast("Vui lòng chọn ngày dùng bữa.", "danger");
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

        // Gửi tới backend API nếu có
        try {
            resultReservation = await api.post("/customer/reservations", reservationPayload);
        } catch {
            // Backend offline hoặc chưa có API -> Demo mode lưu vào localStorage
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

        // Lưu đơn đặt chỗ vào lịch sử local
        try {
            const savedList = JSON.parse(localStorage.getItem("customer_reservations") || "[]");
            savedList.unshift(resultReservation);
            localStorage.setItem("customer_reservations", JSON.stringify(savedList));
        } catch (e) {
            console.warn("Could not save to localStorage", e);
        }

        // Cập nhật số bàn trống của chi nhánh vừa đặt
        if (bookingState.selectedBranch.availableTables > 0) {
            bookingState.selectedBranch.availableTables--;
            renderTop5Branches(getTop5Branches());
        }

        showToast("Đặt bàn thành công! Mã đặt chỗ của bạn đã sẵn sàng.", "success");
        showConfirmationTicket(resultReservation);

    } catch (err) {
        showToast(err.message || "Đặt bàn thất bại. Vui lòng thử lại sau.", "danger");
    } finally {
        setLoading(false);
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Khởi chạy khi tài liệu sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
    // 1. Kiểm tra xác thực (tự động tạo phiên demo nếu cần)
    const user = requireAuth("CUSTOMER");
    if (!user) return;

    // 2. Khởi tạo header
    initUserHeader(user);

    // 3. Khởi tạo Top 5 chi nhánh và mặc định chọn chi nhánh đầu tiên
    const top5 = getTop5Branches();
    bookingState.selectedBranch = top5[0];
    activeHighlightedBranchId = top5[0].id;
    renderTop5Branches(top5);

    // 4. Khởi tạo Leaflet Map
    initBookingMap();

    // 5. Khởi tạo chọn ngày giờ và số khách
    initDateTimeSection();
    initGuestPicker();
    updateSummary();

    // 6. Gắn sự kiện tìm kiếm nhà hàng
    const searchInput = document.getElementById("branch-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            filterBranches(e.target.value);
        });
    }

    // 7. Nút Đặt bàn
    const submitBtn = document.getElementById("btn-submit-booking");
    if (submitBtn) {
        submitBtn.addEventListener("click", handleBookingSubmit);
    }

    // 8. Nút Đăng xuất
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    // 9. Đóng modal xác nhận
    const closeModalBtn = document.getElementById("btn-close-ticket");
    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            const modal = document.getElementById("ticket-modal");
            if (modal) modal.hidden = true;
        });
    }
});
