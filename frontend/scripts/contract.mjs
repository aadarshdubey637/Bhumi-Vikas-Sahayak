// Contract test: compares the client with a RUNNING backend's /openapi.json. Skips if the backend is unreachable.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.CONTRACT_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
let spec;
try {
  spec = await (await fetch(`${BASE}/openapi.json`)).json();
} catch {
  console.log(`contract: SKIPPED — backend not reachable at ${BASE}`);
  process.exit(0);
}
const failures = [];

// 1. every (method, path) the client calls exists, and every backend operation is used by the client
const dir = "src/api/endpoints";
const called = new Set();
for (const f of readdirSync(dir)) {
  const src = readFileSync(join(dir, f), "utf8");
  for (const m of src.matchAll(/request<[^>]*(?:<[^>]*>)?[^>]*>\(\s*"(GET|POST|PATCH)",\s*[`"]([^`"]+)[`"]/g)) {
    called.add(`${m[1]} /api/v1${m[2].replace(/\$\{[^}]+\}/g, "{}")}`);
  }
}
const ops = new Set();
for (const [path, item] of Object.entries(spec.paths))
  for (const method of Object.keys(item)) if (["get", "post", "patch", "delete", "put"].includes(method)) ops.add(`${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}")}`);
for (const c of called) if (!ops.has(c)) failures.push(`client calls ${c} but the backend has no such operation`);
for (const o of ops) if (!called.has(o)) failures.push(`backend operation ${o} is not used by the client`);
if (ops.size !== 29) failures.push(`expected 29 backend operations, found ${ops.size}`);

// 2. request models: additionalProperties:false and the fields the client sends are all known
const schemas = spec.components.schemas;
const sent = {
  AskRequest: ["question", "language", "conversation_id", "project_id", "context", "as_of", "explain"],
  RuleSearchRequest: ["query", "rule_number", "language", "verification_status", "part", "document_key", "limit", "offset"],
  ProjectCreate: ["name", "building_use", "jurisdiction", "inputs"],
  ProjectUpdate: ["name", "building_use", "status", "inputs"],
  AssessmentCreate: ["project_id", "inputs", "as_of"],
  FeedbackCreate: ["category", "message", "assessment_id", "evidence_id"],
  PlotAreaRequest: ["length", "width", "output_unit", "places"],
  AssessRequest: ["inputs", "as_of"],
  PlotPreviewRequest: ["inputs"],
};
for (const [name, fields] of Object.entries(sent)) {
  const s = schemas[name];
  if (!s) { failures.push(`schema ${name} missing`); continue; }
  const props = Object.keys(s.properties ?? {});
  for (const f of fields) if (!props.includes(f)) failures.push(`${name}: client may send '${f}' but backend has no such field`);
  if (s.additionalProperties !== false) failures.push(`${name}: expected additionalProperties:false (client strips unknown keys on that assumption)`);
}

// 3. enums: each TS union must match some backend enum exactly
const enumSets = [];
const collect = (o) => {
  if (Array.isArray(o)) return o.forEach(collect);
  if (o && typeof o === "object") {
    if (Array.isArray(o.enum)) enumSets.push([...o.enum].sort().join("|"));
    Object.values(o).forEach(collect);
  }
};
collect(spec);
const unions = {
  AnswerStatus: ["supported", "conditional", "insufficient_information", "not_established", "source_conflict", "pending_verification"],
  CheckStatus: ["passed", "failed", "conditional", "not_evaluated", "pending_verification"],
  OverallStatus: ["failed_checks_present", "incomplete", "evaluated_checks_passed"],
  Language: ["en", "hi", "hi-en"],
  Verification: ["unverified", "pending_verification", "verified", "rejected"],
  VersionStatus: ["verified_current", "historical", "pending_verification", "source_conflict", "unknown_effective_date", "insufficient_information"],
  FeedbackCategory: ["incorrect_answer", "incorrect_citation", "outdated_rule", "incorrect_calculation", "missing_information", "other"],
  ResolutionStatus: ["open", "reviewed", "resolved", "rejected"],
  OutputAreaUnit: ["sqm", "sqft", "sqyd", "acre", "hectare"],
};
for (const [name, vals] of Object.entries(unions)) {
  const key = [...vals].sort().join("|");
  if (!enumSets.includes(key)) failures.push(`enum ${name} (${vals.join(",")}) does not match any backend enum exactly`);
}

if (failures.length) {
  console.error("contract: FAILED\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log(`contract: OK (${ops.size} operations, ${Object.keys(sent).length} request models, ${Object.keys(unions).length} enums)`);
