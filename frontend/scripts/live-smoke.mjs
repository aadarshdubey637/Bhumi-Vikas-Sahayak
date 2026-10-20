// Optional live smoke test. LIVE_API_URL (+ optional LIVE_API_KEY) come from the shell only. The key is never printed.
const BASE = process.env.LIVE_API_URL?.replace(/\/+$/, "");
if (!BASE) {
  console.log("live-smoke: SKIPPED — set LIVE_API_URL");
  process.exit(0);
}
const KEY = process.env.LIVE_API_KEY;
const call = async (method, path, body, auth = true) => {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(auth && KEY ? { "X-API-Key": KEY } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`); };

const SIX = ["supported", "conditional", "insufficient_information", "not_established", "source_conflict", "pending_verification"];
let r = await call("GET", "/health", undefined, false);
check("GET /health", r.status === 200 && r.json?.status === "ok");
r = await call("GET", "/ready", undefined, false);
check("GET /ready (200 or 503)", [200, 503].includes(r.status) && Array.isArray(r.json?.notes));
const rulesLoaded = (r.json?.rules_loaded ?? 0) > 0;
r = await call("POST", "/calculations/plot-area", { length: { value: "20", unit: "m" }, width: { value: "10", unit: "m" }, output_unit: "sqm", places: 4 });
check("plot-area 20x10 m", r.status === 200 && r.json?.final_value === "200" && r.json?.output_unit === "sqm", `status ${r.status}`);
if (rulesLoaded) {
  r = await call("POST", "/rules/search", { rule_number: "21" });
  check("rules/search rule 21", r.status === 200 && r.json?.items?.length > 0 && r.json.items.every((i) => i.rule_number === "21"), `status ${r.status}`);
} else console.log("SKIP  rules/search (no rules loaded)");
r = await call("POST", "/ask", { question: "What is the fee for building permission for a residential house?" });
check("ask (fees) returns one of six statuses, calculations empty", r.status === 200 && SIX.includes(r.json?.status) && r.json?.calculations?.length === 0, `status ${r.json?.status}`);
r = await call("POST", "/ask", { question: "q", bogus_field: 1 });
check("ask with unknown field -> 422 validation_error", r.status === 422 && r.json?.code === "validation_error");
r = await call("POST", "/calculations/plot-area", { length: { value: "-1", unit: "m" }, width: { value: "10", unit: "m" } });
check("plot-area with -1 -> 422", r.status === 422);
process.exit(results.every(Boolean) ? 0 : 1);
