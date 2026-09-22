function showLoginError(message) {
    const errorBox = document.getElementById("login-error");
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function hideLoginError() {
    const errorBox = document.getElementById("login-error");
    errorBox.hidden = true;
    errorBox.textContent = "";
}

document.addEventListener("DOMContentLoaded", () => {
    redirectIfLoggedIn();

    const form = document.getElementById("login-form");
    const submitBtn = document.getElementById("btn-login");
    const toggleBtn = document.getElementById("btn-toggle-password");
    const passwordInput = document.getElementById("password");

    toggleBtn.addEventListener("click", () => {
        const showPlain = passwordInput.type === "password";
        passwordInput.type = showPlain ? "text" : "password";
        toggleBtn.textContent = showPlain ? "Ẩn" : "Hiện";
        toggleBtn.setAttribute("aria-pressed", String(showPlain));
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideLoginError();

        const email = document.getElementById("email").value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showLoginError("Vui lòng nhập email và mật khẩu.");
            return;
        }

        submitBtn.disabled = true;
        setLoading(true, "Đang đăng nhập...");

        try {
            const data = await api.post("/auth/login", { email, password }, { skipAuthRedirect: true });
            const token = data.access_token;
            if (!token) {
                throw new Error("Máy chủ không trả về token.");
            }

            let user = data.user;
            setAuthData(token, user);

            if (!user) {
                user = await api.get("/auth/me", { skipAuthRedirect: true });
                setAuthData(token, user);
            }

            location.href = dashboardPathForRole(user?.role);
        } catch (err) {
            showLoginError(err.message || "Đăng nhập thất bại.");
        } finally {
            submitBtn.disabled = false;
            setLoading(false);
        }
    });
});
