import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Always visible. Can be collapsed to a single line; re-expands whenever `resetKey` changes. */
export function DisclaimerBanner({ resetKey }: { resetKey: number }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [resetKey]);
  return (
    <div
      role="note"
      className="border-b border-pending-line bg-pending-tint px-3 py-1.5 text-sm text-ink sm:px-6 print:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2 pl-0">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pending" />
        <p className={collapsed ? "truncate" : ""}>{collapsed ? t("disclaimerShort") : t("disclaimer")}</p>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("common.expand") : t("common.collapse")}
          className="ml-auto inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center"
        >
          {collapsed ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
