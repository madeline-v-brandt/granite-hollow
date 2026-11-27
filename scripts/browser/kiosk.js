// The trailhead kiosk (after Phase 4): a place on the map you can read.
//   1. A new climber's first morning: the welcome and the notebook page.
//   2. A week before the comp: Gus's poster is drawn on the kiosk; hovering says so; a
//      click walks you over and reads it (the poster, a notice, the notebook page).
//   3. Two days after the comp: no poster, the results pinned up; standing by it,
//      the map's prompt reads it (E too).
//   4. A phone: the board fits at 390 px.
//   node scripts/browser/kiosk.js            (screenshots to $SHOTS, if set)
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
  const startOn = async (g, d) => {
    g.date = addDays(d, -1); g.day.over = true; g.day.reason = "Test."; g.day.encounter = null; g.day.partner = null; g.forecast = [];
    await write(g); await closeAll();
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
    await click(p, ".modal [data-next='0']"); await sleep(800); await closeAll();
    return saved();
  };
  const posterShown = () => p.evaluate(() => { const el = document.querySelector("#map .kiosk-poster"); return !!el && getComputedStyle(el).display !== "none"; });
  const clickKiosk = () => p.evaluate(() => { const el = document.querySelector("#map g.lm-kiosk .kiosk-hit"); if (!el) return false; el.dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; });
  const waitModal = async () => { for (let t = 0; t < 100 && !(await p.$(".modal")); t++) await sleep(150); return modalText(); };

  // 1. A new climber.
  await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(500);
  let t = await modalText();
  check("a new climber's first morning: the kiosk's welcome and the notebook page", /Welcome to Granite Hollow/.test(t || "") && !!(await p.$(".modal .notebook")), (t || "").slice(0, 60));
  await closeAll();
  check("…no poster on the kiosk in early September", !(await posterShown()));

  // 2. A week before the comp.
  let g = await saved(); g.dayNo = 30;
  g = await startOn(g, "2025-10-25");
  check("a week before the comp: the poster is up on the kiosk", await posterShown());
  const tip = await p.evaluate(() => { const el = document.querySelector("#map g.lm-kiosk .kiosk-hit"); el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, clientY: 300, pointerType: "mouse" })); const t = document.querySelector("#tip"); return t && !t.hidden ? t.innerText : ""; });
  check("…hovering over it says what's on the poster", /trailhead kiosk/i.test(tip) && /Bouldering Comp/.test(tip), tip.replace(/\n/g, " / "));
  check("…a click walks you over", await clickKiosk());
  t = await waitModal();
  check("…and reads it: the poster, a notice from Gus and the notebook page", /Bouldering Comp/.test(t || "") && !!(await p.$(".modal .kiosk-poster-card")) && !!(await p.$(".modal .kiosk-note")) && !!(await p.$(".modal .notebook")), (t || "").replace(/\n+/g, " / ").slice(0, 200));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/kiosk-poster.png` });
  await closeAll();
  g = await saved();
  check("…you're standing by it now, and the map offers to read it again", await p.evaluate(() => { const m = document.querySelector("#map-prompt"); return !!m && !m.hidden && /kiosk/i.test(m.innerText); }));
  if (SHOTS) { await p.evaluate(() => { document.querySelector("#tip").hidden = true; }); await p.screenshot({ path: `${SHOTS}/kiosk-map.png` }); }
  await p.keyboard.press("e"); await sleep(300);
  check("…E reads it", /Bouldering Comp/.test((await modalText()) || ""));
  await closeAll();
  g = await startOn(g, "2025-10-31");
  t = null; await clickKiosk(); t = await waitModal();
  check("the day before: tomorrow, and somebody has drawn Pickles on it", /tomorrow/i.test(t || "") && /drawn Pickles/.test(t || ""), (t || "").replace(/\n+/g, " / ").slice(0, 160));
  await closeAll();

  // 3. Two days after the comp (which you climbed in).
  g = await saved();
  g.events = { "2025-11-01": { k: "comp", score: 1450, there: true, place: 4, of: 12 } };
  g = await startOn(g, "2025-11-03");
  check("after the comp: the poster's down", !(await posterShown()));
  await clickKiosk(); t = await waitModal();
  check("…the results are pinned up, you among them", /results/i.test(t || "") && !!(await p.$(".modal .kiosk-note.results li.me")), (t || "").replace(/\n+/g, " / ").slice(0, 200));
  check("…and the heading is Gus's notices", /Gus's notices/.test(t || ""));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/kiosk-results.png` });
  await closeAll();

  // A long way off: a click on it walks you there and reads it on arrival.
  await p.evaluate(() => { const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }); document.dispatchEvent(ev); });
  await sleep(2500); await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true })));
  await sleep(300);
  const far = await p.evaluate(() => { const m = document.querySelector("#map-prompt"); return !m || m.hidden || !/kiosk/i.test(m.innerText); });
  check("walking away: the kiosk prompt goes", far);
  await clickKiosk(); t = await waitModal();
  check("…a click from further off walks back and reads it", /Gus's notices/.test(t || ""));
  await closeAll();

  // 4. A phone.
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(600);
  await p.evaluate(() => { document.querySelector("#map-prompt [data-map-kiosk]")?.click(); });
  t = await waitModal();
  const fit = await p.evaluate(() => { const m = document.querySelector(".modal"); if (!m) return null; const r = m.getBoundingClientRect(); const over = [...m.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length; return { w: r.width, over, sx: document.documentElement.scrollWidth > innerWidth }; });
  check("a phone: the kiosk's board fits at 390 px", fit && fit.over === 0 && !fit.sx, JSON.stringify(fit));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/kiosk-phone.png` });

  check("no errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
