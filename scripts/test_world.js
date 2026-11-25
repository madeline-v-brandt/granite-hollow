// Tests for the Phase 2 foundations: the world's history (world.js), the
// knowledge layer (knowledge.js) and the discovery rule (mechanics.js).
//   node scripts/test_world.js            run the tests
//   node scripts/test_world.js --curve    also print how the crag develops
const assert = require("assert");
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
const Mech = require(path.join(G_DIR, "mechanics.js"));
global.Mech = Mech;
const World = require(path.join(G_DIR, "world.js"));
global.World = World;
const Know = require(path.join(G_DIR, "knowledge.js"));
const D = require(path.join(G_DIR, "game-data.json"));
const Travel = require(path.join(G_DIR, "travel.js"));

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("  ok  " + name); } catch (e) { console.log("  FAIL " + name + "\n       " + (e.stack || e).split("\n").slice(0, 3).join("\n       ")); process.exitCode = 1; } };
const clone = x => JSON.parse(JSON.stringify(x));
const START = "2025-09-06";

// XP for a given ability (level + fraction), inverting Mech.levelInfo.
function xpFor(a) { let xp = 0, need = 100; for (let l = 0; l < Math.floor(a); l++) { xp += need; need *= 1.6; } return xp + need * (a % 1); }
// The game's pacing: about V3 by climbing day 5, V5 by 12, V7 by 22, V9 by 39.
const abilityOnDay = n => { const pts = [[0, 0], [5, 3], [12, 5], [22, 7], [39, 9], [80, 11]]; for (let i = 1; i < pts.length; i++) if (n <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]); } return 11; };

function newSave(seed = "testseed1") {
  const g = { v: 2, rules: 2, id: "t1", date: START, dayNo: 1, player: { xp: 0, height: 165, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) },
    ps: {}, ticks: [], tips: [], todo: [], visited: [], loc: { sector: null, boulder: null } };
  g.world = World.create(D, seed); g.know = World.initialKnow(D, START);
  World.step(D, g, START);
  return g;
}
// A simple player: climbs two days in three, inspects a boulder near what they
// know each climbing day, and sends up to three lines at their level.
function playDays(g, K, days) {
  for (let n = 0; n < days; n++) {
    g.date = World.addDays(g.date, 1);
    const climbs = n % 3 !== 2;
    if (climbs) g.dayNo++;
    g.player.xp = xpFor(abilityOnDay(g.dayNo));
    World.step(D, g, g.date);
    if (!climbs) continue;
    const walk = b => (D.sectors.find(s => s.name === D.boulders[b].sector) || {}).walk_min;
    const next = D.boulders.map((b, i) => i).filter(i => !g.know.boulders[i] || g.know.boulders[i] < 2).sort((a, b) => walk(a) - walk(b) || a - b)[0];
    if (next != null) K.inspect(next, g.date);
    const A = Mech.ability(g.player.xp);
    let sent = 0;
    for (const p of Object.keys(g.know.lines).map(Number)) {
      if (sent >= 3) break;
      if (g.ps[p] && g.ps[p].sent) continue;
      if (D.problems[p].grade > A + 0.3) { g.ps[p] = g.ps[p] || { att: 0, sent: false, best: 0, beta: 0, sends: 0, log: [] }; continue; }
      g.ps[p] = { att: 2, sent: true, best: 1, beta: 0, sends: 1, log: [[g.date, 2, 1, 1]] };
      g.ticks.push({ p, date: g.date, day: g.dayNo, style: "Send", att: 2, stars: null });
      World.recordSend(D, g, p, g.date, false);
      sent++;
    }
  }
}

console.log("discovery rule");
test("a new V0 climber spots easy lines and nothing hard", () => {
  const pl = { xp: 0, height: 165, ape: 2, energy: 30, skin: 20, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) };
  const seen = D.problems.filter(p => Mech.canSpot(pl, p));
  assert(seen.length > 100, "spots plenty");
  assert(seen.every(p => p.grade <= 3), "nothing above V3");
  assert.strictEqual(Mech.canSpot(pl, D.problems[0]), Mech.canSpot({ ...pl, energy: 100, skin: 100 }, D.problems[0]), "tiredness doesn't matter");
});
test("a stronger climber spots harder lines", () => {
  const weak = { xp: 0, height: 170, ape: 0, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) };
  const strong = { ...weak, xp: xpFor(7) };
  const n = pl => D.problems.filter(p => Mech.canSpot(pl, p)).length;
  assert(n(strong) > n(weak) + 200);
});

console.log("world");
test("the notebook page resolves to four problems on The Billboard and Gus's Rock", () => {
  const nb = World.notebook(D);
  assert.strictEqual(nb.length, 4);
  assert.deepStrictEqual([...new Set(nb.map(n => D.boulders[D.problems[n.p].b].name))].sort(), ["Gus's Rock", "The Billboard"]);
  assert(nb.every(n => D.problems[n.p].grade <= 2));
});
test("every legend resolves to a problem", () => {
  const w = World.create(D, "x");
  assert.strictEqual(World.LEGENDS.filter(l => D.boulders.some(b => b.name === l.boulder && b.problems.some(i => D.problems[i].name === l.name))).length, World.LEGENDS.length);
  assert(w);
});
test("a new climber knows the kiosk's three areas and the notebook page, nothing else", () => {
  const g = newSave(), K = Know.make(D, () => g);
  assert.deepStrictEqual(Object.keys(g.know.areas).sort(), ["Hawkwatch", "The Schoolhouse", "The Tailgate"]);
  const gb = K.guidebook(), nb = World.notebook(D).map(n => n.p), known = new Set(nb.map(p => D.problems[p].b));
  assert(nb.every(p => gb.includes(p)), "CragLog lists the notebook's four problems");
  assert(gb.every(p => nb.includes(p) || (known.has(D.problems[p].b) && g.world.est[p].date <= START)), "plus anything the community put up on those two boulders before you arrive");
  assert(gb.length <= 8, "a few, not many");
  assert(D.problems.every((p, i) => gb.includes(i) || K.name(i) === null), "every other problem is nameless");
  assert(D.problems.every((p, i) => gb.includes(i) || K.grade(i) === null), "and gradeless");
  assert.strictEqual(K.boulderName(D.boulders.findIndex(b => b.name === "The Cooler")), null);
});
test("the same seed and the same play give the same history", () => {
  const a = newSave("same"), b = newSave("same");
  playDays(a, Know.make(D, () => a), 90); playDays(b, Know.make(D, () => b), 90);
  assert.strictEqual(JSON.stringify(a.world), JSON.stringify(b.world));
  const c = newSave("other"); playDays(c, Know.make(D, () => c), 90);
  assert.notStrictEqual(JSON.stringify(a.world.est), JSON.stringify(c.world.est));
});
test("saving and reloading partway changes nothing", () => {
  const a = newSave("reload"); playDays(a, Know.make(D, () => a), 120);
  let b = newSave("reload"); playDays(b, Know.make(D, () => b), 60);
  b = clone(b); playDays(b, Know.make(D, () => b), 60);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
test("stepping a day twice does nothing the second time", () => {
  const g = newSave(); playDays(g, Know.make(D, () => g), 30);
  const before = JSON.stringify(g.world);
  World.step(D, g, g.date); World.step(D, g, World.addDays(g.date, -5));
  assert.strictEqual(JSON.stringify(g.world), before);
});
test("your lines are never taken (with the rare story switched off)", () => {
  World.PARAMS.snipe.on = false;
  try {
    const g = newSave("protect"), K = Know.make(D, () => g); playDays(g, K, 200);
    for (const [p, l] of Object.entries(g.know.lines)) { const e = g.world.est[p]; if (e && e.by !== "you" && !e.old) assert(e.date <= l.date, `#${p} taken on ${e.date} after it was found on ${l.date}`); }
  } finally { World.PARAMS.snipe.on = true; }
});
test("the invariants hold after 300 days", () => {
  const g = newSave("inv"), K = Know.make(D, () => g); playDays(g, K, 300);
  const bad = World.check(D, g); assert.deepStrictEqual(bad.slice(0, 5), [], bad.length + " problems");
  assert.strictEqual(World.validate(D, g), null);
});
test("the first ascent is yours only when nobody had climbed it", () => {
  const g = newSave(), K = Know.make(D, () => g);
  const nb = World.notebook(D)[0].p;
  assert.strictEqual(World.recordSend(D, g, nb, g.date, false).fa, false, "the notebook's problems are already documented");
  const fresh = D.boulders.find(b => b.name === "The Cooler").problems[0];
  K.inspect(D.problems[fresh].b, g.date);
  assert.strictEqual(World.recordSend(D, g, fresh, g.date, true).fa, true);
  assert.strictEqual(g.world.est[fresh].by, "you");
  assert.strictEqual(World.recordSend(D, g, fresh, World.addDays(g.date, 3), false).fa, false, "a second send isn't another FA");
  assert.strictEqual(g.world.est[fresh].date, g.date, "the record doesn't change");
  assert.strictEqual(K.line(fresh), "est");
});
test("300 days of simulation takes under a second", () => {
  const g = newSave("perf"); const t = Date.now(); playDays(g, Know.make(D, () => g), 300);
  assert(Date.now() - t < 1000, `${Date.now() - t} ms`);
});

console.log("knowledge");
test("under the old rules, everything is known and named as before", () => {
  const g = { v: 1, ps: {}, player: {} }, K = Know.make(D, () => g);
  assert(D.problems.every((p, i) => K.name(i) === p.name && K.grade(i) === p.grade && K.line(i) === "est"));
  assert.strictEqual(K.guidebook().length, D.problems.length);
  assert.strictEqual(K.mapView(), null);
  assert.strictEqual(K.inspect(0, START).lines.length, 0, "and learning is a no-op");
});
test("inspecting a boulder finds it and the lines you can see, not the hard ones", () => {
  const g = newSave(), K = Know.make(D, () => g);
  const b = D.boulders.findIndex(x => x.name === "The Cooler");
  const r = K.inspect(b, g.date);
  assert(r.found && r.lines.length > 0);
  assert(r.lines.every(p => D.problems[p].grade <= 3));
  assert(D.boulders[b].problems.some(p => K.line(p) === "hidden"), "the hard lines stay hidden");
  assert(r.lines.every(p => /^Unclimbed /.test(K.name(p)) && K.grade(p) === null));
  assert.strictEqual(K.inspect(b, g.date).lines.length, 0, "looking again finds nothing new");
});
test("being told about a line makes its boulder and area known", () => {
  const g = newSave(), K = Know.make(D, () => g);
  const p = D.boulders.find(b => b.sector === "Back Forty").problems[0];
  assert.strictEqual(K.area("Back Forty"), 0);
  K.tell(p, "c3", g.date);
  assert.strictEqual(K.line(p), "open"); assert.strictEqual(K.boulder(D.problems[p].b), 1); assert.strictEqual(K.area("Back Forty"), 1);
  assert.deepStrictEqual(World.check(D, g), []);
});
test("an NPC's first ascent on a boulder you know shows up; elsewhere it doesn't", () => {
  const g = newSave(), K = Know.make(D, () => g);
  const known = D.boulders.findIndex(b => b.name === "The Cooler"), far = D.boulders.findIndex(b => b.sector === "Back Forty");
  K.inspect(known, g.date);
  const hidden = D.boulders[known].problems.find(p => K.line(p) === "hidden"), farP = D.boulders[far].problems[0];
  World.devEstablish(D, g, hidden, "c5"); World.devEstablish(D, g, farP, "c5");
  assert.strictEqual(K.line(hidden), "est"); assert(K.name(hidden) === D.problems[hidden].name);
  assert.strictEqual(K.line(farP), "hidden"); assert.strictEqual(K.name(farP), null);
});
test("open lines on one boulder have distinct names", () => {
  const g = newSave(), K = Know.make(D, () => g);
  for (let b = 0; b < D.boulders.length; b++) { const names = D.boulders[b].problems.map(p => { g.know.lines[p] = { how: "dev", date: START }; return K.name(p); }); assert.strictEqual(new Set(names).size, names.length, D.boulders[b].name); }
});
test("the map only labels what you know", () => {
  const g = newSave(), K = Know.make(D, () => g), v = K.mapView();
  assert.strictEqual(v.sectors["The Tailgate"].show, true); assert.strictEqual(v.sectors["Back Forty"].show, false);
  assert.strictEqual(Object.values(v.boulders).filter(Boolean).length, 2, "only the notebook's two boulders");
});

console.log("names");
test("problem names keep harmless punctuation and drop markup and control characters", () => {
  assert.strictEqual(World.cleanName("  Bea's “Moonshine” & Co.!  "), "Bea's “Moonshine” & Co.!");
  assert.strictEqual(World.cleanName("<b>Bold</b>"), "bBold/b");
  assert.strictEqual(World.cleanName("Right‮to left"), "Rightto left");
  assert.strictEqual(World.cleanName("Crème brûlée 🍮"), "Crème brûlée 🍮");
  assert.strictEqual(World.cleanName("!!!"), "");
  assert.strictEqual(Array.from(World.cleanName("x".repeat(60))).length, 40);
});

console.log("migration");
function v1Save() {
  // A v1 climber four days in: two first sends (one a notebook problem), a repeat, some projects, a tip.
  const nb = World.notebook(D)[2].p, cooler = D.boulders.find(b => b.name === "The Cooler").problems, school = D.boulders.find(b => b.sector === "The Schoolhouse").problems;
  return { v: 1, id: "abc123xyz", date: "2025-09-09", dayNo: 4, player: { xp: 60, height: 165, ape: 2, energy: 80, skin: 70, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) },
    loc: { sector: "The Tailgate", boulder: D.problems[cooler[0]].b }, visited: ["The Tailgate", "The Schoolhouse"],
    ticks: [{ p: nb, date: "2025-09-06", day: 1, style: "Flash", att: 1 }, { p: cooler[0], date: "2025-09-07", day: 2, style: "Send", att: 3 }, { p: cooler[0], date: "2025-09-09", day: 4, style: "Repeat", att: 4 }],
    ps: { [nb]: { att: 1, sent: true, log: [] }, [cooler[0]]: { att: 4, sent: true, log: [["2025-09-06", 2, 0.5, 0], ["2025-09-07", 1, 1, 1]] }, [cooler[3]]: { att: 5, sent: false, log: [["2025-09-07", 5, 0.4, 0]] }, [school[2]]: { att: 2, sent: false, log: [["2025-09-08", 2, 0.3, 0]] } },
    tips: [{ p: school[5], from: 12, date: "2025-09-08", why: [], done: false }], todo: [], feed: [], ach: {}, bestGrade: 1 };
}
test("sends become your first ascents; the notebook's stay old-era", () => {
  const g = World.migrate(D, v1Save()), cooler = D.boulders.find(b => b.name === "The Cooler").problems, nb = World.notebook(D)[2].p;
  assert.strictEqual(g.v, 2); assert.strictEqual(g.rules, 1);
  assert.deepStrictEqual(g.world.est[cooler[0]] && [g.world.est[cooler[0]].by, g.world.est[cooler[0]].date], ["you", "2025-09-07"]);
  assert.strictEqual(g.world.est[nb].by, "n:dot");
  const K = Know.make(D, () => g);
  assert.strictEqual(K.line(cooler[3]), "open", "a project becomes an identified line");
  assert.strictEqual(K.area("The Schoolhouse"), 2); assert.strictEqual(K.boulder(g.loc.boulder), 2);
  assert.notStrictEqual(K.line(D.boulders.find(b => b.sector === "The Schoolhouse").problems[5]), "hidden", "a tip becomes a known line");
  assert.deepStrictEqual(World.check(D, g), []);
  assert.strictEqual(World.validate(D, g), null);
});
test("migration is deterministic and only happens once", () => {
  const a = World.migrate(D, v1Save()), b = World.migrate(D, v1Save());
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  const again = World.migrate(D, clone(a));
  assert.strictEqual(JSON.stringify(again), JSON.stringify(a));
});
test("migration keeps XP, ticks, projects and the rest exactly", () => {
  const before = v1Save(), g = World.migrate(D, clone(before));
  for (const k of ["player", "ticks", "ps", "tips", "loc", "date", "dayNo", "bestGrade"]) assert.deepStrictEqual(g[k], before[k], k);
});
test("after migrating, the community never takes your lines", () => {
  const g = World.migrate(D, v1Save());
  for (const p of Object.keys(g.know.lines)) { const e = g.world.est[p]; assert(!e || e.by === "you" || e.old, `#${p} went to ${e && e.by}`); }
});

console.log("first ascents and naming (Stage 3)");
test("you can name only your own first ascents, and the curated name is the default", () => {
  const g = newSave(), K = Know.make(D, () => g);
  let p = null;
  for (let b = 0; b < D.boulders.length && p == null; b++) {
    if (D.boulders[b].sector !== "The Tailgate" || g.know.boulders[b]) continue;
    K.inspect(b, g.date);
    p = D.boulders[b].problems.find(i => !g.world.est[i] && K.line(i) === "open");
  }
  assert(p != null, "an unclimbed line to try");
  assert.strictEqual(World.nameFa(D, g, p, "Mine"), null, "not yours before you climb it");
  g.ticks.push({ p, date: g.date, style: "Send" });
  assert(World.recordSend(D, g, p, g.date, false).fa);
  const before = clone(g.world.est[p]);
  assert.strictEqual(World.nameFa(D, g, p, "  Moonshine  <b>"), "Moonshine b");
  assert.strictEqual(K.name(p), "Moonshine b");
  assert.strictEqual(g.world.est[p].by, before.by); assert.strictEqual(g.world.est[p].date, before.date);
  assert.strictEqual(World.nameFa(D, g, p, D.problems[p].name), D.problems[p].name);
  assert(!("name" in g.world.est[p]), "choosing the curated name stores nothing");
  assert.strictEqual(World.nameFa(D, g, p, "!!!"), D.problems[p].name, "an unusable name keeps the default");
  const nb = World.notebook(D)[0].p;
  assert.strictEqual(World.nameFa(D, g, nb, "Taken"), null, "the notebook's problems aren't yours");
  assert.strictEqual(World.validate(D, g), null); assert.deepStrictEqual(World.check(D, g), []);
  assert.strictEqual(World.faCount(g), 1);
});
test("a duplicate name is noticed only among problems you can see", () => {
  const g = newSave(), K = Know.make(D, () => g);
  const nb = World.notebook(D)[0].p;
  assert.strictEqual(K.sameName(-1, D.problems[nb].name.toUpperCase()), "The Tailgate");
  assert.strictEqual(K.sameName(nb, D.problems[nb].name), null, "not against itself");
  const hidden = D.problems.findIndex((p, i) => K.line(i) === "hidden" && !World.notebook(D).some(n => n.p === i) && !D.problems.some((q, j) => j !== i && q.name === p.name && K.line(j) !== "hidden"));
  assert.strictEqual(K.sameName(-1, D.problems[hidden].name), null, "a hidden problem's name doesn't leak");
});
test("Open projects: lines you know of; stronger eyes find more on boulders you've looked over", () => {
  const g = newSave(), K = Know.make(D, () => g);
  assert.deepStrictEqual(K.identified().sort((a, b) => a - b), World.notebook(D).map(n => n.p).sort((a, b) => a - b), "a new climber knows the notebook's four");
  assert.deepStrictEqual(K.lookAgain(), [], "nothing looked over yet");
  // Find a boulder with lines beyond a V0 climber, look it over, then get stronger.
  const b = D.boulders.findIndex((x, i) => x.sector === "The Tailgate" && !g.know.boulders[i] && x.problems.some(p => !Mech.canSpot(g.player, D.problems[p])));
  K.inspect(b, g.date);
  assert(K.inspected(b) && !K.lookAgain().includes(b));
  g.player.xp = xpFor(8);
  assert(K.lookAgain().includes(b), "a V8 climber sees more on it");
  const r = K.inspect(b, g.date);
  assert(r.lines.length > 0 && !r.found && !K.lookAgain().includes(b));
});

console.log("getting around (Stage 4)");
// A small network: a trail from the lot (0,0) north to a junction (0,300), branching
// east to (300,300) and west to (-300,300). A pond sits between the lot and the east branch.
const net = () => Travel.make({ trails: [[[0, 0], [0, 150], [0, 300]], [[0, 300], [150, 300], [300, 300]], [[0, 300], [-150, 300], [-300, 300]]],
  blocked: p => Math.hypot(p[0] - 150, p[1] - 150) < 80 });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
test("walking times match the game's trail pacing (45 m a minute on trails)", () => {
  const W = net(), p = W.plan([0, 0], [300, 300]);
  assert(near(p.metres, 600, 1e-6), p.metres);
  assert(near(p.minutes, 600 / 45, 1e-6), p.minutes);
  assert(p.rates.every(r => r === 45));
});
test("off the trail is slower, and you take the trail when it's quicker", () => {
  const W = net();
  // 40 m off a trail: straight through the woods.
  const a = W.plan([0, 100], [-40, 100]);
  assert(near(a.minutes, 40 / 30, 1e-6) && a.pts.length === 2);
  // From the west end to the east end: along the trails (600 m at 45/min), not 600 m straight at 30/min.
  const b = W.plan([-300, 300], [300, 300]);
  assert(near(b.minutes, 600 / 45, 1e-6), b.minutes);
  // A spot 20 m off the far trail: out along the trail, then into the woods.
  const c = W.plan([0, 0], [-200, 320]);
  assert(near(c.minutes, 500 / 45 + 20 / 30, 1e-3), c.minutes);
  assert.strictEqual(c.rates[c.rates.length - 1], 30);
});
test("water is in the way: no walking across the pond", () => {
  const W = net(), p = W.plan([50, 50], [250, 250]);   // straight across the pond
  assert(p && p.pts.length > 2, "goes round, by the trails");
  for (let i = 1; i < p.pts.length; i++) assert(W.clear(p.pts[i - 1], p.pts[i]), "no leg crosses water");
  assert(p.minutes > Math.hypot(200, 200) / 30);
});
test("trips keep to the trails; walking yourself takes the shortcut, and is quicker", () => {
  const W = net(), Wm = Travel.make({ trails: [[[0, 0], [0, 150], [0, 300]], [[0, 300], [150, 300], [300, 300]], [[0, 300], [-150, 300], [-300, 300]]],
    blocked: p => Math.hypot(p[0] - 150, p[1] - 150) < 80, rate: Travel.MANUAL });
  // From the west end to a spot 30 m off the trail near the lot: the woods are the short way.
  const trip = W.plan([-300, 300], [-30, 30], { trails: true }), mine = Wm.plan([-300, 300], [-30, 30]);
  assert(trip.pts.length > 2 && near(trip.minutes, 570 / 45 + 30 / 30, 1e-3), "the trip goes by the trails: " + trip.minutes);
  assert(mine.pts.length === 2 && near(mine.minutes, Math.hypot(270, 270) / 35, 1e-6), "you cut through: " + mine.minutes);
  assert(mine.minutes < trip.minutes - 2, "the shortcut saves time");
  // A short hop off the trail is still walked straight.
  const hop = W.plan([0, 100], [-40, 100], { trails: true });
  assert(hop.pts.length === 2 && near(hop.minutes, 40 / 30, 1e-6));
  // The trail itself, walking yourself: a little quicker than a trip.
  assert(near(Wm.plan([0, 0], [0, 300]).minutes, 300 / 50, 1e-6));
});
test("a walk can stop part way, and what it costs so far is known", () => {
  const W = net(), p = W.plan([0, 0], [300, 300]);
  const half = Travel.along(p, 300);
  assert(near(half.p[0], 0) && near(half.p[1], 300) && near(half.minutes, 300 / 45, 1e-9));
  const end = Travel.along(p, 1e6);
  assert(end.end && near(end.minutes, p.minutes, 1e-9));
  assert.strictEqual(W.plan([5, 5], [5, 5]).minutes, 0);
});

console.log("the community and the regulars (Stage 5)");
test("your hardest send counts toward what you can read", () => {
  const pl = { xp: xpFor(7.7), height: 165, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) };
  const v12 = D.problems.find(p => p.grade === 12), v13 = D.problems.find(p => p.grade === 13);
  assert(!Mech.canSpot(pl, v12), "a V7 can't read a V12 on their own");
  assert(Mech.canSpot(pl, v12, 13) && !Mech.canSpot(pl, v13, 13), "but having sent V13, V12s are readable (not other V13s)");
  assert(!Mech.canSpot(pl, v12, -1) && !Mech.canSpot(pl, v12, 12));
});
test("the regulars arrive as you start climbing; Pickles and the Bishop never climb", () => {
  const g = newSave("regs");
  for (let n = 0; n < 40; n++) { g.date = World.addDays(g.date, 1); g.dayNo++; World.step(D, g, g.date); }
  for (const w of World.CLIMBING_REGULARS) assert(g.world.npc[w], w + " has arrived by day 40");
  assert(!g.world.npc["n:pickles"] && !g.world.npc["n:bishop"]);
  assert(Object.values(g.world.est).every(e => e.by !== "n:pickles" && (e.by !== "n:bishop" || e.old)), "the dog and the Bishop are never in the ledger (except the notebook)");
  assert(Object.values(g.world.est).some(e => World.CLIMBING_REGULARS.includes(e.by)), "the regulars put up problems");
  assert.deepStrictEqual(World.check(D, g), []); assert.strictEqual(World.validate(D, g), null);
});
test("the community leaves the far areas alone at first", () => {
  const g = newSave("far");
  while (g.date < "2025-11-20") { g.date = World.addDays(g.date, 1); g.dayNo++; World.step(D, g, g.date); }
  const far = new Set(D.sectors.filter(s => s.walk_min >= 21).map(s => s.name));
  assert(!Object.values(g.world.est).some(e => e.by !== "you" && far.has(D.boulders[D.problems[Object.keys(g.world.est).find(k => g.world.est[k] === e)].b].sector)), "no NPC first ascents out at Grout Piles or Back Forty before late November");
  assert(Object.keys(g.world.areas).length >= 3, "but the near areas are known, with the day they were found");
});
test("being told the way makes an area known (Go there works); meeting someone counts once a day", () => {
  const g = newSave("told"), K = Know.make(D, () => g);
  assert(!K.canGo({ sector: "Bracken Gully" }));
  assert(K.hearOf("Bracken Gully", "n:hollis", g.date) && K.canGo({ sector: "Bracken Gully" }) && K.area("Bracken Gully") === 1);
  assert.strictEqual(K.toldOf("Bracken Gully").from, "n:hollis");
  assert(!K.hearOf("Bracken Gully", "n:hollis", g.date), "only once");
  K.meet("n:rowan", g.date); K.meet("n:rowan", g.date); assert.strictEqual(K.met("n:rowan").n, 1);
  g.date = World.addDays(g.date, 1); K.meet("n:rowan", g.date); assert.strictEqual(K.met("n:rowan").n, 2);
  assert.strictEqual(K.pet("n:pickles", g.date), 1);
  assert.strictEqual(World.validate(D, g), null);
  g.know.met["n:rowan"].n = "lots"; assert(World.validate(D, g), "a bad met record is caught");
});
test("Local Buzz is precise about what you know and vague about the rest", () => {
  const g = newSave("buzz"), K = Know.make(D, () => g);
  while (g.date < "2025-12-15") { g.date = World.addDays(g.date, 1); g.dayNo++; World.step(D, g, g.date); }
  const items = K.buzz({ days: 60, max: 50, perDay: 9 });
  assert(items.length >= 5, "there's news: " + items.length);
  const unknownBoulders = D.boulders.filter((b, i) => !g.know.boulders[i]).map(b => b.name);
  const hiddenNames = D.problems.map((p, i) => i).filter(i => K.line(i) === "hidden").map(i => D.problems[i].name).filter(n => n.length > 6);
  for (const it of items) {
    for (const nm of unknownBoulders) assert(!it.text.includes(nm), `"${it.text}" names a boulder you haven't found (${nm})`);
    for (const nm of hiddenNames) assert(!it.text.includes(nm) || items.some(x => x.p != null && K.name(x.p) && K.name(x.p).includes(nm)), `"${it.text}" names a line you don't know (${nm})`);
    if (it.go) assert(K.canGo(it.go), "Go there only for places you know");
  }
});

if (process.argv.includes("--curve")) {
  console.log("\nhow the crag develops with a player climbing 2 days in 3 at the current pacing (seed 'curve')");
  const g = newSave("curve"), K = Know.make(D, () => g);
  let shown = 0;
  console.log("calendar  climbing  you   established  by you  hardest NPC FA  climbers  boulders found");
  for (const days of [7, 14, 30, 45, 60, 90, 120, 180, 270, 365]) {
    playDays(g, K, days - shown); shown = days;
    const e = Object.values(g.world.est), npc = e.filter(x => x.by !== "you" && !x.old);
    console.log(`${String(days).padStart(5)} d  ${String(g.dayNo).padStart(6)}    V${Math.floor(Mech.ability(g.player.xp))}  ${String(e.length).padStart(8)}  ${String(e.filter(x => x.by === "you").length).padStart(8)}  ${("V" + Math.max(0, ...npc.map(x => x.grade))).padStart(10)}  ${String(Object.keys(g.world.npc).length).padStart(10)}  ${String(g.world.found.length).padStart(10)}`);
  }
}
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
