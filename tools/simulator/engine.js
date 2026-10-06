/* Shared deterministic engine: Node CLI and browser. No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object") module.exports = api;
  else root.Superheist = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ACTION_NAMES = {
    wait: "espera",
    move: "mueve",
    stand: "se levanta",
    openDoor: "intenta abrir una puerta",
    openVault: "intenta abrir la bóveda",
    pick: "recoge un objeto",
    rearrange: "reacomoda el inventario",
    deposit: "deposita",
    board: "sube al auto",
    unboard: "baja del auto",
    depart: "hace partir el auto",
    hide: "se oculta",
    rescue: "rescata",
    push: "empuja",
    fightPlayer: "combate con otro jugador",
    fight: "ataca",
    use: "usa Equipo",
    power: "usa su poder",
  };
  const VERSION = "s1.0",
    CAR = "4,3",
    COLORS = ["#ff667d", "#5dc9ff", "#ffd166", "#75e58b"];
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const edge = (a, b) => [a, b].sort().join("|");
  const ITEMS = {
    tools: { name: "Herramientas", kind: "tools" },
    gun: { name: "Arma corta", kind: "gun" },
    brides: { name: "Bridas", kind: "brides" },
    smoke: { name: "Humo", kind: "smoke" },
    bag: { name: "Mochila grande", kind: "bag" },
    bike: { name: "Moto portátil", kind: "bike" },
  };
  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function random(s) {
    s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    return s.rng / 4294967296;
  }
  function die(s, rolls, label, bonus = 0, target = null) {
    const value = 1 + Math.floor(random(s) * 10);
    rolls.push({ label, die: value, bonus, total: value + bonus, target });
    return value + bonus;
  }
  function shuffle(s, a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random(s) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function neighbors(s, k, open = true) {
    return s.rooms
      .filter((r) => r.key === k)
      .flatMap((r) => r.neighbors)
      .filter((x) => !open || !s.doors[edge(k, x)]?.closed)
      .sort();
  }
  function path(s, from, to, open = true) {
    const q = [[from]],
      seen = new Set([from]);
    while (q.length) {
      const p = q.shift(),
        last = p.at(-1);
      if (last === to) return p;
      for (const n of neighbors(s, last, open))
        if (!seen.has(n)) {
          seen.add(n);
          q.push([...p, n]);
        }
    }
    return [];
  }
  function inHand(s, p, kind) {
    return p.hands.some((id) => id && s.objects[id]?.kind === kind);
  }
  function held(p) {
    return [...p.hands, ...p.bag].filter(Boolean);
  }
  function lootValue(s, p) {
    return held(p).reduce(
      (n, id) => n + (s.objects[id].kind === "loot" ? s.objects[id].value : 0),
      0,
    );
  }
  function freeSlots(p) {
    return [
      ...p.hands.map((x, i) => (x ? null : "h" + i)),
      ...p.bag.map((x, i) => (x ? null : "b" + i)),
    ].filter(Boolean);
  }
  function put(p, slot, id) {
    p[slot[0] === "h" ? "hands" : "bag"][Number(slot.slice(1))] = id;
  }
  function remove(p, id) {
    for (const a of [p.hands, p.bag]) {
      const i = a.indexOf(id);
      if (i >= 0) a[i] = null;
    }
  }
  function enemies(s, k) {
    return [...Object.values(s.guards), ...Object.values(s.swats)].filter(
      (g) => g.position === k && g.status === "active",
    );
  }
  function raise(s) {
    s.alert = Math.min(4, s.alert + 1);
    if (s.alert >= 3 && !s.lockdown) {
      s.lockdown = true;
      for (const d of Object.values(s.doors))
        if (![d.a, d.b].includes(CAR)) d.closed = true;
    }
    if (s.alert === 4 && s.swatRound === null) s.swatRound = s.round + 2;
  }
  function makeScenario(seed = "superheist-1", profile = "cooperative") {
    if (!["cooperative", "conflict"].includes(profile))
      throw Error("Perfil desconocido");
    const definitions = [
      ["4,4", "Recepción"],
      ["3,4", "Pasillo norte"],
      ["2,4", "Seguridad"],
      ["2,5", "Bóveda A"],
      ["3,5", "Oficina"],
      ["4,5", "Pasillo este"],
      ["4,6", "Bóveda B"],
      ["5,4", "Personal"],
      ["5,5", "Archivo"],
      ["5,6", "Bóveda C"],
      [CAR, "Exterior / auto"],
    ];
    const links = [
      ["4,3", "4,4"],
      ["4,4", "3,4"],
      ["3,4", "2,4"],
      ["2,4", "2,5"],
      ["2,5", "3,5"],
      ["3,5", "3,4"],
      ["3,5", "4,5"],
      ["4,4", "4,5"],
      ["4,5", "4,6"],
      ["4,4", "5,4"],
      ["5,4", "5,5"],
      ["5,5", "5,6"],
      ["5,6", "4,6"],
    ];
    const rooms = definitions.map(([key, name]) => ({
      key,
      name,
      neighbors: links
        .filter((a) => a.includes(key))
        .map((a) => a.find((x) => x !== key)),
      camera: key === "2,4" ? 6 : 0,
      cameraOffUntil: 0,
      event: null,
    }));
    const s = {
      version: VERSION,
      seed: String(seed),
      profile,
      rng: hash(seed),
      rooms,
      doors: Object.fromEntries(
        links.map(([a, b]) => [edge(a, b), { a, b, closed: false }]),
      ),
      players: {},
      guards: {},
      swats: {},
      objects: {},
      vaults: {},
      round: 1,
      turn: 0,
      alert: 0,
      lockdown: false,
      swatRound: null,
      swatEntered: false,
      sherlock: 0,
      depositedLoot: 0,
      deposited: [],
      attention: [],
      knownLoot: {},
      knownEvents: {},
      lastSeen: {},
      revealedEvents: [],
      revealedLoot: [],
      ended: false,
      result: null,
      metrics: {
        actions: 0,
        combats: 0,
        pushes: 0,
        detections: 0,
        arrests: 0,
        rescues: 0,
        powers: 0,
        vaultsOpened: 0,
        sherlockSpent: 6,
      },
    };
    const vals = shuffle(s, [2, 3, 4]);
    ["2,5", "4,6", "5,6"].forEach((k, i) => {
      const id = "L" + (i + 1);
      s.objects[id] = {
        id,
        kind: "loot",
        name: "Botín " + (i + 1),
        value: vals[i],
        location: k,
      };
      s.vaults[k] = { open: false, loot: id };
    });
    shuffle(s, ["camera", "sensor"]).forEach((kind, i) => {
      const room = s.rooms.find((r) => r.key === ["3,5", "5,5"][i]);
      room.event = { id: "E:" + room.key, kind, revealed: false };
    });
    const deck = shuffle(s, Object.keys(ITEMS)),
      names = ["Cerrajera", "Mensajero", "Hacker", "Rescatista"],
      powers = ["phase", "peek", "pulse", "strength"];
    const stats = [
      { tecnica: 3, fisico: 1, sigilo: 2 },
      { tecnica: 1, fisico: 3, sigilo: 2 },
      { tecnica: 3, fisico: 1, sigilo: 1 },
      { tecnica: 1, fisico: 3, sigilo: 2 },
    ];
    for (let i = 0; i < 4; i++) {
      const id = "J" + (i + 1),
        item = "I" + (i + 1),
        kind = deck[i];
      s.objects[item] = { id: item, ...ITEMS[kind], location: id };
      s.players[id] = {
        id,
        name: names[i],
        stats: stats[i],
        power: powers[i],
        powerUsed: false,
        objective:
          i === 0
            ? "professional"
            : i === 1
              ? "ghost"
              : i === 2 && profile === "conflict"
                ? "greed"
                : i === 3 && profile === "conflict"
                  ? "enemy"
                  : "professional",
        enemy: "J1",
        policy:
          profile === "conflict" && i >= 2
            ? i === 2
              ? "greedy"
              : "saboteur"
            : i === 1
              ? "careful"
              : "cooperative",
        position: CAR,
        status: "active",
        boarded: false,
        hands: [null, null],
        bag: [item, null],
        equipment: [],
        hidden: false,
        detected: false,
        privateEvents: {},
        carryingLoot: 0,
      };
    }
    const routeList = [
      ["4,4", "3,4", "2,4"],
      ["4,5", "4,6", "5,6"],
    ];
    routeList.forEach((route, i) => {
      const id = "G" + (i + 1);
      s.guards[id] = {
        id,
        position: route[0],
        route,
        index: 0,
        direction: 1,
        arrow: route[1],
        mode: "patrol",
        status: "active",
        bound: false,
        percepcion: 5,
        combate: 6,
      };
    });
    s.knownLoot["2,5"] = s.objects[s.vaults["2,5"].loot].value;
    s.knownEvents["3,5"] = s.rooms.find((r) => r.key === "3,5").event.kind;
    validateSetup(s);
    assertState(s);
    return s;
  }
  function validateSetup(s) {
    if (Object.keys(s.players).length !== 4)
      throw Error("s1 requiere cuatro jugadores");
    for (const r of s.rooms) {
      if (!path(s, CAR, r.key, false).length) throw Error("Sala inaccesible");
      for (const k of r.neighbors)
        if (!neighbors(s, k, false).includes(r.key))
          throw Error("Conexión asimétrica");
    }
    if (
      Object.values(s.vaults).reduce((n, v) => n + s.objects[v.loot].value, 0) <
      6
    )
      throw Error("Botín insuficiente");
    for (const g of Object.values(s.guards)) {
      if (
        g.route.length !== 3 ||
        new Set(g.route).size !== 3 ||
        !neighbors(s, g.route[0], false).includes(g.route[1]) ||
        !neighbors(s, g.route[1], false).includes(g.route[2])
      )
        throw Error("Patrulla inválida");
      const common = neighbors(s, g.route[0], false).filter((k) =>
        neighbors(s, g.route[2], false).includes(k),
      );
      if (common.length !== 1) throw Error("Patrulla ambigua con dos extremos");
    }
    return true;
  }
  function assertState(s) {
    const occurrences = [];
    for (const p of Object.values(s.players)) {
      if (p.hands.length !== 2 || p.bag.length !== (p.equipment.length ? 4 : 2))
        throw Error("Capacidad inválida");
      for (const id of [...held(p), ...p.equipment]) {
        occurrences.push(id);
        if (s.objects[id]?.location !== p.id) throw Error("Propiedad inválida");
      }
      if (p.boarded && p.position !== CAR)
        throw Error("Embarcado fuera del auto");
      if (!s.rooms.some((r) => r.key === p.position))
        throw Error("Jugador fuera del mapa");
      p.carryingLoot = lootValue(s, p);
    }
    if (new Set(occurrences).size !== occurrences.length)
      throw Error("Objeto duplicado");
    for (const o of Object.values(s.objects)) {
      if (s.players[o.location] && !occurrences.includes(o.id))
        throw Error("Objeto perdido del inventario");
      if (
        !s.players[o.location] &&
        !s.rooms.some((r) => r.key === o.location) &&
        !["deposited", "discarded"].includes(o.location)
      )
        throw Error("Ubicación objeto inválida");
    }
    if (
      s.depositedLoot !==
      Object.values(s.objects)
        .filter((o) => o.location === "deposited")
        .reduce((n, o) => n + o.value, 0)
    )
      throw Error("Botín no conservado");
    for (const g of [...Object.values(s.guards), ...Object.values(s.swats)])
      if (g.arrow && !neighbors(s, g.position, false).includes(g.arrow))
        throw Error("Flecha no apunta a próxima puerta");
    return true;
  }
  function observe(s, id) {
    const me = copy(s.players[id]);
    return {
      version: s.version,
      round: s.round,
      alert: s.alert,
      swatRound: s.swatRound,
      depositedLoot: s.depositedLoot,
      car: CAR,
      me,
      rooms: s.rooms.map((r) => ({
        key: r.key,
        name: r.name,
        neighbors: [...r.neighbors],
        camera: r.camera,
        cameraOffUntil: r.cameraOffUntil,
        event: r.event
          ? {
              id: r.event.id,
              revealed: r.event.revealed,
              kind: r.event.revealed
                ? r.event.kind
                : me.privateEvents[r.key] || s.knownEvents[r.key] || null,
            }
          : null,
      })),
      doors: copy(s.doors),
      vaults: Object.fromEntries(
        Object.entries(s.vaults).map(([k, v]) => [
          k,
          {
            open: v.open,
            loot: v.loot,
            value: v.open ? s.objects[v.loot].value : (s.knownLoot[k] ?? null),
            available: s.objects[v.loot].location === k,
          },
        ]),
      ),
      objects: Object.fromEntries(
        Object.entries(s.objects)
          .filter(
            ([, o]) =>
              o.location === id ||
              (s.rooms.some((r) => r.key === o.location) &&
                (o.kind !== "loot" ||
                  s.vaults[o.location]?.open ||
                  !s.vaults[o.location])),
          )
          .map(([k, o]) => [k, copy(o)]),
      ),
      players: Object.fromEntries(
        Object.entries(s.players).map(([k, p]) => [
          k,
          k === id
            ? copy(p)
            : {
                id: k,
                position: p.position,
                status: p.status,
                boarded: p.boarded,
                stats: copy(p.stats),
                power: p.power,
                hands: p.hands.map(Boolean),
                bag: p.bag.map(Boolean),
                carryingLoot: p.carryingLoot,
              },
        ]),
      ),
      guards: copy(s.guards),
      swats: copy(s.swats),
    };
  }
  function legalActions(s, id) {
    const p = s.players[id];
    if (
      !p ||
      s.ended ||
      ["arrested", "escaped", "leftbehind"].includes(p.status)
    )
      return [];
    if (p.status === "reduced") return [{ type: "stand" }];
    const a = [{ type: "wait" }],
      hand = p.hands.includes(null),
      here = p.position,
      add = (type, x = {}) => a.push({ type, ...x });
    if (p.boarded) {
      add("unboard");
      if (
        s.depositedLoot >= 6 &&
        Object.values(s.players).filter((x) => x.boarded).length >= 2
      )
        add("depart");
      return a;
    }
    for (const to of neighbors(s, here)) add("move", { to });
    for (const to of neighbors(s, here, false))
      if (s.doors[edge(here, to)].closed && hand) add("openDoor", { to });
    if (hand && s.vaults[here] && !s.vaults[here].open) add("openVault");
    if (hand)
      for (const o of Object.values(s.objects))
        if (
          o.location === here &&
          (o.kind !== "loot" || !s.vaults[here] || s.vaults[here].open)
        )
          for (const slot of freeSlots(p)) add("pick", { object: o.id, slot });
    if (here === CAR) {
      add("board");
      if (held(p).some((x) => s.objects[x].kind === "loot")) add("deposit");
    }
    add("hide");
    for (const obj of held(p))
      for (const slot of freeSlots(p)) add("rearrange", { object: obj, slot });
    for (const ally of Object.values(s.players))
      if (
        ally.id !== id &&
        ally.position === here &&
        !ally.boarded &&
        ally.status === "active" &&
        hand
      ) {
        for (const to of neighbors(s, here))
          add("push", { target: ally.id, to });
        add("fightPlayer", { target: ally.id });
      }
    if (hand)
      for (const ally of Object.values(s.players))
        if (
          ally.position === here &&
          ally.status === "arrested" &&
          !enemies(s, here).length
        )
          add("rescue", { target: ally.id });
    for (const g of [...Object.values(s.guards), ...Object.values(s.swats)])
      if (
        g.position === here &&
        g.status === "active" &&
        (hand || inHand(s, p, "gun"))
      ) {
        add("fight", { target: g.id });
        if (inHand(s, p, "gun")) add("fight", { target: g.id, lethal: true });
      }
    for (const obj of p.hands.filter(Boolean)) {
      const o = s.objects[obj];
      if (o.kind === "bag" && !p.equipment.length) add("use", { object: obj });
      if (o.kind === "smoke") add("use", { object: obj });
      if (
        o.kind === "bike" &&
        here === CAR &&
        held(p).filter((x) => s.objects[x].kind === "loot").length <= 1
      )
        add("use", { object: obj });
      if (o.kind === "brides")
        for (const g of Object.values(s.guards))
          if (g.position === here && g.status === "reduced" && !g.bound)
            add("use", { object: obj, target: g.id });
    }
    if (p.power === "phase" && !lootValue(s, p) && here !== CAR) {
      const [r, c] = here.split(",").map(Number);
      for (const room of s.rooms) {
        const [rr, cc] = room.key.split(",").map(Number);
        if (
          room.key !== CAR &&
          Math.abs(r - rr) + Math.abs(c - cc) === 1 &&
          !neighbors(s, here).includes(room.key)
        )
          add("power", { to: room.key });
      }
    }
    if (
      p.power === "pulse" &&
      s.rooms.find((r) => r.key === here).camera &&
      s.rooms.find((r) => r.key === here).cameraOffUntil <= s.round
    )
      add("power");
    if (p.power === "peek")
      for (const room of s.rooms)
        if (
          (room.key === here || neighbors(s, here, false).includes(room.key)) &&
          room.event &&
          !room.event.revealed &&
          !p.privateEvents[room.key] &&
          !s.knownEvents[room.key]
        )
          add("power", { room: room.key });
    if (p.power === "strength" && !p.powerUsed)
      for (const g of Object.values(s.guards))
        if (g.position === here && g.status === "active")
          add("power", { target: g.id });
    return a;
  }
  function detect(s, p, rolls, notes) {
    if (p.position === CAR || p.status !== "active" || p.boarded) return;
    if (p.position === "4,4" && s.alert < 2 && !lootValue(s, p)) return;
    const room = s.rooms.find((r) => r.key === p.position),
      es = enemies(s, p.position),
      per = Math.max(
        room.cameraOffUntil > s.round ? 0 : room.camera,
        ...es.map((g) => g.percepcion),
        0,
      );
    if (!per) return;
    const bonus = p.stats.sigilo + (p.hidden ? 2 : 0);
    p.hidden = false;
    if (die(s, rolls, p.id + " detección", bonus, per) >= per) return;
    p.detected = true;
    s.lastSeen[p.id] = p.position;
    s.metrics.detections++;
    raise(s);
    notes.push(p.id + " detectado: Alerta " + s.alert);
    if (es.length) {
      const g = es.sort((a, b) => a.id.localeCompare(b.id))[0];
      g.arrow = null;
      g.mode = "return";
      s.metrics.combats++;
      if (
        die(
          s,
          rolls,
          p.id + " defensa",
          p.stats.fisico + (inHand(s, p, "gun") ? 2 : 0),
          g.combate,
        ) < g.combate
      ) {
        p.status = "reduced";
        notes.push(p.id + " reducido");
      }
    }
  }
  function enter(s, p, to, rolls, notes) {
    p.position = to;
    p.hidden = false;
    const room = s.rooms.find((r) => r.key === to);
    if (room.event) {
      const e = room.event;
      if (!e.revealed) {
        e.revealed = true;
        s.revealedEvents.push(e.id);
        notes.push("Evento: " + e.kind);
        if (e.kind === "camera") room.camera = Math.max(room.camera, 6);
      }
      if (e.kind === "sensor") {
        if (!s.attention.includes(to)) s.attention.push(to);
        notes.push("Sensor: Atención en " + to);
      }
    }
    detect(s, p, rolls, notes);
  }
  function finish(s, reason) {
    s.ended = true;
    const success = reason === "depart";
    for (const p of Object.values(s.players)) {
      if (success && p.boarded) p.status = "escaped";
      else if (p.status !== "escaped" && p.status !== "arrested")
        p.status = "leftbehind";
    }
    const won = {};
    for (const p of Object.values(s.players)) {
      let ok = p.status === "escaped";
      if (p.objective === "professional") ok = ok && success;
      if (p.objective === "ghost") ok = ok && !p.detected;
      if (p.objective === "greed")
        ok =
          ok &&
          Object.values(s.players).every(
            (x) => x.id === p.id || lootValue(s, p) > lootValue(s, x),
          );
      if (p.objective === "enemy")
        ok = ok && s.players[p.enemy].status !== "escaped";
      won[p.id] = ok;
    }
    s.result = {
      reason,
      groupSuccess: success,
      personal: won,
      rounds: s.round,
      depositedLoot: s.depositedLoot,
      alert: s.alert,
      swat: s.swatEntered,
      ...s.metrics,
    };
  }
  function perform(original, id, action) {
    const s = copy(original),
      p = s.players[id],
      notes = [],
      rolls = [];
    if (!p) throw Error("Jugador inexistente");
    const a = copy(action),
      drops = a.drop || [];
    delete a.drop;
    if (drops.length && (p.status !== "active" || p.boarded || s.ended))
      throw Error("No puede soltar");
    for (const obj of drops) {
      if (!held(p).includes(obj)) throw Error("No posee objeto para soltar");
      remove(p, obj);
      s.objects[obj].location = p.position;
      notes.push("Suelta " + obj);
    }
    if (
      !legalActions(s, id).some((x) => JSON.stringify(x) === JSON.stringify(a))
    )
      throw Error("Acción ilegal: " + id + " " + JSON.stringify(a));
    const here = p.position;
    s.metrics.actions++;
    let msg = ACTION_NAMES[a.type] || a.type;
    switch (a.type) {
      case "move":
        enter(s, p, a.to, rolls, notes);
        msg = "mueve " + here + " → " + a.to;
        break;
      case "stand":
        p.status = "active";
        msg = "se levanta";
        break;
      case "openDoor":
        if (die(s, rolls, id + " cerradura", p.stats.tecnica, 5) >= 5)
          s.doors[edge(here, a.to)].closed = false;
        else if (!s.attention.includes(here)) s.attention.push(here);
        break;
      case "openVault": {
        const bonus = p.stats.tecnica + (inHand(s, p, "tools") ? 2 : 0);
        if (die(s, rolls, id + " bóveda", bonus, 7) >= 7) {
          s.vaults[here].open = true;
          s.knownLoot[here] = s.objects[s.vaults[here].loot].value;
          s.revealedLoot.push(s.vaults[here].loot);
          s.metrics.vaultsOpened++;
          notes.push("Botín revelado: " + s.knownLoot[here]);
        } else if (!s.attention.includes(here)) s.attention.push(here);
        break;
      }
      case "pick":
        put(p, a.slot, a.object);
        s.objects[a.object].location = id;
        break;
      case "rearrange":
        remove(p, a.object);
        put(p, a.slot, a.object);
        break;
      case "deposit":
        for (const obj of held(p))
          if (s.objects[obj].kind === "loot") {
            remove(p, obj);
            s.objects[obj].location = "deposited";
            s.deposited.push(obj);
            s.depositedLoot += s.objects[obj].value;
          }
        msg = "deposita botín: total " + s.depositedLoot;
        break;
      case "board":
        p.boarded = true;
        break;
      case "unboard":
        p.boarded = false;
        break;
      case "depart":
        finish(s, "depart");
        break;
      case "hide":
        p.hidden = true;
        break;
      case "rescue":
        s.players[a.target].status = "active";
        s.metrics.rescues++;
        break;
      case "push":
      case "fightPlayer": {
        const q = s.players[a.target];
        if (a.type === "push") s.metrics.pushes++;
        else s.metrics.combats++;
        const attack = die(s, rolls, id + " " + a.type, p.stats.fisico),
          defense = die(s, rolls, q.id + " resistencia", q.stats.fisico);
        if (attack > defense) {
          if (a.type === "push") enter(s, q, a.to, rolls, notes);
          else q.status = "reduced";
        }
        msg =
          ACTION_NAMES[a.type] +
          " contra " +
          q.id +
          (attack > defense ? " — éxito" : " — resiste");
        break;
      }
      case "fight": {
        const g = s.guards[a.target] || s.swats[a.target];
        g.arrow = null;
        g.mode = "return";
        s.metrics.combats++;
        const gun = inHand(s, p, "gun");
        if (gun) raise(s);
        if (
          die(
            s,
            rolls,
            id + " ataque",
            p.stats.fisico + (gun ? 2 : 0),
            g.combate,
          ) >= g.combate
        ) {
          g.status = a.lethal ? "dead" : "reduced";
          g.arrow = null;
          if (a.lethal) raise(s);
        } else p.status = "reduced";
        break;
      }
      case "use": {
        const o = s.objects[a.object];
        remove(p, o.id);
        if (o.kind === "bag") {
          p.equipment.push(o.id);
          p.bag.push(null, null);
        } else {
          o.location = "discarded";
          if (o.kind === "smoke") {
            p.hidden = true;
            s.rooms.find((r) => r.key === here).cameraOffUntil = s.round + 1;
          }
          if (o.kind === "bike") {
            p.status = "escaped";
          }
          if (o.kind === "brides") s.guards[a.target].bound = true;
        }
        break;
      }
      case "power":
        s.metrics.powers++;
        if (p.power === "phase") enter(s, p, a.to, rolls, notes);
        if (p.power === "peek")
          p.privateEvents[a.room] = s.rooms.find(
            (r) => r.key === a.room,
          ).event.kind;
        if (p.power === "pulse")
          s.rooms.find((r) => r.key === here).cameraOffUntil = s.round + 1;
        if (p.power === "strength") {
          const g = s.guards[a.target];
          g.status = "reduced";
          g.arrow = null;
          p.powerUsed = true;
        }
        break;
    }
    assertState(s);
    return {
      state: s,
      rolls,
      text: id + " " + msg + (notes.length ? "\n" + notes.join("\n") : ""),
      action: { id, ...action },
    };
  }
  function security(original) {
    const s = copy(original),
      rolls = [],
      notes = [];
    if (s.swatRound !== null && s.round >= s.swatRound && !s.swatEntered) {
      s.swatEntered = true;
      for (const g of Object.values(s.guards)) {
        g.status = "removed";
        g.arrow = null;
      }
      for (let i = 1; i <= 2; i++)
        s.swats["S" + i] = {
          id: "S" + i,
          position: "4,4",
          status: "active",
          percepcion: 7,
          combate: 8,
          arrow: null,
          searchIndex: i - 1,
        };
      notes.push("Entra SWAT; se retiran guardias.");
    } else
      for (const g of s.swatEntered
        ? Object.values(s.swats)
        : Object.values(s.guards)) {
        if (g.status === "reduced") {
          if (!g.bound) {
            g.status = "active";
            g.mode = "return";
            g.arrow = null;
          }
          continue;
        }
        if (g.status !== "active") continue;
        const reduced = Object.values(s.players).find(
          (p) =>
            p.position === g.position && p.status === "reduced" && !p.boarded,
        );
        if (reduced) {
          reduced.status = "arrested";
          s.metrics.arrests++;
          g.arrow = null;
          g.mode = "return";
          notes.push(g.id + " arresta a " + reduced.id);
          continue;
        }
        const known = Object.values(s.players).find(
          (p) =>
            p.position === g.position &&
            p.status === "active" &&
            !p.boarded &&
            s.lastSeen[p.id] === g.position,
        );
        if (known) {
          g.arrow = null;
          g.mode = "return";
          continue;
        }
        let target;
        if (s.swatEntered) {
          for (const [id, k] of Object.entries(s.lastSeen))
            if (
              k === g.position &&
              !Object.values(s.players).some(
                (p) => p.position === k && p.status === "active" && !p.boarded,
              )
            )
              delete s.lastSeen[id];
          const clues = Object.entries(s.lastSeen).sort((a, b) =>
            a[0].localeCompare(b[0]),
          );
          target = clues.length
            ? clues[0][1]
            : Object.keys(s.vaults).sort()[g.searchIndex % 3];
          if (g.position === target) {
            g.searchIndex++;
            target = Object.keys(s.vaults).sort()[g.searchIndex % 3];
          }
        } else {
          const noise = s.attention
            .filter((k) => g.route.includes(k))
            .sort(
              (a, b) =>
                path(s, g.position, a, false).length -
                  path(s, g.position, b, false).length || a.localeCompare(b),
            );
          if (noise.length) {
            g.mode = "investigate";
            g.arrow = null;
            target = noise[0];
            if (target === g.position) {
              s.attention = s.attention.filter((k) => k !== target);
              g.mode = "return";
              continue;
            }
          } else if (g.mode !== "patrol") {
            g.mode = "return";
            g.arrow = null;
            target = g.route[1];
            if (g.position === target) {
              g.mode = "patrol";
              g.index = 1;
              g.direction = -1;
              g.arrow = g.route[0];
              continue;
            }
          } else {
            if (g.index === 0) g.direction = 1;
            if (g.index === 2) g.direction = -1;
            target = g.route[g.index + g.direction];
            g.arrow = target;
          }
        }
        const next = path(s, g.position, target, false)[1];
        if (next) {
          const d = s.doors[edge(g.position, next)];
          if (d.closed) {
            d.closed = false;
            notes.push(g.id + " abre puerta");
          } else {
            g.position = next;
            if (!s.swatEntered && g.mode === "patrol") {
              g.index = g.route.indexOf(next);
              if (g.index === 0) g.direction = 1;
              if (g.index === 2) g.direction = -1;
              g.arrow = g.route[g.index + g.direction];
            }
            notes.push(g.id + " → " + next);
          }
        }
      }
    for (const p of Object.values(s.players)) detect(s, p, rolls, notes);
    if (s.round >= 28) finish(s, "timeout");
    else if (
      !Object.values(s.players).some((p) =>
        ["active", "reduced"].includes(p.status),
      )
    )
      finish(s, "noActors");
    assertState(s);
    return {
      state: s,
      rolls,
      text: notes.join("\n") || "Patrullas y vigilancia resueltas.",
      action: { type: "security" },
    };
  }
  // The policy receives only this observation, never the full state, seed or RNG.
  function decide(o) {
    const p = o.me,
      here = p.position,
      own = Object.values(o.objects).filter((x) => x.location === p.id),
      carrying = own.filter((x) => x.kind === "loot"),
      hand = p.hands.includes(null);
    const out = (action, reason) => ({ action, reason });
    const walk = (target) => {
      const next = path(o, here, target, false)[1];
      if (!next) return out({ type: "wait" }, "Sin ruta disponible.");
      if (o.doors[edge(here, next)].closed)
        return hand
          ? out(
              { type: "openDoor", to: next },
              "Abrir la puerta del recorrido conocido.",
            )
          : freeHand();
      return out(
        { type: "move", to: next },
        "Avanzar hacia " + target + " por el mapa público.",
      );
    };
    const freeHand = () => {
      const id = p.hands.find(Boolean),
        slot = freeSlots(p).find((x) => x[0] === "b");
      return slot
        ? out(
            { type: "rearrange", object: id, slot },
            "Liberar una mano guardando Equipo.",
          )
        : out(
            { type: "wait", drop: [id] },
            "Dejar un objeto para poder manipular en el próximo turno.",
          );
    };
    if (p.status === "reduced")
      return out({ type: "stand" }, "Recuperarse de la reducción.");
    if (p.boarded) {
      if (
        o.depositedLoot >= 6 &&
        Object.values(o.players).filter((x) => x.boarded).length >= 2
      ) {
        if (
          p.policy === "careful" &&
          Object.values(o.players).some(
            (x) => x.status === "active" && !x.boarded,
          )
        )
          return out({ type: "wait" }, "Esperar compañeros todavía libres.");
        return out(
          { type: "depart" },
          "Se cumplen botín y ocupación; iniciar la fuga.",
        );
      }
      return out({ type: "wait" }, "Esperar a que el vehículo pueda partir.");
    }
    const es = [...Object.values(o.guards), ...Object.values(o.swats)].filter(
      (g) => g.position === here && g.status === "active",
    );
    const arrested = Object.values(o.players).find(
      (q) => q.position === here && q.status === "arrested",
    );
    if (arrested && !es.length && hand && p.policy !== "saboteur")
      return out(
        { type: "rescue", target: arrested.id },
        "Rescatar a un compañero accesible.",
      );
    if (
      p.policy === "saboteur" &&
      (o.depositedLoot > 0 || o.players[p.enemy].carryingLoot > 0)
    ) {
      const victim = o.players[p.enemy];
      if (
        victim.position === here &&
        victim.status === "active" &&
        !victim.boarded &&
        hand
      ) {
        const dest = neighbors(o, here).sort(
          (a, b) => path(o, b, CAR).length - path(o, a, CAR).length,
        )[0];
        if (dest && path(o, dest, CAR).length > path(o, here, CAR).length)
          return out(
            { type: "push", target: victim.id, to: dest },
            "Alejar a mi enemigo del auto antes de escapar.",
          );
      }
    }
    if (
      es.length &&
      p.power === "strength" &&
      !p.powerUsed &&
      es[0].id.startsWith("G")
    )
      return out(
        { type: "power", target: es[0].id },
        "Usar Superfuerza contra el guardia presente.",
      );
    const room = o.rooms.find((r) => r.key === here);
    if (
      p.power === "pulse" &&
      room.camera &&
      room.cameraOffUntil <= o.round &&
      o.vaults[here]?.available
    )
      return out(
        { type: "power" },
        "Desactivar vigilancia antes de manipular el botín.",
      );
    const bag = own.find((x) => x.kind === "bag");
    if (bag && !p.equipment.length) {
      if (p.hands.includes(bag.id))
        return out({ type: "use", object: bag.id }, "Equipar mochila grande.");
      if (hand)
        return out(
          {
            type: "rearrange",
            object: bag.id,
            slot: "h" + p.hands.indexOf(null),
          },
          "Sacar la mochila para equiparla.",
        );
    }
    const tool = own.find((x) => x.kind === "tools");
    if (
      tool &&
      !p.hands.includes(tool.id) &&
      hand &&
      !carrying.length &&
      o.round === 1
    )
      return out(
        {
          type: "rearrange",
          object: tool.id,
          slot: "h" + p.hands.indexOf(null),
        },
        "Preparar herramientas recibidas en secreto.",
      );
    const retreat =
      o.depositedLoot >= 6 ||
      (carrying.length && (p.policy !== "greedy" || carrying.length >= 2)) ||
      o.round >= 23;
    if (retreat) {
      if (here !== CAR) return walk(CAR);
      if (carrying.length && !(p.policy === "greedy" && o.depositedLoot >= 6))
        return out({ type: "deposit" }, "Depositar el botín transportado.");
      if (o.depositedLoot >= 6)
        return out({ type: "board" }, "Subir al vehículo listo para partir.");
      if (o.round >= 26) {
        const bike = own.find((x) => x.kind === "bike");
        if (bike && carrying.length <= 1) {
          if (p.hands.includes(bike.id))
            return out(
              { type: "use", object: bike.id },
              "Escapar en moto ante el cierre.",
            );
          if (hand)
            return out(
              {
                type: "rearrange",
                object: bike.id,
                slot: "h" + p.hands.indexOf(null),
              },
              "Preparar la moto.",
            );
        }
      }
    }
    const targets = Object.entries(o.vaults)
      .filter(([, v]) => v.available)
      .map(([k, v], i) => {
        const assigned = i === (Number(p.id.slice(1)) - 1) % 3 ? -2 : 0;
        const risk =
          p.policy === "careful"
            ? [...Object.values(o.guards), ...Object.values(o.swats)].filter(
                (g) => g.status === "active" && g.position === k,
              ).length * 3
            : 0;
        return {
          k,
          score:
            path(o, here, k, false).length +
            assigned +
            risk -
            (v.value ?? 2) * 0.25,
        };
      })
      .sort((a, b) => a.score - b.score || a.k.localeCompare(b.k));
    if (!targets.length)
      return here === CAR
        ? out({ type: "wait" }, "No queda botín accesible en las bóvedas.")
        : walk(CAR);
    const target = targets[0].k;
    if (here === target) {
      if (!hand) return freeHand();
      if (!o.vaults[here].open)
        return out(
          { type: "openVault" },
          "Abrir bóveda; su valor " +
            (o.vaults[here].value === null
              ? "es desconocido."
              : "se conoce por investigación."),
        );
      const slot = freeSlots(p).sort((a, b) =>
        a[0] === "b" ? -1 : b[0] === "b" ? 1 : 0,
      )[0];
      return out(
        { type: "pick", object: o.vaults[here].loot, slot },
        "Recoger el botín revelado.",
      );
    }
    const next = path(o, here, target, false)[1];
    if (
      p.power === "peek" &&
      next &&
      o.rooms.find((r) => r.key === next)?.event?.kind === null
    )
      return out(
        { type: "power", room: next },
        "Consultar el evento desconocido antes de entrar.",
      );
    if (p.power === "phase" && !carrying.length && here !== CAR) {
      const [r, c] = here.split(",").map(Number);
      const dest = o.rooms
        .filter((x) => x.key !== CAR && !neighbors(o, here).includes(x.key))
        .filter((x) => {
          const [rr, cc] = x.key.split(",").map(Number);
          return Math.abs(rr - r) + Math.abs(cc - c) === 1;
        })
        .find(
          (x) =>
            path(o, x.key, target, false).length + 1 <
            path(o, here, target, false).length,
        );
      if (dest)
        return out(
          { type: "power", to: dest.key },
          "Atravesar una pared sin botín para acortar el recorrido.",
        );
    }
    return walk(target);
  }
  function frame(s) {
    const f = copy(s);
    delete f.rng;
    delete f.seed;
    return f;
  }
  function snapshot(s) {
    const dirs = { "-1,0": "N", "1,0": "S", "0,1": "E", "0,-1": "W" };
    return {
      schema: "superheist-replay-snapshot",
      version: VERSION,
      board: { rows: 9, cols: 9, receptionKey: "4,4", carKey: CAR },
      objective: { name: "Atraco de prueba", lootTarget: 6 },
      sherlock: { initial: 6, remaining: 0 },
      rooms: s.rooms
        .filter((r) => r.key !== CAR)
        .map((r) => {
          const [row, col] = r.key.split(",").map(Number);
          return {
            ...r,
            row,
            col,
            color: s.vaults[r.key] ? "#806a45" : "#485777",
            icons: r.camera ? [["camera", 75, 25]] : [],
            exits: r.neighbors.map((k) => {
              const [rr, cc] = k.split(",").map(Number);
              return dirs[[rr - row, cc - col].join(",")];
            }),
          };
        }),
      players: Object.values(s.players).map((p, i) => ({
        id: p.id,
        color: COLORS[i],
        character: { name: p.name },
        power: { name: p.power },
        objective: { name: p.objective },
      })),
      patrols: Object.values(s.guards).map((g, i) => ({
        id: i + 1,
        color: COLORS[i],
        post: g.route[0],
        nodes: g.route.slice(1),
        guardCard: { name: "Patrulla " + (i + 1) },
      })),
      swats: [1, 2].map((i) => ({
        id: "S" + i,
        color: COLORS[i - 1],
        card: { name: "SWAT" },
      })),
      events: s.rooms
        .filter((r) => r.event)
        .map((r) => ({
          id: r.event.id,
          roomKey: r.key,
          card: { name: r.event.kind },
        })),
      loot: Object.values(s.objects)
        .filter((o) => o.kind === "loot")
        .map((o) => ({ id: o.id, roomKey: o.location, value: o.value })),
      initialState: frame(s),
    };
  }
  function simulate(
    seed = "superheist-1",
    profile = "cooperative",
    keepReplay = true,
  ) {
    let s = makeScenario(seed, profile);
    const snap = keepReplay ? snapshot(s) : null;
    const steps = [];
    const record = (title, reason, res, before) => {
      if (!keepReplay) return;
      const actions = [];
      for (const [id, p] of Object.entries(res.state.players))
        if (before.players[id].position !== p.position)
          actions.push({
            op: "move",
            id,
            from: before.players[id].position,
            to: p.position,
          });
      steps.push({
        phase: "Ronda " + res.state.round,
        title,
        narration:
          reason +
          "\n" +
          res.text +
          (res.rolls.length
            ? "\n" +
              res.rolls
                .map(
                  (r) =>
                    `${r.label}: ${r.die} + ${r.bonus} = ${r.total}${r.target !== null ? " / dificultad " + r.target : ""}`,
                )
                .join("\n")
            : ""),
        focus: res.action.id ? ["player:" + res.action.id] : [],
        actions,
        command: res.action,
        rolls: res.rolls,
        state: frame(res.state),
      });
    };
    if (keepReplay)
      steps.push({
        phase: "Preparación",
        title: "Atraco reproducible · " + seed,
        narration:
          "4 jugadores. Sin Fiabilidad. SHERLOCK: 4 Equipos aleatorios + 2 investigaciones. Vista omnisciente; agentes con información limitada. Reglas " +
          VERSION +
          ".",
        actions: [],
        state: frame(s),
      });
    while (!s.ended) {
      const ids = Object.keys(s.players),
        start = (s.round - 1) % 4;
      for (let i = 0; i < 4 && !s.ended; i++) {
        const id = ids[(start + i) % 4];
        if (!["active", "reduced"].includes(s.players[id].status)) continue;
        const decision = decide(observe(s, id));
        const res = perform(s, id, decision.action);
        record(
          id + " · " + ACTION_NAMES[decision.action.type],
          decision.reason,
          res,
          s,
        );
        s = res.state;
      }
      if (!s.ended) {
        const res = security(s);
        record(
          "Seguridad",
          "Prioridades automáticas; flecha sólo en patrulla.",
          res,
          s,
        );
        s = res.state;
        if (!s.ended) s.round++;
      }
    }
    if (keepReplay)
      steps.push({
        phase: "Resultado",
        title: s.result.groupSuccess
          ? "El auto escapó"
          : "El golpe no alcanzó la meta",
        narration: JSON.stringify(s.result, null, 2),
        actions: [],
        state: frame(s),
      });
    return {
      title: "Simulación " + seed + " · " + profile,
      engine: VERSION,
      seed: String(seed),
      profile,
      result: s.result,
      snapshot: snap,
      story: { steps },
    };
  }
  return {
    VERSION,
    CAR,
    makeScenario,
    validateSetup,
    assertState,
    observe,
    legalActions,
    perform,
    security,
    decide,
    simulate,
    snapshot,
    path,
    frame,
  };
});
