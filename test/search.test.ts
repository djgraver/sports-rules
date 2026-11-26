import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, lookup, searchRules } from "../lib/search.ts";
import type { RuleChunk, SportIndexFile } from "../lib/types.ts";

const chunk = (id: string, ref: string, section: string, text: string): RuleChunk => ({
  id, sport: "soccer", source: "Test Laws", kind: "rules", ref, title: "Fouls and Misconduct", section, page: 1, text,
});

test("merges results across several searches", () => {
  const file: SportIndexFile = {
    sport: "soccer",
    generatedAt: "",
    documents: [],
    chunks: [
      chunk("a", "Law 12.2", "Indirect free kick", "the goalkeeper handles the ball after it has been deliberately kicked to them by a team-mate"),
      chunk("b", "Law 12.1", "Direct free kick", "a direct free kick is awarded if a player commits a careless, reckless or excessive tackle"),
      chunk("c", "Law 11.1", "Offside position", "a player is in an offside position if any part of the head, body or feet is in the opponents' half"),
    ],
  };
  const res = searchRules(buildIndex(file), ["keeper picks up back pass", "goalkeeper handles ball deliberately kicked team-mate"]);
  assert.equal(res[0].ref, "Law 12.2");
  assert.ok(!res.some((c) => c.ref === "Law 11.1"));
});

test("duplicate ids in old data files are renamed, not dropped", () => {
  const file: SportIndexFile = {
    sport: "soccer", generatedAt: "", documents: [],
    chunks: [chunk("a", "Law 1", "", "one two"), chunk("a", "Law 2", "", "three four")],
  };
  const loaded = buildIndex(file);
  assert.equal(loaded.byId.size, 2);
});

test("identical wording from two rulebooks is shown once", () => {
  const file: SportIndexFile = {
    sport: "soccer", generatedAt: "", documents: [],
    chunks: [
      chunk("a", "Rule 6.4.20", "Hand", "closing the hand on the puck is a minor penalty"),
      chunk("b", "World Skate 6.4.20", "Hand", "Closing the hand on the puck is a minor penalty."),
      chunk("c", "Rule 6.4.21", "High sticks", "batting the puck with a high stick"),
    ],
  };
  const res = searchRules(buildIndex(file), ["closing hand puck"]);
  assert.equal(res.filter((c) => c.ref.endsWith("6.4.20")).length, 1);
});

test("rule headings rank above rules that only mention the words", () => {
  const file: SportIndexFile = {
    sport: "soccer", generatedAt: "", documents: [],
    chunks: [
      { ...chunk("a", "Rule 6.4.20", "Handling Puck with Hand", "a player who closes the hand on the puck after a high stick"), title: "Penalties" },
      { ...chunk("b", "Rule 6.4.21", "High Sticks", "carrying the stick above the shoulder"), title: "Penalties" },
    ],
  };
  assert.equal(lookup(buildIndex(file), "high stick")[0].ref, "Rule 6.4.21");
});

test("typing a rule number jumps to that rule and its parts", () => {
  const file: SportIndexFile = {
    sport: "soccer", generatedAt: "", documents: [],
    chunks: [
      chunk("a", "Law 12.1", "Direct free kick", "x y z"),
      chunk("b", "Law 12.2", "Indirect free kick", "x y z"),
      chunk("c", "Law 1.2", "Field markings", "12 lines"),
    ],
  };
  assert.deepEqual(lookup(buildIndex(file), "Law 12").map((c) => c.ref), ["Law 12.1", "Law 12.2"]);
  assert.deepEqual(lookup(buildIndex(file), "12.2").map((c) => c.ref), ["Law 12.2"]);
});

test("filler words don't match everything", () => {
  const file: SportIndexFile = {
    sport: "soccer", generatedAt: "", documents: [],
    chunks: [chunk("a", "Law 1", "Field", "is a and the it in an")],
  };
  assert.deepEqual(lookup(buildIndex(file), "is it a"), []);
});
