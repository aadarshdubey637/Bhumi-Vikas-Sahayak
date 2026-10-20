"""Ordinary Hindi / Hinglish phrasings must reach the same rules and facts as the English ones."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.hindi_text import expand_for_search, fold_hindi
from app.services.question_service import ask
from tests.unit.test_direct_answer import amendments, store  # noqa: F401  (fixtures)


def facts(r):
    return {f["name"]: (f["value"], f["unit"]) for f in r.extracted_facts}


def test_fold_removes_typing_variants_but_never_changes_numbers():
    assert fold_hindi("फ़ीट") == fold_hindi("फीट") == "फीट"
    assert fold_hindi("ऊँचाई") == fold_hindi("ऊंचाई")
    assert fold_hindi("छोड़ना") == "छोडना"
    assert fold_hindi("30 गुणा 40") .split() == ["30", "बाय", "40"]
    assert fold_hindi("") == ""


def test_the_exact_question_from_a_user_gets_a_real_answer(store, amendments):  # noqa: F811
    r = ask(store, amendments, "मेरे प्लॉट का साइज 30 बाय 40 फीट है। मुझे कितना सेटबैक छोड़ना होगा?")
    assert r.intent == "setback" and r.language == "hi"
    assert r.status != "not_established" and r.direct_answer is not None
    f = facts(r)
    assert f["plot_length"] == ("30", "ft") and f["plot_width"] == ("40", "ft")
    reqs = {x["key"]: x for x in r.direct_answer["requirements"]}
    assert Decimal(reqs["rear_open_space"]["value"]) == Decimal("1.50")  # 30 x 40 ft = 111.48 sq m: the 40-150 band
    assert "road_width" in r.direct_answer["missing"]


@pytest.mark.parametrize(
    ("q", "intent"),
    [
        ("मेरा प्लॉट 30x40 फ़ीट का है, सेटबैक कितना छोड़ना पड़ेगा", "setback"),
        ("सड़क 20 फीट चौड़ी है, सामने कितनी जगह छोड़नी होगी?", "setback"),
        ("बगल में कितनी जगह छोड़नी होगी?", "setback"),
        ("मेरे प्लॉट पर तीन मंजिल का मकान बन सकता है क्या? प्लॉट 30 बाय 40 फीट है", "floor_area"),
        ("फ्लोर एरिया कितना मिलेगा, प्लॉट 1200 वर्ग फीट का है", "floor_area"),
        ("मकान की ऊँचाई कितनी हो सकती है?", "height"),
        ("भवन अनुज्ञा की फीस कितनी लगेगी?", "fees"),
        ("kitna setback chhodna padega 30 by 40 feet plot par", "setback"),
        ("पार्किंग के लिए कितनी जगह चाहिए?", "parking"),
    ],
)
def test_common_phrasings_are_understood(store, amendments, q, intent):  # noqa: F811
    r = ask(store, amendments, q)
    assert r.intent == intent, (q, r.intent)
    assert r.status != "not_established", q


def test_facts_from_hindi_phrasings(store, amendments):  # noqa: F811
    assert facts(ask(store, amendments, "सड़क 20 फीट चौड़ी है, सामने कितनी जगह छोड़नी होगी?"))["road_width"] == ("20", "ft")
    f = facts(ask(store, amendments, "मेरे प्लॉट पर तीन मंजिल का मकान बन सकता है क्या? प्लॉट 30 बाय 40 फीट है"))
    assert f["floors"][0] == "3" and f["plot_width"] == ("40", "ft")
    assert facts(ask(store, amendments, "फ्लोर एरिया कितना मिलेगा, प्लॉट 1200 वर्ग फीट का है"))["plot_area"] == ("1200", "sqft")


def test_hindi_search_uses_the_english_words_of_the_rulebook():
    assert expand_for_search("पार्किंग के लिए कितनी जगह चाहिए?").split()[:2] == ["parking", "space"]
    assert "front open space" in expand_for_search("सामने कितनी जगह")
    assert expand_for_search("what is the fee") == "what is the fee"  # nothing Hindi: unchanged


def test_unrelated_hindi_questions_are_still_refused(store, amendments):  # noqa: F811
    for q in ("मोदी कौन हैं?", "क्या आप मुझे ट्रेन का टाइम बता सकते हैं?", "नमस्ते"):
        assert ask(store, amendments, q).status == "not_established", q
