import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { passwordStrength } from "@/lib/authForm";

/** Dark glass inputs used across the sign-in flow. */
export const authInput =
  "min-h-tap w-full rounded-xl border border-white/15 bg-white/8 px-3.5 py-2.5 text-[0.9375rem] text-white placeholder:text-white/40 transition-[border-color,box-shadow,background-color] hover:border-white/30 focus:border-accent focus:bg-white/12 focus:outline-none focus:ring-4 focus:ring-accent/20 aria-[invalid=true]:border-[#ff8a8a]";
export const authButton =
  "inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[0.9375rem] font-bold text-navy-night shadow-[0_8px_24px_rgba(245,179,1,0.3)] transition-[background-color,transform] hover:bg-[#ffc21f] disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-[0.98]";

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; id: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-white/90">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-[#ffb4b4]">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(error, { defaultValue: error })}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-white/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ id, label, error, hint, ...rest }: { id: string; label: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <input id={id} className={authInput} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} {...rest} />
    </Field>
  );
}

const BAR = ["bg-white/15", "bg-[#ff8a8a]", "bg-[#f5b301]", "bg-[#8fd3a9]", "bg-[#4ade80]"];

export function PasswordField({ id, label, error, value, onChange, autoComplete, showStrength = false, hint, onBlur }: { id: string; label: string; error?: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; showStrength?: boolean; hint?: ReactNode; onBlur?: () => void }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const live = useId();
  const score = passwordStrength(value);
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`${authInput} pr-12`}
          aria-invalid={!!error}
          aria-describedby={[error ? `${id}-err` : hint ? `${id}-hint` : "", showStrength ? live : ""].filter(Boolean).join(" ") || undefined}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={shown}
          className="absolute right-1.5 top-1/2 inline-flex min-h-tap min-w-tap -translate-y-1/2 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          {shown ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
      {showStrength && value ? (
        <div id={live} className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? BAR[score] : "bg-white/15"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-white/70">{t(`auth.strength.${score}`)}</p>
        </div>
      ) : null}
    </Field>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const style = {
    error: "border-[#ff8a8a]/50 bg-[#ff8a8a]/10 text-[#ffd0d0]",
    success: "border-[#4ade80]/50 bg-[#4ade80]/10 text-[#c9f7d9]",
    info: "border-white/20 bg-white/8 text-white/85",
  }[tone];
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${style}`}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
