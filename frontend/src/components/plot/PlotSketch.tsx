import { useTranslation } from "react-i18next";
import type { PlotFormValues } from "@/api/schemas";

const LEN_TO_M: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144 };
const AREA_TO_SQM: Record<string, number> = { sqm: 1, sqft: 0.092903, sqyd: 0.836127, acre: 4046.856, hectare: 10000 };

const num = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};
const metres = (f: PlotFormValues, name: string): number | null => {
  const c = f.measurements[name];
  const n = c ? num(c.value) : null;
  return n === null || !c ? null : n * (LEN_TO_M[c.unit] ?? 1);
};
const raw = (f: PlotFormValues, name: string): string | null => {
  const c = f.measurements[name];
  return c && num(c.value) !== null ? `${c.value.trim()} ${c.unit}` : null;
};

/**
 * A drawing of what the user has typed so far: plot shape (from length x width, or a square from the area), the road in front, the
 * number of floors. It is a visual aid for checking inputs, NOT a legal drawing: it shows no setbacks or limits. Those appear only
 * in the server's result, and only where the rules support them.
 */
export function PlotSketch({ form }: { form: PlotFormValues }) {
  const { t } = useTranslation();
  const L = metres(form, "plot_length");
  const W = metres(form, "plot_width");
  const areaC = form.measurements.plot_area;
  const area = areaC && num(areaC.value) !== null ? Number(areaC.value) * (AREA_TO_SQM[areaC.unit] ?? 1) : null;
  const road = metres(form, "road_width");
  const floors = Math.min(Math.max(parseInt(form.floors, 10) || 0, 0), 12);
  const hasShape = (L !== null && W !== null) || area !== null;

  // plot rectangle inside a 190 x 120 box, aspect from the inputs (clamped so it stays readable)
  const ratio = L !== null && W !== null ? Math.min(Math.max(L / W, 0.45), 2.4) : 1;
  let pw = 190;
  let ph = pw / ratio;
  if (ph > 120) {
    ph = 120;
    pw = ph * ratio;
  }
  const px = 30 + (190 - pw) / 2;
  const py = 22;
  const roadH = road !== null && (W ?? L ?? null) !== null ? Math.min(Math.max(((road / (W ?? L ?? 1)) * ph) / 1.4, 12), 34) : 20;
  const lenLabel = raw(form, "plot_length");
  const widLabel = raw(form, "plot_width");
  const areaLabel = raw(form, "plot_area");
  const roadLabel = raw(form, "road_width");
  const use = form.building_use.trim();
  const heightLabel = raw(form, "building_height");

  const summary = [
    areaLabel && `${t("forms.fields.plot_area")}: ${areaLabel}`,
    lenLabel && `${t("forms.fields.plot_length")}: ${lenLabel}`,
    widLabel && `${t("forms.fields.plot_width")}: ${widLabel}`,
    roadLabel && `${t("forms.fields.road_width")}: ${roadLabel}`,
    form.floors.trim() && `${t("forms.fields.floors")}: ${form.floors.trim()}`,
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <figure className="glass rounded-2xl p-3">
      <svg viewBox="0 0 300 220" role="img" aria-label={summary ? `${t("sketch.title")}. ${summary}` : t("sketch.empty")} className="h-auto w-full">
        <rect width="300" height="220" rx="8" fill="#F5F8FF" />
        {/* plot */}
        <rect
          x={px}
          y={py}
          width={pw}
          height={ph}
          rx="2"
          fill={hasShape ? "#E8EEFD" : "#F5F8FF"}
          stroke={hasShape ? "#1D4ED8" : "#A3BDE8"}
          strokeWidth="2"
          strokeDasharray={hasShape ? undefined : "6 5"}
        />
        {hasShape ? <rect x={px + pw * 0.2} y={py + ph * 0.22} width={pw * 0.6} height={ph * 0.5} fill="#fff" stroke="#1D4ED8" strokeDasharray="4 3" opacity=".9" /> : null}
        {/* road in front */}
        <rect x="8" y={py + ph + 8} width="214" height={roadH} rx="2" fill="#E4ECFA" stroke="#A3BDE8" strokeDasharray="5 4" />
        <text x="115" y={py + ph + 8 + roadH / 2 + 4} textAnchor="middle" fontSize="10" fill="#1F3F73">
          {roadLabel ? `${t("sketch.road")} ${roadLabel}` : t("sketch.road")}
        </text>
        {/* dimension labels */}
        {lenLabel ? (
          <text x={px + pw / 2} y={py - 7} textAnchor="middle" fontSize="10.5" fill="#1C1F26" fontWeight="600">
            {lenLabel}
          </text>
        ) : null}
        {widLabel ? (
          <text x={px + pw + 7} y={py + ph / 2} fontSize="10.5" fill="#1C1F26" fontWeight="600" transform={`rotate(90 ${px + pw + 7} ${py + ph / 2})`} textAnchor="middle">
            {widLabel}
          </text>
        ) : null}
        {areaLabel ? (
          <text x={px + pw / 2} y={py + ph / 2 + 4} textAnchor="middle" fontSize="11" fill="#1D4ED8" fontWeight="600">
            {areaLabel}
          </text>
        ) : null}
        {!hasShape ? (
          <text x={px + pw / 2} y={py + ph / 2 + 4} textAnchor="middle" fontSize="10.5" fill="#5B6B80">
            {t("sketch.enter")}
          </text>
        ) : null}
        {/* floors (side view) */}
        <g transform="translate(244 28)">
          <text x="22" y="-8" textAnchor="middle" fontSize="9.5" fill="#5B6B80">
            {t("sketch.sideView")}
          </text>
          <line x1="-4" y1="132" x2="48" y2="132" stroke="#1C1F26" strokeWidth="2" />
          {floors > 0
            ? Array.from({ length: floors }, (_, i) => {
                const fh = Math.min(116 / floors, 26);
                return <rect key={i} x="2" y={132 - (i + 1) * fh} width="40" height={fh - 1.5} rx="1.5" fill={i === 0 ? "#1D4ED8" : "#6B8FF0"} stroke="#fff" />;
              })
            : null}
          {floors === 0 ? <rect x="2" y="104" width="40" height="28" rx="1.5" fill="none" stroke="#A3BDE8" strokeDasharray="4 3" /> : null}
          {heightLabel ? (
            <text x="22" y="148" textAnchor="middle" fontSize="9.5" fill="#1C1F26" fontWeight="600">
              {heightLabel}
            </text>
          ) : null}
        </g>
        {use ? (
          <text x="12" y="212" fontSize="10" fill="#3B4A5E">
            {use.slice(0, 40)}
          </text>
        ) : null}
      </svg>
      <figcaption className="mt-2 text-xs text-ink-soft">{t("sketch.caption")}</figcaption>
    </figure>
  );
}
