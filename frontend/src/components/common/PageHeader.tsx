import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Page title block. `icon` and `description` are optional so existing pages keep working; the title is always the page's h1. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-navy-700 text-white shadow-glow"
          >
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
