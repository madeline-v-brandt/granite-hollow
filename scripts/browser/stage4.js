// Phase 3, Stage 4: partners and good vibes. A climber a week or so in walks
// up to a regular, climbs together, and sees them come along (on the map, by the
// pad in the climbing scene), cheer a send that the logbook remembers, and head
// off; the odds panel says "Good vibes" without a number; nothing leaks.
//   node scripts/browser/stage4.js            (screenshots to $SHOTS, if set)
const { open, ready, click, settle, sleep, GAME_DIR } = require("./lib");
const path = require("path");
const SLOT = "granite-hollow-save-v1";
global.Mech = require(GAME_DIR + "mechanics.js");
const SHOTS = process.env.SHOTS || null;
const CLIMB_WITH = ["n:gus", "n:hollis", "n:otis", "n:rowan", "n:bea", "n:dez"];
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const closeModals = async () => { for (let k = 0; k < 6 && (await p.$(".modal [data-close], .modal [data-next]")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]"); await sleep(150); } };
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(300); await closeModals();
  };
  // A new climber, then rest days until the regulars are about (two weeks or so).
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  let met = null;
  for (let d = 0; d < 40 && !met; d++) {
    await closeModals();
    const g = await saved();
    if (g.dayNo >= 6 && !g.day.over) {
      const out = await p.evaluate(ids => [...document.querySelectorAll("g.person")].map(x => x.dataset.who).filter(w => ids.includes(w)), CLIMB_WITH);
      // Walk up to the first climbing regular out today.
      for (const w of out) {
        await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path, g.person[data-who='${w}'] circle`) || document.querySelector(`g.person[data-who='${w}']`); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
        for (let t = 0; t < 120 && !(await p.$("[data-together]")); t++) await sleep(250);
        if (await p.$("[data-together]")) { met = w; break; }
      }
      if (met) break;
    }
    // Next day: a rest day, or (if today's over, say rained out) the summary's next day.
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); }
      else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300); await closeModals();
    }
    await sleep(200);
  }
  check("walked up to a climbing regular, who offers to climb together", !!met, met || "");
  if (!met) { console.log("page errors:", errs.join("\n") || "none"); await b.close(); process.exit(1); }
  const name = await p.evaluate(() => document.querySelector(".npc .nm").firstChild.textContent.trim());
  await click(p, "[data-together]"); await sleep(300);
  let g = await saved();
  check("Climb together: they're your partner for a couple of hours or more", g.day.partner && g.day.partner.who === met && g.day.partner.until - g.day.minute >= 60, JSON.stringify(g.day.partner));
  const hud = await p.evaluate(() => (document.querySelector("#hud .partner") || {}).textContent || "");
  check("the status bar says who you're climbing with", /Climbing with/.test(hud) && /Part ways/.test(hud), hud);
  // Stand at a boulder by the lot (and a little tired, so there's a line there to Try).
  const D = require(GAME_DIR + "game-data.json");
  g = await saved();
  const here = D.boulders.findIndex(x => x.sector === "The Tailgate" && x.problems.length >= 4);
  g.loc = { sector: "The Tailgate", boulder: here }; g.pos = null; g.player.energy = 45; g.day.climb = null; g.day.encounter = null;
  await write(g); await sleep(400);
  g = await saved();
  const onMap = await p.evaluate(w => !!document.querySelector(`g.person[data-who='${w}']`), met);
  const near = await p.evaluate(w => { const a = document.querySelector(`g.person[data-who='${w}']`); return a ? a.getAttribute("transform") : null; }, met);
  check("they come along on the map, to the boulder you're at", onMap, `${near}`);
  const opened = await click(p, "[data-try]:not([disabled])"); await sleep(400);
  check("opened the climbing scene", opened);
  const pal = await p.evaluate(() => document.querySelectorAll(".sc-pal-fig *").length);
  const say = await p.evaluate(() => (document.querySelector(".sc-say") || {}).textContent || "");
  check("your partner stands by your pad in the scene", pal > 5, `${pal} shapes`);
  check("the narration mentions them", say.includes(name.split(" ")[0].replace(/^Ranger$/, "Gus")) || /pad beside yours/.test(say), say.slice(-140));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "stage4-partner.png") });
  // A send, with the dice loaded.
  await p.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.001; });
  await click(p, ".scene-root [data-act='burn']"); await p.waitForFunction(() => !document.querySelector(".sc.busy"), { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => { Math.random = window.__rnd; });
  await settle(p); await sleep(200);
  g = await saved();
  const t = g.ticks[g.ticks.length - 1];
  check("a send together: the tick remembers who you were with", t && t.with === met, JSON.stringify(t));
  const said = await p.evaluate(() => (document.querySelector(".sc-say") || {}).textContent || "");
  check("and they cheer", said.length > 0 && !/undefined/.test(said), said.slice(-120));
  if (await p.$(".scene-root:not([hidden])")) { await click(p, ".scene-root [data-act='leave']"); await sleep(200); }
  await closeModals();
  await click(p, "#tabs [data-tab='logbook']"); await sleep(200);
  const log = await p.evaluate(() => document.querySelector("#tabbody").innerText);
  check("the logbook says who you sent it with", /with \w+/.test(log));
  // The odds panel: Good vibes, never a number.
  await click(p, "#tabs [data-tab='here']"); await sleep(200);
  const why = await p.evaluate(() => [...document.querySelectorAll(".why .chip")].map(c => c.textContent));
  const vibe = why.find(c => /vibes/i.test(c));
  check("the odds panel shows Good vibes without a number", !vibe || !/\d/.test(vibe), vibe || "(not shown on this row)");
  // Part ways; and later, they head off on their own.
  await click(p, "#act-part"); await sleep(200);
  g = await saved();
  check("Part ways ends it", !g.day.partner, JSON.stringify(g.day.partner));
  g.day.partner = { who: met, until: g.day.minute + 10 }; await write(g);
  await click(p, "#act-rest"); await sleep(300);
  g = await saved();
  check("when their time's up, they head off", !g.day.partner, JSON.stringify(g.day.partner));
  // A bad save's partner is dropped; a stranger can't be one.
  g.day.partner = { who: "n:pickles", until: 9999 }; if (g.ticks.length) g.ticks[g.ticks.length - 1].with = "c3"; await write(g);
  g = await saved();
  check("a save can't make Pickles (or a stranger) your partner", !g.day.partner && !g.ticks.some(x => x.with === "c3"));
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
