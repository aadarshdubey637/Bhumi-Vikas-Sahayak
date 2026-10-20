from app.rules.normalization import (
    RuleRef,
    extract_rule_refs,
    parse_rule_ref,
    rule_key,
    to_ascii_digits,
)


def test_hyphen_letter_is_suffix_and_official_form_preserved():
    r = parse_rule_ref("26-B")
    assert r == RuleRef(base="26", suffix="B", path=())
    assert r.key == "26b" and r.display == "26-B"


def test_variants_resolve_to_same_key():
    assert rule_key("Rule 26-b") == rule_key("26-B") == "26b"


def test_clause_path():
    r = parse_rule_ref("Rule 2(5)(c)")
    assert r.base == "2" and r.suffix is None and r.path == ("5", "c")
    assert r.display == "2(5)(c)"


def test_ambiguous_paren_letter_needs_known_keys():
    assert parse_rule_ref("25(A)").suffix is None  # no evidence it is an inserted rule
    r = parse_rule_ref("25(A)", {"25a"})
    assert r.suffix == "A" and r.key == "25a"


def test_garbage_is_rejected():
    assert parse_rule_ref("abc") is None
    assert parse_rule_ref("") is None
    assert parse_rule_ref(None) is None  # type: ignore[arg-type]
    assert parse_rule_ref("12 and more words") is None


def test_devanagari_digits():
    assert to_ascii_digits("५६") == "56"
    assert parse_rule_ref("नियम ५६").key == "56"


def test_extract_refs_from_free_text():
    refs = extract_rule_refs("see Rule 26-B and rule 2(5)(c), also नियम 56")
    assert [r.display for r in refs] == ["26-B", "2(5)(c)", "56"]


def test_extract_refs_dedupes():
    assert len(extract_rule_refs("Rule 12 ... Rule 12")) == 1
