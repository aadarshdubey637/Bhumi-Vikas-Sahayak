"""Rule-number normalization.

The *official* rule identifier is always preserved exactly as printed in the source
(``26-B``, ``25(A)``, ``17-a``, ``42A``).  A separate *rule key* (``26b``, ``25a``,
``17a``, ``42a``) is used only for lookup, so that ``26 B``, ``26-b`` and ``Rule 26(B)``
all resolve to the same stable identity.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def to_ascii_digits(text: str) -> str:
    """Convert Devanagari digits to ASCII digits (lookup aid only)."""
    return text.translate(_DEVANAGARI_DIGITS)


@dataclass(frozen=True)
class RuleRef:
    base: str
    suffix: str | None = None  # inserted-rule letter, e.g. "B" in 26-B
    path: tuple[str, ...] = ()  # sub-rule / clause path, e.g. ("5", "c") in 2(5)(c)

    @property
    def key(self) -> str:
        return f"{self.base}{(self.suffix or '').lower()}"

    @property
    def display(self) -> str:
        head = self.base + (f"-{self.suffix}" if self.suffix else "")
        return head + "".join(f"({p})" for p in self.path)


_PREFIX = re.compile(r"^\s*(?:rules?|नियम)\s*(?:no\.?|number|क्रमांक)?\s*", re.IGNORECASE)
_TOKEN = re.compile(
    r"\s*(?:-\s*([A-Za-z]{1,2})(?![A-Za-z])"  # -B
    r"|\(\s*([0-9A-Za-z]{1,4})\s*\)"  # (5) (c) (A)
    r"|\s*([A-Za-z])(?![A-Za-z]))"  # "B" or " B" (attached or spaced)
)
_REF_IN_TEXT = re.compile(
    r"(?:\brules?\b|नियम)\s*(?:no\.?\s*)?"
    r"(\d{1,3}(?:\s*-\s*[A-Za-z](?![A-Za-z]))?(?:\s*\(\s*[0-9A-Za-z]{1,4}\s*\))*)",
    re.IGNORECASE,
)


def parse_rule_ref(text: str, known_keys: set[str] | None = None) -> RuleRef | None:
    """Parse a rule reference. Returns None when the text is not a clean reference.

    ``25(A)`` is ambiguous in isolation (inserted rule 25-A or clause (A) of rule 25).
    When ``known_keys`` is given, a leading parenthesised/spaced letter is treated as an
    inserted-rule suffix only if ``<base><letter>`` is a known rule key.  A hyphenated
    letter (``26-B``) is always treated as a suffix.
    """
    if not isinstance(text, str):
        return None
    s = _PREFIX.sub("", to_ascii_digits(text).strip())
    m = re.match(r"(\d{1,3})", s)
    if not m:
        return None
    base, rest = m.group(1), s[m.end():]
    tokens: list[tuple[str, str]] = []
    pos = 0
    while pos < len(rest):
        t = _TOKEN.match(rest, pos)
        if not t:
            break
        if t.group(1):
            tokens.append(("hyphen", t.group(1)))
        elif t.group(2):
            tokens.append(("paren", t.group(2)))
        else:
            tokens.append(("space", t.group(3)))
        pos = t.end()
    if rest[pos:].strip(" .,;:"):
        return None
    suffix = None
    path = [tok for _, tok in tokens]
    if tokens:
        kind, tok = tokens[0]
        if tok.isalpha() and len(tok) <= 2:
            is_known = known_keys is not None and f"{base}{tok.lower()}" in known_keys
            if kind == "hyphen" or is_known:
                suffix, path = tok.upper(), path[1:]
    return RuleRef(base=base, suffix=suffix, path=tuple(path))


def rule_key(text: str, known_keys: set[str] | None = None) -> str | None:
    ref = parse_rule_ref(text, known_keys)
    return ref.key if ref else None


def extract_rule_refs(text: str, known_keys: set[str] | None = None) -> list[RuleRef]:
    """Find explicit "Rule N..." / "नियम N" references inside free text."""
    out: list[RuleRef] = []
    seen: set[tuple] = set()
    for m in _REF_IN_TEXT.finditer(to_ascii_digits(text)):
        ref = parse_rule_ref(m.group(1), known_keys)
        if ref and (ref.base, ref.suffix, ref.path) not in seen:
            seen.add((ref.base, ref.suffix, ref.path))
            out.append(ref)
    return out
