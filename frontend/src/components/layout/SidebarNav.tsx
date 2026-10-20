import { CircleHelp, Info, PanelLeftClose, PanelLeftOpen, Phone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { openOnboarding } from "@/lib/onboarding";
import { NAV_GROUPS } from "./navItems";
import { RecentChats } from "./RecentChats";

/** Brand mark + product name; shared by the desktop sidebar and the mobile drawer. */
export function BrandBlock({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to="/" aria-label={collapsed ? t("app.name") : undefined} className="flex min-h-tap items-center gap-2.5 rounded-lg px-1.5 focus-visible:outline-brand">
      <LogoMark className="h-9 w-9 shrink-0" />
      <Wordmark collapsed={collapsed} tone="light" />
    </Link>
  );
}

const linkCls = (isActive: boolean) =>
  `group relative flex min-h-tap items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
    isActive ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-ink-soft hover:bg-white/6 hover:text-white"
  }`;

/** The main links, then (when the sidebar is open) the recent chats. `onNavigate` lets the drawer close itself. */
export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { status, accountsEnforced } = useAccount();
  const showAccount = status === "user" || !accountsEnforced;
  return (
    <div>
      <ul className="space-y-1">
        {NAV_GROUPS.flatMap((g) => g.items)
          .filter((i) => (!i.account || showAccount) && (!i.guestOnly || !showAccount))
          .map(({ to, key, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} onClick={onNavigate} title={t(`nav.${key}`)} className={({ isActive }) => linkCls(isActive)}>
                {({ isActive }) => (
                  <>
                    <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-white" : "text-ink-faint group-hover:text-white"}`} />
                    {collapsed ? <span className="sr-only">{t(`nav.${key}`)}</span> : <span className="truncate">{t(`nav.${key}`)}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
      </ul>
      {collapsed ? null : <RecentChats onNavigate={onNavigate} />}
    </div>
  );
}

/** Help (opens the tour) and the secondary pages, pinned to the bottom. */
export function NavFooterLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const item = "flex min-h-tap w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-white/6 hover:text-white";
  return (
    <ul className="space-y-0.5 border-t border-line pt-2">
      <li>
        <button
          type="button"
          title={t("as.help")}
          onClick={() => {
            openOnboarding();
            onNavigate?.();
          }}
          className={item}
        >
          <CircleHelp aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          {collapsed ? <span className="sr-only">{t("as.help")}</span> : <span>{t("as.help")}</span>}
        </button>
      </li>
      {[
        { to: "/about", key: "about", icon: Info },
        { to: "/channels", key: "channels", icon: Phone },
      ].map(({ to, key, icon: Icon }) => (
        <li key={to}>
          <NavLink to={to} onClick={onNavigate} title={t(`nav.${key}`)} className={item}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
            {collapsed ? <span className="sr-only">{t(`nav.${key}`)}</span> : <span className="truncate">{t(`nav.${key}`)}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Desktop sidebar (lg and up): sticky, collapsible to an icon rail. State is in memory only. */
export function SidebarNav() {
  const { t } = useTranslation();
  // Narrow desktops start with the icon rail so the workbench keeps its width.
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 1400);
  return (
    <nav
      aria-label={t("nav.main")}
      className={`theme-dark sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-[var(--nav-line)] bg-[var(--nav-bg)] p-3 transition-[width] duration-200 motion-reduce:transition-none lg:flex print:hidden ${collapsed ? "w-[4.5rem]" : "w-64"}`}
    >
      <div className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        {collapsed ? null : <BrandBlock />}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border border-line text-ink-soft transition-colors hover:bg-white/6 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-[18px] w-[18px]" /> : <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <NavList collapsed={collapsed} />
      </div>
      <NavFooterLinks collapsed={collapsed} />
    </nav>
  );
}
