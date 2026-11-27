// Tests for Phase 4, Stage 3: beta from other people (Mech.giveBeta, World.knowsLine).
//   node scripts/test_beta.js
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
const Mech = global.Mech = require(path.join(G_DIR, "mechanics.js"));
const World = global.World = require(path.join(G_DIR, "world.js"));
const Talk = require(path.join(G_DIR, "talk.js"));
const D = require(path.join(G_DIR, "game-data.json"));
D.problems.forEach((p, i) => { p.id = i; });
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || "assertion failed"); };
const B = Mech.BAL;
const player = { height: 170, ape: 0, skills: {} };
const fresh = () => ({ att: 5, sent: false, best: 0.5, beta: 0, mk: null });
// A problem with a crux and no better way through, and one with a better way through anyone can use.
const plain = D.problems.findIndex(p => p.grade >= 4 && !Mech.sequence(p).alt && Mech.sequence(p).cruxes.length === 1);
const withAlt = D.problems.findIndex(p => { const a = Mech.sequence(p).alt; return a && !a.body; });
const shortAlt = D.problems.findIndex(p => { const a = Mech.sequence(p).alt; return a && a.body === "short"; });
const reachy = D.problems.findIndex(p => Mech.sequence(p).moves.some(m => m.reach === "long") && !Mech.sequence(p).alt);
const gain = (i, from, pl = player, st = fresh()) => { const before = Mech.betaFrom(D.problems[i], st); const r = Mech.giveBeta(pl, D.problems[i], st, from); return { r, st, d: Mech.betaFrom(D.problems[i], st) - before }; };

test("someone who's climbed it tells you more than someone working it, who tells you more than style alone", () => {
  const s = gain(plain, { knows: "sent" }).d, p = gain(plain, { knows: "proj", upto: 1 }).d;
  const crux = Mech.sequence(D.problems[plain]).moves[Mech.sequence(D.problems[plain]).cruxes[0]];
  const likes = crux.style ? [crux.style] : [];
  const y = likes.length ? gain(plain, { knows: "style", likes }).d : 0;
  assert(s > p && p > 0, `sent ${s}, proj ${p}`);
  if (likes.length) assert(p > y && y > 0, `proj ${p}, style ${y}`);
});
test("friends tell you more; someone you've just met less", () => {
  const m = gain(plain, { knows: "sent", tier: "met" }).d, k = gain(plain, { knows: "sent", tier: "know" }).d, f = gain(plain, { knows: "sent", tier: "good" }).d;
  assert(f > k && k > m, `${m} ${k} ${f}`);
});
test("it's aimed at the move you keep falling on", () => {
  const p = D.problems[plain], s = Mech.sequence(p), st = fresh();
  const other = s.moves.find(m => m.kind === "move").i;
  Mech.knowledge(p, st); st.fx = Array(s.n).fill(0); st.fx[other] = 6;
  const r = Mech.giveBeta(player, p, st, { knows: "sent" });
  assert(r.at === other, `aimed at ${r.at}, not ${other}`);
  const r2 = Mech.giveBeta(player, p, fresh(), { knows: "sent" });
  assert(r2.at === s.cruxes[0], "with no falls, the crux");
});
test("someone working it only knows the moves they've reached", () => {
  const p = D.problems[plain], s = Mech.sequence(p);
  const moves = Mech.betaMoves(p, { knows: "proj", upto: 0.3 });
  assert(moves.every(i => i < Math.ceil(0.3 * s.n)), `${moves}`);
});
test("the better way through: from someone who's climbed it; a body-specific one only from someone your size (or a friend)", () => {
  const r = gain(withAlt, { knows: "sent" }).r;
  assert(r.what === "alt", "a technique anyone can use");
  assert(gain(withAlt, { knows: "style", likes: ["crimpy", "slopey", "dyno", "roof", "slab", "technical"] }).r.what !== "alt", "not from style alone");
  if (shortAlt >= 0) {
    const short = { height: 155, ape: 0 };
    assert(gain(shortAlt, { knows: "sent", reach: 190 }, short).r.what !== "alt", "a tall climber doesn't use the intermediate");
    assert(gain(shortAlt, { knows: "sent", reach: 190, tier: "friends" }, short).r.what === "alt", "a tall friend has seen shorter people use it");
    assert(gain(shortAlt, { knows: "sent", reach: 158 }, short).r.what === "alt", "someone short does");
  }
});
test("a reach that relies on their height is worth less to you, and they say so", () => {
  const p = D.problems[reachy], s = Mech.sequence(p), at = s.moves.find(m => m.reach === "long").i;
  const st1 = fresh(), st2 = fresh();
  for (const st of [st1, st2]) { Mech.knowledge(p, st); st.fx = Array(s.n).fill(0); st.fx[at] = 9; }
  const tall = Mech.giveBeta(player, p, st1, { knows: "sent", reach: 195 }), same = Mech.giveBeta(player, p, st2, { knows: "sent", reach: 171 });
  assert(tall.at === at && same.at === at, "both aimed at the reach");
  assert(tall.body === "taller" && !same.body, `${tall.body} ${same.body}`);
  assert(tall.gain < same.gain, `${tall.gain} vs ${same.gain}`);
});
test("several people's beta can't pass what's possible", () => {
  const p = D.problems[withAlt], st = fresh();
  for (let k = 0; k < 40; k++) Mech.giveBeta(player, p, st, { knows: "sent", tier: "good" });
  assert(st.beta <= B.betaMax + B.altBeta + 1e-9, `beta ${st.beta}`);
  assert(st.mk.every(v => v <= 1), "no move past fully known");
});
test("a send chance with beta never passes the ceiling", () => {
  const p = D.problems[withAlt], st = fresh();
  for (let k = 0; k < 40; k++) Mech.giveBeta(player, p, st, { knows: "sent", tier: "good" });
  const parts = Mech.breakdown({ ...player, xp: 0, tops: [], energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 1])) }, p, st, { cond: 0.6 });
  const good = Object.entries(parts).filter(([k, v]) => !["ability", "grade"].includes(k) && v > 0).reduce((a, [, v]) => a + v, 0);
  assert(good <= B.ceiling + 1e-6, `${good}`);
});
test("falls are counted per move, and old saves start from none", () => {
  const p = D.problems[plain], st = fresh();
  Mech.learnBurn(player, p, st, 1, 1, () => 0.9); Mech.learnBurn(player, p, st, 1, 2, () => 0.9);
  assert(st.fx[1] === 2, `${st.fx}`);
  assert(Mech.fallsOf(p, { fx: [1, "x"] }).every(v => v === 0), "bad falls ignored");
});
test("Phase 3's tip still works (someone who's climbed it)", () => {
  const st = fresh(); assert(["alt", "crux"].includes(Mech.tip(player, D.problems[plain], st)) && st.beta > 0);
});
test("knowsLine: from the ledger and the regulars' lives, never the Bishop or Pickles", () => {
  const g = { v: 2, date: "2025-09-06", dayNo: 1, player: { xp: 0 }, ps: {}, ticks: [], know: World.initialKnow(D, "2025-09-06") };
  g.world = World.create(D, "beta-t");
  let d = "2025-09-06";
  for (let k = 0; k < 120; k++) { d = World.addDays(d, 1); g.date = d; g.dayNo++; World.step(D, g, d); }
  let sent = 0, proj = 0, style = 0;
  for (const w of World.REG) for (let p = 0; p < D.problems.length; p += 3) {
    const k = World.knowsLine(D, g, w, p, d);
    if (!k) continue;
    if (k.knows === "sent") { sent++; assert(g.world.est[p], "only established lines"); }
    if (k.knows === "proj") proj++;
    if (k.knows === "style") style++;
    assert(k.reach > 140, "their body comes along");
  }
  assert(sent > 10 && style > 20 && World.REG.some(w => g.world.reg[w] && g.world.reg[w].proj && World.knowsLine(D, g, w, g.world.reg[w].proj.p, d).knows === "proj"), `sent ${sent}, proj ${proj}, style ${style}`);
  assert(World.knowsLine(D, g, "n:bishop", 0, d) === null && World.knowsLine(D, g, "n:pickles", 0, d) === null);
});
test("the words: every kind of beta has a technique and a place on the line", () => {
  for (const r of [{ what: "alt" }, { what: "move", style: "crimpy" }, { what: "move", hold: "smear" }, { what: "move" }, { what: "none" }]) assert(Talk.how(r, "heel").length > 10);
  assert(Talk.moveWord({ at: 3, kind: "crux" }) === "the crux, move 4" && Talk.moveWord({ at: 0, kind: "start" }) === "the first move");
  for (const k of Object.keys(Talk.ALT_HOW)) assert(Talk.how({ what: "alt" }, k) === Talk.ALT_HOW[k]);
});
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
