// Development mode, new rules: the leak test (nothing you haven't found shows
// anywhere: panels, CragLog, map labels, accessible names, hover cards),
// finding a boulder, a first ascent, reloading, a week's rest, and migrating an
// old climber.   node scripts/browser/v2test.js
// Visible problems' names are taken out before looking for hidden ones, since
// sit starts and eliminates are named after their line ("Kiosk Sit", "Kiosk").
const { open, ready, click, settle, sleep, GAME_DIR: GD, FIX } = require("./lib");
const fs = require("fs");
global.Mech = require(GD + "mechanics.js"); global.World = require(GD + "world.js");
const Know = require(GD + "knowledge.js"), D = require(GD + "game-data.json");
const SLOT = "granite-hollow-save-dev";
const text = p => p.evaluate(() => document.querySelector("#tabbody").innerText);
const modalText = p => p.evaluate(() => { const m = document.querySelector(".modal"); return m ? m.innerText : ""; });
// Everything a player could see or hear: panels, the HUD, visible map labels, accessible names, hover cards.
async function harvest(p) {
  const out = [];
  out.push(await p.evaluate(() => document.querySelector("#hud").innerText));
  for (const tab of ["here", "climber", "logbook", "journal", "craglog"]) { await click(p, `#tabs [data-tab="${tab}"]`); await sleep(120); out.push(await text(p)); }
  await click(p, '#tabs [data-tab="journal"]');
  for (const v of ["tried", "known", "sent"]) { await click(p, `[data-pj-view="${v}"]`); await sleep(100); out.push(await text(p)); }
  await click(p, '#tabs [data-tab="craglog"]'); await sleep(100);
  for (const v of ["rankings", "leaders", "problems"]) { await click(p, `[data-cl-view="${v}"]`); await sleep(120); out.push(await text(p)); }
  const ids = await p.evaluate(() => [...document.querySelectorAll("[data-cl]")].map(b => +b.dataset.cl));
  for (const i of [...new Set(ids)].slice(0, 12)) { await p.evaluate(i => { const b = document.querySelector(`[data-cl="${i}"]`); if (b) b.click(); }, i); await sleep(80); out.push(await text(p)); await click(p, "[data-cl-back]"); await sleep(60); }
  await click(p, '#tabs [data-tab="here"]');
  // The trail map: everything printed on it, and its accessible names.
  await p.keyboard.press("Escape"); await p.evaluate(() => document.body.focus());
  await p.keyboard.press("m"); await sleep(400);
  out.push(await p.evaluate(() => { const b = document.querySelector(".paper-back"); return b && !b.hidden ? b.innerText + " " + [...b.querySelectorAll("svg text")].map(t => t.textContent).join(" | ") + " " + [...b.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).join(" | ") : "(trail map didn't open)"; }));
  await p.keyboard.press("Escape"); await sleep(150);
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
  // Take out the names you can see first, so a sit start ("Kiosk Sit") doesn't look like its hidden parent ("Kiosk").
  const shown = D.problems.map((p, i) => K.visible(i) ? K.name(i) : null).filter(Boolean).sort((a, b) => b.length - a.length);
  // …and the places you know, so a hidden "Millrace" isn't found inside "Millrace Caves".
  shown.push(...D.sectors.filter(x => K.area(x.name) >= 1).map(x => x.name), ...D.boulders.filter((x, i) => K.boulder(i) >= 1).map(x => x.name));
  shown.sort((a, b) => b.length - a.length);
  for (const n of shown) all = all.split(n).join(" ");
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
  const kiosk = await modalText(p);
  console.log("the kiosk greets you:\n  " + kiosk.split("\n").filter(Boolean).slice(0, 9).join("\n  "));
  console.log("LEAKS in the kiosk:", leaks(g, kiosk));
  await click(p, ".modal [data-close]"); await sleep(200);
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
  // The easiest-feeling unclimbed line first (fewest bars), as a player would: a hard one first can use up the day's energy.
  const tryOpen = () => p.evaluate(() => { const rows = [...document.querySelectorAll(".prob")].filter(r => /^Unclimbed/.test(r.querySelector(".pname").textContent) && r.querySelector("[data-try]:not([disabled])"));
    if (!rows.length) return false; const bars = r => r.querySelectorAll(".feel .bars i.on").length; rows.sort((a, b) => bars(a) - bars(b)); rows[0].querySelector("[data-try]").click(); return true; });
  for (const bi of [null, ...tailgate]) {
    if (bi != null) {
      await click(p, "#dev-btn"); await sleep(150);
      await p.evaluate(b => { document.querySelector("#dv-b").value = b; document.querySelector('[data-dv="teleport"]').click(); }, bi); await sleep(300);
      await click(p, "[data-inspect]"); await sleep(250);
      // Wait for the boulder's lines (or "nothing here") rather than a fixed time.
      await p.waitForFunction(() => document.querySelector(".prob") || /Nothing here/.test(document.querySelector("#tabbody").innerText), { timeout: 4000 }).catch(() => {});
    }
    for (let n = 0; n < 25 && !fa; n++) {
      if (!(await tryOpen())) break;
      await sleep(150); await settle(p);
      fa = await p.evaluate(() => { const r = document.querySelector(".result .rt"); return r && /^First ascent/.test(r.textContent) ? r.textContent : null; });
    }
    if (fa) break;
  }
  console.log("result:", fa, "| banner:", await p.evaluate(() => document.querySelector("#banner").innerText.replace(/\s+/g, " ")));
  // The naming dialog opens after the banner.
  await p.waitForSelector(".modal #fa-name", { timeout: 5000 });
  const naming = await modalText(p);
  console.log("naming dialog:\n  " + naming.split("\n").filter(Boolean).slice(0, 7).join("\n  "));
  console.log("  suggested:", await p.evaluate(() => document.querySelector("#fa-name").value), "| focused:", await p.evaluate(() => document.activeElement && document.activeElement.id));
  g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("LEAKS in the naming dialog:", leaks(g, naming));
  await p.evaluate(() => { const i = document.querySelector("#fa-name"); i.value = ""; i.dispatchEvent(new Event("input")); });
  console.log("  empty name:", await p.evaluate(() => [document.querySelector("[data-name]").disabled, document.querySelector("#fa-note").textContent]));
  await p.focus("#fa-name"); await p.keyboard.type("  Pickles' Revenge <b> 🍉 ");
  console.log("  typed:", await p.evaluate(() => document.querySelector("#fa-note").textContent || "(no note)"));
  await p.keyboard.press("Enter"); await sleep(300); await settle(p);
  g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  const mine = Object.entries(g.world.est).filter(([, e]) => e.by === "you");
  console.log("ledger: your FAs", mine.map(([i, e]) => `${D.problems[i].name} V${e.grade} ${e.date}`), "| invariants:", World.check(D, g), "| valid:", World.validate(D, g));
  await click(p, '#tabs [data-tab="craglog"]'); await sleep(150);
  console.log("CragLog:\n  " + (await text(p)).split("\n").filter(l => l.trim() && !/^V\d+$/.test(l.trim())).slice(10, 30).join("\n  "));
  const faId = Object.entries(g.world.est).find(([, e]) => e.by === "you")[0];
  console.log("stored name:", JSON.stringify(g.world.est[faId].name), "| valid:", World.validate(D, g));
  await p.evaluate(i => document.querySelector(`[data-cl="${i}"]`).click(), faId); await sleep(150);
  console.log("its page:\n  " + (await text(p)).split("\n").slice(0, 8).join("\n  "));
  // Rename it from its page, back to the suggestion.
  await click(p, "[data-rename]"); await sleep(200);
  await click(p, ".modal [data-curated]"); await sleep(200);
  g = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  console.log("renamed back to the suggestion:", g.world.est[faId].name === undefined ? D.problems[faId].name : g.world.est[faId].name);
  await click(p, '#tabs [data-tab="logbook"]'); await sleep(150);
  console.log("logbook:\n  " + (await text(p)).split("\n").filter(l => /first ascent|carr/i.test(l)).slice(0, 4).join("\n  "));
  await click(p, '#tabs [data-tab="journal"]'); await sleep(100); await click(p, '[data-pj-view="known"]'); await sleep(100);
  console.log("journal, Open:\n  " + (await text(p)).split("\n").slice(1, 12).join("\n  "));
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
  // Migration: an old climber in the dev slot is converted when it loads.
  // (Written from another page: the game saves itself as it unloads.)
  await p.goto(url.replace(/index\.html.*$/, "game-data.json")); await p.evaluate((k, s) => { localStorage.setItem(k, s); }, SLOT, fs.readFileSync(FIX + "v1-midday.json", "utf8"));
  await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  const gm = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SLOT));
  const welcome = await modalText(p);
  console.log("welcome back:\n  " + welcome.split("\n").filter(Boolean).slice(0, 10).join("\n  "));
  console.log("LEAKS in the welcome:", leaks(gm, welcome), "| old copy kept:", await p.evaluate(() => JSON.parse(localStorage.getItem("granite-hollow-save-before-reopening-dev") || "{}").v));
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
