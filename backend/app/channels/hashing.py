"""Opaque identifiers for people. Phone numbers and call ids are never stored or logged; only a keyed hash is."""
from __future__ import annotations

import hashlib
import hmac


def keyed_id(secret: str, namespace: str, value: str) -> str:
    """HMAC-SHA256(secret, "namespace:value") as hex. Not reversible without the secret, stable for the same sender."""
    return hmac.new(secret.encode("utf-8"), f"{namespace}:{value}".encode(), hashlib.sha256).hexdigest()


def conversation_id(contact_hash: str, namespace: str) -> str:
    """Id for the existing ``conversations`` table; satisfies AskRequest's ^[A-Za-z0-9_-]{8,64}$ pattern."""
    return f"{namespace}-{contact_hash[:40]}"
