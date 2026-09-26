"""
email_service.py

Dịch vụ gửi email thông báo tự động.
Hỗ trợ gửi email bất đồng bộ thông qua ThreadPoolExecutor và smtplib,
định dạng HTML email với giao diện dark theme.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

class EmailService:
    """
    Lớp cung cấp các tiện ích xử lý và gửi email thông báo.
    """
    def __init__(self):
        """Khởi tạo pool thread để gửi email bất đồng bộ không làm block (nghẽn) event loop."""
        self.executor = ThreadPoolExecutor(max_workers=5)

    def _base_html(self, title: str, body: str) -> str:
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Inter', sans-serif; background-color: #070714; color: #e2e4f3; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #13132d; padding: 30px; border-radius: 14px; border: 1px solid rgba(124, 58, 237, 0.18); }}
                h2 {{ color: #06b6d4; }}
                .row {{ padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }}
                .label {{ font-weight: bold; color: #7c82a8; }}
                .footer {{ margin-top: 20px; font-size: 12px; color: #4a4f72; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>{title}</h2>
                {body}
                <div class="footer">
                    &copy; TableReserve — Smart Restaurant Booking
                </div>
            </div>
        </body>
        </html>
        """

    def _row(self, label: str, value: str) -> str:
        return f'<div class="row"><span class="label">{label}:</span> <span>{value}</span></div>'

    def _send_sync(self, to_email: str, subject: str, html_content: str):
        if not SMTP_USER or not SMTP_PASSWORD:
            logger.info(f"\\n[MOCK EMAIL] To: {to_email}\\n[Subject]: {subject}\\n[Body]:\\n{html_content}\\n")
            return
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"TableReserve <{SMTP_USER}>"
            msg["To"] = to_email

            part = MIMEText(html_content, "html")
            msg.attach(part)

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
            logger.info(f"Email sent to {to_email}")
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")

    async def _send(self, to_email: str, subject: str, html_content: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self._send_sync, to_email, subject, html_content)

    async def send_booking_received(self, customer, branch, reservation):
        """
        Gửi thông báo có đơn đặt bàn mới (trạng thái PENDING) tới cả khách hàng và nhà hàng.

        Args:
            customer: Người dùng (khách hàng) thực hiện đặt bàn.
            branch: Chi nhánh nhà hàng được đặt.
            reservation: Đơn đặt bàn.
        """
        subject = f"Đơn đặt bàn mới: {branch.name} - #{reservation.id}"
        
        body_customer = self._base_html(
            "Đã nhận yêu cầu đặt bàn",
            f"<p>Chào {customer.name}, yêu cầu đặt bàn của bạn đang chờ xác nhận.</p>" +
            self._row("Mã đặt bàn", f"#{reservation.id}") +
            self._row("Nhà hàng", branch.name) +
            self._row("Số khách", str(reservation.guest_count)) +
            self._row("Thời gian", str(reservation.reservation_time)) +
            self._row("Trạng thái", "⏳ Đang chờ xác nhận")
        )
        
        body_restaurant = self._base_html(
            "Có đặt bàn mới cần xác nhận",
            f"<p>Khách hàng {customer.name} vừa đặt bàn.</p>" +
            self._row("Mã đặt bàn", f"#{reservation.id}") +
            self._row("Email khách", customer.email) +
            self._row("Số khách", str(reservation.guest_count)) +
            self._row("Thời gian", str(reservation.reservation_time))
        )
        
        await self._send(customer.email, subject, body_customer)
        if branch.restaurant and branch.restaurant.email:
            await self._send(branch.restaurant.email, subject, body_restaurant)

    async def send_confirmed(self, customer, branch, reservation):
        """
        Gửi thông báo xác nhận đặt bàn thành công tới khách hàng (trạng thái CONFIRMED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn đã được xác nhận.
        """
        subject = f"Đã xác nhận đặt bàn: {branch.name} - #{reservation.id}"
        body = self._base_html(
            "Đặt bàn của bạn đã được xác nhận",
            f"<p>Chào {customer.name}, nhà hàng đã xác nhận đơn đặt bàn của bạn.</p>" +
            self._row("Mã đặt bàn", f"#{reservation.id}") +
            self._row("Nhà hàng", branch.name) +
            self._row("Thời gian", str(reservation.reservation_time)) +
            self._row("Số bàn", f"#{reservation.table_number}") +
            self._row("Trạng thái", "✅ Đã xác nhận")
        )
        await self._send(customer.email, subject, body)

    async def send_rejected(self, customer, branch, reservation, reason: str):
        """
        Gửi thông báo nhà hàng từ chối đặt bàn tới khách hàng (trạng thái REJECTED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn bị từ chối.
            reason (str): Lý do nhà hàng từ chối.
        """
        subject = f"Từ chối đặt bàn: {branch.name} - #{reservation.id}"
        body = self._base_html(
            "Đặt bàn của bạn bị từ chối",
            f"<p>Chào {customer.name}, rất tiếc nhà hàng không thể nhận đơn đặt bàn của bạn lúc này.</p>" +
            self._row("Mã đặt bàn", f"#{reservation.id}") +
            self._row("Nhà hàng", branch.name) +
            self._row("Lý do từ chối", reason) +
            self._row("Trạng thái", "❌ Đã từ chối")
        )
        await self._send(customer.email, subject, body)

    async def send_cancelled(self, customer, branch, reservation):
        """
        Gửi thông báo khách hàng hủy đơn tới cả hai bên (trạng thái CANCELLED).

        Args:
            customer: Người dùng (khách hàng) đã hủy bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn bị hủy.
        """
        subject = f"Đã hủy đặt bàn: {branch.name} - #{reservation.id}"
        body = self._base_html(
            "Đặt bàn đã được hủy",
            f"<p>Đơn đặt bàn #{reservation.id} tại {branch.name} đã được hủy.</p>" +
            self._row("Trạng thái", "🚫 Đã hủy")
        )
        await self._send(customer.email, subject, body)
        if branch.restaurant and branch.restaurant.email:
            await self._send(branch.restaurant.email, subject, body)

email_service = EmailService()
