// Granite Hollow, illustrated: the visual language for the map, worked out on
// one area (Hawkwatch) before it goes everywhere. Pure functions, no DOM, so
// placement can be checked in Node like art.js.
//
//   paletteAt(date)            richer seasonal colours (keyframes blended by day of year)
//   sceneFor(D, sectorName)    everything that grows, lies or stands in an area
//   boulderForm(b, problems)   a boulder's shape, height, faces and surface details
//   sunFaces(shadow, alt)      how lit a rock face is for each compass direction
//   trailPoints(t)             a trail as a polyline (the same curve the map draws)
//
// Coordinates are the game's: metres, x east, y north. Nothing here affects
// gameplay.
(function (root) {
  const Art = root.Art || (typeof require !== "undefined" ? require("../../game/art.js") : null);
  const { rand, mix } = Art;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;

  // ---- noise -------------------------------------------------------------------
  // Smooth value noise, seeded by name, for groves, glades and patches.
  function noise(seed) {
    const s = Math.floor(rand(seed)() * 2 ** 31);
    const H = (ix, iy) => {
      let h = s ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    return (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = H(ix, iy), b = H(ix + 1, iy), c = H(ix, iy + 1), d = H(ix + 1, iy + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct = 3) {
    let s = 0, a = 1, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 17.3, y * f - i * 9.1); t += a; a *= .5; f *= 2; }
    return s / t;
  }
  // Evenly spread random points (Bridson's Poisson-disc sampling).
  function scatter(seed, [x0, x1, y0, y1], r, k = 18) {
    const rr = rand(seed), cell = r / Math.SQRT2, gw = Math.ceil((x1 - x0) / cell), gh = Math.ceil((y1 - y0) / cell);
    const grid = new Int32Array(gw * gh).fill(-1), pts = [], active = [];
    const put = p => { pts.push(p); active.push(p); grid[Math.floor((p[1] - y0) / cell) * gw + Math.floor((p[0] - x0) / cell)] = pts.length - 1; };
    put([x0 + rr() * (x1 - x0), y0 + rr() * (y1 - y0)]);
    while (active.length) {
      const i = Math.floor(rr() * active.length), p = active[i];
      let found = false;
      for (let j = 0; j < k; j++) {
        const a = rr() * TAU, d = r * (1 + rr()), q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
        if (q[0] < x0 || q[0] >= x1 || q[1] < y0 || q[1] >= y1) continue;
        const gx = Math.floor((q[0] - x0) / cell), gy = Math.floor((q[1] - y0) / cell);
        let ok = true;
        for (let yy = Math.max(0, gy - 2); ok && yy <= Math.min(gh - 1, gy + 2); yy++)
          for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
            const g = grid[yy * gw + xx];
            if (g >= 0 && Math.hypot(pts[g][0] - q[0], pts[g][1] - q[1]) < r) { ok = false; break; }
          }
        if (ok) { put(q); found = true; break; }
      }
      if (!found) active.splice(i, 1);
    }
    return pts;
  }

  // ---- palette -----------------------------------------------------------------
  // Keyframes by day of the year, like art.js but bolder: fresh spring greens,
  // deep summer greens, a real New England October, and blue-white winters.
  // Three shades per deciduous kind so a hillside is never one flat colour.
  // Numbers are 0..1 amounts: leaf (canopy), snow, flowers, ferns, berries
  // (ripe blueberries), shrooms (mushroom season).
  const BUDS = { maple: ["#a8574a", "#b26a52", "#9c4b42"], oak: ["#8d7158", "#957a5e", "#836a52"], birch: ["#a99a72", "#b3a47a", "#9f906a"] };
  const WHITE4 = ["#ffffff", "#ffffff", "#ffffff", "#ffffff"];
  const K = [
    { d: 1, leaf: 0, snow: .92, flowers: 0, ferns: 0, berries: 0, shrooms: 0, ...BUDS,
      ever: ["#2e5e4b", "#3b6c55", "#284f44"], floor: "#b8a78c", floor2: "#a39274", meadow: "#c6b994", bald: "#d6d3cf", grass: "#b5a27a",
      fern: "#9a8a62", shrub: "#6f6a4f", blueberry: "#8a4a46", litter: ["#9c7d5a", "#8a6a4c"], water: "#a3c6d6", fl: WHITE4,
      tint: "#cfd8e2", shade: "#5b6f99", canopy: "#3d4f63", trunk: "#6b5747" },
    { d: 62, leaf: 0, snow: .5, flowers: 0, ferns: 0, berries: 0, shrooms: 0, ...BUDS,
      ever: ["#2f5f4a", "#3c6d54", "#294f43"], floor: "#ab9a7c", floor2: "#988766", meadow: "#beb28c", bald: "#d8d4cc", grass: "#ab9d74",
      fern: "#958560", shrub: "#6c684c", blueberry: "#8f4b44", litter: ["#96785a", "#836548"], water: "#98c2d4", fl: WHITE4,
      tint: "#d6d6cc", shade: "#5a6c8c", canopy: "#3d4c58", trunk: "#6b5747" },
    { d: 100, leaf: .45, snow: 0, flowers: .5, ferns: .35, berries: 0, shrooms: 0,
      maple: ["#d2e07a", "#e9a596", "#b9d66a"], oak: ["#c9cf8c", "#d6d49a", "#bcc47c"], birch: ["#d6ec88", "#e2f096", "#c8e277"],
      ever: ["#2f6447", "#3d7352", "#29573f"], floor: "#ada783", floor2: "#9a9370", meadow: "#b9d27b", bald: "#dbd7cd", grass: "#a9cf6a",
      fern: "#8fc35a", shrub: "#7aa555", blueberry: "#c96b5d", litter: ["#9b7a52", "#7f6a46"], water: "#86c6db",
      fl: ["#ffffff", "#f3b4cc", "#c4b5f0", "#ffe680"], tint: "#dbe7bb", shade: "#56705a", canopy: "#3b5b3a", trunk: "#6e5a46" },
    { d: 138, leaf: 1, snow: 0, flowers: 1, ferns: 1, berries: 0, shrooms: 0,
      maple: ["#7cc846", "#98d455", "#62b23e"], oak: ["#8fc552", "#a6d062", "#79b046"], birch: ["#ade066", "#bfe874", "#98d258"],
      ever: ["#2b6a44", "#38794f", "#255d3d"], floor: "#b2bf8a", floor2: "#9fae78", meadow: "#b4d876", bald: "#dcd8cd", grass: "#86c552",
      fern: "#7cc04e", shrub: "#6aac4c", blueberry: "#7fb455", litter: ["#8b8a4f", "#7a6f45"], water: "#6fc0dc",
      fl: ["#fffaf0", "#f59ac0", "#b3a0ee", "#ffd94a"], tint: "#d3e6ae", shade: "#4e6a4a", canopy: "#2f5530", trunk: "#6a5442" },
    { d: 182, leaf: 1, snow: 0, flowers: .85, ferns: 1, berries: .3, shrooms: 0,
      maple: ["#3f9c3d", "#4fab46", "#2f8b36"], oak: ["#479441", "#58a14a", "#3a8338"], birch: ["#64b04a", "#76bd56", "#55a042"],
      ever: ["#22603d", "#2e6e48", "#1d5336"], floor: "#a6b47e", floor2: "#93a26c", meadow: "#a8cf66", bald: "#dbd6c9", grass: "#78b54a",
      fern: "#5fac44", shrub: "#4f9440", blueberry: "#5e9a46", litter: ["#7c7c48", "#6a6a40"], water: "#55b6d8",
      fl: ["#fffef5", "#f7c23c", "#ea5f86", "#9a7ce0"], tint: "#e6e1ad", shade: "#44603f", canopy: "#264d2a", trunk: "#665040" },
    { d: 236, leaf: 1, snow: 0, flowers: .7, ferns: .9, berries: .75, shrooms: .4,
      maple: ["#4a9338", "#5e9e3c", "#3e8434"], oak: ["#4f8d3a", "#5f973f", "#437f35"], birch: ["#7cae44", "#8cb84c", "#6ea13e"],
      ever: ["#22603d", "#2e6e48", "#1d5336"], floor: "#aeb17e", floor2: "#9a9e6c", meadow: "#c4c460", bald: "#dcd5c4", grass: "#a7b04c",
      fern: "#6aa443", shrub: "#52903c", blueberry: "#4f8a40", litter: ["#86804a", "#706a40"], water: "#58b2d2",
      fl: ["#f5c531", "#a585e8", "#fffaf0", "#f0a73a"], tint: "#eadca0", shade: "#4a5c3a", canopy: "#2a4b28", trunk: "#665040" },
    { d: 263, leaf: 1, snow: 0, flowers: .45, ferns: .7, berries: .1, shrooms: .8,
      maple: ["#e0b33a", "#ec7d2c", "#98ad3a"], oak: ["#99a23a", "#b4983a", "#7f9236"], birch: ["#ecd04a", "#f5dc58", "#dcc23c"],
      ever: ["#235f3e", "#2f6d48", "#1e5237"], floor: "#b9b083", floor2: "#a59c71", meadow: "#c9bd78", bald: "#ddd5c3", grass: "#b8ad66",
      fern: "#a8b04a", shrub: "#7a8f3c", blueberry: "#b8503a", litter: ["#c0913e", "#a0703a"], water: "#5fb0cc",
      fl: ["#f3c22e", "#9c7fe0", "#ffffff", "#9c7fe0"], tint: "#efd39a", shade: "#56553f", canopy: "#30472a", trunk: "#665040" },
    { d: 290, leaf: 1, snow: 0, flowers: .25, ferns: .4, berries: 0, shrooms: 1,
      maple: ["#e8442a", "#f5871e", "#cc2d2e"], oak: ["#bf6428", "#d6852f", "#a34f25"], birch: ["#f7c52a", "#ffd94c", "#ebb21e"],
      ever: ["#22603f", "#2e6e49", "#1d5338"], floor: "#c2aa80", floor2: "#ad946c", meadow: "#cfb27c", bald: "#ddd3c2", grass: "#c9a66c",
      fern: "#cf9a48", shrub: "#8a7a3a", blueberry: "#c42b37", litter: ["#e0782c", "#c9442a"], water: "#62acc8",
      fl: ["#a988e2", "#f3c22e", "#ffffff", "#a988e2"], tint: "#f2c88e", shade: "#5e4f4c", canopy: "#3e3a2c", trunk: "#5f4a3c" },
    { d: 316, leaf: .4, snow: 0, flowers: 0, ferns: .12, berries: 0, shrooms: .4,
      maple: ["#b05a32", "#c36e3a", "#97492c"], oak: ["#a5693a", "#b97a44", "#8c5732"], birch: ["#d2a84a", "#dcb455", "#c49a40"],
      ever: ["#245e40", "#306c4a", "#1f5239"], floor: "#b8a283", floor2: "#a38d70", meadow: "#c9b88a", bald: "#d9d3c8", grass: "#b8a274",
      fern: "#a07c50", shrub: "#76683e", blueberry: "#953a3a", litter: ["#a8693a", "#8c5a34"], water: "#7aaec2", fl: WHITE4,
      tint: "#dccab2", shade: "#5a5e78", canopy: "#3d3e40", trunk: "#625042" },
    { d: 341, leaf: .04, snow: .45, flowers: 0, ferns: 0, berries: 0, shrooms: 0, ...BUDS,
      ever: ["#2c5c48", "#396a52", "#274d42"], floor: "#ad9c80", floor2: "#9a8a6e", meadow: "#c2b58e", bald: "#d6d2cc", grass: "#b0a078",
      fern: "#9a8a62", shrub: "#6c684c", blueberry: "#8a4a46", litter: ["#9c7d5a", "#8a6a4c"], water: "#9fc3d4", fl: WHITE4,
      tint: "#d3d9e0", shade: "#5b6f99", canopy: "#3d4f63", trunk: "#6b5747" },
  ];
  function paletteAt(date) {
    const d = Art.dayOfYear(date);
    let i = K.length - 1;
    while (i > 0 && K[i].d > d) i--;
    const a = K[i], b = K[(i + 1) % K.length], span = ((b.d - a.d) + 365) % 365 || 365;
    const t = (((d - a.d) + 365) % 365) / span;
    const out = { day: d };
    for (const k of Object.keys(a)) {
      if (k === "d") continue;
      if (Array.isArray(a[k])) out[k] = a[k].map((c, j) => mix(c, b[k][j], t));
      else if (typeof a[k] === "string") out[k] = mix(a[k], b[k], t);
      else out[k] = a[k] + (b[k] - a[k]) * t;
    }
    const s = Art.seasonAt(date);
    out.name = s.name; out.key = s.key;
    // Things that happen on the calendar rather than gradually.
    out.hawkWatch = d >= 244 && d <= 304;              // the counters are up on the summit Sept-Oct
    out.kettle = d >= 250 && d <= 280;                 // broad-winged hawks pass through in mid-September
    out.fireflies = d >= 160 && d <= 215;              // June and July evenings
    return out;
  }

  // How lit a rock face is, by the compass direction it faces: 0 (in shade)
  // to 1 (full sun). Buckets: 0 E, 1 NE, 2 N, 3 NW, 4 W, 5 SW, 6 S, 7 SE.
  // `shadow` is art.js's shadow vector (x east, y north), which points away
  // from the sun; alt is the sun's height (0..1).
  function sunFaces(shadow, alt) {
    const L = Math.hypot(shadow[0], shadow[1]) || 1, sx = -shadow[0] / L, sy = -shadow[1] / L;
    return d3range(8).map(b => {
      const a = b * Math.PI / 4, lam = Math.cos(a) * sx + Math.sin(a) * sy;
      return clamp(.18 + .82 * Math.max(0, lam) * (.45 + .55 * Math.min(1, alt * 1.6)), 0, 1);
    });
  }
  const d3range = n => Array.from({ length: n }, (_, i) => i);

  // ---- trails ----------------------------------------------------------------------
  // The map draws trails with d3.curveBasis through art.js's control points;
  // this samples the same curve so placement and drawing agree.
  function trailPoints(t, step = 2) {
    const c = Art.trailControls(t), P = [c[0], c[0], c[0], ...c.slice(1, -1), c[c.length - 1], c[c.length - 1], c[c.length - 1]];
    const out = [];
    for (let i = 0; i + 3 < P.length; i++) {
      const [p0, p1, p2, p3] = P.slice(i, i + 4), seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(seg / step));
      for (let j = 0; j < n; j++) {
        const u = j / n, b0 = (1 - u) ** 3 / 6, b1 = (3 * u ** 3 - 6 * u * u + 4) / 6, b2 = (-3 * u ** 3 + 3 * u * u + 3 * u + 1) / 6, b3 = u ** 3 / 6;
        out.push([b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]]);
      }
    }
    out.push(c[c.length - 1]);
    return out;
  }
  const segDist = (p, a, b) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], L = abx * abx + aby * aby || 1;
    const t = clamp(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L, 0, 1);
    return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby);
  };
  const polyDist = (p, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d; };

  // ---- boulders --------------------------------------------------------------------
  // A boulder's form comes from its description in naming.py ("a bald granite
  // dome", "a broad slab", "a boxy little overhang") and falls back to its
  // angle, so its look follows its lore and renames carry through.
  const FORMS = [
    [/\bdome\b/i, "dome"], [/\bslab\b/i, "slab"], [/\bprow\b/i, "prow"], [/\broof\b|\bceiling\b/i, "roof"],
    [/\bhooked\b|\bpointed\b|\bbeak\b/i, "beak"], [/\bround\b|\begg\b|\bball\b/i, "round"], [/\bboxy\b|\bcube\b|\bbox\b/i, "box"],
    [/\btall\b|\bpillar\b/i, "tower"],
  ];
  const BY_ANGLE = { slab: "slab", vertical: "block", overhang: "prow", roof: "roof" };
  // Rock: warm pink granite, cool grey and buff, each with a top colour and a shade colour.
  const ROCKS = [
    { rock: "#cbbcae", top: "#e4d9cc", shade: "#5c5367", ink: "#3b3640" },
    { rock: "#b9bdbf", top: "#dadedf", shade: "#4b5468", ink: "#34393f" },
    { rock: "#c9bea4", top: "#e5dcc4", shade: "#5b5650", ink: "#3d3a33" },
    { rock: "#c2b9b0", top: "#ddd6ce", shade: "#535063", ink: "#38353c" },
  ];
  function boulderForm(b, problems = []) {
    const r = rand("form" + b.name + b.sector);
    let kind = BY_ANGLE[b.angle] || "block";
    for (const [re, k] of FORMS) if (re.test(b.desc || "")) { kind = k; break; }
    if (kind === "prow" && b.angle === "slab") kind = "slab";
    const tags = new Set(problems.flatMap(p => (p.tags || "").split("|")));
    const R = b.r * .98;                                   // footprint radius, metres
    const hm = (b.height_ft || 10) / 3.28;
    let H = clamp(hm * 1.5, 2.6, 10);
    let n = 9, aspect = 1, wob = .16, smoothEdge = false;
    switch (kind) {
      case "dome": n = 16; aspect = 1.12; wob = .07; smoothEdge = true; H *= .95; break;
      case "round": n = 13; wob = .08; smoothEdge = true; H = Math.max(H, R * .95); break;
      case "slab": n = 8; aspect = 1.35; wob = .12; break;
      case "prow": n = 8; aspect = .95; wob = .15; H *= 1.08; break;
      case "roof": n = 8; aspect = 1.2; wob = .12; H *= .85; break;
      case "box": n = 6; aspect = 1.05; wob = .08; break;
      case "tower": n = 8; aspect = .85; H *= 1.15; break;
      case "beak": n = 7; wob = .14; break;
    }
    const rot = r() * TAU;
    const base = d3range(n).map(i => {
      const a = (i + (r() - .5) * .45) / n * TAU, k = 1 - wob / 2 + r() * wob;
      const x = Math.cos(a) * R * aspect * k, y = Math.sin(a) * R * k;
      return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    });
    // Screen-space top outline: the base raised by each vertex's height (y down).
    const lean = (r() - .5) * .5;
    let top;
    if (kind === "slab") {
      // Tilted toward the sun: low along the south edge, high along the north.
      const tilt = -Math.PI / 2 + (r() - .5) * .9, tx = Math.cos(tilt), ty = Math.sin(tilt);
      const proj = base.map(p => p[0] * tx + p[1] * ty), lo = Math.min(...proj), hi = Math.max(...proj);
      top = base.map((p, i) => { const f = (proj[i] - lo) / (hi - lo || 1), h = H * (.12 + .88 * f ** 1.3); return [p[0] * .96, -p[1] * .96 - h]; });
    } else if (kind === "dome" || kind === "round") {
      top = base.map(p => [p[0] * .42, -p[1] * .42 - H]);
    } else if (kind === "prow") {
      // Leans out toward you over the trail: the top sits forward of the base.
      const fx = lean * R * .6, fy = R * .28;
      top = base.map(p => [p[0] * .9 + fx, -p[1] * .9 - H + fy]);
    } else if (kind === "roof") {
      // A flat cap jutting out on the south side over a dark cave.
      top = base.map(p => { const south = Math.max(0, -p[1] / R); return [p[0] * (1 + .12 * south), -p[1] * .92 - H + south * R * .35]; });
    } else {
      const shrink = kind === "tower" ? .9 : kind === "box" ? .93 : .86;
      top = base.map(p => [p[0] * shrink + (r() - .5) * R * .06, -p[1] * shrink - H * (1 + (r() - .5) * .16)]);
      if (kind === "beak") {     // pull one north-facing top corner up and out into a hooked point
        let bi = 0; top.forEach((p, i) => { if (p[1] + p[0] * .3 < top[bi][1] + top[bi][0] * .3) bi = i; });
        top[bi] = [top[bi][0] + R * .35, top[bi][1] - H * .35];
      }
    }
    const baseS = base.map(p => [p[0], -p[1]]);
    // Side faces between consecutive base and top points, back to front.
    const cx = 0, cy = 0, faces = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = base[i], c = base[j];
      let nx = c[1] - a[1], ny = -(c[0] - a[0]);              // outward normal (map coords) for CCW order
      const mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(ny, nx), dir = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
      const quad = [baseS[i], baseS[j], top[j], top[i]];
      if (ny > .35 * Math.hypot(nx, ny) && kind !== "roof") continue;    // north faces hide behind the top
      faces.push({ dir, pts: quad, z: (baseS[i][1] + baseS[j][1]) / 2, under: kind === "prow" && ny < 0 });
    }
    faces.sort((p, q) => p.z - q.z);
    const hull = hullOf([...baseS, ...top]);
    // Surface details, all in the same screen-space frame.
    const topC = centroid(top);
    const cracks = [];
    const nCr = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nCr; i++) {
      const a = r() * Math.PI, L = R * (.5 + r() * .9), o = (r() - .5) * R * .5;
      const p0 = [topC[0] + Math.cos(a + 1.57) * o - Math.cos(a) * L / 2, topC[1] + Math.sin(a + 1.57) * o * .6 - Math.sin(a) * L / 2 * .6];
      const mid = [p0[0] + Math.cos(a) * L / 2 + (r() - .5) * R * .15, p0[1] + Math.sin(a) * L / 2 * .6 + (r() - .5) * R * .1];
      cracks.push([p0, mid, [p0[0] + Math.cos(a) * L, p0[1] + Math.sin(a) * L * .6]]);
    }
    // Vertical seams down the front faces.
    for (const f of faces) if (r() < .45 && Math.abs(f.pts[0][0] - f.pts[1][0]) > R * .35) {
      const u = .3 + r() * .4, b0 = lerp(f.pts[0], f.pts[1], u), t0 = lerp(f.pts[3], f.pts[2], u + (r() - .5) * .15);
      cracks.push([t0, lerp(t0, b0, .5).map((v, k) => v + (k ? 0 : (r() - .5) * R * .08)), lerp(t0, b0, .55 + r() * .4)]);
    }
    const lichen = [];
    const nL = 10 + Math.floor(r() * 12);
    for (let i = 0; i < nL; i++) {
      const onTop = r() < .6, src = onTop ? top : (faces.length ? faces[Math.floor(r() * faces.length)].pts : top);
      const c0 = centroid(src), pick = src[Math.floor(r() * src.length)], u = .25 + r() * .6;
      lichen.push({ x: c0[0] + (pick[0] - c0[0]) * u, y: c0[1] + (pick[1] - c0[1]) * u, r: R * (.025 + r() * .05), c: r() < .12 ? 2 : r() < .5 ? 1 : 0 });
    }
    // Chalk on the popular lines, on the faces you'd climb.
    const chalk = [];
    const sends = problems.reduce((s, p) => s + (p.sends || 0), 0);
    const nCh = clamp(Math.round(sends / 60), 0, 9);
    for (let i = 0; i < nCh && faces.length; i++) {
      const f = faces[Math.floor(r() * faces.length)], u = .15 + r() * .7, v = .2 + r() * .7;
      const p = lerp(lerp(f.pts[0], f.pts[1], u), lerp(f.pts[3], f.pts[2], u), v);
      chalk.push({ x: p[0], y: p[1], r: .12 + r() * .1 });
    }
    return { kind, R, H, base: baseS, top, faces, hull, cracks, lichen, chalk, smoothEdge, topC,
      rock: ROCKS[Math.floor(r() * ROCKS.length)], moss: tags.has("slab") ? .3 : .55, lean };
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  function hullOf(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // ---- an area's scene ---------------------------------------------------------------
  // Trees grow in groves with glades between them (two layers of noise), thin
  // out toward the bald summit, keep off trails, and stand clear of the front
  // of boulders so they never hide one. Species come in stands: hemlocks in
  // the cool hollows, birch groves, maple and oak slopes, pitch pines on the
  // summit's edge. The understory follows: blueberry barrens on the bald,
  // laurel in the gaps, ferns in the shade, grass and flowers in the open.
  function sceneFor(D, sectorName, opts = {}) {
    const s = D.sectors.find(x => x.name === sectorName);
    const half = opts.half || [175, 145];
    const bounds = [s.x - half[0], s.x + half[0], s.y - half[1], s.y + half[1]];
    const inB = p => p[0] >= bounds[0] && p[0] <= bounds[1] && p[1] >= bounds[2] && p[1] <= bounds[3];
    const seed = "illu-" + sectorName;
    const nGrove = noise(seed + "grove"), nKind = noise(seed + "kind"), nWet = noise(seed + "wet"), nBald = noise(seed + "bald"), nPatch = noise(seed + "patch");
    const R = rand(seed);

    // Boulders, their forms, and the space they need kept clear.
    const boulders = D.boulders.map((b, i) => ({ b, i })).filter(({ b }) => inB([b.x, b.y]) || b.sector === sectorName)
      .map(({ b, i }) => ({ id: i, b, form: boulderForm(b, b.problems.map(k => D.problems[k])) }));
    const blocked = (p, pad) => boulders.some(({ b, form }) => {
      const dx = p[0] - b.x, dy = p[1] - b.y;
      if (Math.hypot(dx, dy) < form.R * 1.15 + pad) return true;
      // In front (south) of a boulder: anything tall standing there would hide it.
      return dy < 0 && dy > -(form.R + form.H + pad * 2.2) && Math.abs(dx) < form.R * 1.1 + pad;
    });

    // The bald summit: open granite with a ragged edge.
    const baldR = s.radius * 1.02, baldC = [s.x - 2, s.y + 6];
    const baldEdge = a => baldR * (.8 + .42 * fbm(nBald, Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + 3, 3));
    const bald = d3range(96).map(i => { const a = i / 96 * TAU, rr = baldEdge(a); return [baldC[0] + Math.cos(a) * rr, baldC[1] + Math.sin(a) * rr]; });
    const baldness = p => {        // 1 deep in the bald, 0 in the woods; negative = distance outside, in metres
      const dx = p[0] - baldC[0], dy = p[1] - baldC[1], e = baldEdge(Math.atan2(dy, dx)), d = Math.hypot(dx, dy);
      return { inside: d < e, depth: (e - d) };
    };

    // Ledges: bare granite showing through the heath, more of it toward the top.
    const nRock = noise(seed + "rock"), ROCK_T = .64;
    const rockAt = p => {
      const bz = baldness(p);
      if (!bz.inside) return 0;
      return fbm(nRock, p[0] / 15, p[1] / 15, 3) * .85 + .32 * smooth(0, 40, bz.depth) + .15 * smooth(2, 10, bz.depth) - .12;
    };
    const cell = 1.5, gx0 = baldC[0] - baldR * 1.3, gy0 = baldC[1] - baldR * 1.3, gn = Math.ceil(baldR * 2.6 / cell);
    const rockGrid = { x0: gx0, y0: gy0, cell, nx: gn, ny: gn, t: ROCK_T, values: new Float64Array(gn * gn) };
    // Blueberry carpets: where the heath (not bare rock) is patchy enough, contoured like the ledges.
    const bbGrid = { ...rockGrid, t: .5, values: new Float64Array(gn * gn) };
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) {
      const p = [gx0 + i * cell, gy0 + j * cell], rk = rockAt(p), bz = baldness(p);
      rockGrid.values[j * gn + i] = rk;
      bbGrid.values[j * gn + i] = bz.depth > -3 && rk < ROCK_T - .03 ? fbm(nPatch, p[0] / 16, p[1] / 16, 2) * smooth(-3, 2, bz.depth) : 0;
    }

    const trails = D.trails.map(t => ({ to: t.to, pts: trailPoints(t) })).filter(t => t.pts.some(inB));
    const trailDist = p => Math.min(...trails.map(t => polyDist(p, t.pts)));

    // ---- trees
    const trees = [];
    const pts = scatter(seed + "trees", bounds, 3.7);
    for (const p of pts) {
      const bz = baldness(p), td = trailDist(p);
      if (td < 4) continue;
      // Groves (dense, crowns overlapping) and glades (nearly open), at two scales.
      const grove = fbm(nGrove, p[0] / 52, p[1] / 52, 3), gap = fbm(nGrove, p[0] / 17 + 40, p[1] / 17, 2);
      let dens = .06 + .94 * smooth(.4, .58, grove);
      dens *= .25 + .75 * smooth(.3, .46, gap);
      const heath = bz.inside && rockAt(p) < ROCK_T - .05;
      if (bz.inside) dens = heath ? (bz.depth < 8 ? .2 : .07) : 0;
      else dens *= .3 + .7 * smooth(0, 18, -bz.depth);
      if (td < 7) dens *= .5;
      if (R() > dens) continue;
      const nearEdge = !bz.inside && -bz.depth < 26, k = fbm(nKind, p[0] / 46, p[1] / 46, 2), roll = R();
      let kind;
      if (bz.inside) kind = R() < .85 ? "pitch" : "oak";
      else if (nearEdge && roll < .45) kind = R() < .7 ? "pitch" : "oak";
      else if (k < .36) kind = roll < .68 ? "hemlock" : roll < .84 ? "birch" : "maple";
      else if (k < .5) kind = roll < .55 ? "birch" : roll < .8 ? "maple" : "whitepine";
      else if (k < .68) kind = roll < .5 ? "maple" : roll < .85 ? "oak" : "birch";
      else kind = roll < .5 ? "oak" : roll < .78 ? "whitepine" : "maple";
      const ever = ["pitch", "hemlock", "whitepine"].includes(kind);
      let size = .66 + .62 * fbm(nGrove, p[0] / 25 + 9, p[1] / 25, 2) + (R() - .5) * .36;
      if (!ever && R() < .04) size *= 1.45;        // an old giant here and there
      if (bz.inside) size *= .7;
      const crownR = { maple: 3.3, oak: 3.8, birch: 2.5, pitch: 2.8, hemlock: 2.7, whitepine: 3.1 }[kind] * size;
      if (blocked(p, crownR * .6)) continue;
      trees.push({ x: +p[0].toFixed(2), y: +p[1].toFixed(2), kind, ever, size: +size.toFixed(3), v: Math.floor(R() * 3), shape: Math.floor(R() * 6), flip: R() < .5, crownR });
    }

    // ---- understory
    const shrubs = [], ferns = [], grass = [], flowers = [], pebbles = [];
    for (const p of scatter(seed + "under", bounds, 2.6)) {
      const bz = baldness(p), td = trailDist(p);
      if (td < 2.2 || blocked(p, .8)) continue;
      const patch = fbm(nPatch, p[0] / 16, p[1] / 16, 2), wet = fbm(nWet, p[0] / 30, p[1] / 30, 2);
      const nearTree = trees.some(t => Math.abs(t.x - p[0]) < 3 && Math.abs(t.y - p[1]) < 3);
      if (bz.inside) {
        const rk = rockAt(p);
        if (rk > ROCK_T + .02) { if (R() < .1) pebbles.push({ x: p[0], y: p[1], s: .25 + R() * .45 }); else if (rk < ROCK_T + .06 && R() < .5) grass.push({ x: p[0], y: p[1], s: .6 + R() * .4, rot: Math.round((R() - .5) * 30) }); }
        else if (patch > .53 && R() < .4) shrubs.push({ x: p[0], y: p[1], kind: "blueberry", s: 1.3 + R() * .8, v: Math.floor(R() * 3) });
        else if (R() < .7) grass.push({ x: p[0], y: p[1], s: .8 + R() * .6, rot: Math.round((R() - .5) * 30) });
      } else if (-bz.depth < 7) {
        if (patch > .5 && R() < .6) shrubs.push({ x: p[0], y: p[1], kind: "blueberry", s: 1.1 + R() * .7, v: Math.floor(R() * 3) });
        else if (R() < .6) grass.push({ x: p[0], y: p[1], s: .8 + R() * .6, rot: Math.round((R() - .5) * 30) });
      } else if (!nearTree) {
        if (wet > .54 && R() < .75) ferns.push({ x: p[0], y: p[1], s: .8 + R() * .7, rot: Math.round((R() - .5) * 40) });
        else if (patch > .62 && R() < .5) shrubs.push({ x: p[0], y: p[1], kind: "laurel", s: .8 + R() * .6, v: Math.floor(R() * 3) });
        else if (td < 6 && R() < .5) grass.push({ x: p[0], y: p[1], s: .7 + R() * .5, rot: Math.round((R() - .5) * 30) });
      }
    }
    // Wildflowers grow in drifts: along the trail edges, the summit's rim and sunny gaps.
    const drift = (c, n, spread) => {
      const col = Math.floor(R() * 4);
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, d = Math.sqrt(R()) * spread, p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
        if (trailDist(p) < 1.6 || blocked(p, .3)) continue;
        flowers.push({ x: +p[0].toFixed(2), y: +p[1].toFixed(2), c: R() < .8 ? col : Math.floor(R() * 4), s: .7 + R() * .6 });
      }
    };
    for (const p of scatter(seed + "drifts", bounds, 16)) {
      const bz = baldness(p), td = trailDist(p);
      const open = (bz.inside && bz.depth < 14) || (!bz.inside && -bz.depth < 10) || td < 7;
      if (open && R() < .7) drift(p, 8 + Math.floor(R() * 12), 2.5 + R() * 3);
    }

    // ---- the forest floor's small things
    const logs = [], stumps = [], shrooms = [];
    for (const p of scatter(seed + "logs", bounds, 26)) {
      const bz = baldness(p);
      if (bz.inside || -bz.depth < 8 || trailDist(p) < 5 || blocked(p, 4) || R() < .35) continue;
      const a = (R() - .5) * 1.4, L = 5 + R() * 5;
      if (trees.some(t => Math.hypot(t.x - p[0], t.y - p[1]) < L * .5 + 1)) continue;
      logs.push({ x: p[0], y: p[1], a, L, r: .35 + R() * .2 });
      const n = 2 + Math.floor(R() * 4);
      for (let i = 0; i < n; i++) { const u = (R() - .5) * L * .8; shrooms.push({ x: p[0] + Math.cos(a) * u, y: p[1] + Math.sin(a) * u - .6 - R() * .5, kind: R() < .6 ? "bracket" : "cap", s: .6 + R() * .5 }); }
    }
    for (const p of scatter(seed + "stumps", bounds, 22)) {
      const bz = baldness(p);
      if (bz.inside || trailDist(p) < 3 || blocked(p, 2) || R() < .45) continue;
      stumps.push({ x: p[0], y: p[1], r: .35 + R() * .25 });
      if (R() < .5) shrooms.push({ x: p[0] + .5, y: p[1] - .4, kind: "cap", s: .7 });
    }
    for (const t of trees) if (!t.ever && R() < .06) shrooms.push({ x: t.x + (R() - .5) * 2, y: t.y - .8, kind: R() < .3 ? "fly" : "cap", s: .6 + R() * .4 });

    // ---- the bald's own marks: sheet joints, cracks, lichen rosettes
    const sheets = [];
    for (let k = 0; k < 4; k++) {
      const rr0 = baldR * (.32 + k * .17), a0 = R() * TAU, span = 1.6 + R() * 1.6, pts2 = [];
      for (let i = 0; i <= 20; i++) { const a = a0 + span * i / 20, rr = rr0 * (1 + (fbm(nBald, Math.cos(a) * 2 + k, Math.sin(a) * 2, 2) - .5) * .25); pts2.push([s.x + Math.cos(a) * rr, s.y + 14 + Math.sin(a) * rr * .85]); }
      sheets.push(pts2.filter(p => baldness(p).depth > 4));
    }
    const joints = [];
    for (const set of [.6, 2.2]) for (let i = 0; i < 9; i++) {
      const c = [baldC[0] + (R() - .5) * baldR * 1.5, baldC[1] + (R() - .5) * baldR * 1.5], L = 6 + R() * 16, a = set + (R() - .5) * .15;
      const p0 = [c[0] - Math.cos(a) * L / 2, c[1] - Math.sin(a) * L / 2], p1 = [c[0] + Math.cos(a) * L / 2, c[1] + Math.sin(a) * L / 2];
      if (baldness(p0).depth > 3 && baldness(p1).depth > 3 && trailDist(c) > 2) joints.push([p0, p1]);
    }
    const rosettes = [];
    for (const p of scatter(seed + "lichen", bounds, 4.5)) {
      const bz = baldness(p);
      if (!bz.inside || rockAt(p) < ROCK_T + .02 || blocked(p, .5) || R() < .3) continue;
      rosettes.push({ x: p[0], y: p[1], r: .14 + R() * .3, c: R() < .1 ? 2 : R() < .6 ? 0 : 1 });
    }

    // ---- light under the canopy: soft pools of shade beneath groves
    const washes = [];
    for (const p of scatter(seed + "wash", bounds, 14)) {
      washes.push({ x: p[0], y: p[1], r: 10 + R() * 18, tone: fbm(nGrove, p[0] / 40, p[1] / 40, 2) > .5 ? 1 : 0, seed: Math.floor(R() * 1e6) });
    }

    // ---- landmarks: each area's own vignettes, placed beside what they belong to
    const landmarks = [];
    const byName = name => boulders.find(x => x.b.name === name);
    const clearTrees = (p, rad) => { for (let i = trees.length - 1; i >= 0; i--) if (Math.hypot(trees[i].x - p[0], trees[i].y - p[1]) < rad + trees[i].crownR * .55) trees.splice(i, 1); };
    const clearSmall = (p, rad) => {
      for (const arr of [shrubs, ferns, grass, flowers, pebbles, shrooms, stumps]) for (let i = arr.length - 1; i >= 0; i--) if (Math.hypot(arr[i].x - p[0], arr[i].y - p[1]) < rad) arr.splice(i, 1);
    };
    const taken = [];
    function spot(c, d0, foot, prefer) {
      // Around c at distance ~d0; behind (north of) or beside a boulder, so it never hides one.
      const rr = rand("spot" + c[0] + "," + c[1] + d0);
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 60; i++) {
        const a = (prefer ?? Math.PI / 2) + (rr() - .5) * Math.PI * (i < 20 ? .8 : 1.9), d = d0 * (1 + rr() * .6);
        const p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
        if (blocked(p, foot) || trailDist(p) < foot + 1.6 || taken.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < q[2] + foot)) continue;
        const score = -Math.abs(d - d0) - Math.abs(a - (prefer ?? Math.PI / 2)) * 2;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) taken.push([best[0], best[1], foot]);
      return best;
    }
    for (const v of VIGNETTES[sectorName] || []) {
      let c;
      if (v.near === "center") c = [s.x, s.y];
      else if (v.near === "summit") c = [s.x, s.y + s.radius * .35];
      else { const bb = byName(v.near); if (!bb) continue; c = [bb.b.x, bb.b.y]; }
      const nearR = v.near === "center" || v.near === "summit" ? 0 : byName(v.near).form.R;
      let p;
      if (v.exact) { p = [c[0] + v.exact[0], c[1] + v.exact[1]]; taken.push([p[0], p[1], v.foot ?? 2]); }
      else if (v.kind === "signpost") {
        // Beside the trail junction, a step off the path.
        const rr = rand("sign" + sectorName);
        for (let i = 0; i < 80 && !p; i++) { const a = rr() * TAU, d = 3.5 + rr() * 5, q = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]; if (trailDist(q) > 2 && trailDist(q) < 3.4 && !blocked(q, 1)) p = q; }
      } else p = spot(c, nearR + (v.gap ?? 4), v.foot ?? 2, v.prefer);
      if (!p) continue;
      clearTrees(p, v.clear ?? (v.foot ?? 2) + 1.5); clearSmall(p, (v.foot ?? 2) * .9);
      landmarks.push({ ...v, x: +p[0].toFixed(2), y: +p[1].toFixed(2) });
    }
    // Trail markers across open rock: cairns every so often.
    const cairns = [];
    for (const t of trails) {
      let acc = 0;
      for (let i = 1; i < t.pts.length; i++) {
        acc += Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]);
        if (acc < 22) continue;
        const p = t.pts[i], dx = t.pts[i][0] - t.pts[i - 1][0], dy = t.pts[i][1] - t.pts[i - 1][1], L = Math.hypot(dx, dy) || 1;
        const q = [p[0] - dy / L * 2.2, p[1] + dx / L * 2.2];
        if (baldness(q).inside && baldness(q).depth > 4 && !blocked(q, 1) && Math.hypot(q[0] - s.x, q[1] - s.y) > 9) { cairns.push({ x: q[0], y: q[1], s: .8 + R() * .3 }); acc = 0; }
      }
    }

    return { sector: s, bounds, bald, baldC, baldR, trails, trees, shrubs, ferns, grass, flowers, pebbles, logs, stumps, shrooms,
      sheets, joints, rosettes, washes, boulders, landmarks, cairns, baldness, trailDist, blocked, rockGrid, bbGrid, rockAt, ROCK_T, patchAt: p => fbm(nPatch, p[0] / 16, p[1] / 16, 2) };
  }

  // Each area's vignettes, from its lore (naming.py's boulder descriptions).
  // near: a boulder's name, "center" (the trail junction) or "summit".
  // when: a palette flag that has to be on for it to show (hawkWatch = Sept-Oct).
  // note: the field-guide annotation that goes with it on the map.
  const VIGNETTES = {
    "Hawkwatch": [
      { kind: "signpost", near: "center", note: null },
      { kind: "cairn", near: "summit", exact: [0, 0], foot: 1.5, note: null },
      { kind: "counters", near: "summit", exact: [-8, 2.5], foot: 3, when: "hawkWatch", note: "hawk counters, Sept–Oct" },
      { kind: "bigtree", species: "pitch", scale: 1.85, near: "summit", exact: [9, 7], foot: 2.5, clear: 6, note: "the Old Pitch Pine", name: "Old Pitch Pine" },
      { kind: "bigtree", species: "oak", scale: 1.6, near: "The Birdhouse", gap: 4, foot: 3, prefer: Math.PI * .4, clear: 6, feeder: true, note: "the feeder oak" },
      { kind: "footings", near: "The Weathervane", gap: 5.5, foot: 4.5, prefer: Math.PI * .55, note: "old fire tower footings" },
      { kind: "snag", near: "The Aerie", gap: 4, foot: 2, prefer: Math.PI * .6, clear: 4, note: "where the eagles nested" },
      { kind: "bench", near: "The Lookout", gap: 3.5, foot: 1.8, prefer: Math.PI * .35, note: "best view in the park" },
    ],
  };

  const Illu = { paletteAt, sunFaces, trailPoints, boulderForm, sceneFor, noise, fbm, scatter, hullOf, polyDist, clamp, smooth };
  if (typeof module !== "undefined") module.exports = Illu; else root.Illu = Illu;
})(typeof window !== "undefined" ? window : globalThis);
