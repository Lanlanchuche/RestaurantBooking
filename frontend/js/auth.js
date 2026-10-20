const TOKEN_KEY = "token";
const USER_KEY = "user";

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
    return Boolean(getToken());
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

    if (!token) {
        // Chưa đăng nhập -> chuyển đến trang đăng nhập
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

function logout() {
    clearAuth();
    location.href = authPageHref("login.html");
}


