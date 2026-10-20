import { request } from "../client";
import type { AssessmentPage, ProjectCreate, ProjectOut, ProjectPage, ProjectUpdate } from "../types";

export interface PageParams {
  limit?: number;
  offset?: number;
}

export const createProject = (body: ProjectCreate) => request<ProjectOut>("POST", "/projects", { body });
export const listProjects = (p: PageParams = {}, signal?: AbortSignal) =>
  request<ProjectPage>("GET", "/projects", { query: { limit: p.limit, offset: p.offset }, signal });
export const getProject = (id: string, signal?: AbortSignal) =>
  request<ProjectOut>("GET", `/projects/${encodeURIComponent(id)}`, { signal });
export const updateProject = (id: string, body: ProjectUpdate) =>
  request<ProjectOut>("PATCH", `/projects/${encodeURIComponent(id)}`, { body });
export const listProjectAssessments = (id: string, p: PageParams = {}, signal?: AbortSignal) =>
  request<AssessmentPage>("GET", `/projects/${encodeURIComponent(id)}/assessments`, {
    query: { limit: p.limit, offset: p.offset },
    signal,
  });

/** Validates an access key by calling an authenticated endpoint with it. Resolves on 200, throws ApiError (401 etc.) otherwise. */
export const verifyAccessKey = (key: string) =>
  request<ProjectPage>("GET", "/projects", { query: { limit: 1 }, apiKeyOverride: key, silent401: true });
