// Granite Hollow: the rules of climbing. Pure functions, no DOM, so they can be
// balance-tested outside the browser (see scripts/balance_game.js).
//
// The model (Phase 3 balance, docs/phase3/stage0-design.md section 2): your LEVEL
// is the only thing that grows without limit. It comes from XP, and moving up
// also needs proof: a few sends at your level or harder. Every attempt compares
// your ability (level + progress) with the grade, adjusted by how the problem
// suits you: your style skills (relative: how a style compares with the rest of
// your climbing, −1 to +1), your reach, the beta you've worked out and today's
// conditions. Those good things share one soft ceiling, so together they can make
// a climb two grades up possible but never three; bad things (fatigue, thin skin,
// greasy rock, a weakness) aren't capped. The margin sets the send chance, on a
// curve that gets steeper at hard grades. A first send earns XP for its grade,
// more when it's above your level and less below it, with bonuses for flashes,
// locals' tips, new hardest sends and the sessions a project took. Falling
// earns no XP. Every number below is in BAL, so the simulator can try others.
(function (root) {
  const PREF = ["crimpy", "slopey", "pinchy", "juggy", "compression", "dyno", "technical",
    "powerful", "mantle", "slab", "overhang", "roof", "traverse", "eliminate", "highball"];
  const BAL = {
    // ---- XP and levels
    xpBase: 10, xpPerGrade: 1.4,      // a first send at your level is worth about xpBase × xpPerGrade^grade
    // XP from level n to n+1, fitted with the simulator to the agreed pace (V3 by about
    // climbing day 6, V5 15, V7 30, V9 55, V11 100, V13 180); past the table, ×levelGrowth.
    // The park holds about 113,000 XP sent near your level; V13 needs 85,000.
    levelCosts: [70, 140, 220, 600, 900, 1800, 2600, 4800, 6300, 9000, 12500, 19000, 27000, 36000],
    levelGrowth: 1.42,
    levelMax: 16,
    proof: 3,                         // first sends at your level or harder that moving up needs
    above: 0.8, aboveMax: 2,          // XP × (1 + above × grades above you), up to aboveMax grades
    below: 0.5, belowMin: 0.25,       // XP × (1 − below × grades below you), never under belowMin
    flash: 1.3, tip: 1.2, newMax: 1.25,
    session: 0.1, sessionMax: 0.5,    // a project's send: +10% for each extra session, up to +50%
    repeat: 0.1,                      // a repeat is worth a tenth of a first send (the game caps them per day)
    // ---- the send chance
    lift: 0.6,                        // margin = ability + lift + adjustments − grade
    slope: 2.0, shift: 1.7,           // chance = sigmoid(slope × margin − shift) …
    topFrom: 4, slopeTop: 0.06, shiftTop: 0.3,   // … both growing above V4, so hard grades are steeper
    cap: 0.95, floor: 0.002,          // nothing is certain, nothing quite impossible
    ceiling: 1.3,                     // the good adjustments together approach this many grades, never pass it
    styleWorth: 0.7, morphMax: 0.6,
    // ---- learning
    skillSend: 0.05, skillFail: 0.003,
    betaMax: 0.7, betaPerTry: 0.08, betaDay: 0.7,   // each try teaches less than the last, the same day
    // ---- resting
    rest: 12, restDay: 0.7,           // a 20-minute rest gives back 12 energy, and less each time the same day
  };
  const BETA_MAX = BAL.betaMax;
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const tagsOf = p => p.tags.split("|").filter(Boolean);

  // ---- level & XP -----------------------------------------------------------
  const levelCost = n => { const t = BAL.levelCosts; return n < t.length ? t[n] : t[t.length - 1] * Math.pow(BAL.levelGrowth, n - t.length + 1); };
  // The highest level your sends prove: level n + 1 needs BAL.proof first sends of
  // grade n or harder. tops[g] counts your first sends at grade g.
  function proofCap(tops) {
    if (!tops) return BAL.levelMax;
    let n = 0;
    for (let g = BAL.levelMax; g >= 0; g--) { n += tops[g] || 0; if (n >= BAL.proof) return Math.min(BAL.levelMax, g + 1); }
    return 0;
  }
  // Your level from XP, held back by proof when tops is given. A held-back level
  // shows a full bar (gated: true) and its extra XP waits for the proof.
  function levelInfo(xp, tops) {
    let level = 0, need = levelCost(0), rest = xp;
    while (rest >= need && level < BAL.levelMax) { rest -= need; level++; need = levelCost(level); }
    const cap = proofCap(tops);
    if (level > cap)
      return { level: cap, into: levelCost(cap), need: levelCost(cap), frac: 0.999, gated: true, proofGrade: cap, xpLevel: level };
    return { level, into: rest, need, frac: rest / need, gated: false };
  }
  const levelOf = player => levelInfo(player.xp, player.tops);
  // First sends still needed at your level or harder before you can move up.
  function proofLeft(player) {
    const L = levelOf(player).level, tops = player.tops || [];
    let n = 0; for (let g = L; g <= BAL.levelMax; g++) n += tops[g] || 0;
    return Math.max(0, BAL.proof - n);
  }
  // Ability: level plus progress through it, from a player (or, for old callers, bare XP).
  const ability = x => { const l = typeof x === "number" ? levelInfo(x) : levelOf(x); return l.level + l.frac; };
  // A first send's worth at a grade, before what it means for you.
  const baseXp = g => BAL.xpBase * Math.pow(BAL.xpPerGrade, g);
  const relFactor = d => (d >= 0 ? 1 + BAL.above * Math.min(d, BAL.aboveMax) : Math.max(BAL.belowMin, 1 + BAL.below * d));

  // ---- what makes a problem easier or harder for you --------------------------
  function styleBonus(player, p) {
    const ts = tagsOf(p).filter(t => PREF.includes(t));
    if (!ts.length) return 0;
    return BAL.styleWorth * ts.reduce((s, t) => s + clamp(player.skills[t] || 0, -1, 1), 0) / ts.length;
  }
  function reachDependence(p) {
    const ts = tagsOf(p);
    return (ts.includes("reachy") ? 0.8 : 0) - (ts.includes("bunchy") ? 0.8 : 0)
      + (ts.includes("dyno") ? 0.25 : 0) - (ts.includes("compression") ? 0.15 : 0);
  }
  // + means your body suits it. 176 cm of reach is "average".
  const morph = (player, p) => clamp(reachDependence(p) * ((player.height + player.ape) - 176) / 10 * 0.6, -BAL.morphMax, BAL.morphMax);
  const SENS = { slopey: 1, slab: 1, technical: 0.7, crimpy: 0.6, mantle: 0.6, pinchy: 0.5, juggy: 0.2 };
  function frictionSensitivity(p) {
    const v = tagsOf(p).map(t => SENS[t] ?? 0.35);
    return v.length ? Math.max(...v) : 0.4;
  }

  // The parts of an attempt's margin, in grades; they add up to the margin. The
  // good adjustments (style, reach, beta, conditions, vibes) are scaled down
  // together so they approach BAL.ceiling and never pass it.
  function breakdown(player, p, ps, day) {
    const fric = frictionSensitivity(p);
    const parts = {
      ability: ability(player) + BAL.lift,
      style: styleBonus(player, p),
      morph: morph(player, p),
      beta: ps ? Math.min(BAL.betaMax, ps.beta || 0) : 0,
      conditions: day.cond * fric,
      vibes: day.vibes || 0,
      fatigue: -0.9 * Math.pow(1 - player.energy / 100, 1.5),
      skin: player.skin < 40 ? -(40 - player.skin) / 40 * (fric >= 0.6 ? 1.0 : 0.5) : 0,
      head: tagsOf(p).includes("highball") ? -0.3 : 0,
      grade: -p.grade,
    };
    const good = ["style", "morph", "beta", "conditions", "vibes"].filter(k => parts[k] > 0);
    const sum = good.reduce((s, k) => s + parts[k], 0);
    if (sum > 0) { const scale = BAL.ceiling * Math.tanh(sum / BAL.ceiling) / sum; for (const k of good) parts[k] *= scale; }
    return parts;
  }
  const margin = (player, p, ps, day) => Object.values(breakdown(player, p, ps, day)).reduce((a, b) => a + b, 0);
  // The send chance for a margin on a problem of this grade (steeper at hard grades).
  function sendChance(m, grade = 0) {
    const top = Math.max(0, grade - BAL.topFrom);
    const x = (BAL.slope + BAL.slopeTop * top) * m - (BAL.shift + BAL.shiftTop * top);
    return clamp(sigmoid(x), BAL.floor, BAL.cap);
  }
  const chanceOf = (player, p, ps, day) => sendChance(margin(player, p, ps, day), p.grade);

  // How it feels from the ground, in words climbers use.
  function feel(chance) {
    if (chance >= 0.6) return { key: "warmup", label: "Warm-up", bars: 1 };
    if (chance >= 0.3) return { key: "go", label: "Should go", bars: 2 };
    if (chance >= 0.1) return { key: "hard", label: "Hard", bars: 3 };
    if (chance >= 0.025) return { key: "project", label: "Project", bars: 4 };
    return { key: "nope", label: "Not yet", bars: 5 };
  }
  // Can you see a line as something you could climb? Judged for you fresh, in
  // average conditions and without beta, so it doesn't change with the weather
  // or how tired you are. Only "Not yet" lines stay hidden. It's judged on the
  // low grades' gentler curve, so the steepness of hard grades (a V13 feels
  // "Not yet" to most V12s before any work) doesn't hide the lines you'll project
  // there. What you've proved counts too: anything at least a grade below your
  // hardest send (best, a V-grade; -1 for none) is readable. (Phase 2 discovery.)
  function canSpot(player, p, best = -1) {
    if (typeof best === "number" && best >= 1 && p.grade <= best - 1) return true;
    const fresh = { ...player, energy: 100, skin: 100 };
    return feel(sendChance(margin(fresh, p, null, { cond: 0 }), 0)).key !== "nope";
  }

  // ---- costs & gains -------------------------------------------------------------
  function attemptCost(player, p) {
    const d = p.grade - ability(player);
    return {
      energy: 3 + 6 * sigmoid(1.3 * (d + 0.3)),
      skin: (frictionSensitivity(p) >= 0.6 ? 1.6 : 0.9) * (0.6 + 0.6 * sigmoid(d)),
      minutes: 6 + (d > -0.5 ? 4 : 0),
    };
  }
  // Energy back from a 20-minute rest, when you've already rested `before` times today.
  const restGain = (before = 0) => BAL.rest * Math.pow(BAL.restDay, Math.max(0, before));
  // Beta from a fall: less as you know more, and less with each try the same day
  // (today: tries on this problem today, counting this one), so a hard project
  // takes more than one session to learn.
  const betaGain = (beta, today = 1) => BAL.betaPerTry * Math.max(0, 1 - beta / BAL.betaMax) * Math.pow(BAL.betaDay, Math.max(0, today - 1));
  // XP for a send. first: your first send of it; flash: first try; tip: a local
  // told you the beta; newMax: your hardest yet; sessions: days you tried it.
  function sendXp(player, p, { first, flash, tip, newMax, sessions = 1 } = {}) {
    const d = p.grade - ability(player);
    let xp = baseXp(p.grade) * relFactor(d);
    if (!first) xp *= BAL.repeat;
    else xp *= (flash ? BAL.flash : 1) * (tip ? BAL.tip : 1) * (newMax ? BAL.newMax : 1) * (1 + Math.min(BAL.sessionMax, BAL.session * Math.max(0, sessions - 1)));
    return Math.max(1, Math.round(xp));
  }
  // Sending a style makes you better at it, most when the send was near your
  // limit and less as the skill nears +1. Failing teaches you a little. Skills
  // are relative, so applySkills takes what's gained from the rest: getting
  // better at crimps makes everything else a touch less of a strength.
  function skillGains(player, p, sent) {
    const d = p.grade - ability(player), out = {};
    for (const t of tagsOf(p)) {
      if (!PREF.includes(t)) continue;
      const s = clamp(player.skills[t] || 0, -1, 1);
      out[t] = (sent ? BAL.skillSend * clamp(Math.pow(1.6, d), 0.15, 2) : BAL.skillFail) * (1 - s) / 2;
    }
    return out;
  }
  function applySkills(player, gains) {
    const total = Object.values(gains).reduce((a, b) => a + b, 0);
    for (const t of PREF) player.skills[t] = clamp((player.skills[t] || 0) + (gains[t] || 0) - total / PREF.length, -1, 1);
    return player.skills;
  }

  // ---- converting a climber from the old balance (Phase 3, Stage 0b) ----------------
  // Old skills grew without limit; the new ones say how a style compares with the
  // rest of your climbing. Each becomes its distance from your average, squeezed
  // into −1..+1, so your best and worst styles stay your best and worst.
  function convertSkills(skills) {
    const vals = PREF.map(t => Number(skills[t]) || 0), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Object.fromEntries(PREF.map((t, i) => [t, Math.round(Math.tanh(vals[i] - mean) * 1000) / 1000]));
  }
  // Your XP and proof under the new rules, by replaying your logbook in order.
  // ticks: [{ p, date, style: "Flash" | "Send" | "Repeat" }]; grade(p) its grade;
  // sessions(p, date) the days you'd tried it when it went; tip(p) whether a local's
  // tip was used. Repeats count up to repeatsPerDay a day, as in the game.
  function replay(ticks, { grade, sessions = () => 1, tip = () => false, repeatsPerDay = 3 }) {
    const pl = { xp: 0, tops: [], skills: {} };
    const seen = new Set(), perDay = {};
    let best = -1;
    for (const t of ticks) {
      const g = grade(t.p), first = t.style !== "Repeat" && !seen.has(t.p);
      const p = { grade: g, tags: "" };
      if (!first) {
        perDay[t.date] = (perDay[t.date] || 0) + 1;
        if (perDay[t.date] <= repeatsPerDay) pl.xp += sendXp(pl, p, { first: false });
        continue;
      }
      seen.add(t.p);
      pl.xp += sendXp(pl, p, { first: true, flash: t.style === "Flash", tip: !!tip(t.p), newMax: g > best, sessions: sessions(t.p, t.date) });
      pl.tops[g] = (pl.tops[g] || 0) + 1;
      best = Math.max(best, g);
    }
    return { xp: pl.xp, tops: pl.tops };
  }
  // First sends by grade, from a logbook.
  function topsOf(ticks, grade) {
    const tops = [], seen = new Set();
    for (const t of ticks) if (t.style !== "Repeat" && !seen.has(t.p)) { seen.add(t.p); const g = grade(t.p); tops[g] = (tops[g] || 0) + 1; }
    return tops;
  }

  // ---- one attempt -----------------------------------------------------------
  function movesIn(p, seed) {
    const ts = tagsOf(p);
    return 4 + (seed % 5) + (ts.includes("traverse") ? 6 : 0) + (ts.includes("highball") ? 2 : 0);
  }
  function attempt(player, p, ps, day, rng = Math.random) {
    const parts = breakdown(player, p, ps, day);
    const m = Object.values(parts).reduce((a, b) => a + b, 0);
    const chance = sendChance(m, p.grade);
    const sent = rng() < chance;
    // How far you got if you fell: further when the problem is closer to your level.
    const noise = (rng() + rng() + rng() - 1.5) * 1.2;
    const progress = sent ? 1 : clamp(sigmoid(1.4 * (m + 1.2) + noise), 0.04, 0.97);
    // The crux is wherever you're weakest: lowest style skill, or bad reach.
    let crux = null, worst = Infinity;
    for (const t of tagsOf(p)) {
      let v;
      if (t === "reachy" || t === "bunchy") v = morph(player, p) * 1.5;
      else if (PREF.includes(t)) v = player.skills[t] || 0;
      else continue;
      v += rng() * 0.4;
      if (v < worst) { worst = v; crux = t; }
    }
    return { sent, chance, margin: m, parts, progress, crux };
  }

  // ---- days, weather, conditions -------------------------------------------------
  const TEMP_F = [31, 33, 41, 51, 61, 70, 76, 75, 67, 56, 46, 36];
  const DUSK = [16.75, 17.4, 19.0, 19.6, 20.1, 20.4, 20.3, 19.75, 18.9, 18.1, 16.45, 16.25];  // hour, RI-ish
  const RAIN = [0.18, 0.18, 0.22, 0.24, 0.22, 0.2, 0.18, 0.2, 0.18, 0.18, 0.2, 0.2];
  // Nobody climbs wet granite: it's slick, and wet holds can snap.
  // A FORECAST gives the day's conditions plus a chance of rain (`pop`) in the
  // morning or after a given time. The forecast is honest: when the day comes,
  // realize() makes it rain with exactly that probability. Morning rain soaks
  // the rock for the whole day (rained out); afternoon rain ends the day at
  // `rainAt` (minutes after midnight). In a realized day, rainAt is 0 for
  // rained out, the minute rain starts, or null if it stays dry.
  const hm = m => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""} ${m < 720 ? "AM" : "PM"}`;
  function forecastDay(month, rng = Math.random) {
    const temp = Math.round(TEMP_F[month] + (rng() - 0.5) * 18);
    const dusk = Math.round(DUSK[month] * 60);
    const precip = temp <= 33 ? "Snow" : "Rain";
    const r = rng();
    let pop = 0, rainWhen = null, rainAt = null;
    if (r < RAIN[month] * 1.6) { pop = (2 + Math.floor(rng() * 7)) / 10; rainWhen = rng() < 0.5 ? "morning" : "afternoon"; }   // 20-80%
    else if (rng() < 0.3) { pop = 0.1; rainWhen = "afternoon"; }
    if (rainWhen === "afternoon") rainAt = 11 * 60 + Math.floor(rng() * 10) * 30;   // 11 AM to 3:30 PM
    const humid = month >= 5 && month <= 8 && rng() < 0.55;
    const sky = humid ? "Humid" : pop >= 0.5 ? "Overcast" : ["Sunny", "Overcast", "Breezy", "Bluebird"][Math.floor(rng() * 4)];
    let cond = temp < 30 ? 0.05 : temp <= 55 ? 0.35 : temp <= 65 ? 0.1 : temp <= 75 ? -0.2 : -0.45;
    if (humid) cond -= 0.25;
    if (sky === "Breezy" || sky === "Bluebird") cond += 0.1;
    const note = cond >= 0.3 ? "Crisp air. Friction is excellent." : cond >= 0.05 ? "Decent friction."
      : cond > -0.3 ? "A bit warm. Slopers and slabs will feel greasy." : "Greasy. Hard sends are unlikely on friction problems.";
    const label = cond >= 0.3 ? "Prime" : cond >= 0.05 ? "Good" : cond > -0.3 ? "Meh" : "Greasy";
    return { temp, sky, cond: Math.round(cond * 100) / 100, label, note, dusk, precip, pop, rainWhen, rainAt };
  }
  // "30% chance of rain in the morning", or "" for a dry forecast.
  function rainChance(f) {
    if (!f.pop) return "";
    const what = (f.precip || "Rain").toLowerCase(), at = f.rainFrom != null ? f.rainFrom : f.rainAt;   // forecast time, even on a day it stayed dry
    return `${Math.round(f.pop * 100)}% chance of ${what} ${f.rainWhen === "morning" ? "in the morning" : `after ${hm(at)}`}`;
  }
  function realize(f, rng = Math.random) {
    if (f.pop == null) return { ...f };            // forecasts saved before rain had odds were already certain
    const rains = f.pop > 0 && rng() < f.pop, chance = rainChance(f);
    if (rains && f.rainWhen === "morning")
      return { ...f, sky: f.precip, cond: -0.9, label: "Wet", rainAt: 0, rainFrom: 0,
        note: `The ${chance} came through. The rock is soaked, so there's no climbing today.` };
    const note = !f.pop ? f.note : f.rainWhen === "morning" ? `The morning rain held off. ${f.note}` : `${chance}. ${f.note}`;
    return { ...f, note, rainFrom: f.rainAt, rainAt: rains ? f.rainAt : null };
  }
  const weather = (month, rng = Math.random) => realize(forecastDay(month, rng), rng);
  // When the rain starts on this day: 0 = all day, null = it stays dry. Older
  // saves have wet days without rainAt.
  const rainStart = w => (w.cond <= -0.8 ? 0 : typeof w.rainAt === "number" && isFinite(w.rainAt) ? w.rainAt : null);
  const dayEnds = w => Math.min(w.dusk, rainStart(w) ?? Infinity);
  // Energy you start a day with, and skin you recover, depend on rest.
  function startOfDay(player, restDays) {
    const consecutive = restDays > 0 ? 1 : (player.consecutive || 0) + 1;
    return {
      consecutive,
      energy: Math.max(55, 100 - 15 * (consecutive - 1)),
      skin: Math.min(100, player.skin + 15 + 35 * restDays),
    };
  }

  const Mech = { PREF, BAL, levelInfo, levelOf, levelCost, proofCap, proofLeft, ability, baseXp, relFactor, styleBonus, morph, reachDependence,
    frictionSensitivity, breakdown, margin, sendChance, chanceOf, feel, canSpot, attemptCost, restGain, betaGain, sendXp, skillGains, applySkills,
    convertSkills, replay, topsOf, movesIn, attempt, weather, forecastDay, realize, rainChance, rainStart, dayEnds, hm, startOfDay,
    tagsOf, BETA_MAX, clamp };
  if (typeof module !== "undefined") module.exports = Mech; else root.Mech = Mech;
})(typeof window !== "undefined" ? window : globalThis);
