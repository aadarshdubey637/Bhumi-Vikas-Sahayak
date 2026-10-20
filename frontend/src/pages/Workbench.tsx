import { useMutation } from "@tanstack/react-query";
import { Calculator, ClipboardList, Hammer, History, Layers, MessageSquareText, Scale, Send, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ask } from "@/api/endpoints/ask";
import { assessInputs } from "@/api/endpoints/calculations";
import { buildAskRequest, questionSchema } from "@/api/schemas";
import type { AskResponse, AssessResponse } from "@/api/types";
import { LogoMark } from "@/components/brand/Logo";
import { ErrorState } from "@/components/common/ErrorState";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { StatusBadge } from "@/components/evidence/StatusBadges";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { usePingDisclaimer } from "@/components/layout/DisclaimerContext";
import { AnswerBubble } from "@/components/workbench/AnswerBubble";
import { CompliancePanel } from "@/components/workbench/CompliancePanel";
import { ProjectInputsPanel } from "@/components/workbench/ProjectInputsPanel";
import { VoiceInputButton } from "@/components/workbench/VoiceInputButton";
import { WorkbenchViewer } from "@/components/workbench/WorkbenchViewer";
import { useAccount } from "@/auth/useAccount";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { stopSpeech } from "@/hooks/useSpeechOutput";
import { evaluateCompliance } from "@/lib/compliance";
import { queryTerms } from "@/lib/highlight";
import { suggestQuestions } from "@/lib/suggest";
import { btn, btnAccent, input } from "@/lib/ui";
import { convertForm, emptyWbForm, example30x40, exampleWbForm, fieldDomId, parseWb, unitSystemOf, type FieldId, type Metrics, type WbForm } from "@/lib/workbench";

const FORM_KEY = "ns.wb.form";
const CHAT_KEY = "ns.wb.chat";
/** Fixed English question: the backend's stated-answer layer returns structured limits for exactly these topics. */
const EVAL_QUESTION = "What front, rear and side open space and floor area ratio apply?";
const DEFAULT_EXAMPLES = ["wb.ex1", "wb.ex2", "wb.ex5", "wb.ex4"] as const;

type Pane = "inputs" | "ask" | "canvas" | "results";
type InspectorTab = "compliance" | "evidence" | "history";

interface Evaluated {
  key: string;
  metrics: Metrics;
  assessment: AssessResponse;
  answer: AskResponse;
}

function loadForm(): WbForm {
  try {
    const raw = window.sessionStorage.getItem(FORM_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<WbForm>;
      const base = emptyWbForm("ft");
      if (v && typeof v === "object" && v.cells) {
        for (const k of Object.keys(base.cells) as Array<keyof WbForm["cells"]>) {
          const c = v.cells[k];
          if (c && typeof c.value === "string" && typeof c.unit === "string") base.cells[k] = { value: c.value.slice(0, 40), unit: c.unit };
        }
        base.floors = typeof v.floors === "string" ? v.floors.slice(0, 12) : "";
        base.building_use = typeof v.building_use === "string" ? v.building_use.slice(0, 64) : "";
        base.location = typeof v.location === "string" ? v.location.slice(0, 64) : "";
        return base;
      }
    }
  } catch {
    /* ignore unreadable saved state */
  }
  return emptyWbForm("ft");
}

const snapshotKey = (form: WbForm, inputs: unknown): string => JSON.stringify({ inputs, gf: form.cells.gap_front, gl: form.cells.gap_left });

export default function Workbench() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { openFeedback } = useFeedbackDialog();
  const wide = useMediaQuery("(min-width: 1280px)");
  const uiHi = i18n.language === "hi";
  const { status: accountStatus, accountsEnforced } = useAccount();

  const [form, setForm] = useState<WbForm>(loadForm);
  const parsed = useMemo(() => parseWb(form), [form]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {
      /* not remembered */
    }
  }, [form]);

  const conv = useAskConversation(CHAT_KEY);
  const [text, setText] = useState((location.state as { question?: string } | null)?.question ?? "");
  const [qError, setQError] = useState<string | undefined>();
  const [explain, setExplain] = useState(false);
  const [pane, setPane] = useState<Pane>("ask");
  const [tab, setTab] = useState<InspectorTab>("compliance");
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [evaluated, setEvaluated] = useState<Evaluated | null>(null);
  const [needInputs, setNeedInputs] = useState(false);
  const [autoEval, setAutoEval] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLInputElement>(null);

  const last = conv.turns[conv.turns.length - 1];
  const countdown = useRateLimitCountdown(last?.error);
  usePingDisclaimer(conv.turns.length);
  const answered = useMemo(() => [...conv.turns].reverse().find((x) => x.response), [conv.turns]);
  const shownTurn = conv.turns.find((x) => x.id === selected && x.response) ?? answered;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [conv.turns.length]);

  const language = uiHi ? ("hi" as const) : undefined;
  const send = useCallback(
    (question: string) => {
      const q = questionSchema.safeParse(question);
      if (!q.success) return setQError(q.error.issues[0]?.message);
      setQError(undefined);
      setSelected(null);
      void conv.send({ question, language, context: parsed.inputs, explain: explain && conv.explainAvailable });
      setText("");
      setPane("ask");
    },
    [conv, language, parsed.inputs, explain],
  );
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (conv.pending || countdown > 0) return;
    send(text);
  };

  // A question handed over from another page arrives with autoSend (deferred so React StrictMode's remount cannot drop or double it).
  useEffect(() => {
    const st = location.state as { autoSend?: boolean; question?: string } | null;
    if (!st?.autoSend || !st.question?.trim()) return;
    const timer = window.setTimeout(() => {
      send(st.question as string);
      navigate(location.pathname, { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival
  }, []);

  const evalMut = useMutation({
    mutationFn: async (): Promise<Evaluated> => {
      const inputs = parsed.inputs;
      const [assessment, answer] = await Promise.all([assessInputs({ inputs }), ask(buildAskRequest({ question: EVAL_QUESTION, language, context: inputs }))]);
      return { key: snapshotKey(form, inputs), metrics: parsed.metrics, assessment, answer };
    },
    onSuccess: (r) => {
      setEvaluated(r);
      setTab("compliance");
      if (!wide) setPane("results");
    },
  });
  const evaluate = useCallback(() => {
    if (Object.keys(parsed.inputs).length === 0) return setNeedInputs(true);
    setNeedInputs(false);
    evalMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evalMut.mutate is stable
  }, [parsed.inputs]);

  // "Try the 30 x 40 ft house" fills the form and evaluates it once the new inputs are in place.
  useEffect(() => {
    if (!autoEval) return;
    setAutoEval(false);
    evaluate();
  }, [autoEval, evaluate]);

  const report = useMemo(() => (evaluated ? evaluateCompliance({ metrics: evaluated.metrics, answer: evaluated.answer, assessment: evaluated.assessment }) : null), [evaluated]);
  const stale = !!evaluated && evaluated.key !== snapshotKey(form, parsed.inputs);

  const goToField = useCallback((f: FieldId) => {
    setPane("inputs");
    window.setTimeout(() => {
      const el = document.getElementById(fieldDomId(f));
      const det = el?.closest("details");
      if (det) det.open = true;
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.();
    }, 30);
  }, []);

  const reset = () => {
    stopSpeech();
    setForm(emptyWbForm(unitSystemOf(form)));
    conv.reset();
    evalMut.reset();
    setEvaluated(null);
    setSelected(null);
    setText("");
    setQError(undefined);
    setNeedInputs(false);
    setConfirmReset(false);
    setTab("compliance");
  };

  const pick = (turnId: number) => {
    setSelected(turnId);
    setTab("evidence");
    if (!wide) setPane("results");
  };
  const showHistory = (turnId: number) => {
    setSelected(turnId);
    setPane("ask");
    window.setTimeout(() => document.getElementById(`turn-${turnId}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 30);
  };

  const panes: Array<{ id: Pane; label: string; icon: typeof Scale }> = [
    { id: "inputs", label: t("wb.pane.inputs"), icon: ClipboardList },
    { id: "ask", label: t("wb.pane.ask"), icon: MessageSquareText },
    { id: "canvas", label: t("wb.pane.canvas"), icon: Layers },
    { id: "results", label: t("wb.pane.results"), icon: Scale },
  ];
  const show = (p: Pane, extra = "") => `${pane === p ? "block" : "hidden"} xl:block ${extra}`;
  const tabBtn = (active: boolean) => `inline-flex min-h-tap flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors ${active ? "bg-accent text-navy-night" : "text-ink-soft hover:bg-white/10"}`;
  const itab = (active: boolean) => `inline-flex min-h-tap flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-sm font-semibold ${active ? "border-brand text-brand" : "border-transparent text-ink-soft hover:text-ink"}`;
  const terms = shownTurn ? queryTerms(shownTurn.question) : [];
  // chips: questions built from the numbers typed so far, then the user's own recent questions, then generic examples
  const chips = useMemo(() => {
    const own = suggestQuestions(parsed.metrics).map((s) => t(s.key, s.params) as string);
    const recent = [...new Set(conv.turns.map((x) => x.question))].slice(-2).reverse();
    const fallback = DEFAULT_EXAMPLES.map((k) => t(k) as string);
    const list = [...own, ...recent, ...(own.length ? [] : fallback)];
    return [...new Set(list)].slice(0, 6).map((label) => ({ label, recent: recent.includes(label) && !own.includes(label) }));
  }, [parsed.metrics, conv.turns, t]);

  return (
    <>
      {/* ------------------------------------------------------------------ hero: ask, quick starts */}
      <section aria-labelledby="wb-hero" className="glass-dark relative overflow-hidden rounded-3xl p-4 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{t("wb.hero.kicker")}</p>
            <h1 id="wb-hero" className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[1.9rem]">
              {t("wb.hero.title")}
            </h1>
            <p className="mt-1.5 text-sm text-white/75">{t("wb.hero.body")}</p>
          </div>
          {confirmReset ? (
            <div role="alertdialog" aria-label={t("wb.reset")} className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-line bg-white px-3 py-2 text-sm text-ink">
              <span>{t("wb.resetConfirm")}</span>
              <button type="button" className={`${btn} !border-danger !text-danger`} onClick={reset}>
                {t("wb.resetYes")}
              </button>
              <button type="button" className={btn} onClick={() => setConfirmReset(false)}>
                {t("wb.resetNo")}
              </button>
            </div>
          ) : (
            <button type="button" className="inline-flex min-h-tap items-center gap-2 rounded-xl border border-white/20 bg-white/8 px-3 text-sm font-semibold text-white hover:bg-white/15" onClick={() => setConfirmReset(true)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {t("wb.reset")}
            </button>
          )}
        </div>

        <form onSubmit={submit} role="search" className="relative mt-4 space-y-2">
          <label htmlFor="wb-q" className="sr-only">
            {t("ask.questionLabel")}
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-white p-2 shadow-pop">
            <input
              id="wb-q"
              ref={qRef}
              className={`${input} min-w-0 flex-1 !border-transparent !bg-transparent !text-ink !shadow-none focus:!ring-0`}
              maxLength={1000}
              value={text}
              placeholder={t("wb.chat.placeholder")}
              aria-invalid={!!qError}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
            <VoiceInputButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
            <button type="submit" className={`${btnAccent} !border-white !bg-white !text-[#0b2a5b] hover:!bg-white/90`} disabled={conv.pending || countdown > 0 || text.trim() === ""} aria-label={t("ask.send")}>
              <Send aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">{countdown > 0 ? t("common.waitSeconds", { seconds: countdown }) : conv.pending ? t("common.sending") : t("ask.send")}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
            <span>
              {Object.keys(parsed.inputs).length > 0 ? t("wb.chat.usingInputs", { n: Object.keys(parsed.inputs).length }) : t("wb.chat.noInputs")}
              {Object.keys(parsed.errors).length > 0 ? ` · ${t("wb.chat.skipped", { n: Object.keys(parsed.errors).length })}` : ""}
            </span>
            {qError ? <span className="font-semibold text-[#ffb4b4]">{t(qError)}</span> : null}
            {conv.explainAvailable ? (
              <label className="ml-auto flex min-h-tap items-center gap-1.5">
                <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} />
                {t("ask.explainToggle")}
              </label>
            ) : null}
          </div>
          {accountStatus === "guest" && accountsEnforced ? (
            <p className="text-xs text-white/70">
              {t("wb.guestSave")}{" "}
              <Link to="/signup" state={{ from: "/workbench" }} className="font-semibold text-accent hover:underline">
                {t("land.cta.signup")}
              </Link>{" "}
              ·{" "}
              <Link to="/login" state={{ from: "/workbench" }} className="font-semibold text-accent hover:underline">
                {t("land.nav.signin")}
              </Link>
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center gap-2" aria-label={t("wb.hero.examples")}>
            <li className="text-xs font-semibold text-white/60">{chips.some((c) => !c.recent) && Object.keys(parsed.inputs).length > 0 ? t("wb.sg.title") : t("wb.hero.examples")}:</li>
            {chips.map((c) => (
              <li key={c.label}>
                <button
                  type="button"
                  className="min-h-tap max-w-[22rem] truncate rounded-full border border-white/15 bg-white/8 px-3 text-xs font-semibold text-white/90 transition-colors hover:border-accent/70 hover:bg-white/15"
                  title={c.label}
                  onClick={() => {
                    setText(c.label);
                    qRef.current?.focus();
                  }}
                >
                  {c.recent ? `↻ ${c.label}` : c.label}
                </button>
              </li>
            ))}
          </ul>
        </form>

        <div className="relative mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          <button type="button" className="inline-flex min-h-tap items-center gap-2 text-sm font-semibold text-accent hover:underline" onClick={() => { setForm(example30x40(unitSystemOf(form))); setAutoEval(true); setPane(wide ? "ask" : "canvas"); }}>
            <Hammer aria-hidden="true" className="h-4 w-4" />
            {t("wb.qs.demoTitle")}
          </button>
          <Link to="/calculator" className="inline-flex min-h-tap items-center gap-2 text-sm font-semibold text-white/80 hover:text-white hover:underline">
            <Calculator aria-hidden="true" className="h-4 w-4" />
            {t("wb.qs.calcTitle")}
          </Link>
        </div>
      </section>

      <div role="tablist" aria-label={t("wb.pane.label")} className="theme-dark sticky top-[3.6rem] z-20 my-3 flex gap-1 rounded-xl border border-white/10 bg-navy-night p-1 xl:hidden">
        {panes.map((p) => (
          <button key={p.id} role="tab" type="button" aria-selected={pane === p.id} className={tabBtn(pane === p.id)} onClick={() => setPane(p.id)}>
            <p.icon aria-hidden="true" className="h-4 w-4" />
            <span className="truncate">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_23rem] xl:items-start">
        {/* 1 · project inputs (dark panel) */}
        <aside aria-label={t("wb.inputs.title")} className={show("inputs", "panel-dark rounded-3xl p-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6.5rem)] xl:overflow-y-auto")}>
          <ProjectInputsPanel form={form} onChange={setForm} parsed={parsed} onEvaluate={evaluate} evaluating={evalMut.isPending} onReset={() => setConfirmReset(true)} onExample={() => setForm(exampleWbForm(unitSystemOf(form)))} unitSystem={unitSystemOf(form)} onUnitSystem={(u) => setForm((f) => convertForm(f, u))} />
          {needInputs ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t("wb.needInputs")}
            </p>
          ) : null}
          {evalMut.isError ? <ErrorState className="mt-2" error={evalMut.error} /> : null}
        </aside>

        {/* 2 · 3D workbench + assistant thread */}
        <div className="min-w-0 space-y-4">
          <div className={show("canvas")}>
            <WorkbenchViewer metrics={parsed.metrics} frontMin={report?.frontMin} rearMin={report?.rearMin} flags={report?.flags ?? { front: false, rear: false, outside: false }} guidesStale={stale} />
          </div>

          <section aria-label={t("wb.chat.title")} className={show("ask", "space-y-4")}>
            <div aria-live="polite" className="space-y-4">
              {conv.turns.length === 0 ? (
                <div className="glass-strong rounded-2xl p-5">
                  <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-[#9DB8FF]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <h2 className="mt-3 text-lg font-semibold">{t("wb.chat.welcomeTitle")}</h2>
                  <p className="mt-1 max-w-xl text-sm text-ink-soft">{t("wb.chat.welcomeBody")}</p>
                </div>
              ) : null}
              {conv.turns.map((turn) => (
                <div key={turn.id} id={`turn-${turn.id}`} className="scroll-mt-24 space-y-3">
                  <p className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-navy-700 to-navy px-4 py-2.5 text-sm text-white" lang={/[ऀ-ॿ]/.test(turn.question) ? "hi" : undefined}>
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
                        <AnswerBubble turnId={turn.id} response={turn.response} selected={shownTurn?.id === turn.id} onInspect={() => pick(turn.id)} onGoToField={goToField} onReport={() => openFeedback({ category: "incorrect_answer" })} />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </section>
        </div>

        {/* 3 · regulation inspector (dark panel) */}
        <aside aria-label={t("wb.inspector.title")} className={show("results", "panel-dark rounded-3xl xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6.5rem)] xl:overflow-y-auto")}>
          <div className="sticky top-0 z-10 rounded-t-3xl bg-surface">
            <h2 className="px-4 pt-3.5 text-base font-semibold">{t("wb.inspector.title")}</h2>
            <div role="tablist" aria-label={t("wb.inspector.title")} className="mt-1 flex border-b border-line">
              <button role="tab" type="button" aria-selected={tab === "compliance"} className={itab(tab === "compliance")} onClick={() => setTab("compliance")}>
                <Scale aria-hidden="true" className="h-4 w-4" />
                {t("wb.inspector.compliance")}
              </button>
              <button role="tab" type="button" aria-selected={tab === "evidence"} className={itab(tab === "evidence")} onClick={() => setTab("evidence")}>
                <ClipboardList aria-hidden="true" className="h-4 w-4" />
                {t("wb.inspector.evidence")}
              </button>
              <button role="tab" type="button" aria-selected={tab === "history"} className={itab(tab === "history")} onClick={() => setTab("history")}>
                <History aria-hidden="true" className="h-4 w-4" />
                {t("wb.inspector.history")}
              </button>
            </div>
          </div>
          <div className="p-4" role="tabpanel">
            {tab === "compliance" ? (
              evalMut.isPending ? (
                <LoadingSkeleton lines={5} label={t("wb.evaluating")} />
              ) : report ? (
                <CompliancePanel report={report} stale={stale} onGoToField={goToField} />
              ) : (
                <div className="py-8 text-center">
                  <span aria-hidden="true" className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-sunken text-ink-faint">
                    <Scale className="h-6 w-6" />
                  </span>
                  <h3 className="mt-3 font-semibold">{t("wb.inspector.emptyTitle")}</h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{t("wb.inspector.emptyBody")}</p>
                </div>
              )
            ) : null}
            {tab === "evidence" ? (
              shownTurn?.response && shownTurn.response.evidence.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink-soft">
                    {t("wb.inspector.evidenceFor")} <span className="font-semibold text-ink">“{shownTurn.question}”</span>
                  </p>
                  <EvidenceList items={shownTurn.response.evidence} terms={terms} onReport={(id) => openFeedback({ category: "incorrect_citation", evidenceId: id })} />
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-ink-soft">{t("wb.inspector.noEvidence")}</p>
              )
            ) : null}
            {tab === "history" ? (
              conv.turns.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">{t("wb.inspector.noHistory")}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-ink-faint">{t("wb.inspector.historyNote")}</p>
                  <ol className="space-y-1.5">
                    {[...conv.turns].reverse().map((turn) => (
                      <li key={turn.id}>
                        <button type="button" onClick={() => showHistory(turn.id)} className="flex min-h-tap w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface-sunken/60 px-3 py-2 text-left hover:border-brand-ring">
                          <span className="line-clamp-2 text-sm font-semibold" lang={/[ऀ-ॿ]/.test(turn.question) ? "hi" : undefined}>
                            {turn.question}
                          </span>
                          {turn.response ? <StatusBadge status={turn.response.status} /> : <span className="text-xs text-ink-faint">{turn.error ? t("wb.inspector.failed") : t("ask.searching")}</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    className="inline-flex min-h-tap items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-sunken"
                    onClick={() => {
                      stopSpeech();
                      conv.reset();
                      setSelected(null);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    {t("wb.inspector.clearHistory")}
                  </button>
                </div>
              )
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
