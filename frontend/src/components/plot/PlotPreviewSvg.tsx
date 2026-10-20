import { useTranslation } from "react-i18next";
import type { PlotPreviewResponse } from "@/api/types";
import { EmptyState, InfoBox } from "@/components/common/States";
import { computeLayout, toPointsAttr } from "@/lib/plot";

export function PlotPreviewSvg({ preview }: { preview: PlotPreviewResponse }) {
  const { t } = useTranslation();
  const geo = preview.geometry;
  const layout = geo ? computeLayout(geo, preview.annotations) : null;
  return (
    <section aria-label={t("plot.title")} className="space-y-3">
      {!geo || !layout ? (
        <EmptyState title={t("plot.empty")} />
      ) : (
        <figure>
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-labelledby="plot-title plot-desc"
            className="h-auto w-full max-w-xl glass rounded-xl"
          >
            <title id="plot-title">{t("plot.title")}</title>
            <desc id="plot-desc">
              {t("plot.desc", { dims: geo.dimension_labels.map((d) => d.text).join(", ") })}
            </desc>
            {layout.roads.map((r) => (
              <g key={`road-${r.edge}`}>
                <polygon
                  points={toPointsAttr(r.points)}
                  fill="#ECEFF2"
                  stroke="#4F5B66"
                  strokeDasharray="4 3"
                />
                <text x={r.labelAt.x} y={r.labelAt.y} fontSize="11" textAnchor="middle" fill="#43525F">
                  {r.label}
                </text>
              </g>
            ))}
            <polygon
              data-testid="plot-polygon"
              points={toPointsAttr(layout.polygon)}
              fill="#E1F0F2"
              stroke="#0E5A66"
              strokeWidth="2"
            />
            {layout.labels.map((l) => (
              <text key={`dim-${l.edge}`} x={l.x} y={l.y} fontSize="12" textAnchor={l.anchor} fill="#17222D">
                {l.text}
              </text>
            ))}
          </svg>
          <figcaption className="mt-1 text-xs text-ink-soft">
            {geo.orientation_note} {t("plot.schematic")}
          </figcaption>
        </figure>
      )}
      {preview.warnings.length > 0 ? (
        <InfoBox tone="pending">
          <ul className="list-disc pl-5">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </InfoBox>
      ) : null}
      {Object.keys(preview.legend).length > 0 ? (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 text-xs">
          {Object.entries(preview.legend).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {preview.unresolved_constraints.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">{t("plot.notEvaluated")}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {preview.unresolved_constraints.map((c) => (
              <li key={c.constraint} className="rounded border border-muted-line bg-muted-tint p-2">
                <span className="font-semibold">{c.constraint}</span> — {c.description}{" "}
                <span className="text-ink-soft">({c.status})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.verified_constraints.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">{t("plot.verified")}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {preview.verified_constraints.map((c, i) => (
              <li key={i} className="rounded border border-verified-line bg-verified-tint p-2">
                {Object.entries(c)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
