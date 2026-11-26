import type { SportId, RuleChunk } from "./types.ts";

/**
 * How to recognise headings in a rulebook's extracted text.
 * Each regex is applied to one trimmed line.
 */
export interface HeadingRules {
  /** Top-level rule/law heading. Groups: 1 = number, 2 = title. */
  rule?: RegExp;
  /**
   * Known top-level titles, in order. A line that equals one of these (optionally
   * preceded by its number) starts that rule. More reliable than `rule` for
   * books with fixed, well-known chapter names.
   */
  knownTitles?: string[];
  /** Sub-section heading. Groups: 1 = number, 2 = title. */
  section?: RegExp;
  /**
   * Numbered clauses ("8. Play restarts from…"): each starts a new chunk with ref
   * <rule>.<clause>, and the clause text stays in the body. Groups: 1 = number, 2 = rest of line.
   */
  clause?: RegExp;
  /** Un-numbered sub-headings (e.g. all-caps lines) used as the section title for following clauses. */
  subheading?: RegExp;
  /** Deepest section numbering to treat as a heading: 1 = "25.7", 2 = "25.7.1" (default 2). */
  sectionDepth?: number;
  /** No separate rule headings: the rule number is the first part of each section number. */
  implicitRules?: boolean;
  /** Running header/footer to drop, tested against the line with all whitespace removed. */
  footer?: RegExp;
  /** Prefix for refs, e.g. "Law" or "Rule". */
  refPrefix: string;
}

export interface SourceDoc {
  /** Display name, cited in answers. */
  name: string;
  kind: RuleChunk["kind"];
  /** Candidate download URLs, tried in order until one returns a PDF. */
  urls: string[];
  /** Human-facing page to open the official document. */
  officialPage: string;
  headings: HeadingRules;
  /** Skip pages before this (cover, contents, foreword). 1-based. */
  firstPage?: number;
  /** Ignore pages after this (penalty index tables and the like). 1-based. */
  lastPage?: number;
}

export interface Sport {
  id: SportId;
  name: string;
  governingBodies: string;
  docs: SourceDoc[];
}

const IFAB_LAWS = [
  "The Field of Play",
  "The Ball",
  "The Players",
  "The Players' Equipment",
  "The Referee",
  "The Other Match Officials",
  "The Duration of the Match",
  "The Start and Restart of Play",
  "The Ball In and Out of Play",
  "Determining the Outcome of a Match",
  "Offside",
  "Fouls and Misconduct",
  "Free Kicks",
  "The Penalty Kick",
  "The Throw-in",
  "The Goal Kick",
  "The Corner Kick",
];

const MCC_LAWS = [
  "The players", "The umpires", "The scorers", "The ball", "The bat", "The pitch",
  "The creases", "The wickets", "Preparation and maintenance of the playing area",
  "Covering the pitch", "Intervals", "Start of play; cessation of play", "Innings",
  "The follow-on", "Declaration and forfeiture", "The result", "The over",
  "Scoring runs", "Boundaries", "Dead ball", "No ball", "Wide ball", "Bye and Leg bye",
  "Fielder's absence; Substitutes", "Batter's innings; Runners", "Practice on the field",
  "The wicket-keeper", "The fielder", "The wicket is down", "Batter out of their ground",
  "Appeals", "Bowled", "Caught", "Hit the ball twice", "Hit wicket", "Leg before wicket",
  "Obstructing the field", "Run out", "Stumped", "Timed out", "Unfair play",
  "Players' conduct",
];

export const SPORTS: Sport[] = [
  {
    id: "soccer",
    name: "Soccer (football)",
    governingBodies: "IFAB Laws of the Game, used by Football Australia",
    docs: [
      {
        name: "IFAB Laws of the Game 2026/27",
        kind: "rules",
        urls: [
          "https://downloads.theifab.com/downloads/laws-of-the-game-202627-single-pages?l=en",
          "https://downloads.theifab.com/downloads/laws-of-the-game-202627-double-pages?l=en",
        ],
        officialPage: "https://www.theifab.com/laws",
        headings: {
          knownTitles: IFAB_LAWS,
          section: /^(\d{1,2})\.\s+([A-Z][^.]{2,80})$/,
          footer: /^LawsoftheGame\d{4}\/\d{2}\|/i,
          refPrefix: "Law",
        },
      },
    ],
  },
  {
    id: "ice-hockey",
    name: "Ice hockey",
    governingBodies: "IIHF Official Rule Book, used by Ice Hockey Australia",
    docs: [
      {
        name: "IIHF Rule Book 2026-27",
        kind: "rules",
        urls: [
          "https://blob.iihf.com/iihf-media/iihfmvc/media/downloads/rule%20book/2026-27_iihf_rule_book.pdf",
          // Copies of the same official book hosted by IIHF member federations.
          "https://www.lhf.lv/files/archive/187/2026-27-iihf-rule-book.pdf",
          "https://static.fisg.it/wp-content/uploads/2026/07/20125550/2026-27_iihf_rule_book_compressed.pdf",
        ],
        officialPage: "https://www.iihf.com/en/statichub/4719/rules-and-regulations",
        headings: {
          rule: /^RULE\s+(\d{1,3})\.?\s*(?:[-–—|:]\s*)?(.{0,80})$/i,
          section: /^(\d{1,3}\.\d{1,2})\.?\s+([A-Z].{2,80})$/,
          sectionDepth: 1,
          footer: /^IIHFOFFICIALRULEBOOK/i,
          refPrefix: "Rule",
        },
      },
    ],
  },
  {
    id: "inline-hockey",
    name: "Inline hockey",
    governingBodies: "Inline Hockey Australia Rulebook (Skate Australia), with the World Skate rulebook it's adapted from",
    docs: [
      // Australia's own rulebook, adapted from World Skate's with ambiguous rules reworded and
      // Australia-only rules boxed. Listed first so its wording is preferred where both books say the same thing.
      {
        name: "Inline Hockey Australia Rulebook 2021",
        kind: "rules",
        urls: ["https://www.skateaustralia.org.au/_files/ugd/0a3a54_680c6ed0c9d9498886b18599fdb5714c.pdf"],
        officialPage: "https://www.skateaustralia.org.au/inline-hockey",
        // Annex C (page 53 on) is a penalty index table.
        lastPage: 52,
        headings: {
          section: /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+([A-Z].{2,80})$/,
          implicitRules: true,
          footer: /^INLINEHOCKEYAUSTRALIA/i,
          refPrefix: "Rule",
        },
      },
      {
        name: "World Skate Inline Hockey Rulebook 2027",
        kind: "rules",
        urls: ["https://www.worldskate.org/inline-hockey/about/regulations.html?download=9047:inline-hockey-rulebook-2027"],
        officialPage: "https://www.worldskate.org/inline-hockey/about/regulations.html",
        // Annex C (page 80 on) is a penalty index table.
        lastPage: 79,
        headings: {
          section: /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+([A-Z].{2,80})$/,
          implicitRules: true,
          footer: /^RULEBOOKINLINEHOCKEY|^WORLDSKATE$/i,
          refPrefix: "World Skate",
        },
      },
    ],
  },
  {
    id: "cricket",
    name: "Cricket",
    governingBodies: "MCC Laws of Cricket, used by Cricket Australia for club cricket",
    docs: [
      {
        name: "MCC Laws of Cricket (2017 Code, 3rd Edition 2022)",
        kind: "rules",
        urls: ["https://www.lords.org/getmedia/db31df04-e6b0-446e-8fc0-34674fb16c71/Laws-Of-Cricket-3rd-Edition-2022_1.pdf"],
        officialPage: "https://www.lords.org/mcc/the-laws-of-cricket",
        headings: {
          knownTitles: MCC_LAWS,
          section: /^(\d{1,2}\.\d{1,2})\s+([A-Z].{2,80})$/,
          sectionDepth: 1,
          footer: /^TheLawsofCricket2017Code|^Page\|?\d+$|^\(?DIGLOT/i,
          refPrefix: "Law",
        },
      },
    ],
  },
  {
    id: "netball",
    name: "Netball",
    governingBodies: "World Netball Rules of Netball, used by Netball Australia",
    docs: [
      {
        // World Netball sells the current edition and publishes it in its app; no free
        // official PDF is linked from netball.sport. This is a member association's copy
        // of the 2024 edition. Replace it if Netball Australia publishes a direct link.
        name: "World Netball Rules of Netball (2024 edition)",
        kind: "rules",
        urls: ["https://netballhamilton.org.nz/media/1997/world-netball-rules-book-2024.pdf"],
        officialPage: "https://netball.com.au/rules-netball",
        headings: {
          rule: /^RULE\s+(\d{1,2})\s*:\s*(.{2,80})$/,
          clause: /^(\d{1,2})\.(?:\s+(.*))?$/,
          subheading: /^[A-Z][A-Z0-9 ,'’/&()-]{3,70}$/,
          refPrefix: "Rule",
        },
      },
    ],
  },
  {
    id: "basketball",
    name: "Basketball",
    governingBodies: "FIBA Official Basketball Rules, used by Basketball Australia",
    docs: [
      {
        name: "FIBA Official Basketball Rules 2026",
        kind: "rules",
        urls: ["https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-0.pdf"],
        officialPage: "https://refereeing.fiba.basketball/en/rules",
        headings: {
          rule: /^Art(?:icle|\.)\s*(\d{1,2})\.?\s*(?:[-–—:]\s*)?(.{0,80})$/i,
          section: /^(\d{1,2}\.\d{1,2})\.?\s+([A-Z].{2,80})$/,
          sectionDepth: 1,
          refPrefix: "Art.",
        },
      },
      {
        // Official rulings on specific situations: the basketball "casebook".
        name: "FIBA Official Basketball Rules Interpretations 2024",
        kind: "casebook",
        urls: ["https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-obri-v10a.pdf"],
        officialPage: "https://refereeing.fiba.basketball/en/rules",
        headings: {
          rule: /^Art(?:icle|\.)\s*(\d{1,2})\.?\s*(?:[-–—:]\s*)?(.{0,80})$/i,
          section: /^(\d{1,2}-\d{1,3})\s+(.{2,80})$/,
          refPrefix: "OBRI",
        },
      },
    ],
  },
  {
    id: "afl",
    name: "Australian rules football (AFL)",
    governingBodies: "Laws of Australian Football, AFL",
    docs: [
      {
        name: "Laws of Australian Football 2026",
        kind: "rules",
        urls: ["https://play.afl/sites/default/files/2026-02/Laws%20of%20Australian%20Football%202026.pdf"],
        officialPage: "https://www.afl.com.au/clubhelp/match-day-management/policies/laws-of-australian-football",
        headings: {
          rule: /^LAW\s+(\d{1,2})\.?\s*(?:[-–—:]\s*)?(.{0,80})$/i,
          section: /^(\d{1,2}\.\d{1,2})\.?\s+([A-Z].{2,80})$/,
          sectionDepth: 1,
          implicitRules: true,
          refPrefix: "Law",
        },
      },
    ],
  },
];

/** Shown first and selected by default until the user picks their own default. */
export const DEFAULT_SPORT: SportId = "inline-hockey";

SPORTS.sort((a, b) => (a.id === DEFAULT_SPORT ? -1 : b.id === DEFAULT_SPORT ? 1 : 0));

export function getSport(id: string): Sport | undefined {
  return SPORTS.find((s) => s.id === id);
}
