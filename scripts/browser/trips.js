// Climbing trips (after Phase 4), in the game.
//   1. A friend's invitation comes (Bea, Rocklands, in June), on the windscreen and in the Here tab.
//   2. Count me in: the summary's card for the day you leave is the trip.
//   3. Away and back: two weeks later, a postcard of what you sent and stories; the XP, the proof,
//      the climbing days; Bea wasn't at the crag those days; the Climber page lists the trip.
//      A reload keeps it all (the proof is recounted from the ticks and the trips).
//   4. Not this time, and an invitation left unanswered: no trip.
//   5. A phone: the postcard fits at 390 px.
//   node scripts/browser/trips.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep } = require("./lib");
const Mech = require("../../site/game/mechanics.js");
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
  // The evening before d, then "Climb tomorrow" (or the trip card).
  const startOn = async (g, d) => {
    g.date = addDays(d, -1); g.day.over = true; g.day.reason = "Test."; g.day.encounter = null; g.day.partner = null; g.forecast = [];
    await write(g); await closeAll();
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
    await click(p, ".modal [data-next='0']"); await sleep(900);
    return saved();
  };
  const nextDay = async () => {
    await closeAll(); let g = await saved();
    if (!g.day.over) { await click(p, "#act-home"); await sleep(500); await closeAll(); }
    if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
    await click(p, ".modal [data-next='0']"); await sleep(900);
    return saved();
  };

  // A climber at V5 who's good friends with Bea, the week before Rocklands season.
  await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(400); await closeAll();
  let g = await saved();
  const base = JSON.parse(JSON.stringify(g));
  const friendly = g => {
    g.dayNo = 40; g.player.name = "Sam";
    let xp = 0; for (let k = 0; k < 5; k++) xp += Mech.levelCost(k); g.player.xp = xp + 50;
    // The proof a V5 has: from an earlier trip (proof is recounted on load from the ticks and the trips).
    const sends = []; [6, 6, 6, 5, 4].forEach((n, gr) => { for (let k = 0; k < n; k++) sends.push({ g: gr, flash: false, xp: 0 }); });
    g.trips = [{ key: "joes", who: "n:ade", leave: "2025-10-11", back: "2025-10-25", sends, xp: 0, tales: [] }];
    g.know.met = g.know.met || {}; g.social = g.social || { v: 2, npc: {} };
    for (const w of ["n:bea", "n:gus"]) { g.know.met[w] = { n: 20, first: "2025-10-01", last: "2026-06-01", chats: 12 }; g.social.npc[w] = { k: { met: 20, chat: 14, climb: 8, sendWith: 4 }, last: { met: "2026-06-01" }, m: [], said: {} }; }
    return g;
  };
  g = friendly(g);
  g = await startOn(g, "2026-06-15");
  for (let k = 0; k < 16 && !g.tripOffer; k++) g = await nextDay();
  const o = g.tripOffer;
  check("1. Bea invites you to Rocklands, a Saturday a week or so ahead", !!o && o.key === "rocklands" && o.who === "n:bea" && new Date(o.leave + "T12:00:00Z").getUTCDay() === 6, JSON.stringify(o));
  check("…on your windscreen", /ROCKLANDS/.test(g.day.last.text), g.day.last.text.slice(-200));
  check("…and no ordinary windscreen note that morning", !g.day.invite);
  await closeAll(); await tab("here");
  const card = await p.evaluate(() => { const c = document.querySelector(".event-card.trip"); return c ? c.innerText : ""; });
  check("…in the Here tab, with Count me in / Not this time", /Rocklands, with Bea's family/i.test(card) && /Count me in/.test(card) && /Not this time/.test(card), card.replace(/\n/g, " / "));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/trip-invite.png` });

  // 2. Yes.
  await click(p, "[data-trip='yes']"); await sleep(300);
  g = await saved();
  check("2. Count me in", g.tripOffer && g.tripOffer.yes === true);
  const card2 = await p.evaluate(() => { const c = document.querySelector(".event-card.trip"); return c ? c.innerText : ""; });
  check("…the Here tab says when you're leaving", /Climbing trip/i.test(card2) && /Rocklands/.test(card2) && /Change of plans/.test(card2), card2.replace(/\n/g, " / "));
  // Up to the evening before you leave.
  const before = { xp: g.player.xp, dayNo: g.dayNo, level: Mech.levelOf(g.player).level };
  while (g.date < addDays(o.leave, -1)) g = await nextDay();
  await closeAll();
  if (!g.day.over) { await click(p, "#act-home"); await sleep(500); await closeAll(); }
  if (!(await p.$(".modal .plan"))) { await click(p, "[data-summary]"); await sleep(400); }
  const plans = await p.evaluate(() => [...document.querySelectorAll(".modal .plan")].map(x => x.innerText.replace(/\n/g, " ")));
  check("…the evening before, tomorrow's card is the trip, and no days after it", /Rocklands/.test(plans[0] || "") && plans.length === 1, JSON.stringify(plans).slice(0, 200));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/trip-summary.png` });

  // 3. Away and back.
  const xpBefore = (await saved()).player.xp, dayBefore = (await saved()).dayNo;
  await click(p, ".modal .plan.trip"); await sleep(1200);
  g = await saved();
  const t = await modalText();
  check("3. back two weeks later, with a postcard from Rocklands", g.date === o.back && !!(await p.$(".modal .postcard")) && /Back from Rocklands/.test(t || ""), `${g.date} · ${(t || "").slice(0, 80).replace(/\n/g, " / ")}`);
  const tr = (g.trips || [])[(g.trips || []).length - 1];
  check("…what you sent: Rocklands problems with their Font grades, the rest as a count, the XP", !!tr && tr.sends.length > 5 && /\(V\d+\)/.test(t) && /more problems/.test(t) && /\+[\d,]+ XP/.test(t), (t || "").replace(/\n+/g, " / ").slice(0, 300));
  check("…and stories from the trip", (await p.$$eval(".modal .trip-tales li", x => x.length)) >= 2);
  check("…the XP is yours, and the climbing days count", g.player.xp === xpBefore + tr.xp && g.dayNo === dayBefore + 8 + 1, `${xpBefore} + ${tr.xp} = ${g.player.xp}; day ${dayBefore} → ${g.dayNo}`);
  const tops = (g.player.tops || []).reduce((a, n) => a + (n || 0), 0);
  check("…the sends count as proof (tops)", tops >= tr.sends.length + 27);
  const beaAway = ((g.world.reg || {})["n:bea"] || { recent: [] }).recent.filter(s => s.d >= o.leave && s.d < o.back).length;
  check("…Bea wasn't at the crag while you were both away", beaAway === 0, `${beaAway} sessions`);
  check("…a big moment with Bea", (g.social.npc["n:bea"].k.trip || 0) === 1);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/trip-back.png` });
  await closeAll();
  check("…the day's opening says you're home", /home from two weeks in Rocklands with Bea/.test(g.day.last.text));
  await tab("climber");
  const climber = await p.evaluate(() => { const h = [...document.querySelectorAll("h3")].find(x => /Climbing trips/.test(x.textContent)); return h ? h.nextElementSibling.innerText : ""; });
  check("…the Climber page lists the trip", /Rocklands, South Africa/.test(climber) && /with Bea/.test(climber), climber.replace(/\n/g, " / "));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/trip-climber.png` });
  // A reload: the proof is recounted from ticks and trips, and the level holds.
  const lv = Mech.levelOf(g.player).level, xp0 = g.player.xp;
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(400); await closeAll();
  g = await saved();
  check("…a reload keeps the XP, the proof and the level", g.player.xp === xp0 && Mech.levelOf(g.player).level === lv && (g.player.tops || []).reduce((a, n) => a + (n || 0), 0) >= tr.sends.length + 27, `V${lv} → V${Mech.levelOf(g.player).level}`);
  check("…and no second invitation for a season", !g.tripOffer && !!g.tripLast);

  // 4. Not this time; and one left unanswered.
  let h = friendly(JSON.parse(JSON.stringify(base)));
  h.tripOffer = { key: "rocklands", who: "n:bea", leave: "2026-07-04", back: "2026-07-18", made: "2026-06-24" }; h.tripLast = "2026-06-24";
  h = await startOn(h, "2026-06-25");
  await closeAll(); await tab("here");
  await click(p, "[data-trip='no']"); await sleep(300);
  h = await saved();
  check("4. Not this time: no trip, and no card", !h.tripOffer && !(await p.$(".event-card.trip")));
  let u = friendly(JSON.parse(JSON.stringify(base)));
  u.tripOffer = { key: "rocklands", who: "n:bea", leave: "2026-07-04", back: "2026-07-18", made: "2026-06-24" }; u.tripLast = "2026-06-24";
  u = await startOn(u, "2026-07-03"); await closeAll();
  u = await nextDay(); await closeAll();
  check("…an invitation never answered lapses on the day: no trip", u.date === "2026-07-04" && !u.tripOffer && !(u.trips || []).some(x => x.key === "rocklands"), u.date);

  // 5. A phone.
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  let v = friendly(JSON.parse(JSON.stringify(base)));
  v.tripOffer = { key: "magicwood", who: "n:rowan", leave: "2026-08-15", back: "2026-08-29", made: "2026-08-07", yes: true }; v.tripLast = "2026-08-07";
  v.know.met["n:rowan"] = v.know.met["n:bea"]; v.social.npc["n:rowan"] = JSON.parse(JSON.stringify(v.social.npc["n:bea"]));
  v = await startOn(v, "2026-08-15");
  const fit = await p.evaluate(() => { const m = document.querySelector(".modal"); if (!m) return null; const over = [...m.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length; return { over, sx: document.documentElement.scrollWidth > innerWidth, pc: !!m.querySelector(".postcard") }; });
  check("5. a phone: the postcard from Magic Wood fits at 390 px", fit && fit.pc && fit.over === 0 && !fit.sx, JSON.stringify(fit));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/trip-phone.png` });

  check("no errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await b.close();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
