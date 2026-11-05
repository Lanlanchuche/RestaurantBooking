// theme.js - Chuyển đổi giao diện sáng/tối, tono cam đồng nhất
(function () {
    const THEME_KEY = "selected-theme";
    const html = document.documentElement;
    const toggleBtn = document.querySelector(".theme-toggle");

    const ICON_SUN = "☀️";
    const ICON_MOON = "🌙";

    function getSavedTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch {
            return null;
        }
    }

    function applyTheme(theme) {
        if (theme === "dark") {
            html.setAttribute("data-theme", "dark");
            localStorage.setItem(THEME_KEY, "dark");
            if (toggleBtn) toggleBtn.textContent = ICON_SUN;
        } else {
            html.removeAttribute("data-theme");
            localStorage.setItem(THEME_KEY, "light");
            if (toggleBtn) toggleBtn.textContent = ICON_MOON;
        }
    }

    function initTheme() {
        const saved = getSavedTheme();
        // Mặc định là light nếu chưa lưu
        applyTheme(saved || "light");
    }

    function toggleTheme() {
        const isDark = html.hasAttribute("data-theme");
        applyTheme(isDark ? "light" : "dark");
    }

    if (toggleBtn) {
        toggleBtn.setAttribute("aria-label", "Chuyển đổi giao diện sáng/tối");
        toggleBtn.setAttribute("title", "Chuyển đổi giao diện sáng/tối");
        toggleBtn.addEventListener("click", toggleTheme);
    }

    // Khởi tạo khi DOM đã sẵn sàng
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTheme);
    } else {
        initTheme();
    }
})();
