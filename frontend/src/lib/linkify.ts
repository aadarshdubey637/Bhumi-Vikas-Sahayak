export type Segment = { type: "text"; value: string } | { type: "evidence"; value: string };

// Real shapes: EV-21-002-f9a2941e, EV-26b-001-ab12cd34, EV-12-emb-ab12cd34 (always in square brackets in answers).
const EVIDENCE_RE = /\[(EV-[0-9]+[A-Za-z]?-(?:\d{3,}|emb)-[0-9a-f]{8})\]/g;

/** Splits text into plain text and evidence-id tokens. Output is rendered as React nodes, never as HTML. */
export function splitEvidenceIds(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(EVIDENCE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    out.push({ type: "evidence", value: m[1] ?? "" });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
