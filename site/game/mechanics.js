// Granite Hollow: the rules of climbing. Pure functions, no DOM, so they can be
// balance-tested outside the browser (see scripts/balance_game.js).
//
// The model in one paragraph: your ABILITY is a V-grade that grows with XP.
// Every attempt compares ability + your style skills on that problem's tags +
// how your reach suits it + the beta you've worked out + today's conditions,
// minus fatigue and thin skin, against the grade. That margin sets the send
// chance. Sends give XP that is worth much more near your limit, so mileage on
// easy problems keeps you moving but projects make you better. Style skills grow
// with the styles you send, so you get better at what you climb.
(function (root) {
  const PREF = ["crimpy", "slopey", "pinchy", "juggy", "compression", "dyno", "technical",
    "powerful", "mantle", "slab", "overhang", "roof", "traverse", "eliminate", "highball"];
  const XP_GROWTH = 1.6, LEVEL_COST = 100;
  const BETA_MAX = 0.7;
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const tagsOf = p => p.tags.split("|").filter(Boolean);

  // ---- level & XP -----------------------------------------------------------
  // Level n -> n+1 costs 100 * 1.6^n XP. A send earns a share of the level
  // you're on (see sendXp), so XP numbers grow as you do while the effort per
  // grade stays similar.
  function levelInfo(xp) {
    let level = 0, need = LEVEL_COST, rest = xp;
    while (rest >= need && level < 16) { rest -= need; level++; need = LEVEL_COST * Math.pow(XP_GROWTH, level); }
    return { level, into: rest, need, frac: rest / need };
  }
  const ability = xp => { const l = levelInfo(xp); return l.level + l.frac; };

  // ---- what makes a problem easier or harder for you --------------------------
  function styleBonus(player, p) {
    const ts = tagsOf(p).filter(t => PREF.includes(t));
    if (!ts.length) return 0;
    return 0.7 * ts.reduce((s, t) => s + (player.skills[t] || 0), 0) / ts.length;
  }
  function reachDependence(p) {
    const ts = tagsOf(p);
    return (ts.includes("reachy") ? 0.8 : 0) - (ts.includes("bunchy") ? 0.8 : 0)
      + (ts.includes("dyno") ? 0.25 : 0) - (ts.includes("compression") ? 0.15 : 0);
  }
  // + means your body suits it. 176 cm of reach is "average".
  const morph = (player, p) => reachDependence(p) * ((player.height + player.ape) - 176) / 10 * 0.6;
  const SENS = { slopey: 1, slab: 1, technical: 0.7, crimpy: 0.6, mantle: 0.6, pinchy: 0.5, juggy: 0.2 };
  function frictionSensitivity(p) {
    const v = tagsOf(p).map(t => SENS[t] ?? 0.35);
    return v.length ? Math.max(...v) : 0.4;
  }

  function breakdown(player, p, ps, day) {
    const fric = frictionSensitivity(p);
    return {
      ability: ability(player.xp) + 0.6,
      style: styleBonus(player, p),
      morph: morph(player, p),
      beta: ps ? ps.beta || 0 : 0,
      conditions: day.cond * fric,
      fatigue: -0.9 * Math.pow(1 - player.energy / 100, 1.5),
      skin: player.skin < 40 ? -(40 - player.skin) / 40 * (fric >= 0.6 ? 1.0 : 0.5) : 0,
      head: tagsOf(p).includes("highball") ? -0.3 : 0,
      grade: -p.grade,
    };
  }
  const margin = (player, p, ps, day) => Object.values(breakdown(player, p, ps, day)).reduce((a, b) => a + b, 0);
  const sendChance = m => Math.max(0.002, sigmoid(2.0 * m - 1.7));

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
  // or how tired you are. Only "Not yet" lines stay hidden. (Phase 2 discovery.)
  function canSpot(player, p) {
    const fresh = { ...player, energy: 100, skin: 100 };
    return feel(sendChance(margin(fresh, p, null, { cond: 0 }))).key !== "nope";
  }

  // ---- costs & gains -------------------------------------------------------------
  function attemptCost(player, p) {
    const d = p.grade - ability(player.xp);
    return {
      energy: 3 + 6 * sigmoid(1.3 * (d + 0.3)),
      skin: (frictionSensitivity(p) >= 0.6 ? 1.6 : 0.9) * (0.6 + 0.6 * sigmoid(d)),
      minutes: 6 + (d > -0.5 ? 4 : 0),
    };
  }
  const betaGain = beta => 0.2 * (1 - beta / BETA_MAX);
  // Moving up a grade takes sendsToLevelUp(n) first sends at your level: 10 at
  // V0, ~56 at V3, ~320 at V6. Plateaus are part of climbing. Each grade
  // harder doubles a send's worth (capped at 3x, so one lucky send can't skip
  // grades) and each grade easier halves it. Repeats are worth a tenth.
  const sendsToLevelUp = n => 10 * Math.pow(1.78, n);
  function sendXp(player, p, { first, flash, tip, newMax }) {
    const info = levelInfo(player.xp);
    const d = p.grade - (info.level + info.frac);
    const atLevel = 1 / sendsToLevelUp(info.level);
    let share = atLevel * clamp(Math.pow(2, d), 0.02, 3);
    if (!first) share *= 0.1;
    else share *= (flash ? 1.3 : 1) * (tip ? 1.2 : 1) * (newMax ? 1.25 : 1);
    return Math.max(1, Math.round(share * info.need));
  }
  // Sending a style makes you better at it, most when the send was near your
  // limit and less as the skill gets high. Failing teaches you a little.
  function skillGains(player, p, sent) {
    const d = p.grade - ability(player.xp), out = {};
    for (const t of tagsOf(p)) {
      if (!PREF.includes(t)) continue;
      const s = player.skills[t] || 0;
      out[t] = (sent ? 0.07 * clamp(Math.pow(1.6, d), 0.1, 2) : 0.008) * Math.exp(-Math.max(s, 0) / 1.5);
    }
    return out;
  }

  // ---- one attempt -----------------------------------------------------------
  function movesIn(p, seed) {
    const ts = tagsOf(p);
    return 4 + (seed % 5) + (ts.includes("traverse") ? 6 : 0) + (ts.includes("highball") ? 2 : 0);
  }
  function attempt(player, p, ps, day, rng = Math.random) {
    const parts = breakdown(player, p, ps, day);
    const m = Object.values(parts).reduce((a, b) => a + b, 0);
    const chance = sendChance(m);
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

  const Mech = { PREF, levelInfo, ability, styleBonus, morph, reachDependence, frictionSensitivity, breakdown,
    margin, sendChance, feel, canSpot, attemptCost, betaGain, sendXp, skillGains, movesIn, attempt, weather, forecastDay, realize, rainChance, rainStart, dayEnds, hm, startOfDay,
    tagsOf, BETA_MAX, clamp };
  if (typeof module !== "undefined") module.exports = Mech; else root.Mech = Mech;
})(typeof window !== "undefined" ? window : globalThis);
