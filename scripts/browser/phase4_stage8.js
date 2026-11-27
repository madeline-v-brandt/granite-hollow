// Phase 4, Stage 8: the whole social game together, on the busiest kind of day.
//   1. Saves from before Phase 4 and from Stages 4, 5 and 6 (made by those builds' own
//      tests) load with no errors, keep everything social, and play on.
//   2. A late-game climber on comp day: every regular and the Bishop out, Pickles yours
//      and following, Rowan beside you as a partner. The frame rate walking, and slow
//      frames (long tasks) while walking and talking.
//   3. A phone: every social screen fits (nothing off the side, nothing to scroll sideways,
//      buttons big enough to tap): the Here tab with the comp, Out today, a conversation with
//      all its replies, Your people and ribbons, Local Buzz, the comp's results, the forecast.
//   node scripts/browser/phase4_stage8.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough, GAME_DIR, FIX } = require("./lib");
const fs = require("fs"), path = require("path");
const World = require(GAME_DIR + "world.js");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, typeof g === "string" ? g : JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  };
  const closeAll = async () => { for (let k = 0; k < 8 && (await p.$(".modal [data-close], .modal [data-next]:not(.plan)")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]:not(.plan)"); await sleep(200); } };
  const box = () => p.evaluate(() => { const t = document.querySelector("#talk-root:not([hidden]) .talk"); if (!t) return null;
    return { text: t.querySelector(".talk-say").innerText, choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()) }; });
  const walkTo = async w => { await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
    for (let t = 0; t < 150 && !(await box()); t++) await sleep(200); };
  const choose = re => p.evaluate(src => { const lab = x => x.innerText.replace(/^\d\s*/, "").trim(), x = [...document.querySelectorAll(".talk .talk-choice")].find(x => new RegExp(src).test(lab(x))); if (x) { x.click(); return lab(x); } return null; }, re.source);
  const moments = g => Object.fromEntries(Object.entries((g.social || {}).npc || {}).map(([w, e]) => [w, Object.values(e.k || {}).reduce((a, c) => a + c, 0)]));

  // 1. Old saves.
  for (const f of ["v1-midday.json", "stage4-friends.json", "stage5-pickles.json", "stage6-rowan.json"]) {
    const src = fs.readFileSync(FIX + f, "utf8"), before = JSON.parse(src), n0 = errs.length;
    await write(src); await closeAll();
    let g = await saved();
    const m0 = moments(before), m1 = moments(g), kept = Object.entries(m0).every(([w, n]) => (m1[w] || 0) >= n);
    check(`${f}: loads, is a v2 save, keeps every moment${before.romance ? " and the romance" : ""}`, g && g.v === 2 && kept && (!before.romance || JSON.stringify(g.romance) === JSON.stringify(before.romance)) && errs.length === n0, JSON.stringify([m0, m1]).slice(0, 160));
    // …and plays on: home, then the next day.
    if (!g.day.over) { await click(p, "#act-home"); await sleep(500); }
    await closeAll(); await click(p, ".modal .plan[data-next='0']") || await click(p, ".modal [data-next]"); await sleep(700); await closeAll();
    g = await saved();
    check(`${f}: …and plays on to the next day`, g.date > before.date && !g.day.over && errs.length === n0, `${before.date} → ${g.date}`);
  }

  // 2. A late-game climber on comp day.
  await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeAll();
  let g = await saved();
  const day = "2025-11-01", before = World.addDays(day, -1);
  g.player.name = "Sam"; g.dayNo = 40;
  g.know.met = g.know.met || {}; g.social = g.social || { v: 2, npc: {} };
  for (const w of [...World.REG, "n:bishop", "n:pickles"]) {
    g.know.met[w] = { n: 30, first: "2025-09-10", last: World.addDays(before, -1), chats: 12, ...(w === "n:pickles" ? { pets: 30, petted: World.addDays(before, -1) } : {}) };
    g.social.npc[w] = { k: w === "n:pickles" ? { met: 30, pet: 30, walk: 6 } : { met: 30, chat: 14, climb: 8, sendWith: 4 }, last: { met: World.addDays(before, -1) }, m: [], said: {} };
  }
  g.social.npc["n:rowan"].k.flirt = 14;
  g.dog = { adopted: "2025-10-10" };
  g.romance = { since: "2025-09-20", together: "2025-10-20" };
  // A day: the evening before, then the summary's "Climb tomorrow".
  const startOn = async (g, d) => {
    g.date = World.addDays(d, -1); g.day.over = true; g.day.reason = "Test."; g.day.encounter = null; g.day.partner = null; g.forecast = [];
    await write(g); await closeAll();
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
    await click(p, ".modal [data-next='0']"); await sleep(800); await closeAll();
    return saved();
  };
  // The poster: the first morning you see it, not every morning, then the day before.
  const opening = g => g.day.last.text;
  g = await startOn(g, "2025-10-25");
  check("a week before the comp: Gus has put up a poster", /put up a poster[^.]*Bouldering Comp/.test(opening(g)), opening(g).slice(-140));
  const note25 = !!g.day.invite;
  g = await startOn(g, "2025-10-26");
  check("…the next morning, it isn't news again", !/poster/.test(opening(g)), opening(g).slice(-140));
  check("windscreen notes: never two mornings running, however many friends you have", !(note25 && g.day.invite && !g.day.invite.sunset), `${note25} / ${JSON.stringify(g.day.invite || null).slice(0, 60)}`);
  g = await startOn(g, "2025-10-31");
  check("…and the day before, a reminder", /Tomorrow: The Granite Hollow Bouldering Comp/.test(opening(g)) && !/put up a poster/.test(opening(g)), opening(g).slice(-140));
  g = await startOn(g, day);
  if (g.day.minute < 575) { g.day.minute = 580; await write(g); await closeAll(); g = await saved(); }     // the Bishop comes mid-morning (9:30)
  const people = await p.evaluate(() => [...document.querySelectorAll("g.person")].map(x => x.dataset.who));
  check("comp day: everyone's out, Pickles is yours", g.date === day && World.CLIMBING_REGULARS.every(w => people.includes(w)) && people.includes("n:bishop") && g.dog && g.dog.adopted, `${g.date} ${g.day.minute} ${people.join(",")} dog ${JSON.stringify(g.dog)}`);
  // Rowan, as a partner.
  await walkTo("n:rowan"); await talkThrough(p);
  let t = await box();
  check("…Rowan's hello on comp day", t && t.text.length > 10, t && t.text.slice(0, 100));
  await choose(/^Climb together/); await sleep(300); await talkThrough(p);
  g = await saved();
  check("…and Rowan comes along as your partner", g.day.partner && g.day.partner.who === "n:rowan", JSON.stringify(g.day.partner));
  await p.keyboard.press("Escape"); await sleep(300);
  // Walking, with everyone out, Pickles behind you and Rowan beside you.
  await p.evaluate(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ["longtask"] }); } catch (e) {} document.body.focus(); });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]); await sleep(200);
  await p.evaluate(() => { window.__ft = []; let last = performance.now(); const f = n => { window.__ft.push(n - last); last = n; if (window.__ft.length < 500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  // Your partner walks with you, in a layer of their own (after Phase 4), not standing at a boulder.
  const layers = () => p.evaluate(() => { const at = s => { const e = document.querySelector(s); if (!e || e.getAttribute("display") === "none") return null; const r = e.getBoundingClientRect(); return [r.x, r.y]; };
    return { me: at(".me-layer:not(.dog-layer):not(.pal-layer):not(.me-ghost)"), pal: at(".pal-layer"), standing: !!document.querySelector("g.person[data-who='n:rowan']") }; });
  const apart = L => (L.me && L.pal ? Math.round(Math.hypot(L.me[0] - L.pal[0], L.me[1] - L.pal[1])) : 999);
  const L0 = await layers();
  check("your partner walks with you, drawn beside you rather than standing at a boulder", L0.pal && !L0.standing && apart(L0) < 60, JSON.stringify(L0));
  const mids = [];
  for (const k of ["d", "s", "a", "w"]) { await p.keyboard.down(k); await sleep(1300); mids.push(await layers()); await p.keyboard.up(k); }
  await sleep(1500);
  const L1 = await layers();
  check("…keeps up while you walk", mids.every(L => apart(L) < 90) && mids.some(L => L.pal && L0.pal && Math.hypot(L.pal[0] - L0.pal[0], L.pal[1] - L0.pal[1]) > 20), mids.map(apart).join(", "));
  check("…and stands beside you when you stop", apart(L1) < 45, `${apart(L1)} px`);
  const ft = await p.evaluate(() => window.__ft.slice(5)), fps = 1000 / (ft.reduce((a, c) => a + c, 0) / ft.length), slow = ft.filter(x => x > 25).length / ft.length;
  const walkLong = await p.evaluate(() => window.__long.splice(0));
  console.log(`  walking on comp day: ${fps.toFixed(1)} fps, ${(100 * slow).toFixed(1)}% slow frames; long tasks: ${walkLong.join(", ") || "none"}`);
  check("walking on comp day stays smooth (50+ fps in headless Chrome)", fps >= 50, `${fps.toFixed(1)} fps`);
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  // Clicking your partner talks to them, right there.
  await p.evaluate(() => { const h = document.querySelector(".pal-layer .pal-hit"); if (h) h.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  for (let k = 0; k < 20 && !(await box()); k++) await sleep(150);
  const palTalk = await p.evaluate(() => (document.querySelector(".talk") || {}).getAttribute ? document.querySelector(".talk").getAttribute("aria-label") : "");
  check("…and clicking them talks to them, right where you are", /Rowan/.test(palTalk || ""), palTalk);
  await p.keyboard.press("Escape"); await sleep(200);
  // Talking to three people in a row: no long freezes opening the box or drawing portraits.
  const talkMs = [];
  for (const w of ["n:gus", "n:bea", "n:bishop"]) {
    await p.keyboard.press("Escape"); await sleep(150);
    await walkTo(w); await talkThrough(p);
    const ms = await p.evaluate(() => { const t0 = performance.now(); for (let k = 0; k < 5; k++) { const n = document.querySelector(".talk [data-next]"); if (n) n.click(); } return performance.now() - t0; });
    talkMs.push(Math.round(ms));
    await p.keyboard.press("Escape"); await sleep(150);
  }
  const talkLong = await p.evaluate(() => window.__long.splice(0));
  console.log(`  conversations: five clicks through the box took ${talkMs.join(", ")} ms; long tasks: ${talkLong.join(", ") || "none"}`);
  check("conversations open without long freezes (no task over 200 ms)", talkLong.every(x => x < 200), talkLong.join(", "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s8-comp-day.png") });

  // 3. A phone.
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(500);
  const audit = sel => p.evaluate(sel => {
    const vw = innerWidth, vh = innerHeight, bad = [], root = document.querySelector(sel);
    if (!root) return ["missing " + sel];
    if (document.documentElement.scrollWidth > vw + 1) bad.push("the page scrolls sideways: " + document.documentElement.scrollWidth);
    const sideways = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true; return false; };
    for (const el of root.querySelectorAll("*")) {
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === "hidden") continue;
      const name = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "");
      if ((r.right > vw + 1 || r.left < -1) && !sideways(el)) bad.push(`${name} off the side (${Math.round(r.left)}–${Math.round(r.right)})`);
      if (el.matches("button:not(.linklike)") && (r.height < 30 || r.width < 30)) bad.push(`a small button “${el.innerText.trim().slice(0, 24)}” (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    const m = document.querySelector(".modal");
    if (m && sel.startsWith(".modal")) { const r = m.getBoundingClientRect(), cs = getComputedStyle(m); if (r.bottom > vh + 1 && !/(auto|scroll)/.test(cs.overflowY) && !/(auto|scroll)/.test(getComputedStyle(m.parentElement).overflowY)) bad.push("the dialog runs off the bottom and doesn't scroll"); }
    return [...new Set(bad)].slice(0, 6);
  }, sel);
  const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `p4s8-phone-${n}.png`) }); };
  await click(p, "[data-tab='here']"); await sleep(300);
  let bad = await audit("#tabbody");
  check("phone: the Here tab (the comp card, leaders, Out today)", !bad.length, bad.join("; ")); await shot("here");
  await walkTo("n:rowan"); await talkThrough(p);
  t = await box();
  bad = await audit("#talk-root");
  await p.evaluate(() => scrollTo(0, 0)); await p.keyboard.press("Escape"); await sleep(200);
  await walkTo("n:otis"); await talkThrough(p); await sleep(300);   // a new conversation, started with the page scrolled to the top
  t = await box();
  const fitsTalk = await p.evaluate(() => { const t = document.querySelector(".talk"); if (!t) return false; const r = t.getBoundingClientRect(), cs = [...t.querySelectorAll(".talk-choice")].map(x => x.getBoundingClientRect()); return r.top >= -1 && cs.every(c => c.bottom <= innerHeight + 1 && c.top >= 0); });
  check("phone: a conversation, every reply on screen", t && t.choices.length >= 3 && !bad.length && fitsTalk, (bad.join("; ") || "") + " · " + (t ? t.choices.join(" | ") : ""));
  await shot("talk");
  await p.keyboard.press("Escape"); await sleep(200);
  await click(p, "[data-tab='climber']"); await sleep(300);
  bad = await audit("#tabbody");
  t = await p.evaluate(() => document.querySelector("#tabbody").innerText);
  check("phone: the Climber page (Your people, ribbons)", !bad.length && /Your people/i.test(t), bad.join("; ")); await shot("climber");
  await click(p, "[data-tab='craglog']"); await sleep(200); await click(p, "[data-cl-view='buzz']"); await sleep(300);
  bad = await audit("#tabbody");
  check("phone: Local Buzz", !bad.length, bad.join("; ")); await shot("buzz");
  await click(p, "[data-tab='here']"); await sleep(200);
  // The comp's results at dusk, then the forecast.
  g = await saved(); g.day.minute = g.day.weather.dusk - 5; g.day.encounter = null; await write(g);
  await click(p, "#act-rest"); await sleep(900);
  bad = await audit(".modal");
  t = await p.evaluate(() => (document.querySelector(".modal") || {}).innerText || "");
  check("phone: the comp's results and podium", /The results/.test(t) && !bad.length, bad.join("; ") || t.slice(0, 80)); await shot("podium");
  await click(p, ".modal [data-close]"); await sleep(400);
  bad = await audit(".modal");
  t = await p.evaluate(() => (document.querySelector(".modal") || {}).innerText || "");
  check("phone: the day's summary and forecast", /forecast/i.test(t) && !bad.length, bad.join("; ")); await shot("summary");
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  if (errs.length) fails++;
  await b.close();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
