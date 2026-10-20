"""Direct, quote-backed answers for the building-permission counter.

The retrieval layer only *points* at rules.  This module states the answer (e.g. "front open space 3.0 m") in the
clerk's language, with the rule number and the exact rule text it came from.

Safety properties:
* every number comes from a table row / clause that is sliced VERBATIM out of the stored rule text (``_quote``), so a
  quote can never differ from the source; ``Quote.verified`` records that the slice was found in the stored text;
* nothing is guessed: missing inputs produce the table that applies plus a question, not an invented value;
* the corpus is the consolidated text to 6 March 2025; answers say so, and answers about plots up to 500 sq m carry
  the 28 Aug 2026 amendment caveat (its text is not available, so it is never applied or invented).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any

from app.services.entity_extraction_service import ExtractedFact
from app.services.retrieval_service import RuleStore

CORPUS_VERSION = "MP Bhumi Vikas Rules, 2012 - consolidated up to 6 March 2025"
AMENDMENT_ID = "AMD-2026-08-28-R2-5-C"

_AREA_TO_SQM = {"sqm": Decimal(1), "sqft": Decimal("0.09290304"), "sqyd": Decimal("0.83612736")}
_LEN_TO_M = {"m": Decimal(1), "ft": Decimal("0.3048"), "cm": Decimal("0.01"), "mm": Decimal("0.001")}


@dataclass
class Quote:
    rule_number: str
    rule_title: str
    page_start: int | None
    page_end: int | None
    text: str
    verified: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Requirement:
    """A numeric limit stated by the rule text for the inputs given, so a client can compare a value against it."""
    key: str  # front_open_space | rear_open_space | max_floor_area
    limit: str  # min | max
    value: str  # decimal string
    unit: str  # m | sqm
    rule: str  # e.g. "56(1)(a)"
    basis: str  # which table band produced it

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Scenario:
    """One row of a rule table when the deciding input is not known yet: "if <by> is in (lo, hi] then <value>"."""
    key: str  # front_open_space | rear_open_space
    by: str  # road_width | plot_area
    lo: str | None  # exclusive lower bound, None = no lower bound
    hi: str | None  # inclusive upper bound, None = no upper bound
    unit: str  # unit of lo/hi: m | sqm
    value: str
    value_unit: str
    rule: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Rule 56(1)(a) front open space by street width (m) and Rule 56(2)(a) rear open space by plot area (sq m): the same bands the
# solver applies when the input IS known, so a user who has not given the input still sees every possible outcome.
_FRONT_BANDS = [(None, "9", "3.0"), ("9", "12", "3.6"), ("12", "18", "4.5"), ("18", None, "6.0")]
_REAR_BANDS = [(None, "40", "0"), ("40", "150", "1.50"), ("150", "225", "2.50"), ("225", None, "3.00")]


@dataclass
class DirectAnswer:
    kind: str  # setback | fee | far | card
    headline: str
    lines: list[str] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)
    quotes: list[Quote] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    caveats: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    follow_up: str | None = None
    assumed: bool = False  # an input was assumed (and said so) rather than stated by the user
    amendment_flag: bool = False  # the pending 2026 amendment may change the outcome
    requirements: list[Requirement] = field(default_factory=list)
    scenarios: list[Scenario] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["quotes"] = [q.to_dict() for q in self.quotes]
        d["requirements"] = [r.to_dict() for r in self.requirements]
        d["scenarios"] = [x.to_dict() for x in self.scenarios]
        return d

    @property
    def all_verified(self) -> bool:
        return bool(self.quotes) and all(q.verified for q in self.quotes)

    def render(self) -> str:
        out = [self.headline, *self.lines]
        out += [f"[{q.rule_number}] {q.text}" for q in self.quotes[:0]]
        return "\n".join(out)


# ---- language ---------------------------------------------------------------------------------------------------
def _hi(language: str) -> bool:
    return language in ("hi", "hi-en")


def _t(language: str, en: str, hi: str) -> str:
    return hi if _hi(language) else en


def _fmt(d: Decimal) -> str:
    return format(d.normalize(), "f")


# ---- verbatim quoting -------------------------------------------------------------------------------------------
def _ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _quote(store: RuleStore, rule_key: str, start: str, end: str | None = None, max_lines: int = 14,
           label: str | None = None) -> Quote | None:
    """Slice whole source lines from the first line matching ``start`` up to (excluding) the first later line matching
    ``end``.  Running page-header lines are skipped.  The slice is verbatim apart from line breaks/indent."""
    rec = store.by_key.get(rule_key)
    if rec is None:
        return None
    lines = rec.original_text.splitlines()
    s_re, e_re = re.compile(start), (re.compile(end) if end else None)
    i0 = next((i for i, ln in enumerate(lines) if s_re.search(ln)), None)
    if i0 is None:
        return None
    picked: list[str] = [lines[i0]]
    for ln in lines[i0 + 1:]:
        if e_re and e_re.search(ln):
            break
        if re.match(r"^\s*Rule [\d\-A-Za-z]+\s+M\.P\. Bhumi Vikas Rules", ln):  # running header
            continue
        if not ln.strip():
            continue
        picked.append(ln)
        if len(picked) >= max_lines:
            break
    while picked and not picked[-1].strip():
        picked.pop()
    text = "\n".join(p.rstrip() for p in picked)
    flat_src = _ws(rec.original_text)
    verified = all(_ws(p) in flat_src for p in picked if p.strip())
    pg = (rec.page_start, rec.page_end)
    for ch in rec.chunks:  # narrow the page using the chunk that contains the first quoted line
        if _ws(picked[0]) and _ws(picked[0]) in _ws(ch.text):
            pg = (ch.page_start, ch.page_end)
            break
    return Quote(label or rec.official_rule_id, rec.title if not label else f"Rule {label}", pg[0], pg[1], text, verified)


def _table_row(store: RuleStore, rule_key: str, header_re: str, row_re: str) -> list[Quote]:
    """Header line of a table plus the one row that applies (both verbatim)."""
    h = _quote(store, rule_key, header_re, max_lines=1)
    r = _quote(store, rule_key, row_re, max_lines=1)
    return [q for q in (h, r) if q]


# ---- fact helpers -----------------------------------------------------------------------------------------------
def _num(facts: list[ExtractedFact], name: str, to: dict[str, Decimal]) -> Decimal | None:
    for f in facts:
        if f.name == name and f.validation_status == "valid":
            try:
                return Decimal(f.value) * to.get(f.unit or "", Decimal(1))
            except Exception:
                return None
    return None


def _area(facts: list[ExtractedFact], name: str) -> Decimal | None:
    v = _num(facts, name, _AREA_TO_SQM)
    if v is None and name == "plot_area":  # plain arithmetic from stated dimensions ("30 x 40 ft"); order is irrelevant for an area
        length, width = _length(facts, "plot_length"), _length(facts, "plot_width")
        if length is not None and width is not None:
            return (length * width).quantize(Decimal("0.01"))
    return v


def _length(facts: list[ExtractedFact], name: str) -> Decimal | None:
    return _num(facts, name, _LEN_TO_M)


def _amendment_caveat(language: str) -> str:
    return _t(language,
              "Version note: this answer is from the text consolidated to 6 March 2025. A change dated 28 Aug 2026 to the rule for plots up to 500 sq m "
              "(Rule 2(5)(c)) is reported; its official text is not in this source, so it has NOT been applied. Confirm it does not alter this answer.",
              "संस्करण सूचना: यह उत्तर 6 मार्च 2025 तक के समेकित पाठ से है। 500 वर्ग मीटर तक के प्लॉट के नियम (नियम 2(5)(c)) में 28 अगस्त 2026 को बदलाव बताया गया है; "
              "उसका आधिकारिक पाठ इस स्रोत में नहीं है, इसलिए उसे लागू नहीं किया गया है। पुष्टि कर लें कि इससे यह उत्तर नहीं बदलता।")


# =================================================================================================================
# Solver 1: open spaces (Rule 56; Rule 42 above 12.5 m)
# =================================================================================================================
def solve_setback(store: RuleStore, question: str, facts: list[ExtractedFact], lang: str) -> DirectAnswer | None:
    road, plot, height = _length(facts, "road_width"), _area(facts, "plot_area"), _length(facts, "building_height")
    asks_rear = bool(re.search(r"\brear\b|पीछे", question, re.I))
    asks_side = bool(re.search(r"\bside\b|बगल|साइड", question, re.I))
    asks_front = bool(re.search(r"\bfront\b|सामने|आगे|\baage\b", question, re.I)) or not (asks_rear or asks_side)
    non_res = re.search(r"commercial|industrial|shop|दुकान|व्यावसायिक|वाणिज्यिक|farm\s*house", question, re.I)
    if non_res:
        return None  # Rule 56 is for residential buildings; other uses are not answered by this solver
    if height is not None and height > Decimal("12.5"):
        q = _quote(store, "56", r"\(5\) Open space for building of more than 12\.5", r"\(6\) Interior open spaces")
        if not q:
            return None
        return DirectAnswer(
            "setback", _t(lang, f"For a building taller than 12.5 m ({_fmt(height)} m) the open spaces are not in Rule 56's tables; "
                                f"Rule 56(5) sends you to Tables 4 and 5 of Rule 42.",
                          f"12.5 मीटर से ऊँची इमारत ({_fmt(height)} मीटर) के लिए खुली जगह नियम 56 की तालिकाओं में नहीं है; नियम 56(5) "
                          f"आपको नियम 42 की तालिका 4 और 5 पर भेजता है।"),
            rules=["56", "42"], quotes=[q], follow_up=_t(lang, "Open Rule 42, Tables 4 and 5, for the figures.", "आँकड़ों के लिए नियम 42 की तालिका 4 और 5 देखें।"))

    quotes: list[Quote] = []
    lines: list[str] = []
    steps: list[str] = []
    missing: list[str] = []
    assumed = False
    parts: list[tuple[str, str]] = []
    reqs: list[Requirement] = []
    scen: list[Scenario] = []

    if asks_front:
        if road is None:
            missing.append("road_width")
            scen += [Scenario("front_open_space", "road_width", lo, hi, "m", v, "m", "56(1)(a)") for lo, hi, v in _FRONT_BANDS]
            tq = _quote(store, "56", r"\(1\) Front open spaces", r"\(b\) In existing developed areas", max_lines=14)
            if tq:
                quotes.append(tq)
                lines.append(_t(lang, "Front open space depends on the width of the street: up to 9 m -> 3.0 m; over 9 m to 12 m -> 3.6 m; over 12 m to 18 m -> 4.5 m; above 18 m -> 6.0 m (Rule 56(1)(a)).",
                                "सामने की खुली जगह सड़क की चौड़ाई पर निर्भर है: 9 मीटर तक -> 3.0 मीटर; 9 से 12 मीटर -> 3.6 मीटर; 12 से 18 मीटर -> 4.5 मीटर; 18 मीटर से अधिक -> 6.0 मीटर (नियम 56(1)(a))।"))
        else:
            if road <= 9:
                row, val, band = r"^\s*1\.\s+Up to 9\.0 meters", "3.0", "up to 9.0 m"
            elif road <= 12:
                row, val, band = r"^\s*2\.\s+More than 9\.0 meters and up to 12", "3.6", "more than 9.0 m and up to 12 m"
            elif road <= 18:
                row, val, band = r"^\s*3\.\s+More than 12\.0 meters and up to 18", "4.5", "more than 12 m and up to 18 m"
            else:
                row, val, band = r"^\s*4\.\s+Above 18 meters", "6.0", "above 18 m"
            quotes += _table_row(store, "56", r"Width of street facing the plot", row)
            steps.append(f"Road width {_fmt(road)} m falls in the band '{band}' of the Rule 56(1)(a) table -> front open space minimum {val} m.")
            lines.append(_t(lang, f"Front open space: minimum {val} m (street {_fmt(road)} m wide; Rule 56(1)(a)).",
                            f"सामने की खुली जगह: कम से कम {val} मीटर (सड़क {_fmt(road)} मीटर चौड़ी; नियम 56(1)(a))।"))
            parts.append((f"front {val} m", f"सामने {val} मीटर"))
            reqs.append(Requirement("front_open_space", "min", val, "m", "56(1)(a)", band))
            if road < 6:
                q = _quote(store, "56", r"\(b\) In existing developed areas with streets less than 6\.0", r"\(2\) Rear Open Space", max_lines=3)
                if q:
                    quotes.append(q)
                    lines.append(_t(lang, "Street under 6 m in an existing developed area: building line is 6.0 m from the street centre line (Rule 56(1)(b)).",
                                    "मौजूदा विकसित क्षेत्र में 6 मीटर से कम चौड़ी सड़क: भवन रेखा सड़क की मध्य रेखा से 6.0 मीटर (नियम 56(1)(b))।"))
    want_rear = asks_rear or (plot is not None and asks_front and not asks_side)
    if want_rear:
        if plot is None:
            missing.append("plot_area")
            scen += [Scenario("rear_open_space", "plot_area", lo, hi, "sqm", v, "m", "56(2)(a)") for lo, hi, v in _REAR_BANDS]
            tq = _quote(store, "56", r"\(2\) Rear Open Space", r"\(b\) Rear open space to extend", max_lines=12)
            if tq:
                quotes.append(tq)
                lines.append(_t(lang, "Rear open space depends on the plot area: up to 40 sq m -> nil; over 40 to 150 -> 1.50 m; over 150 to 225 -> 2.50 m; above 225 -> 3.00 m (Rule 56(2)(a)).",
                                "पीछे की खुली जगह प्लॉट के क्षेत्रफल पर निर्भर है: 40 वर्ग मीटर तक -> शून्य; 40 से 150 -> 1.50 मीटर; 150 से 225 -> 2.50 मीटर; 225 से अधिक -> 3.00 मीटर (नियम 56(2)(a))।"))
        else:
            if plot <= 40:
                row, val = r"^\s*1\.\s+Up to 40\.00", "Nil"
            elif plot <= 150:
                row, val = r"^\s*2\.\s+Above 40\.00 and up to 150\.00", "1.50"
            elif plot <= 225:
                row, val = r"^\s*3\.\s+Above 150 and up to 225\.00", "2.50"
            else:
                row, val = r"^\s*4\.\s+Above 225\.00", "3.00"
            quotes += _table_row(store, "56", r"Plot area in Square meters", row)
            unit = "" if val == "Nil" else " m"
            steps.append(f"Plot area {_fmt(plot)} sq m -> minimum rear open space {val}{unit} (Rule 56(2)(a) table).")
            lines.append(_t(lang, f"Rear open space: minimum {val}{unit} (plot {_fmt(plot)} sq m; Rule 56(2)(a)).",
                            f"पीछे की खुली जगह: कम से कम {'शून्य' if val == 'Nil' else val + ' मीटर'} (प्लॉट {_fmt(plot)} वर्ग मीटर; नियम 56(2)(a))।"))
            parts.append((f"rear {val}{unit}", f"पीछे {'शून्य' if val == 'Nil' else val + ' मीटर'}"))
            reqs.append(Requirement("rear_open_space", "min", "0" if val == "Nil" else val, "m", "56(2)(a)", f"plot {_fmt(plot)} sq m"))
    if asks_side or (plot is not None and asks_front):
        sq = _quote(store, "56", r"\(3\) Side open space", r"\(4\) Notwithstanding", max_lines=16)
        if sq:
            quotes.append(sq)
            if plot is not None and Decimal(125) <= plot <= Decimal(225):
                lines.append(_t(lang, "Side open space: a plot of 125-225 sq m is a semi-detached plot (Rule 53(1)(i)), so minimum 3.0 m on one side; "
                                      "2.5 m if the building is up to 10 m high and the frontage is up to 10 m (Rule 56(3)(ii)).",
                                "बगल की खुली जगह: 125-225 वर्ग मीटर का प्लॉट अर्ध-पृथक (semi-detached) श्रेणी में आता है (नियम 53(1)(i)), इसलिए एक ओर कम से कम "
                                "3.0 मीटर; भवन 10 मीटर तक ऊँचा और सामने की चौड़ाई 10 मीटर तक हो तो 2.5 मीटर (नियम 56(3)(ii))।"))
                t = _quote(store, "53", r"Semi-detached building\s+125-225", max_lines=1)
                if t:
                    quotes.append(t)
                assumed = True  # plot type inferred from area, frontage not known
            else:
                lines.append(_t(lang, "Side open space depends on building type: detached 3 m on both sides; semi-detached 3 m on one side; row type none (Rule 56(3)).",
                                "बगल की खुली जगह भवन के प्रकार पर निर्भर है: पृथक भवन में दोनों ओर 3 मीटर; अर्ध-पृथक में एक ओर 3 मीटर; पंक्ति-प्रकार में कोई नहीं (नियम 56(3))।"))
            parts.append(("side as per Rule 56(3)", "बगल नियम 56(3) के अनुसार"))

    if not parts and not missing:
        return None
    if height is None:
        assumed = True
        lines.append(_t(lang, "Assumes a residential building up to 12.5 m high (Rule 56 applies to that height band); a taller building uses Rule 42, Tables 4 and 5.",
                        "मानकर चला गया है कि आवासीय भवन 12.5 मीटर तक ऊँचा है (नियम 56 इसी ऊँचाई पर लागू है); इससे ऊँचे भवन के लिए नियम 42 की तालिका 4 और 5 देखें।"))
    caveats: list[str] = []
    amend = plot is not None and plot <= 500
    if amend:
        caveats.append(_amendment_caveat(lang))
    headline = (_t(lang, "Answer: " + "; ".join(p[0] for p in parts) + ".", "उत्तर: " + "; ".join(p[1] for p in parts) + "।") if parts
                else _t(lang, "More information is needed.", "और जानकारी चाहिए।"))
    follow = None
    if missing:
        follow = _t(lang, "Please give: " + ", ".join(m.replace("_", " ") for m in missing) + ".",
                    "कृपया बताएँ: " + ", ".join({"road_width": "सड़क की चौड़ाई", "plot_area": "प्लॉट का क्षेत्रफल"}.get(m, m) for m in missing) + "।")
    rules = ["56"] + (["53"] if any(q.rule_number == "53" for q in quotes) else [])
    return DirectAnswer("setback", headline, lines, rules, quotes, steps, caveats, missing, follow, assumed, False, reqs, scen)


# =================================================================================================================
# Solver 2: fees (Rule 21)
# =================================================================================================================
_SLABS = [(75, 750), (125, 1250), (200, 2000), (300, 3000), (400, 4000), (600, 6000), (750, 7500), (1000, 10000),
          (1250, 12500), (1500, 15000), (2000, 20000), (2500, 25000)]
_SLAB_ROW = {750: r"^\s*1\.\s+A building intended to be used\s+0\s+75\s+750", 1250: r"^\s*exclusively as residence\s+76\s+125",
             2000: r"^\s*126\s+200\s+2,000", 3000: r"^\s*201\s+300\s+3,000", 4000: r"^\s*301\s+400\s+4,000",
             6000: r"^\s*401\s+600\s+6,000", 7500: r"^\s*601\s+750\s+7,500", 10000: r"^\s*751\s+1,000\s+10,000",
             12500: r"^\s*1,001\s+1,250", 15000: r"^\s*1,251\s+1,500", 20000: r"^\s*1,501\s+2,000", 25000: r"^\s*2,001\s+2,500"}


def _slab(built_up: Decimal) -> tuple[int, str]:
    for hi, fee in _SLABS:
        if built_up <= hi:
            return fee, _SLAB_ROW[fee]
    return 50000, r"^\s*above 2500\s+50,000"


def _rs(n: Decimal | int) -> str:
    n = Decimal(n)
    return f"Rs {n:,.0f}" if n == n.to_integral_value() else f"Rs {n:,.2f}"


def solve_fee(store: RuleStore, question: str, facts: list[ExtractedFact], lang: str) -> DirectAnswer | None:
    built = _area(facts, "built_up_area")
    plot = _area(facts, "plot_area")
    shop = bool(re.search(r"commercial|\bshops?\b|दुकान|व्यावसायिक|वाणिज्यिक|factory|store\s*house|godown", question, re.I))
    shop_cum_res = bool(re.search(r"shop[- ]cum[- ]residen|दुकान.{0,12}(?:सह|और).{0,12}आवास", question, re.I))
    if shop_cum_res:
        shop = False
    high_rise = bool(re.search(r"high[- ]?rise|हाई[- ]?राइज|ऊँची इमारत|ऊंची इमारत", question, re.I))
    if re.search(r"cinema|theatre|theater", question, re.I):
        return None
    app = _quote(store, "21", r"\(ii\) for the Building Permission Rs 1\.00 per Square meter", r"\(iii\) application fee", max_lines=2)
    if not app:
        return None
    quotes: list[Quote] = [app]
    lines = [_t(lang, "Application fee: Rs 1.00 per sq m of the proposed built-up area; it is never refunded (Rule 21(2)(ii), (iii)).",
                "आवेदन शुल्क: प्रस्तावित निर्मित क्षेत्र (built-up area) का Rs 1.00 प्रति वर्ग मीटर; यह किसी भी स्थिति में वापस नहीं होता (नियम 21(2)(ii), (iii))।")]
    use_en = "shop/commercial" if shop else ("shop-cum-residence" if shop_cum_res else "residence")
    use_hi = "दुकान/व्यावसायिक" if shop else ("दुकान सह आवास" if shop_cum_res else "आवासीय")
    ask_area = _t(lang, "What is the proposed built-up area (sq m)?", "प्रस्तावित निर्मित क्षेत्र (वर्ग मीटर में) कितना है?")
    caveats = [_amendment_caveat(lang)] if plot is not None and plot <= 500 else []

    if high_rise:
        pct = Decimal(100) if shop else (Decimal(50) if shop_cum_res else Decimal(0))
        hr = _quote(store, "21", r"\(c\) In case of building permission of high rise buildings", r"^\s*5\.\s+A building intended to be used for", max_lines=12)
        if hr:
            quotes.append(hr)
        if built is None:
            uplift_en = f", plus {pct:.0f}% for this use" if pct else ""
            uplift_hi = f", इस उपयोग के लिए {pct:.0f}% अतिरिक्त" if pct else ""
            return DirectAnswer(
                "fee", _t(lang, f"High-rise building permission fee ({use_en}): Rs 10.00 per sq m of built-up area{uplift_en} (Rule 21(3)(c)). Give the built-up area for the amount.",
                          f"हाई-राइज भवन की अनुमति फीस ({use_hi}): निर्मित क्षेत्र का Rs 10.00 प्रति वर्ग मीटर{uplift_hi} (नियम 21(3)(c))। राशि के लिए निर्मित क्षेत्र बताएँ।"),
                lines, ["21"], quotes, [], caveats, ["built_up_area"], ask_area)
        perm = built * 10 * (1 + pct / 100)
        total = built + perm
        up = f" + {pct:.0f}% = {_rs(perm)}" if pct else ""
        lines.append(_t(lang, f"Permission fee (high-rise, {use_en}): {_fmt(built)} sq m x Rs 10 = {_rs(built * 10)}{up} (Rule 21(3)(c)).",
                        f"अनुमति शुल्क (हाई-राइज, {use_hi}): {_fmt(built)} वर्ग मीटर x Rs 10 = {_rs(built * 10)}{up} (नियम 21(3)(c))।"))
        head = _t(lang, f"Answer: {_rs(total)} in fees (application {_rs(built)} + permission {_rs(perm)}).",
                  f"उत्तर: कुल फीस {_rs(total)} (आवेदन {_rs(built)} + अनुमति {_rs(perm)})।")
        return DirectAnswer("fee", head, lines, ["21"], quotes, [f"Permission fee = {_fmt(built)} x 10 x (1 + {pct}%) = {_rs(perm)}"], caveats)

    pct = Decimal(50) if (shop or shop_cum_res) else Decimal(0)
    use_area, illustrated = built, False
    if use_area is None and plot is not None:  # illustration at the most the FAR allows
        use_area, illustrated = plot * Decimal("1.25"), True
    if use_area is None:
        hdr = _quote(store, "21", r"\(b\) In case of a building permission \(other than high rise buildings\)", max_lines=3)
        if hdr:
            quotes.append(hdr)
        item = 2 if shop else 4
        uplift_en = f" For {use_en} add 50% of the permission fee (Rule 21(3)(b), item {item})." if pct else ""
        uplift_hi = f" {use_hi} पर अनुमति शुल्क का 50% अतिरिक्त (नियम 21(3)(b), मद {item})।" if pct else ""
        return DirectAnswer(
            "fee", _t(lang, "Building permission fee (not high-rise): Rs 1.00 per sq m application fee, plus a permission fee by slab of built-up area "
                            "(Rs 750 up to 75 sq m ... Rs 3,000 for 201-300 sq m ... Rs 50,000 above 2,500 sq m)." + uplift_en + " Give the built-up area for the exact amount.",
                      "भवन अनुमति फीस (हाई-राइज नहीं): आवेदन शुल्क Rs 1.00 प्रति वर्ग मीटर, और निर्मित क्षेत्र के स्लैब के अनुसार अनुमति शुल्क "
                      "(75 वर्ग मीटर तक Rs 750 ... 201-300 वर्ग मीटर के लिए Rs 3,000 ... 2,500 वर्ग मीटर से अधिक पर Rs 50,000)।" + uplift_hi + " सटीक राशि के लिए निर्मित क्षेत्र बताएँ।"),
            [*lines, _t(lang, "Example: a residence of 150 sq m built-up area -> application Rs 150 + permission Rs 2,000 = Rs 2,150.", "उदाहरण: 150 वर्ग मीटर निर्मित क्षेत्र का आवासीय भवन -> आवेदन Rs 150 + अनुमति Rs 2,000 = Rs 2,150।")],
            ["21"], quotes, [], [_t(lang, "High-rise buildings are charged under Rule 21(3)(c).", "हाई-राइज भवनों पर नियम 21(3)(c) लगता है।"), *caveats],
            ["built_up_area"], ask_area)

    base_fee, row = _slab(use_area)
    perm = Decimal(base_fee) * (1 + pct / 100)
    app_amt = use_area
    total = app_amt + perm
    sq = _quote(store, "21", r"Built up area\s+To", max_lines=2)
    if sq:
        quotes.append(sq)
    quotes += [q for q in [_quote(store, "21", row, max_lines=1)] if q]
    if pct:
        item_re = r"^\s*2\.\s+A building intended to be used as shops" if shop else r"^\s*4\.\s+A building intended to be used for shops"
        q = _quote(store, "21", item_re, r"^\s*(?:3|5)\.\s+A building intended to be used", max_lines=4)
        if q:
            quotes.append(q)
    steps = [f"Application fee = {_fmt(use_area)} sq m x Rs 1.00 = {_rs(app_amt)}.",
             f"Permission fee: built-up area {_fmt(use_area)} sq m falls in the Rule 21(3)(b) item 1 slab -> {_rs(base_fee)}"
             + (f"; +{pct:.0f}% for {use_en} = {_rs(perm)}." if pct else ".")]
    uplift = _t(lang, f" +50% for {use_en} = {_rs(perm)}.", f" + 50% ({use_hi}) = {_rs(perm)}।") if pct else ""
    note = (_t(lang, f" (illustration only: the most the 1.25 FAR allows on a {_fmt(plot or 0)} sq m plot; your actual built-up area will differ)",
               f" (केवल उदाहरण: {_fmt(plot or 0)} वर्ग मीटर के प्लॉट पर 1.25 FAR से अधिकतम अनुमत क्षेत्र; आपका वास्तविक निर्मित क्षेत्र अलग होगा)") if illustrated else "")
    lines.append(_t(lang, f"Permission fee: {_rs(base_fee)} for built-up area {_fmt(use_area)} sq m (Rule 21(3)(b), item 1).{uplift}{note}",
                    f"अनुमति शुल्क: निर्मित क्षेत्र {_fmt(use_area)} वर्ग मीटर के लिए {_rs(base_fee)} (नियम 21(3)(b), मद 1)।{uplift}{note}"))
    lines.append(_t(lang, f"Total: {_rs(app_amt)} + {_rs(perm)} = {_rs(total)}.", f"कुल: {_rs(app_amt)} + {_rs(perm)} = {_rs(total)}।"))
    caveats = [_t(lang, "Not high-rise. High-rise buildings are charged under Rule 21(3)(c).", "हाई-राइज नहीं मानकर। हाई-राइज भवनों पर नियम 21(3)(c) लगता है।"), *caveats]
    if illustrated:
        head = _t(lang, f"Answer: the fee depends on the built-up area, which was not given. At the most the FAR allows ({_fmt(use_area)} sq m) it would be {_rs(total)} "
                        f"(application {_rs(app_amt)} + permission {_rs(perm)}).",
                  f"उत्तर: फीस निर्मित क्षेत्र पर निर्भर है, जो नहीं बताया गया। FAR से अधिकतम अनुमत क्षेत्र ({_fmt(use_area)} वर्ग मीटर) पर यह {_rs(total)} होगी "
                  f"(आवेदन {_rs(app_amt)} + अनुमति {_rs(perm)})।")
        return DirectAnswer("fee", head, lines, ["21"], quotes, steps, caveats, ["built_up_area"], ask_area, True)
    head = _t(lang, f"Answer: {_rs(total)} in fees (application {_rs(app_amt)} + permission {_rs(perm)}).",
              f"उत्तर: कुल फीस {_rs(total)} (आवेदन {_rs(app_amt)} + अनुमति {_rs(perm)})।")
    return DirectAnswer("fee", head, lines, ["21"], quotes, steps, caveats)


# =================================================================================================================
# Solver 3: FAR / floors / height
# =================================================================================================================
def solve_far(store: RuleStore, question: str, facts: list[ExtractedFact], lang: str) -> DirectAnswer | None:
    if re.search(r"farm\s*house|फार्म\s*हाउस", question, re.I):
        return None  # handled by the Rule 17 card
    plot = _area(facts, "plot_area")
    far_q = _quote(store, "61", r"^\s*1\.\s+Resdential\s+1\.25", max_lines=1)
    hdr = _quote(store, "61", r"S\.No\.\s+Use Group\s+FAR", max_lines=1)
    if not far_q:
        return None
    quotes = [q for q in (hdr, far_q) if q]
    lines = [_t(lang, "Maximum FAR for residential use is 1.25 (Rule 61, Table 8). FAR may instead follow the Development Plan of the town (note * to Table 8).",
                "आवासीय उपयोग के लिए अधिकतम FAR 1.25 है (नियम 61, तालिका 8)। नगर के विकास योजना में अलग FAR हो तो वही अपनाया जा सकता है (तालिका 8 का टिप्पणी *)।")]
    steps: list[str] = []
    rules = ["61"]
    caveats: list[str] = []
    asks_floors = bool(re.search(r"floor|storey|stories|मंजिल|manzil", question, re.I))
    if plot is not None:
        cap = plot * Decimal("1.25")
        steps.append(f"Maximum total floor area = plot {_fmt(plot)} sq m x FAR 1.25 = {_fmt(cap)} sq m (all floors together).")
        lines.append(_t(lang, f"On a {_fmt(plot)} sq m plot that is a maximum total floor area of {_fmt(cap)} sq m across all floors (Rule 61).",
                        f"{_fmt(plot)} वर्ग मीटर के प्लॉट पर इसका अर्थ है सभी मंजिलों को मिलाकर अधिकतम {_fmt(cap)} वर्ग मीटर फ़्लोर एरिया (नियम 61)।"))
        if plot >= 200:
            n4 = _quote(store, "61", r"\(4\) Covered parking with a clear height", r"\(5\) In case of redevelopment", max_lines=4)
            if n4:
                quotes.append(n4)
                lines.append(_t(lang, "Covered parking (2.4 m clear height) inside the permitted ground coverage on a plot of 200 sq m or more is not counted in FAR or height (Rule 61 Note 4).",
                                "200 वर्ग मीटर या अधिक के प्लॉट पर अनुमत ग्राउंड कवरेज के भीतर ढकी पार्किंग (2.4 मीटर साफ ऊँचाई) FAR और ऊँचाई में नहीं गिनी जाती (नियम 61 टिप्पणी 4)।"))
    floors = _num(facts, "floors", {})
    missing_far: list[str] = []
    follow_far: str | None = None
    if asks_floors and floors is not None and floors >= 1:
        if plot is not None:
            per = plot * Decimal("1.25") / floors
            steps.append(f"Maximum total floor area {_fmt(plot * Decimal('1.25'))} sq m / {_fmt(floors)} floors = {_fmt(per.quantize(Decimal('0.01')))} sq m per floor if every floor is the same size.")
            lines.append(_t(lang, f"For {_fmt(floors)} floors that leaves about {_fmt(per.quantize(Decimal('0.01')))} sq m of floor area per floor if all floors are equal (Rule 61 FAR; arithmetic only, the rules do not fix the number of floors).",
                            f"{_fmt(floors)} मंजिलों के लिए, सभी मंजिलें बराबर हों तो प्रति मंजिल लगभग {_fmt(per.quantize(Decimal('0.01')))} वर्ग मीटर फ़्लोर एरिया बचता है (नियम 61 FAR; केवल गणित, नियम मंजिलों की संख्या तय नहीं करते)।"))
        if _length(facts, "building_height") is None:
            missing_far.append("building_height")
        follow_far = _t(lang, "Please give the proposed building height and the road width; they decide the open spaces and whether Rule 42 applies.",
                        "कृपया प्रस्तावित भवन की ऊँचाई और सड़क की चौड़ाई बताएँ; इन्हीं से खुली जगह और नियम 42 की लागू होने की स्थिति तय होती है।")
    if asks_floors:
        lines.append(_t(lang, "The rules do not fix a number of floors for an ordinary house. The limits are FAR (above), the height band (up to 12.5 m uses Rule 56's open spaces; "
                              "above 12.5 m needs Rule 42's extra provisions and a lift under Rule 83) and the Development Plan.",
                        "नियम सामान्य मकान के लिए मंजिलों की संख्या तय नहीं करते। सीमाएँ हैं: FAR (ऊपर), ऊँचाई का दायरा (12.5 मीटर तक नियम 56 की खुली जगह; 12.5 मीटर से ऊपर नियम 42 के अतिरिक्त प्रावधान "
                        "और नियम 83 के अनुसार लिफ्ट) तथा विकास योजना।"))
        rules += [r for r in ("56", "42", "83") if r not in rules]
    amend = plot is not None and plot <= 500
    if amend:
        caveats.append(_amendment_caveat(lang))
    headline = _t(lang, "Answer: maximum FAR (residential) = 1.25" + (f"; maximum total floor area {_fmt(plot * Decimal('1.25'))} sq m." if plot is not None else "."),
                  "उत्तर: आवासीय के लिए अधिकतम FAR = 1.25" + (f"; कुल अधिकतम फ़्लोर एरिया {_fmt(plot * Decimal('1.25'))} वर्ग मीटर।" if plot is not None else "।"))
    reqs = [Requirement("max_floor_area", "max", _fmt(plot * Decimal("1.25")), "sqm", "61 (Table 8)", "residential FAR 1.25")] if plot is not None else []
    return DirectAnswer("far", headline, lines, rules, quotes, steps, caveats, missing_far, follow_far, False, False, reqs)


# =================================================================================================================
# Cards: fixed-content answers for common non-numeric questions (EN + HI), each with verbatim anchors
# =================================================================================================================
@dataclass(frozen=True)
class Card:
    id: str
    pattern: str  # matched against the lower-cased question (EN, Hindi, romanised Hindi)
    rule: str
    anchors: tuple[tuple[Any, ...], ...]  # (start_regex, end_regex, max_lines) or (rule, start, end, max_lines) -> verbatim quotes
    en: tuple[str, ...]  # headline, then detail lines
    hi: tuple[str, ...]
    amendment: bool = False


CARDS: list[Card] = [
    Card("farm_house", r"farm\s*-?house|फार्म\s*हाउस|farmhouse", "17",
         ((r"^17\. Permission of farm House", r"\(c\) The maximum height", 6),),
         ("Answer: a farm house needs a plot of at least 0.40 hectare, and the maximum FAR is 0.10 (Rule 17(a), (b)).",
          "Other conditions: maximum height 7.5 m with sloping roof; at least 100 live trees per hectare before applying; road access at least 7.5 m wide; 7.5 m open space on all sides (Rule 17(c)-(f)).",
          "0.40 hectare = 4,000 sq m."),
         ("उत्तर: फार्म हाउस के लिए प्लॉट कम से कम 0.40 हेक्टेयर (4,000 वर्ग मीटर) का होना चाहिए और अधिकतम FAR 0.10 है (नियम 17(a), (b))।",
          "अन्य शर्तें: अधिकतम ऊँचाई 7.5 मीटर (ढलवाँ छत); आवेदन से पहले प्रति हेक्टेयर कम से कम 100 जीवित वृक्ष; पहुँच मार्ग कम से कम 7.5 मीटर चौड़ा; चारों ओर 7.5 मीटर खुली जगह (नियम 17(c)-(f))।")),
    Card("validity", r"valid(ity)?\b.*renew|renew|revalidat|how long.*(stay|remain).*valid|kitne saal|कितने साल|वैध|नवीनीकरण|रिन्यू|duration of sanction", "23",
         ((r"^23\. Duration of sanction", r"\(3\) In case execution", 12),
          (r"\(3\) In case execution of the project begins", None, 4)),
         ("Answer: a development permission stays valid for 3 years. It can be revalidated twice, one year each time; after that a fresh proposal is needed (Rule 23(1), (2)). "
          "The overall limit of five years is not relaxed.",
          "Granted in 2023 -> initial validity ends in 2026; the two revalidations take it to 2028 at most. Apply for revalidation BEFORE it expires, otherwise a permission fee equal to Rule 21(3)(a) is charged.",
          "If execution of the project begins during the validity, the permission does not lapse later (Rule 23(3))."),
         ("उत्तर: विकास अनुमति 3 वर्ष तक वैध रहती है। इसे दो बार, हर बार एक वर्ष के लिए पुनः वैध (revalidate) कराया जा सकता है; उसके बाद नया प्रस्ताव देना होगा (नियम 23(1), (2))। पाँच वर्ष की अधिकतम सीमा में छूट नहीं है।",
          "2023 में मिली अनुमति की प्रारंभिक वैधता 2026 में समाप्त होती है; दो नवीनीकरण के बाद अधिकतम 2028 तक। नवीनीकरण का आवेदन समाप्ति से पहले दें, अन्यथा नियम 21(3)(a) के बराबर अनुमति शुल्क लगता है।",
          "यदि वैधता के दौरान परियोजना का काम शुरू हो गया, तो अनुमति बाद में समाप्त नहीं मानी जाती (नियम 23(3))।"),
         ),
    Card("deemed", r"not replied|not respond|no reply|has not (?:replied|answered)|miss(?:es|ed)? the deadline|deemed|jawab nahi|जवाब नहीं|उत्तर नहीं|समय सीमा|समयसीमा|limitation period", "28",
         ((r"^28\. Limitation period", r"COMMENTS", 14),
          ("26b", r"\(1\) Each authorised Architect/Structural Engineer shall issue", r"\(2\) To accord such permission", 3),
          ("12", r"^\s*12 A\. For residential plots up to", r"\(1\) The applicant shall have to submit", 2, "12-A")),
         ("Answer: if the Authority does not send a written refusal within the period fixed by Section 30(5) of the Act, the permission is deemed sanctioned (Rule 28). "
          "The number of days is in the Act, not in these rules.",
          "Exceptions: this does not allow anything that breaks the Act, the Rules, the Development/Zoning Plan, lease/title terms or other law. "
          "If the delay is with an authorised Architect/Structural Engineer, the permission is NOT deemed granted (proviso).",
          "Separately, an authorised Architect/Structural Engineer must issue building permission within 30 days (Rule 26-B(1)); residential plots up to 186 sq m can use instant/deemed approval (Rule 12-A)."),
         ("उत्तर: यदि प्राधिकारी अधिनियम की धारा 30(5) में तय अवधि में लिखित अस्वीकृति नहीं भेजता, तो अनुमति स्वीकृत मानी जाती है (नियम 28)। दिनों की संख्या अधिनियम में है, इन नियमों में नहीं।",
          "अपवाद: इससे अधिनियम, नियमों, विकास/ज़ोनिंग योजना, पट्टे/स्वामित्व की शर्तों या अन्य कानून के विरुद्ध कुछ करने की अनुमति नहीं मिलती। अधिकृत आर्किटेक्ट/स्ट्रक्चरल इंजीनियर के स्तर पर देरी हो तो अनुमति स्वीकृत नहीं मानी जाती (परंतुक)।",
          "इसके अलावा, अधिकृत आर्किटेक्ट/स्ट्रक्चरल इंजीनियर को 30 दिन के भीतर भवन अनुमति देनी होती है (नियम 26-B(1)); 186 वर्ग मीटर तक के आवासीय प्लॉट पर तत्काल/मानी हुई स्वीकृति मिल सकती है (नियम 12-A)।"),
         ()),
    Card("electric", r"electric|overhead|power line|bijli|बिजली|तार|high tension|\bline\b.*balcon|balcon.*\bline\b|बालकनी", "52",
         ((r"^52\. Distance from electric lines", r"\(2\) The minimum clearance", 14),),
         ("Answer: for low and medium voltage lines the building (including a balcony or verandah) must stay at least 2.5 m away vertically and 1.2 m horizontally (Rule 52(1)(a)).",
          "Use the larger of this table and the applicable Electricity Rules. High voltage up to 33,000 V: 3.7 m vertical, 1.2 m horizontal. Above 33,000 V: 15 m clear corridor (7.5 m each side of centre line)."),
         ("उत्तर: निम्न और मध्यम वोल्टेज लाइन से भवन (बालकनी/बरामदे सहित) कम से कम 2.5 मीटर ऊर्ध्वाधर और 1.2 मीटर क्षैतिज दूरी पर रहना चाहिए (नियम 52(1)(a))।",
          "इस तालिका और लागू विद्युत नियमों में से जो अधिक हो वही मानें। उच्च वोल्टेज (33,000 वोल्ट तक): 3.7 मीटर ऊर्ध्वाधर, 1.2 मीटर क्षैतिज। 33,000 वोल्ट से ऊपर: 15 मीटर का खुला गलियारा (मध्य रेखा के दोनों ओर 7.5 मीटर)।")),
    Card("sign_plans", r"who (?:is|are|can).*(sign|submit|prepare)|sign.*plan|submit.*plan|kaun.*sign|कौन.*(?:हस्ताक्षर|साइन)|हस्ताक्षर|साइन", "26",
         ((r"\(9\) An Architect or a licensed Structural engineer", r"\(E\) Town Planner-Competence", 40),
          ("18", r"^18\. Preparation and signing of plans", None, 6)),
         ("Answer: plans must be prepared and signed by a licensed Architect, Structural Engineer, Engineer, Supervisor or Town Planner (with name, address, qualification and licence number), and also signed by the owner/applicant (Rule 18).",
          "Who can submit what (Rule 26(9)): Architect - all plans for all buildings; Structural Engineer - residential plots up to 500 sq m and up to 3 storeys/11 m; "
          "Engineer - residential plots up to 300 sq m and up to 2 storeys/7.5 m; Supervisor - residential plots up to 200 sq m and up to 2 storeys/7.5 m."),
         ("उत्तर: नक्शे लाइसेंसधारी आर्किटेक्ट, स्ट्रक्चरल इंजीनियर, इंजीनियर, सुपरवाइज़र या टाउन प्लानर द्वारा बनाए और हस्ताक्षरित होने चाहिए (नाम, पता, योग्यता और लाइसेंस नंबर सहित), और मालिक/आवेदक के भी हस्ताक्षर होने चाहिए (नियम 18)।",
          "कौन क्या जमा कर सकता है (नियम 26(9)): आर्किटेक्ट - सभी भवनों के सभी नक्शे; स्ट्रक्चरल इंजीनियर - 500 वर्ग मीटर तक के आवासीय प्लॉट, 3 मंजिल/11 मीटर तक; "
          "इंजीनियर - 300 वर्ग मीटर तक के आवासीय प्लॉट, 2 मंजिल/7.5 मीटर तक; सुपरवाइज़र - 200 वर्ग मीटर तक के आवासीय प्लॉट, 2 मंजिल/7.5 मीटर तक।"),
         ),
    Card("documents", r"document|enclos|accompan|दस्तावेज|कागज|documents go", "16",
         ((r"^16\. Information accompanying application", r"\(2\) Size of Drawing sheets", 12),
          ("14", r"\(2\) In case of building permission, the application shall also be accompanied", r"\(3\) Application for modification", 5),
          ("21", r"\(1\) Every application referred to in rule 14", r"\(2\) Application Fee", 5)),
         ("Answer: an application for building permission (Appendix A-2) goes with: the application fee, key plan, site plans, sub-division/layout plan approved under section 30, building plans, "
          "service plans, project report, proof of ownership or legal right, proof of authority if the applicant is not the owner, parking plans with calculations, and the certificate of supervision (Rule 16(1)(b)).",
          "Also: a structural-safety certificate (Rule 14(2)) and a copy of the fee receipt - an application without the receipt is rejected (Rule 21(1)). Plans in quadruplicate plus an electronic copy (Rule 14(1))."),
         ("उत्तर: भवन अनुमति के आवेदन (परिशिष्ट A-2) के साथ लगते हैं: आवेदन शुल्क, की-प्लान, साइट प्लान, धारा 30 के अंतर्गत स्वीकृत उप-विभाजन/लेआउट प्लान, भवन के नक्शे, "
          "सर्विस प्लान, परियोजना रिपोर्ट, स्वामित्व या वैध अधिकार का प्रमाण, आवेदक मालिक न हो तो प्राधिकार का प्रमाण, गणना सहित पार्किंग प्लान और पर्यवेक्षण प्रमाणपत्र (नियम 16(1)(b))।",
          "साथ में: संरचनात्मक सुरक्षा का प्रमाणपत्र (नियम 14(2)) और शुल्क की रसीद की प्रति - रसीद के बिना आवेदन अस्वीकार हो जाता है (नियम 21(1))। नक्शे चार प्रतियों में और एक इलेक्ट्रॉनिक प्रति (नियम 14(1))।"),
         ),
    Card("change_plan", r"change.*plan|modif|deviat|alter|after (?:it is |its? )?sanction|badlav|बदलाव|संशोधन करना|स्वीकृति के बाद|plan.*sanction", "24",
         ((r"^24\. Deviation from sanctioned plan", r"\(2\) For every floor", 9),
          ("21", r"^\s*8\.\s+In case of addition or alteration in the", r"^\s*9\.\s+Revalidation", 6)),
         ("Answer: only within limits. No deviation from the sanctioned plan is allowed if it affects the front marginal open space, exceeds 30% of the permissible FAR, relates to the parking area or public utility space, "
          "enters the road boundary/alignment, or falls in a water body area or within 30 m of one (Rule 24(1)). Other deviations can be compounded for a fee (Rule 24(3)).",
          "If you want to alter the proposed plan: up to 10% change needs only Rs 500; above 10% needs a fresh application (Rule 21(3)(b), item 8)."),
         ("उत्तर: केवल सीमा के भीतर। स्वीकृत नक्शे से कोई विचलन तब अनुमत नहीं है जब वह सामने की मार्जिनल खुली जगह को प्रभावित करे, अनुमत FAR के 30% से अधिक हो, पार्किंग या सार्वजनिक उपयोगिता की जगह से जुड़ा हो, "
          "सड़क की सीमा/संरेखण में आए, या जलाशय क्षेत्र में या उससे 30 मीटर के भीतर हो (नियम 24(1))। अन्य विचलन शुल्क देकर नियमित (compound) कराए जा सकते हैं (नियम 24(3))।",
          "प्रस्तावित नक्शे में बदलाव: 10% तक के लिए केवल Rs 500; 10% से अधिक पर नया आवेदन आवश्यक (नियम 21(3)(b), मद 8)।"),
         ),
    Card("dev_plan_conflict", r"development plan.*(?:disagree|conflict|differ|contrary)|(?:disagree|conflict|differ|contrary).*development plan|विकास योजना.*(?:अलग|विरोध|विपरीत)|which rule decides", "103",
         ((r"103\. Provisions of development plan", r"^1$", 8),),
         ("Answer: Rule 103. The norms in the relevant Development Plan apply. If they differ from or contradict these rules, the Director examines it and sends a proposal to the Government, whose decision is final and becomes part of the Development Plan.",),
         ("उत्तर: नियम 103। संबंधित विकास योजना के मानक लागू होते हैं। यदि वे इन नियमों से भिन्न या विपरीत हों, तो संचालक (Director) परीक्षण कर सरकार को प्रस्ताव भेजता है; सरकार का निर्णय अंतिम होता है और विकास योजना का अभिन्न अंग बन जाता है।",)),
    Card("lift", r"\blifts?\b|escalator|elevator|लिफ्ट", "83",
         ((r"83\. Provision of Lifts", r"\(1\) Every owner shall furnish", 6),),
         ("Answer: yes - a lift must be provided in a building more than 12.5 m high (Rule 83), so a building taller than 15 m needs one. Design and installation must follow Section 5 of Part VIII of the National Building Code.",
          "Owner duties: give lift details with the permission application (Appendix A-2(A)); submit a completion report (Appendix E-3(A)); insure the lift; six-monthly safety and audit report by a Lift Engineer; "
          "report any accident within 24 hours (Rule 83(1)-(9)). An owner using a lift in their own residence is exempt from the registration fee and the six-monthly report."),
         ("उत्तर: हाँ - 12.5 मीटर से अधिक ऊँचे भवन में लिफ्ट देना अनिवार्य है (नियम 83), इसलिए 15 मीटर से ऊँची इमारत में लिफ्ट आवश्यक है। डिज़ाइन और स्थापना राष्ट्रीय भवन संहिता (NBC) भाग-8 की धारा 5 के अनुसार होनी चाहिए।",
          "मालिक के कर्तव्य: अनुमति आवेदन के साथ लिफ्ट का विवरण (परिशिष्ट A-2(A)); पूर्णता रिपोर्ट (परिशिष्ट E-3(A)); लिफ्ट का बीमा; लिफ्ट इंजीनियर की छमाही सुरक्षा व ऑडिट रिपोर्ट; "
          "दुर्घटना की सूचना 24 घंटे में (नियम 83(1)-(9))। अपने आवास में लिफ्ट प्रयोग करने वाले मालिक को पंजीयन शुल्क और छमाही रिपोर्ट से छूट है।")),
    Card("dev_permission_300", r"separate development permission|development permission.*(?:plot|sq)|(?:plot|sq).*development permission|विकास अनुमति", "12",
         ((r"^12\. Permission for development or for construction", r"Provided that no permission shall be required", 4),
          ("12", r"^\s*12 A\. For residential plots up to", r"\(1\) The applicant shall have to submit", 2, "12-A"),
          ("2", r"^\s*\(5\) \"Authority having jurisdiction\"", r"^\s*\(b\) the Municipal Corporation", 4)),
         ("Answer (under the text consolidated to 6 March 2025): Rule 12(1) requires prior written permission for any development or construction; the exemptions list (windows, painting, repairs, etc.) does not include building on a 300 sq m plot. "
          "Development permission is granted by the Director of Town & Country Planning, and building permission by the local body (Rule 2(5), 2(8)). The fast instant/deemed route (Rule 12-A) stops at 186 sq m, so it does not cover 300 sq m.",
          "IMPORTANT: this is exactly the rule changed on 28 Aug 2026 (plots up to 500 sq m, Rule 2(5)(c)). The new text is not in the source, so this answer may be out of date for a 300 sq m plot that matches the Development Plan. Check the notification before telling the citizen."),
         ("उत्तर (6 मार्च 2025 तक के समेकित पाठ के अनुसार): नियम 12(1) के अनुसार किसी भी विकास या निर्माण के लिए पूर्व लिखित अनुमति आवश्यक है; छूट की सूची (खिड़की, रंगाई, मरम्मत आदि) में 300 वर्ग मीटर के प्लॉट पर निर्माण शामिल नहीं है। "
          "विकास अनुमति नगर तथा ग्राम निवेश संचालक देता है और भवन अनुमति स्थानीय निकाय (नियम 2(5), 2(8))। तुरंत/मानी हुई स्वीकृति (नियम 12-A) 186 वर्ग मीटर तक ही है, इसलिए 300 वर्ग मीटर पर लागू नहीं।",
          "महत्वपूर्ण: यही वह नियम है जो 28 अगस्त 2026 को बदला (500 वर्ग मीटर तक के प्लॉट, नियम 2(5)(c))। नया पाठ स्रोत में नहीं है, इसलिए विकास योजना के अनुरूप 300 वर्ग मीटर के प्लॉट के लिए यह उत्तर पुराना हो सकता है। नागरिक को बताने से पहले अधिसूचना जाँचें।"),
         amendment=True),
]

_FAMILIES_FIRST = ("dev_permission_300", "deemed", "dev_plan_conflict", "sign_plans", "farm_house", "electric", "lift", "validity", "change_plan", "documents")


def solve_card(store: RuleStore, question: str, lang: str, plot: Decimal | None = None) -> DirectAnswer | None:
    q = question.lower()
    order = sorted(CARDS, key=lambda c: _FAMILIES_FIRST.index(c.id) if c.id in _FAMILIES_FIRST else 99)
    for c in order:
        if not re.search(c.pattern, q, re.I | re.S):
            continue
        if c.id == "dev_permission_300" and not re.search(r"development permission|विकास अनुमति", q):
            continue
        quotes = [x for a in c.anchors
                  if (x := _quote(store, *((c.rule, *a) if len(a) == 3 else a)))]
        if not quotes:
            continue
        text = c.hi if _hi(lang) else c.en
        cited = list(dict.fromkeys(q.rule_number for q in quotes))
        caveats = [_amendment_caveat(lang)] if (plot is not None and plot <= 500 and not c.amendment) else []
        return DirectAnswer("card", text[0], list(text[1:]), cited, quotes, caveats=caveats, amendment_flag=c.amendment)
    return None


# =================================================================================================================
def solve(store: RuleStore, intent: str, question: str, facts: list[ExtractedFact], lang: str) -> list[DirectAnswer]:
    """All direct answers that apply (a compound question like 'setback, floors and fee' yields several)."""
    out: list[DirectAnswer] = []
    wants_fee = bool(re.search(r"\bfees?\b|\bcharges?\b|फीस|शुल्क|\bfee\b|kitni fees", question, re.I))
    wants_open = bool(re.search(r"open space|set\s?back|\bmargins?\b|\bfront\b|\brear\b|\bside\b|\bch+h?od|खाली|सामने|आगे|पीछे|\baage\b|सेट\s?बैक|मार्जिन|छोड|खुली|ओपन|बगल|साइड", question, re.I))
    wants_far = bool(re.search(r"\bFAR\b", question) or  # case-sensitive: "how far" is not the abbreviation
                     re.search(r"floor area|\bfloors?\b|storeys?|stories|मंजिल|manzil|\bheight\b|ऊंचाई|ऊँचाई|फ़्लोर|फ्लोर", question, re.I)) \
        and not re.search(r"farm\s*house|फार्म", question, re.I)
    if wants_far and not wants_open and re.search(r"storey|stories|\bfloors?\b|मंजिल", question, re.I):
        wants_open = True  # "can I build N floors?" depends on the open spaces as well as FAR
    if wants_open:
        a = solve_setback(store, question, facts, lang)
        if a:
            out.append(a)
    if wants_far or (wants_open and re.search(r"floor|storey|मंजिल", question, re.I)):
        a = solve_far(store, question, facts, lang)
        if a:
            out.append(a)
    if wants_fee:
        a = solve_fee(store, question, facts, lang)
        if a:
            out.append(a)
    if not out:
        plot = _area(facts, "plot_area")
        a = solve_card(store, question, lang, plot)
        if a:
            out.append(a)
    return out


def merge(answers: list[DirectAnswer], lang: str) -> DirectAnswer | None:
    """Combine several partial answers into one structure (rules, quotes, caveats de-duplicated, order preserved)."""
    if not answers:
        return None
    if len(answers) == 1:
        return answers[0]
    seen_q: set[tuple[str, str]] = set()
    quotes: list[Quote] = []
    for a in answers:
        for q in a.quotes:
            if (q.rule_number, q.text) not in seen_q:
                seen_q.add((q.rule_number, q.text))
                quotes.append(q)
    heads = [a.headline.split(":", 1)[-1].strip().rstrip(".。।") for a in answers if a.headline]
    lead = _t(lang, "Answer: ", "उत्तर: ") + "; ".join(heads) + _t(lang, ".", "।")
    return DirectAnswer(
        "multi", lead, [ln for a in answers for ln in a.lines],
        list(dict.fromkeys(r for a in answers for r in a.rules)), quotes,
        [s for a in answers for s in a.steps], list(dict.fromkeys(c for a in answers for c in a.caveats)),
        list(dict.fromkeys(m for a in answers for m in a.missing)), next((a.follow_up for a in answers if a.follow_up), None),
        any(a.assumed for a in answers), any(a.amendment_flag for a in answers),
        [r for a in answers for r in a.requirements], [x for a in answers for x in a.scenarios])
