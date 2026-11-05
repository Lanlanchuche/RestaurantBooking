"""
email_service.py

Dịch vụ gửi email thông báo tự động.
Hỗ trợ gửi email bất đồng bộ thông qua ThreadPoolExecutor và smtplib,
định dạng HTML email với giao diện sáng (light theme) theo bảng màu
wine / gold / paper của TableReserve.

Cấu hình SMTP được đọc từ biến môi trường tại thời điểm gửi:
    SMTP_HOST (mặc định: smtp.gmail.com)
    SMTP_PORT (mặc định: 587)
    SMTP_USER
    SMTP_PASSWORD
    SMTP_USE_SSL (mặc định: false — dùng STARTTLS; bật cho cổng 465)
    SMTP_TIMEOUT (mặc định: 15 giây)
    SMTP_MAX_RETRIES (mặc định: 3 lần)
    SMTP_RETRY_DELAY (mặc định: 2 giây, tăng dần theo cấp số nhân)

Nếu chưa cấu hình SMTP_USER/SMTP_PASSWORD, email sẽ được in ra log ở mức
WARNING thay vì gửi thật để phục vụ phát triển.

Mỗi email được gửi dưới dạng multipart/alternative gồm bản text/plain và
text/html. Các lần gửi được đưa vào hàng đợi của ThreadPoolExecutor và tự
động thử lại khi SMTP gặp lỗi tạm thời.
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
import smtplib
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

# Việt Nam không có giờ mùa hè, dùng UTC+7 cố định để tránh phụ thuộc tzdata
# trên Windows (thư viện zoneinfo cần gói tzdata nếu hệ điều hành không có).
LOCAL_TIMEZONE = timezone(timedelta(hours=7))

DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = 587
DEFAULT_SMTP_TIMEOUT_SECONDS = 15
DEFAULT_SMTP_MAX_RETRIES = 3
DEFAULT_SMTP_RETRY_DELAY_SECONDS = 2.0


def _env_bool(name: str, default: bool = False) -> bool:
    """Đọc biến môi trường dạng boolean."""

    raw_value = os.getenv(name)

    if raw_value is None:
        return default

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _env_number(
    name: str,
    default,
    cast,
    minimum,
):
    """Đọc biến môi trường dạng số, có kiểm tra hợp lệ và giá trị tối thiểu."""

    raw_value = os.getenv(name)

    if raw_value is None or not raw_value.strip():
        return default

    try:
        value = cast(raw_value.strip())
    except ValueError:
        logger.warning(
            "Biến %s=%r không hợp lệ, dùng mặc định %s.",
            name,
            raw_value,
            default,
        )
        return default

    return max(minimum, value)


def _smtp_config() -> dict:
    """Đọc cấu hình SMTP từ biến môi trường tại thời điểm gửi."""

    host = (os.getenv("SMTP_HOST") or DEFAULT_SMTP_HOST).strip()

    return {
        "host": host or DEFAULT_SMTP_HOST,
        "port": _env_number(
            "SMTP_PORT",
            DEFAULT_SMTP_PORT,
            int,
            1,
        ),
        "user": (os.getenv("SMTP_USER") or "").strip(),
        "password": os.getenv("SMTP_PASSWORD") or "",
        "use_ssl": _env_bool("SMTP_USE_SSL"),
        "timeout": _env_number(
            "SMTP_TIMEOUT",
            float(DEFAULT_SMTP_TIMEOUT_SECONDS),
            float,
            1.0,
        ),
        "max_retries": _env_number(
            "SMTP_MAX_RETRIES",
            DEFAULT_SMTP_MAX_RETRIES,
            int,
            1,
        ),
        "retry_delay": _env_number(
            "SMTP_RETRY_DELAY",
            DEFAULT_SMTP_RETRY_DELAY_SECONDS,
            float,
            0.0,
        ),
    }


class _HTMLToTextParser(HTMLParser):
    """
    Chuyển HTML email sang text/plain.

    Bỏ qua nội dung <style>/<script>/<head> và biến các thẻ block
    (div, p, h2, br...) thành dấu xuống dòng để bản text vẫn dễ đọc.
    """

    BLOCK_TAGS = {"div", "p", "h2", "h3", "br", "li", "tr"}
    SKIP_TAGS = {"style", "script", "head", "title"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return

        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return

        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return

        text = data.strip()

        if text:
            self._parts.append(text + " ")

    def get_text(self) -> str:
        raw_text = "".join(self._parts)

        lines = [line.strip() for line in raw_text.splitlines()]

        result: list[str] = []

        for line in lines:
            if line:
                result.append(line)
            elif result and result[-1] != "":
                # Chỉ giữ tối đa một dòng trống giữa các đoạn.
                result.append("")

        return "\n".join(result).strip()


def _html_to_text(html_content: str) -> str:
    """Tạo bản text/plain từ nội dung HTML của email."""

    parser = _HTMLToTextParser()

    try:
        parser.feed(html_content)
        parser.close()
        return parser.get_text()
    except Exception:
        logger.exception("Không thể chuyển HTML email sang text/plain.")
        return ""


class EmailService:
    """
    Lớp cung cấp các tiện ích xử lý và gửi email thông báo.
    """

    def __init__(self):
        """Khởi tạo pool thread để gửi email bất đồng bộ không làm block (nghẽn) event loop."""

        self.executor = ThreadPoolExecutor(max_workers=5)
        self._shutdown = False

    def _ensure_executor(self) -> None:
        """Tạo lại thread pool nếu service đã bị shutdown (ví dụ app khởi động lại)."""

        if self._shutdown:
            self.executor = ThreadPoolExecutor(max_workers=5)
            self._shutdown = False

    # ------------------------------------------------------------------
    # FORMATTING HELPERS
    # ------------------------------------------------------------------

    @staticmethod
    def _escape(value) -> str:
        """Escape dữ liệu người dùng trước khi chèn vào HTML."""

        return html.escape(str(value))

    @staticmethod
    def _format_datetime(value: datetime | None) -> str:
        """
        Format thời gian từ UTC (naive) sang giờ Việt Nam (UTC+7).

        Database lưu datetime naive theo UTC, nên cần gắn timezone UTC
        trước khi đổi sang giờ địa phương.
        """

        if value is None:
            return "—"

        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.astimezone(LOCAL_TIMEZONE).strftime("%d/%m/%Y %H:%M")

    def _base_html(self, title: str, body: str) -> str:
        """
        Khung HTML email giao diện sáng (light theme).

        Dùng bảng (table) và style inline thay vì CSS class vì nhiều ứng dụng
        email (Gmail, Outlook) loại bỏ thẻ <style> trong <head>.
        """

        return f"""
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>{self._escape(title)}</title>
        </head>
        <body style="margin:0; padding:0; background-color:#f4efe7;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="width:100%; background-color:#f4efe7; padding:28px 12px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                               style="width:100%; max-width:600px; background-color:#ffffff;
                                      border:1px solid #eadfd2; border-radius:16px;
                                      overflow:hidden;">
                            <tr>
                                <td style="height:6px; background-color:#7c2d2d; line-height:6px; font-size:0;">
                                    &nbsp;
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:28px 32px 6px;">
                                    <div style="font-family:'Segoe UI',Arial,sans-serif; font-size:11px;
                                                font-weight:700; letter-spacing:0.16em;
                                                text-transform:uppercase; color:#b08d57;">
                                        TableReserve
                                    </div>
                                    <h2 style="margin:10px 0 0; font-family:Georgia,'Times New Roman',serif;
                                               font-size:23px; line-height:1.35; color:#7c2d2d;">
                                        {self._escape(title)}
                                    </h2>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:18px 32px 10px;
                                           font-family:'Segoe UI',Arial,sans-serif;
                                           font-size:15px; line-height:1.65; color:#2b211c;">
                                    {body}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:6px 32px 28px;">
                                    <div style="border-top:1px solid #f0e7dc; padding-top:16px;
                                                font-family:'Segoe UI',Arial,sans-serif; font-size:12px;
                                                line-height:1.6; color:#a1958a; text-align:center;">
                                        &copy; TableReserve &mdash; Smart Restaurant Booking
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

    def _row(self, label: str, value) -> str:
        """
        Một dòng thông tin dạng nhãn — giá trị.

        Dùng <table> lồng nhau để hiển thị ổn định trên mọi ứng dụng email,
        đồng thời giữ nội dung text/plain là "Nhãn: Giá trị" trên cùng dòng.
        """

        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'border="0" style="width:100%; border-collapse:collapse;">'
            "<tr>"
            '<td style="padding:10px 0; border-bottom:1px solid #f0e7dc; '
            "font-family:'Segoe UI',Arial,sans-serif; font-size:14px; font-weight:600; "
            'color:#8a7f76; width:42%; vertical-align:top;">'
            f"{self._escape(label)}:"
            "</td>"
            '<td style="padding:10px 0; border-bottom:1px solid #f0e7dc; '
            "font-family:'Segoe UI',Arial,sans-serif; font-size:14px; "
            'color:#2b211c; vertical-align:top;">'
            f"{self._escape(value)}"
            "</td>"
            "</tr>"
            "</table>"
        )

    def _branch_rows(self, branch) -> str:
        """Thông tin chi nhánh để khách hàng dễ tìm đường/liên hệ."""

        rows = self._row("Nhà hàng", branch.name)

        if getattr(branch, "address", None):
            rows += self._row("Địa chỉ", branch.address)

        if getattr(branch, "phone", None):
            rows += self._row("Điện thoại", branch.phone)

        return rows

    def _table_row(self, reservation) -> str:
        """Hiển thị số bàn, tránh trường hợp table_number = None."""

        if reservation.table_number:
            return self._row("Số bàn", f"#{reservation.table_number}")

        return self._row("Số bàn", "Nhà hàng sẽ sắp xếp khi xác nhận")

    @staticmethod
    def _customer_email(customer) -> str | None:
        """Lấy email của khách hàng từ quan hệ customer.user."""

        try:
            return getattr(getattr(customer, "user", None), "email", None)
        except Exception:
            logger.exception(
                "Không đọc được email của customer %s.",
                getattr(customer, "id", None),
            )
            return None

    @staticmethod
    def _restaurant_email(branch) -> str | None:
        """Lấy email chủ nhà hàng từ quan hệ branch.restaurant.owner."""

        try:
            return getattr(
                getattr(getattr(branch, "restaurant", None), "owner", None),
                "email",
                None,
            )
        except Exception:
            logger.exception(
                "Không đọc được email chủ nhà hàng của branch %s.",
                getattr(branch, "id", None),
            )
            return None

    # ------------------------------------------------------------------
    # SENDING
    # ------------------------------------------------------------------

    def _send_sync(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> None:
        """
        Gửi email đồng bộ (được chạy trong ThreadPoolExecutor).

        Tự động thử lại tối đa SMTP_MAX_RETRIES lần với thời gian chờ
        tăng dần (SMTP_RETRY_DELAY, nhân đôi sau mỗi lần lỗi).
        """

        config = _smtp_config()

        # Chặn header injection qua subject/địa chỉ người nhận.
        to_email = to_email.strip()
        subject = " ".join(str(subject).splitlines()).strip()

        if text_content is None:
            text_content = _html_to_text(html_content)

        if not config["user"] or not config["password"]:
            logger.warning(
                "\n[MOCK EMAIL] To: %s\n[Subject]: %s\n[Body]:\n%s\n",
                to_email,
                subject,
                text_content or html_content,
            )
            return

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"TableReserve <{config['user']}>"
        message["To"] = to_email

        # Thứ tự part: text trước, HTML sau (HTML là bản ưu tiên hiển thị).
        if text_content:
            message.attach(MIMEText(text_content, "plain", "utf-8"))

        message.attach(MIMEText(html_content, "html", "utf-8"))

        max_retries = config["max_retries"]

        for attempt in range(1, max_retries + 1):
            try:
                if config["use_ssl"]:
                    client = smtplib.SMTP_SSL(
                        config["host"],
                        config["port"],
                        timeout=config["timeout"],
                    )
                else:
                    client = smtplib.SMTP(
                        config["host"],
                        config["port"],
                        timeout=config["timeout"],
                    )

                with client:
                    if not config["use_ssl"]:
                        client.starttls()

                    client.login(config["user"], config["password"])
                    client.send_message(message)

                logger.info("Đã gửi email tới %s (%s).", to_email, subject)
                return

            except Exception as exc:
                if attempt >= max_retries:
                    logger.exception(
                        "Gửi email tới %s thất bại sau %s lần thử.",
                        to_email,
                        max_retries,
                    )
                    return

                delay = config["retry_delay"] * (2 ** (attempt - 1))

                logger.warning(
                    "Gửi email tới %s thất bại (lần %s/%s): %s. "
                    "Thử lại sau %.1f giây.",
                    to_email,
                    attempt,
                    max_retries,
                    exc,
                    delay,
                )

                time.sleep(delay)

    async def _send(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> None:
        if text_content is None:
            text_content = _html_to_text(html_content)

        self._ensure_executor()

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            self.executor,
            self._send_sync,
            to_email,
            subject,
            html_content,
            text_content,
        )

    def shutdown(self) -> None:
        """Dừng thread pool và đợi các email đang gửi hoàn tất."""

        if self._shutdown:
            return

        self.executor.shutdown(wait=True)
        self._shutdown = True

    # ------------------------------------------------------------------
    # EMAIL TEMPLATES
    # ------------------------------------------------------------------

    async def send_booking_received(self, customer, branch, reservation):
        """
        Gửi thông báo có đơn đặt bàn mới (trạng thái PENDING) tới cả khách hàng và nhà hàng.

        Args:
            customer: Người dùng (khách hàng) thực hiện đặt bàn.
            branch: Chi nhánh nhà hàng được đặt.
            reservation: Đơn đặt bàn.
        """

        customer_email = self._customer_email(customer)
        restaurant_email = self._restaurant_email(branch)

        booking_rows = (
            self._row("Mã đặt bàn", f"#{reservation.id}")
            + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
            + self._row("Số khách", str(reservation.guest_count))
        )

        if reservation.special_request:
            booking_rows += self._row("Yêu cầu đặc biệt", reservation.special_request)

        if customer_email:
            body_customer = self._base_html(
                "Đã nhận yêu cầu đặt bàn",
                f"<p>Chào {self._escape(customer.full_name)}, "
                "yêu cầu đặt bàn của bạn đang chờ nhà hàng xác nhận.</p>"
                + self._branch_rows(branch)
                + booking_rows
                + self._row("Trạng thái", "⏳ Đang chờ xác nhận"),
            )

            await self._send(
                customer_email,
                f"Đã nhận yêu cầu đặt bàn: {branch.name} - #{reservation.id}",
                body_customer,
            )
        else:
            logger.warning(
                "Bỏ qua email đặt bàn cho khách: customer %s không có email.",
                getattr(customer, "id", None),
            )

        if restaurant_email:
            body_restaurant = self._base_html(
                "Có đặt bàn mới cần xác nhận",
                f"<p>Khách hàng {self._escape(customer.full_name)} "
                "vừa gửi yêu cầu đặt bàn.</p>"
                + booking_rows
                + self._row("Khách hàng", customer.full_name)
                + self._row("Điện thoại", customer.phone or "—")
                + self._row("Email khách", customer_email or "—"),
            )

            await self._send(
                restaurant_email,
                f"Đơn đặt bàn mới cần xác nhận: {branch.name} - #{reservation.id}",
                body_restaurant,
            )
        else:
            logger.warning(
                "Bỏ qua email thông báo cho nhà hàng: branch %s không có email chủ sở hữu.",
                getattr(branch, "id", None),
            )

    async def send_confirmed(self, customer, branch, reservation):
        """
        Gửi thông báo xác nhận đặt bàn thành công tới khách hàng (trạng thái CONFIRMED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn đã được xác nhận.
        """

        customer_email = self._customer_email(customer)

        if not customer_email:
            logger.warning(
                "Bỏ qua email xác nhận: customer %s không có email.",
                getattr(customer, "id", None),
            )
            return

        subject = f"Đã xác nhận đặt bàn: {branch.name} - #{reservation.id}"

        body = self._base_html(
            "Đặt bàn của bạn đã được xác nhận",
            f"<p>Chào {self._escape(customer.full_name)}, "
            "nhà hàng đã xác nhận đơn đặt bàn của bạn.</p>"
            + self._branch_rows(branch)
            + self._row("Mã đặt bàn", f"#{reservation.id}")
            + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
            + self._row("Số khách", str(reservation.guest_count))
            + self._table_row(reservation)
            + self._row("Trạng thái", "✅ Đã xác nhận"),
        )

        await self._send(customer_email, subject, body)

    async def send_rejected(self, customer, branch, reservation, reason: str):
        """
        Gửi thông báo nhà hàng từ chối đặt bàn tới khách hàng (trạng thái REJECTED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn bị từ chối.
            reason (str): Lý do nhà hàng từ chối.
        """

        customer_email = self._customer_email(customer)

        if not customer_email:
            logger.warning(
                "Bỏ qua email từ chối: customer %s không có email.",
                getattr(customer, "id", None),
            )
            return

        subject = f"Từ chối đặt bàn: {branch.name} - #{reservation.id}"

        body = self._base_html(
            "Đặt bàn của bạn bị từ chối",
            f"<p>Chào {self._escape(customer.full_name)}, "
            "rất tiếc nhà hàng không thể nhận đơn đặt bàn của bạn lúc này.</p>"
            + self._branch_rows(branch)
            + self._row("Mã đặt bàn", f"#{reservation.id}")
            + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
            + self._row("Lý do từ chối", reason)
            + self._row("Trạng thái", "❌ Đã từ chối"),
        )

        await self._send(customer_email, subject, body)

    async def send_cancelled(self, customer, branch, reservation):
        """
        Gửi thông báo khách hàng hủy đơn tới cả hai bên (trạng thái CANCELLED).

        Args:
            customer: Người dùng (khách hàng) đã hủy bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn bị hủy.
        """

        customer_email = self._customer_email(customer)
        restaurant_email = self._restaurant_email(branch)

        if customer_email:
            body_customer = self._base_html(
                "Đặt bàn đã được hủy",
                f"<p>Chào {self._escape(customer.full_name)}, "
                f"đơn đặt bàn #{reservation.id} tại "
                f"{self._escape(branch.name)} đã được hủy.</p>"
                + self._branch_rows(branch)
                + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
                + self._row("Trạng thái", "🚫 Đã hủy"),
            )

            await self._send(
                customer_email,
                f"Đã hủy đặt bàn: {branch.name} - #{reservation.id}",
                body_customer,
            )
        else:
            logger.warning(
                "Bỏ qua email hủy cho khách: customer %s không có email.",
                getattr(customer, "id", None),
            )

        if restaurant_email:
            body_restaurant = self._base_html(
                "Khách hàng đã hủy đặt bàn",
                f"<p>Khách hàng {self._escape(customer.full_name)} "
                f"vừa hủy đơn đặt bàn #{reservation.id} tại "
                f"{self._escape(branch.name)}.</p>"
                + self._row("Mã đặt bàn", f"#{reservation.id}")
                + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
                + self._row("Khách hàng", customer.full_name)
                + self._row("Điện thoại", customer.phone or "—")
                + self._row("Email khách", customer_email or "—")
                + self._row("Trạng thái", "🚫 Đã hủy"),
            )

            await self._send(
                restaurant_email,
                f"Khách đã hủy đặt bàn: {branch.name} - #{reservation.id}",
                body_restaurant,
            )
        else:
            logger.warning(
                "Bỏ qua email hủy cho nhà hàng: branch %s không có email chủ sở hữu.",
                getattr(branch, "id", None),
            )


email_service = EmailService()
