import { describe, expect, it } from "vitest";
import { splitEvidenceIds } from "./linkify";
import { computeLayout, DEFAULT_LAYOUT } from "./plot";
import { ANSWER_VIEW, CHECK_VIEW, OVERALL_VIEW, VERIFICATION_VIEW, VERSION_VIEW, viewFor } from "./status";
import { splitHighlight } from "./highlight";
import { pageInfo } from "./format";
import { ruleHref } from "./rule-number";
import { previewOut } from "@/test/fixtures";

describe("status maps", () => {
  it("cover every backend value and fall back neutrally", () => {
    expect(Object.keys(ANSWER_VIEW)).toHaveLength(6);
    expect(Object.keys(CHECK_VIEW)).toHaveLength(5);
    expect(Object.keys(OVERALL_VIEW)).toHaveLength(3);
    expect(Object.keys(VERIFICATION_VIEW)).toHaveLength(4);
    expect(Object.keys(VERSION_VIEW)).toHaveLength(6);
    expect(viewFor(ANSWER_VIEW, "something_new").tone).toBe("muted");
  });
  it("pending/unverified are amber, never green; overall passed is never green", () => {
    expect(ANSWER_VIEW.pending_verification.tone).toBe("pending");
    expect(VERIFICATION_VIEW.unverified.tone).toBe("pending");
    expect(OVERALL_VIEW.evaluated_checks_passed.tone).not.toBe("verified");
  });
});

describe("linkify", () => {
  it("finds evidence ids and ignores look-alikes", () => {
    const segs = splitEvidenceIds("see [EV-21-002-f9a2941e] and [EV-bad] and EV-21-002-f9a2941e");
    expect(segs.filter((s) => s.type === "evidence").map((s) => s.value)).toEqual(["EV-21-002-f9a2941e"]);
    expect(segs.map((s) => s.value).join("")).toContain("[EV-bad]");
  });
});

describe("plot layout", () => {
  const geo = previewOut.geometry!;
  const l = computeLayout(
    geo,
    [{ type: "road", edge: 0, label: "Road 9 m", source: "user_provided" }],
    DEFAULT_LAYOUT,
  )!;
  it("flips Y: origin (bottom-left) is lower on screen than (0,20)", () => {
    expect(l.polygon[0]!.y).toBeGreaterThan(l.polygon[3]!.y);
    expect(l.polygon[1]!.x).toBeGreaterThan(l.polygon[0]!.x);
  });
  it("places labels for all four edges outside the polygon", () => {
    expect(l.labels.map((x) => x.edge)).toEqual([0, 1, 2, 3]);
    const cx = l.polygon.reduce((a, p) => a + p.x, 0) / 4;
    expect(l.labels[1]!.x).toBeGreaterThan(cx);
    expect(l.labels[3]!.x).toBeLessThan(cx);
  });
  it("draws the road band on the bottom edge (edge 0)", () => {
    expect(l.roads).toHaveLength(1);
    expect(l.roads[0]!.labelAt.y).toBeGreaterThan(l.polygon[0]!.y);
  });
  it("uses one uniform scale and fits the canvas", () => {
    for (const p of l.polygon) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(l.width);
      expect(p.y).toBeLessThanOrEqual(l.height);
    }
  });
});

describe("misc helpers", () => {
  it("highlights terms without HTML", () => {
    expect(splitHighlight("Fee for fees", ["fee"]).some((p) => p.match)).toBe(true);
  });
  it("highlights only at word starts, ignores stop-words and punctuation", () => {
    const marked = (text: string, terms: string[]) => splitHighlight(text, terms).filter((p) => p.match).map((p) => p.text);
    expect(marked("building permission is required", ["is"])).toEqual([]); // stop-word, and never inside "permission"
    expect(marked("Rule 26-B permission", ["permis"])).toEqual(["permis"]); // word start
    expect(marked("misprint", ["print"])).toEqual([]); // not mid-word
    expect(marked("Fee for fees", ["fee?"])).toEqual(["Fee", "fee"]); // punctuation stripped, prefix match
    expect(marked("परमिशन की फीस", ["फीस"])).toEqual(["फीस"]); // Devanagari
  });
  it("page info distinguishes exact pages from ranges", () => {
    expect(pageInfo({ page_start: 35, page_end: 36, page_precision: "located_in_page_text" })).toMatchObject({
      pages: "35–36",
      exact: true,
    });
    expect(pageInfo({ page_start: 35, page_end: 38, page_precision: "rule_range" }).exact).toBe(false);
  });
  it("rule hrefs are URL-encoded", () => {
    expect(ruleHref("12 A")).toBe("/rules/12%20A");
  });
});
