// Phase 3, Stage 3: preparation, conditions through the day, and learning them.
// A new climber learns nothing on day one; on day two Gus teaches brushing under a
// friction line; a V4 with thin skin is taught working moves, tape and reading the
// conditions; a flapper forces tape for the day (and teaches it); a climber from
// before Stage 3 knows what their level would.
//   node scripts/browser/stage3.js            (screenshots to $SHOTS, if set)
const { open, ready, click, settle, sleep, GAME_DIR, FIX } = require("./lib");
const fs = require("fs"), path = require("path");
const SLOT = "granite-hollow-save-v1";
global.Mech = require(GAME_DIR + "mechanics.js");
const World = require(GAME_DIR + "world.js"), D = require(GAME_DIR + "game-data.json");
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const write = async g => {          // from another page: the game saves itself as it unloads
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(300);
    while (await p.$(".modal [data-close]")) { await click(p, ".modal [data-close]"); await sleep(150); }
  };
  const scene = () => p.evaluate(() => {
    const r = document.querySelector(".scene-root");
    if (!r || r.hidden) return null;
    return { say: r.querySelector(".sc-say").textContent, note: (r.querySelector(".sc-note") || {}).textContent || "", me: r.querySelector(".sc-me").innerText,
      menu: [...r.querySelectorAll("[data-act]")].map(x => ({ k: x.dataset.act, l: x.querySelector(".l").textContent, s: (x.querySelector(".s") || {}).textContent || "", cls: x.className, off: x.disabled })) };
  });
  const pct = m => { const x = /(\d+(?:\.\d+)?)%/.exec(m || ""); return x ? +x[1] : 0; };
  const act = async k => { await click(p, `.scene-root [data-act='${k}']`); await p.waitForFunction(() => !document.querySelector(".sc.busy"), { timeout: 20000 }).catch(() => {}); await sleep(120); };

  // ---- a new climber: Gus and the brush
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300);
  await click(p, ".modal [data-close]"); await sleep(200);
  let g = await saved();
  check("a new climber has learned nothing yet", g.learned && Object.keys(g.learned).length === 0, JSON.stringify(g.learned));
  // Open the scene on a line the test picks (by its index), at whichever boulder has one.
  const tryWhere = async pred => {
    const here0 = (await p.evaluate(() => [...document.querySelectorAll("[data-try]:not([disabled])")].map(x => +x.dataset.try))).find(pred);
    if (here0 != null) { await click(p, `[data-try='${here0}']`); await sleep(300); return here0; }
    if (await p.$("[data-back]")) { await click(p, "[data-back]"); await sleep(200); }       // back to the area's boulders
    const nb = await p.evaluate(() => document.querySelectorAll("[data-go-boulder]").length);
    for (let k = -1; k < nb; k++) {
      if (k >= 0) {
        if (await p.$("[data-back]")) { await click(p, "[data-back]"); await sleep(150); }
        await p.evaluate(k => document.querySelectorAll("[data-go-boulder]")[k].click(), k);
        for (let t = 0; t < 20 && !(await p.$("[data-try]:not([disabled]), [data-climb]:not([disabled])")); t++) await sleep(250);
      }
      const ids = await p.evaluate(() => [...document.querySelectorAll("[data-try]:not([disabled])")].map(x => +x.dataset.try));
      const hit = ids.find(pred);
      if (hit != null) { await click(p, `[data-try='${hit}']`); await sleep(300); return hit; }
    }
    return null;
  };
  const fric = i => Mech.frictionSensitivity(D.problems[i]) >= 0.6;
  let i = await tryWhere(() => true);
  check("found a line to Try", i != null);
  let s = await scene();
  check("day one: nothing to learn yet, and no Brush (the Tailgate's lines are clean)", s && !/Gus/.test(s.say) && s.menu.map(m => m.k).join() === "burn,rest,leave" && /wide/.test(s.menu[0].cls) && !/Gritty/.test(s.note),
    s && s.menu.map(m => m.k).join());
  await act("leave");
  // Day two, under a friction line: Gus and the brush.
  g = await saved(); g.dayNo = 2; g.day.no = 2; g.day.climb = null; await write(g);
  i = await tryWhere(fric);
  s = await scene();
  const keys = s ? s.menu.map(m => m.k) : [];
  check("day two, under a friction line: Gus teaches brushing", s && /Gus/.test(s.say) && /brush/i.test(s.say), s && s.say.slice(-160));
  check("the menu: Send burn (wide), Rest, Leave, Brush (new); no Work a move", s && keys.join() === "burn,rest,leave,brush" && /wide/.test(s.menu[0].cls) && /fresh/.test(s.menu[3].cls), keys.join());
  g = await saved();
  const dirty = !g.world.est[i] && D.problems[i].sector !== "The Tailgate";
  check(dirty ? "an unclimbed line: the card says it's dirty, and the button says Brush it clean" : "a friction line: Brush the holds",
    dirty ? /Gritty/.test(s.note) && s.menu[3].l === "Brush it clean" : s.menu[3].l === "Brush the holds", `${s.menu[3].l} · ${s.note}`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "stage3-gus.png") });
  const before = pct(s && s.menu[0].l), brushSays = pct((s.menu.find(m => m.k === "brush") || {}).s.split("→")[1]);
  await act("brush");
  s = await scene(); g = await saved();
  check("brushing raises the chance as the menu said" + (dirty ? ", and cleans the line for good" : ", for the day"),
    (dirty ? g.ps[i] && g.ps[i].clean === true : g.day.brushed[i] === true) && pct(s.menu[0].l) > before && Math.abs(pct(s.menu[0].l) - brushSays) < 0.6, `${before}% → ${pct(s.menu[0].l)}% (menu said ${brushSays}%)`);
  check("the card says brushed, and Brush is gone", /Brushed today/.test(s.note) && !s.menu.some(m => m.k === "brush"), s.note);
  for (let n = 0; n < 4; n++) { g = await saved(); if (!g.day.climb || g.day.over || (g.ps[i] && g.ps[i].sent)) break; await act("burn"); await settle(p); }
  g = await saved();
  check("a few falls in one day don't teach working moves yet", !g.learned.work, JSON.stringify(g.learned));
  if (await p.$(".scene-root:not([hidden])")) await act("leave");

  // ---- a V4 with thin skin in the afternoon: working moves, tape, then reading the conditions
  g = await saved();
  // Proof is recounted from the ticks: three first sends of V3 or harder (recorded in the ledger too).
  const prove = D.problems.map((q, k) => k).filter(k => D.problems[k].grade >= 3 && !g.world.est[k] && !(g.ps[k] && g.ps[k].att)).slice(0, 3);
  for (const k of prove) { World.recordSend(D, g, k, g.date, false); g.ps[k] = { att: 1, beta: 0, sent: true, flash: false, best: 1, sends: 1, sentOn: g.date }; g.ticks.push({ p: k, date: g.date, day: g.dayNo, style: "Send", att: 1, stars: null }); }
  g.player.xp = 70 + 140 + 220 + 600 + 50; g.player.skin = 38; g.player.energy = 15; g.day.minute = 14 * 60;      // tired, so some lines here are still a Try
  g.learned = { brush: g.date };
  g.day.climb = null; g.day.over = false;
  await write(g);
  // A line here you've fallen off once is a Try, not a Climb it, however strong you are.
  let v4 = await tryWhere(() => true);
  if (v4 == null) {
    const ids = await p.evaluate(() => [...document.querySelectorAll("[data-climb]")].map(x => +x.dataset.climb));
    g = await saved();
    const k = ids.find(x => !(g.ps[x] && g.ps[x].sent));
    if (k != null) { g.ps[k] = { att: 1, beta: 0, sent: false, best: 0.2, sends: 0 }; g.day.climb = null; await write(g); v4 = await tryWhere(x => x === k); }
  }
  check("opened the scene as a V4", v4 != null);
  const learnedSay = [];
  for (let n = 0; n < 4; n++) {
    s = await scene(); if (!s) break;
    learnedSay.push(s.say);
    g = await saved();
    if (["work", "tape", "read"].every(k => g.learned[k])) break;
    await act(s.menu.some(m => m.k === "rest" && !m.off) ? "rest" : "burn"); await settle(p);
  }
  g = await saved(); s = await scene();
  check("a V4 with thin skin is taught working moves, tape and reading the conditions", ["work", "tape", "read"].every(k => g.learned[k]), JSON.stringify(g.learned));
  check("the Bishop's lesson names no area", learnedSay.some(t => /Bishop/.test(t)) && !learnedSay.some(t => /Bishop[^]*Hemlock Hollow/.test(t)));
  check("once you can read them, the card shows shade and friction", s && /(shade|sun) · friction \w+ now/.test(s.note), s && s.note);
  const tapeItem = s && s.menu.find(m => m.k === "tape");
  check("Tape up is offered with thin skin, in the slimmer row", !!tapeItem && /prep/.test(tapeItem.cls), tapeItem && tapeItem.s);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "stage3-prep.png") });
  const skin0 = (await saved()).player.skin;
  await act("tape");
  g = await saved(); s = await scene();
  check("taping up: the day is taped, your card says so, and Take the tape off replaces it", g.day.tape === true && /Taped up/.test(s.me) && s.menu.some(m => m.k === "untape"));
  const hud = await p.evaluate(() => (document.querySelector("#hud .reading") || {}).textContent || "");
  check("the status bar reads the day", /Best|steady|shade|sunny/.test(hud), hud);
  await act("leave");
  // ---- a flapper: taped on the spot (and taught, if need be), for the rest of the day
  g = await saved();
  g.learned = { brush: g.date, work: g.date }; g.day.tape = false; g.day.flapper = false; g.flapper = false; g.player.skin = 25; g.player.energy = 30; g.day.climb = null;
  await write(g);
  const fl = await tryWhere(fric);
  check("opened a friction line with thin skin", fl != null);
  await p.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.01; });      // the dice: a flapper
  await act("burn");
  await p.evaluate(() => { Math.random = window.__rnd; });
  await settle(p);
  g = await saved(); s = await scene();
  check("a flapper tapes you up for the day, and teaches tape", g.flapper && g.day.tape && g.day.flapper && !!g.learned.tape && /flapper/.test(s ? s.say : "") && /Taped up \(a flapper\)/.test(s ? s.me : ""), s && s.say.slice(-200));
  if (s) await act("leave");
  const other = await tryWhere(k => k !== fl && fric(k));
  s = await scene();
  const un = s && s.menu.find(m => m.k === "untape");
  check("the tape can't come off while there's a flapper", other == null || (un && un.off), un && `${un.l} · ${un.s}`);
  if (s) await act("leave");

  // ---- a climber from before Stage 3 knows what their level would
  const fixture = JSON.parse(fs.readFileSync(FIX + "v1-midday.json", "utf8"));
  await write(fixture);
  g = await saved();
  const L = Mech.levelOf(g.player).level;
  check("an older save learns by level", g.learned && (L >= 1 ? !!g.learned.brush : true) && (L < 4 ? !g.learned.tape : true), `level ${L}: ${JSON.stringify(g.learned)}`);
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
