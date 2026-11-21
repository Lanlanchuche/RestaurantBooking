const API_BASE = "https://restaurantbooking-flx9.onrender.com";
const WS_BASE = "wss://restaurantbooking-flx9.onrender.com";

// Toàn bộ endpoint của backend nằm dưới tiền tố /api.
const API_PREFIX = "/api";

// Ghép base + endpoint, tránh lặp hoặc thiếu dấu "/" ở giữa.
function joinUrl(base, path) {
    return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

// Dựng URL đầy đủ: tự thêm /api nếu nơi gọi chưa truyền.
function buildApiUrl(endpoint) {
    const raw = String(endpoint || "");
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    const fullPath =
        path === API_PREFIX || path.startsWith(`${API_PREFIX}/`) ? path : `${API_PREFIX}${path}`;
    return joinUrl(API_BASE, fullPath);
}

// WebSocket chỉ nhận ws:// hoặc wss://, nên phải đổi http(s):// -> ws(s)://
function toWebSocketUrl(url) {
    return String(url)
        .trim()
        .replace(/^https:\/\//i, "wss://")
        .replace(/^http:\/\//i, "ws://")
        .replace(/\/+$/, "");
}

function parseApiError(payload, fallback) {
    if (!payload) {
        return fallback;
    }

    const detail = payload.detail;
    if (typeof detail === "string") {
        return detail;
    }

    if (Array.isArray(detail) && detail.length) {
        return detail
            .map((item) => item.msg || item.message)
            .filter(Boolean)
            .join(". ") || fallback;
    }

    return payload.message || fallback;
}

const api = {
    async request(endpoint, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        const token = typeof getToken === "function" ? getToken() : localStorage.getItem("token");
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const { body, skipAuthRedirect, ...rest } = options;

        let response;
        try {
            response = await fetch(buildApiUrl(endpoint), {
                ...rest,
                headers,
                body: body && typeof body !== "string" ? JSON.stringify(body) : body,
            });
        } catch {
            // Lỗi mạng (fetch throw) - khác với lỗi HTTP 4xx/5xx từ backend trả về.
            // Đánh dấu để nơi gọi chỉ dùng fallback demo khi backend thực sự offline.
            const networkError = new Error("Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy.");
            networkError.isNetworkError = true;
            throw networkError;
        }

        if (response.status === 401) {
            if (typeof clearAuth === "function") {
                clearAuth();
            }
            if (!skipAuthRedirect && !location.pathname.endsWith("login.html")) {
                location.href = authPageHref("login.html");
            }
            const payload = await response.json().catch(() => null);
            throw new Error(parseApiError(payload, "Phiên đăng nhập đã hết hạn."));
        }

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(parseApiError(payload, "Yêu cầu không thành công."));
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    },

    get(endpoint, options) {
        return this.request(endpoint, options);
    },

    post(endpoint, body, options) {
        return this.request(endpoint, { method: "POST", body, ...options });
    },

    put(endpoint, body, options) {
        return this.request(endpoint, { method: "PUT", body, ...options });
    },

    patch(endpoint, body, options) {
        return this.request(endpoint, { method: "PATCH", body, ...options });
    },

    delete(endpoint, options) {
        return this.request(endpoint, { method: "DELETE", ...options });
    },

    wsUrl(path) {
        const token = typeof getToken === "function" ? getToken() : "";
        const wsPath = String(path).startsWith("/") ? String(path) : `/${path}`;
        const separator = wsPath.includes("?") ? "&" : "?";
        return `${toWebSocketUrl(WS_BASE)}${wsPath}${separator}token=${encodeURIComponent(token || "")}`;
    },
};

function showToast(message, type = "info", duration = 3200) {
    let host = document.getElementById("toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "toast-host";
        document.body.appendChild(host);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    host.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, duration);
}

function setLoading(show, message = "Đang xử lý...") {
    let overlay = document.getElementById("loading-overlay");
    if (show) {
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "loading-overlay";
            overlay.innerHTML = `<div class="loading-card">${message}</div>`;
            document.body.appendChild(overlay);
        } else {
            overlay.querySelector(".loading-card").textContent = message;
            overlay.hidden = false;
        }
        return;
    }

    if (overlay) {
        overlay.hidden = true;
    }
}
