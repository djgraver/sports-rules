import type { HeadingRules } from "./sources.ts";
import type { RuleChunk, SportId } from "./types.ts";

const MAX_CHARS = 2400;
const MIN_CHARS = 60;

export interface SplitInput {
  sport: SportId;
  source: string;
  kind: RuleChunk["kind"];
  headings: HeadingRules;
  /** Text of each PDF page, in order (index 0 = page 1). */
  pages: string[];
  firstPage?: number;
}

export interface SplitResult {
  chunks: RuleChunk[];
  /** How many top-level rule headings were recognised. Low numbers mean the patterns need tuning. */
  rulesFound: number;
  usedFallback: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Match a line against the known titles list, e.g. "12 Fouls and Misconduct" or "LAW 12 FOULS AND MISCONDUCT". */
function matchKnownTitle(line: string, titles: string[]): { num: string; title: string } | null {
  const m = norm(line).match(/^(?:law\s+)?(\d{1,2})?\s*[-|:.]?\s*(.+)$/);
  if (!m) return null;
  const body = m[2];
  let idx = titles.findIndex((t) => norm(t) === body);
  // With an explicit number, accept small wording differences ("Batter out of his / her ground").
  if (idx === -1 && m[1]) {
    const n = Number(m[1]) - 1;
    const t = titles[n] ? norm(titles[n]) : "";
    if (t && body.length < 70 && body.slice(0, 12) === t.slice(0, 12)) idx = n;
  }
  if (idx === -1) return null;
  if (m[1] && Number(m[1]) !== idx + 1) return null;
  return { num: String(idx + 1), title: titles[idx] };
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(". ", MAX_CHARS);
    if (cut < MAX_CHARS / 2) cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut <= 0) cut = MAX_CHARS;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

function cleanText(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/(\w)-\n(\w)/g, "$1$2") // re-join hyphenated words
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove zero-width characters and lines in other scripts (e.g. the Hindi half of a bilingual edition). */
export function cleanPage(text: string): string {
  return text
    .replace(/[\u200b-\u200d\ufeff\u00ad]/g, "")
    .split("\n")
    .filter((l) => !/[\u0900-\u097f]/.test(l))
    .join("\n");
}

export function splitRulebook(input: SplitInput): SplitResult {
  const { headings, sport, source, kind } = input;
  const chunks: RuleChunk[] = [];
  const seen = new Map<string, number>();
  let rulesFound = 0;

  let rule: { num: string; title: string } | null = null;
  let section: { num: string; title: string } | null = null;
  let buf: string[] = [];
  let startPage = input.firstPage ?? 1;
  /** A dotted section number printed alone on a line; its title is on the next line. */
  let pendingSection: string | null = null;
  /** A rule heading printed without its title ("RULE 70"); take the title from the next heading line. */
  let pendingRuleTitle = false;
  const maxDepth = headings.sectionDepth ?? 2;
  const isFooter = (line: string) => !!headings.footer && headings.footer.test(line.replace(/\s+/g, ""));
  const ruleOf = (num: string) => num.split(/[.-]/)[0];
  const isCompound = (num: string) => /[.-]/.test(num);
  const depth = (num: string) => num.split(/[.-]/).length - 1;
  const belongsToRule = (num: string) =>
    depth(num) <= maxDepth && (!isCompound(num) || (!!rule && ruleOf(num) === rule.num) || !!headings.implicitRules);
  /** With implicitRules, a section number like "6.2" starts rule 6 if we're not already in it. */
  const enterImplicitRule = (num: string, pageNo: number) => {
    if (!headings.implicitRules || !isCompound(num) || (rule && ruleOf(num) === rule.num)) return;
    flush();
    rule = { num: ruleOf(num), title: "" };
    section = null;
    startPage = pageNo;
    rulesFound++;
  };
  const startSection = (num: string, title: string, pageNo: number) => {
    enterImplicitRule(num, pageNo);
    flush();
    section = { num, title };
    if (rule && !rule.title) rule.title = title;
    pendingRuleTitle = false;
    startPage = pageNo;
  };

  const flush = () => {
    const text = cleanText(buf);
    buf = [];
    if (!rule || text.length < MIN_CHARS) return;
    const ref = section
      ? `${headings.refPrefix} ${isCompound(section.num) ? section.num : `${rule.num}.${section.num}`}`
      : `${headings.refPrefix} ${rule.num}`;
    const base = `${sport}-${slug(ref)}`;
    for (const part of splitLong(text)) {
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      chunks.push({
        id: n === 1 ? base : `${base}~${n}`,
        sport,
        source,
        kind,
        ref,
        title: rule.title || section?.title || "",
        section: section?.title ?? "",
        page: startPage,
        text: part,
      });
    }
  };

  for (let p = (input.firstPage ?? 1) - 1; p < input.pages.length; p++) {
    const pageNo = p + 1;
    for (const raw of cleanPage(input.pages[p]).split("\n")) {
      const line = raw.trim();
      if (!line || /^\d{1,3}$/.test(line) || isFooter(line)) continue; // blanks, bare page numbers, running footers

      if (pendingSection) {
        const num = pendingSection;
        pendingSection = null;
        if (line.length <= 80 && /^[A-Z]/.test(line)) {
          startSection(num, line, pageNo);
          continue;
        }
      }

      let newRule: { num: string; title: string } | null = null;
      if (headings.knownTitles) newRule = matchKnownTitle(line, headings.knownTitles);
      if (!newRule && headings.rule) {
        const m = line.match(headings.rule);
        if (m) newRule = { num: m[1], title: (m[2] ?? "").trim() };
      }
      if (newRule) {
        // Running page headers repeat the current rule's title: treat as noise.
        if (rule && newRule.num === rule.num) continue;
        flush();
        rule = newRule;
        section = null;
        startPage = pageNo;
        pendingRuleTitle = !newRule.title;
        rulesFound++;
        continue;
      }

      const sectionsAllowed = !!rule || !!headings.implicitRules;
      if (sectionsAllowed) {
        const lone = line.match(/^(\d{1,3}(?:\.\d{1,2}){1,3})\.?$/);
        if (lone && belongsToRule(lone[1])) {
          pendingSection = lone[1];
          continue;
        }
      }

      if (sectionsAllowed && headings.section) {
        const m = line.match(headings.section);
        // Dotted section numbers must belong to the current rule (avoids "3.5 m" style false hits).
        if (m && belongsToRule(m[1])) {
          startSection(m[1], m[2].trim(), pageNo);
          continue;
        }
      }

      if (rule && pendingRuleTitle && line.length <= 80 && /^[A-Z]/.test(line) && buf.length === 0) {
        rule.title = line;
        pendingRuleTitle = false;
        continue;
      }

      if (buf.length === 0) startPage = pageNo;
      buf.push(line);
    }
  }
  flush();

  if (rulesFound >= 5) return { chunks, rulesFound, usedFallback: false };

  // Headings not recognised: fall back to one chunk per page so the book is still searchable.
  const fallback: RuleChunk[] = [];
  input.pages.forEach((pageText, i) => {
    const text = cleanText(cleanPage(pageText).split("\n").map((l) => l.trim()).filter(Boolean));
    if (text.length < MIN_CHARS || i + 1 < (input.firstPage ?? 1)) return;
    splitLong(text).forEach((part, j) => {
      fallback.push({
        id: `${sport}-p${i + 1}${j ? `-${j + 1}` : ""}`,
        sport,
        source,
        kind,
        ref: "",
        title: `Page ${i + 1}`,
        section: "",
        page: i + 1,
        text: part,
      });
    });
  });
  return { chunks: fallback, rulesFound, usedFallback: true };
}
