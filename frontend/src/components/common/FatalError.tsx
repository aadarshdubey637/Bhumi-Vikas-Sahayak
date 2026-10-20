import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useRouteError } from "react-router-dom";
import { btn, btnPrimary } from "@/lib/ui";

/** Full-page fallback for an unexpected render error. Shows no stack trace or internals; the details go to the console only. */
export function FatalErrorView({ error }: { error?: unknown }) {
  const { t } = useTranslation();
  if (error) console.error("Unexpected UI error", error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-4">
      <div role="alert" className="glass-strong w-full max-w-md rounded-3xl p-7 text-center">
        <span aria-hidden="true" className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pending-tint text-pending">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{t("fatal.title")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("fatal.body")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>
            {t("fatal.reload")}
          </button>
          <a className={btn} href="/">
            {t("fatal.home")}
          </a>
        </div>
      </div>
    </div>
  );
}

/** react-router `errorElement`. */
export function RouteError() {
  return <FatalErrorView error={useRouteError()} />;
}

/** Catches errors thrown while rendering anything below it (outside the router). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: undefined as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
  }
  render() {
    return this.state.failed ? <FatalErrorView error={this.state.error} /> : this.props.children;
  }
}
