// The ONLY file allowed to read import.meta.env. The backend address comes from VITE_API_BASE_URL and nowhere else.

export const API_PREFIX = "/api/v1";

export type ApiBaseResult =
  | { ok: true; url: string }
  | { ok: false; reason: "missing" | "invalid" | "insecure" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Pure resolver (exported for tests). Strips trailing slashes; outside local hosts, production requires https. */
export function resolveApiBase(raw: string | undefined, isProduction: boolean): ApiBaseResult {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "missing" };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: "invalid" };
  if (isProduction && parsed.protocol !== "https:" && !LOCAL_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: "insecure" };
  }
  return { ok: true, url: value.replace(/\/+$/, "") };
}

// `npm run dev` falls back to the local backend so a fresh checkout works without creating .env.local. The fallback is guarded by
// import.meta.env.DEV, which Vite replaces with `false` in production builds (the dead branch is removed, and scripts/check-bundle.mjs
// fails the build if "localhost:8000" survives). Production builds therefore still REQUIRE an explicit https VITE_API_BASE_URL.
const DEV_FALLBACK = import.meta.env.DEV ? "http://localhost:8000" : undefined;

export const apiBase: ApiBaseResult = resolveApiBase(
  import.meta.env.VITE_API_BASE_URL || DEV_FALLBACK,
  import.meta.env.PROD,
);

/** Throws if the base URL is unusable. API code calls this; the UI shows ConfigError before that can happen. */
export function getApiBaseUrl(): string {
  if (!apiBase.ok) throw new Error(`VITE_API_BASE_URL is not usable (${apiBase.reason}).`);
  return apiBase.url;
}
