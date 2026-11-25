import MiniSearch from "minisearch";
import type { RuleChunk, SportIndexFile } from "./types.ts";

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
