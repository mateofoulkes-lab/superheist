const fs = require("node:fs");
const path = require("node:path");
const E = require("../tools/simulator/engine.js");
const args = process.argv.slice(2);
const seed = args[0] || "primer-atraco",
  profile = args[1] || "cooperative";
const out = args[2];
if (profile === "batch") {
  const runs = Number(args[2] || 100);
  if (!Number.isInteger(runs) || runs < 1 || runs > 10000)
    throw Error("Lote entre 1 y 10000");
  const rows = [];
  for (let i = 0; i < runs; i++)
    for (const p of ["cooperative", "conflict"])
      rows.push({
        seed: seed + "-" + i,
        profile: p,
        ...E.simulate(seed + "-" + i, p, false).result,
      });
  for (const p of ["cooperative", "conflict"]) {
    const a = rows.filter((x) => x.profile === p);
    console.log(
      JSON.stringify({
        profile: p,
        runs: a.length,
        wins: a.filter((x) => x.groupSuccess).length,
        meanRounds: a.reduce((n, x) => n + x.rounds, 0) / a.length,
        pushes: a.reduce((n, x) => n + x.pushes, 0),
        arrests: a.reduce((n, x) => n + x.arrests, 0),
        rescues: a.reduce((n, x) => n + x.rescues, 0),
      }),
    );
  }
  if (args[3])
    fs.writeFileSync(path.resolve(args[3]), JSON.stringify(rows, null, 2));
} else {
  const r = E.simulate(seed, profile);
  console.log(JSON.stringify(r.result, null, 2));
  if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(r));
}
