// Normal mode: a new climber plays, an old save file loads, and a development
// (v2) save file is refused.   node scripts/browser/live.js
const { open, ready, click, settle, sleep, GAME_DIR, FIX } = require("./lib");
const fs = require("fs"), os = require("os"), path = require("path");
const tmp = n => path.join(os.tmpdir(), n);
(async () => {
  const { b, p, errs, url } = await open();
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  console.log("creator:", (await p.evaluate(() => document.querySelector("#creator .intro").innerText)).slice(0, 60) + "…", "| dev button:", await p.evaluate(() => !!document.querySelector("#dev-btn")));
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p);
  await click(p, '[data-go-sector="The Tailgate"]'); await sleep(2200);
  await p.evaluate(() => document.querySelectorAll("[data-go-boulder]")[0].click()); await sleep(1600);
  for (let n = 0; n < 10; n++) { if (!(await click(p, "[data-try]:not([disabled])"))) break; await settle(p); }
  let g = JSON.parse(await p.evaluate(() => localStorage.getItem("granite-hollow-save-v1")));
  console.log("new climber: v", g.v, "no world:", g.world === undefined, "tried", Object.keys(g.ps).length, "sent", g.ticks.length, "| map labels:", await p.evaluate(() => [...document.querySelectorAll("#map g.lab-sector")].filter(x => x.getAttribute("display") !== "none").length), "area labels shown");
  // Load the old save from a file.
  const inp = await p.$("#save-file"); await inp.uploadFile(FIX + "v1-midday.json"); await sleep(600);
  console.log("loading a v1 file:", await p.evaluate(() => (document.querySelector(".modal h2") || {}).textContent));
  await click(p, ".modal [data-yes]"); await sleep(1200);
  g = JSON.parse(await p.evaluate(() => localStorage.getItem("granite-hollow-save-v1")));
  console.log("  loaded:", g.player.name, "day", g.dayNo, "v", g.v);
  // A development (v2) save file is refused outside dev mode.
  const dev = JSON.parse(fs.readFileSync(FIX + "v1-midday.json"));
  global.Mech = require(GAME_DIR + "mechanics.js");
  const World = require(GAME_DIR + "world.js"), D = require(GAME_DIR + "game-data.json");
  fs.writeFileSync(tmp("gh-upload-v2.json"), JSON.stringify(World.migrate(D, dev)));
  await inp.uploadFile(tmp("gh-upload-v2.json")); await sleep(600);
  console.log("loading a v2 file:", await p.evaluate(() => [...document.querySelectorAll(".toast")].map(t => t.innerText.replace(/\s+/g, " ")).join(" / ")));
  console.log("page errors:", errs.length ? errs : "none");
  await b.close();
})();
