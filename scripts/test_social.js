// Tests for Phase 4, Stage 0: you and the regulars (social.js), in Node.
//   node scripts/test_social.js
const path = require("path");
const Social = require(path.join(__dirname, "..", "site", "game", "social.js"));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || "assertion failed"); };
const clone = x => JSON.parse(JSON.stringify(x));
const save = () => ({ v: 2, date: "2025-10-10", know: { met: {} }, ticks: [] });

test("a save from before Phase 4 starts from what it already records", () => {
  const g = save();
  g.know.met = { "n:bea": { n: 6, first: "2025-09-20", last: "2025-10-08", chats: 2 }, "n:pickles": { n: 9, first: "2025-09-06", last: "2025-10-09", pets: 9, petted: "2025-10-09" } };
  g.ticks = [{ p: 12, date: "2025-10-01", with: "n:rowan" }, { p: 14, date: "2025-10-01", with: "n:rowan" }, { p: 20, date: "2025-10-05", with: "n:rowan" }, { p: 3, date: "2025-10-02" }];
  Social.ensure(g, 1000);
  const bea = g.social.npc["n:bea"], rowan = g.social.npc["n:rowan"];
  assert(bea.k.met === 6 && bea.k.chat === 2, JSON.stringify(bea));
  assert(g.social.npc["n:pickles"].k.pet === 9, "pets");
  assert(rowan.k.climb === 2 && rowan.k.sendWith === 2, "two days together: " + JSON.stringify(rowan.k));
  assert(rowan.m.length === 3 && rowan.m[0][2] === 20, "the sends are remembered, newest first");
});
test("a moment counts once a day per kind, but each distinct one is remembered", () => {
  const g = save(); Social.ensure(g);
  assert(Social.moment(g, "n:otis", "chat", "2025-10-10") === true);
  assert(Social.moment(g, "n:otis", "chat", "2025-10-10") === false, "twice in a day counts once");
  Social.moment(g, "n:otis", "beta", "2025-10-10", 5); Social.moment(g, "n:otis", "beta", "2025-10-10", 6);
  const o = g.social.npc["n:otis"];
  assert(o.k.chat === 1 && o.k.beta === 1, JSON.stringify(o.k));
  assert(Social.remembers(g, "n:otis", "beta").length === 2, "both lines remembered");
  Social.moment(g, "n:otis", "chat", "2025-10-11");
  assert(o.k.chat === 2, "a new day counts");
});
test("talking every day for weeks can't be farmed into a friendship in a day", () => {
  const g = save(); Social.ensure(g);
  for (let k = 0; k < 50; k++) { Social.moment(g, "n:dez", "met", "2025-10-10"); Social.moment(g, "n:dez", "chat", "2025-10-10"); }
  assert(Social.tier(g, "n:dez").key === "met", "one day is one day");
  const days = Array.from({ length: 30 }, (_, i) => `2025-11-${String(i + 1).padStart(2, "0")}`);
  for (const d of days) { Social.moment(g, "n:dez", "met", d); Social.moment(g, "n:dez", "chat", d); }
  assert(["friends", "good"].includes(Social.tier(g, "n:dez").key), "a month of talking makes friends: " + Social.tier(g, "n:dez").key);
});
test("friendship never goes down, and climbing together counts for most", () => {
  const g = save(); Social.ensure(g);
  Social.moment(g, "n:bea", "climb", "2025-10-01"); const b1 = Social.bond(g, "n:bea");
  Social.moment(g, "n:bea", "met", "2026-03-01"); assert(Social.bond(g, "n:bea") > b1, "only up");
  assert(Social.KINDS.climb > Social.KINDS.met && Social.KINDS.sendWith > Social.KINDS.chat);
});
test("memory is bounded", () => {
  const g = save(); Social.ensure(g);
  for (let k = 0; k < 200; k++) Social.moment(g, "n:hollis", "beta", "2025-10-10", k);
  assert(g.social.npc["n:hollis"].m.length === Social.MEMORY);
});
test("a bad social record from a save file is cleaned, not trusted", () => {
  const g = save();
  g.social = { v: 1, npc: { "n:bea": { k: { met: 3, chat: -4, hax: 9 }, last: { met: "nope" }, m: [["2025-10-01", "met", null], ["x", "met", null], ["2025-10-01", "evil", null], ["2025-10-01", "beta", 99999]] }, "c12": { k: {} }, "<b>": {} } };
  Social.ensure(g, 1000);
  assert(Object.keys(g.social.npc).join() === "n:bea", Object.keys(g.social.npc).join());
  const b = g.social.npc["n:bea"];
  assert(b.k.met === 3 && !("chat" in b.k) && !("hax" in b.k) && !b.last.met && b.m.length === 1, JSON.stringify(b));
});
test("old-rules saves and strangers have no social record", () => {
  const g = { v: 1 }; assert(Social.ensure(g) === null && !Social.moment(g, "n:bea", "met", "2025-10-10"));
  const h = save(); assert(!Social.moment(h, "c12", "met", "2025-10-10"), "only the regulars");
  assert(Social.tier(h, "n:gus") === null, "someone you've never met");
});
test("a new climber gets a record with their first moment", () => {
  const g = save(); assert(!g.social);
  assert(Social.moment(g, "n:gus", "met", "2025-09-06") && g.social.npc["n:gus"].k.met === 1);
});
// ---- Stage 4: friendship
const days = (n, from = "2025-10-01") => { const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
test("each regular especially values their own thing, and it's worth nothing to anyone else", () => {
  const g = save(); Social.ensure(g);
  Social.moment(g, "n:gus", "brush", "2025-10-01"); Social.moment(g, "n:bea", "brush", "2025-10-01");
  assert(Social.bond(g, "n:gus") > 0 && Social.bond(g, "n:bea") === 0, `${Social.bond(g, "n:gus")} ${Social.bond(g, "n:bea")}`);
  for (const [w, l] of Object.entries(Social.LIKES)) assert(l.words && Object.keys(l.kinds).every(k => k in Social.KINDS), w);
});
test("a friendship deepens step by step: you're told once, and they mention it once", () => {
  const g = save(); Social.ensure(g);
  const ups = [];
  for (let n = 0; n < 80; n++) { const u = Social.befriend(g, "n:otis", "climb", days(n)); if (u) ups.push(u.key); const v = Social.befriend(g, "n:otis", "met", days(n)); if (v) ups.push(v.key); }
  assert(ups.join() === "know,friends,good", ups.join());
  assert(g.social.npc["n:otis"].up.key === "good");
  Social.heard(g, "n:otis"); assert(!g.social.npc["n:otis"].up);
  assert(Social.befriend(g, "n:otis", "chat", days(90)) === null, "nothing past good friends");
});
test("talking ten times in a day is one day of talking (nothing to farm)", () => {
  const g = save(); Social.ensure(g);
  for (let k = 0; k < 10; k++) Social.befriend(g, "n:dez", "chat", "2025-10-01");
  assert(Social.bond(g, "n:dez") === Social.KINDS.chat);
});
test("a save from before Stage 4 keeps the friendships it had (they never go down)", () => {
  const g = save();
  g.social = { v: 1, npc: { "n:bea": { k: { met: 10, chat: 8 }, last: {}, m: [] }, "n:hollis": { k: { met: 5 }, last: {}, m: [] } } };   // bond 26 and 5
  const keep = Social.TIERS.map(t => t.at); Social.TIERS[2].at = 30;      // (as if today's tiers were higher than the old ones)
  Social.ensure(g);
  assert(Social.tier(g, "n:bea").key === "friends", `Bea: ${Social.tier(g, "n:bea").key} (bond ${Social.bond(g, "n:bea")})`);
  assert(Social.tier(g, "n:hollis").key === "met", "Hollis wasn't a friend before either");
  assert(g.social.v === 2);
  Social.ensure(g); assert(Social.tier(g, "n:bea").key === "friends", "and it stays");
  Social.TIERS.forEach((t, i) => { t.at = keep[i]; });
  const h = save(); Social.moment(h, "n:bea", "chat", "2025-10-01"); Social.ensure(h);
  assert(!h.social.npc["n:bea"].best, "a new climber is on today's tiers");
});
test("what you've shared, from the moments", () => {
  const g = save(); Social.ensure(g);
  Social.moment(g, "n:rowan", "climb", "2025-10-01"); Social.moment(g, "n:rowan", "sendWith", "2025-10-01", 4); Social.moment(g, "n:rowan", "met", "2025-10-02");
  const sh = Social.shared(g, "n:rowan");
  assert(sh.climbs === 1 && sh.sends === 1 && sh.met === 1 && sh.chats === 0, JSON.stringify(sh));
});
test("a bad deepening or best tier from a save file is dropped", () => {
  const g = save();
  g.social = { v: 2, npc: { "n:bea": { k: { met: 2 }, last: {}, m: [], up: { key: "<b>", date: "x" }, best: "emperor" } } };
  Social.ensure(g);
  assert(!g.social.npc["n:bea"].up && !g.social.npc["n:bea"].best);
});
// ---- Stage 5: Pickles
test("Pickles: knows you, then greets you, then follows you, then (once he's ready) is yours", () => {
  const g = save(); Social.ensure(g);
  const st = () => Social.dog(g);
  assert(st().key === "new");
  const D0 = Social.DOG;
  for (let n = 0; n < D0.adopt; n++) Social.moment(g, "n:pickles", "pet", days(n));
  assert(st().key === "follows" && !st().ready, "not before he's walked with you");
  for (let n = 0; n < D0.walks; n++) Social.moment(g, "n:pickles", "walk", days(n));
  assert(st().ready, "ready");
  g.dog = { adopted: "2025-11-01" };
  assert(st().key === "yours" && st().n === 4 && !st().ready && st().adopted === "2025-11-01");
  const h = save(); Social.ensure(h);
  for (let n = 0; n < 3; n++) Social.moment(h, "n:pickles", "pet", "2025-10-01");
  assert(Social.dog(h).pets === 1, "a pet a day, at most");
  assert(Social.bond(h, "n:otis") === 0 && Social.KINDS.walk === 0, "walks are his alone");
});
test("Pickles: an old save's pets count", () => {
  const g = save(); g.know.met = { "n:pickles": { n: 12, first: "2025-09-06", last: "2025-10-20", pets: 10, petted: "2025-10-20" } }; delete g.social;
  Social.ensure(g);
  assert(Social.dog(g).key === "follows", Social.dog(g).key);
});
// ---- Rowan (Stage 6) ----
const addD = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// A save where you and Rowan are friends (tier 2) as of `date`.
function friendsWithRowan(date = "2025-10-10") {
  const g = save(); g.date = date; Social.ensure(g);
  for (let k = 1; k <= 12; k++) { Social.moment(g, "n:rowan", "met", addD(date, -k)); Social.moment(g, "n:rowan", "chat", addD(date, -k)); }
  return g;
}
test("Rowan: nothing unless you flirt; then a little flirting, sweet on each other, ready for the sunset", () => {
  const g = friendsWithRowan();
  assert(Social.tier(g, "n:rowan").n >= 2, "friends");
  assert(Social.romance(g).n === 0 && Social.romance(g).words === null, "no romance unless you want one");
  assert(Social.canFlirt(g), "you can say something playful");
  Social.flirt(g, g.date);
  assert(Social.romance(g).n === 1 && Social.romance(g).key === "spark" && g.romance.since === g.date, JSON.stringify(Social.romance(g)));
  assert(!Social.canFlirt(g), "once a day");
  let d = g.date;
  for (let k = 0; k < 3; k++) { d = addD(d, 2); g.date = d; Social.flirt(g, d); }
  assert(Social.romance(g).n === 2 && Social.romance(g).words === "Sweet on each other", "four days of flirting, and friends: sweet");
  for (let k = 0; k < 6; k++) { d = addD(d, 2); g.date = d; Social.flirt(g, d); }
  assert(Social.romance(g).n === 2, "ten flirts, but you haven't climbed together enough yet");
  for (let k = 1; k <= 5; k++) Social.moment(g, "n:rowan", "climb", addD(d, -k));
  assert(Social.romance(g).n === 2, "and it's not five weeks since the first: " + Social.romance(g).n);
  d = addD(g.romance.since, Social.ROMANCE.days); g.date = d; Social.flirt(g, d);
  const r = Social.romance(g);
  assert(r.n === 3 && r.canAsk, "ready: Rowan will ask you to stay for the sunset " + JSON.stringify(r));
  Social.asked(g, d);
  assert(!Social.romance(g).canAsk, "asked: not again for a fortnight");
  g.date = addD(d, Social.ROMANCE.again);
  assert(Social.romance(g).canAsk, "two weeks later, again");
});
test("Rowan: the sunset: say how you feel and you're together; just watch it twice and you're friends", () => {
  const ready = () => { const g = friendsWithRowan("2025-09-10"); let d = g.date; for (let k = 0; k < 10; k++) { Social.flirt(g, d); d = addD(d, 4); g.date = d; } for (let k = 1; k <= 5; k++) Social.moment(g, "n:rowan", "climb", addD(d, -k)); Social.flirt(g, d); return g; };
  const a = ready(); assert(Social.romance(a).n === 3, "ready " + JSON.stringify(Social.romance(a)));
  Social.asked(a, a.date); const r = Social.sunset(a, a.date, true);
  assert(r.n === 4 && r.key === "together" && a.romance.together === a.date && r.words === "Together", JSON.stringify(r));
  a.date = addD(a.date, 90);
  assert(Social.romance(a).n === 4 && Social.romance(a).days === 90, "together for good (no cooling off)");
  const b = ready(); Social.asked(b, b.date); Social.sunset(b, b.date, false);
  assert(Social.romance(b).n === 3 && Social.romance(b).declined === 1, "once: Rowan will ask again");
  b.date = addD(b.date, 14); Social.flirt(b, b.date); Social.asked(b, b.date); Social.sunset(b, b.date, false);
  const f = Social.romance(b);
  assert(f.n === 0 && f.key === "friends" && f.words === null, "twice: just friends " + JSON.stringify(f));
  assert(Social.tier(b, "n:rowan").n >= 2, "and still friends: friendship never goes down");
  b.date = addD(b.date, 5); assert(!Social.canFlirt(b), "no flirting for a month after");
  b.date = addD(b.date, 30); assert(Social.canFlirt(b), "then, if you want, it can start again");
  Social.flirt(b, b.date);
  const s = Social.romance(b); assert(s.n === 1 && s.flirts === 1 && !b.romance.friends && b.romance.since === b.date, "from the beginning " + JSON.stringify([s, b.romance]));
});
test("Rowan: a month without flirting and it cools back to friendship (until you pick it up again)", () => {
  const g = friendsWithRowan(); let d = g.date;
  for (let k = 0; k < 5; k++) { g.date = d; Social.flirt(g, d); d = addD(d, 2); }
  g.date = addD(d, 10); assert(Social.romance(g).n === 2, "sweet");
  g.date = addD(d, Social.ROMANCE.cool + 2);
  const r = Social.romance(g); assert(r.n === 0 && r.key === "cooled" && r.was === 2, JSON.stringify(r));
  Social.flirt(g, g.date); assert(Social.romance(g).n === 2, "picked up where it left off");
});
test("Rowan: only Rowan; a bad romance record in a save file is cleaned", () => {
  const g = friendsWithRowan(); for (let k = 1; k <= 12; k++) { Social.moment(g, "n:bea", "met", addD(g.date, -k)); Social.moment(g, "n:bea", "chat", addD(g.date, -k)); }
  Social.flirt(g, g.date);
  assert(!g.social.npc["n:bea"].k.flirt && g.social.npc["n:rowan"].k.flirt === 1, "flirting is with Rowan alone");
  assert(Social.cleanRomance({ together: "<b>", since: "2025-01-01", asked: ["x", "2025-02-02"], declined: -3, base: 2.7 }) && JSON.stringify(Social.cleanRomance({ together: "<b>", since: "2025-01-01", asked: ["x", "2025-02-02"], declined: -3, base: 2.7 })) === JSON.stringify({ since: "2025-01-01", base: 2, asked: ["2025-02-02"] }));
  assert(Social.cleanRomance("yes") === null && Social.cleanRomance({}) === null && Social.cleanRomance([1]) === null);
  assert(JSON.stringify(Social.cleanRomance({ together: "2025-11-01", friends: "2025-10-01" })) === JSON.stringify({ together: "2025-11-01" }), "together wins");
  const h = save(); assert(Social.romance(h).n === 0 && !Social.canFlirt(h), "a new climber: nothing, and nobody to flirt with");
});
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
