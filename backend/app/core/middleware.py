"""Pure-ASGI middleware: request id + access log, body-size limit, rate limit, request timeout."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections import defaultdict, deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.exceptions import error_response
from app.core.logging import new_request_id

log = logging.getLogger("app.access")
# Webhooks come from Meta / Twilio addresses shared by every user, so they cannot be limited per IP; they are protected by signatures
# and by a per-sender throttle inside the channel service instead.
# /ask may carry up to two attached files (4 MB each, base64): it gets a larger body limit than every other endpoint.
UPLOAD_PATHS = {"/api/v1/ask": 12 * 1024 * 1024}
EXEMPT_PATHS = ("/api/v1/health", "/api/v1/ready", "/api/v1/channels/whatsapp/webhook", "/api/v1/channels/voice/")


class RequestContextMiddleware:
    """Assigns ``X-Request-ID``, enforces the body-size limit, writes a structured access log (no bodies/headers)."""

    def __init__(self, app: ASGIApp, max_body_bytes: int):
        self.app, self.max_body = app, max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        rid = new_request_id()
        started, status = time.perf_counter(), {"code": 0}
        headers = dict(scope.get("headers") or [])
        limit = max(self.max_body, UPLOAD_PATHS.get(scope.get("path", ""), 0))
        declared = headers.get(b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            resp = error_response(413, "payload_too_large", f"request body exceeds {limit} bytes",
                                  headers={"X-Request-ID": rid})
            status["code"] = 413
            await resp(scope, receive, send)
            return self._log(scope, status["code"], started)
        received = {"n": 0}

        async def limited_receive() -> Message:
            msg = await receive()
            if msg["type"] == "http.request":
                received["n"] += len(msg.get("body", b""))
                if received["n"] > limit:
                    raise _TooLarge
            return msg

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", rid.encode()))
            await send(message)

        try:
            await self.app(scope, limited_receive, send_wrapper)
        except _TooLarge:
            if not status["code"]:
                status["code"] = 413
                await error_response(413, "payload_too_large", f"request body exceeds {limit} bytes",
                                     headers={"X-Request-ID": rid})(scope, receive, send)
        self._log(scope, status["code"], started)

    @staticmethod
    def _log(scope: Scope, code: int, started: float) -> None:
        log.info("request", extra={"event": "http_request", "status_code": code, "path": scope.get("path"),
                                   "duration_ms": round((time.perf_counter() - started) * 1000, 1)})


class _TooLarge(Exception):
    pass


class RateLimitMiddleware:
    """Sliding-window limiter, in-process (per worker). For multi-replica deployments enforce the limit at the
    gateway/reverse proxy or back this with Redis. Keyed by the API key only when it is a *known* key, otherwise by client
    address (a made-up key must not buy a fresh bucket, or invalid-key guessing would be unlimited). The client address is
    what the ASGI server reports; behind a proxy run uvicorn with ``--proxy-headers`` and a trusted ``FORWARDED_ALLOW_IPS``."""

    def __init__(self, app: ASGIApp, per_minute: int, window_seconds: float = 60.0, valid_key_digests: frozenset[str] = frozenset()):
        self.app, self.limit, self.window = app, per_minute, window_seconds
        self.valid_digests = valid_key_digests
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def _key(self, scope: Scope) -> str:
        h = dict(scope.get("headers") or [])
        k = h.get(b"x-api-key")
        if k:
            digest = hashlib.sha256(k).hexdigest()
            if digest in self.valid_digests:
                return "key:" + digest[:16]
        client = scope.get("client")
        return "ip:" + (client[0] if client else "unknown")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path", "").startswith(EXEMPT_PATHS) or scope.get("method") == "OPTIONS":
            return await self.app(scope, receive, send)
        now = time.monotonic()
        q = self.hits[self._key(scope)]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            retry = max(1, int(self.window - (now - q[0])) + 1)
            resp = error_response(429, "rate_limited", "too many requests", headers={"Retry-After": str(retry)})
            return await resp(scope, receive, send)
        q.append(now)
        if now - self._last_sweep > self.window:  # drop idle keys so memory stays bounded
            self._last_sweep = now
            for k in [k for k, v in self.hits.items() if not v or now - v[-1] > self.window]:
                self.hits.pop(k, None)
        await self.app(scope, receive, send)


class TimeoutMiddleware:
    """Returns 504 if the handler exceeds the timeout. (A running sync handler thread cannot be killed; the client
    is released and the work is abandoned at the next await/commit.)"""

    def __init__(self, app: ASGIApp, seconds: float):
        self.app, self.seconds = app, seconds

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = {"v": False}

        async def watch(message: Message) -> None:
            if message["type"] == "http.response.start":
                started["v"] = True
            await send(message)

        try:
            await asyncio.wait_for(self.app(scope, receive, watch), timeout=self.seconds)
        except TimeoutError:
            log.error("request timed out", extra={"event": "request_timeout", "path": scope.get("path")})
            if not started["v"]:
                # X-Request-ID is added by RequestContextMiddleware's send wrapper; adding it here too would duplicate the header
                await error_response(504, "timeout", "the request took too long")(scope, receive, send)
