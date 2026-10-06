(function (root, factory) {
  if (typeof module === "object")
    module.exports = factory(require("../simulator/engine.js"));
  else root.SuperheistTable = factory(root.Superheist);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const VERSION = "table-1";
  const active = (p) => ["active", "reduced"].includes(p.status);
  class Table {
    constructor(seed, profile = "conflict", human = "J1") {
      if (!/^J[1-4]$/.test(human)) throw Error("Asiento inválido");
      this.version = VERSION;
      this.human = human;
      this.state = E.makeScenario(seed, profile);
      // Independently deal the public and private decks; use the game RNG so the whole deal reproduces.
      const shuffle = (values) => {
        const a = copy(values);
        for (let i = a.length - 1; i > 0; i--) {
          this.state.rng =
            (Math.imul(this.state.rng, 1664525) + 1013904223) >>> 0;
          const j = Math.floor((this.state.rng / 4294967296) * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const players = Object.values(this.state.players);
      const characters = shuffle(
        players.map((p) => ({ name: p.name, stats: p.stats })),
      );
      const powers = shuffle(players.map((p) => p.power));
      const objectives = shuffle(players.map((p) => p.objective));
      players.forEach((p, i) => {
        Object.assign(p, characters[i]);
        p.power = powers[i];
        p.objective = objectives[i];
        p.enemy = "J" + (((i + 1) % 4) + 1);
        p.policy =
          p.objective === "enemy"
            ? "saboteur"
            : p.objective === "greed"
              ? "greedy"
              : p.objective === "ghost"
                ? "careful"
                : "cooperative";
      });
      this.initial = E.snapshot(this.state);
      this.cursor = 0;
      this.grievances = {};
      this.log = [];
      this.steps = [
        {
          phase: "Preparación",
          title: "La banda está lista",
          narration:
            "Reparto independiente de Personaje, Poder y Objetivo. 4 Equipos aleatorios y 2 investigaciones. Mesa para una persona y tres agentes.",
          actions: [],
          state: E.frame(this.state),
        },
      ];
      this.record(
        "Reparto",
        "Tus cartas están listas. SHERLOCK compró cuatro Equipos, información de Bóveda A y el evento de Oficina.",
        null,
      );
    }
    order() {
      const ids = Object.keys(this.state.players);
      const start = (this.state.round - 1) % ids.length;
      return ids.slice(start).concat(ids.slice(0, start));
    }
    actor() {
      if (this.state.ended) return null;
      while (
        this.cursor < 4 &&
        !active(this.state.players[this.order()[this.cursor]])
      )
        this.cursor++;
      return this.cursor < 4 ? this.order()[this.cursor] : "security";
    }
    isHumanTurn() {
      return this.actor() === this.human;
    }
    observation() {
      return E.observe(this.state, this.human);
    }
    publicPlayers() {
      return Object.values(this.state.players).map((p) => ({
        id: p.id,
        name: p.name,
        power: p.power,
        stats: copy(p.stats),
        status: p.status,
        position: p.position,
        boarded: p.boarded,
      }));
    }
    actions() {
      return this.isHumanTurn() ? E.legalActions(this.state, this.human) : [];
    }
    record(title, text, result, before) {
      const entry = {
        round: this.state.round,
        title,
        text,
        rolls: copy(result?.rolls || []),
      };
      this.log.push(entry);
      if (this.log.length > 150) this.log.shift();
      if (result) {
        const actions = [];
        for (const [id, p] of Object.entries(this.state.players))
          if (before.players[id].position !== p.position)
            actions.push({
              op: "move",
              id,
              from: before.players[id].position,
              to: p.position,
            });
        this.steps.push({
          phase: "Ronda " + this.state.round,
          title,
          narration: text,
          rolls: entry.rolls,
          command: result.action,
          actions,
          state: E.frame(this.state),
        });
      }
      return entry;
    }
    humanAction(action) {
      if (!this.isHumanTurn()) throw Error("Esperá tu turno");
      const before = this.state,
        res = E.perform(before, this.human, action);
      this.state = res.state;
      if (["push", "fightPlayer"].includes(action.type))
        this.grievances[action.target] = this.human;
      this.cursor++;
      return this.record("Tu jugada", res.text, res, before);
    }
    drop(object) {
      if (
        !this.isHumanTurn() ||
        this.state.players[this.human].status !== "active" ||
        this.state.players[this.human].boarded
      )
        throw Error("No podés soltar ahora");
      const before = this.state,
        next = copy(before),
        p = next.players[this.human];
      const list = p.hands.includes(object)
        ? p.hands
        : p.bag.includes(object)
          ? p.bag
          : null;
      if (!list) throw Error("No llevás ese objeto");
      list[list.indexOf(object)] = null;
      next.objects[object].location = p.position;
      E.assertState(next);
      this.state = next;
      return this.record(
        "Objeto en el suelo",
        "Soltaste " + next.objects[object].name + ". No consume tu acción.",
        { action: { id: this.human, type: "drop", object }, rolls: [] },
        before,
      );
    }
    automatic() {
      const actor = this.actor();
      if (!actor || actor === this.human) return null;
      const before = this.state;
      if (actor === "security") {
        const res = E.security(before);
        this.state = res.state;
        const entry = this.record("Seguridad", res.text, res, before);
        if (!this.state.ended) {
          this.state.round++;
          this.cursor = 0;
        }
        return entry;
      }
      const o = E.observe(before, actor);
      let decision;
      const rival = this.grievances[actor],
        q = rival && o.players[rival];
      if (
        q &&
        o.me.status === "active" &&
        q.status === "active" &&
        !q.boarded &&
        q.position === o.me.position &&
        o.me.hands.includes(null)
      ) {
        const exits = o.rooms
          .find((r) => r.key === o.me.position)
          .neighbors.filter(
            (k) => !o.doors[[k, o.me.position].sort().join("|")].closed,
          );
        if (exits.length)
          decision = {
            action: { type: "push", target: rival, to: exits.sort()[0] },
          };
      }
      delete this.grievances[actor];
      if (!decision) decision = E.decide(o);
      const res = E.perform(before, actor, decision.action);
      this.state = res.state;
      this.cursor++;
      // Never show the private policy reason: it can reveal the bot's objective.
      return this.record(actor + " actúa", res.text, res, before);
    }
    exportReplay() {
      return {
        title: "Mesa jugable · " + this.state.seed,
        engine: E.VERSION,
        seed: this.state.seed,
        profile: this.state.profile,
        result: this.state.result,
        snapshot: copy(this.initial),
        story: { steps: copy(this.steps) },
      };
    }
    serialize() {
      return JSON.stringify({
        version: this.version,
        human: this.human,
        state: this.state,
        initial: this.initial,
        cursor: this.cursor,
        grievances: this.grievances,
        log: this.log,
        steps: this.steps,
      });
    }
    static restore(serialized) {
      const data = JSON.parse(serialized);
      if (
        data.version !== VERSION ||
        data.state?.version !== E.VERSION ||
        !/^J[1-4]$/.test(data.human) ||
        !Number.isInteger(data.cursor) ||
        data.cursor < 0 ||
        data.cursor > 4 ||
        !Array.isArray(data.steps) ||
        !Array.isArray(data.log) ||
        !data.initial
      )
        throw Error("Partida guardada incompatible");
      E.assertState(data.state);
      const table = Object.create(Table.prototype);
      Object.assign(table, data);
      return table;
    }
  }
  return { Table, VERSION };
});
