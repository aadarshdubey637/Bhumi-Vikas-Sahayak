// Preliminary comparison of the user's inputs against the numeric limits the backend states for them.
// It NEVER produces "compliant": the best outcome is "no violation found in the checks that could be evaluated".
// Every limit comes from AskResponse.direct_answer.requirements (verbatim rule tables); nothing is hard-coded here.
import type { AskResponse, AssessResponse, DirectRequirement } from "@/api/types";
import { fmtNum, placeBuilding, type FieldId, type Metrics } from "./workbench";

export type ItemStatus = "violation" | "within" | "needs_input" | "not_evaluated" | "info";
export interface Msg {
  key: string;
  params?: Record<string, string | number>;
}
export interface ComplianceItem {
  id: string;
  kind: "geometry" | "regulation";
  status: ItemStatus;
  title: Msg;
  detail: Msg | null;
  /** raw backend text shown as-is (English), e.g. the server's own explanation */
  raw?: string;
  rule?: string;
  measured?: string;
  limit?: string;
  suggestions: Msg[];
  missing: FieldId[];
}
export type Verdict = "violations" | "preliminary_ok" | "cannot_evaluate";
export interface ComplianceReport {
  verdict: Verdict;
  items: ComplianceItem[];
  counts: Record<ItemStatus, number>;
  /** regulation items within their stated limit (input-sanity checks are not counted) */
  regWithin: number;
  missing: FieldId[];
  /** limits to draw on the canvas (metres), when the rule text gave them */
  frontMin?: number;
  rearMin?: number;
  /** items whose value breaks a limit, by id, for colouring the drawing */
  flags: { front: boolean; rear: boolean; outside: boolean };
  unverified: boolean;
  amendmentFlag: boolean;
}

const TALL_M = 12.5; // the height above which the backend itself says Rule 56's tables stop applying (Rule 56(5))
const E = 1e-9;
const req = (a: AskResponse | null, key: string): DirectRequirement | undefined =>
  a?.direct_answer?.requirements?.find((r) => r.key === key);
const m = (n: number): string => `${fmtNum(n)} m (${Math.round(n * 3.28084)} ft)`;
const sqm = (n: number): string => `${fmtNum(n)} sq m (${Math.round(n * 10.7639).toLocaleString("en-IN")} sq ft)`;

function item(p: Partial<ComplianceItem> & Pick<ComplianceItem, "id" | "kind" | "status" | "title">): ComplianceItem {
  return { detail: null, suggestions: [], missing: [], ...p };
}

export function evaluateCompliance(args: {
  metrics: Metrics;
  answer: AskResponse | null;
  assessment: AssessResponse | null;
}): ComplianceReport {
  const { metrics: x, answer, assessment } = args;
  const da = answer?.direct_answer ?? null;
  const items: ComplianceItem[] = [];
  const nonResidential = !!x.use && !/resid|house|home|आवास/i.test(x.use);
  const tall = x.height !== undefined && x.height > TALL_M;
  const frontReq = req(answer, "front_open_space");
  const rearReq = req(answer, "rear_open_space");
  const farReq = req(answer, "max_floor_area");
  const frontMin = frontReq ? Number(frontReq.value) : undefined;
  const rearMin = rearReq ? Number(rearReq.value) : undefined;
  const flags = { front: false, rear: false, outside: false };

  // ---- input sanity (not rule checks) ------------------------------------------------------------------------
  const geo = assessment?.checks.find((c) => c.check_id === "geometry.plot_area_consistency");
  if (geo) {
    items.push(
      item({
        id: "geo-area",
        kind: "geometry",
        status: geo.status === "passed" ? "within" : geo.status === "failed" ? "violation" : "needs_input",
        title: { key: "wb.c.areaConsistency" },
        raw: geo.explanation || undefined,
        missing: geo.status === "not_evaluated" ? ["plot_length", "plot_width"] : [],
      }),
    );
  }
  const place = placeBuilding(x, frontMin);
  if (place) {
    flags.outside = place.outside;
    const fitsSize = x.bldgW! <= x.plotW! + E && x.bldgD! <= x.plotD! + E;
    items.push(
      item({
        id: "geo-fit",
        kind: "geometry",
        status: place.outside ? "violation" : "within",
        title: { key: "wb.c.fitsPlot" },
        detail: place.outside
          ? { key: fitsSize ? "wb.c.fitsPlotNo" : "wb.c.fitsPlotTooBig", params: { bw: m(x.bldgW!), bd: m(x.bldgD!), pw: m(x.plotW!), pd: m(x.plotD!) } }
          : { key: place.assumedX || place.assumedY ? "wb.c.fitsPlotAssumed" : "wb.c.fitsPlotYes" },
        suggestions: place.outside ? [{ key: "wb.s.shrinkFootprint" }] : [],
      }),
    );
  }

  // ---- front open space -------------------------------------------------------------------------------------
  const noAnswer = !answer;
  const why = (): Pick<ComplianceItem, "status" | "detail" | "missing"> => {
    if (noAnswer) return { status: "not_evaluated", detail: { key: "wb.c.noAnswer" }, missing: [] };
    if (nonResidential) return { status: "not_evaluated", detail: { key: "wb.c.nonResidential" }, missing: [] };
    if (tall) return { status: "not_evaluated", detail: { key: "wb.c.tall", params: { h: m(x.height!) } }, missing: [] };
    return { status: "not_evaluated", detail: { key: "wb.c.noRule" }, missing: [] };
  };
  if (frontReq && frontMin !== undefined) {
    const limit = m(frontMin);
    if (x.gapFront === undefined) {
      items.push(item({ id: "front", kind: "regulation", status: "needs_input", title: { key: "wb.c.front" }, rule: frontReq.rule, limit, detail: { key: "wb.c.needGapFront", params: { limit } }, missing: ["gap_front"] }));
    } else if (x.gapFront < frontMin - E) {
      flags.front = true;
      items.push(item({ id: "front", kind: "regulation", status: "violation", title: { key: "wb.c.front" }, rule: frontReq.rule, limit, measured: m(x.gapFront), detail: { key: "wb.c.below", params: { measured: m(x.gapFront), limit } }, suggestions: [{ key: "wb.s.moveBack", params: { by: m(frontMin - x.gapFront), limit } }] }));
    } else {
      items.push(item({ id: "front", kind: "regulation", status: "within", title: { key: "wb.c.front" }, rule: frontReq.rule, limit, measured: m(x.gapFront), detail: { key: "wb.c.meets", params: { measured: m(x.gapFront), limit } } }));
    }
  } else {
    const mi: FieldId[] = !noAnswer && !nonResidential && !tall && x.roadW === undefined ? ["road_width"] : [];
    items.push(item({ id: "front", kind: "regulation", title: { key: "wb.c.front" }, ...why(), ...(mi.length ? { status: "needs_input" as const, detail: { key: "wb.c.needRoad" }, missing: mi } : {}) }));
  }

  // ---- rear open space --------------------------------------------------------------------------------------
  if (rearReq && rearMin !== undefined) {
    const limit = rearMin === 0 ? m(0) : m(rearMin);
    const missing: FieldId[] = [];
    if (x.gapFront === undefined) missing.push("gap_front");
    if (x.bldgD === undefined) missing.push("building_length");
    if (x.plotD === undefined) missing.push("plot_length");
    if (missing.length) {
      items.push(item({ id: "rear", kind: "regulation", status: "needs_input", title: { key: "wb.c.rear" }, rule: rearReq.rule, limit, detail: { key: "wb.c.needRear", params: { limit } }, missing }));
    } else {
      const rear = x.plotD! - x.gapFront! - x.bldgD!;
      if (rear < rearMin - E) {
        flags.rear = true;
        const deficit = rearMin - rear;
        const slack = x.gapFront! - (frontMin ?? 0);
        const sug: Msg[] = [{ key: "wb.s.shrinkDepth", params: { by: m(deficit) } }];
        if (frontMin !== undefined && slack >= deficit - E) sug.push({ key: "wb.s.moveForward", params: { by: m(deficit) } });
        items.push(item({ id: "rear", kind: "regulation", status: "violation", title: { key: "wb.c.rear" }, rule: rearReq.rule, limit, measured: m(rear), detail: { key: "wb.c.belowRear", params: { measured: m(rear), limit } }, suggestions: sug }));
      } else {
        items.push(item({ id: "rear", kind: "regulation", status: "within", title: { key: "wb.c.rear" }, rule: rearReq.rule, limit, measured: m(rear), detail: { key: "wb.c.meetsRear", params: { measured: m(rear), limit } } }));
      }
    }
  } else {
    const mi: FieldId[] = !noAnswer && !nonResidential && !tall && x.plotAreaSqm === undefined ? ["plot_length", "plot_width"] : [];
    items.push(item({ id: "rear", kind: "regulation", title: { key: "wb.c.rear" }, ...why(), ...(mi.length ? { status: "needs_input" as const, detail: { key: "wb.c.needPlotArea" }, missing: mi } : {}) }));
  }

  // ---- side open space: depends on the building type, so it is shown but not judged ----------------------------
  if (!nonResidential && !tall) {
    const sideLine = da?.lines.find((l) => /side open space|बगल की खुली/i.test(l));
    const place2 = placeBuilding(x, frontMin);
    items.push(
      item({
        id: "side",
        kind: "regulation",
        status: "info",
        title: { key: "wb.c.side" },
        rule: "56(3)",
        raw: sideLine,
        detail: place2 && !place2.assumedX
          ? { key: "wb.c.sideGaps", params: { left: m(place2.x0), right: m(place2.rightGap) } }
          : { key: "wb.c.sideNote" },
      }),
    );
  }

  // ---- floor area (FAR) -------------------------------------------------------------------------------------
  if (farReq) {
    const cap = Number(farReq.value);
    const limit = sqm(cap);
    if (x.builtUpSqm === undefined) {
      items.push(item({ id: "far", kind: "regulation", status: "needs_input", title: { key: "wb.c.far" }, rule: farReq.rule, limit, detail: { key: "wb.c.needBuiltUp", params: { limit } }, missing: ["built_up_area"] }));
    } else if (x.builtUpSqm > cap + E) {
      items.push(item({ id: "far", kind: "regulation", status: "violation", title: { key: "wb.c.far" }, rule: farReq.rule, limit, measured: sqm(x.builtUpSqm), detail: { key: "wb.c.aboveFar", params: { measured: sqm(x.builtUpSqm), limit } }, suggestions: [{ key: "wb.s.reduceArea", params: { by: sqm(x.builtUpSqm - cap), limit } }] }));
    } else {
      items.push(item({ id: "far", kind: "regulation", status: "within", title: { key: "wb.c.far" }, rule: farReq.rule, limit, measured: sqm(x.builtUpSqm), detail: { key: "wb.c.meetsFar", params: { measured: sqm(x.builtUpSqm), limit } } }));
    }
  } else if (!nonResidential) {
    items.push(item({ id: "far", kind: "regulation", title: { key: "wb.c.far" }, ...why(), ...(!noAnswer && x.plotAreaSqm === undefined ? { status: "needs_input" as const, detail: { key: "wb.c.needPlotArea" }, missing: ["plot_length", "plot_width"] as FieldId[] } : {}) }));
  }

  // ---- height -----------------------------------------------------------------------------------------------
  if (x.height !== undefined) {
    items.push(item({ id: "height", kind: "regulation", status: tall ? "not_evaluated" : "info", title: { key: "wb.c.height" }, rule: tall ? "56(5)" : undefined, detail: { key: tall ? "wb.c.heightTall" : "wb.c.heightOk", params: { h: m(x.height) } } }));
  }

  // ---- the backend's remaining checks, listed so nothing is hidden ----------------------------------------------
  for (const c of assessment?.checks ?? []) {
    if (c.check_id.startsWith("geometry.") || /setback|floor_area|height/.test(c.check_id)) continue;
    items.push(item({ id: c.check_id, kind: "regulation", status: c.status === "failed" ? "violation" : c.status === "passed" ? "within" : "not_evaluated", title: { key: "wb.c.backend", params: { name: c.description } }, raw: c.explanation || undefined }));
  }

  const counts: Record<ItemStatus, number> = { violation: 0, within: 0, needs_input: 0, not_evaluated: 0, info: 0 };
  for (const i of items) counts[i.status]++;
  const regWithin = items.filter((i) => i.kind === "regulation" && i.status === "within").length;
  const verdict: Verdict = counts.violation > 0 ? "violations" : regWithin > 0 ? "preliminary_ok" : "cannot_evaluate";
  const missing = [...new Set(items.flatMap((i) => (i.status === "needs_input" ? i.missing : [])))];
  const unverified = !answer || answer.evidence.length === 0 || answer.evidence.some((e) => e.verification_status !== "verified");
  return { verdict, items, counts, regWithin, missing, frontMin, rearMin, flags, unverified, amendmentFlag: !!da?.amendment_flag || !!da?.caveats.length };
}
