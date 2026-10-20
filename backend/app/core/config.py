"""Environment-based settings (pydantic-settings).

Secrets come only from the environment. Production refuses wildcard CORS, SQLite, and
``AUTH_MODE=none``; the LLM key is optional (exact lookup and calculations never need it).
"""
from __future__ import annotations

from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _split(v: str | None) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def normalize_database_url(url: str) -> str:
    """Hosting providers (Render, Heroku, ...) hand out ``postgres://`` / ``postgresql://`` URLs, which SQLAlchemy would
    resolve to the psycopg2 driver. This project ships psycopg 3, so select it explicitly."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True)

    env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias=AliasChoices("APP_ENV", "env")
    )
    database_url: str = "sqlite:///./nirmaansetu.db"
    corpus_path: Path = BACKEND_DIR / "data/processed/corpus_rules.jsonl"
    amendments_path: Path = BACKEND_DIR / "data/pending/amendments_pending.json"
    reviews_path: Path = BACKEND_DIR / "data/verified/rule_reviews.jsonl"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:5173"])
    # Optional regex for origins that are not known in advance (e.g. preview deployments). Rejected in production unless anchored.
    cors_origin_regex: str | None = None
    max_question_chars: int = Field(default=1000, ge=50, le=5000)
    max_request_bytes: int = Field(default=64 * 1024, ge=1024)
    request_timeout_seconds: float = Field(default=30.0, gt=0, le=300)
    rate_limit_per_minute: int = Field(default=60, ge=1)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # --- authentication: "none" (open, development only) or "api_key" (owner-scoped resources)
    # "accounts": visitors can use the public tools (rule search, questions, calculators) as guests; saving projects, assessments and
    # reports needs a signed-in account (server-side sessions in an HttpOnly cookie). "api_key": every call needs a key.
    auth_mode: Literal["none", "api_key", "accounts"] = "none"
    # "owner_id:sha256hex,owner2:sha256hex" - the server stores only SHA-256 digests of keys.
    api_key_hashes: SecretStr | None = Field(default=None, repr=False)
    # --- accounts (used when AUTH_MODE=accounts; the account endpoints also work in "none" for local development)
    registration_open: bool = True
    session_ttl_hours: int = Field(default=24 * 14, ge=1, le=24 * 90)
    cookie_secure: bool | None = None  # default: True in production
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"  # "none" is needed when the web app and API are on different sites (needs https)
    frontend_url: str | None = None  # used to build password-reset links; defaults to the first CORS origin
    email_backend: Literal["auto", "smtp", "console"] = "auto"  # auto: smtp when SMTP_HOST is set, else console (logs the message)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = Field(default=None, repr=False)
    smtp_from: str = "NirmaanSetu <no-reply@localhost>"
    smtp_starttls: bool = True
    # --- LLM (optional)
    llm_provider: Literal["none", "anthropic"] = "none"
    llm_model: str = "claude-sonnet-5-5"
    llm_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    llm_max_retries: int = Field(default=1, ge=0, le=3)
    llm_max_output_tokens: int = Field(default=700, ge=64, le=4000)
    anthropic_api_key: SecretStr | None = Field(default=None, repr=False)
    # --- channels: WhatsApp assistant ("Rule Dost") and phone assistant ("Nirmaan Helpline"). Everything is optional; with no
    # credentials the webhooks answer 503 and only the clearly-labelled demo mode works.
    # HMAC key used to turn phone numbers / call ids into opaque ids. Phone numbers are never stored or logged.
    pii_hash_secret: SecretStr | None = Field(default=None, repr=False)
    whatsapp_verify_token: SecretStr | None = Field(default=None, repr=False)   # GET handshake token you choose in the Meta console
    whatsapp_app_secret: SecretStr | None = Field(default=None, repr=False)     # signs every POST (X-Hub-Signature-256)
    whatsapp_access_token: SecretStr | None = Field(default=None, repr=False)   # system-user token for sending replies
    whatsapp_phone_number_id: str | None = None
    whatsapp_api_version: str = Field(default="v21.0", pattern=r"^v\d+\.\d+$")
    whatsapp_followup_template: str | None = None   # approved template used to send the written answer after a call
    whatsapp_followup_template_language: str = "hi"
    twilio_account_sid: str | None = Field(default=None, pattern=r"^AC[0-9a-fA-F]{32}$")
    twilio_auth_token: SecretStr | None = Field(default=None, repr=False)       # also validates X-Twilio-Signature
    twilio_sms_from: str | None = None
    public_base_url: str | None = None   # https://your-service.onrender.com : the exact origin Twilio/Meta call (signature URL)
    voice_language: Literal["hi-IN", "en-IN"] = "hi-IN"
    voice_tts_voice: str = "Polly.Aditi"
    stt_provider: Literal["none", "openai"] = "none"                           # speech-to-text for WhatsApp voice notes
    stt_model: str = "whisper-1"
    openai_api_key: SecretStr | None = Field(default=None, repr=False)
    channels_demo_enabled: bool | None = None   # default: on in development/test, off in production
    channels_use_llm_explanation: bool = False  # add the validated LLM explanation to channel answers (needs LLM_PROVIDER)
    channel_user_rate_per_minute: int = Field(default=8, ge=1, le=120)
    channel_session_ttl_hours: int = Field(default=24, ge=1, le=720)
    channel_http_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    # --- retrieval
    semantic_enabled: bool = False
    # Start-up conveniences. None = automatic: ON for a local SQLite *file* in development, OFF everywhere else (tests, Postgres,
    # production, where the entrypoint/operator runs migrations and ingestion explicitly). Set true/false to override.
    auto_migrate: bool | None = None  # run "alembic upgrade head" at start-up (single replica only)
    auto_ingest: bool | None = None   # load the shipped rule data when the database holds no rules

    @model_validator(mode="before")
    @classmethod
    def _split_cors(cls, data: object) -> object:
        if isinstance(data, dict) and isinstance(data.get("cors_origins"), str):
            data = {**data, "cors_origins": _split(data["cors_origins"])}
        return data

    @field_validator("cors_origins")
    @classmethod
    def _strip_trailing_slash(cls, v: list[str]) -> list[str]:
        # A browser's Origin header never has a trailing slash, so "https://app.example/" would silently never match.
        return [o.rstrip("/") if o != "*" else o for o in v]

    @field_validator("cors_origin_regex")
    @classmethod
    def _blank_regex_is_unset(cls, v: str | None) -> str | None:
        return (v or "").strip() or None  # `CORS_ORIGIN_REGEX=` in a copied .env must not become an empty pattern

    @field_validator("pii_hash_secret", "whatsapp_verify_token", "whatsapp_app_secret", "whatsapp_access_token", "whatsapp_phone_number_id",
                     "whatsapp_followup_template", "twilio_account_sid", "twilio_auth_token", "twilio_sms_from", "public_base_url",
                     "openai_api_key", "channels_demo_enabled", "cookie_secure", mode="before")
    @classmethod
    def _blank_channel_setting_is_unset(cls, v: object) -> object:
        return None if isinstance(v, str) and not v.strip() else v   # `TWILIO_AUTH_TOKEN=` in a copied .env means "not configured"

    @field_validator("database_url")
    @classmethod
    def _db_url(cls, v: str) -> str:
        return normalize_database_url(v)

    @model_validator(mode="after")
    def _rules(self) -> Settings:
        if self.env == "production":
            if "*" in self.cors_origins:
                raise ValueError("wildcard CORS is not allowed in production")
            if self.cors_origin_regex and not (self.cors_origin_regex.startswith("^") and self.cors_origin_regex.endswith("$")):
                raise ValueError("CORS_ORIGIN_REGEX must be anchored (^...$) in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("production requires a PostgreSQL DATABASE_URL")
            if self.auth_mode == "none":
                raise ValueError("production requires AUTH_MODE=api_key (or another enforced mechanism)")
        if self.cookie_samesite == "none" and not self.cookie_secure_effective:
            raise ValueError("COOKIE_SAMESITE=none requires secure cookies (https)")
        if self.auth_mode == "api_key" and not self.api_key_hashes:
            raise ValueError("AUTH_MODE=api_key requires API_KEY_HASHES")
        wa_any = any([self.whatsapp_verify_token, self.whatsapp_app_secret, self.whatsapp_access_token, self.whatsapp_phone_number_id])
        if wa_any and not self.pii_hash_secret:
            raise ValueError("WhatsApp settings require PII_HASH_SECRET (phone numbers are stored only as keyed hashes)")
        if self.twilio_auth_token and not self.pii_hash_secret:
            raise ValueError("Twilio settings require PII_HASH_SECRET")
        if self.stt_provider == "openai" and not (self.openai_api_key and self.openai_api_key.get_secret_value().strip()):
            raise ValueError("STT_PROVIDER=openai requires OPENAI_API_KEY")
        if self.public_base_url and not self.public_base_url.startswith(("http://", "https://")):
            raise ValueError("PUBLIC_BASE_URL must start with http:// or https://")
        if self.env == "production" and self.public_base_url and not self.public_base_url.startswith("https://"):
            raise ValueError("PUBLIC_BASE_URL must be https in production")
        if self.llm_provider == "anthropic" and not (self.anthropic_api_key and self.anthropic_api_key.get_secret_value().strip()):
            raise ValueError("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY")
        return self

    @property
    def _local_dev_sqlite_file(self) -> bool:
        u = self.database_url
        return self.env == "development" and u.startswith("sqlite:///") and u not in ("sqlite:///:memory:",) and ":memory:" not in u

    @property
    def should_auto_migrate(self) -> bool:
        return self.auto_migrate if self.auto_migrate is not None else self._local_dev_sqlite_file

    @property
    def should_auto_ingest(self) -> bool:
        return self.auto_ingest if self.auto_ingest is not None else self._local_dev_sqlite_file

    @property
    def cookie_secure_effective(self) -> bool:
        return self.cookie_secure if self.cookie_secure is not None else self.env == "production"

    @property
    def email_transport(self) -> str:
        """smtp | console (messages are only written to the server log: development) | none (production without SMTP)."""
        if self.email_backend == "smtp" or (self.email_backend == "auto" and self.smtp_host):
            return "smtp" if self.smtp_host else "none"
        return "none" if self.env == "production" else "console"

    @property
    def web_origin(self) -> str:
        return (self.frontend_url or (self.cors_origins[0] if self.cors_origins else "http://localhost:5173")).rstrip("/")

    @property
    def demo_enabled(self) -> bool:
        return self.channels_demo_enabled if self.channels_demo_enabled is not None else self.env != "production"

    @property
    def api_key_map(self) -> dict[str, str]:
        """sha256hex -> owner_id"""
        out: dict[str, str] = {}
        for pair in _split(self.api_key_hashes.get_secret_value() if self.api_key_hashes else ""):
            owner, _, digest = pair.partition(":")
            if owner and len(digest) == 64:
                out[digest.lower()] = owner
        return out

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        """Build from an explicit mapping (tests) or the process environment. ``.env`` is not read
        when a mapping is passed, so tests are hermetic."""
        if environ is None:
            return cls()
        data: dict[str, object] = {}
        fields = {
            "APP_ENV": "env", "DATABASE_URL": "database_url", "CORPUS_PATH": "corpus_path",
            "AMENDMENTS_PATH": "amendments_path", "REVIEWS_PATH": "reviews_path", "CORS_ORIGINS": "cors_origins",
            "CORS_ORIGIN_REGEX": "cors_origin_regex", "MAX_QUESTION_CHARS": "max_question_chars", "MAX_REQUEST_BYTES": "max_request_bytes",
            "REQUEST_TIMEOUT_SECONDS": "request_timeout_seconds", "RATE_LIMIT_PER_MINUTE": "rate_limit_per_minute",
            "LOG_LEVEL": "log_level", "AUTH_MODE": "auth_mode", "API_KEY_HASHES": "api_key_hashes",
            "REGISTRATION_OPEN": "registration_open", "SESSION_TTL_HOURS": "session_ttl_hours", "COOKIE_SECURE": "cookie_secure",
            "COOKIE_SAMESITE": "cookie_samesite", "FRONTEND_URL": "frontend_url", "EMAIL_BACKEND": "email_backend",
            "SMTP_HOST": "smtp_host", "SMTP_PORT": "smtp_port", "SMTP_USER": "smtp_user", "SMTP_PASSWORD": "smtp_password",
            "SMTP_FROM": "smtp_from", "SMTP_STARTTLS": "smtp_starttls",
            "LLM_PROVIDER": "llm_provider", "LLM_MODEL": "llm_model", "LLM_TIMEOUT_SECONDS": "llm_timeout_seconds",
            "LLM_MAX_RETRIES": "llm_max_retries", "LLM_MAX_OUTPUT_TOKENS": "llm_max_output_tokens",
            "ANTHROPIC_API_KEY": "anthropic_api_key", "SEMANTIC_ENABLED": "semantic_enabled", "AUTO_MIGRATE": "auto_migrate", "AUTO_INGEST": "auto_ingest",
            "PII_HASH_SECRET": "pii_hash_secret", "WHATSAPP_VERIFY_TOKEN": "whatsapp_verify_token",
            "WHATSAPP_APP_SECRET": "whatsapp_app_secret", "WHATSAPP_ACCESS_TOKEN": "whatsapp_access_token",
            "WHATSAPP_PHONE_NUMBER_ID": "whatsapp_phone_number_id", "WHATSAPP_API_VERSION": "whatsapp_api_version",
            "WHATSAPP_FOLLOWUP_TEMPLATE": "whatsapp_followup_template",
            "WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE": "whatsapp_followup_template_language",
            "TWILIO_ACCOUNT_SID": "twilio_account_sid", "TWILIO_AUTH_TOKEN": "twilio_auth_token", "TWILIO_SMS_FROM": "twilio_sms_from",
            "PUBLIC_BASE_URL": "public_base_url", "VOICE_LANGUAGE": "voice_language", "VOICE_TTS_VOICE": "voice_tts_voice",
            "STT_PROVIDER": "stt_provider", "STT_MODEL": "stt_model", "OPENAI_API_KEY": "openai_api_key",
            "CHANNELS_DEMO_ENABLED": "channels_demo_enabled", "CHANNELS_USE_LLM_EXPLANATION": "channels_use_llm_explanation",
            "CHANNEL_USER_RATE_PER_MINUTE": "channel_user_rate_per_minute", "CHANNEL_SESSION_TTL_HOURS": "channel_session_ttl_hours",
            "CHANNEL_HTTP_TIMEOUT_SECONDS": "channel_http_timeout_seconds",
        }
        for var, name in fields.items():
            if environ.get(var):
                data[name] = environ[var]
        return cls.model_validate(data)


@lru_cache
def get_settings() -> Settings:
    return Settings()
