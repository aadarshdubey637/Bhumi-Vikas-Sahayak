import { useMutation } from "@tanstack/react-query";
import { ArrowUp, ClipboardList, FileText, Layers, PanelLeftOpen, PanelRightClose, PanelRightOpen, Printer, Scale, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ask } from "@/api/endpoints/ask";
import { assessInputs } from "@/api/endpoints/calculations";
import { buildAskRequest, questionSchema } from "@/api/schemas";
import type { AskResponse, AssessResponse } from "@/api/types";
import { ErrorState } from "@/components/common/ErrorState";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { EvidenceList } from "@/components/evidence/EvidenceCard";
import { StatusBadge } from "@/components/evidence/StatusBadges";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { usePingDisclaimer } from "@/components/layout/DisclaimerContext";
import { GuideAnswer } from "@/components/assistant/GuideAnswer";
import { AnswerBubble } from "@/components/workbench/AnswerBubble";
import { CompliancePanel } from "@/components/workbench/CompliancePanel";
import { ProjectInputsPanel, type Target } from "@/components/workbench/ProjectInputsPanel";
import { VoiceInputButton } from "@/components/workbench/VoiceInputButton";
import { WorkbenchViewer } from "@/components/workbench/WorkbenchViewer";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { stopSpeech } from "@/hooks/useSpeechOutput";
import { applyFacts, completeMetrics } from "@/lib/autofill";
import { matchGuide, type GuideTopic } from "@/lib/guide";
import { evaluateCompliance } from "@/lib/compliance";
import { queryTerms } from "@/lib/highlight";
import { btn } from "@/lib/ui";
import { onWbCommand } from "@/lib/wbEvents";
import { emptyWbForm, exampleWbForm, fieldDomId, parseWb, unitSystemOf, type FieldId, type Metrics, type WbForm } from "@/lib/workbench";

const FORM_KEY = "ns.wb.form";
const CHAT_KEY = "ns.wb.chat";
const PANELS_KEY = "ns.wb.panels";

/** Which side panels are open on desktop (the inputs on the left, the regulation inspector on the right); both start open. */
function loadPanels(): { left: boolean; right: boolean } {
  try {
    const v = JSON.parse(window.localStorage.getItem(PANELS_KEY) ?? "null") as { left?: unknown; right?: unknown } | null;
    return { left: v?.left !== false, right: v?.right !== false };
  } catch {
    return { left: true, right: true };
  }
}
/** Fixed English question: the backend's stated-answer layer returns structured limits for exactly these topics. */
const EVAL_QUESTION = "What front, rear and side open space and floor area ratio apply?";

type Pane = "inputs" | "canvas" | "results";
type InspectorTab = "answer" | "compliance" | "evidence" | "history";

interface Evaluated {
  key: string;
  metrics: Metrics;
  assessment: AssessResponse;
  answer: AskResponse;
  target: Target;
}

function loadForm(): WbForm {
  try {
    const raw = window.sessionStorage.getItem(FORM_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<WbForm>;
      const base = emptyWbForm("m");
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
  return emptyWbForm("m");
}

const QUESTIONS: Record<Target, string> = {
  all: EVAL_QUESTION,
  front: "What front open space applies?",
  rear: "What rear open space applies?",
  far: "What floor area ratio applies?",
};

const snapshotKey = (form: WbForm, inputs: unknown, target: Target): string => JSON.stringify({ inputs, target, gf: form.cells.gap_front, gl: form.cells.gap_left });

export default function Workbench() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { openFeedback } = useFeedbackDialog();
  const wide = useMediaQuery("(min-width: 1280px)");
  const uiHi = i18n.language === "hi";

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
  const [target, setTarget] = useState<Target>("all");
  const [pane, setPane] = useState<Pane>("canvas");
  const [tab, setTab] = useState<InspectorTab>("answer");
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [evaluated, setEvaluated] = useState<Evaluated | null>(null);
  const [needInputs, setNeedInputs] = useState(false);
  const [autoEval, setAutoEval] = useState(false);
  /** a product-guide question ("hi", "how do I start?") is answered here without asking the rulebook */
  const [guideTurn, setGuideTurn] = useState<{ q: string; topic: GuideTopic; after: number } | null>(null);
  const qRef = useRef<HTMLInputElement>(null);
  const [panels, setPanels] = useState(loadPanels);
  const setPanel = useCallback((side: "left" | "right", open: boolean) => {
    setPanels((p) => {
      const next = { ...p, [side]: open };
      try {
        window.localStorage.setItem(PANELS_KEY, JSON.stringify(next));
      } catch {
        /* not remembered */
      }
      return next;
    });
  }, []);

  const last = conv.turns[conv.turns.length - 1];
  const countdown = useRateLimitCountdown(last?.error);
  usePingDisclaimer(conv.turns.length);
  const answered = useMemo(() => [...conv.turns].reverse().find((x) => x.response), [conv.turns]);
  const shownTurn = conv.turns.find((x) => x.id === selected && x.response) ?? answered;
  /** the turn the Answer view shows: the one picked from history, else the newest (even while it is still loading) */
  const curTurn = conv.turns.find((x) => x.id === selected) ?? last;

  const language = uiHi ? ("hi" as const) : undefined;
  const send = useCallback(
    (question: string, explain = false) => {
      const q = questionSchema.safeParse(question);
      if (!q.success) return setQError(q.error.issues[0]?.message);
      setQError(undefined);
      setSelected(null);
      const topic = explain ? null : matchGuide(question);
      if (topic) {
        setGuideTurn({ q: question.trim(), topic, after: conv.turns.length });
        setText("");
        setTab("answer");
        setPanel("right", true);
        if (!wide) setPane("results");
        return;
      }
      void conv.send({ question, language, context: parsed.inputs, explain: explain && conv.explainAvailable });
      setText("");
      setTab("answer");
      setPanel("right", true);
      if (!wide) setPane("results");
    },
    [conv, language, parsed.inputs, wide, setPanel],
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

  // The header's Reset and History buttons act on this page.
  useEffect(
    () =>
      onWbCommand((cmd) => {
        if (cmd === "reset") setConfirmReset(true);
        else {
          setTab("history");
          setPanel("right", true);
          if (!wide) setPane("results");
        }
      }),
    [wide, setPanel],
  );

  const evalMut = useMutation({
    mutationFn: async (): Promise<Evaluated> => {
      const inputs = parsed.inputs;
      const [assessment, answer] = await Promise.all([assessInputs({ inputs }), ask(buildAskRequest({ question: QUESTIONS[target], language, context: inputs }))]);
      return { key: snapshotKey(form, inputs, target), metrics: parsed.metrics, assessment, answer, target };
    },
    onSuccess: (r) => {
      setEvaluated(r);
      setTab("compliance");
      setPanel("right", true);
      if (!wide) setPane("results");
    },
  });
  const evaluate = useCallback(() => {
    if (Object.keys(parsed.inputs).length === 0) return setNeedInputs(true);
    setNeedInputs(false);
    evalMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evalMut.mutate is stable
  }, [parsed.inputs]);

  // "Example" fills the form and evaluates it once the new inputs are in place.
  useEffect(() => {
    if (!autoEval) return;
    setAutoEval(false);
    evaluate();
  }, [autoEval, evaluate]);

  // Describing the plot in words fills the form from the facts the server recognised, then checks it. Answers already on screen
  // when the page opened are not re-applied, so manual edits are never overwritten by an old message.
  const appliedRef = useRef(new Set(conv.turns.map((x) => x.id)));
  useEffect(() => {
    if (!answered?.response || appliedRef.current.has(answered.id)) return;
    appliedRef.current.add(answered.id);
    const { form: next, filled } = applyFacts(form, answered.response.extracted_facts);
    if (filled.length === 0) return;
    setForm(next);
    setAutoEval(true);
  }, [answered, form]);

  const report = useMemo(() => (evaluated ? evaluateCompliance({ metrics: evaluated.metrics, answer: evaluated.answer, assessment: evaluated.assessment }) : null), [evaluated]);
  const completed = useMemo(() => completeMetrics(parsed.metrics, report?.frontMin), [parsed.metrics, report?.frontMin]);
  const stale = !!evaluated && evaluated.key !== snapshotKey(form, parsed.inputs, target);

  const goToField = useCallback((f: FieldId) => {
    setPane("inputs");
    setPanel("left", true);
    window.setTimeout(() => {
      const el = document.getElementById(fieldDomId(f));
      const det = el?.closest("details");
      if (det) det.open = true;
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.();
    }, 30);
  }, [setPanel]);

  const reset = () => {
    stopSpeech();
    setForm(emptyWbForm(unitSystemOf(form)));
    conv.reset();
    setGuideTurn(null);
    evalMut.reset();
    setEvaluated(null);
    setSelected(null);
    setText("");
    setQError(undefined);
    setNeedInputs(false);
    setConfirmReset(false);
    setTarget("all");
    setTab("answer");
  };

  const pick = (turnId: number) => {
    setSelected(turnId);
    setTab("evidence");
    if (!wide) setPane("results");
  };
  const showHistory = (turnId: number) => {
    setSelected(turnId);
    setTab("answer");
  };

  const panes: Array<{ id: Pane; label: string; icon: typeof Scale }> = [
    { id: "inputs", label: t("wb.pane.inputs"), icon: ClipboardList },
    { id: "canvas", label: t("wb.pane.canvas"), icon: Layers },
    { id: "results", label: t("wb.pane.results"), icon: Scale },
  ];
  const show = (p: Pane, extra = "") => `${pane === p ? "block" : "hidden"} xl:block ${extra}`;
  const showFlex = (p: Pane, extra = "") => `${pane === p ? "flex" : "hidden"} xl:flex ${extra}`;
  const tabBtn = (active: boolean) => `inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors ${active ? "bg-surface-sunken text-ink ring-1 ring-inset ring-line-strong" : "text-ink-soft hover:bg-surface-sunken"}`;
  const terms = shownTurn ? queryTerms(shownTurn.question) : [];
  const targetLabel = t(`wb.ui.t${evaluated?.target ? evaluated.target[0]!.toUpperCase() + evaluated.target.slice(1) : "All"}`);
  const hasResult = !!report;
  const showGuide = !!guideTurn && selected === null && conv.turns.length <= guideTurn.after;
  const hasAnswer = !!curTurn || showGuide;
  const switcher = (hasResult && hasAnswer && (tab === "answer" || tab === "compliance")) as boolean;
  const sw = (on: boolean) => `h-8 rounded-lg px-3 text-xs font-semibold transition-colors ${on ? "bg-surface-sunken text-ink ring-1 ring-inset ring-line-strong" : "text-ink-soft hover:text-ink"}`;
  /** "Explain with AI": asks again for the answer on screen (or the evaluation) with the AI explanation switched on */
  const canExplain = (hasAnswer || hasResult) && conv.explainAvailable && !conv.pending;
  const explain = () => send(tab === "answer" && curTurn ? curTurn.question : QUESTIONS[evaluated?.target ?? target], true);

  return (
    <div className="flex min-h-[calc(100vh-3.75rem)] flex-col xl:h-full xl:min-h-0 xl:overflow-hidden print:h-auto print:overflow-visible">
      <div role="tablist" aria-label={t("wb.pane.label")} className="sticky top-[3.75rem] z-20 flex gap-1 border-b border-line bg-surface p-1.5 xl:hidden print:hidden">
        {panes.map((p) => (
          <button key={p.id} role="tab" type="button" aria-selected={pane === p.id} className={tabBtn(pane === p.id)} onClick={() => setPane(p.id)}>
            <p.icon aria-hidden="true" className="h-4 w-4" />
            <span className="truncate">{p.label}</span>
          </button>
        ))}
      </div>

      <div style={{ "--lw": panels.left ? undefined : "3rem", "--rw": panels.right ? undefined : "3rem" } as React.CSSProperties} className="grid min-h-0 flex-1 [--lw:21.5rem] [--rw:22.5rem] 2xl:[--lw:22.6rem] 2xl:[--rw:25rem] xl:[grid-template-columns:var(--lw)_minmax(0,1fr)_var(--rw)] xl:grid-rows-[minmax(0,1fr)] print:block">
        {/* 1 · project inputs */}
        {!panels.left ? (
          <button type="button" onClick={() => setPanel("left", true)} aria-label={t("wb.ui.expand")} title={t("wb.ui.expand")} className="hidden min-h-0 flex-col items-center gap-4 border-r border-line bg-surface-page py-3 text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink xl:flex print:hidden">
            <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
            <span className="text-sm font-bold [writing-mode:vertical-rl]">{t("wb.ui.inputsTitle")}</span>
          </button>
        ) : null}
        <aside aria-label={t("wb.inputs.title")} className={show("inputs", `min-h-0 overflow-y-auto border-line bg-surface-page xl:border-r print:hidden ${panels.left ? "" : "xl:hidden"}`)}>
          <ProjectInputsPanel form={form} onChange={setForm} parsed={parsed} onEvaluate={evaluate} evaluating={evalMut.isPending} onExample={() => { setForm(exampleWbForm(unitSystemOf(form))); setAutoEval(true); }} target={target} onTarget={setTarget} onCollapse={() => setPanel("left", false)} />
          {needInputs ? (
            <p role="alert" className="px-4 pb-3 text-sm text-danger">
              {t("wb.needInputs")}
            </p>
          ) : null}
          {evalMut.isError ? <ErrorState className="m-3" error={evalMut.error} /> : null}
        </aside>

        {/* 2 · ask + rule-to-geometry canvas */}
        <div className={showFlex("canvas", "min-h-0 min-w-0 flex-col bg-surface-page print:hidden")}>
          <form onSubmit={submit} role="search" className="space-y-1.5 px-4 pt-4">
            <label htmlFor="wb-q" className="sr-only">
              {t("ask.questionLabel")}
            </label>
            <div className="flex items-center gap-1.5 h-[3.4375rem] rounded-xl border border-line bg-surface px-4 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
              <input
                id="wb-q"
                ref={qRef}
                className="h-full min-w-0 flex-1 text-ellipsis bg-transparent px-1 text-base text-ink placeholder:text-ink-faint focus:outline-none"
                maxLength={1000}
                value={text}
                placeholder={t("wb.chat.placeholder")}
                aria-invalid={!!qError}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
              />
              <VoiceInputButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
              <button type="submit" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft transition-colors enabled:bg-white enabled:text-[#10131c] enabled:hover:bg-white/90 disabled:cursor-not-allowed" disabled={conv.pending || countdown > 0 || text.trim() === ""} aria-label={t("ask.send")}>
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {qError || countdown > 0 ? (
              <p className="px-1 text-xs font-semibold text-danger">
                {qError ? t(qError) : t("common.waitSeconds", { seconds: countdown })}
              </p>
            ) : null}
          </form>
          <div className="mt-1 flex min-h-0 flex-1 flex-col">
            <WorkbenchViewer metrics={completed?.metrics ?? parsed.metrics} frontMin={report?.frontMin} rearMin={report?.rearMin} frontRule={report?.frontRule} rearRule={report?.rearRule} flags={report?.flags ?? { front: false, rear: false, outside: false }} guidesStale={stale} />
          </div>
        </div>

        {/* 3 · regulation inspector */}
        {!panels.right ? (
          <button type="button" onClick={() => setPanel("right", true)} aria-label={t("wb.ui.expand")} title={t("wb.ui.expand")} className="hidden min-h-0 flex-col items-center gap-4 border-l border-line bg-surface-page py-3 text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink xl:flex print:hidden">
            <PanelRightOpen aria-hidden="true" className="h-5 w-5" />
            <span className="text-sm font-bold [writing-mode:vertical-rl]">{t("wb.ui.inspectorTitle")}</span>
          </button>
        ) : null}
        <aside aria-label={t("wb.inspector.title")} className={showFlex("results", `min-h-0 flex-col border-line bg-surface-page xl:border-l print:block ${panels.right ? "" : "xl:hidden"}`)}>
          <h2 className="flex h-[2.875rem] shrink-0 items-center gap-2.5 border-b border-line px-4 text-sm font-bold text-ink">
            <span aria-hidden="true" className="inline-flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-md bg-navy text-[0.6875rem] text-white">03</span>
            <span className="flex-1">{t("wb.ui.inspectorTitle")}</span>
            <button type="button" onClick={() => setPanel("right", false)} aria-label={t("wb.ui.collapse")} title={t("wb.ui.collapse")} className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken hover:text-ink xl:inline-flex print:hidden">
              <PanelRightClose aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
            </button>
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible" role="tabpanel">
            {switcher ? (
              <div role="tablist" className="mb-3 inline-flex gap-1 rounded-xl border border-line bg-surface p-1 print:hidden">
                <button role="tab" type="button" aria-selected={tab === "compliance"} className={sw(tab === "compliance")} onClick={() => setTab("compliance")}>
                  {t("wb.inspector.compliance")}
                </button>
                <button role="tab" type="button" aria-selected={tab === "answer"} className={sw(tab === "answer")} onClick={() => setTab("answer")}>
                  {t("wb.ui.answer")}
                </button>
              </div>
            ) : null}
            {tab === "evidence" || tab === "history" ? (
              <button type="button" className="mb-3 text-xs font-semibold text-ink-soft hover:text-ink print:hidden" onClick={() => setTab(hasAnswer ? "answer" : "compliance")}>
                ← {t("wb.ui.back")}
              </button>
            ) : null}

            {tab === "answer" && showGuide && guideTurn ? (
              <div className="space-y-3">
                <p className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-sm text-white" lang={/[ऀ-ॿ]/.test(guideTurn.q) ? "hi" : undefined}>
                  {guideTurn.q}
                </p>
                <GuideAnswer topic={guideTurn.topic} lang={/[ऀ-ॿ]/.test(guideTurn.q) || uiHi ? "hi" : "en"} id={`guide-wb-${guideTurn.after}`} onAsk={(q) => send(q)} hideActionTo="/workbench" />
              </div>
            ) : null}

            {tab === "answer" && !showGuide && hasAnswer && curTurn ? (
              <div id={`turn-${curTurn.id}`} className="space-y-3">
                <p className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-sm text-white" lang={/[ऀ-ॿ]/.test(curTurn.question) ? "hi" : undefined}>
                  {curTurn.question}
                </p>
                {curTurn.noteKey ? <InfoBox tone="info">{t(curTurn.noteKey)}</InfoBox> : null}
                {!curTurn.response && !curTurn.error ? (
                  <div className="glass rounded-2xl p-4">
                    <LoadingSkeleton lines={3} label={t("ask.searching")} />
                  </div>
                ) : null}
                {curTurn.error ? <ErrorState error={curTurn.error} /> : null}
                {curTurn.response ? (
                  <AnswerBubble turnId={curTurn.id} response={curTurn.response} selected={shownTurn?.id === curTurn.id} onInspect={() => pick(curTurn.id)} onGoToField={goToField} onReport={() => openFeedback({ category: "incorrect_answer" })} />
                ) : null}
              </div>
            ) : null}

            {tab === "compliance" || (tab === "answer" && !hasAnswer) ? (
              evalMut.isPending ? (
                <LoadingSkeleton lines={5} label={t("wb.evaluating")} />
              ) : report ? (
                <CompliancePanel report={report} stale={stale} onGoToField={goToField} target={targetLabel} metrics={evaluated!.metrics} />
              ) : (
                <div className="flex min-h-[18rem] flex-col items-center justify-center text-center">
                  <span aria-hidden="true" className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-ink-soft">
                    <FileText className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{t("wb.ui.noAssessTitle")}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-base text-ink-soft">{t("wb.ui.noAssessBody")}</p>
                  <p className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-verified" />
                    {t("header.location")} · {t("wb.ui.engineReady")}
                  </p>
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
                        <button type="button" onClick={() => showHistory(turn.id)} className="flex min-h-tap w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:border-line-strong">
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

          <div className="shrink-0 space-y-2.5 border-t border-line bg-[var(--top-bg)] p-3 print:hidden">
            {!hasAnswer && !hasResult ? <p className="px-1 text-sm leading-snug text-ink-soft">{t("wb.ui.explainFirst")}</p> : !conv.explainAvailable ? <p className="px-1 text-sm leading-snug text-ink-soft">{t("wb.ui.explainOff")}</p> : null}
            <div className="flex items-center gap-2">
              <button type="button" disabled={!canExplain} onClick={explain} title={t("wb.ui.explainReady")} className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-white px-4 text-sm font-bold text-[#10131c] transition-colors hover:bg-white/90 disabled:bg-surface-sunken disabled:text-ink-soft">
                {t("wb.ui.explain")}
              </button>
              {hasResult ? (
                <button type="button" onClick={() => window.print()} aria-label={t("wb.ui.print")} title={t("wb.ui.print")} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-surface-sunken">
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden 2xl:inline">{t("wb.ui.print")}</span>
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {confirmReset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden" onClick={() => setConfirmReset(false)}>
          <div role="alertdialog" aria-modal="true" aria-label={t("wb.reset")} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-ink">{t("wb.resetConfirm")}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setConfirmReset(false)}>
                {t("wb.resetNo")}
              </button>
              <button type="button" className={`${btn} !border-danger !bg-danger !text-white`} onClick={reset}>
                {t("wb.resetYes")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
