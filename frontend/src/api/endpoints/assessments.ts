import { request } from "../client";
import type { AssessmentCreate, AssessmentEvidenceList, AssessmentOut } from "../types";

export const createAssessment = (body: AssessmentCreate) =>
  request<AssessmentOut>("POST", "/assessments", { body });
export const getAssessment = (id: string, signal?: AbortSignal) =>
  request<AssessmentOut>("GET", `/assessments/${encodeURIComponent(id)}`, { signal });
export const getAssessmentEvidence = (id: string, signal?: AbortSignal) =>
  request<AssessmentEvidenceList>("GET", `/assessments/${encodeURIComponent(id)}/evidence`, { signal });
