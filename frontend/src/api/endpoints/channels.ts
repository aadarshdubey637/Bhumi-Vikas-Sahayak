import { request } from "../client";

export interface ChannelStatus {
  demo_enabled: boolean;
  whatsapp: Record<string, unknown>;
  voice: Record<string, unknown>;
  stt: Record<string, unknown>;
  recent_events: Record<string, unknown>[];
  recent_tests: Record<string, unknown>[];
  recent_errors: Record<string, unknown>[];
}
export interface CheckResult {
  provider: string;
  label: string;
  outcome: "passed" | "failed" | "not_configured";
  error_code?: string | null;
}
export interface SelfTest {
  ok: boolean;
  checks: { name: string; ok: boolean; note: string }[];
}
export interface DemoWhatsApp {
  simulated: true;
  label: string;
  messages: string[];
}
export interface DemoCall {
  simulated: true;
  label: string;
  say: { text: string; lang: string }[];
  listen: boolean;
  hangup: boolean;
  lang: string;
  next_n: number;
  misses: number;
  evidence_ids: string[];
}

export const getChannelStatus = (signal?: AbortSignal) => request<ChannelStatus>("GET", "/channels/status", { signal });
export const checkConnections = () => request<{ results: CheckResult[] }>("POST", "/channels/check-connection", { body: {} });
export const runSelfTest = () => request<SelfTest>("POST", "/channels/selftest", { body: {} });
export const demoWhatsApp = (body: { session_id: string; kind: "text" | "voice_note" | "image"; text?: string; transcript?: string }) =>
  request<DemoWhatsApp>("POST", "/channels/demo/whatsapp", { body });
export const demoCall = (body: {
  session_id: string;
  event: "start" | "speech" | "silence" | "digit";
  speech?: string;
  digits?: string;
  n?: number;
  miss?: number;
  lang?: "hi-IN" | "en-IN";
  evidence_ids?: string[];
}) => request<DemoCall>("POST", "/channels/demo/call", { body });
