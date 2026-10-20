"""Account endpoints: register, login, logout, session lookup, password reset. The session is an opaque random token in an HttpOnly cookie
(JavaScript cannot read it); state-changing calls must carry ``X-Requested-With`` so a foreign website cannot trigger them (CSRF)."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.api.deps import DB, Cfg, require_xhr
from app.core.config import Settings
from app.core.exceptions import Unauthorized
from app.core.passwords import MIN_LENGTH
from app.models import User
from app.schemas.auth import (
    AuthConfigOut,
    ForgotPasswordOut,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UpdateMeRequest,
    UserOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
COOKIE = "ns_session"


def _out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, onboarding_done=bool(u.onboarding_done), created_at=u.created_at)


def _set_cookie(resp: Response, settings: Settings, token: str, max_age: int) -> None:
    resp.set_cookie(COOKIE, token, max_age=max_age, httponly=True, secure=settings.cookie_secure_effective, samesite=settings.cookie_samesite, path="/")


def _clear_cookie(resp: Response, settings: Settings) -> None:
    resp.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure_effective, httponly=True, samesite=settings.cookie_samesite)


@router.get("/config", response_model=AuthConfigOut, summary="What this server supports (registration, e-mail delivery)")
def auth_config(settings: Cfg) -> AuthConfigOut:
    return AuthConfigOut(auth_mode=settings.auth_mode, registration_open=settings.registration_open,
                         email_delivery=settings.email_transport, password_min_length=MIN_LENGTH)  # type: ignore[arg-type]


@router.post("/register", response_model=UserOut, status_code=201, summary="Create an account and sign in")
def register(body: RegisterRequest, request: Request, response: Response, db: DB, settings: Cfg) -> UserOut:
    require_xhr(request)
    user = auth_service.register(db, settings, body.name, body.email, body.password)
    token, max_age = auth_service.start_session(db, settings, user, request.headers.get("user-agent"))
    _set_cookie(response, settings, token, max_age)
    return _out(user)


@router.post("/login", response_model=UserOut, summary="Sign in with e-mail and password")
def login(body: LoginRequest, request: Request, response: Response, db: DB, settings: Cfg) -> UserOut:
    require_xhr(request)
    user = auth_service.login(db, body.email, body.password)
    token, max_age = auth_service.start_session(db, settings, user, request.headers.get("user-agent"))
    _set_cookie(response, settings, token, max_age)
    return _out(user)


@router.post("/logout", status_code=204, summary="End this session")
def logout(request: Request, db: DB, settings: Cfg) -> Response:
    require_xhr(request)
    auth_service.end_session(db, request.cookies.get(COOKIE))
    resp = Response(status_code=204)
    _clear_cookie(resp, settings)
    return resp


@router.get("/me", response_model=UserOut, summary="The signed-in user (401 when signed out or the session expired)")
def me(request: Request, db: DB) -> UserOut:
    user = auth_service.user_for_token(db, request.cookies.get(COOKIE))
    if user is None:
        raise Unauthorized("not signed in")
    return _out(user)


@router.patch("/me", response_model=UserOut, summary="Update the profile (name, onboarding state)")
def update_me(body: UpdateMeRequest, request: Request, db: DB) -> UserOut:
    require_xhr(request)
    user = auth_service.user_for_token(db, request.cookies.get(COOKIE))
    if user is None:
        raise Unauthorized("not signed in")
    if body.onboarding_done is not None:
        user.onboarding_done = body.onboarding_done
    if body.name is not None:
        user.name = body.name
    db.commit()
    return _out(user)


@router.post("/forgot-password", response_model=ForgotPasswordOut, status_code=202, summary="E-mail a one-time reset link (same answer for unknown e-mails)")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: DB, settings: Cfg) -> ForgotPasswordOut:
    require_xhr(request)
    auth_service.request_reset(db, settings, body.email)
    return ForgotPasswordOut(email_delivery=settings.email_transport)  # type: ignore[arg-type]


@router.post("/reset-password", response_model=UserOut, summary="Choose a new password with a reset token; signs out every session")
def reset_password(body: ResetPasswordRequest, request: Request, db: DB) -> UserOut:
    require_xhr(request)
    return _out(auth_service.reset_password(db, body.token, body.password))


