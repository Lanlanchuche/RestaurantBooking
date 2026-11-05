"""Gửi email thử nghiệm bằng cấu hình SMTP trong .env.

Cách dùng (chạy từ thư mục gốc dự án):
    .\\venv\\Scripts\\python.exe scripts\\send_test_email.py nguoinhan@example.com
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ".env")

from backend.services.email_service import email_service, _smtp_config


async def main() -> None:
    if len(sys.argv) != 2:
        print(
            "Cách dùng: "
            "python scripts/send_test_email.py <email_nguoi_nhan>"
        )
        raise SystemExit(1)

    recipient = sys.argv[1].strip()
    config = _smtp_config()

    if not config["user"] or not config["password"]:
        print(
            "Chưa cấu hình SMTP_USER/SMTP_PASSWORD trong .env.\n"
            "Hiện tại hệ thống đang ở chế độ mock (chỉ in email ra log).\n"
            "Hãy điền thông tin SMTP trong .env rồi chạy lại script này."
        )
        return

    html_content = email_service._base_html(
        "Email thử nghiệm TableReserve",
        email_service._row("Trạng thái", "SMTP đã được cấu hình thành công")
        + email_service._row(
            "SMTP host",
            f"{config['host']}:{config['port']}",
        ),
    )

    print(f"Đang gửi email tới {recipient} ...")

    try:
        await email_service._send(
            recipient,
            "TableReserve - Email thử nghiệm",
            html_content,
        )
    finally:
        email_service.shutdown()

    print("Đã chạy xong. Kiểm tra hộp thư (cả mục Spam) và log server.")


if __name__ == "__main__":
    asyncio.run(main())
