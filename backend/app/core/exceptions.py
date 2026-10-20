"""Application errors and the single error-envelope used by every endpoint (``ApiError``)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var
from app.schemas.api import ApiError

log = logging.getLogger("app.errors")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, details: list[dict[str, Any]] | None = None, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message, self.details = message, details or []
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class NotFound(AppError):
    status_code, code = 404, "not_found"


class Unauthorized(AppError):
    status_code, code = 401, "unauthorized"


class Conflict(AppError):
    status_code, code = 409, "conflict"


class ValidationFailed(AppError):
    status_code, code = 422, "validation_error"


class ServiceUnavailable(AppError):
    status_code, code = 503, "service_unavailable"


def error_response(status: int, code: str, message: str, details: list[dict[str, Any]] | None = None,
                   headers: dict[str, str] | None = None) -> JSONResponse:
    body = ApiError(code=code, message=message, request_id=request_id_var.get(), details=details or [])
    return JSONResponse(status_code=status, content=body.model_dump(), headers=headers)


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # never echo submitted values back (they may be sensitive); location + message only
        details = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg", ""), "type": e.get("type", "")} for e in exc.errors()]
        return error_response(422, "validation_error", "request validation failed", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: HTTPException) -> JSONResponse:
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return error_response(exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled exception", exc_info=exc, extra={"event": "unhandled_exception"})
        return error_response(500, "internal_error", "an internal error occurred; quote the request_id when reporting it")
