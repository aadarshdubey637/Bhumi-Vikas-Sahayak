import { useMutation, useQuery } from "@tanstack/react-query";
import { Mic, Phone, PhoneCall, PhoneOff, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  checkConnections,
  demoCall,
  demoWhatsApp,
  getChannelStatus,
  runSelfTest,
  type DemoCall,
} from "@/api/endpoints/channels";
import { CopyButton } from "@/components/common/CopyButton";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoBox, LoadingSkeleton } from "@/components/common/States";
import { CHANNEL_TONE, channelState } from "@/lib/channelStatus";
import { btn, card } from "@/lib/ui";

const newSession = () => "demo-" + Math.random().toString(36).slice(2, 12);
const SIM_LABEL = "SIMULATION: no real WhatsApp message or phone call is involved. Answers come from the real rule-answering backend.";
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** WhatsApp-style text: *bold* becomes bold. Everything else is rendered as plain text (React escapes it). */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*[^*\n]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function KeyValues({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <section className="rounded-xl border border-line bg-white/70 p-4">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="break-all font-mono text-xs">{show(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface Credential {
  name: string;
  env: string;
  present: boolean;
  required: boolean;
  purpose: string;
}

function ChannelCard({
  icon: Icon,
  accent,
  title,
  blurb,
  info,
  langs,
  urlLabel,
  url,
  extra,
}: {
  icon: typeof MessageCircle;
  accent: string;
  title: string;
  blurb: string;
  info: Record<string, unknown>;
  langs: string[];
  urlLabel: string;
  url?: string;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const state = channelState(info);
  const creds = (Array.isArray(info.credentials) ? info.credentials : []) as Credential[];
  const missing = creds.filter((c) => c.required && !c.present);
  return (
    <section className={card} aria-label={title}>
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            {title}
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CHANNEL_TONE[state]}`}>{t(`home.chan.${state}`)}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
        </div>
      </header>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-ink-soft">{t("channels.languages")}</span>
        {langs.map((l) => (
          <span key={l} className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand-dark">
            {l}
          </span>
        ))}
      </p>
      {extra}
      {missing.length > 0 ? (
        <div className="mt-4 rounded-xl border border-pending-line bg-pending-tint p-3 text-sm">
          <p className="font-semibold">{t("channels.setupNeeded")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {missing.map((c) => (
              <li key={c.env}>
                {c.name} — <span className="font-mono text-xs">{c.env}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">{t("channels.setupWhere")}</p>
        </div>
      ) : null}
      {url ? (
        <div className="mt-3 text-xs">
          <p className="font-semibold text-ink-soft">{urlLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-surface-sunken px-2 py-1">{url}</code>
            <CopyButton text={url} label={t("common.copy")} compact />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** A phone-shaped WhatsApp conversation. Messages go to the real answer pipeline through the demo endpoint; no WhatsApp is involved. */
function WhatsAppDemo() {
  const { t } = useTranslation();
  const session = useRef(newSession());
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ from: "user" | "bot"; text: string }[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const m = useMutation({
    mutationFn: (msg: string) => demoWhatsApp({ session_id: session.current, kind: "text", text: msg }),
    onSuccess: (r, msg) => setLog((l) => [...l, { from: "user", text: msg }, ...r.messages.map((x) => ({ from: "bot" as const, text: x }))]),
  });
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.length]);
  return (
    <section aria-labelledby="wa-demo" className="mx-auto w-full max-w-md">
      <h2 id="wa-demo" className="sr-only">
        {t("channels.waDemo")}
      </h2>
      <p className="mb-2 text-center text-xs font-semibold text-pending">{SIM_LABEL}</p>
      <div className="overflow-hidden rounded-[2rem] border-[10px] border-navy bg-[#ECE5DD] shadow-pop">
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{t("chanx.waHeader")}</p>
            <p className="text-[0.6875rem] text-white/80">{t("chanx.waSub")}</p>
          </div>
        </div>
        <div className="h-[26rem] space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">
          {log.length === 0 ? (
            <p className="mx-auto mt-6 max-w-[16rem] rounded-xl bg-white/80 p-3 text-center text-xs text-ink-soft">{t("channels.waEmpty")}</p>
          ) : null}
          {log.map((x, i) => (
            <p
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 shadow-sm ${
                x.from === "user" ? "ml-auto rounded-tr-sm bg-[#DCF8C6]" : "mr-auto rounded-tl-sm bg-white"
              }`}
            >
              <WaText text={x.text} />
            </p>
          ))}
          {m.isPending ? <p className="mr-auto w-16 rounded-2xl bg-white px-3 py-2 text-center text-ink-faint">…</p> : null}
          <div ref={end} />
        </div>
        <form
          className="flex items-center gap-2 bg-[#F0F0F0] p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !m.isPending) m.mutate(text.trim());
            setText("");
          }}
        >
          <label className="sr-only" htmlFor="wa-input">
            {t("channels.message")}
          </label>
          <input
            id="wa-input"
            className="min-h-tap min-w-0 flex-1 rounded-full border-0 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#128C4A]"
            placeholder={t("chanx.typeMessage")}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            aria-label={t("channels.send")}
            disabled={m.isPending}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#128C4A] text-white disabled:opacity-50"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
      </div>
      {m.isError ? <div className="mt-2"><ErrorState error={m.error} /></div> : null}
    </section>
  );
}

/** A call screen. Each turn goes through the real dialogue logic via the demo endpoint; no telephony, audio or recording is involved. */
function CallDemo() {
  const { t } = useTranslation();
  const session = useRef(newSession());
  const [speech, setSpeech] = useState("");
  const [state, setState] = useState<{ n: number; miss: number; lang: "hi-IN" | "en-IN"; ev: string[] }>({ n: 0, miss: 0, lang: "hi-IN", ev: [] });
  const [log, setLog] = useState<{ from: "caller" | "line"; text: string }[]>([]);
  const [phase, setPhase] = useState<"idle" | "live" | "ended">("idle");
  const end = useRef<HTMLDivElement>(null);
  const m = useMutation({
    mutationFn: (p: Parameters<typeof demoCall>[0]) => demoCall(p),
    onSuccess: (r: DemoCall, p) => {
      const caller = p.event === "speech" ? p.speech : p.event === "digit" ? `[${p.digits}]` : p.event === "silence" ? "[…]" : null;
      setLog((l) => [...l, ...(caller ? [{ from: "caller" as const, text: caller }] : []), ...r.say.map((s) => ({ from: "line" as const, text: s.text }))]);
      setState({ n: r.next_n, miss: r.misses, lang: r.lang === "en-IN" ? "en-IN" : "hi-IN", ev: r.evidence_ids });
      setPhase(r.hangup ? "ended" : "live");
    },
  });
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.length]);
  const live = phase === "live";
  const send = (event: "speech" | "silence" | "digit", extra: { speech?: string; digits?: string } = {}) =>
    m.mutate({ session_id: session.current, event, n: state.n, miss: state.miss, lang: state.lang, evidence_ids: state.ev, ...extra });
  return (
    <section aria-labelledby="call-demo" className="mx-auto w-full max-w-md">
      <h2 id="call-demo" className="sr-only">
        {t("channels.callDemo")}
      </h2>
      <p className="mb-2 text-center text-xs font-semibold text-pending">{SIM_LABEL}</p>
      <div className="overflow-hidden rounded-[2rem] border-[10px] border-navy bg-gradient-to-b from-navy-800 to-navy text-white shadow-pop">
        <div className="px-5 pb-3 pt-5 text-center">
          <span aria-hidden="true" className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full ${live ? "bg-[#128C4A] motion-safe:animate-pulse" : "bg-white/15"}`}>
            <PhoneCall className="h-6 w-6" />
          </span>
          <p className="mt-2 text-base font-semibold">{t("chanx.callHeader")}</p>
          <p className="text-xs text-white/70" role="status">
            {phase === "idle" ? t("chanx.callIdle") : live ? t("chanx.callLive") : t("chanx.callEnded")}
          </p>
        </div>
        <div className="mx-3 h-60 space-y-2 overflow-y-auto rounded-2xl bg-white/10 p-3 text-sm" aria-live="polite">
          {log.length === 0 ? <p className="mt-8 text-center text-xs text-white/70">{t("channels.callEmpty")}</p> : null}
          {log.map((x, i) => (
            <p key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 ${x.from === "caller" ? "ml-auto bg-[#2B5BEA]" : "mr-auto bg-white/15"}`}>
              {x.text}
            </p>
          ))}
          <div ref={end} />
        </div>
        <div className="p-3">
          <div className="grid grid-cols-4 gap-2">
            <button
              className="col-span-1 inline-flex min-h-tap items-center justify-center gap-1 rounded-xl bg-[#128C4A] px-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={m.isPending}
              onClick={() => {
                session.current = newSession();
                setLog([]);
                m.mutate({ session_id: session.current, event: "start", n: 0, miss: 0, lang: "hi-IN" });
              }}
            >
              <Phone aria-hidden="true" className="h-4 w-4" />
              {t("channels.startCall")}
            </button>
            {["1", "2", "3"].map((d) => (
              <button
                key={d}
                className="inline-flex min-h-tap items-center justify-center rounded-xl bg-white/15 px-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={!live || m.isPending}
                onClick={() => send("digit", { digits: d })}
                aria-label={`${t("channels.press")} ${d}`}
              >
                {d}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (speech.trim()) send("speech", { speech: speech.trim() });
              setSpeech("");
            }}
          >
            <label className="sr-only" htmlFor="call-input">
              {t("channels.speak")}
            </label>
            <input
              id="call-input"
              className="min-h-tap min-w-0 flex-1 rounded-xl border-0 bg-white px-3 text-sm text-ink placeholder:text-ink-faint disabled:opacity-60"
              placeholder={t("chanx.typeSpeech")}
              value={speech}
              maxLength={1000}
              disabled={!live}
              onChange={(e) => setSpeech(e.target.value)}
            />
            <button className="inline-flex min-h-tap items-center gap-1 rounded-xl bg-[#2B5BEA] px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!live || m.isPending}>
              <Mic aria-hidden="true" className="h-4 w-4" />
              {t("channels.say")}
            </button>
            <button
              type="button"
              aria-label={t("channels.silence")}
              title={t("channels.silence")}
              className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl bg-white/15 text-white disabled:opacity-40"
              disabled={!live || m.isPending}
              onClick={() => send("silence")}
            >
              <PhoneOff aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      {m.isError ? <div className="mt-2"><ErrorState error={m.error} /></div> : null}
    </section>
  );
}

type Tab = "status" | "whatsapp" | "call" | "setup";

export default function Channels() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("status");
  const q = useQuery({ queryKey: ["channel-status"], queryFn: ({ signal }) => getChannelStatus(signal) });
  const checks = useMutation({ mutationFn: checkConnections });
  const self = useMutation({ mutationFn: runSelfTest });
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "status", label: t("chanx.tabStatus") },
    { id: "whatsapp", label: t("chanx.tabWhatsapp") },
    { id: "call", label: t("chanx.tabCall") },
    { id: "setup", label: t("chanx.tabSetup") },
  ];
  const demoOn = q.data?.demo_enabled;
  const webhook = typeof q.data?.whatsapp.webhook_url === "string" ? q.data.whatsapp.webhook_url : undefined;
  const incoming = typeof q.data?.voice.incoming_url === "string" ? q.data.voice.incoming_url : undefined;

  return (
    <>
      <PageHeader title={t("nav.channels")} description={t("chanx.description")} icon={Phone} />
      <InfoBox tone="pending">{t("channels.notice")}</InfoBox>

      <div role="tablist" aria-label={t("nav.channels")} className="glass mt-4 inline-flex max-w-full flex-wrap gap-1 rounded-2xl p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`panel-${x.id}`}
            onClick={() => setTab(x.id)}
            className={`min-h-tap rounded-xl px-4 text-sm font-semibold transition-colors ${
              tab === x.id ? "bg-brand text-white shadow-glow" : "text-ink-soft hover:bg-white/80"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
        {q.isPending ? <LoadingSkeleton lines={4} /> : null}
        {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}

        {q.data && tab === "status" ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChannelCard
                icon={MessageCircle}
                accent="bg-[#128C4A]"
                title={t("home.waTitle")}
                blurb={t("home.waBody")}
                info={q.data.whatsapp}
                langs={["English", "हिन्दी", "Hinglish"]}
                urlLabel={t("channels.webhookUrl")}
                url={webhook}
                extra={
                  <p className="mt-2 text-xs text-ink-soft">
                    {t("channels.voiceNotes")}: {q.data.whatsapp.voice_notes ? t("common.yes") : t("common.no")}
                  </p>
                }
              />
              <ChannelCard
                icon={PhoneCall}
                accent="bg-navy"
                title={t("home.voiceTitle")}
                blurb={t("home.voiceBody")}
                info={q.data.voice}
                langs={["हिन्दी (hi-IN)", "English (en-IN)"]}
                urlLabel={t("channels.callUrl")}
                url={incoming}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btn} disabled={self.isPending} onClick={() => self.mutate()}>
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                {t("channels.selftest")}
              </button>
              <button className={btn} disabled={checks.isPending} onClick={() => checks.mutate()}>
                {t("channels.check")}
              </button>
            </div>
            {self.data ? (
              <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
                {self.data.checks.map((c) => (
                  <li key={c.name}>
                    <span className={c.ok ? "font-semibold text-verified" : "font-semibold text-danger"}>{c.ok ? "PASS" : "FAIL"}</span> — {c.name}
                    {c.note ? ` (${c.note})` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {self.isError ? <ErrorState error={self.error} /> : null}
            {checks.data ? (
              <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
                {checks.data.results.map((r) => (
                  <li key={r.provider}>
                    {r.label}: {r.outcome === "not_configured" ? t("chanx.notCalled") : r.outcome}
                    {r.error_code ? ` (${r.error_code})` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {checks.isError ? <ErrorState error={checks.error} /> : null}
            <details className="glass mt-4 rounded-2xl p-3">
              <summary className="min-h-tap cursor-pointer py-2 text-sm font-semibold text-ink-soft">{t("channels.technical")}</summary>
              <div className="mt-2 grid gap-4 md:grid-cols-3">
                <KeyValues title="WhatsApp" data={Object.fromEntries(Object.entries(q.data.whatsapp).filter(([k]) => k !== "credentials"))} />
                <KeyValues title="Phone (Twilio)" data={Object.fromEntries(Object.entries(q.data.voice).filter(([k]) => k !== "credentials"))} />
                <KeyValues title="Voice-note transcription" data={q.data.stt} />
              </div>
            </details>
          </>
        ) : null}

        {q.data && tab === "whatsapp" ? (demoOn ? <WhatsAppDemo /> : <InfoBox tone="muted">{t("channels.demoOff")}</InfoBox>) : null}
        {q.data && tab === "call" ? (demoOn ? <CallDemo /> : <InfoBox tone="muted">{t("channels.demoOff")}</InfoBox>) : null}

        {q.data && tab === "setup" ? (
          <ol className={`${card} space-y-4`}>
            {(["step1", "step2", "step3", "step4", "step5"] as const).map((k, i) => (
              <li key={k} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{t(`chanx.setup.${k}Title`)}</p>
                  <p className="mt-0.5 text-ink-soft">{t(`chanx.setup.${k}Body`)}</p>
                  {k === "step2" && webhook ? <code className="mt-1 block break-all rounded-lg bg-surface-sunken px-2 py-1 text-xs">{webhook}</code> : null}
                  {k === "step3" && incoming ? <code className="mt-1 block break-all rounded-lg bg-surface-sunken px-2 py-1 text-xs">{incoming}</code> : null}
                </div>
              </li>
            ))}
            <li className="rounded-xl border border-pending-line bg-pending-tint p-3 text-sm">{t("chanx.setup.note")}</li>
          </ol>
        ) : null}
      </div>
    </>
  );
}
