from app.rag.query import detect_language, normalize_query


def test_language_detection():
    assert detect_language("What is the fee?") == "en"
    assert detect_language("बिल्डिंग परमिशन की फीस कितनी है") == "hi"
    assert detect_language("my प्लॉट is 200 sq m") == "hi-en"
    assert detect_language("1234") == "en"


def test_original_query_preserved_and_hindi_expanded():
    q = "आगे कितनी जगह खाली छोड़नी होगी?"
    n = normalize_query(q)
    assert n.original == q and n.language == "hi"
    assert {"front", "open", "space"} <= set(n.tokens)
    assert not any("ऀ" <= c <= "ॿ" for t in n.tokens for c in t)


def test_rule_ref_detected():
    n = normalize_query("What does Rule 26-B say?")
    assert n.has_rule_ref and n.rule_refs[0].key == "26b"


def test_explicit_language_override():
    assert normalize_query("fee", "hi").language == "hi"
    assert normalize_query("fee", "xx").language == "en"


# ---- romanised Hindi ("Hinglish") and corpus-vocabulary synonyms ------------------------------------
HINGLISH = ("Sir, mere paas 200 square metre ka plot hai aur road 9 metre chaudi hai. Mujhe ghar banane ke liye kitna setback "
            "chhodna hoga aur kitne floors bana sakta hoon?")


def test_romanised_hindi_is_detected_but_plain_english_is_not():
    assert detect_language(HINGLISH) == "hi-en"
    assert detect_language("What is the setback for a plot on a 9 m road?") == "en"
    assert detect_language("Please send me the fee ka details") == "en"  # one Hindi word is not enough


def test_hinglish_tokens_are_english_search_terms():
    toks = set(normalize_query(HINGLISH).tokens)
    assert {"open", "space", "set", "back", "floor", "storey", "plot", "road", "width", "residential"} <= toks
    # Hindi function words and untranslatable words must not dilute the search (and the coverage score)
    assert not toks & {"paa", "ghar", "chaudi", "chhodna", "hoga", "kitna", "setback"}


def test_setback_is_searched_as_the_rules_word_it():
    """The rule text never says 'setback' (it says 'set back' / 'open space')."""
    toks = set(normalize_query("What setback must I leave?").tokens)
    assert {"set", "back", "open", "space"} <= toks and "setback" not in toks
