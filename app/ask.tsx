"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface SportOption {
  id: string;
  name: string;
  governingBodies: string;
  loaded: boolean;
  documents: string[];
  officialPages: { name: string; url: string }[];
}

interface Source {
  ref: string;
  title: string;
  section: string;
  source: string;
  page: number;
  url?: string;
  text: string;
}

const EXAMPLES: Record<string, string> = {
  soccer: "Our keeper picked up the ball after a defender headed it back to him. Is that a free kick?",
  "ice-hockey": "A player's stick broke and he kept playing with the shaft. What's the call?",
  "inline-hockey": "Can a player play the puck with a stick that's above shoulder height?",
  cricket: "The ball hit the helmet lying behind the keeper. What happens?",
};

export default function Ask({ sports }: { sports: SportOption[] }) {
  const [sport, setSport] = useState(sports.find((s) => s.loaded)?.id ?? sports[0].id);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const current = sports.find((s) => s.id === sport)!;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setAnswer("");
    setSources([]);
    setError("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sport, question }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotHeader = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!gotHeader) {
          const nl = buffer.indexOf("\n");
          if (nl === -1) continue;
          const header = JSON.parse(buffer.slice(0, nl));
          setSources(header.sources ?? []);
          buffer = buffer.slice(nl + 1);
          gotHeader = true;
        }
        setAnswer(buffer);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <form onSubmit={ask} className="card">
        <label htmlFor="sport">Sport</label>
        <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
          {sports.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.loaded}>
              {s.name}
              {s.loaded ? "" : " (rules not loaded yet)"}
            </option>
          ))}
        </select>
        <p className="muted">{current.governingBodies}</p>
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
          {busy ? "Checking the rulebook…" : "Ask"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {(answer || (busy && sources.length > 0)) && (
        <article className="card answer">
          <ReactMarkdown>{answer || "_Thinking…_"}</ReactMarkdown>
        </article>
      )}

      {sources.length > 0 && (
        <details className="card">
          <summary>Rules consulted ({sources.length})</summary>
          <ol className="sources">
            {sources.map((s, i) => (
              <li key={i}>
                <strong>{s.ref || s.title}</strong>
                {s.ref && s.title ? ` ${s.title}` : ""}
                {s.section ? ` · ${s.section}` : ""}
                <div className="muted">
                  {s.source}, page {s.page}
                  {s.url && (
                    <>
                      {" · "}
                      <a href={`${s.url}#page=${s.page}`} target="_blank" rel="noreferrer">
                        open PDF
                      </a>
                    </>
                  )}
                </div>
                <p>{s.text.length > 400 ? s.text.slice(0, 400) + "…" : s.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
