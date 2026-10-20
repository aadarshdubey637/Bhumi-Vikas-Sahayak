import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <Link to="/" className="mt-4 inline-flex min-h-tap items-center text-brand underline">
        {t("notFound.back")}
      </Link>
    </main>
  );
}
