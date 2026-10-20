import { splitEvidenceIds } from "@/lib/linkify";
import { useEvidenceDrawer } from "./EvidenceDrawerContext";

/** Plain text with [EV-…] tokens turned into buttons. Whitespace preserved; never HTML. */
export function LinkedText({ text }: { text: string }) {
  const { open } = useEvidenceDrawer();
  return (
    <p className="whitespace-pre-wrap break-words">
      {splitEvidenceIds(text).map((s, i) =>
        s.type === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => open(s.value)}
            className="mx-0.5 rounded border border-line-strong bg-surface px-1.5 font-mono text-xs text-brand hover:bg-brand-tint"
          >
            {s.value}
          </button>
        ),
      )}
    </p>
  );
}
