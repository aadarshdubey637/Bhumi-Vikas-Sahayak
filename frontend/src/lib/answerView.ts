// Turns a backend AskResponse into plain-language sections plus the text that is read aloud.
// Nothing here paraphrases rule text: the "what it means" lines are the backend's own stated answer (already in the
// asked language), and everything this file adds (next steps, cautions) is fixed wording from the i18n files.
import type { AskResponse } from "@/api/types";
import { isMissingInformation } from "./format";
import { composePlain, neededFields, scenarioTables, snapshotRows, understoodFacts, type NeedField, type ScenarioTable, type SnapRow, type Understood } from "./plainAnswer";
import type { FieldId } from "./workbench";

export type Tr = (key: string, params?: Record<string, string | number>) => string;
export type AnswerLang = "en" | "hi";

export interface NextStep {
  text: string;
  /** the input the user can fill in to move forward; the UI offers a "go to field" button */
  field?: FieldId;
}
export interface SourceRef {
  rule: string;
  pages: string | null;
  evidenceId: string | null;
  verified: boolean;
}
export interface AnswerView {
  lang: AnswerLang;
  mode: "direct" | "pointer" | "none";
  /** plain-language answer lines */
  summary: string[];
  /** how the inputs were applied (backend steps; English only) */
  applied: string[];
  next: NextStep[];
  cautions: string[];
  sources: SourceRef[];
  /** the complete answer as it is read aloud */
  speech: string;
  /** the answer in one or two plain sentences */
  headline: string;
  /** what applies, one sentence each */
  points: string[];
  /** the reasons, in ordinary words */
  why: string[];
  /** details the answer is waiting for */
  needs: NeedField[];
  /** one short, friendly line saying where the answer stands */
  badge: string;
  /** what to do next in ordinary words (no field buttons: see `needs`) */
  steps: string[];
  /** the one-line reminder that this is guidance */
  guidance: string;
  /** the facts taken from the question */
  understood: Understood[];
  /** the four things everyone asks about, answered or waiting for a detail */
  snapshot: SnapRow[] | null;
  /** every outcome from the rule table when the deciding detail is missing */
  scenarios: ScenarioTable[];
}

export const answerLang = (r: Pick<AskResponse, "language">): AnswerLang => (r.language === "hi" ? "hi" : "en");

const FACT_TO_FIELD: Record<string, FieldId> = {
  plot_area: "plot_area",
  plot_length: "plot_length",
  plot_width: "plot_width",
  road_width: "road_width",
  building_height: "building_height",
  building_length: "building_length",
  building_width: "building_width",
  built_up_area: "built_up_area",
  floors: "floors",
  building_use: "building_use",
  location: "location",
};
const pages = (a: number | null, b: number | null): string | null => (a == null ? null : a === b || b == null ? String(a) : `${a}–${b}`);
const stripLead = (s: string): string => s.replace(/^\s*(Answer|उत्तर)\s*:\s*/i, "");

export function buildAnswerView(r: AskResponse, tr: Tr): AnswerView {
  const lang = answerLang(r);
  const da = r.direct_answer ?? null;
  const mi = isMissingInformation(r.missing_information) ? r.missing_information : null;

  // sources: one chip per rule, taken from the stated quotes first, then from the retrieved evidence
  const byRule = new Map<string, SourceRef>();
  for (const e of r.evidence)
    if (!byRule.has(e.rule_number))
      byRule.set(e.rule_number, { rule: e.rule_number, pages: pages(e.page_start, e.page_end), evidenceId: e.evidence_id, verified: e.verification_status === "verified" });
  const sources: SourceRef[] = [];
  for (const q of da?.quotes ?? []) {
    if (sources.some((s) => s.rule === q.rule_number)) continue;
    const ev = byRule.get(q.rule_number);
    sources.push({ rule: q.rule_number, pages: pages(q.page_start, q.page_end), evidenceId: ev?.evidenceId ?? null, verified: q.verified && (ev?.verified ?? false) });
  }
  // A stated answer cites only the rules it was worked out from; the other retrieved passages stay in the Evidence tab.
  if (!da || da.quotes.length === 0) for (const s of byRule.values()) if (!sources.some((x) => x.rule === s.rule)) sources.push(s);
  const shownSources = r.status === "not_established" ? [] : sources.slice(0, 6);

  let mode: AnswerView["mode"] = "none";
  const summary: string[] = [];
  if (r.status === "not_established") {
    summary.push(tr("wb.a.notEstablished"));
  } else if (da) {
    mode = "direct";
    if (da.lines.length) summary.push(...da.lines);
    else summary.push(stripLead(da.headline));
  } else if (r.evidence.length) {
    mode = "pointer";
    summary.push(tr("wb.a.pointer", { n: r.evidence.length }));
  }

  const next: NextStep[] = [];
  const missingFacts = new Set<string>([...(da?.missing ?? []), ...(mi?.missing_facts ?? [])]);
  for (const f of missingFacts) {
    const field = FACT_TO_FIELD[f];
    next.push({ text: tr("wb.a.enter", { field: tr(`wb.f.${field ?? f}`) }), field });
  }
  const follow = da?.follow_up ?? r.follow_up_question;
  if (follow && !missingFacts.size) next.push({ text: follow });
  if (r.status === "not_established") {
    next.push({ text: tr("wb.a.rephrase") }, { text: tr("wb.a.rulebook") });
  } else if (r.evidence.some((e) => e.verification_status !== "verified")) {
    next.push({ text: tr("wb.a.verify") });
  }
  next.push({ text: tr("wb.a.clerk") });

  const cautions = [...(da?.caveats ?? [])];
  if (da?.assumed) cautions.push(tr("wb.a.assumed"));
  if (r.source_version) cautions.push(tr("wb.a.version", { v: r.source_version }));

  const plain = composePlain(r, tr);
  const needs = neededFields(r);
  const headline = plain?.short ?? summary[0] ?? "";
  const points = plain ? plain.points : summary.slice(1);
  const why = plain?.why ?? [];
  const steps: string[] = [];
  if (r.status === "not_established") steps.push(tr("wb.a.rephrase"), tr("wb.a.rulebook"));
  else if (!needs.length && (da?.follow_up ?? r.follow_up_question)) steps.push((da?.follow_up ?? r.follow_up_question) as string);
  const guidance = tr("plain.guidance");
  const badge = tr(`plain.badge.${r.status}`);

  const parts: string[] = [];
  if (r.explanation) parts.push(r.explanation);
  parts.push(headline);
  if (!plain) parts.push(...points);
  parts.push(...why);
  if (needs.length) parts.push(tr("plain.need.title") + " " + needs.map((f) => tr(`plain.need.${f}`)).join(" "));
  else if (steps.length) parts.push(...steps);
  if (shownSources.length)
    parts.push(tr("wb.a.sourceTitle") + ": " + shownSources.map((x) => (x.pages ? tr("wb.a.ruleSpoken", { rule: x.rule, pages: x.pages }) : tr("wb.a.ruleSpokenNoPage", { rule: x.rule }))).join(", ") + ".");
  parts.push(guidance);
  return { lang, mode, summary, applied: da?.steps ?? [], next, cautions, sources: shownSources, speech: parts.filter(Boolean).join("\n"), headline, points, why, needs, badge, steps, guidance, understood: understoodFacts(r, tr), snapshot: snapshotRows(r, tr), scenarios: scenarioTables(r, tr) };
}

/** Sentence/line chunks for speech synthesis; browsers cut off long utterances, so each chunk stays short. */
export function speechChunks(text: string, max = 180): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const sentences = line.match(/[^.!?।]+[.!?।]*\s*/g) ?? [line];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > max && cur) {
        out.push(cur.trim());
        cur = "";
      }
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
      } else cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.filter(Boolean);
}
