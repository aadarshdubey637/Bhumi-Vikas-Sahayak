import { splitHighlight } from "@/lib/highlight";

export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {splitHighlight(text, terms).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-pending-tint px-0.5 text-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
