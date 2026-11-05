/* ==========================================================================
   TableReserve — Booking experience
   Logic cho trang đặt bàn: chọn ngày/giờ, sơ đồ bàn, kiểm tra dữ liệu,
   hiệu ứng chọn bàn, theme sáng/tối và luồng xác nhận.
   ========================================================================== */
(() => {
    "use strict";

    /* ---------------------------------------------------------------------
       Cấu hình
       --------------------------------------------------------------------- */
    const THEME_KEY = "tr-theme";
    const LOCATION_KEY = "tr-location";
    const MIN_GUESTS = 1;
    const MAX_GUESTS = 20;
    const NOTE_LIMIT = 300;

    // Vị trí mặc định (trung tâm Hà Nội) dùng khi chưa có vị trí đã lưu.
    const DEFAULT_LOCATION = { lat: 21.0285, lng: 105.8542, label: "Hà Nội" };

    // Danh sách dự phòng khi backend chưa chạy — chỉ dùng để xem giao diện.
    const DEMO_BRANCHES = [
        {
            id: 1,
            name: "TableReserve Quận 1",
            restaurant_name: "TableReserve",
            address: "72 Lê Thánh Tôn, Quận 1, TP. Hồ Chí Minh",
            total_tables: 32,
            available_tables: 18,
            is_demo: true,
        },
        {
            id: 2,
            name: "TableReserve Hoàn Kiếm",
            restaurant_name: "TableReserve",
            address: "14 Chả Cá, Hoàn Kiếm, Hà Nội",
            total_tables: 24,
            available_tables: 11,
            is_demo: true,
        },
        {
            id: 3,
            name: "TableReserve Tây Hồ",
            restaurant_name: "TableReserve",
            address: "614 Lạc Long Quân, Tây Hồ, Hà Nội",
            total_tables: 43,
            available_tables: 21,
            is_demo: true,
        },
    ];

    /* ---------------------------------------------------------------------
       Tiện ích
       --------------------------------------------------------------------- */
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const pad = (value) => String(value).padStart(2, "0");
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const els = {
        themeToggle: $("#theme-toggle"),
        userName: $("#bk-user-name"),
        userAvatar: $("#bk-user-avatar"),
        form: $("#booking-form"),
        formAlert: $("#form-alert"),
        branchSelect: $("#branch-select"),
        nearbyBtn: $("#btn-nearby"),
        branchMeta: $("#branch-meta"),
        dateChips: $("#date-chips"),
        dateInput: $("#booking-date"),
        timeButtons: $$(".bk-time"),
        guestMinus: $("#guest-minus"),
        guestPlus: $("#guest-plus"),
        guestValue: $("#guest-value"),
        guestChips: $$("#guest-chips .bk-chip"),
        name: $("#customer-name"),
        phone: $("#customer-phone"),
        note: $("#customer-note"),
        noteCount: $("#note-count"),
        noteChips: $$("#note-chips .bk-chip"),
        fieldName: $("#field-name"),
        fieldPhone: $("#field-phone"),
        sumBranch: $("#sum-branch"),
        sumTable: $("#sum-table"),
        sumTime: $("#sum-time"),
        sumGuests: $("#sum-guests"),
        confirm: $("#btn-confirm"),
        confirmLabel: $("#confirm-label"),
        zoneTabs: $$(".bk-zone-tab"),
        stage: $("#table-stage"),
        map: $(".bk-map"),
        tooltip: $("#table-tooltip"),
        mapStatus: $("#map-status"),
        resetTable: $("#btn-reset-table"),
        selectedCard: $("#selected-card"),
        selectedLabel: $("#selected-table-label"),
        clearTable: $("#btn-clear-table"),
        modal: $("#success-modal"),
        modalCard: $("#success-modal .bk-modal-card"),
        modalCode: $("#modal-code"),
        modalBranch: $("#modal-branch"),
        modalTime: $("#modal-time"),
        modalStatus: $("#modal-status"),
        modalNote: $("#modal-note"),
        modalTable: $("#modal-table"),
        modalGuests: $("#modal-guests"),
        modalName: $("#modal-name"),
        toasts: $("#bk-toasts"),
    };

    /* ---------------------------------------------------------------------
       Theme sáng / tối
       --------------------------------------------------------------------- */
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

    function currentTheme() {
        return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }

    function syncThemeUI() {
        const isDark = currentTheme() === "dark";
        if (els.themeToggle) {
            els.themeToggle.setAttribute("aria-pressed", String(isDark));
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute("content", isDark ? "#0d0a08" : "#f6efe4");
        }
    }

    function applyTheme(theme, persist = true) {
        document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
        if (persist) {
            try {
                localStorage.setItem(THEME_KEY, theme);
            } catch (error) {
                /* Bỏ qua khi trình duyệt chặn localStorage */
            }
        }
        syncThemeUI();
    }

    if (els.themeToggle) {
        els.themeToggle.addEventListener("click", () => {
            applyTheme(currentTheme() === "dark" ? "light" : "dark");
        });
    }

    prefersDark.addEventListener?.("change", (event) => {
        let saved = null;
        try {
            saved = localStorage.getItem(THEME_KEY);
        } catch (error) {
            saved = null;
        }
        if (!saved) {
            applyTheme(event.matches ? "dark" : "light", false);
        }
    });

    syncThemeUI();

    /* ---------------------------------------------------------------------
       Dữ liệu khu vực và bàn ăn
       --------------------------------------------------------------------- */
    const ZONES = {
        main: {
            label: "Tầng trệt",
            tables: [
                { id: "B01", seats: 2, shape: "round" },
                { id: "B02", seats: 2, shape: "round" },
                { id: "B03", seats: 4 },
                { id: "B04", seats: 4 },
                { id: "B05", seats: 4 },
                { id: "B06", seats: 6 },
                { id: "B07", seats: 2, shape: "round" },
                { id: "B08", seats: 4 },
                { id: "B09", seats: 4 },
                { id: "B10", seats: 6 },
                { id: "B11", seats: 8 },
                { id: "B12", seats: 4 },
            ],
        },
        garden: {
            label: "Sân vườn",
            tables: [
                { id: "S01", seats: 2, shape: "round" },
                { id: "S02", seats: 2, shape: "round" },
                { id: "S03", seats: 4 },
                { id: "S04", seats: 4 },
                { id: "S05", seats: 6 },
                { id: "S06", seats: 4 },
                { id: "S07", seats: 6 },
                { id: "S08", seats: 8 },
                { id: "S09", seats: 2, shape: "round" },
            ],
        },
        vip: {
            label: "Phòng VIP",
            tables: [
                { id: "V01", seats: 8 },
                { id: "V02", seats: 10 },
                { id: "V03", seats: 6 },
                { id: "V04", seats: 12 },
            ],
        },
    };

    const state = {
        zone: "main",
        date: "",
        time: null,
        guests: 2,
        branches: [],
        branch: null,
        branchLoading: false,
        location: { ...DEFAULT_LOCATION },
        tables: [],
        selectedId: null,
        submitting: false,
    };

    /* ---------------------------------------------------------------------
       Chi nhánh
       --------------------------------------------------------------------- */
    function readSavedLocation() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOCATION_KEY) || "null");
            if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
                return saved;
            }
        } catch (error) {
            /* Bỏ qua dữ liệu hỏng */
        }
        return { ...DEFAULT_LOCATION };
    }

    function saveLocation(location) {
        try {
            localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
        } catch (error) {
            /* localStorage có thể bị chặn */
        }
    }

    function getPosition() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) =>
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        label: "Vị trí của bạn",
                    }),
                () => resolve(null),
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
            );
        });
    }

    function normalizeBranch(branch, isReal) {
        const total = Number(branch.total_tables) || 0;
        const available = Number.isFinite(Number(branch.available_tables))
            ? Number(branch.available_tables)
            : total;

        return {
            id: branch.id,
            name: branch.name || branch.restaurant_name || `Chi nhánh #${branch.id}`,
            restaurant_name: branch.restaurant_name || branch.restaurant?.name || branch.name || "TableReserve",
            address: branch.address || "",
            total_tables: total,
            available_tables: Math.max(0, Math.min(available, total || available)),
            distance_km: Number(branch.distance_km) || 0,
            estimated_time_minutes: Number(branch.estimated_time_minutes) || 0,
            is_real: Boolean(isReal),
        };
    }

    function renderBranchOptions(branches, { real = false, notice = "" } = {}) {
        state.branches = branches.map((branch) => normalizeBranch(branch, real));
        els.branchSelect.innerHTML = "";

        if (!state.branches.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Không có chi nhánh khả dụng";
            els.branchSelect.appendChild(option);
            els.branchSelect.disabled = true;
            state.branch = null;
            els.branchMeta.textContent = "Chưa tải được chi nhánh. Hãy thử lại hoặc chọn vị trí khác.";
            updateSummary();
            return;
        }

        els.branchSelect.disabled = false;
        state.branches.forEach((branch) => {
            const option = document.createElement("option");
            option.value = String(branch.id);
            const distance = branch.distance_km
                ? ` · ${branch.distance_km.toFixed(1)} km`
                : "";
            option.textContent = `${branch.name}${distance} · ${branch.available_tables}/${branch.total_tables} bàn trống`;
            option.dataset.real = String(branch.is_real);
            els.branchSelect.appendChild(option);
        });

        const previousId = state.branch?.id;
        const keep = state.branches.find((branch) => branch.id === previousId);
        const next = keep || state.branches[0];

        state.branch = next;
        els.branchSelect.value = String(next.id);

        els.branchMeta.innerHTML = notice
            ? notice
            : `${next.address ? `${next.address} · ` : ""}<strong>${next.available_tables} bàn trống</strong> trong ${next.total_tables} bàn`;

        updateSummary();
        refreshTables(false);
    }

    async function fetchNearbyBranches(location, { announce = false } = {}) {
        if (state.branchLoading || typeof api !== "object") return false;

        if (typeof getToken !== "function" || !getToken()) {
            toast("Đăng nhập để tìm chi nhánh thật theo vị trí của bạn.", "warning");
            return false;
        }

        state.branchLoading = true;
        els.nearbyBtn.classList.add("is-loading");
        els.branchSelect.disabled = true;

        try {
            const query = `?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&limit=5`;
            const data = await api.get(`/customer/branches/nearby${query}`);

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error("Không tìm thấy chi nhánh gần bạn.");
            }

            renderBranchOptions(data, {
                real: true,
                notice: `Tìm thấy <strong>${data.length} chi nhánh</strong> quanh ${location.label}.`,
            });
            if (announce) {
                toast(`Đã tìm thấy ${data.length} chi nhánh gần ${location.label}.`, "success");
            }
            return true;
        } catch (error) {
            if (!announce) {
                renderBranchOptions(DEMO_BRANCHES, {
                    real: false,
                    notice: "Đang dùng danh sách minh hoạ — kết nối máy chủ để xem chi nhánh thật.",
                });
            } else {
                toast(
                    error?.message || "Không tìm thấy chi nhánh gần vị trí này.",
                    "warning"
                );
                els.branchSelect.disabled = false;
            }
            return false;
        } finally {
            state.branchLoading = false;
            els.nearbyBtn.classList.remove("is-loading");
        }
    }

    async function useCurrentLocation() {
        if (typeof getToken !== "function" || !getToken()) {
            toast("Đăng nhập để tìm chi nhánh thật theo vị trí của bạn.", "warning");
            return;
        }

        const location = await getPosition();
        if (!location) {
            toast("Không lấy được vị trí. Hãy bật quyền truy cập vị trí rồi thử lại.", "warning");
            return;
        }

        state.location = location;
        saveLocation(location);
        await fetchNearbyBranches(location, { announce: true });
    }

    function selectBranch(branchId, { notify = false } = {}) {
        const branch = state.branches.find((item) => String(item.id) === String(branchId));
        if (!branch) return;

        state.branch = branch;
        state.selectedId = null;
        hideTooltip();

        els.branchMeta.innerHTML = `${branch.address ? `${branch.address} · ` : ""}<strong>${branch.available_tables} bàn trống</strong> trong ${branch.total_tables} bàn`;

        refreshTables(true);
        updateSummary();

        if (notify) {
            toast(`Đã chọn ${branch.name}.`, "info");
        }
    }

    els.branchSelect.addEventListener("change", () => {
        selectBranch(els.branchSelect.value);
    });

    els.nearbyBtn.addEventListener("click", useCurrentLocation);

    /* ---------------------------------------------------------------------
       Ngày / giờ
       --------------------------------------------------------------------- */
    function toISODate(date) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function parseISODate(iso) {
        const [year, month, day] = iso.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    function addDays(date, days) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    }

    const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

    function shortDate(iso) {
        const date = parseISODate(iso);
        return `${WEEKDAYS[date.getDay()]} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
    }

    function longDate(iso) {
        const date = parseISODate(iso);
        return date.toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    }

    function todayISO() {
        return toISODate(new Date());
    }

    function renderDateChips() {
        const today = new Date();
        const nextWeekend = (6 - today.getDay() + 7) % 7 || 7;
        const options = [
            { offset: 0, label: "Hôm nay" },
            { offset: 1, label: "Ngày mai" },
            { offset: 2, label: "Ngày kia" },
            { offset: nextWeekend, label: "Cuối tuần" },
        ];

        const seen = new Set();
        els.dateChips.innerHTML = "";

        options.forEach((option) => {
            const iso = toISODate(addDays(today, option.offset));
            if (seen.has(iso)) return;
            seen.add(iso);

            const button = document.createElement("button");
            button.type = "button";
            button.className = "bk-date-chip";
            button.dataset.date = iso;
            button.innerHTML = `<span>${option.label}</span><small>${shortDate(iso)}</small>`;
            button.addEventListener("click", () => setDate(iso));
            els.dateChips.appendChild(button);
        });

        markActiveDateChip();
    }

    function markActiveDateChip() {
        $$(".bk-date-chip", els.dateChips).forEach((chip) => {
            chip.classList.toggle("is-active", chip.dataset.date === state.date);
        });
    }

    function setDate(iso) {
        if (!iso) return;
        if (iso < todayISO()) {
            toast("Không thể chọn ngày trong quá khứ.", "warning");
            els.dateInput.value = state.date;
            return;
        }

        const changed = state.date !== iso;
        state.date = iso;
        els.dateInput.value = iso;
        markActiveDateChip();
        syncTimeAvailability();

        if (changed) {
            state.selectedId = null;
            refreshTables(true);
        }
        updateSummary();
    }

    /* ---------------------------------------------------------------------
       Sinh trạng thái bàn theo ngày/giờ (deterministic để không nhảy loạn)
       --------------------------------------------------------------------- */
    function hashString(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function makeRandom(seed) {
        let value = hashString(seed) || 1;
        return () => {
            value ^= value << 13;
            value ^= value >>> 17;
            value ^= value << 5;
            value >>>= 0;
            return value / 4294967296;
        };
    }

    function bookedRatio(time) {
        if (!time) return 0.24;
        const [hours, minutes] = time.split(":").map(Number);
        const total = hours * 60 + minutes;

        if (total < 15 * 60) return 0.26; // bữa trưa
        if (total >= 19 * 60 && total <= 20 * 60 + 30) return 0.56; // cao điểm
        return 0.38;
    }

    function buildTables(zone, date, time) {
        const branch = state.branch;
        const seed = `${branch?.id || "demo"}|${zone}|${date}|${time || "any"}`;
        const random = makeRandom(seed);

        const occupancy =
            branch && branch.total_tables > 0
                ? 1 - branch.available_tables / branch.total_tables
                : 0;

        const ratio = Math.min(
            0.9,
            Math.max(0.04, occupancy * 0.68 + bookedRatio(time) * 0.32)
        );

        const soldOut = Boolean(branch && branch.available_tables <= 0);

        const tables = ZONES[zone].tables.map((table) => ({
            ...table,
            status: soldOut || random() < ratio ? "booked" : "available",
        }));

        // Giữ tối thiểu 2 bàn trống khi chi nhánh còn bàn.
        if (!soldOut) {
            const available = tables.filter((table) => table.status === "available").length;
            if (available < 2) {
                tables
                    .filter((table) => table.status === "booked")
                    .slice(0, 2 - available)
                    .forEach((table) => {
                        table.status = "available";
                    });
            }
        }

        return tables;
    }

    /* ---------------------------------------------------------------------
       Render sơ đồ bàn
       --------------------------------------------------------------------- */
    function tableById(id) {
        return state.tables.find((table) => table.id === id) || null;
    }

    function selectedTable() {
        return state.selectedId ? tableById(state.selectedId) : null;
    }

    function renderTables() {
        const fragment = document.createDocumentFragment();

        state.tables.forEach((table, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.id = table.id;
            button.style.setProperty("--i", index);
            button.className = [
                "bk-table",
                table.shape === "round" ? "is-round" : "",
                table.status === "booked" ? "is-booked" : "is-available",
                table.id === state.selectedId ? "is-selected" : "",
            ]
                .filter(Boolean)
                .join(" ");

            button.setAttribute("aria-pressed", String(table.id === state.selectedId));
            button.setAttribute("aria-disabled", String(table.status === "booked"));
            button.setAttribute(
                "aria-label",
                `Bàn ${table.id}, ${table.seats} chỗ, ${
                    table.status === "booked" ? "đã được đặt" : "còn trống"
                }`
            );
            button.innerHTML = `
                <span class="bk-table-name">${table.id}</span>
                <span class="bk-table-seats">${table.seats} chỗ</span>
            `;

            fragment.appendChild(button);
        });

        els.stage.innerHTML = "";
        els.stage.appendChild(fragment);
    }

    function refreshTableStates() {
        $$(".bk-table", els.stage).forEach((button) => {
            const table = tableById(button.dataset.id);
            if (!table) return;
            button.classList.toggle("is-selected", table.id === state.selectedId);
            button.setAttribute("aria-pressed", String(table.id === state.selectedId));
        });
    }

    let refreshToken = 0;

    function refreshTables(animate = false) {
        const token = ++refreshToken;

        const apply = () => {
            if (token !== refreshToken) return;

            const previous = state.selectedId;
            state.tables = buildTables(state.zone, state.date, state.time);

            if (previous && !state.tables.some((table) => table.id === previous && table.status !== "booked")) {
                state.selectedId = null;
                toast(`Bàn ${previous} vừa được đặt trong khung giờ này. Hãy chọn bàn khác.`, "warning");
            }

            renderTables();
            updateSummary();
            els.stage.classList.remove("is-refreshing");
        };

        if (animate) {
            els.stage.classList.add("is-refreshing");
            window.setTimeout(apply, 180);
            return;
        }

        apply();
    }

    /* ---------------------------------------------------------------------
       Chọn bàn
       --------------------------------------------------------------------- */
    function selectTable(table) {
        state.selectedId = table.id;
        refreshTableStates();
        updateSummary();
    }

    function clearSelection(showToast = false) {
        if (!state.selectedId) return;
        const previous = state.selectedId;
        state.selectedId = null;
        refreshTableStates();
        updateSummary();
        if (showToast) {
            toast(`Đã bỏ chọn bàn ${previous}.`, "info");
        }
    }

    els.stage.addEventListener("click", (event) => {
        const button = event.target.closest(".bk-table");
        if (!button) return;

        const table = tableById(button.dataset.id);
        if (!table) return;

        if (table.status === "booked") {
            button.classList.remove("is-just-booked");
            void button.offsetWidth;
            button.classList.add("is-just-booked");
            toast("Bàn này đã được đặt. Hãy chọn bàn khác hoặc đổi khung giờ.", "warning");
            return;
        }

        if (table.seats < state.guests) {
            button.classList.remove("is-just-booked");
            void button.offsetWidth;
            button.classList.add("is-just-booked");
            toast(
                `Bàn ${table.id} chỉ có ${table.seats} chỗ, không đủ cho ${state.guests} khách.`,
                "warning"
            );
            return;
        }

        if (state.selectedId === table.id) {
            clearSelection();
            return;
        }

        selectTable(table);
    });

    /* ---------------------------------------------------------------------
       Tooltip khi hover / focus bàn
       --------------------------------------------------------------------- */
    function showTooltip(button) {
        const table = tableById(button.dataset.id);
        if (!table || !els.map) return;

        const isBooked = table.status === "booked";
        els.tooltip.textContent = `Bàn ${table.id} · ${table.seats} chỗ · ${
            isBooked ? "Đã được đặt" : "Còn trống"
        }`;

        const mapRect = els.map.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        els.tooltip.style.left = `${rect.left - mapRect.left + rect.width / 2}px`;
        els.tooltip.style.top = `${rect.top - mapRect.top - 6}px`;
        els.tooltip.hidden = false;
    }

    function hideTooltip() {
        if (els.tooltip) {
            els.tooltip.hidden = true;
        }
    }

    els.stage.addEventListener("pointerover", (event) => {
        if (event.pointerType === "touch") return;
        const button = event.target.closest(".bk-table");
        if (button) showTooltip(button);
    });

    els.stage.addEventListener("pointerout", (event) => {
        const button = event.target.closest(".bk-table");
        if (button) hideTooltip();
    });

    els.stage.addEventListener("focusin", (event) => {
        const button = event.target.closest(".bk-table");
        if (button) showTooltip(button);
    });

    els.stage.addEventListener("focusout", hideTooltip);

    /* ---------------------------------------------------------------------
       Khu vực
       --------------------------------------------------------------------- */
    els.zoneTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            if (state.zone === tab.dataset.zone) return;

            state.zone = tab.dataset.zone;
            state.selectedId = null;

            els.zoneTabs.forEach((item) => {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-selected", String(active));
            });

            hideTooltip();
            refreshTables(true);
        });
    });

    /* ---------------------------------------------------------------------
       Số khách
       --------------------------------------------------------------------- */
    function updateGuestUI() {
        els.guestValue.textContent = String(state.guests);
        els.guestMinus.disabled = state.guests <= MIN_GUESTS;
        els.guestPlus.disabled = state.guests >= MAX_GUESTS;
        els.guestChips.forEach((chip) => {
            chip.classList.toggle("is-active", Number(chip.dataset.guests) === state.guests);
        });
    }

    function setGuests(value) {
        const next = Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Number(value) || MIN_GUESTS));
        if (next === state.guests) {
            updateGuestUI();
            return;
        }

        const previousTable = selectedTable();
        state.guests = next;
        updateGuestUI();

        if (previousTable && previousTable.seats < state.guests) {
            state.selectedId = null;
            refreshTableStates();
            toast(
                `Bàn ${previousTable.id} chỉ có ${previousTable.seats} chỗ. Hãy chọn bàn lớn hơn.`,
                "warning"
            );
        }

        updateSummary();
    }

    els.guestMinus.addEventListener("click", () => setGuests(state.guests - 1));
    els.guestPlus.addEventListener("click", () => setGuests(state.guests + 1));
    els.guestChips.forEach((chip) => {
        chip.addEventListener("click", () => setGuests(Number(chip.dataset.guests)));
    });

    /* ---------------------------------------------------------------------
       Ghi chú đặc biệt
       --------------------------------------------------------------------- */
    function updateNoteCount() {
        els.noteCount.textContent = `${els.note.value.length}/${NOTE_LIMIT}`;
        els.noteChips.forEach((chip) => {
            chip.classList.toggle("is-active", els.note.value.includes(chip.dataset.note));
        });
    }

    function toggleNote(text) {
        const current = els.note.value.trim();

        if (current.includes(text)) {
            const next = current
                .replace(text, "")
                .replace(/\s*,\s*,/g, ", ")
                .replace(/^,\s*|,\s*$/g, "")
                .trim();
            els.note.value = next;
        } else {
            const next = current ? `${current}, ${text}` : text;
            els.note.value = next.slice(0, NOTE_LIMIT);
        }

        updateNoteCount();
    }

    els.noteChips.forEach((chip) => {
        chip.addEventListener("click", () => toggleNote(chip.dataset.note));
    });

    els.note.addEventListener("input", updateNoteCount);

    /* ---------------------------------------------------------------------
       Tóm tắt
       --------------------------------------------------------------------- */
    function updateSummary() {
        const table = selectedTable();
        const zone = ZONES[state.zone];
        const branch = state.branch;

        if (branch) {
            els.sumBranch.textContent = branch.name;
            els.sumBranch.classList.remove("is-empty");
        } else {
            els.sumBranch.textContent = "Chưa chọn chi nhánh";
            els.sumBranch.classList.add("is-empty");
        }

        if (table) {
            els.sumTable.textContent = `Bàn ${table.id} · ${table.seats} chỗ`;
            els.sumTable.classList.remove("is-empty");
        } else {
            els.sumTable.textContent = "Chưa chọn bàn";
            els.sumTable.classList.add("is-empty");
        }

        if (state.time) {
            els.sumTime.textContent = `${state.time} · ${shortDate(state.date)}`;
            els.sumTime.classList.remove("is-empty");
        } else {
            els.sumTime.textContent = "Chưa chọn giờ";
            els.sumTime.classList.add("is-empty");
        }

        els.sumGuests.textContent = `${state.guests} khách`;

        els.selectedCard.hidden = !table;
        els.resetTable.disabled = !table;
        if (table) {
            els.selectedLabel.textContent = `Bàn ${table.id} · ${table.seats} chỗ · ${zone.label}`;
        }

        const available = state.tables.filter((item) => item.status !== "booked").length;
        const total = state.tables.length;
        const soldOut = Boolean(branch && branch.available_tables <= 0);
        const statusText = soldOut
            ? `${zone.label}: <strong>đã hết bàn</strong> · hãy chọn chi nhánh khác`
            : `${zone.label}: <strong>${available} bàn trống</strong> / ${total} bàn${
                  state.time ? "" : " · chọn giờ để xem chính xác"
              }`;
        els.mapStatus.innerHTML = statusText;
    }

    els.resetTable.addEventListener("click", () => clearSelection(true));
    els.clearTable.addEventListener("click", () => clearSelection(true));

    /* ---------------------------------------------------------------------
       Chọn giờ
       --------------------------------------------------------------------- */
    const MIN_LEAD_MINUTES = 15;

    function timeSlotDate(time) {
        return new Date(`${state.date}T${time}:00`);
    }

    function syncTimeAvailability() {
        const threshold = Date.now() + MIN_LEAD_MINUTES * 60 * 1000;
        let selectedBecameUnavailable = false;

        els.timeButtons.forEach((button) => {
            const unavailable = timeSlotDate(button.dataset.time).getTime() <= threshold;
            button.disabled = unavailable;
            button.classList.toggle("is-past", unavailable);
            button.setAttribute("aria-disabled", String(unavailable));

            if (unavailable && button.classList.contains("is-active")) {
                button.classList.remove("is-active");
                button.setAttribute("aria-pressed", "false");
                selectedBecameUnavailable = true;
            }
        });

        if (selectedBecameUnavailable) {
            state.time = null;
            state.selectedId = null;
            toast("Khung giờ đã chọn không còn phù hợp. Hãy chọn giờ khác.", "warning");
        }
    }

    els.timeButtons.forEach((button) => {
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-disabled", "false");

        button.addEventListener("click", () => {
            if (button.disabled) return;

            const time = button.dataset.time;
            const isActive = state.time === time;

            state.time = isActive ? null : time;
            state.selectedId = null;

            els.timeButtons.forEach((item) => {
                const active = !isActive && item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });

            hideTooltip();
            refreshTables(true);
            updateSummary();
        });
    });

    /* ---------------------------------------------------------------------
       Kiểm tra dữ liệu
       --------------------------------------------------------------------- */
    function markInvalid(field, invalid) {
        if (field) field.classList.toggle("is-invalid", invalid);
    }

    function clearErrors() {
        els.formAlert.hidden = true;
        els.formAlert.textContent = "";
        markInvalid(els.fieldName, false);
        markInvalid(els.fieldPhone, false);
    }

    function showError(message, field) {
        els.formAlert.textContent = message;
        els.formAlert.hidden = false;
        markInvalid(field, true);

        els.confirm.classList.remove("is-shaking");
        void els.confirm.offsetWidth;
        els.confirm.classList.add("is-shaking");
    }

    function isValidPhone(value) {
        const digits = value.replace(/[^\d+]/g, "");
        if (digits.startsWith("+84")) return /^\+84\d{9}$/.test(digits);
        if (digits.startsWith("84")) return /^84\d{9}$/.test(digits);
        return /^0\d{9}$/.test(digits);
    }

    function validate() {
        clearErrors();

        if (!state.branch) {
            showError("Vui lòng chọn chi nhánh nhà hàng.", null);
            els.branchSelect.focus();
            return false;
        }

        if (state.branch.available_tables <= 0) {
            showError("Chi nhánh này đã hết bàn. Vui lòng chọn chi nhánh khác.", null);
            els.branchSelect.focus();
            return false;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) {
            showError("Vui lòng chọn ngày dùng bữa.", null);
            els.dateInput.focus();
            return false;
        }

        if (state.date < todayISO()) {
            showError("Ngày dùng bữa không thể ở quá khứ.", null);
            els.dateInput.focus();
            return false;
        }

        if (!state.time) {
            showError("Vui lòng chọn giờ nhận bàn.", null);
            els.timeButtons[0].focus();
            return false;
        }

        if (timeSlotDate(state.time).getTime() <= Date.now() + MIN_LEAD_MINUTES * 60 * 1000) {
            showError(
                `Giờ nhận bàn phải cách hiện tại ít nhất ${MIN_LEAD_MINUTES} phút. Vui lòng chọn khung giờ khác.`,
                null
            );
            return false;
        }

        if (!state.selectedId) {
            showError("Vui lòng chọn một bàn còn trống trên sơ đồ.", null);
            els.stage.scrollIntoView({ behavior: "smooth", block: "center" });
            return false;
        }

        if (els.name.value.trim().length < 2) {
            showError("Vui lòng nhập họ và tên người đặt bàn.", els.fieldName);
            els.name.focus();
            return false;
        }

        if (!isValidPhone(els.phone.value.trim())) {
            showError(
                "Số điện thoại chưa hợp lệ. Dùng số di động 10 chữ số, ví dụ 0901 234 567.",
                els.fieldPhone
            );
            els.phone.focus();
            return false;
        }

        return true;
    }

    /* ---------------------------------------------------------------------
       Xác nhận đặt bàn
       --------------------------------------------------------------------- */
    function setSubmitting(loading) {
        state.submitting = loading;
        els.confirm.classList.toggle("is-loading", loading);
        els.confirm.disabled = loading;
        els.confirm.setAttribute("aria-busy", String(loading));
        els.confirmLabel.textContent = loading ? "Đang giữ bàn..." : "Xác nhận đặt bàn";
    }

    function reservationCode(id) {
        if (id) return `#TR-${String(id).padStart(6, "0")}`;
        return `#TR-${String(Math.floor(100000 + Math.random() * 900000))}`;
    }

    function openSuccess(result, { localOnly = false } = {}) {
        const table = selectedTable();
        const name = els.name.value.trim();
        const branch = state.branch;

        els.modalCode.textContent = reservationCode(result && result.id);
        els.modalBranch.textContent = branch ? branch.name : "—";
        els.modalTime.textContent = `${state.time} · ${longDate(state.date)}`;
        els.modalTable.textContent = table ? `Bàn ${table.id} · ${table.seats} chỗ` : "—";
        els.modalGuests.textContent = `${state.guests} khách`;
        els.modalName.textContent = name || "—";

        if (localOnly) {
            els.modalStatus.textContent =
                "Yêu cầu đã được lưu trên thiết bị này ở chế độ minh hoạ. Đăng nhập và kết nối máy chủ để nhà hàng nhận được đặt bàn.";
            els.modalNote.innerHTML =
                "<strong>Chế độ minh hoạ:</strong> đặt bàn chưa được gửi tới nhà hàng. Dữ liệu chỉ tồn tại trong trình duyệt của bạn.";
        } else {
            els.modalStatus.textContent =
                "Yêu cầu đặt bàn đã được ghi nhận. Nhà hàng sẽ sớm xác nhận qua số điện thoại của bạn.";
            els.modalNote.innerHTML =
                "<strong>Lưu ý:</strong> vui lòng đến trước giờ hẹn 10 phút. Bạn có thể hủy miễn phí trước 24 giờ trong mục Lịch sử đặt bàn.";
        }

        els.modal.hidden = false;
        document.body.style.overflow = "hidden";

        const closeButton = $(".bk-modal-close", els.modal);
        closeButton?.focus();
    }

    function closeSuccess() {
        if (els.modal.hidden) return;

        els.modalCard.classList.add("is-closing");
        window.setTimeout(() => {
            els.modal.hidden = true;
            els.modalCard.classList.remove("is-closing");
            document.body.style.overflow = "";
            els.confirm.focus();
        }, 200);
    }

    $$("[data-close-modal]", els.modal).forEach((element) => {
        element.addEventListener("click", closeSuccess);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSuccess();
            hideTooltip();
        }
    });

    function tableNumber(table) {
        const match = table ? table.id.match(/\d+/) : null;
        return match ? Number(match[0]) : null;
    }

    function rememberReservation(result, { localOnly }) {
        const branch = state.branch;
        const table = selectedTable();
        const rawTime = new Date(`${state.date}T${state.time}:00`);

        const record = {
            id: result.id,
            branch_id: branch.id,
            branch_name: branch.name,
            restaurant_name: branch.restaurant_name,
            branch_address: branch.address,
            reservation_time: `${state.time} • ${longDate(state.date)}`,
            raw_time: rawTime.toISOString(),
            guest_count: state.guests,
            table_number: tableNumber(table),
            customer_name: els.name.value.trim(),
            customer_phone: els.phone.value.trim(),
            status: result.status || "PENDING",
            special_requests: els.note.value.trim() || null,
            created_at: new Date().toISOString(),
            local_only: localOnly,
        };

        try {
            const saved = JSON.parse(localStorage.getItem("customer_reservations") || "[]");
            const list = Array.isArray(saved) ? saved : [];
            list.unshift(record);
            localStorage.setItem("customer_reservations", JSON.stringify(list.slice(0, 50)));
        } catch (error) {
            /* Không chặn luồng đặt bàn nếu localStorage đầy */
        }

        return record;
    }

    async function submitReservation() {
        const branch = state.branch;
        const payload = {
            branch_id: branch.id,
            guest_count: state.guests,
            reservation_time: new Date(`${state.date}T${state.time}:00`).toISOString(),
            special_request: els.note.value.trim() || null,
        };

        const canUseApi =
            branch.is_real &&
            typeof api === "object" &&
            typeof getToken === "function" &&
            Boolean(getToken());

        if (canUseApi) {
            try {
                const result = await api.post("/customer/reservations", payload);
                branch.available_tables = Math.max(0, branch.available_tables - 1);
                rememberReservation(result, { localOnly: false });
                return { result, localOnly: false };
            } catch (error) {
                const offline = /Không kết nối được máy chủ/i.test(error?.message || "");
                if (!offline) {
                    throw error;
                }
            }
        }

        await sleep(900);
        const result = {
            id: Math.floor(100000 + Math.random() * 900000),
            status: "PENDING",
        };
        branch.available_tables = Math.max(0, branch.available_tables - 1);
        rememberReservation(result, { localOnly: true });

        return { result, localOnly: true };
    }

    els.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (state.submitting) return;

        if (!validate()) return;

        setSubmitting(true);

        try {
            const { result, localOnly } = await submitReservation();

            openSuccess(result, { localOnly });
            toast(
                localOnly
                    ? "Đã ghi nhận đặt bàn trên thiết bị này. Kết nối máy chủ để đồng bộ với nhà hàng."
                    : "Đặt bàn thành công! Nhà hàng sẽ sớm xác nhận.",
                localOnly ? "warning" : "success"
            );
        } catch (error) {
            const message = error?.message || "Không thể gửi yêu cầu đặt bàn. Vui lòng thử lại.";
            showError(message, null);
            toast(message, "error");
        } finally {
            setSubmitting(false);
        }
    });

    /* ---------------------------------------------------------------------
       Toast
       --------------------------------------------------------------------- */
    function toast(message, type = "info") {
        if (!els.toasts) return;

        const element = document.createElement("div");
        element.className = `bk-toast${type ? ` is-${type}` : ""}`;
        element.textContent = message;
        els.toasts.appendChild(element);

        window.setTimeout(() => {
            element.classList.add("is-leaving");
            window.setTimeout(() => element.remove(), 260);
        }, 3400);
    }

    /* ---------------------------------------------------------------------
       Khởi tạo
       --------------------------------------------------------------------- */
    function prefillUser() {
        try {
            if (typeof getUser !== "function") return;
            const user = getUser();
            if (!user) return;

            const name = user.name || user.full_name || "";
            const email = user.email || "";

            if (name) els.name.value = name;
            if (user.phone) els.phone.value = user.phone;

            const display = name || email || "Khách";
            els.userName.textContent = display;
            els.userAvatar.textContent = (name || email)
                .split(/[\s@._-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join("");
        } catch (error) {
            /* Trang vẫn chạy bình thường nếu chưa có phiên đăng nhập */
        }
    }

    async function initBranches() {
        state.location = readSavedLocation();

        if (
            typeof api !== "object" ||
            typeof getToken !== "function" ||
            !getToken()
        ) {
            renderBranchOptions(DEMO_BRANCHES, {
                real: false,
                notice:
                    "Đang hiển thị dữ liệu minh hoạ. <a href=\"../login.html\">Đăng nhập</a> để tải chi nhánh thật.",
            });
            return;
        }

        await fetchNearbyBranches(state.location);
    }

    function init() {
        prefillUser();

        const today = todayISO();
        els.dateInput.min = today;
        els.dateInput.value = today;
        state.date = today;

        renderDateChips();
        updateGuestUI();
        updateNoteCount();
        syncTimeAvailability();

        els.dateInput.addEventListener("change", () => setDate(els.dateInput.value));

        initBranches();
    }

    init();
})();
