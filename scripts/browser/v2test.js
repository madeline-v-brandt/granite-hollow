// Development mode, new rules: the leak test (nothing you haven't found shows
// anywhere: panels, CragLog, map labels, accessible names, hover cards),
// finding a boulder, a first ascent, reloading, a week's rest, and migrating an
// old climber.   node scripts/browser/v2test.js
// The leak check can flag a hidden line whose name is part of a visible one
// ("Kiosk" in "Kiosk Sit"): sit starts and eliminates are named after their line.
const { open, ready, click, settle, sleep, GAME_DIR: GD, FIX } = require("./lib");
const fs = require("fs");
global.Mech = require(GD + "mechanics.js"); global.World = require(GD + "world.js");
const Know = require(GD + "knowledge.js"), D = require(GD + "game-data.json");
const SLOT = "granite-hollow-save-dev";
const text = p => p.evaluate(() => document.querySelector("#tabbody").innerText);
// Everything a player could see or hear: panels, the HUD, visible map labels, accessible names, hover cards.
async function harvest(p) {
  const out = [];
  out.push(await p.evaluate(() => document.querySelector("#hud").innerText));
  for (const tab of ["here", "climber", "logbook", "journal", "craglog"]) { await click(p, `#tabs [data-tab="${tab}"]`); await sleep(120); out.push(await text(p)); }
  for (const v of ["rankings", "leaders", "problems"]) { await click(p, `[data-cl-view="${v}"]`); await sleep(120); out.push(await text(p)); }
  const ids = await p.evaluate(() => [...document.querySelectorAll("[data-cl]")].map(b => +b.dataset.cl));
  for (const i of [...new Set(ids)].slice(0, 12)) { await p.evaluate(i => { const b = document.querySelector(`[data-cl="${i}"]`); if (b) b.click(); }, i); await sleep(80); out.push(await text(p)); await click(p, "[data-cl-back]"); await sleep(60); }
  await click(p, '#tabs [data-tab="here"]');
  out.push(await p.evaluate(() => [...document.querySelectorAll("#map g.lab")].filter(g => g.getAttribute("display") !== "none").map(g => g.textContent).join(" | ")));
  out.push(await p.evaluate(() => [...document.querySelectorAll("#map [aria-label]")].map(g => g.getAttribute("aria-label")).join(" | ")));
  out.push(...await p.evaluate(() => [...document.querySelectorAll("#map g.boulder, #map g.far-rock")].filter(g => !g.closest("[display=none]")).slice(0, 40).map(g => {
    const r = g.getBoundingClientRect(); g.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    const t = document.querySelector("#tip"); return t.hidden ? "" : t.innerText;
  })));
  return out.join("\n");
}
function leaks(g, all) {
  const K = Know.make(D, () => g), hits = [];
  const word = n => new RegExp("(^|[^\\p{L}])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}])", "u");
  D.problems.forEach((p, i) => { if (K.line(i) === "hidden" && p.name.length > 3 && !Object.values(World.NAMED).some(n => n.name === p.name) && word(p.name).test(all)) hits.push("problem: " + p.name); });
  D.boulders.forEach((b, i) => { if (K.boulder(i) < 1 && word(b.name).test(all)) hits.push("boulder: " + b.name); });
  D.sectors.forEach(s => { if (K.area(s.name) < 1 && word(s.name).test(all)) hits.push("area: " + s.name); });
  return hits;
}
(async () => {
  const { b, p, errs, url } = await open("?dev");
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  console.log("creator:", (await p.evaluate(() => document.querySelector("#creator .intro").innerText)).slice(0, 90) + "…");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[0].click(); s()[6].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(500);
  let g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("new game: v", g.v, "rules", g.rules, "dev", g.dev, "| real slot untouched:", await p.evaluate(() => localStorage.getItem("granite-hollow-save-v1") === null));
  console.log("parking lot panel:\n  " + (await text(p)).split("\n").slice(0, 12).join("\n  "));
  let all = await harvest(p);
  console.log("LEAKS at the start:", leaks(g, all));
  // Walk to The Tailgate and look at what's listed.
  await click(p, '[data-go-sector="The Tailgate"]'); await sleep(2500);
  console.log("Tailgate panel:\n  " + (await text(p)).split("\n").slice(0, 10).join("\n  "));
  // Click an unfamiliar boulder on the map.
  const tailgate = D.boulders.map((b, i) => i).filter(i => D.boulders[i].sector === "The Tailgate");
  const target = await p.evaluate(ids => {
    for (const el of document.querySelectorAll("#map g.boulder")) {
      if (el.closest("[display=none]") || el.getAttribute("aria-label") !== "Unfamiliar boulder" || !ids.includes(+el.dataset.id)) continue;
      const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height * .55, hit = document.elementFromPoint(x, y);
      if (hit && hit.closest("g.boulder") === el) return { x, y, id: el.dataset.id };
    }
    return null;
  }, tailgate);
  console.log("unfamiliar boulder on screen:", target && D.boulders[target.id].name);
  await p.mouse.move(target.x, target.y); await sleep(200);
  console.log("its hover card:", await p.evaluate(() => document.querySelector("#tip").innerText.replace(/\s+/g, " ")));
  await p.mouse.click(target.x, target.y); await sleep(2200);
  console.log("arrived:\n  " + (await text(p)).split("\n").slice(0, 6).join("\n  "));
  all = await harvest(p);
  g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("LEAKS standing at it:", leaks(g, all));
  await click(p, "[data-inspect]"); await sleep(400);
  console.log("after Inspect:\n  " + (await text(p)).split("\n").slice(0, 14).join("\n  "));
  // Try an unclimbed line until it goes; if this boulder has none, teleport to the next Tailgate boulder and look there.
  let fa = null;
  const tryOpen = () => p.evaluate(() => { const row = [...document.querySelectorAll(".prob")].find(r => /^Unclimbed/.test(r.querySelector(".pname").textContent) && r.querySelector("[data-try]:not([disabled])")); if (!row) return false; row.querySelector("[data-try]").click(); return true; });
  for (const bi of [null, ...tailgate]) {
    if (bi != null) {
      await click(p, "#dev-btn"); await sleep(150);
      await p.evaluate(b => { document.querySelector("#dv-b").value = b; document.querySelector('[data-dv="teleport"]').click(); }, bi); await sleep(300);
      await click(p, "[data-inspect]"); await sleep(250);
    }
    for (let n = 0; n < 25 && !fa; n++) {
      if (!(await tryOpen())) break;
      await sleep(150); await settle(p);
      fa = await p.evaluate(() => { const r = document.querySelector(".result .rt"); return r && /^First ascent/.test(r.textContent) ? r.textContent : null; });
    }
    if (fa) break;
  }
  console.log("result:", fa, "| banner:", await p.evaluate(() => document.querySelector("#banner").innerText.replace(/\s+/g, " ")));
  g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  const mine = Object.entries(g.world.est).filter(([, e]) => e.by === "you");
  console.log("ledger: your FAs", mine.map(([i, e]) => `${D.problems[i].name} V${e.grade} ${e.date}`), "| invariants:", World.check(D, g), "| valid:", World.validate(D, g));
  await click(p, '#tabs [data-tab="craglog"]'); await sleep(150);
  console.log("CragLog:\n  " + (await text(p)).split("\n").slice(14, 40).join("\n  "));
  const faId = Object.entries(g.world.est).find(([, e]) => e.by === "you")[0];
  await p.evaluate(i => document.querySelector(`[data-cl="${i}"]`).click(), faId); await sleep(150);
  console.log("its page:\n  " + (await text(p)).split("\n").slice(0, 8).join("\n  "));
  // Reload: the FA and the discovery are still there.
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300);
  const g2 = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("after reload: same ledger:", JSON.stringify(g2.world.est) === JSON.stringify(g.world.est), "same knowledge:", JSON.stringify(g2.know) === JSON.stringify(g.know));
  // Dev panel and a week's rest.
  await click(p, "#dev-btn"); await sleep(200);
  console.log("dev panel:\n  " + (await p.evaluate(() => document.querySelector(".dev-info").innerText)).split("\n").join(" "));
  await click(p, '[data-dv="skip7"]'); await sleep(1500); await p.evaluate(() => { const b = document.querySelector(".modal [data-next]"); if (b) b.click(); }); await sleep(800);
  const g3 = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("after 7 days' rest:", g3.date, "simulated through", g3.world.simDate, "established", Object.keys(g3.world.est).length, "climbers", Object.keys(g3.world.npc).length, "| invariants", World.check(D, g3));
  all = await harvest(p);
  console.log("LEAKS a week later:", leaks(g3, all));
  // Migration: an old climber in the dev slot, converted.
  await p.evaluate((k, s) => { localStorage.setItem(k, s); }, SLOT, fs.readFileSync(FIX + "v1-midday.json", "utf8"));
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300);
  await click(p, "#dev-btn"); await sleep(200); await click(p, '[data-dv="migrate"]'); await sleep(500);
  const gm = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  const fx = JSON.parse(fs.readFileSync(FIX + "v1-midday.json", "utf8"));
  console.log("migrated: v", gm.v, "rules", gm.rules, "your FAs", Object.values(gm.world.est).filter(e => e.by === "you").length, "of", new Set(fx.ticks.filter(t => t.style !== "Repeat").map(t => t.p)).size, "first sends | XP kept:", gm.player.xp === fx.player.xp, "| invariants", World.check(D, gm));
  await p.evaluate(() => { const c = document.querySelector(".modal [data-close]"); if (c) c.click(); });
  await click(p, '#tabs [data-tab="logbook"]'); await sleep(150);
  console.log("migrated logbook:\n  " + (await text(p)).split("\n").slice(-8).join("\n  "));
  all = await harvest(p);
  console.log("LEAKS after migrating:", leaks(gm, all));
  console.log("page errors:", errs.length ? errs : "none");
  await b.close();
})();
