// The Great Granite Hollow Clean-Up (after Phase 4): the litter, the race, and the tuning.
//   node scripts/test_cleanup.js           (--show prints the standings for each effort)
// A simulated player collects greedily (nearest piece still there) from the lot, walking
// at about the game's pace, for a given number of hours, against the regulars.
const path = require("path");
const G_DIR = path.join(__dirname, "../site/game/");
const Cleanup = require(G_DIR + "cleanup.js");
const World = require(G_DIR + "world.js");
const D = require(G_DIR + "game-data.json");
const SHOW = process.argv.includes("--show");
let fails = 0, n = 0;
const check = (what, ok, extra = "") => { n++; if (!ok) fails++; console.log(`${ok ? "  ok  " : "  FAIL"} ${what}${extra ? " · " + extra : ""}`); };

const ev = World.eventOn("2026-04-22");
check("the Clean-Up is on Earth Day, April 22, every year", ev && ev.key === "cleanup" && World.eventOn("2027-04-22").key === "cleanup" && World.eventOn("2025-04-22") === null);
const trails = D.trails.map(t => [t.start, t.end]);
const places = Cleanup.spots(D, trails, null, "t");
const items = Cleanup.scatter(D, places, "2026-04-22");
check(`${Cleanup.N} pieces, spread out, the odd finds among them, all named`, items.length === Cleanup.N && items.every((a, i) => items.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= Cleanup.SPACING - 0.05)) && Cleanup.ODD.every(o => items.some(it => it.k === o.k)) && items.every(it => Cleanup.KIND[it.k] && it.area));
check("the same day scatters the same litter", JSON.stringify(Cleanup.scatter(D, places, "2026-04-22")) === JSON.stringify(items));
check("…and another year's is different", JSON.stringify(Cleanup.scatter(D, places, "2027-04-22")) !== JSON.stringify(items));
check("litter turns up all over the park, not only by the lot", new Set(items.map(it => it.area)).size >= 10, `${new Set(items.map(it => it.area)).size} areas`);

const racers = Cleanup.RACERS, hours = ev.hours, date = "2026-04-22";
const idle = Cleanup.race(D, World, items, racers, [], hours[1], hours, date);
check("left alone, the regulars clear most of the park by dusk", idle.left <= Cleanup.N * 0.25, `${Cleanup.N - idle.left} of ${Cleanup.N}`);
// The state at any minute never takes back a piece you saw: a piece the regulars took stays theirs as you pick up others.
const mid = Cleanup.race(D, World, items, racers, [], 720, hours, date);
const later = Cleanup.race(D, World, items, racers, items.filter(it => !mid.by.has(it.id)).slice(0, 10).map(it => it.id), 720, hours, date);
check("picking up a piece that's still there never changes what the regulars had already taken", [...mid.by.keys()].every(id => later.by.has(id) && later.by.get(id).who === mid.by.get(id).who));

// Effort: a greedy player from the lot, collecting for so many hours from 9:30.
function play(hoursSpent) {
  const SPEED = 33, mine = [];
  let t = 570, pos = [0, 0];
  const stopAt = Math.min(hours[1], 570 + hoursSpent * 60);
  while (t < stopAt) {
    const st = Cleanup.race(D, World, items, racers, mine, t, hours, date);
    let best = null, bd = Infinity;
    for (const it of items) { if (mine.includes(it.id) || st.by.has(it.id)) continue; const d = Math.hypot(it.x - pos[0], it.y - pos[1]); if (d < bd) { bd = d; best = it; } }
    if (!best) break;
    const arrive = t + bd / SPEED;
    if (arrive > stopAt) break;
    const at = Cleanup.race(D, World, items, racers, mine, arrive, hours, date);
    t = arrive; pos = [best.x, best.y];
    if (at.by.has(best.id)) continue;          // somebody beat you to it
    mine.push(best.id); t += Cleanup.PICK;
  }
  const end = Cleanup.race(D, World, items, racers, mine, hours[1], hours, date);
  const rows = Cleanup.standings(end.counts, mine.length);
  return { n: mine.length, place: rows.findIndex(r => r.who === "you") + 1, of: rows.length, rows };
}
const res = {};
for (const h of [0, 1, 2, 4, 6, 10.5]) { res[h] = play(h); if (SHOW) console.log(`     ${h} h: ${res[h].n} pieces, ${res[h].place} of ${res[h].of} · ${res[h].rows.slice(0, 4).map(r => `${r.who.replace("n:", "")} ${r.n}`).join(", ")}`); }
check("a whole day collecting wins the Golden Grabber", res[10.5].place === 1, `${res[10.5].n} pieces`);
check("four hours or so: on the podium, or close", res[4].place <= 4, `${res[4].place} of ${res[4].of}`);
check("an hour: mid-table; two: in the running but not the winner (for a perfect route; real ones are slower)", res[1].place > 3 && res[1].place < res[1].of && res[2].place > 1, `1 h ${res[1].place}, 2 h ${res[2].place} of ${res[2].of}`);
check("not taking part: last, with nothing", res[0].n === 0 && res[0].place === res[0].of);
const winner = idle.counts, top = Object.entries(winner).sort((a, b) => b[1] - a[1])[0];
check("the regulars' winner bags a believable haul (25–70)", top[1] >= 25 && top[1] <= 70, `${top[0]} ${top[1]}`);

console.log(fails ? `${fails} of ${n} FAILED` : `${n} passed`);
process.exit(fails ? 1 : 0);
