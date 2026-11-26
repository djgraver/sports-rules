import MiniSearch from "minisearch";
import type { RuleChunk, Scenario, ScenarioFile, SportIndexFile } from "./types.ts";

export interface LoadedSport {
  file: SportIndexFile;
  index: MiniSearch<RuleChunk>;
  byId: Map<string, RuleChunk>;
}

/** Builds the in-memory search index for one sport. Works in the browser and in Node. */
export function buildIndex(data: SportIndexFile): LoadedSport {
  // Guard against duplicate ids from older ingests: keep every chunk, renaming repeats.
  const ids = new Set<string>();
  const chunks = data.chunks.map((c) => {
    let id = c.id;
    for (let n = 2; ids.has(id); n++) id = `${c.id}~${n}`;
    ids.add(id);
    return id === c.id ? c : { ...c, id };
  });
  const index = new MiniSearch<RuleChunk>({
    fields: ["ref", "title", "section", "text"],
    storeFields: [],
    searchOptions: { boost: { ref: 3, section: 2, title: 1.5 }, fuzzy: 0.2, prefix: true, combineWith: "OR" },
  });
  index.addAll(chunks);
  return { file: { ...data, chunks }, index, byId: new Map(chunks.map((c) => [c.id, c])) };
}

/**
 * Runs several queries and merges the results. A chunk that matches several
 * queries ranks higher than one that matches a single query strongly.
 */
export function searchRules(loaded: LoadedSport, queries: string[], limit = 12): RuleChunk[] {
  const scores = new Map<string, number>();
  for (const q of queries) {
    const results = loaded.index.search(q);
    const top = results[0]?.score ?? 1;
    results.slice(0, 30).forEach((r) => {
      // Normalise per query so one verbose query can't dominate.
      scores.set(String(r.id), (scores.get(String(r.id)) ?? 0) + r.score / top);
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => loaded.byId.get(id)!)
    .filter(Boolean);
}

export interface LoadedScenarios {
  file: ScenarioFile;
  index: MiniSearch<Scenario>;
  byId: Map<string, Scenario>;
}

/** Builds the search index for one sport's grey-area scenarios. */
export function buildScenarioIndex(data: ScenarioFile): LoadedScenarios {
  const index = new MiniSearch<Scenario>({
    fields: ["title", "tags", "situation", "rules", "readings", "best_call"],
    storeFields: [],
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : Object.values(x).join(" "))).join(" ");
      return String(v ?? "");
    },
    searchOptions: { boost: { title: 3, tags: 2.5, situation: 1.5 }, fuzzy: 0.2, prefix: true, combineWith: "OR" },
  });
  index.addAll(data.scenarios);
  return { file: data, index, byId: new Map(data.scenarios.map((s) => [s.id, s])) };
}

const STOP = new Set("a an and are at be but by can did do does for from has have he her his how i if in is it its my of on or our out she so that the their them then they this to was we were what when who why will with you your".split(" "));

/**
 * Finds the scenarios closest to a question. Weak matches (a single shared word,
 * or far below the best hit) are dropped so unrelated cards don't appear.
 */
export function searchScenarios(loaded: LoadedScenarios, question: string, limit = 3): Scenario[] {
  const words = question.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) ?? [];
  if (!words.length) return [];
  const results = loaded.index.search(words.join(" "));
  const top = results[0]?.score ?? 0;
  const minTerms = words.length > 1 ? 2 : 1;
  return results
    .filter((r) => r.score >= top * 0.4 && new Set(r.queryTerms).size >= minTerms)
    .slice(0, limit)
    .map((r) => loaded.byId.get(String(r.id))!)
    .filter(Boolean);
}
