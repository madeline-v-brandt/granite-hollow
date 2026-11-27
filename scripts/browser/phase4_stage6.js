// Phase 4, Stage 6: Rowan. Nothing romantic unless you choose it: once you know each
// other, a conversation with Rowan offers something playful; when it's sweet, Rowan flirts
// back (a pink box, and you're told in words); when it's ready, late on a dry day, Rowan
// asks you to stay for the sunset, where you can say how you feel (together) or just watch
// it. Together: Your people says so, Rowan's lines and the playful replies are affection,
// and partners walk you to your car. A reload mid-sunset picks it up again; a bad save is
// cleaned; it fits a phone.
//   node scripts/browser/phase4_stage6.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough, GAME_DIR } = require("./lib");
const path = require("path");
const World = require(GAME_DIR + "world.js");
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
    await p.goto(url, { waitUntil: "load" }); await ready(p); await sleep(400);
  };
  const box = () => p.evaluate(() => { const t = document.querySelector("#talk-root:not([hidden]) .talk"); if (!t) return null;
    return { text: t.querySelector(".talk-say").innerText, sweet: t.classList.contains("sweet"), choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()) }; });
  const walkTo = async w => { await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
    for (let t = 0; t < 120 && !(await box()); t++) await sleep(200); };
  const choose = re => p.evaluate(src => { const lab = x => x.innerText.replace(/^\d\s*/, "").trim(), x = [...document.querySelectorAll(".talk .talk-choice")].find(x => new RegExp(src).test(lab(x))); if (x) { x.click(); return lab(x); } return null; }, re.source);
  const toastsText = () => p.evaluate(() => [...document.querySelectorAll("#toasts > *")].map(x => x.innerText).join(" | "));
  const said = g => Object.keys(((g.social || {}).npc || {})["n:rowan"]?.said || {});
  const skipDay = async () => {
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); } else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300);
    }
    await closeModals(); await sleep(150);
  };
  // Rowan's out today, until dusk (a long day, and dry).
  const rowanLate = g => !g.day.over && !g.day.rainedOut && !g.day.weather.pop && World.sessionOn(g, "n:rowan", g.date) && World.ROUTINES.rowan(g.date).t[1] >= g.day.weather.dusk && g.dayNo >= 4;
  // Rowan, known for a month: friends, and as far along as `k` says (days of flirting, climbing together).
  const setRowan = (g, k, romance) => {
    g.know.met = g.know.met || {}; g.know.met["n:rowan"] = { n: 14, first: World.addDays(g.date, -45), last: World.addDays(g.date, -1), chats: 12 };
    g.social = g.social || { v: 2, npc: {} }; g.social.v = 2;
    g.social.npc["n:rowan"] = { k: { met: 14, chat: 12, ...k }, last: { met: World.addDays(g.date, -1), ...(k.flirt ? { flirt: World.addDays(g.date, -1) } : {}) }, m: [], said: {} };
    if (romance) g.romance = romance; else delete g.romance;
    g.day.met = []; g.day.encounter = null; g.day.partner = null; delete g.day.sunset; delete g.day.invite;
  };
  // A new climber, resting until Rowan's out until dusk.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  let g = await saved();
  for (let d = 0; d < 60 && !rowanLate(g); d++) { await skipDay(); g = await saved(); }
  check("found a day when Rowan's out until dusk", rowanLate(g), g.date);
  if (!rowanLate(g)) { console.log("page errors:", errs.join("\n") || "none"); await b.close(); process.exit(1); }
  const base = JSON.parse(JSON.stringify(g)), dusk = g.day.weather.dusk;
  const from = World.ROUTINES.rowan(g.date).t[0];
  const at = m => { const x = JSON.parse(JSON.stringify(base)); x.day.minute = Math.max(m, from + 10); return x; };

  // 1. Friends, never flirted: the friendship path, with something playful on offer (and nothing sweet).
  g = at(from + 20); setRowan(g, {}); await write(g); await closeModals();
  await walkTo("n:rowan"); await talkThrough(p);
  let t = await box(); g = await saved();
  const playful = t && t.choices.find(c => /^“|^Warm Rowan/.test(c));
  check("friends, never flirted: no sweet hellos, but something playful on offer", t && !t.sweet && !!playful && !said(g).some(id => /^row\.h\.(sw|us)/.test(id)), t && t.choices.join(" | "));
  // Say it.
  await choose(/^“|^Warm Rowan/); await sleep(300);
  t = await box(); g = await saved();
  check("…Rowan takes it well, a bit flustered (a pink box)", t && t.sweet && g.romance && g.romance.since === g.date && g.social.npc["n:rowan"].k.flirt === 1, t && t.text.slice(0, 120));
  check("…and it's in your journal, in words", g.feed.some(f => /said something playful to Rowan/.test(f.text)));
  await talkThrough(p); t = await box();
  check("…once a day: it's not on offer again today", t && !t.choices.some(c => c === playful), t && t.choices.join(" | "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-playful.png") });
  await p.keyboard.press("Escape"); await sleep(200);

  // 2. Three days of flirting: the fourth makes you sweet on each other.
  g = at(from + 20); setRowan(g, { flirt: 3 }, { since: World.addDays(base.date, -12) }); await write(g); await closeModals();
  await walkTo("n:rowan"); await talkThrough(p);
  await choose(/^“|^Warm Rowan/); await sleep(300);
  g = await saved();
  check("sweet on each other: you're told, in words", g.feed.some(f => /sweet on each other/.test(f.text)) && /hanging around your projects on purpose/.test(await toastsText()), await toastsText());
  await p.keyboard.press("Escape"); await sleep(200);
  await click(p, "[data-tab='climber']"); await sleep(300);
  let people = await p.evaluate(() => (document.querySelector(".your-people") || {}).innerText || "");
  check("Your people: Rowan, sweet on each other", /Rowan[\s\S]*Sweet on each other/.test(people), people.replace(/\s+/g, " ").slice(0, 160));
  await click(p, "[data-tab='here']"); await sleep(200);

  // 3. Ready: late on a dry day, Rowan asks you to stay for the sunset.
  g = at(dusk - 150); setRowan(g, { flirt: 11, climb: 6 }, { since: World.addDays(base.date, -42) }); await write(g); await closeModals();
  await walkTo("n:rowan");
  g = await saved();
  t = await box();
  let all = []; for (let k = 0; k < 6; k++) { const x = await box(); if (!x) break; all.push(x.text); if (!(await click(p, ".talk [data-next]"))) break; await sleep(120); }
  t = await box(); g = await saved();
  check("ready: Rowan asks you to stay for the sunset", said(g).some(id => /^row\.u\.ask/.test(id)) && g.day.sunset === "asked" && (g.romance.asked || []).includes(g.date), all.join(" / ").slice(0, 200));
  check("…and you can say yes, or not tonight", t && t.choices.includes("Watch the sunset with Rowan") && t.choices.includes("Not tonight"), t && t.choices.join(" | "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-ask.png") });
  await choose(/^Watch the sunset/); await sleep(500);
  let modal = await p.evaluate(() => { const m = document.querySelector(".modal"); return m ? { text: m.innerText, art: !!m.querySelector(".sunset svg"), btns: [...m.querySelectorAll("button")].map(x => x.innerText) } : null; });
  check("the sunset: a scene of its own", modal && modal.art && /whole valley goes pink/.test(modal.text) && modal.btns.includes("Tell Rowan how you feel") && modal.btns.includes("Just watch the sunset"), modal && modal.btns.join(" | "));
  // A reload mid-sunset picks it up again.
  await p.reload({ waitUntil: "load" }); await ready(p); await sleep(500);
  modal = await p.evaluate(() => { const m = document.querySelector(".modal"); return m ? { art: !!m.querySelector(".sunset svg"), btns: [...m.querySelectorAll("button")].map(x => x.innerText) } : null; });
  check("…a reload mid-sunset picks it up again", modal && modal.art && modal.btns.includes("Tell Rowan how you feel"), modal && modal.btns.join(" | "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-sunset.png") });
  await click(p, ".modal [data-tell]"); await sleep(400);
  g = await saved();
  modal = await p.evaluate(() => { const m = document.querySelector(".modal"); return m ? { text: m.innerText, sweet: m.classList.contains("sweet"), hearts: !!m.querySelector(".sunset.hearts") } : null; });
  check("tell Rowan how you feel: together", g.romance.together === g.date && g.day.sunset === "told" && modal && modal.hearts && /hoping you'd say that/.test(modal.text), JSON.stringify(g.romance));
  check("…in your journal, and a toast", g.feed.some(f => /You and Rowan are together/.test(f.text)) && /You and Rowan are together/.test(await toastsText()));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-together.png") });
  await click(p, ".modal [data-close]"); await sleep(500);
  g = await saved();
  modal = await p.evaluate(() => (document.querySelector(".modal") || {}).innerText || "");
  check("…and the day ends: you walked out together", g.day.over && /sunset with Rowan/.test(g.day.reason) && /sunset with Rowan/.test(modal), g.day.reason);
  const together = await saved();

  // 4. Together: Your people, Rowan's hello, affection rather than flirting, and climbing together.
  g = JSON.parse(JSON.stringify(at(from + 20))); g.social = together.social; g.romance = together.romance; g.know.met = together.know.met; g.feed = together.feed;
  g.date = base.date; g.day.met = []; g.day.encounter = null; g.social.npc["n:rowan"].said = {};
  g.romance.together = World.addDays(base.date, -2);
  await write(g); await closeModals();
  await click(p, "[data-tab='climber']"); await sleep(300);
  people = await p.evaluate(() => (document.querySelector(".your-people") || {}).innerText || "");
  check("Your people: Rowan, together, since when", /Rowan[\s\S]*Together[\s\S]*together since/.test(people), people.replace(/\s+/g, " ").slice(0, 200));
  await click(p, "[data-tab='here']"); await sleep(200);
  const outRow = await p.evaluate(() => { const li = [...document.querySelectorAll("#tabbody li")].find(x => /Rowan/.test(x.innerText)); return li ? li.innerHTML : ""; });
  check("…Out today: a little heart by Rowan's name", /ro-heart/.test(outRow));
  await walkTo("n:rowan");
  g = await saved();
  check("…Rowan's hello, the morning after the sunset", said(g).some(id => /^row\.h\.(after|us\d)$/.test(id)), said(g).join(", "));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-us.png") });
  await talkThrough(p); t = await box();
  const US = ["Give Rowan a hug", "“I missed you.”", "Steal Rowan's pencil", "Sit with Rowan for a bit", "“Can I see what you drew today?”", "“I'll spot you on your project.”", "“I'm so proud of you.”"];
  check("…and affection, not flirting", t && t.choices.some(c => US.includes(c)), t && t.choices.join(" | "));
  await choose(/^Give Rowan|^“I missed|^Steal|^Sit with Rowan|^“Can I see|^“I'll spot|^“I'm so proud/); await sleep(300);
  t = await box(); g = await saved();
  check("…which Rowan returns (and the romance doesn't move: you're together)", t && t.sweet && g.romance.together, t && t.text.slice(0, 100));
  await talkThrough(p);
  const tog = await choose(/^Climb together/); await sleep(300);
  t = await box();
  check("…climbing together, the way Rowan says it now", !tog || (t && /good sandwiches|all day/.test(t.text)), t && t.text.slice(0, 120));
  await p.keyboard.press("Escape"); await sleep(200);
  if (tog) { await click(p, "#act-home"); await sleep(500); g = await saved(); check("…and Rowan walks you to your car", /Rowan walks you to your car/.test(g.day.reason), g.day.reason); }

  // 5. Just watching the sunset (twice): friends, and Rowan stops asking.
  g = at(dusk - 150); setRowan(g, { flirt: 11, climb: 6 }, { since: World.addDays(base.date, -42), declined: 1, asked: [World.addDays(base.date, -20)] }); await write(g); await closeModals();
  await walkTo("n:rowan"); await talkThrough(p);
  await choose(/^Watch the sunset/); await sleep(400);
  await click(p, ".modal [data-watch]"); await sleep(300);
  g = await saved();
  modal = await p.evaluate(() => (document.querySelector(".modal") || {}).innerText || "");
  check("just watch it (the second time): good friends, and that's lovely", g.romance.friends === g.date && !g.romance.together && /glad we're friends/.test(modal), JSON.stringify(g.romance));
  await click(p, ".modal [data-close]"); await sleep(400); await closeModals();
  // Not tonight.
  g = at(dusk - 150); setRowan(g, { flirt: 11, climb: 6 }, { since: World.addDays(base.date, -42) }); await write(g); await closeModals();
  await walkTo("n:rowan"); await talkThrough(p);
  await choose(/^Not tonight/); await sleep(300);
  t = await box(); g = await saved();
  check("“not tonight”: Rowan's fine with it, and the day goes on", g.day.sunset === "no" && !g.day.over && t && !t.choices.includes("Watch the sunset with Rowan"), t && t.text.slice(0, 100));
  await p.keyboard.press("Escape"); await sleep(200);

  // 6. A phone.
  await p.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  g = at(dusk - 150); setRowan(g, { flirt: 11, climb: 6 }, { since: World.addDays(base.date, -42) }); await write(g); await closeModals();
  await walkTo("n:rowan"); await talkThrough(p); await choose(/^Watch the sunset/); await sleep(500);
  const fit = await p.evaluate(() => { const m = document.querySelector(".modal"), r = m && m.getBoundingClientRect(), a = m && m.querySelector(".sunset svg").getBoundingClientRect();
    return m ? { w: r.width, left: r.left, right: r.right, art: a.width, vw: innerWidth, scroll: document.documentElement.scrollWidth } : null; });
  check("on a phone, the sunset fits", fit && fit.left >= 0 && fit.right <= fit.vw + 1 && fit.art > 200 && fit.scroll <= fit.vw + 1, JSON.stringify(fit));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s6-phone.png") });
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  // 7. A bad romance in a save file is cleaned.
  g = at(from + 20); setRowan(g, {}, { together: "<b>", asked: "x", declined: -2, since: "2025-09-10" }); g.day.sunset = "dancing";
  await write(g); await closeModals(); g = await saved();
  check("a bad romance record in a save file is cleaned", JSON.stringify(g.romance) === JSON.stringify({ since: "2025-09-10" }) && g.day.sunset === undefined, JSON.stringify([g.romance, g.day.sunset]));

  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
