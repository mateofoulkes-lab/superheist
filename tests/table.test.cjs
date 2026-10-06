const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("../tools/simulator/engine.js");
const { Table } = require("../tools/playable/controller.js");
test("independent, reproducible deal and own-only observation", () => {
  const a = new Table("table"),
    b = new Table("table");
  assert.equal(a.serialize(), b.serialize());
  assert.equal(a.publicPlayers().length, 4);
  assert.equal(a.observation().players.J2.objective, undefined);
  assert.equal(a.publicPlayers()[1].objective, undefined);
  assert.equal(
    new Set(Object.values(a.state.players).map((p) => p.power)).size,
    4,
  );
});
test("human action advances once and rejects out of turn action", () => {
  const t = new Table("turn");
  t.humanAction({ type: "wait" });
  assert.throws(() => t.humanAction({ type: "wait" }));
  assert.equal(t.actor(), "J2");
  t.automatic();
  assert.equal(t.actor(), "J3");
  const restored = Table.restore(t.serialize());
  assert.equal(restored.actor(), "J3");
  restored.automatic();
  t.automatic();
  assert.equal(restored.serialize(), t.serialize());
});
test("free drop preserves action and inventory conservation", () => {
  const t = new Table("drop"),
    id = t.observation().me.bag[0];
  t.drop(id);
  assert.equal(t.state.objects[id].location, E.CAR);
  assert.equal(t.state.players.J1.bag[0], null);
  assert.equal(t.isHumanTurn(), true);
  assert.throws(() => t.drop(id));
});
test("a pushed bot responds when it stays in reach", () => {
  const t = new Table("pvp");
  t.grievances.J2 = "J1";
  t.cursor = 1;
  const entry = t.automatic();
  assert.equal(t.steps.at(-1).command.type, "push");
  assert.equal(t.steps.at(-1).command.target, "J1");
  assert.ok(!entry.text.includes("saboteur"));
});
test("100 dealt games finish with legal transitions, restore and playable replay", () => {
  for (let i = 0; i < 100; i++) {
    let t = new Table("mesa-" + i, i % 2 ? "conflict" : "cooperative"),
      n = 0;
    while (!t.state.ended && n++ < 500) {
      if (t.isHumanTurn()) t.humanAction(E.decide(t.observation()).action);
      else t.automatic();
      E.assertState(t.state);
      if (n === 12) t = Table.restore(t.serialize());
    }
    assert.ok(t.state.ended, "seed " + i);
    assert.ok(t.state.result);
    const replay = t.exportReplay();
    assert.equal(replay.story.steps.at(-1).state.ended, true);
    assert.equal(replay.engine, E.VERSION);
  }
});
