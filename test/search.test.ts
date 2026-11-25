import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSport, searchRules, _clearCache } from "../lib/search.ts";
import type { RuleChunk, SportIndexFile } from "../lib/types.ts";

const chunk = (id: string, ref: string, section: string, text: string): RuleChunk => ({
  id, sport: "soccer", source: "Test Laws", kind: "rules", ref, title: "Fouls and Misconduct", section, page: 1, text,
});

test("merges results across several searches", () => {
  _clearCache();
  const dir = mkdtempSync(path.join(tmpdir(), "rules-"));
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
  writeFileSync(path.join(dir, "soccer.json"), JSON.stringify(file));
  assert.ok(loadSport("soccer", dir));
  const res = searchRules("soccer", ["keeper picks up back pass", "goalkeeper handles ball deliberately kicked team-mate"]);
  assert.equal(res[0].ref, "Law 12.2");
  assert.ok(!res.some((c) => c.ref === "Law 11.1"));
});

test("returns nothing for a sport with no loaded rules", () => {
  _clearCache();
  assert.equal(loadSport("cricket", mkdtempSync(path.join(tmpdir(), "empty-"))), null);
  assert.deepEqual(searchRules("cricket", ["lbw"]), []);
});
