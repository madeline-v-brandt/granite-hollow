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
test("friendship: deepening, a long gap, your level, a hard first ascent, memories, friends' stories, notes", () => {
  const { g, K } = saves[2];
  const save0 = JSON.stringify(g.social);
  for (const w of World.REG) {
    const rec = g.social.npc[w];
    rec.best = "good";
    const all = [];
    for (const up of ["know", "friends", "good"]) {
      rec.up = { key: up, date: g.date };
      const xs = Talk.everyLine({ ...env(g, K), gap: 40 }, w).filter(x => x.topic === "closer");
      assert(xs.length === 1 && xs[0].t, `${w} ${up}: ${xs.map(x => x.id)}`); all.push(...xs);
    }
    delete rec.up;
    g.lvlOn = { 6: g.date }; g.bestGrade = 5;
    const xs = Talk.everyLine({ ...env(g, K), gap: 40, invite: { who: w, where: "at Hawkwatch", when: "from about 3 PM" } }, w);
    for (const want of ["gap", "level", "story", "note"]) assert(xs.some(x => (x.id.includes("." + want) || x.topic === want) && x.t), `${w} has no ${want} line`);
    const notes = xs.filter(x => x.topic === "note");
    assert(notes.every(x => /Hawkwatch|HAWKWATCH/.test(x.t)), `${w}'s note says where`);
    for (const x of [...all, ...xs].filter(x => x.t)) { assert(x.t.length < 330, x.id); if (w === "n:rowan" || Talk.mentions(x.t, Talk.context(env(g, K), w))) assert(!Talk.GENDERED.test(x.t), `${x.id}: "${x.t}"`); }
    // An opening after a deepening says so (once), and the deepening is then heard.
    rec.up = { key: "friends", date: g.date };
    const o = Talk.opening({ ...env(g, K), gap: 0 }, w);
    assert(o.some(b => /\.c\.friends$/.test(b.id)) && !rec.up, `${w}: ${o.map(b => b.id)}`);
  }
  g.social = JSON.parse(save0); delete g.lvlOn;
});
test("Pickles: his greeting depends on where he is; the regulars notice once he's yours", () => {
  const { g, K } = saves[2];
  const keep = JSON.stringify(g.social), keepDog = g.dog;
  for (const [mode, topic] of [["rock", "hello"], ["lot", "lot"], ["follow", "with"], ["with", "with"]]) {
    const o = Talk.opening({ ...env(g, K), dogMode: mode }, "n:pickles");
    assert(o.length === 1 && o[0].narr && Talk.LINES.pickles[topic].some(l => l.id === o[0].id), `${mode}: ${o.map(b => b.id)}`);
    for (const t of ["follow", "home", "pet", "stick", "bye"]) { const r = Talk.reply({ ...env(g, K), dogMode: mode }, "n:pickles", t); assert(r.length === 1 && r[0].t, `${mode} ${t}`); }
  }
  g.dog = { adopted: g.date };
  for (const w of World.REG) {
    const xs = Talk.everyLine({ ...env(g, K), dogMode: "with" }, w).filter(x => /\.h\.(dog|yours)$/.test(x.id));
    assert(xs.length >= 1 && xs.every(x => x.t && !(x.t.includes("Rowan") && Talk.GENDERED.test(x.t))), `${w} notices Pickles`);   // (Pickles is "he")
  }
  g.social = JSON.parse(keep); g.dog = keepDog;
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
// ---- Rowan (Stage 6) ----
const withRomance = (g, R, fn) => { const keep = JSON.stringify(g.social), keepR = g.romance; try { g.romance = R.romance; if (R.flirts) { const e = g.social.npc["n:rowan"]; e.k.flirt = R.flirts; e.last.flirt = g.date; e.k.climb = Math.max(e.k.climb || 0, 6); } return fn(); } finally { g.social = JSON.parse(keep); g.romance = keepR; } };
const STAGES = { none: {}, spark: { flirts: 1, romance: { since: "2025-09-07" } }, sweet: { flirts: 5, romance: { since: "2025-09-07" } },
  ready: { flirts: 12, romance: { since: "2025-09-07" } }, together: { flirts: 12, romance: { since: "2025-09-07", together: "2025-09-20" } } };
test("Rowan: every romance line, in every stage, renders with no gendered pronoun; Rowan's moods have portraits", () => {
  let n = 0;
  for (const { g, K } of saves.slice(1)) for (const [st, R] of Object.entries(STAGES)) withRomance(g, R, () => {
    for (const extra of [{}, { sunset: true }, { invite: { who: "n:rowan", where: "at The Billboard", when: "today", sunset: true } }, { minute: 900, wet: true }]) {
      const e = env(g, K, extra), xs = Talk.everyLine(e, "n:rowan").filter(x => x.t);
      for (const x of xs) { n++; assert(x.t.length < 330 && !/undefined|null|NaN/.test(x.t), `${st} ${x.id}`); assert(!Talk.GENDERED.test(x.t), `${st} ${x.id}: "${x.t}"`); }
      for (const w of WHO) for (const x of Talk.everyLine(e, w).filter(x => x.t && x.t.includes("Rowan"))) assert(!Talk.GENDERED.test(x.t), `${st} ${x.id}: "${x.t}"`);
      for (const x of xs) assert(Portraits.svg("rowan", x.mood || "neutral").includes("<svg"), x.mood);
    }
  });
  assert(n > 200, `${n} lines`);
  for (const m of Portraits.SWEET) { const s = Portraits.svg("rowan", m); assert(s !== Portraits.svg("rowan", "neutral") && !/undefined|NaN/.test(s), m); assert(Portraits.svg("bea", m) === Portraits.svg("bea", m === "shy" ? "embarrassed" : "happy"), "only Rowan's: " + m); }
});
test("Rowan: playful lines by stage (flirting before, affection once together); the sunset ask; the others notice", () => {
  const { g, K } = saves[2];
  withRomance(g, STAGES.spark, () => {
    const p = Talk.playful(env(g, K)); assert(p && p.label && !Talk.PLAYFUL.find(x => x.id === p.id).us, "a flirt " + JSON.stringify(p));
    const b = Talk.flirtBack(env(g, K), p.id, 1); assert(b && b.sweet && b.t && Portraits.SWEET.concat(Portraits.MOODS).includes(b.mood), JSON.stringify(b));
    const b2 = Talk.flirtBack(env(g, K), p.id, 2), x = Talk.PLAYFUL.find(y => y.id === p.id);
    assert(b2.t.replace(/^.\s*/, "") !== b.t.replace(/^.\s*/, "") || x.early[1] === x.sweet[1], "sweet answers differ from early ones");
    const o = Talk.opening(env(g, K, { sunset: false }), "n:rowan"); assert(o.length >= 1);
  });
  withRomance(g, { ...STAGES.together, romance: { since: "2025-09-07", together: World.addDays(g.date, -6) } }, () => {
    for (let k = 0; k < 10; k++) { const p = Talk.playful(env(g, K)); assert(p && Talk.PLAYFUL.find(x => x.id === p.id).us, "together: affection, not flirting " + JSON.stringify(p)); }
    const xs = Talk.everyLine(env(g, K), "n:rowan").filter(x => /row\.h\.us\d$/.test(x.id)); assert(xs.length >= 2, "together hellos");
    for (const w of ["n:gus", "n:hollis", "n:otis", "n:bea", "n:dez", "n:bishop"]) assert(Talk.everyLine(env(g, K), w).some(x => /\.h\.us$/.test(x.id) && (w === "n:bishop" || /rowan/i.test(x.t))), `${w} notices you and Rowan`);
  });
  withRomance(g, STAGES.ready, () => {
    const o = Talk.opening(env(g, K, { sunset: true }), "n:rowan");
    assert(o.some(b => /^row\.u\./.test(b.id) && b.sweet), "Rowan asks you to stay for the sunset: " + o.map(b => b.id));
    const note = Talk.note(env(g, K, { invite: { who: "n:rowan", where: "at The Billboard", when: "from about 3 PM", sunset: true } }), "n:rowan");
    assert(/sunset/.test(note), note);
    const plain = Talk.note(env(g, K, { invite: { who: "n:rowan", where: "at The Billboard", when: "today" } }), "n:rowan");
    assert(plain && !/sunset/.test(plain), plain);
  });
  withRomance(g, STAGES.none, () => { assert(Talk.everyLine(env(g, K), "n:rowan").every(x => !/^row\.h\.(sw|us)/.test(x.id)), "no sweet hellos without a romance"); });
});
test("Bea is only ever a friend: nobody but Rowan has anything playful or sweet", () => {
  for (const [k, lib] of Object.entries(Talk.LINES)) if (k !== "rowan") for (const [tp, ls] of Object.entries(lib)) for (const ln of ls) assert(!ln.sweet && tp !== "sunset" && tp !== "playful", `${k} ${ln.id}`);
  assert(Talk.PLAYFUL.every(x => !/Bea/.test(x.label({ proj: 1, part: "morning", cold: true, wx: {}, sentToday: 1 }))), "the playful lines are Rowan's");
});
// ---- events and stories (Stage 7) ----
test("events: every regular's event-day hello, for every event, renders (first, on the day)", () => {
  const { g, K } = saves[2], keep = g.date;
  try {
    for (const d of ["2026-11-01", "2026-12-21", "2027-04-01", "2027-06-21", "2027-08-07"]) {
      g.date = d;
      for (const w of [...World.REG, "n:bishop"]) {
        const xs = Talk.everyLine(env(g, K), w).filter(x => /\.h\.ev$/.test(x.id));
        assert(xs.length === 1 && xs[0].t && xs[0].t.length < 330, `${w} ${d}: ${xs.map(x => x.t)}`);
        if (/rowan/i.test(xs[0].t) || w === "n:rowan") assert(!Talk.GENDERED.test(xs[0].t), xs[0].t);
        const o = Talk.opening(env(g, K), w); assert(o.length && /\.h\.ev$/.test(o[0].id), `${w} opens with the event: ${o.map(b => b.id)}`);
      }
    }
  } finally { g.date = keep; }
});
test("the comp, after: results, your place, theirs; grade disputes; a big first ascent celebrated", () => {
  const { g, K } = saves[1];             // mid-November 2025: the comp was a fortnight ago at most
  const keepEv = g.events, keepDate = g.date;
  try {
    g.date = "2025-11-04";
    let n = 0;
    for (const mine of [null, { k: "comp", score: 99999 }, { k: "comp", score: 10 }]) {
      g.events = mine ? { "2025-11-01": mine } : undefined;
      for (const w of World.REG) {
        const c = Talk.context(env(g, K), w);
        assert(c.comp && c.comp.ago === 3 && c.comp.winner, `${w} knows the comp`);
        if (mine && mine.score > 9999) assert(c.comp.you === 1 && c.comp.winner === "you", JSON.stringify(c.comp));
        for (const x of Talk.everyLine(env(g, K), w).filter(x => /\.e\./.test(x.id))) { n++; assert(x.t && !/undefined|null|NaN/.test(x.t), x.id); if (/rowan/i.test(x.t) || w === "n:rowan") assert(!Talk.GENDERED.test(x.t), `${x.id}: ${x.t}`); }
      }
    }
    assert(n >= 12, `${n} comp lines`);
    // A grade dispute, both ways, and a celebration.
    const [p, e] = Object.entries(g.world.est).find(([, e]) => e.by === "n:dez") || Object.entries(g.world.est)[0];
    const keepE = JSON.stringify(e);
    e.by = "n:dez"; e.date = World.addDays(g.date, -2); e.grade = Math.max(e.grade, 8);
    e.logs.unshift(["n:hollis", World.addDays(g.date, -1), "S", 3, e.grade - 1]);
    const hol = Talk.everyLine(env(g, K), "n:hollis").filter(x => /\.g\./.test(x.id)), dez = Talk.everyLine(env(g, K), "n:dez").filter(x => /\.g\./.test(x.id));
    assert(hol.some(x => x.id === "hol.g.mine" && /soft/.test(x.t)), hol.map(x => x.t).join(" / "));
    assert(dez.some(x => x.id === "dez.g.theirs" && /Hollis/.test(x.t)), dez.map(x => x.t).join(" / "));
    for (const w of ["n:gus", "n:hollis", "n:otis", "n:rowan", "n:bea"]) assert(Talk.everyLine(env(g, K), w).some(x => /\.o\.party$/.test(x.id) && /Dez/.test(x.t)), `${w} celebrates Dez's new one`);
    assert(Talk.everyLine(env(g, K), "n:bishop").some(x => x.id === "bis.h.grade"), "the Bishop has views on grades");
    Object.assign(e, JSON.parse(keepE)); e.logs = JSON.parse(keepE).logs;
  } finally { g.events = keepEv; g.date = keepDate; }
});
test("Stage 8: asking again says “still”; the same project as you; goodbyes vary, then a wave; gatherings remembered", () => {
  const { g, K } = saves[2], keep = JSON.stringify(g.social), keepEv = g.events, keepReg = JSON.stringify(g.world.reg);
  try {
    const p = Object.keys(g.ps).map(Number).find(i => !g.ps[i].sent && g.ps[i].att >= 3 && K.visible(i));
    for (const w of World.REG) {
      const R = World.regOf(g, w);
      R.proj = { p: p ?? 0, since: World.addDays(g.date, -20), n: 9, best: 0.5 };
      Social.say(g, w, w.slice(2, 5) + ".a.proj", World.addDays(g.date, -3));
      const c = Talk.context(env(g, K), w);
      assert(c.projSame, `${w}: asked about the same project 3 days ago`);
      const lines = Talk.everyLine(env(g, K), w);
      assert(lines.some(x => /\.a\.still$/.test(x.id)), `${w} has a “still” answer`);
      if (p != null && c.yourProj && c.yourProj.p === p) {
        assert(c.sameProj && lines.some(x => /\.a\.same2?$/.test(x.id)) && lines.some(x => /\.k\.same$/.test(x.id)), `${w}: the same project as you`);
      }
      for (const x of lines) if (/\.(a|k|b)\./.test(x.id) || /\.wave\./.test(x.id)) { assert(x.t && !/undefined|null|NaN/.test(x.t), x.id); if (w === "n:rowan") assert(!Talk.GENDERED.test(x.t), `${x.id}: ${x.t}`); }
      // A goodbye every conversation: spoken ones while they're fresh, then a wave.
      const seen = new Set(); let waves = 0;
      for (let k = 0; k < 12; k++) { const b = Talk.reply(env(g, K), w, "bye")[0]; assert(b && b.t, `${w} says goodbye`); if (/\.wave$/.test(b.id)) waves++; else { assert(!seen.has(b.id), `${w} repeated ${b.id} the same day`); seen.add(b.id); } }
      assert(seen.size >= 3 && waves > 0, `${w}: ${seen.size} goodbyes, then ${waves} waves`);
    }
    // The bonfire you went to, three days later; Trail Day only if you helped (and a trail opened).
    g.events = { "2025-12-21": { k: "bonfire", there: true } };
    const d = g.date; g.date = "2025-12-24";
    for (const w of World.REG) { const x = Talk.everyLine(env(g, K), w).find(x => /\.e\.was$/.test(x.id)); assert(x && x.t, `${w} remembers the bonfire`); if (w === "n:rowan") assert(!Talk.GENDERED.test(x.t), x.t); }
    g.date = "2025-12-30"; assert(!Talk.context(env(g, K), "n:gus").wasThere, "a week later, it's not news");
    g.events = { "2025-12-21": { k: "bonfire" } }; g.date = "2025-12-24"; assert(!Talk.context(env(g, K), "n:gus").wasThere, "not if you weren't there");
    g.events = { "2026-08-01": { k: "trail", helped: true, trail: "quarrymen" } }; g.date = "2026-08-03";
    assert(Talk.context(env(g, K), "n:otis").wasThere.key === "trail", "Trail Day, helped");
    g.events = { "2026-08-01": { k: "trail" } }; assert(!Talk.context(env(g, K), "n:otis").wasThere, "Trail Day, didn't help");
    g.date = d;
  } finally { g.social = JSON.parse(keep); g.events = keepEv; g.world.reg = JSON.parse(keepReg); }
});
if (process.argv.includes("--show")) {
  const { g, K } = saves[2];
  for (const w of WHO) {
    console.log(`\n${w}`);
    for (const b of Talk.opening(env(g, K), w)) console.log(`  [${b.mood}] ${b.t}`);
    for (const t of ["ask", "tell", "story", "bye"]) for (const b of Talk.reply(env(g, K), w, t)) console.log(`  ${t}: [${b.mood}] ${b.t}`);
  }
  console.log("\nRowan: something playful (yours, then Rowan's answer: a little flirting / sweet on each other / together)");
  for (const x of Talk.PLAYFUL) console.log(`  ${x.label({ proj: 1, part: "morning", cold: true, wx: {}, sentToday: 1 })}\n    ${x.us ? `together: [${x.say[0]}] ${x.say[1]}` : `early: [${x.early[0]}] ${x.early[1]}\n    sweet: [${x.sweet[0]}] ${x.sweet[1]}`}`);
  console.log("\nThe sunset"); for (const [k, t] of Object.entries(Talk.SUNSET)) console.log(`  ${k}: ${t}`);
}
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
