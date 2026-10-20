// Exhaustive status -> presentation maps. `Record<Union, ...>` makes a missing case a compile error.
import type { AnswerStatus, CheckStatus, OverallStatus, Verification, VersionStatus } from "@/api/types";

export type Tone = "verified" | "pending" | "danger" | "info" | "muted";
export type IconName = "check" | "info" | "flag" | "help" | "alert" | "empty" | "x" | "clock" | "minus";
export interface StatusView {
  tone: Tone;
  icon: IconName;
}

export const ANSWER_VIEW: Record<AnswerStatus, StatusView> = {
  supported: { tone: "verified", icon: "check" },
  conditional: { tone: "info", icon: "info" },
  pending_verification: { tone: "pending", icon: "flag" },
  insufficient_information: { tone: "pending", icon: "help" },
  source_conflict: { tone: "danger", icon: "alert" },
  not_established: { tone: "muted", icon: "empty" },
};

export const CHECK_VIEW: Record<CheckStatus, StatusView> = {
  passed: { tone: "verified", icon: "check" },
  failed: { tone: "danger", icon: "x" },
  conditional: { tone: "info", icon: "info" },
  pending_verification: { tone: "pending", icon: "flag" },
  not_evaluated: { tone: "muted", icon: "minus" },
};

export const OVERALL_VIEW: Record<OverallStatus, StatusView> = {
  failed_checks_present: { tone: "danger", icon: "x" },
  incomplete: { tone: "pending", icon: "flag" },
  evaluated_checks_passed: { tone: "info", icon: "info" }, // deliberately not green: never "compliant"
};

export const VERIFICATION_VIEW: Record<Verification, StatusView> = {
  verified: { tone: "verified", icon: "check" },
  pending_verification: { tone: "pending", icon: "clock" },
  unverified: { tone: "pending", icon: "flag" },
  rejected: { tone: "danger", icon: "x" },
};

export const VERSION_VIEW: Record<VersionStatus, StatusView> = {
  verified_current: { tone: "verified", icon: "check" },
  historical: { tone: "info", icon: "info" },
  pending_verification: { tone: "pending", icon: "clock" },
  unknown_effective_date: { tone: "pending", icon: "clock" },
  insufficient_information: { tone: "pending", icon: "help" },
  source_conflict: { tone: "danger", icon: "alert" },
};

/** Unknown future values get a neutral view and the raw text; they never crash the UI. */
export function viewFor<K extends string>(map: Record<K, StatusView>, value: string): StatusView {
  return (map as Record<string, StatusView>)[value] ?? { tone: "muted", icon: "help" };
}

export const TONE_CLASS: Record<Tone, string> = {
  verified: "border-verified-line bg-verified-tint text-verified",
  pending: "border-pending-line bg-pending-tint text-pending",
  danger: "border-danger-line bg-danger-tint text-danger",
  info: "border-info-line bg-info-tint text-info",
  muted: "border-muted-line bg-muted-tint text-muted",
};
// "unverified" is amber-outline (not filled) so it reads as "expected, not alarming".
export const UNVERIFIED_CLASS = "border-pending-line bg-surface text-pending";

export const checkGroup = (checkId: string): "input" | "regulatory" | "other" =>
  checkId.startsWith("geometry.") ? "input" : checkId.startsWith("regulatory.") ? "regulatory" : "other";

/** Left accent edge of a card, by tone (static strings so Tailwind keeps them). */
export const TONE_ACCENT: Record<Tone, string> = {
  verified: "border-l-verified",
  pending: "border-l-pending",
  danger: "border-l-danger",
  info: "border-l-info",
  muted: "border-l-muted",
};
