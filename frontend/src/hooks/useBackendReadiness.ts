import { useQuery } from "@tanstack/react-query";
import { getHealth, getReady } from "@/api/endpoints/health";

export type BackendState = "warming" | "unreachable" | "not_ready" | "no_rules" | "ok";

/**
 * Warm-up /health (120 s timeout, handles cold starts), then /ready every 60 s while the tab is visible.
 * "no rules" keys off rules_loaded / checks.rules_loaded, not the HTTP status (/ready is 200 with zero rules).
 */
export function useBackendReadiness() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getHealth({ warmup: true, signal }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const ready = useQuery({
    queryKey: ["ready"],
    queryFn: ({ signal }) => getReady(signal),
    enabled: health.isSuccess,
    retry: false,
    // poll quickly while no rules are loaded (the server loads them as soon as they exist), calmly otherwise
    refetchInterval: (q) => (q.state.data && q.state.data.rules_loaded === 0 ? 8_000 : 60_000),
    refetchIntervalInBackground: false,
  });

  let state: BackendState = "ok";
  if (health.isPending) state = "warming";
  else if (health.isError || ready.isError) state = "unreachable";
  else if (ready.data) {
    if (ready.data.status === "not_ready") state = "not_ready";
    else if (ready.data.rules_loaded === 0 || ready.data.checks.rules_loaded === false) state = "no_rules";
  } else state = "warming";

  const retry = () => {
    void health.refetch();
    void ready.refetch();
  };
  return { state, health, ready, retry };
}
