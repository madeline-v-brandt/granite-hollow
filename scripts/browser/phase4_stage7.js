// Phase 4, Stage 7: events and stories. Each event is on the forecast (flagged) and in a
// poster before it; its day is always dry (even when the save's forecast said rain) and
// everyone's out. The comp: a scorecard and live leaders in the Here tab, your comp score
// after a send, results and a podium at dusk, your place in the journal, a ribbon on the
// Climber page, "at the comp" in the logbook. The spring comp too. The bonfire and the dusk
// session gather everyone at dusk; on Trail Day an old trail reopens (on the map and the trail
// map), and helping brushes lines. A bad events
// record in a save file is cleaned; the comp card fits a phone.
//   node scripts/browser/phase4_stage7.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, GAME_DIR } = require("./lib");
const path = require("path");
const World = require(GAME_DIR + "world.js");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  };
  const modalText = () => p.evaluate(() => { const m = document.querySelector(".modal"); return m ? m.innerText : ""; });
  const closeAll = async () => { for (let k = 0; k < 6 && (await p.$(".modal [data-close], .modal [data-next]:not(.plan)")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]:not(.plan)"); await sleep(200); } };
  const here = () => p.evaluate(() => document.querySelector("#tabbody").innerText);
  // The evening before a date: the day's over, so the summary's "Climb tomorrow" goes there.
  const eveOf = async (g, date, forecast = null) => {
    g.date = World.addDays(date, -1); g.day.over = true; g.day.reason = "Test."; g.day.encounter = null; g.day.partner = null;
    g.forecast = forecast || []; await write(g); await closeAll();
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
  };
  const toTomorrow = async () => { await click(p, ".modal [data-next='0']"); await sleep(700); await closeAll(); };
  // Late in the day: the light goes, and you're walked back (dusk).
  const toDusk = async () => { const g = await saved(); g.day.minute = g.day.weather.dusk - 5; g.day.encounter = null; await write(g); await click(p, "#act-rest"); await sleep(900); };

  // A new climber.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeAll();
  const base = await saved();

  // 1. A week out: a poster, and on the forecast the comp is flagged, and dry though the save said rain.
  let g = JSON.parse(JSON.stringify(base));
  g.date = "2025-10-28"; g.day.over = false; g.forecast = []; await write(g); await closeAll();
  let t = await here();
  check("before an event: it's coming up, in the Here tab", /Coming up[\s\S]*Bouldering Comp/i.test(t), t.slice(0, 200));
  g = JSON.parse(JSON.stringify(base));
  await eveOf(g, "2025-11-01", [{ date: "2025-11-01", temp: 50, sky: "Overcast", cond: 0.35, label: "Prime", note: "Crisp air. Friction is excellent.", dusk: 990, precip: "Rain", pop: 0.8, rainWhen: "morning", rainAt: null }]);
  const fc = await p.evaluate(() => [...document.querySelectorAll(".modal .plan")].map(x => ({ ev: x.classList.contains("event"), t: x.innerText.replace(/\s+/g, " ") })));
  check("the forecast flags the comp, and it's dry", fc.length && fc[0].ev && /Bouldering Comp/.test(fc[0].t) && /Dry/.test(fc[0].t), JSON.stringify(fc[0]));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-forecast.png") });
  await toTomorrow();

  // 2. Comp day.
  g = await saved();
  check("comp day: dry, with the comp in the day's opening", g.date === "2025-11-01" && !g.day.rainedOut && /Bouldering Comp/.test(g.day.last.text), g.day.weather.label);
  const out = await p.evaluate(() => [...document.querySelectorAll("g.person")].map(x => x.dataset.who));
  const regs = World.CLIMBING_REGULARS.filter(w => g.world.npc[w]);
  check("…and every regular who climbs comes out for it", regs.every(w => out.includes(w)), `${out.join(",")} / ${regs.join(",")}`);
  t = await here();
  check("…the Here tab: your card and the leaders so far", /Your card: 0 points/i.test(t) && /Leaders so far/i.test(t), t.slice(0, 160));
  // Some sends (written into the day, as the scene would), then the card adds up.
  const D = require(GAME_DIR + "game-data.json");
  const easy = Object.keys(g.world.est).map(Number).filter(i => D.problems[i].grade <= 4).slice(0, 7);
  g.day.sends = easy.map((i, k) => ({ p: i, style: k === 0 ? "Flash" : k === 1 ? "Repeat" : "Send", xp: 0 }));
  g.ticks.push(...easy.map((i, k) => ({ p: i, date: g.date, day: g.dayNo, style: k === 0 ? "Flash" : "Send", att: 1, stars: null })));
  for (const i of easy) g.ps[i] = { att: 1, sent: true, best: 1, beta: 0, sends: 1, log: [] };
  g.day.minute = 900; await write(g); await closeAll();
  const want = World.compScore(g.day.sends, i => g.world.est[i].grade).score;
  t = await here();
  check("…your five best sends score (repeats count, each line once)", new RegExp(`Your card: ${want.toLocaleString("en-US")} points`, "i").test(t), `${want} · ${(t.match(/Your card: [\d,]+/i) || [""])[0]}`);
  check("…and the leaders fill in through the day", /Leaders so far\s*1\. /i.test(t));
  if (SHOTS) { await p.evaluate(() => { const c = document.querySelector(".event-card"); if (c) c.scrollIntoView(); }); await p.screenshot({ path: path.join(SHOTS, "p4s7-comp.png") }); }
  // Dusk: the results.
  await toDusk();
  let m = await modalText();
  check("at dusk: the results, a podium, and your place", /The results/.test(m) && /You came/.test(m) && !!(await p.$(".modal .event-art")), m.slice(0, 200));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-podium.png") });
  g = await saved();
  const ev = (g.events || {})["2025-11-01"];
  check("…recorded: your score and place, in the journal too", ev && ev.score === want && ev.place >= 1 && ev.of >= 3 && ev.there && g.feed.some(f => /Bouldering Comp: you came/.test(f.text)), JSON.stringify(ev));
  await click(p, ".modal [data-close]"); await sleep(400);
  m = await modalText();
  check("…then the day's summary", /Here's the forecast/.test(m), m.slice(0, 80));
  await closeAll();
  await click(p, "[data-tab='climber']"); await sleep(300);
  t = await here();
  check("the Climber page: ribbons and gatherings", /Ribbons and gatherings[\s\S]*Bouldering Comp 2025/i.test(t), (t.match(/Ribbons[\s\S]{0,140}/i) || [""])[0]);
  await click(p, "[data-tab='craglog']"); await sleep(200); await click(p, "[data-cl-view='mylog']"); await sleep(300);
  t = await here();
  check("…and the logbook says which sends were at the comp", /at the comp/.test(t), t.slice(0, 120));
  await click(p, "[data-tab='here']"); await sleep(200);
  // A week later: Local Buzz has the results; the regulars talk about it.
  g = await saved(); g.date = "2025-11-05"; g.day.over = false; g.day.met = []; g.day.encounter = null; await write(g); await closeAll();
  await click(p, "[data-tab='craglog']"); await sleep(200);
  await click(p, "[data-cl-view='buzz']"); await sleep(300);
  t = await here();
  check("Local Buzz: the comp's results", /Bouldering Comp went to/.test(t), (t.match(/[^\n]*Bouldering Comp[^\n]*/) || [t.slice(0, 120)])[0]);
  await click(p, "[data-tab='here']"); await sleep(200);

  // 3. The Solstice Bonfire: crisp (Prime), and a gathering at dusk.
  g = await saved(); await eveOf(g, "2025-12-21"); await toTomorrow();
  g = await saved();
  check("the Solstice Bonfire: a crisp, dry day", g.date === "2025-12-21" && g.day.weather.label === "Prime" && !g.day.rainedOut && /Solstice Bonfire/.test(g.day.last.text), g.day.weather.label);
  t = await here();
  check("…the Here tab says to stay till dusk", /Solstice Bonfire[\s\S]*Stay till dusk/.test(t));
  await toDusk();
  m = await modalText();
  check("…at dusk, round the fire: Gus and the Bishop's stories", /Round the fire/.test(m) && /Gus tells/.test(m) && /The Bishop/.test(m), m.slice(0, 200));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-bonfire.png") });
  g = await saved();
  check("…recorded", g.events["2025-12-21"] && g.events["2025-12-21"].there);
  await closeAll();

  // 4. The spring comp (April 1): a card, and results at dusk.
  g = await saved(); await eveOf(g, "2026-04-01"); await toTomorrow();
  t = await here(); g = await saved();
  check("the spring comp: April 1, dry, with its card", g.date === "2026-04-01" && !g.day.rainedOut && /Spring Comp[\s\S]*Your card/i.test(t), g.date);
  await toDusk();
  m = await modalText();
  check("…and its results at dusk", /Spring Comp/i.test(m) && /The results/.test(m), m.slice(0, 80));
  await closeAll();

  // 5. Trail Day (August): the old trail is hidden on the map until that morning; then it's a trail, and helping walks you along it.
  g = await saved(); await eveOf(g, "2026-08-01");
  const faint = await p.evaluate(() => ({ n: document.querySelectorAll(".old-trail").length, open: document.querySelectorAll(".old-trail.open").length }));
  faint.shown = await p.evaluate(() => [...document.querySelectorAll(".old-trail")].filter(x => getComputedStyle(x).display !== "none").length);
  check("before Trail Day: the old trails are hidden (none open, none drawn)", faint.n >= 4 && faint.open === 0 && faint.shown === 0, JSON.stringify(faint));
  await toTomorrow();
  g = await saved(); const m0 = g.day.minute;
  t = await here();
  const opened = await p.evaluate(() => [...document.querySelectorAll(".old-trail.open")].map(x => x.getAttribute("data-old")));
  const drawn = await p.evaluate(() => [...document.querySelectorAll(".old-trail")].filter(x => getComputedStyle(x).display !== "none").map(x => x.getAttribute("data-old")));
  check("…and drawn on the map (only that one)", drawn.length >= 1 && drawn.every(x => x === "quarrymen"), drawn.join(","));
  check("Trail Day (first Saturday in August): this year's old trail is open from the morning", g.date === "2026-08-01" && opened.length >= 1 && opened.every(x => x === "quarrymen") && /Quarrymen's Path/.test(g.day.last.text), opened.join());
  check("…and you can help", /Help with Trail Day/.test(t));
  await click(p, "[data-trail]"); await sleep(500);
  g = await saved();
  check("…two hours with Gus, recorded", g.day.trail && g.day.minute >= m0 + 120 && g.events["2026-08-01"] && g.events["2026-08-01"].helped && g.events["2026-08-01"].trail === "quarrymen", JSON.stringify(g.events["2026-08-01"]));
  check("…it says so", /Trail Day/.test(g.day.last.title) && /Quarrymen's Path is a trail again/.test(g.day.last.text), g.day.last.text.slice(0, 200));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-trail.png") });
  // The trail map shows it.
  await p.keyboard.press("m"); await sleep(600);
  const paperOld = await p.evaluate(() => document.querySelectorAll(".pp-old path").length);
  check("…and the trail map shows it", paperOld === 1, String(paperOld));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-trail-paper.png") });
  await p.keyboard.press("Escape"); await sleep(300);

  // 6. The Midsummer Dusk Session.
  g = await saved(); await eveOf(g, "2026-06-21"); await toTomorrow();
  await toDusk();
  m = await modalText();
  check("the Midsummer Dusk Session: headlamps at dusk", /Headlamps on/.test(m) && /sandwiches/.test(m), m.slice(0, 160));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s7-midsummer.png") });
  await closeAll();

  // 7. A phone: the comp card.
  await p.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  g = await saved(); await eveOf(g, "2026-11-01"); await toTomorrow();
  const fit = await p.evaluate(() => { const c = document.querySelector(".event-card"); if (!c) return null; const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  check("on a phone, the comp card fits", fit && fit.l >= 0 && fit.r <= fit.vw + 1 && fit.sw <= fit.vw + 1, JSON.stringify(fit));
  if (SHOTS) { await p.evaluate(() => { const c = document.querySelector(".event-card"); if (c) c.scrollIntoView(); }); await p.screenshot({ path: path.join(SHOTS, "p4s7-phone.png") }); }
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  // 8. A bad events record in a save file.
  g = await saved(); g.events = { "2025-11-01": { k: "bonfire" }, "x": { k: "comp" }, "2025-12-21": { k: "bonfire", there: "yes", place: -1, area: "<b>" } }; g.day.trail = "lots";
  await write(g); g = await saved();
  check("a bad events record in a save file is cleaned", JSON.stringify(g.events) === JSON.stringify({ "2025-12-21": { k: "bonfire" } }) && g.day.trail === undefined, JSON.stringify(g.events));

  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
