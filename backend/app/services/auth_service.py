"""Accounts: registration, login with lock-out, server-side sessions, password reset. No secret is ever stored in plain text:
passwords are scrypt hashes, session and reset tokens are stored as SHA-256 digests (the raw token only travels in the cookie / e-mail link)."""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError, Conflict, Unauthorized, ValidationFailed
from app.core.passwords import DUMMY_HASH, hash_password, password_problems, verify_password
from app.models import PasswordReset, User, UserSession
from app.services.email_service import send_email

log = logging.getLogger("app.auth")
MAX_FAILED = 5
LOCK_MINUTES = 15
RESET_MINUTES = 30
INVALID = "Invalid email or password."


class Locked(AppError):
    status_code, code = 429, "account_locked"


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(d: datetime | None) -> datetime | None:
    return d if d is None or d.tzinfo else d.replace(tzinfo=UTC)  # SQLite returns naive datetimes


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _check_password(password: str, email: str, name: str) -> None:
    problems = password_problems(password, email, name)
    if problems:
        raise ValidationFailed("password does not meet the requirements", [{"loc": ["body", "password"], "msg": p, "type": "password_policy"} for p in problems])


def register(db: Session, settings: Settings, name: str, email: str, password: str) -> User:
    if not settings.registration_open:
        raise AppError("registration is closed", code="registration_closed", status_code=403)
    _check_password(password, email, name)
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise Conflict("an account with this e-mail already exists", [{"loc": ["body", "email"], "msg": "email_taken", "type": "conflict"}])
    user = User(email=email, name=name.strip(), password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


def login(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    now = _now()
    lock = _aware(user.locked_until) if user is not None else None
    if user is not None and lock is not None and lock > now:
        verify_password(password, DUMMY_HASH)
        raise Locked(f"too many failed attempts; try again in {int((lock - now).total_seconds() // 60) + 1} minutes")
    ok = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if user is None or not ok:
        if user is not None:
            user.failed_logins = (user.failed_logins or 0) + 1
            if user.failed_logins >= MAX_FAILED:
                user.locked_until, user.failed_logins = now + timedelta(minutes=LOCK_MINUTES), 0
            db.commit()
        raise Unauthorized(INVALID)
    user.failed_logins, user.locked_until, user.last_login_at = 0, None, now
    db.commit()
    return user


def start_session(db: Session, settings: Settings, user: User, user_agent: str | None) -> tuple[str, int]:
    """Creates a session; returns (raw token for the cookie, max-age seconds)."""
    now = _now()
    db.execute(delete(UserSession).where(UserSession.expires_at < now))  # opportunistic clean-up
    token = secrets.token_urlsafe(32)
    ttl = timedelta(hours=settings.session_ttl_hours)
    db.add(UserSession(user_id=user.id, token_hash=_digest(token), expires_at=now + ttl, user_agent=(user_agent or "")[:200] or None))
    db.commit()
    return token, int(ttl.total_seconds())


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    s = db.scalar(select(UserSession).where(UserSession.token_hash == _digest(token)))
    now = _now()
    if s is None or (_aware(s.expires_at) or now) <= now:
        return None
    s.last_seen_at = now
    db.commit()
    return db.get(User, s.user_id)


def end_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == _digest(token)))
        db.commit()


def request_reset(db: Session, settings: Settings, email: str) -> None:
    """Behaves the same for known and unknown e-mails (no account-existence leak); a delivery failure is logged, never reported."""
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        return
    token = secrets.token_urlsafe(32)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.add(PasswordReset(user_id=user.id, token_hash=_digest(token), expires_at=_now() + timedelta(minutes=RESET_MINUTES)))
    db.commit()
    link = f"{settings.web_origin}/reset-password?token={token}"
    body = (
        f"Hello {user.name},\n\nUse this link to choose a new NirmaanSetu password. It works once and expires in {RESET_MINUTES} minutes:\n\n{link}\n\n"
        "If you did not ask for this, ignore this message; your password stays the same.\n"
    )
    try:
        send_email(settings, user.email, "Reset your NirmaanSetu password", body)
    except Exception:
        log.warning("password reset e-mail could not be sent", extra={"event": "reset_email_failed"})


def reset_password(db: Session, token: str, password: str) -> User:
    bad = ValidationFailed("this reset link is invalid or has expired", [{"loc": ["body", "token"], "msg": "invalid_or_expired", "type": "reset_token"}])
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _digest(token)))
    now = _now()
    if row is None or row.used_at is not None or (_aware(row.expires_at) or now) <= now:
        raise bad
    user = db.get(User, row.user_id)
    if user is None:
        raise bad
    _check_password(password, user.email, user.name)
    user.password_hash, user.failed_logins, user.locked_until = hash_password(password), 0, None
    row.used_at = now
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))  # a reset signs the account out everywhere
    db.commit()
    return user
