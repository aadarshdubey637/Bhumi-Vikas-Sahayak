import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { listProjects } from "@/api/endpoints/projects";
import { buildInputs, emptyPlotForm, questionSchema } from "@/api/schemas";
import type { Language } from "@/api/types";
import { ChatAnswer } from "@/components/ask/ChatAnswer";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { VoiceButton } from "@/components/common/VoiceButton";
import { usePingDisclaimer } from "@/components/layout/DisclaimerContext";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
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
  // On by default: the chat answers in full, natural sentences. It falls back to the cited rule pointers by itself when the
  // server has no AI provider configured (see useAskConversation).
  const [explain, setExplain] = useState(true);
  const [qError, setQError] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  const projects = useQuery({
    queryKey: ["projects", { limit: 100, offset: 0 }],
    queryFn: ({ signal }) => listProjects({ limit: 100 }, signal),
  });
  const last = conv.turns[conv.turns.length - 1];
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
      <div className="mx-auto min-w-0 max-w-3xl">
        <div className="space-y-8 pb-6" aria-live="polite">
          {conv.turns.length === 0 ? (
            <section className="py-8 text-center sm:py-12">
              <h2 className="text-2xl font-semibold">{t("askx.welcomeTitle")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-ink-soft">{t("askx.welcomeBody")}</p>
              <ul className="mt-6 flex flex-wrap justify-center gap-2">
                {SAMPLE_QUESTIONS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      className="min-h-tap rounded-full border border-line px-4 py-2 text-left text-sm transition-colors hover:border-brand-ring hover:bg-brand-tint"
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
            <div key={turn.id} className="space-y-5">
              <p
                className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-3xl bg-surface-sunken px-4 py-2.5 text-[0.9375rem] text-ink"
                lang={/[ऀ-ॿ]/.test(turn.question) ? "hi" : undefined}
              >
                {turn.question}
              </p>
              {turn.noteKey ? <p className="text-sm text-ink-soft">{t(turn.noteKey)}</p> : null}
              <div className="flex items-start gap-3">
                <LogoMark className="mt-0.5 h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  {!turn.response && !turn.error ? (
                    <p className="flex items-center gap-2 py-1 text-sm text-ink-soft" role="status">
                      <span aria-hidden="true" className="flex gap-1">
                        <span className="h-2 w-2 rounded-full bg-ink-faint motion-safe:animate-bounce" />
                        <span className="h-2 w-2 rounded-full bg-ink-faint motion-safe:animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-ink-faint motion-safe:animate-bounce [animation-delay:300ms]" />
                      </span>
                      {t("askx.chatThinking")}
                    </p>
                  ) : null}
                  {turn.error ? <ErrorState error={turn.error} /> : null}
                  {turn.response ? (
                    <ChatAnswer
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
        <form onSubmit={submit} className="sticky bottom-3 z-10 space-y-2">
          <div className="rounded-2xl border border-line-strong bg-surface p-1.5 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <label htmlFor="ask-q" className="sr-only">
              {t("ask.questionLabel")}
            </label>
            <textarea
              id="ask-q"
              rows={1}
              maxLength={1000}
              placeholder={t("askx.chatPlaceholder")}
              className="block max-h-48 min-h-[2.5rem] w-full resize-none bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              value={text}
              aria-invalid={!!qError}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) submit(e);
              }}
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <span className="tabular text-xs text-ink-soft">
                {qError ? <span className="text-danger">{t(qError)}</span> : t("ask.counter", { n: text.length })}
              </span>
              <div className="flex items-center gap-2">
                <VoiceButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
                <button type="submit" className={btnPrimary} disabled={conv.pending || countdown > 0 || text.trim() === ""}>
                  {countdown > 0 ? t("common.waitSeconds", { seconds: countdown }) : conv.pending ? t("common.sending") : t("ask.send")}
                </button>
              </div>
            </div>
          </div>
          <details className="rounded-2xl border border-line bg-surface-page">
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
          <p className="text-center text-xs text-ink-soft">{t("ask.historyNote")}</p>
        </form>
      </div>
    </>
  );
}
