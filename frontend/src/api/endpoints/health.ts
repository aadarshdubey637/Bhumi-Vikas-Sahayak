import { request, WARMUP_TIMEOUT_MS } from "../client";
import type { HealthOut, ReadyOut } from "../types";

/** warmup=true uses the 120 s timeout for cold-start hosts. */
export const getHealth = (opts: { warmup?: boolean; signal?: AbortSignal } = {}) =>
  request<HealthOut>("GET", "/health", {
    auth: false,
    signal: opts.signal,
    timeoutMs: opts.warmup ? WARMUP_TIMEOUT_MS : undefined,
  });

/** 503 carries the same ReadyOut body, so it is returned, not thrown. */
export const getReady = (signal?: AbortSignal) =>
  request<ReadyOut>("GET", "/ready", { auth: false, signal, okStatuses: [503] });
