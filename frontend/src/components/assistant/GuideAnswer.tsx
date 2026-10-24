import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SpeakButton } from "@/components/workbench/SpeakButton";
import type { GuideTopic } from "@/lib/guide";

/** Tappable example questions: so an answer never ends in a dead end. */
export function Examples({ keys, lang, onAsk, label = "as.try" }: { keys: string[]; lang: "en" | "hi"; onAsk: (q: string) => void; label?: string }) {
  const { i18n } = useTranslation();
  const tr = (k: string) => i18n.t(k, { lng: lang }) as string;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{tr(label)}</p>
      <ul className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <li key={k}>
            <button type="button" lang={lang} onClick={() => onAsk(tr(k))} className="min-h-tap rounded-full border border-line-strong bg-surface-sunken px-3.5 text-left text-sm transition-colors hover:border-ink-faint hover:bg-surface">
              {tr(k)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


export function GuideAnswer({ topic, lang, id, onAsk, hideActionTo }: { topic: GuideTopic; lang: "en" | "hi"; id: string; onAsk: (q: string) => void; hideActionTo?: string }) {
  const actions = topic.actions.filter((a) => a.to !== hideActionTo);
  const { i18n } = useTranslation();
  const tr = (k: string, p?: Record<string, string | number>) => i18n.t(k, { ...p, lng: lang }) as string;
  const steps = Array.from({ length: topic.steps }, (_, i) => tr(`guide.${topic.id}.s${i + 1}`));
  const speech = [tr(`guide.${topic.id}.title`), tr(`guide.${topic.id}.body`), ...steps].join("\n");
  return (
    <article lang={lang} aria-label={tr("as.guideLabel")} className="space-y-3">
      <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent-text">
        {tr("as.guideLabel")}
      </span>
      <h3 className="text-base font-semibold">{tr(`guide.${topic.id}.title`)}</h3>
      <p className="text-[0.9375rem] leading-relaxed">{tr(`guide.${topic.id}.body`)}</p>
      {steps.length ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft marker:font-semibold marker:text-accent-text">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
      {topic.ask?.length ? <Examples keys={topic.ask} lang={lang} onAsk={onAsk} /> : null}
      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/10 px-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent/20">
              {tr("as.open", { page: tr(a.label) })}
            </Link>
          ))}
        </div>
      ) : null}
      <footer className="border-t border-line pt-3">
        <SpeakButton id={id} text={speech} lang={lang} />
      </footer>
    </article>
  );
}
