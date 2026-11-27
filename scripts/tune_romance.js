// How fast the romance with Rowan grows (Phase 4, Stage 6). Simulated players climb two
// days in three in a crag that develops around them; when Rowan's out (World.sessionOn)
// they sometimes go and find Rowan, talk, sit and chat, climb together, and say something
// playful. Rowan asks them to stay for the sunset once it's ready (Social.romance: canAsk)
// on a dry day when Rowan's out until dusk; the keen ones say how they feel.
// Reports the climbing day (and calendar weeks) each stage is first reached (medians).
//   node scripts/tune_romance.js        (--n 40 players a style, --days 240,
//                                        --set '{"ready":8}' tries other Social.ROMANCE numbers)
const path = require("path");
const G_DIR = path.join(__dirname, "..", "site", "game");
global.Mech = require(path.join(G_DIR, "mechanics.js"));
const World = global.World = require(path.join(G_DIR, "world.js"));
const Social = require(path.join(G_DIR, "social.js"));
const D = require(path.join(G_DIR, "game-data.json"));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const N = +opt("n", 40), DAYS = +opt("days", 240);
if (opt("set", null)) Object.assign(Social.ROMANCE, JSON.parse(opt("set")));
// How keen: the chance you go and find Rowan when Rowan's out, then what you do.
const STYLES = {
  keen: { meet: 0.85, flirt: 0.9, chat: 0.4, climb: 0.3, others: 0.4 },
  relaxed: { meet: 0.5, flirt: 0.5, chat: 0.25, climb: 0.15, others: 0.4 },
};
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
console.log(`Social.ROMANCE ${JSON.stringify(Social.ROMANCE)}, tiers ${Social.TIERS.slice(1).map(t => t.at).join("/")}`);
for (const [name, S] of Object.entries(STYLES)) {
  const at = { spark: [], sweet: [], ready: [], together: [] }, cal = { sweet: [], ready: [], together: [] };
  for (let k = 0; k < N; k++) {
    const r = mulberry(k * 7919 + 101);
    const g = { v: 2, date: "2025-09-06", dayNo: 0, player: { xp: 0 }, ps: {}, ticks: [], know: World.initialKnow(D, "2025-09-06") };
    g.world = World.create(D, "romance-" + k); g.social = { v: 2, npc: {} };
    const first = {};
    for (let c = 0, day = 0; day < DAYS && !first.together; c++) {
      g.date = World.addDays("2025-09-06", c);
      const climbs = c % 3 !== 2;
      if (climbs) g.dayNo++;
      World.step(D, g, g.date);
      if (!climbs) continue;
      day++;
      const s = World.sessionOn(g, "n:rowan", g.date);
      if (!s || r() >= S.meet) continue;
      Social.moment(g, "n:rowan", "met", g.date);
      if (r() < S.chat) { Social.moment(g, "n:rowan", "chat", g.date); if (r() < 0.3) Social.moment(g, "n:rowan", "quiet", g.date); }
      if (r() < S.climb) { Social.moment(g, "n:rowan", "climb", g.date); if (r() < 0.5) Social.moment(g, "n:rowan", "sendWith", g.date); }
      if (Social.canFlirt(g) && r() < S.flirt) Social.flirt(g, g.date);
      const ro = Social.romance(g);
      for (const [key, n] of [["spark", 1], ["sweet", 2], ["ready", 3]]) if (ro.n >= n && first[key] == null) { first[key] = day; if (cal[key]) cal[key].push(c); }
      // The sunset: Rowan's out till dusk on a dry day (the long days: until 7 PM or later).
      if (ro.canAsk && s.out !== "wet" && s.t[1] >= 1140) { Social.asked(g, g.date); Social.sunset(g, g.date, true); first.together = day; cal.together.push(c); }
    }
    for (const key of Object.keys(at)) at[key].push(first[key] ?? null);
  }
  const wk = a => (med(a) == null ? "-" : `${(med(a) / 7).toFixed(1)} weeks`);
  console.log(`\n${name} (${N} players, up to ${DAYS} climbing days)`);
  console.log(`  climbing day (median): playful ${med(at.spark)}, sweet on each other ${med(at.sweet)}, sunset ready ${med(at.ready)}, together ${med(at.together)} (${at.together.filter(x => x != null).length}/${N})`);
  console.log(`  calendar: sweet ${wk(cal.sweet)}, ready ${wk(cal.ready)}, together ${wk(cal.together)}`);
}
