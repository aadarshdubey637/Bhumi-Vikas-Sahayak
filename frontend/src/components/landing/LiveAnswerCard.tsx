import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@/api/endpoints/ask";
import type { AskResponse, InputMap } from "@/api/types";

const QUESTIONS: Array<{ key: "q1" | "q2" | "q3"; context?: InputMap }> = [
  { key: "q1", context: { road_width: { value: "9", unit: "m" }, plot_area: { value: "200", unit: "sqm" } } },
  { key: "q2", context: { plot_area: { value: "200", unit: "sqm" } } },
  { key: "q3" },
];
const reduced = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const firstLine = (r: AskResponse): string => {
  const d = r.direct_answer;
  const line = d?.lines?.[0] ?? d?.headline ?? r.answer.split("\n")[0] ?? "";
  return line.replace(/^\s*(Answer|उत्तर)\s*:\s*/i, "");
};

/** A real question answered live by the backend, typed out, cycling through three examples. Hidden if the server cannot answer. */
export function LiveAnswerCard() {
  const { t, i18n } = useTranslation();
  const [i, setI] = useState(0);
  const q = QUESTIONS[i]!;
  const question = t(`land.live.${q.key}`);
  const lang = i18n.language === "hi" ? ("hi" as const) : undefined;
  const res = useQuery({
    queryKey: ["landing-live", q.key, lang ?? "en"],
    queryFn: ({ signal }) => ask({ question, language: lang, context: q.context }, signal),
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const text = res.data ? firstLine(res.data) : "";
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(reduced() ? text.length : 0);
    if (!text || reduced()) return;
    const id = window.setInterval(() => setShown((n) => (n >= text.length ? (window.clearInterval(id), n) : n + 2)), 22);
    return () => window.clearInterval(id);
  }, [text]);

  useEffect(() => {
    if (reduced()) return;
    const id = window.setTimeout(() => setI((n) => (n + 1) % QUESTIONS.length), 9000 + text.length * 22);
    return () => window.clearTimeout(id);
  }, [i, text.length]);

  if (res.isError) return null;
  const quotes = res.data?.direct_answer?.quotes.slice(0, 2) ?? [];
  const pageOf = (a: number | null, b: number | null) => (a == null ? "" : a === b || b == null ? `${a}` : `${a}–${b}`);
  return (
    <div className="rounded-3xl border border-white/15 bg-white/8 p-4 shadow-panel backdrop-blur-xl" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
          </span>
          {t("land.live.title")}
        </p>
        <span className="flex gap-1" aria-hidden="true">
          {QUESTIONS.map((x, k) => (
            <span key={x.key} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-1.5 bg-white/30"}`} />
          ))}
        </span>
      </div>
      <p className="mt-3 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5 text-sm font-semibold text-white">{question}</p>
      <div className="mt-2.5 min-h-[4.5rem] rounded-2xl rounded-br-md border border-white/10 bg-navy-night/50 px-3.5 py-2.5 text-sm leading-relaxed text-white/90">
        {res.isPending ? (
          <span className="inline-flex gap-1" aria-label={t("ask.searching")}>
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-2 w-2 rounded-full bg-white/50 motion-safe:animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
            ))}
          </span>
        ) : (
          <>
            {text.slice(0, shown)}
            {shown < text.length ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-accent motion-safe:animate-pulse" /> : null}
          </>
        )}
      </div>
      {quotes.length > 0 && shown >= text.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-white/70 motion-safe:animate-fade-in">
          {t("wb.a.sourceTitle")}:
          {quotes.map((x, k) => (
            <span key={`${x.rule_number}-${x.page_start}-${k}`} className="rounded-full border border-white/20 bg-white/8 px-2.5 py-0.5 font-semibold text-white/90">
              {t("wb.a.rule", { rule: x.rule_number })} · {t("wb.a.page", { pages: pageOf(x.page_start, x.page_end) })}
            </span>
          ))}
        </p>
      ) : null}
      <p className="mt-2 text-[0.6875rem] text-white/45">{t("land.live.note")}</p>
    </div>
  );
}
