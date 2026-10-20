import { request } from "../client";
import type { RuleSearchRequest, RuleSearchResponse, RuleSummary, RuleVersionsResponse } from "../types";

export const searchRules = (body: RuleSearchRequest, signal?: AbortSignal) =>
  request<RuleSearchResponse>("POST", "/rules/search", { body, signal });

// rule ids such as "26-B" or "12 A" must be URL-encoded.
const enc = (ruleId: string) => encodeURIComponent(ruleId);

export const getRule = (ruleId: string, asOf?: string, signal?: AbortSignal) =>
  request<RuleSummary>("GET", `/rules/${enc(ruleId)}`, { query: { as_of: asOf }, signal });

export const getRuleVersions = (ruleId: string, asOf?: string, signal?: AbortSignal) =>
  request<RuleVersionsResponse>("GET", `/rules/${enc(ruleId)}/versions`, { query: { as_of: asOf }, signal });
