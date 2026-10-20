import { request } from "../client";
import type { DocumentsResponse } from "../types";

export const listDocuments = (signal?: AbortSignal) =>
  request<DocumentsResponse>("GET", "/documents", { signal });
