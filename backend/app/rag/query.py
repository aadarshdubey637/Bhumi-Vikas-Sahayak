"""Query normalization: language detection, Hindi->English *query* expansion, rule refs.

The glossary expands the user's QUERY only, so Hindi questions can reach the English
corpus.  Legal source text is never translated or rewritten.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from app.rag.lexical_index import stem, tokenize
from app.rules.normalization import RuleRef, extract_rule_refs, to_ascii_digits

# Intentionally small and reviewable. Extend via data/evaluation, not by guesswork.
HI_EN_GLOSSARY: dict[str, str] = {
    "फीस": "fee fees", "शुल्क": "fee fees", "सड़क": "road street", "प्लॉट": "plot", "भूखंड": "plot",
    "खाली जगह": "open space", "खाली": "open space", "सामने": "front", "आगे": "front", "पीछे": "rear",
    "बगल": "side", "बिल्डिंग": "building", "भवन": "building", "परमिशन": "permission",
    "अनुमति": "permission", "नियम": "rule", "ऊंचाई": "height", "ऊँचाई": "height", "मंजिल": "floor storey",
    "पार्किंग": "parking", "लिफ्ट": "lift", "दस्तावेज": "documents", "आवेदन": "application",
    "विकास योजना": "development plan", "आवासीय": "residential", "बालकनी": "balcony",
    "मीटर": "metre", "चौड़ी": "wide", "छोड़नी": "set back", "कितनी": "how much",
}


# Romanised Hindi ("Hinglish"). Function words are removed from the search tokens (they carry no topic) and the content
# words are mapped to the English vocabulary the rules actually use. Words that are also common English
# (main, me, par, so, hu) are deliberately excluded so English questions are not mislabelled.
ROMAN_HI_FUNCTION_WORDS = frozenset([
    "mere", "mera", "meri", "mujhe", "hum", "humein", "hamare", "hai", "hain", "hoga", "hogi", "honge", "tha", "thi", "kitna", "kitne", "kitni",
    "aur", "ka", "ki", "ke", "ko", "mein", "paas", "banane", "bana", "banana", "sakta", "sakte", "sakti", "chahiye", "chahie", "kya", "kaise",
    "kab", "kahan", "kyun", "nahi", "nahin", "hoon", "liye", "wala", "wali", "wale", "hona", "karna", "karne", "kar", "dena", "dene", "lena",
    "lene", "sir", "madam", "bataiye", "batao", "btao", "kripya", "ji", "toh", "bhi", "yeh", "ye", "woh", "wo", "apne", "apna",
    "raha", "rahe", "rahegi", "rahega", "kaun", "kon", "jati", "jaati", "milti", "mili", "mil", "milta", "ho", "lagana", "lagwana",
    "zaroori", "jaruri", "avashyak", "usme", "isme", "uske", "iske", "mai", "tak", "pe", "ne", "baar", "dobara", "kare", "karen",
    "kitnaa", "kuch", "koi", "hone", "baad", "pehle", "phir", "kyon", "kyu", "wahan", "yahan", "isliye", "agar", "lekin", "kaisa", "sab", "hota", "hoti", "hote", "chahta", "chahte", "chaahiye", "padega", "padegi", "paayega",
])
# Removed from the search only once the question is known to be Hinglish; NOT counted for language detection (they are English words too).
ROMAN_HI_STRIP_ONLY = frozenset(["par", "se", "pe", "wale", "wali"])
# Units the user states with their numbers ("1500 sq ft", "9 m"): data, not topic. Searching for them only drags in tables full of units.
UNIT_TOKENS = frozenset(["sq", "ft", "sqft", "sqm", "sqmt", "sqyd", "yd", "mtr", "mtrs", "m", "cm", "mm"])
ROMAN_HI_GLOSSARY: dict[str, str] = {
    "ghar": "building residential", "makaan": "building residential", "makan": "building residential", "imarat": "building",
    "chaudi": "wide width", "chaudai": "width", "chauda": "wide width", "sadak": "road street", "rasta": "road", "gali": "lane street",
    "manzil": "floor storey", "manzilein": "floor storey", "manjil": "floor storey", "manjilein": "floor storey",
    "chhodna": "set back open space", "chodna": "set back open space", "chhod": "set back open space", "chhodni": "set back open space",
    "jagah": "space", "zameen": "land plot", "jamin": "land plot", "bhoomi": "land", "dukaan": "shop commercial", "dukan": "shop commercial",
    "shulk": "fee fees", "unchai": "height", "oonchai": "height", "oochai": "height", "lambai": "length", "naksha": "plan",
    "aage": "front", "saamne": "front", "samne": "front", "peeche": "rear", "pichhe": "rear", "bagal": "side", "baju": "side",
    "khali": "open space", "anumati": "permission", "jawab": "reply response", "uttar": "reply response", "din": "days", "dino": "days",
    "saal": "year years", "varsh": "year years", "badlav": "change", "badal": "change", "badalna": "change", "parivartan": "change",
    "bijli": "electric", "taar": "line wire", "tar": "line wire", "door": "distance", "doori": "distance",
    "unchi": "height", "uncha": "height", "oonchi": "height", "kharcha": "fee fees", "hastakshar": "signing",
}
# Words the rules express differently. Query-side only, grounded in the corpus vocabulary: "setback" occurs 0 times in the rule
# text (it says "set back" and "open space"); "floors" appears as "floor", "storey" and "stories".
QUERY_SYNONYMS: dict[str, str] = {
    "setback": "set back open space", "setbacks": "set back open space", "margin": "open space", "margins": "open space",
    "floors": "floor storey story", "floor": "storey story", "storey": "floor story", "storeys": "floor story", "stories": "floor storey",
    "far": "floor area ratio", "fsi": "floor area ratio",
}
_SYNONYMS_STEMMED = {stem(k): v for k, v in QUERY_SYNONYMS.items()}  # tokens are stemmed before lookup
# Lay words -> the legal vocabulary the rules use (query side only; rule text is never altered). Every right-hand term occurs in the
# corpus (tests/unit/test_query.py checks that against the real vocabulary), and each entry was written after reading the rule it
# points to. Reviewable list: extend via data/evaluation/expected_rules.json, not by guesswork.
LEGAL_GLOSSARY: dict[str, str] = {
    # authority does not answer in time -> Rule 28 "Limitation period for grant or refusal ... deemed to have been sanctioned"
    "deadline": "limitation period deemed sanctioned", "delay": "limitation period deemed sanctioned",
    "lapse": "limitation period deemed sanctioned", "reply": "limitation period deemed sanctioned fails intimate",
    "replied": "limitation period deemed sanctioned fails intimate", "respond": "limitation period deemed sanctioned fails intimate",
    "response": "limitation period deemed sanctioned fails intimate",
    # validity / renewal -> Rule 23 "Duration of sanction ... revalidation"
    "valid": "duration sanction valid revalidation", "validity": "duration sanction valid revalidation",
    "expire": "duration sanction expires revalidation", "expiry": "duration sanction expires revalidation",
    "renew": "revalidation duration sanction", "renewal": "revalidation duration sanction", "revalidate": "revalidation duration",
    # who may sign -> Rule 18 / 26
    "sign": "preparation signing plans architect engineer", "signing": "preparation signing plans architect engineer",
    # documents with an application -> Rule 16
    "document": "information accompanying application", "enclose": "information accompanying application",
    "attach": "information accompanying application", "enclosure": "information accompanying application",
    # electricity -> Rule 52 "Distance from electric lines"
    "balcony": "distance electric lines verandah", "verandah": "distance electric lines", "overhead": "distance electric supply line",
    "electricity": "electric lines", "wire": "electric lines",
    # lifts -> Rule 83
    "lift": "lifts escalators", "elevator": "lifts escalators", "escalator": "lifts escalators",
    # Development Plan conflict -> Rule 103 "take precedence"
    "disagree": "development plan precedence contrary", "conflict": "development plan precedence contrary",
    "contradict": "development plan precedence contrary", "prevail": "development plan precedence", "override": "development plan precedence",
    # farm house -> Rule 17
    "farmhouse": "farm house agricultural", "agricultural": "farm house agricultural", "agriculture": "farm house agricultural",
    "tall": "height",
}
LEGAL_PHRASES: list[tuple[re.Pattern[str], str]] = [
    # changing a sanctioned plan -> Rule 24 "Deviation from sanctioned plan" / Rule 19 alteration
    (re.compile(r"(?:chang|modif|alter|revis|badal|badlav|amend)\w*.{0,50}(?:sanction|approv|permission)|"
                r"(?:sanction|approv).{0,50}(?:chang|modif|alter|revis|badal|badlav)\w*", re.I), "deviation sanctioned plan alteration"),
    (re.compile(r"separate development permission|development permission", re.I), "development permission"),
    (re.compile(r"not\s+(?:been\s+)?(?:replied|answered|decided|responded)|no\s+(?:reply|response|answer)|time\s*limit|within\s+\w+\s+days",
                re.I), "limitation period deemed sanctioned fails intimate"),
]
_ROMAN_FUNCTION_STEMMED = frozenset(stem(w) for w in ROMAN_HI_FUNCTION_WORDS)
_ROMAN_STRIP_STEMMED = frozenset(stem(w) for w in ROMAN_HI_STRIP_ONLY)
_LEGAL_STEMMED = {stem(k): v for k, v in LEGAL_GLOSSARY.items()}
_ROMAN_GLOSSARY_STEMMED = {stem(k): v for k, v in ROMAN_HI_GLOSSARY.items()}
# User words that never appear in the rule text; searching for them only lowers the coverage score, so only their synonyms are used.
_NEVER_IN_CORPUS = frozenset(stem(w) for w in ("setback", "setbacks", "margin", "margins", "fsi"))
_ROMAN_TOKEN = re.compile(r"[a-z]+")


def _roman_hi_hits(text: str) -> int:
    words = set(_ROMAN_TOKEN.findall(text.lower()))
    return len(words & (ROMAN_HI_FUNCTION_WORDS | set(ROMAN_HI_GLOSSARY)))


def detect_language(text: str) -> str:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return "en"
    dev = sum(1 for c in letters if "\u0900" <= c <= "\u097F")
    ratio = dev / len(letters)
    if ratio > 0.6:
        return "hi"
    if ratio > 0.05:
        return "hi-en"
    if _roman_hi_hits(text) >= 3:  # three distinct romanised-Hindi words: a lone "ka" or "ji" must not flip an English question
        return "hi-en"
    return "en"


@dataclass
class NormalizedQuery:
    original: str
    language: str
    rule_refs: list[RuleRef] = field(default_factory=list)
    expanded_terms: list[str] = field(default_factory=list)
    tokens: list[str] = field(default_factory=list)  # English-searchable tokens
    lay_tokens: frozenset[str] = frozenset()  # user words replaced by legal terms: excluded from the coverage (confidence) score

    @property
    def has_rule_ref(self) -> bool:
        return bool(self.rule_refs)


def normalize_query(text: str, language: str | None = None, known_keys: set[str] | None = None) -> NormalizedQuery:
    original = text
    nfc = unicodedata.normalize("NFC", text)
    lang = language if language in ("en", "hi", "hi-en") else detect_language(nfc)
    ascii_digits = to_ascii_digits(nfc)
    refs = extract_rule_refs(ascii_digits, known_keys)
    expanded: list[str] = []
    if lang in ("hi", "hi-en"):
        for hi, en in sorted(HI_EN_GLOSSARY.items(), key=lambda kv: -len(kv[0])):
            if hi in nfc:
                expanded.extend(en.split())
    base = tokenize(ascii_digits)
    if lang in ("hi", "hi-en"):
        # tokenize() has already stemmed, so compare against stemmed forms ("paas" -> "paa")
        for t in base:
            if t in _ROMAN_GLOSSARY_STEMMED:
                expanded.extend(_ROMAN_GLOSSARY_STEMMED[t].split())
        # romanised-Hindi words never occur in the English rule text: drop them (their English expansion is searched instead)
        base = [t for t in base if t not in _ROMAN_FUNCTION_STEMMED and t not in _ROMAN_GLOSSARY_STEMMED and t not in _ROMAN_STRIP_STEMMED]
    for t in base:
        if t in _SYNONYMS_STEMMED:
            expanded.extend(_SYNONYMS_STEMMED[t].split())
    # lay -> legal vocabulary (applied to the user's words and to the romanised-Hindi expansions, once, not recursively)
    lay: set[str] = set()
    for t in [*base, *tokenize(" ".join(expanded))]:
        if t in _LEGAL_STEMMED:
            expanded.extend(_LEGAL_STEMMED[t].split())
            lay.add(t)
    for pat, legal in LEGAL_PHRASES:
        if pat.search(nfc):
            expanded.extend(legal.split())
    base = [t for t in base if t not in _NEVER_IN_CORPUS and t not in UNIT_TOKENS]
    toks = [t for t in [*base, *tokenize(" ".join(expanded))] if not re.match(r"^[ऀ-ॿ]+$", t)]
    return NormalizedQuery(original=original, language=lang, rule_refs=refs, expanded_terms=expanded, tokens=toks,
                           lay_tokens=frozenset(lay - set(tokenize(" ".join(expanded)))))  # a lay word that is itself a legal term stays
