import { useTranslation } from "react-i18next";
import { errorText } from "@/lib/ui";

/** Message may be an i18n key (client validation) or server text (shown as-is). */
export function FieldError({ id, message }: { id?: string; message: string | undefined }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <p id={id} className={errorText} role="alert">
      {t(message, { defaultValue: message })}
    </p>
  );
}
