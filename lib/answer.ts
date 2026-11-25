import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Sport } from "./sources.ts";
import type { RuleChunk } from "./types.ts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const client = new Anthropic();

const SearchPlan = z.object({
  searches: z
    .array(z.string())
    .describe("3 to 6 short keyword searches using the rulebook's own vocabulary"),
});

/**
 * Turns a casual question ("can the keeper pick up a back pass?") into searches
 * using rulebook wording ("goalkeeper handles ball deliberately kicked by team-mate").
 */
export async function planSearches(sport: Sport, question: string): Promise<string[]> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(SearchPlan) },
    system:
      "You write keyword searches against an official sports rulebook. Translate slang and casual " +
      "descriptions into the formal terms the rulebook uses (e.g. 'keeper' -> 'goalkeeper', " +
      "'sin bin' -> 'temporary dismissal' or 'penalty'). Cover each rule the situation might touch.",
    messages: [{ role: "user", content: `Sport: ${sport.name} (${sport.governingBodies})\nQuestion: ${question}` }],
  });
  const searches = res.parsed_output?.searches ?? [];
  return [question, ...searches].slice(0, 7);
}

const SYSTEM_PROMPT = `You help amateur players, coaches, parents and volunteer referees in Australia understand the official rules of their sport. They are not professionals, so use plain language and explain any jargon in a few words.

You are given numbered excerpts from the official rulebook (and sometimes official casebooks or interpretations). Base your answer on those excerpts. Cite the rule reference in square brackets after each claim, like [Law 12.2] or [Rule 116.1]. If an excerpt has no reference, cite its source and page, like [IIHF Rule Book p.42]. Never invent a rule number. If the excerpts don't cover the situation, say so plainly, then give your best understanding and label it as not confirmed by the loaded rules.

Write your answer in Markdown with these sections:

### Short answer
One to three sentences a player could read at the ground.

### What the rules say
The relevant rules, with short direct quotes where they decide the question.

### Precedent
Official rulings that cover this situation: casebook entries or official interpretations among the excerpts. You may also mention a well-known official ruling or clarification you are confident about from general knowledge, but say it isn't in the loaded documents and is worth checking. If there's nothing, write "No official ruling found for this exact situation."

### Grey area
Include this only when the rules can reasonably be read more than one way. Give "One reading" and "The other reading", each with the rules that support it. Then give **Best call:** what a sensible referee would most likely decide and why, with a confidence of High, Medium or Low.

Finish with one line noting that local competitions (juniors, social leagues, indoor variants) often modify the rules, so check the competition's by-laws when it matters.

Keep it concise: aim for under 350 words unless the situation genuinely needs more.`;

function formatExcerpts(chunks: RuleChunk[]): string {
  return chunks
    .map((c, i) => {
      const label = [c.ref, c.title, c.section].filter(Boolean).join(" - ");
      return `<excerpt n="${i + 1}" source="${c.source}" kind="${c.kind}" page="${c.page}">\n${label}\n${c.text}\n</excerpt>`;
    })
    .join("\n\n");
}

/** Streams the Markdown answer. Yields text fragments as they arrive. */
export async function* streamAnswer(sport: Sport, question: string, chunks: RuleChunk[]): AsyncGenerator<string> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // If a safety classifier declines, retry on a fallback model chosen by the API.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content:
          `Sport: ${sport.name} (${sport.governingBodies})\n\n` +
          `<excerpts>\n${chunks.length ? formatExcerpts(chunks) : "(no matching rules found)"}\n</excerpts>\n\n` +
          `Question: ${question}`,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield "\n\n_Sorry, I couldn't answer that one. Try rephrasing the situation._";
  } else if (final.stop_reason === "max_tokens") {
    yield "\n\n_(Answer was cut short.)_";
  }
}
