"""Channel bookkeeping: atomic dedupe, opaque contacts, status log, per-sender throttle. No phone numbers or message text are stored."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import ChannelContact, ChannelDedupe, ChannelLog


def claim_event(db: Session, provider: str, event_id: str, response: str | None = None) -> bool:
    """True if this (provider, event_id) was not seen before. The unique constraint makes it atomic across workers/retries."""
    db.add(ChannelDedupe(provider=provider, event_id=event_id[:160], response=response))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


def stored_response(db: Session, provider: str, event_id: str) -> str | None:
    return db.scalar(select(ChannelDedupe.response).where(ChannelDedupe.provider == provider, ChannelDedupe.event_id == event_id[:160]))


def save_response(db: Session, provider: str, event_id: str, response: str) -> None:
    row = db.scalar(select(ChannelDedupe).where(ChannelDedupe.provider == provider, ChannelDedupe.event_id == event_id[:160]))
    if row is not None:
        row.response = response
        db.commit()


def get_contact(db: Session, contact_id: str, channel: str) -> ChannelContact:
    c = db.get(ChannelContact, contact_id)
    now = utcnow()
    if c is None:
        c = ChannelContact(id=contact_id, channel=channel, opted_out=False, message_count=0, first_seen=now, last_seen=now)
        db.add(c)
    c.last_seen = now
    c.message_count = (c.message_count or 0) + 1
    return c


def log_event(db: Session, provider: str, kind: str, outcome: str, *, error_code: str | None = None, latency_ms: int | None = None,
              simulated: bool = False, detail: dict[str, Any] | None = None) -> None:
    """Never pass phone numbers, message text or tokens in ``detail``; it is shown on the status page."""
    db.add(ChannelLog(provider=provider, kind=kind, outcome=outcome, error_code=error_code, latency_ms=latency_ms,
                      simulated=simulated, detail=detail or {}))
    db.commit()


class SenderThrottle:
    """Per-process sliding window per opaque sender id: 'ok' | 'warn' (first excess in a window: tell the sender once) | 'drop'."""

    def __init__(self, per_minute: int, window: float = 60.0):
        self.limit, self.window = per_minute, window
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._warned: dict[str, float] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> str:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) < self.limit:
                q.append(now)
                return "ok"
            if now - self._warned.get(key, -1e9) > self.window:
                self._warned[key] = now
                return "warn"
            return "drop"
