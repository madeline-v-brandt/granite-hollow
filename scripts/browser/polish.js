// Polish after Phase 3 (2026-11-26): a 4 ft climber; your car parked out of your
// way; My logbook under CragLog (no Logbook tab); Rankings by first ascents or by
// the 10 hardest ascents; and rain that stops the climbing but not the day.
//   node scripts/browser/polish.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep } = require("./lib");
const path = require("path");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const closeModals = async () => { for (let k = 0; k < 6 && (await p.$(".modal [data-close]")); k++) { await click(p, ".modal [data-close]"); await sleep(150); } };
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(300); await closeModals();
  };
  const panel = () => p.evaluate(() => document.querySelector("#tabbody").innerText);

  // A 4 ft climber.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  const min = await p.evaluate(() => document.querySelector("#cc-height").min);
  await p.evaluate(() => { const h = document.querySelector("#cc-height"); h.value = h.min; h.dispatchEvent(new Event("input")); });
  const shown = await p.evaluate(() => document.querySelector('label[for="cc-height"] output').textContent);
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  let g = await saved();
  check("the creator goes down to 4 ft (122 cm)", min === "122" && g.player.height === 122 && /4′0″/.test(shown), `${shown}`);
  // Your car, two spaces along; the space in front of where you start is clear.
  const cars = await p.evaluate(() => [...document.querySelectorAll("g.car")].map(c => c.getAttribute("transform")));
  check("your car is parked two spaces along, out of your way", cars.some(t => /translate\(-32,0\.6\)/.test(t)) && !cars.some(t => /translate\(-20,/.test(t)), cars.join(" "));
  // CragLog: My logbook, and the two rankings.
  const tabs = await p.evaluate(() => [...document.querySelectorAll("#tabs [data-tab]")].map(t => t.dataset.tab));
  check("no Logbook tab", !tabs.includes("logbook"), tabs.join(","));
  await click(p, '#tabs [data-tab="craglog"]'); await sleep(150);
  await click(p, '[data-cl-view="mylog"]'); await sleep(150);
  check("CragLog has My logbook", /My logbook/.test(await panel()));
  await click(p, '[data-cl-view="rankings"]'); await sleep(150);
  check("Rankings start by first ascents", /First ascents since the park reopened/.test(await panel()));
  await p.evaluate(() => { const s = document.querySelector("#rk-by"); s.value = "hard"; s.dispatchEvent(new Event("change")); }); await sleep(150);
  const hard = await panel();
  check("and can rank by the 10 hardest ascents, with you in the table", /10 hardest ascents since the park reopened/.test(hard) && /you/.test(hard), hard.split("\n").slice(0, 6).join(" / "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "polish-rankings.png") });

  // A rained-out day: the park's open, the climbing isn't.
  g = await saved();
  g.day.weather = { ...g.day.weather, cond: -0.9, label: "Wet", sky: g.day.weather.precip || "Rain", rainAt: 0, rainFrom: 0 }; g.day.rainedOut = true; g.day.over = false; g.day.climb = null;
  await write(g);
  g = await saved();
  const hud = await p.evaluate(() => document.querySelector("#hud").innerText);
  check("rained out: the day goes on, and the status bar says no climbing", !g.day.over && /no climbing/i.test(hud), hud.split("\n").filter(l => /Rain|Snow/.test(l)).join(" / "));
  await p.evaluate(() => { const x = document.querySelector("[data-go-boulder]"); if (x) x.click(); });
  for (let t = 0; t < 30 && !(await p.$("[data-try], [data-climb]")); t++) await sleep(250);
  await sleep(300);
  const climbIt = await p.evaluate(() => [...document.querySelectorAll("[data-climb]")].map(x => x.disabled));
  check("Climb it is greyed out in the rain", climbIt.length === 0 || climbIt.every(Boolean), JSON.stringify(climbIt));
  const tried = await click(p, "[data-try]:not([disabled])"); await sleep(300);
  if (tried) {
    const menu = await p.evaluate(() => [...document.querySelectorAll(".scene-root [data-act]")].map(x => ({ k: x.dataset.act, off: x.disabled, s: x.innerText.replace(/\n/g, " ") })));
    const burn = menu.find(m => m.k === "burn");
    check("in the climbing scene, Send burn is too wet", burn && burn.off && /Too wet/.test(burn.s), burn && burn.s);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "polish-rain-scene.png") });
    await click(p, ".scene-root [data-act='leave']"); await sleep(200);
  } else console.log("  (no line to Try at this boulder)");
  g = await saved();
  check("no attempts were made, and the day's still on", g.day.attempts === 0 && !g.day.over);
  // Rest and Head home: a rained-out day counts as rest.
  await click(p, "#act-home"); await sleep(300);
  const sum = await p.evaluate(() => (document.querySelector(".modal h2") || {}).textContent || "");
  check("heading home: the summary says rained out", /Rained out/.test(sum), sum);
  await click(p, ".modal [data-next]"); await sleep(400); await closeModals();

  // Rain that starts partway through a day: the climbing stops, the day doesn't.
  g = await saved();
  g.day.weather = { ...g.day.weather, cond: 0.1, label: "Good", sky: "Overcast", rainAt: g.day.minute + 10, rainFrom: g.day.minute + 10, pop: 0.5, rainWhen: "afternoon", dusk: Math.max(g.day.weather.dusk, g.day.minute + 300) };
  g.day.rainedOut = false; g.day.over = false; g.day.rainStarted = false;
  await write(g);
  await click(p, "#act-rest"); await sleep(300);
  g = await saved();
  const said = await p.evaluate(() => document.querySelector("#tabbody").innerText);
  check("when it starts raining, the day goes on without climbing", !g.day.over && g.day.rainStarted && /that's it for climbing today/.test(said), said.split("\n").slice(0, 3).join(" / "));
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
