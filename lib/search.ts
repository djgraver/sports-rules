import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import type { RuleChunk, SportId, SportIndexFile } from "./types.ts";

interface Loaded {
  file: SportIndexFile;
  index: MiniSearch<RuleChunk>;
  byId: Map<string, RuleChunk>;
}

const cache = new Map<SportId, Loaded | null>();

export function loadSport(sport: SportId, dir = path.join(process.cwd(), "data", "rules")): Loaded | null {
  if (cache.has(sport)) return cache.get(sport)!;
  const file = path.join(dir, `${sport}.json`);
  if (!existsSync(file)) {
    cache.set(sport, null);
    return null;
  }
  const data: SportIndexFile = JSON.parse(readFileSync(file, "utf8"));
  const index = new MiniSearch<RuleChunk>({
    fields: ["ref", "title", "section", "text"],
    storeFields: [],
    searchOptions: { boost: { ref: 3, section: 2, title: 1.5 }, fuzzy: 0.2, prefix: true, combineWith: "OR" },
  });
  index.addAll(data.chunks);
  const loaded = { file: data, index, byId: new Map(data.chunks.map((c) => [c.id, c])) };
  cache.set(sport, loaded);
  return loaded;
}

/**
 * Runs several queries and merges the results. A chunk that matches several
 * queries ranks higher than one that matches a single query strongly.
 */
export function searchRules(sport: SportId, queries: string[], limit = 12): RuleChunk[] {
  const loaded = loadSport(sport);
  if (!loaded) return [];
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

export function _clearCache() {
  cache.clear();
}
