// Normal mode (Stage 3 on): a new climber starts under the new rules and meets
// the kiosk; an old climber saved in this browser is converted when it loads
// (keeping a copy of the old save) and welcomed back; an old save file converts
// the same way; a development-mode save file is refused.
//   node scripts/browser/live.js
const { open, ready, click, settle, sleep, burnIfScene, TRY, GAME_DIR, FIX } = require("./lib");
const fs = require("fs"), os = require("os"), path = require("path");
const tmp = n => path.join(os.tmpdir(), n);
const SLOT = "granite-hollow-save-v1", COPY = "granite-hollow-save-before-reopening";
global.Mech = require(GAME_DIR + "mechanics.js");
const World = require(GAME_DIR + "world.js"), D = require(GAME_DIR + "game-data.json");
// A level on the old curve (before Phase 3's balance): 100 XP, then ×1.6 a level.
const levelOld = xp => { let l = 0; for (let need = 100; xp >= need && l < 16; l++) { xp -= need; need *= 1.6; } return l; };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);     // the climbing scene plays each burn at once
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const modalH2 = () => p.evaluate(() => (document.querySelector(".modal h2") || {}).textContent || "(no dialog)");
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  console.log("creator:", (await p.evaluate(() => document.querySelector("#creator .intro").innerText)).slice(0, 80) + "…", "| dev button:", await p.evaluate(() => !!document.querySelector("#dev-btn")));
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300);
  console.log("first dialog:", await modalH2());
  await click(p, ".modal [data-close]"); await sleep(200);
  console.log("Tailgate panel:", (await p.evaluate(() => document.querySelector("#tabbody").innerText)).split("\n").filter(Boolean).slice(0, 8).join(" / "));
  await p.evaluate(() => document.querySelectorAll("[data-go-boulder]")[0].click());
  for (let i = 0; i < 20 && !(await p.$(TRY)); i++) await sleep(250);   // the walk over
  for (let n = 0; n < 10; n++) { if (!(await click(p, TRY))) break; await burnIfScene(p); await settle(p); }
  const scene = await p.evaluate(() => { const r = document.querySelector(".scene-root"); return r && !r.hidden ? r.querySelector(".sc-prob h2").textContent + " · " + r.querySelector(".sc-say").textContent.slice(0, 60) : "(not open)"; });
  console.log("climbing scene:", scene);
  await click(p, ".scene-root [data-act='leave']"); await sleep(150);
  let g = await saved();
  console.log("new climber: v", g.v, "rules", g.rules, "dev", !!g.dev, "| tried", Object.keys(g.ps).length, "sent", g.ticks.length, "| invariants", World.check(D, g), "| valid", World.validate(D, g));
  // An old climber already saved in this browser: converted on load, with a copy kept.
  const fixture = fs.readFileSync(FIX + "v1-midday.json", "utf8");
  // (Written from another page: the game saves itself as it unloads.)
  await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, fixture);
  await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  g = await saved();
  const copy = await p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), COPY);
  console.log("old climber on load:", await modalH2(), "| now v", g.v, "rules", g.rules, "| copy kept: v", copy && copy.v, copy && copy.player.name, "| regraded: bal", g.bal, "level", Mech.levelOf(g.player).level, "not lower:", Mech.levelOf(g.player).level >= levelOld(JSON.parse(fixture).player.xp), "| then:", await (async () => { await click(p, ".modal [data-close]"); await sleep(200); return modalH2(); })());
  await click(p, ".modal [data-close]"); await sleep(200);
  await click(p, '#tabs [data-tab="climber"]'); await sleep(150);
  console.log("climber tab offers the old copy:", await p.evaluate(() => !!document.querySelector("#tabbody [data-old]")));
  // Reloading doesn't convert again or change anything.
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300);
  const g2 = await saved();
  console.log("reload: no dialog:", (await modalH2()) === "(no dialog)", "| ledger unchanged:", JSON.stringify(g2.world.est) === JSON.stringify(g.world.est));
  // An old save file loads and converts the same way (same id, same history).
  const inp = await p.$("#save-file"); await inp.uploadFile(FIX + "v1-midday.json"); await sleep(600);
  console.log("loading a v1 file:", await modalH2());
  await click(p, ".modal [data-yes]"); await sleep(1200);
  const g3 = await saved();
  console.log("  loaded:", g3.player.name, "day", g3.dayNo, "v", g3.v, "| then:", await modalH2(), "| same history as converting in place:", JSON.stringify(g3.world.est) === JSON.stringify(g.world.est));
  await click(p, ".modal [data-close]"); await sleep(200);
  // A development-mode save file is refused.
  const dev = World.migrate(D, JSON.parse(fixture)); dev.dev = true;
  fs.writeFileSync(tmp("gh-upload-dev.json"), JSON.stringify(dev));
  await inp.uploadFile(tmp("gh-upload-dev.json")); await sleep(600);
  console.log("loading a dev file:", await p.evaluate(() => [...document.querySelectorAll(".toast")].map(t => t.innerText.replace(/\s+/g, " ")).pop()));
  console.log("page errors:", errs.length ? errs : "none");
  await b.close();
})();
