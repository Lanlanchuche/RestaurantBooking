"""
email_service.py

Dịch vụ gửi email thông báo tự động.
Hỗ trợ gửi email bất đồng bộ thông qua ThreadPoolExecutor, định dạng HTML
email với giao diện sáng (light theme) theo bảng màu wine / gold / paper
của TableReserve.

Hai cách gửi, chọn bằng EMAIL_PROVIDER (mặc định "auto"):

1. HTTPS API (khuyến nghị khi deploy lên PaaS — cổng 443 luôn mở):
       EMAIL_PROVIDER = resend | sendgrid | brevo
       RESEND_API_KEY / SENDGRID_API_KEY / BREVO_API_KEY
       EMAIL_FROM = "TableReserve <no-reply@domain-cua-ban>"

2. SMTP (chỉ dùng khi máy chủ cho phép cổng 25/465/587):
       SMTP_HOST (mặc định: smtp.gmail.com)
       SMTP_PORT (mặc định: 587)
       SMTP_USER
       SMTP_PASSWORD
       SMTP_USE_SSL (mặc định: false — dùng STARTTLS; bật cho cổng 465)
       SMTP_TIMEOUT (mặc định: 15 giây)
       SMTP_MAX_RETRIES (mặc định: 3 lần)
       SMTP_RETRY_DELAY (mặc định: 2 giây, tăng dần theo cấp số nhân)

Chế độ "auto": dùng API key HTTPS nếu có (resend → sendgrid → brevo),
sau đó mới đến SMTP nếu có SMTP_USER/SMTP_PASSWORD.

Nếu không cấu hình được cách nào, email sẽ được in ra log ở mức WARNING
thay vì gửi thật để phục vụ phát triển.

Lưu ý triển khai: Render chặn outbound tới cổng 25/465/587 với web service
gói Free (từ 26/09/2025), nên Gmail SMTP chỉ gửi được khi nâng lên gói trả
phí hoặc chuyển sang EMAIL_PROVIDER dùng HTTPS API.

Mỗi email được gửi dưới dạng multipart/alternative gồm bản text/plain và
text/html. Các lần gửi được đưa vào hàng đợi của ThreadPoolExecutor và tự
động thử lại khi SMTP gặp lỗi tạm thời.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import smtplib
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
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

DEFAULT_FROM_NAME = "TableReserve"

# Các nhà cung cấp gửi email qua HTTPS API (không dùng cổng SMTP).
HTTP_PROVIDERS = ("resend", "sendgrid", "brevo")

HTTP_API_ENDPOINTS = {
    "resend": "https://api.resend.com/emails",
    "sendgrid": "https://api.sendgrid.com/v3/mail/send",
    "brevo": "https://api.brevo.com/v3/smtp/email",
}

API_KEY_ENV = {
    "resend": "RESEND_API_KEY",
    "sendgrid": "SENDGRID_API_KEY",
    "brevo": "BREVO_API_KEY",
}


class EmailDeliveryError(Exception):
    """Lỗi trả về từ HTTPS API của nhà cung cấp email."""

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        self.retryable = status_code == 429 or status_code >= 500
        super().__init__(f"HTTP {status_code}: {body[:300]}")


class EmailConfigError(Exception):
    """Cấu hình email thiếu hoặc sai — không thử lại vì không thể tự khỏi."""

    retryable = False


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


def _from_address() -> str:
    """Địa chỉ gửi hiển thị trên email, ưu tiên EMAIL_FROM rồi tới SMTP_USER."""

    explicit = (os.getenv("EMAIL_FROM") or "").strip()

    if explicit:
        return explicit

    smtp_user = (os.getenv("SMTP_USER") or "").strip()

    if smtp_user:
        return f"{DEFAULT_FROM_NAME} <{smtp_user}>"

    return ""


def _api_key_for(provider: str) -> str:
    """Đọc API key tương ứng với nhà cung cấp HTTPS."""

    return (os.getenv(API_KEY_ENV.get(provider, "")) or "").strip()


def _resolve_provider() -> str:
    """
    Xác định cách gửi email.

    Giá trị EMAIL_PROVIDER hợp lệ: auto, smtp, resend, sendgrid, brevo, mock.
    Chế độ auto ưu tiên HTTPS API (không bị chặn cổng khi deploy), sau đó SMTP,
    cuối cùng là mock (chỉ ghi log).
    """

    raw_value = (os.getenv("EMAIL_PROVIDER") or "auto").strip().lower()

    if raw_value in HTTP_PROVIDERS:
        if _api_key_for(raw_value):
            return raw_value

        logger.warning(
            "EMAIL_PROVIDER=%s nhưng thiếu %s, chuyển sang chế độ auto.",
            raw_value,
            API_KEY_ENV[raw_value],
        )
    elif raw_value == "smtp":
        smtp = _smtp_config()

        if smtp["user"] and smtp["password"]:
            return "smtp"

        logger.warning(
            "EMAIL_PROVIDER=smtp nhưng thiếu SMTP_USER/SMTP_PASSWORD, "
            "chuyển sang mock mode."
        )
        return "mock"
    elif raw_value == "mock":
        return "mock"
    elif raw_value not in {"", "auto"}:
        logger.warning(
            "EMAIL_PROVIDER=%r không hợp lệ, dùng chế độ auto.",
            raw_value,
        )

    for provider in HTTP_PROVIDERS:
        if _api_key_for(provider):
            return provider

    smtp = _smtp_config()

    if smtp["user"] and smtp["password"]:
        return "smtp"

    return "mock"


def _email_config() -> dict:
    """Cấu hình gửi email dùng chung cho SMTP và HTTPS API."""

    smtp = _smtp_config()
    provider = _resolve_provider()

    return {
        "provider": provider,
        "api_key": _api_key_for(provider) if provider in HTTP_PROVIDERS else "",
        "from": _from_address(),
        "timeout": _env_number(
            "EMAIL_TIMEOUT",
            smtp["timeout"],
            float,
            1.0,
        ),
        "max_retries": _env_number(
            "EMAIL_MAX_RETRIES",
            smtp["max_retries"],
            int,
            1,
        ),
        "retry_delay": _env_number(
            "EMAIL_RETRY_DELAY",
            smtp["retry_delay"],
            float,
            0.0,
        ),
        "smtp": smtp,
    }


def _post_json(url: str, headers: dict, payload: dict, timeout: float) -> None:
    """POST JSON tới API của nhà cung cấp, raise EmailDeliveryError khi lỗi."""

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read()

            if not 200 <= response.status < 300:
                raise EmailDeliveryError(response.status, "")

    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", "replace")
        raise EmailDeliveryError(exc.code, error_body) from exc


def _send_via_http(
    provider: str,
    config: dict,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
) -> None:
    """Gửi email qua HTTPS API (Resend / SendGrid / Brevo)."""

    if not config["api_key"]:
        raise EmailConfigError(
            f"Thiếu {API_KEY_ENV[provider]} cho EMAIL_PROVIDER={provider}."
        )

    if not config["from"]:
        raise EmailConfigError(
            "Thiếu EMAIL_FROM (địa chỉ gửi đã xác thực ở nhà cung cấp email)."
        )

    from_name, from_email = parseaddr(config["from"])

    if not from_email:
        from_email = config["from"]
        from_name = DEFAULT_FROM_NAME

    url = HTTP_API_ENDPOINTS[provider]

    if provider == "resend":
        headers = {"Authorization": f"Bearer {config['api_key']}"}
        payload = {
            "from": config["from"],
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }

        if text_content:
            payload["text"] = text_content

    elif provider == "sendgrid":
        headers = {"Authorization": f"Bearer {config['api_key']}"}
        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {
                "email": from_email,
                "name": from_name or DEFAULT_FROM_NAME,
            },
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text_content or subject},
                {"type": "text/html", "value": html_content},
            ],
        }

    else:  # brevo
        headers = {"api-key": config["api_key"], "accept": "application/json"}
        payload = {
            "sender": {
                "email": from_email,
                "name": from_name or DEFAULT_FROM_NAME,
            },
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html_content,
        }

        if text_content:
            payload["textContent"] = text_content

    _post_json(url, headers, payload, config["timeout"])


def log_email_status() -> None:
    """Ghi log cách gửi email đang dùng để dễ chẩn đoán khi deploy."""

    config = _email_config()
    provider = config["provider"]
    running_on_render = bool(os.getenv("RENDER"))

    if provider == "mock":
        logger.warning(
            "Chưa cấu hình email: cần đặt %s hoặc SMTP_USER/SMTP_PASSWORD. "
            "Email sẽ chỉ được in ra log (mock mode).",
            "/".join(API_KEY_ENV.values()),
        )
        return

    if provider == "smtp":
        logger.info(
            "Email provider: SMTP (%s:%s).",
            config["smtp"]["host"],
            config["smtp"]["port"],
        )

        if running_on_render:
            logger.warning(
                "Render chặn outbound tới cổng 25/465/587 trên gói Free, nên "
                "SMTP (cả 465 và 587) có thể timeout. Hãy đặt "
                "EMAIL_PROVIDER=brevo|sendgrid|resend kèm API key, hoặc nâng "
                "lên gói trả phí."
            )
        return

    logger.info(
        "Email provider: %s (HTTPS API), gửi từ %s.",
        provider,
        config["from"] or "(chưa đặt EMAIL_FROM)",
    )


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

    def _deliver_smtp(
        self,
        config: dict,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str,
    ) -> None:
        """Gửi một email qua SMTP (chạy trong thread riêng)."""

        smtp = config["smtp"]
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = config["from"] or f"{DEFAULT_FROM_NAME} <{smtp['user']}>"
        message["To"] = to_email

        # Thứ tự part: text trước, HTML sau (HTML là bản ưu tiên hiển thị).
        if text_content:
            message.attach(MIMEText(text_content, "plain", "utf-8"))

        message.attach(MIMEText(html_content, "html", "utf-8"))

        if smtp["use_ssl"]:
            client = smtplib.SMTP_SSL(
                smtp["host"],
                smtp["port"],
                timeout=config["timeout"],
            )
        else:
            client = smtplib.SMTP(
                smtp["host"],
                smtp["port"],
                timeout=config["timeout"],
            )

        with client:
            if not smtp["use_ssl"]:
                client.starttls()

            client.login(smtp["user"], smtp["password"])
            client.send_message(message)

    def _deliver(
        self,
        config: dict,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str,
    ) -> None:
        """Gửi một lần theo provider đã chọn."""

        provider = config["provider"]

        if provider == "smtp":
            self._deliver_smtp(
                config,
                to_email,
                subject,
                html_content,
                text_content,
            )
            return

        _send_via_http(
            provider,
            config,
            to_email,
            subject,
            html_content,
            text_content,
        )

    def _send_sync(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> None:
        """
        Gửi email đồng bộ (được chạy trong ThreadPoolExecutor).

        Provider được chọn theo EMAIL_PROVIDER (auto: HTTPS API → SMTP → mock).
        Tự động thử lại tối đa EMAIL_MAX_RETRIES lần với thời gian chờ tăng dần
        (EMAIL_RETRY_DELAY, nhân đôi sau mỗi lần lỗi). Chỉ thử lại với lỗi tạm
        thời (mạng, 429, 5xx); lỗi 4xx do cấu hình sai thì dừng ngay.
        """

        config = _email_config()

        # Chặn header injection qua subject/địa chỉ người nhận.
        to_email = to_email.strip()
        subject = " ".join(str(subject).splitlines()).strip()

        if text_content is None:
            text_content = _html_to_text(html_content)

        if config["provider"] == "mock":
            logger.warning(
                "\n[MOCK EMAIL] To: %s\n[Subject]: %s\n[Body]:\n%s\n",
                to_email,
                subject,
                text_content or html_content,
            )
            return

        max_retries = config["max_retries"]

        for attempt in range(1, max_retries + 1):
            try:
                self._deliver(
                    config,
                    to_email,
                    subject,
                    html_content,
                    text_content or "",
                )

                logger.info(
                    "Đã gửi email tới %s (%s) qua %s.",
                    to_email,
                    subject,
                    config["provider"],
                )
                return

            except Exception as exc:
                retryable = getattr(exc, "retryable", True)

                if not retryable or attempt >= max_retries:
                    logger.exception(
                        "Gửi email tới %s thất bại qua %s (%s/%s lần thử).",
                        to_email,
                        config["provider"],
                        attempt,
                        max_retries,
                    )
                    return

                delay = config["retry_delay"] * (2 ** (attempt - 1))

                logger.warning(
                    "Gửi email tới %s thất bại (lần %s/%s) qua %s: %s. "
                    "Thử lại sau %.1f giây.",
                    to_email,
                    attempt,
                    max_retries,
                    config["provider"],
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
        Gửi thông báo xác nhận đặt bàn tới cả khách hàng và nhà hàng
        (trạng thái CONFIRMED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn đã được xác nhận.
        """

        customer_email = self._customer_email(customer)
        restaurant_email = self._restaurant_email(branch)

        if not customer_email:
            logger.warning(
                "Bỏ qua email xác nhận cho khách: customer %s không có email.",
                getattr(customer, "id", None),
            )

        if customer_email:
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

        if restaurant_email:
            await self._send(
                restaurant_email,
                f"Đã xác nhận đơn đặt bàn #{reservation.id} - {branch.name}",
                self._base_html(
                    "Bạn đã xác nhận đơn đặt bàn",
                    f"<p>Đơn đặt bàn #{reservation.id} của khách "
                    f"{self._escape(customer.full_name)} đã được xác nhận.</p>"
                    + self._branch_rows(branch)
                    + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
                    + self._row("Số khách", str(reservation.guest_count))
                    + self._table_row(reservation)
                    + self._row("Khách hàng", customer.full_name)
                    + self._row("Điện thoại", customer.phone or "—")
                    + self._row("Trạng thái", "✅ Đã xác nhận"),
                ),
            )
        else:
            logger.warning(
                "Bỏ qua email xác nhận cho nhà hàng: branch %s không có email chủ sở hữu.",
                getattr(branch, "id", None),
            )

    async def send_rejected(self, customer, branch, reservation, reason: str):
        """
        Gửi thông báo từ chối đặt bàn tới cả khách hàng và nhà hàng
        (trạng thái REJECTED).

        Args:
            customer: Người dùng (khách hàng) đặt bàn.
            branch: Chi nhánh nhà hàng.
            reservation: Đơn đặt bàn bị từ chối.
            reason (str): Lý do nhà hàng từ chối.
        """

        customer_email = self._customer_email(customer)
        restaurant_email = self._restaurant_email(branch)

        if not customer_email:
            logger.warning(
                "Bỏ qua email từ chối cho khách: customer %s không có email.",
                getattr(customer, "id", None),
            )

        if customer_email:
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

        if restaurant_email:
            await self._send(
                restaurant_email,
                f"Đã từ chối đơn đặt bàn #{reservation.id} - {branch.name}",
                self._base_html(
                    "Bạn đã từ chối đơn đặt bàn",
                    f"<p>Đơn đặt bàn #{reservation.id} của khách "
                    f"{self._escape(customer.full_name)} đã bị từ chối. "
                    "Bàn đã được trả lại danh sách bàn trống.</p>"
                    + self._branch_rows(branch)
                    + self._row("Thời gian", self._format_datetime(reservation.reservation_time))
                    + self._row("Số khách", str(reservation.guest_count))
                    + self._row("Lý do từ chối", reason)
                    + self._row("Khách hàng", customer.full_name)
                    + self._row("Điện thoại", customer.phone or "—")
                    + self._row("Trạng thái", "❌ Đã từ chối"),
                ),
            )
        else:
            logger.warning(
                "Bỏ qua email từ chối cho nhà hàng: branch %s không có email chủ sở hữu.",
                getattr(branch, "id", None),
            )

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
