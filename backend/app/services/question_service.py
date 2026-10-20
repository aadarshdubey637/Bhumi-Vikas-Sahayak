"""The /ask workflow: normalize -> classify -> extract -> retrieve -> resolve versions ->
detect missing info -> validate evidence -> resolve status -> compose answer."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from app.rules.normalization import RuleRef
from app.services import direct_answer as da
from app.services.answer_service import AnswerStatus, compose_answer, resolve_status
from app.services.applicability_service import detect_missing
from app.services.entity_extraction_service import extract_facts
from app.services.evidence_service import validate_evidence
from app.services.language_service import template
from app.services.retrieval_service import RuleStore
from app.services.version_service import Amendment, resolve_version

MIN_COVERAGE = 0.4  # fraction of distinct query terms found in the best chunk (see docs/evaluation.md)
MIN_DOMAIN_HITS = 2  # ... and at least this many building-regulation terms among them (one stray word is not evidence)

_INTENT_PATTERNS: list[tuple[str, str]] = [
    ("out_of_scope", r"property tax|प्रॉपर्टी टैक्स|संपत्ति कर|market (?:rate|price|value)|बाजार भाव|stamp duty|स्टाम्प|land registry|mutation|water bill|electricity bill|pay .* online"
                     r"|\b(?:bhav|bhaav)\b|ज़मीन का भाव|जमीन का भाव|driving licen[cs]e|passport|birth certificate|death certificate|ration card|aadhaar|pan card"
                     r"|income tax|\bgst\b|recruitment|vacanc|salary|pension|\bmayor\b|councill?or|office (?:hours|time|timings?)|what time does"),
    ("amendment", r"amend|changed|\bchange[sd]?\b.*(?:2025|2026)|(?:2025|2026)|latest rule|संशोधन"),
    ("fees", r"\bfees?\b|\bcharges?\b|फीस|शुल्क|चार्ज|खर्च|कितना पैसा|रुपये|रुपए"),
    ("setback", r"open space|set\s?back|\bmargins?\b|\bfront\b|\brear\b|\bside\b|\bch+h?od(?:na|ni|ne)?\b|खाली जगह|सामने|आगे|पीछे|सेट\s?बैक|मार्जिन|छोड|खुली जगह|ओपन स्पेस|बगल|साइड"),
    ("floor_area", r"\bFAR\b|floor area|floor space|how many (?:floors|storeys|stories)|(?:floors|storeys|stories) (?:can|allowed|permitted)|\bkitn[ei] (?:floors?|manzil\w*)|मंजिल|मंजिला|माले|माला|फ्लोर|एफ\s?ए\s?आर"),
    ("height", r"height|tall|ऊंचाई|ऊँचाई|ऊचाई|उंचाई|हाइट"),
    ("parking", r"parking|पार्किंग"),
    ("fire_safety", r"\bfire\b|अग्नि"),
    ("definition", r"what is (?:a |an |the )?meaning|define|definition|means\b|परिभाषा"),
    ("permission_applicability", r"do i need|required|permission|permit|परमिशन|अनुमति"),
]


def classify_intent(text: str, has_rule_ref: bool) -> str:
    if has_rule_ref:
        return "rule_lookup"
    from app.services.hindi_text import fold_hindi

    text = fold_hindi(text)
    for intent, pat in _INTENT_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return intent
    return "general_rule_question"


@dataclass
class AskResult:
    answer: str
    status: str
    language: str
    intent: str
    evidence: list[dict[str, Any]] = field(default_factory=list)
    extracted_facts: list[dict[str, Any]] = field(default_factory=list)
    missing_information: dict[str, Any] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)
    calculations: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    version_status: list[dict[str, Any]] = field(default_factory=list)
    follow_up_question: str | None = None
    rejected_evidence: list[dict[str, str]] = field(default_factory=list)
    direct_answer: dict[str, Any] | None = None
    source_version: str = da.CORPUS_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


BASE_WARNINGS = [
    "Preliminary pointer to the rule text only; not legal advice and not an official approval. The clerk decides.",
]


def ask(
    store: RuleStore | None,
    amendments: list[Amendment],
    question: str,
    language: str | None = None,
    context: dict[str, Any] | None = None,
    as_of: str | None = None,
    top_k: int = 5,
    retriever: Any | None = None,
) -> AskResult:
    from app.rag.query import normalize_query

    if store is None or not store.records:
        nq = normalize_query(question, language)
        return AskResult(answer=template(nq.language, "no_data"), status=AnswerStatus.not_established.value,
                         language=nq.language, intent="unknown", warnings=[*BASE_WARNINGS, "No rule corpus loaded."])
    from app.services.hindi_text import expand_for_search, fold_hindi

    question = fold_hindi(question)  # typing variants of the same Hindi word must match the same pattern
    nq = normalize_query(question, language, store.known_keys)
    intent = classify_intent(nq.original, nq.has_rule_ref)
    facts = extract_facts(question, context)
    missing = detect_missing(intent, facts)
    warnings = list(BASE_WARNINGS)

    if intent == "out_of_scope":
        return AskResult(answer=template(nq.language, "not_established"), status=AnswerStatus.not_established.value,
                         language=nq.language, intent=intent, extracted_facts=[f.to_dict() for f in facts],
                         missing_information=missing.to_dict(),
                         warnings=[*warnings, "Question is outside the scope of the building rules corpus."])

    unresolved_refs = [r for r in nq.rule_refs if not store.lookup(r, 1)]
    if nq.rule_refs and len(unresolved_refs) == len(nq.rule_refs):
        # The user named specific rule number(s) that are not in the corpus: abstain instead of
        # presenting fuzzy BM25 neighbours as if they answered the question.
        shown = ", ".join(r.display for r in unresolved_refs)
        return AskResult(answer=template(nq.language, "not_established"), status=AnswerStatus.not_established.value,
                         language=nq.language, intent=intent, extracted_facts=[f.to_dict() for f in facts],
                         missing_information=missing.to_dict(),
                         warnings=[*warnings, f"Rule {shown} was not found in the ingested corpus; no related text was substituted."])
    res = (retriever or store).search(expand_for_search(question), top_k=top_k, language=nq.language)
    if unresolved_refs:
        warnings.append("Not found in the corpus: Rule " + ", ".join(r.display for r in unresolved_refs) + ".")
    linked_items = []
    if intent == "amendment":
        for a in amendments:
            for aff in a.affects:
                ref = RuleRef(base=aff["rule"], path=tuple(aff.get("path") or ()))
                for it in store.lookup(ref, max_chunks=2):
                    it.retrieval_method = "amendment_link"
                    linked_items.append(it)
    if linked_items:
        have = {i.evidence_id for i in linked_items}
        res.items = linked_items + [i for i in res.items if i.evidence_id not in have]
    confident = (bool(linked_items) or bool(nq.rule_refs and res.items)
                 or (res.top_coverage >= MIN_COVERAGE and getattr(res, "top_domain_hits", MIN_DOMAIN_HITS) >= MIN_DOMAIN_HITS))
    val = validate_evidence(store, res.items)
    evidence = val.valid

    # version resolution per distinct rule appearing in evidence
    res_versions, seen = [], set()
    for e in evidence:
        base_key = e.rule_key
        if base_key in seen:
            continue
        seen.add(base_key)
        rec = store.by_key.get(base_key) or (store.embedded[base_key][0] if base_key in store.embedded else None)
        if rec is None:
            continue
        ref = nq.rule_refs[0] if (nq.rule_refs and nq.rule_refs[0].key == base_key) else RuleRef(base=re.match(r"\d+", rec.official_rule_id).group(0))
        v = resolve_version(ref, [{"version_id": rec.version_id, "verification_status": rec.verification_status}], amendments, as_of)
        res_versions.append(v.to_dict())
    if intent == "amendment":
        for a in amendments:
            warnings.append(f"Pending amendment {a.amendment_id} ({a.verification_status}) is not reflected in the corpus; its effective date and effect are unknown.")
    for v in res_versions:
        for la in v["linked_amendments"]:
            msg = f"Rule {v['rule_key']} may be affected by amendment {la['amendment_id']} ({la['verification_status']}; effective date unknown); the amended text is not in the corpus."
            if msg not in warnings:
                warnings.append(msg)

    needs_calc = intent in ("setback", "floor_area", "height", "parking", "fees") and not missing.prerequisites_established
    status = resolve_status(
        evidence, [v["status"] for v in res_versions], bool(missing.missing_facts), False, confident, needs_calc
    )
    if needs_calc and status == AnswerStatus.pending_verification:
        warnings.append("No verified calculation module exists for this category; no regulatory value was computed. Table figures in the cited rule must be read and checked against the official PDF.")
    if any(e.table_like for e in evidence):
        warnings.append("Cited text contains flattened tables; check any figure against the official PDF page before use.")
    if any(e.page_precision != "located_in_page_text" for e in evidence):
        warnings.append("Some page references are rule-level ranges, not exact pages.")
    if any(e.verification_status != "verified" for e in evidence):
        warnings.append("Source text is ingested from the official consolidated PDF (to 6 March 2025) but has not been human-verified.")
    if as_of and as_of > "2025-03-06":
        warnings.append("As-of date is after the corpus consolidation date (2025-03-06); later changes are not covered.")

    direct = da.merge(da.solve(store, intent, question, facts, nq.language), nq.language)
    if direct is not None and not direct.all_verified:
        direct = None  # never show an answer whose quotes could not be matched back to the stored rule text
    if direct is not None:
        status = _direct_status(direct, res_versions)
        warnings = [w for w in warnings if not w.startswith("No verified calculation module")]
        warnings.extend(direct.caveats)
        if direct.assumed:
            warnings.append("An input was assumed or inferred (stated in the answer); confirm it with the applicant.")
        answer = _compose_direct(direct, nq.language)
        evidence = _evidence_for_direct(store, direct, evidence)
        follow_up = direct.follow_up or missing.clarifying_question
    else:
        answer = compose_answer(status, nq.language, evidence)
        follow_up = missing.clarifying_question
    if status == AnswerStatus.not_established:
        evidence = []  # do not present weak matches as support
    return AskResult(
        answer=answer, status=status.value, language=nq.language, intent=intent,
        evidence=[e.to_dict() for e in evidence], extracted_facts=[f.to_dict() for f in facts],
        missing_information=missing.to_dict(), assumptions=[], calculations=[], warnings=warnings,
        version_status=res_versions, follow_up_question=follow_up,
        rejected_evidence=[{"evidence_id": i, "reason": r} for i, r in val.rejected],
        direct_answer=direct.to_dict() if direct else None,
    )


def _direct_status(d: da.DirectAnswer, versions: list[dict[str, Any]]) -> AnswerStatus:
    """A direct answer is quote-verified against the official consolidated text, so it can be ``supported`` - unless something
    keeps it from being final: missing input, an assumed input, or the pending 2026 amendment."""
    if d.missing:  # a compound answer with one part still waiting for an input is partial, not empty
        return AnswerStatus.conditional if d.kind == "multi" else AnswerStatus.insufficient_information
    if d.amendment_flag:
        return AnswerStatus.pending_verification
    if d.assumed:
        return AnswerStatus.conditional
    return AnswerStatus.supported


def _compose_direct(d: da.DirectAnswer, language: str) -> str:
    lines = [d.headline, *d.lines]
    if d.follow_up:
        lines.append(d.follow_up)
    cite = ", ".join(f"Rule {r}" for r in d.rules) if language == "en" else ", ".join(f"नियम {r}" for r in d.rules)
    lines.append(("Source: " if language == "en" else "स्रोत: ") + cite + " - " + da.CORPUS_VERSION)
    lines.extend(d.caveats)
    lines.append(template(language, "clerk_decides"))
    return "\n".join(lines)


def _evidence_for_direct(store: RuleStore, d: da.DirectAnswer, retrieved: list[Any]) -> list[Any]:
    """Put the evidence chunks of the rules the direct answer cites first, so the cited text is what the clerk sees."""
    def key(rule_number: str) -> str:
        k = re.sub(r"[^0-9a-z]", "", rule_number.lower())
        return k if k in store.by_key else re.match(r"\d+", k).group(0)  # embedded rules (12-A) live in their parent record

    first: list[Any] = []
    for q in d.quotes:
        k = key(q.rule_number)
        hits = [i for i in retrieved if i.rule_key == k and i not in first]
        if not hits:
            hits = [i for i in store.lookup(RuleRef(base=k), 2) if i.evidence_id not in {f.evidence_id for f in first}]
        first.extend(hits[:2])
    return first + [i for i in retrieved if i not in first]
