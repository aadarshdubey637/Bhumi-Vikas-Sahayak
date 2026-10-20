import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { login } from "@/api/endpoints/auth";
import { rearmUnauthorized } from "@/api/client";
import { useAccount } from "@/auth/useAccount";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { authButton, FormAlert, PasswordField, TextField } from "@/components/auth/fields";
import { emailProblem, mapAuthError, safeNext } from "@/lib/authForm";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, setUser, config } = useAccount();
  const state = (location.state ?? {}) as { from?: string; expired?: boolean; reset?: boolean; registered?: boolean };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | undefined>();

  const m = useMutation({
    mutationFn: () => login({ email: email.trim(), password }),
    onSuccess: (u) => {
      rearmUnauthorized();
      setUser(u);
      navigate(safeNext(state.from), { replace: true });
    },
    onError: (e) => {
      const r = mapAuthError(e, ["email", "password"]);
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });

  if (status === "user") return <Navigate to={safeNext(state.from)} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const ep = emailProblem(email);
    if (ep) errs.email = ep;
    if (!password) errs.password = "auth.err.required";
    setErrors(errs);
    setGeneral(undefined);
    if (Object.keys(errs).length === 0) m.mutate();
  };

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <>
          {config?.registration_open === false ? null : (
            <p>
              {t("auth.login.noAccount")}{" "}
              <Link to="/signup" state={{ from: state.from }} className="font-semibold text-accent hover:underline">
                {t("auth.login.createLink")}
              </Link>
            </p>
          )}
          <p className="mt-2">
            <Link to="/workbench" className="font-semibold text-white/85 hover:underline">
              {t("auth.continueGuest")}
            </Link>
          </p>
        </>
      }
    >
      {state.expired ? <FormAlert tone="info">{t("auth.login.expired")}</FormAlert> : null}
      {state.reset ? <FormAlert tone="success">{t("auth.login.resetDone")}</FormAlert> : null}
      {general ? <FormAlert tone="error">{t(general)}</FormAlert> : null}
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField id="login-email" label={t("auth.field.email")} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@example.com" />
        <PasswordField id="login-password" label={t("auth.field.password")} autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-accent hover:underline">
            {t("auth.login.forgot")}
          </Link>
        </div>
        <button type="submit" className={authButton} disabled={m.isPending}>
          {m.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {m.isPending ? t("auth.login.loading") : t("auth.login.submit")}
        </button>
      </form>
    </AuthLayout>
  );
}
