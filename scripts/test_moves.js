// Tests for Phase 3, Stage 1: problems' moves (mechanics.js), in Node.
//   node scripts/test_moves.js
const path = require("path");
const GAME = path.join(__dirname, "..", "site", "game");
const Mech = require(path.join(GAME, "mechanics.js"));
const D = require(path.join(GAME, "game-data.json"));
D.problems.forEach((p, i) => { p.id = i; });
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || "assertion failed"); };
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
const player = { xp: 0, tops: [], height: 170, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) };

test("every problem has 3–12 moves, at least one crux, and risk shares that add up to 1", () => {
  for (const p of D.problems) {
    const s = Mech.sequence(p);
    assert(s.n >= 3 && s.n <= 12 && s.moves.length === s.n, `${p.name}: ${s.n} moves`);
    assert(s.cruxes.length >= 1 && s.cruxes.every(i => s.moves[i].kind === "crux"), `${p.name}: cruxes`);
    assert(Math.abs(s.moves.reduce((a, m) => a + m.w, 0) - 1) < 1e-9, `${p.name}: weights`);
    assert(!s.cruxes.includes(s.n - 1), `${p.name}: crux on the last move`);
  }
});
test("sequences come from the data alone: the same every time, in any order", () => {
  const a = JSON.stringify(D.problems.slice(0, 50).map(Mech.sequence));
  const fresh = require(path.join(GAME, "game-data.json")).problems.slice(0, 50).map((p, i) => ({ ...p, id: i })).reverse().map(Mech.sequence).reverse();
  assert(JSON.stringify(fresh) === a, "sequences differ");
});
test("a save from before moves keeps its beta, and so its send chances", () => {
  for (const [i, beta] of [[10, 0.35], [400, 0.7], [999, 0.1], [3, 0]]) {
    const ps = { att: 5, beta, best: 0.5 };
    const before = Mech.chanceOf(player, D.problems[i], { ...ps }, { cond: 0 });
    assert(Math.abs(Mech.betaFrom(D.problems[i], ps) - beta) < 1e-9, `#${i} beta ${Mech.betaFrom(D.problems[i], ps)} vs ${beta}`);
    assert(Math.abs(Mech.chanceOf(player, D.problems[i], ps, { cond: 0 }) - before) < 1e-12, `#${i} chance changed`);
  }
});
test("moves only decide where you fall: the send rate is the chance", () => {
  const p = D.problems[374], r = rng(7);
  let sent = 0; const N = 20000;
  for (let k = 0; k < N; k++) if (Mech.attempt(player, p, { att: 0, beta: 0 }, { cond: 0 }, r).sent) sent++;
  const c = Mech.chanceOf(player, p, { att: 0, beta: 0 }, { cond: 0 });
  assert(Math.abs(sent / N - c) < 0.015, `sent ${sent / N} vs chance ${c}`);
});
test("most falls are on a crux; knowing it well moves them past it", () => {
  const p = D.problems[374], s = Mech.sequence(p), r = rng(3), crux = s.cruxes[0];
  const share = mk => { let c = 0; for (let k = 0; k < 5000; k++) if (Mech.fallMove(p, { mk: mk.slice() }, 0.1, r) === crux) c++; return c / 5000; };
  const cold = share(Array(s.n).fill(0)), known = share(Array(s.n).fill(0).map((v, i) => (i === crux ? 1 : 0)));
  assert(cold > 0.5, `cold crux share ${cold}`);
  assert(known < cold - 0.1, `known crux share ${known} vs ${cold}`);
});
test("falls teach the move you fell on most, and less with each try the same day", () => {
  const p = D.problems[374], s = Mech.sequence(p), crux = s.cruxes[0];
  const a = { att: 1, beta: 0 }; Mech.learnBurn(player, p, a, crux, 1, () => 1);
  const b = { att: 1, beta: 0 }; Mech.learnBurn(player, p, b, crux, 6, () => 1);
  assert(a.mk[crux] > a.mk[0] && a.mk[0] > 0 && a.mk[crux + 1] === 0, "what's learned where");
  assert(b.mk[crux] < a.mk[crux], "the sixth try teaches less");
  assert(a.beta > 0 && a.seen === crux + 1, "beta and moves seen");
});
test("a long break fades what you knew, never below half; a short one doesn't", () => {
  const p = D.problems[374], ps = { att: 9, beta: 0.7 };
  Mech.knowledge(p, ps);
  assert(!Mech.fade(p, ps, 10) && Math.abs(ps.beta - 0.7) < 1e-9, "ten days away faded it");
  Mech.fade(p, ps, 40); const b40 = ps.beta;
  assert(b40 < 0.7 && b40 > 0.35, `40 days: ${b40}`);
  const q = { att: 9, beta: 0.7 }; Mech.knowledge(p, q); Mech.fade(p, q, 400);
  assert(Math.abs(q.beta - 0.35) < 0.01, `400 days: ${q.beta}`);
});
test("the better way through: only for the right body, found by falling or working, kept forever", () => {
  const withAlt = D.problems.filter(p => Mech.sequence(p).alt);
  assert(withAlt.length > 200 && withAlt.length < 600, `${withAlt.length} problems have one`);
  const short = { ...player, height: 155, ape: 0 }, tall = { ...player, height: 190, ape: 6 };
  const extra = withAlt.find(p => Mech.sequence(p).alt.kind === "extra"), skip = withAlt.find(p => Mech.sequence(p).alt.kind === "skip");
  assert(extra && Mech.altFor(short, extra) && !Mech.altFor(tall, extra), "an intermediate is for shorter people");
  assert(skip && Mech.altFor(tall, skip) && !Mech.altFor(short, skip), "skipping a hold is for taller people");
  const p = withAlt.find(q => !Mech.sequence(q).alt.body), a = Mech.sequence(p).alt, ps = { att: 3, beta: 0 };
  Mech.knowledge(p, ps); ps.mk[a.at] = 0.5;
  const before = Mech.betaFrom(p, ps);
  Mech.learnBurn(player, p, ps, a.at, 1, () => 0);           // a lucky fall on that crux
  assert(ps.alt === true && ps.beta > before + Mech.BAL.altBeta - 0.01, "found by falling");
  Mech.fade(p, ps, 400); assert(ps.alt === true, "forgotten after a break");
  const q = { att: 3, beta: 0 }; Mech.workMove(player, p, q, { cond: 0 }, a.at, 1, () => 0);
  assert(q.mk[a.at] >= 0.3, "working a move teaches it a lot");
});
test("working a move sticks more often than burns send, and sticking it shows the next move", () => {
  const p = D.problems[374], s = Mech.sequence(p), crux = s.cruxes[0];
  const ps = { att: 2, beta: 0, best: (crux + 1) / s.n };
  const w = Mech.workMove(player, p, ps, { cond: 0 }, crux, 1, () => 0);
  assert(w.stuck && w.chance > Mech.chanceOf(player, p, ps, { cond: 0 }), "isolation is easier");
  assert(Mech.seenOf(p, ps) === crux + 2, `seen ${Mech.seenOf(p, ps)}`);
  const c = Mech.workCost(player, p), b = Mech.attemptCost(player, p);
  assert(c.energy < b.energy && c.skin < b.skin, "cheaper than a burn");
});
test("a local's tip shows the better way if there is one for you, else the crux", () => {
  const p = D.problems.find(q => Mech.sequence(q).alt && !Mech.sequence(q).alt.body), ps = { att: 3, beta: 0 };
  assert(Mech.tip(player, p, ps) === "alt" && ps.alt, "alt");
  assert(Mech.tip(player, p, ps) === "crux" && ps.beta > Mech.BAL.altBeta, "then the crux");
  const q = D.problems.find(x => !Mech.sequence(x).alt), qs = { att: 3, beta: 0 };
  assert(Mech.tip(player, q, qs) === "crux" && qs.beta > 0.1, "no alt: the crux");
});
test("previews: a rest helps a tired climber's next burn; working the crux beats working an easy move; nothing changes", () => {
  const p = D.problems[374], s = Mech.sequence(p), crux = s.cruxes[0], tired = { ...player, energy: 40 }, day = { cond: 0 };
  const ps = { att: 3, beta: 0, best: (crux + 1) / s.n }; Mech.knowledge(p, ps);
  const before = JSON.stringify(ps), now = Mech.chanceOf(tired, p, ps, day);
  assert(Mech.previewRest(tired, p, ps, day, 0) > now, "rest");
  assert(Mech.previewRest({ ...player }, p, ps, day, 0) === Mech.chanceOf(player, p, ps, day), "a fresh climber gains nothing");
  const easy = s.moves.findIndex(m => m.kind !== "crux");
  const wc = Mech.previewWork(player, p, ps, day, crux), we = Mech.previewWork(player, p, ps, day, easy);
  assert(wc.kept > we.kept && wc.kept > Mech.chanceOf(player, p, ps, day), "the crux is worth more, and it's worth something");
  assert(wc.next < wc.kept, "the energy it costs shows in the next burn");
  assert(JSON.stringify(ps) === before, "a preview changed the problem's state");
});
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
