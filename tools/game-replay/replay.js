"use strict";
let manifest = [],
  example = null,
  stepIndex = 0,
  currentState = null;
let minRow = 0,
  minCol = 0,
  gridRows = 9,
  gridCols = 9;
const cells = new Map(),
  $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const parseKey = (k) => k.split(",").map(Number);
const cellFor = (k) => cells.get(k);
const names = {
  active: "activo",
  reduced: "reducido",
  arrested: "arrestado",
  escaped: "escapó",
  leftbehind: "quedó atrás",
};
const powers = {
  phase: "Fase",
  peek: "Precognición",
  pulse: "Pulso",
  strength: "Superfuerza",
};
const objectives = {
  professional: "Profesional",
  ghost: "Fantasma",
  greed: "Codicia",
  enemy: "Enemigo mortal",
};
function arrowFor(from, to) {
  const [r, c] = parseKey(from),
    [rr, cc] = parseKey(to);
  return rr < r ? "↑" : rr > r ? "↓" : cc < c ? "←" : "→";
}
function centerFor(k) {
  const [r, c] = parseKey(k);
  return { x: (c - minCol) * 100 + 50, y: (r - minRow) * 100 + 50 };
}
function fitBoard() {
  if (!example) return;
  const bay = $("boardBay"),
    wrap = document.querySelector(".board-wrap");
  const side = Math.min(
    bay.clientWidth / gridCols,
    bay.clientHeight / gridRows,
  );
  wrap.style.width = Math.max(0, Math.floor(side * gridCols)) + "px";
  wrap.style.height = Math.max(0, Math.floor(side * gridRows)) + "px";
}
function buildGrid() {
  const coords = [
    ...example.snapshot.rooms.map((r) => r.key),
    example.snapshot.board.carKey,
  ].map(parseKey);
  minRow = Math.min(...coords.map((x) => x[0]));
  minCol = Math.min(...coords.map((x) => x[1]));
  gridRows = Math.max(...coords.map((x) => x[0])) - minRow + 1;
  gridCols = Math.max(...coords.map((x) => x[1])) - minCol + 1;
  const board = $("board");
  board.innerHTML = "";
  cells.clear();
  board.style.gridTemplateColumns = `repeat(${gridCols},1fr)`;
  board.style.gridTemplateRows = `repeat(${gridRows},1fr)`;
  for (let r = minRow; r < minRow + gridRows; r++)
    for (let c = minCol; c < minCol + gridCols; c++) {
      const el = document.createElement("div");
      el.className = "cell empty";
      board.append(el);
      cells.set(r + "," + c, el);
    }
  $("moveOverlay").setAttribute(
    "viewBox",
    `0 0 ${gridCols * 100} ${gridRows * 100}`,
  );
  fitBoard();
}
function wall(side, door) {
  return (
    door
      ? [
          [0, 38],
          [62, 100],
        ]
      : [[0, 100]]
  )
    .map(([a, b]) => {
      if (side === "N" || side === "S") {
        const y = side === "N" ? 1 : 99;
        return `<line x1="${a}" y1="${y}" x2="${b}" y2="${y}"/>`;
      }
      const x = side === "W" ? 1 : 99;
      return `<line x1="${x}" y1="${a}" x2="${x}" y2="${b}"/>`;
    })
    .join("");
}
function roomSvg(room) {
  const icons = (room.icons || [])
    .map((i) => {
      let [kind, x, y] = i;
      for (let n = 0; n < ((room.rot || 0) / 90) % 4; n++)
        [x, y] = [100 - y, x];
      return ["camera", "vent"].includes(kind)
        ? `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" fill="#dbe6ff">${kind === "camera" ? "◉" : "▦"}</text>`
        : "";
    })
    .join("");
  return `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${room.color || "#485777"}"/><g stroke="#d8e1ef" stroke-width="4">${["N", "E", "S", "W"].map((s) => wall(s, (room.exits || []).includes(s))).join("")}</g><text x="50" y="55" text-anchor="middle" font-size="${room.name.length > 12 ? 7 : 9}" font-weight="800" fill="white">${esc(room.name)}</text>${icons}</svg>`;
}
function token(id, kind, color, label, status) {
  const el = document.createElement("div");
  el.className = "token " + kind;
  el.style.background = color || "#ddd";
  el.textContent = id;
  el.title = label + (status ? " · " + (names[status] || status) : "");
  if (status === "reduced") el.classList.add("reduced");
  if (status === "arrested") el.classList.add("arrested");
  return el;
}
function legacyState(to) {
  const s = clone(example.snapshot.initialState || {});
  s.alert ??= 0;
  s.sherlock ??= example.snapshot.sherlock?.remaining ?? 0;
  s.depositedLoot ??= 0;
  s.players ??= {};
  s.guards ??= {};
  s.swats ??= {};
  s.revealedEvents ??= [];
  s.revealedLoot ??= [];
  for (let i = 0; i <= to; i++)
    for (const a of example.story.steps[i].actions || []) {
      const p = s.players[a.id],
        g = s.guards["G" + a.id],
        w = s.swats["S" + a.id];
      if (a.op === "move" && p) p.position = a.to;
      if (a.op === "moveGuard" && g) g.position = a.to;
      if (a.op === "moveSwat" && w) {
        w.position = a.to;
        w.status = "active";
      }
      if (a.op === "removeGuard" && g) g.status = "removed";
      if (a.op === "alert") s.alert = a.value;
      if (a.op === "sherlock")
        s.sherlock = Math.max(0, s.sherlock + (a.delta || 0));
      if (a.op === "revealEvent" && !s.revealedEvents.includes(a.id))
        s.revealedEvents.push(a.id);
      if (a.op === "revealLoot" && !s.revealedLoot.includes(a.id))
        s.revealedLoot.push(a.id);
      if (a.op === "carry" && p) p.carryingLoot = a.amount;
      if (a.op === "deposit" && p) {
        const amount = a.amount ?? p.carryingLoot ?? 0;
        s.depositedLoot += amount;
        p.carryingLoot = Math.max(0, (p.carryingLoot || 0) - amount);
      }
      if (a.op === "board" && p) {
        p.position = example.snapshot.board.carKey;
        p.boarded = true;
      }
      if (a.op === "status" && p) {
        p.status = a.status;
        if (a.position) p.position = a.position;
      }
    }
  return s;
}
function currentStep() {
  return example.story.steps[stepIndex];
}
function addMarker(cell, cls, text) {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = text;
  cell.append(el);
  return el;
}
function renderBoard() {
  const s = currentState,
    step = currentStep(),
    focus = new Set(
      (step.focus || [])
        .filter((x) => x.startsWith("room:"))
        .map((x) => x.slice(5)),
    );
  for (const a of step.actions || []) if (a.to) focus.add(a.to);
  for (const cell of cells.values()) {
    cell.innerHTML = "";
    cell.className = "cell empty";
  }
  for (const r of example.snapshot.rooms) {
    const cell = cellFor(r.key);
    cell.className = "cell";
    cell.innerHTML = roomSvg(r);
    if (focus.has(r.key)) cell.classList.add("focus");
    if ((s.attention || []).includes(r.key)) cell.classList.add("attention");
    const events = (example.snapshot.events || []).filter(
      (e) => e.roomKey === r.key,
    );
    if (events.length)
      addMarker(
        cell,
        "marker event",
        events.every((e) => (s.revealedEvents || []).includes(e.id))
          ? "✓"
          : "?",
      );
    for (const loot of (example.snapshot.loot || []).filter(
      (l) => l.roomKey === r.key,
    )) {
      if (s.objects && s.objects[loot.id]?.location !== r.key) continue;
      addMarker(
        cell,
        "marker loot",
        (s.revealedLoot || []).includes(loot.id) ? "◆ " + loot.value : "◆ ?",
      );
    }
  }
  const car = cellFor(example.snapshot.board.carKey);
  car.className = "cell car";
  car.innerHTML = '<div><div class="emoji">🚗</div>AUTO</div>';
  for (const cell of cells.values()) {
    const layer = document.createElement("div");
    layer.className = "token-layer";
    cell.append(layer);
  }
  $("outsideTokens").innerHTML = "";
  $("offTokens").innerHTML = "";
  for (const p of example.snapshot.players || []) {
    const st = s.players[p.id] || {},
      el = token(p.id, "player", p.color, p.character?.name || p.id, st.status);
    if ((step.focus || []).includes("player:" + p.id))
      el.classList.add("focus");
    if (["escaped", "dead", "leftbehind"].includes(st.status))
      $("offTokens").append(el);
    else if (st.position === "outside") $("outsideTokens").append(el);
    else cellFor(st.position)?.querySelector(".token-layer").append(el);
  }
  for (const g of example.snapshot.patrols || []) {
    const id = "G" + g.id,
      st = s.guards[id] || {};
    if (["removed", "dead"].includes(st.status)) continue;
    const cell = cellFor(st.position);
    if (!cell) continue;
    const mini = token(
      id,
      "guard",
      g.color,
      g.guardCard?.name || id,
      st.status,
    );
    cell.querySelector(".token-layer").append(mini);
    const direction = addMarker(
      mini,
      "direction",
      st.status === "reduced"
        ? "↘"
        : st.arrow
          ? arrowFor(st.position, st.arrow)
          : "•",
    );
    direction.title = st.arrow ? "Próxima sala " + st.arrow : "Flecha retraída";
    const route = st.route || [g.post, ...g.nodes];
    [route[0], route.at(-1)].forEach((k, i) => {
      const end = cellFor(k);
      if (end) {
        const pin = addMarker(end, "endpoint", id + (i ? " B" : " A"));
        pin.style.background = g.color;
      }
    });
  }
  for (const w of example.snapshot.swats || []) {
    const st = s.swats[w.id] || {};
    if (["active", "reduced"].includes(st.status))
      cellFor(st.position)
        ?.querySelector(".token-layer")
        .append(token(w.id, "swat", w.color, w.card?.name || w.id, st.status));
  }
  for (const d of Object.values(s.doors || {}))
    if (d.closed)
      for (const [from, to] of [
        [d.a, d.b],
        [d.b, d.a],
      ]) {
        const el = cellFor(from);
        if (el) {
          const door = addMarker(
            el,
            "door " +
              { "↑": "north", "↓": "south", "←": "west", "→": "east" }[
                arrowFor(from, to)
              ],
            "",
          );
          door.title = "Puerta cerrada";
        }
      }
  $("moveLines").innerHTML = "";
  for (const a of step.actions || []) {
    if (!cells.has(a.from) || !cells.has(a.to)) continue;
    const A = centerFor(a.from),
      B = centerFor(a.to);
    $("moveLines").insertAdjacentHTML(
      "beforeend",
      `<line class="move-line" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" marker-end="url(#arrow)"/>`,
    );
  }
}
function renderPanels() {
  const s = currentState;
  $("statePanel").innerHTML =
    `<span>Ronda <b>${esc(s.round || "—")}</b></span><span>Alerta <b>${esc(s.alert)}/4</b></span><span>Botín <b>${esc(s.depositedLoot)}/${example.snapshot.objective?.lootTarget || 6}</b></span><span>SHERLOCK <b>${esc(s.sherlock)}</b></span>`;
  $("playersPanel").innerHTML = (example.snapshot.players || [])
    .map((p) => {
      const st = s.players[p.id] || {},
        items = s.objects || {},
        item = (id) => (id ? esc(items[id]?.name || id) : "—"),
        hands = st.hands ? st.hands.map(item).join(" / ") : "—",
        bag = st.bag ? st.bag.map(item).join(" / ") : "—";
      return `<div class="player-row"><b style="color:${p.color}">${esc(p.id)}</b><div><b>${esc(p.character?.name || "")}</b><span>${esc(names[st.status] || st.status || "")}${st.boarded ? " · a bordo" : ""} · ◆${esc(st.carryingLoot || 0)}</span><small>${esc(powers[st.power] || p.power?.name || "")}<br>Manos: ${hands}<br>Mochila: ${bag}${st.equipment?.length ? " · ampliada" : ""}</small></div><span class="objective">${esc(objectives[st.objective] || st.objective || "")}</span></div>`;
    })
    .join("");
  const result = s.result;
  $("outcome").textContent = result
    ? (result.groupSuccess ? "GOLPE CONSEGUIDO" : "GOLPE FALLIDO") +
      " · Objetivos: " +
      Object.entries(result.personal)
        .map(([id, ok]) => id + (ok ? " ✓" : " ×"))
        .join(" ")
    : "";
}
function renderStory() {
  const st = currentStep();
  $("phase").textContent = st.phase || "";
  $("stepTitle").textContent = st.title || "Inicio";
  let narrative = st.narration || "";
  if (st.phase === "Resultado" && currentState.result) {
    const r = currentState.result;
    narrative = `${r.rounds} rondas · ${r.depositedLoot} de botín depositado\n${r.combats} combates · ${r.pushes} empujones · ${r.arrests} arrestos · ${r.rescues} rescates\nSWAT: ${r.swat ? "entró" : "no entró"}.\nFin: ${{ depart: "partida del auto", timeout: "límite de rondas", noActors: "no quedan personajes recuperables" }[r.reason] || r.reason}.`;
  }
  $("narration").textContent = narrative;
  const fc = st.focusCard;
  $("focusCard").hidden = !fc;
  if (fc) $("focusCard").textContent = fc.title + " — " + (fc.text || "");
  $("dialogue").innerHTML = (st.dialogue || [])
    .map(
      (d) =>
        `<div class="line"><span class="speaker">${esc(d.speaker)}:</span> ${esc(d.text)}</div>`,
    )
    .join("");
  $("moves").innerHTML = (st.actions || [])
    .filter((a) => a.from && a.to)
    .map(
      (a) =>
        `<span class="move-chip">${esc(a.id || "")} · ${esc(a.from)} → ${esc(a.to)}</span>`,
    )
    .join("");
}
function render() {
  if (!example) return;
  currentState = currentStep().state
    ? clone(currentStep().state)
    : legacyState(stepIndex);
  renderBoard();
  renderPanels();
  renderStory();
  const total = example.story.steps.length;
  $("stepCounter").textContent = `Paso ${stepIndex + 1} / ${total}`;
  $("stepSlider").max = total - 1;
  $("stepSlider").value = stepIndex;
  $("prevBtn").disabled = stepIndex === 0;
  $("nextBtn").disabled = stepIndex === total - 1;
}
function go(delta) {
  if (!example) return;
  stepIndex = Math.max(
    0,
    Math.min(example.story.steps.length - 1, stepIndex + delta),
  );
  render();
}
function restart() {
  stepIndex = 0;
  render();
}
function jumpRound(direction) {
  if (!example) return;
  const phase = currentStep().phase;
  let next = stepIndex;
  do {
    next += direction;
  } while (
    next > 0 &&
    next < example.story.steps.length - 1 &&
    example.story.steps[next].phase === phase
  );
  stepIndex = Math.max(0, Math.min(example.story.steps.length - 1, next));
  render();
}
function validateReplay(data) {
  if (
    !data?.snapshot?.board ||
    !Array.isArray(data.snapshot.rooms) ||
    !Array.isArray(data.story?.steps) ||
    !data.story.steps.length ||
    data.story.steps.length > 5000
  )
    throw Error("Formato de Replay inválido");
  const coordinate = (k) => typeof k === "string" && /^[0-8],[0-8]$/.test(k);
  if (
    !coordinate(data.snapshot.board.carKey) ||
    data.snapshot.rooms.some(
      (r) => !coordinate(r.key) || typeof r.name !== "string",
    )
  )
    throw Error("Coordenadas inválidas");
  if (
    new Set(data.snapshot.rooms.map((r) => r.key)).size !==
    data.snapshot.rooms.length
  )
    throw Error("Salas duplicadas");
  for (const r of data.snapshot.rooms) {
    if (r.color && !/^#[0-9a-f]{3,8}$/i.test(r.color))
      throw Error("Color inválido");
    if (
      (r.icons || []).some(
        (i) => !Number.isFinite(i[1]) || !Number.isFinite(i[2]),
      )
    )
      throw Error("Icono inválido");
  }
  for (const p of [
    ...(data.snapshot.players || []),
    ...(data.snapshot.patrols || []),
    ...(data.snapshot.swats || []),
  ]) {
    if (!/^[a-z0-9_-]+$/i.test(String(p.id)))
      throw Error("Identificador inválido");
    if (p.color && !/^#[0-9a-f]{3,8}$/i.test(p.color))
      throw Error("Color inválido");
  }
  if (
    data.engine &&
    (!/^s1\./.test(data.engine) ||
      data.story.steps.some(
        (st) => !st.state?.players || !st.state.guards || !st.state.swats,
      ))
  )
    throw Error("Estados del simulador incompletos");
}
function acceptExample(data) {
  validateReplay(data);
  example = data;
  stepIndex = 0;
  $("replayUI").hidden = false;
  $("empty").hidden = true;
  $("notice").textContent = "";
  buildGrid();
  render();
  requestAnimationFrame(fitBoard);
}
async function loadExample(file) {
  const r = await fetch(file);
  if (!r.ok) throw Error("No se pudo cargar " + file);
  acceptExample(await r.json());
}
$("stepSlider").oninput = (e) => {
  stepIndex = Number(e.target.value);
  render();
};
$("importFile").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20000000) throw Error("Archivo demasiado grande");
    acceptExample(JSON.parse(await file.text()));
    $("exampleSelect").innerHTML = "<option>Partida importada</option>";
  } catch (err) {
    $("notice").textContent = err.message;
  }
};
$("download").onclick = () => {
  if (!example) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(example)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "superheist-replay.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function init() {
  try {
    if (new URLSearchParams(location.search).has("simulation")) {
      const stored = sessionStorage.getItem("superheist-simulation");
      if (stored) {
        acceptExample(JSON.parse(stored));
        $("exampleSelect").innerHTML = "<option>Última simulación</option>";
        return;
      }
    }
    const r = await fetch("examples.json");
    manifest = r.ok ? await r.json() : [];
    if (!manifest.length) throw Error("No hay ejemplos disponibles.");
    $("exampleSelect").innerHTML = manifest
      .map((x, i) => `<option value="${i}">${esc(x.title)}</option>`)
      .join("");
    $("exampleSelect").onchange = () =>
      loadExample(manifest[Number($("exampleSelect").value)].file).catch(
        (e) => ($("notice").textContent = e.message),
      );
    await loadExample(manifest[0].file);
  } catch (e) {
    $("replayUI").hidden = true;
    $("empty").hidden = false;
    $("empty").textContent = e.message;
  }
}
window.addEventListener("resize", fitBoard);
new ResizeObserver(fitBoard).observe($("boardBay"));
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    go(1);
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    go(-1);
  }
});
init();
