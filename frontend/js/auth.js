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
        // Tự động cấp phiên demo để người dùng trải nghiệm ngay lập tức nếu chưa qua trang đăng nhập
        const demoUser = {
            id: 1,
            name: "Nguyễn Minh Khang",
            email: "minhkhang@tablereserve.vn",
            phone: "0909 123 456",
            address: "68 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
            role: requiredRole,
        };
        setAuthData("demo-session-token", demoUser);
        return demoUser;
    }

    if (!user) {
        user = {
            id: 1,
            name: "Khách hàng",
            email: "customer@tablereserve.vn",
            role: requiredRole,
        };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    if (requiredRole && user.role && user.role !== requiredRole) {
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


