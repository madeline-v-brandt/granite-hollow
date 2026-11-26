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
    betaMax: 0.7,                     // beta from knowing every move: worth up to this many grades
    // ---- moves (Stage 1): what a burn teaches the move you fell on and the moves you
    // passed, and working a move on its own; each try on a problem the same day teaches
    // learnDay as much as the last
    learnFall: 0.15, learnPass: 0.06, learnWork: 0.3, learnDay: 0.7,
    knownShift: 0.6,                  // a move you know well carries this much less of the risk (where you fall)
    altBeta: 0.2,                     // the better way through a crux, once found, on top of betaMax
    altAt: 0.4, altOnFall: 0.12, altOnWork: 0.3,   // found by falling on (or working) a crux you know this well
    isolation: 0.6,                   // a move on its own is this many grades easier than on a burn
    fadeAfter: 14, fadeDays: 60,      // after two weeks away, knowledge fades, to half over two months
    // ---- resting
    rest: 12, restDay: 1,             // a 20-minute rest gives back 12 energy, every time (play-test, 2026-11-26: rest
                                      // and climb all day; restDay < 1 would give back less each time the same day)
    // ---- preparation and conditions through the day (Stage 3)
    dirt: 0.3,                        // a line nobody has climbed is gritty and lichened, this many grades harder, until brushed
    brush: 0.1,                       // freshly brushed holds: up to this many grades (× how much friction matters), for the day
    brushMin: 5,                      // minutes to brush a line
    tapeSkin: 0.5,                    // taped, a burn costs this share of the skin
    tapeThin: 0.4,                    // and thin skin hurts this share as much
    tapeFeel: 0.25,                   // but you lose this many grades of feel on slopers and slab
    tapeMin: 5,
    todSwing: 0.3,                    // friction through the day: cool mornings and evenings, warm afternoons
    shadeWorth: 0.3,                  // on a warm afternoon, full shade against full sun is about this much better …
    sunWorth: 0.15,                   // … and on a cold one, the sun is this much better (warm fingers)
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

  // How much tape costs you on a problem: slopers and slab need the feel of bare skin.
  function tapeFeel(p) {
    const ts = tagsOf(p);
    return ts.includes("slopey") || ts.includes("slab") ? 1 : ts.includes("pinchy") || ts.includes("compression") ? 0.5 : 0;
  }

  // The parts of an attempt's margin, in grades; they add up to the margin. The
  // good adjustments (style, reach, beta, conditions, brushing, vibes) are scaled
  // down together so they approach BAL.ceiling and never pass it. day: the
  // conditions where and when you climb ({ cond }, from condAt), and, since Stage 3,
  // what you've done about them: dirty (a line nobody has climbed, not yet
  // brushed), brushed (today), tape (you're taped up).
  function breakdown(player, p, ps, day) {
    const fric = frictionSensitivity(p), tape = !!day.tape;
    const thin = player.skin < 40 ? -(40 - player.skin) / 40 * (fric >= 0.6 ? 1.0 : 0.5) : 0;
    const parts = {
      ability: ability(player) + BAL.lift,
      style: styleBonus(player, p),
      morph: morph(player, p),
      beta: ps ? clamp(ps.beta || 0, 0, BAL.betaMax + BAL.altBeta) : 0,
      conditions: day.cond * fric,
      brushed: day.brushed ? BAL.brush * fric : 0,
      vibes: day.vibes || 0,
      dirt: day.dirty ? -BAL.dirt : 0,
      tape: tape ? -BAL.tapeFeel * tapeFeel(p) : 0,
      fatigue: -0.9 * Math.pow(1 - player.energy / 100, 1.5),
      skin: tape ? thin * BAL.tapeThin : thin,
      head: tagsOf(p).includes("highball") ? -0.3 : 0,
      grade: -p.grade,
    };
    const good = ["style", "morph", "beta", "conditions", "brushed", "vibes"].filter(k => parts[k] > 0);
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
  // day (optional): { tape } halves the skin a burn costs.
  function attemptCost(player, p, day) {
    const d = p.grade - ability(player);
    return {
      energy: 3 + 6 * sigmoid(1.3 * (d + 0.3)),
      skin: (frictionSensitivity(p) >= 0.6 ? 1.6 : 0.9) * (0.6 + 0.6 * sigmoid(d)) * (day && day.tape ? BAL.tapeSkin : 1),
      minutes: 6 + (d > -0.5 ? 4 : 0),
    };
  }
  // Energy back from a 20-minute rest, when you've already rested `before` times today.
  const restGain = (before = 0) => BAL.rest * Math.pow(BAL.restDay, Math.max(0, before));
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

  // ---- moves (Phase 3, Stage 1) ----------------------------------------------
  // Every problem has a sequence of moves, generated from its own data (its index,
  // tags, grade, height and sit start), so it's the same in every save and is
  // never stored. Most moves are well within the grade; one crux (two on hard or
  // long problems) carries it. The send chance above still decides each burn; the
  // moves decide where you fall. What you've learned is kept per move (ps.mk,
  // 0..1), and the problem's beta (ps.beta, which the send chance reads) is worked
  // out from it, mostly from the cruxes. Some cruxes hide a better way through
  // (ps.alt once you've found it): a heel hook, a drop-knee, an intermediate hold
  // for shorter people, a cramped hold taller people can skip.
  const CRUX_ORDER = ["dyno", "compression", "powerful", "crimpy", "slopey", "pinchy", "roof", "technical", "overhang", "slab",
    "mantle", "traverse", "eliminate", "highball", "juggy"];
  const HOLD_FOR = { crimpy: ["crimp"], slopey: ["sloper"], pinchy: ["pinch"], juggy: ["jug"], compression: ["squeeze"], dyno: ["jug"],
    technical: ["edge", "sidepull"], slab: ["smear"], mantle: ["ledge"], roof: ["lip"], overhang: ["jug", "pinch", "undercling"],
    powerful: ["undercling", "crimp", "pinch"], highball: ["edge", "jug"], traverse: ["edge", "jug", "crimp"], eliminate: ["crimp", "edge"] };
  const FILLER = ["edge", "jug", "crimp", "sidepull", "pinch"];
  const ALT_KINDS = { steep: ["heel", "toe", "knee"], friction: ["drop", "toe", "heel"], feet: ["foot", "match"], any: ["heel", "drop", "match", "foot"] };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngOf(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const r2 = x => Math.round(x * 100) / 100;
  const seqCache = new Map();
  // A problem's sequence: { n, moves: [{ i, kind: "start" | "move" | "crux" | "top",
  // style (a tag or null), hold, reach ("long" | "tight" | null), w (its share of
  // the risk; they add up to 1) }], cruxes: [indices], alt: { at, kind, body } | null }.
  function sequence(p) {
    const key = `${p.id ?? ""}|${p.tags}|${p.grade}|${p.height_ft}|${p.sit ? 1 : 0}`;
    const hit = seqCache.get(key); if (hit) return hit;
    const r = rngOf(hashStr(key)), ts = tagsOf(p), has = t => ts.includes(t), pick = a => a[Math.floor(r() * a.length)];
    const n = clamp(3 + Math.round((p.height_ft || 12) / 5) + (p.sit ? 1 : 0) + (has("traverse") ? 4 + Math.floor(r() * 3) : 0) + (r() < 0.3 ? 1 : 0), 3, 12);
    const top = has("mantle") || has("highball") || (has("slab") && r() < 0.5);
    const want = p.grade >= 9 || (has("traverse") && p.grade >= 4) ? 2 : p.grade >= 5 && r() < 0.35 ? 2 : 1;
    // Cruxes go anywhere but the last move; a sit start's first move can be one.
    const slots = []; for (let i = p.sit ? 0 : 1; i < n - 1; i++) slots.push(i);
    const cruxAt = new Set();
    while (cruxAt.size < Math.min(want, slots.length)) cruxAt.add(slots[Math.floor(r() * slots.length)]);
    const styles = CRUX_ORDER.filter(has);
    const plain = ts.filter(t => PREF.includes(t) && !["dyno", "mantle", "highball", "traverse", "eliminate"].includes(t));
    const hands = ts.filter(t => ["crimpy", "slopey", "pinchy", "juggy"].includes(t)).flatMap(t => HOLD_FOR[t]);
    const nCrux = cruxAt.size, moves = [];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const crux = cruxAt.has(i), kind = crux ? "crux" : i === n - 1 && top ? "top" : i === 0 ? "start" : "move";
      let style = null;
      if (crux) style = styles.length ? styles[Math.min(c++, styles.length - 1)] : null;
      else if (kind === "top") style = has("mantle") ? "mantle" : has("highball") ? "highball" : "slab";
      else if (plain.length && r() < 0.5) style = pick(plain);
      const hold = style && HOLD_FOR[style] ? pick(HOLD_FOR[style]) : hands.length && r() < 0.6 ? pick(hands) : pick(FILLER);
      const reach = crux && has("reachy") ? "long" : crux && has("bunchy") ? "tight" : null;
      const w = crux ? (0.7 + 0.2 * r()) / nCrux : kind === "top" ? 0.06 + (has("highball") ? 0.08 : 0) : 0.02 + 0.03 * r();
      moves.push({ i, kind, style, hold, reach, w });
    }
    const tot = moves.reduce((a, m) => a + m.w, 0);
    for (const m of moves) m.w /= tot;
    const cruxes = moves.filter(m => m.kind === "crux");
    let alt = null;
    if (cruxes.length && r() < 0.25 + 0.03 * p.grade) {
      const m = pick(cruxes);
      const kind = m.reach === "long" ? "extra" : m.reach === "tight" ? "skip"
        : pick(["roof", "overhang"].includes(m.style) ? ALT_KINDS.steep : ["slopey", "compression"].includes(m.style) ? ALT_KINDS.friction
          : ["slab", "technical"].includes(m.style) ? ALT_KINDS.feet : ALT_KINDS.any);
      alt = { at: m.i, kind, body: kind === "extra" ? "short" : kind === "skip" ? "tall" : null };
    }
    const s = { n, moves, cruxes: cruxes.map(m => m.i), alt };
    seqCache.set(key, s);
    return s;
  }
  // The better way through, if this problem has one this climber can use: an
  // intermediate hold only helps shorter people, skipping a hold only taller ones.
  function altFor(player, p) {
    const a = sequence(p).alt;
    if (!a) return null;
    const reach = (player.height || 170) + (player.ape || 0);
    if ((a.body === "short" && reach > 174) || (a.body === "tall" && reach < 178)) return null;
    return a;
  }
  // What you know of each move. A save from before moves spreads its beta evenly
  // over them, so its send chances don't change.
  function knowledge(p, ps) {
    const s = sequence(p);
    if (!Array.isArray(ps.mk) || ps.mk.length !== s.n || !ps.mk.every(v => typeof v === "number" && isFinite(v))) {
      const k = clamp((ps.beta || 0) / BAL.betaMax, 0, 1);
      ps.mk = Array(s.n).fill(k);
    }
    return ps.mk;
  }
  function betaFrom(p, ps) {
    const s = sequence(p), mk = knowledge(p, ps);
    let b = 0; s.moves.forEach((m, i) => { b += m.w * clamp(mk[i], 0, 1); });
    return BAL.betaMax * b + (ps.alt ? BAL.altBeta : 0);
  }
  // Moves you've seen (a count): as far as you've got, or worked.
  const seenOf = (p, ps) => { const n = sequence(p).n; return ps && ps.sent ? n : Math.min(n, Math.max(Math.round((ps && ps.best || 0) * n), (ps && ps.seen) || 0)); };
  // Where a burn that didn't send ended: each move takes a share of the risk (its
  // weight, less for moves you know), and the shares multiply back to the chance.
  function fallMove(p, ps, chance, rng) {
    const s = sequence(p), mk = ps ? knowledge(p, ps) : null;
    const w = s.moves.map((m, i) => m.w * (1 - BAL.knownShift * (mk ? clamp(mk[i], 0, 1) : 0)));
    const tot = w.reduce((a, b) => a + b, 0), P = clamp(chance, 1e-4, 0.9999);
    let alive = 1;
    const q = w.map(x => { const f = 1 - Math.pow(P, x / tot), v = alive * f; alive *= 1 - f; return v; });
    let u = rng() * q.reduce((a, b) => a + b, 0);
    for (let i = 0; i < q.length; i++) { u -= q[i]; if (u <= 0) return i; }
    return q.length - 1;
  }
  const dayFactor = today => Math.pow(BAL.learnDay, Math.max(0, today - 1));
  // What a burn teaches: most about the move you fell on, a little about the moves
  // you passed, and less with each try on this problem the same day (today counts
  // this one). A fall on a crux you know fairly well can show you its better way
  // through. fallAt: the move fallen on (-1: sent). Returns { alt: found it now }.
  function learnBurn(player, p, ps, fallAt, today = 1, rng = Math.random) {
    const s = sequence(p), mk = knowledge(p, ps), f = dayFactor(today), upto = fallAt < 0 ? s.n : fallAt;
    for (let i = 0; i < upto; i++) mk[i] += BAL.learnPass * (1 - mk[i]) * f;
    if (fallAt >= 0) mk[fallAt] += BAL.learnFall * (1 - mk[fallAt]) * f;
    let alt = false;
    const a = altFor(player, p);
    if (a && !ps.alt && fallAt === a.at && mk[fallAt] >= BAL.altAt && rng() < BAL.altOnFall) { ps.alt = true; alt = true; }
    ps.mk = mk.map(r2);
    if (fallAt >= 0) ps.seen = Math.max(ps.seen || 0, fallAt + 1);
    ps.beta = betaFrom(p, ps);
    return { alt };
  }
  // Working one move on its own (Stage 2's "Work a move"; today: moves worked on this
  // problem today, counting this one; burns don't tire it): fresher than on a burn,
  // so it sticks more often; it teaches that move a lot and can show the better way
  // through. Sticking it shows you the next move. Returns { stuck, chance, alt }.
  function workMove(player, p, ps, day, at, today = 1, rng = Math.random) {
    const s = sequence(p), mk = knowledge(p, ps), f = dayFactor(today);
    const m = margin({ ...player, energy: Math.max(player.energy, 70) }, p, ps, day) + BAL.isolation;
    const chance = Math.pow(sendChance(m, p.grade), s.moves[at].w * (1 - BAL.knownShift * clamp(mk[at], 0, 1)));
    const stuck = rng() < chance;
    mk[at] = Math.min(1, mk[at] + BAL.learnWork * (1 - mk[at]) * f * (stuck ? 1.3 : 1));
    let alt = false;
    const a = altFor(player, p);
    if (a && !ps.alt && at === a.at && mk[at] >= BAL.altAt * 0.75 && rng() < BAL.altOnWork) { ps.alt = true; alt = true; }
    ps.mk = mk.map(r2);
    ps.seen = Math.min(s.n, Math.max(ps.seen || 0, at + (stuck ? 2 : 1)));
    ps.beta = betaFrom(p, ps);
    return { stuck, chance, alt };
  }
  // Working a move costs less than a burn, but sharp holds still take skin.
  function workCost(player, p, day) {
    const c = attemptCost(player, p, day);
    return { energy: c.energy * 0.6, skin: c.skin * 0.8, minutes: 8 };
  }
  // A long break: after BAL.fadeAfter days away, what you knew of the moves fades,
  // to half over BAL.fadeDays and never further. A better way through, once found,
  // you remember.
  function fade(p, ps, daysAway) {
    if (!(daysAway > BAL.fadeAfter) || !Array.isArray(ps.mk)) return false;
    const k = Math.max(0.5, 1 - (daysAway - BAL.fadeAfter) / BAL.fadeDays);
    ps.mk = knowledge(p, ps).map(v => r2(v * k));
    ps.beta = betaFrom(p, ps);
    return true;
  }
  // A local's beta: the better way through if there is one for you, otherwise a
  // good look at the crux you know least. Returns "alt" or "crux".
  function tip(player, p, ps) {
    const s = sequence(p), mk = knowledge(p, ps), a = altFor(player, p);
    let what = "crux";
    if (a && !ps.alt) { ps.alt = true; what = "alt"; }
    else {
      const c = s.cruxes.length ? s.cruxes.reduce((x, y) => (mk[y] < mk[x] ? y : x)) : 0;
      mk[c] += 0.5 * (1 - mk[c]);
      ps.seen = Math.max(ps.seen || 0, c + 1);
    }
    ps.mk = mk.map(r2);
    ps.beta = betaFrom(p, ps);
    return what;
  }

  // ---- previews for the climbing scene's menu --------------------------------------
  // What a rest or working a move would do to your next burn's chance, counting
  // everything: the energy (and skin) it costs or gives back and what you'd learn.
  // Nothing is changed. A rest: you've rested `before` times today, and can get
  // back up to maxEnergy (the day's start).
  function previewRest(player, p, ps, day, before = 0, maxEnergy = 100) {
    const pl = { ...player, energy: Math.min(maxEnergy, player.energy + restGain(before)) };
    return chanceOf(pl, p, ps, day);
  }
  // Working move `at` once (today: moves worked on this problem today, counting it):
  // what you'd expect to know after it, whether you stick it or not (a better way
  // through, if you'd find one, isn't counted). Returns { kept: your chance as you
  // are now with that knowledge (what the work is worth, for good), next: your next
  // burn's, after the energy and skin it costs }.
  function previewWork(player, p, ps, day, at, today = 1) {
    const s = sequence(p), mk = knowledge(p, { ...ps }).slice(), f = dayFactor(today);
    const m = margin({ ...player, energy: Math.max(player.energy, 70) }, p, ps, day) + BAL.isolation;
    const stick = Math.pow(sendChance(m, p.grade), s.moves[at].w * (1 - BAL.knownShift * clamp(mk[at], 0, 1)));
    mk[at] = Math.min(1, mk[at] + BAL.learnWork * (1 - mk[at]) * f * (stick * 1.3 + (1 - stick)));
    const ps2 = { ...ps, mk }, c = workCost(player, p, day);
    ps2.beta = betaFrom(p, ps2);
    const pl = { ...player, energy: Math.max(0, player.energy - c.energy), skin: Math.max(0, player.skin - c.skin) };
    return { kept: chanceOf(player, p, ps2, day), next: chanceOf(pl, p, ps2, day) };
  }

  // ---- one attempt -----------------------------------------------------------
  // A burn from the start. The chance decides whether it goes; if it doesn't, the
  // moves decide where you came off (fallAt, 0-based, and the move itself).
  // progress is how far you got as a share of the moves; crux, the tag that beat
  // you (for older callers).
  function attempt(player, p, ps, day, rng = Math.random) {
    const parts = breakdown(player, p, ps, day);
    const m = Object.values(parts).reduce((a, b) => a + b, 0);
    const chance = sendChance(m, p.grade);
    const sent = rng() < chance;
    const s = sequence(p), fallAt = sent ? -1 : fallMove(p, ps, chance, rng), move = fallAt >= 0 ? s.moves[fallAt] : null;
    const crux = move ? (move.reach === "long" ? "reachy" : move.reach === "tight" ? "bunchy" : move.style) : null;
    return { sent, chance, margin: m, parts, fallAt, move, progress: sent ? 1 : (fallAt + 1) / s.n, crux };
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
    return { temp, sky, cond: Math.round(cond * 100) / 100, ...describeCond(cond), dusk, precip, pop, rainWhen, rainAt };
  }
  // Conditions in words: a label and a note.
  function describeCond(cond) {
    const note = cond >= 0.3 ? "Crisp air. Friction is excellent." : cond >= 0.05 ? "Decent friction."
      : cond > -0.3 ? "A bit warm. Slopers and slabs will feel greasy." : "Greasy. Hard sends are unlikely on friction problems.";
    const label = cond >= 0.3 ? "Prime" : cond >= 0.05 ? "Good" : cond > -0.3 ? "Meh" : "Greasy";
    return { label, note };
  }
  // A day made at least this good (a climber's first day, so there's plenty that
  // goes). Keeps the rest of its forecast; a humid sky clears.
  function atLeast(w, cond) {
    if (!(w.cond < cond) || w.cond <= -0.8) return w;
    const was = describeCond(w.cond), now = describeCond(cond);
    return { ...w, cond, label: now.label, note: String(w.note || "").replace(was.note, now.note) || now.note, sky: w.sky === "Humid" ? "Sunny" : w.sky };
  }
  // ---- conditions through the day, and shade (Stage 3) ----------------------------
  // A day's cond (its forecast label) is the day as a whole. Where and when you
  // climb moves it: friction is best in the cool of the morning and the evening and
  // worst in mid-afternoon, and on a warm day a boulder in the shade keeps cooler
  // than one in the sun (on a cold day the sun is welcome: warm fingers). Shade
  // comes from the area's woods (hemlocks keep theirs all year; maples and oaks let
  // the winter sun through) and the rock's own angle (always cool under a roof).
  // Areas are keyed by name: a renamed area needs its entry renamed too.
  const AREA_SHADE = {   // [canopy, evergreen share]
    "Hemlock Hollow": [0.85, 0.9], "Bracken Gully": [0.75, 0.6], "Millrace Caves": [0.7, 0.4], "The Spillway": [0.5, 0.45],
    "The Cellar Holes": [0.45, 0.15], "The Schoolhouse": [0.4, 0.1], "The Tailgate": [0.25, 0.4], "The Grout Piles": [0.2, 0.3],
    "Hawkwatch": [0.15, 0.4], "Back Forty": [0.05, 0.2],
  };
  const ANGLE_SHADE = { roof: 0.35, overhang: 0.2, vertical: 0, slab: -0.1 };
  const LEAF = [0.25, 0.25, 0.3, 0.6, 1, 1, 1, 1, 1, 0.8, 0.35, 0.25];   // how leafy the broadleaf woods are, by month
  const SHADE_MID = 0.45;                                                  // about the park's average: no better or worse
  // 0 (full sun) to 1 (deep shade). b: a boulder ({ sector, angle }); month 0–11.
  function shadeOf(b, month = 6) {
    const [c, ev] = AREA_SHADE[b && b.sector] || [0.35, 0.4];
    return r2(clamp(c * (ev + (1 - ev) * LEAF[((month % 12) + 12) % 12]) + (ANGLE_SHADE[b && b.angle] || 0), 0, 1));
  }
  // How far into the day's warmth an hour is: 0 at 7 AM, 1 at 3 PM, falling again after.
  const warmth = minute => clamp(Math.sin(Math.PI * (minute / 60 - 7) / 16), 0, 1);
  const SUN = { Overcast: 0.3, Humid: 0.7, Rain: 0, Snow: 0 };
  // The conditions on a boulder with this shade at this minute of the day.
  function condAt(w, minute, shade = SHADE_MID) {
    if (!w || !(typeof w.cond === "number")) return 0;
    if (w.cond <= -0.8) return w.cond;                                     // wet is wet
    const k = warmth(minute), t = typeof w.temp === "number" ? w.temp : 55;
    const S = t >= 60 ? BAL.shadeWorth : t <= 40 ? -BAL.sunWorth : -BAL.sunWorth + (BAL.shadeWorth + BAL.sunWorth) * (t - 40) / 20;
    const sun = S * (shade - SHADE_MID) * (SUN[w.sky] ?? 1) * k;
    return r2(w.cond + BAL.todSwing * (0.75 - k) + sun);
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
    frictionSensitivity, breakdown, margin, sendChance, chanceOf, feel, canSpot, attemptCost, restGain, sendXp, skillGains, applySkills,
    convertSkills, replay, topsOf, sequence, altFor, knowledge, betaFrom, seenOf, fallMove, learnBurn, workMove, workCost, fade, tip, previewRest, previewWork, attempt, weather, forecastDay, realize, rainChance, rainStart, dayEnds, hm, startOfDay, describeCond, atLeast,
    shadeOf, warmth, condAt, tapeFeel, AREA_SHADE,
    tagsOf, BETA_MAX, clamp };
  if (typeof module !== "undefined") module.exports = Mech; else root.Mech = Mech;
})(typeof window !== "undefined" ? window : globalThis);
