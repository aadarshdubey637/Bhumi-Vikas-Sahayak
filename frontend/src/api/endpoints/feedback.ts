import { request } from "../client";
import type { FeedbackCreate, FeedbackOut, FeedbackPage } from "../types";

export const createFeedback = (body: FeedbackCreate) => request<FeedbackOut>("POST", "/feedback", { body });
export const listFeedback = (p: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<FeedbackPage>("GET", "/feedback", { query: { limit: p.limit, offset: p.offset }, signal });
