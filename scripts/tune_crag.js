// How the crag develops under World.PARAMS, for four simulated players, at
// dates through 2026 (Stage 5 tuning). Targets (the user's, 2026-11-25): about
// 70% of the crag climbed by the end of 2025 for a keen player, who takes about
// 30% of first ascents over the season; the community finds every boulder by
// about May 2026, and leaves the far areas alone for the first months.
//   node scripts/tune_crag.js                       current PARAMS
//   node scripts/tune_crag.js '{"target":{"tau":80}}'  try other values
// Players: real (2 days in 3, finds a new area every 5 climbing days, looks over
// one boulder a day, sends up to 4), keen (looks over 2 boulders a day anywhere,
// sends 5), casual (1 day in 3), homebody (never explores: the community alone).
const G_DIR = require("path").join(__dirname, "..", "site", "game") + "/";
const Mech = global.Mech = require(G_DIR + "mechanics.js");
const World = global.World = require(G_DIR + "world.js");
const Know = require(G_DIR + "knowledge.js"), D = require(G_DIR + "game-data.json");
const over = JSON.parse(process.argv[2] || "{}");
(function merge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) merge(a[k], b[k]); else a[k] = b[k]; } })(World.PARAMS, over);
function xpFor(a) { let xp = 0; for (let l = 0; l < Math.floor(a); l++) xp += Mech.levelCost(l); return xp + Mech.levelCost(Math.floor(a)) * (a % 1); }
// Level by climbing day under Phase 3's balance (balance_game.js, steady climbers).
const abilityOnDay = n => { const pts = [[0, 0], [6, 3], [17, 5], [32, 7], [57, 9], [102, 11], [158, 13]]; for (let i = 1; i < pts.length; i++) if (n <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]); } return 13; };
const PROFILES = { real: { every: [1, 1, 0], inspect: 1, sends: 4, areaEvery: 5 },  keen: { every: [1, 1, 0], inspect: 2, sends: 5 }, casual: { every: [1, 0, 0], inspect: 1, sends: 3 }, homebody: { every: [1, 1, 0], inspect: 0, sends: 0 } };
const DATES = ["2025-10-01", "2025-11-01", "2025-12-01", "2025-12-31", "2026-03-01", "2026-05-01", "2026-12-31"];
const walk = b => D.sectors.find(s => s.name === D.boulders[b].sector).walk_min;
for (const [name, pf] of Object.entries(PROFILES)) {
  const g = { v: 2, rules: 2, id: "t", date: "2025-09-06", dayNo: 1, bestGrade: -1, player: { xp: 0, height: 165, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) }, ps: {}, ticks: [], tips: [], todo: [], visited: [], loc: {} };
  g.world = World.create(D, "tune-" + name); g.know = World.initialKnow(D, g.date); World.step(D, g, g.date);
  const K = Know.make(D, () => g);
  const firstTouch = {};
  console.log(`\n${name}: date        climb  you   est    %   by you  share  found  NPCs  hardestNPC`);
  for (let n = 0; g.date < "2026-12-31"; n++) {
    g.date = World.addDays(g.date, 1);
    const climbs = pf.every[n % pf.every.length];
    if (climbs) g.dayNo++;
    g.player.xp = xpFor(abilityOnDay(g.dayNo));
    World.step(D, g, g.date);
    for (const [p, e] of Object.entries(g.world.est)) if (e.by !== "you" && !e.old) { const s = D.boulders[D.problems[p].b].sector; if (!firstTouch[s] || e.date < firstTouch[s]) firstTouch[s] = e.date; }
    if (climbs) {
      if (pf.areaEvery && g.dayNo % pf.areaEvery === 0) { const nx = D.sectors.filter(s => !g.know.areas[s.name]).sort((a, b) => a.walk_min - b.walk_min)[0]; if (nx) g.know.areas[nx.name] = 1; }
      const order = D.boulders.map((b, i) => i).filter(i => (!pf.areaEvery || g.know.areas[D.boulders[i].sector]) && ((g.know.boulders[i] || 0) < 2 || K.spottable(i).length)).sort((a, b) => walk(a) - walk(b) || a - b);
      for (const b of order.slice(0, pf.inspect)) K.inspect(b, g.date);
      const A = Mech.ability(g.player.xp); let sent = 0;
      const cands = D.problems.map((p, i) => i).filter(p => K.visible(p) && !(g.ps[p] && g.ps[p].sent) && D.problems[p].grade <= A + 0.3).sort((a, b) => D.problems[b].grade - D.problems[a].grade);
      for (const p of cands) { if (sent >= pf.sends) break;
        g.ps[p] = { att: 2, sent: true, best: 1, beta: 0, sends: 1, log: [[g.date, 2, 1, 1]] };
        g.ticks.push({ p, date: g.date, day: g.dayNo, style: "Send" }); World.recordSend(D, g, p, g.date, false);
        g.bestGrade = Math.max(g.bestGrade, D.problems[p].grade); sent++; }
    }
    if (!g.allFound && g.world.found.length >= D.boulders.length) g.allFound = g.date;
    if (DATES.includes(g.date)) {
      const e = Object.values(g.world.est), mine = e.filter(x => x.by === "you").length, npc = e.filter(x => x.by !== "you" && !x.old);
      console.log(`        ${g.date}  ${String(g.dayNo).padStart(4)}  V${String(Math.floor(Mech.ability(g.player.xp))).padEnd(3)} ${String(e.length).padStart(4)} ${String(Math.round(e.length / 10)).padStart(4)}%  ${String(mine).padStart(5)}  ${String(Math.round(100 * mine / e.length)).padStart(4)}%  ${String(g.world.found.length).padStart(4)}  ${String(Object.keys(g.world.npc).length).padStart(4)}   V${Math.max(0, ...npc.map(x => x.grade))}`);
    }
  }
  console.log("  community's first FA per area:", D.sectors.slice().sort((a, b) => a.walk_min - b.walk_min).map(s => `${s.name.replace("The ", "")} ${(firstTouch[s.name] || "--never").slice(2)}`).join(", "));
  console.log("  every boulder known to the community:", g.allFound || "not yet");
}
