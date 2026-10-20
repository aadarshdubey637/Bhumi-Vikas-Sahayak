// Checks the colour tokens in src/index.css against WCAG 2.1 AA (4.5:1 for text, 3:1 for large text and UI borders).
// Run: node scripts/contrast-check.mjs   (exits 1 when a text pair fails)
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const block = (sel) => {
  const i = css.indexOf(sel);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--c-([a-z-]+):\s*(\d+) (\d+) (\d+)/g)].map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
};
const light = block(":root {");
const dark = { ...light, ...block(".theme-dark {") };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// [foreground, background, minimum, label]; "t:name" is a token, "#rrggbb" a fixed colour
const PAIRS = [
  ["t:ink", "t:surface", 4.5, "body text"],
  ["t:ink", "t:surface-page", 4.5, "body text on the page"],
  ["t:ink-soft", "t:surface", 4.5, "secondary text"],
  ["t:ink-soft", "t:surface-sunken", 4.5, "secondary text on tinted panels"],
  ["t:ink-faint", "t:surface", 4.5, "hint text"],
  ["t:ink-faint", "t:surface-sunken", 4.5, "hint text on tinted panels"],
  ["t:brand", "t:surface", 4.5, "links and primary actions"],
  ["t:brand", "t:brand-tint", 4.5, "brand on its tint"],
  ["t:verified", "t:verified-tint", 4.5, "confirmed / within limit"],
  ["t:verified", "t:surface", 4.5, "confirmed text on a card"],
  ["t:pending", "t:pending-tint", 4.5, "needs your input / pending"],
  ["t:pending", "t:surface", 4.5, "pending text on a card"],
  ["t:danger", "t:danger-tint", 4.5, "problem / needs fixing"],
  ["t:danger", "t:surface", 4.5, "problem text on a card"],
  ["t:info", "t:info-tint", 4.5, "explanation / conditional"],
  ["t:muted", "t:muted-tint", 4.5, "not covered / not checked"],
  ["t:accent-text", "t:surface", 4.5, "amber text on a card"],
  ["t:accent-text", "t:surface-sunken", 4.5, "amber text on tinted panels"],
  ["#ffffff", "t:brand", 4.5, "white on a brand button"],
  ["#070e1b", "#f5b301", 4.5, "navy on the amber button"],
  ["#ffffff", "#0b2a5b", 4.5, "white on the government-navy bars"],
  ["#b9c3d6", "#0b2a5b", 4.5, "sidebar secondary text on navy (ink-soft in the dark set)"],
  ["t:line-strong", "t:surface", 3, "input and card borders (UI components need 3:1)"],
];
const themes = { light, dark };
let failed = 0;
for (const [name, tokens] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [fg, bg, min, label] of PAIRS) {
    if (name === "dark" && (fg.startsWith("#") || bg.startsWith("#"))) continue;
    const get = (c) => (c.startsWith("#") ? hex(c) : tokens[c.slice(2)]);
    const [a, b] = [get(fg), get(bg)];
    if (!a || !b) {
      console.log(`  ?     ${label}: token missing`);
      failed++;
      continue;
    }
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (needs ${min})  ${label}`);
  }
}
console.log(failed ? `\n${failed} pair(s) below the minimum` : "\nall pairs meet WCAG 2.1 AA");
process.exit(failed ? 1 : 0);
