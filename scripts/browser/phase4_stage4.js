// Phase 4, Stage 4: friendship. Time together deepens a friendship (you're told, and
// they say so); after a long gap they say it's been a while; a friend leaves a note
// on your windscreen, it's in the Here tab, they greet you for coming, and you climb
// together for the rest of their session; Your people (the Climber tab) shows who
// you know, in words; a save from before keeps its friendships; it all fits a phone.
//   node scripts/browser/phase4_stage4.js            (screenshots to $SHOTS, if set)
const { open, ready, click, sleep, talkThrough, GAME_DIR } = require("./lib");
const path = require("path");
const World = require(GAME_DIR + "world.js");
const SLOT = "granite-hollow-save-v1";
const SHOTS = process.env.SHOTS || null;
const D = require(GAME_DIR + "game-data.json");
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
    return { text: t.querySelector(".talk-say").innerText, sub: t.querySelector(".nm small").innerText, choices: [...t.querySelectorAll(".talk-choice")].map(x => x.innerText.replace(/^\d\s*/, "").trim()) }; });
  const walkTo = async w => { await p.evaluate(w => { const el = document.querySelector(`g.person[data-who='${w}'] path`) || document.querySelector(`g.person[data-who='${w}']`); if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, w);
    for (let t = 0; t < 120 && !(await box()); t++) await sleep(200); };
  const toasts = () => p.evaluate(() => [...document.querySelectorAll("#toasts .toast, #toasts > *")].map(x => x.innerText).join(" | "));
  const skipDay = async () => {
    if (!(await click(p, "#act-skip"))) {
      if (!(await saved()).day.over) { await click(p, "#act-home"); await sleep(200); } else { await p.reload({ waitUntil: "load" }); await ready(p); await sleep(300); }
      await click(p, ".modal [data-next]"); await sleep(300);
    }
    await closeModals(); await sleep(150);
  };
  // A new climber, resting until a regular who climbs is out now.
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("[data-str]");
  await p.evaluate(() => { const s = () => document.querySelectorAll("[data-str]"); s()[1].click(); s()[4].click(); document.querySelector("#cc-go").click(); });
  await ready(p); await sleep(300); await closeModals();
  let who = null, g;
  for (let d = 0; d < 60 && !who; d++) {
    g = await saved();
    if (g.dayNo >= 10 && !g.day.over && !g.day.rainedOut) who = await p.evaluate(ids => [...document.querySelectorAll("g.person")].map(x => x.dataset.who).find(w => ids.includes(w)) || null, CLIMB_WITH);
    if (!who) await skipDay();
  }
  check("found a regular out", !!who, who || "");
  if (!who) { console.log("page errors:", errs.join("\n") || "none"); await b.close(); process.exit(1); }
  const first = World.whoName(D, who).replace(/^Ranger /, "").split(" ")[0];
  // Nearly friends: a chat today will do it. Last talked 40 days ago.
  g = await saved();
  g.know.met = g.know.met || {}; g.know.met[who] = { n: 12, first: "2025-09-08", last: World.addDays(g.date, -40) };
  g.social = { v: 2, npc: { [who]: { k: { met: 19 }, last: {}, m: [], said: {} } } };     // 19: meeting (1) and a chat (2) make friends (22)
  g.day.met = []; g.day.encounter = null;
  await write(g);
  await walkTo(who);
  let t = await box(); g = await saved();
  const said = Object.keys(g.social.npc[who].said || {});
  check("after a long gap, they say it's been a while", said.some(id => /\.h\.gap$/.test(id)), `${said.join(", ")} · ${t && t.text.slice(0, 100)}`);
  await talkThrough(p); t = await box();
  check("…and you can sit and chat", t && t.choices.some(c => /Sit and chat/.test(c)), t && t.choices.join(" | "));
  await p.evaluate(() => { const x = [...document.querySelectorAll(".talk .talk-choice")].find(x => /Sit and chat/.test(x.innerText)); if (x) x.click(); }); await sleep(300);
  g = await saved();
  const told = g.feed.map(f => f.text).find(x => new RegExp(`${first} are friends now`).test(x));
  check("time together deepens a friendship, and you're told", !!told, told || g.feed.slice(0, 4).map(f => f.text).join(" | "));
  let lines = []; for (let k = 0; k < 6; k++) { const x = await box(); if (!x) break; lines.push(x.text); if (!(await click(p, ".talk [data-next]"))) break; await sleep(120); }
  g = await saved();
  check("…and they say so, there and then", Object.keys(g.social.npc[who].said).some(id => /\.c\.friends$/.test(id)) && !g.social.npc[who].up, lines.join(" / ").slice(0, 240));
  t = await box();
  check("…and the box says you're friends", t && /friends/i.test(t.sub), t && t.sub);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s4-friends.png") });
  await p.keyboard.press("Escape"); await sleep(200);
  // Your people.
  await click(p, "[data-tab='climber']"); await sleep(300);
  const people = String(await p.evaluate(() => { const ul = document.querySelector(".your-people"); return ul ? ul.innerText : document.querySelector("#tabbody").innerText.slice(0, 300); }));
  check("Your people: who you know, in words, and what they value", people.includes(first) && /Friends/.test(people) && /notices|loves|glad|lights up|respects|likes/.test(people), people.replace(/\s+/g, " ").slice(0, 200));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s4-people.png") });
  await click(p, "[data-tab='here']"); await sleep(200);
  // An invitation: a note on the windscreen, in the Here tab; they greet you; you climb together for the rest of their session.
  g = await saved();
  const out = (g.world.reg[who].recent.find(s => s.d === g.date) || {});
  const hrs = World.ROUTINES[who.slice(2)](g.date).t;
  g.day.invite = { who, b: out.b, from: hrs[0], to: Math.min(hrs[1], g.day.weather.dusk), text: "I'll be about all day. Come and climb? —test" };
  g.day.met = []; g.day.encounter = null; g.day.partner = null;
  g.know.areas[D.boulders[out.b].sector] = Math.max(2, g.know.areas[D.boulders[out.b].sector] || 0);
  await write(g);
  const card = await p.evaluate(() => { const h = [...document.querySelectorAll("#tabbody h3")].find(x => /windscreen/i.test(x.innerText)); return h ? h.nextElementSibling.innerText : ""; });
  check("a friend's note is in the Here tab, with Find", /Come and climb/.test(card) && /Find/.test(card), card.replace(/\s+/g, " "));
  await walkTo(who); await sleep(300); g = await saved();
  check("…they greet you for coming", Object.keys(g.social.npc[who].said).some(id => /\.i\.1$/.test(id)) && g.day.invite.met, `${(await box() || {}).text} · said ${Object.keys(g.social.npc[who].said).join(",")} · invite ${JSON.stringify(g.day.invite)}`);
  await talkThrough(p);
  await p.evaluate(() => { const x = document.querySelector(".talk [data-together]"); if (x) x.click(); }); await sleep(300);
  g = await saved();
  check("…and climbing together lasts the rest of their session", g.day.partner && g.day.partner.who === who && g.day.partner.until >= Math.min(g.day.invite.to, g.day.weather.dusk) - 1, JSON.stringify(g.day.partner));
  await p.keyboard.press("Escape"); await sleep(200);
  // Invitations come by themselves to good friends who are out (most mornings, one in a few).
  g = await saved();
  g.social = g.social || { v: 2, npc: {} };
  for (const w of CLIMB_WITH) { g.know.met[w] = g.know.met[w] || { n: 30, first: "2025-09-08", last: g.date }; g.social.npc[w] = { k: { met: 40, climb: 25 }, last: {}, m: [], said: {} }; }
  for (const s of D.sectors) g.know.areas[s.name] = Math.max(1, g.know.areas[s.name] || 0);
  g.day.partner = null; await write(g);
  let note = null;
  for (let d = 0; d < 25 && !note; d++) { await skipDay(); g = await saved(); if (g.day.invite) note = g.day.invite; }
  check("good friends leave notes now and then, by themselves", !!note, note ? `${note.who}: ${note.text}` : "none in 25 days");
  if (note) { const intro = g.day.last && g.day.last.text || ""; check("…mentioned when the day starts", /windscreen/.test(intro), intro.slice(-160)); }
  // A save from before Stage 4 keeps its friendships.
  g = await saved();
  g.social = { v: 1, npc: { [who]: { k: { met: 10, chat: 8 }, last: {}, m: [] } } };       // friends under the old tiers (26), not the new
  await write(g); g = await saved();
  await click(p, "[data-tab='climber']"); await sleep(300);
  const ppl = await p.evaluate(() => (document.querySelector(".your-people") || {}).innerText || "");
  check("a save from before keeps the friendships it had", /Friends/.test(ppl) && g.social.v === 2, ppl.replace(/\s+/g, " ").slice(0, 120));
  // A bad invitation in a save file is dropped.
  g.day.invite = { who: "n:pickles", b: -4, from: "x", to: 1, text: 7 }; g.lastInvite = { who: "<b>", date: 3 }; g.lvlOn = { 5: "nope", 6: g.date };
  await write(g); g = await saved();
  check("a bad note from a save file is dropped", !g.day.invite && !g.lastInvite && JSON.stringify(g.lvlOn) === JSON.stringify({ 6: g.date }));
  // Fits: the desktop window, and a phone.
  const fit = await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
  check("the game fits the window", fit);
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(400);
  check("on a phone, Your people doesn't scroll sideways", await p.evaluate(() => document.documentElement.scrollWidth <= 391));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "p4s4-phone.png"), fullPage: true });
  console.log("page errors:", errs.length ? errs.join("\n") : "none");
  console.log(fails ? `${fails} FAILED` : "all passed");
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
