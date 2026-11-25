// Granite Hollow: the world's history (Phase 2). Pure functions over the game
// data (D) and a save (G), with no DOM, so they can be tested in Node
// (scripts/test_world.js).
//
// The story: climbers found the Hollow in the 70s, the park closed to climbing
// in 1987, and it reopened on 1 September 2025. Apart from one surviving page
// of the old kiosk notebook, nothing is documented. Each save has its own
// Granite Hollow, developed by its own community of NPC climbers alongside
// the player.
//
//   G.world.est   the ledger: who established which problem, when, under what
//                 name, with its repeats and ratings. Append-only.
//   G.world.npc   the climbers who have arrived. G.world.found: the boulders
//                 they know about. G.world.news: notable events, newest first.
//   step()        simulates the community one day at a time, from its own
//                 seeded random stream, so reloading never rerolls a day.
//   migrate()     turns a v1 save (the whole crag established) into a v2 save.
//
// What the player knows is G.know, read and written by knowledge.js.
// Design: docs/phase2/stage0-design.md.
(function (root) {
  "use strict";
  const Mech = root.Mech || (typeof require !== "undefined" ? require("./mechanics.js") : null);

  const REOPENED = "2025-09-01";
  const BEFORE = "2025-08-31";            // simDate of a new world: the simulation starts on reopening day

  // Every pacing number, in one place, to be tuned by simulation and playtesting.
  // Saves don't store these, so changing them changes future days, never history.
  const PARAMS = {
    calendarWeight: 0.25,                 // development clock: your climbing days + this × calendar days
    target: { max: 0.9, tau: 65 },        // established ≈ problems × max × (1 − e^(−clock/tau)). Tuned (Stage 5,
                                          // scripts/tune_crag.js) so a keen player sees ~70% climbed by the end of 2025
    closeRate: 0.3,                       // share of the gap to the target closed per day…
    fasPerNpc: 0.25,                      // …but at most this many FAs per active climber per day
    maxFasPerDay: 15,
    trickle: 0.15,                        // past the target, the community still climbs about one new line a week while any are left
    gate: { perGrade: 6, soft: 4 },       // harder grades open later: × sigmoid((clock − 6 × grade) / 4)
    reserve: { frac: 0.1, weight: 0.05 }, // a slow reserve, so first ascents stay possible for a long time
    nextBand: { lo: 0.5, hi: 4, weight: 0.3 },   // the grades just above yours develop more slowly
    prodigy: { chance: 0.03, minLevel: 10, minGrade: 8 },   // a strong local's early hard FA
    community: { base: 4, perEstablished: 0.08, perPlayerFa: 2, maxArrivalsPerDay: 3 },
    explore: { perNpc: 0.015, maxPerDay: 1, walkScale: 8,   // the community knows every boulder by about February–April 2026
      reach: { start: 9, perDay: 0.09 },  // the community only goes as far as start + perDay × days since reopening (minutes from the lot):
                                          // the 16-minute areas from late November, Back Forty (24) from mid-February  // the community only goes as far as start + perDay × days since reopening (minutes from the lot)
      spreadDays: 10 },                   // boulders you find become common knowledge this many days later
    regularBoost: 1.4,                    // the regulars put up more than their share
    dryDays: 0.75,                        // the share of days the community can climb (your own day uses its weather)
    repeats: { climbChance: 0.35, perClimber: 2, rateChance: 0.6 },
    classic: { reps: 15, stars: 3.0 },
    snipe: { on: true, minDay: 20, cooldown: 25, idleDays: 14, chance: 0.03 },
    newsCap: 150, logsCap: 5,
  };

  // ---- lore -----------------------------------------------------------------
  // Climbers who aren't from the data's 600: "n:<key>". All fictional.
  // The regulars (Stage 5) are the cast you get to know: they turn up again,
  // remember you, and have home areas where you're most likely to meet them.
  //   arrive   the climbing day (yours) from which they're around
  //   home     where they're usually found (they wander now and then)
  //   dog      Pickles: never climbs, never in the ledger
  //   old      an old-era name: never climbs now (the Bishop is around, though)
  //   blurb    who they are, as a verb phrase ("…, who is the park ranger, …")
  // Two of them have stories still to come: Pickles, who may one day decide
  // you're his person, and Rowan, someone you might fall for.
  const NAMED = {
    gus: { name: "Ranger Gus", h: 180, level: 3.2, likes: "slab|technical|mantle", type: "local_hero", active: true, regular: true, home: ["The Tailgate"], arrive: 0,
      blurb: "is the park ranger" },
    dot: { name: "Dot", h: 157, old: true },
    bishop: { name: "the Bishop", h: 196, old: true, regular: true, home: ["The Schoolhouse", "Millrace Caves", "The Tailgate", "Hawkwatch"], arrive: 4,
      blurb: "climbed here in the seventies, or says he did" },
    anon: { name: "an unknown climber", old: true },
    pickles: { name: "Pickles", dog: true, regular: true, home: ["The Tailgate"], arrive: 0, blurb: "is the parking-lot dog" },
    rowan: { name: "Rowan Ellery", h: 172, level: 5.8, likes: "slab|technical|highball", type: "regular", regular: true, home: ["Hawkwatch", "The Schoolhouse"], arrive: 3,
      blurb: "sketches the boulders between burns" },
    hollis: { name: "Hollis Pruitt", h: 178, level: 5.2, likes: "technical|crimpy|traverse", type: "regular", regular: true, home: ["The Schoolhouse", "The Tailgate"], arrive: 2,
      blurb: "has documented everything, twice" },
    otis: { name: "Otis Fairweather", h: 183, level: 4.4, likes: "slab|mantle|juggy", type: "regular", regular: true, home: ["Hemlock Hollow", "Millrace Caves"], arrive: 6,
      blurb: "thinks every day is perfect sending weather" },
    bea: { name: "Bea Marchetti", h: 158, level: 9.6, likes: "dyno|powerful|overhang", type: "local_hero", regular: true, home: ["Bracken Gully", "Millrace Caves"], arrive: 10,
      blurb: "is seventeen and jumps for everything" },
    dez: { name: "Dez Kowalczyk", h: 175, level: 13.4, likes: "powerful|overhang|compression|roof", type: "local_hero", regular: true, home: ["Millrace Caves", "The Grout Piles"], arrive: 18,
      blurb: "is the strongest climber in the valley, and the quietest" },
  };
  // The regulars who climb (and so arrive in the community and the ledger), apart from Gus, who arrives first anyway.
  const CLIMBING_REGULARS = Object.keys(NAMED).filter(k => NAMED[k].regular && !NAMED[k].dog && !NAMED[k].old && k !== "gus").map(k => "n:" + k);
  // The four problems on the surviving page of the kiosk notebook: old-era
  // climbs, documented on reopening day. Two on The Billboard, two on Gus's Rock.
  const NOTEBOOK = [
    { boulder: "The Billboard", name: "Your Ad Here", by: "n:dot", year: 1974 },
    { boulder: "The Billboard", name: "Billboard Traverse", by: "n:anon", year: 1970 },
    { boulder: "Gus's Rock", name: "Carry In, Carry Out", by: "n:dot", year: 1975 },
    { boulder: "Gus's Rock", name: "Pets Must Be Leashed", by: "n:bishop", year: 1976 },
  ];
  // Old-era stories attached to particular lines. Display only: they never
  // change the first-ascent record.
  const LEGENDS = [
    { boulder: "The Billboard", name: "Billboard Traverse", text: "The notebook page lists it with no name and no climber, just “left to right, don't touch the ground.”" },
    { boulder: "Gus's Rock", name: "Pets Must Be Leashed", text: "The notebook says the Bishop did it. Dot's note in the margin: “with a stick.”" },
    { boulder: "Gus's Rock", name: "Ranger Gus", text: "Gus swears he has never climbed it. Nobody believes him." },
    { boulder: "The Thermal Slab", name: "Kettle of Hawks", text: "If you know where to look, Dot's tick mark is still on the starting crimp: a little dot." },
    { boulder: "Old Baldy", name: "Old Baldy Traverse", text: "It follows a line of faded chalk arrows that nobody admits to painting." },
    { boulder: "The Belfry", name: "Ring the Bell", text: "Old-timers say whoever did it first each spring got to ring the school bell." },
    { boulder: "The Belfry", name: "Bats in the Belfry", text: "The Bishop says he did it in 1977, without a pad, in work boots." },
    { boulder: "The Grotto", name: "Plato's Cave", text: "Someone scratched “B. '79” inside the cave. Dot always said he scratched it after she'd done it." },
    { boulder: "The Tombstone", name: "The Undertaker", text: "Dot is supposed to have tried it for a whole summer. She called it the one that got away." },
    { boulder: "The Retaining Wall", name: "Finger in the Dike", text: "Climbed the day before the 1987 closure, or not, depending on who you ask." },
    { boulder: "The Apple", name: "Original Sin", text: "The story goes that someone did it first try in the 70s and was never seen at the Hollow again." },
  ];
  // The climbing areas: what kind of name each has, and how word of it is
  // phrased before you know where it is.
  const AREAS = {
    "The Tailgate": { origin: "community", hint: "right by the lot" },
    "The Schoolhouse": { origin: "place", hint: "up by the old schoolhouse" },
    "Hawkwatch": { origin: "place", hint: "up on the ridge" },
    "Millrace Caves": { origin: "place", hint: "down along the millrace" },
    "Bracken Gully": { origin: "community", hint: "somewhere up the fern gully" },
    "The Spillway": { origin: "place", hint: "down below the dam" },
    "The Cellar Holes": { origin: "place", hint: "out past the old village" },
    "Hemlock Hollow": { origin: "community", hint: "back in the hemlocks" },
    "The Grout Piles": { origin: "place", hint: "somewhere past the quarry" },
    "Back Forty": { origin: "place", hint: "way out past the fields" },
  };
  const KIOSK_AREAS = ["The Tailgate", "The Schoolhouse", "Hawkwatch"];
  const TYPE_WEIGHT = { local_hero: 3, regular: 2, occasional: 1, tourist: 0.6 };

  // ---- dates & random streams ------------------------------------------------
  const toDate = s => new Date(s + "T12:00:00Z");
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const isDay = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s);
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function stream(seed, key) {
    let [a, b, c, d] = cyrb128(seed + "|" + key);
    const next = () => {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 4; i++) next();
    return next;
  }
  const seedFrom = s => cyrb128(String(s)).map(x => x.toString(36)).join("").slice(0, 16);
  const newSeed = () => seedFrom(Math.random() + ":" + Date.now());
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const tagsOf = p => p.tags.split("|").filter(Boolean);

  // ---- who's who ---------------------------------------------------------------
  const isWho = w => w === "you" || (typeof w === "string" && (/^c\d{1,4}$/.test(w) || /^n:[a-z]{2,12}$/.test(w)));
  function whoInfo(D, w) {
    if (w === "you") return { name: "you", h: null, level: null, likes: "", type: "you" };
    if (w[0] === "c") { const c = D.climbers[+w.slice(1)]; return c ? { name: c[0], h: c[1], type: c[2], level: c[3], likes: c[4] || "" } : { name: "a climber", h: null, level: 0, likes: "", type: "tourist" }; }
    const n = NAMED[w.slice(2)];
    return n ? { name: n.name, h: n.h, type: n.type || (n.dog ? "dog" : "old"), level: n.level ?? 0, likes: n.likes || "", old: !!n.old || !!n.dog, regular: !!n.regular, home: n.home || [], blurb: n.blurb || "" }
      : { name: "a climber", h: null, level: 0, likes: "", type: "tourist" };
  }
  const whoName = (D, w) => whoInfo(D, w).name;

  // ---- per-data and per-seed lookups (derived, never saved) ----------------------
  const dataCache = new WeakMap();
  function dataOf(D) {
    let c = dataCache.get(D);
    if (c) return c;
    const sectorOf = new Map(D.sectors.map(s => [s.name, s]));
    const find = (bName, pName) => {
      const bi = D.boulders.findIndex(b => b.name === bName);
      if (bi < 0) return null;
      const pi = D.boulders[bi].problems.find(i => D.problems[i].name === pName);
      return pi == null ? null : pi;
    };
    const notebook = NOTEBOOK.map(n => ({ ...n, p: find(n.boulder, n.name) })).filter(n => n.p != null);
    const legends = new Map();
    for (const l of LEGENDS) { const p = find(l.boulder, l.name); if (p != null) legends.set(p, l.text); }
    c = { sectorOf, notebook, notebookSet: new Set(notebook.map(n => n.p)), legends, tags: D.problems.map(tagsOf),
      walkOf: D.boulders.map(b => (sectorOf.get(b.sector) || { walk_min: 30 }).walk_min) };
    dataCache.set(D, c);
    return c;
  }
  const seedCache = new Map();
  function seedOf(D, seed) {
    const key = seed + "|" + D.problems.length;
    let c = seedCache.get(key);
    if (c) return c;
    const r = stream(seed, "setup");
    const reserved = D.problems.map(() => r() < PARAMS.reserve.frac);
    // Who arrives in what order: Gus first, then the 600, locals more likely early.
    const keyed = D.climbers.map((cl, i) => [i, -Math.log(1 - r()) / (TYPE_WEIGHT[cl[2]] || 1)]).sort((a, b) => a[1] - b[1]);
    const order = ["n:gus", ...keyed.map(([i]) => "c" + i)];
    c = { reserved, order };
    seedCache.set(key, c);
    return c;
  }

  // ---- creating a world ----------------------------------------------------------
  function blankEst(D, p, extra) {
    return { by: "you", date: REOPENED, grade: D.problems[p].grade, reps: 0, rs: 0, rn: 0, logs: [], ...extra };
  }
  function create(D, seed, simDate = BEFORE) {
    const W = { seed, simDate, est: {}, found: [], npc: {}, hold: {}, news: [], snipe: { last: null } };
    for (const n of dataOf(D).notebook) W.est[n.p] = blankEst(D, n.p, { by: n.by, date: REOPENED, old: n.year });
    W.found = D.boulders.map((b, i) => [b, i]).filter(([b]) => b.sector === "The Tailgate").map(([, i]) => i);
    return W;
  }
  // What a new climber knows: the kiosk map's three areas and the notebook page.
  function initialKnow(D, date) {
    const k = { areas: {}, boulders: {}, lines: {}, looked: {}, newsSeen: date };
    for (const a of KIOSK_AREAS) if (dataOf(D).sectorOf.has(a)) k.areas[a] = 1;
    for (const n of dataOf(D).notebook) { k.lines[n.p] = { how: "kiosk", date }; k.boulders[D.problems[n.p].b] = 1; }
    return k;
  }

  // ---- the simulation ------------------------------------------------------------
  const news = (W, item) => { W.news.unshift(item); if (W.news.length > PARAMS.newsCap) W.news.length = PARAMS.newsCap; };
  const quality = p => Math.max(0.3, (p.stars ?? 2.3) / 3);
  function pickWeighted(r, items, weight) {
    let total = 0; const ws = items.map(x => { const w = Math.max(0, weight(x)); total += w; return w; });
    if (total <= 0) return -1;
    let u = r() * total;
    for (let i = 0; i < ws.length; i++) { u -= ws[i]; if (u <= 0 && ws[i] > 0) return i; }
    return ws.findLastIndex(w => w > 0);
  }
  function protectedLine(G, p, ctx) {
    return !!((G.know && G.know.lines[p]) || (G.ps && G.ps[p] && G.ps[p].att > 0) || (ctx.protect && ctx.protect.has(p)));
  }
  // An NPC able to establish p: arrived, active, strong enough. Style likes attract.
  function pickNpc(D, W, r, p, active, minLevelOver = -0.5) {
    const tags = dataOf(D).tags[p], grade = D.problems[p].grade;
    const ok = active.filter(w => { const i = whoInfo(D, w); return !i.old && i.level >= grade + minLevelOver; });
    if (!ok.length) return null;
    const k = pickWeighted(r, ok, w => { const i = whoInfo(D, w); const shared = tags.filter(t => i.likes.includes(t)).length; return (TYPE_WEIGHT[i.type] || 1) * (1 + 0.4 * shared) * (i.regular ? PARAMS.regularBoost : 1); });
    return k < 0 ? null : ok[k];
  }
  function establish(D, W, p, who, date, extra) {
    if (W.est[p]) return false;
    W.est[p] = blankEst(D, p, { by: who, date, ...extra });
    if (W.npc[who]) W.npc[who].fas++;
    return true;
  }

  function stepDay(D, G, d, ctx) {
    const W = G.world, P = PARAMS, r = stream(W.seed, "day|" + d), dd = dataOf(D), sd = seedOf(D, W.seed);
    const events = [];
    const dayNo = ctx.dayNoAt(d);
    const clock = dayNo + P.calendarWeight * Math.max(0, daysBetween(REOPENED, d));
    const estKeys = Object.keys(W.est);
    const estN = estKeys.filter(k => W.est[k].date <= d).length;
    const playerFas = estKeys.filter(k => W.est[k].by === "you" && W.est[k].date <= d).length;

    // Arrivals: the community grows with the crag and with word of your FAs.
    const C = P.community;
    const want = Math.min(sd.order.length, Math.floor(C.base + C.perEstablished * estN + C.perPlayerFa * Math.sqrt(playerFas)));
    const fromOrder = Object.keys(W.npc).filter(w => !CLIMBING_REGULARS.includes(w)).length;
    for (let n = fromOrder, added = 0; n < want && added < C.maxArrivalsPerDay; n++, added++) {
      const w = sd.order[n]; W.npc[w] = { arrived: d, fas: 0 };
      if (whoInfo(D, w).type === "local_hero") { const it = { date: d, kind: "arrival", by: w }; news(W, it); events.push(it); }
    }
    // The regulars turn up as you start climbing here.
    for (const w of CLIMBING_REGULARS) if (!W.npc[w] && dayNo >= NAMED[w.slice(2)].arrive) {
      W.npc[w] = { arrived: d, fas: 0 };
      const it = { date: d, kind: "arrival", by: w }; news(W, it); events.push(it);
    }
    const active = Object.keys(W.npc);

    // Exploring: the community finds boulders, nearest first; yours become theirs (word spreads).
    // Word of the boulders you've found spreads after a while (straight away for
    // ones you were told about, since someone already knew).
    const E = P.explore, found = new Set(W.found), spreadBy = addDays(d, -E.spreadDays);
    const looked = (G.know && G.know.looked) || {};
    if (G.know) for (const b of Object.keys(G.know.boulders)) if (!found.has(+b) && (!looked[b] || looked[b] <= spreadBy)) { found.add(+b); W.found.push(+b); }
    const sectorsFound = new Set([...found].map(b => D.boulders[b].sector));
    W.areas = W.areas || {};
    for (const s of sectorsFound) if (!W.areas[s]) W.areas[s] = [d, dayNo];
    // The community ventures further out as the season goes on.
    const reach = E.reach.start + E.reach.perDay * Math.max(0, daysBetween(REOPENED, d));
    const expect = active.length * E.perNpc;
    let nExplore = Math.min(E.maxPerDay, Math.floor(expect) + (r() < expect % 1 ? 1 : 0));
    while (nExplore-- > 0) {
      const unfound = D.boulders.map((b, i) => i).filter(i => !found.has(i) && dd.walkOf[i] <= reach);
      if (!unfound.length) break;
      const k = pickWeighted(r, unfound, i => Math.exp(-dd.walkOf[i] / E.walkScale) * (sectorsFound.has(D.boulders[i].sector) ? 3 : 1));
      if (k < 0) break;
      const b = unfound[k]; found.add(b); W.found.push(b);
      const s = D.boulders[b].sector;
      if (!sectorsFound.has(s)) {
        sectorsFound.add(s); W.areas[s] = [d, dayNo];
        const it = { date: d, kind: (AREAS[s] || {}).origin === "community" ? "named" : "found", s, b };
        news(W, it); events.push(it);
      }
    }

    const wet = ctx.today && ctx.today.date === d ? !!ctx.today.wet : r() >= P.dryDays;
    if (!wet) {
      // First ascents, towards the development target.
      const A = ctx.ability, NB = P.nextBand;
      const lineWeight = (p, gated = true) => {
        const pr = D.problems[p], q = quality(pr);
        let w = q * q;
        if (gated) w *= sigmoid((clock - P.gate.perGrade * pr.grade) / P.gate.soft);
        if (sd.reserved[p]) w *= P.reserve.weight;
        if (pr.grade > A + NB.lo && pr.grade <= A + NB.hi) w *= NB.weight;
        return w;
      };
      const open = [], climbedIn = new Set(Object.keys(W.est).map(k => D.boulders[D.problems[k].b].sector));
      for (const b of found) for (const p of D.boulders[b].problems) if (!W.est[p] && !protectedLine(G, p, ctx)) open.push(p);
      const target = D.problems.length * P.target.max * (1 - Math.exp(-clock / P.target.tau));
      let nFa = Math.min(P.maxFasPerDay, active.length * P.fasPerNpc, Math.max(0, target - estN) * P.closeRate);
      if (open.length) nFa = Math.max(nFa, P.trickle);
      nFa = Math.floor(nFa) + (r() < nFa % 1 ? 1 : 0);
      for (let tries = 0; nFa > 0 && open.length && tries < nFa * 4; tries++) {
        const k = pickWeighted(r, open, p => lineWeight(p));
        if (k < 0) break;
        const p = open[k], who = pickNpc(D, W, r, p, active);
        if (!who) continue;
        open.splice(k, 1); nFa--;
        establish(D, W, p, who, d);
        const s = D.boulders[D.problems[p].b].sector, first = !climbedIn.has(s); climbedIn.add(s);
        if (D.problems[p].grade >= 6 || who.startsWith("n:") || first) { const it = { date: d, kind: "fa", p, by: who, ...(first ? { first: true } : {}) }; news(W, it); events.push(it); }
      }
      // Now and then a strong local puts up something hard, early.
      const PR = P.prodigy;
      if (r() < PR.chance) {
        const heroes = active.filter(w => { const i = whoInfo(D, w); return i.type === "local_hero" && i.level >= PR.minLevel; });
        if (heroes.length) {
          const hero = heroes[Math.floor(r() * heroes.length)], lvl = whoInfo(D, hero).level;
          const hard = open.filter(p => D.problems[p].grade >= PR.minGrade && D.problems[p].grade <= lvl);
          const k = pickWeighted(r, hard, p => lineWeight(p, false));
          if (k >= 0) { const p = hard[k]; establish(D, W, p, hero, d); const it = { date: d, kind: "fa", p, by: hero, early: true }; news(W, it); events.push(it); }
        }
      }
      // Rarely, and only as a story: someone sends a line you found and left alone.
      const S = P.snipe;
      if (S.on && !ctx.noSnipe && G.know && dayNo >= S.minDay && (W.snipe.last == null || dayNo - W.snipe.last >= S.cooldown) && r() < S.chance) {
        const lastTouch = p => { const l = G.know.lines[p], log = G.ps && G.ps[p] && G.ps[p].log; let t = l.date; if (Array.isArray(log) && log.length) { const x = String(log[log.length - 1][0]); if (x > t) t = x; } return t; };
        const idle = Object.keys(G.know.lines).map(Number).filter(p => !W.est[p] && !dd.notebookSet.has(p) && lastTouch(p) <= addDays(d, -S.idleDays));
        const k = pickWeighted(r, idle, p => quality(D.problems[p]));
        if (k >= 0) {
          const p = idle[k], who = pickNpc(D, W, r, p, active, 0);
          if (who) { establish(D, W, p, who, d, { snipe: true }); W.snipe.last = dayNo; const it = { date: d, kind: "snipe", p, by: who }; news(W, it); events.push(it); }
        }
      }
      // Repeats: established problems get climbed, rated, and some become classics.
      const RP = P.repeats, estList = Object.keys(W.est).map(Number).filter(p => W.est[p].date <= d);
      const climbers = Math.round(active.length * RP.climbChance), total = climbers * RP.perClimber;
      if (estList.length && total > 0) {
        const cum = []; let acc = 0;
        for (const p of estList) { const pr = D.problems[p]; acc += (Math.log1p(pr.sends || 0) + 0.5) * quality(pr); cum.push(acc); }
        for (let n = 0; n < total; n++) {
          const u = r() * acc; let lo = 0, hi = cum.length - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
          const p = estList[lo], e = W.est[p], pr = D.problems[p];
          const who = active[Math.floor(r() * active.length)], info = whoInfo(D, who);
          if (who === e.by || info.old || info.level < pr.grade - 1) continue;
          e.reps++;
          let stars = null;
          if (r() < RP.rateChance) { stars = Math.max(0, Math.min(4, Math.round((pr.stars ?? 2.3) + (r() - 0.5) * 1.6))); e.rs += stars; e.rn++; }
          const sugg = r() < 0.25 ? Math.max(0, pr.grade + (r() < 0.5 ? -1 : 1)) : null;
          e.logs.unshift([who, d, info.level - pr.grade > 2 && r() < 0.5 ? "F" : "S", stars, sugg]);
          if (e.logs.length > P.logsCap) e.logs.length = P.logsCap;
          if (!e.classic && e.reps >= P.classic.reps && e.rn && e.rs / e.rn >= P.classic.stars) { e.classic = d; const it = { date: d, kind: "classic", p }; news(W, it); events.push(it); }
        }
      }
    }
    return events;
  }
  // Run the community forward through `upTo`. Days already simulated are skipped,
  // so calling this again (or after a reload) changes nothing.
  function step(D, G, upTo, opts = {}) {
    const W = G.world;
    if (!W || !isDay(upTo)) return [];
    const ctx = {
      dayNoAt: opts.dayNoAt || (() => G.dayNo || 0),
      ability: Mech ? Mech.ability(G.player.xp) : 0,
      protect: opts.protect || null, noSnipe: !!opts.noSnipe, today: opts.today || null,
    };
    const events = [];
    for (let d = addDays(W.simDate, 1), guard = 0; d <= upTo && guard < 4000; d = addDays(d, 1), guard++) {
      events.push(...stepDay(D, G, d, ctx));
      W.simDate = d;
    }
    return events;
  }

  // The player sends p for the first time. Returns { fa: true } when nobody had
  // documented it yet: it's now theirs, permanently.
  function recordSend(D, G, p, date, flash) {
    const W = G.world;
    if (!W) return { fa: false };
    const e = W.est[p];
    if (!e) {
      W.est[p] = blankEst(D, p, { by: "you", date, ...(flash ? { flash: true } : {}) });
      const b = D.problems[p].b; if (!W.found.includes(b)) W.found.push(b);
      news(W, { date, kind: "fa", p, by: "you" });
      return { fa: true };
    }
    if (e.by !== "you") e.reps++;
    return { fa: false };
  }
  const isMine = (G, p) => !!(G.world && G.world.est[p] && G.world.est[p].by === "you");
  // Name (or rename) one of your own first ascents: the only change the ledger
  // allows to a record once it's written. The curated name is the default, so
  // choosing it (or nothing usable) stores no name. Returns the name now shown.
  function nameFa(D, G, p, name) {
    if (!isMine(G, p)) return null;
    const e = G.world.est[p], t = cleanName(name), curated = D.problems[p].name;
    if (!t || t === curated) delete e.name; else e.name = t;
    return e.name || curated;
  }
  const faCount = G => (G.world ? Object.values(G.world.est).filter(e => e.by === "you").length : 0);

  // Names the player gives problems: any letters, digits, punctuation or emoji,
  // without control or direction-override characters or < >. 1–40 characters,
  // at least one letter or digit. Returns "" when nothing usable is left.
  function cleanName(s) {
    if (typeof s !== "string") return "";
    let t = s.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏<>]/g, "").replace(/\s+/g, " ").trim();
    t = Array.from(t).slice(0, 40).join("").trim();
    return /[\p{L}\p{N}]/u.test(t) ? t : "";
  }

  // ---- v1 -> v2 -------------------------------------------------------------------
  // Deterministic (seeded by the save's id) and done once: the result has v: 2.
  // Your sends become your first ascents, what you've tried becomes identified
  // lines, where you've been becomes visited, and the community's history is
  // filled in up to the save's date without ever touching your lines. XP,
  // levels, ticks and projects stay exactly as they were.
  function migrate(D, g) {
    if (!g || g.v !== 1) return g;
    const dd = dataOf(D);
    g.world = create(D, seedFrom("v1|" + (g.id || "climber")));
    const first = new Map();
    for (const t of [...g.ticks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)))
      if (t.style !== "Repeat" && !first.has(t.p)) first.set(t.p, t);
    for (const [p, t] of first) if (!dd.notebookSet.has(p) && !g.world.est[p])
      g.world.est[p] = blankEst(D, p, { by: "you", date: t.date, ...(t.style === "Flash" ? { flash: true } : {}) });
    const k = g.know = initialKnow(D, g.date);
    const firstTry = p => { const log = g.ps[p] && g.ps[p].log; return Array.isArray(log) && log.length && isDay(String(log[0][0])) ? String(log[0][0]) : (first.get(+p) || {}).date || g.date; };
    for (const [p, st] of Object.entries(g.ps || {})) if (st && st.att > 0 && !k.lines[p]) k.lines[p] = { how: "migrated", date: firstTry(p) };
    for (const t of g.tips || []) if (!k.lines[t.p]) k.lines[t.p] = { how: "told", date: isDay(t.date) ? t.date : g.date, from: "c" + t.from };
    for (const p of g.todo || []) if (!k.lines[p]) k.lines[p] = { how: "told", date: g.date };
    for (const p of first.keys()) if (!k.lines[p]) k.lines[p] = { how: "migrated", date: first.get(p).date };
    for (const [p, st] of Object.entries(g.ps || {})) if (st && st.att > 0) { k.boulders[D.problems[p].b] = 2; k.looked[D.problems[p].b] = g.date; }
    if (g.loc && Number.isInteger(g.loc.boulder)) k.boulders[g.loc.boulder] = 2;
    for (const p of Object.keys(k.lines)) { const b = D.problems[p].b; if (!k.boulders[b]) k.boulders[b] = 1; }
    for (const s of g.visited || []) if (dd.sectorOf.has(s)) k.areas[s] = 2;
    for (const [b, v] of Object.entries(k.boulders)) { const s = D.boulders[b].sector; k.areas[s] = Math.max(k.areas[s] || 0, v); }
    // Your climbing days, as dated by your ticks and sessions, pace the catch-up.
    const days = new Set();
    for (const t of g.ticks) if (isDay(t.date)) days.add(t.date);
    for (const st of Object.values(g.ps || {})) for (const e of (st && st.log) || []) if (isDay(String(e[0]))) days.add(String(e[0]));
    const sorted = [...days].sort(), total = Math.max(1, sorted.length), dn = g.dayNo || 0;
    const dayNoAt = d => { let n = 0; for (const x of sorted) { if (x <= d) n++; else break; } return Math.round(dn * n / total); };
    const protect = new Set([...Object.keys(k.lines).map(Number), ...first.keys()]);
    step(D, g, g.date, { dayNoAt, protect, noSnipe: true });
    // Today's encounter and last result are text written under the old rules
    // (they can name lines that are now unclimbed), so they go.
    if (g.day) { g.day.encounter = null; g.day.last = null; }
    g.v = 2; g.rules = 1;
    g.world.migrated = { from: 1, on: g.date };
    return g;
  }

  // ---- checking ---------------------------------------------------------------------
  // Structural validation of a v2 save's world and knowledge (save files are
  // untrusted). Returns null when fine, or what's wrong.
  function validate(D, g) {
    const nP = D.problems.length, nB = D.boulders.length;
    const isP = k => /^\d+$/.test(k) && +k < nP, num = x => typeof x === "number" && isFinite(x);
    const W = g.world, k = g.know;
    if (!W || typeof W !== "object" || !k || typeof k !== "object") return "missing world or knowledge";
    if (typeof W.seed !== "string" || !/^[a-z0-9]{1,40}$/.test(W.seed) || !isDay(W.simDate)) return "bad seed or simDate";
    if (![1, 2].includes(g.rules)) return "bad rules";
    if (!W.est || typeof W.est !== "object") return "bad ledger";
    for (const [p, e] of Object.entries(W.est)) {
      if (!isP(p) || !e || !isWho(e.by) || !isDay(e.date) || !Number.isInteger(e.grade) || !num(e.reps) || !num(e.rs) || !num(e.rn) || !Array.isArray(e.logs)) return "bad ledger entry " + p;
      if (e.name != null && (typeof e.name !== "string" || cleanName(e.name) !== e.name)) return "bad problem name";
      if (e.logs.length > 20 || !e.logs.every(l => Array.isArray(l) && isWho(l[0]) && isDay(l[1]))) return "bad logs";
    }
    if (!Array.isArray(W.found) || !W.found.every(b => Number.isInteger(b) && b >= 0 && b < nB)) return "bad found";
    if (!W.npc || typeof W.npc !== "object" || !Object.entries(W.npc).every(([w, n]) => isWho(w) && n && isDay(n.arrived) && num(n.fas))) return "bad npcs";
    if (!Array.isArray(W.news) || W.news.length > 400) return "bad news";
    if (!W.snipe || !(W.snipe.last == null || num(W.snipe.last))) return "bad snipe";
    if (!W.hold || typeof W.hold !== "object") return "bad hold";
    if (W.areas != null && (typeof W.areas !== "object" || !Object.values(W.areas).every(a => Array.isArray(a) && isDay(a[0]) && num(a[1])))) return "bad areas found";
    const lv = v => v === 1 || v === 2;
    if (!k.areas || !Object.entries(k.areas).every(([s, v]) => typeof s === "string" && lv(v))) return "bad areas";
    if (!k.boulders || !Object.entries(k.boulders).every(([b, v]) => /^\d+$/.test(b) && +b < nB && lv(v))) return "bad boulders";
    if (!k.lines || !Object.entries(k.lines).every(([p, l]) => isP(p) && l && isDay(l.date) && ["spot", "told", "tried", "migrated", "kiosk", "dev"].includes(l.how) && (l.from == null || isWho(l.from)))) return "bad lines";
    if (!isDay(k.newsSeen)) return "bad newsSeen";
    if (k.told != null && (typeof k.told !== "object" || !Object.values(k.told).every(t => t && isDay(t.date) && isWho(t.from)))) return "bad told";
    if (k.met != null && (typeof k.met !== "object" || !Object.entries(k.met).every(([w, m]) => isWho(w) && m && num(m.n) && isDay(m.first) && (m.last == null || isDay(m.last)) && (m.pets == null || num(m.pets)) && (m.chats == null || num(m.chats))))) return "bad met";
    if (k.looked != null && (typeof k.looked !== "object" || !Object.entries(k.looked).every(([b, d]) => /^\d+$/.test(b) && +b < nB && isDay(d)))) return "bad looked";
    return null;
  }
  // The ledger's invariants (tests and dev mode). Returns a list of problems found.
  function check(D, G) {
    const out = [], W = G.world, k = G.know;
    if (!W || !k) return ["not a v2 save"];
    const dd = dataOf(D);
    const sentOn = new Map();
    for (const t of G.ticks) if (t.style !== "Repeat" && !sentOn.has(t.p)) sentOn.set(t.p, t.date);
    for (const [p, e] of Object.entries(W.est)) {
      if (e.date < REOPENED) out.push(`#${p} is dated before the reopening`);
      if (e.date > G.date) out.push(`#${p} is dated in the future`);
      if (e.by === "you" && sentOn.get(+p) !== e.date) out.push(`#${p} is your FA but your first send isn't on ${e.date}`);
      if (e.by !== "you" && !dd.notebookSet.has(+p) && sentOn.has(+p) && sentOn.get(+p) < e.date) out.push(`#${p} was FA'd by ${e.by} after you sent it`);
      if (e.old && !dd.notebookSet.has(+p)) out.push(`#${p} has an old-era FA but isn't on the notebook page`);
    }
    for (const p of Object.keys(k.lines)) { const b = D.problems[p].b; if (!k.boulders[b]) out.push(`line #${p} is known but its boulder isn't`); }
    for (const b of Object.keys(k.boulders)) { const s = D.boulders[b].sector; if (!k.areas[s]) out.push(`boulder #${b} is known but its area isn't`); }
    if (W.simDate > G.date) out.push("the simulation has run past today");
    for (const [p, l] of Object.entries(k.lines)) { const e = W.est[p]; if (e && e.by !== "you" && !dd.notebookSet.has(+p) && e.date > l.date && !e.snipe) out.push(`#${p} was taken by ${e.by} after you'd found it`); }
    return out;
  }

  // ---- for the problem page and the dev panel ------------------------------------------
  function faText(D, e) {
    if (!e) return "";
    if (e.old) return e.by === "n:anon" ? "unrecorded, the 1970s (from the kiosk notebook)" : `${whoName(D, e.by)}, ${e.old} (from the kiosk notebook)`;
    return e.by === "you" ? "you" : whoName(D, e.by);
  }
  const legendOf = (D, p) => dataOf(D).legends.get(p) || null;
  function devRevealAll(D, G) {
    const k = G.know;
    for (const s of D.sectors) k.areas[s.name] = 2;
    D.boulders.forEach((b, i) => { k.boulders[i] = 2; });
    D.problems.forEach((p, i) => { if (!k.lines[i]) k.lines[i] = { how: "dev", date: G.date }; });
  }
  function devEstablish(D, G, p, who) {
    const W = G.world;
    if (!W || W.est[p]) return false;
    who = who || Object.keys(W.npc)[0] || "n:gus";
    establish(D, W, p, who, G.date);
    news(W, { date: G.date, kind: "fa", p, by: who, dev: true });
    return true;
  }

  const World = { REOPENED, BEFORE, PARAMS, NAMED, CLIMBING_REGULARS, NOTEBOOK, LEGENDS, AREAS, KIOSK_AREAS,
    create, initialKnow, step, recordSend, migrate, validate, check, cleanName, isMine, nameFa, faCount, isWho, whoInfo, whoName,
    faText, legendOf, devRevealAll, devEstablish, seedFrom, newSeed, stream, addDays, daysBetween, notebook: D => dataOf(D).notebook };
  if (typeof module !== "undefined") module.exports = World; else root.World = World;
})(typeof window !== "undefined" ? window : globalThis);
