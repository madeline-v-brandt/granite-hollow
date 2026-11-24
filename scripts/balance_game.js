// Balance check for the Granite Hollow game: simulated players climb under the
// game's real rules (site/game/mechanics.js) and we report how many in-game
// climbing days it takes to reach each grade.
//
//   node scripts/balance_game.js [n_players]
const fs = require("fs");
const path = require("path");
const Mech = require(path.join(__dirname, "..", "site", "game", "mechanics.js"));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "game", "game-data.json"), "utf8"));

const N = +process.argv[2] || 200;
const MILESTONES = [1, 3, 5, 7, 9, 11];
const bySector = {};
data.problems.forEach((p, i) => {
  const s = data.boulders[p.b].sector;
  (bySector[s] = bySector[s] || []).push(i);
});
const sectors = Object.keys(bySector);

function newPlayer(rng) {
  const skills = Object.fromEntries(Mech.PREF.map(t => [t, 0]));
  const picks = [...Mech.PREF].sort(() => rng() - 0.5);
  skills[picks[0]] = 0.6; skills[picks[1]] = 0.6; skills[picks[2]] = -0.5;
  return { xp: 0, skills, height: 150 + rng() * 45, ape: (rng() - 0.3) * 10, energy: 100, skin: 100, consecutive: 0 };
}

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function play(seed, maxDays = 400) {
  const rng = mulberry(seed);
  const pl = newPlayer(rng);
  const ps = {};               // problem state
  const reached = {};          // milestone -> climbing day
  const abilityAt = {};        // milestone -> ability when it happened
  let month = 8, dayOfMonth = 0, climbDays = 0, rest = 0, maxSent = -1, attempts = 0, sends = 0;
  for (let day = 0; day < maxDays; day++) {
    dayOfMonth++; if (dayOfMonth > 30) { dayOfMonth = 1; month = (month + 1) % 12; }
    const w = Mech.weather(month, rng);
    // Typical schedule: climb two days, rest one; skip wet days.
    if (Mech.rainStart(w) === 0 || (pl.consecutive >= 2 && rest === 0)) { rest++; continue; }
    const s = Mech.startOfDay(pl, rest); rest = 0;
    Object.assign(pl, s); climbDays++;
    let minute = 9 * 60 + 30;
    let sector = sectors[Math.floor(rng() * sectors.length)];
    const triedToday = {};
    while (pl.energy > 12 && pl.skin > 5 && minute < Mech.dayEnds(w)) {
      if (rng() < 0.08) sector = sectors[Math.floor(rng() * sectors.length)];
      // Pick the problem with the best expected XP, preferring open projects.
      let best = null, bestV = -1;
      for (const i of bySector[sector]) {
        const p = data.problems[i], st = ps[i];
        if (st && st.sent) continue;
        if ((triedToday[i] || 0) >= 5) continue;
        const ch = Mech.sendChance(Mech.margin(pl, p, st, w));
        const v = ch * Mech.sendXp(pl, p, { first: true }) * (st ? 1.3 : 1) * (0.7 + 0.6 * rng());
        if (v > bestV) { bestV = v; best = i; }
      }
      if (best == null) { sector = sectors[Math.floor(rng() * sectors.length)]; minute += 10; continue; }
      const p = data.problems[best];
      const st = ps[best] = ps[best] || { att: 0, beta: 0, sent: false };
      const r = Mech.attempt(pl, p, st, w, rng);
      const cost = Mech.attemptCost(pl, p);
      pl.energy -= cost.energy; pl.skin -= cost.skin; minute += cost.minutes;
      st.att++; attempts++; triedToday[best] = (triedToday[best] || 0) + 1;
      for (const [t, g] of Object.entries(Mech.skillGains(pl, p, r.sent))) pl.skills[t] += g;
      if (r.sent) {
        st.sent = true; sends++;
        pl.xp += Mech.sendXp(pl, p, { first: true, flash: st.att === 1, newMax: p.grade > maxSent });
        maxSent = Math.max(maxSent, p.grade);
      } else st.beta += Mech.betaGain(st.beta);
      for (const m of MILESTONES) if (maxSent >= m && reached[m] == null) { reached[m] = climbDays; abilityAt[m] = Mech.ability(pl.xp); }
    }
  }
  return { reached, abilityAt, climbDays, maxSent, attempts, sends, ability: Mech.ability(pl.xp) };
}

const runs = Array.from({ length: N }, (_, i) => play(1000 + i));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`${N} simulated players, 400 calendar days each (climb 2 / rest 1, skip wet days)\n`);
console.log("first send of   median climbing day   ability then   players who got there");
for (const m of MILESTONES) {
  const got = runs.map(r => r.reached[m]).filter(v => v != null);
  const ab = runs.map(r => r.abilityAt[m]).filter(v => v != null);
  console.log(`  V${String(m).padEnd(13)}${String(got.length ? median(got) : "-").padStart(10)}${(ab.length ? median(ab).toFixed(1) : "-").padStart(15)}${String(got.length).padStart(22)}`);
}
console.log(`\nafter ~${median(runs.map(r => r.climbDays))} climbing days: median max grade V${median(runs.map(r => r.maxSent))}, ` +
  `median ability ${median(runs.map(r => r.ability)).toFixed(1)}, ` +
  `median sends ${median(runs.map(r => r.sends))}, send rate ${(median(runs.map(r => r.sends / r.attempts)) * 100).toFixed(0)}% of attempts`);
