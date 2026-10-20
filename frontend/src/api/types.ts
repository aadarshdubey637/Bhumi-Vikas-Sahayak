// TypeScript mirror of backend/app/schemas/api.py. Keep in sync; the contract test checks drift.

export type AnswerStatus =
  | "supported"
  | "conditional"
  | "insufficient_information"
  | "not_established"
  | "source_conflict"
  | "pending_verification";
export type CheckStatus = "passed" | "failed" | "conditional" | "not_evaluated" | "pending_verification";
export type OverallStatus = "failed_checks_present" | "incomplete" | "evaluated_checks_passed";
export type Language = "en" | "hi" | "hi-en";
export type Verification = "unverified" | "pending_verification" | "verified" | "rejected";
export type VersionStatus =
  | "verified_current"
  | "historical"
  | "pending_verification"
  | "source_conflict"
  | "unknown_effective_date"
  | "insufficient_information";
export type FeedbackCategory =
  | "incorrect_answer"
  | "incorrect_citation"
  | "outdated_rule"
  | "incorrect_calculation"
  | "missing_information"
  | "other";
export type ResolutionStatus = "open" | "reviewed" | "resolved" | "rejected";
export type ProjectStatus = "draft" | "active" | "archived";
export type OutputAreaUnit = "sqm" | "sqft" | "sqyd" | "acre" | "hectare";

export const ANSWER_STATUSES: readonly AnswerStatus[] = [
  "supported",
  "conditional",
  "insufficient_information",
  "not_established",
  "source_conflict",
  "pending_verification",
];
export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "incorrect_answer",
  "incorrect_citation",
  "outdated_rule",
  "incorrect_calculation",
  "missing_information",
  "other",
];

export interface Measurement {
  value: string;
  unit: string;
}
/** A string is only valid for `building_use` and `location`. */
export type InputValue = Measurement | string;
export type InputMap = Record<string, InputValue>;

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string | null;
  details: Array<Record<string, unknown>>;
}

export interface Evidence {
  evidence_id: string;
  rule_key: string;
  rule_number: string;
  rule_title: string;
  rule_version_id: string;
  source_document_id: string;
  page_start: number | null;
  page_end: number | null;
  page_precision: string;
  excerpt: string;
  verification_status: Verification;
  retrieval_method: string;
  score: number | null;
  table_like: boolean;
  flags: string[];
  is_embedded_rule: boolean;
}

export interface ExtractedFact {
  name: string;
  value: string;
  unit: string | null;
  source: "user_provided" | "document_derived" | "system_calculated";
  origin: string;
  validation_status: "valid" | "invalid" | "unverified";
  confidence: string;
  note?: string | null;
}

export interface MissingInformation {
  known_facts: ExtractedFact[];
  missing_facts: string[];
  invalid_facts: string[];
  unverified_facts: string[];
  prerequisites_established: boolean;
  clarifying_question: string | null;
  reason: string | null;
}

export interface LinkedAmendment {
  amendment_id: string;
  title: string;
  verification_status: string;
  effective_date: string | null;
  stated_date: string | null;
}

export interface VersionResolution {
  rule_key: string;
  status: VersionStatus;
  version_ids: string[];
  reasons: string[];
  linked_amendments: LinkedAmendment[];
  as_of: string | null;
  corpus_consolidated_to: string | null;
}

export interface CalculationTrace {
  calculation_id: string;
  calculation_type: string;
  formula_id: string;
  formula_source: string;
  inputs: Record<string, Measurement | Record<string, string>>;
  final_value: string | null;
  output_unit: string | null;
  validation_status: "valid" | "invalid";
  verification_status: string;
  rule_reference: string | null;
  intermediate: Record<string, string>;
  warnings: string[];
  assumptions: string[];
  rounding_policy: string;
}

// ---- /ask
export interface AskRequest {
  question: string;
  language?: Language;
  conversation_id?: string;
  project_id?: string;
  context?: InputMap;
  as_of?: string;
  explain?: boolean;
}
export interface RejectedEvidence {
  evidence_id: string;
  reason: string;
}
export interface AskResponse {
  answer: string;
  status: AnswerStatus;
  language: Language;
  intent: string;
  evidence: Evidence[];
  extracted_facts: ExtractedFact[];
  /** May be an empty object. */
  missing_information: MissingInformation | Record<string, never>;
  assumptions: string[];
  calculations: CalculationTrace[];
  warnings: string[];
  version_status: VersionResolution[];
  follow_up_question: string | null;
  rejected_evidence: RejectedEvidence[];
  conversation_id: string | null;
  explanation: string | null;
  explanation_citations: string[];
  /** The stated answer with verbatim, source-matched rule quotes; null when the rules give none. */
  direct_answer?: DirectAnswer | null;
  /** Which version of the rules the answer comes from. */
  source_version?: string;
}

export interface DirectQuote {
  rule_number: string;
  rule_title: string;
  page_start: number | null;
  page_end: number | null;
  text: string;
  verified: boolean;
}

/** A numeric limit the rule text states for the inputs given. A comparison aid, never a compliance verdict. */
export interface DirectRequirement {
  key: "front_open_space" | "rear_open_space" | "max_floor_area" | (string & {});
  limit: "min" | "max";
  value: string;
  unit: string;
  rule: string;
  basis: string;
}

/** One row of a rule table, offered when the deciding input is missing: "if <by> is over lo up to hi, then value". */
export interface DirectScenario {
  key: "front_open_space" | "rear_open_space" | (string & {});
  by: "road_width" | "plot_area" | (string & {});
  lo: string | null;
  hi: string | null;
  unit: string;
  value: string;
  value_unit: string;
  rule: string;
}

export interface DirectAnswer {
  kind: string;
  headline: string;
  lines: string[];
  rules: string[];
  quotes: DirectQuote[];
  steps: string[];
  caveats: string[];
  missing: string[];
  follow_up: string | null;
  assumed: boolean;
  amendment_flag: boolean;
  requirements?: DirectRequirement[];
  scenarios?: DirectScenario[];
}

// ---- rules
export interface RuleSearchRequest {
  query?: string;
  rule_number?: string;
  language?: Language;
  verification_status?: Verification;
  part?: string;
  document_key?: string;
  limit?: number;
  offset?: number;
}
export interface RuleSearchResponse {
  items: Evidence[];
  total: number;
  limit: number;
  offset: number;
  note?: string | null;
}
export interface RuleVersionSummary {
  version_id: string;
  version_status: "active" | "superseded";
  source_document_id: string;
  language: string;
  page_start: number;
  page_end: number;
  verification_status: Verification;
  effective_from: string | null;
  effective_until: string | null;
  content_hash: string;
}
export interface RuleSummary {
  rule_key: string;
  official_rule_id: string;
  title: string;
  part: string;
  versions: RuleVersionSummary[];
  linked_amendments: LinkedAmendment[];
  embedded_in: string | null;
  version_resolution: VersionResolution | null;
}
export interface SourceDocumentOut {
  document_key: string;
  title: string;
  document_type: string;
  language: string;
  jurisdiction: string;
  source_url: string | null;
  publication_date: string | null;
  effective_date: string | null;
  consolidation_date: string | null;
  document_version: string | null;
  file_hash: string | null;
  page_count: number | null;
  verification_status: Verification;
  notes: string | null;
}
export interface RuleVersionDetail extends RuleVersionSummary {
  rule_key: string;
  official_rule_id: string;
  original_text: string;
  source_document: SourceDocumentOut;
  flags: string[];
  reviewer_notes: string | null;
}
export interface RuleVersionsResponse {
  rule_key: string;
  items: RuleVersionDetail[];
  version_resolution: VersionResolution;
}
export interface DocumentsResponse {
  items: SourceDocumentOut[];
}

// ---- projects / assessments / reports
export interface ProjectCreate {
  name: string;
  building_use?: string;
  jurisdiction?: string;
  inputs?: InputMap;
}
export interface ProjectUpdate {
  name?: string;
  building_use?: string;
  status?: ProjectStatus;
  inputs?: InputMap;
}
export interface ProjectInputOut {
  name: string;
  value: string;
  unit: string | null;
  input_source: string;
  verification_status: string;
}
export interface ProjectOut {
  id: string;
  input_details: ProjectInputOut[];
  name: string;
  building_use: string | null;
  jurisdiction: string;
  status: string;
  inputs: InputMap;
  created_at: string;
  updated_at: string;
}
export interface Page {
  total: number;
  limit: number;
  offset: number;
}
export interface ProjectPage extends Page {
  items: ProjectOut[];
}
export interface AssessmentCreate {
  project_id?: string;
  inputs?: InputMap;
  as_of?: string;
}
export interface AssessmentCheck {
  check_id: string;
  description: string;
  status: CheckStatus;
  input_values: Record<string, unknown>;
  rule_references: string[];
  calculation_result: CalculationTrace | null;
  explanation: string;
  missing_information: string[];
  warnings: string[];
  related_evidence_ids: string[];
}
export interface AssessmentOut {
  id: string;
  project_id: string | null;
  overall_status: OverallStatus;
  summary: string;
  checks: AssessmentCheck[];
  assumptions: string[];
  missing_information: string[];
  warnings: string[];
  input_snapshot: Record<string, unknown>;
  created_at: string;
}
export interface AssessmentPage extends Page {
  items: AssessmentOut[];
}
export interface AssessmentEvidenceOut {
  evidence_id: string;
  rule_number: string;
  rule_version_id: string;
  source_document_id: string;
  page_reference: string | null;
  evidence_text: string;
  evidence_role: string;
  verification_status: Verification;
}
export interface AssessmentEvidenceList {
  assessment_id: string;
  items: AssessmentEvidenceOut[];
}
export interface ReportOut {
  report_version: string;
  generated_at: string;
  assessment_id: string;
  assessment_created_at: string;
  status: string;
  summary: string | null;
  input_snapshot: Record<string, unknown>;
  checks: AssessmentCheck[];
  evidence: AssessmentEvidenceOut[];
  rule_versions_used: Array<Record<string, string>>;
  assumptions: string[];
  missing_information: string[];
  warnings: string[];
  unevaluated_checks: string[];
  disclaimer: string;
}

// ---- feedback
export interface FeedbackCreate {
  category: FeedbackCategory;
  message: string;
  assessment_id?: string;
  evidence_id?: string;
}
export interface FeedbackOut {
  id: string;
  assessment_id: string | null;
  evidence_id: string | null;
  category: FeedbackCategory;
  resolution_status: ResolutionStatus;
  created_at: string;
}
export interface FeedbackPage extends Page {
  items: FeedbackOut[];
}

// ---- calculations / plots
export interface PlotAreaRequest {
  length: Measurement;
  width: Measurement;
  output_unit?: OutputAreaUnit;
  places?: number;
}
export interface AssessRequest {
  inputs?: InputMap;
  as_of?: string;
}
export interface AssessResponse {
  overall_status: OverallStatus;
  summary: string;
  checks: AssessmentCheck[];
  assumptions: string[];
  missing_information: string[];
  warnings: string[];
  persisted: boolean;
}
export interface PlotPreviewRequest {
  inputs?: InputMap;
}
export interface PlotGeometry {
  type: "polygon";
  role: "proposed_plot";
  unit: "m";
  origin: "bottom_left";
  points: Array<[number, number]>;
  closed: true;
  dimension_labels: Array<{ edge: number; text: string }>;
  orientation_note: string;
}
export interface PlotAnnotation {
  type: "road";
  edge: number;
  label: string;
  source: "user_provided";
}
export interface UnresolvedConstraint {
  constraint: string;
  description: string;
  status: string;
}
export interface PlotPreviewResponse {
  geometry: PlotGeometry | null;
  annotations: PlotAnnotation[];
  verified_constraints: Array<Record<string, unknown>>;
  unresolved_constraints: UnresolvedConstraint[];
  warnings: string[];
  legend: Record<string, string>;
}

// ---- ops
export interface HealthOut {
  status: "ok";
  version: string;
  time: string;
}
export interface ReadyOut {
  status: "ready" | "not_ready";
  checks: Record<string, boolean>;
  rules_loaded: number;
  notes: string[];
}
