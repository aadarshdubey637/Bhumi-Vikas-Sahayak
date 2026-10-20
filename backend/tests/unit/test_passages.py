from __future__ import annotations

from app.channels.passages import best_passage, sentence_spans

RULE = (
    "28. Limitation period for grant or refusal of permission.- If the Authority fails to intimate in writing its refusal of sanction "
    "to the applicant within the period prescribed, the permission shall be deemed to have been sanctioned. However nothing shall be "
    "construed to authorize any person to do anything in contravention of the Act: Rule 29-31 M.P. Bhumi Vikas Rules, 2012 49 "
    "1 [Provided that in case of lapse of time in deciding application from authorised Architect, it shall not be deemed that "
    "the requisite permission has been granted.] 1 Subs. by Notification No. F-3-27-2022 Published in M.P. Rajpatra dated 2022."
)
TOKENS = ["permission", "deemed", "sanctioned", "authority", "fails", "intimate", "limitation", "period"]


def test_passage_is_an_exact_substring_of_the_source():
    p = best_passage(RULE, TOKENS)
    assert p is not None
    assert RULE[p.start:p.end] == p.text
    assert "deemed to have been sanctioned" in p.text


def test_footnotes_and_notifications_are_never_quoted():
    footnote_only = "1 Subs. by Notification No. F-3-27-2022 Published in M.P. Rajpatra dated 2022 about permission deemed sanctioned."
    assert best_passage(footnote_only, TOKENS) is None


def test_no_overlap_means_no_passage_not_a_guess():
    assert best_passage(RULE, ["quantum", "computing", "biryani"]) is None
    assert best_passage("", TOKENS) is None
    assert best_passage(RULE, []) is None


def test_long_sentence_is_cut_at_a_word_boundary_and_stays_a_substring():
    long = "The permission shall be deemed sanctioned " + "and also something else relating to the authority " * 30 + "end."
    p = best_passage(long, TOKENS, max_chars=120)
    assert p is not None and p.truncated and len(p.text) <= 120
    assert long[p.start:p.end] == p.text and not p.text.endswith(" ")


def test_sentence_spans_cover_clauses_in_order():
    text = "(1) First clause is long enough to count.\n(2) Second clause is also long enough; third part after semicolon is long too."
    spans = sentence_spans(text)
    assert spans == sorted(spans) and all(text[a:b].strip() == text[a:b] for a, b in spans)
    assert len(spans) >= 3
