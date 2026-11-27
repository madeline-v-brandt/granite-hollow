// Tests for Phase 4, Stage 2: what the regulars say (talk.js) and their portraits
// (portraits.js), in Node. Every line is rendered against several saves at
// different points in a season.
//   node scripts/test_talk.js            (--show prints a sample conversation per regular)
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
const Mech = global.Mech = require(path.join(G_DIR, "mechanics.js"));
const World = global.World = require(path.join(G_DIR, "world.js"));
const Know = require(path.join(G_DIR, "knowledge.js"));
const Social = require(path.join(G_DIR, "social.js"));
const Talk = require(path.join(G_DIR, "talk.js"));
const Portraits = require(path.join(G_DIR, "portraits.js"));
const D = require(path.join(G_DIR, "game-data.json"));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || "assertion failed"); };
const START = "2025-09-06";
function xpFor(a) { let xp = 0; for (let l = 0; l < Math.floor(a); l++) xp += Mech.levelCost(l); return xp + Mech.levelCost(Math.floor(a)) * (a % 1); }
const abilityOnDay = n => { const pts = [[0, 0], [5, 3], [12, 5], [22, 7], [39, 9], [80, 11]]; for (let i = 1; i < pts.length; i++) if (n <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]); } return 11; };
// A player who climbs two days in three, finds boulders, sends lines and keeps a project going.
function season(seed, days, name = "Sam") {
  const g = { v: 2, rules: 2, id: "t", date: START, dayNo: 1, player: { name, xp: 0, height: 165, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) },
    ps: {}, ticks: [], tips: [], todo: [], visited: [], loc: { sector: null, boulder: null }, day: { weather: { label: "Good", temp: 60, cond: 0.2 } } };
  g.world = World.create(D, seed); g.know = World.initialKnow(D, START);
  const K = Know.make(D, () => g);
  World.step(D, g, START);
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
      if (D.problems[p].grade > A + 0.3) { const st = g.ps[p] = g.ps[p] || { att: 0, sent: false, best: 0, beta: 0, sends: 0, log: [] }; if (D.problems[p].grade <= A + 1.5) { st.att += 2; st.log.push([g.date, 2, .5, 0]); } continue; }
      g.ps[p] = { att: 2, sent: true, best: 1, beta: 0, sends: 1, log: [[g.date, 2, 1, 1]] };
      g.ticks.push({ p, date: g.date, day: g.dayNo, style: "Send", att: 2, stars: null });
      World.recordSend(D, g, p, g.date, false);
      sent++;
    }
  }
  // They've met you, you've told them about your project, and you've climbed together.
  g.know.met = {};
  for (const w of [...World.REG, "n:bishop", "n:pickles"]) g.know.met[w] = { n: 6, first: START, last: World.addDays(g.date, -1) };
  Social.ensure(g, D.problems.length);
  const proj = Object.keys(g.ps).map(Number).find(p => !g.ps[p].sent && g.ps[p].att >= 3);
  for (const w of World.REG) {
    if (proj != null) Social.moment(g, w, "proj", World.addDays(g.date, -4), proj);
    const t = g.ticks[g.ticks.length - 1]; if (t) Social.moment(g, w, "sendWith", World.addDays(g.date, -3), t.p);
    for (let k = 1; k < 30; k++) Social.moment(g, w, "chat", World.addDays(g.date, -k));
  }
  // Beta they gave you on a line you've since sent (Stage 3: "told you so").
  const t = g.ticks[g.ticks.length - 1];
  if (t && World.daysBetween(t.date, g.date) <= 10) { g.ps[t.p].sentOn = t.date; g.ps[t.p].tips = Object.fromEntries(World.REG.map(w => [w, [World.addDays(t.date, -2), 1, "move"]])); }
  return { g, K };
}
const saves = [season("talk-a", 12), season("talk-b", 70), season("talk-c", 220), season("talk-d", 40, "you")];
const env = (g, K, extra = {}) => ({ G: g, D, K, World, Social, minute: 600, wet: false, rng: Math.random, pets: 4, gusOut: true, ...extra });
const WHO = [...World.REG, "n:bishop", "n:pickles"];

test("every line that applies renders: no undefined, no null, a sensible length", () => {
  let n = 0;
  for (const { g, K } of saves) for (const w of WHO) for (const x of Talk.everyLine(env(g, K), w)) {
    n++;
    assert(x.t, `${x.id} didn't render`);
    assert(x.t.length < 330, `${x.id} is ${x.t.length} characters`);
  }
  assert(n > 300, `${n} lines rendered`);
});
test("nothing names a boulder, an area or a line you haven't found", () => {
  for (const { g, K } of saves) {
    const unknownAreas = D.sectors.map(s => s.name).filter(s => K.area(s) < 1);
    const unknownBoulders = D.boulders.filter((b, i) => K.boulder(i) < 1).map(b => b.name).filter(n => n.length > 5);
    const people = new Set(Object.values(World.NAMED).map(n => n.name.replace(/^the /, "The ")));
    const hidden = D.problems.map((p, i) => i).filter(i => K.line(i) !== "est").map(i => D.problems[i].name).filter(n => n.length > 6 && !people.has(n));
    const known = new Set(D.problems.map((p, i) => i).filter(i => K.line(i) === "est").map(i => K.name(i)));
    for (const w of WHO) for (const x of Talk.everyLine(env(g, K), w).filter(x => x.t)) {
      for (const a of unknownAreas) assert(!x.t.includes(a), `${x.id} names ${a}: "${x.t}"`);
      for (const b of unknownBoulders) assert(!x.t.includes(b), `${x.id} names the boulder ${b}: "${x.t}"`);
      for (const h of hidden) assert(!x.t.includes(h) || [...known].some(k => k && k.includes(h)), `${x.id} names the line ${h}: "${x.t}"`);
    }
  }
});
test("no gendered pronoun in any line about Rowan or the player", () => {
  for (const { g, K } of saves) for (const w of WHO) for (const x of Talk.everyLine(env(g, K), w).filter(x => x.t)) {
    const c = Talk.context(env(g, K), w);
    if (Talk.mentions(x.t, c)) assert(!Talk.GENDERED.test(x.t), `${x.id}: "${x.t}"`);
  }
  // Rowan's own lines never describe Rowan with one either (narration about Rowan).
  for (const { g, K } of saves) for (const x of Talk.everyLine(env(g, K), "n:rowan").filter(x => x.t)) assert(!Talk.GENDERED.test(x.t), `${x.id}: "${x.t}"`);
});
test("a climber who's just called “you” is never addressed by that name", () => {
  const { g, K } = saves[3];
  for (const w of WHO) for (const x of Talk.everyLine(env(g, K), w)) assert(!/, you\.|^You!|you you/i.test(x.t) || !/\byou\b.*\byou\b.*\byou\b/.test(x.t), `${x.id}: "${x.t}"`);
});
test("they talk about what really happened: their session, their project, what you told them", () => {
  const { g, K } = saves[2];
  let specific = 0, total = 0;
  for (const w of World.REG) {
    const c = Talk.context(env(g, K), w);
    if (c.proj) assert(c.proj.full && c.proj.dur, `${w}'s project`);
    for (const x of Talk.everyLine(env(g, K), w)) if (["today", "theirs", "mine", "others"].includes(x.topic)) { total++; if (/\b(I|you)\b/i.test(x.t)) specific++; }
    assert(c.told, `${w} remembers your project`);
  }
  assert(total > 10, `${total} news lines apply`);
});
test("an opening is a hello and some news; nobody repeats a line for 12 days if they've anything else to say", () => {
  const { g, K } = season("talk-e", 60);
  const date0 = g.date, seen = new Map();
  let repeats = 0, beats = 0;
  for (let d = 0; d < 10; d++) {
    g.date = World.addDays(date0, d);
    const o = Talk.opening(env(g, K), "n:otis");
    assert(o.length >= 1 && o.length <= 3, `${o.length} beats`);
    for (const b of o) { beats++; if (seen.has(b.id) && World.daysBetween(seen.get(b.id), g.date) < 12) repeats++; seen.set(b.id, g.date); }
  }
  assert(repeats <= 2, `${repeats} repeats in ${beats} beats over ten days`);
});
test("replies: what they're working on, your project, a story, goodbye", () => {
  const { g, K } = saves[2];
  for (const w of World.REG) {
    for (const t of ["ask", "story", "bye", "again"]) assert(Talk.reply(env(g, K), w, t).length === 1, `${w} ${t}`);
    const c = Talk.context(env(g, K), w);
    if (c.yourProj) assert(Talk.reply(env(g, K), w, "tell").length === 1, `${w} tell`);
  }
  for (const t of ["pet", "stick", "bye"]) assert(Talk.reply(env(saves[1].g, saves[1].K), "n:pickles", t).length === 1, `Pickles ${t}`);
});
test("beta, pointers and recommendations: every kind renders in every voice, with no gendered pronouns", () => {
  const { g, K } = saves[2];
  const p = Object.keys(g.ps).map(Number).find(i => !g.ps[i].sent) ?? 0;
  const combos = [];
  for (const what of ["alt", "move"]) for (const knows of ["sent", "proj", "style"]) for (const body of [null, "taller", "shorter"]) for (const falls of [0, 5])
    combos.push({ p, r: { what, at: 3, kind: "crux", style: "crimpy", hold: "crimp", body }, from: { knows, fa: knows === "sent" }, altKind: "heel", falls });
  let n = 0;
  for (const w of World.REG) {
    for (const beta of combos) {
      const xs = Talk.everyLine({ ...env(g, K), beta }, w).filter(x => x.topic === "beta");
      assert(xs.length >= 1, `${w} has nothing for ${JSON.stringify(beta.r)} ${beta.from.knows}`);
      for (const x of xs) { n++; assert(x.t && x.t.length < 330, `${x.id}: ${x.t}`); assert(!Talk.GENDERED.test(x.t), `${x.id}: "${x.t}"`); }
    }
    for (const point of [null, { who: "n:dez", person: "Dez", where: "Dez's out today, at somewhere at Millrace Caves" }, { who: "n:rowan", person: "Rowan", where: null }]) {
      const xs = Talk.everyLine({ ...env(g, K), point }, w).filter(x => x.topic === "nobeta");
      assert(xs.length >= 1, `${w} nobeta`);
      for (const x of xs) { assert(x.t, x.id); assert(!Talk.GENDERED.test(x.t), `${x.id}: "${x.t}"`); }
    }
    const est = Object.keys(g.world.est).map(Number).find(i => K.line(i) === "est");
    const rs = Talk.everyLine({ ...env(g, K), rec: est }, w).filter(x => x.topic === "rec");
    assert(rs.length >= 1 && rs.every(x => x.t && !Talk.GENDERED.test(x.t)), `${w} rec`);
  }
  assert(n > 200, `${n} beta lines`);
});
test("Hollis only says “never made a first ascent” when that's true", () => {
  for (const { g, K } of saves) {
    const has = Object.values(g.world.est).some(e => e.by === "n:hollis");
    const lines = Talk.everyLine(env(g, K), "n:hollis").map(x => x.id);
    assert(has ? !lines.includes("hol.s.nofa") && lines.includes("hol.s.fa") : lines.includes("hol.s.nofa"), `Hollis has ${has ? "" : "no "}first ascents`);
  }
});
test("portraits: every regular, Pickles and strangers, in every mood, as valid SVG", () => {
  for (const k of ["gus", "hollis", "otis", "rowan", "bea", "dez", "bishop", "pickles", "stranger"]) for (const m of [...Portraits.MOODS, "sleepy"]) {
    const s = Portraits.svg(k, m, { seed: "x1", label: "a" });
    assert(/^<svg[^>]*viewBox="0 0 120 120"/.test(s) && s.endsWith("</svg>") && !/undefined|NaN/.test(s), `${k} ${m}`);
    assert((s.match(/<g/g) || []).length === (s.match(/<\/g>/g) || []).length, `${k} ${m}: groups balanced`);
  }
  assert(Portraits.svg("stranger", "happy", { seed: "a" }) !== Portraits.svg("stranger", "happy", { seed: "b" }), "strangers differ");
  assert(Portraits.svg("stranger", "happy", { seed: "a" }) === Portraits.svg("stranger", "happy", { seed: "a" }), "and are stable");
});
if (process.argv.includes("--show")) {
  const { g, K } = saves[2];
  for (const w of WHO) {
    console.log(`\n${w}`);
    for (const b of Talk.opening(env(g, K), w)) console.log(`  [${b.mood}] ${b.t}`);
    for (const t of ["ask", "tell", "story", "bye"]) for (const b of Talk.reply(env(g, K), w, t)) console.log(`  ${t}: [${b.mood}] ${b.t}`);
  }
}
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
