const API_BASE = "http://localhost:8000/api";
const WS_BASE = "ws://localhost:8000";

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
            response = await fetch(`${API_BASE}${endpoint}`, {
                ...rest,
                headers,
                body: body && typeof body !== "string" ? JSON.stringify(body) : body,
            });
        } catch {
            throw new Error("Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy.");
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
        const separator = path.includes("?") ? "&" : "?";
        return `${WS_BASE}${path}${separator}token=${encodeURIComponent(token || "")}`;
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
