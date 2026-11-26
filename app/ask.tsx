"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { makeClient, planSearches, streamAnswer } from "@/lib/answer.ts";
import { buildIndex, lookup, queryTerms, searchRules, type LoadedSport } from "@/lib/search.ts";
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
  "inline-hockey": "high stick, hand pass, 6.4.20",
  "ice-hockey": "icing, goal crease, Rule 69",
  soccer: "offside, handball, Law 12",
  cricket: "wide, LBW, Law 28",
  netball: "footwork, contact, Rule 13",
  basketball: "travelling, goaltending, Art. 25",
  afl: "holding the ball, 50 metre penalty, Law 18",
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
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<LoadedSport | null>(null);
  const [results, setResults] = useState<RuleChunk[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [answer, setAnswer] = useState("");
  const [consulted, setConsulted] = useState<RuleChunk[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [browse, setBrowse] = useState<Scenario[] | null>(null);
  const [picked, setPicked] = useState<Scenario | null>(null);
  const indexes = useRef(new Map<string, LoadedSport>());
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

  // Load the rulebook as soon as a sport is picked, so results appear while typing.
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setAnswer("");
    setConsulted([]);
    setBrowse(null);
    setPicked(null);
    setError("");
    const cached = indexes.current.get(sport);
    if (cached) {
      setLoaded(cached);
      return;
    }
    if (!current.loaded) return;
    fetch(`${basePath}/rules/${sport}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Couldn't load that rulebook.");
        return res.json() as Promise<SportIndexFile>;
      })
      .then((data) => {
        const idx = buildIndex(data);
        indexes.current.set(sport, idx);
        if (!cancelled) setLoaded(idx);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [sport, basePath, current.loaded]);

  // Search as you type.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      setResults(query.trim() ? lookup(loaded, query, 25) : []);
      setOpen(new Set());
    }, 120);
    return () => clearTimeout(t);
  }, [query, loaded]);

  async function toggleBrowse() {
    if (browse) return setBrowse(null);
    setPicked(null);
    try {
      const res = await fetch(`${basePath}/scenarios/${sport}.json`);
      setBrowse(res.ok ? ((await res.json()) as ScenarioFile).scenarios : []);
    } catch {
      setBrowse([]);
    }
  }

  // Optional, needs a paid API key: a written answer built from the matching rules.
  async function askAi(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    const info = getSport(sport);
    if (!q || busy || !info || !loaded || !apiKey) return;
    setBusy(true);
    setAnswer("");
    setConsulted([]);
    setError("");
    try {
      const client = makeClient(apiKey);
      const searches = await planSearches(client, info, q);
      const chunks = searchRules(loaded, searches, 12);
      setConsulted(chunks);
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
    const doc = loaded?.file.documents.find((d) => d.source === c.source);
    return doc ? `${doc.url}#page=${c.page}` : undefined;
  };
  const terms = useMemo(() => queryTerms(query), [query]);
  const primarySource = loaded?.file.documents[0]?.source;

  return (
    <section>
      <form onSubmit={askAi} className="card">
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
              <strong>Optional: AI answers.</strong> Paste an Anthropic API key to get a written answer to a question
              about a situation. Anthropic charges for each question, billed to your key.
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
            <p className="muted">Stored only in this browser and sent only to Anthropic. Everything else in the app works without it.</p>
          </div>
        )}

        <label htmlFor="q">Search the rules</label>
        <input
          id="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          placeholder={`e.g. ${EXAMPLES[sport] ?? "a rule name or number"}`}
          onChange={(e) => setQuery(e.target.value)}
        />
        {apiKey && (
          <button type="submit" disabled={busy || !query.trim() || !loaded}>
            {busy ? "Checking the rulebook…" : "Ask AI about this situation"}
          </button>
        )}
        {current.scenarioCount > 0 && (
          <button type="button" className="link browse" onClick={toggleBrowse}>
            {browse ? "Hide common calls" : `Browse ${current.scenarioCount} common calls for ${current.name}`}
          </button>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      {browse && (
        <section className="card">
          <h2>Common calls: {current.name}</h2>
          <ul className="browse-list">
            {browse.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setPicked(s);
                    setBrowse(null);
                  }}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {picked && <ScenarioCard s={picked} />}

      {(answer || busy) && (
        <article className="card answer">
          <ReactMarkdown>{answer || "_Thinking…_"}</ReactMarkdown>
          {consulted.length > 0 && <p className="muted">Based on {consulted.map((c) => c.ref).filter(Boolean).join(", ")}.</p>}
        </article>
      )}

      {query.trim() && loaded && (
        <section className="results">
          {results.length === 0 ? (
            <p className="muted">No rules mention that. Try a different word, or the rule number.</p>
          ) : (
            <ol className="hits">
              {results.map((c) => {
                const isOpen = open.has(c.id);
                return (
                  <li key={c.id} className="card hit">
                    <button
                      type="button"
                      className="hit-head"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpen((prev) => {
                          const next = new Set(prev);
                          if (isOpen) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    >
                      <span className="hit-ref">{c.ref || "Section"}</span>
                      <span className="hit-title">
                        <Highlight text={c.section && c.section !== c.title ? c.section : c.title} terms={terms} />
                        {c.section && c.section !== c.title && <span className="muted"> · {c.title}</span>}
                      </span>
                    </button>
                    <p className="hit-text">
                      <Highlight text={isOpen ? c.text : snippet(c.text, terms)} terms={terms} />
                    </p>
                    <div className="muted hit-meta">
                      {c.kind === "casebook" && <span className="tag">official ruling</span>}
                      {c.source !== primarySource && <span>{c.source} · </span>}
                      page {c.page}
                      {pdfUrl(c) && (
                        <>
                          {" · "}
                          <a href={pdfUrl(c)} target="_blank" rel="noreferrer">
                            open PDF
                          </a>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}

/** About 220 characters of rule text around the first search word. */
function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, lower.lastIndexOf(" ", Math.max(0, at - 60)));
  const end = Math.min(text.length, start + 220);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>;
  const rx = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(rx).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>))}
    </>
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
