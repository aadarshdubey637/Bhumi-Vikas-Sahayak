import { ArrowUp, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { questionSchema } from "@/api/schemas";
import { useAccount } from "@/auth/useAccount";
import { LogoMark } from "@/components/brand/Logo";
import { ErrorState } from "@/components/common/ErrorState";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerContext";
import { useFeedbackDialog } from "@/components/forms/FeedbackDialogContext";
import { AnswerBubble, type Provided } from "@/components/workbench/AnswerBubble";
import { VoiceInputButton } from "@/components/workbench/VoiceInputButton";
import { useAskConversation } from "@/hooks/useAskConversation";
import { useRateLimitCountdown } from "@/hooks/useCountdown";
import { stopSpeech } from "@/hooks/useSpeechOutput";
import { chatDataKey, chatDetailsKey, chatGuideKey, chatStore } from "@/lib/chatStore";
import type { Attachment, InputMap } from "@/api/types";
import { GUIDE, guideById, matchGuide } from "@/lib/guide";
import { Examples, GuideAnswer } from "./GuideAnswer";

const DEVANAGARI = /[ऀ-ॿ]/;

const ATTACH_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 2;
const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

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

type Chip = { key: string; question?: string; to?: string };
const CHIPS: Chip[] = [
  { key: "c1", question: "as.q3" },
  { key: "c2", to: "/workbench" },
  { key: "c3", question: "as.qFar" },
  { key: "c4", question: "as.q4" },
  { key: "c5", question: "as.q1" },
  { key: "c6", question: "wb.ex4" },
];

/**
 * The assistant. Product questions ("how do I use the 3D workbench?", "can I speak in Hindi?") are answered from the in-app guide; everything
 * else goes to the rules backend, whose answers carry rule numbers and pages. When the rules do not say, it says so instead of guessing.
 * Each chat is saved on this device so it appears under "Recent chats".
 */
export function AssistantChat({ chatId }: { chatId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAccount();
  const { open } = useEvidenceDrawer();
  const { openFeedback } = useFeedbackDialog();
  const conv = useAskConversation(chatDataKey(chatId), "local");
  const [guide, setGuide] = useState<GuideItem[]>(() => loadGuide(chatId));
  const [details, setDetails] = useState<Details>(() => loadDetails(chatId));
  const [text, setText] = useState("");
  const [qError, setQError] = useState<string | undefined>();
  const [files, setFiles] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const pickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: Attachment[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES || f.size > MAX_FILE_BYTES || !(ATTACH_MIME as readonly string[]).includes(f.type)) {
        setQError("as.attachInvalid");
        continue;
      }
      next.push({ name: f.name.slice(0, 120), mime: f.type as Attachment["mime"], data: await readBase64(f) });
      setQError(undefined);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = useCallback(
    (question: string, replaceFrom?: number) => {
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
      void conv.send({ question, language: DEVANAGARI.test(question) || i18n.language === "hi" ? "hi" : undefined, context: details as InputMap, explain: true, attachments: files.length ? files : undefined }, replaceFrom);
      setFiles([]);
    },
    [conv, i18n.language, chatId, details, files],
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
    void conv.send({ question, language: DEVANAGARI.test(question) || i18n.language === "hi" ? "hi" : undefined, context: merged as InputMap, explain: true });
  };
  // editing a question you already sent: it and every message after it are replaced by the new question and its answer
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const saveEdit = () => {
    if (!editing || conv.pending || countdown > 0) return;
    const idx = conv.turns.findIndex((x) => x.id === editing.id);
    if (idx < 0 || editing.text.trim() === "") return;
    setGuide((g) => g.filter((x) => x.after <= idx));
    setEditing(null);
    send(editing.text, editing.id);
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
          {editing?.id === turn.id ? (
            <div className="ml-auto w-full max-w-[88%] space-y-2 rounded-3xl bg-surface-sunken p-3">
              <label htmlFor={`edit-${turn.id}`} className="sr-only">
                {t("as.edit")}
              </label>
              <textarea
                id={`edit-${turn.id}`}
                autoFocus
                rows={3}
                maxLength={1000}
                value={editing.text}
                onChange={(e) => setEditing({ id: turn.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(null);
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                className="block w-full resize-none rounded-2xl border border-line-strong bg-surface px-3 py-2 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="min-h-tap rounded-xl px-4 text-sm font-semibold text-ink-soft hover:bg-surface">
                  {t("as.editCancel")}
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={conv.pending || countdown > 0 || editing.text.trim() === ""}
                  className="min-h-tap rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  {t("as.editSave")}
                </button>
              </div>
            </div>
          ) : (
            <Bubble q={turn.question} files={turn.files} onEdit={conv.pending ? undefined : () => setEditing({ id: turn.id, text: turn.question })} editLabel={t("as.edit")} />
          )}
          {turn.noteKey ? <p className="text-sm text-ink-soft">{t(turn.noteKey)}</p> : null}
          <Reply>
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
      <div className="rounded-2xl border border-line-strong bg-surface px-1.5 py-1 shadow-card transition-[border-color] focus-within:border-ink-faint">
        {files.length ? (
          <ul className="flex flex-wrap gap-1.5 px-1.5 pb-1 pt-1" aria-label={t("as.attach")}>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="inline-flex max-w-[14rem] items-center gap-1 rounded-lg bg-surface-sunken py-0.5 pl-2.5 pr-1 text-xs font-semibold">
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`${t("as.attachRemove")}: ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-faint hover:bg-surface hover:text-ink">
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-1">
          <input ref={fileRef} type="file" multiple hidden accept={ATTACH_MIME.join(",")} onChange={(e) => void pickFiles(e.target.files)} data-testid="attach-input" />
          <button
            type="button"
            aria-label={t("as.attach")}
            title={t("as.attach")}
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= MAX_FILES}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus aria-hidden="true" className="h-5 w-5" />
          </button>
          <label htmlFor="as-q" className="sr-only">
            {t("ask.questionLabel")}
          </label>
          <textarea
            id="as-q"
            ref={boxRef}
            rows={1}
            maxLength={1000}
            value={text}
            onKeyDown={onKey}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("as.placeholder")}
            aria-invalid={!!qError}
            className="block max-h-32 min-h-[2.25rem] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm leading-normal text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <VoiceInputButton onText={(v) => setText((cur) => (cur ? `${cur} ${v}` : v).slice(0, 1000))} />
          <button
            type="submit"
            aria-label={t("ask.send")}
            disabled={conv.pending || countdown > 0 || text.trim() === ""}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-[opacity,transform] hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 motion-safe:active:scale-95"
          >
            <ArrowUp aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      {countdown > 0 || conv.pending ? (
        <p className="mt-1 text-right text-xs text-ink-faint">{countdown > 0 ? t("common.waitSeconds", { seconds: countdown }) : t("common.sending")}</p>
      ) : null}
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

function Bubble({ q, files, onEdit, editLabel }: { q: string; files?: string[]; onEdit?: () => void; editLabel?: string }) {
  return (
    <div className="group ml-auto flex w-fit max-w-[88%] flex-col items-end gap-1">
      {files?.length ? <p className="max-w-full truncate text-xs font-semibold text-ink-faint">{files.join(", ")}</p> : null}
      <p className="whitespace-pre-wrap rounded-3xl rounded-br-lg bg-surface-sunken px-4 py-2.5 text-[0.9375rem] text-ink" lang={DEVANAGARI.test(q) ? "hi" : undefined}>
        {q}
      </p>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="min-h-tap px-2 text-xs font-semibold text-ink-faint hover:text-ink hover:underline focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          {editLabel}
        </button>
      ) : null}
    </div>
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
