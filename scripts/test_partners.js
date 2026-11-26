// Tests for Phase 3, Stage 4: partners and good vibes (mechanics.js), in Node.
//   node scripts/test_partners.js
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
const player = { xp: 0, tops: [], height: 170, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) };
const B = Mech.BAL;

test("climbing alone on a quiet day: no vibes, and nothing lost", () => {
  assert(Mech.vibes({}) === 0 && Mech.vibes() === 0, "alone");
  const p = D.problems[374];
  assert(Mech.breakdown(player, p, null, { cond: 0, vibes: Mech.vibes({}) }).vibes === 0, "no part");
});
test("a partner, friends nearby, a buzzing day, a breakthrough: each adds a little, and together never more than vibesMax", () => {
  assert(Mech.vibes({ partner: true }) === B.vibePartner, "partner");
  assert(Mech.vibes({ crowd: 9 }) === B.vibeCrowdMax, "the crowd's capped");
  const all = Mech.vibes({ partner: true, crowd: 3, buzz: true, high: true, friend: true });
  assert(all === B.vibesMax && all <= 0.25, `all: ${all}`);
});
test("climbing with Rowan feels a little better still, within the cap", () => {
  assert(Mech.vibes({ partner: true, rowan: true }) === Math.round((B.vibePartner + B.vibeRowan) * 100) / 100, "Rowan");
  assert(Mech.vibes({ rowan: true }) === 0, "only as your partner");
  assert(Mech.vibes({ partner: true, rowan: true, crowd: 3, buzz: true, high: true, friend: true }) === B.vibesMax, "capped");
});
test("vibes can tip a close project, but never carry a climb you aren't ready for", () => {
  const fresh = { ...player, xp: 0 };            // a V0
  const close = D.problems.find(p => p.grade === 1 && p.tags.includes("crimpy")), far = D.problems.find(p => p.grade === 3);
  const c0 = Mech.chanceOf(fresh, close, null, { cond: 0 }), c1 = Mech.chanceOf(fresh, close, null, { cond: 0, vibes: B.vibesMax });
  assert(c1 > c0 * 1.1, `close: ${c0.toFixed(3)} → ${c1.toFixed(3)}`);
  const f1 = Mech.chanceOf(fresh, far, null, { cond: 0, vibes: B.vibesMax });
  assert(f1 < 0.03, `three grades up with every vibe: ${f1.toFixed(3)}`);
});
test("vibes count inside the shared ceiling", () => {
  const strong = { ...player, skills: Object.fromEntries(Mech.PREF.map(t => [t, 1])) };
  const p = D.problems.find(q => q.tags.includes("slopey"));
  const parts = Mech.breakdown(strong, p, { beta: 0.9, alt: true }, { cond: 0.6, brushed: true, vibes: B.vibesMax });
  const good = ["style", "morph", "beta", "conditions", "brushed", "vibes"].reduce((s, k) => s + Math.max(0, parts[k]), 0);
  assert(good <= B.ceiling + 1e-9, `good ${good}`);
});
test("with a partner watching, a fall teaches more", () => {
  const p = D.problems[374], s = Mech.sequence(p), crux = s.cruxes[0];
  const a = { att: 1, beta: 0 }, b = { att: 1, beta: 0 };
  Mech.learnBurn(player, p, a, crux, 1, () => 1, false);
  Mech.learnBurn(player, p, b, crux, 1, () => 1, true);
  assert(b.mk[crux] > a.mk[crux] * 1.3 && b.beta > a.beta, `${a.mk[crux]} vs ${b.mk[crux]}`);
});
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
