// Granite Hollow: the game. Rules of climbing live in mechanics.js (Mech);
// this file is the world, the UI, and the save game.
(function () {
  "use strict";
  const SAVE_KEY = "granite-hollow-save-v1";
  // The page's version (game.js?v=N), passed on to the data files it fetches, so a
  // new version never runs on a copy of the crag the browser kept from the last one.
  const ASSET_V = (() => { try { const v = new URL(document.currentScript.src).searchParams.get("v"); return v ? "?v=" + encodeURIComponent(v) : ""; } catch (e) { return ""; } })();
  // Development mode (?dev, remembered for the tab; ?dev=0 leaves it): its own save
  // slot, the Phase 2 rules for new climbers, the dev tools, and never the leaderboard.
  const DEV = (() => { try { const q = new URLSearchParams(location.search); if (q.has("dev")) sessionStorage.setItem("gh-dev", q.get("dev") === "0" ? "0" : "1"); return sessionStorage.getItem("gh-dev") === "1"; } catch (e) { return false; } })();
  const SLOT = DEV ? "granite-hollow-save-dev" : SAVE_KEY;
  // The Phase 2 rules (v2 saves: a crag that develops as you play). New climbers
  // start under them, and old (v1) climbers are converted when they load, keeping
  // a copy of the old save in this browser. In development mode the dev panel can
  // still start climbers under the old rules, for testing.
  const RULES2_LIVE = true;
  const OLD_RULES_COPY = "granite-hollow-save-before-reopening";
  // Phase 3's balance (docs/phase3/stage0-design.md): saves carry bal: 3. Older ones
  // are converted once on load (regrade), keeping a copy of the climber as they were.
  const BAL_NOW = 3, OLD_BALANCE_COPY = "granite-hollow-save-before-regrade";
  const REPEATS_XP = 3;                    // repeats earn XP this many times a day
  const justRegraded = new WeakMap();      // saves regraded this session: what changed, for the welcome back
  const rulesLive = () => RULES2_LIVE && !(DEV && devRules() === 1);
  const justMigrated = new WeakSet();      // saves converted this session: they get a welcome back
  const START_DATE = "2025-09-06";
  const START_AREA = "The Tailgate";      // every climbing day starts in the lot, which is part of The Tailgate
  const PARK_SPOT = [-20, -4.6];          // where every day starts, in the lot's north row by the trailhead end (your car's two spaces along: art.js)
  const WORLD_MIN_ZOOM = 3.2;              // the world view never zooms out past an area; the paper map shows the park
  const fmt = d3.format(",");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const signed = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);

  const STYLE = {
    crimpy: ["Crimps", "Small sharp edges"], slopey: ["Slopers", "Round holds; friction matters"],
    pinchy: ["Pinches", "Squeezing with the thumb"], juggy: ["Jugs", "Big holds, steep pulling"],
    compression: ["Compression", "Squeezing features apart"], dyno: ["Dynos", "Jumping for holds"],
    technical: ["Technical", "Precise feet and body position"], powerful: ["Power", "Big, hard moves"],
    mantle: ["Mantles", "Pressing over the top"], slab: ["Slab", "Low-angle, trust your feet"],
    overhang: ["Overhangs", "Steep walls"], roof: ["Roofs", "Horizontal ceilings and lips"],
    traverse: ["Traverses", "Long sideways problems"], eliminate: ["Eliminates", "Problems with off-limits holds"],
    highball: ["Highballs", "Tall, scary top-outs"],
  };
  const CRUX = {
    crimpy: "Your fingers peeled off the razor crimp.", slopey: "The sloper felt like glass and you slid off.",
    pinchy: "The pinch spat you off.", juggy: "You pumped out between jugs.", compression: "You couldn't hold the squeeze.",
    dyno: "You came up an inch short on the dyno.", technical: "Your foot skated off a tiny edge.",
    powerful: "You couldn't lock off for the big move.", mantle: "You flailed on the mantle.",
    slab: "Your feet popped on the slab.", overhang: "Your feet cut on the steep section and you dropped.",
    roof: "You couldn't turn the lip.", traverse: "You pumped out halfway across.",
    highball: "You backed off the committing top-out.", eliminate: "You dabbed an off-route hold.",
    reachy: "The next hold was just out of reach.", bunchy: "You couldn't fit into the cramped start.",
  };
  // A better way through a crux (Mech.sequence's alt): what you see when you find
  // it yourself, and how a local tells you.
  const ALT = {
    extra: { see: "there's a little intermediate hold, just right for someone your size.", tip: "There's a tiny intermediate at the crux. Shorter folks use it." },
    skip: { see: "you're tall enough to reach straight past the cramped hold.", tip: "You're tall enough to skip the cramped hold at the crux. Just reach past it." },
    heel: { see: "a heel hook takes the weight off your arms.", tip: "Heel hook at the crux. It takes all the weight off your arms." },
    toe: { see: "a toe hook keeps your feet from cutting.", tip: "Toe hook at the crux and your feet won't cut." },
    knee: { see: "there's a knee bar. You can almost let go.", tip: "There's a knee bar at the crux. You can almost let go." },
    drop: { see: "a drop-knee turns it into an easy reach.", tip: "Drop-knee at the crux and it turns into a reach." },
    match: { see: "if you match on the hold first, the next move is easy.", tip: "Match on the crux hold before you go for the next one." },
    foot: { see: "there's a better foothold, low and left.", tip: "There's a better foot at the crux, low and left." },
  };
  const an = w => (/^[aeiou]/.test(w) ? "an " : "a ") + w;
  // Why you came off: the move you fell on, in climbers' words.
  function fallText(p, m, k) {
    if (!m) return "You came off.";
    if (m.kind === "crux") {
      const tag = m.reach === "long" ? "reachy" : m.reach === "tight" ? "bunchy" : m.style;
      return CRUX[tag] || `You came off the crux, a hard move to ${an(m.hold)}.`;
    }
    if (m.kind === "top") return CRUX[m.style] || "You couldn't top it out.";
    if (m.hold === "smear") return m.kind === "start" ? "Your feet skated off the slab on the first move." : "A smear let go under your foot.";
    if (m.kind === "start") return p.sit ? "You couldn't even get off the ground from the sit start." : `You slipped off ${an(m.hold)} on the first move.`;
    return [`You came off ${an(m.hold)} on the way up.`, `A foot slipped on an easy move to ${an(m.hold)}.`, `You fumbled the ${m.hold} and dropped.`][k % 3];
  }
  // Pickles at the crag with you (Phase 4, Stage 5): no help at all, and the best company.
  const DOG_FALL = ["Pickles lifts his head, checks you're all right, and goes back to sleep.", "Pickles has moved onto your pad while you weren't looking. You land next to him.",
    "Pickles watches the whole thing with deep concern, then yawns.", "Pickles barks once, encouragingly. Or at a squirrel. Hard to say.", "Pickles is lying on the spot you were going to put your foot."];
  const DOG_SEND = ["Pickles wakes up and wags at you from the pad.", "Pickles trots round the boulder to meet you at the top of the walk-off.", "Pickles barks, delighted, at nothing in particular. It feels like it's for you.",
    "Pickles brings you a stick to celebrate."];
  const LEVEL_LINES = [
    "", "The holds are starting to make sense.", "You've stopped over-gripping the jugs.",
    "Most people who try bouldering never get here.", "You're reading sequences before you pull on.",
    "Locals are starting to ask you for beta.", "Finger strength is officially a hobby now.",
    "The Hollow's test pieces are within reach.", "You're one of the strong ones at the crag.",
    "Strong enough that the guidebook's hardest page is your to-do list.",
  ];

  let D = null, G = null, M = null;    // data, game state, map
  // What the player knows (knowledge.js): every screen gets names, grades and
  // lists from it. Under the old rules (a v1 save) it knows everything, so the
  // game reads exactly as it always has.
  let K = null;
  const v2 = () => !!(G && G.v === 2 && G.world);
  const pname = i => K.name(i) ?? "an unfamiliar line";
  const vg = i => { const g = K.grade(i); return g == null ? "" : "V" + g; };
  const titleOf = i => (vg(i) ? `${pname(i)}, ${vg(i)}` : pname(i));          // "Name, V3"
  const nameGrade = i => (vg(i) ? `${vg(i)} ${pname(i)}` : pname(i));         // "V3 Name"
  const pref = i => (K.line(i) === "open" ? "the " + pname(i).charAt(0).toLowerCase() + pname(i).slice(1) : pname(i));   // in a sentence
  const gradeSpan = (i, style = "") => { const g = K.grade(i); return `<span class="grade"${style}${g == null ? ' title="Not climbed yet, so no grade"' : ""}>${g == null ? "?" : "V" + g}</span>`; };
  const UI = { tab: "here", expanded: new Set(), cl: { q: "", sector: "", lo: 0, hi: 13, sort: "logs", problem: null, view: "problems", done: "" }, pj: { view: null, sort: "recent" }, rk: { window: "12m", height: "", open: null, n: 25, by: "fa" }, busy: false, confirmReset: false };

  // ====================================================================== data
  function prepData() {
    D.sectorBy = new Map(D.sectors.map(s => [s.name, s]));
    // The old trails (Phase 4, Stage 7), for the map to draw (hidden until Trail Day reopens them).
    D.oldTrails = World.OLD_TRAILS.map(t => { const a = D.sectorBy.get(t.a), b = D.sectorBy.get(t.b); return a && b ? { to: "old:" + t.id, old: t.id, start: [a.x, a.y], end: [b.x, b.y] } : null; }).filter(Boolean);
    D.sectorProblems = new Map(D.sectors.map(s => [s.name, []]));
    D.boulders.forEach((b, i) => { b.id = i; });
    D.problems.forEach((p, i) => {
      p.id = i; p.boulder = D.boulders[p.b]; p.sector = p.boulder.sector;
      p.tagList = Mech.tagsOf(p); p.seq = Mech.sequence(p); p.moves = p.seq.n;
      D.sectorProblems.get(p.sector).push(i);
    });
    for (const s of D.sectors) {
      const ps = D.sectorProblems.get(s.name).map(i => D.problems[i]);
      s.lo = d3.min(ps, p => p.grade); s.hi = d3.max(ps, p => p.grade);
      s.boulderIds = D.boulders.filter(b => b.sector === s.name).map(b => b.id);
    }
    // Each local's sends, for the CragLog rankings: [problem, days since send_epoch, flash] triples.
    D.npcSends = D.sends.map(flat => { const out = []; for (let k = 0; k < flat.length; k += 3) out.push({ p: flat[k], d: flat[k + 1], f: flat[k + 2] === 1 }); return out; });
    // Who climbs where: NPCs show up in sectors where they've logged favourites.
    D.npcsBySector = new Map(D.sectors.map(s => [s.name, []]));
    D.liked.forEach((list, ci) => {
      const seen = new Set();
      for (const pi of list) { const s = D.problems[pi].sector; if (!seen.has(s)) { seen.add(s); D.npcsBySector.get(s).push(ci); } }
    });
  }
  const nodeXY = name => name === "Parking" || name == null ? [0, 0] : [D.sectorBy.get(name).x, D.sectorBy.get(name).y];
  const walkOf = name => name === "Parking" || name == null ? 0 : D.sectorBy.get(name).walk_min;
  function ancestors(name) {
    const out = [name ?? "Parking"];
    while (out[out.length - 1] !== "Parking") out.push(D.sectorBy.get(out[out.length - 1]).parent);
    return out;
  }
  // Trail route between two places (null = the parking lot).
  function route(from, to) {
    const a = ancestors(from), b = ancestors(to);
    const lca = a.find(n => b.includes(n));
    const up = a.slice(0, a.indexOf(lca) + 1), down = b.slice(0, b.indexOf(lca)).reverse();
    return { minutes: walkOf(from) - walkOf(lca) + walkOf(to) - walkOf(lca), nodes: [...up, ...down] };
  }
  const placeXY = loc => loc.boulder != null ? [D.boulders[loc.boulder].x, D.boulders[loc.boulder].y] : nodeXY(loc.sector);
  function walkMinutes(to) {
    if (M && M.minutesTo) return M.minutesTo(to);
    const from = G.loc;
    if (to.sector === from.sector) return to.boulder === from.boulder ? 0 : 1;
    return route(from.sector, to.sector).minutes + (to.boulder != null ? 1 : 0);
  }

  // ===================================================================== dates
  const toDate = s => new Date(s + "T12:00:00Z");
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monthOf = s => toDate(s).getUTCMonth();
  const prettyDate = s => toDate(s).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const shortDate = s => toDate(s).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const clock = m => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0"); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "AM" : "PM"}`; };

  // ================================================================ game state
  function newGame(opts) {
    const skills = Object.fromEntries(Mech.PREF.map(t => [t, 0]));
    for (const t of opts.strengths) skills[t] = 0.4;
    if (opts.weakness) skills[opts.weakness] = -0.4;
    G = {
      v: 1, id: newId(), bal: BAL_NOW, balStart: BAL_NOW,
      player: { name: opts.name, height: opts.height, ape: opts.ape, strengths: opts.strengths, weakness: opts.weakness,
        xp: 0, tops: [], skills, energy: 100, skin: 100, consecutive: 0 },
      date: START_DATE, dayNo: 0, loc: { sector: null, boulder: null },
      ps: {}, ticks: [], tips: [], todo: [], ach: {}, visited: [], feed: [], bestGrade: -1, board: { joined: false },
      day: null, learned: {},
    };
    if (rulesLive()) Object.assign(G, { v: 2, rules: 2, world: World.create(D, World.newSeed()), know: World.initialKnow(D, START_DATE) });
    if (DEV) G.dev = true;
    startDay(0, 0, true);
    if (v2()) UI.kiosk = true;                            // the trailhead kiosk greets a new climber
  }
  // The next few days' weather is rolled once and saved with the game, so the
  // forecast you plan your rest days around is the weather you get.
  const FORECAST_DAYS = 4;
  function forecast() {
    G.forecast = (G.forecast || []).filter(f => f.date > G.date);
    for (let k = 1; k <= FORECAST_DAYS; k++) {
      const date = addDays(G.date, k);
      if (!G.forecast.some(f => f.date === date)) G.forecast.push({ date, ...Mech.forecastDay(monthOf(date)) });
    }
    G.forecast.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (v2()) G.forecast = G.forecast.map(f => eventWeather(f));        // an event's day is always dry (Stage 7)
    return G.forecast.slice(0, FORECAST_DAYS);
  }
  function startDay(forward, rest, first = false) {
    if (!first) G.date = addDays(G.date, forward);
    // A climbing trip (after Phase 4): if it's time, you're away for two weeks and back this morning.
    let trip = null;
    if (!first && v2() && G.tripOffer && G.date >= G.tripOffer.leave) {
      if (G.tripOffer.yes && G.date < G.tripOffer.back) safely("the trip", () => { trip = goAway(); });
      G.tripOffer = null;
      if (trip) { G.date = trip.back; rest = Math.max(rest, 3); }
    }
    // The forecast's odds are rolled now: rain comes with exactly the chance it gave.
    const fc = !first && (G.forecast || []).find(f => f.date === G.date);
    const ev = v2() ? World.eventOn(G.date) : null;                    // a seasonal event: always dry (Stage 7)
    let w = fc ? Mech.realize(ev ? eventWeather(fc, G.date) : fc) : Mech.weather(monthOf(G.date));
    if (ev && !fc) { while (Mech.rainStart(w) != null) w = Mech.weather(monthOf(G.date)); w = eventWeather(w, G.date); }
    if (first) while (Mech.rainStart(w) === 0) w = Mech.weather(monthOf(G.date));   // day one is always climbable
    if (first) w = Mech.atLeast(w, 0.2);           // and good: plenty goes on your first day (play-test, 2026-11-26)
    G.forecast = (G.forecast || []).filter(f => f.date > G.date);
    const s = Mech.startOfDay(G.player, rest);
    Object.assign(G.player, s);
    G.dayNo++;
    G.loc = { sector: START_AREA, boulder: null };
    G.pos = PARK_SPOT.slice();                            // by your car in the lot
    if (!G.visited.includes(START_AREA)) G.visited.push(START_AREA);
    UI.recenter = true;                                   // the camera starts the day on you
    G.day = { no: G.dayNo, minute: 9 * 60 + Math.floor(Math.random() * 40), weather: w, startEnergy: s.energy,
      attempts: 0, sends: [], xp: 0, highpoints: 0, gains: {}, ach: [], met: [], encounter: null, last: null, bishop: !!ev || Math.random() < 0.13,
      over: false, warned: false, levelBefore: Mech.levelOf(G.player).level };
    const intro = first && v2()
      ? `You pull into the Granite Hollow lot on ${an(w.sky.toLowerCase())} September morning, ${w.temp}°F. The park reopened to climbing last week, after nearly forty years. The kiosk's trail map (press M) marks three climbing areas: The Tailgate, right here by the car, The Schoolhouse and Hawkwatch. Beside it, under glass, is a page from the old climbers' notebook listing four problems by the lot. Everything else is waiting for a first ascent.`
      : first
      ? `You pull into the Granite Hollow lot on ${an(w.sky.toLowerCase())} September morning, ${w.temp}°F. The boulders at The Tailgate are right beside the car. The trail map (press M) shows the rest of the park: The Schoolhouse is 5 minutes up the trail.`
      : `${w.sky}, ${w.temp}°F. ${w.note}`;
    G.day.last = { kind: "info", title: first ? "Welcome to Granite Hollow" : ev ? ev.name : `Day ${G.dayNo}`, text: intro };
    // Events (Stage 7): today's, or a poster for the next one; a busy lot on a prime weekend.
    if (ev && !first) G.day.last.text += " " + EVENT_INTRO[ev.key] + (ev.key === "trail" ? trailDayWords() : "");
    else if (v2() && !first) {
      const n = World.nextEvent(addDays(G.date, 1), 6);
      // The first day you see it, and again the day before (Stage 8: not every morning that week).
      if (n && G.poster !== n.date) G.day.last.text += ` Gus has put up a poster at the kiosk: ${n.name}, ${n.in === 0 ? "tomorrow" : longDay(n.date)}.`;
      else if (n && n.in === 0) G.day.last.text += ` Tomorrow: ${n.name}. Somebody has added a drawing of Pickles to the poster at the kiosk.`;
      if (n) G.poster = n.date;
      if (w.label === "Prime" && [0, 6].includes(toDate(G.date).getUTCDay()) && Mech.rainStart(w) == null) { G.day.busy = true; G.day.last.text += " Word's out that it's prime: the lot's busier than usual."; }
    }
    // Rained out: no climbing on wet granite, but the park's open (since the polish
    // after Phase 3): look around, find boulders, talk to people, brush lines for
    // when it dries. A day without climbing counts as rest.
    if (Mech.rainStart(w) === 0) {
      G.day.rainedOut = true;
      G.day.reason = `${w.pop != null ? `The ${Mech.rainChance(w)} came through, and the rock is soaked.` : `${w.precip === "Snow" ? "Snow" : "Rain"} all day.`} No climbing on wet granite, so it counts as a rest day.`;
      G.day.last.text += ` ${w.precip === "Snow" ? "It's snowing" : "It's raining"}, so there's no climbing today: wet granite is slick and holds can snap. The park's still open, though. Look around, find a boulder or two, talk to whoever's out, or brush a new line for when it dries. A day without climbing counts as a rest day.`;
      note(`Day ${G.dayNo}: rained out.`);
    } else note(`Day ${G.dayNo}: ${w.sky}, ${w.temp}°F, ${w.label.toLowerCase()} conditions.`);
    if (v2()) K.visitArea(START_AREA);
    // The community climbs too: every day since the last one is simulated, once.
    if (v2()) safely("the crag's history", () => {
      const ev = World.step(D, G, G.date, { today: { date: G.date, wet: !!G.day.rainedOut } });
      // Someone climbed a line you'd spotted (rare, and always told kindly).
      for (const it of ev.filter(x => x.kind === "snipe")) {
        const b = D.problems[it.p].boulder, who = World.whoName(D, it.by);
        G.day.last.text += ` Word from ${who}: they climbed ${pname(it.p)} on ${b.name}, the line you'd spotted. "Hope you don't mind. It's brilliant, you'll love it."`;
        note(`${who} made the first ascent of ${pname(it.p)}, a line you'd spotted.`);
      }
    });
    if (trip) safely("the trip", () => backFromTrip(trip));
    else if (v2()) safely("a climbing trip", makeTripOffer);
    if (v2() && !G.day.tripNote) safely("an invitation", makeInvite);
    if (v2()) safely("Pickles", startDogDay);
    // (Pickles used to be "waiting by the car" here while the map drew him asleep at
    // his rock. He's only ever where he's drawn now: go and find him. Phase 4, Stage 0.)
  }
  function note(text) { G.feed.unshift({ text, date: G.date, minute: G.day ? G.day.minute : 540 }); G.feed.length = Math.min(G.feed.length, 60); }
  function save() {
    try { localStorage.setItem(SLOT, JSON.stringify(G)); } catch (e) { /* storage can be unavailable */ }
    if (G && G.board && G.board.joined) syncBoard();
  }
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function load() { try { const s = localStorage.getItem(SLOT); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  const pstate = i => (G.ps[i] = G.ps[i] || { att: 0, beta: 0, sent: false, flash: false, best: 0, sends: 0 });
  const firstSends = () => G.ticks.filter(t => t.style !== "Repeat");
  const levelNow = () => Mech.levelOf(G.player);
  // Where and when you'd climb problem i (Stage 3): the conditions on its boulder
  // at this hour (shade, the warmth of the day), and what you've done about them:
  // dirty (nobody has climbed it and you haven't brushed it), brushed today, taped up.
  // (Gus scrubbed the lines by the lot for the reopening, so the Tailgate's are clean.)
  const isDirty = i => v2() && !G.world.est[i] && !(G.ps[i] && G.ps[i].clean) && D.problems[i].sector !== START_AREA;
  const shadeAt = b => Mech.shadeOf(D.boulders[b], monthOf(G.date));
  // later: minutes from now (a preview of what an action that takes time would do).
  function here(i, later = 0) {
    const w = G.day.weather, p = D.problems[i];
    return { ...w, cond: Mech.condAt(w, Math.min(G.day.minute + later, w.dusk), shadeAt(p.b)),
      dirty: isDirty(i), brushed: !!(G.day.brushed && G.day.brushed[i]), tape: !!G.day.tape, vibes: vibesNow().v };
  }
  const chanceFor = i => Mech.chanceOf(G.player, D.problems[i], G.ps[i], here(i));
  // What you've learned to do at the boulder (Stage 3; G.learned: { key: date }).
  // Under the old rules (development mode only) you know it all.
  const knows = k => !v2() || !!(G.learned && G.learned[k]);
  // "Send 2 more V7s or harder for V8", while your level waits for proof.
  const proofText = L => { const n = Mech.proofLeft(G.player); return `Send ${n} more V${L.level}${n === 1 ? "" : "s"} or harder for V${L.level + 1}`; };
  const reach = () => G.player.height + G.player.ape;

  // ============================================================ achievements
  const ACH = [
    ["first-send", "First Send", "Send any problem.", () => firstSends().length >= 1],
    ["flash", "Flash", "Send a problem on your first try.", () => G.ticks.some(t => t.style === "Flash")],
    ["v3", "Breaking into V3", "Send a V3.", () => G.bestGrade >= 3],
    ["v5", "V5 Club", "Send a V5.", () => G.bestGrade >= 5],
    ["v7", "Double Digits Are Calling", "Send a V7.", () => G.bestGrade >= 7],
    ["v9", "Crusher", "Send a V9.", () => G.bestGrade >= 9],
    ["v11", "Legend of the Hollow", "Send a V11.", () => G.bestGrade >= 11],
    ["projector", "Projector", "Send a problem after 10 or more attempts.", () => firstSends().some(t => t.att >= 10)],
    ["head-game", "Head Game", "Send a highball.", () => firstSends().some(t => D.problems[t.p].tagList.includes("highball"))],
    ["air-time", "Air Time", "Send a dyno.", () => firstSends().some(t => D.problems[t.p].tagList.includes("dyno"))],
    ["defy", "Defy Your Height", "Send a V3 or harder that's bad for your reach.", () => firstSends().some(t => D.problems[t.p].grade >= 3 && Mech.morph(G.player, D.problems[t.p]) <= -0.3)],
    ["big-day", "Big Day", "Send 10 new problems in one day.", () => G.day && G.day.sends.filter(s => s.style !== "Repeat").length >= 10],
    ["explorer", "Explorer", "Visit all 10 sectors.", () => G.visited.length >= D.sectors.length],
    ["good-beta", "Good Beta", "Send a climb a local recommended.", () => G.tips.some(t => t.done)],
    ["classics", "Classic Hunter", "Send 5 problems rated 3.3★ or better.", () => firstSends().filter(t => (K.stats(t.p).stars || 0) >= 3.3).length >= 5],
    ["pyramid", "Solid Pyramid", "At V3 or harder: 1 send at your max, 2 one grade below, 4 two below.", pyramidDone],
    ["winter", "Winter Warrior", "Climb in December, January or February.", () => G.day && G.day.attempts > 0 && [11, 0, 1].includes(monthOf(G.date))],
    ["flapper", "Flapper", "Tear a flapper. Ouch.", () => G.flapper === true],
    ["century", "Century", "Send 100 different problems.", () => firstSends().length >= 100],
    // First ascents (the new rules only; the fifth field hides them under the old).
    ["first-fa", "First Ascent", "Be the first to climb a line, and name it.", () => v2() && World.faCount(G) >= 1, true],
    ["fa-10", "Developer", "Make 10 first ascents.", () => v2() && World.faCount(G) >= 10, true],
    ["fa-hard", "Test Piece", "Make the first ascent of a V6 or harder.", () => v2() && Object.values(G.world.est).some(e => e.by === "you" && e.grade >= 6), true],
    ["fa-boulder", "Your Boulder", "Make the first ascent of every line on a boulder.", () => v2() && D.boulders.some(b => b.problems.length >= 2 && b.problems.every(i => World.isMine(G, i))), true],
  ];
  function pyramidDone() {
    const m = G.bestGrade; if (m < 3) return false;
    const c = g => firstSends().filter(t => D.problems[t.p].grade === g).length;
    return c(m) >= 1 && c(m - 1) >= 2 && c(m - 2) >= 4;
  }
  function checkAchievements() {
    for (const [id, name, desc, test] of ACH) {
      if (G.ach[id]) continue;
      let ok = false; try { ok = test(); } catch (e) { ok = false; }
      if (ok) { G.ach[id] = G.date; G.day.ach.push(name); toast(name, desc); note(`Achievement: ${name}.`); }
    }
  }

  // ================================================================== actions
  // Back after a long break: what you knew of the moves has faded a little. Checked
  // on the first try (burn or worked move) of a new session; true if it faded.
  function fadeIfAway(p, st) {
    const last = Array.isArray(st.log) && st.log[st.log.length - 1];
    return !st.sent && !!last && last[0] !== G.date && Mech.fade(p, st, Math.round((toDate(G.date) - toDate(String(last[0]))) / 864e5));
  }
  // Today's entry in a project's session log ([date, burns, best highpoint, sent]), made
  // if need be; null once it's sent (the Journal's projects only follow open ones).
  function sessionOf(st) {
    if (st.sent) return null;
    const lg = st.log = st.log || [];
    let sess = lg[lg.length - 1];
    if (!sess || sess[0] !== G.date) { sess = [G.date, 0, 0, 0]; lg.push(sess); if (lg.length > 20) lg.shift(); }
    return sess;
  }
  // A burn: from the bottom, under the rules. From the panel (Climb it, Repeat) it
  // shows its banner and dialogs itself; from the climbing scene (opts.scene), the
  // scene plays it first and opens the dialogs after (returned as next).
  // Returns { r, style, fa, next }, or null if nothing happened.
  function tryProblem(i, opts = {}) {
    if (UI.busy || G.day.over) return null;
    if (rainNow()) { toast("Too wet to climb", "Wet granite is slick and holds can snap. No climbing until another day.", "info"); return null; }
    const p = D.problems[i];
    if (G.loc.boulder !== p.b) { travel({ sector: p.sector, boulder: p.b }); return null; }
    const st = pstate(i);
    const faded = fadeIfAway(p, st);
    // Climb it brushes a dirty line first, once you know how.
    const brushed = !!opts.brush && knows("brush") && isDirty(i);
    if (brushed) { st.clean = true; G.day.minute += Mech.BAL.brushMin; noticed("n:juno", "clean", i); }
    const day = here(i);
    const cost = Mech.attemptCost(G.player, p, day);
    const r = Mech.attempt(G.player, p, st, day);
    if (v2() && p.tagList.includes("dyno") && nearNow("n:bea") && K.met("n:bea")) bond("n:bea", "dyno", i);
    if (v2() && p.grade >= levelNow().level + 1 && nearNow("n:dez") && K.met("n:dez")) bond("n:dez", "hard", i);
    G.player.energy = Math.max(0, G.player.energy - cost.energy);
    G.player.skin = Math.max(0, G.player.skin - cost.skin);
    G.day.minute += Math.round(cost.minutes);
    st.att++; G.day.attempts++;
    const sess = sessionOf(st);
    if (sess) sess[1]++;
    let out = { r, style: null, fa: false, next: [] };
    const gains = Mech.skillGains(G.player, p, r.sent);
    Mech.applySkills(G.player, gains);
    for (const [t, g] of Object.entries(gains)) G.day.gains[t] = (G.day.gains[t] || 0) + g;

    if (r.sent) {
      const first = !st.sent, flash = first && st.att === 1, newMax = first && p.grade > G.bestGrade;
      const openLabel = K.line(i) === "open" ? pname(i) : null;      // "Unclimbed crimpy slab", before it gets a name
      // Nobody had documented it: it's your first ascent, for good.
      const fa = first && v2() && World.recordSend(D, G, i, G.date, flash).fa;
      const tip = G.tips.find(t => t.p === i && !t.done);
      // A project's sessions (days tried, counting today) earn a bonus; repeats earn XP a few times a day.
      if (!first) G.day.repeats = (G.day.repeats || 0) + 1;
      const xp = !first && G.day.repeats > REPEATS_XP ? 0
        : Mech.sendXp(G.player, p, { first, flash, tip: !!tip && first, newMax, sessions: (st.log || []).length || 1 });
      const before = levelNow().level;
      G.player.xp += xp; G.day.xp += xp;
      st.sent = true; st.sends++; st.flash = st.flash || flash; st.sentOn = st.sentOn || G.date; st.best = 1;
      if (sess) { sess[2] = 1; sess[3] = 1; }
      if (first) { G.bestGrade = Math.max(G.bestGrade, p.grade); const t = G.player.tops = G.player.tops || []; t[p.grade] = (t[p.grade] || 0) + 1; }
      if (tip && first) tip.done = true;
      G.todo = G.todo.filter(t => t !== i || !first);
      const style = first ? (flash ? "Flash" : "Send") : "Repeat";
      if (first && p.tagList.some(t => !G.ticks.some(x => D.problems[x.p] && D.problems[x.p].tagList.includes(t)))) noticed("n:ade", "new", i);   // a style you've never sent (Ade)
      const pal = partnerNow();
      G.ticks.push({ p: i, date: G.date, day: G.dayNo, style, att: st.att, stars: null, ...(pal ? { with: pal } : {}) });
      if (pal) bond(pal, "sendWith", i);
      if (fa) noticed("n:hollis", "fa", i);                    // a new problem for CragLog (Hollis)
      G.day.sends.push({ p: i, style, xp, ...(fa ? { fa: true } : {}) });
      let text;
      if (flash) text = "Flash! You read every move from the ground.";
      else if (!first) text = xp ? "Fun to climb it again, but you won't learn much from a repeat." : "Fun to climb it again. You've done enough repeats today to learn anything more from them.";
      else if (st.att >= 10) text = `After ${st.att} tries it finally goes. That's what projecting feels like.`;
      else if (st.att >= 4) text = `Your ${ordinal(st.att)} try. Working out the beta paid off.`;
      else text = `You top out ${fa && openLabel ? "the " + openLabel.charAt(0).toLowerCase() + openLabel.slice(1) : pname(i)}.`;
      if (newMax) text += ` Your hardest send yet.`;
      if (fa) text += " Nobody had documented an ascent of it. It's your first ascent, and it's yours to name.";
      else if (first && v2() && G.world.est[i] && G.world.est[i].by !== "you") text += " " + ascentLine(i);
      if (tip && first) text += ` Good beta from ${whoOf(tip.from)}.`;
      if (pal) text += " " + pick(partnerSays(pal, "cheer"));
      if (eventToday() && eventToday().comp) text += ` Your comp card: ${World.compScore(G.day.sends, compGrade).score.toLocaleString("en-US")} points.`;
      G.day.last = { kind: "send", title: fa ? `First ascent on ${p.boulder.name}, V${p.grade}` : `${style === "Repeat" ? "Repeat" : "Sent"}: ${titleOf(i)}`, text, xp, gains, tick: G.ticks.length - 1, p: i };
      note(`${fa ? "First ascent:" : style} ${pname(i)}${vg(i) ? ` (${vg(i)})` : ""}, +${fmt(xp)} XP.`);
      if (fa) UI.faNote = G.feed[0];                        // renamed along with the problem
      if (!opts.scene) showBanner(fa ? "FA" : style, i, xp, fa ? `${p.boulder.name} · V${p.grade}` : null);
      // After the banner: name your first ascent, then the level-up, then (if the day's over) the summary.
      const after = levelNow().level, next = [];
      if (fa) next.push(() => nameDialog(i, { first: true, was: openLabel }));
      if (after > before) { next.push(() => showLevelUp(after)); (G.lvlOn = G.lvlOn || {})[after] = G.date; }
      out = { r, style, fa: !!fa, xp, next };
      if (next.length && !opts.scene) {
        UI.levelPending = true;
        setTimeout(() => { UI.levelPending = false; next.forEach(openModal); nextModal(); }, reduceMotion ? 0 : fa ? 1300 : 900);
      }
    } else {
      const k = r.fallAt + 1, frac = k / p.moves, newHigh = st.att > 1 && frac > st.best + 1e-6;
      if (frac > st.best) { st.best = frac; if (newHigh) G.day.highpoints++; }
      if (sess) sess[2] = Math.max(sess[2], frac);
      const before = Mech.knowledge(p, st)[r.fallAt], L = Mech.learnBurn(G.player, p, st, r.fallAt, sess ? sess[1] : 1, Math.random, !!partnerNow());
      let text = `${fallText(p, r.move, k)} Fell on move ${k} of ${p.moves}${r.move.kind === "crux" ? ", the crux" : ""}.`;
      if (faded) text = `It's been a while, and the moves feel unfamiliar again. ${text}`;
      if (newHigh) text += " New highpoint!";
      const pb = partnerNow() && !L.alt ? partnerBeta(partnerNow(), i) : "";
      if (L.alt) text += ` Hanging there, you see a better way through: ${ALT[p.seq.alt.kind].see}`;
      else if (st.mk[r.fallAt] - before > 0.04 && st.att <= 6) text += r.move.kind === "crux" ? " You're starting to work out the crux." : " You worked out a bit more of the beta.";
      if (G.day.weather.cond <= -0.8 && Mech.frictionSensitivity(p) >= 0.6) text += " Everything is wet.";
      else if (day.dirty && !L.alt && Math.random() < 0.5) text += " The holds are gritty with lichen.";
      else if (day.cond < -0.15 && Mech.frictionSensitivity(p) >= 0.6 && !L.alt && Math.random() < 0.5) text += ` The holds feel greasy${day.cond < G.day.weather.cond - 0.05 ? " in the warmth of the day" : ""}.`;
      if (pb) text += pb;
      else if (partnerNow() && st.mk[r.fallAt] - before > 0.06 && Math.random() < 0.4) text += ` ${firstName(partnerNow())} saw what happened from the ground and tells you.`;
      G.day.last = { kind: "fall", title: `${titleOf(i)}: attempt ${st.att}`, text, gains, p: i };
    }
    if (brushed) G.day.last.text = `You brush the grit and lichen off the holds first. ${G.day.last.text}`;
    // Pickles, if he's with you (Stage 5): now and then, a word about what he's up to.
    if (v2() && dogWithYou() && G.day.last && Math.random() < 0.22) G.day.last.text += " " + pick(r.sent ? DOG_SEND : DOG_FALL);
    // Sharp granite and thin skin: flappers happen (not through tape). A flapper gets
    // taped, for the rest of the day, and if you didn't know how, someone shows you.
    if (G.player.skin < 30 && !G.day.tape && Mech.frictionSensitivity(p) >= 0.6 && Math.random() < 0.07) {
      G.player.skin = Math.max(0, G.player.skin - 12); G.player.energy = Math.max(0, G.player.energy - 8); G.flapper = true;
      G.day.tape = true; G.day.flapper = true;
      let t = " Then you tear a flapper on the sharp granite. Ouch.";
      if (knows("tape")) t += " You tape it up. The tape stays on for the rest of the day.";
      else {
        (G.learned = G.learned || {}).tape = G.date; note("Learned: tape.");
        t += isAround("n:otis") ? ` Otis Fairweather hurries over with a roll of finger tape. "Oof. Perfect taping weather! Wrap it up, friend. You won't feel the slopers through it, but it'll see you through the day."`
          : ` Ranger Gus digs a roll of tape out of his first-aid kit. "Let's wrap that up. Won't help you on the slopers, mind."`;
        t += " You can tape up now. This one stays taped for the rest of the day.";
      }
      G.day.last.text += t;
      note("Tore a flapper.");
    }
    afterAction();
    return out;
  }
  // Your first send of someone else's problem: whose it was, and how many have climbed it.
  function ascentLine(i) {
    const e = G.world.est[i], who = World.whoName(D, e.by);
    if (e.old) return e.by === "n:anon" ? "The notebook says somebody climbed it in the 70s." : `The notebook says ${who} climbed it in ${e.old}.`;
    return `${who.charAt(0).toUpperCase() + who.slice(1)} made the first ascent on ${shortDate(e.date)}. Yours is the ${ordinal(e.reps + 1)} documented ascent.`;
  }
  function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // ======================================================= the climbing scene
  // Phase 3, Stage 2 (docs/phase3/stage2-scene.md). Try opens a close-up of the
  // boulder (scene.js): you, your pad, the line, a card for the problem and one for
  // you, and a short menu (Send burn, Work a move, Rest, Leave). The rules are the
  // ones above: a burn is tryProblem, saved before the scene plays it. Easy problems
  // (and repeats) keep a one-tap Climb it in the panel. G.day.climb: { p, view, say }
  // while it's open, so a reload brings you back to it.
  let SC = null;
  const climbing = () => !!(G && G.day && G.day.climb);
  // Climb it, not Try: a warm-up for you that you haven't fallen off.
  // (Climb it brushes a dirty line first, once you know how, so that's the chance it's judged on.)
  const easyFor = i => {
    const st = G.ps[i];
    if (st && st.att > 0 && !st.sent) return false;
    const d = here(i); if (knows("brush")) d.dirty = false;
    return Mech.chanceOf(G.player, D.problems[i], st, d) >= 0.8;
  };
  const pc = c => (c >= .1 ? Math.round(c * 100) + "%" : c >= .01 ? (Math.round(c * 1000) / 10) + "%" : c >= .002 ? "under 1%" : "almost none");
  const KNOW = v => (v >= 0.67 ? "well" : v >= 0.34 ? "fairly well" : v > 0.05 ? "a little" : "not yet");
  // How an action changes your odds of sending, in percentage points: "+3%", "+0.4%", "−5%".
  const plus = (a, b) => { const d = (b - a) * 100, m = Math.abs(d), n = m >= 0.95 ? Math.round(m) : m >= 0.05 ? m.toFixed(1) : 0; return `${d < 0 && n ? "−" : "+"}${n}%`; };
  function openClimb(i) {
    if (UI.busy || G.day.over) return;
    const p = D.problems[i];
    if (G.loc.boulder !== p.b) { travel({ sector: p.sector, boulder: p.b }); return; }
    if (!window.Scene || !M || !M.paint || !M.paint.scene) { tryProblem(i); return; }      // no map drawn: climb from the panel
    G.day.climb = { p: i, view: "main", say: null };
    save();
    safely("the climbing scene", showClimb);
  }
  function showClimb() {
    const i = G.day.climb.p, p = D.problems[i], S = M.paint.scene, st = G.ps[i];
    const host = $("#scene-root");
    host.hidden = false; document.body.classList.add("climbing");
    if (!SC) SC = Scene.create(host, { onAction: k => { if (climbing()) climbAction(k); } });
    const ids = [...p.boulder.problems].sort((a, b) => a - b);
    // Chalk on the rock from how often its lines have been climbed in this save's world.
    const probs = p.boulder.problems.map(k => { const e = v2() ? G.world.est[k] : null; return { ...D.problems[k], sends: v2() ? (e && !e.old ? e.reps + 1 : 0) * 25 : D.problems[k].sends }; });
    SC.show({ park: S, bo: S.boulders[p.b], probs, problem: p, line: { index: ids.indexOf(i), count: ids.length }, seq: p.seq, outfit: outfitFor(),
      seen: st ? Mech.seenOf(p, st) : 0, known: (st && st.mk) || [] });
    scenePal = undefined; sceneDog = undefined;
    const ls = lessonAt(i);                    // a regular teaches you something new
    if (ls) { G.day.climb.say = `${G.day.climb.say || climbIntro(i)}\n\n${ls}`; save(); }
    climbAtmosphere(); refreshClimb();
    SC.say(G.day.climb.say || climbIntro(i));
    SC.focusMenu();
  }
  function closeClimb() {
    if (G.day.climb) G.day.climb = null;
    const host = $("#scene-root"); host.hidden = true; document.body.classList.remove("climbing");
    save(); renderAll();
  }
  function climbAtmosphere() { const w = G.day.weather; SC.setAtmosphere({ date: G.date, minute: Math.min(G.day.minute, w.dusk + 20), dusk: w.dusk, sky: w.sky }); }
  function climbIntro(i) {
    const p = D.problems[i], st = G.ps[i];
    if (st && st.sent) return `You've sent ${pname(i)}. Climb it again, just for fun?`;
    // How it feels, in a sentence: "like a warm-up", "like it should go", "hard", "like a project", "out of reach for now".
    const f = { warmup: "like a warm-up", go: "like it should go", hard: "hard", project: "like a project", nope: "out of reach for now" }[Mech.feel(chanceFor(i)).key];
    if (rainNow()) return `${st && st.att ? `Back under ${pname(i)}` : `You look up at ${pname(i)}`}. The holds are wet and slick, so there's no climbing it today.${isDirty(i) && knows("brush") ? " You could brush it clean for when it dries, though." : ""}`;
    const vw = vibesWords(i);
    if (st && st.att) return `Back under ${pname(i)}. ${st.att} ${st.att === 1 ? "try" : "tries"} so far, and it feels ${f} today.${vw ? " " + vw : ""}`;
    return `You drop your pad under ${pname(i)} and look up at it. ${p.moves} moves to the top${p.sit ? ", from a sit start" : ""}. From the ground, it feels ${f}.${vw ? " " + vw : ""}`;
  }
  // The cards, through K (so an unclimbed line has no grade), and the menu with what
  // each choice would do to your chance of sending.
  let scenePal, sceneDog;                              // who's drawn by your pad in the scene (and Pickles, Stage 5)
  function refreshClimb() {
    if (!SC || !climbing()) return;
    const palKey = partnerNow() && partnerNow() + (partnerNow() === "n:rowan" && togetherNow() ? "♥" : "");
    if (scenePal !== palKey) { scenePal = palKey; SC.setPartner(palKey ? LOOKS[partnerNow().slice(2)] || {} : null, { sweet: /♥$/.test(palKey || "") }); }
    if (sceneDog !== dogWithYou()) { sceneDog = dogWithYou(); if (SC.setDog) SC.setDog(sceneDog); }
    const i = G.day.climb.p, p = D.problems[i], st = G.ps[i] || { att: 0, beta: 0 }, w = G.day.weather, L = levelNow(), left = w.dusk - G.day.minute;
    SC.setCards({
      prob: { name: pname(i), grade: vg(i), where: `${K.boulderName(p.b) || "Unfamiliar boulder"} · ${p.sector}`, tags: p.tagList, strip: moveStrip(i),
        hp: st.sent ? (st.flash ? "Flashed" : "Sent") : st.att ? `Highpoint move ${Math.round(st.best * p.moves)} of ${p.moves}` : `${p.moves} moves`,
        feel: st.sent ? null : Mech.feel(chanceFor(i)).label,
        beta: st.att && !st.sent ? `Beta ${Math.min(100, Math.round((st.beta || 0) / Mech.BETA_MAX * 100))}% worked out${st.alt ? " · a better way found" : ""}` : null,
        note: st.sent ? null : rockNote(i) },
      me: { name: G.player.name, level: L.level, energy: G.player.energy, skin: G.player.skin, clock: clock(Math.min(G.day.minute, w.dusk)),
        light: left <= 0 ? "dark" : left >= 120 ? `${Math.floor(left / 60)} h ${left % 60} min of light` : `${left} min of light`,
        note: G.day.tape ? (G.day.flapper ? "Taped up (a flapper)" : "Taped up") : null },
    });
    SC.setMenu(climbMenu(i), { reserve: G.day.climb.view === "main" && !(G.ps[i] && G.ps[i].sent) && (knows("brush") || knows("tape")) && v2() });
  }
  // The rock, in a few words: dirty or brushed, and once you can read the
  // conditions, its shade and how the friction is right now.
  function shadeWord(b) { const s = shadeAt(b); return s >= 0.65 ? "In the shade" : s >= 0.35 ? "Part shade" : "In the sun"; }
  function rockNote(i) {
    const d = here(i), out = [];
    if (d.dirty) out.push("Gritty and lichened: nobody has climbed it");
    else if (d.brushed) out.push("Brushed today");
    if (knows("read") && d.cond > -0.8) out.push(`${shadeWord(D.problems[i].b)} · friction ${Mech.describeCond(d.cond).label.toLowerCase()} now`);
    return out.join(" · ") || null;
  }
  function climbMenu(i) {
    const p = D.problems[i], st = G.ps[i] || { att: 0, beta: 0 }, day = here(i), now = chanceFor(i), worked = (G.day.worked || {})[i] || 0;
    if (G.day.climb.view === "work") {
      const mk = Mech.knowledge(p, { ...st }), seen = Math.max(1, Mech.seenOf(p, st));
      const items = p.seq.moves.slice(0, seen).map((m, j) => ({ key: "work:" + j, label: `Move ${j + 1}${m.kind === "crux" ? ", the crux" : m.kind === "top" ? ", the top-out" : ""}`,
        sub: mk[j] > 0.05 ? `You know it ${KNOW(mk[j])}` : "You don't know it yet", sub2: `Increase odds ${plus(now, Mech.previewWork(G.player, p, st, day, j, worked + 1).kept)}` }));
      return [...items, { key: "back", label: "Back", wide: items.length % 2 === 0 }];
    }
    const wet = rainNow();                     // no climbing on wet rock; brushing a new line is fine
    if (st.sent) return [{ key: "again", label: "Climb it again", sub: wet ? "Too wet to climb" : "A repeat, for fun", primary: true, disabled: G.day.over || wet }, { key: "leave", label: "Leave", sub: "Back to the map" }];
    const c = Mech.attemptCost(G.player, p, day), wc = Mech.workCost(G.player, p, day), seen = Math.max(1, Mech.seenOf(p, st));
    const gains = st.att ? Array.from({ length: seen }, (_, j) => Mech.previewWork(G.player, p, st, day, j, worked + 1).kept) : [now];
    const bestAt = gains.indexOf(Math.max(...gains));
    const full = G.player.energy >= G.day.startEnergy - .5, fresh = k => G.learned && G.learned[k] === G.date && !(G.day.used || {})[k];
    const items = [
      wet ? { key: "burn", label: "Send burn", sub: "Too wet to climb", sub2: "Wet granite is slick, and holds can snap", primary: true, disabled: true, wide: !knows("work") }
        : { key: "burn", label: `Send burn · ${pc(now)}`, sub: `Chance to send · ${Math.round(c.energy)} energy · ${Math.round(c.minutes)} min`, primary: true, disabled: G.day.over, wide: !knows("work") },
      ...(knows("work") ? [{ key: "work", label: "Work a move", sub: wet ? "Too wet to climb" : st.att ? `Increase your odds of sending ${plus(now, gains[bestAt])}` : "Give it a burn first",
        sub2: st.att && !wet ? `Cost: ${Math.round(wc.energy)} energy` : null, disabled: G.day.over || !st.att || wet, fresh: fresh("work") }] : []),
      { key: "rest", label: "Rest", sub: full ? "You're fresh" : `Add ${Math.round(Math.min(Mech.restGain(G.day.rests || 0), G.day.startEnergy - G.player.energy))} energy. Increase odds ${plus(now, Mech.previewRest(G.player, p, st, here(i, 20), G.day.rests || 0, G.day.startEnergy))}`,
        sub2: full ? null : "Cost: 20 min", disabled: G.day.over || full },
      { key: "leave", label: "Leave", sub: "Back to the map" },
    ];
    // Preparation, only where it matters: brushing a dirty line (for good) or friction holds (for the day), and tape for thin skin.
    if (knows("brush") && (day.dirty || (!wet && Mech.frictionSensitivity(p) >= 0.6 && !day.brushed && now < 0.8)))
      items.push({ key: "brush", label: day.dirty ? "Brush it clean" : "Brush the holds", prep: true, fresh: fresh("brush"), disabled: G.day.over,
        sub: wet ? "Clean for when it dries" : `Increase odds ${plus(now, Mech.chanceOf(G.player, p, st, { ...here(i, Mech.BAL.brushMin), dirty: false, brushed: true }))}`, sub2: `Cost: ${Mech.BAL.brushMin} min` });
    if (knows("tape") && !wet && (day.tape || G.player.skin < 60))
      items.push(day.tape
        ? (G.day.flapper ? { key: "untape", label: "Taped for a flapper", prep: true, disabled: true, sub: "It stays on for the rest of the day" }
          : { key: "untape", label: "Take the tape off", prep: true, sub: `Odds ${plus(now, Mech.chanceOf(G.player, p, st, { ...day, tape: false }))}`, sub2: "Burns cost full skin again" })
        : { key: "tape", label: "Tape up", prep: true, fresh: fresh("tape"), disabled: G.day.over,
          sub: `Half the skin per burn. Odds ${plus(now, Mech.chanceOf(G.player, p, st, { ...here(i, Mech.BAL.tapeMin), tape: true }))}`, sub2: `Cost: ${Mech.BAL.tapeMin} min` });
    return items;
  }
  async function climbAction(k) {
    const i = G.day.climb.p;
    if (["work", "brush", "tape"].includes(k)) (G.day.used = G.day.used || {})[k] = true;     // no longer new
    if (k === "leave") { closeClimb(); return; }
    if (k === "work") { G.day.climb.view = "work"; refreshClimb(); SC.say("Which move? You can pull on partway up and try it on its own."); return; }
    if (k === "back") { G.day.climb.view = "main"; refreshClimb(); SC.say(G.day.climb.say || climbIntro(i)); return; }
    if (k === "rest") { rest(); afterClimb([]); return; }
    if (k === "brush" || k === "tape" || k === "untape") { prepare(i, k); afterClimb([]); return; }
    if (k === "burn" || k === "again") { await burnInScene(i); return; }
    if (k.startsWith("work:")) { await workInScene(i, +k.slice(5)); return; }
  }
  // After anything in the scene: its words, the cards and menu again; if the day is
  // over (dusk, rain, out of energy or skin), the scene closes before the dialogs
  // (naming, level-up, the day's summary) open.
  function afterClimb(next) {
    if (!climbing()) return;
    G.day.climb.say = G.day.last && G.day.last.text;
    const ls = !G.day.over && lessonAt(G.day.climb.p);
    if (ls) G.day.climb.say = `${G.day.climb.say || ""}\n\n${ls}`;
    if (G.day.over) closeClimb();
    else { save(); refreshClimb(); climbAtmosphere(); SC.say(G.day.climb.say); }
    UI.levelPending = false;
    next.forEach(openModal); nextModal();
  }
  async function burnInScene(i) {
    if (SC.busy() || G.day.over) return;
    G.day.climb.view = "main";
    UI.levelPending = true;                    // the dialogs and the summary wait for the climb to play out
    const res = tryProblem(i, { scene: true });
    if (!res) { UI.levelPending = false; return; }
    const st = G.ps[i];
    SC.say(st.att === 1 && !res.r.sent ? "You chalk up and pull on." : ["You chalk up and pull on.", "Deep breath. Another go.", "You brush the holds with your thumb and step on."][st.att % 3]);
    await SC.play("burn", { fallAt: res.r.sent ? -1 : res.r.fallAt });
    if (res.r.sent) SC.flash(res.fa ? "FIRST ASCENT!" : res.style === "Flash" ? "FLASH!" : res.style === "Repeat" ? "AGAIN!" : "SENT!", res.fa ? "fa" : "");
    SC.setSeen(Mech.seenOf(D.problems[i], st), st.mk || []);
    afterClimb(res.next || []);
  }
  // Working one move on its own: cheaper than a burn, and it teaches that move a lot.
  async function workInScene(i, at) {
    if (SC.busy() || G.day.over || rainNow()) return;
    const p = D.problems[i], st = pstate(i), m = p.seq.moves[at];
    G.day.climb.view = "main";
    const faded = fadeIfAway(p, st);
    sessionOf(st);
    const day = here(i), c = Mech.workCost(G.player, p, day);
    G.player.energy = Math.max(0, G.player.energy - c.energy); G.player.skin = Math.max(0, G.player.skin - c.skin); G.day.minute += c.minutes;
    const worked = G.day.worked = G.day.worked || {}, n = worked[i] = (worked[i] || 0) + 1;
    const w = Mech.workMove(G.player, p, st, day, at, n);
    let text = w.stuck ? `You stick move ${at + 1}${m.kind === "crux" ? ", the crux," : ""} and hang there a moment, learning the body position.` : `You come off move ${at + 1}${m.kind === "crux" ? ", the crux," : ""} again, but it's starting to make sense.`;
    if (faded) text = `It's been a while, and the moves feel unfamiliar again. ${text}`;
    if (w.stuck && at + 1 < p.moves && Mech.seenOf(p, st) === at + 2) text += " Now you can see the next move.";
    if (w.alt) text += ` Working it, you find a better way through: ${ALT[p.seq.alt.kind].see}`;
    G.day.last = { kind: "work", title: `${titleOf(i)}: working move ${at + 1}`, text, p: i };
    if (w.alt) note(`Found a better way through the crux of ${pname(i)}.`);
    UI.levelPending = true;
    afterAction();
    SC.say(`You pull on at move ${at + 1} and try it on its own.`);
    await SC.play("work", { at, stuck: w.stuck });
    SC.setSeen(Mech.seenOf(p, st), st.mk || []);
    afterClimb([]);
  }

  // ---- preparation (Stage 3): brushing and tape. Each lasts: a dirty line stays
  // clean once brushed, brushed friction holds stay good for the day, and tape stays
  // on until the day ends or you take it off. Instant, like a rest.
  function prepare(i, k) {
    if (UI.busy || G.day.over) return;
    const p = D.problems[i], st = pstate(i), dirty = isDirty(i);
    if (k === "brush") {
      G.day.minute += Mech.BAL.brushMin;
      (G.day.brushed = G.day.brushed || {})[i] = true;
      if (dirty) st.clean = true;
      noticed("n:gus", "brush", i);                           // Gus notices you looking after the park
      if (dirty) noticed("n:juno", "clean", i);              // and Juno, a line nobody's climbed yet
      G.day.last = { kind: "info", title: `Brushing ${titleOf(i)}`, p: i, text: dirty && rainNow()
        ? "You scrub the lichen and grit off the holds in the drizzle. It'll be clean and ready when it dries."
        : dirty ? pick(["You scrub the grit and lichen off every hold you can reach and blow the dust out of the cracks. It's climbable rock now.",
          "Decades of lichen come off in green flakes. Underneath, the holds are rough and sharp and perfect."])
        : pick(["You brush the old chalk and grease off the holds. They feel crisp again.", "A few strokes of the brush on each sloper, and they bite like new."]) };
    } else if (k === "tape") {
      G.day.minute += Mech.BAL.tapeMin; G.day.tape = true;
      G.day.last = { kind: "info", title: "Taping up", p: i, text: `You wrap the tips that are wearing thin. ${Mech.tapeFeel(p) >= 1 ? "It'll save your skin, but you can't feel these slopers through it." : "It'll save your skin for a few more burns."}` };
    } else if (k === "untape" && !G.day.flapper) {
      G.day.tape = false;
      G.day.last = { kind: "info", title: "Tape off", p: i, text: "You peel the tape off. Bare skin, and every bit of feel back." };
    }
    afterAction();
  }

  // ---- learning to climb smarter (Stage 3): a new climber knows how to burn and rest.
  // Each strategy after that is taught by a regular in the climbing scene, the first
  // time it would help, or once you're strong enough that you'd have picked it up.
  // G.learned: { key: date }. Climbers from before Stage 3 know what their level would.
  const LESSONS = [
    { key: "brush", who: "n:gus", name: "Brushing",
      when: (i, L) => ((isDirty(i) || Mech.frictionSensitivity(D.problems[i]) >= 0.6) && G.dayNo >= 2) || L >= 2,
      say: (here, i) => `Ranger Gus wanders over with a soft nylon brush. ${isDirty(i)
        ? `"I scrubbed the lines by the lot for the reopening, but out here nobody's touched the holds since '87. Give them a scrub before you pull on. Gently, mind: nylon, never wire."`
        : `"Holds like these want a fresh brushing. Gets the old chalk and grease off. Gently, mind: nylon, never wire."`} You can brush a line now. A line nobody has climbed comes clean for good, and on sloping, frictiony holds a fresh brushing helps all day.` },
    { key: "work", who: "n:hollis", name: "Working a move",
      when: (i, L, st) => (st && st.att >= 4 && !st.sent && (st.log || []).length >= 2) || L >= 3,     // a line you keep coming back to
      say: here => `${here ? `Hollis Pruitt looks up from a laptop. "You keep coming off the same bit. You don't have to start from the bottom every time: pull on right there and try that move on its own. Cheaper, and you learn more. There's a whole help page on it in CragLog. I wrote it."`
        : `A climber resting nearby calls over: "You don't have to start from the bottom every time. Pull on at the move you keep falling off and try it on its own."`} You can work a single move now.` },
    { key: "tape", who: "n:otis", name: "Tape",
      when: (i, L) => (L >= 3 && G.player.skin < 50) || L >= 5,          // (a flapper teaches it on the spot)
      say: here => `${here ? `Otis Fairweather tosses you a roll of finger tape. "Perfect taping weather! Wrap the tips that are wearing thin. Not for slopers, though. You'll want to feel those."`
        : `Ranger Gus digs a roll of tape out of his first-aid kit. "Your tips are looking raw. Wrap them up. Won't help you on the slopers, mind."`} Taped, a burn costs half the skin and thin skin hurts less, but slopers and slab feel worse. Tape stays on for the day, unless you take it off.` },
    { key: "read", who: "n:bishop", name: "Reading the conditions",
      when: (i, L) => (L >= 4 && (G.day.minute >= 13 * 60 || here(i).cond < 0.05)) || L >= 6,
      say: () => `The Bishop squints at the sky. "Granite's like butter by mid-afternoon. In '74 we did the hard stuff before ten, then went down where the hemlocks keep the sun off. And it's always cool under a roof." You can read the conditions now: how the friction runs through the day, and which boulders sit in the shade.` },
  ];
  // The lesson to give under problem i right now, if any (and it's learned).
  function lessonAt(i) {
    if (!v2() || G.day.over) return null;
    G.learned = G.learned || {};
    const L = levelNow().level, st = G.ps[i];
    const ls = LESSONS.find(l => !G.learned[l.key] && l.when(i, L, st));
    if (!ls) return null;
    G.learned[ls.key] = G.date;
    if (isAround(ls.who)) bond(ls.who, "lesson");
    note(`Learned: ${ls.name.toLowerCase()}.`);
    return ls.say(isAround(ls.who), i);
  }

  function afterAction() {
    checkAchievements();
    if (!G.day.over) {
      if (G.player.energy <= 6) endDay("You're cooked. Time to head home.");
      else if (G.player.skin <= 2) endDay("Your skin is done for the day.");
      else timeChecks();
    }
    save(); renderAll();
  }
  // The clock moved (climbing, resting or walking): rain, the light, and dusk.
  // Dusk never strands you: you're warned in time to walk out, and when the light
  // goes you walk back to the lot.
  function timeChecks() {
    const w = G.day.weather, d = G.day;
    if (d.over) return;
    safely("Pickles", dogClock);
    if (partnerNow() && d.minute >= d.partner.until) partWays(partnerSays(partnerNow(), "bye"));
    if (rainNow() && !d.rainedOut && !d.rainStarted) {
      d.rainStarted = true;
      const what = w.precip === "Snow" ? "snowing" : "raining";
      G.day.last = { kind: "info", title: `It's ${what}`, text: `It started ${what} at ${clock(Mech.rainStart(w))}. Wet granite is slick and holds can snap, so that's it for climbing today. You can stay as long as you like: look around, talk to people, or brush a new line for when it dries.` };
      toast(`It's ${what}`, "No more climbing today. You can stay and explore, or head home.", "info");
      note(`It started ${what}: no more climbing today.`);
    }
    if (d.minute >= w.dusk) { duskOut(); return; }
    if (Mech.rainStart(w) != null && !rainNow() && !d.rainWarned && d.minute >= Mech.rainStart(w) - 45) {
      d.rainWarned = true; toast("Clouds rolling in", `${w.precip === "Snow" ? "Snow" : "Rain"} is on its way, due around ${clock(Mech.rainStart(w))}. Get your last burns in.`, "info");
    } else if (w.pop && w.rainFrom && Mech.rainStart(w) == null && !d.rainWarned && d.minute >= w.rainFrom) {
      d.rainWarned = true; toast("The rain held off", "Clear skies after all. Keep climbing until dusk.", "info");
    }
    // Rowan and the sunset (Stage 6): your partner asks; or Rowan's note said to stay.
    if (!d.sunsetHint && d.minute >= w.dusk - 90 && sunsetDue()) {
      d.sunsetHint = true;
      if (partnerNow() === "n:rowan" && !d.encounter && !climbing() && !UI.busy) {
        d.encounter = buildRegular("n:rowan", G.loc.sector || START_AREA, { again: d.met.includes("n:rowan") });
        if (!d.met.includes("n:rowan")) d.met.push("n:rowan");
      } else if (d.invite && d.invite.who === "n:rowan" && d.invite.sunset) toast("The light's turning gold", "Rowan's note said to stay for the sunset.", "sweet");
    }
    const out = M && M.minutesToLot ? M.minutesToLot() : 0;
    if (!d.warned && d.minute >= w.dusk - 45 - out) {
      d.warned = true; toast("Light's fading", `The park closes at dusk, ${clock(w.dusk)}.${out > 1 ? ` It's a ${out} minute walk back to the lot from here.` : ""}`, "info");
    } else if (!d.warnedOut && out >= 3 && d.minute >= w.dusk - out - 10) {
      d.warnedOut = true; toast("Time to head out", `Dusk is at ${clock(w.dusk)}, and the lot is ${out} minutes away.`, "info");
    }
  }
  // The light's gone: back to the lot, and the day is over.
  function duskOut() {
    const out = M && M.minutesToLot ? M.minutesToLot() : 0;
    if (M && M.toLot) M.toLot();
    endDay(out > 1 ? `The light's going, so you follow the trail back to the lot, ${out} minutes in the last of the daylight.` : "The light's gone, and the park closes at dusk.", { dusk: true });
  }

  // What you know about rain today: a coming shower once the clouds roll in,
  // otherwise the forecast's chance, until its time has passed.
  function rainHud(w) {
    const ra = Mech.rainStart(w);
    if (G.day.over) return "";
    if (rainNow()) return `<span class="small"><b style="color:var(--energy)">${w.precip === "Snow" ? "Snowing" : "Raining"}: no climbing</b></span>`;
    if (G.day.rainWarned && ra != null) return `<span class="small"><b style="color:var(--energy)">${esc(w.precip || "Rain")} coming, ~${clock(ra)}</b></span>`;
    if (w.pop && w.rainFrom && !G.day.rainWarned) return `<span class="small" style="color:var(--energy)">${esc(Mech.rainChance(w))}</span>`;
    if (w.pop == null && ra != null) return `<span class="small"><b style="color:var(--energy)">${esc(w.precip || "Rain")} at ${clock(ra)}</b></span>`;
    return "";
  }
  function rainNow() {
    const w = G.day.weather, ra = Mech.rainStart(w);
    return ra != null && ra <= w.dusk && G.day.minute >= ra;
  }
  // Look a boulder over: you find it (its name, its story, a label on the map),
  // and see the lines on it you could climb. Lines beyond you stay hidden until
  // you're stronger, and the card says when there's more on the rock than that.
  function inspectBoulder(b) {
    if (UI.busy || G.day.over || G.loc.boulder !== b || K.all()) return;
    const r = K.inspect(b, G.date), name = D.boulders[b].name, n = r.lines.length;
    const more = D.boulders[b].problems.some(p => K.line(p) === "hidden");
    G.day.minute += 5;
    UI.fresh = new Set(r.lines); UI.freshAnim = true;
    const seen = n ? `You spot ${n === 1 ? "an unclimbed line" : n + " unclimbed lines"} you could try.` : "";
    const done = K.linesOn(b).filter(p => K.line(p) === "est").length;      // someone got here first
    const already = done ? `${done === 1 ? "One problem here is" : done + " problems here are"} already documented. ` : "";
    const text = r.found
      ? `You walk around it, chalk up a hold or two, and work out where the lines might go. ${already}${seen || (done ? "You don't see anything else you could climb yet." : "Nothing on it looks climbable to you yet.")}${more ? (n ? " There's more on this rock than you can read yet." : " Stronger climbers might see something.") : ""}`
      : n ? `You look again with stronger eyes. ${seen}${more ? " There's still more you can't read yet." : ""}` : "You look again, but don't see anything new yet.";
    G.day.last = { kind: "discover", title: r.found ? `New boulder: ${name}` : `Another look at ${name}`, text };
    if (r.found) { note(`Found a boulder: ${name}${n ? `, with ${n} ${n === 1 ? "line" : "lines"} to try` : ""}.`); toast(`Found: ${name}`, n ? `${n} unclimbed ${n === 1 ? "line" : "lines"} to try.` : done ? `${done} documented ${done === 1 ? "problem" : "problems"}.` : "Nothing you can climb yet.", "find"); }
    else if (n) note(`Spotted ${n} new ${n === 1 ? "line" : "lines"} on ${name}.`);
    afterAction();
  }
  function rest() {
    if (UI.busy || G.day.over) return;
    G.day.minute += 20;
    const n = G.day.rests || 0;
    G.player.energy = Math.min(G.day.startEnergy, G.player.energy + Mech.restGain(n));
    G.day.rests = n + 1;
    noticed("n:mags", "rest");                                  // Mags approves of a proper rest
    G.day.last = { kind: "info", title: "Twenty minutes on the pad", text: ["You eat a snack, retape a finger, and watch someone flail on a warm-up. Energy recovers a little; skin doesn't.",
      "You lie back on the pad and watch the clouds. Your forearms stop buzzing.", "A drink, a stretch, a look at the holds from below. Energy comes back; skin doesn't."][n % 3] };
    const pal = partnerNow();
    if (pal) G.day.last.text = pick([`${firstName(pal)} takes a turn while you rest, and comes off the same move you did. “Okay, it's hard.”`,
      `You and ${firstName(pal)} share a snack on the pad and talk through the moves.`, `${firstName(pal)} tries it a different way, and you both learn something from watching.`,
      `You trade stories with ${firstName(pal)} while your forearms recover.`]) + " Energy comes back; skin doesn't.";
    afterAction();
  }

  // Go somewhere you know (a panel, CragLog, the trail map): the walk is planned
  // from where you actually are, along the trails, and costs the time it takes.
  function travel(to) {
    try { walkTo(to); } catch (e) { UI.busy = false; reportError("walking", e); safely("redraw", renderAll); }
  }
  function walkTo(to) {
    if (G.day.over) return;
    if (to.sector === G.loc.sector && to.boulder === G.loc.boulder && !M.walking()) { UI.tab = "here"; renderAll(); return; }
    M.goTo(to, { tab: true });
  }
  // You've arrived somewhere (by walking, or at the end of a trip): the area and
  // boulder you're at, what that reveals, and who's around.
  function arrive(prev, now, opts = {}) {
    G.loc = now;
    if (partnerNow() && now.boulder != null) G.day.partner.b = now.boulder;      // your partner comes along
    if (v2()) {
      if (now.sector && K.visitArea(now.sector)) toast(`New area: ${now.sector}`, "You've found a climbing area that isn't on the kiosk map.", "find");
      if (now.boulder != null && K.boulder(now.boulder) >= 1) K.visitBoulder(now.boulder);
    }
    if (now.sector && !G.visited.includes(now.sector)) G.visited.push(now.sector);
    if (opts.quiet) return;
    if (now.sector && now.sector !== prev.sector) {
      G.day.encounter = null;
      G.day.last = { kind: "info", title: now.sector, text: sectorBlurb(now.sector) };
    } else if (now.boulder != null && now.boulder !== prev.boulder) G.day.last = null;
    if (now.boulder !== prev.boulder) UI.fresh = null;
    checkAchievements();
  }
  function sectorBlurb(name) {
    const s = D.sectorBy.get(name), a = K.areaStats(name);
    if (K.all()) return `${s.boulderIds.length} boulders, ${D.sectorProblems.get(name).length} problems from V${s.lo} to V${s.hi}. You've sent ${a.sent} here.`;
    if (!a.boulders) return "You haven't found any boulders here yet. Have a look around.";
    return `${a.boulders} ${a.boulders === 1 ? "boulder" : "boulders"} you know here${a.n ? `, ${a.n} documented ${a.n === 1 ? "problem" : "problems"} from V${a.lo} to V${a.hi}` : ""}${a.open ? `, ${a.open} unclimbed ${a.open === 1 ? "line" : "lines"}` : ""}. You've sent ${a.sent} here.`;
  }

  function endDay(reason, opts = {}) {
    let dogLine = ""; safely("Pickles", () => { dogLine = dogAtCar(); });
    if (partnerNow() === "n:rowan" && togetherNow()) dogLine = " Rowan walks you to your car." + dogLine;   // (Stage 6)
    G.day.over = true; G.day.reason = reason + dogLine;
    note(`Headed home: ${G.day.sends.filter(s => s.style !== "Repeat").length} new sends, +${fmt(G.day.xp)} XP.`);
    let ev = null; if (v2()) safely("the event", () => { ev = eventAtEnd(opts); });     // the comp's results, a gathering (Stage 7)
    save(); renderAll();
    if (ev) { openModal(ev); UI.summaryPending = true; }
    else if (UI.levelPending || modalOpen()) UI.summaryPending = true;   // it opens once the naming and level-up have closed
    else showSummary();
  }

  // ============================================================== encounters
  function playerFit(i) {
    const p = D.problems[i];
    if (G.ps[i]?.sent) return -Infinity;
    const A = Mech.ability(G.player) + 0.6;
    return -0.5 * Math.pow((p.grade - (A + 0.3)) / 1.0, 2) + 1.2 * Mech.styleBonus(G.player, p) + 1.0 * Mech.morph(G.player, p)
      + 0.4 * ((p.stars ?? 2.3) - 2.3) + 0.12 * Math.log1p(p.sends);
  }
  function whyFor(i) {
    const p = D.problems[i], A = Mech.ability(G.player) + 0.6, out = [];
    if (p.grade > A + 0.4) out.push("it's a good project for you"); else if (p.grade >= A - 0.8) out.push("it's right at your level");
    else out.push("it's good mileage");
    const strong = p.tagList.filter(t => (G.player.skills[t] || 0) >= 0.3).sort((a, b) => G.player.skills[b] - G.player.skills[a]);
    if (strong.length) out.push(`you're strong on ${STYLE[strong[0]][0].toLowerCase()}`);
    const m = Mech.morph(G.player, p);
    if (m >= 0.2) out.push(Mech.reachDependence(p) < 0 ? "it's bunchy, so being shorter helps" : "it's reachy and you've got the span");
    if ((p.stars || 0) >= 3.2) out.push("it's one of the best lines in the park");
    return out;
  }
  // ---- beta from people (Phase 4, Stage 3) ------------------------------------------------
  // Everyone can tell you something once per line: what depends on how well they know it
  // (climbed it, working it, or it's their style: World.knowsLine), how well they know you,
  // and their body against yours (Mech.giveBeta). Kept in ps.tips { who: [date, move, what] }.
  const upFirst = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const tipsOf = i => (G.ps[i] && G.ps[i].tips) || {};
  const tippedBy = (i, w) => !!tipsOf(i)[w];
  function fromOf(w, i) {
    const k = v2() ? World.knowsLine(D, G, w, i, G.date) : null;
    if (!k) return null;
    const t = Social.tier(G, w);
    return { ...k, tier: t && K.met(w) && K.met(w).n > 1 ? t.key : "met" };
  }
  // Take someone's beta: change what you know, and remember who told you.
  function takeBetaFrom(w, i, from) {
    const p = D.problems[i], st = pstate(i), r = Mech.giveBeta(G.player, p, st, from);
    st.tips = { ...tipsOf(i), [w]: [G.date, r.at, r.what] }; st.tipped = true;
    if (typeof w === "string" && w.startsWith("n:")) bond(w, "beta", i);
    const name = typeof w === "string" && w.startsWith("n:") ? firstName(w) : whoOf(+String(w).slice(1));
    note(`${name} gave you beta for ${pref(i)}${r.at >= 0 ? `: ${Talk.moveWord(r)}` : ""}.`);
    if (r.what === "alt") toast("Beta: a better way through", `${name} showed you a better way through the crux of ${pname(i)}.`, "info");
    else if (r.what === "move") toast("Beta", `${name} told you about ${Talk.moveWord(r)} of ${pname(i)}.`, "info");
    return r;
  }
  const betaHow = (i, r) => Talk.how(r, D.problems[i].seq.alt && D.problems[i].seq.alt.kind);
  // Your lines worth asking about: tried lately and not sent, the one you've tried most first.
  function yourLines() {
    return Object.keys(G.ps).map(Number).filter(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 2 && K.visible(i)
      && (G.ps[i].log || []).some(x => Array.isArray(x) && String(x[0]) >= addDays(G.date, -14))).sort((a, b) => G.ps[b].att - G.ps[a].att);
  }
  // What to ask a regular about (up to two): the lines of yours they can help with, then
  // your main project even if they can't (they'll tell you who can).
  function betaAsks(w) {
    if (!World.REG.includes(w)) return [];
    const lines = yourLines().filter(i => !tippedBy(i, w)), help = lines.filter(i => fromOf(w, i)), mine = currentProject();
    const out = help.slice(0, 2);
    if (out.length < 2 && mine != null && !tippedBy(mine, w) && !out.includes(mine)) out.push(mine);
    return out;
  }
  // Someone else who could help: a regular you've met who's climbed it (or is on it),
  // and where they are today if they're out (only places you know).
  function pointFor(i, except) {
    const out = peopleToday(), m = G.day.minute;
    const cand = World.REG.filter(w => w !== except && K.met(w) && !tippedBy(i, w)).map(w => ({ w, k: World.knowsLine(D, G, w, i, G.date) }))
      .filter(x => x.k && (x.k.knows === "sent" || x.k.knows === "proj"))
      .map(x => ({ ...x, today: out.find(p => p.who === x.w) })).sort((a, b) => (b.k.knows === "sent") - (a.k.knows === "sent") || !!b.today - !!a.today);
    const x = cand[0];
    if (!x) return null;
    let where = null;
    if (x.today && m < x.today.to) { const wh = whereIs(x.today.b); where = m >= x.today.from ? `${firstName(x.w)}'s out today, ${wh.text}` : `${firstName(x.w)}'s around later today`; }
    return { who: x.w, person: firstName(x.w), where, sent: x.k.knows === "sent" };
  }
  function askBeta(e, i) {
    e.used = e.used || []; const key = "beta:" + i; if (!e.used.includes(key)) e.used.push(key);
    const from = fromOf(e.who, i), env = talkEnv();
    if (!from || tippedBy(i, e.who)) {
      const pt = pointFor(i, e.who);
      talkAdd(e, Talk.reply({ ...env, point: pt, beta: null }, e.who, "nobeta"));
      if (pt) note(`${firstName(e.who)} says ${pt.person} ${pt.sent ? "has climbed" : "has been on"} ${pref(i)}.`);
      return;
    }
    const falls = Mech.fallsOf(D.problems[i], pstate(i));
    const r = takeBetaFrom(e.who, i, from);
    const b = Talk.reply({ ...env, beta: { p: i, r, from, how: betaHow(i, r), falls: r.at >= 0 ? falls[r.at] : 0 } }, e.who, "beta");
    talkAdd(e, b.length ? b : [{ t: betaHow(i, r), mood: "thoughtful" }]);
  }
  // The regulars you've met who know a line, for its panel: who's climbed it and who's on it.
  function knowersHtml(i) {
    if (!v2()) return "";
    const bits = [];
    for (const w of World.REG) {
      if (!K.met(w)) continue;
      const k = World.knowsLine(D, G, w, i, G.date), told = tippedBy(i, w);
      if (!k || k.knows === "style") { if (told) bits.push(`${firstName(w)} gave you beta`); continue; }
      bits.push(`${firstName(w)} ${k.knows === "sent" ? (k.fa ? "made the first ascent" : "has climbed it") : k.left ? "has tried it" : "is working on it"}${told ? " (and gave you beta)" : ""}`);
    }
    if (!bits.length) return "";
    const ask = bits.some(b => !/gave you beta/.test(b)) && G.ps[i] && !G.ps[i].sent ? " Ask them about it when you see them." : "";
    return `<div class="why knowers">${esc(bits.join(" · "))}.${esc(ask)}</div>`;
  }

  // ---- friendship (Phase 4, Stage 4) -----------------------------------------------------------
  // Every moment with someone goes through here: it's recorded (social.js), and if the
  // friendship has just deepened you're told (and they'll mention it next time you talk).
  const TIER_SAY = { know: w => `You and ${firstName(w)} know each other now.`, friends: w => `You and ${firstName(w)} are friends now.`, good: w => `You and ${firstName(w)} are good friends now.` };
  function bond(w, kind, p = null) {
    if (!v2() || typeof w !== "string" || !w.startsWith("n:")) return null;
    const up = Social.befriend(G, w, kind, G.date, p);
    deepened(w, up);
    return up;
  }
  // A friendship deepened: you're told.
  function deepened(w, up) {
    if (up && w !== "n:pickles" && TIER_SAY[up.key]) {
      toast(up.key === "know" ? "Getting to know people" : "A friendship", TIER_SAY[up.key](w), "info");
      note(TIER_SAY[up.key](w));
    }
  }
  // Something a regular especially values, if they're out today and you've met (Social.LIKES).
  const outToday = w => peopleToday().some(x => x.who === w);
  const nearNow = w => peopleNow().some(x => x.who === w && D.boulders[x.b].sector === G.loc.sector);
  function noticed(w, kind, p = null) { if (v2() && K.met(w) && outToday(w)) bond(w, kind, p); }
  // They say so in the conversation, if it deepened while you were talking.
  function closerNow(e) {
    const rec = G.social && G.social.npc[e.who];
    if (!rec || !rec.up || e.who === "n:pickles") return;
    const b = Talk.reply(talkEnv(), e.who, "closer");
    if (b.length) { talkAdd(e, b); Social.heard(G, e.who); }
  }

  // ---- Rowan (Phase 4, Stage 6; docs/phase4/stage6-romance.md) --------------------------------
  // A slow-burn romance, only if you want one (Social.romance). It moves when you say something
  // playful to Rowan (a reply in the conversation, once a day, once you know each other); once
  // you're sweet on each other Rowan flirts back; and when it's ready, on a dry evening, Rowan
  // asks you to stay for the sunset, where you can say how you feel. Never XP; never required.
  // G.day.sunset: "asked" (Rowan's asked today), "no", or "yes" (you're watching it).
  const romanceNow = () => (v2() ? Social.romance(G) : { n: 0 });
  const togetherNow = () => romanceNow().n === 4;
  function sunsetDue() {
    if (!v2() || G.day.over || rainNow() || G.day.rainedOut || (G.day.sunset && G.day.sunset !== "asked")) return false;
    const ro = Social.romance(G), w = G.day.weather, m = G.day.minute;
    if (!(ro.canAsk || (ro.n === 3 && G.day.sunset === "asked"))) return false;
    if (m < w.dusk - 180 || m > w.dusk - 10) return false;
    return partnerNow() === "n:rowan" || peopleNow().some(x => x.who === "n:rowan" && x.to >= w.dusk);
  }
  // How it's going, when it changes (in words: never a number).
  function romanceNews(before, after) {
    if (after.n === 1 && before.n === 0 && before.flirts === 0) note("You said something playful to Rowan. Rowan went a bit pink.");
    if (after.n === 2 && before.n < 2) {
      toast("Rowan", "You're fairly sure Rowan's been hanging around your projects on purpose.", "sweet");
      note("You and Rowan are sweet on each other.");
    }
  }
  function sayPlayful(e) {
    if (!e.flirt || !Social.canFlirt(G)) return;
    const before = Social.romance(G), r = Social.flirt(G, G.date);
    deepened("n:rowan", r.up);
    const b = Talk.flirtBack(talkEnv(), e.flirt.id, before.n);
    if (b) talkAdd(e, [b]);
    romanceNews(before, r.after);
    closerNow(e);
  }
  // The sunset: a scene of its own, and the end of the day.
  function sunsetArt() {
    const heart = (x, y, k, d) => `<path class="ss-heart" style="animation-delay:${d}s" d="M${x},${y} c0,-${3 * k} ${4.4 * k},-${3.4 * k} ${5 * k},-${.4 * k} c.6,-${3 * k} ${5 * k},-${2.6 * k} ${5 * k},${.4 * k} c0,${3.2 * k} -${5 * k},${6 * k} -${5 * k},${6 * k} c0,0 -${5 * k},-${2.8 * k} -${5 * k},-${6 * k} z"/>`;
    const trees = Array.from({ length: 22 }, (_, i) => { const x = 150 + i * 9.6 + (i % 3) * 2, h = 9 + (i * 7 % 5) * 2.2; return `M${x - 3.4},112 L${x},${112 - h} L${x + 3.4},112 Z`; }).join(" ");
    return `<svg class="sunset-art" viewBox="0 0 360 150" role="img" aria-label="You and Rowan sitting on a boulder, watching the sun go down over the valley" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a6aa6"/><stop offset=".42" stop-color="#e48ba2"/><stop offset=".78" stop-color="#f3b06c"/><stop offset="1" stop-color="#f7d68c"/></linearGradient></defs>
      <rect width="360" height="150" fill="url(#ss-sky)"/>
      <circle cx="236" cy="103" r="21" fill="#fde6a6" fill-opacity=".95"/>
      <path d="M0,99 C40,88 84,93 124,86 C172,78 204,92 252,88 C300,84 332,91 360,86 V150 H0 Z" fill="#b0678a" fill-opacity=".7"/>
      <path d="M0,112 C52,104 108,110 160,104 C222,97 282,108 360,101 V150 H0 Z" fill="#7a4a6e"/>
      <path d="${trees}" fill="#5a3756"/>
      <path d="M0,150 C2,130 30,121 82,119 C130,117 160,123 176,150 Z" fill="#3b2a3e"/>
      <g fill="#2a1d2c"><g transform="rotate(5 93 119)"><circle cx="93" cy="99" r="5.6"/><path d="M85.4,120 C85,111.6 87.6,105.8 93,105.8 C98.4,105.8 101,111.6 100.6,120 Z"/></g>
        <g transform="rotate(-6 106 119)"><circle cx="106.4" cy="99.6" r="5.4"/><path d="M99,120 C98.6,111.8 101.2,106.2 106.4,106.2 C111.6,106.2 114.2,111.8 113.8,120 Z"/></g></g>
      <g fill="#ef8fa6" stroke="#5a2a3e" stroke-width=".8">${heart(96, 84, 1, 0)}${heart(104, 76, .8, .5)}${heart(90, 70, .7, 1)}</g></svg>`;
  }
  // Back to the lot, and the day's over (G.day.sunset: "told" or "watched", once you've chosen).
  function sunsetEnd() {
    const tell = G.day.sunset === "told";
    if (M && M.toLot) M.toLot();
    endDay(tell ? "You watched the sunset with Rowan from the top of a boulder above the trees, and walked out together by headlamp." : "You watched the sunset with Rowan, then walked out in the last of the light.");
  }
  function watchSunset() {
    const w = G.day.weather;
    G.day.sunset = "yes"; G.day.encounter = null; UI.talkKey = "";
    if (partnerNow()) G.day.partner = null;                                 // you're off up the hill together
    G.day.minute = Math.max(G.day.minute, w.dusk - 5);
    save(); renderAll();
    const finish = sunsetEnd;
    openModal(() => modal(`<div class="sunset">${sunsetArt()}</div><span class="label-sm">Rowan</span><h2>The sunset</h2>
      <p class="lede" data-sun-text>${esc(Talk.SUNSET.start)}</p>
      <div class="acts" data-sun-acts><button type="button" class="btn primary sweet" data-tell>Tell Rowan how you feel</button><button type="button" class="btn" data-watch>Just watch the sunset</button></div>`, (root, close) => {
      const done = (text, tell) => {
        root.querySelector("[data-sun-text]").insertAdjacentHTML("afterend", text.map(t => `<p class="lede">${esc(t)}</p>`).join(""));
        root.querySelector("[data-sun-acts]").innerHTML = `<button type="button" class="btn primary" data-close>Walk out${tell ? " together" : ""}</button>`;
        const b = root.querySelector("[data-close]"); b.onclick = () => { close(); finish(); }; b.focus();
      };
      root.querySelector("[data-tell]").onclick = () => {
        const r = Social.sunset(G, G.date, true); deepened("n:rowan", r.up); G.day.sunset = "told";
        root.querySelector(".sunset").classList.add("hearts"); root.querySelector(".modal").classList.add("sweet");
        note("You told Rowan how you feel. You and Rowan are together.");
        toast("Together", "You and Rowan are together.", "sweet");
        save(); done([Talk.SUNSET.tell, Talk.SUNSET.after], true);
      };
      root.querySelector("[data-watch]").onclick = () => {
        const r = Social.sunset(G, G.date, false); deepened("n:rowan", r.up); G.day.sunset = "watched";
        note(r.key === "friends" ? "You watched the sunset with Rowan. You're good friends, and that's lovely." : "You watched the sunset with Rowan.");
        save(); done([r.key === "friends" ? Talk.SUNSET.friends : Talk.SUNSET.watch], false);
      };
    }));
  }

  // ---- events (Phase 4, Stage 7; docs/phase4/stage7-events.md) ------------------------------
  // One a season (World.EVENTS), each on a fixed date: always dry, and everyone comes out for
  // it. The fall comp scores your five best sends of the day; the Solstice Bonfire and the
  // Midsummer Dusk Session gather everyone at The Tailgate at dusk; on Trail Day you can help
  // Gus. Missing one costs nothing: it's in Local Buzz, and people talk about it.
  // G.events[date]: what you did (a comp: { k, score, place, of, there }; { k, there };
  // { k: "trail", helped, trail }); G.day.trail: you helped today.
  const eventToday = () => (v2() && G.day ? World.eventOn(G.date) : null);
  const compGrade = p => (G.world && G.world.est[p] ? G.world.est[p].grade : D.problems[p].grade);
  const ORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  const ordWord = n => ORDS[n] || ordinal(n);
  const longDay = d => toDate(d).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
  // An event's day is dry and at least Good (the bonfire's crisp: Prime). On a forecast.
  function eventWeather(f, date = f.date) {
    const e = World.eventOn(date); if (!e || f.rainAt === 0 && f.label === "Wet") return f;
    const dry = { ...f, pop: 0, rainWhen: null, rainAt: null, note: String(f.note || "").replace(/^.*?(rain|snow)[^.]*\.\s*/i, "") };
    if ("rainFrom" in f) dry.rainFrom = null;
    return Mech.atLeast(dry, e.key === "bonfire" ? 0.3 : 0.05);
  }
  const EVENT_INTRO = {
    comp: "It's the Granite Hollow Bouldering Comp! Gus is at the kiosk with a clipboard and a coffee tin of pencils. Every problem in the park counts, repeats too: your five best sends today score, 100 a V-grade and 50 more for a flash. Results by the lot at dusk.",
    bonfire: "It's the shortest day of the year, and the Solstice Bonfire: cold, crisp friction while the light lasts, then everyone gathers round the fire at The Tailgate at dusk.",
    spring: "It's the Granite Hollow Spring Comp, and no, Gus says, it isn't an April Fool. Every problem in the park counts, repeats too: your five best sends today score, 100 a V-grade and 50 more for a flash. Results by the lot at dusk.",
    trail: "It's Trail Day. Gus has a trailer full of loppers and rakes and a clipboard.",
    cleanup: "It's the Great Granite Hollow Clean-Up! Gus is handing out grabbers and bin bags at the kiosk. The snowmelt's turned up a whole winter's litter all over the park, and whoever bags the most by dusk wins the Golden Grabber.",
    midsummer: "It's the longest day of the year, and the Midsummer Dusk Session: everyone's climbing until the light goes, then it's headlamps and sandwiches at The Tailgate.",
  };
  // The comp, live: your scorecard, and the leaders so far.
  function compStandings() {
    const me = World.compScore(G.day.sends, compGrade), m = G.day.minute;
    const field = World.compField(D, G, G.date).map(x => { const sofar = x.sends.filter(s => s.t <= m); return { who: x.who, name: x.who.startsWith("n:") ? callName(x.who) : x.name, score: sofar.reduce((a, s) => a + 100 * s.g + (s.flash ? 50 : 0), 0) }; });
    field.push({ who: "you", name: G.player.name || "You", score: me.score });
    field.sort((a, b) => b.score - a.score || (a.who === "you" ? -1 : b.who === "you" ? 1 : 0));
    return { me, field, place: field.findIndex(x => x.who === "you") + 1 };
  }
  function eventHtml() {
    if (!v2() || G.day.over) return "";
    const e = eventToday(), dusk = clock(G.day.weather.dusk);
    if (!e) {
      const n = World.nextEvent(addDays(G.date, 1), 9);
      return n ? `<div class="event-card soon"><span class="label-sm">Coming up</span><b>${esc(n.name)}</b><span class="meta">${esc(longDay(n.date))}, ${n.in === 0 ? "tomorrow" : `in ${n.in + 1} days`}</span></div>` : "";
    }
    if (e.comp) {
      const { me, field, place } = compStandings();
      const card = me.top.length ? `<ol class="comp-card">${me.top.map(x => `<li><span>${esc(pname(x.p))} <span class="meta">V${compGrade(x.p)}${x.flash ? ", flashed" : ""}</span></span><b>${x.pts.toLocaleString("en-US")}</b></li>`).join("")}</ol>`
        : `<p class="meta">Nothing on your card yet. Any send counts, repeats too.</p>`;
      const top = field.slice(0, 5), mine = place > 5 ? [field[place - 1]] : [];
      const row = (x, i) => `<li class="${x.who === "you" ? "me" : ""}"><span>${i + 1}. ${esc(x.name)}</span><b>${x.score.toLocaleString("en-US")}</b></li>`;
      return `<div class="event-card comp"><span class="label-sm">Today</span><h3>${esc(e.name)}</h3>
        <p class="meta">Every problem in the park counts, repeats too. Your five best sends score: 100 a V-grade, 50 more for a flash. Results by the lot at dusk, ${esc(dusk)}.</p>
        <h4>Your card: ${me.score.toLocaleString("en-US")} points</h4>${card}
        <h4>Leaders so far</h4><ol class="comp-board">${top.map(row).join("")}${mine.length ? `<li class="gap">…</li>${row(mine[0], place - 1)}` : ""}</ol></div>`;
    }
    if (e.cleanup) return cleanupHtml(e);
    if (e.key === "trail") {
      const w = G.day.weather, late = G.day.minute > w.dusk - 120;
      const done = G.day.trail ? `<p class="meta">You helped. Gus is delighted, and trying not to show it.</p>` : "";
      const ot = World.oldTrailOn(G.date);
      return `<div class="event-card trail"><span class="label-sm">Today</span><h3>${esc(e.name)}</h3><p class="meta">${ot ? `Gus and a crowd of volunteers are reopening ${esc(trailWords(ot))}. It's on the map from today.` : "Gus and a crowd of volunteers are cutting back the summer's growth along the trails."}</p>
        ${done || `<button type="button" class="btn" data-trail ${late || UI.busy ? "disabled" : ""}>Help with Trail Day · 2 hours</button>${late ? `<p class="meta">They're packing up for the day.</p>` : ""}`}</div>`;
    }
    const what = e.key === "bonfire" ? `Climb while the light lasts: at dusk, ${dusk}, everyone gathers round the bonfire at The Tailgate, and Gus and the Bishop tell stories.`
      : `Everyone's climbing until the light goes, ${dusk}. Then it's headlamps and Otis's sandwiches at The Tailgate.`;
    return `<div class="event-card ${e.key}"><span class="label-sm">Today</span><h3>${esc(e.name)}</h3><p class="meta">${esc(what)} Stay till dusk to be there.</p></div>`;
  }
  // Trail Day: the volunteers reopen one of the old trails (World.OLD_TRAILS) each year. It's open
  // from that morning, whether or not you help. Helping: two hours with Gus; dirty lines you've
  // found get brushed, and he walks you along the new trail.
  const areaWord = s => (K.area(s) >= 1 ? s : (World.AREAS[s] && World.AREAS[s].hint) || "somewhere further out");
  const trailWords = t => `${t.name}, the old path between ${areaWord(t.a)} and ${areaWord(t.b)}`;
  function trailDayWords() {
    const t = World.oldTrailOn(G.date);
    return t ? ` This year the volunteers are reopening ${trailWords(t)}, lost under the leaves since before the closure. Help out for a couple of hours and Gus will be delighted (it's in the Here tab).`
      : " The volunteers are cutting back the summer's growth along the trails. Help out for a couple of hours and Gus will be delighted (it's in the Here tab).";
  }
  function helpTrail() {
    const e = eventToday(), w = G.day.weather;
    if (!e || e.key !== "trail" || G.day.trail || UI.busy || G.day.over || G.day.minute > w.dusk - 120) return;
    G.day.trail = true; G.day.minute += 120; G.player.energy = Math.max(7, G.player.energy - 8);
    bond("n:gus", "brush"); bond("n:gus", "event");
    for (const x of peopleToday()) if (x.who !== "n:gus" && K.met(x.who)) bond(x.who, "event");
    const walk = i => (D.sectors.find(s => s.name === D.problems[i].sector) || {}).walk_min || 0;
    const dirty = D.problems.map((p, i) => i).filter(i => isDirty(i) && K.visible(i)).sort((a, b) => walk(a) - walk(b)).slice(0, 6);
    for (const i of dirty) pstate(i).clean = true;
    const t = World.oldTrailOn(G.date);
    if (t) for (const a of [t.a, t.b]) if (K.area(a) < 1 && K.hearOf(a, "n:gus", G.date)) toast(`New area: ${a}`, "The new trail goes there. It's on your trail map now.", "find");
    const text = `You spend two hours with Gus and the volunteers, cutting back brambles, rebuilding a set of steps and brushing the summer's growth off the boulders.${dirty.length ? ` ${dirty.length === 1 ? "A line you'd found is" : `${dirty.length} lines you'd found are`} brushed clean, ready to try.` : ""}`
      + (t ? ` By the end of it, ${t.name} is a trail again, and Gus walks you the length of it, from ${t.a} to ${t.b}. “Saves going round by the lot,” he says, very pleased with everybody.` : "");
    (G.events = G.events || {})[G.date] = { k: "trail", helped: true, ...(t ? { trail: t.id } : {}) };
    if (t) toast("A new trail", `${upFirst(t.name)} joins ${t.a} and ${t.b}. It's on your trail map.`, "find");
    G.day.last = { kind: "info", title: "Trail Day", text };
    note(`Helped on Trail Day.${t ? ` ${upFirst(t.name)} is open again, between ${t.a} and ${t.b}.` : ""}`);
    afterAction();
  }
  // Small illustrations for the end of an event day.
  function eventArt(kind, top = []) {
    const W = 360, H = 150;
    if (kind === "comp") {
      const step = [[150, 70, 46, 1], [96, 82, 34, 2], [210, 88, 28, 3]];
      const fig = (x, y, c) => `<circle cx="${x}" cy="${y - 25}" r="6" fill="#e0b48c" stroke="#3b3226" stroke-width="1.2"/><path d="M${x - 8},${y} C${x - 8},${y - 12} ${x - 6},${y - 18} ${x},${y - 18} C${x + 6},${y - 18} ${x + 8},${y - 12} ${x + 8},${y} Z" fill="${c}" stroke="#3b3226" stroke-width="1.2"/>`;
      const arms = (x, y) => `<path d="M${x - 7},${y - 15} L${x - 13},${y - 27} M${x + 7},${y - 15} L${x + 13},${y - 27}" stroke="#3b3226" stroke-width="2" stroke-linecap="round"/>`;
      return `<svg class="event-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="The podium, with Pickles sitting in front" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="ev-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7fb0"/><stop offset=".6" stop-color="#e9a77f"/><stop offset="1" stop-color="#f3cf8e"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#ev-dusk)"/><path d="M0,118 C60,110 120,114 180,108 C250,102 300,112 360,106 V150 H0 Z" fill="#7d8a5a"/>
        ${step.map(([x, y, h, n], i) => `<rect x="${x}" y="${y + 46 - h + 24}" width="54" height="${h}" fill="#efe3c6" stroke="#3b3226" stroke-width="1.4"/><text x="${x + 27}" y="${y + 46 - h + 24 + h / 2 + 6}" text-anchor="middle" font-family="Fraunces, serif" font-weight="700" font-size="16" fill="#3b3226">${n}</text>`
          + (top[i] ? fig(x + 27, y + 46 - h + 24, top[i]) + (i === 0 ? arms(x + 27, y + 46 - h + 24) : "") : "")).join("")}
        <g transform="translate(284 136)"><ellipse cx="0" cy="8" rx="13" ry="3" fill="#3b3226" fill-opacity=".2"/><path d="M-9,7 C-10,-2 -6,-8 0,-8 C6,-8 9,-2 8,7 Z" fill="#9c9a94" stroke="#3b3226" stroke-width="1.1"/><circle cx="1" cy="-11" r="6" fill="#9c9a94" stroke="#3b3226" stroke-width="1.1"/><path d="M-4,-15 L-7,-8 L-2,-11 Z M5,-15 L8,-8 L3,-11 Z" fill="#6a6862" stroke="#3b3226" stroke-width=".8"/><circle cx="1" cy="-9" r="1.3" fill="#2b2622"/><path d="M-6,0 Q0,3 6,0" stroke="#b5462e" stroke-width="1.6" fill="none"/></g></svg>`;
    }
    if (kind === "bonfire") {
      const people = [[118, "#5f6b2d"], [146, "#9b3b2f"], [214, "#c46a3a"], [244, "#5f7fa6"], [96, "#b0436e"], [268, "#3b3f46"]];
      return `<svg class="event-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="Everyone round the bonfire at dusk" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="ev-glow" cx=".5" cy=".75" r=".55"><stop offset="0" stop-color="#f6b25a" stop-opacity=".75"/><stop offset="1" stop-color="#f6b25a" stop-opacity="0"/></radialGradient></defs>
        <rect width="${W}" height="${H}" fill="#22263f"/>${[[30, 20], [80, 34], [140, 14], [200, 28], [262, 12], [320, 30], [300, 52], [50, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#f3ecd8"/>`).join("")}
        <path d="M0,100 C70,90 140,96 200,92 C270,88 320,96 360,92 V150 H0 Z" fill="#2c3448"/><rect width="${W}" height="${H}" fill="url(#ev-glow)"/>
        ${people.map(([x, c]) => `<circle cx="${x}" cy="${104}" r="6" fill="#3a2a22"/><path d="M${x - 9},126 C${x - 9},114 ${x - 6},110 ${x},110 C${x + 6},110 ${x + 9},114 ${x + 9},126 Z" fill="${c}" fill-opacity=".85"/>`).join("")}
        <path d="M162,128 L198,118 M160,120 L200,128" stroke="#5a3a26" stroke-width="5" stroke-linecap="round"/>
        <path class="ev-flame" d="M180,124 C166,116 170,104 176,96 C176,104 180,106 182,100 C184,92 190,90 190,84 C198,96 196,108 190,116 C194,112 196,108 196,104 C200,114 194,122 180,124 Z" fill="#f2a03a" stroke="#c0552a" stroke-width="1"/>
        <path d="M180,122 C174,116 176,110 180,106 C181,111 184,112 185,108 C188,114 186,120 180,122 Z" fill="#fbe08a"/>
        ${[[176, 78], [188, 70], [170, 62]].map(([x, y]) => `<circle class="ev-spark" cx="${x}" cy="${y}" r="1.4" fill="#fbd26a"/>`).join("")}
        <g transform="translate(206 134)"><path d="M-12,6 C-12,0 -4,-4 4,-4 C10,-4 12,0 12,6 Z" fill="#9c9a94"/><circle cx="12" cy="0" r="4.5" fill="#9c9a94"/></g></svg>`;
    }
    // midsummer: headlamps coming on in the long dusk, people at the foot of two boulders
    const lamps = [[92, 1, "#c46a3a"], [128, -1, "#e0b04a"], [226, 1, "#3f7fa6"], [262, -1, "#b0436e"], [304, -1, "#5f7fa6"]];
    return `<svg class="event-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="Headlamps coming on at the foot of the boulders in the long midsummer dusk" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="ev-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3a6b"/><stop offset=".72" stop-color="#7a6a9e"/><stop offset="1" stop-color="#e8a070"/></linearGradient>
        <radialGradient id="ev-pool"><stop offset="0" stop-color="#fff3b8" stop-opacity=".75"/><stop offset="1" stop-color="#fff3b8" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#ev-mid)"/>${[[40, 18], [120, 12], [200, 24], [282, 10], [340, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#f3ecd8"/>`).join("")}
      <path d="M0,104 C70,96 150,102 220,96 C290,90 330,98 360,96 V150 H0 Z" fill="#2b2f3f"/>
      <path d="M58,134 C60,96 82,74 112,72 C140,70 160,90 164,134 Z M194,134 C196,100 222,80 252,80 C284,80 308,100 316,134 Z" fill="#454a60" stroke="#2b2f3f" stroke-width="1.5"/>
      <rect y="132" width="${W}" height="18" fill="#2b2f3f"/>
      ${lamps.map(([x, d, c]) => { const hx = x, hy = 117, tx = x - d * 4, ty = 92; return `<path d="M${hx},${hy} L${tx - 11},${ty} L${tx + 11},${ty + 4} Z" fill="#fff3b8" fill-opacity=".22"/><ellipse cx="${tx}" cy="${ty + 2}" rx="13" ry="8" fill="url(#ev-pool)"/>
        <path d="M${x - 6},135 C${x - 6},126 ${x - 4},122 ${x},122 C${x + 4},122 ${x + 6},126 ${x + 6},135 Z" fill="${c}"/><circle cx="${x}" cy="117" r="4.6" fill="#2a2230"/><circle cx="${x - d * 2.6}" cy="115.6" r="1.6" fill="#fff6c8"/>`; }).join("")}</svg>`;
  }
  const BONFIRE_TALES = {
    gus: ["Gus tells the story of the winter of '96, when the quarry pond froze solid and he skated the whole length of it to fix a fence. “Nobody's ever believed me. Pickles wasn't born yet, so I've no witnesses.”",
      "Gus tells you about the first climber he caught in the park after the closure, in 1991: a teenager with a bath towel for a crash pad. “I should have thrown them out. I showed them the good holds instead.”",
      "Gus tells everyone how Pickles turned up: a scruffy puppy asleep on the kiosk step one October morning, who simply never left. “I put up posters. Nobody called. I've always been a bit glad.”"],
    bishop: ["The Bishop tells the story of the first ascent of The Billboard. It was 1974, or 1977, and either Dot spotted him or he spotted Dot, and at some point there was a mule. Hollis updates the CragLog page with what's changed since last time.",
      "The Bishop tells a story about climbing by moonlight in 1979 that ends, somehow, with him made an honorary member of the volunteer fire brigade.",
      "The Bishop says the boulders in the woods are older than the hills they sit on. Then he says something about a bear that Gus says is definitely not true."],
  };
  function gatherModal(e) {
    const out = peopleToday().filter(x => K.met(x.who)), names = out.map(x => firstName(x.who)).filter(n => n !== "Gus");
    const extra = [];
    if (togetherNow() && out.some(x => x.who === "n:rowan")) extra.push(e.key === "bonfire" ? "Rowan shares your blanket, and draws the fire by its own light. It's still impossible to draw." : "Rowan sits beside you on the pad, drawing the headlamps as they come on.");
    if (Social.dog(G).adopted) extra.push(e.key === "bonfire" ? "Pickles falls asleep with his nose nearly in the fire, and has to be moved." : "Pickles chases moths through the headlamp beams.");
    const lede = e.key === "bonfire"
      ? [`At dusk everyone gathers at The Tailgate, where Gus has a bonfire going${names.length ? `: ${names.slice(0, 4).join(", ")}${names.length > 4 ? " and more" : ""}, and climbers you only half know` : ""}. The light goes early on the shortest day, and it's cold, and nobody minds.`, pick(BONFIRE_TALES.gus), pick(BONFIRE_TALES.bishop), ...extra]
      : [`As the light goes, the headlamps come on one by one across the boulders, like slow fireflies. Otis hands round sandwiches.`, "Somebody's still trying the last problem by the light of three headlamps and a phone. Everyone cheers when it goes.", ...extra];
    return () => modal(`<div class="event-scene">${eventArt(e.key)}</div><span class="label-sm">${esc(e.name)}</span><h2>${e.key === "bonfire" ? "Round the fire" : "Headlamps on"}</h2>
      ${lede.map(t => `<p class="lede">${esc(t)}</p>`).join("")}<div class="acts"><button type="button" class="btn primary" data-close>Head home</button></div>`, (root, close) => { root.querySelector("[data-close]").onclick = close; });
  }
  function compModal(there) {
    const f = K.compResults(G.date), at = f.findIndex(x => x.who === "you"), you = at >= 0 ? f[at] : null;
    const colour = x => (x.who === "you" ? outfitFor().shirt || "#3f7fa6" : x.who.startsWith("n:") ? (LOOKS[x.who.slice(2)] || {}).shirt || "#6b7a8f" : ["#3f6f9a", "#7a8f4a", "#9b5a3c", "#5a4f7a", "#2f6b62"][x.name.length % 5]);
    const nm = x => (x.who === "you" ? (G.player.name && G.player.name.trim().toLowerCase() !== "you" ? `${esc(G.player.name)} (you)` : "You") : esc(x.who.startsWith("n:") ? callName(x.who) : x.name));
    const lines = f.slice(0, 8).map((x, i) => `<li class="${x.who === "you" ? "me" : ""}"><span>${i + 1}. ${nm(x)}</span><b>${x.score.toLocaleString("en-US")}</b></li>`).join("")
      + (at >= 8 ? `<li class="gap">…</li><li class="me"><span>${at + 1}. ${nm(you)}</span><b>${you.score.toLocaleString("en-US")}</b></li>` : "");
    const youLine = !you ? "You didn't send anything today, so you're not on the board. There's always next year."
      : at < 3 ? `You came ${ordWord(at + 1)}, with ${you.score.toLocaleString("en-US")} points! ${at === 0 ? "Gus reads your name out twice." : "Gus reads your name out and everyone cheers."} There's a ribbon for you on your Climber page.`
      : `You came ${ordWord(at + 1)} of ${f.length}, with ${you.score.toLocaleString("en-US")} points.`;
    const lede = there ? "At dusk everyone gathers by the lot. Gus climbs onto the picnic table with his clipboard, clears his throat twice, and reads out the results. Three people step up onto the podium, and Pickles sits in front of it, very proud of everybody."
      : "You'd headed home by the time the results came out, but Gus texts them round that evening, with a photo of the podium. Pickles is sitting in front of it, very proud of everybody.";
    return () => modal(`<div class="event-scene">${eventArt("comp", f.slice(0, 3).map(colour))}</div><span class="label-sm">${esc((eventToday() || {}).name || "The comp")}</span><h2>The results</h2>
      <p class="lede">${esc(lede)}</p><ol class="comp-board final">${lines}</ol><p class="lede">${esc(youLine)}</p>
      <div class="acts"><button type="button" class="btn primary" data-close>${there ? "Head home" : "Close"}</button></div>`, (root, close) => { root.querySelector("[data-close]").onclick = close; });
  }
  // The end of an event's day: the comp's results; a gathering if you were there at dusk.
  // ---- the Great Granite Hollow Clean-Up (after Phase 4; cleanup.js) ----
  // The litter is scattered by the map (M.litter: it needs the open ground); you pick up what
  // you walk over (G.day.cleanup.mine: the pieces' ids); the regulars' race is worked out fresh
  // from those and the clock (Cleanup.race), so nothing else is saved.
  const litterNow = () => (M && M.litter ? M.litter() : []);
  const racersToday = () => Cleanup.RACERS.filter(r => isAround(r.who) && G.world.npc[r.who]);
  let csCache = {};
  function cleanupState(minute = G.day.minute) {
    const e = eventToday(); if (!e || !e.cleanup) return null;
    const items = litterNow(); if (!items.length) return null;
    const mine = (G.day.cleanup && G.day.cleanup.mine) || [], key = G.date + "|" + minute + "|" + mine.length;
    if (csCache.key === key) return csCache.v;
    const st = Cleanup.race(D, World, items, racersToday(), mine, minute, e.hours, G.date);
    Object.assign(st, { items, mine, rows: Cleanup.standings(st.counts, mine.length) });
    csCache = { key, v: st };
    return st;
  }
  const litterOn = () => { const e = eventToday(); return !!(e && e.cleanup && !G.day.over && G.day.minute >= e.hours[0] && G.day.minute < Math.min(e.hours[1], G.day.weather.dusk)); };
  const racerName = w => (w === "you" ? "You" : w === "n:ade" ? "Ade's gym group" : callName(w));
  function cleanupHtml(e) {
    const st = cleanupState(); if (!st) return "";
    const rows = st.rows, place = rows.findIndex(r => r.who === "you") + 1;
    const row = (x, i) => `<li class="${x.who === "you" ? "me" : ""}"><span>${i + 1}. ${esc(racerName(x.who))}</span><b>${x.n}</b></li>`;
    const mine = rows[place - 1];
    return `<div class="event-card comp cleanup"><span class="label-sm">Today</span><h3>${esc(e.name)}</h3>
      <p class="meta">Walk over litter to bag it. Most pieces by dusk wins the Golden Grabber. Weigh-in by the lot at dusk, ${esc(clock(G.day.weather.dusk))}.</p>
      <h4>Your bag: ${mine.n} ${mine.n === 1 ? "piece" : "pieces"}</h4>${st.left ? "" : `<p class="meta">The park's spotless.</p>`}
      <h4>Leaders so far</h4><ol class="comp-board">${rows.slice(0, 5).map(row).join("")}${place > 5 ? `<li class="gap">…</li>${row(mine, place - 1)}` : ""}</ol></div>`;
  }
  // The weigh-in: everyone's bags at dusk (the regulars carry on till then if you go home early).
  function cleanupAtEnd(e, there) {
    const items = litterNow(); if (!items.length) return null;
    const mine = (G.day.cleanup && G.day.cleanup.mine) || [];
    const st = Cleanup.race(D, World, items, racersToday(), mine, e.hours[1], e.hours, G.date), rows = Cleanup.standings(st.counts, mine.length);
    const place = rows.findIndex(r => r.who === "you") + 1;
    G.events[G.date] = { k: e.key, score: mine.length, place, of: rows.length, top: rows.slice(0, 3).map(r => [r.who, r.n]), ...(there ? { there: true } : {}) };
    note(mine.length ? `${e.name}: you came ${ordWord(place)} of ${rows.length}, with ${mine.length} pieces.` : `${e.name}: you didn't bag anything this year.`);
    if (there) for (const x of peopleToday()) if (K.met(x.who)) bond(x.who, "event");
    return cleanupModal(e, rows, there, items.length - st.left);
  }
  function cleanupModal(e, rows, there, total) {
    const at = rows.findIndex(r => r.who === "you"), you = rows[at], win = rows[0];
    const colour = x => (x.who === "you" ? outfitFor().shirt || "#3f7fa6" : (LOOKS[x.who.slice(2)] || {}).shirt || "#6b7a8f");
    const lines = rows.slice(0, 8).map((x, i) => `<li class="${x.who === "you" ? "me" : ""}"><span>${i + 1}. ${esc(racerName(x.who))}</span><b>${x.n}</b></li>`).join("")
      + (at >= 8 ? `<li class="gap">…</li><li class="me"><span>${at + 1}. You</span><b>${you.n}</b></li>` : "");
    const lede = (there ? "At dusk Gus weighs everyone's bags on the old scale by the lot. The pile of litter ends up taller than Pickles, who is very proud of it."
      : "You'd gone home by the weigh-in, but Gus texts the results round that evening, with a photo of a pile of bin bags taller than Pickles.")
      + ` Between you, the park's ${total} pieces lighter.` + (win.who !== "you" ? ` ${racerName(win.who)} ${win.who === "n:ade" ? "win" : "wins"} the Golden Grabber.` : "");
    const youLine = !you.n ? "You didn't bag anything this year. The park's grateful to everyone who did."
      : at === 0 ? `You win the Golden Grabber, with ${you.n} pieces! It's a litter picker Gus has spray-painted gold, and he presents it with enormous ceremony.`
      : at < 3 ? `You came ${ordWord(at + 1)}, with ${you.n} pieces. There's a ribbon for you on your Climber page.`
      : `You came ${ordWord(at + 1)} of ${rows.length}, with ${you.n} pieces.`;
    return () => modal(`<div class="event-scene">${eventArt("comp", rows.slice(0, 3).map(colour))}</div><span class="label-sm">${esc(e.name)}</span><h2>The weigh-in</h2>
      <p class="lede">${esc(lede)}</p><ol class="comp-board final">${lines}</ol><p class="lede">${esc(youLine)}</p>
      <div class="acts"><button type="button" class="btn primary" data-close>${there ? "Head home" : "Close"}</button></div>`, (root, close) => { root.querySelector("[data-close]").onclick = close; });
  }
  function eventAtEnd(opts = {}) {
    const e = eventToday(); if (!e) return null;
    const there = !!opts.dusk || G.day.minute >= G.day.weather.dusk - 30;
    G.events = G.events || {};
    if (e.cleanup) return cleanupAtEnd(e, there);
    if (e.comp) {
      const me = World.compScore(G.day.sends, compGrade);
      G.events[G.date] = { k: e.key, score: me.score, ...(there ? { there: true } : {}) };
      if (me.score > 0) {
        const f = K.compResults(G.date), place = f.findIndex(x => x.who === "you") + 1;
        Object.assign(G.events[G.date], { place, of: f.length });
        note(`${e.name}: you came ${ordWord(place)} of ${f.length}, with ${me.score.toLocaleString("en-US")} points.`);
      }
      if (there) for (const x of peopleToday()) if (K.met(x.who)) bond(x.who, "event");
      return compModal(there);
    }
    if (!e.gather) return null;
    if (!there) { note(`You headed home before ${e.short}.`); return null; }
    G.events[G.date] = { k: e.key, there: true };
    for (const x of peopleToday()) if (K.met(x.who)) bond(x.who, "event");
    note(e.key === "bonfire" ? "Stayed for the Solstice Bonfire." : "Stayed for the Midsummer Dusk Session.");
    return gatherModal(e);
  }
  // Your ribbons and the events you've been to (the Climber tab).
  function eventsHtml() {
    const evs = Object.entries(G.events || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    if (!evs.length) return "";
    const rows = evs.map(([d, r]) => {
      const e = World.eventOn(d); if (!e) return "";
      const yr = d.slice(0, 4);
      if (e.comp) return `<li>${r.place && r.place <= 3 ? `<span class="ribbon r${r.place}" aria-hidden="true"></span>` : `<span class="ribbon none" aria-hidden="true"></span>`}<div><b>${esc(e.name)} ${yr}</b><div class="meta" style="margin:0">${r.place ? `${upFirst(ordWord(r.place))} of ${r.of}, ${r.score.toLocaleString("en-US")} points` : "Went along, didn't score"}</div></div></li>`;
      if (e.cleanup) return `<li>${r.place && r.place <= 3 && r.score ? `<span class="ribbon r${r.place}" aria-hidden="true"></span>` : `<span class="ribbon none" aria-hidden="true"></span>`}<div><b>${esc(e.name)} ${yr}</b><div class="meta" style="margin:0">${r.score ? `${r.place === 1 ? "The Golden Grabber! " : ""}${upFirst(ordWord(r.place))} of ${r.of}, ${r.score} ${r.score === 1 ? "piece" : "pieces"}` : "Didn't bag anything"}</div></div></li>`;
      if (r.k === "trail") { const t = World.OLD_TRAILS.find(x => x.id === r.trail); return `<li><span class="ribbon none" aria-hidden="true"></span><div><b>${esc(e.name)} ${yr}</b><div class="meta" style="margin:0">You helped${t ? ` reopen ${esc(t.name)}` : ""}</div></div></li>`; }
      return `<li><span class="ribbon none" aria-hidden="true"></span><div><b>${esc(e.name)} ${yr}</b><div class="meta" style="margin:0">You were there</div></div></li>`;
    }).join("");
    return `<h3>Ribbons and gatherings</h3><ul class="events-list">${rows}</ul>`;
  }

  // ---- invitations (Stage 4): a friend who's out today leaves a note on your windscreen ----
  // At most one a day, from someone who's at least a friend, in an area you know, and
  // never the same person two days running. Ignoring one costs nothing.
  function makeInvite() {
    if (!v2() || G.day.rainedOut) return;
    const last = G.lastInvite || {};
    const cand = peopleToday().filter(x => CLIMB_WITH.includes(x.who) && x.s && K.met(x.who) && K.area(D.boulders[x.b].sector) >= 1
      && !(last.who === x.who && last.date === addDays(G.date, -1)) && x.to - Math.max(x.from, G.day.minute) >= 120 && x.to <= G.day.weather.dusk);
    const ro = Social.romance(G), dusk = G.day.weather.dusk;
    // Rowan, once it's time to ask about the sunset, and out till dusk: always (Stage 6).
    const sunsetNote = x => x.who === "n:rowan" && ro.canAsk && x.to >= dusk && !rainNow() && !(Mech.rainStart(G.day.weather) != null && Mech.rainStart(G.day.weather) < dusk);
    // One friend might leave a note, not each of them (Stage 8: with several good friends a
    // note came most mornings), and never two mornings running, except Rowan's sunset note.
    const yesterday = last.date === addDays(G.date, -1);
    for (const x of cand.filter(x => (Social.tier(G, x.who) || { n: 0 }).n >= 2).sort((a, b) => (sunsetNote(b) ? 1 : 0) - (sunsetNote(a) ? 1 : 0) || Math.random() - 0.5).slice(0, 1)) {
      const t = Social.tier(G, x.who), sun = sunsetNote(x);
      const p = x.who === "n:rowan" && ro.n === 4 ? 0.45 : x.who === "n:rowan" && ro.n >= 2 ? 0.3 : t && t.n >= 3 ? 0.3 : 0.18;
      if (!sun && (yesterday || Math.random() >= p)) continue;
      const b = x.b, sec = D.boulders[b].sector;
      const where = K.boulder(b) >= 1 ? `at ${D.boulders[b].name}` : `at ${sec}`;
      const when = x.from <= G.day.minute + 30 ? (x.to <= 800 ? "this morning" : "today") : `from about ${clock(x.from)}`;
      const text = Talk.note({ ...talkEnv(), invite: { who: x.who, where, when, sunset: sun } }, x.who);
      if (!text) continue;
      G.day.invite = { who: x.who, b, from: x.from, to: x.to, text, ...(sun ? { sunset: true } : {}) };
      G.lastInvite = { who: x.who, date: G.date };
      G.day.last.text += ` There's a note tucked under your windscreen wiper: “${text}”`;
      note(`A note from ${firstName(x.who)}: “${text}”`);
      return;
    }
  }
  function inviteHtml() {
    const iv = G.day.invite; if (!iv || G.day.over || !World.NAMED[iv.who.slice(2)]) return "";
    const m = G.day.minute, here = m >= iv.from && m < iv.to, gone = m >= iv.to, sec = D.boulders[iv.b].sector;
    const btn = iv.met ? `<span class="v">Found</span>` : gone ? `<span class="v">Gone</span>` : here && K.area(sec) >= 1 ? `<span class="v">Find</span>` : `<span class="v">Later</span>`;
    const tag = here && !iv.met && !gone && K.area(sec) >= 1 ? `button type="button" class="rowbtn" data-find="${esc(iv.who)}"` : `div class="rowbtn" style="cursor:default"`;
    return `<h3>A note on your windscreen</h3><ul class="rowlist invite"><li><${tag}><span><span class="t">${esc(firstName(iv.who))}</span><span class="s note-hand">“${esc(iv.text)}”</span></span>${btn}</${tag.split(" ")[0]}></li></ul>`;
  }

  // ---- climbing trips (after Phase 4): a friend invites you away for two weeks ----
  // trips.js has the places (real areas, their real classics), the words and what you send.
  // An invitation comes about once a season from a friend whose place is in season, a week or
  // so ahead, never over an event (G.tripOffer; G.tripLast). Saying yes, you leave that Saturday
  // and are back two weeks later: the sends are first sends (XP, and proof for your level), and
  // the friend's away from the crag too (world.js). G.trips keeps every trip.
  const dayGap = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const monthDay = d => toDate(d).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
  const tripDates = o => `${monthDay(o.leave)} to ${monthDay(addDays(o.back, -1))}`;
  function makeTripOffer() {
    if (G.tripOffer || G.dayNo < 10 || (G.tripLast && dayGap(G.tripLast, G.date) < Trips.GAP) || Math.random() >= 0.3) return;
    const who = Object.keys(Trips.DEST_OF).filter(w => K.met(w) && G.world.npc[w] && (Social.tier(G, w) || { n: 0 }).n >= 2).sort(() => Math.random() - 0.5);
    const o = who.length && Trips.offer(G.date, who); if (!o) return;
    const t = Trips.DESTS[o.key];
    G.tripOffer = { ...o, made: G.date }; G.tripLast = G.date; G.day.tripNote = true;
    G.day.last.text += " " + t.note(tripDates(o), { together: o.who === "n:rowan" && togetherNow() });
    note(`An invitation from ${firstName(o.who)}: ${t.name}, ${tripDates(o)}.`);
  }
  function tripHtml() {
    const o = G.tripOffer; if (!v2() || !o) return "";
    const t = Trips.DESTS[o.key]; if (!t) return "";
    if (o.yes) return `<div class="event-card trip soon"><span class="label-sm">Climbing trip</span><b>${esc(t.name)}, ${esc(t.where)}</b><span class="meta">With ${esc(firstName(o.who))}, ${esc(tripDates(o))} <button type="button" class="linklike" data-trip="no">Change of plans</button></span></div>`;
    return `<div class="event-card trip"><span class="label-sm">An invitation</span><h3>${esc(t.ask)}</h3><p class="meta" style="margin:0">${esc(tripDates(o))}: two weeks of ${esc(t.rock)}.</p>
      <div class="trip-acts"><button type="button" class="btn small primary" data-trip="yes">Count me in</button><button type="button" class="btn small" data-trip="no">Not this time</button></div></div>`;
  }
  function answerTrip(yes) {
    const o = G.tripOffer; if (!o) return;
    if (yes) { o.yes = true; toast(`${firstName(o.who)} is delighted`, `You're off to ${Trips.DESTS[o.key].name} on ${monthDay(o.leave)}.`, "find"); }
    else { G.tripOffer = null; toast("Maybe next time", `${firstName(o.who)} says there's always next year.`, "info"); }
    save(); renderAll();
  }
  // Away: what you send (on the morning you leave), recorded straight away.
  function goAway() {
    const o = G.tripOffer, t = Trips.DESTS[o.key]; if (!t) return null;
    const before = levelNow().level;
    const r = Trips.plan(G.player, o.key, ((G.world && G.world.seed) || G.id || "") + "|" + o.leave);
    const tales = Trips.tales(o.key, ((G.world && G.world.seed) || "") + o.leave, { together: o.who === "n:rowan" && togetherNow(), dog: !!(G.dog && G.dog.adopted) });
    const rec = { key: o.key, who: o.who, leave: o.leave, back: o.back, sends: r.sends, xp: r.xp, tales };
    G.player.xp += r.xp;
    const tops = G.player.tops = G.player.tops || [];
    for (const s of r.sends) tops[s.g] = (tops[s.g] || 0) + 1;
    G.trips = [...(G.trips || []), rec];
    G.dayNo += Trips.DAYS;                      // the climbing days (regulars arrive by your climbing days)
    return { ...rec, before };
  }
  // Home again: the morning you're back.
  function backFromTrip(tr) {
    const t = Trips.DESTS[tr.key], after = levelNow().level;
    bond(tr.who, "trip");
    if (tr.who === "n:rowan" && !togetherNow() && Social.romance(G).n >= 1) Social.flirt(G, G.date);   // two weeks together doesn't cool anything
    G.day.tripNote = true;
    G.day.last = { kind: "info", title: `Back from ${t.name}`, text: `You're home from two weeks in ${t.name} with ${firstName(tr.who)}. ` + G.day.last.text };
    note(`Back from ${t.name}, ${t.where}: ${tr.sends.length} sends, +${fmt(tr.xp)} XP.`);
    openModal(() => tripModal({ ...tr, after }));
    if (after > tr.before) { (G.lvlOn = G.lvlOn || {})[after] = G.date; openModal(() => showLevelUp(after)); }
  }
  function tripModal(tr) {
    const t = Trips.DESTS[tr.key], named = tr.sends.filter(s => s.n).sort((a, b) => b.g - a.g), more = tr.sends.filter(s => !s.n);
    const lo = more.length ? Math.min(...more.map(s => s.g)) : 0, hi = more.length ? Math.max(...more.map(s => s.g)) : 0, fl = more.filter(s => s.flash).length;
    const rows = named.map(s => `<li><div class="rowbtn" style="cursor:default"><span><span class="t">${esc(s.n)} <span class="g">${esc(Trips.gradeLabel(tr.key, s))}</span></span><span class="s">${s.flash ? "Flashed" : "Sent"}</span></span><span class="v" style="color:var(--gold)">+${fmt(s.xp)} XP</span></div></li>`).join("");
    modal(`<div class="postcard pc-${esc(tr.key)}" aria-hidden="true"><span class="pc-from">Greetings from</span><span class="pc-name">${esc(t.name)}</span><span class="pc-where">${esc(t.where)}</span></div>
      <span class="label-sm">Two weeks away with ${esc(firstName(tr.who))}</span><h2>Back from ${esc(t.name)}</h2>
      <p class="lede">${esc(t.lede)}</p>
      ${rows ? `<ul class="rowlist trip-sends">${rows}</ul>` : ""}
      ${more.length ? `<p class="meta">…and ${more.length} more ${more.length === 1 ? "problem" : "problems"}, ${lo === hi ? `V${lo}` : `V${lo} to V${hi}`}${fl ? `, ${fl === more.length ? "all" : fl} of them flashed` : ""}.</p>` : ""}
      <p class="lede trip-xp"><b>+${fmt(tr.xp)} XP</b>${tr.after > tr.before ? `, and you're V${tr.after} now` : ""}.</p>
      <ul class="trip-tales">${tr.tales.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="acts"><button type="button" class="btn primary" data-close>Back to Granite Hollow</button></div>`,
      (root, close) => { root.querySelector("[data-close]").onclick = close; });
  }
  function tripsHtml() {
    const ts = (G.trips || []).slice().reverse(); if (!ts.length) return "";
    const rows = ts.map(tr => {
      const t = Trips.DESTS[tr.key]; if (!t) return "";
      const top = tr.sends.slice().sort((a, b) => b.g - a.g || (b.n ? 1 : 0) - (a.n ? 1 : 0))[0];
      const when = toDate(tr.leave).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
      return `<li><span class="stamp" aria-hidden="true"></span><div><b>${esc(t.name)}, ${esc(t.where)}</b><div class="meta" style="margin:0">${esc(when)}, with ${esc(firstName(tr.who))} · ${tr.sends.length} sends${top ? `, hardest ${top.n ? `${esc(top.n)}, ${esc(Trips.gradeLabel(tr.key, top))}` : `V${top.g}`}` : ""}</div></div></li>`;
    }).join("");
    return `<h3>Climbing trips</h3><ul class="events-list trips-list">${rows}</ul>`;
  }

  // ---- the regulars (Stage 5): people you get to know. Who's around, where,
  // and what they say (talk.js, Phase 4). Names, places and lines only ever come through K.
  const isAround = w => {
    const n = World.NAMED[w.slice(2)];
    if (!n || !n.regular || G.dayNo < (n.arrive || 0)) return false;
    return n.dog || n.old ? true : !!G.world.npc[w];
  };
  // Who you run into on arriving in an area: nobody now. Everyone is somewhere
  // on the map today (peopleToday, and Pickles asleep by his rock): walk up to them.
  function regularFor(sector) { return null; }
  // Who's out today, and where (Stage 6): each regular who's around is at one of
  // their home areas' boulders, decided by the day (so a reload doesn't move them).
  // The Bishop only on his days. Drawn on the map; walk up to someone to talk.
  const LOOKS = (window.Portraits && Portraits.LOOKS) || {};           // each regular's colours and clothes (portraits.js; the map's figures and the portraits share them)
  let peopleCache = { key: "", list: [] };
  function peopleToday() {
    if (!v2()) return [];
    const key = G.date + "|" + !!G.day.bishop + "|" + Object.keys(G.world.npc).length + "|" + G.world.simDate;
    if (peopleCache.key === key) return peopleCache.list;
    // The regulars who climb are where today's session has them (World.sessionOn:
    // their routine, their project; Phase 4, Stage 0). The Bishop only on his days.
    const r = World.stream(G.world.seed, "people|" + G.date), list = [];
    for (const w of [...World.CLIMBING_REGULARS, "n:gus", "n:bishop"]) {
      const key2 = w.slice(2), n = World.NAMED[key2], out = r(), pa = r(), pb = r(), ps = r();     // drawn whatever happens, so one person doesn't move another
      if (!isAround(w)) continue;
      let b, s = null, t = [570, 990];                                  // the Bishop: mid-morning to the afternoon
      if (key2 === "bishop") {
        if (!G.day.bishop) continue;
        const area = n.home[Math.floor(pa * n.home.length)], bs = D.boulders.filter(x => x.sector === area);
        if (!bs.length) continue;
        b = bs[Math.floor(pb * bs.length)].id;
      } else { s = World.sessionOn(G, w, G.date); if (!s) continue; b = s.b; t = World.ROUTINES[key2] ? World.routineOn(key2, G.date).t : s.t; }   // their hours as the routine has them now
      const group = key2 === "ade" && ([0, 6].includes(toDate(G.date).getUTCDay()) || eventToday()) ? 3 : 0;   // Ade's gym group, at weekends (after Phase 4)
      list.push({ who: w, name: n.name.replace(/^the /, "The "), b, side: ps < .5 ? -1 : 1, look: LOOKS[key2] || {}, from: t[0], to: Math.min(t[1], G.day.weather.dusk), s, ...(group ? { group } : {}) });
    }
    peopleCache = { key, list };
    return list;
  }
  // Who's around right now (Phase 4, Stage 1): out today, and within their hours.
  // Your partner is with you whatever the hour.
  function peopleNow() {
    const m = G.day.minute, pal = partnerNow();
    const now = peopleToday().filter(x => x.who === pal || (m >= x.from && m < x.to));
    if (!litterOn()) return now;
    const st = cleanupState(); if (!st) return now;
    return now.map(x => (x.who !== pal && st.last[x.who] != null ? { ...x, b: st.items[st.last[x.who]].b } : x));   // the Clean-Up: by their last find
  }
  // What someone's doing, in a few words (never names a place or a line).
  const ACT = {
    gus: { proj: "Trying a problem by the lot, between patrols", mileage: "On patrol, more or less", wet: "Checking the trails after the rain" },
    hollis: { proj: "Working a project, laptop open on the pad", mileage: "Climbing, and logging every go", wet: "Fixing bugs in CragLog under a tarp" },
    otis: { proj: "On a project, in perfect sending weather", mileage: "Climbing, cheerfully", wet: "Insisting it's nearly dry" },
    rowan: { proj: "Working a project, sketchbook on the pad", mileage: "Sketching the boulders between burns", wet: "Sketching in the rain" },
    bea: { proj: "Throwing for a project, over and over", mileage: "Jumping for things", wet: "Practising dynos on a log while the rock dries" },
    dez: { proj: "Quietly working something hard", mileage: "Climbing, quietly", wet: "Sitting under the trees, waiting it out" },
    mags: { proj: "Working a slab, with a flask of tea on the pad", mileage: "Climbing the easy ones, slowly and happily", wet: "Reading under the hemlocks" },
    ade: { proj: "Working a project between coaching", mileage: "Coaching, and climbing a bit", wet: "Running balance drills on a log" },
    juno: { proj: "Working a line Juno cleaned", mileage: "Brushing a line nobody's climbed yet", wet: "Scouting for new lines in the rain" },
  };
  function activity(p) {
    if (p.who === "n:bishop") return "Telling anyone who'll listen about 1977";
    if (litterOn()) return p.who === "n:gus" ? "Handing out grabbers and bin bags" : p.who === "n:ade" ? "Litter-picking with the gym group" : "Litter-picking, bag in hand";
    const a = ACT[p.who.slice(2)] || {}, s = p.s;
    return !s ? "Climbing" : s.out === "wet" ? a.wet : s.p != null ? a.proj : a.mileage;
  }
  // "11 AM", "3:30 PM": to the nearest half hour.
  const about = m => clock(Math.round(m / 30) * 30).replace(":00", "");
  const isKnown = w => !!(v2() && K.met(w));
  const callName = w => World.whoName(D, w).replace(/^the /, "The ");
  // The card when you hover over (or tap) someone on the map.
  function personTipHtml(who) {
    if (!v2()) return "";
    if (who === "n:pickles") {
      const m = dogMode(), what = { lot: "Waiting by your car", follow: "Following you around", with: "Your dog", home: "Heading back to his rock" }[m] || "Napping in the shade of his rock";
      return isKnown(who) ? `<strong>Pickles</strong><div class="sub">${what}</div>${dogWithYou() ? "Click him to say hello." : G.day.met.includes(who) ? "You've said hello today." : "Walk over and say hello."}`
        : `<strong>A scruffy dog</strong><div class="sub">${m === "rock" ? "Napping in the shade of a boulder" : what}</div>Walk over and say hello.`;
    }
    const p = peopleToday().find(x => x.who === who); if (!p) return "";
    const pal = partnerNow() === who, met = isKnown(who);
    const when = pal ? `Climbing with you${G.day.partner.allDay ? " today" : ` until about ${about(G.day.partner.until)}`}` : `Around until about ${about(p.to)}`;
    return `<strong>${esc(met ? callName(who) : "Someone you haven't met")}</strong><div class="sub">${esc(activity(p))}</div>${when}${pal ? "" : `<br>${G.day.met.includes(who) ? "You've talked today." : "Walk over to say hello."}`}`;
  }
  // Where someone is, as you know it: a boulder you know, an area you know, or word of where.
  function whereIs(b) {
    const sec = D.boulders[b].sector;
    if (K.area(sec) < 1) return { text: (World.AREAS[sec] && World.AREAS[sec].hint) || "somewhere in the woods", go: false };
    return { text: K.boulder(b) >= 1 ? `at ${D.boulders[b].name}, ${sec}` : `somewhere at ${sec}`, go: true };
  }
  // Out today (Phase 4, Stage 1): the regulars you know who are out, where, and when.
  function outTodayHtml() {
    if (!v2() || G.day.over) return "";
    const m = G.day.minute, pal = partnerNow();
    const mine = peopleToday().filter(x => isKnown(x.who));
    const strangers = peopleNow().filter(x => !isKnown(x.who)).length;
    const dog = isAround("n:pickles") && isKnown("n:pickles");
    if (!mine.length && !dog && !strangers) return "";
    const rows = mine.map(p => {
      const w = whereIs(p.b), now = p.who === pal || (m >= p.from && m < p.to), later = m < p.from;
      const sub = p.who === pal ? "Climbing with you" : now ? `${w.text} · until about ${about(p.to)}` : later ? `${w.text}, from about ${about(p.from)}` : `Was out ${p.to <= 780 ? "this morning" : "earlier"}, ${w.text}`;
      const find = now && w.go && p.who !== pal;
      const heart = p.who === "n:rowan" && togetherNow() ? ` <span class="ro-heart" aria-label="(together)">♥</span>` : "";
      return `<li><${find ? `button type="button" class="rowbtn" data-find="${esc(p.who)}"` : `div class="rowbtn" style="cursor:default"`}><span><span class="t">${esc(callName(p.who))}${heart}</span>
        <span class="s">${esc(sub)}${now && p.who !== pal ? ` · ${esc(activity(p).toLowerCase())}` : ""}</span></span><span class="v">${find ? "Find" : now ? "" : later ? "Later" : "Gone"}</span></${find ? "button" : "div"}></li>`;
    });
    if (dog) {
      const rock = D.boulders.find(b => b.name === "Pickles' Rock");
      const by = rock && K.boulder(rock.id) >= 1 ? `by ${rock.name}` : "by his rock";
      const m = dogMode();
      if (m === "follow" || m === "with") rows.push(`<li><div class="rowbtn" style="cursor:default"><span><span class="t">Pickles</span><span class="s">${m === "with" ? "Your dog, right here with you" : "Following you around"}</span></span><span class="v">With you</span></div></li>`);
      else rows.push(`<li><button type="button" class="rowbtn" data-find="n:pickles"><span><span class="t">Pickles</span><span class="s">${m === "lot" ? "Waiting by your car" : m === "home" ? "Heading back to his rock" : `Napping ${esc(by)}, ${esc(START_AREA)}`}</span></span><span class="v">Find</span></button></li>`);
    }
    const others = strangers ? `<p class="meta">${strangers === 1 ? "Someone you haven't met is" : `${strangers} people you haven't met are`} out too. Look for them on the map.</p>` : "";
    return `<h3 class="out-h">Out today</h3>${rows.length ? `<ul class="rowlist out-today">${rows.join("")}</ul>` : ""}${others}`;
  }
  // Walking up to someone (within a few metres of them) starts a conversation, once a day each.
  function meetNearby(pos) {
    if (!v2() || G.day.over) return false;
    // Pickles, napping by Pickles' Rock.
    const dm = dogMode(), dp = dm === "rock" || dm === "lot" ? dogPos() : null;
    const again = w => UI.talkTo === w && !(G.day.encounter && G.day.encounter.who === w);
    const dog = dp && { x: dp[0], y: dp[1] };
    if (dog && Math.hypot(pos[0] - dog.x, pos[1] - dog.y) < 6) {
      if (!G.day.met.includes("n:pickles")) { G.day.met.push("n:pickles"); G.day.encounter = buildRegular("n:pickles", "The Tailgate", { napping: true }); UI.talkTo = null; return true; }
      if (again("n:pickles")) { UI.talkTo = null; G.day.encounter = buildRegular("n:pickles", "The Tailgate", { again: true }); return true; }
    }
    for (const p of peopleNow()) {
      const at = M.paint && M.paint.personAt(p.who); if (!at) continue;
      if (Math.hypot(pos[0] - at.x, pos[1] - at.y) >= 7) continue;
      if (!G.day.met.includes(p.who)) { G.day.met.push(p.who); G.day.encounter = buildRegular(p.who, D.boulders[p.b].sector); UI.talkTo = null; return true; }
      if (again(p.who)) { UI.talkTo = null; G.day.encounter = buildRegular(p.who, D.boulders[p.b].sector, { again: true }); return true; }
    }
    return false;
  }
  function personSpot(who) {
    const at = M.paint.personAt(who); if (!at) return null;
    return [at.x + at.side * 4.5, at.y - .5];          // beside them, on the far side from the rock
  }
  // An area you haven't found that the community has known about for a while
  // (5+ of your climbing days), so explorers get there first. The nearest one.
  function directionsTo() {
    const W = G.world, known = new Set(W.found.map(b => D.boulders[b].sector));
    const ok = D.sectors.filter(s => K.area(s.name) < 1 && known.has(s.name) && G.dayNo - ((W.areas && W.areas[s.name]) ? W.areas[s.name][1] : -99) >= 5);
    return ok.sort((a, b) => a.walk_min - b.walk_min)[0]?.name ?? null;
  }
  // A line on a boulder you know that you haven't noticed (too hard to read yet).
  function hiddenLineFor(strong) {
    const A = Mech.ability(G.player), out = [];
    for (const b of Object.keys(G.know.boulders).map(Number)) for (const p of D.boulders[b].problems) if (K.line(p) === "hidden" && !G.world.est[p]) out.push(p);
    if (!out.length) return null;
    const aim = strong ? A + 4 : A + 1.5;
    out.sort((a, b) => Math.abs(D.problems[a].grade - aim) - Math.abs(D.problems[b].grade - aim) || a - b);
    if (!strong && D.problems[out[0]].grade > A + 3) return null;
    return out[Math.floor(Math.random() * Math.min(3, out.length))];
  }
  // Your project: the one you've tried most, unsent, worked on in the last week.
  function currentProject() {
    return Object.keys(G.ps).map(Number).filter(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 3 && K.visible(i) && (G.ps[i].log || []).some(x => Array.isArray(x) && String(x[0]) >= addDays(G.date, -7))).sort((a, b) => G.ps[b].att - G.ps[a].att)[0] ?? null;
  }
  function buildRegular(w, sector, ctx = {}) {
    const key = w.slice(2), n = World.NAMED[key], prev = K.met(w), lastMet = prev && prev.last, r = K.meet(w, G.date), first = r.n === 1;
    const gap = lastMet && lastMet < G.date ? World.daysBetween(lastMet, G.date) : 0;   // since you last talked (Stage 4)
    bond(w, "met");
    if (key === "otis" && (rainNow() || G.day.weather.cond <= -0.3)) bond(w, "wet");    // company on a wet or greasy day
    // They know what you're working on (for later conversations).
    const proj = key === "pickles" ? null : currentProject();
    if (proj != null) bond(w, "proj", proj);
    const e = { who: w, sector, line: "", rec: null, recLine: "", beta: null, accepted: false, betaTaken: false, open: true, idx: 0, used: [] };
    // What they say: a hello and their news (talk.js), or, back again today, a short hello.
    const sunset = key === "rowan" && sunsetDue();                        // Rowan asks you to stay for the sunset (Stage 6)
    e.beats = ctx.again && !sunset && !(key === "pickles" && dogWithYou()) ? Talk.reply(talkEnv(), w, "again") : Talk.opening({ ...talkEnv(), gap, sunset }, w);
    if (sunset) { e.sunset = true; if (G.day.sunset !== "asked") { Social.asked(G, G.date); G.day.sunset = "asked"; note("Rowan asked you to stay for the sunset."); } }
    if (key === "rowan" && Social.canFlirt(G)) e.flirt = Talk.playful(talkEnv());
    if (G.day.invite && G.day.invite.who === w) G.day.invite.seen = G.day.invite.met = true;
    if (!e.beats.length) e.beats = [{ t: "Hello again.", mood: "happy" }];
    e.line = e.beats.map(b => b.t).join(" ");
    if (key === "pickles") { e.pet = true; return e; }
    if (key === "bishop") e.say = true;
    // What they offer: the way to an area, a line you haven't noticed, or a recommendation (and beta).
    const strong = key === "dez" || key === "bishop" || (n.level || 0) >= 9;
    const dirTo = directionsTo(), hidden = hiddenLineFor(strong);
    const chanceDir = key === "hollis" || key === "gus" ? 0.7 : key === "bishop" ? 0.4 : 0.3;
    if (dirTo && Math.random() < chanceDir) { e.dir = dirTo; e.dirLine = key === "bishop" ? `He taps the side of his nose. “Ever been ${World.AREAS[dirTo]?.hint || "further out"}? There's rock out there nobody's looked at properly since '79.”` : `Have you been ${World.AREAS[dirTo]?.hint || "further out"} yet? There's good rock out there.`; }
    else if (hidden != null && Math.random() < (strong ? 0.6 : 0.25)) {
      const b = D.problems[hidden].b;
      e.reveal = hidden;
      e.revealLine = key === "bishop" ? `“There's a line on ${D.boulders[b].name} nobody's done since me,” he says. “Ha.”` : key === "dez" ? `There's a line on ${D.boulders[b].name}. Hard. Nobody's touched it.` : `Have you seen the line on ${D.boulders[b].name}? It's easy to miss.`;
    } else if (key !== "bishop" && Math.random() < 0.45) {
      // A recommendation (Stage 3: rarer, and only something they've climbed themselves lately).
      const rec = theirRec(w);
      if (rec != null) { e.rec = rec; const b = Talk.reply({ ...talkEnv(), rec }, w, "rec"); e.recLine = b.length ? b[0].t : `Try ${pname(rec)}.`; }
    }
    e.asks = key === "bishop" ? [] : betaAsks(w);
    return e;
  }
  // Something a regular's climbed lately that would suit you: their recent sends, best fit first.
  function theirRec(w) {
    const R = World.regOf(G, w); if (!R) return null;
    const recent = new Set([...R.recent.slice(0, 10).flatMap(s => s.w.concat(s.out === "send" && s.p != null ? [s.p] : [])), ...R.done.filter(x => x[4] === "sent" && World.daysBetween(x[2], G.date) <= 45).map(x => x[0])]);
    const ok = [...recent].filter(i => G.world.est[i] && !G.ps[i]?.sent && !G.tips.some(t => t.p === i) && playerFit(i) > -3).sort((a, b) => playerFit(b) - playerFit(a));
    return ok.length ? ok[0] : null;
  }
  const whoOf = f => (typeof f === "number" ? (D.climbers[f] || ["someone"])[0] : World.whoName(D, f));
  function askWay() {
    const e = G.day.encounter; if (!e || !e.dir || e.dirTaken) return;
    e.dirTaken = true;
    if (K.hearOf(e.dir, e.who, G.date)) {
      toast(`New area: ${e.dir}`, `${whoOf(e.who).replace(/^the /, "The ")} told you the way. It's on your trail map now.`, "find");
      note(`${whoOf(e.who).replace(/^the /, "The ")} told you the way to ${e.dir}.`);
    }
    save(); renderAll();
  }
  function hearLine() {
    const e = G.day.encounter; if (!e || e.reveal == null || e.revealTaken) return;
    e.revealTaken = true;
    if (K.tell(e.reveal, e.who, G.date)) {
      toast("A line you hadn't noticed", `${pname(e.reveal)} on ${D.problems[e.reveal].boulder.name}. It's in your journal.`, "find");
      note(`${whoOf(e.who).replace(/^the /, "The ")} pointed out ${pname(e.reveal)} on ${D.problems[e.reveal].boulder.name}.`);
    }
    save(); renderAll();
  }
  function sitChat() {
    const e = G.day.encounter; if (!e || !e.who || !e.who.startsWith("n:") || e.pet || e.chatted || UI.busy || G.day.over) return;
    K.chat(e.who, G.date);
    bond(e.who, "chat");
    if (e.who === "n:rowan" && peopleNow().length <= 2) bond(e.who, "quiet");   // Rowan likes the quiet days
    const told = Talk.reply(talkEnv(), e.who, "story");
    e.chatted = told.length ? told[0].t : "You sit and talk for a while.";
    talkAdd(e, told.length ? told : [{ t: e.chatted, mood: "happy", narr: true }]);
    closerNow(e);
    G.day.minute += 20;
    G.player.energy = Math.min(G.day.startEnergy, G.player.energy + 15);
    note(`Sat and talked with ${whoOf(e.who).replace(/^the /, "the ")}.`);
    afterAction();
  }
  function petDog() {
    const e = G.day.encounter; if (!e || !e.pet || e.petted) return;
    K.pet(e.who, G.date);
    bond(e.who, "pet");
    const b = Talk.reply(talkEnv(), e.who, "pet");
    e.petted = b.length ? b[0].t : "He leans into your hand.";
    talkAdd(e, b.length ? b : [{ t: e.petted, mood: "happy", narr: true }]);
    const f = dogAfterPet(); if (f && f.length) talkAdd(e, f);          // he comes along (Stage 5)
    save(); renderAll();
  }
  function acceptTip() {
    const e = G.day.encounter; if (!e || e.rec == null) return;
    e.accepted = true;
    if (!G.tips.some(t => t.p === e.rec && !t.done)) G.tips.push({ p: e.rec, from: e.ci ?? e.who, date: G.date, why: whyFor(e.rec), done: false });
    note(`${whoOf(e.ci ?? e.who)} recommended ${pname(e.rec)}.`);
    save(); renderAll();
  }
  // ---- partners and good vibes (Phase 3, Stage 4; docs/phase3/stage4-partners.md) ----------
  // A regular you're talking to can climb with you for a few hours (G.day.partner:
  // { who, until }): they come along to each boulder, stand by your pad in the
  // climbing scene, see what you can't from the ground (your falls teach you more),
  // call up beta once on a line they know, and cheer your sends, which your logbook
  // remembers (tick.with). Never required, never XP: climbing alone loses nothing.
  // Good vibes: a small, hidden lift to the send chance (Mech.vibes), only ever
  // put in words.
  const CLIMB_WITH = ["n:gus", "n:hollis", "n:otis", "n:rowan", "n:bea", "n:dez", "n:mags", "n:ade", "n:juno"];
  const partnerNow = () => (v2() && G.day && !G.day.over && G.day.partner && G.day.partner.who) || null;
  const firstName = w => World.whoName(D, w).replace(/^Ranger /, "").split(" ")[0];
  const PARTNER = {
    gus: { yes: "“I've got a couple of hours before I check the gate. Let's see what you've got.”", allDay: "“Actually, the gate can wait. Pickles will let me know.”", bye: "Ranger Gus has to go and lock up the quarry road. “Good climbing today.”",
      cheer: ["Gus whoops from the pad.", "“Now that's climbing!” Gus says."] },
    hollis: { yes: "“Yes! I want to see how your beta compares with what's been logged.”", allDay: "“I've cleared my whole afternoon. The bug reports can wait.”", bye: "Hollis heads off to find some signal. “Log that one tonight. I'll be watching.”",
      cheer: ["Hollis claps, then types something.", "“That's going in CragLog,” Hollis says, delighted."] },
    otis: { yes: "“Perfect partner weather! I'll spot.”", allDay: "“I've got sandwiches for the whole day.”", bye: "Otis packs up his pad. “Perfect day. Same time next week?”",
      cheer: ["Otis cheers loud enough to scare the chickadees.", "“PERFECT sending weather!” Otis shouts."] },
    rowan: { yes: "“I'd like that. I'll bring my sketchbook, in case you do something worth drawing.”", allDay: "“Honestly, I've got nowhere else I'd rather be today.”", bye: "Rowan closes the sketchbook. “Thanks for today. Really.”",
      cheer: ["Rowan laughs and claps. “I'm drawing that one.”", "“You made that look easy,” Rowan says. “It didn't look easy.”"],
      // Together (Stage 6).
      yesUs: "“Always. I'll bring the sketchbook, and the good sandwiches.”", allDayUs: "“I've got all day. I made sure.”",
      byeUs: "Rowan closes the sketchbook and squeezes your hand. “See you soon. Not soon enough, but soon.”",
      cheerUs: ["Rowan runs over and hugs you, chalk everywhere.", "“That's my favourite climber,” Rowan tells nobody in particular."] },
    bea: { yes: "“YES. Can we try something dynamic? We should try something dynamic.”", allDay: "“My mom's not picking me up till dark!”", bye: "Bea's mom is waiting in the lot. “Bye! Try jumping for it!”",
      cheer: ["Bea screams with joy. Somewhere, a crow takes off.", "“That was SICK,” Bea says. “Do it again!”"] },
    dez: { yes: "“Sure.”", allDay: "“All day, if you like.”", bye: "Dez nods, shoulders a pad and walks off into the trees. “Good session.”",
      cheer: ["Dez nods, once. From Dez, that's a standing ovation.", "“Nice,” Dez says, and means it."] },
    mags: { yes: "“Lovely. I'll go first on the easy one, and you can show me how it's done on the rest.”", allDay: "“I've nothing on until the grandchildren on Sunday.”", bye: "Mags packs up her flask. “That was a lovely session, dear. Rest those fingers.”",
      cheer: ["“Well done!” Mags claps. “Gold star.”", "Mags puts down her tea to applaud."] },
    ade: { yes: "“Yes! I'll spot. Quiet feet, remember.”", allDay: "“The group can warm up without me. Probably.”", bye: "Ade jogs back to the group. “Great session. Rest day tomorrow!”",
      cheer: ["“YES! Textbook!” Ade shouts.", "Ade whoops, and the whole group joins in."] },
    juno: { yes: "“Sure! Then I'm showing you a line nobody's touched. Well. I've touched it. With a brush.”", allDay: "“All day? Great. Bring a brush.”", bye: "Juno heads off into the trees with a brush. “Don't put up anything without me.”",
      cheer: ["“Nice! Clean, too,” Juno says.", "Juno whoops, then checks the holds you used for moss."] },
  };
  // A partner's line: Rowan's are different once you're together (Stage 6).
  const partnerSays = (w, k) => { const P = PARTNER[w.slice(2)] || {}; return (w === "n:rowan" && togetherNow() && P[k + "Us"]) || P[k]; };
  function canPartner(e) {
    if (!e || !CLIMB_WITH.includes(e.who) || partnerNow() || G.day.over || UI.busy || rainNow()) return false;
    return G.day.weather.dusk - G.day.minute >= 60;
  }
  function climbTogether() {
    const e = G.day.encounter; if (!canPartner(e)) return;
    // Two to four hours; sometimes all day (Rowan more often).
    const w = G.day.weather, allDay = Math.random() < (e.who === "n:rowan" ? 0.35 : 0.2), stay = 120 + 10 * Math.floor(Math.random() * 13);
    const iv = G.day.invite && G.day.invite.who === e.who ? G.day.invite : null;     // they asked you: the rest of their session
    G.day.partner = { who: e.who, until: allDay ? w.dusk : iv ? Math.min(w.dusk, Math.max(iv.to, G.day.minute + 60)) : Math.min(w.dusk, G.day.minute + stay), ...(allDay ? { allDay: true } : {}), ...(G.loc.boulder != null ? { b: G.loc.boulder } : {}) };
    e.partnered = partnerSays(e.who, "yes") + (allDay ? ` ${partnerSays(e.who, "allDay")}` : "");
    bond(e.who, "climb");
    if (G.day.invite && G.day.invite.who === e.who) bond(e.who, "invite");
    note(`Climbing with ${World.whoName(D, e.who).replace(/^the /, "the ")}.`);
    save(); renderAll();
  }
  function partWays(text) {
    const w = partnerNow(); if (!w) return;
    G.day.partner = null;
    toast(`${firstName(w)} heads off`, text || "“Thanks for the session!”", "info");
    note(`${firstName(w)} headed off.`);
  }
  // Your partner calls up beta once on a line they know (Phase 4, Stage 3: once per person per line).
  function partnerBeta(w, i) {
    if (tippedBy(i, w)) return "";
    const from = fromOf(w, i);
    if (!from || from.knows === "style" && Math.random() < 0.5) return "";
    const r = takeBetaFrom(w, i, from);
    if (r.what === "none") return "";
    const body = r.body ? ` I'm ${r.body} than you, so it might feel different.` : "";
    return ` ${firstName(w)} calls up from the pad: “${upFirst(Talk.moveWord(r))}! ${betaHow(i, r)}${body}”`;
  }
  // The vibes right now (memoised: the problem lists ask for every line).
  let vibeMemo = { key: "", v: null };
  function vibesNow() {
    if (!v2() || !G.day) return { v: 0 };
    const key = [G.date, G.day.minute, G.loc.sector, partnerNow(), G.ticks.length, G.world.est ? Object.keys(G.world.est).length : 0].join("|");
    if (vibeMemo.key === key) return vibeMemo.v;
    const w = G.day.weather, out = peopleNow(), partner = partnerNow(), since = addDays(G.date, -2);
    const crowd = out.filter(x => x.who !== partner && D.boulders[x.b].sector === G.loc.sector);
    // Your breakthrough: a hardest-yet send, or a project that took four tries or more.
    let best = -1; const high = G.ticks.some(t => { const g = D.problems[t.p].grade, nb = t.style !== "Repeat" && g > best; if (t.style !== "Repeat") best = Math.max(best, g); return t.date >= since && t.style !== "Repeat" && (nb || (t.att || 0) >= 4); });
    // A friend's first ascent: a regular you've met.
    const friend = Object.values(G.world.est).find(e => e && typeof e.by === "string" && e.by.startsWith("n:") && e.date >= since && e.date <= G.date && K.met(e.by));
    const why = { partner: !!partner, rowan: partner === "n:rowan", crowd: crowd.length, buzz: w.label === "Prime" && out.length >= 3, high, friend: !!friend };
    const v = { ...why, v: Mech.vibes(why), crowdWho: crowd.map(x => x.who), friendWho: friend ? friend.by : null };
    vibeMemo = { key, v };
    return v;
  }
  // The vibes in words, for the climbing scene (only names you know).
  function vibesWords(i) {
    const vb = vibesNow(), st = G.ps[i];
    if (vb.v < 0.08) return "";
    const known = vb.crowdWho.filter(w => K.met(w));
    const bits = [];
    if (vb.rowan && togetherNow()) bits.push(pick(["Rowan drops a pad beside yours and squeezes your hand. Everything feels a little lighter.", "Rowan's sitting by your pad, drawing you, pretending not to. You feel like you could climb anything."]));
    else if (vb.rowan) bits.push(pick(["Rowan drops a pad beside yours, and somehow everything feels a little lighter.", "Rowan sets the sketchbook down by your pad and grins at you. You feel like you could climb anything."]));
    else if (vb.partner) bits.push(`${firstName(partnerNow())} drops a pad beside yours.`);
    else if (known.length) bits.push(`${firstName(known[0])} is climbing nearby${known.length > 1 ? `, and ${firstName(known[1])}` : ""}.`);
    else if (vb.crowd) bits.push("There are a few climbers around.");
    if (vb.buzz) bits.push("The crag's buzzing today.");
    if (vb.high) bits.push("You're still riding high from your last send.");
    else if (vb.friend && K.met(vb.friendWho)) bits.push(vb.friendWho === partnerNow() ? `${firstName(vb.friendWho)}'s still buzzing from a new first ascent.` : `Everyone's talking about ${firstName(vb.friendWho)}'s new first ascent.`);
    if (vb.v >= 0.12 && st && st.att >= 3 && !st.sent) bits.push(pick(["Vibes at the crag are good today. Time to hop on the proj.", "Good vibes today. If it's going to go, it might as well be now."]));
    else if (vb.v >= 0.12) bits.push("Good vibes at the crag today.");
    return bits.join(" ");
  }
  // ---- conversations (Phase 4, Stage 2): a box over the map, with a portrait ----------------
  // G.day.encounter is the conversation: its beats (what's been said, { t, mood,
  // narr }), which one you're on (idx), the replies you've used, and what they can
  // offer (directions, a line you'd miss, a recommendation, beta, climbing together).
  // Words come from talk.js; actions are the same as before. Walking away ends it.
  function talkEnv() {
    const pr = v2() ? K.met("n:pickles") : null;
    return { G, D, K, World, Social, minute: G.day.minute, wet: rainNow(), rng: Math.random, playerName: G.player.name, pets: (pr && pr.pets) || 0, gusOut: peopleNow().some(x => x.who === "n:gus"), dogMode: dogMode() || "rock" };
  }
  function talkAdd(e, beats) {
    if (!e || !beats || !beats.length) return;
    e.beats = e.beats || []; e.beats.push(...beats); e.idx = e.beats.length - beats.length;
  }
  function talkChoices(e) {
    if (e.closing) return [];
    const n = typeof e.who === "string" && e.who.startsWith("n:"), key = n ? e.who.slice(2) : null, used = k => (e.used || []).includes(k), out = [];
    if (e.pet) {
      if (!e.petted) out.push(["pet", "Pet him", "data-pet"]);
      if (!used("stick")) out.push(["stick", "Throw his stick", "data-stick"]);
      out.push(["bye", dogWithYou() ? "Good boy" : dogMode() === "lot" ? "See you later, Pickles" : "Leave him to his nap", "data-bye"]);
      return out;
    }
    const mine = currentProject();
    if (e.sunset && !e.sunsetDone) { out.push(["sunset", "Watch the sunset with Rowan", "data-sunset"]); out.push(["sunset-no", "Not tonight", "data-sunset-no"]); }
    if (n && key !== "bishop" && !used("ask")) out.push(["ask", "What are you working on?", "data-ask"]);
    if (n && key !== "bishop" && mine != null && !used("tell")) out.push(["tell", `I'm working on ${pname(mine)}`, "data-tell"]);
    if (canPartner(e) && !e.partnered) out.push(["together", "Climb together?", "data-together"]);
    for (const i of e.asks || []) if (!used("beta:" + i)) out.push(["beta:" + i, `Any beta for ${pname(i)}?`, "data-beta"]);
    if (e.dir && !e.dirTaken) out.push(["dir", key === "bishop" ? "Ask where else is worth a look" : "Know any other good spots?", "data-dir"]);
    if (e.dir && e.dirTaken && !G.day.over) out.push(["go-sector", `Walk to ${e.dir}`, "data-go-sector"]);
    if (e.reveal != null && !e.revealTaken) out.push(["reveal", "Seen any lines I'd miss?", "data-reveal"]);
    if (e.reveal != null && e.revealTaken && !G.day.over) out.push(["go-boulder", "Go and look", "data-go-boulder"]);
    if (e.rec != null && !used("rec")) out.push(["rec", "What should I try?", "data-rec"]);
    if (e.rec != null && used("rec") && !e.accepted) out.push(["accept", "Add it to my list", "data-accept"]);
    if (n && !e.chatted) out.push(["chat", key === "bishop" ? "Ask about the old days · 20 min" : "Sit and chat · 20 min", "data-chat", UI.busy || G.day.over]);
    if (e.flirt && !used("flirt") && Social.canFlirt(G)) out.push(["flirt", e.flirt.label, "data-flirt"]);   // something playful (Rowan: Stage 6)
    out.push(["bye", "Bye!", "data-bye"]);
    return out;
  }
  function talkAct(k) {
    const e = G.day.encounter; if (!e) return;
    const env = talkEnv(), use = () => { e.used = e.used || []; if (!e.used.includes(k)) e.used.push(k); };
    const who = typeof e.who === "string" && e.who.startsWith("n:") ? whoOf(e.who).replace(/^the /, "The ") : whoOf(e.ci ?? e.who);
    if (/^beta:\d+$/.test(k)) { const i = +k.slice(5); if ((e.asks || []).includes(i)) askBeta(e, i); save(); renderAll(); return; }
    switch (k) {
      case "next": if (e.idx < e.beats.length - 1) e.idx++; else if (e.closing) return closeTalk(); break;
      case "ask": use(); talkAdd(e, Talk.reply(env, e.who, "ask")); break;
      case "tell": { use(); const p = currentProject(); if (p != null) bond(e.who, "proj", p); talkAdd(e, Talk.reply(env, e.who, "tell")); break; }
      case "together": climbTogether(); if (e.partnered) { talkAdd(e, [{ t: e.partnered.replace(/^“|”$/g, ""), mood: "happy" }]); closerNow(e); } break;
      case "dir": { const line = e.dirLine; askWay(); talkAdd(e, [{ t: line, mood: "thoughtful", narr: e.who === "n:bishop" }, { t: `${e.who === "n:bishop" ? "He draws" : who + " draws"} you a little map to ${e.dir} on the back of a receipt.`, mood: "happy", narr: true }]); break; }
      case "reveal": { const line = e.revealLine; hearLine(); talkAdd(e, [{ t: line, mood: "thoughtful", narr: e.who === "n:bishop" }]); break; }
      case "rec": use(); if (e.rec != null) K.tell(e.rec, e.who, G.date); talkAdd(e, [{ t: e.recLine, mood: "happy" }]); break;
      case "accept": acceptTip(); talkAdd(e, [{ t: "You add it to your list.", mood: "happy", narr: true }]); break;
      case "chat": sitChat(); return;
      case "flirt": use(); sayPlayful(e); break;
      case "sunset": if (!e.sunset || e.sunsetDone) break; e.sunsetDone = true; watchSunset(); return;
      case "sunset-no": if (!e.sunset || e.sunsetDone) break; e.sunsetDone = true; G.day.sunset = "no"; talkAdd(e, Talk.reply(env, e.who, "sunsetNo")); break;
      case "pet": petDog(); return;
      case "stick": use(); talkAdd(e, Talk.reply(env, e.who, "stick")); break;
      case "bye": {
        const b = typeof e.who === "string" && e.who.startsWith("n:") ? Talk.reply(env, e.who, "bye") : [];
        e.closing = true; talkAdd(e, b.length ? b : [{ t: pick(["See you around!", "Have a good one!", "Happy climbing!"]), mood: "happy" }]); break;
      }
      case "go-sector": { const d = e.dir; closeTalk(); travel({ sector: d, boulder: null }); return; }
      case "go-boulder": { const b = D.problems[e.reveal].b; closeTalk(); travel({ sector: D.boulders[b].sector, boulder: b }); return; }
    }
    save(); renderAll();
  }
  function closeTalk() {
    const e = G.day.encounter;
    if (e && e.who === "n:pickles" && G.day.dog && G.day.dog.mode === "lot") G.day.dog.mode = "home";   // he's said hello; back to his rock
    G.day.encounter = null; UI.talkKey = ""; save(); renderAll();
  }
  const dogSpot = () => (M && M.paint && M.paint.scene.landmarks.find(l => l.kind === "dog")) || null;
  // Where he is on the map now ([x, y] metres), or null.
  function dogPos() {
    const m = dogMode(); if (!m || m === "car") return null;
    if (m === "rock") { const d = dogSpot(); return d ? [d.x, d.y] : null; }
    return M && M.dogLive ? M.dogLive() : null;
  }
  // ---- Pickles (Phase 4, Stage 5) ------------------------------------------------------------
  // Where he is, the one answer everything uses (the map, the conversation box, Out today,
  // the paper map, the climbing scene):
  //   rock    napping by his rock (always, until he knows you well enough to come and meet you)
  //   lot     waiting by your car when you arrive (some mornings, once he greets you)
  //   follow  trotting along behind you for an hour or two (once he follows you)
  //   home    trotting back to his rock
  //   with    your dog: with you all day, and home in the car with you at the end
  // G.day.dog = { mode, until, followed, adopting, wentHome }; G.dog = { adopted: date }.
  function dogMode() {
    if (!v2() || !isAround("n:pickles")) return null;
    const yours = !!Social.dog(G).adopted;
    if (G.day.over) return yours ? "car" : "rock";
    const d = G.day.dog;
    return (d && d.mode) || (yours ? "with" : "rock");
  }
  const dogWithYou = () => ["follow", "with"].includes(dogMode());
  // Some mornings, once he greets you, he's waiting by your car; your dog comes with you.
  function startDogDay() {
    if (!v2() || !isAround("n:pickles")) return;
    const d = Social.dog(G);
    if (d.adopted) { G.day.dog = { mode: "with" }; return; }
    if (d.n >= 2 && Math.random() < (G.day.rainedOut ? 0.3 : 0.5)) G.day.dog = { mode: "lot", until: G.day.minute + 45 };
  }
  // After a pet: once he follows you, he comes along for an hour or two (once a day).
  function dogAfterPet() {
    const d = Social.dog(G), cur = G.day.dog || {};
    if (d.adopted || d.n < 3 || cur.wentHome || cur.mode === "follow") return null;
    G.day.dog = { mode: "follow", until: Math.min(G.day.weather.dusk, G.day.minute + 90 + 10 * Math.floor(Math.random() * 7)), followed: true };
    bond("n:pickles", "walk");
    note("Pickles is following you around.");
    return Talk.reply(talkEnv(), "n:pickles", "follow");
  }
  // The clock moved: he gives up waiting at the car, or has had enough and goes home
  // (unless he's ready to decide you're his human: then he stays, and rides home with you).
  function dogClock() {
    const d = G.day.dog; if (!d || G.day.over) return;
    if (d.mode === "lot" && G.day.minute >= d.until && !(G.day.encounter && G.day.encounter.who === "n:pickles")) { d.mode = "home"; }
    else if (d.mode === "follow" && G.day.minute >= d.until && !(G.day.encounter && G.day.encounter.who === "n:pickles")) {
      if (Social.dog(G).ready) {
        d.mode = "with"; d.adopting = true;
        toast("Pickles isn't going home", "He's had plenty of chances to go back to his rock. He hasn't. He's sticking with you.", "info");
        note("Pickles didn't go back to his rock.");
      } else {
        d.mode = "home"; d.wentHome = true;
        const b = Talk.reply(talkEnv(), "n:pickles", "home");
        toast("Pickles heads home", b.length ? b[0].t : "Pickles trots back to his rock.", "info");
      }
    }
  }
  // The end of the day: he decides you're his human (once), or rides home with you.
  function dogAtCar() {
    const d = G.day.dog;
    if (!v2() || !d) return "";
    if (d.adopting && !Social.dog(G).adopted) {
      G.dog = { adopted: G.date };
      note("Pickles has decided you're his human.");
      const gus = K.met("n:gus") && outToday("n:gus");
      openModal(() => modal(`<div class="adopt-face">${Portraits.svg("pickles", "excited", { label: "Pickles" })}</div>
        <span class="label-sm">Pickles</span><h2>Pickles has decided you're his human</h2>
        <p class="lede">When you open the car door at the end of the day, Pickles hops into the back seat, turns round three times, and lies down as if he's always ridden there.</p>
        ${gus ? `<p class="lede">Gus watches from the kiosk. “Well,” he says. “Looks like he's picked.” He doesn't quite manage to sound gruff about it.</p>` : `<p class="lede">You'll have to tell Gus. Somehow you think Gus already knows.</p>`}
        <p class="meta">From now on Pickles comes climbing with you: he's at the car every morning, follows you round the park, naps by your pad, and rides home with you at the end of the day.</p>
        <div class="acts"><button type="button" class="btn primary" data-close>Good boy</button></div>`, (root, close) => { root.querySelector("[data-close]").onclick = close; }));
      return " Pickles hops into the back seat with you.";
    }
    if (Social.dog(G).adopted && d.mode === "with") return " Pickles hops into the back seat, and is asleep before you reach the road.";
    return "";
  }
  // More than 16 m from who you're talking to (not a partner, who comes along).
  function walkedAway(e) {
    const n = typeof e.who === "string" && e.who.startsWith("n:"), key = n ? e.who.slice(2) : null;
    if (key === "pickles" && dogWithYou()) return false;                // he's with you
    const dp = key === "pickles" ? dogPos() : null;
    const at = key === "pickles" ? (dp && { x: dp[0], y: dp[1] }) : n && e.who !== partnerNow() && M && M.paint ? M.paint.personAt(e.who) : null;
    return !!(at && G.pos && Math.hypot(G.pos[0] - at.x, G.pos[1] - at.y) > 16);
  }
  function renderTalk() {
    const root = $("#talk-root"); if (!root) return;
    const e = G && G.day && G.day.encounter;
    const hide = () => { root.hidden = true; root.innerHTML = ""; UI.talkKey = ""; $("#mapwrap").classList.remove("talking"); };
    if (!e || G.day.over || climbing()) return hide();
    if (!Array.isArray(e.beats) || !e.beats.length) { e.beats = [{ t: [e.line, e.recLine].filter(Boolean).join(" ") || "Hello!", mood: "neutral", narr: !!(e.say || e.pet) }]; e.idx = 0; e.used = e.used || []; }   // from before Stage 2
    // Walked away: the conversation's over.
    const n = typeof e.who === "string" && e.who.startsWith("n:"), key = n ? e.who.slice(2) : null;
    if (walkedAway(e)) { G.day.encounter = null; return hide(); }
    const idx = Math.max(0, Math.min(e.idx || 0, e.beats.length - 1)), b = e.beats[idx], last = idx >= e.beats.length - 1;
    // Just the name (no tagline under it: removed after Phase 4, from play-testing).
    const name = n ? World.whoInfo(D, e.who).name.replace(/^the /, "The ") : (D.climbers[e.ci] || ["A climber"])[0];
    const choices = last ? talkChoices(e) : [];
    const sig = JSON.stringify([e.who, idx, e.beats.length, b.mood, !!b.sweet, choices.map(c => c[0] + (c[3] ? "!" : ""))]);
    if (sig === UI.talkKey && !root.hidden) return;
    const fresh = UI.talkKey === "" || JSON.parse(UI.talkKey || "[]")[0] !== e.who;
    UI.talkKey = sig;
    const portrait = Portraits.svg(n ? key : "stranger", b.mood || "neutral", { seed: String(e.who), label: `${name}, ${b.mood || "neutral"}` });
    const text = b.narr ? `<p class="talk-text narr">${esc(b.t)}</p>` : `<p class="talk-text"><q>${esc(b.t.replace(/^“|”$/g, ""))}</q></p>`;
    const btns = last && !e.closing ? choices.map(([k, label, attr, off], j) => `<button type="button" class="talk-choice" data-act="${k}" ${attr} ${off ? "disabled" : ""}><span class="talk-k" aria-hidden="true">${j + 1}</span>${esc(label)}</button>`).join("")
      : `<button type="button" class="talk-next" data-act="next" data-next aria-label="${last ? "Close" : "Next"}">${last ? "Bye" : "Next"} <span aria-hidden="true">▸</span></button>`;
    const hearts = b.sweet && b.mood === "smitten" ? `<span class="talk-hearts" aria-hidden="true"><i></i><i></i><i></i></span>` : "";
    root.innerHTML = `<div class="talk npc${n ? " regular" : ""}${fresh ? " arrive" : ""}${b.sweet ? " sweet" : ""}" role="dialog" aria-label="Talking with ${esc(name)}">${hearts}
      <div class="talk-portrait">${portrait}</div>
      <div class="talk-body"><div class="nm">${esc(name)}</div>
        <div class="talk-say" aria-live="polite">${text}</div>
        <div class="talk-choices">${btns}</div></div>
      <button type="button" class="talk-x" data-act="dismiss" data-dismiss aria-label="Leave the conversation" title="Leave (Esc)">×</button></div>`;
    root.hidden = false; $("#mapwrap").classList.add("talking");
    root.querySelectorAll("[data-act]").forEach(x => { x.onclick = ev => { ev.stopPropagation(); x.dataset.act === "dismiss" ? closeTalk() : talkAct(x.dataset.act); }; });
    const focus = root.querySelector("[data-next], .talk-choice:not([disabled])"); if (focus && !document.querySelector(".modal")) focus.focus({ preventScroll: true });
    // On a phone the page scrolls, and the box covers the map's lower half, which can be
    // below the screen: bring it into view as a conversation starts (Stage 8).
    const box = root.querySelector(".talk");
    if (fresh && box && innerWidth <= 760) { const r = box.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.top < 0) box.scrollIntoView({ block: r.height > innerHeight ? "start" : "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  }
  // Keys while you're talking: Esc leaves, 1–9 pick a reply, Enter or Space goes on.
  document.addEventListener("keydown", ev => {
    const root = $("#talk-root"); if (!root || root.hidden || ev.metaKey || ev.ctrlKey || ev.altKey || $("#modal-root").children.length || climbing()) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((ev.target && ev.target.tagName) || "")) return;
    if (ev.key === "Escape") { ev.preventDefault(); closeTalk(); return; }
    if (/^[1-9]$/.test(ev.key)) { const x = root.querySelectorAll(".talk-choice")[+ev.key - 1]; if (x && !x.disabled) { ev.preventDefault(); x.click(); } return; }
    if ((ev.key === "Enter" || ev.key === " ") && !(ev.target && ev.target.closest && ev.target.closest("#talk-root"))) { const x = root.querySelector("[data-next]"); if (x) { ev.preventDefault(); x.click(); } }
  });

  // ================================================================ the map
  // An illustrated hiking map. World layers (terrain, water, trails, scenery,
  // trees) live in one group that pans and zooms; boulders, labels and the
  // player are placed in screen space so they stay readable. Season and light
  // come from CSS custom properties (see applyAtmosphere), so changing them
  // never redraws anything.
  // ======================================================================= map
  // The illustrated park: illustrate.js places everything (pure, testable in
  // Node), paint.js draws it. This adapter wires it to the game: clicking a
  // boulder or an area's open ground walks you there, the tooltip knows your
  // sends and the walk, the markers follow your progress, and walking follows
  // the trails' own curves.
  function buildMap() {
    const tip = $("#tip");
    const P = Paint.paint($("#map"), D, {
      tooltip: tip, minZoom: WORLD_MIN_ZOOM, followMinK: 6,
      furniture: ".cartouche, .map-tools, .compass, .scalebar",
      state: { here: G.loc.boulder != null ? D.boulders[G.loc.boulder].name : null },
      // Clicking a boulder walks you to it; clicking open ground walks you to that spot.
      onBoulder: id => { const b = D.boulders[id]; goTo({ sector: b.sector, boulder: b.id }, { tap: true }); },
      onGround: (x, y) => goToPoint([x, y]),
      // Clicking someone walks you over to them (and you say hello when you get there).
      onPerson: who => {
        UI.talkTo = who;                                  // when you get there, you'll talk (again, if you already have today)
        const p = who === "n:pickles" ? (d => d && [d.x + 3, d.y - 1])(dogSpot()) : personSpot(who);
        if (!p) return;
        if (G.pos && Math.hypot(G.pos[0] - p[0], G.pos[1] - p[1]) < 1.5) { if (meetNearby(G.pos)) { save(); renderAll(); } return; }
        goToPoint(p);
      },
      personTipHtml,
      // Pickles off his rock (Stage 5): when he's with you, a click says hello right there;
      // waiting by the car, a click walks you over.
      onDog: () => {
        if (G.day.over || climbing()) return;
        if (dogWithYou()) { if (G.day.encounter && G.day.encounter.who === "n:pickles") return; UI.talkTo = null; G.day.encounter = buildRegular("n:pickles", G.loc.sector || START_AREA, { again: G.day.met.includes("n:pickles") }); if (!G.day.met.includes("n:pickles")) G.day.met.push("n:pickles"); save(); renderAll(); return; }
        const p = dogLive(); if (!p) return;
        UI.talkTo = "n:pickles";
        if (G.pos && Math.hypot(G.pos[0] - p[0], G.pos[1] - p[1]) < 5) { if (meetNearby(G.pos)) { save(); renderAll(); } return; }
        goToPoint([p[0] + 2.5, p[1] - .8]);
      },
      // Your partner, walking with you: a click talks to them right there (like anyone close by).
      onPal: who => {
        if (G.day.over || climbing() || (G.day.encounter && G.day.encounter.who === who)) return;
        UI.talkTo = who;
        const at = P.personAt(who); if (!at) return;
        if (G.pos && Math.hypot(G.pos[0] - at.x, G.pos[1] - at.y) < 7) { if (meetNearby(G.pos)) { save(); renderAll(); } return; }
        goToPoint([at.x + 1.6, at.y - .5]);
      },
      // The trailhead kiosk (after Phase 4): a click walks you over and reads it.
      onKiosk: () => {
        if (!v2() || G.day.over || climbing()) return;
        if (nearKiosk(G.pos)) { openModal(() => showKiosk()); return; }
        const p = kioskSpot(); if (!p) return;
        goToPoint(p);
        if (M.walking()) UI.toKiosk = true;
      },
      kioskTipHtml,
      // The Clean-Up's litter (after Phase 4): a click walks you over, and you pick it up when you get there.
      onTrash: id => { const it = litterNow()[id]; if (!it || G.day.over || climbing()) return; goToPoint([it.x, it.y]); },
      trashTipHtml: id => { const it = litterNow()[id]; return it ? `<strong>${esc(Cleanup.KIND[it.k].name)}</strong><div class="sub">Litter for the Clean-Up</div>` : ""; },
      onFollow: on => { $("#map-me").classList.toggle("lost", !on); },
      tipHtml: b => {
        const mins0 = minutesTo({ sector: b.sector, boulder: b.id }, true);
        if (K.boulder(b.id) < 1) return `<strong>Unfamiliar boulder</strong><div class="sub">${b.height_ft} ft · ${esc(b.angle)}</div>It isn't in your guidebook. Walk over and have a look.${mins0 ? `<br>${mins0} min walk` : ""}`;
        if (!K.all()) {
          const a = K.boulderStats(b.id);
          return `<strong>${esc(b.name)}</strong><div class="sub">${esc(b.sector)} · ${b.height_ft} ft · ${b.angle}</div>
            ${b.desc ? `<div class="tip-desc">${esc(b.desc)}</div>` : ""}${a.n ? `${a.n} documented, V${a.lo}${a.hi > a.lo ? "–V" + a.hi : ""}` : "Nothing documented yet"}${a.open ? ` · ${a.open} unclimbed ${a.open === 1 ? "line" : "lines"}` : ""}<br>You've sent ${a.sent}${mins0 ? ` · ${mins0} min walk` : ""}`;
        }
        const ps = b.problems.map(i => G.ps[i]).filter(Boolean), sent = ps.filter(x => x.sent).length;
        const g = d3.extent(b.problems, i => D.problems[i].grade);
        return `<strong>${esc(b.name)}</strong><div class="sub">${esc(b.sector)} · ${b.height_ft} ft · ${b.angle}</div>
          ${b.desc ? `<div class="tip-desc">${esc(b.desc)}</div>` : ""}${b.problems.length} problems, V${g[0]}${g[1] > g[0] ? "–V" + g[1] : ""}<br>You've sent ${sent}${mins0 ? ` · ${mins0} min walk` : " · you're here"}`;
      },
      onZoom: T => {
        const k = T.k, metres = [10, 25, 50, 100, 200, 250, 500, 1000].find(m => m * k >= 90) || 1000;
        $("#scale-ruler").style.width = metres * k + "px";
        $("#scale-label").textContent = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
      },
    });
    const S = P.scene;
    $("#zoom-in").onclick = () => P.zoomBy(1.6);
    $("#zoom-out").onclick = () => P.zoomBy(1 / 1.6);
    $("#map-me").onclick = () => lookAtMe(600);
    $("#map-paper").onclick = () => togglePaper();

    // ---- the ground: where you can stand, and how fast you walk there
    const LOT = PARK_SPOT;                               // your car, in the lot
    // Two planners: trips the game walks for you keep to the trails at the old pace
    // (Wk); walking yourself (keys, a tap) is a little quicker and takes shortcuts (Wm).
    // The old trails join the network once Trail Day has reopened them (Stage 7): syncTrails
    // rebuilds both planners (and the map's drawing) when the open set changes.
    const wet = p => S.inWater(p, 0);
    let Wk, Wm, openOld = [], trailsKey = null, trailsDate = null;
    const minutesCache = new Map();
    function syncTrails() {
      const date = G && G.date;
      if (date === trailsDate && Wk) return;              // (called on every map update: only a new day can change it)
      trailsDate = date;
      if (P.setPoster) P.setPoster(!!kioskBoard().next); // Gus's poster on the kiosk
      const ids = v2() && G && G.date ? World.oldTrailsOpen(G.date) : [], key = ids.join(",");
      if (key === trailsKey) return;
      trailsKey = key; openOld = (S.oldTrails || []).filter(t => ids.includes(t.old));
      const pts = [...S.trails, ...openOld].map(t => t.pts);
      Wk = Travel.make({ trails: pts, blocked: wet }); Wm = Travel.make({ trails: pts, blocked: wet, rate: Travel.MANUAL });
      minutesCache.clear();
      if (P.setOldTrails) P.setOldTrails(ids);
    }
    syncTrails();
    // ---- the Clean-Up's litter (after Phase 4): scattered on open ground once a day, from cleanup.js.
    let litterCache = null, bagKey = "";
    function litter() {
      const e = v2() && G && G.date ? World.eventOn(G.date) : null;
      if (!e || !e.cleanup) return [];
      if (litterCache && litterCache.date === G.date) return litterCache.items;
      const ok = p => inPark(p) && !S.inWater(p, -1) && !solid(p);
      const items = Cleanup.scatter(D, Cleanup.spots(D, S.trails.map(t => t.pts), ok, "spots|" + G.date), G.date);
      for (const it of items) { let bd = Infinity; for (const b of D.boulders) { const d = (b.x - it.x) ** 2 + (b.y - it.y) ** 2; if (d < bd) { bd = d; it.b = b.id; } } }
      litterCache = { date: G.date, items };
      return items;
    }
    // What's still lying about: drawn on the map; the bag counter over the map.
    function syncLitter() {
      const st = litterOn() ? cleanupState() : null;
      P.setTrash(st ? st.items.filter(it => !st.mine.includes(it.id) && !st.by.has(it.id)) : []);
      const el = $("#map-bag"); if (!el) return;
      const place = st ? st.rows.findIndex(r => r.who === "you") + 1 : 0, key = st ? `${st.mine.length}|${place}|${st.rows.length}` : "";
      if (key === bagKey) return; bagKey = key;
      el.hidden = !st;
      if (st) el.innerHTML = `<span>Your bag</span><b>${st.mine.length}</b><span class="mb-place">${ordinal(place)} of ${st.rows.length}</span>`;
    }
    // Walking over litter picks it up (a couple of minutes each).
    function pickLitter() {
      if (!litterOn() || climbing() || !G.pos) return false;
      const st = cleanupState(); if (!st) return false;
      const near = st.items.filter(it => !st.mine.includes(it.id) && !st.by.has(it.id) && Math.hypot(it.x - G.pos[0], it.y - G.pos[1]) < Cleanup.REACH);
      if (!near.length) return false;
      const c = G.day.cleanup = G.day.cleanup || { mine: [] };
      for (const it of near) {
        c.mine.push(it.id);
        const odd = Cleanup.ODD.find(o => o.k === it.k);
        if (odd) { toast(odd.name, odd.text, "find"); note(`Found at the Clean-Up: ${odd.name.toLowerCase()}.`); }
      }
      spend(Cleanup.PICK * near.length);
      syncLitter(); save();
      return true;
    }
    const SPEED = { trail: 20, off: 14 };                // metres a second on screen (about the clock's 50 : 35)
    const [bx0, bx1, by0, by1] = S.bounds, edge = 60;
    const inPark = p => p[0] > bx0 + edge && p[0] < bx1 - edge && p[1] > by0 + edge * .6 && p[1] < by1 - edge;
    const boulderAt = p => S.boulders.find(bo => Math.hypot(p[0] - bo.b.x, p[1] - bo.b.y) < bo.form.R * .9 + .5);
    // Parked cars (art.js): about 3.8 m wide and 4.3 m long, nosed into their spaces.
    const cars = S.marks.filter(m => m.kind === "car").map(m => ({ x0: m.x - 2.1, x1: m.x + 2.1, y0: m.y - (m.rot ? 3.5 : 1.2), y1: m.y + (m.rot ? 1.2 : 3.5) }));
    const carAt = p => cars.some(c => p[0] > c.x0 && p[0] < c.x1 && p[1] > c.y0 && p[1] < c.y1);
    const solid = p => !inPark(p) || S.inWater(p, -.4) || !!boulderAt(p) || carAt(p);
    const onTrail = p => S.trailDist(p, 4) < 2.6 || openOld.some(t => Illu.polyDist(p, t.pts) < 2.6);
    // Where you stand to climb a boulder: in front of it (south-west), on open ground.
    function approach(id) {
      const bo = S.boulders[id], R = bo.form.R;
      for (const [ax, ay] of [[-.55, -1.45], [.55, -1.45], [-1.5, -.4], [1.5, -.4], [0, 1.6]]) { const p = [bo.b.x + ax * R, bo.b.y + ay * R]; if (!solid(p)) return p; }
      return freeSpot([bo.b.x - R * .55, bo.b.y - R * 1.45]);
    }
    // The nearest open spot to p: not in a boulder (with a little room round it), water or a car.
    // Areas' centres can fall inside a boulder (The Schoolhouse's is in The Blackboard).
    const roomy = q => !solid(q) && !S.boulders.some(bo => Math.hypot(q[0] - bo.b.x, q[1] - bo.b.y) < bo.form.R * 1.1 + 1.2);
    function freeSpot(p) {
      if (roomy(p)) return p;
      for (let r = 1.5; r <= 45; r += 1.5) for (let k = 0; k < 16; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 8, q = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];   // south (in front) first
        if (roomy(q)) return q;
      }
      return p;
    }
    const sectorSpot = new Map();
    const pointOf = to => {
      if (to.boulder != null) return approach(to.boulder);
      if (!to.sector) return LOT;
      if (!sectorSpot.has(to.sector)) { const s = D.sectorBy.get(to.sector); sectorSpot.set(to.sector, freeSpot([s.x, s.y])); }
      return sectorSpot.get(to.sector);
    };
    const zoneR = s => (s.name === "Hawkwatch" ? S.baldR : s.radius);
    // Where a point is, in the game's terms: at a boulder (close enough to climb), in
    // an area, or between them. A little stickiness keeps the edges from flickering.
    function locAt(p, prev) {
      let best = null, bd = Infinity;
      for (const bo of S.boulders) {
        const d = Math.hypot(p[0] - bo.b.x, p[1] - bo.b.y), reach = bo.form.R * 1.55 + (prev.boulder === bo.id ? 7 : 3.5);
        if (d < reach && d - bo.form.R < bd) { bd = d - bo.form.R; best = bo.id; }
      }
      if (best != null) return { sector: D.boulders[best].sector, boulder: best };
      let sec = null, sd = Infinity;
      for (const s of D.sectors) {
        const d = Math.hypot(p[0] - s.x, p[1] - s.y), r = zoneR(s) + (prev.sector === s.name ? 25 : 6);
        if (d < r && d / r < sd) { sd = d / r; sec = s.name; }
      }
      return { sector: sec, boulder: null };
    }
    const sameLoc = (a, b) => a.sector === b.sector && a.boulder === b.boulder;
    if (!validPos(G.pos)) G.pos = pointOf(G.loc);
    if (solid(G.pos)) { G.pos = freeSpot(G.pos); save(); }          // a save left inside a boulder (an area's centre, before this was fixed)

    // ---- walking costs daylight, a little at a time
    function spend(minutes) {
      const d = G.day;
      d.walkFrac = (d.walkFrac || 0) + minutes;
      const whole = Math.floor(d.walkFrac);
      if (!whole) return;
      d.walkFrac -= whole; d.minute += whole; d.moved = true;
      safely("status bar", renderHud);
      timeChecks();
      if (d.over) stop();
    }
    // A trip's route (along the trails), or the way you'd walk it yourself (manual: a tap on the map).
    const plan = (to, manual = false) => {
      if (!validPos(G.pos)) G.pos = pointOf(G.loc);
      const dest = Array.isArray(to) ? to : pointOf(to);
      // Both keep to the trails for anything far (past Travel.DIRECT_OK); a tap
      // nearby walks straight there. Only the keys cut through the woods.
      syncTrails();
      return manual ? Wm.plan(G.pos, dest, { trails: true }) : Wk.plan(G.pos, dest, { trails: true });
    };
    // Minutes to walk from where you are to a place ({ sector, boulder }): 0 if you're there, at least 1 otherwise.
    // Go there's time by default; manual is the time a click on the map would take.
    function minutesTo(to, manual = false) {
      if (sameLoc(G.loc, to)) return 0;
      if (!validPos(G.pos)) G.pos = pointOf(G.loc);
      const key = G.pos.map(v => Math.round(v)).join(",") + "|" + to.sector + "|" + to.boulder + "|" + manual;
      if (!minutesCache.has(key)) { if (minutesCache.size > 400) minutesCache.clear(); const p = plan(to, manual); minutesCache.set(key, p ? Math.round(p.minutes) : 99); }
      return Math.max(1, minutesCache.get(key));
    }
    const minutesToLot = () => { const p = plan(LOT); return p ? Math.round(p.minutes) : 0; };

    // ---- moving: the keys (WASD and the arrows), a tap, or a trip
    const keys = new Set();
    let walk = null, raf = null, last = null, phase = 0, facing = "d", stillTimer = null;
    // Which way the climber faces (l, r; u is away from you, d towards you). Near a
    // diagonal it keeps the way it was facing, so it doesn't flicker.
    function face(dx, dy) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < .01 && ay < .01) return;
      if (ax > ay * 1.2) facing = dx > 0 ? "r" : "l";
      else if (ay > ax * 1.2) facing = dy > 0 ? "u" : "d";
      else if ((facing === "l" || facing === "r") ? dx * (facing === "r" ? 1 : -1) <= 0 : dy * (facing === "u" ? 1 : -1) <= 0) facing = ax >= ay ? (dx > 0 ? "r" : "l") : (dy > 0 ? "u" : "d");
    }
    const fade = $("#map-fade");
    const pose = moving => ({ phase, moving, facing, padDown: G.loc.boulder != null });
    function frame(now) {
      raf = null;
      const dt = last == null ? 0 : Math.min(.05, (now - last) / 1000);
      last = now;
      if (G.day.over || modalOpen()) { keys.clear(); if (walk) stop(); }
      if (walk) stepWalk(now, dt);
      else if (keys.size) stepKeys(dt);
      const moving = !!walk || keys.size > 0;
      P.setMe(G.pos, pose(moving));
      if (moving) raf = requestAnimationFrame(frame);
      else { last = null; clearTimeout(stillTimer); stillTimer = setTimeout(() => { save(); }, 400); }
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function stepKeys(dt) {
      let dx = 0, dy = 0;
      if (keys.has("left")) dx--; if (keys.has("right")) dx++; if (keys.has("up")) dy++; if (keys.has("down")) dy--;
      const n = Math.hypot(dx, dy); if (!n) return;
      const trail = onTrail(G.pos), v = (trail ? SPEED.trail : SPEED.off) * dt, mx = dx / n * v, my = dy / n * v;
      face(dx, dy);
      const from = G.pos;
      let to = [from[0] + mx, from[1] + my];
      // Something in the way: veer around it (a boulder's curve, a shoreline), the smallest turn first.
      // (If you're somehow inside something already, any step gets you out.)
      if (solid(to) && !solid(from)) {
        to = from;
        for (const deg of [25, -25, 50, -50, 75, -75]) {
          const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), q = [from[0] + mx * c - my * sn, from[1] + mx * sn + my * c];
          if (!solid(q)) { to = q; break; }
        }
      }
      const moved = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (!moved) return;
      G.pos = to; phase += moved;
      if (!G.walked) { G.walked = true; showHint(); }
      spend(moved / (trail ? Wm.rate.trail : Wm.rate.off));
      if (!G.day.over) moved_();
    }
    // Where you are changed: arriving at a boulder or an area (walking past things on a trip is quiet).
    function moved_(quiet = false) {
      if (!quiet && meetNearby(G.pos)) { save(); renderAll(); showPrompt(); }
      else if (G.day.encounter && walkedAway(G.day.encounter)) { G.day.encounter = null; renderTalk(); save(); }   // walked off mid-conversation
      if (nearKiosk(G.pos) !== kioskNear) showPrompt();
      if (litterOn()) { if (!pickLitter()) syncLitter(); }
      const now = locAt(G.pos, G.loc);
      if (sameLoc(now, G.loc)) return;
      const prev = { ...G.loc };
      arrive(prev, now, { quiet });
      if (!quiet) { renderAll(); showPrompt(); }
    }

    // A trip: walked at a stroll when it's short, hurried along when it's longer, and
    // with a quick fade for long ones (you walk off, and arrive walking in). It
    // costs the full walk's time either way, charged as you go. A tap on the map
    // walks the way you would yourself (shortcuts and all); Go there keeps to the trails.
    function goTo(to, opts = {}) {
      if (G.day.over) return;
      const W = opts.tap ? Wm : Wk, path = plan(to, !!opts.tap);
      if (!path) { toast("No way through", "There's water in the way.", "info"); return; }
      // Only the dark stops a walk: rain stops the climbing, not the day.
      const w = G.day.weather;
      if (path.minutes >= 1 && G.day.minute + path.minutes >= w.dusk) { toast("Not enough daylight", "It'll be dark before you get there. Head home instead.", "info"); return; }
      stop();
      const M_ = path.metres, real = d3.sum(path.pts.slice(1), (q, i) => Math.hypot(q[0] - path.pts[i][0], q[1] - path.pts[i][1]) / (path.rates[i] === W.rate.trail ? SPEED.trail : SPEED.off));
      const lead = Math.min(45, M_ * .2), phases = [];
      if (reduceMotion) phases.push({ d0: 0, d1: M_, ms: 0 });
      else if (real <= 3) phases.push({ d0: 0, d1: M_, ms: real * 1000 });
      else if (M_ <= 260) phases.push({ d0: 0, d1: M_, ms: 3000 });
      else phases.push({ d0: 0, d1: lead, ms: 1100 }, { fade: true, d0: lead, d1: M_ - 45 }, { d0: M_ - 45, d1: M_, ms: 1100 });
      walk = { path, to: Array.isArray(to) ? null : to, from: { ...G.loc }, phases, i: 0, t0: null, d: 0, paid: 0, tab: !!opts.tab };
      UI.busy = true; UI.fresh = null; if (walk.tab) UI.tab = "here";
      if (!G.walked && opts.tap) { G.walked = true; showHint(); }
      P.setFollow(true);
      renderAll(); showPrompt();
      kick();
    }
    function goToPoint(p) {
      if (G.day.over || UI.busy && !walk) return;
      if (S.inWater(p, 0)) { toast("That's water", "Pick somewhere on dry ground.", "info"); return; }
      if (!inPark(p)) return;
      goTo(solid(p) ? freeSpot(p) : p, { tap: true });
    }
    function stepWalk(now, dt) {
      const w = walk, ph = w.phases[w.i];
      if (ph.fade) {
        // Fade out, jump ahead (paying for the walk you skipped), fade back in.
        if (!w.fading) { w.fading = true; fade.classList.add("on"); setTimeout(() => { if (walk !== w) return; goAlong(w, ph.d1); if (walk !== w) return; w.i++; w.t0 = null; P.setMe(G.pos, pose(true)); setTimeout(() => fade.classList.remove("on"), 60); }, 300); }
        return;
      }
      if (w.t0 == null) w.t0 = now;
      const u = ph.ms ? Math.min(1, (now - w.t0) / ph.ms) : 1;
      goAlong(w, ph.d0 + (ph.d1 - ph.d0) * u);
      if (walk !== w) return;                              // stopped on the way (dusk, rain)
      if (u >= 1) { w.i++; w.t0 = null; w.fading = false; if (w.i >= w.phases.length) finish(); }
    }
    function goAlong(w, d) {
      const a = Travel.along(w.path, d), before = G.pos;
      G.pos = a.p; phase += Math.hypot(a.p[0] - before[0], a.p[1] - before[1]);
      face(a.dir[0], a.dir[1]);
      const cost = a.minutes - w.paid; w.paid = a.minutes; w.d = d;
      spend(cost);
      if (walk === w) moved_(true);
    }
    function finish() {
      const w = walk; walk = null; UI.busy = false;
      fade.classList.remove("on");
      // Arriving counts from where the trip began (passing through on the way was quiet).
      G.pos = w.path.pts[w.path.pts.length - 1];
      const now = w.to ? { sector: w.to.sector, boulder: w.to.boulder } : locAt(G.pos, G.loc);
      arrive(w.from, now, { quiet: sameLoc(w.from, now) });
      meetNearby(G.pos);                                 // walked over to someone
      save(); renderAll(); showPrompt();
      if (UI.toKiosk) { UI.toKiosk = false; if (nearKiosk(G.pos) && !G.day.over) openModal(() => showKiosk()); }
    }
    // Stop a trip where it is (keys take over, the day ends, a new trip starts).
    function stop() {
      UI.toKiosk = false;
      if (!walk) return;
      const w = walk; walk = null; UI.busy = false; fade.classList.remove("on");
      const now = locAt(G.pos, G.loc); arrive(w.from, now, { quiet: sameLoc(w.from, now) });
      safely("redraw", renderAll);
    }
    // The light's gone: walk back to the lot (no need to watch it).
    function toLot() { stop(); keys.clear(); G.pos = LOT.slice(); G.loc = { sector: null, boulder: null }; P.setMe(G.pos, pose(false)); P.setFollow(true, 0); }

    // The keyboard. WASD and the arrows walk (not while typing, or with a dialog or the trail map open); E inspects.
    const KEY = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
    // Only a text field keeps the keys: anywhere else (a button or a menu in the side
    // panel just clicked), WASD and the arrows walk.
    const typing = t => t && (t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && /^(text|search|email|number|password|url|tel)$/i.test(t.type || "text")));
    const blockedKeys = () => $("#game").hidden || modalOpen() || (paper && paper.isOpen()) || G.day.over || climbing();
    document.addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase(), dir = KEY[k];
      if (dir) {
        if (blockedKeys()) return;
        e.preventDefault();
        if (walk) stop();
        if (!keys.has(dir)) { keys.add(dir); if (!P.following()) P.setFollow(true); kick(); }
      } else if (k === "e" && !blockedKeys() && G.loc.boulder != null && K.boulder(G.loc.boulder) < 1 && !UI.busy) { e.preventDefault(); inspectBoulder(G.loc.boulder); }
      else if (k === "e" && !blockedKeys() && v2() && !UI.busy && nearKiosk(G.pos)) { e.preventDefault(); openModal(() => showKiosk()); }
    });
    document.addEventListener("keyup", e => { const dir = KEY[e.key.toLowerCase()]; if (dir) keys.delete(dir); });
    window.addEventListener("blur", () => keys.clear());
    document.addEventListener("visibilitychange", () => { if (document.hidden && G) save(); });

    // ---- the prompt over the map at an unfamiliar boulder, and a first-day hint
    const prompt = $("#map-prompt");
    let kioskNear = false;
    function showPrompt() {
      const b = G.loc.boulder, show = !G.day.over && b != null && !K.all() && K.boulder(b) < 1;
      kioskNear = nearKiosk(G.pos);
      const kiosk = !show && kioskNear && !walk && v2() && !G.day.over && !climbing();
      prompt.hidden = !show && !kiosk;
      if (show) {
        prompt.innerHTML = `<span>Unfamiliar boulder</span><button type="button" class="btn small primary" data-map-inspect ${UI.busy ? "disabled" : ""}>Inspect <kbd>E</kbd></button>`;
        prompt.querySelector("[data-map-inspect]").onclick = () => inspectBoulder(b);
      } else if (kiosk) {
        prompt.innerHTML = `<span>The trailhead kiosk</span><button type="button" class="btn small primary" data-map-kiosk>Read <kbd>E</kbd></button>`;
        prompt.querySelector("[data-map-kiosk]").onclick = () => openModal(() => showKiosk());
      }
    }
    const touchOnly = matchMedia("(hover: none) and (pointer: coarse)").matches;
    function showHint() {
      const h = $("#map-hint"); if (!h) return;
      h.hidden = !!G.walked || G.day.over || !prompt.hidden;
      h.innerHTML = touchOnly ? "Tap where you want to go. Tap a boulder to walk over to it."
        : `Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys, or click where you want to go.`;
    }

    // ---- the paper park map (paper.js): built the first time it opens
    let paper = null;
    function togglePaper() {
      if (paper && paper.isOpen()) { paper.close(); return; }
      if (!paper) paper = Paper.make(D, P.scene, $("#paper-root"));
      const areas = D.sectors.filter(s => K.area(s.name) >= 1).map(s => {
        const a = K.areaStats(s.name), mins = minutesTo({ sector: s.name, boulder: null });
        const range = K.all() ? `V${s.lo}–V${s.hi}` : a.n ? `V${a.lo}–V${a.hi}` : a.boulders ? `${a.boulders} ${a.boulders === 1 ? "boulder" : "boulders"} found` : "not explored yet";
        const told = K.area(s.name) === 1 && K.toldOf(s.name);
        return { name: s.name, state: K.area(s.name), minutes: mins, sub: `${told ? `${World.whoName(D, told.from).replace(/^the /, "The ")} told you the way` : range} · ${G.loc.sector === s.name ? "you're here" : mins + " min walk"}` };
      });
      const hidden = D.sectors.some(s => K.area(s.name) < 1);
      // The regulars you know who are out now, where you know the area (never a place you haven't found).
      const people = G.day.over ? [] : [...peopleNow(), ...(dogMode() === "rock" ? [{ who: "n:pickles", b: (D.boulders.find(x => x.name === "Pickles' Rock") || {}).id }] : [])]
        .filter(x => isKnown(x.who) && x.b != null && K.area(D.boulders[x.b].sector) >= 1).map(x => {
          const at = P.personAt(x.who) || { x: D.boulders[x.b].x, y: D.boulders[x.b].y }, key = x.who.slice(2);
          return { who: x.who, name: x.who === "n:pickles" ? "Pickles" : firstName(x.who), x: at.x, y: at.y, color: key === "pickles" ? "#c9a46a" : (LOOKS[key] || {}).shirt, where: x.who === partnerNow() ? "with you" : whereIs(x.b).text.replace(/^at /, "") };
        });
      paper.open({ areas, here: G.loc.sector, me: G.pos, view: P.viewBox(), people, oldTrails: v2() ? World.oldTrailsOpen(G.date) : [],
        footnote: hidden ? "Locals say there's more climbing deeper in the woods than the kiosk map shows." : "",
        onPick: w => { P.setFollow(false); $("#map-me").classList.add("lost"); (w.sector ? P.flyTo(w.sector, 9, 800) : P.centerOn(w.x, w.y, P.view().k, 700)); },
        onGo: G.day.over ? null : name => { if (K.canGo({ sector: name })) travel({ sector: name, boulder: null }); } });
    }
    const lookAtMe = (ms = 0) => { P.setFollow(true, ms); $("#map-me").classList.remove("lost"); };
    let knownKey = "all", outfitKey = "", peopleKey = "";
    function update() {
      syncTrails();                                        // an old trail reopened on Trail Day (Stage 7)
      if (!validPos(G.pos)) G.pos = pointOf(G.loc);       // a save from before Stage 4, or a loaded file
      if (UI.recenter) { UI.recenter = false; P.setMe(G.pos, pose(false)); P.setFollow(true, 0); }
      // Label only what the player knows (only when that has changed).
      const view = K.mapView(), key = view ? JSON.stringify(view) : "all";
      if (key !== knownKey) { knownKey = key; P.setKnown(view); }
      const ok = G.day.no + "|" + G.day.weather.temp;
      if (ok !== outfitKey) { outfitKey = ok; P.setOutfit(outfitFor()); }
      // Your partner walks along with you (after Phase 4: they used to wait at your boulder),
      // drawn in a layer of their own (syncPal), so they're not one of the standing figures.
      const pal = partnerNow();
      if (pal && !PL.pos) { const at = P.personAt(pal); if (at) PL.pos = [at.x, at.y]; }      // from where they were standing
      // Who's around at this hour (they come and go: Phase 4, Stage 1), with a name tag
      // over anyone you've met.
      const now = G.day.over ? [] : peopleNow(), dog = v2() && !G.day.over && dogMode() === "rock";
      const pk = [G.date, ...now.map(x => x.who + (isKnown(x.who) ? "+" : "") + x.b), dog, dog && isKnown("n:pickles"), pal].join("|");
      if (pk !== peopleKey) {
        peopleKey = pk;
        const list = now.filter(x => x.who !== pal).map(x => ({ ...x, name: isKnown(x.who) ? x.name : "Someone you haven't met", tag: isKnown(x.who) ? firstName(x.who) : null }));
        P.setPeople([...list, ...(dog ? [{ who: "n:pickles", name: isKnown("n:pickles") ? "Pickles" : "A dog", dog: true, tag: isKnown("n:pickles") ? "Pickles" : null }] : [])]);
      }
      if (!walk && !keys.size) P.setMe(G.pos, pose(false));
      syncDog(); syncPal(); syncLitter();
      const tipBoulders = new Set(G.tips.filter(t => !t.done).map(t => D.problems[t.p].b));
      P.setMarks({
        here: G.loc.boulder ?? null, sector: G.loc.sector ?? null, tip: tipBoulders,
        ticked: new Set(D.boulders.filter(b => b.problems.some(i => G.ps[i]?.sent)).map(b => b.id)),
        project: new Set(D.boulders.filter(b => b.problems.some(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 2)).map(b => b.id)),
      });
      showPrompt(); showHint();
      applyAtmosphere();
    }
    P.setMe(G.pos, pose(false));
    P.setFollow(true, 0);
    UI.recenter = false;
    // Walk over to someone (Out today's Find): the map follows you there.
    // ---- Pickles off his rock (Stage 5): where he is, moved a frame at a time ----
    // Waiting by your car; trotting along behind you, following the way you went (a trail
    // of where you've been), then sitting beside you and, after a while, curling up asleep;
    // or trotting home to his rock. Only his own small layer changes (P.setDog).
    const LOT_DOG = (() => { for (const q of [[LOT[0] + 2.6, LOT[1] - 1.2], [LOT[0] - 2.6, LOT[1] - 1.2], [LOT[0], LOT[1] - 2.6]]) if (!solid(q)) return q; return freeSpot([LOT[0] + 2.6, LOT[1] - 1.2]); })();
    const DG = { pos: null, trail: [], phase: 0, facing: 1, idle: 0, last: 0, raf: 0, mode: null };
    const dogLive = () => (DG.pos ? DG.pos.slice() : null);
    function syncDog() {
      const m = dogMode();
      const off = m && m !== "rock" && m !== "car";
      if (!off) { if (DG.raf) cancelAnimationFrame(DG.raf); DG.raf = 0; DG.pos = null; DG.mode = m; DG.trail = []; P.setDog(null); return; }
      if (!DG.pos || DG.mode !== m) {
        // Where he starts: at the car, beside you (your dog, or he's just started following), or where he was.
        if (m === "lot") DG.pos = LOT_DOG.slice();
        else if (!DG.pos) DG.pos = G.pos ? [G.pos[0] - 2.2, G.pos[1] - .6] : LOT_DOG.slice();
        if (m !== DG.mode && (m === "with" || m === "follow")) DG.trail = [];
      }
      DG.mode = m;
      if (!DG.raf) { DG.last = performance.now(); DG.raf = requestAnimationFrame(dogFrame); }
    }
    function dogFrame(now) {
      DG.raf = 0;
      const m = dogMode(); if (!m || m === "rock" || m === "car") return syncDog();
      const dt = Math.min(.1, (now - DG.last) / 1000); DG.last = now;
      let target, pose = "sit", wag = false, speed = 0;
      const me = G.pos || LOT;
      if (m === "lot") { target = LOT_DOG; wag = true; pose = "stand"; }
      else if (m === "home") { const r = dogSpot(); target = r ? [r.x, r.y] : LOT_DOG; }
      else {
        // Behind you along the way you came, or beside you when you've stopped.
        const tr = DG.trail, lastPt = tr[tr.length - 1];
        if (!lastPt || Math.hypot(me[0] - lastPt[0], me[1] - lastPt[1]) > .5) { tr.push(me.slice()); if (tr.length > 80) tr.shift(); }
        let need = PL.pos ? 5 : 2.8, tgt = null;                                   // further back when your partner's walking with you
        for (let i = tr.length - 1, prev = me; i >= 0; i--) { const q = tr[i], d = Math.hypot(prev[0] - q[0], prev[1] - q[1]); if (d >= need) { const u = need / d; tgt = [prev[0] + (q[0] - prev[0]) * u, prev[1] + (q[1] - prev[1]) * u]; break; } need -= d; prev = q; }
        target = tgt || [me[0] - 2.2, me[1] - .6];
        if (!solid(target)) {} else target = [me[0] - 2.2, me[1] - .6];
      }
      const dx = target[0] - DG.pos[0], dy = target[1] - DG.pos[1], dist = Math.hypot(dx, dy);
      if (dist > 45 || reduceMotion) { DG.pos = target.slice(); }                      // a long trip (you faded there): he's there too
      else if (dist > .15) {
        const v = m === "home" ? 6 : Math.max(5, dist * 5);                            // trots to keep up; home at a trot
        const step = Math.min(dist, v * dt); DG.pos = [DG.pos[0] + dx / dist * step, DG.pos[1] + dy / dist * step]; speed = step / Math.max(dt, 1e-3);
        DG.phase += step * 1.6;
        if (Math.abs(dx) > .05) DG.facing = dx > 0 ? 1 : -1;
      }
      const moving = speed > .6;
      if (moving) { pose = "walk"; DG.idle = 0; }
      else if (m === "home") { if (dist <= .3) { G.day.dog.mode = "rock"; save(); peopleKey = ""; update(); renderAll(); return; } }
      else if (m !== "lot") {
        DG.idle += dt; DG.facing = me[0] >= DG.pos[0] ? 1 : -1;
        pose = DG.idle > 9 ? "sleep" : "sit"; wag = DG.idle < 2.5 || !!(G.day.encounter && G.day.encounter.who === "n:pickles");
      }
      P.setDog({ pos: DG.pos, pose, phase: DG.phase, facing: DG.facing, wag, t: now });
      DG.raf = requestAnimationFrame(dogFrame);
    }
    // ---- Your partner, walking with you (after Phase 4) ----
    // Behind you along the way you came while you walk; when you stop, they step up beside
    // you (on the other side from Pickles) and turn to face you, pad off at a boulder.
    // Only their own small layer changes (P.setPal), and only when something has.
    const PL = { pos: null, trail: [], phase: 0, facing: "r", raf: 0, last: 0, who: null, key: "" };
    function syncPal() {
      const w = !G.day.over && !climbing() ? partnerNow() : null;
      if (!w) { if (PL.raf) cancelAnimationFrame(PL.raf); PL.raf = 0; PL.pos = null; PL.who = null; PL.trail = []; PL.key = ""; P.setPal(null); return; }
      if (PL.who !== w) { PL.who = w; PL.trail = []; PL.key = ""; if (!PL.pos) PL.pos = G.pos ? [G.pos[0] + 3, G.pos[1] + .4] : LOT.slice(); }
      if (!PL.raf) { PL.last = performance.now(); PL.raf = requestAnimationFrame(palFrame); }
    }
    function palFrame(now) {
      PL.raf = 0;
      if (!PL.who || PL.who !== partnerNow() || G.day.over) return syncPal();
      const dt = Math.min(.1, (now - PL.last) / 1000); PL.last = now;
      const me = G.pos || LOT, tr = PL.trail, lastPt = tr[tr.length - 1];
      if (!lastPt || Math.hypot(me[0] - lastPt[0], me[1] - lastPt[1]) > .5) { tr.push(me.slice()); if (tr.length > 80) tr.shift(); }
      const youWalk = !!walk || keys.size > 0;
      let target = null;
      if (youWalk) {
        // A couple of metres behind you, along the way you came.
        let need = 2.8;
        for (let i = tr.length - 1, prev = me; i >= 0; i--) { const q = tr[i], d = Math.hypot(prev[0] - q[0], prev[1] - q[1]); if (d >= need) { const u = need / d; target = [prev[0] + (q[0] - prev[0]) * u, prev[1] + (q[1] - prev[1]) * u]; break; } need -= d; prev = q; }
      }
      if (!target) {
        // Beside you: the right (Pickles sits on your left), or the left, wherever there's room.
        target = [[me[0] + 3, me[1] + .4], [me[0] - 3, me[1] + .8], [me[0] + 1, me[1] + 2.6]].find(q => !solid(q)) || PL.pos;
      }
      const dx = target[0] - PL.pos[0], dy = target[1] - PL.pos[1], dist = Math.hypot(dx, dy);
      let moving = false;
      if (dist > 45 || reduceMotion) PL.pos = target.slice();                       // a long trip (you faded there): they're there too
      else if (dist > .12) {
        const v = Math.max(3.5, dist * 4), step = Math.min(dist, v * dt);
        PL.pos = [PL.pos[0] + dx / dist * step, PL.pos[1] + dy / dist * step];
        PL.phase += step * 1.6; moving = step / Math.max(dt, 1e-3) > .5;
        if (moving) PL.facing = Math.abs(dx) >= Math.abs(dy) * .8 ? (dx > 0 ? "r" : "l") : dy > 0 ? "u" : "d";
      }
      if (!moving) PL.facing = me[0] >= PL.pos[0] ? "r" : "l";                       // stopped: turned towards you
      const padDown = !moving && G.loc.boulder != null && !youWalk;
      const key = [PL.pos[0].toFixed(2), PL.pos[1].toFixed(2), PL.facing, moving, padDown].join("|");
      if (key !== PL.key) { PL.key = key; P.setPal({ who: PL.who, look: LOOKS[PL.who.slice(2)] || {}, pos: PL.pos, facing: PL.facing, moving, phase: PL.phase, padDown }); }
      PL.raf = requestAnimationFrame(palFrame);
    }
    const findPerson = who => {
      if (who === "n:pickles") { const d = dogLive() || (dogSpot() && [dogSpot().x, dogSpot().y]); if (!d) return; UI.talkTo = who; lookAtMe(400); goToPoint([d[0] + 3, d[1] - 1]); return; }
      const p = personSpot(who); if (!p) return; lookAtMe(400); goToPoint(p);
    };
    return { update, paint: P, togglePaper, lookAtMe, goTo, minutesTo, findPerson, minutesToLot, toLot, walking: () => !!walk, locAt: p => locAt(p, G.loc), approach, dogLive, litter,
      teleport: to => { stop(); G.pos = pointOf(to); G.loc = { sector: to.sector, boulder: to.boulder }; P.setMe(G.pos, pose(false)); P.setFollow(true, 0); } };
  }
  const validPos = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && isFinite(v) && Math.abs(v) < 5000);
  // Dressed for the weather: shorts on hot days, layers and a beanie in the cold.
  // The colours are the climber's own (from their id), so they're the same every day.
  function outfitFor() {
    const w = G.day.weather, t = w.temp;
    let h = 0; for (const c of String(G.id || "climber")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const bits = (sh, n) => (h >>> sh) % n;
    // Each shirt has pads that stand out against it. You own three shirts and
    // wear a different one each day; your pad, pants and chalk bag are always yours.
    const SHIRT = [["#c2553a", ["#2f6b8f", "#3c7a3b", "#2e4f6e"]], ["#2f6b4f", ["#c9772b", "#a43b2f", "#55306b"]], ["#6d5aa8", ["#d0a23a", "#3c7a3b", "#c9772b"]],
      ["#d08a2c", ["#2f6b8f", "#55306b", "#2e4f6e"]], ["#3f7fa6", ["#c9772b", "#a43b2f", "#d0a23a"]], ["#b0436e", ["#2f6b8f", "#3c7a3b", "#d0a23a"]]];
    const JACKET = ["#8a3f2b", "#2e4f6e", "#5f6b2d", "#6b3b5e"], HAT = ["#b5462e", "#d0a23a", "#2f6b8f", "#6d5aa8"];
    const PANTS = ["#3f4f63", "#5b4a3a", "#4a5a3f", "#2e3440", "#6a4b5c"], SHORTS = ["#6b6457", "#4f5d6b", "#7a5b3f"], BAG = ["#d0a23a", "#2f6b4f", "#b5462e", "#3f7fa6", "#e3dccb"];
    const [, pads] = SHIRT[h % 6], pad = pads[bits(4, 3)];
    const wardrobe = [h % 6, (h % 6 + 1 + bits(16, 2)) % 6, (h % 6 + 3 + bits(18, 2)) % 6];
    const todays = wardrobe[(G.dayNo || 0) % 3], shirt = SHIRT[todays][0];
    const stripes = (todays + bits(20, 4)) % 3 === 0 ? "rgba(255,255,255,.38)" : null;
    const sunny = /sun|bluebird|clear|hot/i.test(w.sky);
    const hat = t < 45 ? "beanie" : t >= 78 && sunny ? (bits(22, 2) ? "cap" : "bucket") : t >= 58 && t < 78 && bits(24, 3) === 0 ? "headband" : null;
    return { shirt, stripes, pad, hatC: HAT[bits(8, 4)],
      shorts: t >= 72, pants: t >= 72 ? SHORTS[bits(26, 3)] : PANTS[bits(10, 5)], longSleeves: t < 62,
      hoodie: t >= 50 && t < 62 && bits(28, 2) === 0,
      jacket: t < 50 ? JACKET[bits(12, 4)] : false,
      hat, chalk: BAG[bits(14, 5)],
      scarf: t < 36 ? "#d9b24c" : false };
  }

  // ============================================================ atmosphere
  // The season (from the game date) and the light (from the game clock) are
  // written as CSS custom properties on the page root. The map's colours, the
  // paper tint of the interface and the daylight dial all read from them.
  let atmoDate = null;
  const SKY = { "Morning": "#cfe0f1", "Midday": "#b9d6ee", "Afternoon": "#c4dbea", "Golden hour": "#f1cd88", "Dusk": "#c29fc3", "Night": "#46527f" };
  function applySeason(date) {
    const rootStyle = document.documentElement.style;
    if (atmoDate !== date) {
      atmoDate = date;
      const s = Art.seasonAt(date);
      const vars = { "--leaf": s.leaf.toFixed(3), "--snow": s.snow.toFixed(3), "--ice": s.ice.toFixed(3), "--flowers": s.flowers.toFixed(3),
        "--fernness": s.ferns.toFixed(3), "--meadow": s.meadow, "--floor": s.floor, "--water": s.water, "--season-tint": s.tint,
        "--ever-0": s.ever[0], "--ever-1": s.ever[1] };
      for (const k of ["maple", "oak", "birch"]) s[k].forEach((c, i) => { vars[`--${k}-${i}`] = c; });
      for (const [k, v] of Object.entries(vars)) rootStyle.setProperty(k, v);
      document.documentElement.dataset.season = s.key;
      UI.season = s;
    }
  }
  function applyAtmosphere() {
    const rootStyle = document.documentElement.style, w = G.day.weather;
    applySeason(G.date);
    const L = Art.lightAt(Math.min(G.day.minute, w.dusk + 30), w.dusk, { over: G.day.over, sky: w.sky });
    rootStyle.setProperty("--tint", L.tint); rootStyle.setProperty("--tint-op", L.op.toFixed(3));
    rootStyle.setProperty("--veil", L.veil); rootStyle.setProperty("--veil-op", L.veilOp.toFixed(3));
    rootStyle.setProperty("--shx", L.shadow[0].toFixed(3)); rootStyle.setProperty("--shy", (-L.shadow[1]).toFixed(3));
    rootStyle.setProperty("--shadow-op", L.shadowOp.toFixed(2));
    document.documentElement.dataset.phase = L.phase.toLowerCase().replace(/\s+/g, "-");
    rootStyle.setProperty("--sky", L.veilOp > .25 ? Art.mix(SKY[L.phase], "#9aa3ab", .6) : L.veilOp > 0 ? Art.mix(SKY[L.phase], L.veil, .45) : SKY[L.phase]);
    UI.light = L;
    // The map keeps its own, richer seasonal palette (illustrate.js) and light, on its own element.
    if (M && M.paint) {
      if (UI.mapDate !== G.date) { M.paint.setDate(G.date); UI.mapDate = G.date; }
      M.paint.setTime(Math.min(G.day.minute, w.dusk + 30), w.dusk, w.sky, G.day.over);
    }
    const cap = $("#map-caption");
    if (cap) cap.textContent = `${UI.season.name} · ${L.phase}`;
  }

  // ================================================================ rendering
  // ============================================================== problems
  // If something breaks, say what on screen so it can be reported, and keep
  // the rest of the game working: each part of the screen renders on its own.
  const errorLog = [];
  function reportError(where, err) {
    const at = ((err && err.stack) || "").split("\n").find(l => /\.js:\d+/.test(l)) || "";
    const loc = (at.match(/([\w.-]+\.js):(\d+)/) || []).slice(1).join(":");
    const msg = `${where}: ${(err && err.message) || err}${loc ? ` (${loc})` : ""}`;
    console.error(msg, err);
    if (errorLog.includes(msg)) return;
    errorLog.push(msg);
    let box = $("#error-box");
    if (!box) {
      box = document.createElement("div"); box.id = "error-box"; box.className = "error-box"; box.setAttribute("role", "alert");
      document.querySelector(".wrap").prepend(box);
    }
    box.innerHTML = `<b>Something went wrong.</b> Reloading the page usually fixes it. If it doesn't, send Claude this message:
      <code>${esc(errorLog.slice(-3).join(" · "))}</code> <button type="button" class="linklike" id="error-dismiss">Dismiss</button>`;
    $("#error-dismiss").onclick = () => box.remove();
  }
  window.addEventListener("error", e => reportError("page", e.error || e.message));
  window.addEventListener("unhandledrejection", e => reportError("page", e.reason));
  const safely = (where, fn) => { try { return fn(); } catch (e) { reportError(where, e); } };
  function renderAll() {
    if (!climbing() && !$("#scene-root").hidden) { $("#scene-root").hidden = true; document.body.classList.remove("climbing"); }
    safely("status bar", renderHud);
    safely("tabs", renderTabs);
    try { renderPanel(); } catch (e) {
      reportError(`${UI.tab} panel`, e);
      $("#tabbody").innerHTML = `<p class="lede">This panel couldn't be drawn. You can still walk to an area from the map, or try another tab.</p>`;
    }
    safely("map", () => M.update());
    safely("conversation", renderTalk);
  }

  // Hand-drawn weather icons: strokes only, coloured by the text around them.
  function skyIcon(sky) {
    const s = (sky || "").toLowerCase();
    const sun = r => `<circle cx="12" cy="12" r="${r}"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6"/>`;
    const cloud = y => `<path d="M7.2 ${18.5 - y}h9.9a3.7 3.7 0 0 0 .5-7.4 5.3 5.3 0 0 0-10.2 1.2 3.1 3.1 0 0 0-.2 6.2z"/>`;
    let body;
    if (/rain|drizzle/.test(s)) body = cloud(3.5) + `<path d="M8.6 17.6l-1.1 3M12.6 17.6l-1.1 3M16.6 17.6l-1.1 3"/>`;
    else if (/snow/.test(s)) body = cloud(3.5) + `<path d="M8.2 18.2v2.4M7 19.4h2.4M12.2 18.2v2.4M11 19.4h2.4M16.2 18.2v2.4M15 19.4h2.4"/>`;
    else if (s === "overcast") body = `<path d="M5.5 9.2a4 4 0 0 1 7.3-1.6" opacity=".6"/>` + cloud(0);
    else if (s === "breezy") body = `<path d="M3 9h10.6a2.6 2.6 0 1 0-2.4-3.4M3 13.4h15.3a2.6 2.6 0 1 1-2.4 3.4M3 17.8h7.5"/>`;
    else if (s === "humid") body = `<circle cx="12" cy="9.5" r="3.6"/><path d="M4 15.5c2 1.2 3.4-1.2 5.4 0s3.4-1.2 5.4 0 3.4-1.2 5.2 0M5.5 19.5c2 1.2 3.4-1.2 5.4 0s3.4-1.2 5.4 0"/>`;
    else body = sun(s === "bluebird" ? 4.6 : 4.1);
    return `<svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  // The sun's arc from sunrise to dusk, with the sun where the clock is.
  function daylightDial(w, L) {
    const W = 150, H = 46, x0 = 8, x1 = W - 8, base = 38, top = 7, span = w.dusk - L.rise;
    const t = m => Math.min(1, Math.max(0, (m - L.rise) / span));
    const at = m => [x0 + (x1 - x0) * t(m), base - (base - top) * Math.sin(Math.PI * t(m))];
    const arc = (a, b) => d3.range(0, 25).map(i => at(a + (b - a) * i / 24)).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    const now = Math.min(G.day.minute, w.dusk), [cx, cy] = at(now), night = G.day.over || G.day.minute >= w.dusk;
    const ra = G.day.rainWarned ? Mech.rainStart(w) : null;
    const rain = ra != null && ra > 0 && ra < w.dusk ? `<path class="dial-rain" d="M${at(ra)[0].toFixed(1)},${(at(ra)[1] - 7).toFixed(1)}c-2 3-3 4.4-3 5.6a3 3 0 0 0 6 0c0-1.2-1-2.6-3-5.6z"/>` : "";
    const body = night
      ? `<path class="dial-moon" d="M${x1 - 3},${top + 3}a7 7 0 1 0 6 10.5 5.5 5.5 0 0 1-6-10.5z"/>`
      : `<circle class="dial-glow" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9"/><circle class="dial-sun" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"/>`;
    return `<svg class="dial" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <path class="dial-ground" d="M2,${base}H${W - 2}"/><path class="dial-arc" d="${arc(L.rise, w.dusk)}"/>
      <path class="dial-left" d="${arc(now, w.dusk)}"/><path class="dial-dusk" d="M${x1},${base - 5}V${base + 4}"/>${rain}${body}</svg>`;
  }

  // Once you can read the conditions (Stage 3): when the friction's best for the
  // rest of today, and whether to look for shade or sun.
  function readingOf(w) {
    if (!knows("read") || !v2() || G.day.over || w.cond <= -0.8) return "";
    const from = Math.max(G.day.minute, 8 * 60), to = w.dusk, ms = [];
    for (let m = from; m <= to; m += 30) ms.push(m);
    if (ms.length < 2) return "";
    const at = m => Mech.condAt(w, m), vals = ms.map(at), best = Math.max(...vals), worst = Math.min(...vals);
    let t = "";
    if (best - worst < 0.06) t = "The friction holds steady the rest of the day.";
    else {
      const good = vals.map(v => v >= best - 0.04);
      const firstEnd = good.indexOf(false), lastStart = good.lastIndexOf(false) + 1;
      if (good[0] && firstEnd > 0) t = `Best now, until about ${clock(ms[firstEnd])}`;
      if (good[good.length - 1] && lastStart < ms.length && lastStart > 0) t += t ? `, and again after ${clock(ms[lastStart])}.` : `Best after about ${clock(ms[lastStart])}.`;
      else if (t) t += ".";
    }
    const sh = Mech.condAt(w, 15 * 60, 0.85) - Mech.condAt(w, 15 * 60, 0.1);
    if (sh >= 0.08 && to > 13 * 60) t += " Afternoons are cooler in the shade.";
    else if (sh <= -0.05) t += " It's cold: the sunny boulders are warmer.";
    return t.trim();
  }
  function renderHud() {
    const L = levelNow(), w = G.day.weather, d = G.day;
    const disabled = UI.busy || d.over ? "disabled" : "";
    const season = Art.seasonAt(G.date), light = Art.lightAt(Math.min(d.minute, w.dusk + 30), w.dusk, { over: d.over, sky: w.sky });
    const left = Math.max(0, w.dusk - d.minute), leftText = d.over ? "Day's over" : left <= 0 ? "Dark" : left >= 120 ? `${Math.floor(left / 60)} h ${left % 60} min of light left` : `${left} min of light left`;
    $("#hud").innerHTML = `
      <div class="hud-climber">
        <span class="blaze" title="Your level: V${L.level}">V${L.level}</span>
        <div class="block"><span class="who">${esc(G.player.name)}</span>
          <span class="small">${G.player.height} cm · reach ${reach()} cm · best ${G.bestGrade >= 0 ? "V" + G.bestGrade : "none yet"}</span>
          <div class="meter xp" title="XP to the next level"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div>
          <span class="small">${L.gated ? proofText(L) : `${fmt(Math.floor(L.into))} / ${fmt(Math.round(L.need))} XP to V${L.level + 1}`}</span></div>
      </div>
      <div class="hud-day block">
        <span class="label-sm">Day ${d.no} · ${season.name}</span><span class="day">${prettyDate(G.date)}</span>
        <div class="daylight">${daylightDial(w, light)}<div><b class="clock">${clock(Math.min(d.minute, w.dusk))}</b>
          <span class="small">${d.over ? "Night" : light.phase} · dusk ${clock(w.dusk)}</span><span class="small">${leftText}</span>${rainHud(w)}</div></div>
      </div>
      <div class="hud-wx block">
        <span class="label-sm">Conditions</span>
        <span class="cond">${skyIcon(w.sky)}<span><b class="cond-${esc(w.label.toLowerCase())}">${w.label}</b> ${esc(w.sky)}, ${w.temp}°F</span></span>
        <span class="small note">${esc(w.note)}</span>${(() => { const r = readingOf(w); return r ? `<span class="small note reading">${esc(r)}</span>` : ""; })()}
      </div>
      <div class="hud-body block">
        <span class="gauge"><span class="label-sm">Energy</span><span class="small">${G.player.energy.toFixed(0)}%</span></span>
        <div class="meter energy"><i style="width:${G.player.energy.toFixed(0)}%"></i></div>
        <span class="gauge"><span class="label-sm">Skin</span><span class="small">${G.player.skin.toFixed(0)}%</span></span>
        <div class="meter skin"><i style="width:${G.player.skin.toFixed(0)}%"></i></div>
        ${partnerNow() ? `<span class="small partner">Climbing with ${esc(firstName(partnerNow()))}${G.day.partner.allDay ? " all day" : ""} <button type="button" class="linklike" id="act-part">Part ways</button></span>` : ""}
      </div>
      <div class="actions">
        <button type="button" class="btn" id="act-rest" ${disabled}>Rest 20 min</button>
        ${d.attempts === 0 && !d.moved && (G.loc.sector == null || (G.loc.sector === START_AREA && G.loc.boulder == null)) && !d.over
          ? `<button type="button" class="btn" id="act-skip" ${disabled}>Rest day</button>` : ""}
        <button type="button" class="btn primary" id="act-home" ${disabled}>Head home</button>
      </div>`;
    $("#act-rest").onclick = rest;
    const part = $("#act-part"); if (part) part.onclick = () => { partWays("“See you out here!”"); save(); renderAll(); };
    $("#act-home").onclick = () => endDay("You pack up your pads and walk out.");
    const skip = $("#act-skip");
    if (skip) skip.onclick = () => { note("Took a rest day."); startDay(1, 1); save(); renderAll(); };
  }

  function renderTabs() {
    const pendingTips = G.tips.filter(t => !t.done).length;
    document.querySelectorAll("#tabs button").forEach(b => {
      b.setAttribute("aria-selected", String(b.dataset.tab === UI.tab));
      b.onclick = () => { UI.tab = b.dataset.tab; renderTabs(); renderPanel(); };
    });
    $("#tab-journal").innerHTML = `Journal${pendingTips ? `<span class="badge">${pendingTips}</span>` : ""}`;
  }

  function renderPanel() {
    const el = $("#tabbody");
    el.innerHTML = { here: () => hereHtml() + eventHtml() + tripHtml() + inviteHtml() + outTodayHtml(), climber: climberHtml, logbook: logbookHtml, craglog: cragHtml, journal: journalHtml }[UI.tab]();
    bindPanel(el);
  }

  // ---- Here ----
  function resultHtml() {
    const r = G.day.last; if (!r) return "";
    const gains = r.gains ? Object.entries(r.gains).filter(([, g]) => g >= 0.005).map(([t, g]) => `<span class="chip good">${STYLE[t][0]} +${g.toFixed(2)}</span>`).join("") : "";
    let rate = "";
    if (r.kind === "send" && r.tick != null) {
      const t = G.ticks[r.tick];
      rate = `<div class="rate">Rate it on CragLog: ${[1, 2, 3, 4].map(n => `<button type="button" data-rate="${n}" class="${t.stars >= n ? "on" : ""}" aria-label="${n} stars">★</button>`).join("")}</div>`;
    }
    return `<div class="result ${esc(r.kind)}"><div class="rt">${esc(r.title)}</div><p>${esc(r.text)}</p>
      ${r.xp ? `<p><b style="color:var(--gold)">+${fmt(r.xp)} XP</b></p>` : ""}
      ${gains ? `<div class="chips gains">${gains}</div>` : ""}${rate}</div>`;
  }
  function npcHtml() { return ""; }            // (Phase 4, Stage 2: conversations happen in the box over the map, renderTalk)
  // Where the good vibes come from, in words (for the odds panel's chip).
  function vibesWhy() {
    const vb = vibesNow(), out = [];
    if (vb.partner) out.push(`climbing with ${firstName(partnerNow())}${vb.rowan ? " (it's always a good day with Rowan)" : ""}`);
    if (vb.crowd) out.push("friends climbing nearby");
    if (vb.buzz) out.push("the crag's buzzing");
    if (vb.high) out.push("your recent send");
    if (vb.friend) out.push("a friend's first ascent");
    return out.length ? out.join(", ").replace(/^./, c => c.toUpperCase()) + "." : "";
  }
  function feelHtml(i) {
    const f = Mech.feel(chanceFor(i));
    return `<div class="feel" title="How it feels right now"><div class="bars">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= f.bars ? "on" : ""}" style="height:${4 + n * 2}px"></i>`).join("")}</div><span>${f.label}</span></div>`;
  }
  function whyHtml(i) {
    const p = D.problems[i], parts = Mech.breakdown(G.player, p, G.ps[i], here(i));
    const label = {
      ability: `Your level`, style: `Your skill on ${p.tagList.filter(t => STYLE[t]).map(t => STYLE[t][0].toLowerCase()).join(", ") || "this style"}`,
      morph: Mech.reachDependence(p) < 0 ? "Bunchy, vs your reach" : "Reachy, vs your reach", beta: Object.keys(tipsOf(i)).length ? "Beta, yours and other people's" : "Beta you've worked out",
      conditions: knows("read") ? `Friction here now (${shadeWord(p.b).toLowerCase()})` : "Friction", brushed: "Freshly brushed", dirt: "Dirty holds",
      tape: "Tape (less feel)", vibes: "Good vibes", fatigue: "Tiredness", skin: "Thin skin", head: "Highball nerves", grade: `Grade V${p.grade}`,
    };
    const graded = K.grade(i) != null;
    const chips = Object.entries(parts).filter(([k, v]) => (k === "ability" || k === "grade" ? graded : Math.abs(v) >= 0.05))
      .map(([k, v]) => k === "vibes" ? `<span class="chip good" title="${esc(vibesWhy())}">Good vibes</span>`       // never a number
        : `<span class="chip ${k === "grade" || k === "ability" ? "" : v > 0 ? "good" : "bad"}">${label[k]} ${signed(v)}</span>`).join("");
    const c = chanceFor(i);
    return `<div class="why">About ${c >= 0.1 ? Math.round(c * 100) + "%" : c >= 0.01 ? "1 in " + Math.round(1 / c) : "under 1%"} per try right now.${graded ? "" : " Nobody has climbed it, so nobody knows its grade."}
      <div class="chips">${chips}</div></div>`;
  }
  // The moves of a problem you've tried: one mark each, a diamond for a crux,
  // filled as you learn it; moves you haven't reached yet are dashed; a ring marks
  // your highpoint. Nothing about a move shows until you've reached it.
  function moveStrip(i) {
    const p = D.problems[i], st = G.ps[i];
    if (!st || !st.att) return "";
    const mk = Mech.knowledge(p, st), seen = Mech.seenOf(p, st), hi = st.sent ? -1 : Math.round((st.best || 0) * p.moves) - 1;
    const know = v => (v >= 0.67 ? "well" : v >= 0.34 ? "fairly well" : v > 0.05 ? "a little" : "not yet");
    const cells = p.seq.moves.map((m, j) => {
      if (j >= seen) return `<i class="mv unseen" title="Move ${j + 1}: you haven't got this far"></i>`;
      const lvl = mk[j] >= 0.67 ? 3 : mk[j] >= 0.34 ? 2 : mk[j] > 0.05 ? 1 : 0;
      const what = m.kind === "crux" ? `the crux, ${an(m.hold)}` : m.kind === "top" ? "the top-out" : an(m.hold);
      const alt = st.alt && p.seq.alt && p.seq.alt.at === j ? ` You've found a better way: ${ALT[p.seq.alt.kind].see}` : "";
      const told = Object.entries(st.tips || {}).filter(([w, t]) => t[1] === j && w !== "?").map(([w]) => (w.startsWith("n:") ? firstName(w) : "a climber you met"));
      const by = told.length ? ` Beta from ${[...new Set(told)].join(" and ")}.` : "";
      return `<i class="mv k${lvl}${m.kind === "crux" ? " crux" : ""}${j === hi ? " hi" : ""}${alt ? " alt" : ""}${by ? " told" : ""}" title="${esc(`Move ${j + 1}: ${what}. You know it ${know(mk[j])}.${alt}${by}`)}"></i>`;
    }).join("");
    const cr = p.seq.cruxes.filter(j => j < seen);
    const label = `${p.moves} moves, ${seen} seen.${cr.length ? ` Crux at move ${cr.map(j => j + 1).join(" and ")}, known ${cr.map(j => know(mk[j])).join(" and ")}.` : ""}${st.alt ? " You've found a better way through." : ""}`;
    return `<span class="moves" role="img" aria-label="${esc(label)}">${cells}</span>`;
  }
  function problemRowHtml(i, k = 0, anim = false) {
    const p = D.problems[i], st = G.ps[i], open = UI.expanded.has(i), fresh = !!(UI.fresh && UI.fresh.has(i));
    let status = "";
    if (st?.sent) status = `<span class="status sent">${st.flash ? "Flashed" : "Sent"}${st.att > 1 ? ` in ${st.att}` : ""}</span>`;
    else if (st?.att) status = `<span class="status">${st.att} ${st.att === 1 ? "try" : "tries"}</span>`;
    const tip = (G.tips.some(t => t.p === i && !t.done) ? `<span class="chip" style="background:var(--gold-soft);color:var(--gold)">★ tip</span>` : "")
      + (fresh ? `<span class="chip new">just spotted</span>` : "");
    const hp = st && !st.sent && st.att ? `<div class="hp">${moveStrip(i)}<span>Highpoint move ${Math.round(st.best * p.moves)} of ${p.moves}${st.alt ? " · found a better way" : ""}</span></div>` : "";
    const disabled = UI.busy || G.day.over ? "disabled" : "";
    return `<div class="prob${fresh && anim ? " fresh" : ""}"${fresh && anim ? ` style="animation-delay:${k * 140}ms"` : ""}><div class="prob-main">
        ${gradeSpan(i)}
        <div><button type="button" class="linklike pname" data-expand="${i}" aria-expanded="${open}">${esc(pname(i))}</button>${status}
          <div class="chips">${tip}${p.tagList.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>${hp}</div>
        ${feelHtml(i)}
        ${st?.sent || easyFor(i) ? `<button type="button" class="btn small ${st?.sent ? "" : "primary"}" data-climb="${i}" ${disabled || (rainNow() ? "disabled" : "")} title="${rainNow() ? "Too wet to climb" : st?.sent ? "Climb it again" : "One burn, right here"}">${st?.sent ? "Repeat" : "Climb it"}</button>`
          : `<button type="button" class="btn small primary" data-try="${i}" ${disabled} title="Open the climbing scene">Try</button>`}
      </div>${open ? whyHtml(i) + knowersHtml(i) + `<div class="why"><button type="button" class="linklike" data-cl="${i}">See it on CragLog</button></div>` : ""}</div>`;
  }
  function hereHtml() {
    const d = G.day;
    if (d.over) return `${resultHtml()}<h2>Day over</h2><p class="lede">${esc(d.reason || "")}</p><button type="button" class="btn primary" data-summary>See today's summary</button>`;
    if (G.loc.sector == null) {
      const mins = s => walkMinutes({ sector: s.name, boulder: null });
      const rows = [...D.sectors].filter(s => K.area(s.name) >= 1).sort((a, b) => mins(a) - mins(b)).map(s => {
        const a = K.areaStats(s.name);
        const sub = K.all() ? `${s.boulderIds.length} boulders · V${s.lo}–V${s.hi} · you've sent ${a.sent} of ${D.sectorProblems.get(s.name).length}`
          : a.boulders ? `${a.boulders} ${a.boulders === 1 ? "boulder" : "boulders"} found · ${a.n} documented${a.open ? ` · ${a.open} unclimbed` : ""} · you've sent ${a.sent}`
          : "You know where it is, but you haven't found its boulders yet.";
        return `<li><button type="button" class="rowbtn" data-go-sector="${esc(s.name)}"><span><span class="t">${esc(s.name)}</span>
          <span class="s">${sub}</span></span>
          <span class="v">${mins(s)} min walk</span></button></li>`;
      }).join("");
      // Between areas: by the lot, on a trail, or off in the woods.
      const p = G.pos || [0, 0], atLot = Math.hypot(p[0], p[1] + 10) < 45;
      const onTrail = M && M.paint && M.paint.scene.trailDist(p, 5) < 3;
      const title = atLot ? "The parking lot" : onTrail ? "On the trail" : "In the woods";
      const lede = atLot ? (K.all() ? "Pick a sector to walk to." : "The kiosk map marks the areas below. Pick one to walk to, or head for any boulder you can see on the map.")
        : onTrail ? "Between climbing areas. Keep walking, or pick an area to head for." : "No trail here, just trees and the odd glacial erratic. Anything you can see on the map, you can walk to.";
      return `${resultHtml()}${npcHtml()}<h2>${title}</h2><p class="meta">${lede} Walking takes time, and the park closes at dusk.</p><h3>Areas you know</h3><ul class="rowlist">${rows}</ul>`;
    }
    const s = D.sectorBy.get(G.loc.sector);
    if (G.loc.boulder == null) {
      const ids = K.all() ? s.boulderIds : K.knownBoulders(s.name);
      const rows = ids.map(bi => {
        const b = D.boulders[bi], a = K.boulderStats(bi);
        const proj = b.problems.some(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 2);
        const range = a.n ? ` · V${a.lo}${a.hi > a.lo ? "–V" + a.hi : ""}` : "";
        const what = K.all() || !a.open ? `${a.n} problems${range}` : `${a.n} documented · ${a.open} unclimbed${range}`;
        const again = !K.all() && K.inspected(bi) && K.spottable(bi).length ? " · worth another look" : "";
        return `<li><button type="button" class="rowbtn" data-go-boulder="${bi}"><span><span class="t">${esc(b.name)}</span>
          <span class="s">${what} · ${b.height_ft} ft · ${b.angle}${proj ? " · project here" : ""}${again}</span></span>
          <span class="v">${a.sent}/${a.lines} sent</span></button></li>`;
      }).join("");
      const none = `<p class="lede">You haven't found any boulders here yet. Have a look around: walk to any boulder you can see on the map.</p>`;
      const away = D.sectors.filter(x => x.name !== s.name && K.area(x.name) >= 1).map(x => [x, walkMinutes({ sector: x.name, boulder: null })]).sort((a, b) => a[1] - b[1]);
      const elsewhere = away.length ? `<h3>Other areas</h3><ul class="rowlist">${away.map(([x, m]) => `<li><button type="button" class="rowbtn" data-go-sector="${esc(x.name)}"><span><span class="t">${esc(x.name)}</span></span><span class="v">${m} min walk</span></button></li>`).join("")}</ul>
        <p class="meta">The trail map (M) shows where they are.</p>` : "";
      const kiosk = s.name === START_AREA && v2() ? ` <button type="button" class="linklike" data-kiosk>Read the kiosk</button>` : "";
      return `${resultHtml()}${npcHtml()}<h2>${esc(s.name)}</h2><p class="meta">${s.name === START_AREA ? "Right by the lot." : `${s.walk_min} min from the lot.`}${ids.length ? " Pick a boulder." : ""}${kiosk}</p>${ids.length ? `<ul class="rowlist">${rows}</ul>` : none}${ids.length ? areaHint(s.name) : ""}${elsewhere}`;
    }
    const b = D.boulders[G.loc.boulder];
    const disabled = UI.busy || d.over ? "disabled" : "";
    if (K.boulder(b.id) < 1) {
      return `${resultHtml()}${npcHtml()}<h2>Unfamiliar boulder</h2>
        <p class="meta">${esc(s.name)} · ${b.height_ft} ft · mostly ${b.angle}.</p>
        <p class="lede">It isn't in any guidebook. Look it over to see whether anything on it might go. It takes a few minutes.</p>
        <button type="button" class="btn primary" data-inspect="${b.id}" ${disabled}>Inspect</button>`;
    }
    const anim = UI.freshAnim; UI.freshAnim = false;        // just-spotted lines arrive once, not on every redraw
    const lines = K.linesOn(b.id), more = K.all() ? [] : K.spottable(b.id);
    const others = (K.all() ? s.boulderIds : K.knownBoulders(s.name)).filter(x => x !== b.id).map(x => `<button type="button" class="linklike" data-go-boulder="${x}">${esc(D.boulders[x].name)}</button>`).join(", ");
    const lookAgain = more.length ? `<p class="meta" style="margin-top:10px"><button type="button" class="btn small" data-inspect="${b.id}" ${disabled}>Look it over</button>
      ${!K.inspected(b.id) ? "You haven't looked this boulder over properly yet." : "You're stronger than when you last looked. You might see more now."}</p>` : "";
    return `${resultHtml()}${npcHtml()}<h2>${esc(b.name)}</h2>${b.desc ? `<p class="boulder-desc">${esc(b.desc)}</p>` : ""}
      <p class="meta">${esc(s.name)} · ${b.height_ft} ft · mostly ${b.angle}. Select a problem's name to see what makes it hard for you.</p>
      ${lines.length ? lines.map(i => problemRowHtml(i, UI.fresh ? [...UI.fresh].indexOf(i) : 0, anim)).join("") : `<p class="lede">Nothing here that you can see how to climb yet. Stronger climbers might see more.</p>`}${lookAgain}
      <h3>Nearby</h3><p class="meta">${others || "No other boulders in this sector."} · <button type="button" class="linklike" data-go-sector="${esc(s.name)}">Sector overview</button></p>`;
  }

  // A gentle next step for a new climber, then a standing reminder of how finding things works.
  function areaHint(sector) {
    if (K.all()) return "";
    let t;
    if (sector === START_AREA && !G.ticks.length && !Object.keys(G.ps).length) t = "The notebook page's four problems are on The Billboard and Gus's Rock, right by the car. Start there.";
    else if (!Object.values(G.know.lines).some(l => l.how === "spot")) t = "Other boulders here aren't in any guidebook. They're on the map without a name: click one to walk over and look it over.";
    else t = "Boulders you haven't looked at yet are on the map without a name.";
    return `<p class="meta hint">${esc(t)}</p>`;
  }

  const hasOldCopy = () => { try { const c = JSON.parse(localStorage.getItem(OLD_RULES_COPY) || "null"); return !!(c && c.id === G.id); } catch (e) { return false; } };

  // ---- Climber ----
  // Your people (Phase 4, Stage 4): the regulars you've met, how close you are (in
  // words, never a number), what you've shared, and once you know each other, what
  // they especially value.
  function yourPeopleHtml() {
    const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const who = [...World.REG, "n:bishop"].filter(w => K.met(w)).map(w => ({ w, t: Social.tier(G, w) || { n: 0, words: "You've met", bond: 0 } }))
      .sort((a, b) => b.t.n - a.t.n || b.t.bond - a.t.bond);
    if (!who.length && !K.met("n:pickles")) return "";
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const rows = who.map(({ w, t }) => {
      const sh = Social.shared(G, w), m = K.met(w), key = w.slice(2), first = m && m.first;
      const bits = [first ? `since ${MONTH[+first.slice(5, 7) - 1]}${first.slice(0, 4) !== G.date.slice(0, 4) ? " " + first.slice(0, 4) : ""}` : "",
        sh.climbs ? `climbed together on ${plural(sh.climbs, "day", "days")}` : "", sh.sends ? plural(sh.sends, "send together", "sends together") : "",
        sh.beta ? `beta on ${plural(sh.beta, "day", "days")}` : "", sh.chats ? plural(sh.chats, "long chat", "long chats") : ""].filter(Boolean);
      const likes = t.n >= 1 && Social.LIKES[w] ? `<div class="pp-likes">${esc(Social.LIKES[w].words)}</div>` : "";
      // Rowan (Stage 6): how things stand, in words, if there's anything to say.
      const ro = w === "n:rowan" ? Social.romance(G) : null, roWords = ro && ro.n > 0 ? ro.words : null;
      if (ro && ro.together) bits.unshift(`together since ${new Date(ro.together + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`);
      const roChip = roWords ? ` <span class="pp-tier ro">${ro.n === 4 ? `<span aria-hidden="true">♥</span> ` : ""}${esc(roWords)}</span>` : "";
      return `<li><div class="pp-face">${Portraits.svg(key, ro && ro.n === 4 ? "smitten" : t.n >= 2 ? "happy" : "neutral", { seed: w, label: callName(w) })}</div>
        <div><div class="pp-name">${esc(callName(w))} <span class="pp-tier t${t.n}">${esc(t.words)}</span>${roChip}</div>
        <div class="meta" style="margin:0">${esc(bits.join(" · "))}</div>${likes}</div></li>`;
    }).join("");
    const dg = Social.dog(G);
    const pk = K.met("n:pickles") ? `<li><div class="pp-face">${Portraits.svg("pickles", dg.n >= 2 ? "happy" : "sleepy", { label: "Pickles" })}</div>
        <div><div class="pp-name">Pickles <span class="pp-tier t${Math.min(3, dg.n)}">${esc(dg.words)}</span></div>
        <div class="meta" style="margin:0">${esc([dg.adopted ? `yours since ${dg.adopted.slice(5) ? new Date(dg.adopted + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : ""}` : "", dg.pets ? `petted on ${plural(dg.pets, "day", "days")}` : "", dg.walks ? `walked with you on ${plural(dg.walks, "day", "days")}` : ""].filter(Boolean).join(" · "))}</div>
        ${dg.n >= 1 && !dg.adopted ? `<div class="pp-likes">Pickles loves a good scratch behind the ears, and a walk. He's at his rock most days.</div>` : ""}</div></li>` : "";
    return `<h3>Your people</h3><ul class="your-people">${rows}${pk}</ul>`;
  }
  function climberHtml() {
    const pl = G.player, L = levelNow(), sends = firstSends();
    const days = new Set(G.ticks.map(t => t.date)).size;
    const skills = Mech.PREF.map(t => [t, pl.skills[t]]).sort((a, b) => b[1] - a[1]);
    const lo = -1, hi = 1, x = v => (v - lo) / (hi - lo) * 100;
    const r = reach(), reachText = r < 170 ? "Short reach: bunchy problems suit you; reachy ones fight back." : r > 182 ? "Long reach: reachy problems suit you; cramped, bunchy ones fight back." : "Average reach: few problems care about your size.";
    return `<h2>${esc(pl.name)}</h2><p class="meta">${pl.height} cm, ape index ${pl.ape >= 0 ? "+" : ""}${pl.ape} cm, reach ${r} cm. ${reachText}</p>
      <div class="kv"><div><b style="color:var(--gold)">V${L.level}</b><span>level, ${L.gated ? proofText(L).replace(/^S/, "s") : `${(L.frac * 100).toFixed(0)}% to V${L.level + 1}`}</span></div>
        <div><b>${G.bestGrade >= 0 ? "V" + G.bestGrade : "–"}</b><span>hardest send</span></div><div><b>${sends.length}</b><span>problems sent</span></div>
        <div><b>${G.ticks.filter(t => t.style === "Flash").length}</b><span>flashes</span></div><div><b>${G.dayNo}</b><span>days at the crag</span></div>
        ${v2() ? `<div><b>${World.faCount(G)}</b><span>first ascents</span></div>` : ""}<div><b>${Object.keys(G.ach).length}</b><span>achievements</span></div></div>
      ${v2() ? yourPeopleHtml() + eventsHtml() + tripsHtml() : ""}
      <h3>Style skills</h3>
      ${skills.map(([t, v]) => {
        const left = Math.min(x(0), x(v)), width = Math.abs(x(v) - x(0));
        const tag = pl.strengths.includes(t) ? `<span class="tag-str">strength</span>` : pl.weakness === t ? `<span class="tag-weak">weakness</span>` : "";
        return `<div class="skill"><span>${STYLE[t][0]}${tag}</span><div class="track"><i style="left:${left}%;width:${width}%;background:${v >= 0 ? "var(--accent)" : "var(--minus)"}"></i><span class="zero" style="left:${x(0)}%"></span></div><span class="val">${signed(v)}</span></div>`;
      }).join("")}
      <h3>Backup</h3>
      <p class="lede">The game saves itself in this browser, but clearing browser data erases it. Download a save file to keep a copy, or to move your climber to another browser or computer.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-export>Download save file</button><button type="button" class="btn" data-import>Load save file</button></div>
      ${hasOldCopy() ? `<p class="meta" style="margin-top:6px">This browser also keeps your climber from before the reopening, when the whole crag was documented. <button type="button" class="linklike" data-old>Download it</button></p>` : ""}
      <p class="meta" style="margin-top:6px">${G.backup ? `Last downloaded ${new Date(G.backup.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, on game day ${G.backup.dayNo}.` : "You haven't downloaded a save file yet."}</p>
      <h3>Start over</h3>
      ${UI.confirmReset
        ? `<p class="lede">This deletes ${esc(pl.name)} and all progress.</p><div style="display:flex;gap:8px"><button type="button" class="btn" data-reset-yes style="border-color:var(--minus);color:var(--minus)">Delete and start over</button><button type="button" class="btn" data-reset-no>Keep climbing</button></div>`
        : `<button type="button" class="btn" data-reset>Make a new climber</button>`}`;
  }

  // ---- CragLog rankings
  // A climber's score is the sum of their ten best sends in the window (last 12
  // months to today's date, or all time): 100 points per V-grade from V0 = 100,
  // plus 50 for a flash. Must match rank_points() in game_data.py.
  const RANK_TOP = 10;
  const rankPoints = (grade, flash) => 100 * (grade + 1) + (flash ? 50 : 0);
  const epochDays = s => Math.round((toDate(s) - toDate(D.send_epoch)) / 864e5);
  const dateOfEpoch = n => addDays(D.send_epoch, n);
  function topSends(list, from, to) {
    return list.filter(x => x.d > from && x.d <= to).map(x => ({ ...x, pts: rankPoints(D.problems[x.p].grade, x.f) }))
      .sort((a, b) => b.pts - a.pts || b.d - a.d).slice(0, RANK_TOP);
  }
  const playerSends = () => firstSends().map(t => ({ p: t.p, d: epochDays(t.date), f: t.style === "Flash" }));
  const rankWindow = (win, date = G.date) => [win === "all" ? -Infinity : epochDays(addDays(date, -365)), epochDays(date)];
  function rankSummaryForBoard() {   // what a joined player posts, as of their own game date
    const mine = playerSends(), pack = top => top.map(x => [x.p, dateOfEpoch(x.d), x.f ? 1 : 0]);
    return { y: pack(topSends(mine, ...rankWindow("12m"))), a: pack(topSends(mine, ...rankWindow("all"))) };
  }
  // Local Buzz: what people are saying about the crag lately (K keeps it vague about places you don't know).
  // Its own CragLog tab, next to Problems.
  function buzzHtml() {
    const items = K.all() ? [] : K.buzz({ days: 30, max: 12 });
    if (!items.length) return `${cragHead()}<p class="meta">Nothing new lately. When someone puts up a problem or finds a new area, you'll hear about it here.</p>`;
    return `${cragHead()}<section class="buzz" aria-label="Local Buzz"><p class="meta" style="margin:2px 0 6px">What people are saying about the crag lately.</p><ul>${items.map(it => `<li><span class="buzz-d">${esc(shortDate(it.date).replace(/,? \d{4}$/, ""))}</span><span class="buzz-t">${esc(it.text)}</span>${
      it.p != null ? `<button type="button" class="linklike" data-cl="${it.p}">See it</button>` : it.go && K.canGo(it.go) && !G.day.over ? `<button type="button" class="linklike" ${it.go.boulder != null ? `data-go-boulder="${it.go.boulder}"` : `data-go-sector="${esc(it.go.sector)}"`}>Go there</button>` : ""}</li>`).join("")}</ul></section>`;
  }
  // "First to" (the shared leaderboard) is hidden for now, until it's brought back
  // online under the new rules; development mode still shows it.
  const leadersShown = () => DEV;
  const CL_VIEWS = () => [["problems", "Problems"], ["mylog", "My logbook"], ...(K.all() ? [] : [["buzz", "Local Buzz"]]), ["rankings", "Rankings"], ...(leadersShown() ? [["leaders", "First to"]] : [])];
  const CL_BACK = { rankings: "Rankings", leaders: "First to", buzz: "Local Buzz", mylog: "My logbook" };
  function cragHead() {
    const views = CL_VIEWS(), v = views.some(x => x[0] === UI.cl.view) ? UI.cl.view : "problems";
    return `<div class="cl-brand"><b>Crag<i>Log</i></b><span class="meta" style="margin:0">Logs and comments from Granite Hollow climbers</span></div>
      <div class="cl-views" role="group" aria-label="CragLog section">
        ${views.map(([k, label]) => `<button type="button" data-cl-view="${k}" aria-pressed="${v === k}">${label}</button>`).join("\n        ")}</div>`;
  }
  // Under the new rules: who has put up the most problems since the reopening.
  function faRankingsHtml() {
    const rows = new Map();
    for (const [p, e] of Object.entries(G.world.est)) {
      if (e.old) continue;
      const r = rows.get(e.by) || { who: e.by, n: 0, hardest: -1, last: "" };
      r.n++; r.hardest = Math.max(r.hardest, e.grade); if (e.date > r.last) r.last = e.date;
      rows.set(e.by, r);
    }
    if (!rows.has("you")) rows.set("you", { who: "you", n: 0, hardest: -1, last: "" });
    const list = [...rows.values()].sort((a, b) => b.n - a.n || b.hardest - a.hardest || (a.who < b.who ? -1 : 1));
    const me = list.findIndex(r => r.who === "you"), N = 15;
    const label = r => (r.who === "you" ? esc(G.player.name) + ` <span class="you-tag">you</span>` : esc(World.whoName(D, r.who).replace(/^the /, "The ")) + (World.whoInfo(D, r.who).regular ? ` <span class="chip">regular</span>` : ""));
    const row = (r, k) => `<tr class="${r.who === "you" ? "lb-me" : ""}"><td class="num">${k + 1}</td><td>${label(r)}</td><td class="num"><b>${r.n}</b></td><td class="num">${r.hardest >= 0 ? "V" + r.hardest : "–"}</td></tr>`;
    const shown = list.slice(0, N).map(row);
    if (me >= N) shown.push(`<tr><td colspan="4" class="meta" style="text-align:center">…</td></tr>`, row(list[me], me));
    const total = list.reduce((a, r) => a + r.n, 0);
    return `${cragHead()}${rankByHtml()}
      <p class="meta">First ascents since the park reopened: ${fmt(total)} problems by ${fmt(list.filter(r => r.n).length)} ${list.filter(r => r.n).length === 1 ? "climber" : "climbers"}. ${list[me].n ? `You've put up ${list[me].n}, #${me + 1} in the valley.` : "You haven't put up a problem yet."}</p>
      <table><thead><tr><th>#</th><th>Climber</th><th class="num">FAs</th><th class="num">Hardest</th></tr></thead><tbody>${shown.join("")}</tbody></table>`;
  }
  // Under the new rules, two ways to rank: most first ascents, or a climber's 10
  // hardest ascents since the reopening (UI.rk.by: "fa" | "hard").
  const rankByHtml = () => `<div class="cl-filters"><select id="rk-by" aria-label="Rank by">
      <option value="fa" ${UI.rk.by !== "hard" ? "selected" : ""}>Most first ascents</option><option value="hard" ${UI.rk.by === "hard" ? "selected" : ""}>10 hardest ascents</option></select></div>`;
  // Everyone's ascents since the reopening: yours from your ticks (first sends), each
  // local's from the ledger (their first ascents, and the ascents in each problem's
  // log, which keeps the latest 20). { who: Map(problem -> { p, d, f (flash) }) }.
  function ascentsSinceReopening() {
    const by = new Map();
    const add = (who, p, d, f) => { let m = by.get(who); if (!m) by.set(who, m = new Map()); const o = m.get(p); if (!o) m.set(p, { p, d, f: !!f }); else if (f) o.f = true; };
    for (const [k, e] of Object.entries(G.world.est)) {
      if (!e || e.old) continue;                                     // the old notebook's ascents
      if (e.by !== "you") add(e.by, +k, e.date, false);
      for (const l of e.logs || []) if (Array.isArray(l) && l[0] !== "you") add(l[0], +k, l[1], l[2] === "F");
    }
    for (const t of G.ticks) if (t.style !== "Repeat") add("you", t.p, t.date, t.style === "Flash");
    return by;
  }
  const ascentPts = (p, f) => 100 * (D.problems[p].grade + 1) + (f ? 50 : 0);
  function hardRankingsHtml() {
    const rows = [];
    for (const [who, m] of ascentsSinceReopening()) {
      const top = [...m.values()].map(a => ({ ...a, pts: ascentPts(a.p, a.f) })).sort((a, b) => b.pts - a.pts || (a.d < b.d ? -1 : 1)).slice(0, RANK_TOP);
      rows.push({ who, top, score: d3.sum(top, a => a.pts), hardest: d3.max(top, a => D.problems[a.p].grade) });
    }
    if (!rows.some(r => r.who === "you")) rows.push({ who: "you", top: [], score: 0, hardest: -1 });
    const list = rows.filter(r => r.score > 0 || r.who === "you").sort((a, b) => b.score - a.score || b.hardest - a.hardest || (a.who < b.who ? -1 : 1));
    const me = list.findIndex(r => r.who === "you"), N = 15, open = UI.rk.open;
    const name = r => (r.who === "you" ? esc(G.player.name) + ` <span class="you-tag">you</span>` : esc(World.whoName(D, r.who).replace(/^the /, "The ")) + (World.whoInfo(D, r.who).regular ? ` <span class="chip">regular</span>` : ""));
    // A line in an area you haven't found isn't named.
    const lineName = p => (K.area(D.problems[p].sector) >= 1 ? `<button type="button" class="linklike" data-cl="${p}">${esc(pname(p))}</button>` : `<span class="meta">a line in an area you haven't found</span>`);
    const row = (r, k) => `<tr class="${r.who === "you" ? "lb-me" : ""}"><td class="num">${k + 1}</td>
        <td><button type="button" class="linklike" data-rk-open="${esc(r.who)}" aria-expanded="${open === r.who}"><b>${name(r)}</b></button></td>
        <td class="num"><b>${fmt(r.score)}</b></td><td class="num">${r.hardest >= 0 ? "V" + r.hardest : "–"}</td></tr>`
      + (open === r.who && r.top.length ? `<tr class="rk-detail"><td></td><td colspan="3"><ol>${r.top.map(a => `<li><span>V${D.problems[a.p].grade} ${lineName(a.p)}${a.f ? " · Flash" : ""} · ${shortDate(a.d)}</span><span class="num">${a.pts}</span></li>`).join("")}</ol></td></tr>` : "");
    const shown = list.slice(0, N).map(row);
    if (me >= N) shown.push(`<tr><td colspan="4" class="meta" style="text-align:center">…</td></tr>`, row(list[me], me));
    const mine = list[me], tenth = mine.top.length >= RANK_TOP ? mine.top[RANK_TOP - 1] : null;
    const you = !mine.score ? "You haven't sent anything yet. Go climb something!"
      : `<b>You're #${me + 1}</b> of ${fmt(list.length)} with <b>${fmt(mine.score)} points</b>.` + (me > 0 ? ` ${fmt(list[me - 1].score - mine.score)} behind ${name(list[me - 1]).replace(/ <span.*$/, "")}.` : " You're on top!")
        + (tenth ? ` Your 10th-hardest counts for ${tenth.pts} (V${D.problems[tenth.p].grade}${tenth.f ? " flash" : ""}), so anything harder raises your score.` : ` Only ${mine.top.length} of your 10 counting ascents are filled, so every new send adds points.`);
    return `${cragHead()}${rankByHtml()}
      <p class="meta">A climber's score is the sum of their 10 hardest ascents since the park reopened: 100 points per V-grade (V0 = 100, V5 = 600), plus 50 for a flash. Click a name to see their 10.</p>
      <div class="lb-join" style="border-left-color:var(--accent)"><p class="lede" style="margin:0">${you}</p></div>
      <table><thead><tr><th>#</th><th>Climber</th><th class="num">Score</th><th class="num">Top</th></tr></thead><tbody>${shown.join("")}</tbody></table>`;
  }
  function rankingsHtml() {
    if (!K.all()) return UI.rk.by === "hard" ? hardRankingsHtml() : faRankingsHtml();
    const r = UI.rk, [from, to] = rankWindow(r.window);
    const rows = [];
    D.npcSends.forEach((list, ci) => {
      const top = topSends(list, from, to);
      if (top.length) rows.push({ key: "n" + ci, name: D.climbers[ci][0], height: D.climbers[ci][1], kind: "npc", top });
    });
    boardClimbers().forEach((c, k) => {
      if (c.mine || !c.rk) return;
      const top = c.rk[r.window === "all" ? "a" : "y"];
      if (top.length) rows.push({ key: "b" + k, name: c.name, height: c.height, kind: c.yours ? "yours" : "player", top });
    });
    const mineTop = topSends(playerSends(), from, to);
    rows.push({ key: "me", name: G.player.name, height: G.player.height, kind: "you", top: mineTop });
    for (const x of rows) { x.score = d3.sum(x.top, s => s.pts); x.hardest = x.top.length ? d3.max(x.top, s => D.problems[s.p].grade) : -1; }
    const hOk = h => !r.height || h == null || (r.height === "s" ? h < 170 : r.height === "m" ? h >= 170 && h <= 182 : h > 182);
    const list = rows.filter(x => x.score > 0 && hOk(x.height))
      .sort((a, b) => b.score - a.score || b.hardest - a.hardest || a.name.localeCompare(b.name));
    const me = list.findIndex(x => x.kind === "you");

    let you;
    if (me < 0) you = mineTop.length ? `You're outside this height range.` : `You have no sends ${r.window === "all" ? "yet" : "in the last 12 months"}. Go climb something!`;
    else {
      const above = list[me - 1];
      const tenth = mineTop.length >= RANK_TOP ? mineTop[RANK_TOP - 1] : null;
      you = `<b>You're #${me + 1}</b> of ${fmt(list.length)} with <b>${fmt(list[me].score)} points</b>.`
        + (!above ? " You're on top!" : above.score === list[me].score
          ? ` You're tied on points with ${esc(above.name)} (#${me}), who ranks ahead with a harder top send.`
          : ` ${fmt(above.score - list[me].score)} points behind ${esc(above.name)} (#${me}).`)
        + (tenth ? ` Your 10th-best send counts for ${tenth.pts} (V${D.problems[tenth.p].grade}${tenth.f ? " flash" : ""}), so anything worth more raises your score.`
          : ` Only ${mineTop.length} of your 10 counting slots are filled, so every new send adds points.`);
    }

    const tag = x => x.kind === "you" ? ` <span class="you-tag">you</span>` : x.kind === "player" ? ` <span class="chip">player</span>` : x.kind === "yours" ? ` <span class="chip">your other climber</span>` : "";
    const row = (x, k) => {
      const open = r.open === x.key;
      return `<tr class="${x.kind === "you" ? "lb-me" : ""}"><td class="num">${k + 1}</td>
        <td><button type="button" class="linklike" data-rk-open="${x.key}" aria-expanded="${open}"><b>${esc(x.name)}</b></button>${tag(x)}<div class="meta" style="margin:0">${x.height != null ? `${x.height} cm` : ""}</div></td>
        <td class="num"><b>${fmt(x.score)}</b></td><td class="num">V${x.hardest}</td></tr>`
        + (open ? `<tr class="rk-detail"><td></td><td colspan="3"><ol>${x.top.map(s => { const p = D.problems[s.p];
          return `<li><span>V${p.grade} <button type="button" class="linklike" data-cl="${s.p}">${esc(p.name)}</button>${s.f ? " · Flash" : ""} · ${shortDate(dateOfEpoch(s.d))}</span><span class="num">${s.pts}</span></li>`; }).join("")}</ol></td></tr>` : "");
    };
    const shown = list.slice(0, r.n).map(row);
    if (me >= r.n) {
      if (me - 2 > r.n) shown.push(`<tr><td colspan="4" class="meta" style="text-align:center">…</td></tr>`);
      for (let k = Math.max(r.n, me - 2); k <= Math.min(list.length - 1, me + 2); k++) shown.push(row(list[k], k));
    }
    return `${cragHead()}
      <div class="cl-filters">
        <select id="rk-window" aria-label="Time window"><option value="12m" ${r.window === "12m" ? "selected" : ""}>Last 12 months</option><option value="all" ${r.window === "all" ? "selected" : ""}>All time</option></select>
        <select id="rk-height" aria-label="Height"><option value="">Any height</option><option value="s" ${r.height === "s" ? "selected" : ""}>Under 170 cm</option><option value="m" ${r.height === "m" ? "selected" : ""}>170–182 cm</option><option value="t" ${r.height === "t" ? "selected" : ""}>Over 182 cm</option></select>
      </div>
      <p class="meta">A score is the sum of a climber's 10 best sends ${r.window === "all" ? "ever" : `from ${shortDate(addDays(G.date, -364))} to today`}. Each send is worth 100 points per V-grade (V0 = 100, V5 = 600), plus 50 for a flash. Click a name to see their top 10.</p>
      <div class="lb-join" style="border-left-color:var(--accent)"><p class="lede" style="margin:0">${you}</p>
        ${!G.board.joined && LB.status !== "off" && leadersShown() ? `<p class="meta" style="margin:6px 0 0">Other players only see you here if you join the leaderboard in <button type="button" class="linklike" data-cl-view="leaders">First to</button>.</p>` : ""}</div>
      <table><thead><tr><th>#</th><th>Climber</th><th class="num">Score</th><th class="num">Top</th></tr></thead><tbody>${shown.join("")}</tbody></table>
      ${list.length > r.n ? `<p style="margin-top:10px"><button type="button" class="btn small" data-rk-more>Show ${Math.min(25, list.length - r.n)} more</button></p>` : ""}`;
  }

  // ---- Logbook ----
  function logbookHtml() {
    const sends = firstSends();
    if (!G.ticks.length && !Object.keys(G.ps).length) return `<h2>My logbook</h2><p class="lede">No ticks yet. Go send something!</p>`;
    const maxG = Math.max(0, G.bestGrade);
    const counts = d3.range(maxG, -1, -1).map(g => [g, sends.filter(t => D.problems[t.p].grade === g).length]);
    const maxC = d3.max(counts, c => c[1]) || 1;
    const projects = Object.entries(G.ps).filter(([, s]) => !s.sent && s.att > 0).map(([i, s]) => [+i, s]).sort((a, b) => b[1].best - a[1].best || b[1].att - a[1].att);
    const rows = [...G.ticks].reverse().slice(0, 80).map(t => {
      const p = D.problems[t.p];
      return `<tr><td>${shortDate(t.date)}</td><td class="grade" style="font-size:15px">${vg(t.p) || "?"}</td><td><button type="button" class="linklike" data-cl="${t.p}">${esc(pname(t.p))}</button><div class="meta" style="margin:0">${esc(p.sector)}</div></td><td>${t.style}${v2() && World.isMine(G, t.p) && G.world.est[t.p].date === t.date && t.style !== "Repeat" ? " · FA" : ""}${v2() && (World.eventOn(t.date) || {}).comp ? `<div class="meta" style="margin:0">at ${esc(World.eventOn(t.date).short)}</div>` : ""}${t.with && v2() ? `<div class="meta" style="margin:0">with ${esc(firstName(t.with))}</div>` : ""}</td><td class="num stars">${t.stars ? "★".repeat(t.stars) : ""}</td></tr>`;
    }).join("");
    const fas = v2() ? Object.entries(G.world.est).filter(([, e]) => e.by === "you").map(([i, e]) => [+i, e]).sort((a, b) => (a[1].date < b[1].date ? 1 : a[1].date > b[1].date ? -1 : b[0] - a[0])) : [];
    const faHtml = !v2() ? "" : `<h3>Your first ascents</h3>${fas.length ? `<p class="meta">${fas.length} ${fas.length === 1 ? "problem" : "problems"} in Granite Hollow's guidebook ${fas.length === 1 ? "carries" : "carry"} your name.</p>
      <ul class="rowlist">${fas.slice(0, 40).map(([i, e]) => `<li><button type="button" class="rowbtn" data-cl="${i}"><span><span class="t">${esc(nameGrade(i))}</span>
        <span class="s">${esc(D.problems[i].boulder.name)} · ${esc(D.problems[i].sector)} · ${shortDate(e.date)}${e.flash ? " · flashed" : ""}</span></span>
        <span class="v">${e.reps ? `${e.reps} ${e.reps === 1 ? "repeat" : "repeats"}` : "no repeats yet"}${e.classic ? `<span class="s">a classic</span>` : ""}</span></button></li>`).join("")}</ul>${fas.length > 40 ? `<p class="meta">Showing the latest 40.</p>` : ""}`
      : `<p class="meta">Be the first up a line nobody has climbed, and it goes in the guidebook under your name.</p>`}`;
    return `<h2>My logbook</h2><p class="meta">${sends.length} ${sends.length === 1 ? "problem" : "problems"} sent, ${G.ticks.filter(t => t.style === "Flash").length} flashed${v2() ? `, ${fas.length} first ${fas.length === 1 ? "ascent" : "ascents"}` : ""}, over ${G.dayNo} ${G.dayNo === 1 ? "day" : "days"}.</p>
      <h3>Grade pyramid</h3>
      <div class="pyr">${counts.map(([g, c]) => `<span class="g">V${g}</span><div class="bar"><i style="width:${(c / maxC * 82).toFixed(1)}%"></i>${c}</div>`).join("")}</div>
      ${projects.length ? `<h3>Projects in progress</h3><ul class="rowlist">${projects.slice(0, 12).map(([i, s]) => {
        const p = D.problems[i];
        return `<li><button type="button" class="rowbtn" data-go-problem="${i}"><span><span class="t">${esc(nameGrade(i))}</span><span class="s">${esc(p.boulder.name)} · ${esc(p.sector)} · ${s.att} tries</span></span><span class="v">high ${Math.round(s.best * p.moves)}/${p.moves}</span></button></li>`;
      }).join("")}</ul>` : ""}${faHtml}
      <h3>Ticks</h3><table><thead><tr><th>Date</th><th>Grade</th><th>Problem</th><th>Style</th><th class="num">Stars</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---- CragLog ----
  function commentFor(log, p, pi, li) {
    const [who, , style, stars, sugg] = log;
    const ci = typeof who === "number" ? who : /^c\d+$/.test(who) ? +who.slice(1) : 7;
    const h = typeof who === "number" ? D.climbers[who][1] : World.whoInfo(D, who).h || 175;
    let seed = (pi * 31 + li * 17 + ci) % 1000;
    const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    if (r() < 0.35) return "";
    const bits = [];
    if (sugg != null && sugg < p.grade) bits.push(r() < 0.5 ? `Soft for V${p.grade}.` : `Felt more like V${sugg} to me.`);
    if (sugg != null && sugg > p.grade) bits.push(r() < 0.5 ? `Sandbagged. Felt V${sugg}.` : `Hard for the grade.`);
    if (p.tagList.includes("reachy") && h < 168) bits.push("Very reachy. Short folks, beware.");
    if (p.tagList.includes("reachy") && h > 185) bits.push("Easy if you're tall.");
    if (p.tagList.includes("bunchy") && h > 185) bits.push("Cramped start for tall people.");
    if (p.tagList.includes("bunchy") && h < 166) bits.push("Perfect for short climbers.");
    if (style === "F") bits.push(pick(["Flashed it. Fun movement.", "Went first try!", "Flash! Read it well from the ground."]));
    if (style === "A") bits.push(pick(["Couldn't do the crux. Back next season.", "So close. Fell at the top.", "Worked it for an hour, no luck."]));
    if (stars === 4) bits.push(pick(["Absolute classic.", "One of the best at the Hollow.", "Don't miss this one."]));
    if (stars != null && stars <= 1) bits.push(pick(["Kind of contrived.", "Eh. Sharp and short.", "Skip it."]));
    const flavor = { highball: "Bring every pad you own.", slopey: "Needs cold temps.", crimpy: "Sharp! Tape up.", eliminate: "Fun once you know the rules.",
      traverse: "Pumpy!", dyno: "Big fun dyno.", mantle: "Classic Hollow mantle.", slab: "Trust your feet.", roof: "Steep and burly." };
    const f = p.tagList.find(t => flavor[t]);
    if (f && r() < 0.5) bits.push(flavor[f]);
    return bits.slice(0, 2).join(" ");
  }
  function describe(p, named = true) {
    const phrase = { crimpy: "sharp crimps", slopey: "rounded slopers", pinchy: "a couple of good pinches", juggy: "big jugs", compression: "a squeezy compression sequence",
      dyno: "a big dyno", technical: "precise footwork", powerful: "a powerful crux move", mantle: "a stout mantle", slab: "delicate slab moves",
      overhang: "steep pulling", roof: "a roof with a tricky lip" };
    const ps = p.tagList.map(t => phrase[t]).filter(Boolean).slice(0, 2);
    let s = `A ${p.height_ft}-foot problem on ${p.boulder.name}${p.sit ? ", from a sit start" : ""}.`;
    if (ps.length) s += ` Expect ${ps.join(" and ")}.`;
    if (p.tagList.includes("traverse")) s += " Traverses the face before topping out.";
    if (p.tagList.includes("eliminate")) {
      const rule = p.name.match(/\(([^)]+)\)$/);   // "Comb-Over (Slopers Only)"
      s += rule && named ? ` An eliminate of ${p.name.slice(0, rule.index).trim()}: ${rule[1].toLowerCase()}.` : " Eliminate: the arête and the big jug are off.";
    }
    if (p.tagList.includes("reachy")) s += " Long moves between holds.";
    if (p.tagList.includes("bunchy")) s += " Cramped, compressed positions.";
    if (p.tagList.includes("highball")) s += " Tall and committing at the top.";
    return s;
  }
  function cragHtml() {
    if (UI.cl.problem != null) return cragProblemHtml(UI.cl.problem);
    if (UI.cl.view === "rankings") return rankingsHtml();
    if (UI.cl.view === "mylog") return cragHead() + logbookHtml();
    if (UI.cl.view === "leaders" && leadersShown()) return leadersHtml();
    if (UI.cl.view === "buzz" && !K.all()) return buzzHtml();
    const c = UI.cl, q = c.q.trim().toLowerCase();
    const doneOk = p => !c.done || (c.done === "fa" ? World.isMine(G, p.id) : c.done === "sent" ? !!G.ps[p.id]?.sent : c.done === "tried" ? !!G.ps[p.id] && !G.ps[p.id].sent && G.ps[p.id].att > 0 : !G.ps[p.id]?.sent);
    const gr = p => K.grade(p.id), st = new Map();
    const stats = p => { if (!st.has(p.id)) st.set(p.id, K.stats(p.id)); return st.get(p.id); };
    let list = K.guidebook().map(i => D.problems[i]).filter(p => gr(p) >= c.lo && gr(p) <= c.hi && (!c.sector || p.sector === c.sector) && doneOk(p) &&
      (!q || pname(p.id).toLowerCase().includes(q) || p.boulder.name.toLowerCase().includes(q) || p.tags.includes(q)));
    const sorts = { logs: (a, b) => stats(b).sends - stats(a).sends, stars: (a, b) => (stats(b).stars || 0) - (stats(a).stars || 0), grade: (a, b) => gr(a) - gr(b) || stats(b).sends - stats(a).sends, fit: (a, b) => playerFit(b.id) - playerFit(a.id) };
    list.sort(sorts[c.sort]);
    const total = list.length; list = list.slice(0, 60);
    const gradeOpts = sel => d3.range(0, 14).map(g => `<option value="${g}" ${g === sel ? "selected" : ""}>V${g}</option>`).join("");
    return `${cragHead()}
      <div class="cl-filters">
        <input type="search" id="cl-q" placeholder="Search problems, boulders or styles" value="${esc(c.q)}" aria-label="Search">
        <select id="cl-sector" aria-label="Sector"><option value="">All sectors</option>${D.sectors.filter(s => K.area(s.name) >= 1).map(s => `<option ${s.name === c.sector ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        <select id="cl-sort" aria-label="Sort"><option value="logs" ${c.sort === "logs" ? "selected" : ""}>Most climbed</option><option value="stars" ${c.sort === "stars" ? "selected" : ""}>Highest rated</option><option value="grade" ${c.sort === "grade" ? "selected" : ""}>Grade</option><option value="fit" ${c.sort === "fit" ? "selected" : ""}>Best for you</option></select>
        <select id="cl-lo" aria-label="Lowest grade">${gradeOpts(c.lo)}</select>
        <select id="cl-hi" aria-label="Highest grade">${gradeOpts(c.hi)}</select>
        <select id="cl-done" aria-label="Your ticks">${[["", "All problems"], ["unsent", "Not sent yet"], ["tried", "Tried, not sent"], ["sent", "Sent"], ...(K.all() ? [] : [["fa", "My first ascents"]])].map(([v, l]) => `<option value="${v}" ${c.done === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      <p class="meta">${K.all() ? `${total} problems` : `${total} documented ${total === 1 ? "problem" : "problems"} you know of`}${total > 60 ? ", showing 60" : ""}.${K.all() ? "" : " Problems appear here once someone has climbed them, on boulders you know."}</p>
      <ul class="rowlist">${list.map(p => { const x = stats(p); return `<li><button type="button" class="rowbtn" data-cl="${p.id}"><span><span class="t">${esc(nameGrade(p.id))}${G.ps[p.id]?.sent ? ` <span style="color:var(--plus);font-weight:500">✓</span>` : ""}</span>
        <span class="s">${esc(p.boulder.name)} · ${esc(p.sector)}</span></span>
        <span class="v">${x.stars != null ? `<span class="stars">★</span> ${x.stars.toFixed(1)}` : "no ratings"}<span class="s">${fmt(x.sends)} sends</span></span></button></li>`; }).join("")}</ul>`;
  }
  function cragProblemHtml(i) {
    if (!K.all()) return cragLineHtml(i);
    const p = D.problems[i], st = G.ps[i], logs = D.logs[i];
    const sugg = logs.map(l => l[4]).filter(v => v != null);
    const cons = sugg.length ? `Climbers suggest V${Math.round(d3.mean(sugg))} (${sugg.length} recent ${sugg.length === 1 ? "vote" : "votes"})` : "";
    const mine = G.ticks.map((t, k) => [t, k]).filter(([t]) => t.p === i).reverse().map(([t]) => `<div class="logentry mine"><span class="who">${esc(G.player.name)}<small>${G.player.height} cm</small></span>
      <div class="what">${shortDate(t.date)} · ${t.style}${t.stars ? ` · <span class="stars">${"★".repeat(t.stars)}</span>` : ""}</div></div>`).join("");
    const entries = logs.map((l, li) => {
      const [ci, date, style, stars, s] = l, [name, h] = D.climbers[ci];
      const c = commentFor(l, p, i, li);
      return `<div class="logentry"><span class="who">${esc(name)}<small>${h} cm</small></span>
        <div class="what">${shortDate(date)} · ${{ F: "Flash", S: "Send", A: "Attempt" }[style]}${stars != null ? ` · <span class="stars">${"★".repeat(stars) || "bomb"}</span>` : ""}${s != null ? ` · suggests V${s}` : ""}</div>
        ${c ? `<p>${esc(c)}</p>` : ""}</div>`;
    }).join("");
    const onTodo = G.todo.includes(i);
    return `<button type="button" class="linklike" data-cl-back>← ${CL_BACK[UI.cl.view] || "All problems"}</button>
      <h2 style="margin-top:8px">${esc(p.name)} <span class="grade" style="font-size:24px">V${p.grade}</span></h2>
      <p class="meta">${esc(p.boulder.name)} · ${esc(p.sector)} · ${p.stars != null ? `<span class="stars">★</span> ${p.stars.toFixed(1)} from ${p.ratings} ratings` : "no ratings"} · ${fmt(p.sends)} sends${cons ? ` · ${cons}` : ""}</p>
      ${p.boulder.desc ? `<p class="boulder-desc" style="font-size:14px">${esc(p.boulder.name)}: ${esc(p.boulder.desc)}</p>` : ""}
      <div class="chips" style="margin-bottom:8px">${p.tagList.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      <p class="lede">${esc(describe(p))}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <button type="button" class="btn small primary" data-go-problem="${i}" ${UI.busy || G.day.over ? "disabled" : ""}>Go there</button>
        ${st?.sent ? `<span class="chip good">You've sent this</span>` : `<button type="button" class="btn small" data-todo="${i}">${onTodo ? "On your to-do list" : "Add to to-do list"}</button>`}
      </div>
      <h3>For you</h3>${whyHtml(i).replace('class="why"', 'class="why" style="margin-left:0"')}
      <h3>Recent logs</h3>${mine}${entries || `<p class="meta">No logs yet.</p>`}`;
  }

  // The first ascent, as the oldest entry in a problem's logs (someone else's: yours
  // is already among your own ticks above).
  const FA_NOTES = ["Cleaned it, climbed it, named it.", "Took a couple of sessions to brush the holds. Worth it.", "Couldn't believe nobody had done this. Get on it.",
    "Spotted it from the trail last week. Went better than expected.", "Rock's a bit dirty still, but the moves are great.", "Saw the line, had to try it. Hope you like it.", "First go after cleaning. Lucky!"];
  function faLogHtml(i, e) {
    if (!e || e.by === "you") return "";
    const info = World.whoInfo(D, e.by), name = info.name.charAt(0).toUpperCase() + info.name.slice(1);
    if (e.old) return `<div class="logentry fa"><span class="who">${esc(name)}</span><div class="what">${e.old}s · First ascent (from the kiosk notebook)</div></div>`;
    const note = info.old || info.type === "dog" ? "" : FA_NOTES[(i * 7 + e.date.charCodeAt(9)) % FA_NOTES.length];
    return `<div class="logentry fa"><span class="who">${esc(name)}<small>${info.h ? info.h + " cm" : ""}</small></span>
      <div class="what">${shortDate(e.date)} · First ascent${e.flash ? " · Flash" : ""}</div>${note ? `<p>${esc(note)}</p>` : ""}</div>`;
  }

  // A problem's page under the new rules: what's been documented in this save's
  // Granite Hollow, or, for a line nobody has climbed, just what you can see.
  function cragLineHtml(i) {
    const p = D.problems[i], st = G.ps[i], state = K.line(i), e = K.est(i);
    const back = `<button type="button" class="linklike" data-cl-back>← ${CL_BACK[UI.cl.view] || "All problems"}</button>`;
    if (state === "hidden") return `${back}<p class="lede" style="margin-top:12px">You don't know about this one yet.</p>`;
    const x = K.stats(i), legend = K.legend(i), onTodo = G.todo.includes(i), go = K.canGo({ sector: p.sector, boulder: p.b });
    const mine = G.ticks.filter(t => t.p === i).reverse().map(t => `<div class="logentry mine"><span class="who">${esc(G.player.name)}<small>${G.player.height} cm</small></span>
      <div class="what">${shortDate(t.date)} · ${t.style}${World.isMine(G, i) && G.world.est[i].date === t.date && t.style !== "Repeat" ? " · first ascent" : ""}${t.stars ? ` · <span class="stars">${"★".repeat(t.stars)}</span>` : ""}</div></div>`).join("");
    const entries = state === "est" && e ? e.logs.map((l, li) => {
      const [who, date, style, stars, sg] = l, info = World.whoInfo(D, who), c = commentFor(l, p, i, li);
      return `<div class="logentry"><span class="who">${esc(info.name)}<small>${info.h ? info.h + " cm" : ""}</small></span>
        <div class="what">${shortDate(date)} · ${{ F: "Flash", S: "Send" }[style] || "Send"}${stars != null ? ` · <span class="stars">${"★".repeat(stars) || "bomb"}</span>` : ""}${sg != null ? ` · suggests V${sg}` : ""}</div>
        ${c ? `<p>${esc(c)}</p>` : ""}</div>`;
    }).join("") + faLogHtml(i, e) : "";
    const head = state === "est"
      ? `<h2 style="margin-top:8px">${esc(pname(i))} <span class="grade" style="font-size:24px">${vg(i)}</span></h2>
        <p class="meta">${esc(p.boulder.name)} · ${esc(p.sector)} · ${x.stars != null ? `<span class="stars">★</span> ${x.stars.toFixed(1)} from ${x.ratings} ${x.ratings === 1 ? "rating" : "ratings"}` : "no ratings yet"} · ${fmt(x.sends)} ${x.sends === 1 ? "send" : "sends"}${e && e.classic ? " · a Granite Hollow classic" : ""}</p>
        <p class="meta">First ascent: ${World.isMine(G, i) ? (G.player.name.toLowerCase() === "you" ? "you" : `${esc(G.player.name)} (you)`) : esc(K.faText(i))}${e && !e.old ? `, ${shortDate(e.date)}` : ""}${e && e.flash ? " (flashed)" : ""}${World.isMine(G, i) ? ` · <button type="button" class="linklike" data-rename="${i}">${e.name ? "Rename" : "Name it"}</button>` : ""}</p>`
      : `<h2 style="margin-top:8px">${esc(pname(i))}</h2>
        <p class="meta">${esc(p.boulder.name)} · ${esc(p.sector)} · nobody has documented an ascent, so it has no name or grade yet. Climb it first and you get to name it.</p>`;
    return `${back}${head}
      ${legend ? `<p class="legend">Local legend: ${esc(legend)}</p>` : ""}
      ${p.boulder.desc ? `<p class="boulder-desc" style="font-size:14px">${esc(p.boulder.name)}: ${esc(p.boulder.desc)}</p>` : ""}
      <div class="chips" style="margin-bottom:8px">${p.tagList.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      <p class="lede">${esc(describe(p, false))}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        ${go ? `<button type="button" class="btn small primary" data-go-problem="${i}" ${UI.busy || G.day.over ? "disabled" : ""}>Go there</button>` : ""}
        ${st?.sent ? `<span class="chip good">You've sent this</span>` : `<button type="button" class="btn small" data-todo="${i}">${onTodo ? "On your to-do list" : "Add to to-do list"}</button>`}
      </div>
      <h3>For you</h3>${whyHtml(i).replace('class="why"', 'class="why" style="margin-left:0"')}
      ${state === "est" ? `<h3>Recent logs</h3>${mine}${entries || `<p class="meta">No logs yet.</p>`}` : ""}`;
  }

  // ---- Journal ----
  // ---- Journal: projects log
  // Three views: lines you've tried and not sent (with your highpoints), lines
  // you know of but haven't tried yet (spotted, told about, or from the notebook;
  // new rules only), and projects you've sent.
  function projectsHtml() {
    const all = Object.entries(G.ps).map(([i, st]) => [+i, st]).filter(([, st]) => st.att > 0);
    const known = K.identified().filter(i => !G.ps[i] || (!G.ps[i].sent && !(G.ps[i].att > 0))).map(i => [i, null]);
    const tried = all.filter(([, st]) => !st.sent), sentP = all.filter(([, st]) => st.sent && st.att >= 2);
    const v = UI.pj.view || (tried.length || !known.length ? "tried" : "known");
    if (v === "known") return knownHtml(known, tried.length, sentP.length);
    let list = v === "sent" ? sentP : tried;
    const lastDate = st => (st.log && st.log.length ? String(st.log[st.log.length - 1][0]) : st.sentOn || "");
    const sorts = {
      recent: (a, b) => (lastDate(b[1]) > lastDate(a[1]) ? 1 : lastDate(b[1]) < lastDate(a[1]) ? -1 : 0) || b[1].att - a[1].att,
      close: (a, b) => (v === "sent" ? b[1].att - a[1].att : chanceFor(b[0]) - chanceFor(a[0])),
      grade: (a, b) => (K.grade(b[0]) ?? -1) - (K.grade(a[0]) ?? -1) || b[1].best - a[1].best,
      tries: (a, b) => b[1].att - a[1].att,
    };
    list.sort(sorts[UI.pj.sort] || sorts.recent);
    const shown = list.slice(0, 30);
    const card = ([i, st]) => {
      const p = D.problems[i], best = Math.round(Number(st.best) * p.moves) || 0, log = Array.isArray(st.log) ? st.log : [];
      const sessions = log.length, open = !st.sent;
      const fl = open ? Mech.feel(chanceFor(i)) : null;
      const moves = moveStrip(i);
      const hist = sessions ? `<div class="pj-hist" aria-label="Highpoint by session">${log.slice(-12).map(e => {
        const h = Math.max(0.06, Math.min(1, Number(e[2]) || 0)), sent = e[3] === 1;
        return `<span title="${esc(shortDate(String(e[0])))}: ${Number(e[1]) || 0} ${Number(e[1]) === 1 ? "try" : "tries"}, ${sent ? "sent!" : `move ${Math.round(h * p.moves)} of ${p.moves}`}"><i class="${sent ? "sent" : ""}" style="height:${(h * 100).toFixed(0)}%"></i></span>`; }).join("")}</div>` : "";
      const summary = open
        ? `${st.att} ${st.att === 1 ? "try" : "tries"}${sessions ? ` over ${sessions} ${sessions === 1 ? "session" : "sessions"}` : ""}${lastDate(st) ? ` · last tried ${shortDate(lastDate(st))}` : ""}`
        : `Sent ${st.sentOn ? shortDate(st.sentOn) : ""} after ${st.att} tries${sessions ? ` over ${sessions} ${sessions === 1 ? "session" : "sessions"}` : ""}`;
      return `<li class="pj">
        <div class="pj-top"><button type="button" class="linklike pj-name" data-cl="${i}">${gradeSpan(i)} ${esc(pname(i))}</button>
          ${open ? `<button type="button" class="btn small" data-go-problem="${i}">Go</button>` : `<span style="color:var(--plus);font-weight:600">✓</span>`}</div>
        <div class="meta" style="margin:0">${esc(p.boulder.name)} · ${esc(p.sector)} · ${summary}</div>
        <div class="pj-row"><span class="pj-lbl">${open ? `Highpoint: move ${best} of ${p.moves}` : "Topped out"}</span><div class="pj-moves">${moves}</div></div>
        ${open ? `<div class="pj-row"><span class="pj-lbl">Beta: ${Math.min(100, Math.round((Number(st.beta) || 0) / Mech.BETA_MAX * 100))}% worked out${st.alt ? " · a better way found" : ""}</span><span class="pj-lbl">Today: <b>${fl.label}</b></span></div>` : ""}
        ${hist}</li>`;
    };
    const opts = [["recent", "Recently tried"], ["close", v === "sent" ? "Most tries" : "Closest to sending"], ["grade", "Hardest"], ["tries", "Most tries"]].filter((o, k) => !(v === "sent" && k === 3));
    return `<h3>Projects</h3>
      <div class="cl-filters" style="margin-bottom:6px">${pjViews(v, tried.length, known.length, sentP.length)}
        <select id="pj-sort" aria-label="Sort projects">${opts.map(([k, l]) => `<option value="${k}" ${UI.pj.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      ${shown.length ? `<ul class="pj-list">${shown.map(card).join("")}</ul>${list.length > 30 ? `<p class="meta">Showing 30 of ${list.length}.</p>` : ""}`
        : `<p class="meta">${v === "tried" ? "Anything you try and don't send shows up here, with your highpoint and how each session went." : "Projects you send after more than one try show up here."}</p>`}
      <p class="meta">Bars show your highpoint each session; green means you sent it that day.</p>`;
  }
  function pjViews(v, nTried, nKnown, nSent) {
    return `<div class="cl-views pj-views" role="group" aria-label="Projects">
      <button type="button" data-pj-view="tried" aria-pressed="${v === "tried"}">Attempted (${nTried})</button>
      ${K.all() ? "" : `<button type="button" data-pj-view="known" aria-pressed="${v === "known"}">Open (${nKnown})</button>`}
      <button type="button" data-pj-view="sent" aria-pressed="${v === "sent"}">Sent (${nSent})</button></div>`;
  }
  // Lines you know of and haven't tried: unclimbed ones are first ascents waiting.
  function knownHtml(known, nTried, nSent) {
    const how = l => ({ spot: `you spotted it ${shortDate(l.date)}`, told: l.from ? `${World.whoName(D, l.from)} told you about it` : "someone told you about it",
      kiosk: "on the old notebook page", migrated: "from before the reopening", tried: "you've tried it", dev: "development mode" }[l.how] || "");
    const sorts = {
      recent: (a, b) => (G.know.lines[b].date > G.know.lines[a].date ? 1 : G.know.lines[b].date < G.know.lines[a].date ? -1 : 0) || b - a,
      close: (a, b) => chanceFor(b) - chanceFor(a),
      fa: (a, b) => (K.line(a) === "open" ? 0 : 1) - (K.line(b) === "open" ? 0 : 1) || chanceFor(b) - chanceFor(a),
    };
    const ids = known.map(([i]) => i).sort(sorts[UI.pj.sort] || sorts.recent), shown = ids.slice(0, 30);
    const card = i => {
      const p = D.problems[i], l = G.know.lines[i] || {}, fl = Mech.feel(chanceFor(i)), h = how(l);
      const fa = K.line(i) === "open" ? "Unclimbed: the first ascent is up for grabs" : `First ascent: ${K.faText(i)}`;
      return `<li class="pj"><div class="pj-top"><button type="button" class="linklike pj-name" data-cl="${i}">${gradeSpan(i)} ${esc(pname(i))}</button>
          <button type="button" class="btn small" data-go-problem="${i}">Go</button></div>
        <div class="meta" style="margin:0">${esc(p.boulder.name)} · ${esc(p.sector)}${h ? ` · ${esc(h.charAt(0).toUpperCase() + h.slice(1))}` : ""}</div>
        <div class="pj-row"><span class="pj-lbl">${esc(fa)}</span><span class="pj-lbl">Today: <b>${fl.label}</b></span></div></li>`;
    };
    const opts = [["recent", "Recently found"], ["close", "Closest to sending"], ["fa", "Unclimbed first"]];
    return `<h3>Projects</h3>
      <div class="cl-filters" style="margin-bottom:6px">${pjViews("known", nTried, known.length, nSent)}
        <select id="pj-sort" aria-label="Sort projects">${opts.map(([k, l]) => `<option value="${k}" ${UI.pj.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${shown.length ? `<ul class="pj-list">${shown.map(card).join("")}</ul>${ids.length > 30 ? `<p class="meta">Showing 30 of ${ids.length}.</p>` : ""}`
        : `<p class="meta">Lines you spot on boulders, or hear about from other climbers, wait here until you try them.</p>`}`;
  }
  function journalHtml() {
    const tips = [...G.tips].reverse();
    const todo = G.todo.filter(i => !G.ps[i]?.sent);
    return `<h2>Journal</h2>
      ${projectsHtml()}
      <h3>Tips from locals</h3>
      ${tips.length ? `<ul class="rowlist">${tips.map(t => { const p = D.problems[t.p];
        return `<li><button type="button" class="rowbtn" data-go-problem="${t.p}"><span><span class="t">${esc(nameGrade(t.p))} ${t.done ? `<span style="color:var(--plus);font-weight:500">✓ sent</span>` : ""}</span>
          <span class="s">From ${esc(whoOf(t.from))}: ${esc(t.why.slice(0, 2).join(", "))} · ${esc(p.sector)}</span></span><span class="v">${t.done ? "" : "Go"}</span></button></li>`; }).join("")}</ul>`
        : `<p class="meta">Climbers you meet on the trail will tell you about problems that suit you. Sending one earns bonus XP.</p>`}
      <h3>To-do list</h3>
      ${todo.length ? `<ul class="rowlist">${todo.map(i => { const p = D.problems[i];
        return `<li><button type="button" class="rowbtn" data-go-problem="${i}"><span><span class="t">${esc(nameGrade(i))}</span><span class="s">${esc(p.boulder.name)} · ${esc(p.sector)}</span></span><span class="v">Go</span></button></li>`; }).join("")}</ul>`
        : `<p class="meta">Add problems from CragLog.</p>`}
      <h3>Achievements</h3>
      <div class="ach">${ACH.filter(a => !a[4] || v2()).map(([id, name, desc]) => `<div class="${G.ach[id] ? "" : "locked"}"><b>${esc(name)}</b><span>${esc(desc)}${G.ach[id] ? ` · ${shortDate(G.ach[id])}` : ""}</span></div>`).join("")}</div>
      <h3>Recent</h3>
      <ul class="feed">${G.feed.slice(0, 30).map(f => `<li><time>${shortDate(f.date)}</time>${esc(f.text)}</li>`).join("")}</ul>`;
  }

  function bindPanel(el) {
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => { n.onclick = () => fn(n); });
    on("[data-try]", n => openClimb(+n.dataset.try));
    on("[data-climb]", n => tryProblem(+n.dataset.climb, { brush: true }));
    on("[data-expand]", n => { const i = +n.dataset.expand; UI.expanded.has(i) ? UI.expanded.delete(i) : UI.expanded.add(i); renderPanel(); });
    on("[data-go-sector]", n => travel({ sector: n.dataset.goSector, boulder: null }));
    on("[data-go-boulder]", n => { const b = D.boulders[+n.dataset.goBoulder]; travel({ sector: b.sector, boulder: b.id }); });
    on("[data-find]", n => { if (!UI.busy && M.findPerson) M.findPerson(n.dataset.find); });
    on("[data-trail]", () => safely("Trail Day", helpTrail));
    on("[data-trip]", b => answerTrip(b.dataset.trip === "yes"));
    on("[data-go-problem]", n => {
      const p = D.problems[+n.dataset.goProblem];
      if (!K.canGo({ sector: p.sector, boulder: p.b })) { toast("You don't know the way", "Nobody has told you where it is yet.", "info"); return; }
      UI.expanded.add(p.id); travel({ sector: p.sector, boulder: p.b });
    });
    on("[data-inspect]", n => inspectBoulder(+n.dataset.inspect));
    on("[data-kiosk]", () => openModal(() => showKiosk()));
    on("[data-rename]", n => openModal(() => nameDialog(+n.dataset.rename)));
    on("[data-old]", exportOldCopy);
    on("[data-lb-bucket]", n => { UI.lbBucket = +n.dataset.lbBucket; UI.lbGrade = null; renderPanel(); });
    on("[data-cl]", n => { UI.cl.problem = +n.dataset.cl; UI.tab = "craglog"; renderTabs(); renderPanel(); $("#tabbody").scrollTop = 0; });
    on("[data-cl-back]", () => { UI.cl.problem = null; renderPanel(); });
    on("[data-todo]", n => { const i = +n.dataset.todo; if (!G.todo.includes(i)) G.todo.push(i); save(); renderAll(); });
    on("[data-accept]", acceptTip);
    on("[data-dir]", askWay);
    on("[data-reveal]", hearLine);
    on("[data-pet]", petDog);
    on("[data-chat]", sitChat);
    on("[data-together]", climbTogether);
    on("[data-dismiss]", () => closeTalk());
    on("[data-rate]", n => { const t = G.ticks[G.day.last.tick]; t.stars = +n.dataset.rate; save(); renderPanel(); });
    on("[data-summary]", showSummary);
    on("[data-export]", exportSave);
    on("[data-pj-view]", n => { UI.pj.view = n.dataset.pjView; UI.pj.sort = "recent"; renderPanel(); });
    { const ps = el.querySelector("#pj-sort"); if (ps) ps.onchange = e => { UI.pj.sort = e.target.value; renderPanel(); }; }
    on("[data-cl-view]", n => { UI.cl.view = n.dataset.clView; UI.cl.problem = null; renderPanel(); });
    on("[data-rk-open]", n => { UI.rk.open = UI.rk.open === n.dataset.rkOpen ? null : n.dataset.rkOpen; renderPanel(); });
    on("[data-rk-more]", () => { UI.rk.n += 25; renderPanel(); });
    for (const [id, key] of [["#rk-window", "window"], ["#rk-height", "height"], ["#rk-by", "by"]]) {
      const sel = el.querySelector(id); if (sel) sel.onchange = e => { UI.rk[key] = e.target.value; UI.rk.open = null; renderPanel(); };
    }
    on("[data-lb-grade]", n => { UI.lbGrade = +n.dataset.lbGrade; renderPanel(); });
    on("[data-lb-join]", joinBoard);
    on("[data-lb-leave]", leaveBoard);
    on("[data-import]", pickSaveFile);
    on("[data-reset]", () => { UI.confirmReset = true; renderPanel(); });
    on("[data-reset-no]", () => { UI.confirmReset = false; renderPanel(); });
    on("[data-reset-yes]", () => { try { localStorage.removeItem(SLOT); } catch (e) { } G = null; UI.confirmReset = false; showCreator(); });
    const q = el.querySelector("#cl-q");
    if (q) {
      q.oninput = () => { UI.cl.q = q.value; const pos = q.selectionStart; renderPanel(); const nq = $("#cl-q"); nq.focus(); nq.setSelectionRange(pos, pos); };
      for (const [id, key, num] of [["#cl-sector", "sector", false], ["#cl-sort", "sort", false], ["#cl-lo", "lo", true], ["#cl-hi", "hi", true], ["#cl-done", "done", false]]) {
        el.querySelector(id).onchange = e => { UI.cl[key] = num ? +e.target.value : e.target.value; renderPanel(); };
      }
    }
  }

  // ============================================================ modals/toasts
  // One modal at a time. openModal() waits its turn behind one that's open; when
  // the last closes, a day summary that was held back opens.
  const modalQueue = [];
  const modalOpen = () => !!$("#modal-root").children.length;
  const openModal = fn => (modalOpen() ? modalQueue.push(fn) : fn());
  function nextModal() {
    if (modalOpen()) return;
    const fn = modalQueue.shift();
    if (fn) { safely("a dialog", fn); return; }
    if (UI.summaryPending && !UI.levelPending && G && G.day && G.day.over) { UI.summaryPending = false; showSummary(); }
  }
  function modal(html, bind) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const close = () => { root.innerHTML = ""; nextModal(); };
    bind(root, close);
    const first = root.querySelector(".acts .btn.primary") || root.querySelector("button"); if (first) first.focus();
  }
  function toast(title, text, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind === "find" ? " find" : kind === "sweet" ? " sweet" : ""); if (kind === "info") el.style.borderLeftColor = "var(--energy)";
    el.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  let bannerTimer = null;
  function showBanner(style, i, xp, what = null) {
    const b = $("#banner");
    b.innerHTML = `<div class="big ${style === "Flash" || style === "FA" ? "flash" : ""}">${style === "Flash" ? "FLASH!" : style === "Repeat" ? "AGAIN" : style === "FA" ? "FIRST ASCENT!" : "SENT!"}</div>
      <div class="what">${esc(what || `${pname(i)}${vg(i) ? ` · ${vg(i)}` : ""}`)}</div><div class="xp">+${fmt(xp)} XP</div>`;
    b.hidden = false; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2200);
  }
  function showLevelUp(level) {
    // Stronger eyes: boulders you've looked over may hold lines you couldn't read then.
    const again = K.lookAgain();
    const eyes = again.length ? `<p class="lede">You might see new lines on ${again.length === 1 ? esc(K.boulderName(again[0])) : `${again.length} boulders you've already looked over`}. Go and have another look.</p>` : "";
    modal(`<span class="label-sm">Level up</span><div class="big-level">V${level}</div>
      <h2>${esc(LEVEL_LINES[level] || "Stronger every season.")}</h2>
      <p class="lede">V${level} problems will now feel like projects instead of impossibilities. Keep sending near your limit to reach V${level + 1}.</p>${eyes}
      <div class="acts"><button type="button" class="btn primary" data-close>Keep climbing</button></div>`,
      (root, close) => { root.querySelector("[data-close]").onclick = () => { UI.levelPending = false; close(); }; });
  }
  function showSummary() {
    const d = G.day, newSends = d.sends.filter(s => s.style !== "Repeat"), faToday = newSends.filter(s => s.fa).length;
    const levelUps = levelNow().level - d.levelBefore;
    const rested = d.attempts === 0 ? 1 : 0;           // a day without climbing (rained out) counts as rest
    const preview = n => Mech.startOfDay(G.player, n + rested);
    const gains = Object.entries(d.gains).filter(([, g]) => g >= 0.02).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const fc = forecast(); save();
    const wkday = s => toDate(s).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
    const tr = v2() && G.tripOffer && G.tripOffer.yes ? G.tripOffer : null, tt = tr && Trips.DESTS[tr.key];
    const plans = fc.map((f, n) => {
      // A trip you've said yes to: the day you leave is the trip, and the days after it aren't yours to plan.
      if (tt && f.date > tr.leave) return "";
      if (tt && f.date === tr.leave) return `<button type="button" class="plan trip" data-next="${n}"><span class="ev">✈ ${esc(tt.name)}</span>
        <span class="when">Off on the trip</span><span class="date">${esc(wkday(f.date))}</span><span class="sky">Two weeks with ${esc(firstName(tr.who))}</span></button>`;
      const b = preview(n), ra = Mech.rainStart(f);
      const chance = f.pop != null ? Mech.rainChance(f) : ra === 0 ? `${f.precip || "Rain"} all day` : ra != null && ra < f.dusk ? `${f.precip || "Rain"} from ${clock(ra)}` : "";
      const rainLine = chance ? `<span class="rain">${esc(chance.charAt(0).toUpperCase() + chance.slice(1))}</span>` : `<span class="dry">Dry</span>`;
      const ev = v2() ? World.eventOn(f.date) : null;
      return `<button type="button" class="plan${ev ? " event" : ""}" data-next="${n}">${ev ? `<span class="ev">★ ${esc(ev.name)}</span>` : ""}
        <span class="when">${n === 0 ? "Climb tomorrow" : `Rest ${n} ${n === 1 ? "day" : "days"}`}</span>
        <span class="date">${esc(wkday(f.date))}</span>
        <span class="cl ${esc(f.label.toLowerCase())}">${esc(f.label)}</span>
        <span class="sky">${esc(f.sky)}, ${f.temp}°F</span>${rainLine}
        <span class="body">${b.energy}% energy<br>${b.skin.toFixed(0)}% skin</span></button>`;
    }).join("");
    modal(`<span class="label-sm">Day ${d.no} · ${prettyDate(G.date)}</span><h2>${d.rainedOut ? "Rained out" : newSends.length ? `${newSends.length} new ${newSends.length === 1 ? "send" : "sends"}${faToday ? `, ${faToday} first ${faToday === 1 ? "ascent" : "ascents"}` : ""}` : d.attempts ? "No sends today" : "A quiet day"}</h2>
      <p class="lede">${esc(d.reason || "")} ${d.attempts} attempts, ${d.highpoints} new highpoints, +${fmt(d.xp)} XP${levelUps > 0 ? `, and you leveled up to V${levelNow().level}` : ""}.</p>
      ${newSends.length ? `<ul class="rowlist">${newSends.map(s => `<li><div class="rowbtn" style="cursor:default"><span><span class="t">${esc(nameGrade(s.p))}</span><span class="s">${s.fa ? `First ascent${s.style === "Flash" ? ", flashed" : ""}` : s.style}</span></span><span class="v" style="color:var(--gold)">+${fmt(s.xp)} XP</span></div></li>`).join("")}</ul>` : ""}
      ${gains.length ? `<h3 style="font-family:var(--display);letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:var(--ink-2)">Getting better at</h3><div class="chips">${gains.map(([t, g]) => `<span class="chip good">${STYLE[t][0]} +${g.toFixed(2)}</span>`).join("")}</div>` : ""}
      ${d.ach.length ? `<p class="lede" style="margin-top:10px">Achievements: <b>${d.ach.map(esc).join(", ")}</b></p>` : ""}
      ${d.no - (G.backup ? G.backup.dayNo : 0) >= 10 ? `<p class="meta" style="margin-top:12px">It's been ${G.backup ? `${d.no - G.backup.dayNo} days since your last save file` : "a while and you haven't downloaded a save file yet"}. <button type="button" class="linklike" data-export>Download one now</button></p>` : ""}
      <p class="lede" style="margin-top:12px">Skin ${G.player.skin.toFixed(0)}%. Here's the forecast. When do you climb next?</p>
      <div class="plan-grid">${plans}</div>${(() => { const n = v2() && World.nextEvent(addDays(G.date, FORECAST_DAYS + 1), 10); return n ? `<p class="meta event-soon">★ Coming up: ${esc(n.name)}, ${esc(longDay(n.date))}.</p>` : ""; })()}
      <p class="meta" style="margin-top:8px">Nobody climbs wet granite. Morning rain soaks the rock for the whole day; afternoon rain ends the climbing when it starts. Either way you can stay and explore, and a day without climbing counts as rest.</p>`,
      (root, close) => {
        const ex = root.querySelector("[data-export]");
        if (ex) ex.onclick = () => exportSave().then(() => { if (G.backup && G.backup.dayNo === G.dayNo) ex.parentElement.textContent = "Save file downloaded."; });
        root.querySelectorAll("[data-next]").forEach(b => {
          b.onclick = () => { const n = +b.dataset.next; close(); startDay(1 + n, n + rested); UI.expanded.clear(); save(); renderAll(); M.update(); if (G.day.over) showSummary(); };
        });
      });
  }

  // ======================================================= first ascents
  // Name your first ascent. The curated name fits the boulder's theme, so it's
  // the suggestion; closing without choosing keeps it, and you can rename your
  // own problems later from their CragLog page.
  function nameDialog(i, opts = {}) {
    if (!World.isMine(G, i)) return;
    const p = D.problems[i], e = G.world.est[i], curated = p.name, now = pname(i);
    const what = opts.was ? `the ${opts.was.charAt(0).toLowerCase() + opts.was.slice(1)}` : "this line";
    modal(`<span class="label-sm">${opts.first ? `First ascent · ${esc(shortDate(e.date))}` : "Your first ascent"}</span>
      <h2>${opts.first ? "Name your problem" : "Rename your problem"}</h2>
      ${opts.first ? `<p class="lede">Nobody had documented an ascent of ${esc(what)} on ${esc(p.boulder.name)}. Now it's in the guidebook: <b>V${e.grade}</b>, first ascent by ${esc(G.player.name)}${e.flash ? ", flashed" : ""}.</p>
      <p class="meta">Whoever climbs a line first gets to name it. Here's a name that suits the boulder, or write your own.</p>`
        : `<p class="meta">${esc(p.boulder.name)} · ${esc(p.sector)} · V${e.grade}. Only your own first ascents can be renamed.</p>`}
      <div class="field fa-field"><label for="fa-name">Name</label><input type="text" id="fa-name" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(now)}"></div>
      <p class="meta fa-note" id="fa-note" aria-live="polite"></p>
      <div class="acts"><button type="button" class="btn primary" data-name>${opts.first ? "Name it" : "Save the name"}</button>
        ${opts.first ? `<button type="button" class="btn" data-keep>Keep “${esc(curated)}”</button>` : `<button type="button" class="btn" data-keep>Cancel</button>`}
        ${!opts.first && e.name ? `<button type="button" class="btn" data-curated>Use “${esc(curated)}”</button>` : ""}</div>`,
      (root, close) => {
        const inp = root.querySelector("#fa-name"), noteEl = root.querySelector("#fa-note"), ok = root.querySelector("[data-name]");
        const check = () => {
          const t = World.cleanName(inp.value), dup = t && K.sameName(i, t);
          ok.disabled = !t;
          noteEl.textContent = !t ? "A name needs at least one letter or number."
            : /[<>]/.test(inp.value) ? "< and > aren't allowed, so they'll be left out."
            : dup ? `There's already a ${t} at ${dup}. That's allowed: real crags have plenty of duplicates.` : "";
        };
        const finish = name => {
          const before = pname(i), shown = World.nameFa(D, G, i, name);
          if (shown != null && shown !== before) {
            if (!opts.first) note(`Renamed ${before} to ${shown}.`);
            if (UI.faNote && G.feed.includes(UI.faNote) && opts.first) UI.faNote.text = `First ascent: ${shown} (V${e.grade}).`;
          }
          if (opts.first && G.day.last && G.day.last.p === i && G.day.last.kind === "send") G.day.last.title = `First ascent: ${titleOf(i)}`;
          UI.faNote = null;
          save(); renderAll(); close();
        };
        inp.oninput = check;
        inp.onkeydown = ev => { if (ev.key === "Enter" && !ok.disabled) { ev.preventDefault(); finish(inp.value); } else if (ev.key === "Escape") { ev.preventDefault(); finish(opts.first ? curated : now); } };
        ok.onclick = () => finish(inp.value);
        root.querySelector("[data-keep]").onclick = () => finish(opts.first ? curated : now);
        const cu = root.querySelector("[data-curated]"); if (cu) cu.onclick = () => finish(curated);
        check();
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
      });
  }

  // The trailhead kiosk: the trail map, and the one surviving page of the old
  // climbers' notebook. It greets a new climber; afterwards you read it by clicking
  // it on the map or standing by it (after Phase 4), or from The Tailgate's Here tab.
  // It also has what Gus has pinned up: a poster for the next event (from a fortnight
  // before; drawn on the kiosk too), the last comp's results or a thank-you for a
  // week after an event, and a couple of notices that change with the season and week.
  const KIOSK_POSTER = {
    comp: "Every problem in the park counts, repeats too. Your five best sends score. Sign in with Gus at the kiosk from 9. Results by the lot at dusk.",
    spring: "Every problem in the park counts, repeats too. Your five best sends score. Not an April Fool. Results by the lot at dusk.",
    bonfire: "The longest night of the year. Climb while the light lasts, then fire, cocoa and stories at The Tailgate from dusk. Bring a mug.",
    midsummer: "The longest day of the year. Climb till the light goes, then headlamps and sandwiches at The Tailgate.",
    cleanup: "Grabbers and bin bags provided! The snowmelt's turned up a whole winter's litter. Whoever bags the most by dusk wins the Golden Grabber. Meet Gus at the kiosk from 9.",
    trail: "Volunteers wanted! Loppers, rakes and gloves provided. Something old is coming back. Meet Gus at the kiosk from 8.",
  };
  const KIOSK_SEASON = [
    [[12, 1, 2], "Cold rock, good friction. Cold fingers, less so. The ranger's truck has a thermos if you ask nicely."],
    [[3, 4], "Mud season. Please keep to the trails while the ground's soft."],
    [[5, 6, 7, 8], "Ticks are out. Check yourself after walking through the long grass."],
    [[9, 10, 11], "Hunting season in the woods next door. Wear something bright off the trails."],
  ];
  const KIOSK_NOTES = [
    "Pack out what you pack in. That includes tape.",
    "Lost: one left climbing shoe. Found: one left climbing shoe. Different shoes. Both in the box under the bench.",
    "The lot gate is locked at dark. You know who you are.",
    "Please brush off your chalk tick marks when you're done.",
    "Chalk is fine. Chalk handprints on the welcome sign are not.",
    "Spotted the barred owl? Please give her some room.",
  ];
  const kioskLm = () => (M && M.paint && M.paint.scene.landmarks.find(l => l.kind === "kiosk")) || null;
  const kioskSpot = () => { const k = kioskLm(); return k && [k.x + 3.2, k.y - 1.2]; };   // beside it, so you can see the poster
  const nearKiosk = pos => { const k = kioskLm(); return !!(k && pos && Math.hypot(pos[0] - k.x, pos[1] - (k.y - 1.5)) < 6); };
  // What's pinned up today: the next event (within a fortnight, or today's), and the one just gone.
  function kioskBoard() {
    if (!v2()) return { next: null, past: null };
    const next = World.nextEvent(G.date, 14);
    let past = null;
    for (let k = 1; k <= 7 && !past; k++) { const e = World.eventOn(addDays(G.date, -k)); if (e) past = e; }
    return { next, past };
  }
  function kioskTipHtml() {
    const { next } = kioskBoard();
    return `<strong>The trailhead kiosk</strong>${next ? `<div class="sub">A poster: ${esc(next.name)}, ${next.in === 0 ? "today" : esc(longDay(next.date))}</div>` : `<div class="sub">The trail map, the old notebook page and Gus's notices</div>`}`;
  }
  function kioskPosterHtml(n) {
    const when = n.in === 0 ? "Today!" : n.in === 1 ? `Tomorrow, ${longDay(n.date)}` : longDay(n.date);
    const doodle = n.in === 1 ? `<p class="kp-doodle">Somebody has drawn Pickles in the corner.</p>` : "";
    return `<figure class="kiosk-poster-card"><div class="kp-band">${esc(n.name.replace(/^The /, ""))}</div><p class="kp-when">${esc(when)}</p><p>${esc(KIOSK_POSTER[n.key] || "")}</p>${doodle}</figure>`;
  }
  function kioskPastHtml(e) {
    if (e.cleanup) {
      const r = (G.events || {})[e.date];
      if (!r || !r.top) return `<div class="kiosk-note"><p>${esc("Thank you, litter-pickers! Forty-one bin bags. The gnome is in the box under the bench if it's yours.")}</p><span class="kn-sign">Gus</span></div>`;
      const rows = r.top.map(([w, n], i) => `<li class="${w === "you" ? "me" : ""}"><span>${i + 1}. ${esc(racerName(w))}</span><b>${n}</b></li>`).join("")
        + (r.place > 3 && r.score ? `<li class="me"><span>${r.place}. You</span><b>${r.score}</b></li>` : "");
      return `<div class="kiosk-note results"><span class="kn-head">The Clean-Up: the weigh-in</span><ol class="comp-board">${rows}</ol><span class="kn-sign">Gus</span></div>`;
    }
    if (e.comp) {
      const f = K.compResults(e.date); if (f.length < 3) return "";
      const nm = x => (x.who === "you" ? "You" : x.who.startsWith("n:") ? callName(x.who) : x.name);
      const at = f.findIndex(x => x.who === "you");
      const rows = f.slice(0, 5).map((x, i) => `<li class="${x.who === "you" ? "me" : ""}"><span>${i + 1}. ${esc(nm(x))}</span><b>${x.score.toLocaleString("en-US")}</b></li>`).join("")
        + (at >= 5 ? `<li class="me"><span>${at + 1}. You</span><b>${f[at].score.toLocaleString("en-US")}</b></li>` : "");
      return `<div class="kiosk-note results"><span class="kn-head">${esc(e.name.replace(/^The /, ""))}: results</span><ol class="comp-board">${rows}</ol><span class="kn-sign">Gus</span></div>`;
    }
    const t = e.key === "trail" ? World.oldTrailOn(e.date) : null;
    const text = e.key === "bonfire" ? "Thank you to everyone who came out to the bonfire. Somebody left a mitten. It's in the box under the bench."
      : e.key === "midsummer" ? "What an evening. Thanks for coming out to the dusk session, and for taking your headlamps home."
      : t ? `${t.name.replace(/^the /, "The ")} is open again, for the first time since before the closure. Thank you, trail crew!`
      : "Thank you, trail crew! The trails have never looked better.";
    return `<div class="kiosk-note"><p>${esc(text)}</p><span class="kn-sign">Gus</span></div>`;
  }
  function showKiosk(first = false) {
    const page = World.notebook(D).map(n => {
      const p = D.problems[n.p], who = n.by === "n:anon" ? "?" : World.whoName(D, n.by).replace(/^the /, "");
      return `<li><span class="nb-name">${esc(p.name)}</span><span class="nb-what">${esc(p.boulder.name.replace(/^The /, ""))} · V${p.grade} · ${esc(who)}${n.by === "n:anon" ? "" : ` '${String(n.year).slice(2)}`}</span></li>`;
    }).join("");
    const notebook = `<figure class="notebook" aria-label="A page from the old kiosk notebook"><div class="nb-head"><span>Boulder name</span><span>Location / grade / FA</span></div><ol>${page}</ol></figure>`;
    const acts = `<div class="acts"><button type="button" class="btn primary" data-close>Go climbing</button><button type="button" class="btn" data-paper>Open the trail map</button></div>`;
    const bind = (root, close) => {
      root.querySelector("[data-close]").onclick = close;
      root.querySelector("[data-paper]").onclick = () => { close(); safely("trail map", M.togglePaper); };
    };
    if (first) {
      modal(`<span class="label-sm">The trailhead kiosk</span><h2>Welcome to Granite Hollow</h2>
        <p class="lede">Climbing reopened here on September 1, after nearly forty years. The kiosk has the park's trail map, the new climbing rules, and, pinned under glass, the only page of the old climbers' notebook anyone has found.</p>
        ${notebook}
        <p class="lede">Those four are the whole guidebook so far. Everything else in the park is waiting for someone to climb it first.</p>
        <p class="meta">The trail map (press M) marks three climbing areas: The Tailgate, right here by the car, The Schoolhouse and Hawkwatch.</p>${acts}`, bind);
      return;
    }
    const { next, past } = kioskBoard(), mo = toDate(G.date).getUTCMonth() + 1;
    const week = Math.floor((toDate(G.date) - toDate(World.REOPENED)) / (7 * 864e5));
    const season = (KIOSK_SEASON.find(([ms]) => ms.includes(mo)) || [null, ""])[1];
    const dog = G.dog && G.dog.adopted ? "Pickles has a home now. Please still don't feed him." : "Please don't feed the dog. He has had three breakfasts.";
    const notes = [season, [...KIOSK_NOTES, dog][((week % 7) + 7) % 7]].filter(Boolean)
      .map((t, i) => `<div class="kiosk-note${i ? " tilt" : ""}"><p>${esc(t)}</p><span class="kn-sign">Gus</span></div>`).join("");
    modal(`<span class="label-sm">The trailhead kiosk</span><h2>${next ? "Something's coming up" : "Gus's notices"}</h2>
      <div class="kiosk-board">${next ? kioskPosterHtml(next) : ""}${past && !(next && next.in === 0) ? kioskPastHtml(past) : ""}${notes}</div>
      ${notebook}${acts}`, bind);
  }

  // A climber from before the reopening, converted on load: what changed.
  // After the Phase 3 regrade: what changed for this climber.
  function showRegraded(info) {
    const pl = G.player, by = Mech.PREF.map(t => [t, pl.skills[t]]).sort((a, b) => b[1] - a[1]);
    const best = by.slice(0, 2).map(([t]) => STYLE[t][0].toLowerCase()), worst = STYLE[by[by.length - 1][0]][0].toLowerCase();
    const key = DEV ? OLD_BALANCE_COPY + "-dev" : OLD_BALANCE_COPY;
    let copy = false; try { copy = !!localStorage.getItem(key); } catch (e) { }
    const L = levelNow();
    modal(`<span class="label-sm">Granite Hollow has changed</span><h2>Climbing has been rebalanced</h2>
      <p class="lede">Your level now means the grades you climb. It's been worked out again from your logbook, under the new rules.</p>
      <ul class="welcome">
        <li><b>You're V${info.to} now${info.to !== info.from ? `, up from V${info.from}` : ""}.</b> Your hardest send is still V${Math.max(0, G.bestGrade)}.${L.gated ? ` ${proofText(L)}.` : ""}</li>
        <li><b>Style skills now compare your styles with each other.</b> You're strongest on ${best.join(" and ")}, and weakest on ${worst}. Climbing a style makes it more of a strength.</li>
        <li><b>Hard grades are harder.</b> A grade above your level is a real project, and two above needs everything going for you. Working a problem teaches you less with each try the same day, so projects take a few sessions.</li>
        <li><b>Moving up a grade</b> takes three sends at your level or harder, as well as the XP. Falling earns no XP.</li>
        <li><b>Rests</b> give back less energy each time the same day.</li>
        <li>Your ticks, first ascents and their names, projects and journal are exactly as they were.</li>
      </ul>
      ${copy ? `<p class="meta">A copy of your climber from before the change is kept in this browser: <button type="button" class="linklike" data-old-bal>download it</button>.</p>` : ""}
      <div class="acts"><button type="button" class="btn primary" data-close>Back to climbing</button></div>`,
      (root, close) => {
        root.querySelector("[data-close]").onclick = close;
        const o = root.querySelector("[data-old-bal]"); if (o) o.onclick = () => exportCopy(key, "before-the-regrade");
      });
  }
  function showWelcomeBack() {
    const est = Object.values(G.world.est), fa = World.faCount(G), sent = new Set(firstSends().map(t => t.p)).size;
    const others = est.filter(e => e.by !== "you" && !e.old).length;
    const lines = Object.values(G.know.lines).filter(l => l.how !== "kiosk").length;
    let copy = false; try { copy = !!localStorage.getItem(OLD_RULES_COPY); } catch (e) { }
    modal(`<span class="label-sm">Granite Hollow has changed</span><h2>The park has reopened</h2>
      <p class="lede">Granite Hollow was closed to climbing from 1987 until September 2025, so when you arrived almost nothing was documented. Problems now get their names and grades from whoever climbs them first, and the crag develops as you play.</p>
      <ul class="welcome">
        <li><b>${fa === sent ? `Your ${fa} ${fa === 1 ? "send is a first ascent" : "sends are first ascents"}` : `${fa} of your ${sent} sends ${fa === 1 ? "is a first ascent" : "are first ascents"}`}.</b> ${fa === 1 ? "It's" : "They're"} in CragLog under your name, and you can rename ${fa === 1 ? "it" : "them"} there.${fa < sent ? " The others are on the old notebook page, climbed back in the 70s." : ""}</li>
        <li><b>The ${lines} ${lines === 1 ? "line" : "lines"} you'd tried or heard about</b> are in your journal.</li>
        <li><b>Other climbers have been busy too:</b> ${others} ${others === 1 ? "problem" : "problems"} documented since the reopening.</li>
        <li>Boulders you hadn't been to are unfamiliar again. Click one on the map to walk over and look it over.</li>
        <li>Your level, skills, ticks and projects are exactly as they were.</li>
      </ul>
      <p class="meta">You stay on the leaderboard's <i>Before the reopening</i> board.${copy ? ` A copy of your climber from before the change is kept in this browser: <button type="button" class="linklike" data-old>download it</button>.` : ""}</p>
      <div class="acts"><button type="button" class="btn primary" data-close>Back to climbing</button></div>`,
      (root, close) => {
        root.querySelector("[data-close]").onclick = close;
        const o = root.querySelector("[data-old]"); if (o) o.onclick = exportOldCopy;
      });
  }

  // ================================================================= backups
  // A save file is the whole game state plus a header, so a file from something
  // else (or a broken one) is caught before it replaces your climber. Downloads
  // go through the viewer's "downloads" capability when it's there, else a
  // plain browser download.
  const SAVE_FORMAT = "granite-hollow-save";
  let downloads = null;
  function connectDownloads() {
    try {
      if (window.claude && typeof window.claude.use === "function")
        window.claude.use("downloads").then(d => { downloads = d; }, () => { });
    } catch (e) { /* no viewer runtime */ }
  }
  const slug = s => (s || "climber").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "climber";
  function saveSummary(g) {
    return { name: g.player.name, level: Mech.levelOf(g.player).level, best: g.bestGrade,
      sends: g.ticks.filter(t => t.style !== "Repeat").length, date: g.date, days: g.dayNo };
  }
  const describeSave = s => `${s.name}: level V${s.level}, hardest send ${s.best >= 0 ? "V" + s.best : "none yet"}, ${s.sends} problems sent, ${prettyDate(s.date)} (day ${s.days})`;

  const saveFileBody = g => JSON.stringify({ format: SAVE_FORMAT, version: 1, exported: new Date().toISOString(), summary: saveSummary(g), game: g }, null, 1);
  async function download(filename, body) {
    if (downloads) await downloads.save({ filename, data: body });   // first await: stays inside the click
    else {
      const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
  const downloadFailed = e => {
    if (e && e.code === "declined") return;
    toast("Couldn't download the save file", e && e.code === "rate_limited" ? "A download prompt is already open. Try again in a moment." : "Downloads aren't available here. Try opening the game in a desktop browser.", "info");
  };
  async function exportSave() {
    const filename = `granite-hollow-${slug(G.player.name)}-${G.date}.json`;
    try {
      await download(filename, saveFileBody(G));
      G.backup = { at: new Date().toISOString(), dayNo: G.dayNo }; save();
      toast("Save file downloaded", filename, "info");
      renderPanel();
    } catch (e) { downloadFailed(e); }
  }
  // A copy of a climber kept in this browser when they were converted.
  async function exportCopy(key, what) {
    let g = null; try { g = JSON.parse(localStorage.getItem(key)); } catch (e) { }
    if (!g || !g.player) { toast("No copy here", "There's no earlier copy of this climber saved in this browser.", "info"); return; }
    const filename = `granite-hollow-${slug(g.player.name)}-${what}.json`;
    try { await download(filename, saveFileBody(g)); toast("Save file downloaded", filename, "info"); } catch (e) { downloadFailed(e); }
  }
  // The copy of a climber kept when they were converted to the new rules.
  async function exportOldCopy() {
    let g = null; try { g = JSON.parse(localStorage.getItem(OLD_RULES_COPY)); } catch (e) { }
    if (!g || !g.player) { toast("No copy here", "There's no climber from before the reopening saved in this browser.", "info"); return; }
    const filename = `granite-hollow-${slug(g.player.name)}-before-the-reopening.json`;
    try { await download(filename, saveFileBody(g)); toast("Save file downloaded", filename, "info"); } catch (e) { downloadFailed(e); }
  }

  // Check a loaded file thoroughly: every problem and climber it points at must
  // exist, and no text may contain markup.
  function validateSave(obj) {
    const g = obj && obj.format === SAVE_FORMAT ? obj.game : obj && (obj.v === 1 || obj.v === 2) && obj.player ? obj : null;
    if (!g) throw new Error("This isn't a Granite Hollow save file.");
    if (g.v !== 1 && g.v !== 2) throw new Error("This save file is from a different version of the game.");
    if (g.v === 2 && !RULES2_LIVE && !DEV) throw new Error("This save file is from a newer version of the game.");
    if (g.dev === true && !DEV) throw new Error("This save file was made in development mode, so it can't be played here.");
    (function walk(x) {
      if (typeof x === "string") { if (/[<>]/.test(x)) throw new Error("The save file contains text the game doesn't allow."); }
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    })(g);
    const nP = D.problems.length, nC = D.climbers.length;
    const isP = i => Number.isInteger(i) && i >= 0 && i < nP;
    const num = x => typeof x === "number" && isFinite(x);
    const pl = g.player;
    const ok = pl && typeof pl.name === "string" && num(pl.xp) && pl.xp >= 0 && num(pl.height) && num(pl.ape)
      && num(pl.energy) && num(pl.skin) && pl.skills && Mech.PREF.every(t => num(pl.skills[t]))
      && Array.isArray(pl.strengths) && pl.strengths.every(t => Mech.PREF.includes(t))
      && (pl.weakness == null || Mech.PREF.includes(pl.weakness))
      && typeof g.date === "string" && /^\d{4}-\d\d-\d\d$/.test(g.date) && Number.isInteger(g.dayNo)
      && Array.isArray(g.ticks) && g.ticks.every(t => t && isP(t.p) && typeof t.date === "string")
      && g.ps && typeof g.ps === "object" && Object.keys(g.ps).every(k => isP(+k))
      && (g.todo || []).every(isP)
      && (g.tips || []).every(t => t && isP(t.p) && ((Number.isInteger(t.from) && t.from >= 0 && t.from < nC) || (typeof t.from === "string" && World.isWho(t.from) && t.from !== "you")) && Array.isArray(t.why))
      && g.day && g.day.weather && num(g.day.minute) && Array.isArray(g.day.sends) && g.day.sends.every(s => s && isP(s.p))
      && (g.loc == null || g.loc.boulder == null || (Number.isInteger(g.loc.boulder) && g.loc.boulder >= 0 && g.loc.boulder < D.boulders.length));
    if (!ok) throw new Error("This save file is damaged or incomplete.");
    for (const [k, v] of [["tips", []], ["todo", []], ["ach", {}], ["visited", []], ["feed", []]]) if (g[k] == null) g[k] = v;
    if (!num(g.bestGrade)) g.bestGrade = -1;
    if (g.pos != null && !(Array.isArray(g.pos) && g.pos.length === 2 && g.pos.every(v => num(v) && Math.abs(v) < 5000))) g.pos = null;   // the map puts you back where loc says
    if (g.walked != null && typeof g.walked !== "boolean") delete g.walked;
    if (g.day.walkFrac != null && !(num(g.day.walkFrac) && g.day.walkFrac >= 0 && g.day.walkFrac < 1)) g.day.walkFrac = 0;
    migrateSave(g);
    if (g.v === 2 && World.validate(D, g)) throw new Error("This save file is damaged or incomplete.");
    if (g.v === 1 && rulesLive()) upgrade(g);
    try { regrade(g); } catch (e) { throw new Error("This save file couldn't be brought up to date."); }
    if (DEV) g.dev = true;
    g.day.encounter = null;
    const okWx = f => f && typeof f.date === "string" && /^\d{4}-\d\d-\d\d$/.test(f.date) && num(f.temp) && num(f.cond) && num(f.dusk)
      && ["label", "sky", "note"].every(k => typeof f[k] === "string") && (f.rainAt == null || num(f.rainAt)) && (f.pop == null || (num(f.pop) && f.pop >= 0 && f.pop <= 1));
    if (!Array.isArray(g.forecast) || !g.forecast.every(okWx)) g.forecast = [];
    if (typeof g.id !== "string" || !/^[a-z0-9]{4,40}$/.test(g.id)) g.id = newId();
    g.board = g.board && g.board.joined === true && !g.dev ? { joined: true } : { joined: false };
    return g;
  }

  function pickSaveFile() { const inp = $("#save-file"); inp.value = ""; inp.click(); }
  async function onSaveFile(file) {
    if (!file) return;
    let g;
    try {
      if (file.size > 20e6) throw new Error("That file is too big to be a save file.");
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error("That file isn't valid JSON."); }
      g = validateSave(obj);
    } catch (e) { toast("Couldn't load that file", e.message, "info"); return; }
    const incoming = describeSave(saveSummary(g));
    if (!G) { applySave(g); return; }
    modal(`<span class="label-sm">Load save file</span><h2>Replace your climber?</h2>
      <p class="lede"><b>Loading:</b> ${esc(incoming)}.</p>
      <p class="lede"><b>Replacing:</b> ${esc(describeSave(saveSummary(G)))}.</p>
      <p class="meta">The current climber is lost unless you've downloaded a save file for them.</p>
      <div class="acts"><button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn primary" data-yes>Load save</button></div>`,
      (root, close) => {
        root.querySelector("[data-no]").onclick = close;
        root.querySelector("[data-yes]").onclick = () => { close(); applySave(g); };
      });
  }
  function applySave(g) {
    G = g;
    Object.assign(UI, { tab: "here", busy: false, confirmReset: false, levelPending: false, summaryPending: false, kiosk: false, fresh: null, recenter: true });
    UI.expanded.clear(); UI.cl.problem = null;
    modalQueue.length = 0; $("#modal-root").innerHTML = "";
    save();
    $("#creator").hidden = true;
    showGame();
    toast("Save loaded", describeSave(saveSummary(G)), "info");
  }

  // ============================================================= leaderboard
  // Shared through the artifact's database. runs/<account id> holds that
  // account's climbers and, for each grade, the in-game date each first sent
  // that grade or harder. Everyone who can open the game reads every entry;
  // each person writes only their own. Joining is opt-in, per climber.
  const LB = { db: null, uid: null, status: "connecting", docs: new Map(), canWrite: null, writing: false, pending: false, lastSent: null };
  const BOARD_GRADES = d3.range(1, 14);
  const daysSince = s => Math.round((toDate(s) - toDate(START_DATE)) / 864e5);

  function milestones(g) {
    const out = {};
    for (const t of g.ticks) {
      if (t.style === "Repeat") continue;
      const p = D.problems[t.p];
      for (let v = 1; v <= p.grade; v++) if (!out[v])
        out[v] = { date: t.date, days: daysSince(t.date), cday: Number.isInteger(t.day) ? t.day : null, p: g.v === 2 ? null : t.p, name: g.v === 2 ? "" : p.name, grade: p.grade, style: t.style };
    }
    return out;
  }
  // Which board a climber is on: the rules they started under. 3: since the
  // reopening, under Phase 3's balance; 2: since the reopening, under the older
  // balance (regraded climbers stay there); 1: before the reopening.
  const boardRules = () => (!v2() || G.rules !== 2 ? 1 : G.balStart === BAL_NOW ? 3 : 2);
  const BOARD_NAMES = { 3: "Since the reopening", 2: "Reopening, older rules", 1: "Before the reopening" };
  function boardEntry() {
    const pl = G.player;
    const e = { name: pl.name.slice(0, 24), height: pl.height, ape: pl.ape, best: G.bestGrade, level: levelNow().level,
      sends: firstSends().length, days: daysSince(G.date), cdays: G.dayNo, ms: milestones(G), rk: rankSummaryForBoard() };
    // Which board: the rules this climber started under (migrated climbers stay on the old one).
    if (v2()) { e.rules = boardRules(); e.fa = World.faCount(G); if (e.rules >= 2) e.rk = { y: [], a: [] }; }
    return e;
  }

  async function connectBoard() {
    try {
      if (!(window.claude && typeof window.claude.use === "function")) throw new Error("no runtime");
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db) throw new Error("no db");
      LB.db = db;
      if (user) { LB.uid = await user.id(); LB.canWrite = await user.can("data.write"); }
    } catch (e) { LB.status = "off"; renderIfLeaders(); return; }
    const timer = setTimeout(() => { if (LB.status === "connecting") { LB.status = "slow"; renderIfLeaders(); } }, 10000);
    LB.db.collection("runs").onSnapshot(snap => {
      LB.docs = new Map(snap.docs.map(d => [d.id, d.data()]));
      if (!snap.metadata.fromCache) { clearTimeout(timer); LB.status = "live"; }
      renderIfLeaders();
    }, err => { clearTimeout(timer); LB.status = "error"; LB.err = err && err.code; renderIfLeaders(); });
    if (G && G.board && G.board.joined) syncBoard();
  }
  // Write this climber's entry when it has changed. One write at a time.
  async function syncBoard(remove = false) {
    if (DEV || (G && G.dev)) return;                      // development mode never posts
    if (!LB.db || !LB.uid || !G || LB.canWrite === false) return;
    if (LB.writing) { LB.pending = true; return; }
    const entry = boardEntry(), key = G.id + (remove ? ":removed" : JSON.stringify(entry));
    if (key === LB.lastSent) return;
    LB.writing = true;
    try {
      const ref = LB.db.doc("runs/" + LB.uid);
      const snap = await ref.get();
      const climbers = { ...((snap.exists && snap.data().climbers) || {}) };
      if (remove) delete climbers[G.id]; else climbers[G.id] = { ...entry, updated: Date.now() };
      await ref.set({ climbers });
      LB.lastSent = key;
    } catch (e) {
      if (e && e.code === "invalid_argument") LB.canWrite = false;
      else if (e && e.code === "quota_exceeded") toast("The leaderboard is full", "Your climb couldn't be posted.", "info");
      renderIfLeaders();
    } finally {
      LB.writing = false;
      if (LB.pending) { LB.pending = false; syncBoard(!(G.board && G.board.joined)); }
    }
  }
  function renderIfLeaders() {
    if (G && UI.tab === "craglog" && UI.cl.problem == null && UI.cl.view !== "problems" && !$("#game").hidden) renderPanel();
  }

  // Everyone's climbers, cleaned up: entries come from other people's pages.
  function boardClimbers() {
    const n = (x, lo, hi) => (typeof x === "number" && isFinite(x) && x >= lo && x <= hi ? x : null);
    const str = (x, len) => (typeof x === "string" ? x.slice(0, len) : "");
    const out = [];
    for (const [uid, data] of LB.docs) {
      const cs = data && data.climbers;
      if (!cs || typeof cs !== "object") continue;
      for (const [id, c] of Object.entries(cs)) {
        if (!c || typeof c !== "object") continue;
        if (uid === LB.uid && id === G.id) continue;          // yours comes from your live game below
        const ms = {};
        for (const g of BOARD_GRADES) {
          const m = c.ms && c.ms[g];
          if (m && n(m.days, 0, 1e5) != null) ms[g] = { days: m.days, date: /^\d{4}-\d\d-\d\d$/.test(m.date) ? m.date : null,
            cday: n(m.cday, 0, 1e5), p: Number.isInteger(m.p) && m.p >= 0 && m.p < D.problems.length ? m.p : null, name: str(m.name, 60), grade: n(m.grade, 0, 17), style: str(m.style, 10) };
        }
        const rkList = v => (Array.isArray(v) ? v.slice(0, RANK_TOP) : []).filter(x => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 0
          && x[0] < D.problems.length && /^\d{4}-\d\d-\d\d$/.test(x[1])).map(x => ({ p: x[0], d: epochDays(x[1]), f: x[2] === 1, pts: rankPoints(D.problems[x[0]].grade, x[2] === 1) }));
        const rk = c.rk && typeof c.rk === "object" ? { y: rkList(c.rk.y), a: rkList(c.rk.a) } : null;
        out.push({ rk, rules: c.rules === 3 ? 3 : c.rules === 2 ? 2 : 1, fa: n(c.fa, 0, 1e5) ?? 0, name: str(c.name, 24).trim() || "Climber", height: n(c.height, 100, 250), ape: n(c.ape, -30, 30),
          best: n(c.best, -1, 17) ?? -1, level: n(c.level, 0, 17) ?? 0, sends: n(c.sends, 0, 1e6) ?? 0, days: n(c.days, 0, 1e5) ?? 0,
          cdays: n(c.cdays, 0, 1e5), ms, mine: false, yours: uid === LB.uid });
      }
    }
    out.push({ ...boardEntry(), mine: true, yours: true, posted: G.board.joined && LB.status !== "off" && !!LB.uid && LB.canWrite !== false });
    return out;
  }

  function leadersHtml() {
    const everyone = boardClimbers(), mineRules = boardRules();
    const bucket = UI.lbBucket || mineRules, rulesOf = c => (c.mine ? mineRules : c.rules || 1);
    const all = everyone.filter(c => rulesOf(c) === bucket);
    const present = [3, 2, 1].filter(k => k === bucket || everyone.some(c => rulesOf(c) === k));
    const buckets = present.length > 1 ? `<div class="cl-views" role="group" aria-label="Which leaderboard" style="margin-bottom:8px">
      ${present.map(k => `<button type="button" data-lb-bucket="${k}" aria-pressed="${bucket === k}">${BOARD_NAMES[k]}</button>`).join("")}</div>` : "";
    const ranked = g => all.filter(c => c.ms[g]).sort((a, b) => a.ms[g].days - b.ms[g].days
      || (a.ms[g].cday ?? 1e9) - (b.ms[g].cday ?? 1e9) || a.name.localeCompare(b.name));
    const counts = Object.fromEntries(BOARD_GRADES.map(g => [g, ranked(g).length]));
    if (UI.lbGrade == null) UI.lbGrade = [...BOARD_GRADES].reverse().find(g => counts[g] > (G.bestGrade >= g ? 1 : 0)) || Math.min(13, Math.max(1, G.bestGrade + 1));
    const g = UI.lbGrade, rows = ranked(g);
    const fmtDate = s => (s ? shortDate(s).replace(/, \d{4}$/, "") : "");
    const who = c => `<b>${esc(c.name)}</b>${c.mine ? ` <span class="you-tag">${c.posted ? "you" : "you, not posted"}</span>` : c.yours ? ` <span class="you-tag">your other climber</span>` : ""}
      <div class="meta" style="margin:0">${c.height != null ? `${c.height} cm` : ""}</div>`;

    let status = "";
    if (LB.status === "off") status = `<p class="meta">The shared leaderboard only works when the game is open on claude.ai while you're signed in. Below is just your climber.</p>`;
    else if (LB.status === "error") status = `<p class="meta">The leaderboard can't be reached right now. Reload the page to try again.</p>`;
    else if (LB.status === "slow") status = `<p class="meta">Still connecting to the leaderboard. What's shown may be out of date.</p>`;
    else if (LB.status === "connecting") status = `<p class="meta">Connecting to the leaderboard…</p>`;

    let join = "";
    if (DEV || G.dev) join = `<p class="meta">Development mode never posts to the leaderboard.</p>`;
    else if (LB.status !== "off") {
      if (!LB.uid) join = `<p class="meta">Sign in to claude.ai to post your climber.</p>`;
      else if (LB.canWrite === false) join = `<div class="lb-join"><p class="lede" style="margin:0">You can watch the board, but your access to this game is view-only, so you can't post. Ask whoever shared it for edit access.</p></div>`;
      else if (!G.board.joined) join = `<div class="lb-join"><p class="lede" style="margin:0 0 8px">Post <b>${esc(G.player.name)}</b> to the leaderboard? Everyone who can open this game will see your climber's name, height and first send of each grade. Your claude.ai name isn't shown.</p>
        <button type="button" class="btn primary" data-lb-join>Join the leaderboard</button></div>`;
    }

    const others = [...all].sort((a, b) => b.best - a.best || (a.ms[a.best]?.days ?? 1e9) - (b.ms[b.best]?.days ?? 1e9));
    return `${cragHead()}
      <p class="meta">Who sent each grade first, counted in days since everyone's first day at Granite Hollow (${shortDate(START_DATE)}). A V${g} board also counts a first send of anything harder.</p>
      ${buckets}${status}${join}
      <div class="lb-grades" role="group" aria-label="Grade">${BOARD_GRADES.map(v => `<button type="button" data-lb-grade="${v}" aria-pressed="${v === g}">V${v}${counts[v] ? `<span>${counts[v]}</span>` : ""}</button>`).join("")}</div>
      <h3>First to V${g}</h3>
      ${rows.length ? `<table><thead><tr><th>#</th><th>Climber</th><th>When</th><th>Problem</th></tr></thead><tbody>
        ${rows.map((c, k) => { const m = c.ms[g]; return `<tr class="${c.mine ? "lb-me" : ""}"><td class="num">${k + 1}</td><td>${who(c)}</td>
          <td>Day ${m.days + 1}<div class="meta" style="margin:0">${esc(fmtDate(m.date))}${m.cday != null ? ` · ${m.cday} climbing` : ""}</div></td>
          <td>${m.p != null && K.visible(m.p) ? `<button type="button" class="linklike" data-cl="${m.p}">${esc(pname(m.p))}</button>` : K.all() ? esc(m.name) : ""}<div class="meta" style="margin:0">${m.grade != null ? `V${m.grade}` : ""}${m.style ? ` · ${esc(m.style)}` : ""}</div></td></tr>`; }).join("")}
        </tbody></table>` : `<p class="lede">Nobody has sent V${g} yet.</p>`}
      <h3>Everyone</h3>
      <table><thead><tr><th>Climber</th><th>Hardest</th><th>Level</th><th>Sends</th>${bucket === 2 ? "<th>FAs</th>" : ""}<th>Days in</th></tr></thead><tbody>
        ${others.map(c => `<tr class="${c.mine ? "lb-me" : ""}"><td>${who(c)}</td><td class="num">${c.best >= 0 ? "V" + c.best : "–"}</td><td class="num">V${c.level}</td><td class="num">${c.sends}</td>${bucket === 2 ? `<td class="num">${c.fa || 0}</td>` : ""}<td class="num">${c.days + 1}</td></tr>`).join("")}
      </tbody></table>
      ${G.board.joined && LB.status !== "off" ? `<p class="meta" style="margin-top:14px"><button type="button" class="linklike" data-lb-leave>Take ${esc(G.player.name)} off the leaderboard</button></p>` : ""}`;
  }
  function joinBoard() { if (DEV || G.dev) return; G.board = { joined: true }; LB.lastSent = null; save(); renderPanel(); }
  function leaveBoard() { G.board = { joined: false }; save(); syncBoard(true); renderPanel(); }

  // ================================================================= creator
  // A little scene for the title page: granite, a crashpad, someone on the
  // boulder, and the woods in the colours of the day the game starts.
  // The landing page lies over the park's paper trail map (paper-map.svg, a static
  // export of paper.js's map: scripts/browser/export_paper_map.js), loaded once.
  function showLandingMap(on) {
    const bg = $("#landing-map"); if (!bg) return;
    bg.hidden = !on;
    if (!on || bg.dataset.loaded) return;
    bg.dataset.loaded = "1";
    fetch("paper-map.svg" + ASSET_V).then(r => r.ok ? r.text() : "").then(t => {
      if (!t) return;
      bg.innerHTML = t;
      const svg = bg.querySelector("svg"); if (!svg) return;
      svg.setAttribute("preserveAspectRatio", "xMidYMid slice"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
      requestAnimationFrame(() => bg.classList.add("ready"));
    }).catch(() => {});
  }

  function showCreator() {
    $("#game").hidden = true; $("#loading").hidden = true;
    applySeason(START_DATE);
    const el = $("#creator"); el.hidden = false; showLandingMap(true);
    const st = { name: "", height: 165, ape: 2, strengths: [], weakness: null };
    function reachNote() {
      const r = st.height + st.ape;
      if (r < 170) return `Reach ${r} cm. Bunchy, compressed problems will suit you. Reachy ones will feel a grade or so harder.`;
      if (r > 182) return `Reach ${r} cm. Reachy problems will feel easier. Cramped, bunchy ones will feel harder.`;
      return `Reach ${r} cm, about average. Few problems will care about your size.`;
    }
    function draw() {
      const ftIn = cm => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)}′${i % 12}″`; };
      const ready = st.strengths.length === 2;
      el.innerHTML = `<header class="cc-cartouche">
          <span class="cc-kicker">A bouldering game</span>
          <h1>Granite Hollow</h1>
          <span class="cc-sub">State Park</span>
          <p class="intro">${rulesLive() ? "Granite Hollow has just reopened to climbing after nearly forty years. Its 75 boulders hold about 1,000 possible lines, from V0 to V13, and almost none of them are documented yet. Find them, climb them first, and name them. You start at V0." : "1,000 problems on 75 boulders, from V0 warm-ups to V13 test pieces. You start at V0."}</p>
        </header>
        <div class="cc-sheet">
          <div class="cc-grid">
            <section class="cc-card"><h2>Your climber</h2>
              <div class="field"><label for="cc-name">Name</label><input type="text" id="cc-name" maxlength="24" autocomplete="off" value="${esc(st.name)}"></div>
              <div class="field"><label for="cc-height">Height <output>${st.height} cm · ${ftIn(st.height)}</output></label><input type="range" id="cc-height" min="122" max="200" step="1" value="${st.height}"></div>
              <div class="field"><label for="cc-ape">Ape index <output>${st.ape >= 0 ? "+" : ""}${st.ape} cm</output></label><input type="range" id="cc-ape" min="-6" max="12" step="1" value="${st.ape}"></div>
              <p class="reach-note">${reachNote()}</p></section>
            <section class="cc-card"><h2>Strengths</h2><p class="help">Pick two styles you're naturally good at.</p>
              <div class="stylepick">${Mech.PREF.map(t => `<button type="button" class="str" data-str="${t}" aria-pressed="${st.strengths.includes(t)}" title="${esc(STYLE[t][1])}" ${!st.strengths.includes(t) && (st.strengths.length >= 2 || st.weakness === t) ? "disabled" : ""}>${STYLE[t][0]}</button>`).join("")}</div>
              <h2 class="cc-h2-2">Weakness</h2><p class="help">Optional. Pick one style you struggle with.</p>
              <div class="stylepick">${Mech.PREF.map(t => `<button type="button" class="weak" data-weak="${t}" aria-pressed="${st.weakness === t}" title="${esc(STYLE[t][1])}" ${st.strengths.includes(t) ? "disabled" : ""}>${STYLE[t][0]}</button>`).join("")}</div></section>
          </div>
          <div class="cc-start">
            <button type="button" class="btn primary" id="cc-go" ${ready ? "" : "disabled"}>Drive to the crag</button>
            <span class="cc-status${ready ? " ok" : ""}">${ready ? "Ready. Your progress saves in this browser." : `Pick ${2 - st.strengths.length} more ${st.strengths.length === 1 ? "strength" : "strengths"} to start.`}</span>
            <span class="cc-load">Already have a climber? <button type="button" class="linklike" id="cc-load">Load a save file</button></span>
          </div>
        </div>`;
      $("#cc-load").onclick = pickSaveFile;
      $("#cc-name").oninput = e => { st.name = e.target.value; };
      // The sliders update their readouts in place: redrawing the form mid-drag
      // replaced the slider under the pointer, so it only moved a click at a time.
      const sizeOut = () => {
        el.querySelector('label[for="cc-height"] output').textContent = `${st.height} cm · ${ftIn(st.height)}`;
        el.querySelector('label[for="cc-ape"] output').textContent = `${st.ape >= 0 ? "+" : ""}${st.ape} cm`;
        el.querySelector(".reach-note").textContent = reachNote();
      };
      $("#cc-height").oninput = e => { st.height = +e.target.value; sizeOut(); };
      $("#cc-ape").oninput = e => { st.ape = +e.target.value; sizeOut(); };
      el.querySelectorAll("[data-str]").forEach(b => b.onclick = () => {
        const t = b.dataset.str; st.strengths = st.strengths.includes(t) ? st.strengths.filter(x => x !== t) : [...st.strengths, t].slice(0, 2); draw();
      });
      el.querySelectorAll("[data-weak]").forEach(b => b.onclick = () => { st.weakness = st.weakness === b.dataset.weak ? null : b.dataset.weak; draw(); });
      $("#cc-go").onclick = () => {
        newGame({ name: st.name.trim() || "You", height: st.height, ape: st.ape, strengths: st.strengths, weakness: st.weakness });
        save(); showGame();
      };
    }
    draw();
  }

  document.addEventListener("keydown", e => {
    if (e.key !== "m" && e.key !== "M") return;
    if (e.metaKey || e.ctrlKey || e.altKey || !M || !M.togglePaper || $("#game").hidden || $("#modal-root").children.length || climbing()) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); safely("trail map", M.togglePaper);
  });
  function showGame() {
    $("#creator").hidden = true; $("#loading").hidden = true; $("#game").hidden = false; showLandingMap(false);
    if (!M) {
      try { M = buildMap(); }
      catch (e) { reportError("map", e); M = { update() { safely("light", applyAtmosphere); }, togglePaper() {}, lookAtMe() {}, minutesToLot: () => 0, toLot() {}, walking: () => false,
        goTo(to) { if (!Array.isArray(to)) { arrive({ ...G.loc }, { sector: to.sector, boulder: to.boulder }); save(); renderAll(); } }, teleport(to) { G.loc = { sector: to.sector, boulder: to.boulder }; } }; }
    }
    if (DEV) devButton();
    renderAll();
    if (justMigrated.has(G)) { justMigrated.delete(G); openModal(showWelcomeBack); }
    if (justRegraded.has(G)) { const info = justRegraded.get(G); justRegraded.delete(G); openModal(() => showRegraded(info)); }
    if (G.day.climb && !G.day.over) safely("the climbing scene", showClimb); else if (G.day.climb) G.day.climb = null;   // reloaded mid-climb
    if (v2() && !G.day.over && G.day.sunset === "yes") safely("the sunset", watchSunset);                                   // reloaded mid-sunset
    else if (v2() && !G.day.over && (G.day.sunset === "told" || G.day.sunset === "watched")) safely("the sunset", sunsetEnd);
    if (UI.kiosk) { UI.kiosk = false; openModal(() => showKiosk(true)); }
    if (G.day.over) openModal(showSummary);
  }

  // ======================================================= development mode
  // ?dev: a separate save slot and these tools, for building and testing the
  // Phase 2 rules. Never posts to the leaderboard (see syncBoard and joinBoard).
  function devRules() { try { return sessionStorage.getItem("gh-dev-rules") === "1" ? 1 : 2; } catch (e) { return 2; } }
  function devButton() {
    if ($("#dev-btn")) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "dev-btn"; b.className = "dev-btn"; b.textContent = "Dev"; b.title = "Development tools";
    b.onclick = devPanel; document.body.appendChild(b);
  }
  function devPanel() {
    const W = G.world, kn = G.know, est = W ? Object.values(W.est) : [];
    const info = v2() ? [
      ["Rules", `new (v2) · balance ${G.bal || "old"}${G.regraded ? ` (regraded ${G.regraded.date})` : ""} · leaderboard bucket: ${BOARD_NAMES[boardRules()].toLowerCase()}${W.migrated ? " · migrated from v1" : ""}`],
      ["Seed", W.seed], ["Simulated through", W.simDate],
      ["Established", `${est.length}: ${est.filter(e => e.by === "you").length} yours, ${est.filter(e => e.old).length} from the notebook, ${est.filter(e => e.by !== "you" && !e.old).length} by the community`],
      ["Community", `${Object.keys(W.npc).length} climbers have arrived; they know ${W.found.length} of ${D.boulders.length} boulders`],
      ["You know", `${Object.keys(kn.areas).length} areas, ${Object.keys(kn.boulders).length} boulders, ${Object.keys(kn.lines).length} lines`],
      ["Invariants", World.check(D, G).slice(0, 3).join("; ") || "all hold"],
      // The regulars' lives (Phase 4, Stage 0): level, project, today's session, how well you know them.
      ...World.REG.filter(w => W.reg && W.reg[w]).map(w => {
        const R = W.reg[w], s = World.sessionOn(G, w, G.date), t = Social.tier(G, w), P = R.proj;
        return [firstName(w), `V${World.levelOn(w, G.date).toFixed(1)} · ${R.sent.length} sent · ${P ? `project ${D.problems[P.p].name} (V${D.problems[P.p].grade}, ${P.n} sessions, ${Math.round(P.best * 100)}% up)` : "no project"}`
          + ` · today: ${s ? `${s.out} at ${D.boulders[s.b].name}` : "not out"}${t ? ` · ${t.words.toLowerCase()} (${t.bond})` : ""}`];
      }),
    ] : [["Rules", "old (v1): the whole crag is documented"]];
    const here = G.loc.boulder != null ? D.boulders[G.loc.boulder].problems[0] : 0;
    modal(`<span class="label-sm">Development mode</span><h2>Dev tools</h2>
      <p class="meta">This tab has its own save slot and never posts to the leaderboard. <a href="?dev=0">Leave development mode</a></p>
      <dl class="dev-info">${info.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>
      <div class="dev-acts">${v2() ? `<button type="button" class="btn small" data-dv="reveal">Reveal everything</button><button type="button" class="btn small" data-dv="forget">Reset knowledge</button>
        <button type="button" class="btn small" data-dv="skip7">Rest 7 days</button><button type="button" class="btn small" data-dv="skip30">Rest 30 days</button>`
        : `<button type="button" class="btn small" data-dv="migrate">Convert this climber to the new rules</button>`}
        <button type="button" class="btn small" data-dv="copy">Copy my real climber here</button></div>
      <div class="dev-acts"><select id="dv-b" aria-label="Boulder">${D.boulders.map((b, i) => `<option value="${i}" ${i === G.loc.boulder ? "selected" : ""}>${esc(b.sector)} · ${esc(b.name)}</option>`).join("")}</select>
        <button type="button" class="btn small" data-dv="teleport">Teleport there</button></div>
      ${v2() ? `<div class="dev-acts"><label class="meta" style="margin:0">Problem # <input id="dv-p" type="number" min="0" max="${D.problems.length - 1}" value="${here}" style="width:6em"></label>
        <button type="button" class="btn small" data-dv="inspect">Show its layers</button><button type="button" class="btn small" data-dv="establish">Have the community climb it</button></div>` : ""}
      <div class="dev-acts"><span class="meta" style="margin:0">New climbers start under the ${devRules() === 2 ? "new" : "old"} rules.</span>
        <button type="button" class="btn small" data-dv="rules">Use the ${devRules() === 2 ? "old" : "new"} rules</button></div>
      <pre class="dev-out" id="dv-out"></pre>
      <div class="acts"><button type="button" class="btn primary" data-close>Close</button></div>`, (root, close) => {
      const out = t => { root.querySelector("#dv-out").textContent = t; };
      const done = (again = true) => { save(); renderAll(); if (again) devPanel(); else close(); };
      const pid = () => Math.max(0, Math.min(D.problems.length - 1, Math.round(+root.querySelector("#dv-p").value || 0)));
      const act = {
        reveal: () => { World.devRevealAll(D, G); done(); },
        forget: () => {
          G.know = World.initialKnow(D, G.date);
          for (const [i, st] of Object.entries(G.ps)) if (st.att > 0) K.identify(+i, "tried", G.date);
          if (G.loc.boulder != null) K.visitBoulder(G.loc.boulder);
          done();
        },
        skip7: () => { close(); startDay(7, 7); save(); renderAll(); M.update(); if (G.day.over) showSummary(); },
        skip30: () => { close(); startDay(30, 30); save(); renderAll(); M.update(); if (G.day.over) showSummary(); },
        migrate: () => { G = World.migrate(D, JSON.parse(JSON.stringify(G))); G.dev = true; done(); },
        copy: () => {
          let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { }
          if (!raw) { out("There's no real climber saved in this browser."); return; }
          try { G = validateSave(JSON.parse(raw)); G.dev = true; UI.cl.problem = null; done(); } catch (e) { out("Couldn't copy it: " + e.message); }
        },
        teleport: () => {
          const b = +root.querySelector("#dv-b").value, bo = D.boulders[b];
          M.teleport({ sector: bo.sector, boulder: b });
          if (v2()) { K.visitArea(bo.sector); if (K.boulder(b) >= 1) K.visitBoulder(b); }
          if (!G.visited.includes(bo.sector)) G.visited.push(bo.sector);
          G.day.last = null; done(false);
        },
        inspect: () => {
          const i = pid(), p = D.problems[i];
          out(JSON.stringify({ problem: { id: i, name: p.name, grade: p.grade, boulder: p.boulder.name, area: p.sector, stars: p.stars },
            history: G.world.est[i] || null, knows: { line: K.line(i), shownAs: K.name(i), how: G.know.lines[i] || null, boulder: K.boulder(p.b), area: K.area(p.sector), canSpot: K.canSpot(i) },
            yours: G.ps[i] || null, legend: World.legendOf(D, i) }, null, 1));
        },
        establish: () => { const i = pid(); out(World.devEstablish(D, G, i) ? `#${i} is now established by ${World.whoName(D, G.world.est[i].by)}.` : `#${i} is already established.`); save(); renderAll(); },
        rules: () => { try { sessionStorage.setItem("gh-dev-rules", devRules() === 2 ? "1" : "2"); } catch (e) { } devPanel(); },
      };
      root.querySelectorAll("[data-dv]").forEach(b => { b.onclick = () => safely("dev tools", act[b.dataset.dv]); });
      root.querySelector("[data-close]").onclick = close;
    });
  }

  // ==================================================================== boot
  // Saves keep sector names (where you're standing, where you've been). The
  // sectors were renamed once; translate old names so those saves still work.
  const OLD_SECTOR_NAMES = {
    "Parking Lot Boulders": "The Tailgate", "Warm-Up Wall": "The Schoolhouse", "The Pond Caves": "Millrace Caves",
    "Summit Blocks": "Hawkwatch", "Fern Gully": "Bracken Gully", "Dam Area": "The Spillway", "Lost Crag": "The Cellar Holes",
    "Quarry Rim": "The Grout Piles",
  };
  // An old-rules (v1) climber into the new rules, in place. Returns it, or throws.
  function upgrade(g) {
    World.migrate(D, g);
    if (World.validate(D, g)) throw new Error("the converted save didn't check out: " + World.validate(D, g));
    justMigrated.add(g);
    return g;
  }
  // A climber from before Phase 3's balance, in place: their level worked out again
  // by replaying their logbook under the new XP rules, their skills made relative,
  // and their proof counted. Never lowers a level. Ticks, first ascents, names,
  // projects and the journal are untouched. Returns true if it changed anything
  // beyond recounting proof (saves already on the balance just get their tops
  // recounted from the ticks, which are the record).
  function regrade(g) {
    const grade = p => D.problems[p].grade;
    // Sends on climbing trips (trips.js) are proof too, and their XP isn't in the ticks.
    const addTrips = pl => { const t = Trips.tops(g.trips); t.forEach((n, i) => { if (n) pl.tops[i] = (pl.tops[i] || 0) + n; }); };
    if (g.bal === BAL_NOW) { g.player.tops = Mech.topsOf(g.ticks || [], grade); addTrips(g.player); return false; }
    const pl = g.player;
    let oldXp = pl.xp, was = 0; for (let need = 100; oldXp >= need && was < 16; was++) { oldXp -= need; need *= 1.6; }   // the old curve
    const r = Mech.replay(g.ticks || [], {
      grade,
      sessions: (p, date) => { const lg = g.ps[p] && g.ps[p].log; return Array.isArray(lg) ? Math.max(1, lg.filter(s => s && s[0] <= date).length) : 1; },
      tip: p => (g.tips || []).some(t => t.p === p && t.done),
      repeatsPerDay: REPEATS_XP,
    });
    pl.xp = r.xp + (g.trips || []).reduce((a, t) => a + (t.xp || 0), 0); pl.tops = r.tops; addTrips(pl);
    // Never lower a level: top up the XP to the old level if the replay came out lower.
    if (Mech.levelOf(pl).level < was) { let xp = 0; for (let n = 0; n < was; n++) xp += Mech.levelCost(n); pl.xp = Math.max(pl.xp, xp); }
    const oldSkills = { ...pl.skills };
    pl.skills = Mech.convertSkills(pl.skills);
    g.bal = BAL_NOW;
    g.regraded = { date: g.date, from: was, to: Mech.levelOf(pl).level };
    if (g.day) g.day.levelBefore = Mech.levelOf(pl).level;          // no level-up dialog for the conversion
    justRegraded.set(g, { from: was, to: Mech.levelOf(pl).level, oldSkills });
    return true;
  }
  function migrateSave(g) {
    learnedFor(g);
    if (g.v === 2 && g.world) { World.ensureReg(D, g, { date: g.date, wet: !!(g.day && g.day.rainedOut) }); Social.ensure(g, D.problems.length); }
    // A partner only for today, someone who climbs; sends together only with them (Stage 4).
    // Strangers no longer pop up (after Phase 4): a save mid-conversation with one just ends it.
    if (g.day && g.day.encounter && !(typeof g.day.encounter.who === "string" && g.day.encounter.who.startsWith("n:"))) g.day.encounter = null;
    if (g.day && g.day.partner != null && !(g.day.partner && CLIMB_WITH.includes(g.day.partner.who) && typeof g.day.partner.until === "number" && isFinite(g.day.partner.until))) g.day.partner = null;
    if (g.day && g.day.partner && g.day.partner.b != null && !(Number.isInteger(g.day.partner.b) && g.day.partner.b >= 0 && g.day.partner.b < D.boulders.length)) delete g.day.partner.b;
    for (const t of g.ticks || []) if (t && t.with != null && !CLIMB_WITH.includes(t.with)) delete t.with;
    // Friendship (Phase 4, Stage 4): today's invitation, the last one, and when you reached each level.
    const day_ = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s), num_ = x => typeof x === "number" && isFinite(x);
    if (g.day && g.day.invite != null && !(g.day.invite && CLIMB_WITH.includes(g.day.invite.who) && Number.isInteger(g.day.invite.b) && g.day.invite.b >= 0 && g.day.invite.b < D.boulders.length
      && num_(g.day.invite.from) && num_(g.day.invite.to) && typeof g.day.invite.text === "string" && g.day.invite.text.length <= 400)) delete g.day.invite;
    // Pickles (Stage 5): the day you became his human, and where he is today.
    if (g.dog != null && !(g.dog && typeof g.dog === "object" && (g.dog.adopted == null || day_(g.dog.adopted)))) delete g.dog;
    // Events (Stage 7): what you did at each, checked (save files are untrusted).
    if (g.events != null) {
      const ok = {}, int = x => Number.isInteger(x) && x >= 0 && x < 1e6;
      if (g.events && typeof g.events === "object" && !Array.isArray(g.events)) for (const [d, r] of Object.entries(g.events).slice(-40)) {
        const e = World.eventOn(d); if (!e || !r || r.k !== e.key) continue;
        const c = { k: e.key };
        if (int(r.score)) c.score = r.score; if (int(r.place) && r.place > 0) c.place = r.place; if (int(r.of) && r.of > 0) c.of = r.of;
        if (r.there === true) c.there = true; if (r.helped === true) c.helped = true;
        if (typeof r.trail === "string" && World.OLD_TRAILS.some(t => t.id === r.trail)) c.trail = r.trail;
        if (Array.isArray(r.top)) { const top = r.top.filter(x => Array.isArray(x) && (x[0] === "you" || (typeof x[0] === "string" && World.NAMED[x[0].slice(2)])) && int(x[1])).slice(0, 3).map(x => [x[0], x[1]]); if (top.length) c.top = top; }
        ok[d] = c;
      }
      if (Object.keys(ok).length) g.events = ok; else delete g.events;
    }
    if (g.poster != null && !(typeof g.poster === "string" && World.eventOn(g.poster))) delete g.poster;
    // Climbing trips (after Phase 4): the ones you've been on, an invitation, when the last one came.
    if (g.trips != null) { const t = Trips.clean(g.trips); if (t.length) g.trips = t; else delete g.trips; }
    if (g.tripOffer != null) { const o = g.tripOffer, ok = o && Trips.DESTS[o.key] && Trips.DESTS[o.key].who === o.who && day_(o.leave) && o.back === Trips.addDays(o.leave, Trips.LENGTH) && day_(o.made);
      if (ok) g.tripOffer = { key: o.key, who: o.who, leave: o.leave, back: o.back, made: o.made, ...(o.yes === true ? { yes: true } : {}) }; else delete g.tripOffer; }
    if (g.tripLast != null && !day_(g.tripLast)) delete g.tripLast;   // the event whose poster you've seen (Stage 8)
    if (g.day && g.day.trail != null && g.day.trail !== true) delete g.day.trail;
    // The Clean-Up (after Phase 4): the pieces you've picked up today.
    if (g.day && g.day.cleanup != null) { const m = g.day.cleanup && Array.isArray(g.day.cleanup.mine) ? [...new Set(g.day.cleanup.mine.filter(i => Number.isInteger(i) && i >= 0 && i < Cleanup.N))] : null; if (m && m.length) g.day.cleanup = { mine: m }; else delete g.day.cleanup; }
    if (g.day && g.day.busy != null && g.day.busy !== true) delete g.day.busy;
    // Rowan (Stage 6): G.romance checked and cleaned; today's sunset state only if it's one we know.
    if (g.romance != null) { const r = Social.cleanRomance(g.romance); if (r) g.romance = r; else delete g.romance; }
    if (g.day && g.day.sunset != null && !["asked", "no", "yes", "told", "watched"].includes(g.day.sunset)) delete g.day.sunset;
    if (g.day && g.day.invite && g.day.invite.sunset != null && g.day.invite.sunset !== true) delete g.day.invite.sunset;
    if (g.day && g.day.dog != null && !(g.day.dog && ["rock", "lot", "follow", "home", "with"].includes(g.day.dog.mode) && (g.day.dog.until == null || num_(g.day.dog.until)))) delete g.day.dog;
    if (g.day && g.day.dog) g.day.dog = { mode: g.day.dog.mode, ...(num_(g.day.dog.until) ? { until: g.day.dog.until } : {}), ...(g.day.dog.followed === true ? { followed: true } : {}), ...(g.day.dog.adopting === true ? { adopting: true } : {}), ...(g.day.dog.wentHome === true ? { wentHome: true } : {}) };
    if (g.day && g.day.dog && g.day.dog.mode === "with" && !g.day.dog.adopting && !(g.dog && g.dog.adopted)) g.day.dog = { mode: "rock" };
    if (g.lastInvite != null && !(g.lastInvite && CLIMB_WITH.includes(g.lastInvite.who) && day_(g.lastInvite.date))) delete g.lastInvite;
    if (g.lvlOn != null) { const l = {}; if (typeof g.lvlOn === "object") for (const [k, v] of Object.entries(g.lvlOn)) if (/^\d{1,2}$/.test(k) && day_(v)) l[k] = v; g.lvlOn = l; }
    // Beta from people (Phase 4, Stage 3): { who: [date, move, "alt" | "move" | "none"] } per line;
    // Phase 3's single tip (tipped) counts as one from someone unknown ("?"). Falls per move (fx).
    for (const [k, st] of Object.entries(g.ps || {})) {
      if (!st || typeof st !== "object") continue;
      const n = D.problems[+k] ? Mech.sequence(D.problems[+k]).n : 0, tips = {};
      if (st.tips && typeof st.tips === "object" && !Array.isArray(st.tips)) for (const [w, t] of Object.entries(st.tips).slice(0, 40))
        if ((w === "?" || /^c\d{1,5}$/.test(w) || World.isWho(w)) && Array.isArray(t) && /^\d{4}-\d\d-\d\d$/.test(String(t[0])) && Number.isInteger(t[1]) && t[1] >= -1 && t[1] < n && ["alt", "move", "none"].includes(t[2])) tips[w] = [t[0], t[1], t[2]];
      if (st.tipped && !Object.keys(tips).length) tips["?"] = [g.date || "2025-09-06", -1, "move"];
      if (Object.keys(tips).length) { st.tips = tips; st.tipped = true; } else delete st.tips;
      if (st.fx != null && !(Array.isArray(st.fx) && st.fx.length === n && st.fx.every(v => Number.isInteger(v) && v >= 0 && v < 1e5))) delete st.fx;
    }
    const fix = name => (name == null || D.sectorBy.has(name) ? name : OLD_SECTOR_NAMES[name] || null);
    g.loc = g.loc || { sector: null, boulder: null };
    const b = Number.isInteger(g.loc.boulder) ? D.boulders[g.loc.boulder] : null;
    g.loc.sector = fix(g.loc.sector);
    if (b && g.loc.sector !== b.sector) g.loc.sector = b.sector;          // standing at a boulder: that's its sector
    if (!b) g.loc.boulder = null;
    if (g.loc.sector != null && !D.sectorBy.has(g.loc.sector)) g.loc = { sector: null, boulder: null };
    g.visited = [...new Set((g.visited || []).map(fix).filter(Boolean))];
    if (g.know && g.know.areas && typeof g.know.areas === "object") {
      const a = {};
      for (const [k, v] of Object.entries(g.know.areas)) { const f = fix(k); if (f) a[f] = Math.max(a[f] || 0, v); }
      g.know.areas = a;
    }
    return g;
  }
  // What a climber has learned to do at the boulder (Stage 3). A save from before
  // it knows what a climber at its level would have picked up by now (brushing from
  // V1, working moves from V3 or once you've projected, tape from V5, reading the
  // conditions from V6); the rest the regulars teach as it comes up.
  const LEARNABLE = ["brush", "work", "tape", "read"];
  function learnedFor(g) {
    const isDate = v => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v);
    if (g.learned && typeof g.learned === "object" && !Array.isArray(g.learned)) {
      for (const k of Object.keys(g.learned)) if (!LEARNABLE.includes(k) || !isDate(g.learned[k])) delete g.learned[k];
      return g;
    }
    const L = g.player ? Mech.levelOf(g.player).level : 0, on = isDate(g.date) ? g.date : START_DATE;
    const projected = Object.values(g.ps || {}).some(s => s && s.att >= 3);
    g.learned = {};
    if (L >= 1 || (g.ticks || []).length) g.learned.brush = on;
    if (L >= 3 || projected) g.learned.work = on;
    if (L >= 5) g.learned.tape = on;
    if (L >= 6) g.learned.read = on;
    // Old learning: not "New" in the menu.
    if (g.day) { g.day.used = g.day.used || {}; for (const k of Object.keys(g.learned)) g.day.used[k] = true; }
    return g;
  }
  const loadScript = src => new Promise((ok, fail) => {
    const el = document.createElement("script");
    el.src = `${src}?v=${Date.now()}`; el.onload = ok; el.onerror = () => fail(new Error(`${src} didn't load`));
    document.head.appendChild(el);
  });
  async function boot() {
    if (!window.Mech) await loadScript("mechanics.js");
    if (!window.Art) await loadScript("art.js");
    if (!window.World) await loadScript("world.js");
    if (!window.Know) await loadScript("knowledge.js");
    if (!window.Social) await loadScript("social.js");
    if (!window.Portraits) await loadScript("portraits.js");
    if (!window.Talk) await loadScript("talk.js");
    if (!window.Travel) await loadScript("travel.js");
    if (!window.Scene) await loadScript("scene.js").catch(() => {});        // without it, Try climbs from the panel
    D = await fetch("game-data.json" + ASSET_V).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    prepData();
    K = Know.make(D, () => G);
    connectDownloads();
    connectBoard();
    $("#save-file").onchange = e => onSaveFile(e.target.files[0]);
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ G }));
    const start = data => {
      G = (data && data.G) || load();
      if (G) {
        if (!G.id) G.id = newId(); if (!G.board) G.board = { joined: false }; if (DEV) { G.dev = true; G.board = { joined: false }; } migrateSave(G);
        // A climber from before the reopening: keep a copy of the old save, then convert it.
        if (G.v === 1 && G.day && rulesLive()) {
          try { localStorage.setItem(DEV ? OLD_RULES_COPY + "-dev" : OLD_RULES_COPY, localStorage.getItem(SLOT) || JSON.stringify(G)); } catch (e) { }
          // Converted on a copy: if anything goes wrong, you keep climbing under the old rules.
          const up = safely("converting your climber", () => upgrade(JSON.parse(JSON.stringify(G))));
          if (up) G = up;
        }
        // A climber from before Phase 3's balance: keep a copy, then regrade (on a copy too).
        if (G.bal !== BAL_NOW && G.day) {
          try { localStorage.setItem(DEV ? OLD_BALANCE_COPY + "-dev" : OLD_BALANCE_COPY, JSON.stringify(G)); } catch (e) { }
          const g2 = JSON.parse(JSON.stringify(G));
          if (safely("regrading your climber", () => regrade(g2)) != null) { if (justMigrated.has(G)) justMigrated.add(g2); G = g2; }   // if it fails, the old balance carries on
        } else if (G.day) safely("counting your sends", () => regrade(G));
        save();
      }
      if (G && (G.v === 1 || (G.v === 2 && (DEV || RULES2_LIVE))) && G.day) showGame(); else showCreator();
    };
    if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
  }
  boot().catch(err => {
    $("#loading").textContent = `Granite Hollow didn't load (${err.message || err}). Reload the page to try again.`;
  });
})();
