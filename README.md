# Rules Ref

Plain-language answers to rules questions for amateur sport in Australia, grounded in the official rulebooks.

Ask about a situation from your game and you get:

- a short answer you can read at the ground,
- the relevant rules, quoted with their numbers (e.g. `[Law 12.2]`),
- any official ruling (casebook or interpretation) that covers it,
- and when the rules are genuinely unclear, both readings plus a best call with a confidence level.

## Sports and sources

| Sport | Rulebook | Used in Australia by |
|---|---|---|
| Soccer | IFAB Laws of the Game 2026/27 | Football Australia |
| Ice hockey | IIHF Rule Book 2026-27 | Ice Hockey Australia |
| Inline hockey | World Skate Inline Hockey Rulebook 2027 | Skate Australia |
| Cricket | MCC Laws of Cricket (2017 Code, 3rd Ed. 2022) | Cricket Australia (club cricket) |

Source URLs and heading patterns live in [`lib/sources.ts`](lib/sources.ts).

## How it works

1. **Ingest** (`npm run ingest`): downloads each PDF from the governing body, extracts text with `pdftotext`, and splits it into numbered rule sections (`lib/split.ts`). Output goes to `data/rules/<sport>.json`. A GitHub Action re-runs this monthly and opens a PR when a rulebook changes.
2. **Search** (`lib/search.ts`): BM25 keyword search (MiniSearch) over the rule sections.
3. **Answer** (`lib/answer.ts`): Claude first rewrites the question into rulebook vocabulary ("keeper" → "goalkeeper", "back pass" → "deliberately kicked by a team-mate"), the app searches with those terms, then Claude writes the answer from the matching rules only, citing rule numbers.

## Running locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
sudo apt-get install poppler-utils   # or: brew install poppler
npm run ingest
npm run dev
```

Deploy on Vercel: import the repo and set `ANTHROPIC_API_KEY`. The parsed rulebooks in `data/rules/` ship with the app.

## Copyright

The rulebooks are copyrighted by their governing bodies (IFAB, IIHF, World Skate, MCC). This project is intended for personal and club use. The app links to the official PDFs and quotes only the passages relevant to each answer. Check each body's terms before making it public.
