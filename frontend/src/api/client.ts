// The ONLY module that calls fetch. Pages and components use the typed functions in ./endpoints.
import { keyStore } from "@/auth/keyStore";
import { API_PREFIX, getApiBaseUrl } from "@/config/env";
import { ApiError, parseErrorBody } from "./errors";

export const DEFAULT_TIMEOUT_MS = 35_000;
export const WARMUP_TIMEOUT_MS = 120_000;

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Attach X-API-Key when a key is held. Default true. */
  auth?: boolean;
  timeoutMs?: number;
  /** Non-2xx statuses whose JSON body is returned instead of thrown (used for /ready 503). */
  okStatuses?: number[];
  /** Use this key instead of the stored one (access-key verification). */
  apiKeyOverride?: string;
  /** Do not run the global 401 handler (access-key verification). */
  silent401?: boolean;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedFired = false;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn;
}
/** Re-arm the once-per-session-key 401 handler (call after a key is entered). */
export function rearmUnauthorized() {
  unauthorizedFired = false;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = getApiBaseUrl() + API_PREFIX + path;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { body, query, signal, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, okStatuses = [] } = opts;
  // X-Requested-With: the server only accepts state-changing calls that carry it (CSRF guard for the session cookie).
  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "nirmaansetu" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const k = opts.apiKeyOverride ?? keyStore.getKey();
    if (k) headers["X-API-Key"] = k;
  }
  const sentKey = "X-API-Key" in headers;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include", // the HttpOnly session cookie; the browser attaches it, scripts cannot read it
      signal: controller.signal,
    });
  } catch (e) {
    if (timedOut) {
      throw new ApiError({ status: 0, code: "client_timeout", message: "The request took too long." });
    }
    if (signal?.aborted) throw e; // caller cancelled: let it propagate untouched
    throw new ApiError({ status: 0, code: "network_error", message: "Could not reach the server." });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }

  const requestId = res.headers.get("X-Request-ID");
  const json = await readJson(res);

  if (res.ok || okStatuses.includes(res.status)) {
    if (res.ok && auth && !sentKey) keyStore.markAuthOpen();
    return json as T;
  }

  const envelope = parseErrorBody(json);
  const err = envelope
    ? new ApiError({
        status: res.status,
        code: envelope.code,
        message: envelope.message,
        requestId: envelope.request_id ?? requestId,
        details: envelope.details,
        retryAfter: parseRetryAfter(res.headers.get("Retry-After")),
      })
    : new ApiError({
        status: res.status,
        code: res.status === 502 || res.status === 503 || res.status === 504 ? "bad_gateway" : "http_error",
        message: `Unexpected response (HTTP ${res.status}).`,
        requestId,
        retryAfter: parseRetryAfter(res.headers.get("Retry-After")),
      });

  if (
    err.status === 401 &&
    err.code === "unauthorized" &&
    !opts.silent401 &&
    unauthorizedHandler &&
    !unauthorizedFired
  ) {
    unauthorizedFired = true;
    unauthorizedHandler();
  }
  throw err;
}
