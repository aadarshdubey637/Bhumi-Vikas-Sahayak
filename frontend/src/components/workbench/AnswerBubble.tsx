import { Check, ChevronDown, CircleAlert, CircleHelp } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { areaMeasurement, floorsSchema, lengthMeasurement } from "@/api/schemas";
import type { AskResponse } from "@/api/types";
import { WarningsList } from "@/components/ask/WarningsList";
import { CopyButton } from "@/components/common/CopyButton";
import { Markdown } from "@/components/common/Markdown";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerContext";
import { buildAnswerView, type Tr } from "@/lib/answerView";
import type { NeedField } from "@/lib/plainAnswer";
import type { FieldId } from "@/lib/workbench";
import { SpeakButton } from "./SpeakButton";

export type Provided = Partial<Record<NeedField, { value: string; unit: string }>>;

const BADGE_TONE: Record<string, string> = {
  supported: "border-verified-line bg-verified-tint text-verified",
  conditional: "border-info-line bg-info-tint text-info",
  pending_verification: "border-pending-line bg-pending-tint text-pending",
  insufficient_information: "border-pending-line bg-pending-tint text-pending",
  source_conflict: "border-danger-line bg-danger-tint text-danger",
  not_established: "border-muted-line bg-muted-tint text-muted",
};
const HEAD = "text-xs font-bold uppercase tracking-wide text-ink-faint";
const LENGTH_UNITS = ["ft", "m"] as const;
const AREA_UNITS = ["sqft", "sqm"] as const;
const FIELD_INPUT: Record<NeedField, "length" | "area" | "count"> = { road_width: "length", building_height: "length", plot_area: "area", built_up_area: "area", floors: "count" };

/** Asks, in the same place as the answer, for the details it is waiting for, then hands them to the parent (which asks again with them). */
function NeedForm({ fields, tr, onSubmit }: { fields: NeedField[]; tr: Tr; onSubmit: (v: Provided) => void }) {
  const { t } = useTranslation();
  const [vals, setVals] = useState<Record<string, { value: string; unit: string }>>(() => Object.fromEntries(fields.map((f) => [f, { value: "", unit: FIELD_INPUT[f] === "area" ? "sqft" : "ft" }])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out: Provided = {};
    const bad: Record<string, string> = {};
    for (const f of fields) {
      const v = vals[f]!;
      if (v.value.trim() === "") continue;
      const kind = FIELD_INPUT[f];
      const r = kind === "count" ? floorsSchema.safeParse(v.value) : (kind === "area" ? areaMeasurement : lengthMeasurement).safeParse(v);
      if (r.success) out[f] = kind === "count" ? { value: r.data as string, unit: "count" } : { value: (r.data as { value: string }).value, unit: v.unit };
      else bad[f] = r.error.issues[0]?.message ?? "validation.decimal";
    }
    setErrs(bad);
    if (Object.keys(bad).length === 0 && Object.keys(out).length === 0) setErrs({ [fields[0]!]: "plain.need.empty" });
    else if (Object.keys(bad).length === 0) onSubmit(out);
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
      <p className="text-sm font-semibold">{tr("plain.need.title")}</p>
      {fields.map((f) => {
        const kind = FIELD_INPUT[f];
        const id = `need-${f}`;
        return (
          <div key={f}>
            <label htmlFor={id} className="mb-1 block text-sm">
              {tr(`plain.need.${f}`)}
            </label>
            <div className="flex max-w-xs">
              <input
                id={id}
                inputMode="decimal"
                autoComplete="off"
                value={vals[f]!.value}
                aria-invalid={!!errs[f]}
                onChange={(e) => setVals((p) => ({ ...p, [f]: { ...p[f]!, value: e.target.value } }))}
                className={`min-h-tap min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none ${kind === "count" ? "rounded-xl" : "rounded-l-xl"}`}
              />
              {kind === "count" ? null : (
                <select
                  aria-label={t("forms.unitFor", { field: tr(`plain.need.${f}`) })}
                  value={vals[f]!.unit}
                  onChange={(e) => setVals((p) => ({ ...p, [f]: { ...p[f]!, unit: e.target.value } }))}
                  className="min-h-tap rounded-r-xl border border-l-0 border-line-strong bg-surface-sunken px-2 text-sm font-semibold text-ink-soft"
                >
                  {(kind === "area" ? AREA_UNITS : LENGTH_UNITS).map((u) => (
                    <option key={u} value={u}>
                      {t(`units.${u}`)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {errs[f] ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {t(errs[f]!, { defaultValue: errs[f]! })}
              </p>
            ) : null}
          </div>
        );
      })}
      <button type="submit" className="inline-flex min-h-tap items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark">
        {tr("plain.need.submit")}
      </button>
    </form>
  );
}

const reducedMotion = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Reveals a freshly arrived answer word by word (about a second), like a chat assistant. Screen readers get the full text at once. */
function Reveal({ text, animate }: { text: string; animate: boolean }) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const [n, setN] = useState(animate && !reducedMotion() ? 0 : words.length);
  useEffect(() => {
    if (n >= words.length) return;
    const step = Math.max(2, Math.ceil(words.length / 40)); // always done in about a second
    const id = window.setTimeout(() => setN((c) => Math.min(words.length, c + step)), 25);
    return () => window.clearTimeout(id);
  }, [n, words.length]);
  if (n >= words.length) return <>{text}</>;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{words.slice(0, n).join("")}</span>
    </>
  );
}

/**
 * One answer, written for someone with no technical background: the answer first in ordinary words, why, what to do next,
 * and only then where it comes from. Rule numbers, exact rule text and the working are one tap away under "More details".
 */
export function AnswerBubble({
  turnId,
  response,
  selected,
  onInspect,
  onGoToField,
  onProvide,
  onReport,
  animate = false,
}: {
  turnId: number;
  response: AskResponse;
  selected: boolean;
  onInspect: () => void;
  onGoToField: (f: FieldId) => void;
  /** when given, missing details are asked for right here and the question is asked again with them */
  onProvide?: (v: Provided) => void;
  onReport: () => void;
  /** reveal the answer progressively (only for an answer that has just arrived) */
  animate?: boolean;
}) {
  const { i18n } = useTranslation();
  const { open } = useEvidenceDrawer();
  const view = useMemo(() => {
    const lng = response.language === "hi" ? "hi" : "en";
    const tr: Tr = (k, p) => i18n.t(k, { ...p, lng }) as string;
    return { v: buildAnswerView(response, tr), tr };
  }, [response, i18n]);
  const { v, tr } = view;
  const quotes = response.direct_answer?.quotes ?? [];
  const detailCount = v.applied.length + quotes.length + response.warnings.length + v.cautions.length;
  const fieldSteps = onProvide ? [] : v.next.filter((n) => n.field);
  // A written (LLM) answer is shown as flowing chat text, like a chat assistant. The structured blocks below it
  // (headline, scenarios, points, why, steps) are only for the deterministic answer, which is the fallback.
  const chat = !!response.explanation;
  const general = response.explanation_kind === "general";
  const spoken = chat ? response.explanation! : v.speech;

  return (
    <article lang={v.lang} aria-label={tr("wb.a.label")} className={`min-w-0 space-y-4 break-words ${selected ? "" : ""}`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONE[response.status] ?? BADGE_TONE.not_established}`}>{v.badge}</span>

      {chat ? (
        <div className="text-sm leading-relaxed">
          <Markdown text={response.explanation!} />
          {general ? <p className="mt-3 text-sm italic text-ink-soft">{tr("askx.chatGeneral")}</p> : null}
        </div>
      ) : null}

      {!chat && v.understood.length ? (
        <section aria-label={tr("plain.h.understood")}>
          <h4 className={HEAD}>{tr("plain.h.understood")}</h4>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {v.understood.map((u) => (
              <li key={u.key} className="rounded-full border border-line-strong bg-surface-sunken px-3 py-1 text-sm">
                <span className="text-ink-soft">{u.label}:</span> <span className="font-semibold">{u.value}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {chat ? null : (
        <section aria-label={tr("plain.h.answer")}>
          <h4 className={HEAD}>{tr("plain.h.answer")}</h4>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium leading-relaxed">
            <Reveal text={v.headline} animate={animate} />
          </p>
        </section>
      )}

      {(chat ? [] : v.scenarios).map((sc) => (
        <section key={sc.key} aria-label={sc.title} className="overflow-hidden rounded-2xl border border-pending-line bg-pending-tint">
          <h4 className="px-3.5 pt-3 text-sm font-semibold">{sc.title}</h4>
          <dl className="mt-1.5 divide-y divide-pending-line/60 px-3.5 pb-1.5">
            {sc.rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-x-4 py-2 text-sm">
                <dt className="text-ink-soft">{row.when}</dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {!chat && v.snapshot ? (
        <section aria-label={tr("plain.snap.title")} className="overflow-hidden rounded-2xl border border-line">
          <h4 className="border-b border-line bg-surface-sunken px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{tr("plain.snap.title")}</h4>
          <dl className="divide-y divide-line">
            {v.snapshot.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-3.5 py-2.5">
                <dt className="text-sm font-semibold">{r.label}</dt>
                <dd className={`inline-flex items-center gap-1.5 text-sm ${r.state === "known" ? "font-semibold text-info" : r.state === "warn" ? "text-pending" : "text-ink-soft"}`}>
                  {r.state === "known" ? <Check aria-hidden="true" className="h-4 w-4" /> : r.state === "warn" ? <CircleAlert aria-hidden="true" className="h-4 w-4" /> : <CircleHelp aria-hidden="true" className="h-4 w-4" />}
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {!chat && v.points.length ? (
        <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed" aria-label={tr("plain.h.means")}>
          {v.points.map((p, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {p}
            </li>
          ))}
        </ul>
      ) : null}

      {!chat && v.why.length ? (
        <section aria-label={tr("plain.h.why")}>
          <h4 className={HEAD}>{tr("plain.h.why")}</h4>
          <div className="mt-1.5 space-y-1.5 rounded-xl bg-surface-sunken px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
            {v.why.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </section>
      ) : null}

      {v.needs.length && onProvide ? <NeedForm key={v.needs.join()} fields={v.needs} tr={tr} onSubmit={onProvide} /> : null}
      {fieldSteps.length ? (
        <div className="space-y-1.5 text-sm">
          {fieldSteps.map((n, i) => (
            <p key={i} className="flex flex-wrap items-center gap-2">
              <span>{n.text}</span>
              <button type="button" className="rounded-md border border-brand-ring px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand-tint" onClick={() => onGoToField(n.field!)}>
                {tr("wb.a.goToField")}
              </button>
            </p>
          ))}
        </div>
      ) : null}

      {!chat && v.steps.length ? (
        <section aria-label={tr("wb.a.nextTitle")}>
          <h4 className={HEAD}>{tr("wb.a.nextTitle")}</h4>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm">
            {v.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {v.sources.length ? (
        <section aria-label={tr("wb.a.sourceTitle")} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">{tr("plain.sources")}</span>
          {v.sources.map((s) => {
            const text = `${tr("wb.a.rule", { rule: s.rule })}${s.pages ? ` · ${tr("wb.a.page", { pages: s.pages })}` : ""}`;
            const cls = "inline-flex min-h-tap items-center rounded-full border border-line-strong bg-surface-sunken px-3 text-xs font-semibold";
            return s.evidenceId ? (
              <button key={s.rule} type="button" onClick={() => open(s.evidenceId!)} className={`${cls} text-brand hover:bg-brand-tint`}>
                {text}
              </button>
            ) : (
              <span key={s.rule} className={cls}>
                {text}
              </span>
            );
          })}
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-faint">{v.guidance}</p>

      {detailCount > 0 ? (
        <details className="group rounded-xl border border-line">
          <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
            {tr("plain.more")}
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-line p-3.5">
            {v.applied.length ? (
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{tr("plain.moreSteps")}</h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {v.applied.map((s, i) => (
                    <li key={i} lang="en">
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {quotes.length ? (
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{tr("wb.a.exactText")}</h4>
                {quotes.map((q) => (
                  <figure key={`${q.rule_number}-${q.text.slice(0, 40)}`}>
                    <figcaption className="text-xs font-semibold">
                      {tr("wb.a.rule", { rule: q.rule_number })} — {q.rule_title}
                    </figcaption>
                    <blockquote lang="en" className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-sunken p-2.5 font-mono text-xs leading-relaxed">
                      {q.text}
                    </blockquote>
                  </figure>
                ))}
              </section>
            ) : null}
            {v.cautions.length ? (
              <ul className="space-y-1 text-xs text-ink-soft">
                {v.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}
            <WarningsList warnings={response.warnings} />
          </div>
        </details>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <SpeakButton id={`turn-${turnId}`} text={spoken} lang={v.lang} />
        <CopyButton text={spoken} label={tr("wb.a.copy")} compact />
        {response.evidence.length ? (
          <button type="button" className="inline-flex min-h-tap items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand hover:underline" onClick={onInspect}>
            {tr("wb.a.inspect")}
          </button>
        ) : null}
        <button type="button" className="inline-flex min-h-tap items-center px-2 text-sm font-semibold text-brand hover:underline" onClick={onReport}>
          {tr("wb.a.report")}
        </button>
      </footer>
    </article>
  );
}
