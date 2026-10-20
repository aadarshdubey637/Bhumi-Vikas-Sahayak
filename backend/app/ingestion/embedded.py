"""Detect inserted rules (12 A, 17-a, 25(A), 42A, 93(a) ...) printed *inside* a parent record.

The supplied dataset keeps these inside the preceding rule's text.  We expose them as
separate lookup targets WITHOUT touching the parent text.  The end boundary of an inserted
rule is not established by the data, so ``boundary_verified`` stays False.
"""
from __future__ import annotations

import re

from app.rules.normalization import parse_rule_ref
from app.rules.schemas import EmbeddedRule

# hyphen form (any case), parenthesised form, or bare UPPERCASE letter ("42A", "12 A").
_EMBEDDED = re.compile(
    r"(?m)^[ \t]*\[?\"?(\d{1,3}(?:-[A-Za-z]|\([A-Za-z]\)|[ ]?[A-Z]))\.?[ \t]+[\"\u201c]?[A-Z]"
)


def detect_embedded(parent_key: str, parent_official_id: str, text: str) -> list[EmbeddedRule]:
    found: list[EmbeddedRule] = []
    seen: set[str] = set()
    for m in _EMBEDDED.finditer(text):
        label = m.group(1)
        ref = parse_rule_ref(label, known_keys={_k(label)})
        if ref is None or ref.suffix is None:
            continue
        if ref.key == parent_key or ref.key in seen:
            continue
        # the inserted rule must be a *different, later* rule than its parent's base number
        if ref.base != re.match(r"\d+", parent_official_id).group(0):
            continue
        seen.add(ref.key)
        found.append(
            EmbeddedRule(
                official_rule_id=label.replace(" ", " ").strip(),
                rule_key=ref.key,
                parent_rule_key=parent_key,
                text=text[m.start():].strip("\n"),
                start_offset=m.start(),
            )
        )
    return found


def _k(label: str) -> str:
    m = re.match(r"(\d+)\D*([A-Za-z])", label)
    return f"{m.group(1)}{m.group(2).lower()}" if m else label.lower()
