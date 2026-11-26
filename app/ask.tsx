"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { makeClient, planSearches, streamAnswer } from "@/lib/answer.ts";
import { buildIndex, buildScenarioIndex, searchRules, searchScenarios, type LoadedScenarios, type LoadedSport } from "@/lib/search.ts";
import { getSport } from "@/lib/sources.ts";
import type { RuleChunk, Scenario, ScenarioFile, SportIndexFile } from "@/lib/types.ts";

export interface SportOption {
  id: string;
  name: string;
  governingBodies: string;
  loaded: boolean;
  documents: { name: string; kind: string }[];
  scenarioCount: number;
}

const EXAMPLES: Record<string, string> = {
  "inline-hockey": "A defender closed his hand on the puck and dropped it to his own stick. Is that a penalty?",
  "ice-hockey": "A player's stick broke and he kept playing with the shaft. What's the call?",
  soccer: "Our keeper picked up the ball after a defender headed it back to him. Is that a free kick?",
  cricket: "The ball hit the helmet lying behind the keeper. What happens?",
  netball: "The goal attack caught a rebound with one foot over the circle line. Can she shoot?",
  basketball: "A player caught the ball, landed on one foot, then jumped off it and landed on both. Travel?",
  afl: "A player marked the ball but it touched an opponent's fingertips first. Is it still a mark?",
};

const KEY_STORAGE = "rulesref.anthropicKey";
const DEFAULT_STORAGE = "rulesref.defaultSport";

function store(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) ?? "";
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private browsing or storage blocked: settings just won't persist.
  }
  return value ?? "";
}

export default function Ask({ sports, defaultSport, basePath }: { sports: SportOption[]; defaultSport: string; basePath: string }) {
  const firstLoaded = sports.find((s) => s.loaded)?.id ?? sports[0].id;
  const [sport, setSport] = useState(sports.find((s) => s.id === defaultSport && s.loaded) ? defaultSport : firstLoaded);
  const [myDefault, setMyDefault] = useState(defaultSport);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<RuleChunk[]>([]);
  const [matches, setMatches] = useState<Scenario[]>([]);
  const [searched, setSearched] = useState(false);
  const [browse, setBrowse] = useState<Scenario[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const indexes = useRef(new Map<string, LoadedSport>());
  const scenarioIndexes = useRef(new Map<string, LoadedScenarios | null>());
  const current = sports.find((s) => s.id === sport)!;

  // Restore this browser's settings.
  useEffect(() => {
    setApiKey(store(KEY_STORAGE));
    const saved = store(DEFAULT_STORAGE);
    if (saved && sports.some((s) => s.id === saved && s.loaded)) {
      setMyDefault(saved);
      setSport(saved);
    }
  }, [sports]);

  async function loadIndex(id: string): Promise<LoadedSport> {
    const cached = indexes.current.get(id);
    if (cached) return cached;
    const res = await fetch(`${basePath}/rules/${id}.json`);
    if (!res.ok) throw new Error("Couldn't load that rulebook.");
    const loaded = buildIndex((await res.json()) as SportIndexFile);
    indexes.current.set(id, loaded);
    return loaded;
  }

  async function loadScenarios(id: string): Promise<LoadedScenarios | null> {
    if (scenarioIndexes.current.has(id)) return scenarioIndexes.current.get(id)!;
    let loaded: LoadedScenarios | null = null;
    try {
      const res = await fetch(`${basePath}/scenarios/${id}.json`);
      if (res.ok) loaded = buildScenarioIndex((await res.json()) as ScenarioFile);
    } catch {
      // No scenarios for this sport: rules search still works.
    }
    scenarioIndexes.current.set(id, loaded);
    return loaded;
  }

  // Changing sport clears the previous sport's results.
  useEffect(() => {
    setAnswer("");
    setSources([]);
    setMatches([]);
    setSearched(false);
    setBrowse(null);
  }, [sport]);

  async function toggleBrowse() {
    if (browse) return setBrowse(null);
    const loaded = await loadScenarios(sport);
    setBrowse(loaded?.file.scenarios ?? []);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    const info = getSport(sport);
    if (!q || busy || !info) return;
    setBusy(true);
    setAnswer("");
    setSources([]);
    setMatches([]);
    setBrowse(null);
    setError("");
    try {
      const [loaded, scenarios] = await Promise.all([loadIndex(sport), loadScenarios(sport)]);
      setMatches(scenarios ? searchScenarios(scenarios, q) : []);
      setSearched(true);
      if (!apiKey) {
        // No key: plain keyword search over the rulebook.
        setSources(searchRules(loaded, [q], 8));
        return;
      }
      const client = makeClient(apiKey);
      const searches = await planSearches(client, info, q);
      const chunks = searchRules(loaded, searches, 12);
      setSources(chunks);
      let text = "";
      for await (const part of streamAnswer(client, info, q, chunks)) {
        text += part;
        setAnswer(text);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 401
          ? "That API key wasn't accepted. Check it in Settings."
          : status === 429
            ? "Too many questions right now. Try again in a minute."
            : (err as Error).message || "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pdfUrl = (c: RuleChunk) => {
    const doc = indexes.current.get(c.sport)?.file.documents.find((d) => d.source === c.source);
    return doc ? `${doc.url}#page=${c.page}` : undefined;
  };

  return (
    <section>
      <form onSubmit={ask} className="card">
        <div className="row">
          <label htmlFor="sport">Sport</label>
          <button type="button" className="link" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Close settings" : "Settings"}
          </button>
        </div>
        <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
          {sports.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.loaded}>
              {s.name}
              {s.loaded ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
        <p className="muted">
          {current.governingBodies}
          {sport !== myDefault && (
            <>
              {" · "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  store(DEFAULT_STORAGE, sport);
                  setMyDefault(sport);
                }}
              >
                Make this my default
              </button>
            </>
          )}
        </p>

        {showSettings && (
          <div className="settings">
            <p>
              <strong>Optional: AI answers.</strong> Paste an Anthropic API key to get a written answer for situations
              the common calls don&apos;t cover. Anthropic charges for each question, billed to your key.
            </p>
            <label htmlFor="key">Anthropic API key (paid)</label>
            <input
              id="key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              onBlur={() => store(KEY_STORAGE, apiKey)}
            />
            <p className="muted">
              Stored only in this browser and sent only to Anthropic. Everything else in the app works without it.
            </p>
          </div>
        )}

        <label htmlFor="q">What happened?</label>
        <textarea
          id="q"
          rows={4}
          value={question}
          placeholder={EXAMPLES[sport]}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(e);
          }}
        />
        <button type="submit" disabled={busy || !question.trim() || !current.loaded}>
          {busy ? "Checking the rulebook…" : apiKey ? "Ask (AI answer)" : "Find the call"}
        </button>
        {current.scenarioCount > 0 && (
          <button type="button" className="link browse" onClick={toggleBrowse}>
            {browse ? "Hide common calls" : `Browse ${current.scenarioCount} common calls for ${current.name}`}
          </button>
        )}
      </form>

      {browse && (
        <section className="card">
          <h2>Common calls: {current.name}</h2>
          <ul className="browse-list">
            {browse.map((s) => (
              <li key={s.id}>
                <button type="button" className="link" onClick={() => { setMatches([s]); setBrowse(null); setSearched(true); setSources([]); setAnswer(""); }}>
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matches.map((s) => (
        <ScenarioCard key={s.id} s={s} />
      ))}

      {searched && !busy && matches.length === 0 && current.scenarioCount > 0 && sources.length > 0 && (
        <p className="muted">No common call matches that exactly. Here are the closest rules.</p>
      )}

      {error && <p className="error">{error}</p>}

      {(answer || (busy && sources.length > 0)) && (
        <article className="card answer">
          <ReactMarkdown>{answer || "_Thinking…_"}</ReactMarkdown>
        </article>
      )}

      {!apiKey && sources.length > 0 && !busy && (
        <p className="muted">Want a written answer for something unusual? AI answers are an optional paid extra in Settings.</p>
      )}

      {sources.length > 0 && (
        <details className="card" open={!apiKey && matches.length === 0}>
          <summary>{apiKey ? "Rules consulted" : "Matching rules"} ({sources.length})</summary>
          <ol className="sources">
            {sources.map((s) => (
              <li key={s.id}>
                <strong>{s.ref || s.title}</strong>
                {s.ref && s.title ? ` ${s.title}` : ""}
                {s.section && s.section !== s.title ? ` · ${s.section}` : ""}
                {s.kind === "casebook" && <span className="tag">official ruling</span>}
                <div className="muted">
                  {s.source}, page {s.page}
                  {pdfUrl(s) && (
                    <>
                      {" · "}
                      <a href={pdfUrl(s)} target="_blank" rel="noreferrer">
                        open PDF
                      </a>
                    </>
                  )}
                </div>
                <p>{s.text.length > 500 ? s.text.slice(0, 500) + "…" : s.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ScenarioCard({ s }: { s: Scenario }) {
  return (
    <article className="card scenario">
      <p className="eyebrow">Common call</p>
      <h2>{s.title}</h2>
      <p>{s.situation}</p>
      <h3>What the rules say</h3>
      <ul>
        {s.rules.map((r) => (
          <li key={r.ref}>
            <strong>{r.ref}</strong> {r.says}
          </li>
        ))}
      </ul>
      {s.precedent.length > 0 && (
        <>
          <h3>Precedent</h3>
          <ul>
            {s.precedent.map((p) => (
              <li key={p.source}>
                <strong>{p.source}:</strong> {p.says}
              </li>
            ))}
          </ul>
        </>
      )}
      {s.readings.length > 0 && (
        <>
          <h3>Both sides</h3>
          <ul>
            {s.readings.map((r) => (
              <li key={r.label}>
                <strong>{r.label}:</strong> {r.argument}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="best-call">
        <h3>
          Best call <span className={`tag confidence-${s.confidence.toLowerCase()}`}>{s.confidence} confidence</span>
        </h3>
        <p>{s.best_call}</p>
      </div>
    </article>
  );
}
