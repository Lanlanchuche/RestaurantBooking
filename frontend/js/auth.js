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

function dashboardPathForRole(role) {
    if (role === "RESTAURANT_OWNER") {
        return "restaurant/dashboard.html";
    }
    return "customer/dashboard.html";
}

function authPageHref(fileName) {
    const inSubFolder = /\/(customer|restaurant)\//.test(location.pathname);
    return inSubFolder ? `../${fileName}` : fileName;
}

function logout() {
    clearAuth();
    location.href = authPageHref("login.html");
}

function requireAuth(role) {
    if (!isLoggedIn()) {
        location.href = authPageHref("login.html");
        return null;
    }

    const user = getUser();
    if (role && user?.role && user.role !== role) {
        location.href = dashboardPathForRole(user.role);
        return null;
    }

    return user;
}

function populateNavUser() {
    const el = document.getElementById("nav-user-name");
    if (!el) {
        return;
    }

    const user = getUser();
    el.textContent = user?.full_name || user?.email || "";
}

function redirectIfLoggedIn() {
    if (!isLoggedIn()) {
        return;
    }

    const user = getUser();
    location.href = dashboardPathForRole(user?.role);
}
