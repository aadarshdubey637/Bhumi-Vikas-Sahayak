"""Matching aid for Hindi and Hinglish questions: people type the same word several ways (``फ़ीट`` with a dot under the letter,
``फीट``, ``फिट``), so patterns are written against one folded spelling and the question is folded before matching.

Folding only changes what the *patterns see*. It never changes a number, a unit's meaning or which rule is quoted.
"""
from __future__ import annotations

import unicodedata

_NUKTA = "़"  # the dot under ज़ फ़ ड़ ढ़ ...
_REPLACE = {
    "ँ": "ं",  # chandrabindu -> anusvara (ऊँचाई / ऊंचाई)
    "फिट": "फीट",
    "फ़ुट": "फुट",
    "फुट्": "फुट",
    "बाई": "बाय",
    "गुणा": " बाय ",
    "×": " x ",
}


def fold_hindi(text: str) -> str:
    if not text:
        return text
    s = unicodedata.normalize("NFD", text).replace(_NUKTA, "")  # ड़->ड, फ़->फ, ज़->ज
    s = unicodedata.normalize("NFC", s)
    for a, b in _REPLACE.items():
        s = s.replace(a, b)
    return s


# The rule text is English, so a Hindi question is searched with the English words for the same ideas.
_HINTS = (
    ("सेटबैक|सेट बैक|मार्जिन|खुली जगह|ओपन स्पेस|छोड", "open space setback margin"),
    ("सामने|आगे", "front open space"),
    ("पीछे", "rear open space"),
    ("बगल|साइड", "side open space"),
    ("पार्किंग", "parking space required in building"),
    ("ऊंचाई|ऊचाई|उंचाई|हाइट", "height of building"),
    ("मंजिल|मंजिला|माले|माला", "floors storey"),
    ("फ्लोर एरिया|फ्लोर|एफ ?ए ?आर", "floor area ratio FAR"),
    ("फीस|शुल्क|चार्ज", "fee charges"),
    ("सड़क|सडक|रोड", "road width"),
    ("अग्नि|आग", "fire safety"),
    ("अनुमति|परमिशन|मंजूरी", "building permission required"),
    ("प्लॉट|भूखंड", "plot area"),
)


def expand_for_search(text: str) -> str:
    """The search text for a Hindi question: the English words for the ideas found in it, plus any English words already typed.

    The rule text is English, so Devanagari words can never match it and would only drag the match score down. When no known Hindi word
    is found the question is searched unchanged.
    """
    import re

    extra = [hint for pat, hint in _HINTS if re.search(pat, text)]
    if not extra:
        return text
    typed = " ".join(re.findall(r"[A-Za-z]+", text))
    return (typed + " " + " ".join(extra)).strip()
