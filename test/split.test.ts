import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRulebook } from "../lib/split.ts";
import { SPORTS } from "../lib/sources.ts";

const soccer = SPORTS.find((s) => s.id === "soccer")!.docs[0];
const filler = "Lorem ipsum dolor sit amet, the referee decides as described in this Law. ";

function soccerPages(): string[] {
  const titles = soccer.headings.knownTitles!;
  // Page 1: contents page listing every Law (should not produce chunks).
  const contents = titles.map((t, i) => `${i + 1} ${t}`).join("\n");
  const body = titles.map((t, i) => {
    const lines = [`${i + 1}`, t, filler.repeat(2)];
    if (t === "Fouls and Misconduct") {
      lines.push("1. Direct free kick", filler.repeat(3), "2. Indirect free kick", "A goalkeeper handles the ball after a deliberate kick by a team-mate.", filler);
    }
    return lines.join("\n");
  });
  return [contents, ...body];
}

test("splits IFAB-style text into Laws and numbered sections", () => {
  const res = splitRulebook({ sport: "soccer", source: soccer.name, kind: "rules", headings: soccer.headings, pages: soccerPages() });
  assert.equal(res.usedFallback, false);
  const refs = res.chunks.map((c) => c.ref);
  assert.ok(refs.includes("Law 1"));
  assert.ok(refs.includes("Law 17"));
  const ifk = res.chunks.find((c) => c.ref === "Law 12.2");
  assert.ok(ifk, "Law 12.2 found");
  assert.equal(ifk.section, "Indirect free kick");
  assert.equal(ifk.title, "Fouls and Misconduct");
  assert.match(ifk.text, /deliberate kick/);
  assert.equal(ifk.page, 13);
  // Contents page entries are too short to keep, and ids are unique.
  assert.equal(new Set(res.chunks.map((c) => c.id)).size, res.chunks.length);
});

test("ignores running headers that repeat the current rule", () => {
  const hockey = SPORTS.find((s) => s.id === "ice-hockey")!.docs[0];
  const pages = Array.from({ length: 6 }, (_, i) => [
    `RULE ${i + 1} - Title ${i + 1}`,
    `${i + 1}.1 First part`,
    filler,
    `RULE ${i + 1} - Title ${i + 1}`, // running header on the next page
    `${i + 1}.2 Second part`,
    filler,
    "3.5 m from the goal line", // false section hit unless it belongs to rule 3
  ].join("\n"));
  const res = splitRulebook({ sport: "ice-hockey", source: hockey.name, kind: "rules", headings: hockey.headings, pages });
  assert.equal(res.rulesFound, 6);
  assert.deepEqual(
    res.chunks.filter((c) => c.ref.startsWith("Rule 2.")).map((c) => c.ref),
    ["Rule 2.1", "Rule 2.2"],
  );
});

test("falls back to page chunks when no headings are recognised", () => {
  const res = splitRulebook({
    sport: "cricket",
    source: "x",
    kind: "rules",
    headings: { refPrefix: "Law" },
    pages: [filler.repeat(3), filler.repeat(3)],
  });
  assert.equal(res.usedFallback, true);
  assert.equal(res.chunks.length, 2);
  assert.equal(res.chunks[1].page, 2);
});

test("long sections are split into parts with unique ids", () => {
  const res = splitRulebook({
    sport: "soccer",
    source: soccer.name,
    kind: "rules",
    headings: soccer.headings,
    pages: soccer.headings.knownTitles!.map((t, i) => `${i + 1} ${t}\n${filler.repeat(i === 0 ? 80 : 2)}`),
  });
  const law1 = res.chunks.filter((c) => c.ref === "Law 1");
  assert.ok(law1.length > 1);
  assert.equal(new Set(law1.map((c) => c.id)).size, law1.length);
});

test("handles zero-width spaces, lone section numbers, footers and bilingual lines", () => {
  const headings = {
    rule: /^RULE\s+(\d{1,3})\s*[-–—|:]?\s*(.{2,80})$/i,
    footer: /^RULEBOOKINLINEHOCKEY\d{4}$/,
    refPrefix: "Rule",
  };
  const pages = Array.from({ length: 5 }, (_, i) =>
    [
      `RULE ${i + 1} - Title ${i + 1}`,
      "RULEBOOK INLINE HOCKEY 2027​ ​",
      `${i + 1}.2​`,
      "",
      "Management of Penalties",
      "इस नियम का हिंदी अनुवाद",
      filler,
    ].join("\n"),
  );
  const res = splitRulebook({ sport: "inline-hockey", source: "x", kind: "rules", headings, pages });
  const c = res.chunks.find((x) => x.ref === "Rule 3.2");
  assert.ok(c, "Rule 3.2 found");
  assert.equal(c.section, "Management of Penalties");
  assert.doesNotMatch(c.text, /RULEBOOK|हिंदी|​/);
});
