// Granite Hollow: the Great Granite Hollow Clean-Up (after Phase 4), every Earth Day
// (April 22; World.EVENTS.cleanup). The snowmelt turns up a winter's litter all over the
// park; you and the regulars race to bag the most by dusk.
//
// Pure and testable in Node (node scripts/test_cleanup.js). game.js finds the open ground
// (spots), draws the litter (paint.js setTrash), picks up what you walk over and holds
// the results; this module scatters the litter, names it, and runs the regulars' race.
//
// The race: each regular starts from their home area and picks up the nearest piece that's
// still there, at their own pace (RACERS: pieces an hour, with a seeded wobble between them).
// Your pieces are never theirs: a piece you picked up was there when you got to it, so
// leaving it out of their choices from the start changes nothing they did before (they
// chose something nearer). So the state at any minute is worked out fresh from the
// pieces you've picked up and the clock, and never disagrees with what you saw.
(function (root) {
  "use strict";
  const N = 300;               // pieces of litter
  const SPACING = 8;           // metres apart at least
  const PICK = 2.5;            // game minutes to bag a piece (find it, grab it, check the next bush)
  const REACH = 2.6;           // you pick up anything within this of you
  const KINDS = [
    { k: "can", name: "A drinks can", w: 6 }, { k: "bottle", name: "A plastic bottle", w: 5 }, { k: "wrapper", name: "A snack wrapper", w: 6 },
    { k: "tape", name: "A ball of old finger tape", w: 3 }, { k: "cup", name: "A coffee cup", w: 3 }, { k: "bag", name: "A carrier bag", w: 2 },
  ];
  // Odd finds: one of each, with a word when you pick it up.
  const ODD = [
    { k: "shoe", name: "A single left climbing shoe", text: "A single left climbing shoe. Not the one in the lost-and-found box, either. There are more of them out there." },
    { k: "guide", name: "A page from an old guidebook", text: "A page from a 1980s guidebook, all water stains and hand-drawn arrows. Half the problems on it have different names now." },
    { k: "gnome", name: "A garden gnome", text: "A garden gnome, standing at the foot of a boulder with its arms out as if spotting. Nobody knows whose it is." },
    { k: "sock", name: "One sock", text: "One sock. Pickles looks at it with enormous interest." },
    { k: "frisbee", name: "A frisbee", text: "A frisbee, sun-faded to the colour of the rock. Pickles would like to discuss this frisbee." },
    { k: "brush", name: "A worn-out toothbrush", text: "A toothbrush worn down to stubs: somebody's old climbing brush, retired in the woods." },
  ];
  const KIND = Object.fromEntries([...KINDS, ...ODD].map(x => [x.k, x]));
  // The regulars in the race (Gus runs it; the Bishop supervises; Pickles “helps”). Pieces an
  // hour, tuned with scripts/test_cleanup.js: a day spent collecting wins, an hour or two is mid-table.
  const RACERS = [
    { who: "n:bea", rate: 5.1 }, { who: "n:ade", rate: 4.6, team: "Ade's gym group" }, { who: "n:juno", rate: 4.2, far: true },
    { who: "n:mags", rate: 3.9 }, { who: "n:dez", rate: 3.6 }, { who: "n:rowan", rate: 2.6 }, { who: "n:hollis", rate: 2.0 }, { who: "n:otis", rate: 1.5 },   // sketching; logging every piece in CragLog; sandwiches
  ];
  const PRIZE = "the Golden Grabber";

  function rng(seed) {
    let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Places litter could be: along the trails (a few metres off them), round the boulders and in
  // the woods between. trails: [[x, y], …] polylines; ok(p): open ground in the park.
  function spots(D, trails, ok, seed = "spots") {
    const r = rng(seed), out = [];
    for (const pts of trails || []) {
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]], L = dist(a, b), nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
        for (let s = r() * 14; s < L; s += 14) {
          const u = s / L, off = (1.5 + r() * 4) * (r() < .5 ? -1 : 1);
          out.push([a[0] + (b[0] - a[0]) * u + nx * off, a[1] + (b[1] - a[1]) * u + ny * off]);
        }
      }
    }
    for (const b of D.boulders) for (let k = 0; k < 2; k++) { const a = r() * Math.PI * 2, d = 7 + r() * 6; out.push([b.x + Math.cos(a) * d, b.y + Math.sin(a) * d]); }
    return out.filter(p => !ok || ok(p));
  }
  // The day's litter: N pieces from those places, spread out, the odd finds among them.
  function scatter(D, places, date) {
    const r = rng("litter|" + date), pool = places.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const got = [];
    for (const p of pool) { if (got.length >= N) break; if (got.every(q => dist(p, q) >= SPACING)) got.push(p); }
    const total = KINDS.reduce((a, k) => a + k.w, 0);
    return got.map((p, i) => {
      let k;
      if (i < ODD.length) k = ODD[i].k;
      else { let x = r() * total; k = KINDS.find(kk => (x -= kk.w) <= 0).k; }
      return { id: i, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10, k, area: nearestArea(D, p) };
    });
  }
  function nearestArea(D, p) { let best = null, bd = Infinity; for (const s of D.sectors) { const d = dist(p, [s.x, s.y]); if (d < bd) { bd = d; best = s.name; } } return best; }
  // Where a regular starts: their first home area (Juno: the furthest corner of theirs).
  function startOf(D, World, who, far) {
    const n = World.NAMED[who.slice(2)], homes = (n && n.home) || [];
    const sec = homes.map(h => D.sectors.find(s => s.name === h)).filter(Boolean);
    if (!sec.length) return [0, 0];
    const s = far ? sec.reduce((a, b) => (Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a)) : sec[0];
    return [s.x, s.y];
  }
  // The race up to `minute`: who has picked up what. racers: the RACERS taking part (in the park
  // today); mine: the ids you've picked up (all of them, whenever); hours: [start, end].
  // Returns { by: Map id → { who, t }, counts: { who: n }, last: { who: id } }.
  function race(D, World, items, racers, mine, minute, hours, date) {
    const mineSet = new Set(mine), by = new Map(), counts = {}, last = {}, pos = {};
    const left = new Set(items.filter(it => !mineSet.has(it.id)).map(it => it.id));
    const q = [];
    for (const R of racers) {
      counts[R.who] = 0; pos[R.who] = startOf(D, World, R.who, R.far);
      const r = rng(`race|${date}|${R.who}`);
      for (let t = hours[0] + (60 / R.rate) * (0.6 + 0.8 * r()); t <= Math.min(minute, hours[1]); t += (60 / R.rate) * (0.6 + 0.8 * r())) q.push([t, R.who]);
    }
    q.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    for (const [t, who] of q) {
      if (!left.size) break;
      let best = null, bd = Infinity;
      for (const id of left) { const d = dist(pos[who], [items[id].x, items[id].y]); if (d < bd) { bd = d; best = id; } }
      left.delete(best); by.set(best, { who, t }); counts[who]++; last[who] = best; pos[who] = [items[best].x, items[best].y];
    }
    return { by, counts, last, left: left.size };
  }
  // The standings: you and the racers, most first (you first in a tie).
  function standings(counts, yours) {
    const rows = Object.entries(counts).map(([who, n]) => ({ who, n }));
    rows.push({ who: "you", n: yours });
    rows.sort((a, b) => b.n - a.n || (a.who === "you" ? -1 : b.who === "you" ? 1 : 0));
    return rows;
  }
  const Cleanup = { N, SPACING, PICK, REACH, KINDS, ODD, KIND, RACERS, PRIZE, spots, scatter, race, standings, startOf, rng };
  if (typeof module !== "undefined") module.exports = Cleanup; else root.Cleanup = Cleanup;
})(typeof window !== "undefined" ? window : globalThis);
