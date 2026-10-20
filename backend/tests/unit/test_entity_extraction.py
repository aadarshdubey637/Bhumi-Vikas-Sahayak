from app.services.entity_extraction_service import extract_facts


def by_name(facts):
    return {f.name: f for f in facts}


def test_road_width_and_height_english():
    f = by_name(extract_facts("My house faces a 10 m wide street and will be 9 m tall."))
    assert (f["road_width"].value, f["road_width"].unit, f["road_width"].source) == ("10", "m", "user_provided")
    assert (f["building_height"].value, f["building_height"].unit) == ("9", "m")


def test_plot_area_and_use():
    f = by_name(extract_facts("minimum rear open space for a 150 sq m residential plot?"))
    assert (f["plot_area"].value, f["plot_area"].unit) == ("150", "sqm")
    assert f["building_use"].value == "residential" and f["building_use"].validation_status == "unverified"


def test_hindi_question_14():
    f = by_name(extract_facts("मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है।"))
    assert (f["plot_area"].value, f["plot_area"].unit) == ("200", "sqm")
    assert (f["road_width"].value, f["road_width"].unit) == ("9", "m")


def test_area_without_plot_word_is_flagged():
    f = by_name(extract_facts("a 300 sq m area"))
    assert f["area"].note and "without saying" in f["area"].note


def test_year_is_not_interpreted():
    f = by_name(extract_facts("permission was granted in 2023"))
    assert f["year_mentioned"].value == "2023" and "not inferred" in f["year_mentioned"].note


def test_zero_value_is_invalid():
    assert by_name(extract_facts("a 0 sq m plot"))["plot_area"].validation_status == "invalid"


def test_nothing_invented_from_empty_question():
    assert extract_facts("How do I pay my property tax online?") == []


def test_structured_context_overrides_text_and_is_marked():
    f = by_name(extract_facts("10 m wide street", {"road_width": {"value": "12", "unit": "m"}}))
    assert f["road_width"].value == "12" and f["road_width"].origin == "structured_context"


def test_invalid_context_value_flagged():
    f = by_name(extract_facts("hello", {"plot_area": {"value": "-4", "unit": "sqm"}}))
    assert f["plot_area"].validation_status == "invalid"
