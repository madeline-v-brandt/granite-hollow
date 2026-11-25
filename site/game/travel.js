// Granite Hollow: getting around (Phase 2, Stage 4). Pure: no DOM, no d3, so
// it's tested in Node (scripts/test_world.js).
//
// Walking costs daylight at two rates, in metres per game minute: on a trail,
// and off it (through the woods, across a clearing, up to a boulder). The trail
// rate is what the game's walking times were always based on: every area's
// walk_min is its trail distance from the lot at about 45 m a minute.
//
// plan(from, to) finds the cheapest walk between two points: straight through
// the woods, or out to the nearest trail, along the trail network, and off it
// again at the far end. Water is in the way; boulders and brooks aren't (you
// step around a boulder, and the brooks have footbridges or stepping stones).
// The result is a polyline with the rate of each leg, so a walk can be charged
// as it happens, and stopped part way.
(function (root) {
  "use strict";
  const RATE = { trail: 45, off: 30 };          // metres per game minute
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function make({ trails, blocked = () => false, rate = RATE }) {
    // Each trail as a polyline with its running length.
    const T = trails.map(pts => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
      return { pts, cum, len: cum[cum.length - 1] };
    });
    // Trails meet at their ends (an area's trail junction): those are the network's nodes.
    const nodes = [];
    const nodeAt = p => { let i = nodes.findIndex(n => dist(n, p) < 2.5); if (i < 0) { nodes.push(p); i = nodes.length - 1; } return i; };
    for (const t of T) { t.a = nodeAt(t.pts[0]); t.b = nodeAt(t.pts[t.pts.length - 1]); }

    // The nearest point on a trail to p: its distance along the trail (s), the point, and how far away.
    function project(t, p) {
      let best = { s: 0, q: t.pts[0], d: dist(t.pts[0], p) };
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
        const q = [a[0] + dx * u, a[1] + dy * u], d = dist(q, p);
        if (d < best.d) best = { s: t.cum[i - 1] + Math.sqrt(L2) * u, q, d };
      }
      return best;
    }
    // Where along a trail distance s falls.
    function at(t, s) {
      s = Math.max(0, Math.min(t.len, s));
      let i = 1; while (i < t.cum.length - 1 && t.cum[i] < s) i++;
      const a = t.pts[i - 1], b = t.pts[i], seg = t.cum[i] - t.cum[i - 1], u = seg ? (s - t.cum[i - 1]) / seg : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    // The trail between s0 and s1, in that direction, as points (both ends included).
    function slice(t, s0, s1) {
      const out = [at(t, s0)], fwd = s1 >= s0;
      if (fwd) { for (let i = 0; i < t.pts.length; i++) if (t.cum[i] > s0 && t.cum[i] < s1) out.push(t.pts[i]); }
      else { for (let i = t.pts.length - 1; i >= 0; i--) if (t.cum[i] < s0 && t.cum[i] > s1) out.push(t.pts[i]); }
      out.push(at(t, s1));
      return out;
    }
    // Can you walk straight from a to b? (Nothing blocked along the way, checked every 3 m.)
    function clear(a, b) {
      const n = Math.ceil(dist(a, b) / 3);
      for (let i = 1; i < n; i++) { const u = i / n; if (blocked([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])) return false; }
      return true;
    }
    const legs = (pts, r) => pts.slice(1).map(() => r);

    function plan(from, to) {
      if (dist(from, to) < .05) return { pts: [from, to], rates: [rate.off], metres: 0, minutes: 0 };
      // The graph: the trail junctions, plus the start (S) and the end (E). Each edge
      // carries its cost in minutes and how to draw it.
      const N = nodes.length, S = N, E = N + 1, adj = Array.from({ length: N + 2 }, () => []);
      const edge = (u, v, cost, draw) => { if (isFinite(cost)) adj[u].push({ v, cost, draw }); };
      const off = (a, b) => (clear(a, b) ? dist(a, b) / rate.off : Infinity);
      edge(S, E, off(from, to), () => [[from, to], [rate.off]]);
      T.forEach(t => {
        edge(t.a, t.b, t.len / rate.trail, () => [t.pts, legs(t.pts, rate.trail)]);
        edge(t.b, t.a, t.len / rate.trail, () => { const p = [...t.pts].reverse(); return [p, legs(p, rate.trail)]; });
        const pf = project(t, from), pt = project(t, to), cf = off(from, pf.q), ct = off(pt.q, to);
        const via = (p0, s0, s1, p1, c0, c1) => () => {
          const mid = slice(t, s0, s1), pts = [p0, ...mid, p1];
          return [pts, [rate.off, ...legs(mid, rate.trail), rate.off]];
        };
        // From the start onto this trail, then to either end of it (or straight to the end point, if it's on the same trail).
        edge(S, t.a, cf + pf.s / rate.trail, () => { const mid = slice(t, pf.s, 0); return [[from, ...mid], [rate.off, ...legs(mid, rate.trail)]]; });
        edge(S, t.b, cf + (t.len - pf.s) / rate.trail, () => { const mid = slice(t, pf.s, t.len); return [[from, ...mid], [rate.off, ...legs(mid, rate.trail)]]; });
        edge(t.a, E, pt.s / rate.trail + ct, () => { const mid = slice(t, 0, pt.s); return [[...mid, to], [...legs(mid, rate.trail), rate.off]]; });
        edge(t.b, E, (t.len - pt.s) / rate.trail + ct, () => { const mid = slice(t, t.len, pt.s); return [[...mid, to], [...legs(mid, rate.trail), rate.off]]; });
        edge(S, E, cf + Math.abs(pt.s - pf.s) / rate.trail + ct, via(from, pf.s, pt.s, to, cf, ct));
      });
      // Dijkstra over a couple of dozen nodes.
      const best = new Array(N + 2).fill(Infinity), prev = new Array(N + 2).fill(null), done = new Array(N + 2).fill(false);
      best[S] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < N + 2; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
        if (u < 0 || u === E) break;
        done[u] = true;
        for (const e of adj[u]) if (best[u] + e.cost < best[e.v] - 1e-9) { best[e.v] = best[u] + e.cost; prev[e.v] = { u, e }; }
      }
      if (!isFinite(best[E])) return null;
      // Stitch the legs together.
      const chain = [];
      for (let v = E; prev[v]; v = prev[v].u) chain.unshift(prev[v].e);
      const pts = [], rates = [];
      for (const e of chain) {
        const [p, r] = e.draw();
        if (!pts.length) { pts.push(...p); rates.push(...r); }
        else { pts.push(...p.slice(1)); rates.push(...r); }
      }
      // Drop zero-length legs (a start already on the trail, say).
      const P = [pts[0]], R = [];
      for (let i = 1; i < pts.length; i++) { if (dist(pts[i], P[P.length - 1]) < .01) continue; P.push(pts[i]); R.push(rates[i - 1]); }
      if (P.length === 1) { P.push(to); R.push(rate.off); }
      let metres = 0, minutes = 0;
      for (let i = 1; i < P.length; i++) { const d = dist(P[i - 1], P[i]); metres += d; minutes += d / R[i - 1]; }
      return { pts: P, rates: R, metres, minutes };
    }
    // How far p is from the nearest trail (metres).
    const trailDist = p => Math.min(...T.map(t => project(t, p).d));
    return { plan, trailDist, rate, clear };
  }

  // A walk in progress: where you are after `d` metres along a planned path, and
  // what the walk so far has cost (minutes). Used for walking animations that can
  // stop part way.
  function along(path, d) {
    let left = Math.max(0, d), minutes = 0;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i], L = dist(a, b);
      if (left <= L) { const u = L ? left / L : 1; return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], minutes: minutes + left / path.rates[i - 1], leg: i - 1, dir: [b[0] - a[0], b[1] - a[1]] }; }
      left -= L; minutes += L / path.rates[i - 1];
    }
    const n = path.pts.length, a = path.pts[n - 2] || path.pts[0], b = path.pts[n - 1];
    return { p: b.slice(), minutes, leg: n - 2, dir: [b[0] - a[0], b[1] - a[1]], end: true };
  }

  const Travel = { make, along, RATE };
  if (typeof module !== "undefined") module.exports = Travel; else root.Travel = Travel;
})(typeof window !== "undefined" ? window : globalThis);
