import { request } from "../client";
import type { Evidence } from "../types";

export const getEvidence = (evidenceId: string, signal?: AbortSignal) =>
  request<Evidence>("GET", `/evidence/${encodeURIComponent(evidenceId)}`, { signal });
