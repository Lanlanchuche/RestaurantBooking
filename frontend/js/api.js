// Địa chỉ backend khi deploy lên Render.
// API_BASE chỉ là host (không kèm /api): mọi nơi gọi api.get/post/... truyền
// endpoint không có prefix, vd. api.get("/customer/branches").
const API_BASE = "https://restaurantbooking-flx9.onrender.com";
const API_PREFIX = "/api";
// WS_BASE tự suy ra từ API_BASE (https -> wss) nên chỉ cần đổi API_BASE một lần.
// Render bắt buộc dùng wss:// cho websocket trên HTTPS.
const WS_BASE = toWebSocketUrl(API_BASE);

function joinUrl(base, path) {
    if (!path) {
        return base;
    }

    // Endpoint đã là URL tuyệt đối thì giữ nguyên.
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function buildApiUrl(endpoint) {
    return joinUrl(joinUrl(API_BASE, API_PREFIX), endpoint);
}

function toWebSocketUrl(url) {
    // http -> ws, https -> wss (Render bắt buộc dùng wss trên HTTPS).
    return url.replace(/^http/i, "ws");
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
        // Router WebSocket của backend nằm ở /ws/... (không có prefix /api).
        const base = WS_BASE || toWebSocketUrl(API_BASE);
        let url = joinUrl(base, path);

        // Đảm bảo luôn là ws:// hoặc wss:// cho new WebSocket(...).
        url = toWebSocketUrl(url);

        const token = typeof getToken === "function" ? getToken() : "";
        const separator = url.includes("?") ? "&" : "?";

        return `${url}${separator}token=${encodeURIComponent(token || "")}`;
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
