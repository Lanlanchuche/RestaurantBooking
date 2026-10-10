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

// Trạng thái đơn đặt chỗ hiện tại
const bookingState = {
    selectedBranch: null,
    date: "",
    time: "19:00",
    guestCount: 2,
    customerName: "",
    customerPhone: "",
    userLat: null,
    userLng: null
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
    return [...currentBranches]
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
                <div class="popup-branch-addr">${branch.address}</div>
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

    if (bookingState.userLat && bookingState.userLng) {
        L.marker([bookingState.userLat, bookingState.userLng], {
            icon: L.divIcon({
                className: "custom-user-marker",
                html: `<div style="background:#2e7d32; color:white; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            })
        }).bindPopup("<b>Vị trí của bạn</b>").addTo(bookingMap);
        
        // Căn bản đồ hiển thị được cả user và top 5 nếu có
        const features = [L.marker([bookingState.userLat, bookingState.userLng])];
        if (top5 && top5.length > 0) {
            features.push(...top5.map(b => L.marker([b.lat, b.lng])));
        }
        const group = new L.featureGroup(features);
        bookingMap.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
    }

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
    
    if (top5.length === 0) {
        if (bookingState.userLat && bookingState.userLng) {
            bookingMap.setView([bookingState.userLat, bookingState.userLng], 14);
        }
        return;
    }
    
    const latLngs = top5.map((b) => [b.lat, b.lng]);
    if (bookingState.userLat && bookingState.userLng) {
        latLngs.push([bookingState.userLat, bookingState.userLng]);
    }
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
    const branch = currentBranches.find((b) => b.id === branchId);
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

    if (!branchesList || branchesList.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px;">
                <span style="font-size: 2rem; display: block; margin-bottom: 12px;">📍</span>
                <p style="margin: 0;">Vui lòng nhập địa chỉ hoặc ấn Lấy vị trí để tìm các nhà hàng gần bạn nhất.</p>
            </div>
        `;
        return;
    }

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
            <div class="top5-info" style="padding: 12px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px;">
                <div class="top5-cuisine">${branch.cuisine}</div>
                <h4 class="top5-name" title="${branch.restaurantName}">${branch.restaurantName}</h4>
                <div class="top5-meta-row">
                    <span class="top5-dist-pill">${branch.distanceKm} km · ~${branch.durationMin}p</span>
                    <span class="top5-rating">★ ${branch.rating} (${branch.reviewsCount})</span>
                </div>
                <div class="top5-addr" title="${branch.address}">${branch.address}</div>
                <div class="top5-action-row" style="margin-top: 12px;">
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
                table_number: apiRes.table_number || Math.floor(1 + Math.random() * 12),
                customer_name: apiRes.customer?.full_name || custName,
                customer_phone: apiRes.customer?.phone || custPhone,
                status: apiRes.status,
                created_at: apiRes.created_at
            };
        } catch (err) {
            console.error("API error, using local fallback", err);
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
    if (top5.length > 0) {
        bookingState.selectedBranch = top5[0];
        activeHighlightedBranchId = top5[0].id;
    } else {
        bookingState.selectedBranch = null;
        activeHighlightedBranchId = null;
    }
    renderTop5Branches(top5);

    // 4. Khởi tạo Leaflet Map
    initBookingMap();

    // 5. Khởi tạo chọn ngày giờ và số khách
    initDateTimeSection();
    initGuestPicker();
    updateSummary();

    // 7.5 Các tính năng tìm kiếm vị trí
    const userLocInput = document.getElementById("user-location-input");
    
    // Nút xác nhận địa chỉ nhập tay
    const btnConfirmAddress = document.getElementById("btn-confirm-address");
    if (btnConfirmAddress && userLocInput) {
        btnConfirmAddress.addEventListener("click", async () => {
            const address = userLocInput.value.trim();
            if (!address) {
                showToast("Vui lòng nhập địa chỉ.", "danger");
                return;
            }
            
            setLoading(true, "Đang tìm vị trí địa chỉ...");
            try {
                // Geocoding bằng Nominatim (OpenStreetMap)
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
                const data = await res.json();
                
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);
                    
                    bookingState.userLat = lat;
                    bookingState.userLng = lng;
                    
                    // Gọi API Dijkstra tìm nhà hàng gần nhất
                    const branchRes = await api.get(`/customer/branches/nearby?lat=${lat}&lng=${lng}&limit=5`);
                    if (branchRes && branchRes.length > 0) {
                        currentBranches = branchRes.map((item, index) => ({
                            id: item.id,
                            restaurantName: item.name,
                            name: item.name,
                            address: item.address,
                            cuisine: "Món ăn đa dạng",
                            rating: 4.8,
                            reviewsCount: Math.floor(Math.random() * 500) + 50,
                            distanceKm: item.distance_km,
                            durationMin: item.estimated_time_minutes,
                            totalTables: item.total_tables,
                            availableTables: item.available_tables,
                            lat: item.latitude,
                            lng: item.longitude
                        }));
                        
                        bookingState.selectedBranch = currentBranches[0];
                        activeHighlightedBranchId = currentBranches[0].id;
                        
                        renderTop5Branches(currentBranches);
                        branchMarkers.forEach((marker) => marker.remove());
                        branchMarkers.clear();
                        
                        // Nếu map tồn tại, remove nó để khởi tạo lại
                        if (bookingMap) {
                            bookingMap.remove();
                            bookingMap = null;
                        }
                        initBookingMap();
                        updateSummary();
                        
                        showToast("Đã tìm thấy nhà hàng gần địa chỉ này!", "success");
                    } else {
                        showToast("Không tìm thấy nhà hàng nào gần đây.", "warning");
                    }
                } else {
                    showToast("Không thể nhận diện địa chỉ này, vui lòng nhập rõ hơn.", "danger");
                }
            } catch (err) {
                showToast("Lỗi khi tra cứu địa chỉ.", "danger");
            } finally {
                setLoading(false);
            }
        });
    }

    // Lấy vị trí GPS hiện tại và API Dijkstra
    const btnGetLocation = document.getElementById("btn-get-location");
    if (btnGetLocation && userLocInput) {
        btnGetLocation.addEventListener("click", () => {
            if (navigator.geolocation) {
                setLoading(true, "Đang định vị và tìm đường đi (Dijkstra)...");
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        userLocInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                        bookingState.userLat = lat;
                        bookingState.userLng = lng;
                        
                        try {
                            // Gọi API tìm nhà hàng gần nhất bằng Dijkstra
                            const res = await api.get(`/customer/branches/nearby?lat=${lat}&lng=${lng}&limit=5`);
                            if (res && res.length > 0) {
                                // Cập nhật danh sách currentBranches
                                currentBranches = res.map((item, index) => ({
                                    id: item.id,
                                    restaurantName: item.name,
                                    name: item.name,
                                    address: item.address,
                                    cuisine: "Món ăn đa dạng", // Backend chưa có trường này
                                    rating: 4.8,
                                    reviewsCount: Math.floor(Math.random() * 500) + 50,
                                    distanceKm: item.distance_km,
                                    durationMin: item.estimated_time_minutes,
                                    totalTables: item.total_tables,
                                    availableTables: item.available_tables,
                                    lat: item.latitude,
                                    lng: item.longitude
                                }));
                                
                                // Chọn nhánh gần nhất
                                bookingState.selectedBranch = currentBranches[0];
                                activeHighlightedBranchId = currentBranches[0].id;
                                
                                // Render lại UI
                                renderTop5Branches(currentBranches);
                                
                                // Xóa các marker cũ trên bản đồ
                                branchMarkers.forEach((marker) => marker.remove());
                                branchMarkers.clear();
                                
                                // Nếu map tồn tại, remove nó để khởi tạo lại
                                if (bookingMap) {
                                    bookingMap.remove();
                                    bookingMap = null;
                                }
                                
                                // Khởi tạo lại map marker
                                initBookingMap();
                                updateSummary();
                                
                                showToast("Đã tìm thấy các nhà hàng gần nhất qua Dijkstra!", "success");
                            }
                        } catch (err) {
                            showToast("Lỗi khi tìm nhà hàng gần nhất từ server.", "danger");
                        } finally {
                            setLoading(false);
                        }
                    },
                    (error) => {
                        setLoading(false);
                        showToast("Không thể lấy vị trí. Vui lòng bật GPS hoặc nhập tay.", "danger");
                    }
                );
            } else {
                showToast("Trình duyệt không hỗ trợ Geolocation.", "danger");
            }
        });
    }

    // Dùng địa chỉ mặc định
    const btnDefaultLocation = document.getElementById("btn-default-location");
    if (btnDefaultLocation && userLocInput) {
        btnDefaultLocation.addEventListener("click", () => {
            if (!user || !user.address || user.address.trim() === "") {
                showToast("Bạn chưa cập nhật địa chỉ ở phần Thông tin cá nhân. Vui lòng cập nhật trước hoặc tự nhập tay.", "danger");
            } else {
                userLocInput.value = user.address;
                const btnConfirm = document.getElementById("btn-confirm-address");
                if (btnConfirm) {
                    btnConfirm.click(); // Trigger geocoding and API call
                }
                showToast("Đang tìm nhà hàng gần địa chỉ mặc định...", "success");
            }
        });
    }

    // 7.6 Nút Đặt bàn (Xác nhận)
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
