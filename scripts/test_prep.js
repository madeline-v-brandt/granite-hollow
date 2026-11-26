// Tests for Phase 3, Stage 3: preparation and conditions through the day (mechanics.js), in Node.
//   node scripts/test_prep.js
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
const tagged = (...ts) => D.problems.find(p => ts.every(t => p.tags.split("|").includes(t)));
const sloper = tagged("slopey"), crimp = D.problems.find(p => p.tags.includes("crimpy") && !p.tags.includes("slopey") && !p.tags.includes("slab") && !p.tags.includes("pinchy") && !p.tags.includes("compression"));
const by = name => D.boulders.find(b => b.sector === name);

test("every boulder has a shade from 0 to 1; Hemlock Hollow is shadier than Back Forty; roofs are shadier than slabs", () => {
  for (const b of D.boulders) for (const m of [0, 6]) { const s = Mech.shadeOf(b, m); assert(s >= 0 && s <= 1, `${b.name}: ${s}`); }
  assert(D.boulders.every(b => b.sector in Mech.AREA_SHADE), "an area has no shade entry (renamed?)");
  assert(Mech.shadeOf(by("Hemlock Hollow"), 6) > Mech.shadeOf(by("Back Forty"), 6) + 0.4, "hollow vs field");
  const s = { sector: "The Schoolhouse" };
  assert(Mech.shadeOf({ ...s, angle: "roof" }, 6) > Mech.shadeOf({ ...s, angle: "slab" }, 6), "roof vs slab");
});
test("winter lets the sun through the maples, but not the hemlocks", () => {
  const cellar = by("The Cellar Holes"), hollow = by("Hemlock Hollow");
  assert(Mech.shadeOf(cellar, 0) < Mech.shadeOf(cellar, 6) - 0.2, "maple woods");
  assert(Mech.shadeOf(hollow, 0) > Mech.shadeOf(hollow, 6) - 0.1, "hemlocks");
});
test("friction is best in the cool of the morning and worst mid-afternoon; shade helps on a warm day, sun on a cold one", () => {
  const warm = { cond: -0.2, temp: 72, sky: "Sunny" }, cold = { cond: 0.35, temp: 36, sky: "Bluebird" };
  assert(Mech.condAt(warm, 9 * 60) > Mech.condAt(warm, 15 * 60) + 0.1, "morning vs afternoon");
  assert(Mech.condAt(warm, 15 * 60, 0.9) > Mech.condAt(warm, 15 * 60, 0.05) + 0.1, "shade on a warm afternoon");
  assert(Mech.condAt(cold, 14 * 60, 0.05) > Mech.condAt(cold, 14 * 60, 0.9), "sun on a cold afternoon");
  const gap = w => Mech.condAt(w, 15 * 60, 0.9) - Mech.condAt(w, 15 * 60, 0.05);
  assert(gap({ ...warm, sky: "Overcast" }) < gap(warm) / 2, "clouds even it out");
  assert(Mech.condAt({ cond: -0.9, temp: 60, sky: "Rain" }, 12 * 60, 1) === -0.9, "wet is wet");
});
test("over a climbing day, the park on average feels about like the forecast", () => {
  const months = [0, 3, 6, 9];
  let diff = 0, n = 0;
  for (const m of months) for (let k = 0; k < 200; k++) {
    const w = Mech.forecastDay(m, Math.random);
    for (let min = 9 * 60 + 30; min <= Math.min(w.dusk, 17 * 60); min += 30) for (const b of D.boulders) { diff += Mech.condAt(w, min, Mech.shadeOf(b, m)) - w.cond; n++; }
  }
  assert(Math.abs(diff / n) < 0.06, `average shift ${(diff / n).toFixed(3)}`);
});
test("a dirty line is harder until brushed; brushing helps friction holds more than jugs", () => {
  const day = { cond: 0 };
  const c = (p, d) => Mech.chanceOf(player, p, null, { ...day, ...d });
  assert(c(sloper, { dirty: true }) < c(sloper, {}), "dirt");
  const gainS = c(sloper, { brushed: true }) - c(sloper, {});
  const jug = D.problems.find(p => p.tags === "juggy" || (p.tags.includes("juggy") && Mech.frictionSensitivity(p) <= 0.35));
  const gainJ = Mech.breakdown(player, jug, null, { ...day, brushed: true }).brushed;
  assert(gainS > 0 && Mech.breakdown(player, sloper, null, { ...day, brushed: true }).brushed > gainJ, "brushing a sloper vs a jug");
});
test("tape: half the skin per burn, thin skin hurts less, but slopers feel worse and crimps don't", () => {
  const a = Mech.attemptCost(player, crimp), b = Mech.attemptCost(player, crimp, { tape: true });
  assert(Math.abs(b.skin - a.skin * Mech.BAL.tapeSkin) < 1e-9 && b.energy === a.energy, "cost");
  const thin = { ...player, skin: 15 };
  assert(Mech.breakdown(thin, crimp, null, { cond: 0, tape: true }).skin > Mech.breakdown(thin, crimp, null, { cond: 0 }).skin, "thin skin");
  assert(Mech.breakdown(player, crimp, null, { cond: 0, tape: true }).tape === 0, "crimps");
  assert(Mech.breakdown(player, sloper, null, { cond: 0, tape: true }).tape < -0.2, "slopers");
  assert(Mech.chanceOf(thin, crimp, null, { cond: 0, tape: true }) > Mech.chanceOf(thin, crimp, null, { cond: 0 }), "taping thin skin on a crimp helps");
});
test("brushing counts inside the shared ceiling: good things together never pass it", () => {
  const strong = { ...player, skills: Object.fromEntries(Mech.PREF.map(t => [t, 1])) };
  const parts = Mech.breakdown(strong, sloper, { beta: 0.9, alt: true }, { cond: 0.6, brushed: true, vibes: 0.25 });
  const good = ["style", "morph", "beta", "conditions", "brushed", "vibes"].reduce((s, k) => s + Math.max(0, parts[k]), 0);
  assert(good <= Mech.BAL.ceiling + 1e-9, `good ${good}`);
});
test("a save from before Stage 3 (no dirt, brushing or tape on the day) gets the same chances as before", () => {
  const d = { cond: 0.1 };
  for (const p of D.problems.slice(0, 80)) {
    const parts = Mech.breakdown(player, p, null, d);
    assert(parts.dirt === 0 && parts.brushed === 0 && parts.tape === 0, p.name);
  }
});
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
