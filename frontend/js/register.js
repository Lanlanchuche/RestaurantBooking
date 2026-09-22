function showRegisterError(message) {
    const errorBox = document.getElementById("register-error");
    const successBox = document.getElementById("register-success");
    if (successBox) {
        successBox.hidden = true;
        successBox.textContent = "";
    }
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }
}

function hideRegisterError() {
    const errorBox = document.getElementById("register-error");
    if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = "";
    }
}

function showRegisterSuccess(message) {
    hideRegisterError();
    const successBox = document.getElementById("register-success");
    if (successBox) {
        successBox.textContent = message;
        successBox.hidden = false;
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

document.addEventListener("DOMContentLoaded", () => {
    // Chuyển hướng nếu người dùng đã đăng nhập từ trước
    if (typeof redirectIfLoggedIn === "function") {
        redirectIfLoggedIn();
    }

    const form = document.getElementById("register-form");
    const submitBtn = document.getElementById("btn-register");
    const roleInput = document.getElementById("selected-role");
    const roleBtnCustomer = document.getElementById("role-btn-customer");
    const roleBtnOwner = document.getElementById("role-btn-owner");
    const restaurantFields = document.getElementById("restaurant-fields");
    const restaurantNameInput = document.getElementById("restaurant-name");

    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirm-password");
    const togglePasswordBtn = document.getElementById("btn-toggle-password");
    const toggleConfirmBtn = document.getElementById("btn-toggle-confirm");

    // Toggle ẩn / hiện mật khẩu
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener("click", () => {
            const showPlain = passwordInput.type === "password";
            passwordInput.type = showPlain ? "text" : "password";
            togglePasswordBtn.textContent = showPlain ? "Ẩn" : "Hiện";
            togglePasswordBtn.setAttribute("aria-pressed", String(showPlain));
        });
    }

    if (toggleConfirmBtn && confirmPasswordInput) {
        toggleConfirmBtn.addEventListener("click", () => {
            const showPlain = confirmPasswordInput.type === "password";
            confirmPasswordInput.type = showPlain ? "text" : "password";
            toggleConfirmBtn.textContent = showPlain ? "Ẩn" : "Hiện";
            toggleConfirmBtn.setAttribute("aria-pressed", String(showPlain));
        });
    }

    // Chuyển đổi giữa 2 vai trò Khách hàng / Chủ nhà hàng
    function setRole(role) {
        roleInput.value = role;
        hideRegisterError();

        if (role === "RESTAURANT_OWNER") {
            roleBtnOwner.classList.add("active");
            roleBtnOwner.setAttribute("aria-selected", "true");
            roleBtnCustomer.classList.remove("active");
            roleBtnCustomer.setAttribute("aria-selected", "false");

            restaurantFields.hidden = false;
            restaurantNameInput.setAttribute("required", "required");
        } else {
            roleBtnCustomer.classList.add("active");
            roleBtnCustomer.setAttribute("aria-selected", "true");
            roleBtnOwner.classList.remove("active");
            roleBtnOwner.setAttribute("aria-selected", "false");

            restaurantFields.hidden = true;
            restaurantNameInput.removeAttribute("required");
        }
    }

    if (roleBtnCustomer) {
        roleBtnCustomer.addEventListener("click", () => setRole("CUSTOMER"));
    }

    if (roleBtnOwner) {
        roleBtnOwner.addEventListener("click", () => setRole("RESTAURANT_OWNER"));
    }

    // Xử lý gửi form đăng ký
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideRegisterError();

        const role = roleInput.value || "CUSTOMER";
        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validation client
        if (!name) {
            showRegisterError("Vui lòng nhập họ và tên của bạn.");
            document.getElementById("name").focus();
            return;
        }

        if (!email) {
            showRegisterError("Vui lòng nhập địa chỉ email.");
            document.getElementById("email").focus();
            return;
        }

        if (!isValidEmail(email)) {
            showRegisterError("Định dạng email không hợp lệ (ví dụ: ban@email.com).");
            document.getElementById("email").focus();
            return;
        }

        if (!password) {
            showRegisterError("Vui lòng nhập mật khẩu.");
            passwordInput.focus();
            return;
        }

        if (password.length < 6) {
            showRegisterError("Mật khẩu phải có độ dài tối thiểu 6 ký tự.");
            passwordInput.focus();
            return;
        }

        if (password !== confirmPassword) {
            showRegisterError("Xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại.");
            confirmPasswordInput.focus();
            return;
        }

        let restaurantName = "";
        let restaurantEmail = "";
        let restaurantPhone = "";

        if (role === "RESTAURANT_OWNER") {
            restaurantName = restaurantNameInput.value.trim();
            restaurantEmail = document.getElementById("restaurant-email").value.trim();
            restaurantPhone = document.getElementById("restaurant-phone").value.trim();

            if (!restaurantName) {
                showRegisterError("Vui lòng nhập tên nhà hàng của bạn.");
                restaurantNameInput.focus();
                return;
            }

            if (restaurantEmail && !isValidEmail(restaurantEmail)) {
                showRegisterError("Định dạng email nhà hàng không hợp lệ.");
                document.getElementById("restaurant-email").focus();
                return;
            }
        }

        // Tạo payload đăng ký
        const payload = {
            name,
            email,
            password,
            role,
        };

        if (role === "RESTAURANT_OWNER") {
            payload.restaurant_name = restaurantName;
            if (restaurantEmail) {
                payload.restaurant_email = restaurantEmail;
            }
            if (restaurantPhone) {
                payload.restaurant_phone = restaurantPhone;
            }
        }

        submitBtn.disabled = true;
        if (typeof setLoading === "function") {
            setLoading(true, "Đang xử lý đăng ký tài khoản...");
        }

        try {
            const data = await api.post("/auth/register", payload, { skipAuthRedirect: true });

            const token = data?.access_token;
            let user = data?.user || { name, email, role };

            if (token) {
                if (typeof setAuthData === "function") {
                    setAuthData(token, user);
                }
                showRegisterSuccess("Đăng ký thành công! Đang chuyển hướng...");
                if (typeof showToast === "function") {
                    showToast("Đăng ký thành công! Chào mừng bạn.", "success");
                }

                setTimeout(() => {
                    const nextUrl = typeof dashboardPathForRole === "function"
                        ? dashboardPathForRole(user?.role || role)
                        : (role === "RESTAURANT_OWNER" ? "restaurant/dashboard.html" : "customer/dashboard.html");
                    location.href = nextUrl;
                }, 1000);
            } else {
                // Trường hợp API tạo user nhưng yêu cầu đăng nhập
                showRegisterSuccess("Đăng ký tài khoản thành công! Đang chuyển đến trang đăng nhập...");
                if (typeof showToast === "function") {
                    showToast("Đăng ký thành công! Vui lòng đăng nhập.", "success");
                }
                setTimeout(() => {
                    location.href = "login.html";
                }, 1200);
            }
        } catch (err) {
            showRegisterError(err.message || "Đăng ký thất bại. Vui lòng thử lại sau.");
        } finally {
            submitBtn.disabled = false;
            if (typeof setLoading === "function") {
                setLoading(false);
            }
        }
    });
});
