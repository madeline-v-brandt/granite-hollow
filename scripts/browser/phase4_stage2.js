// Phase 4, Stage 2: conversations. Walking up to a regular opens a box over the
// map with their portrait; you click through what they say, pick replies (with
// the mouse or the number keys), and say bye; walking away or Esc ends it; you
// can go back and talk again; Pickles has his own; it fits a phone; and nothing
// in it names a place you haven't found.
//   node scripts/browser/phase4_stage2.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough, GAME_DIR } = require("./lib");
const path = require("path");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
const D = require(GAME_DIR + "game-data.json");
const CLIMB_WITH = ["n:gus", "n:hollis", "n:otis", "n:rowan", "n:bea", "n:dez"];
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
    return { name: t.querySelector(".nm").childNodes[0].textContent, text: t.querySelector(".talk-say").innerText, portrait: (t.querySelector(".talk-portrait svg") || {}).getAttribute?.("aria-label") || "",
      choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()), next: !!t.querySelector("[data-next]") }; });
  const walkTo = async w => { await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
    for (let t = 0; t < 120 && !(await box()); t++) await sleep(200); };
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  // Rest until a regular who climbs is out.
  let who = null;
  for (let d = 0; d < 40 && !who; d++) {
    const g = await saved();
    if (g.dayNo >= 6 && !g.day.over && !g.day.rainedOut) who = await p.evaluate(ids => { const x = [...document.querySelectorAll("g.person")].map(x => x.dataset.who).find(w => ids.includes(w)); return x || null; }, CLIMB_WITH);
    if (who) break;
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); } else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300);
    }
    await closeModals(); await sleep(150);
  }
  check("found a regular out", !!who, who || "");
  if (!who) { console.log("page errors:", errs.join("\n") || "none"); await b.close(); process.exit(1); }
  await walkTo(who);
  let t = await box();
  check("walking up to someone opens the conversation over the map, with their portrait", t && /, (neutral|happy|excited|thoughtful|frustrated|embarrassed)$/.test(t.portrait) && t.text.length > 5 && !/undefined|null/.test(t.text), t && `${t.name}: ${t.text.slice(0, 120)}`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s2-talk.png") });
  await talkThrough(p);
  t = await box();
  check("you click through what they say, then pick a reply", t && t.choices.length >= 3 && t.choices.includes("What are you working on?") && t.choices.includes("Bye!"), t && t.choices.join(" | "));
  // A reply by number key.
  const k = t.choices.indexOf("What are you working on?") + 1;
  await p.keyboard.press(String(k)); await sleep(200);
  t = await box();
  check("the number keys pick a reply, and they answer", t && t.text.length > 5 && !t.choices.includes("What are you working on?"), t && t.text.slice(0, 120));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s2-reply.png") });
  // Bye: a goodbye, then it closes.
  await talkThrough(p); await click(p, ".talk [data-bye]"); await sleep(200);
  t = await box();
  check("Bye: they say goodbye", t && t.next && t.text.length > 2, t && t.text);
  await click(p, ".talk [data-next]"); await sleep(200);
  check("…and the conversation closes", !(await box()));
  let g = await saved();
  const remembered = g.social && g.social.npc[who] && Object.keys(g.social.npc[who].said || {}).length;
  check("what they said is remembered (so they don't repeat it)", remembered >= 2, `${remembered} lines`);
  // Talk again: click them once more.
  await walkTo(who);
  t = await box();
  check("clicking someone you've already talked to today: they talk again", !!t, t && t.text.slice(0, 80));
  // Esc leaves.
  await p.keyboard.press("Escape"); await sleep(150);
  check("Esc leaves the conversation", !(await box()));
  // Walking away ends it.
  await walkTo(who); await p.evaluate(() => document.body.focus());
  for (const key of ["s", "a", "d", "w"]) {                // (a boulder can be in the way: try another direction)
    await p.keyboard.down(key); await sleep(2200); await p.keyboard.up(key); await sleep(500);
    if (!(await saved()).day.encounter) break;
  }
  g = await saved();
  check("walking away ends the conversation", !(await box()) && !g.day.encounter, `encounter ${g.day.encounter ? "still open" : "closed"}`);
  // Leaks: nothing in any of it names an area or boulder you haven't found.
  const unknownAreas = D.sectors.map(s => s.name).filter(s => !(g.know.areas || {})[s]);
  const unknownBoulders = D.boulders.filter((x, i) => !(g.know.boulders || {})[i]).map(x => x.name).filter(n => n.length > 5);
  const said = JSON.stringify(g.day.encounter || {}) + (await p.evaluate(() => document.querySelector("#talk-root").innerText));
  check("nothing names a place you haven't found", !unknownAreas.some(a => said.includes(a)) && !unknownBoulders.some(n => said.includes(n)));
  // Pickles.
  g = await saved();
  const dog = await p.evaluate(() => { const x = document.querySelector("g.person[data-who='n:pickles']"); return !!x; });
  if (dog) {
    await walkTo("n:pickles");
    t = await box();
    check("Pickles has his own conversation", t && t.name === "Pickles" && /Pickles, /.test(t.portrait), t && t.text.slice(0, 80));
    await talkThrough(p); t = await box();
    check("…pet him, throw his stick, or leave him to his nap", t && t.choices.includes("Pet him") && t.choices.includes("Throw his stick"), t && t.choices.join(" | "));
    await click(p, ".talk [data-pet]"); await sleep(200); t = await box();
    check("petting him", t && t.text.length > 5, t && t.text);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s2-pickles.png") });
    await p.keyboard.press("Escape"); await sleep(150);
  } else console.log("  (Pickles isn't around)");
  // On a phone.
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(400);
  await walkTo(who); await sleep(300);
  const fit = await p.evaluate(() => { const t = document.querySelector("#talk-root:not([hidden]) .talk"), m = document.querySelector("#mapwrap"); if (!t) return null; const a = t.getBoundingClientRect(), r = m.getBoundingClientRect();
    return { inside: a.left >= r.left - 1 && a.right <= r.right + 1, wide: document.documentElement.scrollWidth <= 391, h: Math.round(a.height), map: Math.round(r.height) }; });
  check("on a phone the box fits the map, and nothing scrolls sideways", fit && fit.inside && fit.wide, JSON.stringify(fit));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s2-phone.png") });
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
