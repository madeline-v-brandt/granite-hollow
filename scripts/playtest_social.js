// Phase 4, Stage 8: a year of the social game, played in Node through the real modules
// (world.js, knowledge.js, social.js, talk.js). Simulated players climb two days in three,
// find boulders, send lines and keep a project going; each climbing day they walk up to the
// regulars who are out, hear what they say (Talk.opening), ask what they're working on,
// mention their project, sometimes sit and chat (a story), pet Pickles, flirt with Rowan
// (the keen ones) and turn up to the events. Then it reports what a player would notice:
//   - variety: how much of what's said is new, how often a story is a repeat, how often a
//     conversation is only a nod, and which lines nobody ever hears
//   - memory: how often a conversation is about something you did
//   - pace: friendship, Pickles and Rowan, by climbing day
//   - determinism: the crag's history is identical with and without all this
//   node scripts/playtest_social.js        (--n 6 players a style, --days 365, --lines lists unheard lines)
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
const Mech = global.Mech = require(path.join(G_DIR, "mechanics.js"));
const World = global.World = require(path.join(G_DIR, "world.js"));
const Know = require(path.join(G_DIR, "knowledge.js"));
const Social = require(path.join(G_DIR, "social.js"));
const Talk = require(path.join(G_DIR, "talk.js"));
const D = require(path.join(G_DIR, "game-data.json"));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }, flag = k => args.includes("--" + k);
const N = +opt("n", 6), DAYS = +opt("days", 365), START = "2025-09-06";
const STYLES = {
  sociable: { meet: 0.7, chat: 0.35, tell: 0.5, ask: 0.6, climb: 0.15, pet: 0.8, flirt: true },
  casual: { meet: 0.35, chat: 0.12, tell: 0.3, ask: 0.4, climb: 0.05, pet: 0.4, flirt: false },
};
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : "-");
const xpFor = a => { let xp = 0; for (let l = 0; l < Math.floor(a); l++) xp += Mech.levelCost(l); return xp + Mech.levelCost(Math.floor(a)) * (a % 1); };
const abilityOnDay = n => { const pts = [[0, 0], [5, 3], [12, 5], [22, 7], [39, 9], [80, 11], [180, 13]]; for (let i = 1; i < pts.length; i++) if (n <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]); } return 13; };
const WHO = [...World.REG, "n:bishop"];
// Which topic each line belongs to (the playful lines and the sunset are Rowan's own).
const TOPIC = {};
for (const [k, lib] of Object.entries(Talk.LINES)) for (const [tp, ls] of Object.entries(lib)) for (const ln of ls) TOPIC[ln.id] = tp;
const ABOUT_YOU = /\.(m|mine)\.|\.h\.(gap|lvl|level|fa|dog|yours|ro|us|after|month|year)|closer|betaWorked|\.e\.|\.h\.sw|\.h\.us/;
const aboutYou = id => TOPIC[id] === "mine" || TOPIC[id] === "closer" || ABOUT_YOU.test(id);

function play(style, k, social = true) {
  const S = STYLES[style], r = mulberry(k * 7919 + (style === "casual" ? 101 : 13));
  const g = { v: 2, rules: 2, id: "p" + k, date: START, dayNo: 1, player: { name: "Sam", xp: 0, height: 165, ape: 2, energy: 100, skin: 100, skills: Object.fromEntries(Mech.PREF.map(t => [t, 0])) },
    ps: {}, ticks: [], tips: [], todo: [], visited: [], loc: { sector: null, boulder: null }, day: { weather: { label: "Good", temp: 60, cond: 0.2 } }, events: {} };
  g.world = World.create(D, `play-${style}-${k}`); g.know = World.initialKnow(D, START); g.social = { v: 1, npc: {} };
  const K = Know.make(D, () => g);
  World.step(D, g, START);
  const out = { convs: 0, byWho: {}, nodOnly: 0, withNews: 0, about: 0, chats: 0, staleStory: 0, beats: 0, newBeats: 0, staleBeats: 0, heard: new Set(), first: {}, dog: {}, ro: {}, events: 0, staleBy: {}, beatsBy: {} };
  const lastHeard = {};                        // who|id -> date (everything, not only Social's 300)
  const note = (who, b, date) => {
    out.beats++;
    const key = who + "|" + b.id, last = lastHeard[key];
    if (!last) out.newBeats++;
    else if (World.daysBetween(last, date) < (TOPIC[b.id] === "story" ? 45 : 12)) { out.staleBeats++; const t = TOPIC[b.id] || "?"; out.staleBy[t] = (out.staleBy[t] || 0) + 1; }
    const t = TOPIC[b.id] || "?"; out.beatsBy[t] = (out.beatsBy[t] || 0) + 1;
    lastHeard[key] = date;
    out.heard.add(b.id);
  };
  for (let cal = 0, day = 0; day < DAYS; cal++) {
    g.date = World.addDays(START, cal + 1);
    const ev = World.eventOn(g.date), climbs = ev || cal % 3 !== 2;
    if (climbs) g.dayNo++;
    g.player.xp = xpFor(abilityOnDay(g.dayNo));
    g.day = { weather: { label: ev ? "Good" : r() < 0.3 ? "Prime" : "Good", temp: 60, cond: 0.2 } };
    World.step(D, g, g.date);
    if (!climbs) continue;
    day++;
    // Climb: find the nearest boulder you haven't looked at, send up to three lines, project the rest.
    const walk = b => (D.sectors.find(s => s.name === D.boulders[b].sector) || {}).walk_min;
    const next = D.boulders.map((b, i) => i).filter(i => !g.know.boulders[i] || g.know.boulders[i] < 2).sort((a, b) => walk(a) - walk(b) || a - b)[0];
    if (next != null) K.inspect(next, g.date);
    const A = Mech.ability(g.player.xp);
    let sent = 0;
    for (const p of Object.keys(g.know.lines).map(Number)) {
      if (sent >= 3) break;
      if (g.ps[p] && g.ps[p].sent) continue;
      if (D.problems[p].grade > A + 0.3) { const st = g.ps[p] = g.ps[p] || { att: 0, sent: false, best: 0, beta: 0, sends: 0, log: [] }; if (D.problems[p].grade <= A + 1.5) { st.att += 2; st.log.push([g.date, 2, .5, 0]); } continue; }
      g.ps[p] = { att: 2, sent: true, best: 1, beta: 0, sends: 1, log: [[g.date, 2, 1, 1]], sentOn: g.date };
      g.ticks.push({ p, date: g.date, day: g.dayNo, style: "Send", att: 2, stars: null });
      World.recordSend(D, g, p, g.date, false);
      sent++;
    }
    if (!social) continue;
    const proj = Object.keys(g.ps).map(Number).filter(i => !g.ps[i].sent && g.ps[i].att >= 3).sort((a, b) => g.ps[b].att - g.ps[a].att)[0];
    // Pickles first (he's by the lot or his rock), then whoever's out.
    const dogN = Social.dog(g).n;
    if (r() < S.pet) {
      const env = { G: g, D, K, World, Social, minute: 560, wet: false, rng: r, playerName: "Sam", pets: (K.met("n:pickles") || {}).pets || 0, gusOut: true, dogMode: dogN >= 4 ? "with" : "rock" };
      K.meet("n:pickles", g.date); Talk.opening(env, "n:pickles"); K.pet("n:pickles", g.date); Social.befriend(g, "n:pickles", "pet", g.date);
      if (dogN >= 3 && r() < 0.6) Social.befriend(g, "n:pickles", "walk", g.date);
    }
    if (Social.dog(g).ready) g.dog = { adopted: g.date };          // the game: he stays the next time he'd go home
    const dn = Social.dog(g).n; for (let s = 1; s <= dn; s++) if (out.dog[s] == null) out.dog[s] = day;
    const people = WHO.filter(w => (w === "n:bishop" ? (ev || r() < 0.13) : World.sessionOn(g, w, g.date)));
    for (const w of people) {
      if (r() >= (ev ? 0.95 : S.meet)) continue;
      const prev = K.met(w), lastMet = prev && prev.last;
      const gap = lastMet && lastMet < g.date ? World.daysBetween(lastMet, g.date) : 0;
      K.meet(w, g.date); Social.befriend(g, w, "met", g.date);
      if (proj != null && w !== "n:bishop") Social.befriend(g, w, "proj", g.date, proj);
      const env = { G: g, D, K, World, Social, minute: 600 + Math.floor(r() * 360), wet: false, rng: r, playerName: "Sam", pets: (K.met("n:pickles") || {}).pets || 0, gusOut: people.includes("n:gus"), dogMode: Social.dog(g).n >= 4 ? "with" : "rock", gap };
      const beats = Talk.opening(env, w);
      out.convs++; out.byWho[w] = (out.byWho[w] || 0) + 1;
      beats.forEach(b => note(w, b, g.date));
      const topics = beats.map(b => TOPIC[b.id] || "");
      if (beats.length === 1 && /^(nod|hello)$/.test(topics[0])) out.nodOnly++;
      if (topics.some(t => /^(mine|theirs|today|others)$/.test(t))) out.withNews++;
      if (beats.some(b => aboutYou(b.id))) out.about++;
      if (w !== "n:bishop") {
        if (r() < S.ask) Talk.reply(env, w, "ask").forEach(b => note(w, b, g.date));
        if (proj != null && r() < S.tell) Talk.reply(env, w, "tell").forEach(b => note(w, b, g.date));
        if (r() < S.climb && w !== "n:rowan") { Social.befriend(g, w, "climb", g.date); if (r() < 0.5 && g.ticks.length) Social.befriend(g, w, "sendWith", g.date, g.ticks[g.ticks.length - 1].p); }
      }
      if (r() < S.chat) {
        out.chats++;
        const story = Talk.reply(env, w, "story");
        if (story.length) { const last = lastHeard[w + "|" + story[0].id]; if (last && World.daysBetween(last, g.date) < 45) out.staleStory++; note(w, story[0], g.date); }
        K.chat(w, g.date); Social.befriend(g, w, "chat", g.date);
      }
      if (w === "n:rowan" && S.flirt) {
        if (Social.canFlirt(g)) { Social.flirt(g, g.date); }
        if (r() < 0.35) Social.befriend(g, w, "climb", g.date);
        const R = Social.romance(g);
        if (R.canAsk && !ev) { Social.asked(g, g.date); Social.sunset(g, g.date, true); }
      }
      if (ev) Social.befriend(g, w, "event", g.date);
      Talk.reply(env, w, "bye").forEach(b => note(w, b, g.date));
      const t = Social.tier(g, w);
      if (t) for (const key of ["know", "friends", "good"]) if (Social.TIERS.findIndex(x => x.key === key) <= t.n) { out.first[key] = out.first[key] || {}; if (out.first[key][w] == null) out.first[key][w] = day; }
    }
    if (ev) { out.events++; const t = World.oldTrailOn(g.date); g.events[g.date] = ev.key === "trail" ? { k: "trail", helped: true, ...(t ? { trail: t.id } : {}) } : { k: ev.key, there: true }; }
    const R = Social.romance(g); for (let s = 1; s <= R.n; s++) if (out.ro[s] == null) out.ro[s] = day;
  }
  out.g = g;
  return out;
}

// ---- determinism: the crag's history doesn't depend on any of this ---------------------
const strip = g => JSON.stringify({ est: g.world.est, npc: g.world.npc, reg: g.world.reg, news: g.world.news });
{
  const a = play("sociable", 0, true), b = play("sociable", 0, false), c = play("sociable", 0, true);
  console.log(`Determinism: the crag's history with and without the social game is ${strip(a.g) === strip(b.g) ? "identical" : "DIFFERENT"}; ` +
    `two runs of the same player are ${JSON.stringify(a.g.social) === JSON.stringify(c.g.social) ? "identical" : "DIFFERENT"}.`);
  const f1 = JSON.stringify(World.compField(D, a.g, "2025-11-01")), f2 = JSON.stringify(World.compField(D, b.g, "2025-11-01"));
  console.log(`  The fall comp's field is ${f1 === f2 ? "the same" : "DIFFERENT"} with and without the social game.`);
}

const heardAll = new Set();
for (const style of Object.keys(STYLES)) {
  const runs = []; for (let k = 0; k < N; k++) runs.push(play(style, k));
  const sum = f => runs.reduce((s, x) => s + f(x), 0);
  runs.forEach(x => x.heard.forEach(id => heardAll.add(id)));
  console.log(`\n${style} (${N} players, ${DAYS} climbing days)`);
  console.log(`  conversations: ${Math.round(sum(x => x.convs) / N)} a year each (${WHO.map(w => `${w.slice(2)} ${Math.round(sum(x => x.byWho[w] || 0) / N)}`).join(", ")})`);
  console.log(`  what's said: ${pct(sum(x => x.newBeats), sum(x => x.beats))} never heard before; ${pct(sum(x => x.staleBeats), sum(x => x.beats))} repeated inside the no-repeat window`);
  { const by = {}, all = {}; runs.forEach(x => { for (const [t, n] of Object.entries(x.staleBy)) by[t] = (by[t] || 0) + n; for (const [t, n] of Object.entries(x.beatsBy)) all[t] = (all[t] || 0) + n; });
    console.log(`  repeats by topic: ${Object.entries(all).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${pct(by[t] || 0, n)} of ${Math.round(n / N)}`).join(", ")}`); }
  console.log(`  openings: ${pct(sum(x => x.withNews), sum(x => x.convs))} have news; ${pct(sum(x => x.nodOnly), sum(x => x.convs))} are only a hello; ${pct(sum(x => x.about), sum(x => x.convs))} are about something you did or share`);
  console.log(`  sit and chat: ${Math.round(sum(x => x.chats) / N)} a year; ${pct(sum(x => x.staleStory), sum(x => x.chats))} retell a story from the last 45 days`);
  const first = key => WHO.slice(0, 6).map(w => `${w.slice(2)} ${med(runs.map(x => (x.first[key] || {})[w])) ?? "-"}`).join(", ");
  console.log(`  friends by climbing day (median): ${first("friends")}`);
  console.log(`  good friends: ${first("good")}`);
  console.log(`  Pickles: knows you ${med(runs.map(x => x.dog[1]))}, greets you ${med(runs.map(x => x.dog[2]))}, follows ${med(runs.map(x => x.dog[3]))}, yours ${med(runs.map(x => x.dog[4]))} (${runs.filter(x => x.dog[4] != null).length}/${N})`);
  if (STYLES[style].flirt) console.log(`  Rowan: sweet ${med(runs.map(x => x.ro[2]))}, ready ${med(runs.map(x => x.ro[3]))}, together ${med(runs.map(x => x.ro[4]))} (${runs.filter(x => x.ro[4] != null).length}/${N})`);
}
// Lines nobody heard in a year (some are rare by design: anniversaries, a dispute, a party).
const never = Object.keys(TOPIC).filter(id => !heardAll.has(id) && !/^(first|again|bye|rec|beta|nobeta|note|invited|sunset|sunsetNo|lot|with|follow|home|pet|stick)$/.test(TOPIC[id]));
console.log(`\nLines nobody heard in a year (excluding replies the harness doesn't use): ${never.length} of ${Object.keys(TOPIC).length}`);
if (flag("lines")) { const by = {}; never.forEach(id => (by[TOPIC[id]] = by[TOPIC[id]] || []).push(id)); for (const [t, ids] of Object.entries(by)) console.log(`  ${t}: ${ids.join(" ")}`); }
