import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { listProjects } from "@/api/endpoints/projects";
import { buildInputs, emptyPlotForm, questionSchema } from "@/api/schemas";
import type { Language } from "@/api/types";
import { AnswerCard } from "@/components/ask/AnswerCard";
import { EvidencePanel } from "@/components/ask/EvidencePanel";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { VoiceButton } from "@/components/common/VoiceButton";
import { usePingDisclaimer } from "@/components/layout/DisclaimerContext";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { queryTerms } from "@/lib/highlight";
import { SAMPLE_QUESTIONS } from "@/lib/samples";
import { btn, btnPrimary, input, label as labelCls } from "@/lib/ui";

const LANGS: Array<{ v: "auto" | Language; key: string }> = [
  { v: "auto", key: "ask.langAuto" },
  { v: "en", key: "ask.langEn" },
  { v: "hi", key: "ask.langHi" },
  { v: "hi-en", key: "ask.langHinglish" },
];

export default function Ask() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { openFeedback } = useFeedbackDialog();
  const conv = useAskConversation();
  const [text, setText] = useState((location.state as { question?: string } | null)?.question ?? "");
  const [lang, setLang] = useState<"auto" | Language>("auto");
  const [showCtx, setShowCtx] = useState(false);
  const [form, setForm] = useState(emptyPlotForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState(params.get("project") ?? "");
  const [asOf, setAsOf] = useState("");
  const [explain, setExplain] = useState(false);
  const [qError, setQError] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery("(min-width: 1280px)");

  const projects = useQuery({
    queryKey: ["projects", { limit: 100, offset: 0 }],
    queryFn: ({ signal }) => listProjects({ limit: 100 }, signal),
  });
  const last = conv.turns[conv.turns.length - 1];
  const lastAnswer = [...conv.turns].reverse().find((x) => x.response)?.response;
  // A question typed on the dashboard arrives with autoSend. The send is deferred to a timer that cleanup cancels, so React
  // StrictMode's simulated unmount (which aborts in-flight requests) cannot drop it or double it. The navigation state is then
  // cleared so pressing Back does not send the question again.
  useEffect(() => {
    const st = location.state as { autoSend?: boolean } | null;
    if (!st?.autoSend || !text.trim()) return;
    const timer = window.setTimeout(() => {
      submit();
      navigate(location.pathname + location.search, { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival
  }, []);
  const countdown = useRateLimitCountdown(last?.error);
  usePingDisclaimer(conv.turns.length);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [conv.turns.length]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (conv.pending || countdown > 0) return;
    const q = questionSchema.safeParse(text);
    if (!q.success) return setQError(q.error.issues[0]?.message);
    setQError(undefined);
    const built = buildInputs(form);
    setFormErrors(built.errors);
    if (Object.keys(built.errors).length > 0) return setShowCtx(true);
    void conv.send({
      question: text,
      language: lang === "auto" ? undefined : lang,
      projectId: projectId || undefined,
      context: built.inputs,
      asOf: asOf || undefined,
      explain: explain && conv.explainAvailable,
    });
    setText("");
  };

  return (
    <>
      <PageHeader title={t("ask.title")} description={t("askx.description")} icon={MessageSquareText}>
        <button type="button" className={btn} onClick={conv.reset}>
          {t("ask.newConversation")}
        </button>
      </PageHeader>
      <div className={wide ? "grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-6" : ""}>
        <div className="min-w-0">
          <InfoBox tone="muted">{t("ask.historyNote")}</InfoBox>
          <div className="mt-4 space-y-5" aria-live="polite">
            {conv.turns.length === 0 ? (
              <section className="glass-strong rounded-3xl p-5 sm:p-7">
                <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-[#9DB8FF]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h2 className="mt-3 text-lg font-semibold">{t("askx.welcomeTitle")}</h2>
                <p className="mt-1 max-w-xl text-sm text-ink-soft">{t("askx.welcomeBody")}</p>
                <p className="mb-2 mt-4 text-sm font-semibold text-ink-soft">{t("ask.tryExample")}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {SAMPLE_QUESTIONS.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        className="h-full min-h-tap w-full rounded-2xl border border-line bg-white/80 px-3.5 py-3 text-left text-sm transition-[border-color,background-color,transform] hover:border-brand-ring hover:bg-brand-tint motion-safe:hover:-translate-y-0.5"
                        onClick={() => setText(q)}
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {conv.turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <p
                  className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-navy-700 to-navy px-4 py-3 text-sm text-white shadow-glow"
                  lang={/[ऀ-ॿ]/.test(turn.question) ? "hi" : undefined}
                >
                  {turn.question}
                </p>
                {turn.noteKey ? <InfoBox tone="info">{t(turn.noteKey)}</InfoBox> : null}
                <div className="flex items-start gap-2.5">
                  <LogoMark className="mt-1 h-8 w-8 shrink-0" />
                  <div className="min-w-0 flex-1">
                    {!turn.response && !turn.error ? (
                      <div className="glass rounded-2xl p-4">
                        <LoadingSkeleton lines={3} label={t("ask.searching")} />
                      </div>
                    ) : null}
                    {turn.error ? <ErrorState error={turn.error} /> : null}
                    {turn.response ? (
                      <AnswerCard
                        response={turn.response}
                        terms={queryTerms(turn.question)}
                        onReport={(evidenceId) =>
                          openFeedback({
                            category: evidenceId ? "incorrect_citation" : "incorrect_answer",
                            evidenceId,
                          })
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={submit}
            className="glass-strong sticky bottom-3 z-10 mt-5 space-y-3 rounded-3xl p-3 shadow-pop sm:p-4"
          >
            <label htmlFor="ask-q" className={labelCls}>
              {t("ask.questionLabel")}
            </label>
            <div className="flex items-start gap-2">
              <textarea
                id="ask-q"
                rows={2}
                maxLength={1000}
                className={`${input} min-w-0 flex-1 resize-y !rounded-2xl`}
                value={text}
                aria-invalid={!!qError}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) submit(e);
                }}
              />
              <VoiceButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
              <span className="tabular">{t("ask.counter", { n: text.length })}</span>
              {qError ? <span className="text-danger">{t(qError)}</span> : null}
            </div>
            <details className="rounded-lg border border-line bg-surface-page">
              <summary className="flex min-h-tap cursor-pointer items-center px-3 text-sm font-semibold text-ink-soft">
                {t("askx.options")}
              </summary>
              <div className="space-y-3 border-t border-line p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="ask-lang" className={labelCls}>
                      {t("ask.language")}
                    </label>
                    <select id="ask-lang" className={input} value={lang} onChange={(e) => setLang(e.target.value as "auto" | Language)}>
                      {LANGS.map((l) => (
                        <option key={l.v} value={l.v}>
                          {t(l.key)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ask-project" className={labelCls}>
                      {t("ask.project")}
                    </label>
                    <select id="ask-project" className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                      <option value="">{t("ask.noProject")}</option>
                      {projects.data?.items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ask-asof" className={labelCls}>
                      {t("ask.asOf")}
                    </label>
                    <input id="ask-asof" type="date" className={input} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                  </div>
                  {conv.explainAvailable ? (
                    <label className="flex min-h-tap items-center gap-2 text-sm">
                      <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} />
                      {t("ask.explainToggle")}
                    </label>
                  ) : null}
                  <button type="button" className={btn} aria-expanded={showCtx} onClick={() => setShowCtx((s) => !s)}>
                    {t("ask.knownFacts")}
                  </button>
                </div>
                {showCtx ? (
                  <div>
                    <p className="mb-2 text-xs text-ink-soft">{t("ask.knownFactsHelp")}</p>
                    <PlotInputsForm idPrefix="ask" value={form} onChange={setForm} errors={Object.fromEntries(Object.entries(formErrors))} />
                  </div>
                ) : null}
              </div>
            </details>
            <div className="flex justify-end">
              <button type="submit" className={btnPrimary} disabled={conv.pending || countdown > 0 || text.trim() === ""}>
                {countdown > 0 ? t("common.waitSeconds", { seconds: countdown }) : conv.pending ? t("common.sending") : t("ask.send")}
              </button>
            </div>
          </form>
        </div>
        {wide ? <EvidencePanel response={lastAnswer} /> : null}
      </div>
    </>
  );
}
