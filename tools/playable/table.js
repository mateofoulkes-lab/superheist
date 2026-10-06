"use strict";
const $ = (id) => document.getElementById(id);
const E = Superheist,
  Table = SuperheistTable.Table;
const SAVE = "superheist.table.v1";
const COLORS = {
  J1: "#c7f180",
  J2: "#80c9df",
  J3: "#df9bcd",
  J4: "#eac47c",
  G1: "#eb9b68",
  G2: "#a8a5ef",
};
const STATUS = {
  active: "En pie",
  reduced: "Reducido",
  arrested: "Arrestado",
  escaped: "Escapó",
  leftbehind: "Quedó atrás",
  dead: "Eliminado",
  removed: "Retirado",
};
const POWERS = {
  phase: [
    "Intangible",
    "Atravesá una pared o puerta hacia una sala contigua. No funciona con botín ni desde el exterior.",
  ],
  peek: [
    "Visión remota",
    "Mirá el evento oculto de tu sala o de una sala contigua. Sólo vos recibís esa información.",
  ],
  pulse: ["Pulso", "Apagá la cámara de tu sala hasta el final de esta ronda."],
  strength: [
    "Fuerza brutal",
    "Reducí a un guardia de tu sala sin tirar dados. Una vez por partida.",
  ],
};
const OBJECTIVES = {
  professional: [
    "El profesional",
    "Escapá en el auto con el golpe completado.",
  ],
  ghost: ["El fantasma", "Escapá sin haber sido detectado durante el golpe."],
  greed: [
    "La tajada mayor",
    "Escapá llevando más valor de botín encima que cada uno de los demás. Lo depositado no cuenta.",
  ],
  enemy: ["Asunto pendiente", "Escapá y dejá atrás a tu rival: "],
};
const ITEMS = {
  tools: "En mano: +2 a las pruebas para abrir bóvedas.",
  gun: "En mano: +2 al combate y permite disparar. Un disparo eleva la alerta.",
  brides:
    "En mano: atás a un guardia reducido para que no se levante. Se consume.",
  smoke: "En mano: usalo para ocultarte y ganar cobertura. Se consume.",
  bag: "En mano: equipala para ampliar tu mochila a 4 espacios. No ocupa un espacio una vez equipada.",
  bike: "En mano y en el exterior: escapá por tu cuenta con, como máximo, un objeto de botín.",
  loot: "Llevalo al auto y depositá su valor para completar el golpe.",
};
let game = new Table("vista-previa"),
  ready = false,
  selected = E.CAR,
  fast = false,
  generation = 0,
  running = false,
  shownEnd = false,
  sound = false,
  audioContext,
  saveWarning = false;
let saved;
try {
  saved = localStorage.getItem(SAVE);
  if (saved) {
    game = Table.restore(saved);
    ready = true;
    selected = game.observation().me.position;
  }
} catch {
  saved = null;
}
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const roomName = (key) =>
  game.observation().rooms.find((r) => r.key === key)?.name || key;
const playerName = (id) =>
  game.publicPlayers().find((p) => p.id === id)?.name || id;
const objectiveText = (p) =>
  OBJECTIVES[p.objective][1] +
  (p.objective === "enemy" ? playerName(p.enemy) + " (" + p.enemy + ")." : "");
function toast(text) {
  $("toast").textContent = text;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").textContent = ""), 3200);
}
function persist() {
  if (!ready) return;
  try {
    localStorage.setItem(SAVE, game.serialize());
  } catch {
    if (!saveWarning) {
      toast("No se pudo guardar. Podés descargar tu partida.");
      saveWarning = true;
    }
  }
}
function beep() {
  if (!sound) return;
  try {
    audioContext ||= new AudioContext();
    const o = audioContext.createOscillator(),
      g = audioContext.createGain();
    o.connect(g);
    g.connect(audioContext.destination);
    o.frequency.setValueAtTime(420, audioContext.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      180,
      audioContext.currentTime + 0.12,
    );
    g.gain.setValueAtTime(0.045, audioContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.14);
    o.start();
    o.stop(audioContext.currentTime + 0.15);
  } catch {}
}
function button(text, fn, cls = "action-button") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function detail(title, body, buttons = []) {
  const wrap = $("detailContent");
  wrap.replaceChildren(
    el("div", "eyebrow", "SUPERHEIST / CARTAS Y ACCIONES"),
    el("h2", "", title),
  );
  const p = el("p", "", body);
  wrap.append(p);
  if (buttons.length) {
    const actions = el("div", "detail-actions");
    for (const b of buttons) actions.append(b);
    wrap.append(actions);
  }
  if (!$("detail").open) $("detail").showModal();
}
function actionLabel(a) {
  const labels = {
    wait: "Pasar",
    hide: "Ocultarte",
    stand: "Levantarte",
    openVault: "Abrir bóveda",
    board: "Subir al auto",
    unboard: "Bajar del auto",
    deposit: "Depositar botín",
    depart: "Arrancar y escapar",
    fight: "Combatir",
    fightPlayer: "Atacar",
    push: "Empujar",
    rescue: "Rescatar",
  };
  if (a.type === "move") return "Mover a " + roomName(a.to);
  if (a.type === "openDoor") return "Abrir puerta a " + roomName(a.to);
  if (a.type === "pick") return "Recoger en " + slotName(a.slot);
  if (a.type === "rearrange") return "Pasar a " + slotName(a.slot);
  if (a.type === "use") return "Usar" + (a.target ? " sobre " + a.target : "");
  if (a.type === "power")
    return (
      POWERS[game.observation().me.power][0] +
      (a.to
        ? " → " + roomName(a.to)
        : a.room
          ? " → " + roomName(a.room)
          : a.target
            ? " → " + a.target
            : "")
    );
  return (
    (a.lethal ? "Disparar" : labels[a.type] || a.type) +
    (a.target ? " a " + playerName(a.target) : "") +
    (a.type === "push" ? " → " + roomName(a.to) : "")
  );
}
function slotName(slot) {
  return slot[0] === "h"
    ? "mano " + (+slot[1] + 1)
    : "mochila " + (+slot[1] + 1);
}
function actionButton(a) {
  return button(actionLabel(a), () => play(a));
}
function chooseActions(
  title,
  actions,
  body = "Elegí cómo resolver tu acción. Consume tu turno.",
) {
  detail(title, body, actions.map(actionButton));
}
function play(a) {
  if (!ready || !game.isHumanTurn() || running) return;
  try {
    game.humanAction(a);
    if ($("detail").open) $("detail").close();
    selected = game.observation().me.position;
    beep();
    render();
    persist();
    pump();
  } catch (e) {
    toast(e.message);
  }
}
async function pump() {
  if (!ready || running || $("welcome").open) return;
  running = true;
  const token = generation;
  try {
    while (
      token === generation &&
      !game.state.ended &&
      game.actor() !== game.human
    ) {
      await new Promise((resolve) => setTimeout(resolve, fast ? 80 : 750));
      if (token !== generation) return;
      game.automatic();
      beep();
      render();
      persist();
    }
  } catch (e) {
    toast("La partida se detuvo: " + e.message);
    console.error(e);
  } finally {
    if (token === generation) {
      running = false;
      render();
      persist();
    }
  }
}
function fitBoard() {
  const box = $("boardViewport");
  const top = document
    .querySelector(".playfield")
    .classList.contains("topdown");
  $("scene").style.setProperty(
    "--zoom",
    Math.max(
      0.2,
      Math.min(
        (box.clientWidth - 32) / (top ? 490 : 575),
        (box.clientHeight - 30) / (top ? 490 : 485),
      ),
    ),
  );
}
function renderBoard(o, actions) {
  const board = $("board");
  board.replaceChildren();
  for (const r of o.rooms) {
    const [row, col] = r.key.split(",").map(Number),
      v = o.vaults[r.key];
    const b = button(
      "",
      () => {
        selected = r.key;
        render();
      },
      "room" +
        (v ? " vault" : "") +
        (r.key === E.CAR ? " exterior" : "") +
        (selected === r.key ? " selected" : "") +
        (actions.some((a) => a.type === "move" && a.to === r.key)
          ? " reachable"
          : ""),
    );
    b.dataset.room = r.key;
    b.style.left = (col - 3) * 120 + 4 + "px";
    b.style.top = (row - 2) * 120 + 4 + "px";
    b.setAttribute(
      "aria-label",
      r.name + (r.key === o.me.position ? " · Estás aquí" : ""),
    );
    b.append(
      el("span", "floor-pattern"),
      el("span", "room-number", r.key),
      el("span", "room-name", r.name),
    );
    const icons = [];
    if (r.camera) icons.push(r.cameraOffUntil > o.round ? "◉ OFF" : "◉");
    if (r.event)
      icons.push(
        r.event.kind === null ? "?" : r.event.kind === "sensor" ? "⌁" : "◉",
      );
    b.append(el("span", "room-icons", icons.join(" ")));
    if (v) {
      b.append(
        el(
          "span",
          "furniture safe" + (v.open ? " open" : ""),
          v.open ? "◧" : "⊕",
        ),
      );
      if (v.available)
        b.append(el("span", "loot-counter", "◆ " + (v.value ?? "?")));
    } else if (r.key === E.CAR) b.append(el("span", "car-prop"));
    else b.append(el("span", "furniture desk"));
    if (r.key !== E.CAR)
      for (const [side, dr, dc] of [
        ["north", -1, 0],
        ["south", 1, 0],
        ["west", 0, -1],
        ["east", 0, 1],
      ]) {
        const neighbor = row + dr + "," + (col + dc),
          door = o.doors[[r.key, neighbor].sort().join("|")];
        b.append(el("span", "wall " + side + (door ? " has-door" : "")));
        if (door?.closed) b.append(el("span", "door-lock " + side, "▰"));
      }
    let marker = 0;
    for (const g of Object.values(o.guards))
      if (r.key === g.route[0] || r.key === g.route[2]) {
        const p = el("span", "patrol-end", g.id);
        p.style.setProperty("--color", COLORS[g.id]);
        p.style.left = 8 + marker++ * 18 + "px";
        b.append(p);
      }
    board.append(b);
  }
  const pieces = [
    ...game.publicPlayers().map((p) => ({ ...p, kind: "player" })),
    ...Object.values(o.guards).map((p) => ({ ...p, kind: "guard" })),
    ...Object.values(o.swats).map((p) => ({ ...p, kind: "swat" })),
  ].filter(
    (p) => !["dead", "removed", "escaped", "leftbehind"].includes(p.status),
  );
  const ids = new Set(pieces.map((p) => p.id));
  for (const node of $("pieces").children)
    if (!ids.has(node.dataset.id)) node.remove();
  const byRoom = {};
  for (const p of pieces) (byRoom[p.position] ||= []).push(p);
  for (const p of pieces) {
    let n = $("pieces").querySelector('[data-id="' + p.id + '"]');
    if (!n) {
      n = button(
        "",
        () => (p.kind === "player" ? showPlayer(p.id) : showGuard(p.id)),
        "pawn",
      );
      n.dataset.id = p.id;
      n.append(
        el("span", "pawn-base"),
        el("span", "pawn-body"),
        el("span", "pawn-head"),
        el("span", "pawn-label", p.id),
        el("span", "patrol-arrow"),
      );
      $("pieces").append(n);
    }
    n.className =
      "pawn " + p.kind + " " + p.status + (p.id === game.human ? " mine" : "");
    n.style.setProperty("--color", COLORS[p.id] || "#91a5ac");
    const occupants = byRoom[p.position],
      idx = occupants.indexOf(p),
      [row, col] = p.position.split(",").map(Number);
    const count = occupants.length,
      cols = Math.min(count, 3);
    n.style.left =
      (col - 3) * 120 + 60 + ((idx % 3) - (cols - 1) / 2) * 29 + "px";
    n.style.top = (row - 2) * 120 + 45 + Math.floor(idx / 3) * 30 + "px";
    n.title =
      (p.name || p.id) +
      " · " +
      STATUS[p.status] +
      (p.boarded ? " · A bordo" : "");
    n.setAttribute("aria-label", n.title);
    let arrow = "";
    if (p.arrow) {
      const [ar, ac] = p.arrow.split(",").map(Number);
      arrow = ar < row ? "↑" : ar > row ? "↓" : ac < col ? "←" : "→";
    }
    n.querySelector(".patrol-arrow").textContent = arrow;
  }
  fitBoard();
}
function renderCrew(o) {
  $("crew").replaceChildren();
  for (const p of game.publicPlayers()) {
    const b = button(
      "",
      () => showPlayer(p.id),
      "crew-card" +
        (game.actor() === p.id ? " current" : "") +
        (p.id === game.human ? " me" : ""),
    );
    b.dataset.player = p.id;
    const portrait = el("span", "portrait", p.id);
    portrait.style.setProperty("--color", COLORS[p.id]);
    const text = el("span");
    text.append(
      el("strong", "crew-name", p.name + (p.id === game.human ? " · Vos" : "")),
      el("span", "crew-role", POWERS[p.power][0]),
      el(
        "span",
        "crew-status",
        (p.boarded ? "A bordo" : STATUS[p.status]) +
          " · " +
          roomName(p.position),
      ),
    );
    if (p.id !== game.human) {
      const backs = el("span", "mini-backs");
      backs.setAttribute("aria-label", "Objetivo y Equipo ocultos");
      backs.append(el("i", "", "?"));
      for (const full of [...o.players[p.id].hands, ...o.players[p.id].bag])
        if (full) backs.append(el("i", "", "▧"));
      text.append(backs);
    }
    b.append(portrait, text);
    $("crew").append(b);
  }
}
function showPlayer(id) {
  const p = game.publicPlayers().find((p) => p.id === id),
    mine = id === game.human;
  detail(
    p.name + " · " + id,
    `Técnica ${p.stats.tecnica} · Físico ${p.stats.fisico} · Sigilo ${p.stats.sigilo}. Poder: ${POWERS[p.power][0]}. ${POWERS[p.power][1]}`,
  );
  if (mine) {
    $("detailContent").append(
      el("p", "", objectiveText(game.observation().me)),
    );
  } else {
    $("detailContent").append(
      el(
        "div",
        "secret-card",
        "OBJETIVO PERSONAL Y EQUIPO · CARTAS BOCA ABAJO",
      ),
    );
  }
  const acts = game.actions().filter((a) => a.target === id);
  if (acts.length) {
    const box = el("div", "detail-actions");
    box.append(...acts.map(actionButton));
    $("detailContent").append(box);
  }
}
function showGuard(id) {
  const o = game.observation(),
    g = o.guards[id] || o.swats[id];
  if (!g) return;
  detail(
    id,
    `${STATUS[g.status]} · Percepción ${g.percepcion} · Combate ${g.combate}. ` +
      (g.route
        ? "Patrulla: " +
          g.route.map(roomName).join(" → ") +
          ". " +
          (g.arrow
            ? "La flecha apunta a " + roomName(g.arrow) + "."
            : "Flecha retraída: fuera de patrulla.")
        : "Equipo SWAT: persigue las últimas posiciones detectadas."),
    game
      .actions()
      .filter((a) => a.target === id)
      .map(actionButton),
  );
}
function renderHand(o) {
  const p = o.me;
  $("identityCards").replaceChildren();
  const cards = [
    ["person", "Personaje", p.name, "Tu identidad y tus atributos."],
    ["power", "Poder", POWERS[p.power][0], POWERS[p.power][1]],
    [
      "objective",
      "Objetivo secreto",
      OBJECTIVES[p.objective][0],
      objectiveText(p),
    ],
  ];
  for (const [cls, type, name, body] of cards) {
    const c = button(
      "",
      () =>
        cls === "person"
          ? showPlayer(p.id)
          : detail(
              name,
              body,
              cls === "power"
                ? game
                    .actions()
                    .filter((a) => a.type === "power")
                    .map(actionButton)
                : [],
            ),
      "game-card " + cls,
    );
    c.append(
      el("span", "card-type", type),
      el("h3", "", name),
      el("p", "", body),
    );
    if (cls === "person") {
      const stats = el("div", "stat-row");
      for (const [key, label] of [
        ["tecnica", "TEC"],
        ["fisico", "FÍS"],
        ["sigilo", "SIG"],
      ]) {
        const stat = el("span", "", label);
        stat.append(el("b", "", p.stats[key]));
        stats.append(stat);
      }
      c.append(stats);
    }
    if (cls === "power" && p.power === "strength" && p.powerUsed)
      c.append(el("p", "", "PODER YA UTILIZADO"));
    $("identityCards").append(c);
  }
  for (const [key, slots] of [
    ["hands", p.hands],
    ["bag", p.bag],
  ]) {
    $(key).replaceChildren();
    slots.forEach((id, i) => {
      const obj = o.objects[id],
        slot = (key === "hands" ? "h" : "b") + i;
      const b = button(
        "",
        () =>
          obj
            ? showItem(id)
            : detail(
                slotName(slot),
                "Espacio libre. Para reorganizar, tocá un objeto que estés llevando. Para recoger, seleccioná tu sala.",
              ),
        "item-slot" +
          (!obj ? " empty" : "") +
          (obj?.kind === "loot" ? " loot" : ""),
      );
      b.append(
        el(
          "b",
          "",
          obj
            ? obj.name + (obj.value ? " · ◆" + obj.value : "")
            : "＋ Espacio libre",
        ),
        el("small", "", slotName(slot)),
      );
      $(key).append(b);
    });
  }
  $("bagCapacity").textContent =
    p.bag.length +
    " espacios" +
    (p.equipment.length ? " · Mochila grande equipada" : "");
  $("handHint").textContent = p.hands.every(Boolean)
    ? "Dos manos ocupadas: soltá un objeto gratis o reorganizá para manipular."
    : "Sólo vos conocés tu objetivo y tu Equipo.";
}
function showItem(id) {
  const o = game.observation(),
    obj = o.objects[id];
  if (!obj) return;
  const acts = game.actions().filter((a) => a.object === id);
  const buttons = acts.map(actionButton);
  if (
    obj.location === game.human &&
    game.isHumanTurn() &&
    o.me.status === "active" &&
    !o.me.boarded
  )
    buttons.push(
      button(
        "Soltar gratis",
        () => {
          try {
            game.drop(id);
            $("detail").close();
            render();
            persist();
          } catch (e) {
            toast(e.message);
          }
        },
        "quiet",
      ),
    );
  detail(obj.name, ITEMS[obj.kind] || "", buttons);
}
function renderControls(o, actions) {
  const r =
    o.rooms.find((r) => r.key === selected) ||
    o.rooms.find((r) => r.key === o.me.position);
  selected = r.key;
  $("roomTitle").textContent = r.name;
  const v = o.vaults[r.key],
    same = r.key === o.me.position;
  $("roomDetail").textContent = [
    same
      ? "Estás aquí. Tocá otra sala del tablero para moverte."
      : "Seleccioná una sala conectada para moverte.",
    v
      ? (v.open ? "Bóveda abierta." : "Bóveda cerrada.") +
        " Botín: " +
        (v.value ?? "desconocido") +
        "."
      : "",
    r.event
      ? "Evento: " +
        (r.event.kind === null
          ? "oculto"
          : r.event.kind === "sensor"
            ? "sensor de movimiento"
            : "cámara") +
        "."
      : "",
    r.camera
      ? "Cámara " + (r.cameraOffUntil > o.round ? "apagada." : "activa.")
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const contextual = actions.filter(
    (a) =>
      (["move", "openDoor"].includes(a.type) && a.to === selected) ||
      (same &&
        [
          "openVault",
          "board",
          "unboard",
          "deposit",
          "depart",
          "rescue",
        ].includes(a.type)),
  );
  $("roomActions").replaceChildren(...contextual.map(actionButton));
  if (same)
    for (const obj of Object.values(o.objects).filter(
      (x) => x.location === r.key,
    ))
      $("roomActions").append(
        button(
          "Recoger " + obj.name,
          () => showItem(obj.id),
          "action-button secondary",
        ),
      );
  $("basicActions").replaceChildren();
  for (const [type, label] of [
    ["hide", "Ocultarte"],
    ["power", "Usar poder"],
    ["push", "Empujar"],
    ["fight", "Combatir"],
    ["fightPlayer", "Atacar jugador"],
    ["stand", "Levantarte"],
    ["wait", "Pasar turno"],
  ]) {
    const list = actions.filter((a) => a.type === type);
    if (!list.length) continue;
    const b = button(
      label,
      () =>
        list.length === 1
          ? play(list[0])
          : chooseActions(
              label,
              list,
              type === "push"
                ? "Prueba enfrentada de Físico. Elegí rival y sala de destino conectada por una puerta abierta. Se activan los peligros al entrar."
                : "Elegí tu acción. Consume tu turno.",
            ),
      "",
    );
    $("basicActions").append(b);
  }
  const can = ready && game.isHumanTurn() && !running;
  $("turnBanner").classList.toggle("waiting", !can);
  $("turnBanner").textContent = game.state.ended
    ? "Atraco terminado"
    : can
      ? "Tu turno · una acción"
      : !ready
        ? "Preparación"
        : game.actor() === "security"
          ? "La seguridad responde…"
          : game.actor() === game.human
            ? "Preparando tu turno…"
            : playerName(game.actor()) + " está jugando…";
  $("phaseTitle").textContent = game.state.ended
    ? "El golpe terminó."
    : can
      ? "Tu jugada cambia el plan."
      : "La banda está en movimiento.";
  for (const b of document.querySelectorAll(
    "#roomActions button,#basicActions button",
  ))
    b.disabled = !can;
  $("targetHint").hidden = can || game.state.ended;
  $("targetHint").textContent = ["arrested", "escaped", "leftbehind"].includes(
    o.me.status,
  )
    ? "Tu personaje ya no puede actuar. La partida continúa con los demás."
    : "Podés inspeccionar salas y cartas mientras juega la banda.";
}
function readable(text) {
  let result = text;
  for (const r of game.observation().rooms)
    result = result.replaceAll(r.key, r.name);
  return result
    .replaceAll("Evento: camera", "Evento: cámara")
    .replaceAll("Evento: sensor", "Evento: sensor de movimiento");
}
function render() {
  const o = game.observation(),
    actions = ready ? game.actions() : [];
  $("hud").replaceChildren();
  for (const [label, value, danger] of [
    ["Ronda", o.round + " / 28"],
    ["Botín", o.depositedLoot + " / 6"],
    ["Alerta", o.alert + " / 4", o.alert >= 3],
  ]) {
    const h = el("div", "hud-item" + (danger ? " danger" : ""), label);
    h.append(el("b", "", value));
    $("hud").append(h);
  }
  $("clock").textContent = game.state.swatEntered
    ? "SWAT dentro del banco."
    : o.swatRound
      ? "SWAT llega en ronda " + o.swatRound + "."
      : "A alerta 3 se cierran las puertas. A 4 se llama al SWAT.";
  renderBoard(o, actions);
  renderCrew(o);
  renderHand(o);
  renderControls(o, actions);
  const last = game.log.at(-1);
  $("lastEvent").textContent = last ? readable(last.text) : "";
  $("diceTray").replaceChildren();
  for (const roll of last?.rolls || []) {
    const d = el("span", "die-result");
    d.title = roll.label;
    d.append(
      el("b", "", roll.die),
      document.createTextNode(
        " + " +
          roll.bonus +
          " = " +
          roll.total +
          (roll.target != null ? " / " + roll.target : ""),
      ),
    );
    $("diceTray").append(d);
  }
  if (game.state.ended && !shownEnd && ready && !$("welcome").open) {
    shownEnd = true;
    showEnding();
  }
}
function showEnding() {
  const result = game.state.result;
  $("endingTitle").textContent = result.groupSuccess
    ? "El auto se fue."
    : "El golpe se terminó.";
  $("endingContent").replaceChildren(
    el(
      "p",
      "",
      result.groupSuccess
        ? "La banda depositó " + result.depositedLoot + " de botín y escapó."
        : "La seguridad o el límite de 28 rondas cerró el atraco.",
    ),
  );
  for (const p of Object.values(game.state.players))
    $("endingContent").append(
      el(
        "p",
        "",
        `${p.id} · ${p.name}: ${STATUS[p.status]}. ${OBJECTIVES[p.objective][0]} — ${result.personal[p.id] ? "objetivo cumplido" : "objetivo fallido"}.`,
      ),
    );
  if ($("detail").open) $("detail").close();
  $("ending").showModal();
}
function newDialog() {
  generation++;
  running = false;
  $("seed").value = "golpe-" + Math.random().toString(36).slice(2, 7);
  $("resume").hidden = !ready;
  if (!$("welcome").open) $("welcome").showModal();
}
$("startForm").onsubmit = (e) => {
  e.preventDefault();
  generation++;
  running = false;
  game = new Table($("seed").value.trim() || "golpe", $("profile").value);
  ready = true;
  shownEnd = false;
  selected = game.observation().me.position;
  $("welcome").close();
  render();
  persist();
  pump();
};
$("resume").onclick = () => {
  $("welcome").close();
  render();
  pump();
};
$("welcome").addEventListener("cancel", (e) => {
  e.preventDefault();
  if (ready) {
    $("welcome").close();
    render();
    pump();
  }
});
$("newGame").onclick = newDialog;
$("closeDetail").onclick = () => $("detail").close();
$("toggleView").onclick = () => {
  const on = document.querySelector(".playfield").classList.toggle("topdown");
  $("toggleView").textContent = on ? "Vista 3D" : "Vista cenital";
  $("toggleView").setAttribute("aria-pressed", on);
  fitBoard();
};
$("speed").onclick = () => {
  fast = !fast;
  $("speed").textContent = "Ritmo: " + (fast ? "rápido" : "normal");
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = "Sonido: " + (sound ? "sí" : "no");
  $("sound").setAttribute("aria-pressed", sound);
  beep();
};
$("history").onclick = () => {
  detail("Historial del golpe", "Cada turno y cada tirada quedan registrados.");
  for (const e of [...game.log].reverse()) {
    const item = el("div", "history-entry");
    item.append(
      el("strong", "", "Ronda " + e.round + " · " + e.title),
      el("div", "", readable(e.text)),
    );
    for (const r of e.rolls)
      item.append(
        el(
          "div",
          "",
          r.label +
            ": " +
            r.die +
            " + " +
            r.bonus +
            " = " +
            r.total +
            (r.target != null ? " / " + r.target : ""),
        ),
      );
    $("detailContent").append(item);
  }
};
$("help").onclick = () =>
  detail(
    "Una acción. Después, el resto.",
    "Seleccioná una sala conectada y tocá Mover. Abrí bóvedas, recogé botín y llevalo al auto. Necesitan 6 de botín depositado, dos personas a bordo y la acción Arrancar. Tus cartas explican tu poder y objetivo secreto. Tocá cualquier objeto para usarlo, cambiarlo de lugar o soltarlo gratis. Tenés una mano por objeto y dos espacios de mochila; la mochila grande amplía a cuatro. Con ambas manos ocupadas no podés manipular. Combatir reduce; empujar enfrenta Físico y desplaza a una sala vecina abierta, activando sus peligros. Los demás juegan solos, con información limitada y sus propios intereses. Al terminar cada ronda se mueve la seguridad; las flechas de los guardias indican su próximo paso. El límite de este escenario es 28 rondas.",
  );
$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(game.exportReplay(), null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = "superheist-mesa.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("again").onclick = () => {
  $("ending").close();
  newDialog();
};
$("backToTable").onclick = () => $("ending").close();
$("watchReplay").onclick = () => {
  try {
    sessionStorage.setItem(
      "superheist-simulation",
      JSON.stringify(game.exportReplay()),
    );
    location.href = "../game-replay/?simulation=1";
  } catch {
    toast("No se pudo abrir. Descargá la partida para el Replay.");
  }
};
new ResizeObserver(fitBoard).observe($("boardViewport"));
newDialog();
render();
