import type { Evidence, Measurement } from "@/api/types";

export const isMeasurement = (v: unknown): v is Measurement =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Measurement).value === "string" &&
  typeof (v as Measurement).unit === "string";

/** Server strings are shown verbatim; never re-formatted through Number(). */
export const formatMeasurement = (m: Measurement): string => `${m.value} ${m.unit}`;

export function formatValue(v: unknown): string {
  if (isMeasurement(v)) return formatMeasurement(v);
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function formatDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { dateStyle: "medium" });
}

export const humanize = (s: string): string => {
  const t = s.replace(/[._]/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
};

/** Page text per page_precision. `exact` => "PDF page 35"; range => rule-level range note handled by the caller. */
export function pageInfo(e: Pick<Evidence, "page_start" | "page_end" | "page_precision">): {
  label: string;
  exact: boolean;
  pages: string | null;
} {
  const { page_start: s, page_end: en } = e;
  if (s === null && en === null) return { label: "", exact: false, pages: null };
  const pages = s !== null && en !== null && s !== en ? `${s}–${en}` : String(s ?? en);
  return { label: pages, exact: e.page_precision === "located_in_page_text", pages };
}

export const isHttpUrl = (u: string | null | undefined): u is string => {
  if (!u) return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
};

export const isMissingInformation = (m: unknown): m is import("@/api/types").MissingInformation =>
  typeof m === "object" && m !== null && "prerequisites_established" in m;
