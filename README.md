# Rules Ref

Plain-language answers to rules questions for amateur sport in Australia, grounded in the official rulebooks.

Describe a situation from your game and you get:

- the matching **common calls**: a pre-written library of grey-area situations (58 across 7 sports, weighted to inline hockey), each with the rules that apply, any official precedent, both readings where there's a real argument, and a best call with a confidence level,
- the matching rules from the official rulebook, with their numbers and a link to the page in the PDF,
- optionally, a written AI answer for anything the library doesn't cover (needs the user's own paid Anthropic API key; off by default).

Everything except the optional AI answer runs in the browser with no account or key.

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
2. **Common calls**: hand-written in the data repo as `scenarios/<sport>.json` (see `Scenario` in `lib/types.ts`). Every rule a scenario cites was checked against the parsed rulebook text.
3. **Search** (`lib/search.ts`): BM25 keyword search (MiniSearch) over the rule sections and the common calls, run in the browser. Common calls need at least two matching words, so unrelated cards don't show.
4. **Optional AI answer** (`lib/answer.ts`): called from the browser with the user's own Anthropic API key (entered under Settings, stored only in that browser). Without a key the app still searches the rules. Claude first rewrites the question into rulebook vocabulary ("keeper" → "goalkeeper", "back pass" → "deliberately kicked by a team-mate"), the app searches with those terms, then Claude writes the answer from the matching rules only, citing rule numbers.

## Running locally

```bash
npm install
git clone https://github.com/djgraver/sports-rules-data data   # private: rulebook data
npm run dev
```

## Hosting

The app is a static site deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. One-time setup:

1. In this repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Give the build read access to the private data repo with a deploy key:
   - Generate a key pair: `ssh-keygen -t ed25519 -N "" -C "sports-rules pages" -f rules_data_key`
   - In **sports-rules-data → Settings → Deploy keys → Add deploy key**, paste `rules_data_key.pub` and leave "Allow write access" unticked.
   - In **sports-rules → Settings → Secrets and variables → Actions**, add a secret `RULES_DATA_DEPLOY_KEY` containing the whole of `rules_data_key` (the private key).

   (A fine-grained token with read-only Contents access, saved as `RULES_DATA_TOKEN`, works too.)

 The site is then at `https://<user>.github.io/sports-rules/` and can be added to a phone's home screen or wrapped with Hermit.

## Copyright

The rulebooks are copyrighted by their governing bodies (IFAB, IIHF, World Skate, MCC). This project is intended for personal and club use. The app links to the official PDFs and quotes only the passages relevant to each answer. Check each body's terms before making it public.
