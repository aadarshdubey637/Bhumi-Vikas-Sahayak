import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/api/endpoints/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { authButton, FormAlert, PasswordField } from "@/components/auth/fields";
import { mapAuthError, MIN_PASSWORD, passwordProblemKey, passwordProblems } from "@/lib/authForm";

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | undefined>();
  const m = useMutation({
    mutationFn: () => resetPassword({ token, password }),
    onSuccess: () => navigate("/login", { replace: true, state: { reset: true } }),
    onError: (e) => {
      const r = mapAuthError(e, ["password", "token"]);
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const pp = passwordProblems(password);
    if (!password) errs.password = "auth.err.required";
    else if (pp.length) errs.password = passwordProblemKey(pp[0]!);
    else if (confirm !== password) errs.confirm = "auth.err.mismatch";
    setErrors(errs);
    setGeneral(undefined);
    if (Object.keys(errs).length === 0) m.mutate();
  };
  const linkProblem = !token || errors.token;

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      subtitle={linkProblem ? undefined : t("auth.reset.subtitle")}
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          {t("auth.forgot.back")}
        </Link>
      }
    >
      {linkProblem ? (
        <div className="space-y-4">
          <FormAlert tone="error">{t("auth.err.resetInvalid")}</FormAlert>
          <Link to="/forgot-password" className={`${authButton} no-underline`}>
            {t("auth.reset.requestNew")}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {general ? <FormAlert tone="error">{t(general)}</FormAlert> : null}
          <PasswordField id="rp-password" label={t("auth.reset.newPassword")} autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} showStrength hint={t("auth.field.passwordHint", { n: MIN_PASSWORD })} />
          <PasswordField id="rp-confirm" label={t("auth.field.confirm")} autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirm} />
          <button type="submit" className={authButton} disabled={m.isPending}>
            {m.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {m.isPending ? t("auth.reset.loading") : t("auth.reset.submit")}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
