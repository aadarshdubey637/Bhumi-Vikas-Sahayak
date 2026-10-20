import { useTranslation } from "react-i18next";

export function ConfigError({ reason }: { reason: "missing" | "invalid" | "insecure" }) {
  const { t } = useTranslation();
  return (
    <main
      role="alert"
      className="mx-auto mt-16 max-w-xl rounded border border-danger-line bg-danger-tint p-6"
    >
      <h1 className="text-xl font-semibold text-danger">{t("config.title")}</h1>
      <p className="mt-3">{t(`config.${reason}`)}</p>
      <p className="mt-3 text-ink-soft">{t("config.action")}</p>
    </main>
  );
}
