import { request } from "../client";
import type { AskRequest, AskResponse } from "../types";

export const ask = (body: AskRequest, signal?: AbortSignal) =>
  request<AskResponse>("POST", "/ask", { body, signal });
