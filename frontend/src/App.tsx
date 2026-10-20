import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ConfigError } from "@/components/common/ConfigError";
import { ErrorBoundary } from "@/components/common/FatalError";
import { shouldRetryQuery } from "@/api/errors";
import { apiBase } from "@/config/env";
import { router } from "@/router";

// Never auto-retry mutations (POST/PATCH). GET retry policy is set per-query in later milestones.
const queryClient = new QueryClient({
  defaultOptions: {
    // 30 s of freshness: moving between pages does not re-request what was just loaded (the API rate limit is per key/IP)
    queries: { retry: shouldRetryQuery, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: false },
  },
});

export default function App() {
  if (!apiBase.ok) return <ConfigError reason={apiBase.reason} />;
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
