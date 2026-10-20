import { isApiError } from "@/api/errors";

/** Friendly message + request id. The backend message is shown as plain text. */
export function errorKey(e: unknown): string {
  if (!isApiError(e)) return "errors.generic";
  switch (e.code) {
    case "unauthorized":
      return "errors.unauthorized";
    case "not_found":
      return "errors.notFound";
    case "payload_too_large":
      return "errors.tooLarge";
    case "rate_limited":
      return "errors.rateLimited";
    case "llm_unavailable":
      return "errors.llmUnavailable";
    case "timeout":
    case "client_timeout":
      return "errors.timeout";
    case "network_error":
    case "bad_gateway":
    case "service_unavailable":
      return "errors.network";
    case "internal_error":
      return "errors.internal";
    default:
      return "errors.generic";
  }
}
