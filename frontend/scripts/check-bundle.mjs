// Fails the build if the production bundle contains forbidden strings (secrets, local URLs, test mocks).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const FORBIDDEN = [
  /localhost:8000/,
  /http:\/\/localhost/,
  /sk-ant/,
  /ANTHROPIC/,
  /API_KEY_HASHES/,
  /DATABASE_URL/,
  /POSTGRES_PASSWORD/,
  /mockServiceWorker/,
  /\bmsw\b/i,
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error("check-bundle: dist/ not found. Run `npm run build` first.");
  process.exit(1);
}
const hits = [];
for (const file of walk(DIST)) {
  if (!/\.(js|css|html|json|map|txt)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${file}: ${re}`);
}
if (hits.length) {
  console.error("check-bundle: forbidden content found:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("check-bundle: OK");
