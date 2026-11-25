import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, searchRules } from "../lib/search.ts";
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
