import { ArrowRight, Box, Calculator, ChevronRight, FileSearch, Menu, MessageSquareText, Ruler, ScrollText, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getReady } from "@/api/endpoints/health";
import { useAccount } from "@/auth/useAccount";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { LiveAnswerCard } from "@/components/landing/LiveAnswerCard";
import { CountUp, Reveal } from "@/components/landing/Reveal";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

const cta = "inline-flex min-h-tap items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-[0.9375rem] font-bold transition-[background-color,transform,border-color] motion-safe:active:scale-[0.98]";
const ctaPrimary = `${cta} bg-accent text-navy-night shadow-[0_10px_30px_rgba(245,179,1,0.35)] hover:bg-[#ffc21f]`;
const ctaGhost = `${cta} border border-white/25 bg-white/8 text-white backdrop-blur hover:border-white/50 hover:bg-white/15`;
const glass = "rounded-3xl border border-white/12 bg-white/7 backdrop-blur-xl";

const FEATURES = [
  { id: "assistant", icon: MessageSquareText, to: "/ask" },
  { id: "assess", icon: Ruler, to: "/plot-check" },
  { id: "visual", icon: Box, to: "/workbench" },
  { id: "calc", icon: Calculator, to: "/calculator" },
] as const;
const STEPS = ["s1", "s2", "s3"] as const;
/** Photographs supplied for this site: surveyed plots, an architectural city model, and an earthworks site. */
const STEP_IMG: Record<(typeof STEPS)[number], string> = { s1: "/img/plots.jpg", s2: "/img/model.jpg", s3: "/img/site.jpg" };

export default function Landing() {
  const { t } = useTranslation();
  const { status, user } = useAccount();
  const ready = useQuery({ queryKey: ["landing-ready"], queryFn: ({ signal }) => getReady(signal), retry: 0, staleTime: 5 * 60_000 });
  const [menu, setMenu] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const on = () => {
      setScrollY(Math.min(window.scrollY, 700));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const signedIn = status === "user";
  const start = signedIn ? "/dashboard" : "/workbench";
  const links = [
    { href: "#features", label: t("land.nav.features") },
    { href: "#how", label: t("land.nav.how") },
    { to: "/rules", label: t("land.nav.rulebook") },
    { to: "/about", label: t("land.nav.about") },
  ];
  const linkCls = "inline-flex h-8 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink";

  return (
    <div className="theme-dark landing-bg relative min-h-screen overflow-x-hidden text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-surface focus:p-2">
        {t("nav.skip")}
      </a>
      {/* ------------------------------------------------------------------ navbar */}
      <header className="sticky top-0 z-40 border-b border-line bg-[var(--top-bg)]">
        <nav aria-label={t("nav.main")} className="mx-auto flex h-[3.75rem] max-w-7xl items-center gap-3 px-4 sm:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label={t("app.name")}>
            <LogoMark className="h-9 w-9" />
            <Wordmark compact />
          </Link>
          <div className="mx-auto hidden items-center gap-1 rounded-xl border border-line bg-surface p-1 lg:flex">
            {links.map((l) =>
              "to" in l ? (
                <Link key={l.label} to={l.to!} className={linkCls}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className={linkCls}>
                  {l.label}
                </a>
              ),
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <LanguageToggle tone="light" long />
            {signedIn ? (
              <Link to="/dashboard" className={`${ctaPrimary} hidden !h-[2.125rem] !min-h-0 !px-4 !text-sm sm:inline-flex`}>
                {t("land.nav.dashboard", { name: user?.name.split(" ")[0] ?? "" })}
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden h-[2.125rem] items-center whitespace-nowrap rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:border-line-strong hover:bg-surface-sunken sm:inline-flex">
                  {t("land.nav.signin")}
                </Link>
                <Link to={start} className={`${ctaPrimary} hidden !h-[2.125rem] !min-h-0 !px-4 !text-sm md:inline-flex`}>
                  {t("land.cta.start")}
                </Link>
              </>
            )}
            <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="land-menu" aria-label={menu ? t("nav.close") : t("nav.open")} className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg text-ink hover:bg-surface-sunken lg:hidden">
              {menu ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
            </button>
          </div>
        </nav>
        {menu ? (
          <div id="land-menu" className="border-t border-line bg-[var(--top-bg)] px-4 pb-4 pt-2 lg:hidden">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.label}>
                  {"to" in l ? (
                    <Link to={l.to!} className={`${linkCls} w-full`} onClick={() => setMenu(false)}>
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} className={`${linkCls} w-full`} onClick={() => setMenu(false)}>
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
              {signedIn ? null : (
                <li>
                  <Link to="/login" className={`${linkCls} w-full`} onClick={() => setMenu(false)}>
                    {t("land.nav.signin")}
                  </Link>
                </li>
              )}
            </ul>
            <Link to={start} className={`${ctaPrimary} mt-3 w-full`} onClick={() => setMenu(false)}>
              {signedIn ? t("land.nav.dashboard", { name: "" }).trim() : t("land.cta.start")}
            </Link>
          </div>
        ) : null}
      </header>

      <main id="main" className="relative">
        <div aria-hidden="true" style={{ transform: `translateY(${scrollY * 0.25}px) scale(1.08)` }} className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] bg-[url('/img/site.jpg')] bg-cover bg-center opacity-[0.22] will-change-transform [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" />
        
        {/* ---------------------------------------------------------------- hero */}
        <section aria-labelledby="land-h1" className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-8 sm:pt-14 lg:pb-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <div className="motion-safe:animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {t("land.hero.kicker")}
              </p>
              <h1 id="land-h1" className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl xl:text-[3.5rem]">
                {t("land.hero.title1")} <span className="bg-gradient-to-r from-accent to-[#ffe08a] bg-clip-text text-transparent">{t("land.hero.title2")}</span> {t("land.hero.title3")}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">{t("land.hero.body")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={start} className={ctaPrimary}>
                  {t("land.cta.start")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <a href="#features" className={ctaGhost}>
                  {t("land.cta.explore")}
                </a>
              </div>
              <p className="mt-4 text-sm text-white/60">{signedIn ? t("land.hero.signedIn") : t("land.hero.noAccount")}</p>
            </div>
            <HeroPreview />
          </div>
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <LiveAnswerCard />
            <ul className="grid gap-3 text-sm text-white/80 sm:grid-cols-3">
              {(["t1", "t2", "t3"] as const).map((k) => (
                <li key={k} className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {t(`land.trust.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {ready.data?.rules_loaded ? (
          <Reveal as="section" className="mx-auto max-w-7xl px-4 sm:px-8">
            <dl className="grid grid-cols-2 gap-4 rounded-3xl border border-white/12 bg-white/7 p-5 text-center backdrop-blur-xl sm:grid-cols-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-white/55">{t("land.stats.rules")}</dt>
                <dd className="mt-1 text-3xl font-semibold text-accent"><CountUp to={ready.data.rules_loaded} /></dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-white/55">{t("land.stats.tools")}</dt>
                <dd className="mt-1 text-3xl font-semibold text-accent"><CountUp to={4} /></dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-white/55">{t("land.stats.langs")}</dt>
                <dd className="mt-1 text-3xl font-semibold text-accent"><CountUp to={2} /></dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-white/55">{t("land.stats.cited")}</dt>
                <dd className="mt-1 text-3xl font-semibold text-accent"><CountUp to={100} />%</dd>
              </div>
            </dl>
          </Reveal>
        ) : null}

        {/* ---------------------------------------------------------------- features */}
        <section id="features" aria-labelledby="land-features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{t("land.features.kicker")}</p>
            <h2 id="land-features" className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {t("land.features.title")}
            </h2>
            <p className="mt-3 text-white/70">{t("land.features.body")}</p>
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f, idx) => (
              <Reveal as="li" delay={idx * 90} key={f.id} className={`${glass} group flex flex-col p-6 transition-[border-color,transform,background-color] hover:border-accent/50 hover:bg-white/10 motion-safe:hover:-translate-y-1`}>
                <span aria-hidden="true" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-navy-night shadow-[0_8px_24px_rgba(245,179,1,0.3)]">
                  <f.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-xl font-semibold text-white">{t(`land.f.${f.id}.title`)}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">{t(`land.f.${f.id}.body`)}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-white/80">
                  {(["a", "b", "c"] as const).map((k) => (
                    <li key={k} className="flex items-start gap-2">
                      <ChevronRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {t(`land.f.${f.id}.${k}`)}
                    </li>
                  ))}
                </ul>
                <Link to={f.to} className="mt-5 inline-flex min-h-tap items-center gap-1.5 self-start text-sm font-bold text-accent hover:underline">
                  {t(`land.f.${f.id}.cta`)}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- how it works */}
        <section id="how" aria-labelledby="land-how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-8">
          <h2 id="land-how" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("land.how.title")}
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" delay={i * 120} key={s} className={`${glass} relative p-6`}>
                <span aria-hidden="true" className="absolute -top-4 left-6 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-base font-bold text-navy-night shadow-lg">
                  {i + 1}
                </span>
                <img src={STEP_IMG[s]} alt="" loading="lazy" decoding="async" className="mt-2 h-40 w-full rounded-2xl border border-white/10 object-cover" />
                <h3 className="mt-4 text-lg font-semibold text-white">{t(`land.how.${s}.title`)}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">{t(`land.how.${s}.body`)}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- honest scope + final CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-8">
          <div className={`${glass} grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center`}>
            <div>
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">{t("land.final.title")}</h2>
              <p className="mt-3 max-w-xl text-white/70">{t("land.final.body")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={start} className={ctaPrimary}>
                  {t("land.cta.start")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                {signedIn ? null : (
                  <Link to="/signup" className={ctaGhost}>
                    {t("land.cta.signup")}
                  </Link>
                )}
              </div>
            </div>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-start gap-3">
                <FileSearch aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                {t("land.final.p1")}
              </li>
              <li className="flex items-start gap-3">
                <ScrollText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                {t("land.final.p2")}
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                {t("land.final.p3")}
              </li>
            </ul>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------------- footer */}
      <footer className="border-t border-white/10 bg-navy-night/60 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label={t("app.name")}>
              <LogoMark className="h-9 w-9" />
              <Wordmark tone="light" />
            </Link>
            <p className="mt-3 max-w-xs text-sm text-white/60">{t("land.footer.tag")}</p>
          </div>
          <nav aria-label={t("land.footer.product")}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">{t("land.footer.product")}</h2>
            <ul className="mt-3 space-y-1 text-sm text-white/80">
              <li><a href="#features" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.nav.features")}</a></li>
              <li><a href="#how" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.nav.how")}</a></li>
              <li><Link to="/workbench" className="inline-flex min-h-tap items-center hover:text-accent">{t("nav.workbench")}</Link></li>
              <li><Link to="/calculator" className="inline-flex min-h-tap items-center hover:text-accent">{t("nav.calculator")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("land.footer.resources")}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">{t("land.footer.resources")}</h2>
            <ul className="mt-3 space-y-1 text-sm text-white/80">
              <li><Link to="/rules" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.nav.rulebook")}</Link></li>
              <li><Link to="/sources" className="inline-flex min-h-tap items-center hover:text-accent">{t("nav.sources")}</Link></li>
              <li><Link to="/amendments" className="inline-flex min-h-tap items-center hover:text-accent">{t("nav.amendments")}</Link></li>
              <li><Link to="/about" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.footer.limits")}</Link></li>
            </ul>
          </nav>
          <nav aria-label={t("land.footer.account")}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">{t("land.footer.account")}</h2>
            <ul className="mt-3 space-y-1 text-sm text-white/80">
              {signedIn ? (
                <li><Link to="/dashboard" className="inline-flex min-h-tap items-center hover:text-accent">{t("nav.dashboard")}</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.nav.signin")}</Link></li>
                  <li><Link to="/signup" className="inline-flex min-h-tap items-center hover:text-accent">{t("land.cta.signup")}</Link></li>
                </>
              )}
            </ul>
            <p className="mt-3 text-xs text-white/50">{t("land.footer.feedback")}</p>
          </nav>
        </div>
        <p className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/50 sm:px-8">{t("disclaimer")}</p>
      </footer>
    </div>
  );
}
