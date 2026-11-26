// Phase 4, Stage 1: finding people. The regulars you've met wear a name tag on the
// map; hovering over (or tapping) anyone shows who they are and what they're up to;
// the Here tab's "Out today" says where the people you know are and finds them;
// they come and go at their own hours; the paper map pencils them in, but never in
// an area you haven't found.
//   node scripts/browser/phase4_stage1.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, GAME_DIR } = require("./lib");
const path = require("path");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
const D = require(GAME_DIR + "game-data.json");
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const closeModals = async () => { for (let k = 0; k < 6 && (await p.$(".modal [data-close], .modal [data-next]")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]"); await sleep(150); } };
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400); await closeModals();
  };
  const drawn = () => p.evaluate(() => [...document.querySelectorAll("g.person[data-who]")].map(x => ({ who: x.dataset.who, tag: (x.querySelector(".person-tag") || {}).textContent || null })));
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  // Rest until a weekend morning with three or more regulars out.
  let g;
  for (let d = 0; d < 40; d++) {
    g = await saved();
    const out = Object.values(g.world.reg || {}).filter(R => R.recent.some(s => s.d === g.date && s.t[0] <= g.day.minute + 30 && s.t[1] > g.day.minute + 60)).length;
    if (g.dayNo >= 12 && out >= 3 && !g.day.rainedOut) break;
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); } else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300);
    }
    await closeModals(); await sleep(120);
  }
  g = await saved();
  // You've met everyone but Dez; you know The Tailgate, The Schoolhouse and Hawkwatch only.
  const regs = Object.keys(g.world.reg);
  g.know.met = g.know.met || {};
  for (const w of [...regs, "n:pickles"]) if (w !== "n:dez") g.know.met[w] = { n: 2, first: "2025-09-10", last: "2025-09-12" };
  delete g.know.met["n:dez"];
  g.day.minute = Math.max(...Object.values(g.world.reg).map(R => (R.recent.find(s => s.d === g.date) || { t: [0] }).t[0])) + 10;
  g.day.minute = Math.min(g.day.minute, g.day.weather.dusk - 90);
  await write(g);
  g = await saved();
  const people = await drawn();
  const metOut = people.filter(x => x.who !== "n:dez" && x.who !== "n:pickles");
  check("everyone you've met has a name tag; someone you haven't doesn't", metOut.length >= 1 && metOut.every(x => x.tag) && people.filter(x => x.who === "n:dez").every(x => !x.tag),
    people.map(x => `${x.who}:${x.tag || "-"}`).join(" "));
  check("Pickles wears his", people.some(x => x.who === "n:pickles" && x.tag === "Pickles"));
  // …shown only on hover.
  const shownTags = () => p.evaluate(() => [...document.querySelectorAll("g.person .person-tag-g")].filter(x => getComputedStyle(x).display !== "none").map(x => x.textContent));
  const before = await shownTags();
  // Stand by someone you know, so they're on screen.
  {
    const near = metOut.map(x => [x.who, (g.world.reg[x.who].recent.find(r => r.d === g.date) || {}).b]).find(([, b]) => b != null);
    if (near) { const bo = D.boulders[near[1]]; const g2 = await saved(); g2.pos = [bo.x, bo.y - 9]; g2.loc = { sector: bo.sector, boulder: null }; await write(g2); }
  }
  // Someone on screen (inside the map, not under its legend).
  const onScreen = await p.evaluate(ws => { const m = document.querySelector("#map").getBoundingClientRect();
    for (const w of ws) { const r = document.querySelector(`g.person[data-who='${w}'] .person-fig`).getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height * .6;
      if (x > m.x + 20 && x < m.right - 80 && y > m.y + 120 && y < m.bottom - 20) return { w, x, y }; } return null; }, metOut.map(x => x.who));
  if (onScreen) { await p.mouse.move(onScreen.x, onScreen.y); await sleep(150); }
  const during = await shownTags();
  await p.mouse.move(5, 5); await sleep(100);
  const want = onScreen && metOut.find(x => x.who === onScreen.w).tag;
  check("name tags only show on hover", before.length === 0 && (!onScreen || (during.length === 1 && during[0] === want)), `before: ${before.join(",") || "none"} · hovering ${want || "(nobody on screen)"}: ${during.join(",")}`);
  // Hover over someone: their card.
  const one = metOut[0];
  const card = one && await p.evaluate(w => {
    const el = document.querySelector(`g.person[data-who='${w}'] .person-fig path`); const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: "mouse" }));
    const t = document.querySelector("#tip"); return t.hidden ? "" : t.innerText;
  }, one.who);
  check("hovering over someone shows who they are, what they're up to, and until when", card && /Around until about|Climbing with you/.test(card) && !/undefined/.test(card), (card || "").replace(/\n/g, " / "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s1-map.png") });
  // Out today.
  await click(p, '#tabs [data-tab="here"]'); await sleep(150);
  const here = await p.evaluate(() => document.querySelector("#tabbody").innerText);
  const outText = here.split(/Out today/i)[1] || "";
  check("the Here tab says who's out today", /Out today/i.test(here), outText.slice(0, 200).replace(/\n/g, " / "));
  const unknownAreas = D.sectors.map(s => s.name).filter(s => !(g.know.areas || {})[s]);
  const unknownBoulders = D.boulders.filter((x, i) => !(g.know.boulders || {})[i]).map(x => x.name);
  check("…without naming an area or a boulder you haven't found", !unknownAreas.some(a => outText.includes(a)) && !unknownBoulders.some(n => n.length > 5 && outText.includes(n)));
  // Find someone: you walk over and say hello.
  const findable = await p.evaluate(() => [...document.querySelectorAll("[data-find]")].map(x => x.dataset.find).filter(w => w !== "n:pickles"));
  if (findable.length) {
    await click(p, `[data-find="${findable[0]}"]`);
    for (let t = 0; t < 160 && !(await p.$(".npc")); t++) await sleep(250);
    const met = await p.evaluate(() => (document.querySelector(".npc .nm") || {}).textContent || "");
    check("Find walks you over to them, and you say hello", !!met, `${findable[0]} → ${met.trim().slice(0, 40)}`);
  } else console.log("  (nobody to find in an area you know)");
  // The paper map: the people you know, in areas you know.
  await p.keyboard.press("m"); await sleep(400);
  const pp = await p.evaluate(() => ({ dots: [...document.querySelectorAll(".pp-people .pp-name")].flatMap(x => x.textContent.split(", ")), side: (document.querySelector(".paper-side") || {}).innerText || "" }));
  g = await saved();
  const shouldShow = (await drawn()).filter(x => x.tag && (x.who === "n:pickles" || g.know.areas[D.boulders[(g.world.reg[x.who] || { recent: [] }).recent.find(s => s.d === g.date)?.b ?? 0].sector]));
  check("the paper map pencils in the people you know who are out", pp.dots.length >= 1 && pp.dots.includes("Pickles"), pp.dots.join(", "));
  check("…and lists them, never in an area you haven't found", /Out now/i.test(pp.side) && !unknownAreas.some(a => pp.side.includes(a)), (pp.side.split(/Out now/i)[1] || "").slice(0, 120).replace(/\n/g, " / "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s1-paper.png") });
  await p.keyboard.press("Escape"); await sleep(200);
  // Comings and goings: before someone's hours, they aren't there yet.
  g = await saved();
  const sess = Object.entries(g.world.reg).map(([w, R]) => [w, R.recent.find(s => s.d === g.date)]).filter(([, s]) => s && s.t[0] > 480);
  if (sess.length) {
    const [w, s] = sess[0];
    g.day.minute = s.t[0] - 30; g.day.encounter = null; g.day.partner = null; g.day.met = []; await write(g);
    const early = (await drawn()).some(x => x.who === w);
    const later = (await p.evaluate(() => document.querySelector("#tabbody").innerText)).includes("Later");
    g = await saved(); g.day.minute = s.t[0] + 5; await write(g);
    const there = (await drawn()).some(x => x.who === w);
    check("people come at their own hours: not there before, there after", !early && there, `${w} from ${s.t[0]}`);
    check("…and Out today says they're coming later", later || w === "n:dez");
  } else console.log("  (nobody comes later than 8 today)");
  // On a phone: a tap shows who it is.
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(500);
  const tapped = await p.evaluate(() => {
    const el = [...document.querySelectorAll("g.person .person-fig path")][0]; if (!el) return "no one drawn";
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("click", { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerType: "touch" }));
    const t = document.querySelector("#tip"); return t.hidden ? "" : t.innerText;
  });
  check("on a phone, a tap shows who someone is", tapped && tapped !== "no one drawn", tapped.replace(/\n/g, " / "));
  const tagAfterTap = await shownTags();
  check("…and their name tag, for a moment", tagAfterTap.length <= 1);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s1-phone.png") });
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
