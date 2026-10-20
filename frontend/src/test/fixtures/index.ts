// Fixtures shaped exactly like the backend contract (schemas/api.py); values taken from backend/docs/api.md.
import type {
  AskResponse,
  AssessmentOut,
  CalculationTrace,
  Evidence,
  PlotPreviewResponse,
  ReportOut,
  RuleSummary,
  RuleVersionsResponse,
} from "@/api/types";

export const EV21: Evidence = {
  evidence_id: "EV-21-002-f9a2941e",
  rule_key: "21",
  rule_number: "21",
  rule_title: "Fees",
  rule_version_id: "RV-21-1",
  source_document_id: "MP-BVR-2012-EN-CONSOL-2025-03-06",
  page_start: 35,
  page_end: 36,
  page_precision: "located_in_page_text",
  excerpt: "21. Fees.— (1) Every application shall be accompanied by the fee ...",
  verification_status: "unverified",
  retrieval_method: "bm25",
  score: 7.12,
  table_like: true,
  flags: ["table_like_content_unverified"],
  is_embedded_rule: false,
};

export const askPending: AskResponse = {
  answer:
    "Most relevant provisions found (text below is quoted from the source, untranslated):\n- Rule 21 (Fees), PDF page 35-36 [EV-21-002-f9a2941e]\nThese provisions have not been human-verified, so this is a pointer to the rule, not a confirmed answer. The clerk decides.",
  status: "pending_verification",
  language: "en",
  intent: "fees",
  evidence: [EV21],
  extracted_facts: [],
  missing_information: {
    known_facts: [],
    missing_facts: [],
    invalid_facts: [],
    unverified_facts: [],
    prerequisites_established: false,
    clarifying_question: null,
    reason: "No verified calculation module exists for this question type yet. No values were assumed.",
  },
  assumptions: [],
  calculations: [],
  warnings: [
    "Preliminary pointer: not an official approval.",
    "Cited text contains flattened tables; check any figure against the official PDF page before use.",
  ],
  version_status: [],
  follow_up_question: null,
  rejected_evidence: [{ evidence_id: "EV-99-001-aaaa1111", reason: "weak match" }],
  conversation_id: null,
  explanation: null,
  explanation_citations: [],
};

export const askNotEstablished: AskResponse = {
  ...askPending,
  answer: "The ingested rules do not establish an answer to this question.",
  status: "not_established",
  intent: "out_of_scope",
  evidence: [],
  missing_information: {},
  warnings: ["This question appears to be outside the scope of the Bhumi Vikas Rules."],
  rejected_evidence: [],
};

export const askInsufficient: AskResponse = {
  ...askPending,
  status: "insufficient_information",
  intent: "setback",
  conversation_id: "conv-abcdef123456",
  follow_up_question: "What is the width of the road in front of the plot?",
  extracted_facts: [
    {
      name: "plot_area",
      value: "150",
      unit: "sqm",
      source: "user_provided",
      origin: "question_text",
      validation_status: "valid",
      confidence: "high",
      note: null,
    },
  ],
  missing_information: {
    known_facts: [],
    missing_facts: ["road_width"],
    invalid_facts: [],
    unverified_facts: [],
    prerequisites_established: false,
    clarifying_question: "What is the width of the road?",
    reason: "Road width is needed.",
  },
};

export const calc200: CalculationTrace = {
  calculation_id: "calc-3a80db0342db",
  calculation_type: "plot_area_rectangle",
  formula_id: "plot_area_rectangle.v1",
  formula_source: "arithmetic (length x width); general geometry, not a regulatory formula",
  inputs: { length: { value: "20", unit: "m" }, width: { value: "10", unit: "m" } },
  final_value: "200",
  output_unit: "sqm",
  validation_status: "valid",
  verification_status: "not_applicable_general_arithmetic",
  rule_reference: null,
  intermediate: { length_m: "20", width_m: "10", area_sqm_unrounded: "200" },
  warnings: ["General arithmetic only; this is not evidence of regulatory compliance."],
  assumptions: [],
  rounding_policy: "ROUND_HALF_UP",
};

const reg = (id: string, desc: string) => ({
  check_id: `regulatory.${id}`,
  description: desc,
  status: "not_evaluated" as const,
  input_values: {},
  rule_references: ["Rule 21"],
  calculation_result: null,
  explanation: "No verified rule logic exists for this check.",
  missing_information: [],
  warnings: [],
  related_evidence_ids: ["EV-21-002-f9a2941e"],
});
export const checks = [
  {
    check_id: "geometry.plot_area_consistency",
    description: "Plot area matches length x width",
    status: "passed" as const,
    input_values: { plot_area: { value: "200", unit: "sqm" } },
    rule_references: [],
    calculation_result: calc200,
    explanation: "Stated area equals length x width.",
    missing_information: [],
    warnings: [],
    related_evidence_ids: [],
  },
  reg("setbacks", "Setbacks"),
  reg("floor_area_ratio_coverage", "FAR and coverage"),
  reg("height", "Building height"),
  reg("parking", "Parking"),
  reg("permission_fees", "Permission fees"),
];
export const assessmentOut: AssessmentOut = {
  id: "asm-0001",
  project_id: "prj-0001",
  overall_status: "incomplete",
  summary: "Some requirements were not evaluated. Not a compliance determination.",
  checks,
  assumptions: [],
  missing_information: ["road_width"],
  warnings: [],
  input_snapshot: { plot_length: { value: "20", unit: "m" } },
  created_at: "2026-10-14T10:00:00Z",
};
export const previewOut: PlotPreviewResponse = {
  geometry: {
    type: "polygon",
    role: "proposed_plot",
    unit: "m",
    origin: "bottom_left",
    points: [
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ],
    closed: true,
    dimension_labels: [
      { edge: 0, text: "10 m" },
      { edge: 1, text: "20 m" },
      { edge: 2, text: "10 m" },
      { edge: 3, text: "20 m" },
    ],
    orientation_note: "Edge 0 is the road edge; orientation not provided.",
  },
  annotations: [],
  verified_constraints: [],
  unresolved_constraints: [
    { constraint: "setbacks", description: "Setbacks are not evaluated", status: "not_evaluated" },
  ],
  warnings: ["Geometry is schematic."],
  legend: { polygon: "Proposed plot" },
};
export const ruleEmbedded: RuleSummary = {
  rule_key: "12a",
  official_rule_id: "12A",
  title: "Inserted rule",
  part: "Part III: Permission And Inspection",
  versions: [],
  linked_amendments: [],
  embedded_in: "12",
  version_resolution: null,
};
export const rule25: RuleSummary = {
  rule_key: "2",
  official_rule_id: "2",
  title: "Definitions",
  part: "Part I: General",
  versions: [],
  embedded_in: null,
  linked_amendments: [
    {
      amendment_id: "AMD-2026-08-28-R2-5-C",
      title: "Rule 2(5)(c) amendment",
      verification_status: "pending_verification",
      effective_date: null,
      stated_date: "2026-08-28",
    },
  ],
  version_resolution: {
    rule_key: "2",
    status: "unknown_effective_date",
    version_ids: [],
    reasons: ["Pending amendment; effective date unknown."],
    linked_amendments: [],
    as_of: null,
    corpus_consolidated_to: "2025-03-06",
  },
};
export const versions12: RuleVersionsResponse = {
  rule_key: "12",
  items: [],
  version_resolution: {
    rule_key: "12",
    status: "verified_current",
    version_ids: [],
    reasons: [],
    linked_amendments: [],
    as_of: null,
    corpus_consolidated_to: "2025-03-06",
  },
};
export const reportOut: ReportOut = {
  report_version: "1",
  generated_at: "2026-10-14T10:05:00Z",
  assessment_id: "asm-0001",
  assessment_created_at: "2026-10-14T10:00:00Z",
  status: "incomplete",
  summary: assessmentOut.summary,
  input_snapshot: assessmentOut.input_snapshot,
  checks,
  evidence: [
    {
      evidence_id: EV21.evidence_id,
      rule_number: "21",
      rule_version_id: "RV-21-1",
      source_document_id: "doc",
      page_reference: "35-36",
      evidence_text: "text",
      evidence_role: "related_context",
      verification_status: "unverified",
    },
  ],
  rule_versions_used: [{ version_key: "21@1", content_hash: "abc123", verification_status: "unverified" }],
  assumptions: [],
  missing_information: [],
  warnings: [],
  unevaluated_checks: checks.filter((c) => c.status === "not_evaluated").map((c) => c.check_id),
  disclaimer: "Not an official approval. Not a compliance determination.",
};
export const errBody = (code: string, message: string, details: unknown[] = []) => ({
  code,
  message,
  request_id: "req-test-1",
  details,
});
