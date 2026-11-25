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
| Inline hockey (default) | World Skate Inline Hockey Rulebook 2027 | Skate Australia |
| Ice hockey | IIHF Rule Book 2026-27 | Ice Hockey Australia |
| Soccer | IFAB Laws of the Game 2026/27 | Football Australia |
| Cricket | MCC Laws of Cricket (2017 Code, 3rd Ed. 2022) | Cricket Australia (club cricket) |
| Netball | World Netball Rules of Netball (2024 ed.) | Netball Australia |
| Basketball | FIBA Official Basketball Rules 2026 + Official Interpretations 2024 | Basketball Australia |
| AFL | Laws of Australian Football 2026 | AFL |

Users can make any sport their default (saved in their browser).

Source URLs and heading patterns live in [`lib/sources.ts`](lib/sources.ts).

## How it works

1. **Ingest** (`npm run ingest`): downloads each PDF from the governing body, extracts text with `pdftotext`, and splits it into numbered rule sections (`lib/split.ts`). The results (original PDFs, full plain text and parsed `rules/<sport>.json`) are stored in the private `djgraver/sports-rules-data` repo, whose own workflow runs this code and checks for new editions monthly.
2. **Search** (`lib/search.ts`): BM25 keyword search (MiniSearch) over the rule sections, run in the browser.
3. **Answer** (`lib/answer.ts`): called from the browser with the user's own Anthropic API key (entered under Settings, stored only in that browser). Without a key the app still searches the rules. Claude first rewrites the question into rulebook vocabulary ("keeper" → "goalkeeper", "back pass" → "deliberately kicked by a team-mate"), the app searches with those terms, then Claude writes the answer from the matching rules only, citing rule numbers.

## Running locally

```bash
npm install
git clone https://github.com/djgraver/sports-rules-data data   # private: rulebook data
npm run dev
```

## Hosting

The app is a static site deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. One-time setup:

1. In this repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Create a fine-grained personal access token with access to only `djgraver/sports-rules-data` and **Contents: Read-only**, and add it to this repo as the Actions secret `RULES_DATA_TOKEN`.

 The site is then at `https://<user>.github.io/sports-rules/` and can be added to a phone's home screen or wrapped with Hermit.

## Copyright

The rulebooks are copyrighted by their governing bodies (IFAB, IIHF, World Skate, MCC). This project is intended for personal and club use. The app links to the official PDFs and quotes only the passages relevant to each answer. Check each body's terms before making it public.
