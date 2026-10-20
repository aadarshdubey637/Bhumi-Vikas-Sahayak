/** Honest one-word state for a channel, derived only from what the server reports (never from "it should work"). */
export type ChannelState = "notConfigured" | "configured" | "connectionOk" | "connectionFailed";

interface ChannelInfo {
  configured?: unknown;
  connection?: { ok?: unknown } | null;
}

export function channelState(info: Record<string, unknown> | undefined): ChannelState {
  const c = (info ?? {}) as ChannelInfo;
  if (!c.configured) return "notConfigured";
  if (c.connection && typeof c.connection === "object") return c.connection.ok ? "connectionOk" : "connectionFailed";
  return "configured";
}

export const CHANNEL_TONE: Record<ChannelState, string> = {
  notConfigured: "border-muted-line bg-muted-tint text-muted",
  configured: "border-pending-line bg-pending-tint text-pending",
  connectionOk: "border-verified-line bg-verified-tint text-verified",
  connectionFailed: "border-danger-line bg-danger-tint text-danger",
};
