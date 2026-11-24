// Granite Hollow: the game. Rules of climbing live in mechanics.js (Mech);
// this file is the world, the UI, and the save game.
(function () {
  "use strict";
  const SAVE_KEY = "granite-hollow-save-v1";
  const START_DATE = "2025-09-06";
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
  const UI = { tab: "here", expanded: new Set(), cl: { q: "", sector: "", lo: 0, hi: 13, sort: "logs", problem: null, view: "problems", done: "" }, pj: { view: "open", sort: "recent" }, rk: { window: "12m", height: "", open: null, n: 25 }, busy: false, confirmReset: false };

  // ====================================================================== data
  function prepData() {
    D.sectorBy = new Map(D.sectors.map(s => [s.name, s]));
    D.sectorProblems = new Map(D.sectors.map(s => [s.name, []]));
    D.boulders.forEach((b, i) => { b.id = i; });
    D.problems.forEach((p, i) => {
      p.id = i; p.boulder = D.boulders[p.b]; p.sector = p.boulder.sector;
      p.tagList = Mech.tagsOf(p); p.moves = Mech.movesIn(p, (i * 7919) % 97);
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
    for (const t of opts.strengths) skills[t] = 0.6;
    if (opts.weakness) skills[opts.weakness] = -0.5;
    G = {
      v: 1, id: newId(),
      player: { name: opts.name, height: opts.height, ape: opts.ape, strengths: opts.strengths, weakness: opts.weakness,
        xp: 0, skills, energy: 100, skin: 100, consecutive: 0 },
      date: START_DATE, dayNo: 0, loc: { sector: null, boulder: null },
      ps: {}, ticks: [], tips: [], todo: [], ach: {}, visited: [], feed: [], bestGrade: -1, board: { joined: false },
      day: null,
    };
    startDay(0, 0, true);
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
    G.forecast = (G.forecast || []).filter(f => f.date > G.date);
    const s = Mech.startOfDay(G.player, rest);
    Object.assign(G.player, s);
    G.dayNo++;
    G.loc = { sector: null, boulder: null };
    G.day = { no: G.dayNo, minute: 9 * 60 + Math.floor(Math.random() * 40), weather: w, startEnergy: s.energy,
      attempts: 0, sends: [], xp: 0, highpoints: 0, gains: {}, ach: [], met: [], encounter: null, last: null,
      over: false, warned: false, levelBefore: Mech.levelInfo(G.player.xp).level };
    const intro = first
      ? `You pull into the Granite Hollow lot on a ${w.sky.toLowerCase()} September morning, ${w.temp}°F. Pick a sector on the map to walk in. The Schoolhouse is 6 minutes up the trail, and the boulders at the Tailgate are right beside the car.`
      : `${w.sky}, ${w.temp}°F. ${w.note}`;
    G.day.last = { kind: "info", title: first ? "Welcome to Granite Hollow" : `Day ${G.dayNo}`, text: intro };
    if (Mech.rainStart(w) === 0) {
      G.day.over = true; G.day.rainedOut = true;
      G.day.reason = `${w.pop != null ? `The ${Mech.rainChance(w)} came through, and the rock is soaked.` : `${w.precip === "Snow" ? "Snow" : "Rain"} all day.`} Wet granite is slick and holds can snap, so there's no climbing. It counts as a rest day.`;
      note(`Day ${G.dayNo}: rained out.`);
    } else note(`Day ${G.dayNo}: ${w.sky}, ${w.temp}°F, ${w.label.toLowerCase()} conditions.`);
  }
  function note(text) { G.feed.unshift({ text, date: G.date, minute: G.day ? G.day.minute : 540 }); G.feed.length = Math.min(G.feed.length, 60); }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* storage can be unavailable */ }
    if (G && G.board && G.board.joined) syncBoard();
  }
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  const pstate = i => (G.ps[i] = G.ps[i] || { att: 0, beta: 0, sent: false, flash: false, best: 0, sends: 0 });
  const firstSends = () => G.ticks.filter(t => t.style !== "Repeat");
  const levelNow = () => Mech.levelInfo(G.player.xp);
  const chanceFor = i => Mech.sendChance(Mech.margin(G.player, D.problems[i], G.ps[i], G.day.weather));
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
    ["classics", "Classic Hunter", "Send 5 problems rated 3.3★ or better.", () => firstSends().filter(t => (D.problems[t.p].stars || 0) >= 3.3).length >= 5],
    ["pyramid", "Solid Pyramid", "At V3 or harder: 1 send at your max, 2 one grade below, 4 two below.", pyramidDone],
    ["winter", "Winter Warrior", "Climb in December, January or February.", () => G.day && G.day.attempts > 0 && [11, 0, 1].includes(monthOf(G.date))],
    ["flapper", "Flapper", "Tear a flapper. Ouch.", () => G.flapper === true],
    ["century", "Century", "Send 100 different problems.", () => firstSends().length >= 100],
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
  function tryProblem(i) {
    if (UI.busy || G.day.over) return;
    const p = D.problems[i];
    if (G.loc.boulder !== p.b) { travel({ sector: p.sector, boulder: p.b }); return; }
    const st = pstate(i);
    const cost = Mech.attemptCost(G.player, p);
    const r = Mech.attempt(G.player, p, st, G.day.weather);
    G.player.energy = Math.max(0, G.player.energy - cost.energy);
    G.player.skin = Math.max(0, G.player.skin - cost.skin);
    G.day.minute += Math.round(cost.minutes);
    st.att++; G.day.attempts++;
    // Session log for the Journal's projects: [date, tries, best highpoint, sent], while it's still a project.
    let sess = null;
    if (!st.sent) {
      const lg = st.log = st.log || [];
      sess = lg[lg.length - 1];
      if (!sess || sess[0] !== G.date) { sess = [G.date, 0, 0, 0]; lg.push(sess); if (lg.length > 20) lg.shift(); }
      sess[1]++;
    }
    const gains = Mech.skillGains(G.player, p, r.sent);
    for (const [t, g] of Object.entries(gains)) { G.player.skills[t] += g; G.day.gains[t] = (G.day.gains[t] || 0) + g; }

    if (r.sent) {
      const first = !st.sent, flash = first && st.att === 1, newMax = first && p.grade > G.bestGrade;
      const tip = G.tips.find(t => t.p === i && !t.done);
      const xp = Mech.sendXp(G.player, p, { first, flash, tip: !!tip && first, newMax });
      const before = levelNow().level;
      G.player.xp += xp; G.day.xp += xp;
      st.sent = true; st.sends++; st.flash = st.flash || flash; st.sentOn = st.sentOn || G.date; st.best = 1;
      if (sess) { sess[2] = 1; sess[3] = 1; }
      if (first) G.bestGrade = Math.max(G.bestGrade, p.grade);
      if (tip && first) tip.done = true;
      G.todo = G.todo.filter(t => t !== i || !first);
      const style = first ? (flash ? "Flash" : "Send") : "Repeat";
      G.ticks.push({ p: i, date: G.date, day: G.dayNo, style, att: st.att, stars: null });
      G.day.sends.push({ p: i, style, xp });
      let text;
      if (flash) text = "Flash! You read every move from the ground.";
      else if (!first) text = "Fun to climb it again, but you won't learn much from a repeat.";
      else if (st.att >= 10) text = `After ${st.att} tries it finally goes. That's what projecting feels like.`;
      else if (st.att >= 4) text = `Your ${ordinal(st.att)} try. Working out the beta paid off.`;
      else text = `You top out ${p.name}.`;
      if (newMax) text += ` Your hardest send yet.`;
      if (tip && first) text += ` Good beta from ${D.climbers[tip.from][0]}.`;
      G.day.last = { kind: "send", title: `${style === "Repeat" ? "Repeat" : "Sent"}: ${p.name}, V${p.grade}`, text, xp, gains, tick: G.ticks.length - 1, p: i };
      note(`${style} ${p.name} (V${p.grade}), +${fmt(xp)} XP.`);
      showBanner(style, p, xp);
      const after = levelNow().level;
      if (after > before) { UI.levelPending = true; setTimeout(() => showLevelUp(after), reduceMotion ? 0 : 900); }
    } else {
      const k = Math.max(1, Math.min(p.moves - 1, Math.round(r.progress * p.moves)));
      const frac = k / p.moves, newHigh = st.att > 1 && frac > st.best + 1e-6;
      if (frac > st.best) { st.best = frac; if (newHigh) G.day.highpoints++; }
      if (sess) sess[2] = Math.max(sess[2], frac);
      const before = st.beta; st.beta = Math.min(Mech.BETA_MAX, st.beta + Mech.betaGain(st.beta));
      let text = `${CRUX[r.crux] || "You came off."} Fell on move ${k} of ${p.moves}.`;
      if (newHigh) text += " New highpoint!";
      if (st.beta - before > 0.03 && st.att <= 6) text += " You worked out a bit more of the beta.";
      if (G.day.weather.cond <= -0.8 && Mech.frictionSensitivity(p) >= 0.6) text += " Everything is wet.";
      G.day.last = { kind: "fall", title: `${p.name}, V${p.grade}: attempt ${st.att}`, text, gains, p: i };
    }
    // Sharp granite and thin skin: flappers happen.
    if (G.player.skin < 30 && Mech.frictionSensitivity(p) >= 0.6 && Math.random() < 0.07) {
      G.player.skin = Math.max(0, G.player.skin - 12); G.player.energy = Math.max(0, G.player.energy - 8); G.flapper = true;
      G.day.last.text += " Then you tear a flapper on the sharp granite. Ouch. Tape it up or call it a day.";
      note("Tore a flapper.");
    }
    afterAction();
  }
  function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function afterAction() {
    checkAchievements();
    const w = G.day.weather;
    if (!G.day.over) {
      if (G.player.energy <= 6) endDay("You're cooked. Time to head home.");
      else if (G.player.skin <= 2) endDay("Your skin is done for the day.");
      else if (rainNow()) endDay(`It started ${w.precip === "Snow" ? "snowing" : "raining"} at ${clock(Mech.rainStart(w))}. Wet granite is slick and holds can snap, so you pack up and head home.`);
      else if (G.day.minute >= w.dusk) endDay("The light's gone, and the park closes at dusk.");
      else if (Mech.rainStart(w) != null && !G.day.rainWarned && G.day.minute >= Mech.rainStart(w) - 45) {
        G.day.rainWarned = true; toast("Clouds rolling in", `${w.precip === "Snow" ? "Snow" : "Rain"} is on its way, due around ${clock(Mech.rainStart(w))}. Get your last burns in.`, "info");
      } else if (w.pop && w.rainFrom && Mech.rainStart(w) == null && !G.day.rainWarned && G.day.minute >= w.rainFrom) {
        G.day.rainWarned = true; toast("The rain held off", "Clear skies after all. Keep climbing until dusk.", "info");
      }
      else if (!G.day.warned && G.day.minute >= w.dusk - 45) { G.day.warned = true; toast("Light's fading", `The park closes at dusk, ${clock(w.dusk)}.`, "info"); }
    }
    save(); renderAll();
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
  function rest() {
    if (UI.busy || G.day.over) return;
    G.day.minute += 20;
    G.player.energy = Math.min(G.day.startEnergy, G.player.energy + 12);
    G.day.last = { kind: "info", title: "Twenty minutes on the pad", text: "You eat a snack, retape a finger, and watch someone flail on a warm-up. Energy recovers a little; skin doesn't." };
    afterAction();
  }

  function travel(to) {
    try { walkTo(to); } catch (e) { UI.busy = false; reportError("walking", e); safely("redraw", renderAll); }
  }
  function walkTo(to) {
    if (UI.busy || G.day.over) return;
    const from = { ...G.loc };
    if (to.sector === from.sector && to.boulder === from.boulder) { UI.tab = "here"; renderAll(); return; }
    const minutes = walkMinutes(to);
    const knownRain = G.day.rainWarned ? Mech.rainStart(G.day.weather) : null;
    if (G.day.minute + minutes >= Math.min(G.day.weather.dusk, knownRain ?? Infinity)) {
      const raining = knownRain != null && knownRain < G.day.weather.dusk;
      toast(raining ? "Rain's coming" : "Not enough daylight", raining ? "It'll be raining before you get there." : "It'll be dark before you get there. Head home instead.", "info"); return;
    }
    G.day.minute += minutes;
    const pts = [M.meXY(from)];
    if (to.sector !== from.sector) for (const n of route(from.sector, to.sector).nodes.slice(1)) pts.push(nodeXY(n));
    if (to.boulder != null) pts.push(M.meXY(to));
    UI.busy = true; UI.tab = "here";
    renderAll();
    M.walk(pts, reduceMotion ? 0 : Math.max(300, Math.min(1800, minutes * 70)), () => {
      UI.busy = false;
      G.loc = { sector: to.sector, boulder: to.boulder };
      const newSector = to.sector !== from.sector;
      if (newSector && to.sector) {
        if (!G.visited.includes(to.sector)) G.visited.push(to.sector);
        G.day.encounter = null;
        if (minutes > 1) G.day.last = { kind: "info", title: to.sector, text: `${minutes} minute walk. ${sectorBlurb(to.sector)}` };
        maybeEncounter(to.sector);
        M.focusSector(to.sector);
      } else if (to.boulder != null) {
        G.day.last = null;
      }
      afterAction();
    });
  }
  function sectorBlurb(name) {
    const s = D.sectorBy.get(name), sent = D.sectorProblems.get(name).filter(i => G.ps[i]?.sent).length;
    return `${s.boulderIds.length} boulders, ${D.sectorProblems.get(name).length} problems from V${s.lo} to V${s.hi}. You've sent ${sent} here.`;
  }

  function endDay(reason) {
    G.day.over = true; G.day.reason = reason;
    note(`Headed home: ${G.day.sends.filter(s => s.style !== "Repeat").length} new sends, +${fmt(G.day.xp)} XP.`);
    save(); renderAll();
    if (!UI.levelPending) showSummary();  // otherwise it opens when the level-up closes
  }

  // ============================================================== encounters
  function maybeEncounter(sector) {
    if (G.day.met.length >= 3 || Math.random() > 0.55) return;
    const pool = D.npcsBySector.get(sector).filter(ci => !G.day.met.includes(ci));
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
    const A = Mech.ability(G.player.xp) + 0.6;
    return -0.5 * Math.pow((p.grade - (A + 0.3)) / 1.0, 2) + 1.2 * Mech.styleBonus(G.player, p) + 1.0 * Mech.morph(G.player, p)
      + 0.4 * ((p.stars ?? 2.3) - 2.3) + 0.12 * Math.log1p(p.sends);
  }
  function whyFor(i) {
    const p = D.problems[i], A = Mech.ability(G.player.xp) + 0.6, out = [];
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
    // A recommendation: something they liked that suits you.
    const cands = D.liked[ci].filter(i => !G.ps[i]?.sent);
    let ranked = cands.map(i => [i, playerFit(i)]).filter(x => x[1] > -4).sort((a, b) => b[1] - a[1]);
    let theirs = true;
    if (!ranked.length) {
      theirs = false;
      ranked = D.sectorProblems.get(sector).filter(i => !G.ps[i]?.sent).map(i => [i, playerFit(i)]).sort((a, b) => b[1] - a[1]);
    }
    const rec = ranked.length ? ranked[Math.floor(Math.random() * Math.min(3, ranked.length))][0] : null;
    let recLine = "";
    if (rec != null) {
      const p = D.problems[rec], why = whyFor(rec);
      const where = p.sector === sector ? `right here on ${p.boulder.name}` : `over at ${p.sector}`;
      recLine = `You should try ${p.name}, V${p.grade}, ${where}. ${theirs ? "One of my favorites. " : ""}I think ${why.slice(0, 2).join(" and ")}.`;
      if (Math.abs(h - G.player.height) <= 5) recLine += " We're about the same height, so trust me.";
    }
    // Beta for a project you're working in this sector.
    const projects = D.sectorProblems.get(sector).filter(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 3 && !G.ps[i].tipped);
    let beta = null;
    if (projects.length && Math.random() < 0.7) {
      const pi = projects.sort((a, b) => G.ps[b].att - G.ps[a].att)[0], p = D.problems[pi];
      const worst = p.tagList.filter(t => BETA_TIP[t]).sort((a, b) => (G.player.skills[a] ?? Mech.morph(G.player, p)) - (G.player.skills[b] ?? Mech.morph(G.player, p)))[0];
      beta = { p: pi, text: `Saw you working ${p.name}. ${BETA_TIP[worst] || "Try it with more confidence on the first move."}` };
    }
    return { ci, sector, line, rec, recLine, beta, accepted: false, betaTaken: false };
  }
  function acceptTip() {
    const e = G.day.encounter; if (!e || e.rec == null) return;
    e.accepted = true;
    if (!G.tips.some(t => t.p === e.rec && !t.done)) G.tips.push({ p: e.rec, from: e.ci, date: G.date, why: whyFor(e.rec), done: false });
    note(`${D.climbers[e.ci][0]} recommended ${D.problems[e.rec].name}.`);
    save(); renderAll();
  }
  function takeBeta() {
    const e = G.day.encounter; if (!e || !e.beta) return;
    const st = pstate(e.beta.p); st.beta = Math.min(Mech.BETA_MAX, st.beta + 0.25); st.tipped = true; e.betaTaken = true;
    note(`Got beta for ${D.problems[e.beta.p].name} from ${D.climbers[e.ci][0]}.`);
    toast("Beta unlocked", `${D.problems[e.beta.p].name} will feel a bit easier now.`, "info");
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
      tooltip: tip,
      furniture: ".cartouche, .map-tools, .compass, .scalebar",
      state: { here: G.loc.boulder != null ? D.boulders[G.loc.boulder].name : null },
      onBoulder: id => { const b = D.boulders[id]; travel({ sector: b.sector, boulder: b.id }); },
      onSector: name => travel({ sector: name, boulder: null }),
      tipHtml: b => {
        const ps = b.problems.map(i => G.ps[i]).filter(Boolean), sent = ps.filter(x => x.sent).length;
        const g = d3.extent(b.problems, i => D.problems[i].grade), mins = walkMinutes({ sector: b.sector, boulder: b.id });
        return `<strong>${esc(b.name)}</strong><div class="sub">${esc(b.sector)} · ${b.height_ft} ft · ${b.angle}</div>
          ${b.desc ? `<div class="tip-desc">${esc(b.desc)}</div>` : ""}${b.problems.length} problems, V${g[0]}${g[1] > g[0] ? "–V" + g[1] : ""}<br>You've sent ${sent}${mins ? ` · ${mins} min walk` : " · you're here"}`;
      },
      onZoom: T => {
        const k = T.k, metres = [10, 25, 50, 100, 200, 250, 500, 1000].find(m => m * k >= 90) || 1000;
        $("#scale-ruler").style.width = metres * k + "px";
        $("#scale-label").textContent = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
      },
    });
    $("#zoom-in").onclick = () => P.zoomBy(1.6);
    $("#zoom-out").onclick = () => P.zoomBy(1 / 1.6);
    $("#zoom-fit").onclick = () => P.home();
    if (G.loc.sector) P.flyTo(G.loc.sector, 9, 0);      // a saved day picks up where you are

    // Where your dot stands: in front of the boulder you're at (not on top of it), or at the area's trail junction.
    const meXY = loc => {
      if (loc.boulder == null) return nodeXY(loc.sector);
      const bo = P.scene.boulders[loc.boulder];
      return [bo.b.x - bo.form.R * .55, bo.b.y - bo.form.R * 1.45];
    };
    // A walk between two trail junctions follows the trail between them (either way along it).
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
    const alongTrails = points => {
      const out = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], j = D.trails.findIndex(t => (near(t.start, a) && near(t.end, b)) || (near(t.start, b) && near(t.end, a)));
        if (j >= 0) { const pts = P.scene.trails[j].pts; out.push(...(near(D.trails[j].start, a) ? pts : [...pts].reverse())); }
        else out.push(b);
      }
      return out;
    };
    function walk(points, ms, done) {
      points = alongTrails(points);
      const segs = [], lens = [];
      for (let i = 1; i < points.length; i++) { segs.push([points[i - 1], points[i]]); lens.push(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])); }
      const total = d3.sum(lens) || 1;
      if (!ms) { P.setMe(points[points.length - 1]); done(); return; }
      const timer = d3.timer(el => {
        let d = Math.min(1, el / ms) * total, i = 0;
        while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        const f = lens[i] ? Math.min(1, d / lens[i]) : 1, [a, b] = segs[i] || [points[0], points[0]];
        P.setMe([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        if (el >= ms) { timer.stop(); P.setMe(points[points.length - 1]); done(); }
      });
    }
    function update() {
      P.setMe(meXY(G.loc));
      const tipBoulders = new Set(G.tips.filter(t => !t.done).map(t => D.problems[t.p].b));
      P.setMarks({
        here: G.loc.boulder ?? null, sector: G.loc.sector ?? null, tip: tipBoulders,
        ticked: new Set(D.boulders.filter(b => b.problems.some(i => G.ps[i]?.sent)).map(b => b.id)),
        project: new Set(D.boulders.filter(b => b.problems.some(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 2)).map(b => b.id)),
      });
      applyAtmosphere();
    }
    return { walk, update, meXY, focusSector: name => P.focus(name), paint: P };
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
          <span class="small">${fmt(Math.floor(L.into))} / ${fmt(Math.round(L.need))} XP to V${L.level + 1}</span></div>
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
        ${d.attempts === 0 && G.loc.sector == null && !d.over
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
    return `<div class="result ${r.kind}"><div class="rt">${esc(r.title)}</div><p>${esc(r.text)}</p>
      ${r.xp ? `<p><b style="color:var(--gold)">+${fmt(r.xp)} XP</b></p>` : ""}
      ${gains ? `<div class="chips gains">${gains}</div>` : ""}${rate}</div>`;
  }
  function npcHtml() {
    const e = G.day.encounter; if (!e) return "";
    const [name, h, type, lvl] = D.climbers[e.ci];
    const typeLabel = { local_hero: "local", regular: "regular", occasional: "weekend climber", tourist: "visiting" }[type];
    return `<div class="npc"><div class="avatar" aria-hidden="true">${esc(name.slice(0, 2).toUpperCase())}</div><div>
      <div class="nm">${esc(name)}<small>${h} cm · ${typeLabel} · climbs around V${Math.round(lvl)}</small></div>
      <q>${esc(e.line)} ${esc(e.recLine)}</q>
      ${e.beta && !e.betaTaken ? `<q>${esc(e.beta.text)}</q>` : ""}
      <div class="acts">
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
      conditions: "Today's friction", fatigue: "Tiredness", skin: "Thin skin", head: "Highball nerves", grade: `Grade V${p.grade}`,
    };
    const chips = Object.entries(parts).filter(([k, v]) => k === "ability" || k === "grade" || Math.abs(v) >= 0.05)
      .map(([k, v]) => `<span class="chip ${k === "grade" || k === "ability" ? "" : v > 0 ? "good" : "bad"}">${label[k]} ${signed(v)}</span>`).join("");
    const c = chanceFor(i);
    return `<div class="why">About ${c >= 0.1 ? Math.round(c * 100) + "%" : c >= 0.01 ? "1 in " + Math.round(1 / c) : "under 1%"} per try right now.
      <div class="chips">${chips}</div></div>`;
  }
  function problemRowHtml(i) {
    const p = D.problems[i], st = G.ps[i], open = UI.expanded.has(i);
    let status = "";
    if (st?.sent) status = `<span class="status sent">${st.flash ? "Flashed" : "Sent"}${st.att > 1 ? ` in ${st.att}` : ""}</span>`;
    else if (st?.att) status = `<span class="status">${st.att} ${st.att === 1 ? "try" : "tries"}</span>`;
    const tip = G.tips.some(t => t.p === i && !t.done) ? `<span class="chip" style="background:var(--gold-soft);color:var(--gold)">★ tip</span>` : "";
    const hp = st && !st.sent && st.att ? `<div class="hp"><div class="meter"><i style="width:${(st.best * 100).toFixed(0)}%"></i></div>Highpoint move ${Math.round(st.best * p.moves)} of ${p.moves}</div>` : "";
    const disabled = UI.busy || G.day.over ? "disabled" : "";
    return `<div class="prob"><div class="prob-main">
        <span class="grade">V${p.grade}</span>
        <div><button type="button" class="linklike pname" data-expand="${i}" aria-expanded="${open}">${esc(p.name)}</button>${status}
          <div class="chips">${tip}${p.tagList.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>${hp}</div>
        ${feelHtml(i)}
        <button type="button" class="btn small ${st?.sent ? "" : "primary"}" data-try="${i}" ${disabled}>${st?.sent ? "Repeat" : "Try"}</button>
      </div>${open ? whyHtml(i) + `<div class="why"><button type="button" class="linklike" data-cl="${i}">See it on CragLog</button></div>` : ""}</div>`;
  }
  function hereHtml() {
    const d = G.day;
    if (d.over) return `${resultHtml()}<h2>Day over</h2><p class="lede">${esc(d.reason || "")}</p><button type="button" class="btn primary" data-summary>See today's summary</button>`;
    if (G.loc.sector == null) {
      const rows = [...D.sectors].sort((a, b) => a.walk_min - b.walk_min).map(s => {
        const sent = D.sectorProblems.get(s.name).filter(i => G.ps[i]?.sent).length;
        return `<li><button type="button" class="rowbtn" data-go-sector="${esc(s.name)}"><span><span class="t">${esc(s.name)}</span>
          <span class="s">${s.boulderIds.length} boulders · V${s.lo}–V${s.hi} · you've sent ${sent} of ${D.sectorProblems.get(s.name).length}</span></span>
          <span class="v">${route(null, s.name).minutes} min walk</span></button></li>`;
      }).join("");
      return `${resultHtml()}<h2>The parking lot</h2><p class="meta">Pick a sector to walk to. Walking takes time, and the park closes at dusk.</p><ul class="rowlist">${rows}</ul>`;
    }
    const s = D.sectorBy.get(G.loc.sector);
    if (G.loc.boulder == null) {
      const rows = s.boulderIds.map(bi => {
        const b = D.boulders[bi], g = d3.extent(b.problems, i => D.problems[i].grade), sent = b.problems.filter(i => G.ps[i]?.sent).length;
        const proj = b.problems.some(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 2);
        return `<li><button type="button" class="rowbtn" data-go-boulder="${bi}"><span><span class="t">${esc(b.name)}</span>
          <span class="s">${b.problems.length} problems · V${g[0]}${g[1] > g[0] ? "–V" + g[1] : ""} · ${b.height_ft} ft · ${b.angle}${proj ? " · project here" : ""}</span></span>
          <span class="v">${sent}/${b.problems.length} sent</span></button></li>`;
      }).join("");
      return `${resultHtml()}${npcHtml()}<h2>${esc(s.name)}</h2><p class="meta">${s.walk_min} min from the lot. Pick a boulder.</p><ul class="rowlist">${rows}</ul>`;
    }
    const b = D.boulders[G.loc.boulder];
    const others = s.boulderIds.filter(x => x !== b.id).map(x => `<button type="button" class="linklike" data-go-boulder="${x}">${esc(D.boulders[x].name)}</button>`).join(", ");
    return `${resultHtml()}${npcHtml()}<h2>${esc(b.name)}</h2>${b.desc ? `<p class="boulder-desc">${esc(b.desc)}</p>` : ""}
      <p class="meta">${esc(s.name)} · ${b.height_ft} ft · mostly ${b.angle}. Select a problem's name to see what makes it hard for you.</p>
      ${b.problems.map(problemRowHtml).join("")}
      <h3>Nearby</h3><p class="meta">${others || "No other boulders in this sector."} · <button type="button" class="linklike" data-go-sector="${esc(s.name)}">Sector overview</button></p>`;
  }

  // ---- Climber ----
  function climberHtml() {
    const pl = G.player, L = levelNow(), sends = firstSends();
    const days = new Set(G.ticks.map(t => t.date)).size;
    const skills = Mech.PREF.map(t => [t, pl.skills[t]]).sort((a, b) => b[1] - a[1]);
    const lo = -0.6, hi = Math.max(1.5, d3.max(skills, s => s[1]) + 0.1), x = v => (v - lo) / (hi - lo) * 100;
    const r = reach(), reachText = r < 170 ? "Short reach: bunchy problems suit you; reachy ones fight back." : r > 182 ? "Long reach: reachy problems suit you; cramped, bunchy ones fight back." : "Average reach: few problems care about your size.";
    return `<h2>${esc(pl.name)}</h2><p class="meta">${pl.height} cm, ape index ${pl.ape >= 0 ? "+" : ""}${pl.ape} cm, reach ${r} cm. ${reachText}</p>
      <div class="kv"><div><b style="color:var(--gold)">V${L.level}</b><span>level, ${(L.frac * 100).toFixed(0)}% to V${L.level + 1}</span></div>
        <div><b>${G.bestGrade >= 0 ? "V" + G.bestGrade : "–"}</b><span>hardest send</span></div><div><b>${sends.length}</b><span>problems sent</span></div>
        <div><b>${G.ticks.filter(t => t.style === "Flash").length}</b><span>flashes</span></div><div><b>${G.dayNo}</b><span>days at the crag</span></div>
        <div><b>${Object.keys(G.ach).length}</b><span>achievements</span></div></div>
      <h3>How leveling works</h3>
      <p class="lede">Sends near your level are worth the most XP. Each grade harder doubles it; each grade easier halves it. Flashes, tips from locals and new hardest sends earn bonuses. Moving up gets slower as you get stronger, like it does outside.</p>
      <h3>Style skills</h3>
      <p class="meta">Sending a style makes you better at it. Skills add to your level on problems with those tags.</p>
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
  function cragHead() {
    const v = UI.cl.view;
    return `<div class="cl-brand"><b>Crag<i>Log</i></b><span class="meta" style="margin:0">Logs and comments from Granite Hollow climbers</span></div>
      <div class="cl-views" role="group" aria-label="CragLog section">
        <button type="button" data-cl-view="problems" aria-pressed="${v !== "rankings" && v !== "leaders"}">Problems</button>
        <button type="button" data-cl-view="rankings" aria-pressed="${v === "rankings"}">Rankings</button>
        <button type="button" data-cl-view="leaders" aria-pressed="${v === "leaders"}">First to</button></div>`;
  }
  function rankingsHtml() {
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
        ${!G.board.joined && LB.status !== "off" ? `<p class="meta" style="margin:6px 0 0">Other players only see you here if you join the leaderboard in <button type="button" class="linklike" data-cl-view="leaders">First to</button>.</p>` : ""}</div>
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
      return `<tr><td>${shortDate(t.date)}</td><td class="grade" style="font-size:15px">V${p.grade}</td><td><button type="button" class="linklike" data-cl="${t.p}">${esc(p.name)}</button><div class="meta" style="margin:0">${esc(p.sector)}</div></td><td>${t.style}</td><td class="num stars">${t.stars ? "★".repeat(t.stars) : ""}</td></tr>`;
    }).join("");
    return `<h2>Logbook</h2><p class="meta">${sends.length} problems sent, ${G.ticks.filter(t => t.style === "Flash").length} flashed, over ${G.dayNo} days.</p>
      <h3>Grade pyramid</h3>
      <div class="pyr">${counts.map(([g, c]) => `<span class="g">V${g}</span><div class="bar"><i style="width:${(c / maxC * 82).toFixed(1)}%"></i>${c}</div>`).join("")}</div>
      ${projects.length ? `<h3>Open projects</h3><ul class="rowlist">${projects.slice(0, 12).map(([i, s]) => {
        const p = D.problems[i];
        return `<li><button type="button" class="rowbtn" data-go-problem="${i}"><span><span class="t">V${p.grade} ${esc(p.name)}</span><span class="s">${esc(p.boulder.name)} · ${esc(p.sector)} · ${s.att} tries</span></span><span class="v">high ${Math.round(s.best * p.moves)}/${p.moves}</span></button></li>`;
      }).join("")}</ul>` : ""}
      <h3>Ticks</h3><table><thead><tr><th>Date</th><th>Grade</th><th>Problem</th><th>Style</th><th class="num">Stars</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---- CragLog ----
  function commentFor(log, p, pi, li) {
    const [ci, , style, stars, sugg] = log, h = D.climbers[ci][1];
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
  function describe(p) {
    const phrase = { crimpy: "sharp crimps", slopey: "rounded slopers", pinchy: "a couple of good pinches", juggy: "big jugs", compression: "a squeezy compression sequence",
      dyno: "a big dyno", technical: "precise footwork", powerful: "a powerful crux move", mantle: "a stout mantle", slab: "delicate slab moves",
      overhang: "steep pulling", roof: "a roof with a tricky lip" };
    const ps = p.tagList.map(t => phrase[t]).filter(Boolean).slice(0, 2);
    let s = `A ${p.height_ft}-foot problem on ${p.boulder.name}${p.sit ? ", from a sit start" : ""}.`;
    if (ps.length) s += ` Expect ${ps.join(" and ")}.`;
    if (p.tagList.includes("traverse")) s += " Traverses the face before topping out.";
    if (p.tagList.includes("eliminate")) {
      const rule = p.name.match(/\(([^)]+)\)$/);   // "Comb-Over (Slopers Only)"
      s += rule ? ` An eliminate of ${p.name.slice(0, rule.index).trim()}: ${rule[1].toLowerCase()}.` : " Eliminate: the arête and the big jug are off.";
    }
    if (p.tagList.includes("reachy")) s += " Long moves between holds.";
    if (p.tagList.includes("bunchy")) s += " Cramped, compressed positions.";
    if (p.tagList.includes("highball")) s += " Tall and committing at the top.";
    return s;
  }
  function cragHtml() {
    if (UI.cl.problem != null) return cragProblemHtml(UI.cl.problem);
    if (UI.cl.view === "rankings") return rankingsHtml();
    if (UI.cl.view === "leaders") return leadersHtml();
    const c = UI.cl, q = c.q.trim().toLowerCase();
    const doneOk = p => !c.done || (c.done === "sent" ? !!G.ps[p.id]?.sent : c.done === "tried" ? !!G.ps[p.id] && !G.ps[p.id].sent && G.ps[p.id].att > 0 : !G.ps[p.id]?.sent);
    let list = D.problems.filter(p => p.grade >= c.lo && p.grade <= c.hi && (!c.sector || p.sector === c.sector) && doneOk(p) &&
      (!q || p.name.toLowerCase().includes(q) || p.boulder.name.toLowerCase().includes(q) || p.tags.includes(q)));
    const sorts = { logs: (a, b) => b.sends - a.sends, stars: (a, b) => (b.stars || 0) - (a.stars || 0), grade: (a, b) => a.grade - b.grade || b.sends - a.sends, fit: (a, b) => playerFit(b.id) - playerFit(a.id) };
    list.sort(sorts[c.sort]);
    const total = list.length; list = list.slice(0, 60);
    const gradeOpts = sel => d3.range(0, 14).map(g => `<option value="${g}" ${g === sel ? "selected" : ""}>V${g}</option>`).join("");
    return `${cragHead()}
      <div class="cl-filters">
        <input type="search" id="cl-q" placeholder="Search problems, boulders or styles" value="${esc(c.q)}" aria-label="Search">
        <select id="cl-sector" aria-label="Sector"><option value="">All sectors</option>${D.sectors.map(s => `<option ${s.name === c.sector ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        <select id="cl-sort" aria-label="Sort"><option value="logs" ${c.sort === "logs" ? "selected" : ""}>Most climbed</option><option value="stars" ${c.sort === "stars" ? "selected" : ""}>Highest rated</option><option value="grade" ${c.sort === "grade" ? "selected" : ""}>Grade</option><option value="fit" ${c.sort === "fit" ? "selected" : ""}>Best for you</option></select>
        <select id="cl-lo" aria-label="Lowest grade">${gradeOpts(c.lo)}</select>
        <select id="cl-hi" aria-label="Highest grade">${gradeOpts(c.hi)}</select>
        <select id="cl-done" aria-label="Your ticks">${[["", "All problems"], ["unsent", "Not sent yet"], ["tried", "Tried, not sent"], ["sent", "Sent"]].map(([v, l]) => `<option value="${v}" ${c.done === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      <p class="meta">${total} problems${total > 60 ? ", showing 60" : ""}.</p>
      <ul class="rowlist">${list.map(p => `<li><button type="button" class="rowbtn" data-cl="${p.id}"><span><span class="t">V${p.grade} ${esc(p.name)}${G.ps[p.id]?.sent ? ` <span style="color:var(--plus);font-weight:500">✓</span>` : ""}</span>
        <span class="s">${esc(p.boulder.name)} · ${esc(p.sector)}</span></span>
        <span class="v">${p.stars != null ? `<span class="stars">★</span> ${p.stars.toFixed(1)}` : "no ratings"}<span class="s">${fmt(p.sends)} sends</span></span></button></li>`).join("")}</ul>`;
  }
  function cragProblemHtml(i) {
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
    return `<button type="button" class="linklike" data-cl-back>← ${{ rankings: "Rankings", leaders: "First to" }[UI.cl.view] || "All problems"}</button>
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

  // ---- Journal ----
  // ---- Journal: projects log
  function projectsHtml() {
    const v = UI.pj.view;
    const all = Object.entries(G.ps).map(([i, st]) => [+i, st]).filter(([, st]) => st.att > 0);
    let list = v === "sent" ? all.filter(([, st]) => st.sent && st.att >= 2) : all.filter(([, st]) => !st.sent);
    const lastDate = st => (st.log && st.log.length ? String(st.log[st.log.length - 1][0]) : st.sentOn || "");
    const sorts = {
      recent: (a, b) => (lastDate(b[1]) > lastDate(a[1]) ? 1 : lastDate(b[1]) < lastDate(a[1]) ? -1 : 0) || b[1].att - a[1].att,
      close: (a, b) => (v === "sent" ? b[1].att - a[1].att : chanceFor(b[0]) - chanceFor(a[0])),
      grade: (a, b) => D.problems[b[0]].grade - D.problems[a[0]].grade || b[1].best - a[1].best,
      tries: (a, b) => b[1].att - a[1].att,
    };
    list.sort(sorts[UI.pj.sort] || sorts.recent);
    const shown = list.slice(0, 30);
    const card = ([i, st]) => {
      const p = D.problems[i], best = Math.round(Number(st.best) * p.moves) || 0, log = Array.isArray(st.log) ? st.log : [];
      const sessions = log.length, open = !st.sent;
      const fl = open ? Mech.feel(chanceFor(i)) : null;
      const moves = d3.range(1, p.moves + 1).map(k => `<i class="${k <= best ? "on" : ""}${k === best && open ? " hi" : ""}"></i>`).join("");
      const hist = sessions ? `<div class="pj-hist" aria-label="Highpoint by session">${log.slice(-12).map(e => {
        const h = Math.max(0.06, Math.min(1, Number(e[2]) || 0)), sent = e[3] === 1;
        return `<span title="${esc(shortDate(String(e[0])))}: ${Number(e[1]) || 0} ${Number(e[1]) === 1 ? "try" : "tries"}, ${sent ? "sent!" : `move ${Math.round(h * p.moves)} of ${p.moves}`}"><i class="${sent ? "sent" : ""}" style="height:${(h * 100).toFixed(0)}%"></i></span>`; }).join("")}</div>` : "";
      const summary = open
        ? `${st.att} ${st.att === 1 ? "try" : "tries"}${sessions ? ` over ${sessions} ${sessions === 1 ? "session" : "sessions"}` : ""}${lastDate(st) ? ` · last tried ${shortDate(lastDate(st))}` : ""}`
        : `Sent ${st.sentOn ? shortDate(st.sentOn) : ""} after ${st.att} tries${sessions ? ` over ${sessions} ${sessions === 1 ? "session" : "sessions"}` : ""}`;
      return `<li class="pj">
        <div class="pj-top"><button type="button" class="linklike pj-name" data-cl="${i}"><span class="grade">V${p.grade}</span> ${esc(p.name)}</button>
          ${open ? `<button type="button" class="btn small" data-go-problem="${i}">Go</button>` : `<span style="color:var(--plus);font-weight:600">✓</span>`}</div>
        <div class="meta" style="margin:0">${esc(p.boulder.name)} · ${esc(p.sector)} · ${summary}</div>
        <div class="pj-row"><span class="pj-lbl">${open ? `Highpoint: move ${best} of ${p.moves}` : "Topped out"}</span><div class="pj-moves">${moves}</div></div>
        ${open ? `<div class="pj-row"><span class="pj-lbl">Beta: ${Math.round((Number(st.beta) || 0) / Mech.BETA_MAX * 100)}% worked out</span><span class="pj-lbl">Today: <b>${fl.label}</b></span></div>` : ""}
        ${hist}</li>`;
    };
    const opts = [["recent", "Recently tried"], ["close", v === "sent" ? "Most tries" : "Closest to sending"], ["grade", "Hardest"], ["tries", "Most tries"]].filter((o, k) => !(v === "sent" && k === 3));
    return `<h3>Projects</h3>
      <div class="cl-filters" style="margin-bottom:6px">
        <div class="cl-views" role="group" aria-label="Projects" style="margin:0">
          <button type="button" data-pj-view="open" aria-pressed="${v === "open"}">Open (${all.filter(([, st]) => !st.sent).length})</button>
          <button type="button" data-pj-view="sent" aria-pressed="${v === "sent"}">Sent (${all.filter(([, st]) => st.sent && st.att >= 2).length})</button></div>
        <select id="pj-sort" aria-label="Sort projects">${opts.map(([k, l]) => `<option value="${k}" ${UI.pj.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      ${shown.length ? `<ul class="pj-list">${shown.map(card).join("")}</ul>${list.length > 30 ? `<p class="meta">Showing 30 of ${list.length}.</p>` : ""}`
        : `<p class="meta">${v === "open" ? "Anything you try and don't send shows up here, with your highpoint and how each session went." : "Projects you send after more than one try show up here."}</p>`}
      <p class="meta">Bars show your highpoint each session; green means you sent it that day.</p>`;
  }
  function journalHtml() {
    const tips = [...G.tips].reverse();
    const todo = G.todo.filter(i => !G.ps[i]?.sent);
    return `<h2>Journal</h2>
      ${projectsHtml()}
      <h3>Tips from locals</h3>
      ${tips.length ? `<ul class="rowlist">${tips.map(t => { const p = D.problems[t.p];
        return `<li><button type="button" class="rowbtn" data-go-problem="${t.p}"><span><span class="t">V${p.grade} ${esc(p.name)} ${t.done ? `<span style="color:var(--plus);font-weight:500">✓ sent</span>` : ""}</span>
          <span class="s">From ${esc(D.climbers[t.from][0])}: ${esc(t.why.slice(0, 2).join(", "))} · ${esc(p.sector)}</span></span><span class="v">${t.done ? "" : "Go"}</span></button></li>`; }).join("")}</ul>`
        : `<p class="meta">Climbers you meet on the trail will tell you about problems that suit you. Sending one earns bonus XP.</p>`}
      <h3>To-do list</h3>
      ${todo.length ? `<ul class="rowlist">${todo.map(i => { const p = D.problems[i];
        return `<li><button type="button" class="rowbtn" data-go-problem="${i}"><span><span class="t">V${p.grade} ${esc(p.name)}</span><span class="s">${esc(p.boulder.name)} · ${esc(p.sector)}</span></span><span class="v">Go</span></button></li>`; }).join("")}</ul>`
        : `<p class="meta">Add problems from CragLog.</p>`}
      <h3>Achievements</h3>
      <div class="ach">${ACH.map(([id, name, desc]) => `<div class="${G.ach[id] ? "" : "locked"}"><b>${esc(name)}</b><span>${esc(desc)}${G.ach[id] ? ` · ${shortDate(G.ach[id])}` : ""}</span></div>`).join("")}</div>
      <h3>Recent</h3>
      <ul class="feed">${G.feed.slice(0, 30).map(f => `<li><time>${shortDate(f.date)}</time>${esc(f.text)}</li>`).join("")}</ul>`;
  }

  function bindPanel(el) {
    const on = (sel, fn) => el.querySelectorAll(sel).forEach(n => { n.onclick = () => fn(n); });
    on("[data-try]", n => tryProblem(+n.dataset.try));
    on("[data-expand]", n => { const i = +n.dataset.expand; UI.expanded.has(i) ? UI.expanded.delete(i) : UI.expanded.add(i); renderPanel(); });
    on("[data-go-sector]", n => travel({ sector: n.dataset.goSector, boulder: null }));
    on("[data-go-boulder]", n => { const b = D.boulders[+n.dataset.goBoulder]; travel({ sector: b.sector, boulder: b.id }); });
    on("[data-go-problem]", n => { const p = D.problems[+n.dataset.goProblem]; UI.expanded.add(p.id); travel({ sector: p.sector, boulder: p.b }); });
    on("[data-cl]", n => { UI.cl.problem = +n.dataset.cl; UI.tab = "craglog"; renderTabs(); renderPanel(); $("#tabbody").scrollTop = 0; });
    on("[data-cl-back]", () => { UI.cl.problem = null; renderPanel(); });
    on("[data-todo]", n => { const i = +n.dataset.todo; if (!G.todo.includes(i)) G.todo.push(i); save(); renderAll(); });
    on("[data-accept]", acceptTip);
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
    on("[data-reset-yes]", () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } G = null; UI.confirmReset = false; showCreator(); });
    const q = el.querySelector("#cl-q");
    if (q) {
      q.oninput = () => { UI.cl.q = q.value; const pos = q.selectionStart; renderPanel(); const nq = $("#cl-q"); nq.focus(); nq.setSelectionRange(pos, pos); };
      for (const [id, key, num] of [["#cl-sector", "sector", false], ["#cl-sort", "sort", false], ["#cl-lo", "lo", true], ["#cl-hi", "hi", true], ["#cl-done", "done", false]]) {
        el.querySelector(id).onchange = e => { UI.cl[key] = num ? +e.target.value : e.target.value; renderPanel(); };
      }
    }
  }

  // ============================================================ modals/toasts
  function modal(html, bind) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const close = () => { root.innerHTML = ""; };
    bind(root, close);
    const first = root.querySelector("button"); if (first) first.focus();
  }
  function toast(title, text, kind) {
    const el = document.createElement("div");
    el.className = "toast"; if (kind === "info") el.style.borderLeftColor = "var(--energy)";
    el.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  let bannerTimer = null;
  function showBanner(style, p, xp) {
    const b = $("#banner");
    b.innerHTML = `<div class="big ${style === "Flash" ? "flash" : ""}">${style === "Flash" ? "FLASH!" : style === "Repeat" ? "AGAIN" : "SENT!"}</div>
      <div class="what">${esc(p.name)} · V${p.grade}</div><div class="xp">+${fmt(xp)} XP</div>`;
    b.hidden = false; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2200);
  }
  function showLevelUp(level) {
    modal(`<span class="label-sm">Level up</span><div class="big-level">V${level}</div>
      <h2>${esc(LEVEL_LINES[level] || "Stronger every season.")}</h2>
      <p class="lede">V${level} problems will now feel like projects instead of impossibilities. Keep sending near your limit to reach V${level + 1}.</p>
      <div class="acts"><button type="button" class="btn primary" data-close>Keep climbing</button></div>`,
      (root, close) => { root.querySelector("[data-close]").onclick = () => { close(); UI.levelPending = false; if (G.day.over) showSummary(); }; });
  }
  function showSummary() {
    const d = G.day, newSends = d.sends.filter(s => s.style !== "Repeat");
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
    modal(`<span class="label-sm">Day ${d.no} · ${prettyDate(G.date)}</span><h2>${d.rainedOut ? "Rained out" : newSends.length ? `${newSends.length} new ${newSends.length === 1 ? "send" : "sends"}` : d.attempts ? "No sends today" : "A quiet day"}</h2>
      <p class="lede">${esc(d.reason || "")} ${d.attempts} attempts, ${d.highpoints} new highpoints, +${fmt(d.xp)} XP${levelUps > 0 ? `, and you leveled up to V${levelNow().level}` : ""}.</p>
      ${newSends.length ? `<ul class="rowlist">${newSends.map(s => `<li><div class="rowbtn" style="cursor:default"><span><span class="t">V${D.problems[s.p].grade} ${esc(D.problems[s.p].name)}</span><span class="s">${s.style}</span></span><span class="v" style="color:var(--gold)">+${fmt(s.xp)} XP</span></div></li>`).join("")}</ul>` : ""}
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
    return { name: g.player.name, level: Mech.levelInfo(g.player.xp).level, best: g.bestGrade,
      sends: g.ticks.filter(t => t.style !== "Repeat").length, date: g.date, days: g.dayNo };
  }
  const describeSave = s => `${s.name}: level V${s.level}, hardest send ${s.best >= 0 ? "V" + s.best : "none yet"}, ${s.sends} problems sent, ${prettyDate(s.date)} (day ${s.days})`;

  async function exportSave() {
    const filename = `granite-hollow-${slug(G.player.name)}-${G.date}.json`;
    const body = JSON.stringify({ format: SAVE_FORMAT, version: 1, exported: new Date().toISOString(),
      summary: saveSummary(G), game: G }, null, 1);
    try {
      if (downloads) await downloads.save({ filename, data: body });   // first await: stays inside the click
      else {
        const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      G.backup = { at: new Date().toISOString(), dayNo: G.dayNo }; save();
      toast("Save file downloaded", filename, "info");
      renderPanel();
    } catch (e) {
      if (e && e.code === "declined") return;
      toast("Couldn't download the save file", e && e.code === "rate_limited" ? "A download prompt is already open. Try again in a moment." : "Downloads aren't available here. Try opening the game in a desktop browser.", "info");
    }
  }

  // Check a loaded file thoroughly: every problem and climber it points at must
  // exist, and no text may contain markup.
  function validateSave(obj) {
    const g = obj && obj.format === SAVE_FORMAT ? obj.game : obj && obj.v === 1 && obj.player ? obj : null;
    if (!g) throw new Error("This isn't a Granite Hollow save file.");
    if (g.v !== 1) throw new Error("This save file is from a different version of the game.");
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
      && (g.tips || []).every(t => t && isP(t.p) && Number.isInteger(t.from) && t.from >= 0 && t.from < nC && Array.isArray(t.why))
      && g.day && g.day.weather && num(g.day.minute) && Array.isArray(g.day.sends) && g.day.sends.every(s => s && isP(s.p))
      && (g.loc == null || g.loc.boulder == null || (Number.isInteger(g.loc.boulder) && g.loc.boulder >= 0 && g.loc.boulder < D.boulders.length));
    if (!ok) throw new Error("This save file is damaged or incomplete.");
    for (const [k, v] of [["tips", []], ["todo", []], ["ach", {}], ["visited", []], ["feed", []]]) if (g[k] == null) g[k] = v;
    if (!num(g.bestGrade)) g.bestGrade = -1;
    migrateSave(g);
    g.day.encounter = null;
    const okWx = f => f && typeof f.date === "string" && /^\d{4}-\d\d-\d\d$/.test(f.date) && num(f.temp) && num(f.cond) && num(f.dusk)
      && ["label", "sky", "note"].every(k => typeof f[k] === "string") && (f.rainAt == null || num(f.rainAt)) && (f.pop == null || (num(f.pop) && f.pop >= 0 && f.pop <= 1));
    if (!Array.isArray(g.forecast) || !g.forecast.every(okWx)) g.forecast = [];
    if (typeof g.id !== "string" || !/^[a-z0-9]{4,40}$/.test(g.id)) g.id = newId();
    g.board = g.board && g.board.joined === true ? { joined: true } : { joined: false };
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
    Object.assign(UI, { tab: "here", busy: false, confirmReset: false, levelPending: false });
    UI.expanded.clear(); UI.cl.problem = null;
    $("#modal-root").innerHTML = "";
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
        out[v] = { date: t.date, days: daysSince(t.date), cday: Number.isInteger(t.day) ? t.day : null, p: t.p, name: p.name, grade: p.grade, style: t.style };
    }
    return out;
  }
  function boardEntry() {
    const pl = G.player;
    return { name: pl.name.slice(0, 24), height: pl.height, ape: pl.ape, best: G.bestGrade, level: levelNow().level,
      sends: firstSends().length, days: daysSince(G.date), cdays: G.dayNo, ms: milestones(G), rk: rankSummaryForBoard() };
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
        out.push({ rk, name: str(c.name, 24).trim() || "Climber", height: n(c.height, 100, 250), ape: n(c.ape, -30, 30),
          best: n(c.best, -1, 17) ?? -1, level: n(c.level, 0, 17) ?? 0, sends: n(c.sends, 0, 1e6) ?? 0, days: n(c.days, 0, 1e5) ?? 0,
          cdays: n(c.cdays, 0, 1e5), ms, mine: false, yours: uid === LB.uid });
      }
    }
    out.push({ ...boardEntry(), mine: true, yours: true, posted: G.board.joined && LB.status !== "off" && !!LB.uid && LB.canWrite !== false });
    return out;
  }

  function leadersHtml() {
    const all = boardClimbers();
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
    if (LB.status !== "off") {
      if (!LB.uid) join = `<p class="meta">Sign in to claude.ai to post your climber.</p>`;
      else if (LB.canWrite === false) join = `<div class="lb-join"><p class="lede" style="margin:0">You can watch the board, but your access to this game is view-only, so you can't post. Ask whoever shared it for edit access.</p></div>`;
      else if (!G.board.joined) join = `<div class="lb-join"><p class="lede" style="margin:0 0 8px">Post <b>${esc(G.player.name)}</b> to the leaderboard? Everyone who can open this game will see your climber's name, height and first send of each grade. Your claude.ai name isn't shown.</p>
        <button type="button" class="btn primary" data-lb-join>Join the leaderboard</button></div>`;
    }

    const others = [...all].sort((a, b) => b.best - a.best || (a.ms[a.best]?.days ?? 1e9) - (b.ms[b.best]?.days ?? 1e9));
    return `${cragHead()}
      <p class="meta">Who sent each grade first, counted in days since everyone's first day at Granite Hollow (${shortDate(START_DATE)}). A V${g} board also counts a first send of anything harder.</p>
      ${status}${join}
      <div class="lb-grades" role="group" aria-label="Grade">${BOARD_GRADES.map(v => `<button type="button" data-lb-grade="${v}" aria-pressed="${v === g}">V${v}${counts[v] ? `<span>${counts[v]}</span>` : ""}</button>`).join("")}</div>
      <h3>First to V${g}</h3>
      ${rows.length ? `<table><thead><tr><th>#</th><th>Climber</th><th>When</th><th>Problem</th></tr></thead><tbody>
        ${rows.map((c, k) => { const m = c.ms[g]; return `<tr class="${c.mine ? "lb-me" : ""}"><td class="num">${k + 1}</td><td>${who(c)}</td>
          <td>Day ${m.days + 1}<div class="meta" style="margin:0">${esc(fmtDate(m.date))}${m.cday != null ? ` · ${m.cday} climbing` : ""}</div></td>
          <td>${m.p != null ? `<button type="button" class="linklike" data-cl="${m.p}">${esc(D.problems[m.p].name)}</button>` : esc(m.name)}<div class="meta" style="margin:0">${m.grade != null ? `V${m.grade}` : ""}${m.style ? ` · ${esc(m.style)}` : ""}</div></td></tr>`; }).join("")}
        </tbody></table>` : `<p class="lede">Nobody has sent V${g} yet.</p>`}
      <h3>Everyone</h3>
      <table><thead><tr><th>Climber</th><th>Hardest</th><th>Level</th><th>Sends</th><th>Days in</th></tr></thead><tbody>
        ${others.map(c => `<tr class="${c.mine ? "lb-me" : ""}"><td>${who(c)}</td><td class="num">${c.best >= 0 ? "V" + c.best : "–"}</td><td class="num">V${c.level}</td><td class="num">${c.sends}</td><td class="num">${c.days + 1}</td></tr>`).join("")}
      </tbody></table>
      ${G.board.joined && LB.status !== "off" ? `<p class="meta" style="margin-top:14px"><button type="button" class="linklike" data-lb-leave>Take ${esc(G.player.name)} off the leaderboard</button></p>` : ""}`;
  }
  function joinBoard() { G.board = { joined: true }; LB.lastSent = null; save(); renderPanel(); }
  function leaveBoard() { G.board = { joined: false }; save(); syncBoard(true); renderPanel(); }

  // ================================================================= creator
  // A little scene for the title page: granite, a crashpad, someone on the
  // boulder, and the woods in the colours of the day the game starts.
  const CREATOR_ART = (() => {
    const tree = (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s})"><path d="M0 0V-14M0 -8L-5 -14M0 -10L4 -16" stroke="var(--trunk)" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M0 -36c8 0 13 5 12 12 3 5 0 12-7 12-3 3-9 3-12 0-7 0-10-7-7-12-1-7 5-12 14-12z" fill="var(${c})" stroke="var(--tree-ink)" stroke-width="1.2"/></g>`;
    const pine = (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s})"><path d="M0 0V-5" stroke="var(--trunk)" stroke-width="1.6"/><path d="M0 -40l9 13h-4l9 13h-4l8 11H-8l8-11h-4l9-13h-4z" fill="var(${c})" stroke="var(--tree-ink)" stroke-width="1.2" stroke-linejoin="round"/></g>`;
    return `<svg class="vignette" viewBox="0 0 900 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path d="M0 132C120 118 210 126 330 120S560 112 690 122 840 126 900 120V150H0Z" fill="var(--meadow)" opacity=".7"/>
      <path d="M0 136C150 128 260 134 420 130S700 124 900 132" fill="none" stroke="var(--contour)" stroke-width="1.2" opacity=".7"/>
      ${pine(40, 132, 1.25, "--ever-0")}${tree(88, 130, 1.1, "--maple-0")}${tree(130, 133, .9, "--birch-1")}${pine(168, 131, .95, "--ever-1")}
      ${tree(700, 126, 1.15, "--maple-1")}${pine(745, 128, 1.3, "--ever-0")}${tree(792, 130, 1, "--oak-0")}${tree(835, 127, 1.2, "--maple-2")}${pine(870, 129, .9, "--ever-1")}
      <ellipse cx="470" cy="136" rx="120" ry="9" fill="var(--granite-edge)" opacity=".16"/>
      <path d="M368 134C360 104 382 70 430 60 470 50 520 56 548 78 572 96 578 120 570 134Z" fill="var(--granite)" stroke="var(--granite-edge)" stroke-width="1.6"/>
      <path d="M400 92C410 76 436 66 462 66" fill="none" stroke="var(--granite-hi)" stroke-width="7" stroke-linecap="round" opacity=".8"/>
      <path d="M470 84l6 22M512 96l-8 18" stroke="var(--granite-edge)" stroke-width="1.1" opacity=".5"/>
      <rect x="430" y="128" width="64" height="9" rx="2.5" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.2"/>
      <g stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" fill="none">
        <circle cx="495" cy="70" r="5" fill="var(--ink)"/><path d="M493 76l-8 16M490 82l-9-10M490 82l12-6M485 92l-10 6M485 92l6 12"/>
      </g>
      <circle cx="281" cy="40" r="15" fill="var(--gold)" opacity=".55"/>
    </svg>`;
  })();

  function showCreator() {
    $("#game").hidden = true; $("#loading").hidden = true;
    applySeason(START_DATE);
    const el = $("#creator"); el.hidden = false;
    const st = { name: "", height: 165, ape: 2, strengths: [], weakness: null };
    function reachNote() {
      const r = st.height + st.ape;
      if (r < 170) return `Reach ${r} cm. Bunchy, compressed problems will suit you. Reachy ones will feel a grade or so harder.`;
      if (r > 182) return `Reach ${r} cm. Reachy problems will feel easier. Cramped, bunchy ones will feel harder.`;
      return `Reach ${r} cm, about average. Few problems will care about your size.`;
    }
    function draw() {
      const ftIn = cm => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)}′${i % 12}″`; };
      el.innerHTML = `${CREATOR_ART}<p class="label-sm">A bouldering game</p><h1>Granite Hollow</h1>
        <p class="intro">1,000 problems on 75 boulders, from V0 warm-ups to V13 test pieces. You start at V0. Every attempt is a roll against the grade, shaped by your strength, your style, your height, the beta you've worked out, your skin, and the weather.</p>
        <div class="cc-grid">
          <div class="cc-card"><h2>Your climber</h2><p class="help">Height and ape index decide which problems suit your body.</p>
            <div class="field"><label for="cc-name">Name</label><input type="text" id="cc-name" maxlength="24" placeholder="e.g. Maddie" value="${esc(st.name)}"></div>
            <div class="field"><label for="cc-height">Height <output>${st.height} cm · ${ftIn(st.height)}</output></label><input type="range" id="cc-height" min="150" max="200" step="1" value="${st.height}"></div>
            <div class="field"><label for="cc-ape">Ape index <output>${st.ape >= 0 ? "+" : ""}${st.ape} cm</output></label><input type="range" id="cc-ape" min="-6" max="12" step="1" value="${st.ape}"></div>
            <p class="reach-note">${reachNote()}</p></div>
          <div class="cc-card"><h2>Strengths</h2><p class="help">Pick two styles you're naturally good at.</p>
            <div class="stylepick">${Mech.PREF.map(t => `<button type="button" class="str" data-str="${t}" aria-pressed="${st.strengths.includes(t)}" title="${esc(STYLE[t][1])}" ${!st.strengths.includes(t) && (st.strengths.length >= 2 || st.weakness === t) ? "disabled" : ""}>${STYLE[t][0]}</button>`).join("")}</div>
            <h2 style="margin-top:16px">Weakness</h2><p class="help">Optional. Pick one style you struggle with.</p>
            <div class="stylepick">${Mech.PREF.map(t => `<button type="button" class="weak" data-weak="${t}" aria-pressed="${st.weakness === t}" title="${esc(STYLE[t][1])}" ${st.strengths.includes(t) ? "disabled" : ""}>${STYLE[t][0]}</button>`).join("")}</div></div>
        </div>
        <div class="cc-start"><button type="button" class="btn primary" id="cc-go" ${st.strengths.length === 2 ? "" : "disabled"}>Drive to the crag</button>
          <span class="meta" style="margin:0">${st.strengths.length === 2 ? "Your progress saves in this browser." : `Pick ${2 - st.strengths.length} more ${st.strengths.length === 1 ? "strength" : "strengths"}.`}</span></div>
        <p class="meta" style="margin-top:14px">Already have a climber? <button type="button" class="linklike" id="cc-load">Load a save file</button></p>`;
      $("#cc-load").onclick = pickSaveFile;
      $("#cc-name").oninput = e => { st.name = e.target.value; };
      $("#cc-height").oninput = e => { st.height = +e.target.value; drawKeepFocus("#cc-height"); };
      $("#cc-ape").oninput = e => { st.ape = +e.target.value; drawKeepFocus("#cc-ape"); };
      el.querySelectorAll("[data-str]").forEach(b => b.onclick = () => {
        const t = b.dataset.str; st.strengths = st.strengths.includes(t) ? st.strengths.filter(x => x !== t) : [...st.strengths, t].slice(0, 2); draw();
      });
      el.querySelectorAll("[data-weak]").forEach(b => b.onclick = () => { st.weakness = st.weakness === b.dataset.weak ? null : b.dataset.weak; draw(); });
      $("#cc-go").onclick = () => {
        newGame({ name: st.name.trim() || "You", height: st.height, ape: st.ape, strengths: st.strengths, weakness: st.weakness });
        save(); showGame();
      };
    }
    function drawKeepFocus(sel) { draw(); const n = $(sel); if (n) n.focus(); }
    draw();
  }

  function showGame() {
    $("#creator").hidden = true; $("#loading").hidden = true; $("#game").hidden = false;
    if (!M) {
      try { M = buildMap(); }
      catch (e) { reportError("map", e); M = { walk: (pts, ms, done) => done(), update() { safely("light", applyAtmosphere); }, focusSector() {}, meXY: placeXY }; }
    }
    renderAll();
    if (!G.day.over && rainNow()) endDay(`It's ${G.day.weather.precip === "Snow" ? "snowing" : "raining"}. Wet granite is slick and holds can snap, so you head home.`);
    else if (G.day.over) showSummary();
  }

  // ==================================================================== boot
  // Saves keep sector names (where you're standing, where you've been). The
  // sectors were renamed once; translate old names so those saves still work.
  const OLD_SECTOR_NAMES = {
    "Parking Lot Boulders": "The Tailgate", "Warm-Up Wall": "The Schoolhouse", "The Pond Caves": "Millrace Caves",
    "Summit Blocks": "Hawkwatch", "Fern Gully": "Bracken Gully", "Dam Area": "The Spillway", "Lost Crag": "The Cellar Holes",
    "Quarry Rim": "The Grout Piles",
  };
  function migrateSave(g) {
    const fix = name => (name == null || D.sectorBy.has(name) ? name : OLD_SECTOR_NAMES[name] || null);
    g.loc = g.loc || { sector: null, boulder: null };
    const b = Number.isInteger(g.loc.boulder) ? D.boulders[g.loc.boulder] : null;
    g.loc.sector = fix(g.loc.sector);
    if (b && g.loc.sector !== b.sector) g.loc.sector = b.sector;          // standing at a boulder: that's its sector
    if (!b) g.loc.boulder = null;
    if (g.loc.sector != null && !D.sectorBy.has(g.loc.sector)) g.loc = { sector: null, boulder: null };
    g.visited = [...new Set((g.visited || []).map(fix).filter(Boolean))];
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
    D = await fetch("game-data.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    prepData();
    connectDownloads();
    connectBoard();
    $("#save-file").onchange = e => onSaveFile(e.target.files[0]);
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ G }));
    const start = data => {
      G = (data && data.G) || load();
      if (G) { if (!G.id) G.id = newId(); if (!G.board) G.board = { joined: false }; migrateSave(G); save(); }
      if (G && G.v === 1 && G.day) showGame(); else showCreator();
    };
    if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
  }
  boot().catch(err => {
    $("#loading").textContent = `Granite Hollow didn't load (${err.message || err}). Reload the page to try again.`;
  });
})();
