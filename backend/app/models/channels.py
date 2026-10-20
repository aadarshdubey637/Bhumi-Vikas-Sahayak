"""WhatsApp / voice channel bookkeeping. No phone numbers, names or message text are stored anywhere in these tables:
senders are identified only by a keyed hash (see app/channels/hashing.py)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class ChannelDedupe(Base):
    """One row per provider event we have claimed. The unique key makes 'process each webhook event once' atomic: the second
    insert of the same (provider, event_id) fails. ``response`` lets a voice turn be replayed identically on a provider retry."""
    __tablename__ = "channel_dedupe"
    __table_args__ = (UniqueConstraint("provider", "event_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(16))   # whatsapp | twilio
    event_id: Mapped[str] = mapped_column(String(160))
    response: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChannelLog(Base):
    """Operational log for the integration status page: what happened, never to whom or what was said."""
    __tablename__ = "channel_log"
    __table_args__ = (Index("ix_channel_log_ts", "ts"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    provider: Mapped[str] = mapped_column(String(16))      # whatsapp | twilio | system
    kind: Mapped[str] = mapped_column(String(24))          # message | call_turn | connection_check | selftest | demo
    outcome: Mapped[str] = mapped_column(String(16))       # processed | duplicate | rejected | failed | ignored | passed
    error_code: Mapped[str | None] = mapped_column(String(48))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class ChannelContact(Base):
    """Opaque sender record: opt-out state and the one fact we asked for last. ``id`` is an HMAC, not a phone number."""
    __tablename__ = "channel_contacts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    channel: Mapped[str] = mapped_column(String(16))
    opted_out: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str | None] = mapped_column(String(8))
    pending_fact: Mapped[str | None] = mapped_column(String(32))
    last_intent: Mapped[str | None] = mapped_column(String(32))
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
