"""Structured JSON logging with request IDs; secrets are redacted."""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
import uuid
from datetime import UTC, datetime

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
_SECRET = re.compile(r"(sk-[A-Za-z0-9_\-]{8,}|(?i:api[_-]?key|authorization|password|token)\s*[=:]\s*\S+)")


def new_request_id() -> str:
    rid = uuid.uuid4().hex
    request_id_var.set(rid)
    return rid


def redact(text: str) -> str:
    return _SECRET.sub("[REDACTED]", text)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname, "logger": record.name,
            "msg": redact(record.getMessage()), "request_id": request_id_var.get(),
        }
        for k in ("event", "status_code", "path", "duration_ms"):
            if hasattr(record, k):
                payload[k] = getattr(record, k)
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.handlers.clear()
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root.addHandler(h)
    root.setLevel(level)
    for noisy in ("httpx", "httpcore", "httpx2", "anthropic"):  # keep third-party request logs out of INFO
        logging.getLogger(noisy).setLevel(logging.WARNING)
