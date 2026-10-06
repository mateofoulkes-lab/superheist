const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../tools/simulator/engine.js");
const fresh = () => E.makeScenario("test-seed");
function room(s, id, key) {
  s.players[id].position = key;
}
function give(s, player, kind, slot = "h0", value) {
  const p = s.players[player],
    a = slot[0] === "h" ? p.hands : p.bag,
    i = +slot.slice(1);
  if (a[i]) s.objects[a[i]].location = "discarded";
  const id = "test-" + kind;
  s.objects[id] = {
    id,
    kind,
    name: kind,
    location: player,
    ...(value === undefined ? {} : { value }),
  };
  a[i] = id;
  return id;
}
function emptyGuards(s) {
  for (const g of Object.values(s.guards)) {
    g.status = "removed";
    g.arrow = null;
  }
}

test("same seed/profile produces identical entire replay", () =>
  assert.deepEqual(
    E.simulate("rep", "conflict"),
    E.simulate("rep", "conflict"),
  ));
test("setup: sufficient loot, no reliability, unique three-room routes", () => {
  const s = fresh();
  assert.equal(E.validateSetup(s), true);
  assert.equal(
    Object.values(s.objects)
      .filter((o) => o.kind === "loot")
      .reduce((a, o) => a + o.value, 0),
    9,
  );
  for (const p of Object.values(s.players)) assert.equal("failure" in p, false);
});
test("ambiguous patrol is rejected", () => {
  const s = fresh();
  s.guards.G1.route = ["3,4", "2,4", "2,5"];
  assert.throws(() => E.validateSetup(s), /ambigua/);
});
test("invalid move/deposit/boarding/remote attack are atomic", () => {
  const s = fresh(),
    before = JSON.stringify(s);
  for (const a of [
    { type: "move", to: "2,5" },
    { type: "deposit" },
    { type: "fight", target: "G2" },
    { type: "depart" },
  ])
    assert.throws(() => E.perform(s, "J1", a));
  assert.equal(JSON.stringify(s), before);
  room(s, "J1", "3,4");
  assert.throws(() => E.perform(s, "J1", { type: "board" }));
});
test("observations and decisions do not leak other objectives, equipment, hidden loot/events or RNG", () => {
  const a = fresh(),
    b = structuredClone(a);
  b.rng = 99;
  b.seed = "SECRET";
  b.players.J2.objective = "enemy";
  b.objects[b.players.J2.bag[0]].kind = "gun";
  b.objects.L2.value = 99;
  b.rooms.find((r) => r.key === "5,5").event.kind = "different";
  assert.deepEqual(E.observe(a, "J1"), E.observe(b, "J1"));
  assert.deepEqual(E.decide(E.observe(a, "J1")), E.decide(E.observe(b, "J1")));
  const o = E.observe(a, "J1");
  assert.equal(o.rng, undefined);
  assert.equal(o.seed, undefined);
  assert.equal(o.players.J2.objective, undefined);
  assert.equal(o.vaults["4,6"].value, null);
});
test("precognition is private and does not trigger the event", () => {
  const s = fresh();
  room(s, "J2", "5,4");
  const n = E.perform(s, "J2", { type: "power", room: "5,5" }).state;
  assert.ok(E.observe(n, "J2").rooms.find((r) => r.key === "5,5").event.kind);
  assert.equal(
    E.observe(n, "J1").rooms.find((r) => r.key === "5,5").event.kind,
    null,
  );
  assert.equal(n.revealedEvents.length, 0);
});
test("collecting loot preserves value, capacity, owner and action separation", () => {
  let s = fresh();
  room(s, "J1", "2,5");
  assert.throws(() =>
    E.perform(s, "J1", { type: "pick", object: "L1", slot: "b1" }),
  );
  s.vaults["2,5"].open = true;
  s = E.perform(s, "J1", { type: "pick", object: "L1", slot: "b1" }).state;
  assert.equal(s.objects.L1.location, "J1");
  assert.equal(s.players.J1.position, "2,5");
  assert.equal(s.players.J1.carryingLoot, s.objects.L1.value);
  assert.throws(() =>
    E.perform(s, "J2", { type: "pick", object: "L1", slot: "b1" }),
  );
  room(s, "J1", E.CAR);
  const value = s.objects.L1.value;
  s = E.perform(s, "J1", { type: "deposit" }).state;
  assert.equal(s.depositedLoot, value);
  assert.equal(s.players.J1.boarded, false);
  assert.throws(() => E.perform(s, "J1", { type: "deposit" }));
  assert.equal(E.assertState(s), true);
});
test("two occupied hands block manipulation; dropping frees one without another action", () => {
  const s = fresh();
  room(s, "J1", "2,5");
  s.vaults["2,5"].open = true;
  const first = give(s, "J1", "tools"),
    second = give(s, "J1", "gun", "h1");
  assert.throws(() =>
    E.perform(s, "J1", { type: "pick", object: "L1", slot: "b1" }),
  );
  const n = E.perform(s, "J1", {
    type: "pick",
    object: "L1",
    slot: "b1",
    drop: [first],
  }).state;
  assert.equal(n.objects[first].location, "2,5");
  assert.equal(n.players.J1.hands[1], second);
  assert.equal(n.metrics.actions, 1);
});
test("larger backpack has four bag slots and does not occupy its own capacity", () => {
  const s = fresh(),
    id = give(s, "J1", "bag");
  const n = E.perform(s, "J1", { type: "use", object: id }).state;
  assert.equal(n.players.J1.bag.length, 4);
  assert.deepEqual(n.players.J1.equipment, [id]);
  assert.equal(n.players.J1.hands[0], null);
  assert.equal(E.assertState(n), true);
});
test("stored equipment must be drawn before use", () => {
  const s = fresh(),
    id = give(s, "J1", "smoke", "b1");
  assert.throws(() => E.perform(s, "J1", { type: "use", object: id }));
  const n = E.perform(s, "J1", {
    type: "rearrange",
    object: id,
    slot: "h0",
  }).state;
  assert.equal(
    E.perform(n, "J1", { type: "use", object: id }).state.objects[id].location,
    "discarded",
  );
});
test("pushes preserve inventory, trigger persistent entry sensor and do not skip turns", () => {
  const s = fresh();
  emptyGuards(s);
  room(s, "J1", "5,4");
  room(s, "J2", "5,4");
  s.players.J1.stats.fisico = 100;
  s.rooms.find((r) => r.key === "5,5").event = {
    id: "E:5,5",
    kind: "sensor",
    revealed: false,
  };
  const old = structuredClone(s.players.J2.bag);
  const n = E.perform(s, "J1", { type: "push", target: "J2", to: "5,5" }).state;
  assert.equal(n.players.J2.position, "5,5");
  assert.equal(n.players.J2.status, "active");
  assert.deepEqual(n.players.J2.bag, old);
  assert.ok(n.attention.includes("5,5"));
  assert.equal(n.round, s.round);
  assert.equal(
    E.perform(n, "J2", { type: "move", to: "5,4" }).state.players.J2.position,
    "5,4",
  );
});
test("push requires same room, open door, free hand; ties defend", () => {
  const s = fresh();
  room(s, "J1", "5,4");
  room(s, "J2", "5,4");
  s.doors["5,4|5,5"].closed = true;
  assert.throws(() =>
    E.perform(s, "J1", { type: "push", target: "J2", to: "5,5" }),
  );
  s.doors["5,4|5,5"].closed = false;
  let checked = false;
  for (let seed = 0; seed < 1000 && !checked; seed++) {
    s.rng = seed;
    s.players.J1.stats.fisico = s.players.J2.stats.fisico = 1;
    const n = E.perform(s, "J1", { type: "push", target: "J2", to: "5,5" });
    if (n.rolls[0].total === n.rolls[1].total) {
      assert.equal(n.state.players.J2.position, "5,4");
      checked = true;
    }
  }
  assert.ok(checked);
});
test("patrol moves one room and arrow reverses at endpoints", () => {
  let s = fresh();
  let positions = [];
  for (let i = 0; i < 4; i++) {
    s = E.security(s).state;
    positions.push(s.guards.G1.position);
    assert.equal(E.assertState(s), true);
  }
  assert.deepEqual(positions, ["3,4", "2,4", "3,4", "4,4"]);
  assert.equal(s.guards.G1.arrow, "3,4");
});
test("investigation retracts arrow and returns to midpoint without teleporting", () => {
  let s = fresh();
  s.attention = ["2,4"];
  s = E.security(s).state;
  assert.equal(s.guards.G1.position, "3,4");
  assert.equal(s.guards.G1.arrow, null);
  s = E.security(s).state;
  assert.equal(s.guards.G1.position, "2,4");
  s = E.security(s).state;
  assert.equal(s.attention.length, 0);
  s = E.security(s).state;
  assert.equal(s.guards.G1.position, "3,4");
  s = E.security(s).state;
  assert.equal(s.guards.G1.arrow, "4,4");
});
test("combat reduction, arrest and rescue have explicit states", () => {
  let s = fresh();
  room(s, "J1", "4,5");
  s.players.J1.stats.fisico = 100;
  s = E.perform(s, "J1", { type: "fight", target: "G2" }).state;
  assert.equal(s.guards.G2.status, "reduced");
  assert.equal(s.players.J1.status, "active");
  s.players.J2.status = "reduced";
  room(s, "J2", "4,4");
  s = E.security(s).state;
  assert.equal(s.players.J2.status, "arrested");
  s.guards.G1.status = "removed";
  s.guards.G1.arrow = null;
  room(s, "J1", "4,4");
  s = E.perform(s, "J1", { type: "rescue", target: "J2" }).state;
  assert.equal(s.players.J2.status, "active");
  assert.equal(s.metrics.rescues, 1);
});
test("SWAT replaces guards after announced delay; cannot know unseen player positions", () => {
  const a = fresh();
  a.alert = 4;
  a.swatRound = 3;
  a.round = 2;
  assert.equal(E.security(a).state.swatEntered, false);
  a.round = 3;
  let n = E.security(a).state;
  assert.equal(n.swatEntered, true);
  assert.ok(Object.values(n.guards).every((g) => g.status === "removed"));
  assert.equal(n.swats.S1.position, "4,4");
  const b = structuredClone(n);
  room(b, "J1", "5,4");
  const x = E.security(n).state,
    y = E.security(b).state;
  assert.equal(x.swats.S1.position, y.swats.S1.position);
});
test("departure requires deposited loot, boarding and two aboard, leaves outsiders", () => {
  let s = fresh();
  for (const o of Object.values(s.objects))
    if (o.kind === "loot") {
      o.location = "deposited";
      s.deposited.push(o.id);
      s.depositedLoot += o.value;
    }
  s = E.perform(s, "J1", { type: "board" }).state;
  assert.throws(() => E.perform(s, "J1", { type: "depart" }));
  s = E.perform(s, "J2", { type: "board" }).state;
  s = E.perform(s, "J1", { type: "depart" }).state;
  assert.equal(s.result.groupSuccess, true);
  assert.equal(s.players.J3.status, "leftbehind");
  assert.equal(s.players.J1.status, "escaped");
});
test("200 seeded games finish legally and exhibit both success and failure", () => {
  const outcomes = new Set();
  for (let i = 0; i < 100; i++)
    for (const profile of ["cooperative", "conflict"]) {
      const r = E.simulate("smoke-" + i, profile, false).result;
      assert.ok(r.rounds <= 28);
      outcomes.add(r.groupSuccess);
    }
  assert.equal(outcomes.size, 2);
});
test("replay frames conserve objects and enforce one player action per round", () => {
  const r = E.simulate("coverage", "conflict");
  const counts = new Set();
  for (const step of r.story.steps) {
    assert.equal(E.assertState(step.state), true);
    if (step.command?.id) {
      const key = step.state.round + ":" + step.command.id;
      assert.ok(!counts.has(key));
      counts.add(key);
    }
  }
  assert.equal(r.story.steps.at(-1).state.ended, true);
});

test("a guard retracts its arrow immediately when an entry causes combat", () => {
  const s = fresh();
  s.alert = 2;
  s.players.J1.stats.sigilo = -100;
  const n = E.perform(s, "J1", { type: "move", to: "4,4" }).state;
  assert.equal(n.guards.G1.arrow, null);
  assert.equal(n.guards.G1.mode, "return");
});
