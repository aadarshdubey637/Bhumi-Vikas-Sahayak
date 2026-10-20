import { useTranslation } from "react-i18next";
import { input } from "@/lib/ui";

export function UnitSelect({
  id,
  label,
  units,
  value,
  onChange,
}: {
  id: string;
  label: string;
  units: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        {units.map((u) => (
          <option key={u} value={u}>
            {t(`units.${u}`, { defaultValue: u })}
          </option>
        ))}
      </select>
    </div>
  );
}
