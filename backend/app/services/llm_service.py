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
MAX_RESPONSE_CHARS = 8000


class LLMUnavailable(RuntimeError):
    """Provider not configured, unreachable, timed out, or returned unusable output."""


class GroundedExplanation(BaseModel):
    summary: str = Field(min_length=1, max_length=3000)
    cited_evidence_ids: list[str] = Field(default_factory=list, max_length=20)
    caveats: list[str] = Field(default_factory=list, max_length=10)


class LLMProvider(Protocol):
    name: str

    def complete(self, system: str, user: str, max_tokens: int) -> str: ...


class NullProvider:
    name = "none"

    def complete(self, system: str, user: str, max_tokens: int) -> str:
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
        self._model = settings.llm_model

    def complete(self, system: str, user: str, max_tokens: int) -> str:  # pragma: no cover - needs live credentials
        try:
            msg = self._client.messages.create(model=self._model, max_tokens=max_tokens, system=system,
                                               messages=[{"role": "user", "content": user}])
        except self._anthropic.APIError as e:  # network, auth, rate limit, timeout
            raise LLMUnavailable(f"provider error: {type(e).__name__}") from e  # message may echo request; do not log it
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def make_provider(settings: Settings) -> LLMProvider:
    return AnthropicProvider(settings) if settings.llm_provider == "anthropic" else NullProvider()


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


def validate_explanation(expl: GroundedExplanation, evidence: list[EvidenceItem], user_values: list[str],
                         calc_values: list[str]) -> list[str]:
    """Return a list of problems; an empty list means the explanation may be shown."""
    problems: list[str] = []
    known_ids = {e.evidence_id for e in evidence}
    bad_ids = [i for i in expl.cited_evidence_ids if i not in known_ids]
    if bad_ids:
        problems.append(f"cites unknown evidence ids: {bad_ids}")
    if not expl.cited_evidence_ids:
        problems.append("cites no evidence")
    text = " ".join([expl.summary, *expl.caveats])
    nums = unsupported_numbers(text, evidence, calc_values, user_values)
    if nums:
        problems.append(f"contains numbers not present in evidence/facts/calculations: {nums}")
    known_rules = {re.sub(r"\s+", "", e.rule_number).lower() for e in evidence}
    for m in _RULE_REF.findall(expl.summary):
        flat = re.sub(r"\s+", "", m).lower()
        if flat not in known_rules and re.sub(r"\(.*", "", flat) not in known_rules:
            problems.append(f"mentions a rule that is not in the evidence: {m}")
    if re.search(r"\b(complies|compliant|approved|is permitted|is allowed)\b", expl.summary, re.IGNORECASE):
        problems.append("makes a compliance/approval claim")
    return problems
