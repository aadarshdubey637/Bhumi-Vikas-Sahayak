import { Info, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { NAV_GROUPS } from "./navItems";
import { RecentChats } from "./RecentChats";

/** Brand mark + product name; shared by the desktop sidebar and the mobile drawer. */
export function BrandBlock({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to="/" aria-label={collapsed ? t("app.name") : undefined} className="flex min-h-tap items-center gap-2.5 rounded-lg px-1.5 focus-visible:outline-brand">
      <LogoMark className="h-9 w-9 shrink-0" />
      <Wordmark collapsed={collapsed} />
    </Link>
  );
}

const linkCls = (isActive: boolean) =>
  `group relative flex min-h-tap items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-tint text-brand-dark" : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
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
                    <Icon aria-hidden="true" className={`h-[1.125rem] w-[1.125rem] shrink-0 ${isActive ? "text-brand" : "text-ink-faint group-hover:text-ink"}`} />
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
  const item = "flex min-h-tap w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink";
  return (
    <ul className="space-y-0.5 border-t border-line pt-2">
      {[
        { to: "/about", key: "about", icon: Info },
        { to: "/channels", key: "channels", icon: Phone },
      ].map(({ to, key, icon: Icon }) => (
        <li key={to}>
          <NavLink to={to} onClick={onNavigate} title={t(`nav.${key}`)} className={item}>
            <Icon aria-hidden="true" className="h-[1.125rem] w-[1.125rem] shrink-0" />
            {collapsed ? <span className="sr-only">{t(`nav.${key}`)}</span> : <span className="truncate">{t(`nav.${key}`)}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
