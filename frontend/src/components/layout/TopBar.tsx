import { Clock3, Database, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { ReadyOut } from "@/api/types";
import type { BackendState } from "@/hooks/useBackendReadiness";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { sendWbCommand } from "@/lib/wbEvents";
import { AccountMenu } from "./AccountMenu";
import { LanguageToggle } from "./LanguageToggle";
import { MobileNav } from "./MobileNav";
import { NAV_GROUPS } from "./navItems";
import { VoiceGuide } from "./VoiceGuide";

const DOT: Record<BackendState, string> = {
  ok: "bg-verified",
  warming: "bg-pending motion-safe:animate-pulse",
  not_ready: "bg-pending",
  no_rules: "bg-pending",
  unreachable: "bg-danger",
};
const PILL: Record<BackendState, string> = {
  ok: "border-line bg-surface text-ink-soft",
  warming: "border-pending-line bg-pending-tint text-pending",
  not_ready: "border-pending-line bg-pending-tint text-pending",
  no_rules: "border-pending-line bg-pending-tint text-pending",
  unreachable: "border-danger-line bg-danger-tint text-danger",
};

const tab = (active: boolean) =>
  `inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${active ? "bg-surface-sunken text-ink ring-1 ring-inset ring-line-strong" : "text-ink-soft hover:bg-surface-sunken hover:text-ink"}`;
const ghost = "inline-flex h-[2.125rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-sunken";

/** Application header: brand, where the rules apply, the core pages, then reset, language, rule count and the voice guide. */
export function TopBar({ state, ready }: { state: BackendState; ready?: ReadyOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onBench = pathname === "/workbench";
  const items = NAV_GROUPS.flatMap((g) => g.items);
  // History lives in the workbench's inspector: go there first when needed, then ask it to open the list
  const openHistory = () => {
    if (!onBench) navigate("/workbench");
    window.setTimeout(() => sendWbCommand("history"), onBench ? 0 : 120);
  };
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[var(--top-bg)] text-ink print:hidden">
      <div className="flex h-[3.75rem] items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <MobileNav />
        <Link to="/" aria-label={t("app.name")} className="flex shrink-0 items-center gap-2.5 rounded-lg">
          <LogoMark className="h-9 w-9" />
          <span className="hidden sm:block">
            <Wordmark compact />
          </span>
        </Link>
        <span className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink 2xl:inline-flex">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-verified" />
          {t("header.location")}
        </span>
        <nav aria-label={t("nav.main")} className="mx-auto hidden shrink-0 items-center gap-1 rounded-xl border border-line bg-surface p-1 lg:flex">
          {items.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => tab(isActive)}>
              <Icon aria-hidden="true" className="h-4 w-4" />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
          <button type="button" className={tab(false)} onClick={openHistory}>
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            {t("nav.history")}
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {onBench ? (
            <button type="button" className={ghost} onClick={() => sendWbCommand("reset")} aria-label={t("wb.reset")}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              <span className="hidden 2xl:inline">{t("wb.reset")}</span>
            </button>
          ) : null}
          <LanguageToggle tone="light" long />
          {state !== "ok" || ready ? (
            <span role={state === "ok" ? undefined : "status"} className={`hidden shrink-0 items-center gap-2 h-[2.125rem] rounded-lg border px-3 text-sm font-medium whitespace-nowrap 2xl:inline-flex ${PILL[state]}`}>
              {state === "ok" ? <Database aria-hidden="true" className="h-3.5 w-3.5" /> : <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[state]}`} />}
              {state === "ok" && ready ? t("header.rules", { n: ready.rules_loaded }) : t(`backend.state.${state}`)}
            </span>
          ) : null}
          <VoiceGuide />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
