import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/common/FieldError";
import { input, label as labelCls } from "@/lib/ui";

/** A number and its unit as one joined control, with an optional plain-language hint under it. */
export function MeasurementField({
  id,
  label,
  units,
  value,
  unit,
  onChange,
  error,
  hint,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  units: readonly string[];
  value: string;
  unit: string;
  onChange: (next: { value: string; unit: string }) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="flex">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ? t("forms.eg", { value: placeholder }) : undefined}
          className={`${input} min-w-0 !rounded-r-none tabular`}
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange({ value: e.target.value, unit })}
        />
        <select
          aria-label={t("forms.unitFor", { field: label })}
          className={`${input} !w-[6.5rem] shrink-0 !rounded-l-none !border-l-0 bg-surface-sunken font-semibold text-ink-soft`}
          value={unit}
          disabled={disabled}
          onChange={(e) => onChange({ value, unit: e.target.value })}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {t(`units.${u}`, { defaultValue: u })}
            </option>
          ))}
        </select>
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}
