import Anthropic from "@anthropic-ai/sdk";
import { planSearches, streamAnswer } from "@/lib/answer.ts";
import { searchRules, loadSport } from "@/lib/search.ts";
import { getSport } from "@/lib/sources.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST { sport, question }
 * Response: one JSON line {"sources": [...]} then the Markdown answer as plain streamed text.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sport?: string; question?: string };
  const sport = getSport(body.sport ?? "");
  const question = (body.question ?? "").trim().slice(0, 2000);
  if (!sport || !question) return Response.json({ error: "Pick a sport and ask a question." }, { status: 400 });
  if (!loadSport(sport.id)) {
    return Response.json({ error: `The ${sport.name} rulebook hasn't been loaded yet.` }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const searches = await planSearches(sport, question);
        const chunks = searchRules(sport.id, searches, 12);
        const doc = loadSport(sport.id)!.file.documents;
        const sources = chunks.map((c) => ({
          ref: c.ref,
          title: c.title,
          section: c.section,
          source: c.source,
          page: c.page,
          url: doc.find((d) => d.source === c.source)?.url,
          text: c.text,
        }));
        controller.enqueue(encoder.encode(JSON.stringify({ sources, searches }) + "\n"));
        for await (const text of streamAnswer(sport, question, chunks)) {
          controller.enqueue(encoder.encode(text));
        }
      } catch (e) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? "The server's Anthropic API key is missing or invalid."
            : e instanceof Anthropic.RateLimitError
              ? "Too many questions right now. Try again in a minute."
              : e instanceof Anthropic.APIError
                ? `The AI service returned an error (${e.status}).`
                : "Something went wrong.";
        console.error(e);
        controller.enqueue(encoder.encode(`\n\n_${msg}_`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
