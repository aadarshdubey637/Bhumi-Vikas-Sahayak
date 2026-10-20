from app.rules.validators import text_flags, validate_record


def good(**kw):
    d = {"rule": "12", "title": "T", "part": "P", "page_start": 3, "page_end": 4, "text": "12. text"}
    d.update(kw)
    return d


def codes(issues):
    return [i.code for i in issues]


def test_valid_record():
    e, w = validate_record(good(), 1, 108)
    assert e == [] and w == []


def test_non_object_rejected():
    e, _ = validate_record([1, 2], 1, None)
    assert codes(e) == ["INVALID_TYPE"]


def test_missing_field_reported_not_dropped():
    d = good()
    del d["text"]
    e, _ = validate_record(d, 7, None)
    assert codes(e) == ["MISSING_FIELD"] and e[0].line_no == 7


def test_bad_rule_id_and_empty_text():
    assert "INVALID_RULE_ID" in codes(validate_record(good(rule="??"), 1, None)[0])
    assert "EMPTY_TEXT" in codes(validate_record(good(text="   "), 1, None)[0])


def test_page_range_rules():
    assert "INVALID_PAGE_RANGE" in codes(validate_record(good(page_start=5, page_end=4), 1, None)[0])
    assert "INVALID_PAGE_RANGE" in codes(validate_record(good(page_start=0), 1, None)[0])
    assert "INVALID_TYPE" in codes(validate_record(good(page_start=True), 1, None)[0])


def test_page_beyond_source_is_warning_not_error():
    e, w = validate_record(good(page_end=109), 1, 108)
    assert e == [] and codes(w) == ["PAGE_RANGE_EXCEEDS_SOURCE"]


def test_unknown_fields_preserved_as_info():
    _, w = validate_record(good(extra=1), 1, None)
    assert codes(w) == ["UNKNOWN_FIELDS"]


def test_text_flags():
    assert "running_header_in_text" in text_flags("x\nRule 56   M.P. Bhumi Vikas Rules, 2012   78\n")
    assert "table_like_content_unverified" in text_flags("1.     Up to 9.0 meters     3.0 meters")
    assert text_flags("plain sentence.") == []
