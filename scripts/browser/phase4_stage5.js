// Phase 4, Stage 5: Pickles. He's only ever where he's drawn: napping at his rock;
// once he greets you, waiting by your car some mornings (and back to his rock after
// hello); once he follows you, trotting along behind you after a pet, until he heads
// home; once he's ready, he doesn't go home: he rides home with you and is your dog,
// with you all day after (Out today, the climbing scene, Your people). And the frame
// rate with him trotting along.
//   node scripts/browser/phase4_stage5.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough } = require("./lib");
const path = require("path");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
let fails = 0;
const check = (what, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
(async () => {
  const { b, p, errs, url } = await open();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const saved = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), SLOT);
  const closeModals = async () => { for (let k = 0; k < 6 && (await p.$(".modal [data-close], .modal [data-next]")); k++) { await click(p, ".modal [data-close]") || await click(p, ".modal [data-next]"); await sleep(150); } };
  const write = async g => {
    await p.goto(url.replace("index.html", "game-data.json")); await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem(k, s); }, SLOT, JSON.stringify(g));
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(500); await closeModals();
  };
  const box = () => p.evaluate(() => { const t = document.querySelector("#talk-root:not([hidden]) .talk"); if (!t) return null;
    return { text: t.querySelector(".talk-say").innerText, choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()) }; });
  const dogLayer = () => p.evaluate(() => { const l = document.querySelector(".dog-layer"); if (!l || l.getAttribute("display") === "none") return null; const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * .76 }; });
  const meAt = () => p.evaluate(() => { const r = document.querySelector(".me-layer:not(.dog-layer):not(.pal-layer):not(.me-ghost)").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * .74 }; });
  const atRock = () => p.evaluate(() => !!document.querySelector("g.person[data-who='n:pickles']"));
  const outToday = () => p.evaluate(() => { const li = [...document.querySelectorAll("#tabbody li")].find(x => /Pickles/.test(x.innerText)); return li ? li.innerText.replace(/\s+/g, " ") : ""; });
  const said = g => Object.keys(((g.social || {}).npc || {})["n:pickles"]?.said || {});
  // A new climber.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(400); await closeModals();
  let g = await saved();
  check("day one: Pickles is napping by his rock, and nowhere else", (await atRock()) && !(await dogLayer()) && !g.day.dog);
  // He greets you at the lot: some mornings, once he knows you well enough.
  const pets = (n, walks = 0) => { g.know.met = g.know.met || {}; g.know.met["n:pickles"] = { n, first: "2025-09-06", last: g.date, pets: n, petted: null };
    g.social = g.social || { v: 2, npc: {} }; g.social.v = 2; g.social.npc["n:pickles"] = { k: { met: n, pet: n, ...(walks ? { walk: walks } : {}) }, last: {}, m: [], said: {} }; };
  g = await saved(); pets(6); g.day.dog = { mode: "lot", until: g.day.minute + 45 }; g.day.met = []; g.day.encounter = null;
  await write(g);
  const lot = await dogLayer(), me = await meAt();
  check("greeting you at the lot: he's by your car, not at his rock", lot && !(await atRock()) && Math.hypot(lot.x - me.x, lot.y - me.y) < 120, lot && `${Math.round(Math.hypot(lot.x - me.x, lot.y - me.y))} px from you`);
  check("…and Out today says so", /Waiting by your car/.test(await outToday()), await outToday());
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s5-lot.png") });
  await click(p, "[data-find='n:pickles']"); for (let t = 0; t < 40 && !(await box()); t++) await sleep(150);
  g = await saved();
  check("you walk over, and he says hello where he is", said(g).some(id => /^pic\.l\./.test(id)), said(g).join(","));
  await click(p, ".talk [data-pet]"); await sleep(200); await click(p, ".talk [data-bye]"); await sleep(150); await click(p, ".talk [data-next]"); await sleep(400);
  for (let t = 0; t < 20 && (await saved()).day.dog.mode !== "rock"; t++) await sleep(200);
  g = await saved();
  check("after hello, he goes back to his rock", g.day.dog.mode === "rock" && (await atRock()) && !(await dogLayer()), g.day.dog.mode);
  // He follows you: after a pet, for an hour or two, then home.
  g = await saved(); pets(9); g.day.met = []; g.day.encounter = null; g.day.dog = { mode: "rock" };
  await write(g);
  await click(p, "[data-find='n:pickles']"); for (let t = 0; t < 60 && !(await box()); t++) await sleep(150);
  await talkThrough(p); await click(p, ".talk [data-pet]"); await sleep(300);
  let t = await box(); g = await saved();
  check("once he follows you: after a pet, he falls in behind you", g.day.dog && g.day.dog.mode === "follow" && said(g).some(id => /^pic\.f\./.test(id)), t && t.text.slice(0, 100));
  check("…and that's a walk together", g.social.npc["n:pickles"].k.walk === 1);
  await p.keyboard.press("Escape"); await sleep(200);
  // Walk somewhere: he keeps up.
  await p.evaluate(() => document.body.focus());
  // The frame rate while he trots along behind.
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]); await sleep(200);
  await p.evaluate(() => { window.__ft = []; let last = performance.now(); const f = n => { window.__ft.push(n - last); last = n; if (window.__ft.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (const k of ["d", "w"]) { await p.keyboard.down(k); await sleep(1600); await p.keyboard.up(k); }
  await sleep(900);
  const ft = await p.evaluate(() => window.__ft.slice(5));
  const fps = 1000 / (ft.reduce((a, c) => a + c, 0) / ft.length);
  const near = await dogLayer(), me2 = await meAt();
  check("walking, he keeps up behind you", near && Math.hypot(near.x - me2.x, near.y - me2.y) < 90, near && `${Math.round(Math.hypot(near.x - me2.x, near.y - me2.y))} px away`);
  console.log(`  frame rate walking with Pickles: ${fps.toFixed(1)} fps`);
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s5-follow.png") });
  check("…and Out today says he's with you", /Following you around/.test(await outToday()), await outToday());
  // Clicking him says hello right there.
  await p.evaluate(() => { const h = document.querySelector(".dog-layer .dog-hit"); h.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await sleep(300);
  t = await box();
  check("clicking him: a hello right where you are, and Good boy", t && t.choices.includes("Good boy"), t && t.choices.join(" | "));
  await p.keyboard.press("Escape"); await sleep(150);
  // Time's up: home he goes (he isn't ready to adopt you yet).
  g = await saved(); g.day.dog.until = g.day.minute; await write(g);
  await click(p, "#act-rest") || await click(p, "[data-rest]"); await sleep(600);
  for (let k = 0; k < 20 && (await saved()).day.dog.mode !== "rock"; k++) await sleep(200);
  g = await saved();
  check("when he's had enough, he trots home to his rock", g.day.dog.mode === "rock" && g.day.dog.wentHome && (await atRock()), JSON.stringify(g.day.dog));
  // Ready: he doesn't go home, and at the end of the day he rides home with you.
  g = await saved(); pets(14, 3); g.day.dog = { mode: "follow", until: g.day.minute, followed: true }; g.day.encounter = null;
  await write(g);
  await click(p, "#act-rest") || await click(p, "[data-rest]"); await sleep(600);
  g = await saved();
  check("once he's ready, he doesn't go home", g.day.dog.mode === "with" && g.day.dog.adopting, JSON.stringify(g.day.dog));
  await click(p, "#act-home"); await sleep(600);
  const adopt = await p.evaluate(() => { const m = document.querySelector(".modal"); return m ? m.innerText : ""; });
  check("…and at the car, he decides you're his human", /Pickles has decided you're his human/.test(adopt), adopt.slice(0, 120));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s5-adopt.png") });
  g = await saved();
  check("…for good", g.dog && g.dog.adopted === g.date && /back seat/.test(g.day.reason), g.day.reason);
  await closeModals();
  // The next day: he's with you from the car.
  for (let k = 0; k < 4 && (await saved()).day.over; k++) { await click(p, ".modal [data-next]"); await sleep(400); await closeModals(); await click(p, "#act-skip"); await sleep(400); }
  g = await saved();
  if (g.day.over) { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(400); await closeModals(); g = await saved(); }
  check("next morning, your dog is with you", !g.day.over && g.day.dog && g.day.dog.mode === "with" && !!(await dogLayer()) && !(await atRock()), JSON.stringify(g.day.dog));
  check("…Out today: your dog, right here", /Your dog/.test(await outToday()), await outToday());
  // The climbing scene: curled up by your pad.
  { const D = require(require("./lib").GAME_DIR + "game-data.json"); const bo = { id: D.boulders.findIndex(x => x.name === "The Billboard") };
    await click(p, `[data-go-boulder='${bo.id}']`); for (let k = 0; k < 30 && !(await p.$("[data-try]:not([disabled])")); k++) await sleep(200); }
  await p.evaluate(() => { const x = document.querySelector("[data-try]:not([disabled])"); if (x) x.click(); }); await sleep(900);
  const inScene = await p.evaluate(() => !!document.querySelector(".scene-root:not([hidden]) .sc-dog .sc-dog-curl"));
  if (SHOTS && inScene) await p.screenshot({ path: path.join(SHOTS, "p4s5-scene.png") });
  check("in the climbing scene, he's curled up beside your pad", inScene);
  await p.keyboard.press("Escape"); await sleep(300);
  // Your people.
  await click(p, "[data-tab='climber']"); await sleep(300);
  const ppl = await p.evaluate(() => (document.querySelector(".your-people") || {}).innerText || "");
  check("Your people: Pickles, your dog", /Pickles\s*Your dog/.test(ppl), ppl.replace(/\s+/g, " ").slice(-120));
  // A bad save file's Pickles is dropped.
  g = await saved(); g.dog = { adopted: "<b>" }; g.day.dog = { mode: "teleporting", until: "x" };
  await write(g); g = await saved();
  check("a bad Pickles record in a save file is dropped", !g.dog && (!g.day.dog || ["rock", "lot", "follow", "home", "with"].includes(g.day.dog.mode)), JSON.stringify([g.dog, g.day.dog]));
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
