import pytest

from app.services.answer_service import AnswerStatus as S
from app.services.answer_service import compose_answer, resolve_status
from app.services.applicability_service import detect_missing
from app.services.evidence_service import unsupported_numbers
from app.services.retrieval_service import EvidenceItem


def ev(status="verified", **kw):
    d = {"evidence_id": "EV-1", "rule_key": "56", "rule_number": "56", "rule_title": "Residential",
         "rule_version_id": "v", "source_document_id": "d", "page_start": 77, "page_end": 80,
         "page_precision": "located_in_page_text", "excerpt": "front open space 3.6 meters",
         "verification_status": status, "retrieval_method": "bm25"}
    d.update(kw)
    return EvidenceItem(**d)


def test_no_evidence_or_low_confidence_is_not_established():
    assert resolve_status([], [], False, False, True) == S.not_established
    assert resolve_status([ev()], [], False, False, False) == S.not_established


def test_conflict_outranks_missing_information():
    assert resolve_status([ev()], ["source_conflict"], True, False, True) == S.source_conflict


def test_missing_information():
    assert resolve_status([ev()], ["verified_current"], True, False, True) == S.insufficient_information


@pytest.mark.parametrize("ev_status,vers,calc,assume,expected", [
    ("unverified", ["verified_current"], False, False, S.pending_verification),
    ("verified", ["pending_verification"], False, False, S.pending_verification),
    ("verified", ["unknown_effective_date"], False, False, S.pending_verification),
    ("verified", ["verified_current"], True, False, S.pending_verification),
    ("verified", ["verified_current"], False, True, S.conditional),
    ("verified", ["historical"], False, False, S.conditional),
    ("verified", ["verified_current"], False, False, S.supported),
])
def test_status_matrix(ev_status, vers, calc, assume, expected):
    assert resolve_status([ev(ev_status)], vers, False, assume, True, calc) == expected


def test_compose_cites_evidence_id_and_pages():
    out = compose_answer(S.pending_verification, "en", [ev()])
    assert "Rule 56" in out and "[EV-1]" in out and "77-80" in out


def test_compose_not_established_has_no_citations():
    assert "[EV-" not in compose_answer(S.not_established, "en", [ev()])


def test_unsupported_numbers_detected():
    assert unsupported_numbers("Leave 3.6 m and 7.5 m", [ev()], [], []) == ["7.5"]
    assert unsupported_numbers("Leave 3.6 m and 9 m", [ev()], [], ["9"]) == []


def test_missing_info_without_verified_formula_assumes_nothing():
    m = detect_missing("setback", [])
    assert m.prerequisites_established is False and m.missing_facts == [] and m.clarifying_question is None
    assert "No values were assumed" in m.reason
