import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { buildScenarioIndex, searchScenarios } from "../lib/search.ts";
import type { Scenario, ScenarioFile } from "../lib/types.ts";

const sc = (id: string, title: string, situation: string, tags: string[]): Scenario => ({
  id, title, situation, tags, rules: [], precedent: [], readings: [], best_call: "", confidence: "High",
});

const file: ScenarioFile = {
  sport: "inline-hockey",
  updated: "",
  scenarios: [
    sc("hand", "Closing a hand on the puck", "A defender catches the puck and drops it to his stick.", ["hand pass", "closing hand"]),
    sc("high", "High stick goal", "An attacker bats the puck in above the crossbar.", ["high stick", "goal"]),
    sc("net", "Goalie knocks the net off", "The goalie pushes the net off its pegs during a scramble.", ["net displaced", "goalie"]),
  ],
};

test("finds the matching scenario first", () => {
  const res = searchScenarios(buildScenarioIndex(file), "defender closed his hand on the puck");
  assert.equal(res[0].id, "hand");
});

test("a single shared word isn't enough for a multi-word question", () => {
  const res = searchScenarios(buildScenarioIndex(file), "what about the offside rule for goal kicks");
  assert.ok(!res.some((s) => s.id === "net"));
});

test("questions made only of filler words return nothing", () => {
  assert.deepEqual(searchScenarios(buildScenarioIndex(file), "what is the"), []);
});

// Checks the real library when the private data repo is checked out at ./data.
const dir = "data/scenarios";
test("scenario files are well formed", { skip: !existsSync(dir) }, () => {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as ScenarioFile;
    assert.equal(`${data.sport}.json`, f);
    for (const s of data.scenarios) {
      assert.ok(s.id && s.title && s.situation && s.best_call, `${f}: ${s.id}`);
      assert.ok(s.rules.length > 0, `${f}: ${s.id} cites no rules`);
      assert.ok(["High", "Medium", "Low"].includes(s.confidence), `${f}: ${s.id}`);
    }
  }
});
