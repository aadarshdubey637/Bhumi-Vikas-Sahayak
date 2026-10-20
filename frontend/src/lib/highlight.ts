export interface HighlightPart {
  text: string;
  match: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const edgePunct = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
// Words that say nothing about which rule is relevant; highlighting them only adds noise.
const STOP = new Set(["what", "is", "are", "the", "for", "and", "how", "much", "does", "do", "to", "in", "of", "a", "an", "about", "can", "i"]);

/**
 * Case-insensitive term highlighting by splitting into parts (no HTML injection). A term matches only at the start of a word
 * ("fee" highlights "fees" but not the "is" inside "permission"); \p{L} keeps this correct for Devanagari.
 */
export function splitHighlight(text: string, terms: string[]): HighlightPart[] {
  const clean = terms
    .map((t) => t.replace(edgePunct, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t.toLowerCase()));
  if (clean.length === 0 || text === "") return [{ text, match: false }];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${clean.map(escapeRe).join("|")})`, "giu");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ text: p, match: clean.some((c) => c.toLowerCase() === p.toLowerCase()) }));
}

export const queryTerms = (q: string | undefined): string[] => (q ? q.split(/\s+/).filter(Boolean) : []);
