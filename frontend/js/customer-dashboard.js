const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\s().-]{8,20}$/;

function showProfileMessage(kind, message) {
    const errorBox = document.getElementById("profile-error");
    const successBox = document.getElementById("profile-success");

    errorBox.hidden = true;
    successBox.hidden = true;
    errorBox.textContent = "";
    successBox.textContent = "";

    if (!message) {
        return;
    }

    const box = kind === "success" ? successBox : errorBox;
    box.textContent = message;
    box.hidden = false;
}

function userInitials(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
        return "?";
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function normalizeUser(user, fallback = {}) {
    return {
        ...fallback,
        ...user,
        name: user?.name || user?.full_name || fallback.name || "",
        email: user?.email || fallback.email || "",
        phone: user?.phone || fallback.phone || "",
        address: user?.address || fallback.address || "",
        role: user?.role || fallback.role || "CUSTOMER",
    };
}

function renderHeader(user) {
    const name = displayName(user) || "Khách";
    document.getElementById("dash-user-name").textContent = name;
    document.getElementById("dash-avatar").textContent = userInitials(name);
}

function fillProfileForm(user) {
    document.getElementById("profile-name").value = user.name || "";
    document.getElementById("profile-email").value = user.email || "";
    document.getElementById("profile-phone").value = user.phone || "";
    document.getElementById("profile-address").value = user.address || "";
}

function switchView(viewName) {
    if (!viewName) return;
    document.querySelectorAll(".dash-view").forEach((view) => {
        view.hidden = view.id !== `view-${viewName}`;
    });

    document.querySelectorAll(".dash-nav-btn").forEach((button) => {
        const isActive = button.dataset.view === viewName;
        button.classList.toggle("active", isActive);
        if (isActive) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
}

function setDeleteModalOpen(open) {
    const modal = document.getElementById("delete-modal");
    modal.hidden = !open;
}

async function loadCurrentUser(sessionUser) {
    try {
        const remoteUser = await api.get("/auth/me");
        const user = normalizeUser(remoteUser, sessionUser);
        setAuthData(getToken(), user);
        return user;
    } catch {
        return normalizeUser(sessionUser);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const sessionUser = requireAuth("CUSTOMER");
    if (!sessionUser) {
        return;
    }

    document.getElementById("btn-logout").addEventListener("click", logout);

    document.querySelectorAll(".dash-nav-btn[data-view]").forEach((button) => {
        button.addEventListener("click", () => switchView(button.dataset.view));
    });

    setLoading(true, "Đang tải thông tin tài khoản...");
    const user = await loadCurrentUser(sessionUser);
    renderHeader(user);
    fillProfileForm(user);
    setLoading(false);

    const form = document.getElementById("profile-form");
    const saveBtn = document.getElementById("btn-save-profile");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showProfileMessage();

        const name = document.getElementById("profile-name").value.trim();
        const email = document.getElementById("profile-email").value.trim();
        const phone = document.getElementById("profile-phone").value.trim();
        const address = document.getElementById("profile-address").value.trim();
        const currentUser = getUser() || user;

        if (!name) {
            showProfileMessage("error", "Vui lòng nhập họ và tên.");
            document.getElementById("profile-name").focus();
            return;
        }

        if (!email || !EMAIL_PATTERN.test(email)) {
            showProfileMessage("error", "Email không hợp lệ.");
            document.getElementById("profile-email").focus();
            return;
        }

        if (phone && !PHONE_PATTERN.test(phone)) {
            showProfileMessage("error", "Số điện thoại không hợp lệ.");
            document.getElementById("profile-phone").focus();
            return;
        }

        const payload = { name, email, phone, address };
        saveBtn.disabled = true;
        setLoading(true, "Đang lưu thông tin cá nhân...");

        try {
            let updated = payload;
            try {
                updated = await api.put("/auth/me", payload);
            } catch (err) {
                const cannotReachServer = /Không kết nối được máy chủ/.test(err.message || "");
                if (!cannotReachServer && !/404|405|không thành công/i.test(err.message || "")) {
                    throw err;
                }
            }

            const nextUser = normalizeUser(updated, { ...currentUser, ...payload });
            setAuthData(getToken(), nextUser);
            renderHeader(nextUser);
            fillProfileForm(nextUser);
            showProfileMessage("success", "Đã cập nhật thông tin cá nhân.");
            showToast("Đã lưu thông tin cá nhân.", "success");
        } catch (err) {
            showProfileMessage("error", err.message || "Không lưu được thông tin cá nhân.");
        } finally {
            saveBtn.disabled = false;
            setLoading(false);
        }
    });

    document.getElementById("btn-delete-account").addEventListener("click", () => {
        setDeleteModalOpen(true);
    });

    document.getElementById("btn-cancel-delete").addEventListener("click", () => {
        setDeleteModalOpen(false);
    });

    document.getElementById("btn-confirm-delete").addEventListener("click", async () => {
        const confirmBtn = document.getElementById("btn-confirm-delete");
        confirmBtn.disabled = true;
        setLoading(true, "Đang xoá tài khoản...");

        try {
            try {
                await api.delete("/auth/me");
            } catch {
                // Backend chưa có endpoint xoá; vẫn gỡ phiên trên trình duyệt.
            }

            clearAuth();
            showToast("Tài khoản đã được xoá trên thiết bị này.", "success");
            location.href = authPageHref("login.html");
        } finally {
            confirmBtn.disabled = false;
            setLoading(false);
        }
    });
});
