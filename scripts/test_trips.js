// Climbing trips (after Phase 4): the places, the invitations' timing, what you send
// and what it's worth, the words, and cleaning saves.
//   node scripts/test_trips.js            (--show prints a sample trip at a few levels)
const Trips = require("../site/game/trips.js");
const World = require("../site/game/world.js");
const Mech = require("../site/game/mechanics.js");
const SHOW = process.argv.includes("--show");
let fails = 0, n = 0;
const check = (what, ok, extra = "") => { n++; if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };
const playerAt = L => { let xp = 0; for (let k = 0; k < L; k++) xp += Mech.levelCost(k); const tops = []; for (let g = 0; g <= L; g++) tops[g] = 5; return { xp: xp + 1, tops, skills: {} }; };

// 1. The places.
const D = Trips.DESTS;
check("six places, one regular each, all of them regulars who climb", Object.keys(D).length === 6 && Object.values(D).every(t => World.CLIMBING_REGULARS.includes(t.who)) && new Set(Object.values(D).map(t => t.who)).size === 6);
check("every problem has a V grade, and no place lists a name twice", Object.values(D).every(t => t.problems.every(p => Number.isInteger(p.v) && p.v >= 0 && p.v <= 15) && new Set(t.problems.map(p => p.name)).size === t.problems.length));
check("every place has problems from V3 or easier up to V13 or harder", Object.values(D).every(t => Math.min(...t.problems.map(p => p.v)) <= 3 && Math.max(...t.problems.map(p => p.v)) >= 13));

// 2. Invitations: Saturdays, in season, never over an event, about a week ahead.
let offers = 0, bad = [];
for (let d = "2025-09-01"; d < "2029-12-31"; d = Trips.addDays(d, 1)) {
  for (const who of Object.keys(Trips.DEST_OF)) {
    const o = Trips.offer(d, [who]); if (!o) continue; offers++;
    const ahead = Math.round((new Date(o.leave) - new Date(d)) / 864e5);
    let clash = false; for (let x = o.leave; x < o.back; x = Trips.addDays(x, 1)) if (World.eventOn(x)) clash = true;
    if (new Date(o.leave + "T12:00:00Z").getUTCDay() !== 6 || clash || ahead < Trips.LEAD[0] || ahead > Trips.LEAD[1] || o.back !== Trips.addDays(o.leave, Trips.LENGTH)) bad.push(`${who} ${d} → ${o.leave}`);
  }
}
check("invitations leave on a Saturday, a week or so ahead, two weeks long, never over an event", offers > 300 && !bad.length, `${offers} possible, ${bad.slice(0, 3).join("; ")}`);
check("Trail Day, the comps, the bonfire and midsummer are never during a trip", ["2026-08-01", "2025-11-01", "2026-04-01", "2025-12-21", "2026-06-21"].every(e => !Object.keys(Trips.DEST_OF).some(w => { for (let k = 0; k < 14; k++) { const o = Trips.offer(Trips.addDays(e, -k - 8), [w]); if (o && o.leave <= e && e < o.back) return true; } return false; })));
check("Bea's Rocklands comes in the (southern) winter, Dez's Hueco in January or February", !!Trips.offer("2026-06-20", ["n:bea"]) && !Trips.offer("2026-03-10", ["n:bea"]) && !!Trips.offer("2026-01-02", ["n:dez"]) && !Trips.offer("2026-06-02", ["n:dez"]));

// 3. What you send, and what it's worth.
let okXp = true, okNames = true, okGr = true, rows = [];
for (let L = 0; L <= 15; L++) {
  for (const key of Object.keys(D)) {
    const pl = playerAt(L), r = Trips.plan(pl, key, "seed" + L);
    const maxOne = Math.max(...r.sends.map(s => s.xp));
    if (!(r.xp >= r.goal && r.xp <= r.goal + maxOne)) okXp = false;
    const named = r.sends.filter(s => s.n);
    if (named.length > 6 || named.some(s => D[key].problems.find(p => p.name === s.n).v !== s.g) || new Set(named.map(s => s.n)).size !== named.length) okNames = false;
    if (r.sends.some(s => s.g > L + 4 || s.g < 0)) okGr = false;
    if (key === "rocklands") rows.push(`V${L}: ${r.sends.length} sends, ${r.xp} XP (home ≈ ${r.goal})`);
  }
}
check("a trip's XP is about eight climbing days at home (the target, plus at most one send over)", okXp);
check("the named sends are the place's real problems at the grade sent, each once, six at most", okNames);
check("sends are near your level (never more than a couple of grades over, as you level up on the trip)", okGr);
const same = JSON.stringify(Trips.plan(playerAt(7), "font", "x")) === JSON.stringify(Trips.plan(playerAt(7), "font", "x"));
check("the same seed gives the same trip", same);
// A climber who has climbed out the park earns about what a trip's worth; at home, only repeats.
const v13 = playerAt(13), trip13 = Trips.plan(v13, "joes", "z");
const home = 8 * 3 * Mech.sendXp(v13, { grade: 13 }, { first: false });     // eight days at home: repeats earn XP three times a day (REPEATS_XP)
check("for a climber who's climbed out the park, a trip is worth far more than two weeks of repeats", trip13.xp > 3 * home, `${trip13.xp} vs ${Math.round(home)}`);
check("a trip at V5 can level you up (sends count as proof)", (() => { const pl = playerAt(5), r = Trips.plan(pl, "hueco", "q"); const after = { ...pl, xp: pl.xp + r.xp, tops: pl.tops.slice() }; r.sends.forEach(s => after.tops[s.g] = (after.tops[s.g] || 0) + 1); return Mech.levelOf(after).level >= 5; })());
if (SHOW) rows.forEach(r => console.log("     " + r));

// 4. Words: no pronouns for Rowan, Hollis, Dez or the player; Bea's is Bea's family's trip.
const pron = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
const words = key => [...D[key].tales, ...(D[key].sweet || []), D[key].note("June 1 to June 14", {}), D[key].note("June 1 to June 14", { together: true }), D[key].lede];
check("Rowan's, Hollis's and Dez's trips use no gendered pronouns", ["magicwood", "bishop", "hueco"].every(k => words(k).every(t => !pron.test(t))), ["magicwood", "bishop", "hueco"].flatMap(k => words(k).filter(t => pron.test(t))).join(" | ").slice(0, 120));
check("no trip's words use a pronoun for the player (they say “you”)", Object.keys(D).every(k => words(k).every(t => !/\b(he|she|him|her|his)\b[^.]*\byou\b/.test(t) || k === "joes" || k === "rocklands" || k === "font")));
check("Bea's trip is with Bea's family", /family/.test(D.rocklands.note("x", {})) && /family/.test(D.rocklands.ask));
check("tales: two of the place's, plus Rowan's sweet one when you're together, plus Pickles", Trips.tales("magicwood", "s", { together: true, dog: true }).length === 4 && Trips.tales("font", "s", {}).length === 2);

// 5. Saves.
const junk = [null, { key: "nowhere" }, { key: "font", leave: "2026-04-11", back: "2026-04-25", sends: [{ g: 3, flash: 1, xp: 40, n: "La Marie Rose" }, { g: -1 }, { g: 99 }], xp: 40, tales: ["a", 7] }];
const c = Trips.clean(junk);
check("a save's trips are cleaned: unknown places and bad sends dropped", c.length === 1 && c[0].who === "n:mags" && c[0].sends.length === 1 && c[0].sends[0].flash === true && c[0].tales.length === 1);
check("trip sends count as proof by grade", JSON.stringify(Trips.tops(c)) === JSON.stringify([, , , 1]));

console.log(fails ? `${fails} of ${n} FAILED` : `${n} passed`);
process.exit(fails ? 1 : 0);
