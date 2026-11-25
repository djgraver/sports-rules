// Copies parsed rulebooks into public/ so the static site can fetch them.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";

mkdirSync("public/rules", { recursive: true });
if (!existsSync("data/rules")) {
  console.warn("data/rules not found: clone djgraver/sports-rules-data into ./data to include rulebooks.");
  process.exit(0);
}
for (const f of readdirSync("data/rules").filter((f) => f.endsWith(".json"))) {
  cpSync(`data/rules/${f}`, `public/rules/${f}`);
}
