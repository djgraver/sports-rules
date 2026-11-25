// Copies parsed rulebooks into public/ so the static site can fetch them.
import { cpSync, mkdirSync, readdirSync } from "node:fs";

mkdirSync("public/rules", { recursive: true });
for (const f of readdirSync("data/rules").filter((f) => f.endsWith(".json"))) {
  cpSync(`data/rules/${f}`, `public/rules/${f}`);
}
