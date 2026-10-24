import { ChevronDown, FolderKanban, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";

/** Header account area: sign-in buttons for visitors, a menu (dashboard, projects, tour, sign out) for signed-in users. */
export function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, user, signOut } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const help = null;
  if (status === "loading") return help;
  if (status !== "user" || !user) {
    return (
      <>
        {help}
        {/* one entry point for visitors; "Create an account" is on the sign-in page, so the header never offers both */}
        <Link to="/login" className="inline-flex h-[2.125rem] shrink-0 items-center whitespace-nowrap rounded-lg bg-brand px-4 text-sm font-bold hover:bg-brand-dark">
          {t("land.nav.signin")}
        </Link>
      </>
    );
  }
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const item = "flex min-h-tap w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink";
  return (
    <>
      {help}
      <div ref={box} className="relative shrink-0">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface pl-1 pr-2 text-xs font-semibold text-ink hover:bg-surface-sunken">
          <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[0.6875rem] font-bold">
            {initials}
          </span>
          <span className="hidden max-w-[8rem] truncate sm:inline">{user.name}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-ink-soft" />
        </button>
        {open ? (
          <div role="menu" aria-label={t("auth.menu")} className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-surface p-2 shadow-pop">
            <p className="truncate px-3 pb-1 pt-2 text-xs text-ink-faint">{user.email}</p>
            <Link role="menuitem" to="/dashboard" className={item} onClick={() => setOpen(false)}>
              <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
              {t("nav.dashboard")}
            </Link>
            <Link role="menuitem" to="/projects" className={item} onClick={() => setOpen(false)}>
              <FolderKanban aria-hidden="true" className="h-4 w-4" />
              {t("nav.projects")}
            </Link>
            <button role="menuitem" type="button" className={item} disabled={busy} onClick={async () => {
              setBusy(true);
              setOpen(false);
              navigate("/", { replace: true }); // leave first, otherwise the route guard bounces to /login
              await signOut();
              setBusy(false);
            }}>
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {t("auth.logout")}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
