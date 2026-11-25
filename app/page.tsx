import { SPORTS } from "@/lib/sources.ts";
import { loadSport } from "@/lib/search.ts";
import Ask from "./ask.tsx";

export const dynamic = "force-dynamic";

export default function Home() {
  const sports = SPORTS.map((s) => {
    const loaded = loadSport(s.id);
    return {
      id: s.id,
      name: s.name,
      governingBodies: s.governingBodies,
      loaded: !!loaded,
      documents: loaded?.file.documents.map((d) => d.source) ?? [],
      officialPages: s.docs.map((d) => ({ name: d.name, url: d.officialPage })),
    };
  });
  return (
    <main>
      <header>
        <h1>Rules Ref</h1>
        <p>Ask about a situation from your game. Answers quote the official rulebook, and when the rules are unclear you get both sides and a best call.</p>
      </header>
      <Ask sports={sports} />
      <footer>
        Rulebooks are the property of their governing bodies and are linked from their official sites. Answers are a guide for amateur sport, not an official ruling. Your competition&apos;s by-laws take precedence.
      </footer>
    </main>
  );
}
