import { useEffect, useState } from "react";
import { isApiError } from "@/api/errors";

/** Seconds left to wait after a 429 (from Retry-After; 5 s fallback). 0 when not rate limited. */
export function useRateLimitCountdown(error: unknown): number {
  const limited = isApiError(error) && error.code === "rate_limited";
  const initial = limited
    ? Math.max(1, Math.ceil((error as { retryAfter: number | null }).retryAfter ?? 5))
    : 0;
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    setLeft(initial);
    if (initial <= 0) return;
    const id = window.setInterval(
      () => setLeft((s) => (s <= 1 ? (window.clearInterval(id), 0) : s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [error, initial]);
  return left;
}
