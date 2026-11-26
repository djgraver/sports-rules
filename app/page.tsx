import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SPORTS, DEFAULT_SPORT } from "@/lib/sources.ts";
import type { ScenarioFile, SportIndexFile } from "@/lib/types.ts";
import Ask, { type SportOption } from "./ask.tsx";

function scenarioCount(id: string): number {
  const file = path.join(process.cwd(), "data", "scenarios", `${id}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ScenarioFile).scenarios.length : 0;
}

// Runs at build time (static export): lists which rulebooks have been parsed.
function sportOptions(): SportOption[] {
  return SPORTS.map((s) => {
    const file = path.join(process.cwd(), "data", "rules", `${s.id}.json`);
    const data: SportIndexFile | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    return {
      id: s.id,
      name: s.name,
      governingBodies: s.governingBodies,
      loaded: !!data?.chunks.length,
      documents: data?.documents.map((d) => ({ name: d.source, kind: d.kind })) ?? [],
      scenarioCount: scenarioCount(s.id),
    };
  });
}

export default function Home() {
  return (
    <main>
      <header>
        <h1>Rules Ref</h1>
        <p>Describe a situation from your game. You get the matching common calls (both sides of the argument and a best call) and the official rules they come from.</p>
      </header>
      <Ask sports={sportOptions()} defaultSport={DEFAULT_SPORT} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />
      <footer>
        Rulebooks are the property of their governing bodies and are linked from their official sites. Answers are a guide for amateur sport, not an official ruling. Your competition&apos;s by-laws take precedence.
      </footer>
    </main>
  );
}
