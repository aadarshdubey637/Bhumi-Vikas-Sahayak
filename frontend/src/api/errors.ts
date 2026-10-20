import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: Array<Record<string, unknown>>;
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: Array<Record<string, unknown>>;
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
    this.retryAfter = init.retryAfter ?? null;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Narrow an unknown JSON value to the backend error envelope. */
export function parseErrorBody(value: unknown): ApiErrorBody | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== "string" || typeof v.message !== "string") return null;
  return {
    code: v.code,
    message: v.message,
    request_id: typeof v.request_id === "string" ? v.request_id : null,
    details: Array.isArray(v.details)
      ? (v.details.filter((d) => typeof d === "object" && d !== null) as Array<Record<string, unknown>>)
      : [],
  };
}

export interface MappedErrors {
  /** field name -> first meaningful message (server text, rendered as plain text). */
  fields: Record<string, string>;
  /** messages that could not be tied to a field. */
  general: string[];
}

const CONTAINERS = new Set(["inputs", "context"]);

/** Field name for a FastAPI `loc` such as ["body","inputs","plot_area","Measurement","value"]. */
export function fieldFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const segs = loc.map(String);
  const rest = segs[0] === "body" || segs[0] === "query" ? segs.slice(1) : segs;
  const first = rest[0];
  if (first === undefined) return null;
  if (CONTAINERS.has(first)) return rest[1] ?? null;
  return first;
}

/**
 * Maps both 422 detail shapes:
 *  1. FastAPI validation: {loc, msg, type}
 *  2. Business validation: {input, code, msg} or {msg}
 * Union types produce several entries per field; entries that are not "string_type" noise are preferred.
 */
export function mapValidationErrors(err: unknown): MappedErrors {
  const out: MappedErrors = { fields: {}, general: [] };
  if (!isApiError(err)) return out;
  const noise = (d: Record<string, unknown>) =>
    typeof d.type === "string" && d.type.startsWith("string_type");
  const ordered = [...err.details].sort((a, b) => Number(noise(a)) - Number(noise(b)));
  for (const d of ordered) {
    const msg = typeof d.msg === "string" ? d.msg : null;
    if (!msg) continue;
    const field = typeof d.input === "string" ? d.input : fieldFromLoc(d.loc);
    if (field) {
      if (!(field in out.fields)) out.fields[field] = msg;
    } else if (!out.general.includes(msg)) {
      out.general.push(msg);
    }
  }
  if (Object.keys(out.fields).length === 0 && out.general.length === 0 && err.message)
    out.general.push(err.message);
  return out;
}

/** True for failures worth an automatic retry of an idempotent GET. */
export function isTransient(e: unknown): boolean {
  if (!isApiError(e)) return false;
  return (
    e.code === "network_error" ||
    e.status === 502 ||
    e.status === 503 ||
    e.status === 504 ||
    e.code === "bad_gateway"
  );
}

export function shouldRetryQuery(failureCount: number, e: unknown): boolean {
  return failureCount < 2 && isTransient(e) && !(isApiError(e) && e.code === "llm_unavailable");
}
