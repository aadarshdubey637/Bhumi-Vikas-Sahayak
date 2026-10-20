import { LogOut, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useHomePath } from "@/hooks/useHomePath";
import { useApiKey } from "@/auth/useApiKey";
import type { BackendState } from "@/hooks/useBackendReadiness";
import { Breadcrumbs } from "./Breadcrumbs";
import { LogoMark } from "@/components/brand/Logo";
import { AccountMenu } from "./AccountMenu";
import { DisplayControls } from "./DisplayControls";
import { LanguageToggle } from "./LanguageToggle";
import { MobileNav } from "./MobileNav";

const DOT: Record<BackendState, string> = {
  ok: "bg-verified",
  warming: "bg-pending motion-safe:animate-pulse",
  not_ready: "bg-pending",
  no_rules: "bg-pending",
  unreachable: "bg-danger",
};
const PILL: Record<BackendState, string> = {
  ok: "border-verified-line bg-verified-tint text-verified",
  warming: "border-pending-line bg-pending-tint text-pending",
  not_ready: "border-pending-line bg-pending-tint text-pending",
  no_rules: "border-pending-line bg-pending-tint text-pending",
  unreachable: "border-danger-line bg-danger-tint text-danger",
};

/** Application header: new chat, language and account. Server status appears only when something is wrong. */
export function TopBar({ state }: { state: BackendState }) {
  const { t } = useTranslation();
  const { hasKey, signOut } = useApiKey();
  const { home, newChat } = useHomePath();
  const { pathname } = useLocation();
  const onHome = pathname === home || pathname === "/dashboard" || pathname === "/assistant";
  return (
    <header className="theme-dark sticky top-0 z-30 border-b border-[var(--nav-line)] bg-[var(--top-bg)] text-ink before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[linear-gradient(90deg,#ff9933_0_33.3%,#ffffff_33.3%_66.6%,#138808_66.6%)] print:hidden">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6">
        <MobileNav />
        <Link to="/" aria-label={t("app.name")} className="lg:hidden">
          <LogoMark className="h-8 w-8" />
        </Link>
        <button
          type="button"
          onClick={newChat}
          className="inline-flex min-h-tap shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#0b2a5b] shadow transition-colors hover:bg-white/90"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("as.newChat")}
        </button>
        <div className="min-w-0 flex-1">{onHome ? null : <Breadcrumbs />}</div>
        {state !== "ok" ? (
          <span role="status" className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${PILL[state]}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[state]}`} />
            <span className="sr-only sm:not-sr-only">{t(`backend.state.${state}`)}</span>
          </span>
        ) : null}
        {hasKey ? (
          <button type="button" onClick={signOut} className="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:bg-white/10 hover:text-white">
            <LogOut aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">{t("auth.signOut")}</span>
          </button>
        ) : null}
        <LanguageToggle />
        <DisplayControls />
        <AccountMenu />
      </div>
    </header>
  );
}
