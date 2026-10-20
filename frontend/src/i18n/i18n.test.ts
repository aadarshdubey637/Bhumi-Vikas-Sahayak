import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import hi from "./hi.json";

const flat = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
  );
const enKeys = new Set(flat(en));
const hiKeys = new Set(flat(hi));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !p.includes("/test/")
        ? [p]
        : [];
  });

describe("i18n", () => {
  it("English and Hindi have identical keys", () => {
    expect([...enKeys].filter((k) => !hiKeys.has(k))).toEqual([]);
    expect([...hiKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('every static t("…") key used in source exists', () => {
    const missing: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([A-Za-z][A-Za-z0-9_.]*)"/g))
        if (!enKeys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
      for (const m of src.matchAll(/(?:key|labelKey): "([a-z]+\.[A-Za-z.]+)"/g))
        if (!enKeys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
      for (const m of src.matchAll(/"((?:validation|errors)\.[A-Za-z]+)"/g))
        if (!enKeys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it("every backend enum value has a label", () => {
    const sets: Record<string, string[]> = {
      "status.answer": [
        "supported",
        "conditional",
        "pending_verification",
        "insufficient_information",
        "source_conflict",
        "not_established",
      ],
      "status.check": ["passed", "failed", "conditional", "pending_verification", "not_evaluated"],
      "status.overall": ["failed_checks_present", "incomplete", "evaluated_checks_passed"],
      "status.verification": ["unverified", "pending_verification", "verified", "rejected"],
      "status.version": [
        "verified_current",
        "historical",
        "pending_verification",
        "unknown_effective_date",
        "insufficient_information",
        "source_conflict",
      ],
      "feedback.categories": [
        "incorrect_answer",
        "incorrect_citation",
        "outdated_rule",
        "incorrect_calculation",
        "missing_information",
        "other",
      ],
      "feedback.resolution": ["open", "reviewed", "resolved", "rejected"],
      "forms.fields": [
        "plot_area",
        "plot_length",
        "plot_width",
        "road_width",
        "building_height",
        "building_length",
        "building_width",
        "floors",
        "building_use",
        "location",
      ],
      units: ["m", "cm", "mm", "ft", "in", "yd", "sqm", "sqft", "sqyd", "acre", "hectare"],
      "evidence.method": ["exact_rule_number", "bm25", "hybrid", "amendment_link", "evidence_lookup"],
    };
    const missing = Object.entries(sets)
      .flatMap(([p, vs]) => vs.map((v) => `${p}.${v}`))
      .filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("no UI string claims approval or compliance", () => {
    const bad = [...enKeys].filter((k) =>
      /\b(compliant|approved)\b/i.test(
        String(k.split(".").reduce((o: unknown, s) => (o as Record<string, unknown>)[s], en)),
      ),
    );
    expect(bad).toEqual([]);
  });
});
