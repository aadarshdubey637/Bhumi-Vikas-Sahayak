"""Guards against a class of silent bug: a regex written through a shell/heredoc can turn "\\b" into a literal backspace character,
so a word-boundary pattern quietly never matches. No source file may contain control characters."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def test_no_control_characters_in_source_files():
    offenders = []
    for folder in ("app", "scripts", "tests"):
        for f in (ROOT / folder).rglob("*.py"):
            text = f.read_text(encoding="utf-8")
            for no, line in enumerate(text.splitlines(), 1):
                if CONTROL.search(line):
                    offenders.append(f"{f.relative_to(ROOT)}:{no}")
    assert offenders == [], offenders


def test_json_data_files_are_valid_utf8_json():
    import json
    for f in (ROOT / "data" / "evaluation").glob("*.json"):
        json.loads(f.read_text(encoding="utf-8"))
