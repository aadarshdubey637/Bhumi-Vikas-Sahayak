// Client-side checks for the account forms. They mirror the server's rules for fast feedback; the server stays authoritative and its
// answers (field codes) are mapped back onto the same fields. Messages are i18n keys.
import { isApiError } from "@/api/errors";

export const EMAIL_RE = /^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const MIN_PASSWORD = 8;

export function emailProblem(v: string): string | undefined {
  const e = v.trim();
  if (!e) return "auth.err.required";
  if (e.length > 254 || !EMAIL_RE.test(e)) return "auth.err.email";
  return undefined;
}

/** Same codes the server returns (password_problems), so one translation table serves both. */
export function passwordProblems(password: string, email = "", name = ""): string[] {
  const out: string[] = [];
  if (password.length < MIN_PASSWORD) out.push("too_short");
  if (password.length > 128) out.push("too_long");
  if (!/[A-Za-zऄ-ह]/.test(password) || !/\d/.test(password)) out.push("needs_letter_and_digit");
  const low = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if ((local.length >= 4 && low.includes(local)) || ["password1", "password123", "12345678a", "qwerty123"].includes(low)) out.push("too_guessable");
  const n = name.toLowerCase().replace(/\s+/g, "");
  if (n.length >= 4 && low.replace(/\s+/g, "").includes(n)) out.push("contains_name");
  return out;
}

export const passwordProblemKey = (code: string): string => `auth.err.pw.${code}`;

/** 0-4, advisory only (the real rule is passwordProblems). */
export function passwordStrength(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

export interface FormErrors {
  fields: Record<string, string>;
  /** i18n key (or server text) for a message that belongs to the whole form */
  general?: string;
}

/** Turns an API failure into field errors and one form-level message. */
export function mapAuthError(e: unknown, fieldNames: string[]): FormErrors {
  if (!isApiError(e)) return { fields: {}, general: "auth.err.generic" };
  if (e.status === 0) return { fields: {}, general: "auth.err.network" };
  if (e.status === 401) return { fields: {}, general: "auth.err.invalidCredentials" };
  if (e.status === 429 && e.code === "account_locked") return { fields: {}, general: "auth.err.locked" };
  if (e.status === 429) return { fields: {}, general: "auth.err.rateLimited" };
  if (e.status === 403 && e.code === "registration_closed") return { fields: {}, general: "auth.err.registrationClosed" };
  if (e.status === 409) return { fields: { email: "auth.err.emailTaken" }, general: undefined };
  if (e.status === 422) {
    const fields: Record<string, string> = {};
    for (const d of e.details) {
      const loc = Array.isArray(d.loc) ? (d.loc as unknown[]) : [];
      const field = String(loc[loc.length - 1] ?? "");
      const msg = typeof d.msg === "string" ? d.msg : "";
      if (!fieldNames.includes(field) || fields[field]) continue;
      if (field === "password") fields[field] = passwordProblemKey(msg);
      else if (field === "token") fields[field] = "auth.err.resetInvalid";
      else if (msg.includes("invalid_email")) fields[field] = "auth.err.email";
      else fields[field] = "auth.err.invalidValue";
    }
    return Object.keys(fields).length ? { fields } : { fields: {}, general: "auth.err.invalidValue" };
  }
  return { fields: {}, general: e.status >= 500 ? "auth.err.server" : "auth.err.generic" };
}

/** Only same-app paths may be a post-login destination (no open redirect). */
export const safeNext = (from: unknown): string =>
  typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !/^\/(login|signup|forgot-password|reset-password)/.test(from) ? from : "/dashboard";
