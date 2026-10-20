import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

const SECTION_KEY: Record<string, string> = {
  workbench: "nav.workbench",
  dashboard: "nav.dashboard",
  ask: "nav.ask",
  assistant: "nav.ask",
  rules: "nav.rules",
  calculator: "nav.calculator",
  "plot-check": "nav.plotCheck",
  projects: "nav.projects",
  assessments: "breadcrumb.assessment",
  feedback: "nav.feedback",
  channels: "nav.channels",
  amendments: "nav.amendments",
  sources: "nav.sources",
  about: "nav.about",
  "access-key": "nav.about",
  report: "breadcrumb.report",
};
const ID_LIKE = /^[0-9a-f]{24,}$/i;

/** Home > Section > item, derived from the URL only (no data fetching). The last crumb is the current page. */
export function Breadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const segs = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; to: string }> = [{ label: t("app.short"), to: "/" }];
  let acc = "";
  for (const s of segs) {
    acc += `/${s}`;
    const key = SECTION_KEY[s];
    let label: string;
    if (key) label = t(key);
    else if (ID_LIKE.test(s)) label = t("breadcrumb.details");
    else {
      try {
        label = decodeURIComponent(s);
      } catch {
        label = s;
      }
    }
    crumbs.push({ label, to: acc });
  }
  return (
    <nav aria-label={t("breadcrumb.label")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-ink-soft">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.to}>
              {i > 0 ? <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" /> : null}
              <li className={`min-w-0 ${last ? "" : "hidden sm:block"}`}>
                {last ? (
                  <span aria-current="page" className="block truncate font-semibold text-ink">
                    {c.label}
                  </span>
                ) : (
                  <Link to={c.to} className="block truncate rounded hover:text-brand hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
