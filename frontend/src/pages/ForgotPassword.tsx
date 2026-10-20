import { useMutation } from "@tanstack/react-query";
import { Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { forgotPassword } from "@/api/endpoints/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { authButton, FormAlert, TextField } from "@/components/auth/fields";
import { emailProblem, mapAuthError } from "@/lib/authForm";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | undefined>();
  const m = useMutation({
    mutationFn: () => forgotPassword({ email: email.trim() }),
    onError: (e) => {
      const r = mapAuthError(e, ["email"]);
      setError(r.fields.email);
      setGeneral(r.general);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = emailProblem(email);
    setError(p);
    setGeneral(undefined);
    if (!p) m.mutate();
  };
  const delivery = m.data?.email_delivery;

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={m.isSuccess ? undefined : t("auth.forgot.subtitle")}
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          {t("auth.forgot.back")}
        </Link>
      }
    >
      {m.isSuccess ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-navy-night">
              <MailCheck className="h-5 w-5" />
            </span>
            <p className="text-sm text-white/85">{t("auth.forgot.sent", { email: email.trim() })}</p>
          </div>
          {delivery === "none" ? <FormAlert tone="error">{t("auth.forgot.noEmail")}</FormAlert> : null}
          {delivery === "console" ? <FormAlert tone="info">{t("auth.forgot.consoleNote")}</FormAlert> : null}
          {delivery === "smtp" ? <FormAlert tone="info">{t("auth.forgot.smtpNote")}</FormAlert> : null}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {general ? <FormAlert tone="error">{t(general)}</FormAlert> : null}
          <TextField id="fp-email" label={t("auth.field.email")} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="you@example.com" />
          <button type="submit" className={authButton} disabled={m.isPending}>
            {m.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {m.isPending ? t("auth.forgot.loading") : t("auth.forgot.submit")}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
