// Balance check for Granite Hollow (Phase 3, Stage 0a). Simulated climbers play
// under the game's real rules (site/game/mechanics.js), in a crag that develops
// around them (world.js) and that they find as they go (knowledge.js): they only
// climb lines they can see, as in the game. We report how their progression
// compares with the Phase 3 targets (docs/phase3/stage0-design.md, section 2c).
//
//   node scripts/balance_game.js                    four playstyles, 40 climbers each
//   node scripts/balance_game.js --n 100 --style steady,projector
//   node scripts/balance_game.js --days 250         climbing days per climber (default 200)
//   node scripts/balance_game.js --rules path/to/mechanics.js   candidate rules (same API)
//   node scripts/balance_game.js --open             every line climbable from day one, no discovery
//   node scripts/balance_game.js --json out.json    also write the numbers
//
// Playstyles: steady (climbs at their level), projector (works one hard line at a
// time, resting between burns), mileage (lots of easier problems), explorer (finds
// new areas and goes after first ascents). Builds: average, tall and short, each
// with two random strengths and a weakness. Everyone climbs two days and rests one,
// and skips days rained out.
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); if (i < 0) return d; const v = args[i + 1]; return v != null && !v.startsWith("--") ? v : true; };
const GAME = path.join(__dirname, "..", "site", "game");
const Mech = global.Mech = require(path.resolve(opt("rules", path.join(GAME, "mechanics.js"))));
const World = global.World = require(path.join(GAME, "world.js"));
const Know = require(path.join(GAME, "knowledge.js"));
const D = JSON.parse(fs.readFileSync(path.join(GAME, "game-data.json"), "utf8"));
// --set '{"levelGrowth":1.3}' tries other numbers in the rules' BAL.
if (opt("set", null)) Object.assign(Mech.BAL, JSON.parse(opt("set")));
// The same questions of the old rules (no proof, no grade-aware chance) or the new.
const levelOf = pl => (Mech.levelOf ? Mech.levelOf(pl) : Mech.levelInfo(pl.xp));
const abilityOf = pl => (Mech.levelOf ? Mech.ability(pl) : Mech.ability(pl.xp));
const chanceOf = (pl, pr, st, w) => (Mech.chanceOf ? Mech.chanceOf(pl, pr, st, w) : Mech.sendChance(Mech.margin(pl, pr, st, w)));
const addSkills = (pl, gains) => { if (Mech.applySkills) Mech.applySkills(pl, gains); else for (const [t, g] of Object.entries(gains)) pl.skills[t] += g; };

const N = +opt("n", 40), DAYS = +opt("days", 200), OPEN = !!opt("open", false);
const START = "2025-09-06", START_AREA = "The Tailgate", MAX_CAL = 700;
const STYLE_NAMES = String(opt("style", "steady,projector,mileage,explorer")).split(",");
const CHECKS = [15, 30, 55, 100, 180];
const LEVELS = [3, 5, 7, 9, 11, 13];
// The agreed pace (docs/phase3/stage0-design.md, 2c): climbing day for each level.
const TARGET_DAY = { 3: 6, 5: 15, 7: 30, 9: 55, 11: 100, 13: 180 };
const BUILDS = { average: [170, 2], tall: [188, 6], short: [155, -1] };

function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const sectorOf = p => D.boulders[D.problems[p].b].sector;
const walkOf = Object.fromEntries(D.sectors.map(s => [s.name, s.walk_min]));
const bouldersIn = {};
D.boulders.forEach((b, i) => (bouldersIn[b.sector] = bouldersIn[b.sector] || []).push(i));
// XP needed to reach a level, for whatever rules are loaded.
function xpForLevel(L) {
  let lo = 0, hi = 1e9;
  if (Mech.levelInfo(hi).level < L) return Infinity;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (Mech.levelInfo(mid).level >= L) hi = mid; else lo = mid; }
  return hi;
}
const XP13 = xpForLevel(13);

// ---- playstyles ---------------------------------------------------------------
// score(c, p): how much the climber wants to try p now (0 or less: not now).
// c has the player, the problem state, today's chance and XP, and the day.
const STYLES = {
  steady: {                       // climbs around their level, best expected XP
    inspect: 3, areaEvery: 5, triesPerDay: 6,
    // Outside that band only when there's nothing better: easy mileage, or harder lines that might go.
    score: c => (c.d >= -2 && c.d <= 1 ? c.ch * c.xp * (c.st.att ? 1.2 : 1) : c.ch >= 0.05 ? 0.02 * c.ch * c.xp : 0),
  },
  mileage: {                      // lots of problems they'll probably send
    inspect: 3, areaEvery: 5, triesPerDay: 3,
    score: c => (c.ch >= 0.5 && c.d <= -1 ? c.ch * (1 + 0.1 * c.grade) : c.ch >= 0.05 ? 0.1 * c.ch : 0),
  },
  explorer: {                     // new areas, every boulder looked over, first ascents
    inspect: 99, areaEvery: 2, triesPerDay: 5,
    score: c => (c.d >= -3 && c.d <= 1 ? c.ch * c.xp * (c.open ? 1.8 : 1) * (c.st.att ? 1.2 : 1) : c.ch >= 0.05 ? 0.02 * c.ch * c.xp : 0),
  },
  projector: {                    // one project at a time (one or two grades up), rest between burns
    inspect: 3, areaEvery: 5, triesPerDay: 10, project: true,
    score: c => {
      if (c.p === c.day.project) return c.day.warm >= 2 ? 1e6 : 0;
      // Warm-ups before the project, mileage after it.
      return c.ch >= 0.6 && c.d <= -1 ? c.ch * c.xp : c.ch >= 0.3 ? 0.1 * c.ch * c.xp : 0;
    },
    rest: (c, p) => p === c.day.project && c.pl.energy < 50 && c.pl.energy + 6 <= c.day.startEnergy && (c.day.rests || 0) < 6,
  },
};

// ---- one climber -----------------------------------------------------------------
function newPlayer(rng, build) {
  const skills = Object.fromEntries(Mech.PREF.map(t => [t, 0]));
  const picks = [...Mech.PREF].map(t => [rng(), t]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const strengths = picks.slice(0, 2), weakness = picks[2];
  for (const t of strengths) skills[t] = 0.6;
  skills[weakness] = -0.5;
  const [height, ape] = BUILDS[build];
  if (Mech.convertSkills) { for (const t of strengths) skills[t] = 0.4; skills[weakness] = -0.4; }
  return { name: "Sim", height, ape, strengths, weakness, xp: 0, tops: [], skills, energy: 100, skin: 100, consecutive: 0 };
}

function play(styleName, seed, build) {
  const S = STYLES[styleName], rng = mulberry(seed);
  const g = { v: 2, rules: 2, id: "sim" + seed, date: START, dayNo: 0, bestGrade: -1,
    player: newPlayer(rng, build), ps: {}, ticks: [], tips: [], todo: [], visited: [], loc: {} };
  g.world = World.create(D, "sim-" + seed);
  g.know = World.initialKnow(D, START);
  const K = Know.make(D, () => g), pl = g.player;
  K.visitArea(START_AREA);
  if (OPEN) for (const s of D.sectors) g.know.areas[s.name] = 2;
  const out = { style: styleName, build, levelDay: {}, checks: {}, attempts: [], sends: [], fa2025: null, faEnd: null, climbDays: 0, outOfLines: 0 };
  const daysOn = {};                    // problem -> set of climbing days it was tried
  let rest = 0, climbDays = 0, project = null, projectSince = 0;

  const knownAreas = () => D.sectors.map(s => s.name).filter(s => K.area(s) >= 1);
  const open = p => !g.world.est[p];
  const avail = s => {
    const out = [];
    for (const b of bouldersIn[s]) for (const p of D.boulders[b].problems) {
      if (g.ps[p] && g.ps[p].sent) continue;
      if (OPEN || K.visible(p)) out.push(p);
    }
    return out;
  };
  const unlooked = s => bouldersIn[s].filter(b => !(g.know.looked || {})[b] || K.spottable(b).length).length;
  const stOf = p => g.ps[p] || { att: 0, beta: 0, sent: false };
  function cand(p, day) {
    const pr = D.problems[p], st = stOf(p), L = levelOf(pl).level;
    const ch = chanceOf(pl, pr, g.ps[p], day.w);
    const xp = Mech.sendXp(pl, pr, { first: true, flash: !st.att, newMax: pr.grade > g.bestGrade, sessions: (daysOn[p] ? daysOn[p].size : 0) + 1 });
    return { p, pr, st, ch, xp, d: pr.grade - L, grade: pr.grade, open: open(p), day, pl };
  }
  function bestIn(s, day) {
    let best = null, bv = 0;
    for (const p of avail(s)) {
      if ((day.tried[p] || 0) >= (p === day.project ? 99 : S.triesPerDay)) continue;
      // With nothing better left, anyone will project a line that might go one day.
      const c = cand(p, day), v = S.score(c) || (c.ch >= 0.003 ? 1e-6 * c.ch : 0);
      if (v > bv) { bv = v; best = p; }
    }
    return { p: best, v: bv };
  }
  function inspectArea(s, day) {
    if (OPEN) return;
    const looked = g.know.looked || {};
    const order = bouldersIn[s].filter(b => !looked[b] || K.spottable(b).length).slice(0, S.inspect);
    for (const b of order) { K.inspect(b, g.date); day.minute += 5; }
  }
  // Pick a project: a line one or two grades up with the best chance of a worthwhile send.
  function pickProject(day) {
    const L = levelOf(pl).level;
    let best = null;
    for (const s of knownAreas()) for (const p of avail(s)) {
      const c = cand(p, day), fresh = chanceOf({ ...pl, energy: 100, skin: 100 }, c.pr, g.ps[p], { cond: 0 });
      if (c.d < 1 || c.d > 2 || fresh < 0.02) continue;
      const v = fresh * c.xp;                     // the best chance at a worthwhile send
      if (!best || v > best.v) best = { p, v };
    }
    return best ? best.p : null;
  }
  function attempt(p, day) {
    const pr = D.problems[p], st = g.ps[p] = g.ps[p] || { att: 0, beta: 0, sent: false, best: 0, sends: 0 };
    const info = levelOf(pl), d = pr.grade - info.level;
    const cost = Mech.attemptCost(pl, pr), r = Mech.attempt(pl, pr, st, day.w, rng);
    pl.energy = Math.max(0, pl.energy - cost.energy); pl.skin = Math.max(0, pl.skin - cost.skin);
    day.minute += Math.round(cost.minutes);
    st.att++; day.tried[p] = (day.tried[p] || 0) + 1;
    (daysOn[p] = daysOn[p] || new Set()).add(climbDays);
    addSkills(pl, Mech.skillGains(pl, pr, r.sent));
    let xp = 0;
    if (r.sent) {
      const flash = st.att === 1, newMax = pr.grade > g.bestGrade, wasOpen = open(p);
      World.recordSend(D, g, p, g.date, flash);
      xp = Mech.sendXp(pl, pr, { first: true, flash, tip: false, newMax, sessions: daysOn[p].size });
      pl.xp += xp; pl.tops[pr.grade] = (pl.tops[pr.grade] || 0) + 1;
      st.sent = true; st.sends = 1; st.best = 1; st.flash = flash; st.sentOn = g.date;
      g.bestGrade = Math.max(g.bestGrade, pr.grade);
      g.ticks.push({ p, date: g.date, day: climbDays, style: flash ? "Flash" : "Send", att: st.att, stars: null });
      out.sends.push({ d, grade: pr.grade, level: info.level, att: st.att, days: daysOn[p].size, fa: wasOpen, xp, parts: r.parts });
      if (p === project) project = null;
    } else {
      st.beta = Math.min(Mech.BETA_MAX, st.beta + Mech.betaGain(st.beta, day.tried[p]));
      st.best = Math.max(st.best || 0, r.progress);
    }
    if (pl.skin < 30 && Mech.frictionSensitivity(pr) >= 0.6 && rng() < 0.07) { pl.skin = Math.max(0, pl.skin - 12); pl.energy = Math.max(0, pl.energy - 8); }
    out.attempts.push([d, r.sent ? 1 : 0, Math.round(cost.minutes), xp]);
    const L = levelOf(pl).level;
    for (let m = 1; m <= L; m++) if (out.levelDay[m] == null) out.levelDay[m] = climbDays;
  }

  for (let cal = 0; cal < MAX_CAL && climbDays < DAYS; cal++) {
    if (cal) g.date = World.addDays(g.date, 1);
    const w = Mech.weather(+g.date.slice(5, 7) - 1, rng), wet = cal > 0 && Mech.rainStart(w) === 0;
    World.step(D, g, g.date, { today: { date: g.date, wet } });
    if (g.date >= "2025-12-31" && out.fa2025 == null) out.fa2025 = faShare(g);
    if (wet || (pl.consecutive >= 2 && rest === 0)) { rest++; continue; }
    Object.assign(pl, Mech.startOfDay(pl, rest)); rest = 0;
    climbDays++; g.dayNo = climbDays;
    const day = { w, minute: 9 * 60 + Math.floor(rng() * 40), end: Mech.dayEnds(w), tried: {}, startEnergy: pl.energy, warm: 0, project: null };

    // Hearing of, or finding, a new area now and then.
    if (S.areaEvery && climbDays % S.areaEvery === 0) {
      const nx = D.sectors.filter(s => K.area(s.name) < 1).sort((a, b) => a.walk_min - b.walk_min)[0];
      if (nx) g.know.areas[nx.name] = 1;
    }
    if (S.project) {
      if (project == null || climbDays - projectSince > 12) { project = pickProject(day); projectSince = climbDays; }
      day.project = project;
    }
    // Where to go: the project's area, else the area with the most to want (explorers
    // also go where there are boulders they haven't looked over).
    const areaValue = s => {
      if (day.project != null && sectorOf(day.project) === s) return 1e9;
      let v = 0; const scores = avail(s).map(p => S.score(cand(p, day))).sort((a, b) => b - a).slice(0, 4);
      for (const x of scores) v += Math.max(0, x);
      // Boulders not yet looked over (or worth another look) draw explorers, and
      // draw everyone once there's nothing much left to try.
      if (!OPEN) v += (S.inspect > 3 ? 50 : 1) * unlooked(s);
      return v - 0.5 * walkOf[s];
    };
    let here = knownAreas().sort((a, b) => areaValue(b) - areaValue(a))[0];
    day.minute += walkOf[here];
    K.visitArea(here); inspectArea(here, day);
    let moves = 0;
    while (pl.energy > 12 && pl.skin > 5 && day.minute < day.end - walkOf[here]) {
      const { p } = bestIn(here, day);
      if (p == null) {
        if (moves >= 3) break;
        const nx = knownAreas().filter(s => s !== here).map(s => [s, bestIn(s, day).v + (OPEN ? 0 : 0.01 * unlooked(s))]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
        if (!nx) { out.outOfLines++; break; }
        day.minute += Math.max(5, Math.abs(walkOf[nx[0]] - walkOf[here])); here = nx[0]; moves++;
        K.visitArea(here); inspectArea(here, day); continue;
      }
      // Resting: projectors before burns on the project; everyone when tired with daylight to spare.
      const tired = pl.energy < 30 && day.minute < day.end - walkOf[here] - 120 && (day.rests || 0) < 4;
      if ((S.rest && S.rest({ pl, day }, p)) || tired) {
        const gain = Mech.restGain ? Mech.restGain(day.rests || 0) : 12;
        day.minute += 20; pl.energy = Math.min(day.startEnergy, pl.energy + gain); day.rests = (day.rests || 0) + 1; continue;
      }
      attempt(p, day);
      if (D.problems[p].grade <= levelOf(pl).level - 1) day.warm++;
    }
    if (CHECKS.includes(climbDays)) out.checks[climbDays] = checkpoint(g, pl);
  }
  out.climbDays = climbDays;
  out.faEnd = faShare(g);
  out.endLevel = levelOf(pl).level; out.endBest = g.bestGrade;
  return out;
}
function faShare(g) {
  const e = Object.values(g.world.est).filter(x => !x.old);
  return e.length ? e.filter(x => x.by === "you").length / e.length : 0;
}
function checkpoint(g, pl) {
  const info = levelOf(pl);
  let potential = 0, unsent = 0;
  D.problems.forEach((p, i) => { if (!(g.ps[i] && g.ps[i].sent)) { unsent++; potential += Mech.sendXp(pl, p, { first: true }); } });
  const sk = Mech.PREF.map(t => pl.skills[t]);
  return { level: info.level, ability: abilityOf(pl), best: g.bestGrade, gap: g.bestGrade - info.level, gated: !!info.gated,
    meanSkill: sk.reduce((a, b) => a + b, 0) / sk.length, styleWorth: 0.7 * sk.reduce((a, b) => a + b, 0) / sk.length, topSkill: Math.max(...sk),
    unsent, headroom: Math.max(0, XP13 - pl.xp) > 0 ? potential / (XP13 - pl.xp) : Infinity };
}

// ---- statistics ---------------------------------------------------------------------
const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const med = a => q(a, 0.5);
const fx = (v, n = 1) => (v == null ? "–" : v === Infinity ? "∞" : typeof v === "number" ? (Number.isInteger(v) && n <= 1 ? String(v) : v.toFixed(n)) : String(v));
const pct = v => (v == null || isNaN(v) ? "–" : Math.round(v * 100) + "%");
const pad = (s, n) => String(s).padStart(n);
const dKey = d => Math.max(-4, Math.min(4, d));
const dLabel = d => (d <= -4 ? "≤−4" : d >= 4 ? "≥+4" : d > 0 ? "+" + d : d < 0 ? "−" + -d : "0");
const band = L => (L <= 4 ? "V0–4" : L <= 8 ? "V5–8" : "V9+");

function report(name, runs) {
  const L = [];
  const say = s => L.push(s);
  say(`\n=== ${name}: ${runs.length} climbers, ${med(runs.map(r => r.climbDays))} climbing days each ===`);
  say("\nLevel pace (climbing day a level is reached)");
  say("  level  target   median   10–90%      reached");
  for (const m of LEVELS) {
    const ds = runs.map(r => r.levelDay[m]).filter(v => v != null);
    say(`  V${String(m).padEnd(5)}${pad(TARGET_DAY[m], 6)}${pad(fx(med(ds)), 9)}${pad(ds.length ? `${q(ds, 0.1)}–${q(ds, 0.9)}` : "–", 11)}${pad(pct(ds.length / runs.length), 11)}`);
  }
  say("\nLevel against hardest send (target: hardest send usually 1 above, sometimes 2, never 4)");
  say("  day   level   hardest   gap   gap≥3   held back   skills: avg × 0.7 / best   XP headroom to V13");
  for (const c of CHECKS) {
    const cs = runs.map(r => r.checks[c]).filter(Boolean);
    if (!cs.length) continue;
    say(`  ${pad(c, 3)}${pad(fx(med(cs.map(x => x.level))), 8)}${pad("V" + fx(med(cs.map(x => x.best))), 10)}${pad(fx(med(cs.map(x => x.gap))), 6)}${pad(pct(cs.filter(x => x.gap >= 3).length / cs.length), 8)}` +
      `${pad(pct(cs.filter(x => x.gated).length / cs.length), 12)}${pad(`${fx(med(cs.map(x => x.styleWorth)), 2)} / ${fx(med(cs.map(x => x.topSkill)), 2)}`, 26)}${pad(fx(med(cs.map(x => x.headroom)), 2) + "×", 21)}`);
  }
  say("  (held back: XP enough for the next level, waiting for proof sends. skills: the average skill × 0.7, a bonus on nearly every problem, and the best skill.");
  say("   XP headroom: XP from sending every unsent problem now ÷ XP still needed for V13; under 1 means V13 is out of reach.)");

  // Attempts and sends by grade relative to your level when you tried.
  const att = {}, snd = {};
  for (const r of runs) {
    for (const [d, s, min, xp] of r.attempts) { const k = dKey(d); const a = att[k] = att[k] || { n: 0, s: 0, min: 0, xp: 0 }; a.n++; a.s += s; a.min += min; a.xp += xp; }
    for (const s of r.sends) (snd[dKey(s.d)] = snd[dKey(s.d)] || []).push(s);
  }
  const totalSends = runs.reduce((a, r) => a + r.sends.length, 0);
  say("\nBy grade relative to your level (all climbers pooled)");
  say("  rel.   tries   send/try   sends   share   flashed   median tries   90% tries   XP per hour");
  for (let k = -4; k <= 4; k++) {
    const a = att[k], ss = snd[k] || [];
    if (!a) continue;
    say(`  ${pad(dLabel(k), 4)}${pad(a.n, 8)}${pad(pct(a.s / a.n), 11)}${pad(ss.length, 8)}${pad(pct(ss.length / totalSends), 8)}${pad(pct(ss.filter(s => s.att === 1).length / (ss.length || 1)), 10)}` +
      `${pad(fx(med(ss.map(s => s.att))), 15)}${pad(fx(q(ss.map(s => s.att), 0.9)), 12)}${pad(fx(a.xp / a.min * 60, 0), 14)}`);
  }
  say("  Targets: 3+ below ≤95% a try; at your level 1–4 tries; 1 above a session (low grades) to 2–4 days (V12–13);");
  say("  2 above rare (~10% a try at best); 3+ above almost never. XP an hour should not reward falling on lines far above you.");

  say("\nDays to send a project (sends that took more than one try): median days (sends)");
  say("  rel.     V0–4          V5–8          V9+");
  for (const k of [0, 1, 2, 3, 4]) {
    const ss = (snd[k] || []).filter(s => s.att > 1);
    if (!ss.length) continue;
    const cell = b => { const x = ss.filter(s => band(s.level) === b); return x.length ? `${fx(med(x.map(s => s.days)))} (${x.length})` : "–"; };
    say(`  ${pad(dLabel(k), 4)}${pad(cell("V0–4"), 11)}${pad(cell("V5–8"), 14)}${pad(cell("V9+"), 13)}`);
  }

  const far = runs.flatMap(r => r.sends.filter(s => s.d >= 2));
  if (far.length) {
    const m = k => fx(med(far.map(s => s.parts[k])), 2);
    say(`\nWhat lifted sends 2+ grades above your level (${far.length} sends, medians, in grades):`);
    say(`  style ${m("style")}, reach ${m("morph")}, beta ${m("beta")}, conditions ${m("conditions")}, fatigue ${m("fatigue")}`);
  }
  const fa25 = runs.map(r => r.fa2025).filter(v => v != null);
  say(`\nYour share of first ascents: ${pct(med(fa25))} by the end of 2025 (target about 30% for a keen player), ${pct(med(runs.map(r => r.faEnd)))} at the end.`);
  say(`At the end: median level V${fx(med(runs.map(r => r.endLevel)))}, hardest send V${fx(med(runs.map(r => r.endBest)))}, ` +
    `${fx(med(runs.map(r => r.sends.length)))} sends, ${pct(med(runs.map(r => r.sends.length / Math.max(1, r.attempts.length))))} of tries sent, ` +
    `days with nothing left to try: ${fx(med(runs.map(r => r.outOfLines)))}.`);
  const builds = Object.keys(BUILDS).map(b => {
    const rs = runs.filter(r => r.build === b), c = rs.map(r => r.checks[100]).filter(Boolean);
    return `${b} V${fx(med(c.map(x => x.level)))} (hardest V${fx(med(c.map(x => x.best)))})`;
  });
  say(`Level at day 100 by build: ${builds.join(", ")}.`);
  return L.join("\n");
}

// ---- run ----------------------------------------------------------------------------
const t0 = Date.now(), all = {};
console.log(`Granite Hollow balance: ${N} climbers per playstyle, up to ${DAYS} climbing days, rules ${path.relative(process.cwd(), path.resolve(opt("rules", path.join(GAME, "mechanics.js"))))}` +
  `${OPEN ? ", every line open from day one" : ", lines found as you go"}.`);
for (const name of STYLE_NAMES) {
  if (!STYLES[name]) { console.error("unknown playstyle: " + name); process.exit(1); }
  const builds = Object.keys(BUILDS);
  all[name] = Array.from({ length: N }, (_, i) => play(name, 1000 + i, builds[i % builds.length]));
  console.log(report(name, all[name]));
}
// --rates: for tuning the level costs, the median days spent at each level.
if (opt("rates", false)) {
  const rs = Object.values(all).flat();
  console.log("\nDays at each level (median over every climber), for tuning BAL.levelCosts:");
  for (let L = 0; L < 14; L++) {
    const ds = rs.map(r => (r.levelDay[L + 1] != null ? r.levelDay[L + 1] - (L ? r.levelDay[L] ?? 0 : 0) : null)).filter(v => v != null);
    console.log(`  V${L}→V${L + 1}: ${fx(med(ds))} days (${ds.length} climbers), cost ${Math.round(Mech.levelCost ? Mech.levelCost(L) : 0)}`);
  }
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
if (opt("json", null)) {
  const slim = Object.fromEntries(Object.entries(all).map(([k, rs]) => [k, rs.map(r => ({ ...r, attempts: undefined, sends: r.sends.map(s => ({ ...s, parts: undefined })) }))]));
  fs.writeFileSync(opt("json"), JSON.stringify(slim));
}
