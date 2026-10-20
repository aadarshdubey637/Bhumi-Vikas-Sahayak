import { ChevronDown, FolderKanban, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "@/auth/useAccount";

/** Header account area: sign-in buttons for visitors, a menu (dashboard, projects, tour, sign out) for signed-in users. */
export function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, user, config, signOut } = useAccount();
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
        <Link to="/login" className="inline-flex min-h-tap shrink-0 items-center rounded-lg px-2.5 text-sm font-semibold text-ink-soft hover:bg-white/10 hover:text-white">
          {t("land.nav.signin")}
        </Link>
        {config?.registration_open === false ? null : (
          <Link to="/signup" className="hidden min-h-tap shrink-0 items-center rounded-xl bg-white px-3.5 text-sm font-bold text-[#0b2a5b] hover:bg-white/90 md:inline-flex">
            {t("land.cta.signup")}
          </Link>
        )}
      </>
    );
  }
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const item = "flex min-h-tap w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-ink-soft hover:bg-white/10 hover:text-white";
  return (
    <>
      {help}
      <div ref={box} className="relative shrink-0">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="inline-flex min-h-tap items-center gap-2 rounded-xl border border-white/15 bg-white/5 py-1 pl-1.5 pr-2.5 text-sm font-semibold text-white hover:bg-white/10">
          <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#0b2a5b]">
            {initials}
          </span>
          <span className="hidden max-w-[8rem] truncate sm:inline">{user.name}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-soft" />
        </button>
        {open ? (
          <div role="menu" aria-label={t("auth.menu")} className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-white/15 bg-[#0D1829] p-2 shadow-panel">
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
