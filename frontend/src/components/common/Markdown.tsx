import { Fragment, type ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown for chat answers: headings, bullet / numbered lists (indent = nesting), paragraphs,
 * **bold**, *italic* and `code`. Everything is rendered as React elements, never as HTML, so model output cannot inject markup.
 */
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: Array<{ level: number; text: string }> };

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,4}\s+(.*)$/;

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] }); // blank line closes the current block
      continue;
    }
    const h = HEADING.exec(line.trim());
    if (h) {
      blocks.push({ kind: "h", level: line.trim().indexOf(" "), text: h[1] ?? "" });
      continue;
    }
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    const m = b ?? n;
    if (m) {
      const ordered = !!n;
      const item = { level: Math.min(3, Math.floor((m[1] ?? "").replace(/\t/g, "    ").length / 3)), text: m[2] ?? "" };
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    if (last?.kind === "p" && last.lines.length > 0) last.lines.push(line.trim());
    else blocks.push({ kind: "p", lines: [line.trim()] });
  }
  return blocks.filter((x) => x.kind !== "p" || x.lines.length > 0);
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {parse(text).map((b, i) => {
        if (b.kind === "h")
          return (
            <h3 key={i} className="pt-1 text-base font-semibold">
              {inline(b.text)}
            </h3>
          );
        if (b.kind === "list") {
          const List = b.ordered ? "ol" : "ul";
          return (
            <List key={i} className={`space-y-1.5 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => (
                <li key={j} style={it.level ? { marginLeft: `${it.level * 1.25}rem` } : undefined}>
                  {inline(it.text)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
