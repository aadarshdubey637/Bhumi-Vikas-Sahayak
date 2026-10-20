import * as Dialog from "@radix-ui/react-dialog";
import { Box, ChevronLeft, ChevronRight, ClipboardList, MessageSquareText, Scale, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { updateMe } from "@/api/endpoints/auth";
import { useAccount } from "@/auth/useAccount";
import { guestOnboardingSeen, markGuestOnboardingSeen, onOpenOnboarding } from "@/lib/onboarding";

const STEPS = [
  { id: "ask", icon: MessageSquareText },
  { id: "inputs", icon: ClipboardList },
  { id: "visual", icon: Box },
  { id: "check", icon: Scale },
] as const;

/** First-time walkthrough: four steps, skippable at any time, reopenable. Mounted once in the app shell. */
export function OnboardingHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, user, setUser } = useAccount();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const autoShown = useRef(false);

  useEffect(() => onOpenOnboarding(() => { setStep(0); setOpen(true); }), []);
  useEffect(() => {
    if (autoShown.current || status === "loading") return;
    const unseen = status === "user" ? !user?.onboarding_done : !guestOnboardingSeen();
    if (unseen) {
      autoShown.current = true;
      setStep(0);
      setOpen(true);
    }
  }, [status, user?.onboarding_done]);

  const finish = useCallback(
    (goToWorkbench: boolean) => {
      setOpen(false);
      if (status === "user") void updateMe({ onboarding_done: true }).then(setUser).catch(() => undefined);
      else markGuestOnboardingSeen();
      if (goToWorkbench) navigate("/workbench");
    },
    [status, setUser, navigate],
  );

  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : finish(false))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy-night motion-safe:animate-fade-in" />
        <Dialog.Content className="theme-dark fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/15 bg-[#0D1829] p-6 text-ink shadow-panel motion-safe:animate-fade-up sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{t("onb.kicker", { n: step + 1, total: STEPS.length })}</p>
            <Dialog.Close aria-label={t("onb.close")} className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
              <X aria-hidden="true" className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <span aria-hidden="true" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-navy-night shadow-[0_8px_24px_rgba(245,179,1,0.3)]">
              <s.icon className="h-7 w-7" />
            </span>
            <Dialog.Title className="text-2xl font-semibold leading-tight text-white">{t(`onb.${s.id}.title`)}</Dialog.Title>
          </div>
          <Dialog.Description className="mt-4 text-[0.9375rem] leading-relaxed text-white/80">
            {t(`onb.${s.id}.body`)}
          </Dialog.Description>
          <p className="mt-3 rounded-xl border border-white/10 bg-white/6 px-3.5 py-2.5 text-sm text-white/75">{t(`onb.${s.id}.tip`)}</p>
          <div className="mt-6 flex items-center justify-center gap-2" role="group" aria-label={t("onb.progress")}>
            {STEPS.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setStep(i)} aria-label={t("onb.goto", { n: i + 1 })} aria-current={i === step ? "step" : undefined} className="inline-flex min-h-tap min-w-tap items-center justify-center">
                <span className={`h-2 rounded-full transition-all ${i === step ? "w-7 bg-accent" : "w-2 bg-white/30"}`} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => finish(false)} className="inline-flex min-h-tap items-center rounded-lg px-3 text-sm font-semibold text-white/70 hover:text-white">
              {t("onb.skip")}
            </button>
            <div className="flex gap-2">
              {step > 0 ? (
                <button type="button" onClick={() => setStep(step - 1)} className="inline-flex min-h-tap items-center gap-1 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10">
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  {t("onb.back")}
                </button>
              ) : null}
              {last ? (
                <button type="button" onClick={() => finish(true)} className="inline-flex min-h-tap items-center gap-1 rounded-xl bg-accent px-5 text-sm font-bold text-navy-night hover:bg-[#ffc21f]">
                  {t("onb.done")}
                </button>
              ) : (
                <button type="button" onClick={() => setStep(step + 1)} className="inline-flex min-h-tap items-center gap-1 rounded-xl bg-accent px-5 text-sm font-bold text-navy-night hover:bg-[#ffc21f]">
                  {t("onb.next")}
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-white/50">{t("onb.revisit")}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
