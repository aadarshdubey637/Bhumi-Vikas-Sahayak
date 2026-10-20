"""Extract known facts from a question. Regex-based and deterministic; every fact says where
it came from and how confident the extraction is.  Extracted != confirmed."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from app.rules.calculations.base import CalculationError, positive
from app.rules.calculations.units import canonical_unit
from app.rules.normalization import to_ascii_digits
from app.services.hindi_text import fold_hindi

_NUM = r"(\d+(?:[.,]\d+)?)"
_AREA_U = r"(sq\.?\s*m(?:et(?:er|re)s?)?\.?|sqm|sq\.?\s*ft\.?|square\s*(?:met(?:er|re)s?|feet|foot)|sq\.?\s*yd\.?|वर्ग\s*मीटर|वर्ग\s*फुट|वर्ग\s*फीट)"
_LEN_U = r"(m|met(?:er|re)s?|mtrs?|ft|feet|foot|मीटर|फुट|फीट)"
_ROAD = r"(?:road|street|lane|सडक|रोड|गली)"
_HINDI_UNIT = {"मीटर": "m", "फुट": "ft", "फीट": "ft", "वर्ग मीटर": "sqm", "वर्ग फुट": "sqft", "वर्ग फीट": "sqft"}


@dataclass
class ExtractedFact:
    name: str
    value: str
    unit: str | None
    source: str  # user_provided | document_derived | system_calculated
    origin: str  # question_text | structured_context
    validation_status: str  # valid | invalid | unverified
    confidence: str  # high | medium | n/a
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _unit(u: str) -> str:
    u = re.sub(r"\s+", " ", u.strip().lower())
    if u in _HINDI_UNIT:
        return _HINDI_UNIT[u]
    return canonical_unit(u)[0]


def _fact(name: str, raw: str, unit_raw: str | None, confidence: str, note: str | None = None) -> ExtractedFact:
    value = raw.replace(",", ".") if re.fullmatch(r"\d+,\d+", raw) else raw.replace(",", "")
    unit = _unit(unit_raw) if unit_raw else None
    try:
        positive(value, name)
        status = "valid"
    except CalculationError:
        status = "invalid"
    return ExtractedFact(name, value, unit, "user_provided", "question_text", status, confidence, note)


def extract_facts(text: str, context: dict[str, Any] | None = None) -> list[ExtractedFact]:
    t = fold_hindi(to_ascii_digits(text))
    facts: list[ExtractedFact] = []
    taken: list[tuple[int, int]] = []

    def free(span: tuple[int, int]) -> bool:
        return not any(span[0] < b and a < span[1] for a, b in taken)

    for m in re.finditer(rf"built[\s-]*up(?:\s*area)?\s*(?:of|is|=|:)?\s*{_NUM}\s*{_AREA_U}|{_NUM}\s*{_AREA_U}\s*(?:of\s*)?built[\s-]*up|निर्मित\s*क्षेत्र(?:फल)?\s*(?:है|:)?\s*{_NUM}\s*{_AREA_U}|{_NUM}\s*{_AREA_U}\s*(?:का|के|की)?\s*निर्मित", t, re.IGNORECASE):
        if free(m.span()):
            taken.append(m.span())
            g = [x for x in m.groups() if x]
            facts.append(_fact("built_up_area", g[0], g[1], "high"))
    for m in re.finditer(rf"{_NUM}\s*{_AREA_U}", t, re.IGNORECASE):
        if free(m.span()):
            taken.append(m.span())
            plot = re.search(r"plot|प्लॉट|भूखंड", t, re.IGNORECASE)
            facts.append(_fact("plot_area" if plot else "area", m.group(1), m.group(2), "medium",
                               None if plot else "area stated without saying it is the plot area"))
    for m in re.finditer(rf"{_NUM}\s*{_LEN_U}\s*(?:wide|चौडी|चौडा|चौडाई\s*की)?\s*{_ROAD}", t, re.IGNORECASE):
        if free(m.span()):
            taken.append(m.span())
            facts.append(_fact("road_width", m.group(1), m.group(2), "high"))
    for m in re.finditer(rf"{_ROAD}\s*(?:of|is|width(?: of)?)?\s*{_NUM}\s*{_LEN_U}\s*(?:wide)?", t, re.IGNORECASE):
        if free(m.span()) and not any(f.name == "road_width" for f in facts):
            taken.append(m.span())
            facts.append(_fact("road_width", m.group(1), m.group(2), "medium"))
    for m in re.finditer(rf"{_NUM}\s*{_LEN_U}\s*(?:tall|high|height)|(?:height|ऊंचाई|ऊँचाई)\s*(?:of|is|होगी)?\s*{_NUM}\s*{_LEN_U}", t, re.IGNORECASE):
        if free(m.span()):
            taken.append(m.span())
            g = m.groups()
            val, unit = (g[0], g[1]) if g[0] else (g[2], g[3])
            facts.append(_fact("building_height", val, unit, "high"))
    for m in re.finditer(rf"{_NUM}\s*(?:floors?|storeys?|stories|story|मंजिल)", t, re.IGNORECASE):
        facts.append(_fact("floors", m.group(1), None, "high"))
    # spelled-out counts: "three-storey", "two floors", "G+2" (ground + 2), Hindi "तीन मंजिल"
    if not any(f.name == "floors" for f in facts):
        words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
                 "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10}
        w = re.search(r"\b(one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:storey|story|storeys|stories|storied|floors?)", t, re.IGNORECASE) or re.search(r"(एक|दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस)\s*मंजिल", t)
        if w:
            facts.append(_fact("floors", str(words[w.group(1).lower()]), None, "medium", "number spelled out in the question"))
        else:
            g = re.search(r"\bG\s*\+\s*(\d{1,2})\b", t, re.IGNORECASE)
            if g:
                facts.append(_fact("floors", str(int(g.group(1)) + 1), None, "medium", "from 'G+n' (ground floor plus n upper floors)"))
    for m in re.finditer(rf"{_NUM}\s*{_LEN_U}?\s*(?:x|by|\*|×|बाय)\s*{_NUM}\s*{_LEN_U}", t, re.IGNORECASE):
        if free(m.span()):
            u = m.group(2) or m.group(4)
            facts.append(_fact("plot_length", m.group(1), u, "medium", "from 'L x W' pattern; order not confirmed"))
            facts.append(_fact("plot_width", m.group(3), u, "medium", "from 'L x W' pattern; order not confirmed"))
    use = re.search(r"\b(residential|commercial|industrial|farm\s*house|institutional)\b|आवासीय|व्यावसायिक|वाणिज्यिक", t, re.IGNORECASE)
    if use:
        facts.append(ExtractedFact("building_use", use.group(0).lower(), None, "user_provided", "question_text", "unverified", "medium"))
    yr = re.search(r"\b(19\d{2}|20\d{2})\b", t)
    if yr:
        facts.append(ExtractedFact("year_mentioned", yr.group(1), None, "user_provided", "question_text", "unverified", "medium",
                                   "a year appears in the question; its role (grant date, application date...) is not inferred"))
    # structured context (user-confirmed) overrides text extraction of the same name
    for name, v in (context or {}).items():
        if isinstance(v, dict):
            value, unit = v.get("value"), v.get("unit")
        else:
            value, unit = v, None
        try:
            if name != "building_use":
                positive(value, name)
            status = "valid"
        except CalculationError:
            status = "invalid"
        facts = [f for f in facts if f.name != name]
        facts.append(ExtractedFact(name, str(value), unit, "user_provided", "structured_context", status, "n/a"))
    return facts
