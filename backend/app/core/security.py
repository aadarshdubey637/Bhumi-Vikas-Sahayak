"""Authentication-ready security primitives.

``AUTH_MODE=none``    open access for local development only (production refuses it).
``AUTH_MODE=api_key`` each request must carry ``X-API-Key``; the server stores only SHA-256 digests
                      (``API_KEY_HASHES=owner:digest,...``) and resolves the *owner* from the digest.
                      The caller can never choose its own owner id.
Resource-level authorization (project/assessment ownership) is enforced in the services.
Swap ``authenticate`` for an OIDC/JWT verifier without touching the routers.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from app.core.config import Settings
from app.core.exceptions import Unauthorized


@dataclass(frozen=True)
class Principal:
    owner_id: str | None  # None when authentication is disabled, or for a guest
    guest: bool = False  # AUTH_MODE=accounts and not signed in: public tools only, never any owned resource
    user_id: str | None = None


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def authenticate(settings: Settings, api_key: str | None, user_id: str | None = None) -> Principal:
    if user_id:  # a valid login session always wins: resources are scoped to that account
        return Principal(owner_id=f"user:{user_id}", user_id=user_id)
    if settings.auth_mode == "none":
        return Principal(owner_id=None)
    if settings.auth_mode == "accounts":
        return Principal(owner_id=None, guest=True)
    if not api_key:
        raise Unauthorized("missing X-API-Key header")
    digest = hash_api_key(api_key)
    for known, owner in settings.api_key_map.items():
        if hmac.compare_digest(known, digest):  # constant-time
            return Principal(owner_id=owner)
    raise Unauthorized("invalid API key")
