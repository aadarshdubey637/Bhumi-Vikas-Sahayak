"""Provider-independent LLM interface for the OPTIONAL explanation step.

Exact rule lookup, retrieval, calculations and status resolution never call this module.
If the provider is missing or fails, callers fall back to the deterministic evidence-pointer answer.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Protocol

from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings
from app.services.evidence_service import unsupported_numbers
from app.services.retrieval_service import EvidenceItem

log = logging.getLogger(__name__)
MAX_RESPONSE_CHARS = 16000


class LLMUnavailable(RuntimeError):
    """Provider not configured, unreachable, timed out, or returned unusable output."""


class GroundedExplanation(BaseModel):
    summary: str = Field(min_length=1, max_length=8000)
    cited_evidence_ids: list[str] = Field(default_factory=list, max_length=20)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class LLMProvider(Protocol):
    name: str

    # ``attachments`` (list of {"mime", "data"(base64)}) is only passed when the user attached files.
    def complete(self, system: str, user: str, max_tokens: int, attachments: list[dict[str, str]] | None = None) -> str: ...


class NullProvider:
    name = "none"

    def complete(self, system: str, user: str, max_tokens: int, attachments: list[dict[str, str]] | None = None) -> str:
        raise LLMUnavailable("no LLM provider is configured (LLM_PROVIDER=none)")


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings):
        try:
            import anthropic
        except ImportError as e:  # pragma: no cover
            raise LLMUnavailable("the 'anthropic' package is not installed") from e
        assert settings.anthropic_api_key is not None
        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key.get_secret_value(),
                                           timeout=settings.llm_timeout_seconds, max_retries=settings.llm_max_retries)
        self._model = settings.llm_model or "claude-sonnet-5-5"

    def complete(self, system: str, user: str, max_tokens: int, attachments: list[dict[str, str]] | None = None) -> str:  # pragma: no cover - needs live credentials
        if attachments:
            raise LLMUnavailable("reading attached files needs LLM_PROVIDER=google")
        try:
            msg = self._client.messages.create(model=self._model, max_tokens=max_tokens, system=system,
                                               messages=[{"role": "user", "content": user}])
        except self._anthropic.APIError as e:  # network, auth, rate limit, timeout
            raise LLMUnavailable(f"provider error: {type(e).__name__}") from e  # message may echo request; do not log it
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


class GoogleProvider:
    """Gemini via the public REST API (httpx is already a runtime dependency, so no extra package)."""
    name = "google"
    _URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    _THINKING_HEADROOM = 2048  # Gemini 2.5 models count hidden "thinking" tokens against maxOutputTokens

    def __init__(self, settings: Settings):
        assert settings.google_api_key is not None
        self._key = settings.google_api_key.get_secret_value()
        self._model = settings.llm_model or "gemini-2.5-flash"
        self._timeout = settings.llm_timeout_seconds
        self._retries = settings.llm_max_retries

    def complete(self, system: str, user: str, max_tokens: int, attachments: list[dict[str, str]] | None = None) -> str:  # pragma: no cover - needs live credentials
        import httpx

        files = [{"inlineData": {"mimeType": a["mime"], "data": a["data"]}} for a in (attachments or [])]
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [*files, {"text": user}]}],
            "generationConfig": {"maxOutputTokens": max_tokens + self._THINKING_HEADROOM, "responseMimeType": "application/json"},
        }
        last: Exception | None = None
        for _ in range(self._retries + 1):
            try:
                r = httpx.post(self._URL.format(model=self._model), json=body, headers={"x-goog-api-key": self._key},
                               timeout=self._timeout)
                if r.status_code in (429, 500, 502, 503, 504):
                    last = LLMUnavailable(f"provider error: HTTP {r.status_code}")
                    continue
                r.raise_for_status()
                parts = r.json()["candidates"][0]["content"]["parts"]
                return "".join(p.get("text", "") for p in parts)
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
                # do not log e: the URL/message may echo request details
                last = LLMUnavailable(f"provider error: {type(e).__name__}")
        raise last or LLMUnavailable("provider error")


def make_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "anthropic":
        return AnthropicProvider(settings)
    if settings.llm_provider == "google":
        return GoogleProvider(settings)
    return NullProvider()


# ---- output validation ---------------------------------------------------------------------------
_RULE_REF = re.compile(r"\brules?\s+(\d+[A-Za-z]?(?:\s*\(\w+\))*)", re.IGNORECASE)


def parse_explanation(raw: str) -> GroundedExplanation:
    if len(raw) > MAX_RESPONSE_CHARS:
        raise LLMUnavailable("model response exceeded the size limit")
    text = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        return GroundedExplanation.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as e:
        raise LLMUnavailable("model output failed schema validation") from e


_ALWAYS_OK_NUMBERS = ["2012"]  # the year in the name of the Rules itself
_CLAUSE_REF = re.compile(r"\b(?:clauses?|sub-?clauses?|tables?|नियम|धारा|खंड|तालिका)\s*\(?\d+[A-Za-z]?\)?|\b\d+\s*\(\s*[0-9a-zA-Z]+\s*\)\s*\(\s*[0-9a-zA-Z]+\s*\)", re.IGNORECASE)
_LIST_MARKER = re.compile(r"^[ \t]*\d+[.)][ \t]+", re.MULTILINE)


def validate_explanation(expl: GroundedExplanation, evidence: list[EvidenceItem], user_values: list[str],
                         calc_values: list[str], *, require_citations: bool = True, allow_rule_refs: bool = True,
                         check_numbers: bool = True) -> list[str]:
    """Return a list of problems; an empty list means the explanation may be shown.

    ``require_citations=False`` is for the general-guidance mode (no rule text was found): the answer must then contain no
    figures and no rule references at all, which the same number / rule checks enforce because the evidence list is empty."""
    problems: list[str] = []
    known_ids = {e.evidence_id for e in evidence}
    bad_ids = [i for i in expl.cited_evidence_ids if i not in known_ids]
    if bad_ids:
        problems.append(f"cites unknown evidence ids: {bad_ids}")
    if require_citations and not expl.cited_evidence_ids:
        problems.append("cites no evidence")
    if not require_citations and expl.cited_evidence_ids:
        problems.append("general guidance must not cite evidence")
    text = "\n".join([expl.summary, *expl.caveats])
    for eid in known_ids:  # an id such as EV-56-000-ab12 is a reference, not a figure
        text = text.replace(eid, " ")
    text = _LIST_MARKER.sub("", text)  # "1. 2." list numbering is not a figure
    # check_numbers=False only when the user attached a file: its figures are not available as text to compare against
    nums = unsupported_numbers(text, evidence, [*calc_values, *_ALWAYS_OK_NUMBERS], user_values) if check_numbers else []
    if nums:
        problems.append(f"contains numbers not present in evidence/facts/calculations: {nums}")
    if not allow_rule_refs:
        refs = _RULE_REF.findall(expl.summary) + _CLAUSE_REF.findall(expl.summary)
        if refs:
            problems.append(f"mentions rule/clause numbers in the answer text (describe the rule in plain words instead): {refs[:3]}")
    known_rules = {re.sub(r"\s+", "", e.rule_number).lower() for e in evidence}
    for m in _RULE_REF.findall(expl.summary):
        flat = re.sub(r"\s+", "", m).lower()
        if flat not in known_rules and re.sub(r"\(.*", "", flat) not in known_rules:
            problems.append(f"mentions a rule that is not in the evidence: {m}")
    if re.search(r"\b(complies|compliant|approved|is permitted|is allowed)\b", expl.summary, re.IGNORECASE):
        problems.append("makes a compliance/approval claim")
    return problems
