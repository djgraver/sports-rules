import MiniSearch from "minisearch";
import type { RuleChunk, Scenario, ScenarioFile, SportIndexFile } from "./types.ts";

export interface LoadedSport {
  file: SportIndexFile;
  /** Rule numbers and headings only. */
  headings: MiniSearch<RuleChunk>;
  /** Rule body text only. */
  body: MiniSearch<RuleChunk>;
  byId: Map<string, RuleChunk>;
}

const STOP = new Set(
  "a an and any are as at be but by can did do does for from get got has have he her his how i if in into is it its me my no not of on or our out she so than that the their them then there they this to was we were what when where which who why will with you your".split(" "),
);

/** Lower-case words worth searching for: no filler words, no single letters. */
export function queryTerms(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w));
}

// Everyday words and the words rulebooks use instead. Either one matches.
const SYNONYMS: Record<string, string[]> = {
  goalie: ["goalkeeper", "goaltender"],
  keeper: ["goalkeeper", "wicketkeeper"],
  goalkeeper: ["goalie"],
  ref: ["referee"],
  ump: ["umpire"],
  sinbin: ["penalty"],
  bin: ["penalty"],
  ot: ["overtime"],
  backpass: ["deliberately", "kicked"],
  handball: ["handles", "handling", "hand"],
  hit: ["check", "checking"],
  stick: ["stick", "sticks"],
};

type Query = string | { combineWith: "AND" | "OR"; queries: Query[] };
const termQuery = (t: string): Query => (SYNONYMS[t] ? { combineWith: "OR", queries: [t, ...SYNONYMS[t]] } : t);

// Prefix and fuzzy matching only on longer words, so "a" or "is" can't match half the rulebook.
const fuzzyOpts = {
  prefix: (t: string) => t.length >= 4,
  fuzzy: (t: string) => (t.length >= 6 ? 0.2 : false),
};

/** Builds the in-memory search indexes for one sport. Works in the browser and in Node. */
export function buildIndex(data: SportIndexFile): LoadedSport {
  // Guard against duplicate ids from older ingests: keep every chunk, renaming repeats.
  const ids = new Set<string>();
  const chunks = data.chunks.map((c) => {
    let id = c.id;
    for (let n = 2; ids.has(id); n++) id = `${c.id}~${n}`;
    ids.add(id);
    return id === c.id ? c : { ...c, id };
  });
  const headings = new MiniSearch<RuleChunk>({
    fields: ["title", "section"],
    storeFields: [],
    searchOptions: { boost: { section: 1.5 }, ...fuzzyOpts },
  });
  const body = new MiniSearch<RuleChunk>({ fields: ["text"], storeFields: [], searchOptions: fuzzyOpts });
  headings.addAll(chunks);
  body.addAll(chunks);
  return { file: { ...data, chunks }, headings, body, byId: new Map(chunks.map((c) => [c.id, c])) };
}

const REF_QUERY = /^(?:rule|law|art(?:icle)?\.?|section|r)?\s*(\d{1,3}(?:\.\d{1,3})*)\.?\s*([a-z])?$/i;

/** "6.4.20", "Rule 6.4", "law 12" → the rules with that number, in rulebook order. */
function lookupRef(loaded: LoadedSport, q: string): RuleChunk[] | null {
  const m = q.trim().match(REF_QUERY);
  if (!m) return null;
  const num = m[1];
  return loaded.file.chunks.filter((c) => {
    const n = c.ref.match(/(\d+(?:\.\d+)*)$/)?.[1];
    return !!n && (n === num || n.startsWith(num + "."));
  });
}

/**
 * Quick lookup for one query. Results come in tiers:
 * headings containing every word, then headings containing at least half of them,
 * then rule text containing every word, then rule text containing some.
 * Typing a rule number ("6.4.20", "Law 12") jumps straight to that rule.
 */
export function lookup(loaded: LoadedSport, q: string, limit = 20): RuleChunk[] {
  const byRef = lookupRef(loaded, q);
  if (byRef?.length) return dedupe(loaded, byRef).slice(0, limit);
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const all = { combineWith: "AND", queries: terms.map(termQuery) } as const;
  const some = { combineWith: "OR", queries: terms.map(termQuery) } as const;
  const half = Math.ceil(terms.length / 2);
  const ranked: string[] = [];
  const add = (results: { id: unknown }[]) => results.forEach((r) => ranked.push(String(r.id)));
  // MiniSearch accepts nested query objects; its types only describe the top level.
  type Q = Parameters<LoadedSport["body"]["search"]>[0];
  add(loaded.headings.search(all as unknown as Q));
  if (terms.length > 1) add(loaded.headings.search(some as unknown as Q).filter((r) => new Set(r.queryTerms).size >= half));
  add(loaded.body.search(all as unknown as Q));
  if (terms.length > 1) add(loaded.body.search(some as unknown as Q));
  const seen = new Set<string>();
  const chunks = ranked.filter((id) => !seen.has(id) && seen.add(id)).map((id) => loaded.byId.get(id)!);
  return dedupe(loaded, chunks).slice(0, limit);
}

/**
 * Runs several queries (used by the optional AI answer) and merges the results by rank.
 */
export function searchRules(loaded: LoadedSport, queries: string[], limit = 12): RuleChunk[] {
  const scores = new Map<string, number>();
  for (const q of queries) {
    lookup(loaded, q, 30).forEach((c, i) => scores.set(c.id, (scores.get(c.id) ?? 0) + 1 / (i + 3)));
  }
  const chunks = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => loaded.byId.get(id)!);
  return dedupe(loaded, chunks).slice(0, limit);
}

/**
 * A national rulebook adapted from an international one repeats most rules word for word.
 * Keep each rule once, at its best position, using the copy from the document listed first.
 */
function dedupe(loaded: LoadedSport, chunks: RuleChunk[]): RuleChunk[] {
  const docOrder = new Map(loaded.file.documents.map((d, i) => [d.source, i]));
  const order = (c: RuleChunk) => docOrder.get(c.source) ?? 99;
  const byText = new Map<string, RuleChunk>();
  for (const c of chunks) {
    if (!c) continue;
    // Same rule number, heading and part in both books counts as the same rule.
    const num = c.ref.match(/(\d+(?:\.\d+)*)$/)?.[1];
    const part = c.id.match(/~\d+$/)?.[0] ?? "";
    const key = num
      ? `${num}|${(c.section || c.title).toLowerCase()}${part}`
      : c.text.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 300);
    const kept = byText.get(key);
    if (!kept || order(c) < order(kept)) byText.set(key, c);
  }
  return [...byText.values()];
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
    searchOptions: { boost: { title: 3, tags: 2.5, situation: 1.5 }, ...fuzzyOpts, combineWith: "OR" },
  });
  index.addAll(data.scenarios);
  return { file: data, index, byId: new Map(data.scenarios.map((s) => [s.id, s])) };
}


/**
 * Finds the scenarios closest to a question. Weak matches (a single shared word,
 * or far below the best hit) are dropped so unrelated cards don't appear.
 */
export function searchScenarios(loaded: LoadedScenarios, question: string, limit = 3): Scenario[] {
  const words = queryTerms(question);
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
