/**
 * branches.js - Restaurant Branch Management (CRUD) & Leaflet Map Controller
 * Tuân thủ quy chuẩn dự án TableReserve & Module Dev 4.
 *
 * Chức năng chính:
 * ├── Tải & đồng bộ danh sách chi nhánh (API thật + LocalStorage fallback)
 * ├── Khởi tạo Bản đồ Leaflet chính hiển thị toàn bộ chi nhánh
 * ├── Bản đồ mini trong Modal chọn tọa độ (Coordinate Picker) với Draggable Marker
 * ├── Geocoding địa chỉ qua OpenStreetMap Nominatim API
 * ├── CRUD chi nhánh: Thêm mới, Chỉnh sửa, Xóa chi nhánh
 * └── Tìm kiếm tức thì & cập nhật thống kê mạng lưới
 */

// ==========================================================================
// CONSTANTS & STATE
// ==========================================================================
const DEFAULT_MAP_CENTER = [10.7769, 106.7009]; // TP. Hồ Chí Minh
const DEFAULT_MAP_ZOOM = 12;

// Dữ liệu mẫu chuẩn đồng bộ với book.js
const INITIAL_BRANCHES = [
    {
        id: 1,
        name: "Chi nhánh Bến Nghé — Quận 1",
        address: "72 Lê Thánh Tôn, P. Bến Nghé, Quận 1, TP. HCM",
        phone: "028 3822 5566",
        opening_hours: "10:00 - 22:30",
        total_tables: 12,
        available_tables: 5,
        latitude: 10.7769,
        longitude: 106.7009
    },
    {
        id: 2,
        name: "Chi nhánh Thảo Điền — TP. Thủ Đức",
        address: "18 Xuân Thủy, P. Thảo Điền, TP. Thủ Đức, TP. HCM",
        phone: "028 3744 1122",
        opening_hours: "11:00 - 23:00",
        total_tables: 10,
        available_tables: 3,
        latitude: 10.8035,
        longitude: 106.7324
    },
    {
        id: 3,
        name: "Chi nhánh Landmark 81 — Bình Thạnh",
        address: "Tầng 5, Vincom Landmark 81, 720A Điện Biên Phủ, Bình Thạnh, TP. HCM",
        phone: "028 3911 8899",
        opening_hours: "09:30 - 22:00",
        total_tables: 8,
        available_tables: 4,
        latitude: 10.7951,
        longitude: 106.7218
    },
    {
        id: 4,
        name: "Chi nhánh Phú Mỹ Hưng — Quận 7",
        address: "102 Nguyễn Đức Cảnh, P. Tân Phong, Quận 7, TP. HCM",
        phone: "028 5412 3344",
        opening_hours: "10:30 - 22:30",
        total_tables: 14,
        available_tables: 2,
        latitude: 10.7291,
        longitude: 106.7099
    }
];

let _branches = [];
let _mainMap = null;
let _mainMapMarkers = [];
let _pickerMap = null;
let _pickerMarker = null;

let _activeSearch = "";
let _activeStatusFilter = "ALL";
let _branchToDelete = null;

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

function escHtml(str) {
    if (!str && str !== 0) return "";
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

/**
 * Tạo Icon tùy chỉnh cho Marker Leaflet mang nhận diện thương hiệu TableReserve
 */
function createCustomMarkerIcon(numberStr = "📍") {
    return L.divIcon({
        className: "custom-leaflet-marker",
        html: `
            <div style="
                background: linear-gradient(135deg, #7c2d2d 0%, #5c1f22 100%);
                color: #e8d5b5;
                width: 32px;
                height: 32px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(43, 33, 28, 0.4);
                border: 2px solid #fff;
            ">
                <span style="transform: rotate(45deg); font-size: 13px; font-weight: 700;">${numberStr}</span>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// ==========================================================================
// DATA MANAGEMENT (API & LOCALSTORAGE)
// ==========================================================================

function getFallbackBranches() {
    try {
        const stored = localStorage.getItem("restaurant_branches");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {
        // Fallback
    }
    localStorage.setItem("restaurant_branches", JSON.stringify(INITIAL_BRANCHES));
    return INITIAL_BRANCHES;
}

function saveBranchesLocally(data) {
    try {
        localStorage.setItem("restaurant_branches", JSON.stringify(data));
    } catch {
        // Ignore local storage error
    }
}

/**
 * Tải danh sách chi nhánh từ Backend REST API (với fallback offline)
 */
async function loadBranches() {
    setLoading(true, "Đang tải danh sách chi nhánh...");
    try {
        const data = await api.get("/restaurant/me/branches");
        if (Array.isArray(data) && data.length > 0) {
            _branches = data;
        } else {
            _branches = getFallbackBranches();
        }
    } catch {
        _branches = getFallbackBranches();
    } finally {
        setLoading(false);
        renderBranchList();
        updateBranchStats();
        updateMainMapMarkers();
    }
}

// ==========================================================================
// LEAFLET MAIN MAP CONTROLLER
// ==========================================================================

function initMainMap() {
    const mapContainer = document.getElementById("branches-main-map");
    if (!mapContainer || _mainMap) return;

    _mainMap = L.map("branches-main-map", {
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        zoomControl: true
    });

    // Bản đồ OpenStreetMap tile layer tiêu chuẩn
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(_mainMap);
}

function updateMainMapMarkers() {
    if (!_mainMap) return;

    // Xóa marker cũ
    _mainMapMarkers.forEach((m) => _mainMap.removeLayer(m));
    _mainMapMarkers = [];

    const latLngs = [];

    _branches.forEach((b, index) => {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);

        if (!isNaN(lat) && !isNaN(lng)) {
            const marker = L.marker([lat, lng], {
                icon: createCustomMarkerIcon(String(index + 1))
            }).addTo(_mainMap);

            const popupContent = `
                <div style="font-family:'Source Sans 3',sans-serif; min-width:210px; padding:4px;">
                    <h4 style="margin:0 0 4px; font-family:Fraunces,Georgia,serif; color:#5c1f22; font-size:1.05rem;">${escHtml(b.name)}</h4>
                    <p style="margin:0 0 6px; font-size:0.82rem; color:#6f625a; line-height:1.35;">📍 ${escHtml(b.address)}</p>
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:8px; background:#f7f1e8; padding:6px 8px; border-radius:6px;">
                        <span>Bàn trống: <strong style="color:#2e7d32;">${escHtml(b.available_tables)}</strong></span>
                        <span>Tổng: <strong>${escHtml(b.total_tables)}</strong></span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" onclick="window.editBranchById(${b.id})" style="flex:1; padding:4px 8px; background:#7c2d2d; color:#fff; border:none; border-radius:4px; font-size:0.78rem; cursor:pointer; font-weight:700;">✏ Sửa</button>
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent);
            _mainMapMarkers.push(marker);
            latLngs.push([lat, lng]);
        }
    });

    if (latLngs.length > 0) {
        _mainMap.fitBounds(latLngs, { padding: [40, 40], maxZoom: 14 });
    }
}

function panToBranch(lat, lng, branchId) {
    if (!_mainMap) return;
    _mainMap.setView([lat, lng], 15, { animate: true });

    // Mở popup tương ứng
    const idx = _branches.findIndex((b) => b.id === branchId);
    if (idx >= 0 && _mainMapMarkers[idx]) {
        _mainMapMarkers[idx].openPopup();
    }
}

// ==========================================================================
// LEAFLET COORDINATE PICKER MAP (INSIDE MODAL)
// ==========================================================================

function initPickerMap(initialLat = DEFAULT_MAP_CENTER[0], initialLng = DEFAULT_MAP_CENTER[1]) {
    const mapEl = document.getElementById("modal-picker-map");
    if (!mapEl) return;

    if (!_pickerMap) {
        _pickerMap = L.map("modal-picker-map", {
            center: [initialLat, initialLng],
            zoom: 14,
            zoomControl: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        }).addTo(_pickerMap);

        // Marker có thể kéo thả
        _pickerMarker = L.marker([initialLat, initialLng], {
            draggable: true,
            icon: createCustomMarkerIcon("📍")
        }).addTo(_pickerMap);

        _pickerMarker.on("dragend", (e) => {
            const coord = e.target.getLatLng();
            updatePickerInputs(coord.lat, coord.lng);
        });

        // Nhấp chuột vào bất cứ đâu trên map để đặt vị trí marker
        _pickerMap.on("click", (e) => {
            const coord = e.latlng;
            _pickerMarker.setLatLng(coord);
            updatePickerInputs(coord.lat, coord.lng);
        });
    } else {
        _pickerMap.setView([initialLat, initialLng], 14);
        _pickerMarker.setLatLng([initialLat, initialLng]);
        _pickerMap.invalidateSize();
    }

    updatePickerInputs(initialLat, initialLng);
}

function updatePickerInputs(lat, lng) {
    const latInput = document.getElementById("branch-lat-input");
    const lngInput = document.getElementById("branch-lng-input");
    if (latInput) latInput.value = parseFloat(lat).toFixed(6);
    if (lngInput) lngInput.value = parseFloat(lng).toFixed(6);
}

/**
 * Tìm kiếm tọa độ từ địa chỉ đã nhập qua Nominatim Geocoding API (OpenStreetMap)
 */
async function geocodeAddressQuery() {
    const addressInput = document.getElementById("branch-address-input");
    const address = addressInput ? addressInput.value.trim() : "";
    if (!address) {
        showToast("Vui lòng nhập địa chỉ trước khi tìm vị trí.", "info");
        return;
    }

    setLoading(true, "Đang định vị địa chỉ trên bản đồ...");
    try {
        const query = encodeURIComponent(`${address}, Việt Nam`);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
            headers: { "Accept-Language": "vi,en" }
        });
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lon);

            if (_pickerMap && _pickerMarker) {
                _pickerMap.setView([lat, lng], 16);
                _pickerMarker.setLatLng([lat, lng]);
                updatePickerInputs(lat, lng);
            }
            showToast("Đã tìm thấy vị trí và cập nhật tọa độ!", "info");
        } else {
            showToast("Không tìm thấy tọa độ cho địa chỉ này. Hãy chọn thủ công trên bản đồ.", "info");
        }
    } catch {
        showToast("Không thể kết nối dịch vụ định vị. Hãy click trực tiếp trên bản đồ.", "info");
    } finally {
        setLoading(false);
    }
}

/**
 * Lấy tọa độ GPS thiết bị hiện tại
 */
function useDeviceGps() {
    if (!navigator.geolocation) {
        showToast("Trình duyệt không hỗ trợ Geolocation GPS.", "info");
        return;
    }

    setLoading(true, "Đang lấy tín hiệu GPS...");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            setLoading(false);
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (_pickerMap && _pickerMarker) {
                _pickerMap.setView([lat, lng], 16);
                _pickerMarker.setLatLng([lat, lng]);
                updatePickerInputs(lat, lng);
            }
            showToast("Đã cập nhật vị trí theo GPS hiện tại!", "info");
        },
        () => {
            setLoading(false);
            showToast("Không lấy được quyền truy cập GPS của bạn.", "info");
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

// ==========================================================================
// BRANCH LIST RENDERING & STATS
// ==========================================================================

function updateBranchStats() {
    const totalEl = document.getElementById("stat-branch-total");
    const totalTablesEl = document.getElementById("stat-total-tables");
    const availTablesEl = document.getElementById("stat-avail-tables");
    const occupiedTablesEl = document.getElementById("stat-occupied-tables");

    const totalCount = _branches.length;
    const totalTables = _branches.reduce((sum, b) => sum + (Number(b.total_tables) || 0), 0);
    const availTables = _branches.reduce((sum, b) => sum + (Number(b.available_tables) || 0), 0);
    const occupiedTables = Math.max(0, totalTables - availTables);

    if (totalEl) totalEl.textContent = totalCount;
    if (totalTablesEl) totalTablesEl.textContent = totalTables;
    if (availTablesEl) availTablesEl.textContent = availTables;
    if (occupiedTablesEl) occupiedTablesEl.textContent = occupiedTables;
}

function renderBranchList() {
    const container = document.getElementById("branches-container");
    const emptyState = document.getElementById("branches-empty-state");
    if (!container) return;

    let filtered = [..._branches];

    if (_activeStatusFilter === "AVAILABLE") {
        filtered = filtered.filter((b) => (Number(b.available_tables) || 0) > 0);
    } else if (_activeStatusFilter === "FULL") {
        filtered = filtered.filter((b) => (Number(b.available_tables) || 0) === 0);
    }

    if (_activeSearch) {
        const q = _activeSearch.toLowerCase();
        filtered = filtered.filter((b) => {
            const name = (b.name || "").toLowerCase();
            const addr = (b.address || "").toLowerCase();
            return name.includes(q) || addr.includes(q);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = "";
        if (emptyState) emptyState.hidden = false;
        return;
    }

    if (emptyState) emptyState.hidden = true;

    container.innerHTML = filtered.map((b) => {
        const total = Number(b.total_tables) || 1;
        const avail = Number(b.available_tables) || 0;
        const occupied = Math.max(0, total - avail);
        const percentAvail = Math.min(100, Math.round((avail / total) * 100));

        return `
            <article class="branch-card-item" id="branch-card-${escHtml(b.id)}" data-id="${escHtml(b.id)}">
                <div class="branch-item-header">
                    <div>
                        <h3 class="branch-item-name">${escHtml(b.name)}</h3>
                        <p class="branch-item-addr">📍 ${escHtml(b.address)}</p>
                        ${b.phone ? `<p style="margin:2px 0 0; font-size:0.82rem; color:var(--muted);">📞 Hotline: ${escHtml(b.phone)}</p>` : ""}
                    </div>
                    <span class="branch-coords-pill" title="Tọa độ GPS">
                        ${Number(b.latitude).toFixed(4)}, ${Number(b.longitude).toFixed(4)}
                    </span>
                </div>

                <div class="branch-item-stats">
                    <div class="branch-stat-mini">
                        <div class="branch-mini-val">${escHtml(total)}</div>
                        <div class="branch-mini-label">Tổng số bàn</div>
                    </div>
                    <div class="branch-stat-mini">
                        <div class="branch-mini-val avail">${escHtml(avail)}</div>
                        <div class="branch-mini-label">Bàn trống</div>
                    </div>
                    <div class="branch-stat-mini">
                        <div class="branch-mini-val" style="color:#e65100;">${escHtml(occupied)}</div>
                        <div class="branch-mini-label">Đang phục vụ</div>
                    </div>
                </div>

                <div>
                    <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--muted);">
                        <span>Tỷ lệ bàn trống khả dụng</span>
                        <strong>${percentAvail}%</strong>
                    </div>
                    <div class="branch-capacity-bar">
                        <div class="branch-capacity-fill" style="width: ${percentAvail}%;"></div>
                    </div>
                </div>

                <footer class="branch-item-footer">
                    <button type="button" class="btn-ghost" data-action="locate" data-id="${escHtml(b.id)}" style="padding:4px 10px; font-size:0.82rem;">
                        📍 Xem trên bản đồ
                    </button>
                    <div class="branch-actions">
                        <button type="button" class="btn-ghost" data-action="edit" data-id="${escHtml(b.id)}" style="border:1px solid var(--line); padding:6px 14px; font-size:0.84rem;">
                            ✏ Sửa
                        </button>
                        <button type="button" class="btn-danger" data-action="delete" data-id="${escHtml(b.id)}" style="padding:6px 14px; font-size:0.84rem;">
                            🗑 Xóa
                        </button>
                    </div>
                </footer>
            </article>
        `;
    }).join("");
}

// ==========================================================================
// MODAL ACTIONS (ADD, EDIT, DELETE)
// ==========================================================================

function openAddBranchModal() {
    const modal = document.getElementById("modal-branch-form");
    const title = document.getElementById("branch-modal-title");
    const alertBox = document.getElementById("branch-form-alert");

    if (title) title.textContent = "Thêm Chi Nhánh Mới";
    if (alertBox) alertBox.hidden = true;

    // Reset inputs
    document.getElementById("branch-id-input").value = "";
    document.getElementById("branch-name-input").value = "";
    document.getElementById("branch-address-input").value = "";
    document.getElementById("branch-phone-input").value = "";
    document.getElementById("branch-total-tables-input").value = "15";
    document.getElementById("branch-avail-tables-input").value = "15";
    document.getElementById("branch-hours-input").value = "10:00 - 22:30";

    if (modal) modal.hidden = false;

    // Khởi tạo mini picker map
    setTimeout(() => {
        initPickerMap(DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1]);
    }, 150);
}

function openEditBranchModal(branch) {
    const modal = document.getElementById("modal-branch-form");
    const title = document.getElementById("branch-modal-title");
    const alertBox = document.getElementById("branch-form-alert");

    if (title) title.textContent = "Chỉnh Sửa Chi Nhánh";
    if (alertBox) alertBox.hidden = true;

    document.getElementById("branch-id-input").value = branch.id;
    document.getElementById("branch-name-input").value = branch.name || "";
    document.getElementById("branch-address-input").value = branch.address || "";
    document.getElementById("branch-phone-input").value = branch.phone || "";
    document.getElementById("branch-total-tables-input").value = branch.total_tables || "10";
    document.getElementById("branch-avail-tables-input").value = branch.available_tables || "0";
    document.getElementById("branch-hours-input").value = branch.opening_hours || "10:00 - 22:30";

    const lat = parseFloat(branch.latitude) || DEFAULT_MAP_CENTER[0];
    const lng = parseFloat(branch.longitude) || DEFAULT_MAP_CENTER[1];

    if (modal) modal.hidden = false;

    setTimeout(() => {
        initPickerMap(lat, lng);
    }, 150);
}

// Cho phép gọi trực tiếp từ Leaflet Popup
window.editBranchById = function(id) {
    const branch = _branches.find((b) => b.id === Number(id));
    if (branch) {
        openEditBranchModal(branch);
    }
};

function openDeleteBranchModal(branch) {
    _branchToDelete = branch;
    const modal = document.getElementById("modal-delete-branch");
    const textEl = document.getElementById("delete-branch-name-text");
    if (textEl) textEl.textContent = branch.name;
    if (modal) modal.hidden = false;
}

function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => {
        m.hidden = true;
    });
    _branchToDelete = null;
}

/**
 * Xử lý Lưu Chi Nhánh (Thêm mới hoặc Cập nhật)
 */
async function handleSaveBranch(e) {
    e.preventDefault();
    const alertBox = document.getElementById("branch-form-alert");
    if (alertBox) alertBox.hidden = true;

    const idVal = document.getElementById("branch-id-input").value;
    const name = document.getElementById("branch-name-input").value.trim();
    const address = document.getElementById("branch-address-input").value.trim();
    const phone = document.getElementById("branch-phone-input").value.trim();
    const totalTables = parseInt(document.getElementById("branch-total-tables-input").value, 10);
    const availTables = parseInt(document.getElementById("branch-avail-tables-input").value, 10);
    const hours = document.getElementById("branch-hours-input").value.trim();
    const lat = parseFloat(document.getElementById("branch-lat-input").value);
    const lng = parseFloat(document.getElementById("branch-lng-input").value);

    // Form Validation
    if (!name || !address) {
        if (alertBox) {
            alertBox.hidden = false;
            alertBox.textContent = "Vui lòng nhập đầy đủ Tên chi nhánh và Địa chỉ.";
        }
        return;
    }

    if (isNaN(totalTables) || totalTables < 1) {
        if (alertBox) {
            alertBox.hidden = false;
            alertBox.textContent = "Tổng số bàn phải là số nguyên dương lớn hơn 0.";
        }
        return;
    }

    if (isNaN(availTables) || availTables < 0 || availTables > totalTables) {
        if (alertBox) {
            alertBox.hidden = false;
            alertBox.textContent = "Số bàn trống phải từ 0 đến tổng số bàn.";
        }
        return;
    }

    if (isNaN(lat) || isNaN(lng)) {
        if (alertBox) {
            alertBox.hidden = false;
            alertBox.textContent = "Vui lòng chọn tọa độ hợp lệ trên bản đồ.";
        }
        return;
    }

    const payload = {
        name,
        address,
        phone,
        total_tables: totalTables,
        available_tables: availTables,
        opening_hours: hours,
        latitude: lat,
        longitude: lng
    };

    setLoading(true, "Đang lưu chi nhánh...");
    try {
        if (idVal) {
            // Sửa chi nhánh
            await api.patch(`/restaurant/me/branches/${idVal}`, payload);
            const idx = _branches.findIndex((b) => String(b.id) === String(idVal));
            if (idx >= 0) {
                _branches[idx] = { ..._branches[idx], ...payload, id: Number(idVal) };
            }
            showToast("Đã cập nhật chi nhánh thành công!", "info");
        } else {
            // Thêm chi nhánh mới
            let newBranch = null;
            try {
                newBranch = await api.post("/restaurant/me/branches", payload);
            } catch {
                // Offline fallback
                newBranch = { ...payload, id: Date.now() };
            }
            _branches.push(newBranch || { ...payload, id: Date.now() });
            showToast("Đã thêm chi nhánh mới vào hệ thống!", "info");
        }
    } catch {
        // Fallback offline
        if (idVal) {
            const idx = _branches.findIndex((b) => String(b.id) === String(idVal));
            if (idx >= 0) _branches[idx] = { ..._branches[idx], ...payload, id: Number(idVal) };
        } else {
            _branches.push({ ...payload, id: Date.now() });
        }
        showToast("Đã lưu chi nhánh thành công (chế độ demo)!", "info");
    } finally {
        saveBranchesLocally(_branches);
        setLoading(false);
        closeAllModals();
        renderBranchList();
        updateBranchStats();
        updateMainMapMarkers();
    }
}

/**
 * Xử lý Xóa Chi Nhánh
 */
async function handleDeleteBranch() {
    if (!_branchToDelete) return;
    const branchId = _branchToDelete.id;

    setLoading(true, "Đang xóa chi nhánh...");
    try {
        await api.delete(`/restaurant/me/branches/${branchId}`);
    } catch {
        // Fallback offline
    } finally {
        _branches = _branches.filter((b) => b.id !== branchId);
        saveBranchesLocally(_branches);
        setLoading(false);
        closeAllModals();
        renderBranchList();
        updateBranchStats();
        updateMainMapMarkers();
        showToast("Đã xóa chi nhánh khỏi hệ thống.", "info");
    }
}

// ==========================================================================
// DOM INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Kiểm tra xác thực (RESTAURANT_OWNER)
    const currentUser = requireAuth("RESTAURANT_OWNER");
    if (!currentUser) return;

    // Navbar identity
    const ownerName = document.getElementById("branches-owner-name");
    const ownerRest = document.getElementById("branches-owner-restaurant");
    const ownerAvatar = document.getElementById("branches-owner-avatar");

    if (ownerName) ownerName.textContent = displayName(currentUser);
    if (ownerRest) ownerRest.textContent = currentUser.restaurant_name || "Le Ciel Gourmet";
    if (ownerAvatar) {
        ownerAvatar.textContent = (currentUser.name || "QL").substring(0, 2).toUpperCase();
    }

    // 2. Khởi tạo bản đồ lớn
    initMainMap();

    // 3. Tải danh sách chi nhánh
    loadBranches();

    // 4. Sự kiện Đăng xuất
    const logoutBtn = document.getElementById("btn-branches-logout");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    // 5. Nút Mở Modal Thêm Chi Nhánh
    const openAddBtn = document.getElementById("btn-open-create-branch");
    const quickAddBtn = document.getElementById("btn-quick-add-branch");
    if (openAddBtn) openAddBtn.addEventListener("click", openAddBranchModal);
    if (quickAddBtn) quickAddBtn.addEventListener("click", openAddBranchModal);

    // 6. Nút Tải lại
    const refreshBtn = document.getElementById("btn-refresh-branches");
    if (refreshBtn) refreshBtn.addEventListener("click", () => {
        loadBranches();
        showToast("Đã tải lại danh sách chi nhánh.", "info", 1800);
    });

    // 7. Nút Thu phóng toàn cảnh map
    const fitBtn = document.getElementById("btn-fit-map-bounds");
    if (fitBtn) fitBtn.addEventListener("click", () => {
        updateMainMapMarkers();
    });

    // 8. Định vị địa chỉ & GPS trong modal
    const geocodeBtn = document.getElementById("btn-geocode-address");
    if (geocodeBtn) geocodeBtn.addEventListener("click", geocodeAddressQuery);

    const gpsBtn = document.getElementById("btn-picker-gps");
    if (gpsBtn) gpsBtn.addEventListener("click", useDeviceGps);

    // Nhấn Enter trong ô địa chỉ tự động tìm kiếm
    const addressInput = document.getElementById("branch-address-input");
    if (addressInput) {
        addressInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                geocodeAddressQuery();
            }
        });
    }

    // 9. Submit Form chi nhánh
    const branchForm = document.getElementById("branch-form");
    if (branchForm) branchForm.addEventListener("submit", handleSaveBranch);

    // 10. Submit Xóa chi nhánh
    const confirmDeleteBtn = document.getElementById("btn-confirm-delete-branch");
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", handleDeleteBranch);

    // 11. Đóng Modals
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", closeAllModals);
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            closeAllModals();
        }
    });

    // 12. Tìm kiếm và lọc
    const searchInput = document.getElementById("input-search-branch");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            _activeSearch = e.target.value.trim();
            renderBranchList();
        });
    }

    const filterStatus = document.getElementById("filter-branch-status");
    if (filterStatus) {
        filterStatus.addEventListener("change", (e) => {
            _activeStatusFilter = e.target.value;
            renderBranchList();
        });
    }

    // 13. Event delegation cho các nút trong thẻ chi nhánh (Locate / Edit / Delete)
    const branchesContainer = document.getElementById("branches-container");
    if (branchesContainer) {
        branchesContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const action = btn.dataset.action;
            const id = Number(btn.dataset.id);
            const branch = _branches.find((b) => b.id === id);
            if (!branch) return;

            if (action === "locate") {
                panToBranch(parseFloat(branch.latitude), parseFloat(branch.longitude), branch.id);
                // Highlight card
                document.querySelectorAll(".branch-card-item").forEach((c) => c.classList.remove("selected"));
                const card = document.getElementById(`branch-card-${branch.id}`);
                if (card) card.classList.add("selected");
            } else if (action === "edit") {
                openEditBranchModal(branch);
            } else if (action === "delete") {
                openDeleteBranchModal(branch);
            }
        });
    }
});
