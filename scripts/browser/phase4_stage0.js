// Phase 4, Stage 0: the regulars' lives and the social record. Over a couple of
// weeks of rest days: the regulars stand where their sessions put them, Pickles is
// never "waiting by the car" (he's only ever at his rock); walking up to a regular
// is remembered in G.social; and a save from before Phase 4 gets the regulars'
// records and a social record on load, valid, with nothing changed in its ledger.
//   node scripts/browser/phase4_stage0.js
const { open, ready, click, sleep } = require("./lib");
const SLOT = "granite-hollow-save-v1";
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
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();

  let mornings = 0, atLot = 0, placed = 0, mismatched = [];
  for (let d = 0; d < 16; d++) {
    await closeModals();
    const g = await saved();
    mornings++;
    if (g.day.encounter && g.day.encounter.who === "n:pickles") atLot++;
    // Each regular on the map is at the boulder today's session puts them at.
    const drawn = await p.evaluate(() => [...document.querySelectorAll("g.person[data-who]")].map(x => x.dataset.who));
    for (const [w, R] of Object.entries(g.world.reg || {})) {
      // (Since Stage 1 they keep their own hours: there between t[0] and t[1], and never after dusk.)
      const s = R.recent.find(x => x.d === g.date), m = g.day.minute;
      const here = s && m >= s.t[0] && m < Math.min(s.t[1], g.day.weather.dusk);
      if (here) { placed++; if (!drawn.includes(w)) mismatched.push(`${w} out but not drawn`); }
      else if (drawn.includes(w)) mismatched.push(`${w} drawn but not out`);
    }
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); }
      else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300); await closeModals();
    }
    await sleep(150);
  }
  let g = await saved();
  check("Pickles is never waiting by the car in the morning", atLot === 0, `${atLot} of ${mornings} mornings`);
  check("the regulars on the map are the ones out today, where their sessions are", placed > 3 && !mismatched.length, `${placed} sessions; ${mismatched.slice(0, 3).join("; ")}`);
  check("the regulars who've arrived have records", !!g.world.reg && Object.keys(g.world.reg).length >= 3, Object.keys(g.world.reg || {}).join(","));

  // Walk up to a regular: the meeting is remembered.
  const who = await p.evaluate(() => { const x = [...document.querySelectorAll("g.person[data-who]")].find(e => e.dataset.who !== "n:pickles"); return x ? x.dataset.who : null; });
  if (who) {
    await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, who);
    for (let t = 0; t < 120 && !(await p.$(".npc")); t++) await sleep(250);
    g = await saved();
    const r = g.social && g.social.npc[who];
    check("walking up to a regular is remembered (G.social)", r && r.k.met >= 1 && r.last.met === g.date, `${who} ${JSON.stringify(r && r.k)}`);
  } else console.log("  (nobody out to walk up to)");

  // A save from before Phase 4: no regulars' records, no social record.
  g = await saved();
  const fas = w => JSON.stringify(Object.entries(w.est).map(([q, e]) => [q, e.by, e.date]));
  const est = fas(g.world), metN = Object.keys(g.know.met || {}).length;
  delete g.world.reg; delete g.social;
  await write(g);
  g = await saved();
  check("an older save gets the regulars' records and a social record on load", !!g.world.reg && !!g.social && Object.keys(g.social.npc).length >= metN, `${Object.keys(g.world.reg).length} regulars, ${Object.keys(g.social.npc).length} people`);
  check("…with no new first ascents, and none rewritten", fas(g.world) === est);
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
