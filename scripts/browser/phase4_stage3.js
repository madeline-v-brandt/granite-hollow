// Phase 4, Stage 3: beta. Ask a regular about a line you're working: someone who's
// climbed it tells you about the move you're stuck on (in their own words), once per
// person per line; someone who can't help tells you who can; a partner calls beta up
// from the pad; a problem's panel lists who knows it; the move strip marks the move;
// a Phase 3 save's single tip still counts; a bad save file's tips are dropped. (And,
// from play-testing: you can walk when rain's coming, or falling.)
//   node scripts/browser/phase4_stage3.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough, burnIfScene, GAME_DIR } = require("./lib");
const path = require("path");
global.Mech = require(GAME_DIR + "mechanics.js");
const World = require(GAME_DIR + "world.js");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
const D = require(GAME_DIR + "game-data.json");
D.problems.forEach((p, i) => { p.id = i; });
const CLIMB_WITH = ["n:hollis", "n:otis", "n:rowan", "n:bea", "n:dez", "n:gus"];
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
  const box = () => p.evaluate(() => { const t = document.querySelector("#talk-root:not([hidden]) .talk"); if (!t) return null;
    return { name: t.querySelector(".nm").childNodes[0].textContent, text: t.querySelector(".talk-say").innerText,
      choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()), next: !!t.querySelector("[data-next]") }; });
  const walkTo = async w => { await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
    for (let t = 0; t < 120 && !(await box()); t++) await sleep(200); };
  const choose = async label => { const ok = await p.evaluate(l => { const x = [...document.querySelectorAll(".talk .talk-choice")].find(x => x.innerText.replace(/^\d\s*/, "").trim() === l); if (!x) return false; x.click(); return true; }, label); await sleep(200); return ok; };
  // A new climber, resting until a regular who climbs is out and has climbed something.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  let who = null, g = null;
  for (let d = 0; d < 70 && !who; d++) {
    g = await saved();
    if (g.dayNo >= 14 && !g.day.over && !g.day.rainedOut) {
      const out = await p.evaluate(ids => [...document.querySelectorAll("g.person")].map(x => x.dataset.who).filter(w => ids.includes(w)), CLIMB_WITH);
      who = out.find(w => g.world.reg[w] && g.world.reg[w].sent.some(i => g.world.est[i])) || null;
    }
    if (who) break;
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); } else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300);
    }
    await closeModals(); await sleep(150);
  }
  check("found a regular out who has climbed something", !!who, who || "");
  if (!who) { console.log("page errors:", errs.join("\n") || "none"); await b.close(); process.exit(1); }
  g = await saved();
  // A line they've climbed (yours to project), and one they can't help with that another regular has climbed.
  const knows = (w, i) => World.knowsLine(D, g, w, i, g.date);
  const pr = g.world.reg[who].sent.find(i => g.world.est[i] && knows(who, i) && knows(who, i).knows === "sent");
  const others = World.REG.filter(w => w !== who && g.world.reg[w]);
  let q = null, other = null;
  for (const w of others) { q = g.world.reg[w].sent.find(i => i !== pr && g.world.est[i] && !knows(who, i)); if (q != null) { other = w; break; } }
  const know = (i, n) => { const bb = D.problems[i].b; g.know.areas[D.boulders[bb].sector] = Math.max(g.know.areas[D.boulders[bb].sector] || 0, 2); g.know.boulders[bb] = 2; g.ps[i] = { att: n, sent: false, flash: false, best: 0.4, beta: 0, sends: 0, log: [[g.date, n, 0.4, 0]] }; };
  know(pr, 4); if (q != null) know(q, 9);
  g.know.met = g.know.met || {};
  for (const w of [who, other].filter(Boolean)) g.know.met[w] = { n: 4, first: "2025-09-08", last: World.addDays(g.date, -1) };
  g.day.encounter = null; g.day.met = [];
  await write(g);
  const nameOf = i => D.problems[i].name;
  await walkTo(who); await talkThrough(p);
  let t = await box();
  check("asking about your project: a reply for each line of yours they can help with", t && t.choices.includes(`Any beta for ${nameOf(pr)}?`), t && t.choices.join(" | "));
  const before = (await saved()).ps[pr].beta;
  await choose(`Any beta for ${nameOf(pr)}?`);
  t = await box(); g = await saved();
  const tip = g.ps[pr].tips && g.ps[pr].tips[who];
  check("they tell you, in their own words, about a move", t && t.text.length > 20 && /move|crux|top-out|first move|drawing/i.test(t.text), t && t.text.slice(0, 160));
  check("…and it's what you know of the line now: one tip, from them, remembered", tip && g.ps[pr].beta > before && g.ps[pr].tipped, JSON.stringify(tip));
  check("…and they remember giving it", g.social.npc[who].k.beta >= 1);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s3-beta.png") });
  await talkThrough(p); t = await box();
  check("you can only ask once per line", t && !t.choices.includes(`Any beta for ${nameOf(pr)}?`), t && t.choices.join(" | "));
  if (q != null && t && t.choices.includes(`Any beta for ${nameOf(q)}?`)) {
    await choose(`Any beta for ${nameOf(q)}?`); t = await box();
    const nm = World.whoName(D, other).replace(/^Ranger /, "").split(" ")[0];
    check("someone who can't help tells you who can", t && t.text.includes(nm), t && t.text.slice(0, 160));
    g = await saved();
    check("…and that costs you nothing: no tip from them on it", !(g.ps[q].tips && g.ps[q].tips[who]));
  } else console.log(`  (no line for a pointer: ${t && t.choices.join(" | ")})`);
  await p.keyboard.press("Escape"); await sleep(200);
  // A partner calls beta up from the pad, once, on a line they know.
  g = await saved();
  const lines = g.world.reg[who].sent.filter(i => i !== pr && g.world.est[i] && knows(who, i) && knows(who, i).knows === "sent" && D.problems[i].grade >= 2);
  const r = lines[0];
  if (r != null) {
    const bb = D.problems[r].b;
    know(r, 2); g.ps[r].best = 0.2;
    g.loc = { sector: D.boulders[bb].sector, boulder: bb }; g.pos = null; g.day.climb = null; g.day.encounter = null;
    g.day.partner = { who, until: g.day.minute + 400, b: bb };
    g.player.energy = 100; g.player.skin = 100;
    await write(g);
    let called = false;
    for (let k = 0; k < 8 && !called; k++) {
      if (!(await p.$(".scene-root:not([hidden]) .sc"))) { await click(p, `[data-try='${r}']`) || await click(p, `[data-climb='${r}']`); await sleep(300); }
      await burnIfScene(p); await sleep(200);
      g = await saved();
      called = !!(g.ps[r].tips && g.ps[r].tips[who]);
      if (g.ps[r].sent) break;
    }
    const txt = await p.evaluate(() => (document.querySelector(".scene-root") || {}).innerText || "");
    check("a partner calls up beta from the pad on a line they know", called || g.ps[r].sent, called ? (txt.match(/calls up[^”]*”/) || [""])[0].slice(0, 140) : "sent it before they could");
    if (!(await click(p, ".scene-root [data-act='leave']"))) await p.keyboard.press("Escape"); await sleep(300);
    // The problem's panel: who knows it, and the move strip's mark.
    await p.evaluate(i => { const x = document.querySelector(`[data-expand='${i}']`); if (x) x.click(); }, r); await sleep(300);
    const panel = await p.evaluate(() => { const k = document.querySelector(".why.knowers"); return { k: k ? k.innerText : "", told: !!document.querySelector(".mv.told") }; });
    const first = World.whoName(D, who).replace(/^Ranger /, "").split(" ")[0];
    check("the problem's panel says who's climbed it, and who gave you beta", panel.k.includes(first) && /gave you beta/.test(panel.k), panel.k);
    check("the move strip marks the move they told you about", panel.told);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s3-panel.png") });
  } else console.log("  (no second line for the partner)");
  // A Phase 3 save: its single tip is one from someone unknown; you can still ask the regulars.
  g = await saved();
  g.day.partner = null; g.day.climb = null; g.day.encounter = null; g.day.met = [];
  delete g.ps[pr].tips; g.ps[pr].tipped = true;
  g.ps[pr].fx = [1, "x"];                                   // and a bad falls record
  if (q != null) g.ps[q].tips = { "n:nobody<script>": ["2025-01-01", 2, "alt"], [who]: ["bad", 1, "move"] };
  await write(g); g = await saved();
  check("a Phase 3 save's tip counts as one from someone unknown", g.ps[pr].tips && g.ps[pr].tips["?"] && !g.ps[pr].tips[who], JSON.stringify(g.ps[pr].tips));
  check("a bad save file's tips and falls are dropped", !g.ps[pr].fx && (q == null || !g.ps[q].tips));
  await walkTo(who); await talkThrough(p); t = await box();
  check("…and you can still ask the regulars about it", t && t.choices.includes(`Any beta for ${nameOf(pr)}?`), t && t.choices.join(" | "));
  // Nothing names a place you haven't found.
  const D2 = D, unknownAreas = D2.sectors.map(s => s.name).filter(s => !(g.know.areas || {})[s]);
  const said = await p.evaluate(() => document.querySelector("#talk-root").innerText + document.querySelector("#panel, main, body").innerText);
  check("nothing names an area you haven't found", !unknownAreas.some(a => said.includes(a)));
  // Rain on its way, or already falling: you can still walk (rain stops the climbing, not the day).
  for (const [label, offset] of [["rain on its way", 3], ["already raining", -5]]) {
    await p.keyboard.press("Escape"); await sleep(150);
    g = await saved();
    g.day.weather.rainAt = g.day.minute + offset; g.day.rainWarned = true; g.day.encounter = null; g.day.partner = null; g.day.climb = null;
    g.loc = { sector: "The Tailgate", boulder: null }; g.pos = null;
    await write(g);
    const from = (await saved()).loc.sector;
    const went = await click(p, "[data-go-sector]:not([disabled])"); await sleep(1500);
    const after = await saved();
    check(`you can walk to another area with ${label}`, went && after.loc.sector && after.loc.sector !== from, `${from} → ${after.loc.sector}`);
  }
  // On a phone.
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(400);
  const fit = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth <= 391 }));
  check("on a phone nothing scrolls sideways", fit.wide);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s3-phone.png") });
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
