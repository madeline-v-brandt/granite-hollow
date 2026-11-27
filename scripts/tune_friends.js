// How fast friendships grow (Phase 4, Stage 4). Simulated players climb two days in
// three through a season in a crag that develops around them; each day they run
// into the regulars who are out (World.sessionOn), and sometimes talk, sit and chat,
// climb together, get beta, or do the thing that regular especially values.
// Reports the climbing day each tier is first reached with each regular (medians).
//   node scripts/tune_friends.js                  (--n 30 players a style, --days 240)
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
const Mech = global.Mech = require(path.join(G_DIR, "mechanics.js"));
const World = global.World = require(path.join(G_DIR, "world.js"));
const Social = require(path.join(G_DIR, "social.js"));
const D = require(path.join(G_DIR, "game-data.json"));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const N = +opt("n", 30), DAYS = +opt("days", 240);
if (opt("tiers", null)) JSON.parse(opt("tiers")).forEach((at, i) => { Social.TIERS[i + 1].at = at; });
// How sociable: the chance you run into each regular who's out, then what you do.
const STYLES = {
  sociable: { meet: 0.6, chat: 0.35, climb: 0.15, beta: 0.15, like: 0.3 },
  casual: { meet: 0.3, chat: 0.1, climb: 0.04, beta: 0.08, like: 0.12 },
};
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const LIKE = Object.fromEntries(Object.entries(Social.LIKES).map(([w, l]) => [w, Object.keys(l.kinds).find(k => Social.KINDS[k] === 0) || Object.keys(l.kinds)[0]]));
for (const [name, S] of Object.entries(STYLES)) {
  const firstAt = { know: [], friends: [], good: [] }, perReg = {}, endTiers = [];
  for (let k = 0; k < N; k++) {
    const r = mulberry(k * 7919 + 13);
    const g = { v: 2, date: "2025-09-06", dayNo: 0, player: { xp: 0 }, ps: {}, ticks: [], know: World.initialKnow(D, "2025-09-06") };
    g.world = World.create(D, "friends-" + k); g.social = { v: 1, npc: {} };
    const first = { know: null, friends: null, good: null };
    for (let cal = 0, day = 0; day < DAYS; cal++) {
      g.date = World.addDays("2025-09-06", cal);
      const climbs = cal % 3 !== 2;
      if (climbs) g.dayNo++;
      World.step(D, g, g.date);
      if (!climbs) continue;
      day++;
      for (const w of World.REG) {
        if (!World.sessionOn(g, w, g.date) || r() >= S.meet) continue;
        Social.moment(g, w, "met", g.date);
        if (r() < S.chat) Social.moment(g, w, "chat", g.date);
        if (r() < S.climb) { Social.moment(g, w, "climb", g.date); if (r() < 0.5) Social.moment(g, w, "sendWith", g.date); }
        if (r() < S.beta) Social.moment(g, w, "beta", g.date);
        if (r() < S.like) Social.moment(g, w, LIKE[w], g.date);
        const t = Social.tier(g, w);
        for (const key of ["know", "friends", "good"]) if (t && Social.TIERS.findIndex(x => x.key === key) <= t.n) {
          if (first[key] == null) first[key] = day;
          const pr = perReg[w] = perReg[w] || { know: [], friends: [], good: [] };
          if (!pr[key][k]) pr[key][k] = day;
        }
      }
    }
    for (const key in first) firstAt[key].push(first[key]);
    endTiers.push(World.REG.map(w => (Social.tier(g, w) || { key: "-" }).key));
  }
  console.log(`\n${name} (${N} players, ${DAYS} climbing days): tiers ${Social.TIERS.slice(1).map(t => `${t.key} ${t.at}`).join(", ")}`);
  console.log(`  first friend of each tier, climbing day (median): know ${med(firstAt.know)}, friends ${med(firstAt.friends)}, good friends ${med(firstAt.good)}`);
  for (const w of World.REG) {
    const pr = perReg[w] || { know: [], friends: [], good: [] }, n = key => `${med(pr[key])}`.padStart(4) + ` (${pr[key].filter(Boolean).length}/${N})`;
    console.log(`  ${w.slice(2).padEnd(7)} know ${n("know")}   friends ${n("friends")}   good ${n("good")}`);
  }
}
