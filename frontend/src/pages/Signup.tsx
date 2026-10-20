import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { register } from "@/api/endpoints/auth";
import { rearmUnauthorized } from "@/api/client";
import { useAccount } from "@/auth/useAccount";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { authButton, FormAlert, PasswordField, TextField } from "@/components/auth/fields";
import { emailProblem, mapAuthError, MIN_PASSWORD, passwordProblemKey, passwordProblems, safeNext } from "@/lib/authForm";

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, setUser, config } = useAccount();
  const from = (location.state as { from?: string } | null)?.from;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | undefined>();

  const m = useMutation({
    mutationFn: () => register({ name: name.trim(), email: email.trim(), password }),
    onSuccess: (u) => {
      rearmUnauthorized();
      setUser(u);
      navigate(safeNext(from), { replace: true, state: { welcome: true } });
    },
    onError: (e) => {
      const r = mapAuthError(e, ["name", "email", "password"]);
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });

  if (status === "user" && !m.isSuccess) return <Navigate to={safeNext(from)} replace />;
  if (status === "user") return <Navigate to={safeNext(from)} replace state={{ welcome: true }} />;
  const closed = config?.registration_open === false;

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "auth.err.required";
    else if (name.trim().length > 80) errs.name = "auth.err.nameLong";
    const ep = emailProblem(email);
    if (ep) errs.email = ep;
    const pp = passwordProblems(password, email, name);
    if (!password) errs.password = "auth.err.required";
    else if (pp.length) errs.password = passwordProblemKey(pp[0]!);
    if (!errs.password && confirm !== password) errs.confirm = "auth.err.mismatch";
    return errs;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setGeneral(undefined);
    if (Object.keys(errs).length === 0) m.mutate();
  };

  return (
    <AuthLayout
      title={t("auth.signup.title")}
      subtitle={t("auth.signup.subtitle")}
      footer={
        <p>
          {t("auth.signup.haveAccount")}{" "}
          <Link to="/login" state={{ from }} className="font-semibold text-accent hover:underline">
            {t("auth.signup.loginLink")}
          </Link>
        </p>
      }
    >
      {closed ? <FormAlert tone="info">{t("auth.err.registrationClosed")}</FormAlert> : null}
      {general ? <FormAlert tone="error">{t(general)}</FormAlert> : null}
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField id="su-name" label={t("auth.field.name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} disabled={closed} />
        <TextField id="su-email" label={t("auth.field.email")} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@example.com" disabled={closed} />
        <PasswordField id="su-password" label={t("auth.field.password")} autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} showStrength hint={t("auth.field.passwordHint", { n: config?.password_min_length ?? MIN_PASSWORD })} />
        <PasswordField id="su-confirm" label={t("auth.field.confirm")} autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirm} />
        <button type="submit" className={authButton} disabled={m.isPending || closed}>
          {m.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {m.isPending ? t("auth.signup.loading") : t("auth.signup.submit")}
        </button>
        <p className="text-center text-xs text-white/55">{t("auth.signup.privacy")}</p>
      </form>
    </AuthLayout>
  );
}
