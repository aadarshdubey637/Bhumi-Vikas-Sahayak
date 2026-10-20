import { request } from "../client";
import type { ReportOut } from "../types";

/** Generates or regenerates the stored report from the saved snapshot. No body. */
export const generateReport = (assessmentId: string) =>
  request<ReportOut>("POST", `/assessments/${encodeURIComponent(assessmentId)}/report`);
/** 404 means no report has been generated yet. */
export const getReport = (assessmentId: string, signal?: AbortSignal) =>
  request<ReportOut>("GET", `/assessments/${encodeURIComponent(assessmentId)}/report`, { signal });
