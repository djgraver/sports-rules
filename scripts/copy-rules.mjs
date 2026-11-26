// Copies parsed rulebooks and grey-area scenarios into public/ so the static site can fetch them.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";

for (const dir of ["rules", "scenarios"]) {
  mkdirSync(`public/${dir}`, { recursive: true });
  if (!existsSync(`data/${dir}`)) {
    console.warn(`data/${dir} not found: clone djgraver/sports-rules-data into ./data to include it.`);
    continue;
  }
  for (const f of readdirSync(`data/${dir}`).filter((f) => f.endsWith(".json"))) {
    cpSync(`data/${dir}/${f}`, `public/${dir}/${f}`);
  }
}
