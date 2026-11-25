// Stage 5: the regulars, the Bishop, Pickles, directions that unlock Go there,
// lines pointed out, Local Buzz and the first-ascent Rankings. Builds a
// mid-October climber (the community simulated in Node), then walks between
// areas until it has met the cast, and uses each kind of offer it's given.
// Checks nothing hidden leaks through the new text.
//   node scripts/browser/stage5.js          (SHOTS=dir also saves screenshots)
const { open, ready, click, sleep, GAME_DIR: GD } = require("./lib");
global.Mech = require(GD + "mechanics.js"); global.World = require(GD + "world.js");
const Know = require(GD + "knowledge.js"), D = require(GD + "game-data.json");
const SLOT = "granite-hollow-save-v1";
function leaks(g, all) {
  const K = Know.make(D, () => g), hits = [];
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
  const { b, p, errs, url } = await open();
  const g = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const put = async s => { await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, v) => localStorage.setItem(k, v), SLOT, JSON.stringify(s)); await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(500); };
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[0].click(); s()[6].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(400); await click(p, ".modal [data-close]"); await sleep(200);

  // Six weeks on: a V7 climber who has been to the kiosk areas; the community simulated day by day.
  let s = await g();
  const K = Know.make(D, () => s);
  for (let n = 0; n < 40; n++) { s.date = World.addDays(s.date, 1); if (n % 3 !== 2) s.dayNo++; World.step(D, s, s.date); }
  s.player.xp = 2500; s.day.date = s.date; s.day.no = s.dayNo; s.day.bishop = true; s.day.minute = 600; s.day.met = []; s.day.encounter = null;
  for (const name of ["The Schoolhouse", "Hawkwatch"]) K.inspect(D.boulders.findIndex(bo => bo.sector === name), s.date);
  await put(s);
  console.log("set up:", s.date, "day", s.dayNo, "| regulars arrived:", World.CLIMBING_REGULARS.filter(w => s.world.npc[w]).map(w => World.whoName(D, w)).join(", "));

  // Walk between areas, meeting people. Math.random is kept low so encounters happen.
  const seen = {}, used = {}, texts = [];
  const order = ["Hawkwatch", "The Schoolhouse", "The Tailgate", "Hawkwatch", "The Schoolhouse", "The Tailgate", "Hawkwatch", "The Schoolhouse", "The Tailgate", "Hawkwatch", "The Schoolhouse", "The Tailgate"];
  for (let i = 0; i < order.length; i++) {
    const area = order[i];
    s = await g(); if (s.day.over) break;
    // A new day for each visit (same weather), with the Bishop out every other day.
    s.date = World.addDays(s.date, 1); s.dayNo++; World.step(D, s, s.date); s.day.date = s.date; s.day.no = s.dayNo;
    s.day.minute = 600; s.day.met = []; s.day.bishop = i % 2 === 0; s.day.encounter = null; await put(s);
    await p.evaluate(() => { window.__r = Math.random; Math.random = () => window.__r() * 0.45; });   // people are about more than usual
    const go = await p.evaluate(a => { const b = document.querySelector(`[data-go-sector="${a}"]`); if (b) { b.click(); return true; } return false; }, area);
    if (!go) { await p.keyboard.press("m"); await sleep(300); await p.evaluate(a => { const b = document.querySelector(`[data-pp-go="${a}"]`); if (b) b.click(); }, area); }
    for (let t = 0; t < 30 && await p.evaluate(() => !!document.querySelector("#act-rest[disabled]")); t++) await sleep(200);
    await sleep(300);
    await p.evaluate(() => { Math.random = window.__r; });
    const card = await p.evaluate(() => { const n = document.querySelector(".npc"); return n ? { name: n.querySelector(".nm").childNodes[0].textContent, text: n.innerText.replace(/\s+/g, " "), regular: n.classList.contains("regular"),
      acts: [...n.querySelectorAll("button")].map(b => b.textContent) } : null; });
    if (!card) { console.log(`  ${area}: nobody about`); continue; }
    seen[card.name] = (seen[card.name] || 0) + 1; texts.push(card.text);
    const shot = async tag => { if (process.env.SHOTS) { const el = await p.$(".npc"); if (el) await el.screenshot({ path: `${process.env.SHOTS}/npc-${card.name.replace(/\W+/g, "-").toLowerCase()}-${tag}.png` }); } };
    await shot(seen[card.name]);
    console.log(`  ${area}: ${card.name}${card.regular ? " (regular)" : ""}: ${card.text.slice(0, 170)}${card.text.length > 170 ? "…" : ""}`);
    for (const [sel, label] of [["[data-dir]", "ask the way"], ["[data-reveal]", "where exactly"], ["[data-pet]", "pet"], ["[data-accept]", "add tip"]]) {
      if (await p.$(".npc " + sel)) {
        await click(p, ".npc " + sel); await sleep(250); used[label] = (used[label] || 0) + 1;
        const after = await p.evaluate(() => { const n = document.querySelector(".npc"); return n ? n.innerText.replace(/\s+/g, " ") : ""; });
        const toast = await p.evaluate(() => [...document.querySelectorAll(".toast")].map(t => t.innerText.replace(/\s+/g, " ")).pop() || "");
        console.log(`     ${label} → ${toast ? "toast: " + toast.slice(0, 110) + " | " : ""}${after.slice(-110)}`);
        texts.push(after, toast);
      }
    }
  }
  s = await g();
  console.log("met:", JSON.stringify(seen), "| used:", JSON.stringify(used));
  console.log("saved who you've met:", JSON.stringify(Object.fromEntries(Object.entries(s.know.met || {}).map(([w, m]) => [w, m.n + (m.pets ? ` (${m.pets} pets)` : "")]))), "| told the way:", JSON.stringify(s.know.told || {}));
  // The trail map lists the areas you were told about, with a Walk button.
  await p.evaluate(() => document.body.focus()); await p.keyboard.press("m"); await sleep(400);
  for (const area of Object.keys(s.know.told || {})) console.log(`  trail map, ${area}:`, await p.evaluate(a => { const r = [...document.querySelectorAll("[data-pp-area]")].find(x => x.dataset.ppArea === a); return r ? r.closest("li").innerText.replace(/\s+/g, " ") : "(not listed)"; }, area));
  await p.keyboard.press("Escape"); await sleep(150);

  // CragLog: Local Buzz and the Rankings.
  await click(p, '#tabs [data-tab="craglog"]'); await sleep(150); await click(p, '[data-cl-view="problems"]'); await sleep(150);
  const buzz = await p.evaluate(() => { const b = document.querySelector(".buzz"); return b ? b.innerText : "(no buzz)"; });
  if (process.env.SHOTS) { const el = await p.$(".buzz"); if (el) await el.screenshot({ path: process.env.SHOTS + "/craglog-local-buzz.png" }); }
  console.log("Local Buzz:\n  " + buzz.split("\n").filter(Boolean).join("\n  "));
  await click(p, '[data-cl-view="rankings"]'); await sleep(150);
  const rk = await p.evaluate(() => document.querySelector("#tabbody").innerText);
  if (process.env.SHOTS) { const el = await p.$("#tabbody"); if (el) await el.screenshot({ path: process.env.SHOTS + "/craglog-rankings.png" }); }
  console.log("Rankings:\n  " + rk.split("\n").filter(Boolean).slice(3, 12).join("\n  "));
  texts.push(buzz, rk, await p.evaluate(() => document.querySelector("#tabbody").innerText));
  await click(p, '#tabs [data-tab="journal"]'); await sleep(150); texts.push(await p.evaluate(() => document.querySelector("#tabbody").innerText));
  s = await g();
  console.log("LEAKS in Stage 5 text:", leaks(s, texts.join("\n")));
  console.log("valid:", World.validate(D, s), "| invariants:", World.check(D, s));
  console.log("page errors:", errs.length ? errs : "none");
  await b.close();
})();
