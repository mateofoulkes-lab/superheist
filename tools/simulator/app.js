"use strict";
const $ = (id) => document.getElementById(id);
let current = null;
function saveReplay() {
  if (!current) return;
  try {
    sessionStorage.setItem("superheist-simulation", JSON.stringify(current));
    location.href = "../game-replay/?simulation=1";
  } catch {
    $("status").textContent =
      "No hay espacio de sesión. Descargá la partida e importala en Replay.";
  }
}
function download() {
  if (!current) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(current)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "superheist-partida.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function show(r) {
  current = r;
  const x = r.result;
  $("result").hidden = false;
  $("title").textContent = x.groupSuccess
    ? "El auto consiguió escapar"
    : "El golpe no alcanzó la meta";
  $("metrics").innerHTML = [
    ["Rondas", x.rounds],
    ["Botín depositado", x.depositedLoot + " / 6"],
    ["Alerta final", x.alert],
    ["Empujones", x.pushes],
  ]
    .map(
      ([name, value]) =>
        `<div class="metric"><strong>${value}</strong><span>${name}</span></div>`,
    )
    .join("");
  $("personal").textContent =
    "Objetivos personales: " +
    Object.entries(x.personal)
      .map(([id, win]) => id + (win ? " cumplido" : " no cumplido"))
      .join(" · ") +
    ". Combates: " +
    x.combats +
    ". Arrestos: " +
    x.arrests +
    ". Rescates: " +
    x.rescues +
    ". SWAT: " +
    (x.swat ? "sí" : "no") +
    ".";
}
$("run").onclick = () => {
  try {
    show(
      Superheist.simulate(
        $("seed").value || "primer-atraco",
        $("profile").value,
      ),
    );
    $("status").textContent =
      "Partida completa. Abrí Replay para inspeccionar acciones, tiradas y secretos.";
  } catch (e) {
    $("status").textContent = "La simulación se detuvo: " + e.message;
  }
};
$("replay").onclick = saveReplay;
$("download").onclick = download;
$("batch").onclick = async () => {
  const btn = $("batch");
  btn.disabled = true;
  $("run").disabled = true;
  const results = [],
    prefix = $("seed").value || "lote";
  try {
    for (let i = 0; i < 50; i++) {
      for (const profile of ["cooperative", "conflict"]) {
        const seed = prefix + "-" + i;
        const result = Superheist.simulate(seed, profile, false).result;
        results.push({ seed, profile, ...result });
      }
      $("status").textContent = `Completadas ${results.length} / 100 partidas…`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const groups = ["cooperative", "conflict"].map((profile) => {
      const a = results.filter((r) => r.profile === profile),
        avg = (k) =>
          (a.reduce((n, r) => n + Number(r[k]), 0) / a.length).toFixed(1);
      return `<tr><td>${profile === "cooperative" ? "Cooperación" : "Conflicto"}</td><td>${a.filter((r) => r.groupSuccess).length}/50</td><td>${avg("rounds")}</td><td>${avg("pushes")}</td><td>${avg("arrests")}</td></tr>`;
    });
    $("batchMetrics").innerHTML =
      "<table><thead><tr><th>Perfil</th><th>Éxitos</th><th>Rondas medias</th><th>Empujones medios</th><th>Arrestos medios</th></tr></thead><tbody>" +
      groups.join("") +
      "</tbody></table>";
    $("cases").textContent = results
      .map(
        (r) =>
          `${r.seed} | ${r.profile} | ${r.groupSuccess ? "escape" : "derrota"} | ${r.rounds} rondas | empujones ${r.pushes}`,
      )
      .join("\n");
    $("batchResult").hidden = false;
    $("status").textContent =
      "Lote completo. Resultados de este escenario y estas políticas.";
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  } finally {
    btn.disabled = false;
    $("run").disabled = false;
  }
};
