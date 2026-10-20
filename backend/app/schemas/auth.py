from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


class _Req(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or not _EMAIL.match(v):
        raise ValueError("invalid_email")
    return v


class RegisterRequest(_Req):
    name: str = Field(min_length=1, max_length=80)
    email: str
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _e(cls, v: str) -> str:
        return _email(v)


class LoginRequest(_Req):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _e(cls, v: str) -> str:
        return v.strip().lower()


class ForgotPasswordRequest(_Req):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _e(cls, v: str) -> str:
        return _email(v)


class ResetPasswordRequest(_Req):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=256)


class UpdateMeRequest(_Req):
    onboarding_done: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)


class UserOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    email: str
    name: str
    onboarding_done: bool
    created_at: datetime


class AuthConfigOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    auth_mode: Literal["none", "api_key", "accounts"]
    registration_open: bool
    email_delivery: Literal["smtp", "console", "none"]
    password_min_length: int


class ForgotPasswordOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["accepted"] = "accepted"
    email_delivery: Literal["smtp", "console", "none"]
