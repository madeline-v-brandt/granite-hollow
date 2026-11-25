// Stage 4: walking. Keys move the climber and cost daylight at the trail and
// off-trail rates; boulders and water are solid; clicking walks you there; an
// unfamiliar boulder offers Inspect (E); the trail map's Walk takes you along the
// trails, with the right time charged; dusk walks you back to the lot; where you
// are survives a reload; and the frame rate while walking.
//   node scripts/browser/walk.js
const { open, ready, click, sleep } = require("./lib");
const SLOT = "granite-hollow-save-v1";
(async () => {
  const { b, p, errs, url } = await open();
  const g = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const put = async s => { await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, v) => localStorage.setItem(k, v), SLOT, JSON.stringify(s)); await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400); };
  const clockOf = s => s.day.minute + (s.day.walkFrac || 0);
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[0].click(); s()[6].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(400); await click(p, ".modal [data-close]"); await sleep(200);
  console.log("first morning hint:", await p.evaluate(() => { const h = document.querySelector("#map-hint"); return h.hidden ? "(hidden)" : h.innerText; }));

  // Walking on the trail north-east from the trailhead, then off it: metres per game minute.
  let s0 = await g(); if (!s0.pos) { await p.keyboard.press("d"); await sleep(600); s0 = await g(); }
  const a0 = s0.pos, c0 = clockOf(s0);
  await p.keyboard.down("d"); await sleep(1500); await p.keyboard.up("d"); await sleep(700);
  let s = await g();
  const m1 = Math.hypot(s.pos[0] - a0[0], s.pos[1] - a0[1]), t1 = clockOf(s) - c0;
  console.log(`keys: walked ${m1.toFixed(1)} m in ${t1.toFixed(2)} game minutes = ${(m1 / t1).toFixed(1)} m/min (walking yourself: 50 on a trail, 35 off it) | hint now:`, await p.evaluate(() => document.querySelector("#map-hint").hidden ? "(hidden)" : "shown"));

  // Wander around the Tailgate's boulders: you stop at a boulder or go round it, never through it.
  await p.evaluate(async () => { window.__S = Illu.parkScene(await (await fetch("game-data.json")).json()); });
  const inRock = pos => p.evaluate(q => window.__S.boulders.filter(bo => Math.hypot(q[0] - bo.b.x, q[1] - bo.b.y) < bo.form.R * .85).map(bo => bo.b.name), pos);
  let inside = [];
  for (let i = 0; i < 16; i++) {
    const key = "wasd"[i % 4];
    await p.keyboard.down(key); await sleep(450); await p.keyboard.up(key); await sleep(450);
    inside.push(...await inRock((await g()).pos));
  }
  s = await g();
  console.log("wandered to", s.pos.map(v => Math.round(v)), JSON.stringify(s.loc), "| ever inside a boulder:", inside.length ? inside : "no");

  // Click an unfamiliar boulder on screen: you walk there, and the map offers Inspect.
  const target = await p.evaluate(() => {
    for (const el of document.querySelectorAll("#map g.boulder")) {
      if (el.closest("[display=none]") || el.getAttribute("aria-label") !== "Unfamiliar boulder") continue;
      const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height * .55, hit = document.elementFromPoint(x, y);
      if (hit && hit.closest("g.boulder") === el) return { x, y, id: +el.dataset.id };
    }
    return null;
  });
  if (target) {
    await p.mouse.click(target.x, target.y); await sleep(250);
    const busy = await p.evaluate(() => !!document.querySelector("#act-rest[disabled]"));
    await sleep(3600);
    s = await g();
    console.log("clicked an unfamiliar boulder: walking disabled the buttons:", busy, "| arrived at #" + s.loc.boulder, s.loc.boulder === target.id, "| prompt:", await p.evaluate(() => { const h = document.querySelector("#map-prompt"); return h.hidden ? "(hidden)" : h.innerText.replace(/\s+/g, " "); }));
    await p.keyboard.press("e"); await sleep(400);
    console.log("  E:", await p.evaluate(() => (document.querySelector(".result .rt") || {}).textContent), "| prompt after:", await p.evaluate(() => document.querySelector("#map-prompt").hidden ? "(hidden)" : "shown"));
  } else console.log("no unfamiliar boulder on screen to click");

  // The trail map's Walk: Hawkwatch, along the trails, with the trip's time charged.
  s = await g(); const before = clockOf(s);
  await p.keyboard.press("m"); await sleep(500);
  await p.evaluate(() => document.querySelector('[data-pp-go="Hawkwatch"]').click());
  let faded = false;
  for (let i = 0; i < 30; i++) { await sleep(150); if (await p.evaluate(() => document.querySelector("#map-fade").classList.contains("on"))) faded = true; }
  await sleep(500);
  s = await g();
  console.log(`trail map Walk to Hawkwatch: at ${JSON.stringify(s.loc)} after ${(clockOf(s) - before).toFixed(1)} min | faded on the way: ${faded} | panel: ${await p.evaluate(() => document.querySelector("#tabbody").innerText.split("\n").filter(Boolean).slice(0, 2).join(" / "))}`);

  // Where you are survives a reload.
  const pos = s.pos;
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(400);
  s = await g();
  console.log("after reload: same place:", Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1]) < .5, JSON.stringify(s.loc));

  // Dusk: a minute before it, walking. Warned, then walked back to the lot, and the day ends.
  s.day.minute = s.day.weather.dusk - 4; s.day.warned = false; s.day.warnedOut = false;
  await put(s);
  const toasts = [];
  for (let i = 0; i < 40 && !(await g()).day.over; i++) {
    await p.keyboard.down("sd"[i % 2]); await sleep(500); await p.keyboard.up("sd"[i % 2]);
    toasts.push(...await p.evaluate(() => [...document.querySelectorAll(".toast b")].map(t => t.textContent)));
    await sleep(100);
  }
  await sleep(600);
  s = await g();
  console.log("dusk: day over", s.day.over, "| at the lot:", Math.hypot(s.pos[0], s.pos[1]) < 1, "|", s.day.reason, "| warnings:", [...new Set(toasts)].join(", "), "| summary:", await p.evaluate(() => (document.querySelector(".modal h2") || {}).textContent));

  // Frame rate while walking (headless Chrome; the real test is a real browser).
  await p.evaluate(() => { const b = document.querySelector(".modal [data-next]"); if (b) b.click(); }); await sleep(800);
  await p.evaluate(() => { window.__f = []; let last = null; const t = n => { if (last != null) window.__f.push(n - last); last = n; if (window.__on) requestAnimationFrame(t); }; window.__on = true; requestAnimationFrame(t); });
  await p.keyboard.down("w"); await sleep(4000); await p.keyboard.up("w");
  console.log("walking frame rate:", await p.evaluate(() => { window.__on = false; const f = window.__f.slice(5).sort((a, b) => a - b), mean = f.reduce((a, b) => a + b, 0) / f.length; return `${(1000 / mean).toFixed(1)} fps, slowest 5% ${f[Math.floor(f.length * .95)].toFixed(1)} ms, ${(100 * f.filter(x => x > 25).length / f.length).toFixed(1)}% janky`; }));
  console.log("page errors:", errs.length ? errs : "none");
  await b.close();
})();
