"""Password hashing and policy. scrypt (memory-hard, in the Python standard library: no extra dependency) with a random per-password salt.

Stored format: ``scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>`` so the cost can be raised later and old hashes still verify.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

_N, _R, _P = 2**14, 8, 1
_MAXMEM = 64 * 1024 * 1024
_KEYLEN = 32
MIN_LENGTH = 8
MAX_LENGTH = 128


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=_KEYLEN)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = _derive(password, salt, _N, _R, _P)
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        dk = _derive(password, base64.b64decode(salt_b64), int(n), int(r), int(p))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except (ValueError, TypeError):
        return False


# Used when the e-mail is unknown so a login attempt takes about as long either way (no account-existence timing leak).
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def password_problems(password: str, email: str = "", name: str = "") -> list[str]:
    """Machine-readable problems (the client translates them). Empty list = acceptable."""
    out: list[str] = []
    if len(password) < MIN_LENGTH:
        out.append("too_short")
    if len(password) > MAX_LENGTH:
        out.append("too_long")
    if not re.search(r"[A-Za-zऄ-ह]", password) or not re.search(r"\d", password):
        out.append("needs_letter_and_digit")
    low = password.lower()
    local = email.split("@")[0].lower() if email else ""
    if (local and len(local) >= 4 and local in low) or low in ("password1", "password123", "12345678a", "qwerty123"):
        out.append("too_guessable")
    if name and len(name) >= 4 and name.lower().replace(" ", "") in low.replace(" ", ""):
        out.append("contains_name")
    return out
