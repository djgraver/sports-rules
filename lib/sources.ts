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
          rule: /^RULE\s+(\d{1,3})\s*[-–—|:]?\s*(.{2,80})$/i,
          section: /^(\d{1,3}\.\d{1,2})\.?\s+(.{2,80})$/,
          refPrefix: "Rule",
        },
      },
    ],
  },
  {
    id: "inline-hockey",
    name: "Inline hockey",
    governingBodies: "World Skate Inline Hockey Rulebook, used by Skate Australia",
    docs: [
      {
        name: "World Skate Inline Hockey Rulebook 2027",
        kind: "rules",
        urls: ["https://www.worldskate.org/inline-hockey/about/regulations.html?download=9047:inline-hockey-rulebook-2027"],
        officialPage: "https://www.worldskate.org/inline-hockey/about/regulations.html",
        headings: {
          rule: /^RULE\s+(\d{1,3})\s*[-–—|:]?\s*(.{2,80})$/i,
          section: /^(\d{1,3}\.\d{1,2})\.?\s+(.{2,80})$/,
          refPrefix: "Rule",
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
          section: /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+([A-Z].{2,80})$/,
          footer: /^TheLawsofCricket2017Code|^Page\|?\d+$/i,
          refPrefix: "Law",
        },
      },
    ],
  },
];

export function getSport(id: string): Sport | undefined {
  return SPORTS.find((s) => s.id === id);
}
