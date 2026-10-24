import { useTranslation } from "react-i18next";
import { FieldError } from "@/components/common/FieldError";

/** Small caption above a field, led by a gold dot (shared by the measurement fields and the selects next to them). */
export const fieldLabel = "mb-2 flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-ink";
export const fieldBox =
  "h-10 w-full rounded-lg border border-line bg-surface-page px-3 text-base font-medium text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export function FieldCaption({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={fieldLabel}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      {children}
    </label>
  );
}

/** A number with its unit as a small chip inside the same box, and an optional plain-language hint under it. */
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
      <FieldCaption htmlFor={id}>{label}</FieldCaption>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ? t("forms.eg", { value: placeholder }) : undefined}
          className={`${fieldBox} tabular pr-14`}
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange({ value: e.target.value, unit })}
        />
        <select
          aria-label={t("forms.unitFor", { field: label })}
          className="absolute right-2 top-1/2 h-6 -translate-y-1/2 cursor-pointer appearance-none rounded-md bg-navy px-2 text-center text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-accent/40"
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
