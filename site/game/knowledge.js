// Granite Hollow: what the player knows (Phase 2). Every screen asks this layer
// for names, grades and lists instead of reading the problem roster (D) or the
// world's history (G.world) directly, so nothing the player hasn't found can
// leak. Pure, no DOM; tested in Node (scripts/test_world.js).
//
// States, from the player's side:
//   area / boulder   0 unknown, 1 known (where it is), 2 visited
//   line             "hidden"  not identified, and not a problem you can see
//                    "open"    identified but unclimbed: an open project. Shows
//                              how it feels, never a grade or a name.
//                    "est"     established, and on a boulder you know (or a line
//                              you were told about): name, grade, first ascent.
//
// A v1 save (the old rules, the whole crag documented) runs in "everything
// known" mode: every query answers as the game always has.
(function (root) {
  "use strict";
  const World = root.World || (typeof require !== "undefined" ? require("./world.js") : null);
  const Mech = root.Mech || (typeof require !== "undefined" ? require("./mechanics.js") : null);

  // "Unclimbed crimpy slab (sit)": what an open line is called until someone climbs it.
  const SHAPE = [["traverse", "traverse"], ["highball", "highball"], ["dyno", "dyno"], ["roof", "roof"], ["overhang", "steep line"],
    ["compression", "squeeze"], ["slab", "slab"], ["mantle", "mantle"], ["eliminate", "eliminate"]];
  const HOLDS = [["crimpy", "crimpy"], ["slopey", "slopey"], ["pinchy", "pinchy"], ["juggy", "juggy"], ["technical", "technical"], ["powerful", "powerful"]];

  function make(D, getG) {
    const tagsOf = p => p.tags.split("|").filter(Boolean);
    const baseLabel = p => {
      const ts = tagsOf(p), shape = (SHAPE.find(([t]) => ts.includes(t)) || [, "line"])[1];
      const holds = (HOLDS.find(([t]) => ts.includes(t) && t !== shape) || [, ""])[1];
      return `Unclimbed ${holds ? holds + " " : ""}${shape}${p.sit ? " (sit)" : ""}`;
    };
    // Lettered A, B… where one boulder has two lines that would read the same.
    const openLabels = new Map();
    for (const b of D.boulders) {
      const groups = new Map();
      for (const i of [...b.problems].sort((x, y) => x - y)) { const l = baseLabel(D.problems[i]); if (!groups.has(l)) groups.set(l, []); groups.get(l).push(i); }
      for (const [l, ids] of groups) ids.forEach((i, n) => openLabels.set(i, ids.length > 1 ? `${l} ${String.fromCharCode(65 + n)}` : l));
    }

    const G = () => getG();
    const v2 = () => { const g = G(); return !!(g && g.v === 2 && g.know && g.world); };
    const all = () => !v2();
    const est = p => (v2() ? G().world.est[p] || null : null);
    const area = s => (all() || s == null ? 2 : G().know.areas[s] || 0);
    const boulder = b => (all() ? 2 : G().know.boulders[b] || 0);
    function line(p) {
      if (all()) return "est";
      const k = G().know, e = G().world.est[p];
      if (e && (k.lines[p] || (k.boulders[D.problems[p].b] || 0) >= 1)) return "est";
      return k.lines[p] ? "open" : "hidden";
    }
    const visible = p => line(p) !== "hidden";
    function name(p) {
      const s = line(p);
      if (s === "est") { const e = est(p); return (e && e.name) || D.problems[p].name; }
      return s === "open" ? openLabels.get(p) : null;
    }
    const grade = p => (line(p) === "est" ? (est(p) ? est(p).grade : D.problems[p].grade) : null);
    const boulderName = b => (boulder(b) >= 1 ? D.boulders[b].name : null);
    // Stars, ratings and how often it's been climbed. Under the old rules, the
    // data's own; under the new ones, what has happened in this save's world.
    function stats(p) {
      const pr = D.problems[p];
      if (all()) return { stars: pr.stars, ratings: pr.ratings, sends: pr.sends };
      const e = est(p);
      if (!e || line(p) !== "est") return { stars: null, ratings: 0, sends: 0 };
      return { stars: e.rn ? e.rs / e.rn : null, ratings: e.rn, sends: e.reps + (e.old ? 0 : 1) };
    }
    const knownBoulders = s => D.boulders.map((b, i) => i).filter(i => D.boulders[i].sector === s && boulder(i) >= 1);
    const linesOn = b => D.boulders[b].problems.filter(visible);
    const guidebook = () => D.problems.map((p, i) => i).filter(i => line(i) === "est");
    const sentHere = ids => ids.filter(i => G().ps[i] && G().ps[i].sent).length;
    function boulderStats(b) {
      const ids = linesOn(b), shown = ids.filter(i => line(i) === "est"), gs = shown.map(grade);
      return { lines: ids.length, n: shown.length, open: ids.length - shown.length, lo: gs.length ? Math.min(...gs) : null, hi: gs.length ? Math.max(...gs) : null, sent: sentHere(ids) };
    }
    function areaStats(s) {
      const bs = knownBoulders(s), ids = bs.flatMap(linesOn), shown = ids.filter(i => line(i) === "est"), gs = shown.map(grade);
      return { boulders: bs.length, lines: ids.length, n: shown.length, open: ids.length - shown.length, lo: gs.length ? Math.min(...gs) : null, hi: gs.length ? Math.max(...gs) : null, sent: sentHere(ids) };
    }
    const canGo = to => (to.boulder != null ? boulder(to.boulder) >= 1 : area(to.sector) >= 1);
    const canSpot = p => !!(Mech && Mech.canSpot(G().player, D.problems[p]));

    // ---- what the map may show
    function mapView() {
      if (all()) return null;
      const sectors = {}, boulders = {};
      for (const s of D.sectors) {
        const st = area(s.name);
        if (!st) { sectors[s.name] = { show: false }; continue; }
        const a = areaStats(s.name);
        sectors[s.name] = { show: true, sub: a.n ? `V${a.lo}–V${a.hi} · ${s.walk_min} min walk` : `${s.walk_min} min walk` };
      }
      D.boulders.forEach((b, i) => { boulders[i] = boulder(i) >= 1 ? b.name : null; });
      return { sectors, boulders };
    }

    // ---- learning things (no-ops under the old rules). Each returns what's new.
    const k = () => G().know;
    function knowArea(s, level) { if (all() || s == null) return false; const was = k().areas[s] || 0; if (was >= level) return false; k().areas[s] = level; return was === 0; }
    function knowBoulder(b, level) {
      if (all()) return false;
      const was = k().boulders[b] || 0;
      knowArea(D.boulders[b].sector, level);
      if (was >= level) return false;
      k().boulders[b] = level; return was === 0;
    }
    const visitArea = s => knowArea(s, 2);
    const visitBoulder = b => knowBoulder(b, 2);
    function identify(p, how, date, from) {
      if (all() || k().lines[p]) return false;
      knowBoulder(D.problems[p].b, 1);
      k().lines[p] = from ? { how, date, from } : { how, date };
      return true;
    }
    const tell = (p, from, date) => identify(p, "told", date, from);
    // Look a boulder over: you know it now, and you see every line on it that
    // isn't beyond you. Returns { found: new boulder?, lines: newly identified }.
    function inspect(b, date) {
      if (all()) return { found: false, lines: [] };
      const found = knowBoulder(b, 2);
      const lines = D.boulders[b].problems.filter(p => line(p) === "hidden" && canSpot(p) && identify(p, "spot", date));
      return { found, lines };
    }
    // Lines on a known boulder you can see now but couldn't before (you got stronger).
    const spottable = b => D.boulders[b].problems.filter(p => line(p) === "hidden" && canSpot(p));

    return { all, v2, est, area, boulder, line, visible, name, grade, boulderName, stats, knownBoulders, linesOn, guidebook,
      boulderStats, areaStats, canGo, canSpot, mapView, visitArea, visitBoulder, identify, tell, inspect, spottable,
      legend: p => (World && visible(p) ? World.legendOf(D, p) : null), faText: p => (World ? World.faText(D, est(p)) : "") };
  }
  const Know = { make };
  if (typeof module !== "undefined") module.exports = Know; else root.Know = Know;
})(typeof window !== "undefined" ? window : globalThis);
