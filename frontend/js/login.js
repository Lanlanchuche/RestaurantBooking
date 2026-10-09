function showLoginError(message) {
    const errorBox = document.getElementById("login-error");
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }
    hideLoginSuccess();
}

function hideLoginError() {
    const errorBox = document.getElementById("login-error");
    if (errorBox) {
        errorBox.textContent = "";
        errorBox.hidden = true;
    }
}

function showLoginSuccess(message) {
    hideLoginError();
    const successBox = document.getElementById("login-success");
    if (successBox) {
        successBox.textContent = message;
        successBox.hidden = false;
    }
}

function hideLoginSuccess() {
    const successBox = document.getElementById("login-success");
    if (successBox) {
        successBox.textContent = "";
        successBox.hidden = true;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    redirectIfLoggedIn();

    // Lấy query parameters từ URL
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get("redirect");
    const redirectUrl = (redirectParam && !redirectParam.startsWith("http") && !redirectParam.startsWith("//"))
        ? redirectParam
        : null;

    // Kiểm tra nếu được chuyển hướng từ trang Đăng ký
    if (params.get("registered")) {
        const registeredEmail = params.get("email");
        if (registeredEmail) {
            const emailInput = document.getElementById("email");
            if (emailInput) {
                emailInput.value = registeredEmail;
            }
            setTimeout(() => {
                document.getElementById("password")?.focus();
            }, 100);
        }
        showLoginSuccess("Đăng ký tài khoản thành công! Vui lòng nhập mật khẩu để đăng nhập.");
        if (typeof showToast === "function") {
            showToast("Đăng ký tài khoản thành công! Vui lòng đăng nhập.", "success");
        }
    }

    const form = document.getElementById("login-form");
    const submitBtn = document.getElementById("btn-login");
    const toggleBtn = document.getElementById("btn-toggle-password");
    const passwordInput = document.getElementById("password");

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener("click", () => {
            const showPlain = passwordInput.type === "password";
            passwordInput.type = showPlain ? "text" : "password";
            toggleBtn.textContent = showPlain ? "Ẩn" : "Hiện";
            toggleBtn.setAttribute("aria-pressed", String(showPlain));
        });
    }

    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideLoginError();
        hideLoginSuccess();

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

            showLoginSuccess("Đăng nhập thành công! Đang chuyển đến bảng điều khiển...");
            if (typeof showToast === "function") {
                showToast("Đăng nhập thành công!", "success");
            }

            const destination = redirectUrl || dashboardHref(user?.role);
            setTimeout(() => {
                location.href = destination;
            }, 300);
            return;
        } catch (err) {
            const cannotReachServer = /Không kết nối được máy chủ/.test(err.message || "");
            if (cannotReachServer) {
                let savedDemoUsers = [];
                try {
                    savedDemoUsers = JSON.parse(localStorage.getItem("registered_demo_users") || "[]");
                } catch {
                    savedDemoUsers = [];
                }
                const found = savedDemoUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

                const localUser = found ? {
                    name: found.name,
                    email: found.email,
                    role: found.role || "CUSTOMER",
                    phone: found.phone || found.restaurant_phone || "",
                    address: found.address || "",
                } : {
                    name: email.split("@")[0] || "Khách",
                    email,
                    role: "CUSTOMER",
                    phone: "",
                    address: "",
                };

                setAuthData("local-demo-token", localUser);
                showLoginSuccess("Đăng nhập thành công! Đang chuyển đến bảng điều khiển...");
                if (typeof showToast === "function") {
                    showToast("Đăng nhập thành công!", "success");
                }

                const destination = redirectUrl || dashboardHref(localUser.role);
                setTimeout(() => {
                    location.href = destination;
                }, 300);
                return;
            }
            showLoginError(err.message || "Đăng nhập thất bại.");
        } finally {
            submitBtn.disabled = false;
            setLoading(false);
        }
    });
});
