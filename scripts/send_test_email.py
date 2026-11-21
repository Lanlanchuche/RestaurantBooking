"""Gửi email thử nghiệm bằng cấu hình email trong .env.

Hỗ trợ cả SMTP và HTTPS API (Resend / SendGrid / Brevo) tùy theo EMAIL_PROVIDER.

Cách dùng (chạy từ thư mục gốc dự án):
    python scripts/send_test_email.py nguoinhan@example.com
    python scripts/send_test_email.py khach@example.com nhahang@example.com

Nếu truyền 2 email, script gửi 2 lá thư (một cho khách hàng, một cho nhà hàng)
để kiểm tra cả hai luồng thông báo đều hoạt động.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Windows console mặc định có thể dùng cp1252, không in được tiếng Việt.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ".env")

from backend.services.email_service import email_service, _email_config

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    if len(sys.argv) not in (2, 3):
        print(
            "Cách dùng: "
            "python scripts/send_test_email.py <email_nguoi_nhan> "
            "[email_nha_hang]"
        )
        raise SystemExit(1)

    recipients = [arg.strip() for arg in sys.argv[1:]]
    config = _email_config()
    provider = config["provider"]

    if provider == "mock":
        print(
            "Chưa cấu hình email trong .env.\n"
            "Điền một trong hai cách sau rồi chạy lại script này:\n"
            "  - HTTPS API: EMAIL_PROVIDER=brevo|sendgrid|resend + API key + EMAIL_FROM\n"
            "  - SMTP: SMTP_USER/SMTP_PASSWORD (App Password của Gmail)\n"
            "Hiện tại hệ thống chạy chế độ mock (chỉ in email ra log)."
        )
        return

    if provider == "smtp":
        target = f"{config['smtp']['host']}:{config['smtp']['port']}"
    else:
        target = config["from"] or "(chưa đặt EMAIL_FROM)"

    labels = ["khách hàng", "nhà hàng"]

    for index, recipient in enumerate(recipients):
        label = labels[index] if index < len(labels) else f"người nhận {index + 1}"

        html_content = email_service._base_html(
            "Email thử nghiệm TableReserve",
            email_service._row("Vai trò", label)
            + email_service._row(
                "Trạng thái",
                "Cấu hình email đã được đọc thành công",
            )
            + email_service._row("Provider", provider)
            + email_service._row("Gửi từ", target),
        )

        print(f"Đang gửi email cho {label} tới {recipient} qua {provider} ({target}) ...")

        try:
            await email_service._send(
                recipient,
                f"TableReserve - Email thử nghiệm ({label})",
                html_content,
            )
        finally:
            email_service.shutdown()

    print("Đã chạy xong. Kiểm tra hộp thư (cả mục Spam) và log server.")


if __name__ == "__main__":
    asyncio.run(main())
