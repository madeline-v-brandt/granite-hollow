// The Great Granite Hollow Clean-Up (after Phase 4), in the game.
//   1. Earth Day: the day's opening, the Here tab's card, the bag counter, litter on the map.
//   2. Clicking litter walks you over and bags it; hovering names it; a reload keeps your bag.
//   3. The regulars collect too: the litter thins out as the day goes on, and they lead the board.
//   4. Head home: the weigh-in, recorded (place, top three); the Climber page's ribbons.
//   5. Afterwards: the kiosk's results note and Local Buzz.
//   6. The frame rate walking with the litter out; a phone at 390 px.
//   node scripts/browser/cleanup.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep } = require("./lib");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  };
  const closeAll = async () => { for (let k = 0; k < 8 && (await p.$(".modal [data-close], .modal [data-next]:not(.plan)")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]:not(.plan)"); await sleep(200); } };
  const modalText = () => p.evaluate(() => { const m = document.querySelector(".modal"); return m ? m.innerText : null; });
  const tab = async t => { await p.evaluate(t => { const b = [...document.querySelectorAll("#tabs button, .tabs button, [role=tab]")].find(x => x.textContent.trim().toLowerCase() === t); if (b) b.click(); }, t); await sleep(300); };
  const startOn = async (g, d) => {
    g.date = addDays(d, -1); g.day.over = true; g.day.reason = "Test."; g.day.encounter = null; g.day.partner = null; g.forecast = [];
    await write(g); await closeAll();
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
    await click(p, ".modal [data-next='0']"); await sleep(1000); await closeAll();
    return saved();
  };
  const litterCount = () => p.$$eval("#map g.trash-item", x => x.length);
  // The nearest piece of litter to you, clicked.
  const clickNearest = () => p.evaluate(k => {
    const g = JSON.parse(localStorage.getItem(k)), [x0, y0] = g.pos;
    let best = null, bd = Infinity;
    for (const el of document.querySelectorAll("#map g.trash-item")) { const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute("transform")); const d = Math.hypot(+m[1] - x0, -m[2] - y0); if (d < bd) { bd = d; best = el; } }
    if (!best) return null;
    best.querySelector(".trash-hit").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return Math.round(bd);
  }, SLOT);
  const walkDone = async () => { for (let t = 0; t < 120; t++) { const busy = await p.evaluate(() => document.querySelector("#map-me") && document.body.innerText && !!document.querySelector(".map-wrap") && window.__busy); await sleep(150); if (t > 6 && !busy) break; } };

  // A climber the regulars know, on Earth Day 2026.
  await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(400); await closeAll();
  let g = await saved();
  g.dayNo = 40; g.player.name = "Sam";
  g.know.met = g.know.met || {};
  for (const w of ["n:bea", "n:gus", "n:mags", "n:otis"]) g.know.met[w] = { n: 10, first: "2025-10-01", last: "2026-04-01", chats: 6 };
  const base = JSON.parse(JSON.stringify(g));
  g = await startOn(g, "2026-04-22");

  // 1.
  check("1. Earth Day is the Great Granite Hollow Clean-Up", /Clean-Up/.test(g.day.last.text) && /Golden Grabber/.test(g.day.last.text), g.day.last.text.slice(0, 120));
  await tab("here");
  const card = await p.evaluate(() => { const c = document.querySelector(".event-card.cleanup"); return c ? c.innerText : ""; });
  check("…the Here tab has your bag and the leaders", /Your bag: 0 pieces/i.test(card) && /Leaders so far/i.test(card), card.replace(/\n/g, " / ").slice(0, 200));
  const bag = await p.evaluate(() => { const e = document.querySelector("#map-bag"); return e && !e.hidden ? e.innerText.replace(/\n/g, " ") : ""; });
  check("…the bag counter is over the map", /Your bag 0/.test(bag), bag);
  const n0 = await litterCount();
  check("…and there's litter all over the map", n0 > 200, `${n0} pieces`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/cleanup-start.png` });

  // 2. Click the nearest piece, five times.
  const m0 = g.day.minute;
  for (let k = 0; k < 5; k++) { await clickNearest(); for (let t = 0; t < 60; t++) { await sleep(200); const s = await saved(); if (((s.day.cleanup || {}).mine || []).length > k) break; } }
  g = await saved();
  const mine = ((g.day.cleanup || {}).mine || []).length;
  check("2. clicking litter walks you over and bags it", mine >= 5, `${mine} pieces`);
  check("…each one takes a couple of minutes", g.day.minute - m0 >= mine * 2, `${g.day.minute - m0} min`);
  const bag2 = await p.evaluate(() => document.querySelector("#map-bag").innerText.replace(/\n/g, " "));
  check("…the counter keeps up", new RegExp(`Your bag ${mine}`).test(bag2), bag2);
  const tip = await p.evaluate(() => { const el = document.querySelector("#map g.trash-item .trash-hit"); el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, clientY: 300, pointerType: "mouse" })); const t = document.querySelector("#tip"); return t && !t.hidden ? t.innerText : ""; });
  check("…hovering names what it is", /Litter for the Clean-Up/.test(tip), tip.replace(/\n/g, " / "));
  if (SHOTS) { await p.evaluate(() => { document.querySelector("#tip").hidden = true; }); for (let k = 0; k < 2; k++) { await click(p, "#zoom-in"); await sleep(400); } await p.screenshot({ path: `${SHOTS}/cleanup-close.png` }); }
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(500); await closeAll();
  g = await saved();
  check("…a reload keeps your bag", ((g.day.cleanup || {}).mine || []).length === mine);

  // 3. The regulars, as the day goes on.
  const before = await litterCount();
  for (let k = 0; k < 6; k++) { await click(p, "[data-rest]") || await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /Rest 20 min/.test(x.textContent)); if (b) b.click(); }); await sleep(300); }
  await tab("here");
  const after = await litterCount();
  const board = await p.evaluate(() => [...document.querySelectorAll(".event-card.cleanup .comp-board li")].map(x => x.innerText.replace(/\n/g, " ")));
  check("3. the regulars collect too: the litter thins out as the day goes on", after < before, `${before} → ${after}`);
  check("…and they're on the board", board.length >= 4 && board.some(x => /Bea|gym group|Mags|Juno/.test(x)), JSON.stringify(board).slice(0, 200));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/cleanup-later.png` });

  // 6. Frame rate walking with the litter out (keys, 3 s).
  const fps = await p.evaluate(async () => {
    let n = 0, t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await new Promise(r => setTimeout(r, 3050));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true }));
    return n / ((performance.now() - t0) / 1000);
  });
  check("6. the frame rate walking with the litter out", fps > 45, `${fps.toFixed(1)} fps`);

  // 4. Head home: the weigh-in.
  await closeAll(); await click(p, "#act-home"); await sleep(800);
  const t = await modalText();
  g = await saved();
  const r = (g.events || {})["2026-04-22"];
  check("4. heading home: the weigh-in, with everyone's bags", /The weigh-in/.test(t || "") && /Golden Grabber/.test(t || ""), (t || "").replace(/\n+/g, " / ").slice(0, 260));
  check("…recorded: your pieces, your place, the top three", r && r.k === "cleanup" && r.score >= mine && r.place >= 1 && r.of >= 5 && r.top && r.top.length === 3, JSON.stringify(r));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/cleanup-weighin.png` });
  await closeAll();
  await tab("climber");
  const rib = await p.evaluate(() => { const h = [...document.querySelectorAll("h3")].find(x => /Ribbons/.test(x.textContent)); return h ? h.nextElementSibling.innerText : ""; });
  check("…on the Climber page", /Clean-Up 2026/.test(rib) && /pieces/.test(rib), rib.replace(/\n/g, " / "));

  // 5. Two days later: the kiosk and Local Buzz.
  g = await saved();
  g = await startOn(g, "2026-04-24");
  const kioskNote = await p.evaluate(() => { document.querySelector("#map g.lm-kiosk .kiosk-hit").dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; });
  for (let k = 0; k < 80 && !(await p.$(".modal")); k++) await sleep(150);
  const kt = await modalText();
  check("5. afterwards: the weigh-in's pinned up at the kiosk", /Clean-Up: the weigh-in/i.test(kt || ""), (kt || "").replace(/\n+/g, " / ").slice(0, 200));
  await closeAll();
  const buzz = await p.evaluate(() => { const b = [...document.querySelectorAll("button, [role=tab]")].find(x => /Local Buzz/i.test(x.textContent)); return !!b; });
  g = await saved();

  // 6. A phone.
  let h = JSON.parse(JSON.stringify(base));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  h = await startOn(h, "2027-04-22");
  await tab("here");
  const fit = await p.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".event-card.cleanup, .event-card.cleanup *, #map-bag")) { const r = el.getBoundingClientRect(); if (r.width && r.right > innerWidth + 1) bad.push(el.className || el.tagName); }
    const bag = document.querySelector("#map-bag").getBoundingClientRect(), car = document.querySelector(".cartouche").getBoundingClientRect();
    const overlap = !(bag.right < car.left || bag.left > car.right || bag.bottom < car.top || bag.top > car.bottom);
    return { bad, overlap, sx: document.documentElement.scrollWidth > innerWidth };
  });
  check("6. a phone: the card and the bag counter fit, and the counter clears the map's title", !fit.bad.length && !fit.sx && !fit.overlap, JSON.stringify(fit));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/cleanup-phone.png` });

  check("no errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
