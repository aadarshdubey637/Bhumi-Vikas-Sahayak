"""Outgoing e-mail for account messages (password reset).

``smtp``    sends through the configured SMTP server (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM).
``console`` development only: the message, including the reset link, is written to the server log. Nothing is delivered.
``none``    production without SMTP: nothing can be sent; the API says so (``GET /auth/config``) and the UI tells the user.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import Settings

log = logging.getLogger("app.email")


class EmailNotConfigured(Exception):
    pass


def send_email(settings: Settings, to: str, subject: str, body: str) -> str:
    """Returns the transport used. Raises EmailNotConfigured / OSError / smtplib.SMTPException on failure."""
    transport = settings.email_transport
    if transport == "console":
        log.warning("EMAIL (console backend, not delivered) to=%s subject=%s\n%s", to, subject, body, extra={"event": "email_console"})
        return "console"
    if transport == "none":
        raise EmailNotConfigured("no e-mail transport is configured")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    password = settings.smtp_password.get_secret_value() if settings.smtp_password else None
    ctx = ssl.create_default_context()
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=ctx) as s:
            if settings.smtp_user and password:
                s.login(settings.smtp_user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            if settings.smtp_starttls:
                s.starttls(context=ctx)
            if settings.smtp_user and password:
                s.login(settings.smtp_user, password)
            s.send_message(msg)
    return "smtp"
