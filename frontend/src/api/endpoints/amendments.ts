import { request } from "../client";

export interface AmendmentAffects {
  rule: string;
  clause_path: string;
  relationship: string;
  verification_status: string;
}
export interface Amendment {
  amendment_id: string;
  title: string;
  verification_status: string;
  publication_date: string | null;
  effective_date: string | null;
  stated_date: string | null;
  source_url: string | null;
  summary: string | null;
  affects: AmendmentAffects[];
}
export interface AmendmentsResponse {
  items: Amendment[];
  note: string;
}

export const listAmendments = (signal?: AbortSignal) => request<AmendmentsResponse>("GET", "/amendments", { signal });
