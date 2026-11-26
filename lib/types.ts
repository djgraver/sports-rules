export type SportId =
  | "inline-hockey"
  | "ice-hockey"
  | "soccer"
  | "cricket"
  | "netball"
  | "basketball"
  | "afl";

/** One searchable piece of a rulebook: usually a numbered rule section. */
export interface RuleChunk {
  id: string;
  sport: SportId;
  /** Short name of the document it came from, e.g. "IFAB Laws of the Game 2026/27". */
  source: string;
  /** "rules" for the rulebook itself, "casebook" for official rulings/interpretations. */
  kind: "rules" | "casebook";
  /** Rule reference as printed, e.g. "Law 12.2" or "Rule 116". Empty if unknown. */
  ref: string;
  /** Rule/Law title, e.g. "Fouls and Misconduct". */
  title: string;
  /** Sub-section title if any, e.g. "Indirect free kick". */
  section: string;
  /** 1-based PDF page the chunk starts on, for linking to the official PDF. */
  page: number;
  text: string;
}

export interface SportIndexFile {
  sport: SportId;
  generatedAt: string;
  documents: { source: string; kind: RuleChunk["kind"]; url: string; sha256: string; pages: number }[];
  chunks: RuleChunk[];
}

/** A pre-written ruling on a common grey-area situation, stored in sports-rules-data/scenarios. */
export interface Scenario {
  id: string;
  title: string;
  situation: string;
  tags: string[];
  /** Rules that apply, with a plain-language summary of what each says. */
  rules: { ref: string; says: string }[];
  /** Official rulings or casebook entries that settle it, if any. */
  precedent: { source: string; says: string }[];
  /** The competing readings, when the rules can be read more than one way. Empty when the rule is clear. */
  readings: { label: string; argument: string }[];
  best_call: string;
  confidence: "High" | "Medium" | "Low";
}

export interface ScenarioFile {
  sport: SportId;
  updated: string;
  scenarios: Scenario[];
}
