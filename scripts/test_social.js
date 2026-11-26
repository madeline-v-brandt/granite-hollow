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
console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
