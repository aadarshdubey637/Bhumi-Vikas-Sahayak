import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { ToastProvider } from "@/components/common/Toast";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawer";
import { FeedbackDialogProvider } from "@/components/forms/FeedbackDialog";
import { displayStore } from "@/lib/display";
import { useBackendReadiness } from "@/hooks/useBackendReadiness";
import { BackendStatusBanner } from "./BackendStatusBanner";
import { DisclaimerContext } from "./DisclaimerContext";
import { TopBar } from "./TopBar";

export function AppShell() {
  const { t } = useTranslation();
  const display = useSyncExternalStore(displayStore.subscribe, displayStore.getSnapshot);
  const { pathname } = useLocation();
  const { state, ready, retry } = useBackendReadiness();
  const ping = useCallback(() => undefined, []);
  const ctx = useMemo(() => ({ ping }), [ping]);

  return (
    <DisclaimerContext.Provider value={ctx}>
      <ToastProvider>
        <EvidenceDrawerProvider>
          <FeedbackDialogProvider>
            <div className={`app-bg relative flex min-h-screen flex-col text-ink ${pathname === "/workbench" ? "xl:h-screen xl:min-h-0 xl:overflow-hidden" : ""} ${display.theme === "dark" ? "theme-dark" : ""}`}>
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-surface focus:p-2 focus:shadow-pop"
              >
                {t("nav.skip")}
              </a>
              <div className={`relative z-10 flex min-w-0 flex-1 flex-col ${pathname === "/workbench" ? "xl:min-h-0" : "min-h-screen"}`}>
                <TopBar state={state} ready={ready.data} />
                <BackendStatusBanner state={state} ready={ready.data} onRetry={retry} />
                <main id="main" className={`mx-auto w-full flex-1 ${pathname === "/workbench" ? "max-w-none p-0 xl:min-h-0 xl:overflow-hidden" : "max-w-6xl px-3 py-5 sm:px-6 sm:py-6"}`}>
                  {/* re-keyed per route so the page fades in; disabled by prefers-reduced-motion via motion-safe */}
                  <div key={pathname} className={`motion-safe:animate-fade-up ${pathname === "/workbench" ? "h-full" : ""}`}>
                    <Outlet />
                  </div>
                </main>
                {pathname === "/workbench" ? null : (
                  <footer className="mx-auto w-full max-w-6xl px-3 pb-6 text-xs text-ink-faint sm:px-6 print:hidden">{t("disclaimer")}</footer>
                )}
              </div>
            </div>
          </FeedbackDialogProvider>
        </EvidenceDrawerProvider>
      </ToastProvider>
    </DisclaimerContext.Provider>
  );
}
