import { ArrowRight, ArrowUp, BookOpen, Building2, Calculator, CircleHelp, Languages, Ruler, Scale, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { questionSchema } from "@/api/schemas";
import { useAccount } from "@/auth/useAccount";
import { LogoMark } from "@/components/brand/Logo";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/States";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerContext";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { AnswerBubble, type Provided } from "@/components/workbench/AnswerBubble";
import { SpeakButton } from "@/components/workbench/SpeakButton";
import { VoiceInputButton } from "@/components/workbench/VoiceInputButton";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { stopSpeech } from "@/hooks/useSpeechOutput";
import { chatDataKey, chatDetailsKey, chatGuideKey, chatStore } from "@/lib/chatStore";
import { displayStore } from "@/lib/display";
import type { InputMap } from "@/api/types";
import { GUIDE, guideById, matchGuide, type GuideTopic } from "@/lib/guide";

const DEVANAGARI = /[ऀ-ॿ]/;

interface GuideItem {
  key: string;
  q: string;
  topic: string;
  /** number of rule answers that came before this one, to keep the order when the thread is redrawn */
  after: number;
}

function loadGuide(id: string): GuideItem[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(chatGuideKey(id)) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((g): g is GuideItem => !!g && typeof (g as GuideItem).topic === "string" && !!guideById((g as GuideItem).topic)).slice(-20) : [];
  } catch {
    return [];
  }
}

/** What the assistant remembers about the user's plot in this chat; sent with every question so they never have to repeat it. */
const DETAIL_NAMES = ["plot_area", "plot_length", "plot_width", "road_width", "building_height", "built_up_area", "floors"] as const;
type Details = Record<string, { value: string; unit: string }>;
function loadDetails(id: string): Details {
  try {
    const v = JSON.parse(window.localStorage.getItem(chatDetailsKey(id)) ?? "{}") as Details;
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => (DETAIL_NAMES as readonly string[]).includes(k) && typeof x?.value === "string" && typeof x?.unit === "string"));
  } catch {
    return {};
  }
}

type Chip = { key: string; icon: LucideIcon; tone: string; question?: string; to?: string };
const CHIPS: Chip[] = [
  { key: "c1", icon: Scale, tone: "text-brand", question: "as.q3" },
  { key: "c2", icon: Ruler, tone: "text-brand", to: "/workbench" },
  { key: "c3", icon: Calculator, tone: "text-brand", question: "as.qFar" },
  { key: "c4", icon: Building2, tone: "text-brand", question: "as.q4" },
  { key: "c5", icon: CircleHelp, tone: "text-brand", question: "as.q1" },
  { key: "c6", icon: Languages, tone: "text-brand", question: "wb.ex4" },
];

function GuideAnswer({ topic, lang, id, onAsk }: { topic: GuideTopic; lang: "en" | "hi"; id: string; onAsk: (q: string) => void }) {
  const { i18n } = useTranslation();
  const tr = (k: string, p?: Record<string, string | number>) => i18n.t(k, { ...p, lng: lang }) as string;
  const steps = Array.from({ length: topic.steps }, (_, i) => tr(`guide.${topic.id}.s${i + 1}`));
  const speech = [tr(`guide.${topic.id}.title`), tr(`guide.${topic.id}.body`), ...steps].join("\n");
  return (
    <article lang={lang} aria-label={tr("as.guideLabel")} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent-text">
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
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
      {topic.actions.length ? (
        <div className="flex flex-wrap gap-2">
          {topic.actions.map((a) => (
            <Link key={a.to} to={a.to} className="inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/10 px-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent/20">
              {tr("as.open", { page: tr(a.label) })}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
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

/**
 * The assistant. Product questions ("how do I use the 3D workbench?", "can I speak in Hindi?") are answered from the in-app guide; everything
 * else goes to the rules backend, whose answers carry rule numbers and pages. When the rules do not say, it says so instead of guessing.
 * Each chat is saved on this device so it appears under "Recent chats".
 */
export function AssistantChat({ chatId }: { chatId: string }) {
  const { t, i18n } = useTranslation();
  const display = useSyncExternalStore(displayStore.subscribe, displayStore.getSnapshot);
  const navigate = useNavigate();
  const { user } = useAccount();
  const { open } = useEvidenceDrawer();
  const { openFeedback } = useFeedbackDialog();
  const conv = useAskConversation(chatDataKey(chatId), "local");
  const [guide, setGuide] = useState<GuideItem[]>(() => loadGuide(chatId));
  const [details, setDetails] = useState<Details>(() => loadDetails(chatId));
  const [text, setText] = useState("");
  const [qError, setQError] = useState<string | undefined>();
  const seen = useRef(new Set(conv.turns.map((x) => x.id))); // answers already on screen when the chat opened are shown at once
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const last = conv.turns[conv.turns.length - 1];
  const countdown = useRateLimitCountdown(last?.error);

  useEffect(() => {
    try {
      window.localStorage.setItem(chatDetailsKey(chatId), JSON.stringify(details));
    } catch {
      /* not remembered */
    }
  }, [details, chatId]);
  // anything the user states in a question ("plot 30 x 40 ft, road 9 m") is remembered for the next one
  const latest = conv.turns[conv.turns.length - 1]?.response;
  useEffect(() => {
    if (!latest) return;
    const found: Details = {};
    for (const f of latest.extracted_facts) {
      if (f.source === "user_provided" && f.validation_status === "valid" && (DETAIL_NAMES as readonly string[]).includes(f.name)) found[f.name] = { value: f.value, unit: f.unit ?? "count" };
    }
    if (Object.keys(found).length) setDetails((d) => ({ ...d, ...found }));
  }, [latest]);
  useEffect(() => () => stopSpeech(), []); // switching chats must not keep reading the old answer
  useEffect(() => {
    try {
      window.localStorage.setItem(chatGuideKey(chatId), JSON.stringify(guide));
    } catch {
      /* not remembered */
    }
  }, [guide, chatId]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [conv.turns.length, guide.length, conv.pending]);

  const send = useCallback(
    (question: string) => {
      const q = questionSchema.safeParse(question);
      if (!q.success) return setQError(q.error.issues[0]?.message);
      setQError(undefined);
      setText("");
      chatStore.upsert(chatId, question);
      const topic = matchGuide(question);
      if (topic) {
        setGuide((g) => [...g, { key: `${Date.now()}-${g.length}`, q: question.trim(), topic: topic.id, after: conv.turns.length }].slice(-20));
        return;
      }
      void conv.send({ question, language: DEVANAGARI.test(question) || i18n.language === "hi" ? "hi" : undefined, context: details as InputMap, explain: false });
    },
    [conv, i18n.language, chatId, details],
  );
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (conv.pending || countdown > 0) return;
    send(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  // the user filled in what an answer was waiting for: remember it and ask the same question again with it
  const provide = (question: string, values: Provided) => {
    const merged: Details = { ...details, ...(values as Details) };
    setDetails(merged);
    void conv.send({ question, language: DEVANAGARI.test(question) || i18n.language === "hi" ? "hi" : undefined, context: merged as InputMap, explain: false });
  };
  const asked = useMemo(() => new Set(guide.map((g) => g.topic)), [guide]);
  const moreTopics = GUIDE.filter((g) => !asked.has(g.id)).slice(0, 4);
  const empty = conv.turns.length === 0 && guide.length === 0;
  const langOf = (q: string): "en" | "hi" => (DEVANAGARI.test(q) || i18n.language === "hi" ? "hi" : "en");
  const first = user?.name.split(" ")[0];

  const guideBefore = (k: number) => guide.filter((g) => Math.min(g.after, conv.turns.length) === k);
  const thread: Array<{ k: string; node: React.ReactNode }> = [];
  const pushGuide = (g: GuideItem) =>
    thread.push({
      k: g.key,
      node: (
        <>
          <Bubble q={g.q} />
          <Reply>
            <GuideAnswer topic={guideById(g.topic)!} lang={langOf(g.q)} id={`guide-${chatId}-${g.key}`} onAsk={send} />
          </Reply>
        </>
      ),
    });
  conv.turns.forEach((turn, idx) => {
    guideBefore(idx).forEach(pushGuide);
    thread.push({
      k: `a${turn.id}`,
      node: (
        <>
          <Bubble q={turn.question} />
          {turn.noteKey ? <p className="rounded-xl border border-info-line bg-info-tint p-3 text-sm">{t(turn.noteKey)}</p> : null}
          <Reply>
            {!turn.response && !turn.error ? (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <LoadingSkeleton lines={3} label={t("ask.searching")} />
              </div>
            ) : null}
            {turn.error ? <ErrorState error={turn.error} /> : null}
            {turn.response ? (
              <AnswerBubble
                turnId={turn.id}
                response={turn.response}
                selected={false}
                animate={!seen.current.has(turn.id)}
                onInspect={() => turn.response?.evidence[0] && open(turn.response.evidence[0].evidence_id)}
                onGoToField={() => navigate("/workbench")}
                onProvide={(v) => provide(turn.question, v)}
                onReport={() => openFeedback({ category: "incorrect_answer" })}
              />
            ) : null}
            {turn.response?.status === "not_established" ? <Examples keys={["as.q3", "as.qFar", "as.q4", "as.q1"]} lang={langOf(turn.question)} onAsk={send} label="as.tryInstead" /> : null}
          </Reply>
        </>
      ),
    });
  });
  guideBefore(conv.turns.length).forEach(pushGuide);

  const composer = (
    <form onSubmit={submit} role="search" className="w-full">
      {Object.keys(details).length ? (
        <ul className="mb-2 flex flex-wrap items-center gap-1.5" aria-label={t("plain.d.title")}>
          <li className="text-xs font-semibold text-ink-faint">{t("plain.d.title")}:</li>
          {Object.entries(details).map(([name, d]) => (
            <li key={name} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-sunken py-0.5 pl-3 pr-1 text-xs font-semibold">
              {t(`plain.d.${name}`)} {d.value}
              {d.unit === "count" ? "" : ` ${t(`units.${d.unit}`, { defaultValue: d.unit })}`}
              <button
                type="button"
                aria-label={t("plain.d.remove", { name: t(`plain.d.${name}`) })}
                onClick={() => setDetails((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== name)))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-white/10 hover:text-ink"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setDetails({})} className="min-h-tap px-1 text-xs font-semibold text-ink-faint underline-offset-2 hover:text-ink hover:underline">
              {t("plain.d.clear")}
            </button>
          </li>
        </ul>
      ) : null}
      <div className="rounded-3xl border border-line-strong bg-surface p-3 transition-colors focus-within:border-brand">
        <label htmlFor="as-q" className="sr-only">
          {t("ask.questionLabel")}
        </label>
        <textarea
          id="as-q"
          ref={boxRef}
          rows={empty ? 3 : 2}
          maxLength={1000}
          value={text}
          onKeyDown={onKey}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("as.placeholder")}
          aria-invalid={!!qError}
          className="block w-full resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <LanguageToggle tone={display.theme === "dark" ? "dark" : "light"} />
          <VoiceInputButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
          <span className="ml-auto text-xs text-ink-faint">{countdown > 0 ? t("common.waitSeconds", { seconds: countdown }) : conv.pending ? t("common.sending") : ""}</span>
          <button
            type="submit"
            aria-label={t("ask.send")}
            disabled={conv.pending || countdown > 0 || text.trim() === ""}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow transition-[opacity,transform] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 motion-safe:active:scale-95"
          >
            <ArrowUp aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>
      {qError ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {t(qError)}
        </p>
      ) : null}
      <p className="mt-2 text-center text-xs text-ink-faint">{t("as.privacy")}</p>
    </form>
  );

  if (empty) {
    return (
      <section aria-label={t("as.title")} className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col items-center justify-center gap-7 py-8 text-center">
        <span aria-hidden="true" className="inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-line-strong bg-surface p-1 shadow-card">
          <span className="inline-flex h-full w-full items-center justify-center rounded-full">
            <LogoMark className="h-12 w-12" />
          </span>
        </span>
        <div>
          <h1 id="dash-h1" className="text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-tight">
            {t("as.hero.t1")} <span className="text-brand">{t("as.hero.t2")}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-soft sm:text-base">{first ? t("as.hero.subName", { name: first }) : t("as.hero.sub")}</p>
        </div>
        <ul className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("as.try")}>
          {CHIPS.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => (c.to ? navigate(c.to) : send(t(c.question!)))}
                className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-full border border-line-strong bg-surface/60 px-5 text-left text-[0.9375rem] font-medium transition-colors hover:border-ink-faint hover:bg-surface"
              >
                <c.icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${c.tone}`} />
                <span className="truncate">{t(`as.${c.key}`)}</span>
              </button>
            </li>
          ))}
        </ul>
        {composer}
      </section>
    );
  }

  return (
    <section aria-label={t("as.title")} className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col">
      <h1 className="sr-only">{t("as.title")}</h1>
      <div aria-live="polite" className="flex-1 space-y-5 pb-4 pt-2">
        {thread.map((x) => (
          <div key={x.k} className="space-y-3">
            {x.node}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {moreTopics.length ? (
        <ul className="mb-2 flex flex-wrap items-center gap-1.5" aria-label={t("as.moreTopics")}>
          {moreTopics.map((g) => (
            <li key={g.id}>
              <button type="button" className="min-h-tap rounded-full border border-line-strong bg-surface/60 px-3.5 text-xs font-semibold hover:border-ink-faint hover:bg-surface" onClick={() => send(t(`guide.${g.id}.title`))}>
                {t(`guide.${g.id}.title`)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-1 border-t border-line bg-surface-page px-1 pb-2 pt-3">{composer}</div>
    </section>
  );
}

/** Tappable example questions: so an answer never ends in a dead end. */
function Examples({ keys, lang, onAsk, label = "as.try" }: { keys: string[]; lang: "en" | "hi"; onAsk: (q: string) => void; label?: string }) {
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

function Bubble({ q }: { q: string }) {
  return (
    <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-surface-sunken px-4 py-2.5 text-[0.9375rem] text-ink" lang={DEVANAGARI.test(q) ? "hi" : undefined}>
      {q}
    </p>
  );
}
function Reply({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <LogoMark className="mt-1 h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">{children}</div>
    </div>
  );
}
