/**
 * book.js - TableReserve Booking Page Controller
 * Quản lý quy trình đặt bàn: chọn chi nhánh (Dijkstra/GPS), chọn ngày/giờ, số khách,
 * món ăn đặt trước, yêu cầu đặc biệt và xác nhận đặt bàn.
 */

// Danh sách các chi nhánh nhà hàng mẫu chuẩn hệ thống
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
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 3,
        restaurantName: "Sora & Umi Japanese Dining",
        name: "Chi nhánh Landmark 81 — Bình Thạnh",
        address: "Tầng 5, Vincom Landmark 81, 720A Điện Biên Phủ, Bình Thạnh, TP. HCM",
        cuisine: "Omakase & Sushi Tinh Hoa",
        rating: 5.0,
        reviewsCount: 412,
        distanceKm: 3.1,
        durationMin: 9,
        totalTables: 8,
        availableTables: 4,
        lat: 10.7951,
        lng: 106.7218,
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=700&q=80"
    },
    {
        id: 4,
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
        image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=700&q=80"
    }
];

// Danh sách món ăn gợi ý đặt trước
const PREORDER_DISHES = [
    {
        id: "dish-1",
        name: "Bò Wagyu A5 sốt tiêu đen thượng hạng",
        desc: "Thịt bò Wagyu vân mỡ cẩm thạch, sốt tiêu đen Phú Quốc & măng tây",
        price: 590000,
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=300&q=80"
    },
    {
        id: "dish-2",
        name: "Tôm hùm Alaska bỏ lò phô mai Gruyère",
        desc: "Tôm hùm tươi nguyên con bỏ lò sốt phô mai béo ngậy thơm lừng",
        price: 720000,
        image: "https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=300&q=80"
    },
    {
        id: "dish-3",
        name: "Vịt quay sốt mận & bánh bao chiên giòn",
        desc: "Vịt quay da giòn rụm sốt mận mật ong hoàng gia truyền thống",
        price: 380000,
        image: "https://images.unsplash.com/photo-1518492104633-130d0cc84637?auto=format&fit=crop&w=300&q=80"
    },
    {
        id: "dish-4",
        name: "Cá hồi Na Uy áp chảo sốt bơ chanh dây",
        desc: "Cá hồi phi lê tươi mọng kèm khoai tây nghiền và sốt thảo mộc",
        price: 340000,
        image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=300&q=80"
    },
    {
        id: "dish-5",
        name: "Súp nấm Truffle đen thơm béo",
        desc: "Súp nấm rừng mùa thu hòa quyện dầu nấm Truffle quý phái",
        price: 160000,
        image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=300&q=80"
    },
    {
        id: "dish-6",
        name: "Set tráng miệng Tinh hoa bánh ngọt Pháp",
        desc: "Crème brûlée vani Madagascar và Macaron hoa quả thanh dịu",
        price: 180000,
        image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80"
    }
];

// Trạng thái đơn đặt chỗ hiện tại
const bookingState = {
    selectedBranch: null,
    date: "",
    time: "19:00",
    guestCount: 2,
    seatingArea: "Gần cửa sổ",
    preOrderedDishes: {}, // { dishId: quantity }
    specialRequests: new Set(),
    customNote: "",
    customerName: "",
    customerPhone: "",
    customerEmail: ""
};

/**
 * Format tiền tệ VND
 */
function formatVND(amount) {
    return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

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

/**
 * Khởi tạo header người dùng
 */
function initUserHeader(user) {
    const name = displayName(user) || "Khách hàng";
    const avatarEl = document.getElementById("booking-user-avatar");
    const nameEl = document.getElementById("booking-user-name");

    if (avatarEl) {
        avatarEl.textContent = name.slice(0, 2).toUpperCase();
    }
    if (nameEl) {
        nameEl.textContent = name;
    }

    // Điền thông tin người đặt bàn mặc định
    bookingState.customerName = user.name || name;
    bookingState.customerEmail = user.email || "";
    bookingState.customerPhone = user.phone || "";

    const nameInput = document.getElementById("book-cust-name");
    const phoneInput = document.getElementById("book-cust-phone");
    const emailInput = document.getElementById("book-cust-email");

    if (nameInput) nameInput.value = bookingState.customerName;
    if (phoneInput) phoneInput.value = bookingState.customerPhone;
    if (emailInput) emailInput.value = bookingState.customerEmail;
}

/**
 * Render danh sách chi nhánh
 */
function renderBranches(branchesList, activeId = null) {
    const container = document.getElementById("branches-container");
    if (!container) return;

    container.innerHTML = "";

    branchesList.forEach((branch) => {
        const isSelected = activeId ? branch.id === activeId : (bookingState.selectedBranch?.id === branch.id);
        const card = document.createElement("div");
        card.className = `branch-card ${isSelected ? "selected" : ""}`;
        card.dataset.branchId = branch.id;

        // Badge trạng thái bàn
        let availClass = "green";
        let availText = `Còn ${branch.availableTables} bàn trống`;
        if (branch.availableTables <= 0) {
            availClass = "red";
            availText = "Hết bàn trống";
        } else if (branch.availableTables <= 2) {
            availClass = "orange";
            availText = `Chỉ còn ${branch.availableTables} bàn`;
        }

        card.innerHTML = `
            <div class="branch-img-wrap">
                <img src="${branch.image}" alt="${branch.restaurantName}" class="branch-img" loading="lazy">
                <div class="branch-badge-rating">★ ${branch.rating} (${branch.reviewsCount})</div>
                <div class="branch-badge-distance">
                    <span>📍</span>
                    <span>${branch.distanceKm} km · ~${branch.durationMin} phút</span>
                </div>
            </div>
            <div class="branch-body">
                <div class="branch-cuisine">${branch.cuisine}</div>
                <h4 class="branch-title">${branch.restaurantName}</h4>
                <div class="branch-addr">
                    <span style="color:var(--wine); flex-shrink:0;">🏠</span>
                    <span>${branch.address}</span>
                </div>
                <div class="branch-footer">
                    <div class="branch-availability">
                        <span class="avail-dot ${availClass}"></span>
                        <span>${availText}</span>
                    </div>
                    <button type="button" class="branch-select-btn">
                        ${isSelected ? "✓ Đã chọn" : "Chọn bàn"}
                    </button>
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            selectBranch(branch);
        });

        container.appendChild(card);
    });
}

/**
 * Chọn chi nhánh
 */
function selectBranch(branch) {
    bookingState.selectedBranch = branch;
    renderBranches(MOCK_BRANCHES, branch.id);
    updateSummary();

    // Scroll mượt đến bước tiếp theo trên thiết bị di động
    if (window.innerWidth < 768) {
        document.getElementById("section-datetime")?.scrollIntoView({ behavior: "smooth" });
    }
}

/**
 * Lọc chi nhánh theo từ khóa tìm kiếm
 */
function filterBranches(keyword) {
    const term = (keyword || "").toLowerCase().trim();
    if (!term) {
        renderBranches(MOCK_BRANCHES);
        return;
    }

    const filtered = MOCK_BRANCHES.filter((b) =>
        b.restaurantName.toLowerCase().includes(term) ||
        b.name.toLowerCase().includes(term) ||
        b.address.toLowerCase().includes(term) ||
        b.cuisine.toLowerCase().includes(term)
    );

    renderBranches(filtered);
}

/**
 * Mô phỏng định vị GPS / Dijkstra tính toán chi nhánh gần nhất
 */
function runGpsDijkstra() {
    setLoading(true, "Đang chạy thuật toán Dijkstra định vị tuyến đường gần nhất...");
    setTimeout(() => {
        setLoading(false);
        // Sắp xếp chi nhánh theo khoảng cách tăng dần
        MOCK_BRANCHES.sort((a, b) => a.distanceKm - b.distanceKm);
        selectBranch(MOCK_BRANCHES[0]);
        showToast("Đã định vị và tìm thấy 4 chi nhánh gần bạn nhất qua OpenStreetMap!", "success");
    }, 850);
}

/**
 * Khởi tạo chọn ngày và giờ
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
            // Bỏ active trên các chip ngày
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
 * Khởi tạo bộ đếm số lượng khách & vị trí bàn
 */
function initGuestAndSeating() {
    const counterDisplay = document.getElementById("guest-counter-val");
    const btnMinus = document.getElementById("btn-guest-minus");
    const btnPlus = document.getElementById("btn-guest-plus");
    const guestDesc = document.getElementById("guest-type-desc");

    function updateGuestUI() {
        if (counterDisplay) counterDisplay.textContent = bookingState.guestCount;
        if (btnMinus) btnMinus.disabled = bookingState.guestCount <= 1;
        if (btnPlus) btnPlus.disabled = bookingState.guestCount >= 20;

        // Mô tả loại bàn tương ứng
        if (guestDesc) {
            if (bookingState.guestCount === 1) guestDesc.textContent = "Bàn đơn thư giãn, không gian yên tĩnh";
            else if (bookingState.guestCount === 2) guestDesc.textContent = "Bàn 2 người lãng mạn, ấm cúng";
            else if (bookingState.guestCount <= 4) guestDesc.textContent = "Bàn gia đình / bạn bè thân mật";
            else if (bookingState.guestCount <= 8) guestDesc.textContent = "Bàn tiệc nhóm / họp mặt đối tác";
            else guestDesc.textContent = "Tiệc đông người (Nhà hàng sẽ chuẩn bị trước dãy bàn)";
        }

        // Active pill button
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

    // Seating cards selection
    document.querySelectorAll(".seating-card").forEach((card) => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".seating-card").forEach((c) => c.classList.remove("selected"));
            card.classList.add("selected");
            bookingState.seatingArea = card.dataset.seating || "Gần cửa sổ";
            updateSummary();
        });
    });

    updateGuestUI();
}

/**
 * Render danh sách món ăn đặt trước
 */
function renderPreorderDishes() {
    const grid = document.getElementById("dishes-container");
    if (!grid) return;

    grid.innerHTML = "";

    PREORDER_DISHES.forEach((dish) => {
        const qty = bookingState.preOrderedDishes[dish.id] || 0;
        const card = document.createElement("div");
        card.className = "dish-card";
        card.innerHTML = `
            <img src="${dish.image}" alt="${dish.name}" class="dish-thumb" loading="lazy">
            <div class="dish-info">
                <h5 class="dish-name">${dish.name}</h5>
                <div class="dish-price">${formatVND(dish.price)}</div>
                <div class="dish-qty-ctrl">
                    <button type="button" class="dish-qty-btn btn-dish-minus" data-id="${dish.id}">-</button>
                    <span class="dish-qty-val" id="qty-${dish.id}">${qty}</span>
                    <button type="button" class="dish-qty-btn btn-dish-plus" data-id="${dish.id}">+</button>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    grid.addEventListener("click", (e) => {
        const btnMinus = e.target.closest(".btn-dish-minus");
        const btnPlus = e.target.closest(".btn-dish-plus");

        if (btnMinus) {
            const id = btnMinus.dataset.id;
            const cur = bookingState.preOrderedDishes[id] || 0;
            if (cur > 0) {
                bookingState.preOrderedDishes[id] = cur - 1;
                if (bookingState.preOrderedDishes[id] === 0) {
                    delete bookingState.preOrderedDishes[id];
                }
                const label = document.getElementById(`qty-${id}`);
                if (label) label.textContent = bookingState.preOrderedDishes[id] || 0;
                updateSummary();
            }
        }

        if (btnPlus) {
            const id = btnPlus.dataset.id;
            const cur = bookingState.preOrderedDishes[id] || 0;
            bookingState.preOrderedDishes[id] = cur + 1;
            const label = document.getElementById(`qty-${id}`);
            if (label) label.textContent = bookingState.preOrderedDishes[id];
            updateSummary();
        }
    });
}

/**
 * Khởi tạo các chip yêu cầu đặc biệt
 */
function initSpecialRequests() {
    document.querySelectorAll(".req-chip-btn").forEach((chip) => {
        chip.addEventListener("click", () => {
            const text = chip.dataset.req || chip.textContent.trim();
            if (bookingState.specialRequests.has(text)) {
                bookingState.specialRequests.delete(text);
                chip.classList.remove("selected");
            } else {
                bookingState.specialRequests.add(text);
                chip.classList.add("selected");
            }
            updateSummary();
        });
    });

    const noteInput = document.getElementById("book-special-notes");
    if (noteInput) {
        noteInput.addEventListener("input", (e) => {
            bookingState.customNote = e.target.value.trim();
        });
    }
}

/**
 * Cập nhật cột tóm tắt thông tin đặt bàn trực quan (Sticky Sidebar)
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
        if (branchAddrEl) branchAddrEl.textContent = "Vui lòng chọn 1 nhà hàng bên dưới";
    }

    // 2. Thời gian & Khách
    const timeEl = document.getElementById("sum-datetime-val");
    if (timeEl) {
        timeEl.textContent = `${bookingState.time} • ${formatDateVi(bookingState.date)}`;
    }

    const guestEl = document.getElementById("sum-guest-val");
    if (guestEl) {
        guestEl.textContent = `${bookingState.guestCount} Khách • ${bookingState.seatingArea}`;
    }

    // 3. Món đặt trước & Tạm tính
    const dishesBox = document.getElementById("sum-dishes-box");
    const dishesListEl = document.getElementById("sum-dishes-list");
    const dishesTotalEl = document.getElementById("sum-dishes-total");

    let totalDishesPrice = 0;
    const dishEntries = Object.entries(bookingState.preOrderedDishes);

    if (dishEntries.length > 0) {
        if (dishesBox) dishesBox.hidden = false;
        if (dishesListEl) {
            dishesListEl.innerHTML = "";
            dishEntries.forEach(([id, qty]) => {
                const dish = PREORDER_DISHES.find((d) => d.id === id);
                if (dish) {
                    const lineTotal = dish.price * qty;
                    totalDishesPrice += lineTotal;
                    const item = document.createElement("div");
                    item.className = "summary-dish-item";
                    item.innerHTML = `
                        <span>${dish.name} × ${qty}</span>
                        <span>${formatVND(lineTotal)}</span>
                    `;
                    dishesListEl.appendChild(item);
                }
            });
        }
        if (dishesTotalEl) dishesTotalEl.textContent = formatVND(totalDishesPrice);
    } else {
        if (dishesBox) dishesBox.hidden = true;
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
    document.getElementById("ticket-res-guests").textContent = `${resData.guest_count} khách (${resData.seating_area || "Tiêu chuẩn"})`;
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
    const emailInput = document.getElementById("book-cust-email");

    const custName = nameInput ? nameInput.value.trim() : bookingState.customerName;
    const custPhone = phoneInput ? phoneInput.value.trim() : bookingState.customerPhone;
    const custEmail = emailInput ? emailInput.value.trim() : bookingState.customerEmail;

    if (!custName) {
        showToast("Vui lòng nhập họ tên người liên hệ đặt bàn.", "danger");
        nameInput?.focus();
        return;
    }

    if (!custPhone) {
        showToast("Vui lòng nhập số điện thoại để nhà hàng giữ chỗ.", "danger");
        phoneInput?.focus();
        return;
    }

    // Chuẩn bị danh sách yêu cầu đặc biệt
    const combinedRequests = [
        ...Array.from(bookingState.specialRequests),
        bookingState.customNote
    ].filter(Boolean).join(". ");

    // Chuẩn bị danh sách món ăn
    const orderedDishesList = Object.entries(bookingState.preOrderedDishes).map(([id, qty]) => {
        const dish = PREORDER_DISHES.find((d) => d.id === id);
        return {
            id,
            name: dish?.name || id,
            price: dish?.price || 0,
            quantity: qty
        };
    });

    const submitBtn = document.getElementById("btn-submit-booking");
    if (submitBtn) submitBtn.disabled = true;

    setLoading(true, "Đang gửi yêu cầu đặt chỗ tới nhà hàng...");

    const reservationPayload = {
        branch_id: bookingState.selectedBranch.id,
        reservation_time: `${bookingState.date}T${bookingState.time}:00`,
        guest_count: bookingState.guestCount,
        pre_ordered_dishes: orderedDishesList.length ? JSON.stringify(orderedDishesList) : null,
        special_requests: combinedRequests || null
    };

    try {
        let resultReservation = null;

        // Thử gửi tới backend nếu API khả dụng
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
                seating_area: bookingState.seatingArea,
                table_number: Math.floor(1 + Math.random() * 12),
                customer_name: custName,
                customer_phone: custPhone,
                customer_email: custEmail,
                pre_ordered_dishes: orderedDishesList,
                special_requests: combinedRequests,
                status: "PENDING",
                created_at: new Date().toISOString()
            };
        }

        // Lưu đơn đặt chỗ vào lịch sử local để trang Lịch sử (history.html) hiển thị ngay
        try {
            const savedList = JSON.parse(localStorage.getItem("customer_reservations") || "[]");
            savedList.unshift(resultReservation);
            localStorage.setItem("customer_reservations", JSON.stringify(savedList));
        } catch (e) {
            console.warn("Could not save to localStorage", e);
        }

        // Giảm số bàn trống của chi nhánh vừa đặt
        if (bookingState.selectedBranch.availableTables > 0) {
            bookingState.selectedBranch.availableTables--;
            renderBranches(MOCK_BRANCHES, bookingState.selectedBranch.id);
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

    // 3. Render danh sách chi nhánh (mặc định chọn chi nhánh đầu tiên)
    renderBranches(MOCK_BRANCHES, MOCK_BRANCHES[0].id);
    bookingState.selectedBranch = MOCK_BRANCHES[0];

    // 4. Khởi tạo các phân hệ
    initDateTimeSection();
    initGuestAndSeating();
    renderPreorderDishes();
    initSpecialRequests();
    updateSummary();

    // 5. Gắn sự kiện thanh công cụ tìm kiếm và GPS
    const searchInput = document.getElementById("branch-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            filterBranches(e.target.value);
        });
    }

    const gpsBtn = document.getElementById("btn-gps-detect");
    if (gpsBtn) {
        gpsBtn.addEventListener("click", runGpsDijkstra);
    }

    // 6. Nút Đặt bàn
    const submitBtn = document.getElementById("btn-submit-booking");
    if (submitBtn) {
        submitBtn.addEventListener("click", handleBookingSubmit);
    }

    // 7. Nút Đăng xuất
    const logoutBtn = document.getElementById("btn-nav-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    // 8. Đóng modal xác nhận
    const closeModalBtn = document.getElementById("btn-close-ticket");
    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            const modal = document.getElementById("ticket-modal");
            if (modal) modal.hidden = true;
        });
    }
});
