import { ArrowLeft, Box, MessageSquareText, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

/** Split screen shared by sign-in, sign-up and password reset: brand panel on the left, glass form card on the right. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  const points = [
    { icon: MessageSquareText, text: t("auth.brand.p1") },
    { icon: Box, text: t("auth.brand.p2") },
    { icon: ShieldCheck, text: t("auth.brand.p3") },
  ];
  return (
    <div className="theme-dark landing-bg relative flex min-h-screen flex-col text-ink">
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label={t("app.name")}>
          <LogoMark className="h-9 w-9" />
          <Wordmark tone="light" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex min-h-tap items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-white/80 hover:text-white">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{t("auth.backHome")}</span>
          </Link>
          <LanguageToggle />
        </div>
      </header>
      <main id="main" className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 pb-10 pt-2 sm:px-8 lg:grid-cols-[1fr_28rem]">
        <section aria-hidden={false} className="hidden lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{t("wb.hero.kicker")}</p>
          <h2 className="mt-2 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">{t("auth.brand.title")}</h2>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p.text} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/6 p-4">
                <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-navy-night">
                  <p.icon className="h-5 w-5" />
                </span>
                <span className="text-[0.9375rem] leading-snug text-white/85">{p.text}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl border border-white/15 bg-[#0D1829]/70 p-6 shadow-panel backdrop-blur-2xl sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-white/70">{subtitle}</p> : null}
          <div className="mt-6 space-y-4">{children}</div>
          {footer ? <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/70">{footer}</div> : null}
        </section>
      </main>
    </div>
  );
}
