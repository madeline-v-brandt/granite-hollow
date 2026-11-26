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
  const PARK_SPOT = [-20, -4.6];          // where you get out of the car: behind it, in the lot's north row (art.js parks it there)
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
  const BETA_TIP = {
    crimpy: "Thumb-catch the crimp and drive with your feet.", slopey: "Keep your hips tight to the wall on the sloper.",
    pinchy: "Squeeze the pinch with your thumb pad, not the tip.", juggy: "Climb it fast and shake out on the big jug.",
    compression: "Toe hook the right side so you can squeeze.", dyno: "Pre-load low and look at the hold, not your feet.",
    technical: "There's a tiny smear left of the arête. Trust it.", powerful: "Bump your left hand instead of doing the big lock-off.",
    mantle: "Turn your hand around and press. Don't pull.", slab: "Stand up straight and weight your feet.",
    overhang: "Heel hook out right and the move goes static.", roof: "There's a kneebar under the lip.",
    traverse: "There's a no-hands rest on the ledge halfway.", highball: "The top-out is easier than it looks. Commit.",
    eliminate: "Ignore the arête. The sequence goes left.", reachy: "There's an intermediate pebble for shorter people.",
    bunchy: "Start with your feet higher than feels right.",
  };
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
  const UI = { tab: "here", expanded: new Set(), cl: { q: "", sector: "", lo: 0, hi: 13, sort: "logs", problem: null, view: "problems", done: "" }, pj: { view: null, sort: "recent" }, rk: { window: "12m", height: "", open: null, n: 25 }, busy: false, confirmReset: false };

  // ====================================================================== data
  function prepData() {
    D.sectorBy = new Map(D.sectors.map(s => [s.name, s]));
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
      day: null,
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
    return G.forecast.slice(0, FORECAST_DAYS);
  }
  function startDay(forward, rest, first = false) {
    if (!first) G.date = addDays(G.date, forward);
    // The forecast's odds are rolled now: rain comes with exactly the chance it gave.
    const fc = !first && (G.forecast || []).find(f => f.date === G.date);
    let w = fc ? Mech.realize(fc) : Mech.weather(monthOf(G.date));
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
      attempts: 0, sends: [], xp: 0, highpoints: 0, gains: {}, ach: [], met: [], encounter: null, last: null, bishop: Math.random() < 0.13,
      over: false, warned: false, levelBefore: Mech.levelOf(G.player).level };
    const intro = first && v2()
      ? `You pull into the Granite Hollow lot on ${an(w.sky.toLowerCase())} September morning, ${w.temp}°F. The park reopened to climbing last week, after nearly forty years. The kiosk's trail map (press M) marks three climbing areas: The Tailgate, right here by the car, The Schoolhouse and Hawkwatch. Beside it, under glass, is a page from the old climbers' notebook listing four problems by the lot. Everything else is waiting for a first ascent.`
      : first
      ? `You pull into the Granite Hollow lot on ${an(w.sky.toLowerCase())} September morning, ${w.temp}°F. The boulders at The Tailgate are right beside the car. The trail map (press M) shows the rest of the park: The Schoolhouse is 5 minutes up the trail.`
      : `${w.sky}, ${w.temp}°F. ${w.note}`;
    G.day.last = { kind: "info", title: first ? "Welcome to Granite Hollow" : `Day ${G.dayNo}`, text: intro };
    if (Mech.rainStart(w) === 0) {
      G.day.over = true; G.day.rainedOut = true;
      G.day.reason = `${w.pop != null ? `The ${Mech.rainChance(w)} came through, and the rock is soaked.` : `${w.precip === "Snow" ? "Snow" : "Rain"} all day.`} Wet granite is slick and holds can snap, so there's no climbing. It counts as a rest day.`;
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
    // Pickles is sometimes waiting by the car.
    if (v2() && !first && !G.day.over && isAround("n:pickles") && Math.random() < 0.35) { G.day.met.push("n:pickles"); G.day.encounter = buildRegular("n:pickles", START_AREA); }
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
  const chanceFor = i => Mech.chanceOf(G.player, D.problems[i], G.ps[i], G.day.weather);
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
    const p = D.problems[i];
    if (G.loc.boulder !== p.b) { travel({ sector: p.sector, boulder: p.b }); return null; }
    const st = pstate(i);
    const faded = fadeIfAway(p, st);
    const cost = Mech.attemptCost(G.player, p);
    const r = Mech.attempt(G.player, p, st, G.day.weather);
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
      G.ticks.push({ p: i, date: G.date, day: G.dayNo, style, att: st.att, stars: null });
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
      G.day.last = { kind: "send", title: fa ? `First ascent on ${p.boulder.name}, V${p.grade}` : `${style === "Repeat" ? "Repeat" : "Sent"}: ${titleOf(i)}`, text, xp, gains, tick: G.ticks.length - 1, p: i };
      note(`${fa ? "First ascent:" : style} ${pname(i)}${vg(i) ? ` (${vg(i)})` : ""}, +${fmt(xp)} XP.`);
      if (fa) UI.faNote = G.feed[0];                        // renamed along with the problem
      if (!opts.scene) showBanner(fa ? "FA" : style, i, xp, fa ? `${p.boulder.name} · V${p.grade}` : null);
      // After the banner: name your first ascent, then the level-up, then (if the day's over) the summary.
      const after = levelNow().level, next = [];
      if (fa) next.push(() => nameDialog(i, { first: true, was: openLabel }));
      if (after > before) next.push(() => showLevelUp(after));
      out = { r, style, fa: !!fa, xp, next };
      if (next.length && !opts.scene) {
        UI.levelPending = true;
        setTimeout(() => { UI.levelPending = false; next.forEach(openModal); nextModal(); }, reduceMotion ? 0 : fa ? 1300 : 900);
      }
    } else {
      const k = r.fallAt + 1, frac = k / p.moves, newHigh = st.att > 1 && frac > st.best + 1e-6;
      if (frac > st.best) { st.best = frac; if (newHigh) G.day.highpoints++; }
      if (sess) sess[2] = Math.max(sess[2], frac);
      const before = Mech.knowledge(p, st)[r.fallAt], L = Mech.learnBurn(G.player, p, st, r.fallAt, sess ? sess[1] : 1);
      let text = `${fallText(p, r.move, k)} Fell on move ${k} of ${p.moves}${r.move.kind === "crux" ? ", the crux" : ""}.`;
      if (faded) text = `It's been a while, and the moves feel unfamiliar again. ${text}`;
      if (newHigh) text += " New highpoint!";
      if (L.alt) text += ` Hanging there, you see a better way through: ${ALT[p.seq.alt.kind].see}`;
      else if (st.mk[r.fallAt] - before > 0.04 && st.att <= 6) text += r.move.kind === "crux" ? " You're starting to work out the crux." : " You worked out a bit more of the beta.";
      if (G.day.weather.cond <= -0.8 && Mech.frictionSensitivity(p) >= 0.6) text += " Everything is wet.";
      G.day.last = { kind: "fall", title: `${titleOf(i)}: attempt ${st.att}`, text, gains, p: i };
    }
    // Sharp granite and thin skin: flappers happen.
    if (G.player.skin < 30 && Mech.frictionSensitivity(p) >= 0.6 && Math.random() < 0.07) {
      G.player.skin = Math.max(0, G.player.skin - 12); G.player.energy = Math.max(0, G.player.energy - 8); G.flapper = true;
      G.day.last.text += " Then you tear a flapper on the sharp granite. Ouch. Tape it up or call it a day.";
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
  const easyFor = i => { const st = G.ps[i]; return !(st && st.att > 0 && !st.sent) && chanceFor(i) >= 0.8; };
  const pc = c => (c >= .1 ? Math.round(c * 100) + "%" : c >= .01 ? (Math.round(c * 1000) / 10) + "%" : c >= .002 ? "under 1%" : "almost none");
  const shift = (a, b) => (pc(a) === pc(b) ? `send ${pc(a)}, barely changes` : `send ${pc(a)} → ${pc(b)}`);
  const KNOW = v => (v >= 0.67 ? "well" : v >= 0.34 ? "fairly well" : v > 0.05 ? "a little" : "not yet");
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
    const f = Mech.feel(chanceFor(i)).label.toLowerCase();
    if (st && st.att) return `Back under ${pname(i)}. ${st.att} ${st.att === 1 ? "try" : "tries"} so far, and it feels ${f === "not yet" ? "out of reach for now" : f} today.`;
    return `You drop your pad under ${pname(i)} and look up at it. ${p.moves} moves to the top${p.sit ? ", from a sit start" : ""}. From the ground, it feels ${f === "not yet" ? "out of reach for now" : f}.`;
  }
  // The cards, through K (so an unclimbed line has no grade), and the menu with what
  // each choice would do to your chance of sending.
  function refreshClimb() {
    if (!SC || !climbing()) return;
    const i = G.day.climb.p, p = D.problems[i], st = G.ps[i] || { att: 0, beta: 0 }, w = G.day.weather, L = levelNow(), left = w.dusk - G.day.minute;
    SC.setCards({
      prob: { name: pname(i), grade: vg(i), where: `${K.boulderName(p.b) || "Unfamiliar boulder"} · ${p.sector}`, tags: p.tagList, strip: moveStrip(i),
        hp: st.sent ? (st.flash ? "Flashed" : "Sent") : st.att ? `Highpoint move ${Math.round(st.best * p.moves)} of ${p.moves}` : `${p.moves} moves`,
        feel: st.sent ? null : Mech.feel(chanceFor(i)).label,
        beta: st.att && !st.sent ? `Beta ${Math.min(100, Math.round((st.beta || 0) / Mech.BETA_MAX * 100))}% worked out${st.alt ? " · a better way found" : ""}` : null },
      me: { name: G.player.name, level: L.level, energy: G.player.energy, skin: G.player.skin, clock: clock(Math.min(G.day.minute, w.dusk)),
        light: left <= 0 ? "dark" : left >= 120 ? `${Math.floor(left / 60)} h ${left % 60} min of light` : `${left} min of light` },
    });
    SC.setMenu(climbMenu(i));
  }
  function climbMenu(i) {
    const p = D.problems[i], st = G.ps[i] || { att: 0, beta: 0 }, day = G.day.weather, now = chanceFor(i), worked = (G.day.worked || {})[i] || 0;
    if (G.day.climb.view === "work") {
      const mk = Mech.knowledge(p, { ...st }), seen = Math.max(1, Mech.seenOf(p, st));
      const items = p.seq.moves.slice(0, seen).map((m, j) => ({ key: "work:" + j, label: `Move ${j + 1}${m.kind === "crux" ? ", the crux" : m.kind === "top" ? ", the top-out" : ""}`,
        sub: `${an(m.hold)}, known ${KNOW(mk[j])} · ${shift(now, Mech.previewWork(G.player, p, st, day, j, worked + 1).kept)}` }));
      return [...items, { key: "back", label: "Back", wide: items.length % 2 === 0 }];
    }
    if (st.sent) return [{ key: "again", label: "Climb it again", sub: "A repeat, for fun", primary: true, disabled: G.day.over }, { key: "leave", label: "Leave", sub: "Back to the map" }];
    const c = Mech.attemptCost(G.player, p), wc = Mech.workCost(G.player, p), seen = Math.max(1, Mech.seenOf(p, st));
    const gains = st.att ? Array.from({ length: seen }, (_, j) => Mech.previewWork(G.player, p, st, day, j, worked + 1).kept) : [now];
    const bestAt = gains.indexOf(Math.max(...gains)), bestName = p.seq.moves[bestAt].kind === "crux" ? "the crux" : `move ${bestAt + 1}`;
    const full = G.player.energy >= G.day.startEnergy - .5;
    return [
      { key: "burn", label: `Send burn · ${pc(now)}`, sub: `Chance to send · ${Math.round(c.energy)} energy · ${Math.round(c.minutes)} min`, primary: true, disabled: G.day.over },
      { key: "work", label: "Work a move", sub: st.att ? `Best: ${bestName}, ${shift(now, gains[bestAt])} · ${Math.round(wc.energy)} energy` : "Give it a burn first", disabled: G.day.over || !st.att },
      { key: "rest", label: "Rest", sub: full ? "You're fresh" : `20 min · +${Math.round(Mech.restGain(G.day.rests || 0))} energy · ${shift(now, Mech.previewRest(G.player, p, st, day, G.day.rests || 0, G.day.startEnergy))}`, disabled: G.day.over || full },
      { key: "leave", label: "Leave", sub: "Back to the map" },
    ];
  }
  async function climbAction(k) {
    const i = G.day.climb.p;
    if (k === "leave") { closeClimb(); return; }
    if (k === "work") { G.day.climb.view = "work"; refreshClimb(); SC.say("Which move? You can pull on partway up and try it on its own."); return; }
    if (k === "back") { G.day.climb.view = "main"; refreshClimb(); SC.say(G.day.climb.say || climbIntro(i)); return; }
    if (k === "rest") { rest(); afterClimb([]); return; }
    if (k === "burn" || k === "again") { await burnInScene(i); return; }
    if (k.startsWith("work:")) { await workInScene(i, +k.slice(5)); return; }
  }
  // After anything in the scene: its words, the cards and menu again; if the day is
  // over (dusk, rain, out of energy or skin), the scene closes before the dialogs
  // (naming, level-up, the day's summary) open.
  function afterClimb(next) {
    if (!climbing()) return;
    G.day.climb.say = G.day.last && G.day.last.text;
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
    if (SC.busy() || G.day.over) return;
    const p = D.problems[i], st = pstate(i), m = p.seq.moves[at];
    G.day.climb.view = "main";
    const faded = fadeIfAway(p, st);
    sessionOf(st);
    const c = Mech.workCost(G.player, p);
    G.player.energy = Math.max(0, G.player.energy - c.energy); G.player.skin = Math.max(0, G.player.skin - c.skin); G.day.minute += c.minutes;
    const worked = G.day.worked = G.day.worked || {}, n = worked[i] = (worked[i] || 0) + 1;
    const w = Mech.workMove(G.player, p, st, G.day.weather, at, n);
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
    if (rainNow()) { endDay(`It started ${w.precip === "Snow" ? "snowing" : "raining"} at ${clock(Mech.rainStart(w))}. Wet granite is slick and holds can snap, so you pack up and head home.`); return; }
    if (d.minute >= w.dusk) { duskOut(); return; }
    if (Mech.rainStart(w) != null && !d.rainWarned && d.minute >= Mech.rainStart(w) - 45) {
      d.rainWarned = true; toast("Clouds rolling in", `${w.precip === "Snow" ? "Snow" : "Rain"} is on its way, due around ${clock(Mech.rainStart(w))}. Get your last burns in.`, "info");
    } else if (w.pop && w.rainFrom && Mech.rainStart(w) == null && !d.rainWarned && d.minute >= w.rainFrom) {
      d.rainWarned = true; toast("The rain held off", "Clear skies after all. Keep climbing until dusk.", "info");
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
    endDay(out > 1 ? `The light's going, so you follow the trail back to the lot, ${out} minutes in the last of the daylight.` : "The light's gone, and the park closes at dusk.");
  }

  // What you know about rain today: a coming shower once the clouds roll in,
  // otherwise the forecast's chance, until its time has passed.
  function rainHud(w) {
    const ra = Mech.rainStart(w);
    if (G.day.over || ra === 0) return "";
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
    G.day.last = { kind: "info", title: "Twenty minutes on the pad", text: ["You eat a snack, retape a finger, and watch someone flail on a warm-up. Energy recovers a little; skin doesn't.",
      "You lie back on the pad and watch the clouds. Your forearms stop buzzing.", "A drink, a stretch, a look at the holds from below. Energy comes back; skin doesn't."][n % 3] };
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
    if (v2()) {
      if (now.sector && K.visitArea(now.sector)) toast(`New area: ${now.sector}`, "You've found a climbing area that isn't on the kiosk map.", "find");
      if (now.boulder != null && K.boulder(now.boulder) >= 1) K.visitBoulder(now.boulder);
    }
    if (now.sector && !G.visited.includes(now.sector)) G.visited.push(now.sector);
    if (opts.quiet) return;
    if (now.sector && now.sector !== prev.sector) {
      G.day.encounter = null;
      G.day.last = { kind: "info", title: now.sector, text: sectorBlurb(now.sector) };
      maybeEncounter(now.sector);
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

  function endDay(reason) {
    G.day.over = true; G.day.reason = reason;
    note(`Headed home: ${G.day.sends.filter(s => s.style !== "Repeat").length} new sends, +${fmt(G.day.xp)} XP.`);
    save(); renderAll();
    if (UI.levelPending || modalOpen()) UI.summaryPending = true;   // it opens once the naming and level-up have closed
    else showSummary();
  }

  // ============================================================== encounters
  function maybeEncounter(sector) {
    if (G.day.met.filter(x => typeof x === "number").length >= 3) return;      // strangers: three a day at most
    if (v2()) { const w = regularFor(sector); if (w) { G.day.met.push(w); G.day.encounter = buildRegular(w, sector); return; } }
    if (Math.random() > 0.55) return;
    const pool = D.npcsBySector.get(sector).filter(ci => !G.day.met.includes(ci) && (!v2() || G.world.npc["c" + ci]));
    if (!pool.length) return;
    const weight = ci => ({ local_hero: 4, regular: 2.5, occasional: 1, tourist: 1 })[D.climbers[ci][2]] || 1;
    const total = d3.sum(pool, weight);
    let r = Math.random() * total, ci = pool[0];
    for (const c of pool) { r -= weight(c); if (r <= 0) { ci = c; break; } }
    G.day.met.push(ci);
    G.day.encounter = buildEncounter(ci, sector);
  }
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
  function buildEncounter(ci, sector) {
    const [name, h, type] = D.climbers[ci];
    const w = G.day.weather;
    const greet = {
      local_hero: [`Hey, I'm ${name}. I'm out here most days.`, `Morning. ${name}. I've probably climbed everything in this sector twice.`],
      regular: [`Hey! ${name}. Nice day for it.`, `Oh hi, I'm ${name}. Come here most weekends.`],
      occasional: [`Hi, I'm ${name}. First time in this sector in a while.`, `${name}. Trying to get out more this season.`],
      tourist: [`Hi! ${name}. Visiting from out of state. This granite is sharp!`, `${name}, just passing through. Any good warm-ups?`],
    }[type];
    let line = pick(greet);
    if (w.cond >= 0.3) line += " Friction's amazing today."; else if (w.cond <= -0.3) line += " Pretty greasy out here though.";
    const { rec, recLine } = recommend("c" + ci, sector, D.liked[ci], h);
    return { ci, who: "c" + ci, sector, line, rec, recLine, beta: betaFor(sector), accepted: false, betaTaken: false };
  }
  // A recommendation: something they liked that suits you (or the best fit here).
  function recommend(who, sector, liked, h) {
    const documented = i => !v2() || !!G.world.est[i];        // under the new rules, only what's been climbed
    let ranked = (liked || []).filter(i => !G.ps[i]?.sent && documented(i)).map(i => [i, playerFit(i)]).filter(x => x[1] > -4).sort((a, b) => b[1] - a[1]);
    let theirs = ranked.length > 0;
    if (!ranked.length) ranked = D.sectorProblems.get(sector).filter(i => !G.ps[i]?.sent && documented(i)).map(i => [i, playerFit(i)]).sort((a, b) => b[1] - a[1]);
    const rec = ranked.length ? ranked[Math.floor(Math.random() * Math.min(3, ranked.length))][0] : null;
    let recLine = "";
    if (rec != null) {
      K.tell(rec, who, G.date);                              // they've told you about it, so now you know
      const p = D.problems[rec], why = whyFor(rec);
      const where = p.sector === sector ? `right here on ${p.boulder.name}` : `over at ${p.sector}`;
      recLine = `You should try ${titleOf(rec)}, ${where}. ${theirs ? "One of my favorites. " : ""}I think ${why.slice(0, 2).join(" and ")}.`;
      if (h != null && Math.abs(h - G.player.height) <= 5) recLine += " We're about the same height, so trust me.";
    }
    return { rec, recLine };
  }
  // Beta for a project you're working in this sector.
  function betaFor(sector) {
    const projects = D.sectorProblems.get(sector).filter(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 3 && !G.ps[i].tipped);
    if (!projects.length || Math.random() >= 0.7) return null;
    const pi = projects.sort((a, b) => G.ps[b].att - G.ps[a].att)[0], p = D.problems[pi];
    const a = Mech.altFor(G.player, p);
    if (a && !G.ps[pi].alt) return { p: pi, text: `Saw you working ${pref(pi)}. ${ALT[a.kind].tip}` };
    const worst = p.tagList.filter(t => BETA_TIP[t]).sort((a, b) => (G.player.skills[a] ?? Mech.morph(G.player, p)) - (G.player.skills[b] ?? Mech.morph(G.player, p)))[0];
    return { p: pi, text: `Saw you working ${pref(pi)}. ${BETA_TIP[worst] || "Try it with more confidence on the first move."}` };
  }

  // ---- the regulars (Stage 5): people you get to know. Who's around, where,
  // and what they say. Names, places and lines only ever come through K.
  const REGULAR_TALK = {
    gus: { hello: ["Ranger Gus. Welcome to the Hollow. You're one of the first climbers allowed back in since '87, you know.", "Morning! Gus. I look after the park. Mostly I look after Pickles."],
      again: ["Morning! Pack it in, pack it out. You know the drill.", "Pickles has been asking about you. Well. Staring at your car.", "If you see anyone feeding the geese, tell them Gus said no."] },
    rowan: { hello: ["Oh! Hi. Sorry, I was sketching. I'm Rowan. This boulder has the best shadows in the morning.", "Hi, I'm Rowan. I come up here to draw the rocks and occasionally climb one."],
      again: ["Hey, you're back! I was hoping someone would come up here.", "I've drawn this spot about six times now. It keeps changing with the light.", "Want to see what I've got so far? It's mostly lines. Some of them are even climbing lines.", "You climb like you're listening to the rock. Is that a weird thing to say? That's a weird thing to say."] },
    hollis: { hello: ["Hollis Pruitt. I'm keeping notes on everything that goes up out here. Somebody has to.", "Hollis. I've documented every problem in this park. Some of them twice, in case the first one was wrong."],
      again: ["Back again! I've updated the notes. Twice.", "Did you know the schoolhouse kids used these boulders as a recess spot? I have a whole page on it.", "Every line out here has a story. Most of them are mine, now."] },
    otis: { hello: ["Otis! Isn't it perfect sending weather?", "Name's Otis. Perfect day for it, isn't it?"],
      again: ["Perfect sending weather!", "I've been on the same slab since August. It's a relationship now.", "Some days you send, some days you sit on your pad and eat a sandwich. Both are climbing."] },
    bea: { hello: ["I'm Bea! Have you tried jumping for it? You should always try jumping for it.", "Hi! Bea. Did you see that? I almost stuck it. Almost!"],
      again: ["Did you see that? I almost stuck it! Almost!", "My mom drops me off on her way to work. Best deal ever.", "Okay but what if you just jumped?"] },
    dez: { hello: ["Dez. Good to meet you.", "…Dez. Hi."],
      again: ["Mm. Good conditions.", "You're getting strong.", "Nice to see you out."] },
  };
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
  const LOOKS = {
    gus: { shirt: "#5f6b2d", pants: "#4a4031", hat: "cap", hatC: "#5f6b2d", skin: "#d1a27c", hair: "#9a958c", pad: null, longSleeves: true },
    bishop: { shirt: "#9b3b2f", stripes: "rgba(30,20,15,.35)", pants: "#4b4a52", hat: null, skin: "#e2b996", hair: "#e6e2da", pad: null, longSleeves: true },
    rowan: { shirt: "#e0b04a", pants: "#3c4a5c", hat: null, skin: "#a8734f", hair: "#2b1d16", pad: "#5a7d5a", chalk: "#e3dccb" },
    hollis: { shirt: "#5f7fa6", pants: "#6b6457", hat: "bucket", hatC: "#8a7a55", skin: "#f0c9a6", hair: "#7a5a3a", pad: "#c9772b", chalk: "#2f6b4f" },
    otis: { shirt: "#c46a3a", pants: "#2e3440", hat: "headband", hatC: "#d0a23a", skin: "#7a5038", hair: "#1e1a18", pad: "#2e4f6e", chalk: "#b5462e" },
    bea: { shirt: "#b0436e", stripes: "rgba(255,255,255,.4)", pants: "#2e3440", shorts: true, hat: null, skin: "#c08a64", hair: "#3a2418", pad: "#3f7fa6", chalk: "#d0a23a" },
    dez: { shirt: "#3b3f46", pants: "#5b4a3a", hat: "beanie", hatC: "#6d5aa8", skin: "#5e3b2a", hair: "#151210", pad: "#a43b2f", chalk: "#e3dccb" },
  };
  let peopleCache = { key: "", list: [] };
  function peopleToday() {
    if (!v2()) return [];
    const key = G.date + "|" + !!G.day.bishop + "|" + Object.keys(G.world.npc).length;
    if (peopleCache.key === key) return peopleCache.list;
    const r = World.stream(G.world.seed, "people|" + G.date), list = [];
    for (const w of [...World.CLIMBING_REGULARS, "n:gus", "n:bishop"]) {
      const key2 = w.slice(2), n = World.NAMED[key2], out = r(), pa = r(), pb = r(), ps = r();     // drawn whatever happens, so one person doesn't move another
      if (!isAround(w) || (key2 === "bishop" ? !G.day.bishop : out > (key2 === "gus" ? .55 : .45))) continue;
      const area = n.home[Math.floor(pa * n.home.length)], bs = D.boulders.filter(b => b.sector === area);
      if (!bs.length) continue;
      list.push({ who: w, name: n.name.replace(/^the /, "The "), b: bs[Math.floor(pb * bs.length)].id, side: ps < .5 ? -1 : 1, look: LOOKS[key2] || {} });
    }
    peopleCache = { key, list };
    return list;
  }
  // Walking up to someone (within a few metres of them) starts a conversation, once a day each.
  function meetNearby(pos) {
    if (!v2() || G.day.over) return false;
    // Pickles, napping by Pickles' Rock.
    const dog = M.paint && M.paint.scene.landmarks.find(l => l.kind === "dog");
    if (dog && isAround("n:pickles") && !G.day.met.includes("n:pickles") && Math.hypot(pos[0] - dog.x, pos[1] - dog.y) < 6) {
      G.day.met.push("n:pickles"); G.day.encounter = buildRegular("n:pickles", "The Tailgate", { napping: true }); return true;
    }
    for (const p of peopleToday()) {
      if (G.day.met.includes(p.who)) continue;
      const at = M.paint && M.paint.personAt(p.who); if (!at) continue;
      if (Math.hypot(pos[0] - at.x, pos[1] - at.y) < 7) { G.day.met.push(p.who); G.day.encounter = buildRegular(p.who, D.boulders[p.b].sector); return true; }
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
  // Something of yours or theirs worth mentioning: your latest first ascent, or theirs.
  function remarkFor(w) {
    const W = G.world, since = addDays(G.date, -3);
    const mine = Object.entries(W.est).filter(([p, e]) => e.by === "you" && e.date >= since && e.date < G.date).sort((a, b) => (a[1].date < b[1].date ? 1 : -1))[0];
    if (mine && Math.random() < 0.6) return pick([`Saw your name in CragLog. ${pname(+mine[0])}! Nice.`, `I heard you got the first ascent of ${pname(+mine[0])}. What's it like?`]);
    const theirs = Object.entries(W.est).filter(([p, e]) => e.by === w && e.date >= addDays(G.date, -10)).sort((a, b) => (a[1].date < b[1].date ? 1 : -1))[0];
    if (theirs) {
      const p = +theirs[0], b = D.problems[p].b, s = D.boulders[b].sector;
      if (K.line(p) === "est") return `I finally put up ${pname(p)} on ${D.boulders[b].name}. You should try it.`;
      return `I put up something new ${K.area(s) >= 1 ? "at " + s : World.AREAS[s]?.hint || "out in the woods"} this week. Still buzzing.`;
    }
    return "";
  }
  const BISHOP_YEARS = [1971, 1973, 1974, 1976, 1977, 1978, 1979, 1981, 1983, 1986];
  const BISHOP_HOW = ["In work boots.", "Without a pad. We didn't have pads. We had a doormat.", "In the rain, mind you.", "Dot spotted me. Or I spotted her. One of the two.",
    "Backwards, as I recall.", "Twice. The second time for fun.", "Wearing a tie. It was a Sunday.", "With a stick. No, that was the other one."];
  function bishopClaim() {
    const sentToday = G.day.sends.filter(s => s.style !== "Repeat").map(s => s.p), proj = Object.keys(G.ps).map(Number).filter(i => !G.ps[i].sent && G.ps[i].att >= 3 && K.visible(i));
    const yy = String(pick(BISHOP_YEARS)).slice(2);
    if (sentToday.length) return `${pname(pick(sentToday))}? Oh, I did that one in '${yy}. ${pick(BISHOP_HOW)} Nice to see somebody repeat it.`;
    if (proj.length) return `Still on ${pname(pick(proj))}? I did that in '${yy}. ${pick(BISHOP_HOW)} Dot will tell you different, but Dot's not here, is she?`;
    return pick([`Back in '${yy} we climbed everything out here. Everything. Nobody wrote any of it down, of course.`, `You know who put up the first problem in this park? Me. Well. Me and Dot. Mostly me.`,
      `They call me the Bishop. Don't ask why. It's a long story, and most of it's true.`]);
  }
  function buildRegular(w, sector, ctx = {}) {
    const key = w.slice(2), n = World.NAMED[key], r = K.meet(w, G.date), first = r.n === 1;
    const e = { who: w, sector, line: "", rec: null, recLine: "", beta: null, accepted: false, betaTaken: false };
    if (key === "pickles") {
      e.line = ctx.napping
        ? pick(first ? ["A scruffy dog is napping in the shade of the boulder. His tag says PICKLES. His tail thumps when he sees you."]
          : ["Pickles is napping in the shade of his rock. His tail thumps twice when he sees you.", "Pickles opens one eye, decides you're a friend, and rolls over for a belly rub.", "Pickles is guarding a very important stick beside his rock."])
        : pick(first ? ["A scruffy dog trots over from the lot, tail going. His tag says PICKLES."] : ["Pickles trots over from the lot, tail going.",
          "Pickles has found a stick and would like you to admire it.", "Pickles is supervising the parking lot. He wags when he sees you."]);
      e.pet = true; return e;
    }
    if (key === "bishop") {
      e.say = true;     // narration with his words in it, not a plain quote
      e.line = first ? `A tall old man in a flannel shirt looks you up and down. “They call me the Bishop. I climbed here before you were born. ${bishopClaim()}”` : `“${bishopClaim()}”`;
    } else {
      const t = REGULAR_TALK[key];
      e.line = pick(first ? t.hello : t.again);
      if (key === "otis" && G.day.weather.cond <= -0.3 && !first) e.line += " Well. Perfect-ish.";
      const rm = first ? "" : remarkFor(w); if (rm) e.line += " " + rm;
    }
    // What they offer: the way to an area, a line you haven't noticed, or a recommendation (and beta).
    const strong = key === "dez" || key === "bishop" || (n.level || 0) >= 9;
    const dirTo = directionsTo(), hidden = hiddenLineFor(strong);
    const chanceDir = key === "hollis" || key === "gus" ? 0.7 : key === "bishop" ? 0.4 : 0.3;
    if (dirTo && Math.random() < chanceDir) { e.dir = dirTo; e.dirLine = key === "bishop" ? `He taps the side of his nose. “Ever been ${World.AREAS[dirTo]?.hint || "further out"}? There's rock out there nobody's looked at properly since '79.”` : `Have you been ${World.AREAS[dirTo]?.hint || "further out"} yet? There's good rock out there.`; }
    else if (hidden != null && Math.random() < (strong ? 0.6 : 0.25)) {
      const b = D.problems[hidden].b;
      e.reveal = hidden;
      e.revealLine = key === "bishop" ? `“There's a line on ${D.boulders[b].name} nobody's done since me,” he says. “Ha.”` : key === "dez" ? `There's a line on ${D.boulders[b].name}. Hard. Nobody's touched it.` : `Have you seen the line on ${D.boulders[b].name}? It's easy to miss.`;
    } else if (key !== "bishop") Object.assign(e, recommend(w, sector, null, n.h));
    if (key !== "bishop") e.beta = betaFor(sector);
    return e;
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
  // Sitting down with someone for twenty minutes: a rest, in company, and a story.
  const CHATS = {
    gus: ["Gus tells you about the closure in '87: insurance, mostly, and one very loud town meeting. “Took thirty-eight years and a new county commissioner to get that gate open again.”",
      "Gus explains that Pickles turned up at the lot as a puppy one spring and simply never left. “He's not my dog. I just feed him. Every day. And he sleeps in my truck.”",
      "Gus points out the old quarry road through the trees, and the stone wall the farmers built before there was a park. “Everything out here was something else first.”"],
    bishop: ["The Bishop tells you how the crag got its name. The story takes nineteen minutes, involves a mule, and doesn't seem to be about the crag.",
      "The Bishop says Dot was the best climber he ever saw. He says it quietly, and for once he doesn't add anything funny.",
      "The Bishop shows you how they used to tape their fingers in the seventies. It involves electrical tape. You decide not to try it."],
    rowan: ["Rowan shows you a sketchbook full of boulders, each with tiny arrows for the moves. “I can't always climb them. But I can draw them.”",
      "Rowan moved to the village in the spring for a job at the library, and found the park by accident on a walk. “I thought the rocks looked like they wanted to be climbed.”",
      "You talk about nothing much for twenty minutes: the light on the rock, the best sandwich in the village, a song you both half-remember. It's nice."],
    hollis: ["Hollis has a binder. An actual binder, with tabs. Every problem in the park is in it, with sketches, and some of them have footnotes.",
      "Hollis explains that the schoolhouse boulders are named after the 1920s attendance book. “Somebody had to. It might as well be accurate.”",
      "Hollis admits to never having made a first ascent. “I'm a historian. Someone has to write it down.” Then, quieter: “There's one I've been looking at, though.”"],
    otis: ["Otis has been climbing since 1994, mostly at the same three crags. “People ask why. Well, look at it.” You look at it. He has a point.",
      "Otis shares half his sandwich. It's an excellent sandwich. He's been on the same slab since August and says it's the best thing he's ever not done.",
      "Otis tells you about the one time it was truly bad weather. Then he decides it wasn't that bad."],
    bea: ["Bea demonstrates a dyno on a log. She doesn't stick it. She is delighted anyway.",
      "Bea wants to know your hardest send, your favourite problem, your shoe size and whether you've ever fallen off the top of something. All at once.",
      "Bea admits she's a bit scared of highballs. “Don't tell anyone. Especially Dez.”"],
    dez: ["Dez doesn't say much. You sit and watch the light move across the rock. After a while: “That one's been bugging me for a month.”",
      "Dez says the trick to hard climbing is resting properly. Then demonstrates, by lying down on the pad and closing their eyes.",
      "Dez asks what you're working on, and listens properly to the whole answer. “You'll get it,” Dez says, as if it's a fact."],
  };
  function sitChat() {
    const e = G.day.encounter; if (!e || !e.who || !e.who.startsWith("n:") || e.pet || e.chatted || UI.busy || G.day.over) return;
    const key = e.who.slice(2), r = K.chat(e.who, G.date), lines = CHATS[key] || ["You sit and talk for a while."];
    e.chatted = lines[(r.chats - 1) % lines.length];
    G.day.minute += 20;
    G.player.energy = Math.min(G.day.startEnergy, G.player.energy + 15);
    note(`Sat and talked with ${whoOf(e.who).replace(/^the /, "the ")}.`);
    afterAction();
  }
  function petDog() {
    const e = G.day.encounter; if (!e || !e.pet || e.petted) return;
    const n = K.pet(e.who, G.date);
    e.petted = n < 3 ? "He leans into your hand." : n < 10 ? "He leans his whole weight against your leg and sighs." : "He follows you a few steps toward the trail before Gus whistles him back.";
    save(); renderAll();
  }
  function acceptTip() {
    const e = G.day.encounter; if (!e || e.rec == null) return;
    e.accepted = true;
    if (!G.tips.some(t => t.p === e.rec && !t.done)) G.tips.push({ p: e.rec, from: e.ci ?? e.who, date: G.date, why: whyFor(e.rec), done: false });
    note(`${whoOf(e.ci ?? e.who)} recommended ${pname(e.rec)}.`);
    save(); renderAll();
  }
  function takeBeta() {
    const e = G.day.encounter; if (!e || !e.beta) return;
    const st = pstate(e.beta.p), what = Mech.tip(G.player, D.problems[e.beta.p], st); st.tipped = true; e.betaTaken = true;
    note(`Got beta for ${pref(e.beta.p)} from ${whoOf(e.ci ?? e.who)}.`);
    toast("Beta unlocked", what === "alt" ? `There's a better way through the crux of ${pname(e.beta.p)}.` : `You've a clearer picture of the crux of ${pname(e.beta.p)}.`, "info");
    save(); renderAll();
  }

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
      onPerson: who => { const p = personSpot(who); if (p) goToPoint(p); },
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
    const trailPts = S.trails.map(t => t.pts), wet = p => S.inWater(p, 0);
    const Wk = Travel.make({ trails: trailPts, blocked: wet }), Wm = Travel.make({ trails: trailPts, blocked: wet, rate: Travel.MANUAL });
    const SPEED = { trail: 20, off: 14 };                // metres a second on screen (about the clock's 50 : 35)
    const [bx0, bx1, by0, by1] = S.bounds, edge = 60;
    const inPark = p => p[0] > bx0 + edge && p[0] < bx1 - edge && p[1] > by0 + edge * .6 && p[1] < by1 - edge;
    const boulderAt = p => S.boulders.find(bo => Math.hypot(p[0] - bo.b.x, p[1] - bo.b.y) < bo.form.R * .9 + .5);
    // Parked cars (art.js): about 3.8 m wide and 4.3 m long, nosed into their spaces.
    const cars = S.marks.filter(m => m.kind === "car").map(m => ({ x0: m.x - 2.1, x1: m.x + 2.1, y0: m.y - (m.rot ? 3.5 : 1.2), y1: m.y + (m.rot ? 1.2 : 3.5) }));
    const carAt = p => cars.some(c => p[0] > c.x0 && p[0] < c.x1 && p[1] > c.y0 && p[1] < c.y1);
    const solid = p => !inPark(p) || S.inWater(p, -.4) || !!boulderAt(p) || carAt(p);
    const onTrail = p => S.trailDist(p, 4) < 2.6;
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
      return manual ? Wm.plan(G.pos, dest, { trails: true }) : Wk.plan(G.pos, dest, { trails: true });
    };
    const minutesCache = new Map();
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
      if (!quiet && meetNearby(G.pos)) { renderAll(); showPrompt(); }
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
      const w = G.day.weather, knownRain = G.day.rainWarned ? Mech.rainStart(w) : null;
      if (path.minutes >= 1 && G.day.minute + path.minutes >= Math.min(w.dusk, knownRain ?? Infinity)) {
        const raining = knownRain != null && knownRain < w.dusk;
        toast(raining ? "Rain's coming" : "Not enough daylight", raining ? "It'll be raining before you get there." : "It'll be dark before you get there. Head home instead.", "info"); return;
      }
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
    }
    // Stop a trip where it is (keys take over, the day ends, a new trip starts).
    function stop() {
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
    });
    document.addEventListener("keyup", e => { const dir = KEY[e.key.toLowerCase()]; if (dir) keys.delete(dir); });
    window.addEventListener("blur", () => keys.clear());
    document.addEventListener("visibilitychange", () => { if (document.hidden && G) save(); });

    // ---- the prompt over the map at an unfamiliar boulder, and a first-day hint
    const prompt = $("#map-prompt");
    function showPrompt() {
      const b = G.loc.boulder, show = !G.day.over && b != null && !K.all() && K.boulder(b) < 1;
      prompt.hidden = !show;
      if (show) {
        prompt.innerHTML = `<span>Unfamiliar boulder</span><button type="button" class="btn small primary" data-map-inspect ${UI.busy ? "disabled" : ""}>Inspect <kbd>E</kbd></button>`;
        prompt.querySelector("[data-map-inspect]").onclick = () => inspectBoulder(b);
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
      paper.open({ areas, here: G.loc.sector, me: G.pos, view: P.viewBox(),
        footnote: hidden ? "Locals say there's more climbing deeper in the woods than the kiosk map shows." : "",
        onPick: w => { P.setFollow(false); $("#map-me").classList.add("lost"); (w.sector ? P.flyTo(w.sector, 9, 800) : P.centerOn(w.x, w.y, P.view().k, 700)); },
        onGo: G.day.over ? null : name => { if (K.canGo({ sector: name })) travel({ sector: name, boulder: null }); } });
    }
    const lookAtMe = (ms = 0) => { P.setFollow(true, ms); $("#map-me").classList.remove("lost"); };
    let knownKey = "all", outfitKey = "", peopleKey = "";
    function update() {
      if (!validPos(G.pos)) G.pos = pointOf(G.loc);       // a save from before Stage 4, or a loaded file
      if (UI.recenter) { UI.recenter = false; P.setMe(G.pos, pose(false)); P.setFollow(true, 0); }
      // Label only what the player knows (only when that has changed).
      const view = K.mapView(), key = view ? JSON.stringify(view) : "all";
      if (key !== knownKey) { knownKey = key; P.setKnown(view); }
      const ok = G.day.no + "|" + G.day.weather.temp;
      if (ok !== outfitKey) { outfitKey = ok; P.setOutfit(outfitFor()); }
      const pk = G.date + "|" + !!G.day.bishop + "|" + peopleToday().length + "|" + !!G.day.over;
      if (pk !== peopleKey) { peopleKey = pk; P.setPeople(G.day.over ? [] : [...peopleToday(), ...(v2() && isAround("n:pickles") ? [{ who: "n:pickles", name: "Pickles", dog: true }] : [])]); }
      if (!walk && !keys.size) P.setMe(G.pos, pose(false));
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
    return { update, paint: P, togglePaper, lookAtMe, goTo, minutesTo, minutesToLot, toLot, walking: () => !!walk, locAt: p => locAt(p, G.loc), approach,
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
        <span class="small note">${esc(w.note)}</span>
      </div>
      <div class="hud-body block">
        <span class="gauge"><span class="label-sm">Energy</span><span class="small">${G.player.energy.toFixed(0)}%</span></span>
        <div class="meter energy"><i style="width:${G.player.energy.toFixed(0)}%"></i></div>
        <span class="gauge"><span class="label-sm">Skin</span><span class="small">${G.player.skin.toFixed(0)}%</span></span>
        <div class="meter skin"><i style="width:${G.player.skin.toFixed(0)}%"></i></div>
      </div>
      <div class="actions">
        <button type="button" class="btn" id="act-rest" ${disabled}>Rest 20 min</button>
        ${d.attempts === 0 && !d.moved && (G.loc.sector == null || (G.loc.sector === START_AREA && G.loc.boulder == null)) && !d.over
          ? `<button type="button" class="btn" id="act-skip" ${disabled}>Rest day</button>` : ""}
        <button type="button" class="btn primary" id="act-home" ${disabled}>Head home</button>
      </div>`;
    $("#act-rest").onclick = rest;
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
    el.innerHTML = { here: hereHtml, climber: climberHtml, logbook: logbookHtml, craglog: cragHtml, journal: journalHtml }[UI.tab]();
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
  function npcHtml() {
    const e = G.day.encounter; if (!e) return "";
    let name, sub, initials;
    if (e.who && e.who.startsWith("n:")) {
      const i = World.whoInfo(D, e.who), r = K.met(e.who);
      name = i.name.replace(/^the /, "The "); initials = i.type === "dog" ? "🐾" : name.replace(/^The /, "").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
      sub = [i.blurb.replace(/^is /, ""), i.type !== "dog" && !i.old ? `climbs around V${Math.round(i.level)}` : "", r && r.n > 1 ? `met ${r.n} times` : "first meeting"].filter(Boolean).join(" · ");
    } else {
      const [nm, h, type, lvl] = D.climbers[e.ci];
      name = nm; initials = nm.slice(0, 2).toUpperCase();
      sub = `${h} cm · ${{ local_hero: "local", regular: "regular", occasional: "weekend climber", tourist: "visiting" }[type]} · climbs around V${Math.round(lvl)}`;
    }
    const say = t => (e.say || e.pet ? `<p class="npc-say">${esc(t)}</p>` : `<q>${esc(t)}</q>`);
    const quote = say([e.line, e.recLine].filter(Boolean).join(" ")) + (e.petted ? `<p class="npc-say">${esc(e.petted)}</p>` : "");
    return `<div class="npc${e.who && e.who.startsWith("n:") ? " regular" : ""}"><div class="avatar" aria-hidden="true">${esc(initials)}</div><div>
      <div class="nm">${esc(name)}<small>${esc(sub)}</small></div>
      ${quote}
      ${e.dir && !e.dirTaken ? say(e.dirLine) : ""}
      ${e.dir && e.dirTaken ? `<p class="npc-say">${esc(`${e.who === "n:bishop" ? "He draws" : name + " draws"} you a little map to ${e.dir} on the back of a receipt.`)}</p>` : ""}
      ${e.reveal != null ? say(e.revealLine) : ""}
      ${e.beta && !e.betaTaken ? `<q>${esc(e.beta.text)}</q>` : ""}
      ${e.chatted ? `<p class="npc-say npc-story">${esc(e.chatted)}</p>` : ""}
      <div class="acts">
        ${e.pet && !e.petted ? `<button type="button" class="btn small primary" data-pet>Pet Pickles</button>` : ""}
        ${e.who && e.who.startsWith("n:") && !e.pet && !e.chatted ? `<button type="button" class="btn small" data-chat ${UI.busy || G.day.over ? "disabled" : ""}>Sit and chat · 20 min</button>` : ""}
        ${e.dir ? (e.dirTaken ? `<button type="button" class="btn small primary" data-go-sector="${esc(e.dir)}">Go there</button>` : `<button type="button" class="btn small primary" data-dir>Ask the way</button>`) : ""}
        ${e.reveal != null ? (e.revealTaken ? `<button type="button" class="btn small" data-go-boulder="${D.problems[e.reveal].b}">Go there</button>` : `<button type="button" class="btn small primary" data-reveal>Where exactly?</button>`) : ""}
        ${e.rec != null ? (e.accepted ? `<span class="chip good">Added to your journal</span>` : `<button type="button" class="btn small primary" data-accept>Add to my list</button>`) : ""}
        ${e.rec != null ? `<button type="button" class="btn small" data-go-problem="${e.rec}">Go there</button>` : ""}
        ${e.beta && !e.betaTaken ? `<button type="button" class="btn small" data-beta>Thanks for the beta</button>` : ""}
        <button type="button" class="btn small" data-dismiss>Say bye</button>
      </div></div></div>`;
  }
  function feelHtml(i) {
    const f = Mech.feel(chanceFor(i));
    return `<div class="feel" title="How it feels right now"><div class="bars">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= f.bars ? "on" : ""}" style="height:${4 + n * 2}px"></i>`).join("")}</div><span>${f.label}</span></div>`;
  }
  function whyHtml(i) {
    const p = D.problems[i], parts = Mech.breakdown(G.player, p, G.ps[i], G.day.weather);
    const label = {
      ability: `Your level`, style: `Your skill on ${p.tagList.filter(t => STYLE[t]).map(t => STYLE[t][0].toLowerCase()).join(", ") || "this style"}`,
      morph: Mech.reachDependence(p) < 0 ? "Bunchy, vs your reach" : "Reachy, vs your reach", beta: "Beta you've worked out",
      conditions: "Today's friction", vibes: "Good vibes", fatigue: "Tiredness", skin: "Thin skin", head: "Highball nerves", grade: `Grade V${p.grade}`,
    };
    const graded = K.grade(i) != null;
    const chips = Object.entries(parts).filter(([k, v]) => (k === "ability" || k === "grade" ? graded : Math.abs(v) >= 0.05))
      .map(([k, v]) => `<span class="chip ${k === "grade" || k === "ability" ? "" : v > 0 ? "good" : "bad"}">${label[k]} ${signed(v)}</span>`).join("");
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
      return `<i class="mv k${lvl}${m.kind === "crux" ? " crux" : ""}${j === hi ? " hi" : ""}${alt ? " alt" : ""}" title="${esc(`Move ${j + 1}: ${what}. You know it ${know(mk[j])}.${alt}`)}"></i>`;
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
        ${st?.sent || easyFor(i) ? `<button type="button" class="btn small ${st?.sent ? "" : "primary"}" data-climb="${i}" ${disabled} title="${st?.sent ? "Climb it again" : "One burn, right here"}">${st?.sent ? "Repeat" : "Climb it"}</button>`
          : `<button type="button" class="btn small primary" data-try="${i}" ${disabled} title="Open the climbing scene">Try</button>`}
      </div>${open ? whyHtml(i) + `<div class="why"><button type="button" class="linklike" data-cl="${i}">See it on CragLog</button></div>` : ""}</div>`;
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
      <h3>How leveling works</h3>
      <p class="lede">Every first send earns XP: more for harder grades, extra when it's above your level, and less the further below your level it is. Flashes, tips from locals, new hardest sends and projects that took several sessions earn bonuses. Falling earns nothing, and repeats count a little, a few times a day. To move up a grade you also need three sends at your level or harder, so your level is always a grade you climb.</p>
      <h3>Style skills</h3>
      <p class="meta">How each style compares with the rest of your climbing. Sending a style makes it more of a strength, a little at the expense of the others. On problems with those tags it adds to your level, or takes from it, by up to two thirds of a grade.</p>
      ${skills.map(([t, v]) => {
        const left = Math.min(x(0), x(v)), width = Math.abs(x(v) - x(0));
        const tag = pl.strengths.includes(t) ? `<span class="tag-str">strength</span>` : pl.weakness === t ? `<span class="tag-weak">weakness</span>` : "";
        return `<div class="skill"><span>${STYLE[t][0]}${tag}</span><div class="track"><i style="left:${left}%;width:${width}%;background:${v >= 0 ? "var(--accent)" : "var(--minus)"}"></i><span class="zero" style="left:${x(0)}%"></span></div><span class="val">${signed(v)}</span></div>`;
      }).join("")}
      <h3>Body</h3>
      <p class="lede">Energy drops with every attempt and comes back with short rests and a night's sleep. Climbing on consecutive days starts you tired. Skin wears down on sharp crimps and slopers and needs rest days to grow back.</p>
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
  const CL_VIEWS = () => [["problems", "Problems"], ...(K.all() ? [] : [["buzz", "Local Buzz"]]), ["rankings", "Rankings"], ...(leadersShown() ? [["leaders", "First to"]] : [])];
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
    return `${cragHead()}
      <p class="meta">First ascents since the park reopened: ${fmt(total)} problems by ${fmt(list.filter(r => r.n).length)} ${list.filter(r => r.n).length === 1 ? "climber" : "climbers"}. ${list[me].n ? `You've put up ${list[me].n}, #${me + 1} in the valley.` : "You haven't put up a problem yet."}</p>
      <table><thead><tr><th>#</th><th>Climber</th><th class="num">FAs</th><th class="num">Hardest</th></tr></thead><tbody>${shown.join("")}</tbody></table>`;
  }
  function rankingsHtml() {
    if (!K.all()) return faRankingsHtml();
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
    if (!G.ticks.length && !Object.keys(G.ps).length) return `<h2>Logbook</h2><p class="lede">No ticks yet. Go send something!</p>`;
    const maxG = Math.max(0, G.bestGrade);
    const counts = d3.range(maxG, -1, -1).map(g => [g, sends.filter(t => D.problems[t.p].grade === g).length]);
    const maxC = d3.max(counts, c => c[1]) || 1;
    const projects = Object.entries(G.ps).filter(([, s]) => !s.sent && s.att > 0).map(([i, s]) => [+i, s]).sort((a, b) => b[1].best - a[1].best || b[1].att - a[1].att);
    const rows = [...G.ticks].reverse().slice(0, 80).map(t => {
      const p = D.problems[t.p];
      return `<tr><td>${shortDate(t.date)}</td><td class="grade" style="font-size:15px">${vg(t.p) || "?"}</td><td><button type="button" class="linklike" data-cl="${t.p}">${esc(pname(t.p))}</button><div class="meta" style="margin:0">${esc(p.sector)}</div></td><td>${t.style}${v2() && World.isMine(G, t.p) && G.world.est[t.p].date === t.date && t.style !== "Repeat" ? " · FA" : ""}</td><td class="num stars">${t.stars ? "★".repeat(t.stars) : ""}</td></tr>`;
    }).join("");
    const fas = v2() ? Object.entries(G.world.est).filter(([, e]) => e.by === "you").map(([i, e]) => [+i, e]).sort((a, b) => (a[1].date < b[1].date ? 1 : a[1].date > b[1].date ? -1 : b[0] - a[0])) : [];
    const faHtml = !v2() ? "" : `<h3>Your first ascents</h3>${fas.length ? `<p class="meta">${fas.length} ${fas.length === 1 ? "problem" : "problems"} in Granite Hollow's guidebook ${fas.length === 1 ? "carries" : "carry"} your name.</p>
      <ul class="rowlist">${fas.slice(0, 40).map(([i, e]) => `<li><button type="button" class="rowbtn" data-cl="${i}"><span><span class="t">${esc(nameGrade(i))}</span>
        <span class="s">${esc(D.problems[i].boulder.name)} · ${esc(D.problems[i].sector)} · ${shortDate(e.date)}${e.flash ? " · flashed" : ""}</span></span>
        <span class="v">${e.reps ? `${e.reps} ${e.reps === 1 ? "repeat" : "repeats"}` : "no repeats yet"}${e.classic ? `<span class="s">a classic</span>` : ""}</span></button></li>`).join("")}</ul>${fas.length > 40 ? `<p class="meta">Showing the latest 40.</p>` : ""}`
      : `<p class="meta">Be the first up a line nobody has climbed, and it goes in the guidebook under your name.</p>`}`;
    return `<h2>Logbook</h2><p class="meta">${sends.length} ${sends.length === 1 ? "problem" : "problems"} sent, ${G.ticks.filter(t => t.style === "Flash").length} flashed${v2() ? `, ${fas.length} first ${fas.length === 1 ? "ascent" : "ascents"}` : ""}, over ${G.dayNo} ${G.dayNo === 1 ? "day" : "days"}.</p>
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
    return `<button type="button" class="linklike" data-cl-back>← ${{ rankings: "Rankings", leaders: "First to", buzz: "Local Buzz" }[UI.cl.view] || "All problems"}</button>
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
    const back = `<button type="button" class="linklike" data-cl-back>← ${{ rankings: "Rankings", leaders: "First to", buzz: "Local Buzz" }[UI.cl.view] || "All problems"}</button>`;
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
    on("[data-climb]", n => tryProblem(+n.dataset.climb));
    on("[data-expand]", n => { const i = +n.dataset.expand; UI.expanded.has(i) ? UI.expanded.delete(i) : UI.expanded.add(i); renderPanel(); });
    on("[data-go-sector]", n => travel({ sector: n.dataset.goSector, boulder: null }));
    on("[data-go-boulder]", n => { const b = D.boulders[+n.dataset.goBoulder]; travel({ sector: b.sector, boulder: b.id }); });
    on("[data-go-problem]", n => {
      const p = D.problems[+n.dataset.goProblem];
      if (!K.canGo({ sector: p.sector, boulder: p.b })) { toast("You don't know the way", "Nobody has told you where it is yet.", "info"); return; }
      UI.expanded.add(p.id); travel({ sector: p.sector, boulder: p.b });
    });
    on("[data-inspect]", n => inspectBoulder(+n.dataset.inspect));
    on("[data-kiosk]", () => openModal(showKiosk));
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
    on("[data-beta]", takeBeta);
    on("[data-dismiss]", () => { G.day.encounter = null; save(); renderPanel(); });
    on("[data-rate]", n => { const t = G.ticks[G.day.last.tick]; t.stars = +n.dataset.rate; save(); renderPanel(); });
    on("[data-summary]", showSummary);
    on("[data-export]", exportSave);
    on("[data-pj-view]", n => { UI.pj.view = n.dataset.pjView; UI.pj.sort = "recent"; renderPanel(); });
    { const ps = el.querySelector("#pj-sort"); if (ps) ps.onchange = e => { UI.pj.sort = e.target.value; renderPanel(); }; }
    on("[data-cl-view]", n => { UI.cl.view = n.dataset.clView; UI.cl.problem = null; renderPanel(); });
    on("[data-rk-open]", n => { UI.rk.open = UI.rk.open === n.dataset.rkOpen ? null : n.dataset.rkOpen; renderPanel(); });
    on("[data-rk-more]", () => { UI.rk.n += 25; renderPanel(); });
    for (const [id, key] of [["#rk-window", "window"], ["#rk-height", "height"]]) {
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
    el.className = "toast" + (kind === "find" ? " find" : ""); if (kind === "info") el.style.borderLeftColor = "var(--energy)";
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
    const plans = fc.map((f, n) => {
      const b = preview(n), ra = Mech.rainStart(f);
      const chance = f.pop != null ? Mech.rainChance(f) : ra === 0 ? `${f.precip || "Rain"} all day` : ra != null && ra < f.dusk ? `${f.precip || "Rain"} from ${clock(ra)}` : "";
      const rainLine = chance ? `<span class="rain">${esc(chance.charAt(0).toUpperCase() + chance.slice(1))}</span>` : `<span class="dry">Dry</span>`;
      return `<button type="button" class="plan" data-next="${n}">
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
      <div class="plan-grid">${plans}</div>
      <p class="meta" style="margin-top:8px">Nobody climbs wet granite. Morning rain soaks the rock for the whole day (it becomes a rest day); afternoon rain ends your day when it starts.</p>`,
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
  // climbers' notebook. It greets a new climber, and is there to reread at The Tailgate.
  function showKiosk() {
    const page = World.notebook(D).map(n => {
      const p = D.problems[n.p], who = n.by === "n:anon" ? "?" : World.whoName(D, n.by).replace(/^the /, "");
      return `<li><span class="nb-name">${esc(p.name)}</span><span class="nb-what">${esc(p.boulder.name.replace(/^The /, ""))} · V${p.grade} · ${esc(who)}${n.by === "n:anon" ? "" : ` '${String(n.year).slice(2)}`}</span></li>`;
    }).join("");
    modal(`<span class="label-sm">The trailhead kiosk</span><h2>Welcome to Granite Hollow</h2>
      <p class="lede">Climbing reopened here on September 1, after nearly forty years. The kiosk has the park's trail map, the new climbing rules, and, pinned under glass, the only page of the old climbers' notebook anyone has found.</p>
      <figure class="notebook" aria-label="A page from the old kiosk notebook"><div class="nb-head"><span>Boulder name</span><span>Location / grade / FA</span></div><ol>${page}</ol></figure>
      <p class="lede">Those four are the whole guidebook so far. Everything else in the park is waiting for someone to climb it first.</p>
      <p class="meta">The trail map (press M) marks three climbing areas: The Tailgate, right here by the car, The Schoolhouse and Hawkwatch.</p>
      <div class="acts"><button type="button" class="btn primary" data-close>Go climbing</button><button type="button" class="btn" data-paper>Open the trail map</button></div>`,
      (root, close) => {
        root.querySelector("[data-close]").onclick = close;
        root.querySelector("[data-paper]").onclick = () => { close(); safely("trail map", M.togglePaper); };
      });
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
              <div class="field"><label for="cc-height">Height <output>${st.height} cm · ${ftIn(st.height)}</output></label><input type="range" id="cc-height" min="150" max="200" step="1" value="${st.height}"></div>
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
    if (UI.kiosk) { UI.kiosk = false; openModal(showKiosk); }
    if (!G.day.over && rainNow()) endDay(`It's ${G.day.weather.precip === "Snow" ? "snowing" : "raining"}. Wet granite is slick and holds can snap, so you head home.`);
    else if (G.day.over) openModal(showSummary);
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
    if (g.bal === BAL_NOW) { g.player.tops = Mech.topsOf(g.ticks || [], grade); return false; }
    const pl = g.player;
    let oldXp = pl.xp, was = 0; for (let need = 100; oldXp >= need && was < 16; was++) { oldXp -= need; need *= 1.6; }   // the old curve
    const r = Mech.replay(g.ticks || [], {
      grade,
      sessions: (p, date) => { const lg = g.ps[p] && g.ps[p].log; return Array.isArray(lg) ? Math.max(1, lg.filter(s => s && s[0] <= date).length) : 1; },
      tip: p => (g.tips || []).some(t => t.p === p && t.done),
      repeatsPerDay: REPEATS_XP,
    });
    pl.xp = r.xp; pl.tops = r.tops;
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
