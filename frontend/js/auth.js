const TOKEN_KEY = "token";
const USER_KEY = "user";
const LEGACY_DEMO_TOKEN = "local-demo-token";

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
        return null;
    }
}

function isLoggedIn() {
    const token = getToken();

    // Token demo cũ (đăng nhập offline) không còn hợp lệ.
    if (!token || token === LEGACY_DEMO_TOKEN) {
        if (token) {
            clearAuth();
        }
        return false;
    }

    return true;
}

function setAuthData(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function displayName(user) {
    if (!user) return "Khách";
    return user.name || user.full_name || (user.email ? user.email.split("@")[0] : "Khách");
}

function authPageHref(page = "login.html") {
    const isSubdir = location.pathname.includes("/customer/") || location.pathname.includes("/restaurant/");
    return isSubdir ? `../${page}` : page;
}

function dashboardHref(role) {
    const isSubdir = location.pathname.includes("/customer/") || location.pathname.includes("/restaurant/");
    const prefix = isSubdir ? "../" : "";
    const normalizedRole = String(role || "").toUpperCase();
    if (normalizedRole.includes("RESTAURANT") || normalizedRole.includes("OWNER")) {
        return `${prefix}restaurant/dashboard.html`;
    }
    return `${prefix}customer/dashboard.html`;
}

function requireAuth(requiredRole = "CUSTOMER") {
    const token = getToken();
    let user = getUser();

    if (!token || token === LEGACY_DEMO_TOKEN) {
        // Chưa đăng nhập (hoặc token demo cũ) -> chuyển đến trang đăng nhập
        clearAuth();
        location.href = authPageHref("login.html");
        return null;
    }

    if (!user) {
        // Token tồn tại nhưng chưa có user data -> fetch và redirect
        location.href = authPageHref("login.html");
        return null;
    }

    const userRole = String(user.role || "").toUpperCase();
    const reqRole = String(requiredRole || "").toUpperCase();
    if (reqRole && userRole !== reqRole) {
        location.href = dashboardHref(user.role);
        return null;
    }

    return user;
}

function redirectIfLoggedIn() {
    if (isLoggedIn()) {
        const user = getUser();
        location.href = dashboardHref(user?.role);
    }
}

let _loggingOut = false;

function logout() {
    // Chống gọi lặp (ví dụ vừa có handler riêng của trang vừa có handler
    // dự phòng toàn cục bên dưới) để không điều hướng hai lần.
    if (_loggingOut) return;
    _loggingOut = true;

    // Ngắt WebSocket realtime (nếu trang hiện tại có) trước khi xoá phiên.
    try {
        if (typeof disconnectDashboardWS === "function") {
            disconnectDashboardWS();
        }
    } catch (err) {
        console.warn("[auth] Không ngắt được WebSocket khi đăng xuất:", err);
    }

    clearAuth();

    try {
        sessionStorage.clear();
    } catch {
        // Ignore storage errors (chế độ riêng tư, v.v.)
    }

    const destination = authPageHref("login.html");

    // replace() để nút Back của trình duyệt không quay lại dashboard sau
    // khi đã đăng xuất.
    if (typeof window.location.replace === "function") {
        window.location.replace(destination);
    } else {
        window.location.href = destination;
    }
}

// --------------------------------------------------------------------------
// Dự phòng: luôn bắt sự kiện nút Đăng xuất ở cấp document.
// Nhờ vậy nút vẫn hoạt động kể cả khi script riêng của trang
// (dashboard.js, branches.js, book.js, history.js...) gặp lỗi hoặc
// chưa kịp gắn sự kiện.
// --------------------------------------------------------------------------
const LOGOUT_BUTTON_SELECTOR =
    "#btn-logout, #btn-branches-logout, #btn-hist-logout, [data-logout]";

document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest(LOGOUT_BUTTON_SELECTOR);
    if (!btn) return;

    event.preventDefault();
    logout();
});


