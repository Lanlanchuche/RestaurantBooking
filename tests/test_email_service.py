"""Unit test cho backend/services/email_service.py.

Các test này không gửi email thật: SMTP được mock hoặc thay bằng fake client.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.services import email_service as email_module


# ----------------------------------------------------------------------
# HELPERS
# ----------------------------------------------------------------------


def make_customer(
    email: str = "customer@example.com",
    full_name: str = "Nguyễn Văn A",
    phone: str = "0901234567",
    customer_id: int = 1,
):
    return SimpleNamespace(
        id=customer_id,
        full_name=full_name,
        phone=phone,
        user=SimpleNamespace(email=email),
    )


def make_branch(
    owner_email: str = "owner@example.com",
    branch_id: int = 10,
    restaurant_id: int = 5,
):
    restaurant = SimpleNamespace(owner=SimpleNamespace(email=owner_email))

    return SimpleNamespace(
        id=branch_id,
        restaurant_id=restaurant_id,
        name="TableReserve Hà Nội",
        address="1 Tràng Tiền, Hà Nội",
        phone="024 1234 5678",
        restaurant=restaurant,
    )


def make_reservation(**overrides):
    data = {
        "id": 42,
        "table_number": 7,
        "guest_count": 4,
        # 10:00 UTC = 17:00 giờ Việt Nam.
        "reservation_time": datetime(2026, 1, 1, 10, 0, 0),
        "special_request": "Bàn gần cửa sổ",
        "status": "PENDING",
    }
    data.update(overrides)

    return SimpleNamespace(**data)


@pytest.fixture
def service():
    return email_module.email_service


@pytest.fixture
def sent_messages(monkeypatch, service):
    """Bắt các email thay vì gửi thật."""

    messages: list[dict] = []

    async def fake_send(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> None:
        messages.append(
            {
                "to": to_email,
                "subject": subject,
                "html": html_content,
                "text": text_content,
            }
        )

    monkeypatch.setattr(service, "_send", fake_send)

    return messages


# ----------------------------------------------------------------------
# FORMATTING
# ----------------------------------------------------------------------


def test_format_datetime_converts_utc_to_vietnam(service):
    assert (
        service._format_datetime(datetime(2026, 1, 1, 0, 0))
        == "01/01/2026 07:00"
    )
    assert (
        service._format_datetime(
            datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
        )
        == "01/01/2026 07:00"
    )
    assert service._format_datetime(None) == "—"


def test_row_escapes_user_content(service):
    row = service._row("Lý do", "<script>alert('x')</script>")

    assert "<script>" not in row
    assert "&lt;script&gt;" in row


def test_table_row_handles_missing_table_number(service):
    assert "#7" in service._table_row(make_reservation())
    assert "Nhà hàng sẽ sắp xếp khi xác nhận" in service._table_row(
        make_reservation(table_number=None)
    )


def test_html_to_text_removes_style_and_markup(service):
    html_content = service._base_html(
        "Tiêu đề",
        "<p>Xin chào</p>" + service._row("Nhà hàng", "ABC"),
    )

    text_content = email_module._html_to_text(html_content)

    assert "font-family" not in text_content
    assert "<p>" not in text_content
    assert "Tiêu đề" in text_content
    assert "Nhà hàng: ABC" in text_content


# ----------------------------------------------------------------------
# TEMPLATES & RECIPIENTS
# ----------------------------------------------------------------------


def test_send_booking_received_sends_to_customer_and_restaurant(
    service,
    sent_messages,
):
    asyncio.run(
        service.send_booking_received(
            make_customer(),
            make_branch(),
            make_reservation(),
        )
    )

    assert [message["to"] for message in sent_messages] == [
        "customer@example.com",
        "owner@example.com",
    ]

    customer_mail, restaurant_mail = sent_messages

    assert "Đã nhận yêu cầu đặt bàn" in customer_mail["subject"]
    assert "Đơn đặt bàn mới cần xác nhận" in restaurant_mail["subject"]
    assert "17:00" in customer_mail["html"]
    assert "1 Tràng Tiền" in customer_mail["html"]
    assert "Bàn gần cửa sổ" in restaurant_mail["html"]


def test_send_confirmed_handles_missing_table_number(service, sent_messages):
    asyncio.run(
        service.send_confirmed(
            make_customer(),
            make_branch(),
            make_reservation(table_number=None),
        )
    )

    assert len(sent_messages) == 1
    assert "Nhà hàng sẽ sắp xếp khi xác nhận" in sent_messages[0]["html"]
    assert "Đã xác nhận" in sent_messages[0]["html"]


def test_send_rejected_escapes_reason(service, sent_messages):
    asyncio.run(
        service.send_rejected(
            make_customer(),
            make_branch(),
            make_reservation(),
            "<b>Hết bàn</b>",
        )
    )

    assert len(sent_messages) == 1
    assert "&lt;b&gt;Hết bàn&lt;/b&gt;" in sent_messages[0]["html"]


def test_send_cancelled_sends_distinct_emails(service, sent_messages):
    asyncio.run(
        service.send_cancelled(
            make_customer(),
            make_branch(),
            make_reservation(),
        )
    )

    assert len(sent_messages) == 2
    assert "Đã hủy đặt bàn" in sent_messages[0]["subject"]
    assert "Khách đã hủy đặt bàn" in sent_messages[1]["subject"]
    assert "Khách hàng đã hủy" in sent_messages[1]["html"]


# ----------------------------------------------------------------------
# SMTP CONFIG / MOCK / RETRY / PLAIN TEXT
# ----------------------------------------------------------------------


def test_smtp_config_falls_back_on_invalid_values(monkeypatch):
    monkeypatch.setenv("SMTP_PORT", "abc")
    monkeypatch.setenv("SMTP_TIMEOUT", "xyz")
    monkeypatch.setenv("SMTP_MAX_RETRIES", "0")

    config = email_module._smtp_config()

    assert config["port"] == email_module.DEFAULT_SMTP_PORT
    assert config["timeout"] == float(
        email_module.DEFAULT_SMTP_TIMEOUT_SECONDS
    )
    # Số lần thử luôn tối thiểu là 1.
    assert config["max_retries"] == 1


def test_send_sync_uses_mock_when_smtp_not_configured(
    monkeypatch,
    caplog,
):
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)

    with caplog.at_level(
        logging.WARNING,
        logger="backend.services.email_service",
    ):
        email_module.email_service._send_sync(
            "customer@example.com",
            "Subject",
            "<p>Xin chào</p>",
            "Xin chào",
        )

    assert "[MOCK EMAIL]" in caplog.text
    assert "Xin chào" in caplog.text


def test_send_sync_retries_on_transient_failure(monkeypatch, caplog):
    monkeypatch.setenv("SMTP_USER", "user@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_USE_SSL", "false")
    monkeypatch.setenv("SMTP_MAX_RETRIES", "3")
    monkeypatch.setenv("SMTP_RETRY_DELAY", "0")

    state = {"attempts": 0}

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            pass

        def login(self, *args):
            pass

        def send_message(self, message):
            state["attempts"] += 1

            if state["attempts"] < 3:
                raise OSError("temporary failure")

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)

    with caplog.at_level(
        logging.WARNING,
        logger="backend.services.email_service",
    ):
        email_module.email_service._send_sync(
            "customer@example.com",
            "Subject",
            "<p>Hello</p>",
            "Hello",
        )

    assert state["attempts"] == 3
    assert "thất bại (lần 1/3)" in caplog.text


def test_send_generates_plain_text_part(monkeypatch):
    captured = {}

    def fake_send_sync(
        to_email,
        subject,
        html_content,
        text_content,
    ):
        captured["text"] = text_content

    monkeypatch.setattr(
        email_module.email_service,
        "_send_sync",
        fake_send_sync,
    )

    asyncio.run(
        email_module.email_service._send(
            "customer@example.com",
            "Subject",
            "<html><body><p>Xin chào</p></body></html>",
        )
    )

    assert captured["text"] == "Xin chào"
