// Stage 6 play-test walking fixes: a save stuck inside The Blackboard (The
// Schoolhouse's centre) is freed on load; Walk to The Schoolhouse lands on open
// ground; the arrows walk after clicking CragLog (a tab, then a sort menu that
// keeps focus).
//   node scripts/browser/walk_fixes.js
const { open, ready, sleep, GAME_DIR } = require("./lib");
global.Art = require(GAME_DIR + "art.js");
const D = require(GAME_DIR + "game-data.json"), S = require(GAME_DIR + "illustrate.js").parkScene(D);
const SLOT = "granite-hollow-save-v1";
const inside = p => S.boulders.filter(bo => Math.hypot(p[0] - bo.b.x, p[1] - bo.b.y) < bo.form.R * .9 + .5).map(bo => bo.b.name);
(async () => {
  const { b, p, errs, url } = await open();
  const g = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const put = async s => { await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, v) => localStorage.setItem(k, v), SLOT, JSON.stringify(s)); await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(700); };
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[0].click(); s()[6].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(500); await p.evaluate(() => document.querySelector(".modal [data-close]")?.click()); await sleep(200);
  // 1. Stuck in The Blackboard (The Schoolhouse's centre).
  let s = await g(); const sc = D.sectors.find(x => x.name === "The Schoolhouse");
  s.pos = [sc.x, sc.y]; s.loc = { sector: "The Schoolhouse", boulder: null }; s.know.areas["The Schoolhouse"] = 2; await put(s);
  s = await g(); console.log("1. loaded inside", inside([sc.x, sc.y]), "→ now at", s.pos.map(v => v.toFixed(1)), "inside:", inside(s.pos));
  // 2. Walk to The Schoolhouse from the lot (the Here list's Walk).
  s.pos = [-24, -4.6]; s.loc = { sector: "The Tailgate", boulder: null }; s.day.minute = 600; await put(s);
  await p.evaluate(() => { const b = document.querySelector('[data-go-sector="The Schoolhouse"]'); if (b) b.click(); });
  for (let t = 0; t < 60 && await p.evaluate(() => !!document.querySelector("#act-rest[disabled]")); t++) await sleep(200);
  await sleep(500); s = await g(); console.log("2. arrived at", s.pos.map(v => v.toFixed(1)), s.loc.sector, "inside:", inside(s.pos));
  // 3. Click CragLog's tab and change its sort menu, then hold the right arrow.
  await p.evaluate(() => document.querySelector('#tabs [data-tab="craglog"]').click()); await sleep(200);
  await p.evaluate(() => { const sel = document.querySelector("#cl-sort"); sel.focus(); sel.value = "grade"; sel.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(200);
  await p.evaluate(() => { const sel = document.querySelector("#cl-sort"); if (sel) sel.focus(); });
  const before = (await g()).pos, focus = await p.evaluate(() => document.activeElement.tagName + "#" + document.activeElement.id);
  await p.keyboard.down("ArrowRight"); await sleep(700); await p.keyboard.up("ArrowRight"); await sleep(500);
  const after = (await g()).pos;
  console.log("3. focus on", focus, "| arrow moved", Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1), "m | sort still", await p.evaluate(() => document.querySelector("#cl-sort")?.value));
  console.log("errors:", errs.length ? errs : "none");
  await b.close();
})();
