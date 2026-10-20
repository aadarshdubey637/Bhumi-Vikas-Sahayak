import { describe, expect, it } from "vitest";
import type { AskResponse, AssessResponse, DirectRequirement } from "@/api/types";
import { buildAnswerView, speechChunks } from "./answerView";
import { evaluateCompliance } from "./compliance";
import { boxFaces, clampCam, DEFAULT_CAM, fit, project, wallFacesViewer } from "./projection";
import { cellMetres, emptyWbForm, exampleWbForm, parseWb, placeBuilding } from "./workbench";

const REQS: DirectRequirement[] = [
  { key: "front_open_space", limit: "min", value: "3.0", unit: "m", rule: "56(1)(a)", basis: "up to 9.0 m" },
  { key: "rear_open_space", limit: "min", value: "2.50", unit: "m", rule: "56(2)(a)", basis: "plot 200 sq m" },
  { key: "max_floor_area", limit: "max", value: "250", unit: "sqm", rule: "61 (Table 8)", basis: "residential FAR 1.25" },
];
const answer = (over: Partial<AskResponse> = {}, reqs: DirectRequirement[] = REQS): AskResponse => ({
  answer: "a",
  status: "conditional",
  language: "en",
  intent: "setback",
  evidence: [{ evidence_id: "EV-56-1", rule_key: "56", rule_number: "56", rule_title: "Residential Buildings", rule_version_id: "v", source_document_id: "d", page_start: 78, page_end: 79, page_precision: "located_in_page_text", excerpt: "x", verification_status: "unverified", retrieval_method: "bm25", score: 1, table_like: false, flags: [], is_embedded_rule: false }],
  extracted_facts: [],
  missing_information: {},
  assumptions: [],
  calculations: [],
  warnings: [],
  version_status: [],
  follow_up_question: null,
  rejected_evidence: [],
  conversation_id: null,
  explanation: null,
  explanation_citations: [],
  direct_answer: { kind: "multi", headline: "Answer: front 3.0 m", lines: ["Front open space: minimum 3.0 m (street 9 m wide; Rule 56(1)(a))."], rules: ["56"], quotes: [{ rule_number: "56", rule_title: "Residential Buildings", page_start: 78, page_end: 79, text: "t", verified: true }], steps: ["Road width 9 m ..."], caveats: [], missing: [], follow_up: null, assumed: false, amendment_flag: false, requirements: reqs },
  ...over,
});
const ASSESS: AssessResponse = {
  overall_status: "incomplete",
  summary: "",
  assumptions: [],
  missing_information: [],
  warnings: [],
  persisted: false,
  checks: [
    { check_id: "geometry.plot_area_consistency", description: "x", status: "passed", input_values: {}, rule_references: [], calculation_result: null, explanation: "ok", missing_information: [], warnings: [], related_evidence_ids: [] },
    { check_id: "regulatory.parking", description: "Parking requirement", status: "not_evaluated", input_values: {}, rule_references: [], calculation_result: null, explanation: "no module", missing_information: [], warnings: [], related_evidence_ids: [] },
  ],
};

const metricsOf = (patch: (f: ReturnType<typeof exampleWbForm>) => void) => {
  const f = exampleWbForm();
  patch(f);
  return parseWb(f).metrics;
};
const item = (r: ReturnType<typeof evaluateCompliance>, id: string) => r.items.find((i) => i.id === id)!;

describe("workbench form model", () => {
  it("converts units and ignores invalid or empty cells", () => {
    expect(cellMetres({ value: "10", unit: "ft" })).toBeCloseTo(3.048);
    expect(cellMetres({ value: "0", unit: "m" })).toBeNull();
    expect(cellMetres({ value: "0", unit: "m" }, true)).toBe(0);
    expect(cellMetres({ value: "1,5", unit: "m" })).toBeNull();
    expect(parseWb(emptyWbForm()).inputs).toEqual({});
  });
  it("sends only server inputs; the gap fields stay on the client", () => {
    const p = parseWb(exampleWbForm());
    expect(Object.keys(p.inputs).sort()).toEqual(["building_height", "building_length", "building_use", "building_width", "built_up_area", "floors", "plot_area", "plot_length", "plot_width", "road_width"]);
    expect(p.inputs).not.toHaveProperty("gap_front");
    expect(p.inputs.floors).toEqual({ value: "2", unit: "count" });
  });
  it("derives plot_area from length x width and says so", () => {
    const p = parseWb(exampleWbForm());
    expect(p.metrics.plotAreaDerived).toBe(true);
    expect(p.metrics.plotAreaSqm).toBe(200);
    const f = exampleWbForm();
    f.cells.plot_area = { value: "180", unit: "sqm" };
    expect(parseWb(f).metrics.plotAreaDerived).toBe(false);
  });
  it("reports invalid values as i18n keys and leaves them out", () => {
    const f = exampleWbForm();
    f.cells.road_width.value = "abc";
    f.cells.gap_front.value = "-2";
    f.floors = "0";
    const p = parseWb(f);
    expect(p.errors).toMatchObject({ road_width: "validation.decimal", gap_front: "validation.nonNegative", floors: "validation.floors" });
    expect(p.inputs).not.toHaveProperty("road_width");
    expect(p.metrics.roadW).toBeUndefined();
    expect(p.metrics.gapFront).toBeUndefined();
  });
  it("places the building, flags assumed positions and out-of-plot footprints", () => {
    const ok = placeBuilding(metricsOf(() => undefined))!;
    expect(ok).toMatchObject({ x0: 1.5, y0: 3, rightGap: 1.5, rearGap: 5, outside: false, assumedX: false });
    const centred = placeBuilding(metricsOf((f) => { f.cells.gap_left.value = ""; f.cells.gap_front.value = ""; }))!;
    expect(centred.assumedX && centred.assumedY).toBe(true);
    expect(centred.x0).toBe(1.5);
    expect(placeBuilding(metricsOf((f) => { f.cells.building_length.value = "19"; }))!.outside).toBe(true);
    expect(placeBuilding(metricsOf((f) => { f.cells.building_width.value = ""; }))).toBeNull();
  });
});

describe("compliance comparison", () => {
  const run = (patch: (f: ReturnType<typeof exampleWbForm>) => void = () => undefined, a: AskResponse | null = answer()) =>
    evaluateCompliance({ metrics: metricsOf(patch), answer: a, assessment: ASSESS });

  it("passes the example only as 'no violation found', never as compliant", () => {
    const r = run();
    expect(r.verdict).toBe("preliminary_ok");
    expect(item(r, "front")).toMatchObject({ status: "within", limit: "3 m (10 ft)", measured: "3 m (10 ft)", rule: "56(1)(a)" });
    expect(item(r, "rear")).toMatchObject({ status: "within", measured: "5 m (16 ft)", limit: "2.5 m (8 ft)" });
    expect(item(r, "far")).toMatchObject({ status: "within", limit: "250 sq m (2,691 sq ft)" });
    expect(r.regWithin).toBe(3);
    expect(r.unverified).toBe(true);
    expect(item(r, "regulatory.parking").status).toBe("not_evaluated");
    expect(item(r, "side").status).toBe("info");
  });
  it("flags a front gap below the stated minimum with a computed suggestion", () => {
    const r = run((f) => { f.cells.gap_front.value = "2"; });
    expect(r.verdict).toBe("violations");
    expect(r.flags.front).toBe(true);
    expect(item(r, "front").suggestions[0]).toEqual({ key: "wb.s.moveBack", params: { by: "1 m (3 ft)", limit: "3 m (10 ft)" } });
  });
  it("derives the rear gap and suggests how to fix it", () => {
    const r = run((f) => { f.cells.building_length.value = "16"; });
    expect(item(r, "rear")).toMatchObject({ status: "violation", measured: "1 m (3 ft)" });
    expect(item(r, "rear").suggestions[0]).toEqual({ key: "wb.s.shrinkDepth", params: { by: "1.5 m (5 ft)" } });
    expect(r.flags.rear).toBe(true);
  });
  it("flags floor area above the cap", () => {
    const r = run((f) => { f.cells.built_up_area.value = "300"; });
    expect(item(r, "far")).toMatchObject({ status: "violation", measured: "300 sq m (3,229 sq ft)" });
    expect(item(r, "far").suggestions[0]?.params).toMatchObject({ by: "50 sq m (538 sq ft)" });
  });
  it("detects a footprint outside the plot", () => {
    const r = run((f) => { f.cells.building_width.value = "12"; });
    expect(item(r, "geo-fit").status).toBe("violation");
    expect(r.verdict).toBe("violations");
  });
  it("asks for missing inputs instead of guessing", () => {
    const r = run((f) => { f.cells.gap_front.value = ""; f.cells.building_length.value = ""; });
    expect(item(r, "front")).toMatchObject({ status: "needs_input", missing: ["gap_front"] });
    expect(item(r, "rear").missing).toEqual(["gap_front", "building_length"]);
    expect(r.missing).toContain("gap_front");
    expect(r.verdict).toBe("preliminary_ok"); // FAR alone was evaluated; the rest is listed as missing, never as a pass
    expect(r.counts.needs_input).toBe(2);
  });
  it("cannot evaluate when the backend returned no limits", () => {
    const r = run(() => undefined, answer({}, []));
    expect(r.verdict).toBe("cannot_evaluate");
    expect(item(r, "front").status).toBe("not_evaluated");
    expect(run(() => undefined, null).verdict).toBe("cannot_evaluate");
  });
  it("does not judge tall or non-residential buildings against Rule 56", () => {
    const tall = run((f) => { f.cells.building_height.value = "54"; }, answer({}, REQS.slice(2)));
    expect(item(tall, "front")).toMatchObject({ status: "not_evaluated", detail: { key: "wb.c.tall" } });
    expect(item(tall, "height").status).toBe("not_evaluated");
    const shop = run((f) => { f.building_use = "commercial"; }, answer({}, []));
    expect(item(shop, "front").detail?.key).toBe("wb.c.nonResidential");
  });
  it("asks for the road width when it is the missing piece", () => {
    const r = run((f) => { f.cells.road_width.value = ""; }, answer({}, []));
    expect(item(r, "front")).toMatchObject({ status: "needs_input", missing: ["road_width"] });
  });
});

describe("answer view", () => {
  const tr = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${JSON.stringify(p)}` : k);
  it("states the answer, next steps, sources and what is read aloud", () => {
    const v = buildAnswerView(answer(), tr);
    expect(v.mode).toBe("direct");
    expect(v.summary).toEqual(["Front open space: minimum 3.0 m (street 9 m wide; Rule 56(1)(a))."]);
    expect(v.sources).toEqual([{ rule: "56", pages: "78–79", evidenceId: "EV-56-1", verified: false }]);
    expect(v.next.map((n) => n.text)).toContain("wb.a.verify");
    expect(v.headline).toContain("plain.s.front");
    expect(v.speech).toContain("plain.s.front");
    expect(v.badge).toBe("plain.badge.conditional");
    expect(v.speech).toContain("wb.a.ruleSpoken");
    expect(v.applied).toEqual(["Road width 9 m ..."]);
  });
  it("turns missing facts into 'go to field' steps", () => {
    const a = answer();
    a.direct_answer!.missing = ["road_width", "built_up_area"];
    const fields = buildAnswerView(a, tr).next.filter((n) => n.field).map((n) => n.field);
    expect(fields).toEqual(["road_width", "built_up_area"]);
  });
  it("abstains in plain words and offers no sources when not established", () => {
    const v = buildAnswerView(answer({ status: "not_established", direct_answer: null, evidence: [] }), tr);
    expect(v.mode).toBe("none");
    expect(v.summary).toEqual(["wb.a.notEstablished"]);
    expect(v.sources).toEqual([]);
    expect(v.next.map((n) => n.text)).toEqual(["wb.a.rephrase", "wb.a.rulebook", "wb.a.clerk"]);
  });
  it("falls back to a pointer when there is no stated answer", () => {
    expect(buildAnswerView(answer({ direct_answer: null }), tr).mode).toBe("pointer");
  });
  it("splits speech into short chunks at sentence ends, including the Hindi danda", () => {
    const text = "Pehla vakya. Doosra vakya!\nTeesra? " + "x".repeat(400) + "। अंतिम";
    const chunks = speechChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toContain("Doosra vakya!");
  });
});

describe("3D projection", () => {
  const c = { x: 0, y: 0, z: 0 };
  it("puts higher points higher on screen and nearer points nearer", () => {
    const low = project({ x: 0, y: 0, z: 0 }, c, DEFAULT_CAM);
    const high = project({ x: 0, y: 0, z: 10 }, c, DEFAULT_CAM);
    expect(high.sy).toBeGreaterThan(low.sy);
    const nearRoad = project({ x: 0, y: -10, z: 0 }, c, { ...DEFAULT_CAM, yaw: 0 });
    const farBack = project({ x: 0, y: 10, z: 0 }, c, { ...DEFAULT_CAM, yaw: 0 });
    expect(nearRoad.depth).toBeGreaterThan(farBack.depth);
    expect(farBack.sy).toBeGreaterThan(nearRoad.sy);
  });
  it("shows the road-side wall at yaw 0 and swaps walls when rotated half a turn", () => {
    const cam = { ...DEFAULT_CAM, yaw: 0 };
    expect(wallFacesViewer(0, -1, cam)).toBe(true);
    expect(wallFacesViewer(0, 1, cam)).toBe(false);
    expect(wallFacesViewer(0, 1, { ...cam, yaw: 180 })).toBe(true);
  });
  it("draws only visible walls plus the roof, far to near", () => {
    const faces = boxFaces({ x0: 0, y0: 0, w: 4, d: 6, h: 9 }, { ...DEFAULT_CAM, yaw: 0 });
    expect(faces.map((f) => f.id)).toContain("roof");
    expect(faces.filter((f) => f.kind === "wall").map((f) => f.id)).toEqual(["front"]);
    const rotated = boxFaces({ x0: 0, y0: 0, w: 4, d: 6, h: 9 }, DEFAULT_CAM);
    expect(rotated.filter((f) => f.kind === "wall").length).toBe(2);
  });
  it("clamps and wraps the camera, and fits every point in the viewport", () => {
    expect(clampCam({ yaw: 190, pitch: 200, zoom: 99 })).toEqual({ yaw: -170, pitch: 85, zoom: 4 });
    expect(clampCam({ yaw: 0, pitch: -5, zoom: 0 }).pitch).toBe(8);
    const pts = [{ sx: -50, sy: -20 }, { sx: 50, sy: 20 }];
    const f = fit(pts, 720, 460, 36, 1);
    for (const p of pts) {
      const q = f.to(p);
      expect(q.x).toBeGreaterThanOrEqual(36 - 1e-6);
      expect(q.x).toBeLessThanOrEqual(720 - 36 + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(36 - 1e-6);
      expect(q.y).toBeLessThanOrEqual(460 - 36 + 1e-6);
    }
  });
});
