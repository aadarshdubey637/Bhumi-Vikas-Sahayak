import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { verifyAccessKey } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { ErrorState } from "@/components/common/ErrorState";
import { InlineDisclaimer } from "@/components/common/Disclaimer";
import { useApiKey } from "@/auth/useApiKey";
import { btnPrimary, errorText, input, label as labelCls } from "@/lib/ui";

export default function AccessKey() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setKey } = useApiKey();
  const [value, setValue] = useState("");
  const [keep, setKeep] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const m = useMutation({
    mutationFn: (key: string) => verifyAccessKey(key),
    onSuccess: (_d, key) => {
      setKey(key, keep);
      navigate(from, { replace: true });
    },
  });
  const unauthorized = m.isError && isApiError(m.error) && m.error.status === 401;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) m.mutate(value.trim());
  };
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">{t("accessKey.title")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("accessKey.help")}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label htmlFor="ak" className={labelCls}>
          {t("accessKey.label")}
        </label>
        <input
          id="ak"
          type="password"
          autoComplete="off"
          className={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={unauthorized}
        />
        {unauthorized ? (
          <p role="alert" className={errorText}>
            {t("accessKey.invalid")}
          </p>
        ) : null}
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          {t("accessKey.keepTab")}
        </label>
        {m.isError && !unauthorized ? <ErrorState error={m.error} /> : null}
        <button type="submit" className={btnPrimary} disabled={m.isPending || !value.trim()}>
          {t("accessKey.continue")}
        </button>
      </form>
      <div className="mt-6">
        <InlineDisclaimer />
      </div>
    </main>
  );
}
