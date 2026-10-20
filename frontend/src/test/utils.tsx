import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiKeyProvider } from "@/auth/ApiKeyProvider";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawer";
import { FeedbackDialogProvider } from "@/components/forms/FeedbackDialog";
import { shouldRetryQuery } from "@/api/errors";

export function renderPage(ui: ReactElement, opts: { path?: string; route?: string } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1 }, mutations: { retry: false } },
  });
  const route = opts.route ?? "/";
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <ApiKeyProvider>
          <EvidenceDrawerProvider>
            <FeedbackDialogProvider>
              <Routes>
                <Route path={opts.path ?? "*"} element={ui} />
              </Routes>
            </FeedbackDialogProvider>
          </EvidenceDrawerProvider>
        </ApiKeyProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}
