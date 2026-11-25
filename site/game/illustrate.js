// Granite Hollow, illustrated: the visual language for the map, worked out on
// one area (Hawkwatch) before it goes everywhere. Pure functions, no DOM, so
// placement can be checked in Node like art.js.
//
//   paletteAt(date)            richer seasonal colours (keyframes blended by day of year)
//   parkScene(D)               everything that grows, lies or stands in the park (small things per tile)
//   boulderForm(b, problems)   a boulder's shape, height, faces and surface details
//   sunFaces(shadow, alt)      how lit a rock face is for each compass direction
//   trailPoints(t)             a trail as a polyline (the same curve the map draws)
//
// Coordinates are the game's: metres, x east, y north. Nothing here affects
// gameplay.
(function (root) {
  const Art = root.Art || (typeof require !== "undefined" ? require("../game/art.js") : null);
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
  // A boulder is drawn as a stack of contour rings, from where it meets the
  // ground (u = 0) to its top (u = 1). Each ring is the same organic outline,
  // shrunk, lifted and shifted by the boulder's profile, and filled a little
  // lighter than the one below, so the near faces read as continuous shaded
  // rock and the top as the lit surface. The profile comes from the boulder's
  // description in naming.py ("a bald granite dome", "a broad slab", "a
  // pointed block with a hooked tip") and falls back to its angle, so its look
  // follows its lore and renames carry through.
  const FORMS = [
    [/\bdomed?\b/i, "dome"], [/\bslab\b/i, "slab"], [/\bhooked\b|\bpointed\b|\bbeak\b/i, "beak"], [/\bprow\b/i, "prow"],
    [/\broof\b|\bceiling\b/i, "roof"], [/\bround\b|\begg\b|\bball\b/i, "round"], [/\bboxy\b|\bcube\b|\bbox\b/i, "box"],
    [/\btall\b|\bpillar\b/i, "tower"],
  ];
  const BY_ANGLE = { slab: "slab", vertical: "block", overhang: "prow", roof: "roof" };
  // Granite, a little cool against the warm ground: top, light, mid, shade, deep.
  const ROCKS = [
    { top: "#d6d9d9", light: "#c3c7c9", mid: "#a3a9b0", shade: "#6d7482", deep: "#474d5b", lichen: "#a9c08c" },
    { top: "#d9d6d2", light: "#c6c2be", mid: "#a8a4a3", shade: "#716f7d", deep: "#4a4856", lichen: "#b7c497" },
    { top: "#d3d8db", light: "#bec5ca", mid: "#9ea7b0", shade: "#677182", deep: "#454d5e", lichen: "#a3bd8f" },
  ];
  const RINGS = [0, .1, .22, .36, .5, .63, .75, .86, .94, 1];
  // Variety (Stage 6): a boulder whose description doesn't name its shape gets one
  // of its family's forms, from its own stream, so an overhang isn't always a
  // hooked prow (the "bird beak") and a plain block isn't always the same block.
  const FAMILY = { prow: [["prow", 3], ["wave", 4], ["leaner", 3]], block: [["block", 3], ["tiered", 2], ["fin", 1.5], ["loaf", 2], ["wedge", 1.5]], tower: [["tower", 3], ["fin", 1]] };
  // Drawn heights (Stage 6): from the climber's height to four times it, by the
  // boulder's real height. The climber stands about CLIMBER_M tall at walking zoom.
  const CLIMBER_M = 5, FT_LO = 5, FT_HI = 20.5;
  const drawnHeight = ft => CLIMBER_M * (1 + 3 * Math.pow(clamp(((ft || 10) - FT_LO) / (FT_HI - FT_LO), 0, 1), 1.1));
  function boulderForm(b, problems = []) {
    const r = rand("form" + b.name + b.sector);
    let kind = BY_ANGLE[b.angle] || "block", named = false;
    for (const [re, k] of FORMS) if (re.test(b.desc || "")) { kind = k; named = true; break; }
    const kind0 = kind;
    if (!named && FAMILY[kind]) {
      const rv = rand("variant" + b.name + b.sector)(), fam = FAMILY[kind], tot = fam.reduce((a, f) => a + f[1], 0);
      let u = rv * tot; for (const [k, w] of fam) { u -= w; if (u <= 0) { kind = k; break; } }
    }
    const R = b.r * 1.12, hm = (b.height_ft || 10) / 3.28 * 1.15;      // drawn a little large: boulders are the stars of the map
    const H = {
      dome: Math.max(hm * 1.35, R * .62), slab: Math.max(hm, R * .36), prow: clamp(hm * 1.4, 3.2, 9), beak: Math.max(hm * 1.4, R * 1.15),
      round: Math.min(Math.max(hm, R * .6), R * .78), roof: clamp(hm * 1.25, 2.6, 7), box: clamp(hm * 1.3, 2.6, 7), tower: clamp(hm * 1.45, 3, 9), block: clamp(hm * 1.35, 2.6, 8),
    }[kind0];
    // An organic footprint: a few smooth harmonics, stretched and turned.
    const N = 36, aspect = { dome: 1.15, slab: 1.5, prow: 1.2, beak: 1.3, round: 1.04, roof: 1.25, box: 1.08, tower: .95, block: 1.12, wave: 1.3, leaner: 1.1, tiered: 1.2, fin: 1.8, loaf: 1.6, wedge: 1.3 }[kind] ?? 1.12;
    const rough = { dome: .085, round: .06, slab: .08, box: .07 }[kind] ?? .1;
    // Seen at an angle: the footprint is foreshortened front to back, heights are not.
    const FS = .62, crownShift = [(r() - .5) * R * .3, (r() - .3) * R * .15];
    const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
    // Prows lean out sideways (so you see their profile), with a little toward you.
    const side = r() < .5 ? -1 : 1, leanA = -Math.PI / 2 + side * (1.05 + r() * .3), lean = [Math.cos(leanA), Math.sin(leanA)];
    const rot = kind === "prow" || kind === "beak" ? leanA : kind === "slab" ? (r() - .5) * .6 : r() * TAU;
    const base = d3range(N).map(i => {
      const a = i / N * TAU;
      // Broad lobes plus a little knobbliness, so no edge is a clean curve.
      const k = (1 + rough * (Math.sin(a * 2 + ph[0]) * .9 + Math.sin(a * 3 + ph[1]) * .7 + Math.sin(a * 5 + ph[2]) * .35 + Math.sin(a * 9 + ph[3]) * .18)) * (1 + (r() - .5) * .035);
      const x = Math.cos(a) * R * aspect * k, y = Math.sin(a) * R * k;
      return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    });
    // Slabs tilt toward the sun: low along the south edge, high to the north.
    const proj = base.map(p => p[1]), lo = Math.min(...proj), hi = Math.max(...proj);
    const ring = u => base.map((p, i) => {
      let s = 1, h = H * u, ox = 0, oy = 0;
      const dirx = p[0] / (Math.hypot(...p) || 1), diry = p[1] / (Math.hypot(...p) || 1), along = dirx * lean[0] + diry * lean[1];
      switch (kind) {
        case "dome": { const f = u * Math.PI / 2; s = .42 + .58 * Math.pow(Math.cos(f), .55); h = H * Math.pow(Math.sin(f), .85); ox = crownShift[0] * u * u; oy = crownShift[1] * u * u; break; }
        case "round": { const f = u * Math.PI / 2; s = .32 + .68 * Math.pow(Math.cos(f), .5); h = H * Math.sin(f); break; }
        case "slab": { const fr = (p[1] - lo) / (hi - lo || 1); s = 1 - .07 * u; h = H * u * (.16 + .84 * Math.pow(fr, 1.2)); break; }
        case "prow": case "beak": {
          // The face leans out over its base, and the top juts into a lip (a hooked point for the beak).
          // The back tapers in as it rises, leaving a narrow ridge that leans out over the front.
          s = 1 - (along < 0 ? (kind === "beak" ? .68 : .55) : .3) * u; const L = R * (kind === "beak" ? .85 : .5) * Math.pow(u, 1.5);
          ox = lean[0] * L; oy = lean[1] * L;
          const lip = Math.pow(Math.max(0, along), kind === "beak" ? 4 : 2.5) * R * (kind === "beak" ? .9 : .4) * u * u;
          ox += dirx * lip; oy += diry * lip;
          if (kind === "beak") h = H * u * (1 - .18 * Math.pow(Math.max(0, along), 5) * u * u * u);
          break;
        }
        case "roof": { s = 1 - .05 * u; const south = Math.max(0, -diry); ox = 0; oy = -south * R * .3 * Math.pow(u, 3); break; }
        default: { s = u < .7 ? 1 - .06 * u : .958 - .22 * Math.pow((u - .7) / .3, 2); }    // blocks: steep sides, rounded shoulders
      }
      return [p[0] * s + ox, -(p[1] * s + oy) * FS - h];   // screen frame: y down, footprint foreshortened, height lifts up
    });
    const rings = RINGS.map(ring);
    const all = rings.flat(), hull = hullOf(all);
    const top = rings[rings.length - 1], topC = centroid(top);
    // Each ring a little lighter than the one below; the top is the lit surface.
    const rock = ROCKS[Math.floor(r() * ROCKS.length)];
    const tone = u => {
      const stops = [[0, rock.deep], [.3, rock.shade], [.7, rock.mid], [.9, rock.light], [1, rock.top]];
      let i = 0; while (i < stops.length - 2 && u > stops[i + 1][0]) i++;
      const [u0, c0] = stops[i], [u1, c1] = stops[i + 1];
      return mix(c0, c1, clamp((u - u0) / (u1 - u0), 0, 1));
    };
    const toneAt = kind === "slab" ? RINGS.map(u => tone(u < 1 ? u * .8 : 1)) : RINGS.map(u => tone(Math.pow(u, kind === "dome" || kind === "round" ? .85 : 1.1)));
    // One gradient for the whole body, by height on screen, so the stacked rings
    // blend into continuous rock: light at the top, deep where it meets the ground.
    const ys = all.map(p => p[1]), gy0 = Math.min(...ys), gy1 = Math.max(...ys);
    const soft = kind === "dome" || kind === "round";
    const grad = soft ? [[0, rock.top], [.3, rock.light], [.55, rock.mid], [.8, rock.shade], [1, rock.deep]]
      : [[0, rock.light], [.35, rock.mid], [.75, rock.shade], [1, rock.deep]];
    // Restrained geology: one or two pale mineral veins, dark water streaks down
    // the near faces, a couple of real cracks, a little lichen. No speckle.
    const xs = base.map(p => p[0]), xmin = Math.min(...xs), xmax = Math.max(...xs);
    const topAt = x => { let best = null; for (const p of top) if (Math.abs(p[0] - x) < R * .25 && (!best || p[1] > best[1])) best = p; return best ? best[1] : -H; };
    const baseAt = x => { let best = null; for (const p of rings[0]) if (Math.abs(p[0] - x) < R * .25 && (!best || p[1] > best[1])) best = p; return best ? best[1] : 0; };
    const veins = [];
    for (let i = 0, n = r() < .6 ? 1 : 2; i < n; i++) {
      const y0 = -H * (.2 + r() * .6), tilt = (r() - .5) * .5, pts = [];
      for (let k = 0; k <= 8; k++) { const x = xmin + (xmax - xmin) * k / 8; pts.push([x, y0 + (x - xmin) * tilt + (r() - .5) * R * .06]); }
      veins.push(pts);
    }
    const streaks = [];
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const x = xmin * .7 + (xmax - xmin) * .7 * (.1 + .8 * r()), y0 = topAt(x) + .2, y1 = baseAt(x);
      if (y1 - y0 > .8) streaks.push({ x, y0, y1: y0 + (y1 - y0) * (.45 + r() * .5), w: .18 + r() * .22 });
    }
    const cracks = [];
    for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) {
      const p = top[Math.floor(r() * top.length)], c = [], dx = (r() - .5) * R * .3;
      if (p[1] < topC[1]) continue;                        // only on the near side, where you'd see it
      for (let k = 0; k <= 4; k++) c.push([p[0] + dx * k / 4 + (r() - .5) * R * .06, p[1] + (baseAt(p[0]) - p[1]) * .7 * k / 4]);
      cracks.push(c);
    }
    const lichen = [];
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const src = r() < .6 ? top : rings[6], p = src[Math.floor(r() * src.length)], u = .5 + r() * .45;
      lichen.push({ x: topC[0] + (p[0] - topC[0]) * u, y: topC[1] + (p[1] - topC[1]) * u, r: R * (.04 + r() * .05), c: r() < .2 ? 1 : 0 });
    }
    // Sheeting: granite peels in layers that follow its own curves. A few contour
    // lines across the near side show it (and show the shape).
    const sheetRings = { dome: [3, 5, 7], round: [4], block: [6], tower: [5], box: [6], prow: [4], beak: [5], roof: [], slab: [] }[kind] || [];
    const sheets = sheetRings.filter(() => r() < .85).map(i => {
      const rg = rings[i], c = centroid(rg), front = rg.filter(p => p[1] >= c[1] - R * .05).sort((a, b) => a[0] - b[0]);
      const cut = Math.floor(front.length * (.08 + r() * .15)), cut2 = Math.floor(front.length * (.08 + r() * .2));
      return front.slice(cut, front.length - cut2);
    }).filter(f => f.length > 3);
    // Broad, soft variations in tone across the faces: weathering, not texture.
    const tones2 = d3range(4 + Math.floor(r() * 3)).map(() => {
      const u = .15 + r() * .7, rg = rings[Math.floor(u * (rings.length - 1))], c = centroid(rg), p = rg[Math.floor(r() * rg.length)], v = .3 + r() * .5;
      return { x: c[0] + (p[0] - c[0]) * v, y: c[1] + (p[1] - c[1]) * v, rx: R * (.25 + r() * .3), ry: R * (.15 + r() * .2), light: r() < .5, rot: (r() - .5) * 40 };
    });
    const sends = problems.reduce((s, p) => s + (p.sends || 0), 0), chalk = [];
    for (let i = 0, n = clamp(Math.round(sends / 90), 0, 6); i < n; i++) {
      const x = xmin * .6 + (xmax - xmin) * .6 * r(), y = topAt(x) + (baseAt(x) - topAt(x)) * (.25 + r() * .5);
      chalk.push({ x, y, r: .12 + r() * .08 });
    }
    // H0: the old height, still used to keep trees from standing in front of a
    // boulder, so the woods didn't move when boulders got taller.
    return { kind, H0: H * ((RECIPES[kind0] || RECIPES.block).hs), R, H, FS, rings, tones: toneAt, grad, gy0, gy1, soft, hull, base: rings[0], top, topC, veins, streaks, cracks, lichen, chalk, sheets, tones2, rock, lean, side };
  }
  // ---- faceted boulders (third version, prototyped on three Hawkwatch boulders) ----
  // Natural granite between a blob and a polyhedron: an angular footprint, steep
  // near faces, a top broken into a few tilted planes, and edges that are either
  // fractured (sharp, the face runs straight up) or weathered (rolled over in a
  // two-step bevel). Built in 3D (x east, y north, z up), drawn in the map's
  // three-quarter view, each facet toned by the way it faces. A recipe per form
  // sets the character; the boulder's own seed varies every vertex.
  const RECIPES = {
    dome: { n: 10, aspect: 1.12, top: .52, hs: 1.3, w: [.65, 1], fractures: 2, crown: .3, lean: 0 },
    round: { n: 8, aspect: 1.04, top: .56, hs: 1.05, w: [.55, 1], fractures: 1, crown: .16, lean: 0 },
    beak: { n: 7, aspect: 1.25, top: .42, hs: 1.2, w: [0, .3], fractures: 3, crown: .1, lean: .65, hook: .95 },
    prow: { n: 7, aspect: 1.2, top: .54, hs: 1.15, w: [.05, .4], fractures: 3, crown: .08, lean: .5, hook: .55 },
    slab: { n: 8, aspect: 1.5, top: .86, hs: 1.4, w: [.2, .6], fractures: 2, crown: .06, lean: 0, slope: [-.95, .3], step: .26 },
    roof: { n: 8, aspect: 1.25, top: .82, hs: 1, w: [.1, .4], fractures: 3, crown: .05, lean: .25 },
    box: { n: 6, aspect: 1.05, top: .8, hs: 1, w: [.1, .45], fractures: 3, crown: .05, lean: 0 },
    tower: { n: 7, aspect: .95, top: .8, hs: 1.1, w: [.1, .5], fractures: 3, crown: .07, lean: 0 },
    block: { n: 7, aspect: 1.1, top: .74, hs: 1, w: [.2, .7], fractures: 2, crown: .1, lean: 0 },
    // Stage 6: more forms. An overhanging wall along a whole side (no point), a
    // block leaning out over an undercut, a block with a step in its top, a thin
    // flake, a long rounded loaf, and a wedge that ramps up to one end.
    wave: { n: 8, aspect: 1.3, top: .62, hs: 1, w: [.1, .4], fractures: 3, crown: .06, lean: .4, wave: .36 },
    leaner: { n: 7, aspect: 1.1, top: .7, hs: 1, w: [.1, .45], fractures: 2, crown: .08, lean: .5, under: true },
    tiered: { n: 8, aspect: 1.2, top: .78, hs: 1, w: [.1, .5], fractures: 3, crown: .04, lean: 0, step: .24 },
    fin: { n: 6, aspect: 1.9, top: .58, hs: 1, w: [.05, .3], fractures: 3, crown: .24, lean: 0 },
    loaf: { n: 9, aspect: 1.6, top: .6, hs: 1, w: [.6, 1], fractures: 1, crown: .22, lean: 0 },
    wedge: { n: 6, aspect: 1.35, top: .72, hs: 1, w: [.05, .3], fractures: 3, crown: .04, lean: 0, slope: [1, .15] },
  };
  // The drawing's own light: from the upper left and a little in front, so near
  // faces sit in the mid-tones and the far side goes dark (the clock's light is
  // added on top in paint.js).
  const FACET_LIGHT = (() => { const v = [-.5, -.42, .75], m = Math.hypot(...v); return v.map(x => x / m); })();
  function facetForm(b, problems, v2) {
    const r = rand("facet" + b.name + b.sector), kind = v2.kind, P = RECIPES[kind] || RECIPES.block;
    const R = v2.R, H = drawnHeight(b.height_ft) * (kind === "slab" || kind === "wedge" ? 1.1 : 1), FS = v2.FS;
    const sub = (a, c) => a.map((x, i) => x - c[i]), dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    const norm = v => { const m = Math.hypot(...v) || 1; return v.map(x => x / m); };
    const newell = pts => { const nn = [0, 0, 0]; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; nn[0] += (p[1] - q[1]) * (p[2] + q[2]); nn[1] += (p[2] - q[2]) * (p[0] + q[0]); nn[2] += (p[0] - q[0]) * (p[1] + q[1]); }); return norm(nn); };
    const proj = p => [p[0], -p[1] * FS - p[2]];
    // Footprint: an angular polygon, stretched and turned.
    const side = r() < .5 ? -1 : 1, leanA = -Math.PI / 2 + side * (1.1 + r() * .3), lean = [Math.cos(leanA), Math.sin(leanA)];
    const rot = P.lean ? leanA : kind === "slab" ? (r() - .5) * .5 : r() * TAU, n = P.n;
    const B = d3range(n).map(i => {
      const a = (i + (r() - .5) * .5) / n * TAU, rr = R * (.82 + r() * .3), x = Math.cos(a) * rr * P.aspect, y = Math.sin(a) * rr;
      return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot), 0];
    });
    // The top edge: smaller, shifted along the lean, at uneven heights (or sloping, for a slab).
    // A slab rises toward its high side (mostly west), so its face turns away from the light and shows its tilt.
    // Tall boulders (Stage 6) flare at the foot and taper to the top, so they read
    // as a rock mass rather than a pillar. Drawing only: the footprint you walk
    // around is still R.
    const flare = clamp((H / R - 1.6) / 3.5, 0, .32);
    if (flare) for (const p of B) { p[0] *= 1 + flare; p[1] *= 1 + flare * .7; }
    const topK = 1 - flare * .9;
    const sd = P.slope || [0, 1], proj2 = p => p[0] * sd[0] + p[1] * sd[1];
    const c = [lean[0] * R * P.lean, lean[1] * R * P.lean], ps = B.map(proj2), lo = Math.min(...ps), hi = Math.max(...ps);
    const T = B.map(p => {
      const k = P.top * topK * (.88 + r() * .24), z = P.slope ? H * (.45 + .55 * Math.pow((proj2(p) - lo) / (hi - lo || 1), 1.1)) : H * (1 - P.crown * .6 + (r() - .5) * .2);
      return [c[0] + p[0] * k, c[1] + p[1] * k, z];
    });
    if (P.hook) {          // the prow's nose: the top corner facing the lean juts out past the base
      let best = 0; B.forEach((p, i) => { if (p[0] * lean[0] + p[1] * lean[1] > B[best][0] * lean[0] + B[best][1] * lean[1]) best = i; });
      for (const [i, f] of [[best, 1], [(best + 1) % n, .35], [(best + n - 1) % n, .35]]) { T[i][0] += lean[0] * R * P.hook * f; T[i][1] += lean[1] * R * P.hook * f; T[i][2] *= 1 - .06 * f; }
    }
    if (P.wave) {          // a wave: the whole side facing the lean juts out evenly, an overhanging wall rather than a nose
      const along = p => (p[0] * lean[0] + p[1] * lean[1]) / (Math.hypot(p[0], p[1]) || 1);
      T.forEach((t, i) => { const a = along(B[i]); if (a > .2) { const f = Math.min(1, (a - .2) / .5); t[0] += lean[0] * R * P.wave * f; t[1] += lean[1] * R * P.wave * f; } });
    }
    if (P.hook || P.wave || P.under) for (const p of B) {          // undercut: the foot is narrower on the side the top leans over
      const along = (p[0] * lean[0] + p[1] * lean[1]) / (Math.hypot(p[0], p[1]) || 1);
      if (along > 0) { const k = 1 - .45 * Math.pow(along, 1.2); p[0] *= k; p[1] *= k; }
    }
    // Each corner is weathered (rolled over) or fractured (sharp); fractures come in pairs, making flat faces.
    const w = B.map(() => P.w[0] + r() * (P.w[1] - P.w[0]));
    for (let k = 0; k < P.fractures; k++) { const i = Math.floor(r() * n); w[i] = r() * .1; w[(i + 1) % n] = r() * .1; }
    // A shoulder between the base and the top: high and close to the wall where sharp, low and set back where weathered.
    const M = B.map((b0, i) => {
      const t = T[i], wi = w[i], out = norm([b0[0], b0[1], 0]);
      const f = .12 + .3 * wi, bulge = wi * R * .06;
      // Under a prow's nose the shoulder drops to half height: the wall below is the undercut, the face above it the nose's underside.
      if (P.hook && (b0[0] * lean[0] + b0[1] * lean[1]) / (Math.hypot(b0[0], b0[1]) || 1) > .1) return [b0[0] + (t[0] - b0[0]) * .22, b0[1] + (t[1] - b0[1]) * .22, t[2] * .52];
      return [b0[0] + (t[0] - b0[0]) * f + out[0] * bulge, b0[1] + (t[1] - b0[1]) * f + out[1] * bulge, t[2] * (.88 - .3 * wi)];
    });
    // The top: two tilted planes meeting at a raised crease, never one flat lid.
    // A slab breaks in a step instead: the down-slope sheet sits lower, with a riser between.
    const a0 = Math.floor(r() * n), b0i = (a0 + Math.floor(n / 2) + (r() < .5 ? 0 : 1)) % n;
    const between = (i, j) => { const out = []; for (let k = (i + 1) % n; k !== j; k = (k + 1) % n) out.push(k); return out; };
    let lowSide = null, Tlo = null;
    if (P.step) {
      const sideA = between(a0, b0i), sideB = between(b0i, a0), meanP = ix => ix.reduce((s2, k) => s2 + proj2(T[k]), 0) / (ix.length || 1);
      lowSide = meanP(sideA) < meanP(sideB) ? "A" : "B";
      for (const k of lowSide === "A" ? sideA : sideB) T[k][2] -= H * P.step;
      Tlo = [T[a0], T[b0i]].map(p => [p[0], p[1], p[2] - H * P.step]);
    }
    const crease = [(T[a0][0] + T[b0i][0]) / 2 + (r() - .5) * R * .1, (T[a0][1] + T[b0i][1]) / 2 + (r() - .5) * R * .1, (T[a0][2] + T[b0i][2]) / 2 + P.crown * H];
    const arc = (i, j) => { const out = []; for (let k = i; ; k = (k + 1) % n) { out.push(T[k]); if (k === j) break; } return out; };
    // Faces, kept if they face you, toned by the drawing's light (back to front: walls, shoulders, top).
    const V = norm([0, -1, FS]), faces = [], body = [0, 0, H * .4];
    const addFace = (pts, tier) => {
      let nrm = newell(pts);
      const ctr = pts.reduce((s2, p) => s2.map((x, i) => x + p[i] / pts.length), [0, 0, 0]);
      if (tier === 1.5) { if (nrm[2] > 0 || dot(nrm, [sd[0], sd[1], 0]) > 0) nrm = nrm.map(x => -x); }     // a riser faces down the slope
      else if (tier < 2 && dot(nrm, sub(ctr, body)) < 0) nrm = nrm.map(x => -x);
      if (tier === 2 && nrm[2] < 0) nrm = nrm.map(x => -x);
      if (dot(nrm, V) <= .03) {
        // The underside of a prow's nose: you'd only glimpse it, but drawn deep and dark it gives the overhang its thickness.
        if (P.hook && nrm[2] < -.1 && dot([nrm[0], nrm[1], 0], [lean[0], lean[1], 0]) > 0) faces.push({ pts: pts.map(proj), tier: -1, depth: -ctr[1], t: .04, up: nrm[2] });
        return;
      }
      const lit = Math.max(0, dot(nrm, FACET_LIGHT));
      faces.push({ pts: pts.map(proj), tier, depth: -ctr[1], t: Math.pow(.08 + .92 * lit, 1.2), up: nrm[2] });
    };
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; addFace([B[i], B[j], M[j], M[i]], 0); addFace([M[i], M[j], T[j], T[i]], 1); }
    if (P.step) {
      // The higher sheet keeps the crease edge; the lower one starts from the step's foot.
      const hiArc = lowSide === "A" ? arc(b0i, a0) : arc(a0, b0i), loIn = lowSide === "A" ? between(a0, b0i) : between(b0i, a0);
      const [lo0, lo1] = lowSide === "A" ? [Tlo[0], Tlo[1]] : [Tlo[1], Tlo[0]];
      addFace(hiArc, 2);
      addFace([lo0, ...loIn.map(k => T[k]), lo1], 2);
      const riser = lowSide === "A" ? [T[a0], T[b0i], Tlo[1], Tlo[0]] : [T[b0i], T[a0], Tlo[0], Tlo[1]];
      addFace(riser, 1.5);
    } else { addFace([...arc(a0, b0i), crease], 2); addFace([...arc(b0i, a0), crease], 2); }
    faces.sort((p, q) => p.tier - q.tier || q.depth - p.depth);
    const rock = v2.rock;
    const tone = u => {
      const stops = [[0, rock.deep], [.28, rock.shade], [.58, rock.mid], [.8, rock.light], [1, rock.top]];
      let i = 0; while (i < stops.length - 2 && u > stops[i + 1][0]) i++;
      const [u0, c0] = stops[i], [u1, c1] = stops[i + 1];
      return mix(c0, c1, clamp((u - u0) / (u1 - u0), 0, 1));
    };
    for (const f of faces) f.fill = tone(f.t);
    const all = [B, M, T, [crease]].flat().map(proj), hull = hullOf(all);
    const base = B.map(proj), topC = proj(crease);
    // Restrained lichen on the upward planes; chalk where hands go on the near faces.
    const tops = faces.filter(f => f.up > .5), fronts = faces.filter(f => f.tier === 0);
    const lichen = d3range(2 + Math.floor(r() * 3)).map(() => { const f = tops[Math.floor(r() * tops.length)] || faces[0], cc = centroid(f.pts), p = f.pts[Math.floor(r() * f.pts.length)], u = .2 + r() * .5;
      return { x: cc[0] + (p[0] - cc[0]) * u, y: cc[1] + (p[1] - cc[1]) * u, r: R * (.035 + r() * .035), c: 0 }; });
    const sends = problems.reduce((s2, p) => s2 + (p.sends || 0), 0);
    const chalk = d3range(clamp(Math.round(sends / 90), 0, 6)).map(() => { const f = fronts[Math.floor(r() * fronts.length)] || faces[0], cc = centroid(f.pts); return { x: cc[0] + (r() - .5) * R * .2, y: cc[1] + (r() - .5) * R * .1, r: .12 + r() * .08 }; });
    return { ...v2, style: "facet", H, H0: v2.H0, faces, hull, base, top: T.map(proj), topC, lichen, chalk, lean, under: null };
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

  // ---- spatial indexes -----------------------------------------------------------------
  // The park is ~1.5 km²: tens of thousands of trees, so "what's near here?"
  // has to be a grid lookup, not a scan.
  function pointIndex(cell) {
    const m = new Map(), key = (i, j) => i * 65536 + j;
    return {
      add(p, v) { const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); },
      // Calls fn for everything within r of p's cells; fn returning true stops early (and some() returns true).
      some(p, r, fn) {
        const i0 = Math.floor((p[0] - r) / cell), i1 = Math.floor((p[0] + r) / cell), j0 = Math.floor((p[1] - r) / cell), j1 = Math.floor((p[1] + r) / cell);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = m.get(key(i, j)); if (a) for (const v of a) if (fn(v)) return true; }
        return false;
      },
    };
  }
  // Distance to the nearest of a set of polylines (trails, brooks, walls), capped at max.
  function lineIndex(lines, cell = 24) {
    const m = new Map(), key = (i, j) => i * 65536 + j;
    for (const pts of lines) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
        for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
          const k = key(x, y); let arr = m.get(k); if (!arr) m.set(k, arr = []); arr.push([a, b]);
        }
    }
    return (p, max = 40) => {
      let d = max;
      const i0 = Math.floor((p[0] - max) / cell), i1 = Math.floor((p[0] + max) / cell), j0 = Math.floor((p[1] - max) / cell), j1 = Math.floor((p[1] + max) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const arr = m.get(key(i, j)); if (arr) for (const [a, b] of arr) { const s = segDist(p, a, b); if (s < d) d = s; } }
      return d;
    };
  }

  // ---- the park's scene --------------------------------------------------------------------
  // The whole park, one place: forest everywhere except where something has
  // opened it up. Open ground comes in kinds: the bald summit, each area's
  // clearing among its boulders, the Back Forty's hayfield, Mill Pond and the
  // reservoir, the old quarry, the grout heaps, the lot and the road. Trees grow
  // in groves with glades between them (two layers of noise), and each area has
  // its own woods: hemlocks in the hollow and the gully, birches on the quarry
  // waste, old apple trees by the cellar holes and the farm, maples round the
  // schoolhouse, pitch pines on the summit's edge.
  //
  // Big, sparse things (trees, boulders, landmarks, open ground, water, walls)
  // are placed here once. Small, many things (shrubs, ferns, grass, flowers,
  // logs, patches) are placed per tile by detail(), only when a tile is drawn.
  const TILE = 90;
  function parkScene(D, opts = {}) {
    const t0 = Date.now();
    const seed = "park";
    const R = rand(seed);
    const sec = Object.fromEntries(D.sectors.map(s => [s.name, s]));
    const bx = D.boulders.map(b => b.x), by = D.boulders.map(b => b.y);
    const fx = D.features.flatMap(f => [f.x - f.r, f.x + f.r]), fy = D.features.flatMap(f => [f.y - f.r, f.y + f.r]);
    // Generous margins: the forest runs on past the areas at the edges, under the page's fade.
    const bounds = [Math.min(...bx, ...fx) - 190, Math.max(...bx, ...fx) + 200, -150, Math.max(...by, ...fy) + 170];
    const inB = p => p[0] >= bounds[0] && p[0] <= bounds[1] && p[1] >= bounds[2] && p[1] <= bounds[3];
    const nGrove = noise(seed + "grove"), nKind = noise(seed + "kind"), nEdge = noise(seed + "edge");
    const AS = Art.scenery(D);           // the game's own streams, stone walls and ruins, so the two maps agree

    // ---- boulders, their forms, and the space they need kept clear
    const boulders = D.boulders.map((b, i) => {
      const probs = b.problems.map(k => D.problems[k]), form = boulderForm(b, probs);
      return { id: i, b, form: facetForm(b, probs, form) };
    });
    const bIndex = pointIndex(30);
    for (const bo of boulders) bIndex.add([bo.b.x, bo.b.y], bo);
    const blocked = (p, pad) => bIndex.some(p, 30 + pad, ({ b, form }) => {
      const dx = p[0] - b.x, dy = p[1] - b.y;
      if (Math.hypot(dx, dy) < form.R * 1.15 + pad) return true;
      // In front (south) of a boulder: anything tall standing there would hide it.
      return dy < 0 && dy > -(form.R + (form.H0 ?? form.H) + pad * 2.2) && Math.abs(dx) < form.R * 1.1 + pad;
    });
    const nearBoulder = (p, pad) => bIndex.some(p, 30 + pad, ({ b, form }) => Math.hypot(p[0] - b.x, p[1] - b.y) < form.R * 1.2 + pad);

    // ---- lines on the ground: trails, brooks, stone walls
    const trails = D.trails.map(t => ({ to: t.to, pts: trailPoints(t) }));
    const trailDist = lineIndex(trails.map(t => t.pts));
    // Brooks bend around boulders rather than running under them.
    const skirt = pts => pts.map(p => {
      let q = p;
      for (const bo of boulders) { const dx = q[0] - bo.b.x, dy = q[1] - bo.b.y, d = Math.hypot(dx, dy), need = bo.form.R * 1.7 + 2; if (d < need) q = [bo.b.x + dx / (d || 1) * need, bo.b.y + dy / (d || 1) * need]; }
      return q;
    });
    const streams = AS.streams.map(s => ({ name: s.name, pts: smoothLine(skirt(smoothLine(s.pts, 6)), 3) }));
    // The millrace: a stone-lined channel that once carried Mill Pond's water to the mill wheel.
    const millMark = AS.marks.find(m => m.kind === "mill"), pondF = D.features.find(f => f.kind === "water" && !f.dam_toward);
    if (millMark && pondF) {
      const a = Math.atan2(millMark.y - pondF.y, millMark.x - pondF.x), p0 = [pondF.x + Math.cos(a) * pondF.r * .95, pondF.y + Math.sin(a) * pondF.r * .95], p1 = [millMark.x - 11, millMark.y + 2];
      const mid = [(p0[0] + p1[0]) / 2 + 6, (p0[1] + p1[1]) / 2 - 8];
      streams.push({ name: "the millrace", race: true, pts: smoothLine(skirt([p0, mid, p1]), 2) });
    }
    const streamDist = lineIndex(streams.map(s => s.pts));
    const walls = AS.walls.map(w => smoothLine(w, 2.5));
    const wallDist = lineIndex(walls);
    // Footbridges where trails cross brooks.
    const bridges = [];
    const cross = (a, b, c, d) => { const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (!den) return null; const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t, Math.atan2(r[1], r[0])] : null; };
    for (const t of trails) for (const st of streams) for (let i = 1; i < t.pts.length; i++) for (let j = 1; j < st.pts.length; j++) {
      const x = cross(t.pts[i - 1], t.pts[i], st.pts[j - 1], st.pts[j]);
      if (x && !bridges.some(b => Math.hypot(b.x - x[0], b.y - x[1]) < 6)) bridges.push({ x: x[0], y: x[1], a: x[2], race: !!st.race });
    }

    // ---- open ground. Each zone has a ragged edge; depth(p) is metres inside it (negative outside).
    const zones = [];
    const ragged = (name, c, Rz, wob = .4, freq = 1.6, flat = null, square = 0) => {
      const n = noise("zone" + name);
      const edge = a => {
        let r = Rz * (1 - wob / 2 + wob * fbm(n, Math.cos(a) * freq + 3, Math.sin(a) * freq + 3, 3));
        if (square) { const b = a - .35, q = Math.pow(Math.pow(Math.abs(Math.cos(b)), square) + Math.pow(Math.abs(Math.sin(b)), square), -1 / square); r *= q * .9; }   // cut square, like a quarry
        if (flat) { const da = Math.abs(((a - flat.a + Math.PI * 3) % TAU) - Math.PI); if (da < flat.w) r = r + (flat.r - r) * smooth(flat.w, flat.w * .4, da); }
        return r;
      };
      return { c, R: Rz * (1 + wob / 2), edge, depth: p => { const dx = p[0] - c[0], dy = p[1] - c[1]; return edge(Math.atan2(dy, dx)) - Math.hypot(dx, dy); },
        ring: (k = 1, m = 96) => d3range(m).map(i => { const a = i / m * TAU, r = edge(a) * k; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; }) };
    };
    // The summit: open granite with a ragged edge (Hawkwatch).
    const hw = sec["Hawkwatch"];
    const bald = ragged("bald", [hw.x - 2, hw.y + 6], hw.radius * 1.02, .42);
    zones.push({ kind: "bald", name: "Hawkwatch", ...bald });
    // Water: Mill Pond, the reservoir (flat along its dam) and the quarry's flooded pit.
    const water = [];
    for (const f of D.features.filter(f => f.kind === "water")) {
      let flat = null, dam = null;
      if (f.dam_toward) {
        const a = Math.atan2(f.dam_toward[1] - f.y, f.dam_toward[0] - f.x), rr = f.r * .9;
        flat = { a, w: .42, r: rr };
        const c = [f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr], half = f.r * .3, u = [-Math.sin(a), Math.cos(a)];
        dam = { a, c, p0: [c[0] - u[0] * half, c[1] - u[1] * half], p1: [c[0] + u[0] * half, c[1] + u[1] * half] };
      }
      const z = { kind: "water", name: f.name, f, dam, ...ragged(f.name, [f.x, f.y], f.r, .3, 1.3, flat) };
      zones.push(z); water.push(z);
    }
    const qf = D.features.find(f => f.kind === "quarry");
    let quarry = null;
    if (qf) {
      quarry = { kind: "quarry", name: qf.name, f: qf, ...ragged(qf.name, [qf.x, qf.y], qf.r, .1, 1.2, null, 5) };
      const pool = { kind: "water", name: qf.name + " pool", f: qf, pit: true, ...ragged(qf.name + "pool", [qf.x + qf.r * .06, qf.y - qf.r * .1], qf.r * .62, .12, 1.4, null, 4) };
      zones.push(quarry, pool); water.push(pool);
    }
    // The Back Forty's hayfield (where the game puts it).
    const field = AS.field ? { kind: "field", name: "Back Forty field", ...ragged("field", [AS.field.x, AS.field.y], AS.field.r * .92, .5, 1.9) } : null;
    if (field) zones.push(field);
    // Every other area: a clearing among its boulders, trampled by climbers.
    for (const s of D.sectors) {
      if (s.name === "Hawkwatch") continue;
      const kind = s.name === "The Grout Piles" ? "grout" : "clearing";
      const mossy = s.name === "Hemlock Hollow" || s.name === "Bracken Gully";      // the shady areas: smaller clearings, moss underfoot
      zones.push({ kind, name: s.name, sector: s, mossy, ...ragged("clear" + s.name, [s.x, s.y], s.radius * (kind === "grout" ? 1.12 : mossy ? .84 : .98), .45) });
    }
    // The lot and the road (the game's: lot x -26..26, y -28..4, road along y -38).
    const rect = (x0, x1, y0, y1) => p => Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
    const lot = { kind: "lot", name: "lot", c: [0, -12], R: 40, depth: rect(-29, 29, -31, 7) };
    const road = { kind: "road", name: "Quarry Hill Road", c: [0, -38], R: 1e4, depth: p => 7 - Math.abs(p[1] + 38) };
    const drive = { kind: "lot", name: "drive", c: [0, -34], R: 12, depth: rect(-4, 4, -40, -28) };
    zones.push(lot, road, drive);
    // The verge by the lot: mown grass and the trailhead.
    zones.push({ kind: "clearing", name: "verge", ...ragged("verge", [0, 14], 34, .3) });

    const openAt = p => {
      let best = null, bd = -Infinity;
      for (const z of zones) {
        if (z.R < 1e3 && Math.abs(p[0] - z.c[0]) > z.R + 40) continue;
        if (z.R < 1e3 && Math.abs(p[1] - z.c[1]) > z.R + 40) continue;
        const d = z.depth(p);
        if (d > bd) { bd = d; best = z; }
      }
      return { z: best, kind: best && bd > 0 ? best.kind : "forest", depth: bd };
    };
    const inWater = (p, pad = 0) => water.some(z => Math.abs(p[0] - z.c[0]) < z.R + pad + 5 && z.depth(p) > -pad);

    // ---- the bald's granite: ledges through the heath, more of it toward the top
    const nRock = noise(seed + "rock"), ROCK_T = .64;
    const rockAt = p => {
      const d = bald.depth(p);
      if (d <= 0) return 0;
      return fbm(nRock, p[0] / 15, p[1] / 15, 3) * .85 + .32 * smooth(0, 40, d) + .15 * smooth(2, 10, d) - .12;
    };
    const baldR = hw.radius * 1.02, cell = 1.5, gx0 = bald.c[0] - baldR * 1.3, gy0 = bald.c[1] - baldR * 1.3, gn = Math.ceil(baldR * 2.6 / cell);
    const rockGrid = { x0: gx0, y0: gy0, cell, nx: gn, ny: gn, t: ROCK_T, values: new Float64Array(gn * gn) };
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) rockGrid.values[j * gn + i] = rockAt([gx0 + i * cell, gy0 + j * cell]);

    // ---- elevation (the game's hills), for the ground's light and shade
    const elevAt = (x, y) => { let z = D.base_elevation_m; for (const h of D.hills) z += h.amp * Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / (2 * h.sigma ** 2)); return z; };

    // ---- each area's woods. Weights per species; a tree picks its stand from the
    // areas around it (nearer areas count for more), so stands blend at their edges.
    const WOODS = {
      "Hemlock Hollow": { hemlock: 7, birch: 1.2, whitepine: 1, maple: .6 },
      "Bracken Gully": { hemlock: 5, birch: 2, maple: 1.5, oak: .8 },
      "The Grout Piles": { birch: 4.5, whitepine: 2.5, maple: 1.5, oak: 1 },
      "Back Forty": { maple: 3.5, oak: 3, apple: 1.2, whitepine: 1.5, birch: 1 },
      "The Cellar Holes": { maple: 3.5, apple: 2, oak: 2, birch: 1.5, whitepine: .8 },
      "The Schoolhouse": { maple: 5, oak: 3, birch: 1.5, whitepine: .8 },
      "Millrace Caves": { hemlock: 3, birch: 3, maple: 2.5, oak: 1.5 },
      "The Spillway": { hemlock: 3, birch: 3, maple: 2, whitepine: 1.5 },
      "The Tailgate": { whitepine: 3, oak: 3, maple: 2.5, birch: 1 },
      "Hawkwatch": { oak: 3, pitch: 2.5, maple: 2, whitepine: 1.5, birch: 1 },
    };
    const pick = (w, roll) => { let tot = 0; for (const k in w) tot += w[k]; let acc = 0; for (const k in w) { acc += w[k] / tot; if (roll < acc) return k; } return Object.keys(w)[0]; };
    const woodsAt = p => {
      const k = fbm(nKind, p[0] / 46, p[1] / 46, 2);
      // The wild woods between areas: groves of hemlock, birch, maple-oak and white pine by noise.
      const wild = k < .36 ? { hemlock: 6.8, birch: 1.6, maple: 1.6 } : k < .5 ? { birch: 5.5, maple: 2.5, whitepine: 2 } : k < .68 ? { maple: 5, oak: 3.5, birch: 1.5 } : { oak: 5, whitepine: 2.8, maple: 2.2 };
      const mix2 = {}; const add = (w, f) => { let tot = 0; for (const s in w) tot += w[s]; for (const s in w) mix2[s] = (mix2[s] || 0) + w[s] / tot * f; };
      add(wild, .7);
      for (const s of D.sectors) { const d = Math.hypot(p[0] - s.x, p[1] - s.y) / (s.radius * 2.4); if (d < 2.2) add(WOODS[s.name] || wild, 2.2 * Math.exp(-d * d)); }
      if (inWater(p, 30)) add({ birch: 3, hemlock: 2, maple: 2 }, 1.2);
      return mix2;
    };

    // ---- trees
    const trees = [], tIndex = pointIndex(8);
    for (const p of scatter(seed + "trees", bounds, 3.7)) {
      const td = trailDist(p, 12);
      if (td < 4 || streamDist(p, 4) < 3 || wallDist(p, 3) < 1.6) continue;
      const o = openAt(p);
      // Groves (dense, crowns overlapping) and glades (nearly open), at two scales.
      const grove = fbm(nGrove, p[0] / 52, p[1] / 52, 3), gap = fbm(nGrove, p[0] / 17 + 40, p[1] / 17, 2);
      // (A little denser than the Hawkwatch-only version's noise gave: the park's woods should read as woods.)
      let dens = .07 + .93 * smooth(.36, .53, grove);
      dens *= .28 + .72 * smooth(.27, .44, gap);
      let heath = false;
      if (o.kind === "bald") { heath = rockAt(p) < ROCK_T - .05; dens = heath ? (o.depth < 8 ? .2 : .07) : 0; }
      else if (o.kind === "clearing") dens = (o.z.mossy ? .08 : .03) + .35 * (1 - smooth(0, 9, o.depth));
      else if (o.kind === "grout") dens = .05 + .3 * (1 - smooth(0, 7, o.depth));
      else if (o.kind === "field") dens = wallDist(p, 8) < 6 ? .55 : .004;      // hedgerow trees along the walls, the odd lone tree
      else if (o.kind !== "forest") continue;                                    // water, quarry, lot, road
      else dens *= .3 + .7 * smooth(0, 18, -o.depth);
      if (o.kind === "forest" && o.z && (o.z.kind === "water") && -o.depth < 3) continue;   // nothing on the shoreline itself
      if (td < 7) dens *= .5;
      if (R() > dens) continue;
      let kind;
      const edgeOfBald = o.z && o.z.kind === "bald" && (o.kind === "bald" || -o.depth < 26);
      if (o.kind === "bald") kind = R() < .85 ? "pitch" : "oak";
      else if (edgeOfBald && R() < .45) kind = R() < .7 ? "pitch" : "oak";
      else if (o.kind === "field") kind = R() < .6 ? "maple" : R() < .5 ? "apple" : "oak";
      else kind = pick(woodsAt(p), R());
      const ever = ["pitch", "hemlock", "whitepine"].includes(kind);
      let size = .66 + .62 * fbm(nGrove, p[0] / 25 + 9, p[1] / 25, 2) + (R() - .5) * .36;
      if (!ever && R() < .04) size *= 1.45;        // an old giant here and there
      if (o.kind === "bald") size *= .7;
      if (kind === "apple") size *= .8;
      const crownR = { maple: 3.3, oak: 3.8, birch: 2.5, pitch: 2.8, hemlock: 2.7, whitepine: 3.1, apple: 2.6 }[kind] * size;
      if (blocked(p, crownR * .6)) continue;
      // Foreground trees (open edges, trailsides, beside boulders, water and walls, the old giants)
      // get the full illustration; the rest of the forest is painted as one soft canopy.
      const fg = o.kind !== "forest" || -o.depth < 14 || td < 9 || nearBoulder(p, 14) || size > 1.3 || streamDist(p, 8) < 7 || wallDist(p, 8) < 5;
      if (fg) size *= 1.08;
      const t = { x: +p[0].toFixed(2), y: +p[1].toFixed(2), kind, ever, fg, size: +size.toFixed(3), v: Math.floor(R() * 3), shape: Math.floor(R() * 6), flip: R() < .5, crownR: crownR * (fg ? 1.08 : 1) };
      // None on the lot or its drive (the verge beside it once let one in). Checked
      // after every draw for this tree, so the rest of the woods stays where it was.
      if (lot.depth(p) > -crownR * .7 || drive.depth(p) > -crownR * .7) continue;
      trees.push(t); tIndex.add(p, t);
    }

    // ---- light under the canopy: soft pools of shade and light across the floor
    const washes = scatter(seed + "wash", bounds, 26).map(p => ({ x: p[0], y: p[1], r: 16 + R() * 22, tone: fbm(nGrove, p[0] / 40, p[1] / 40, 2) > .5 ? 1 : 0, seed: Math.floor(R() * 1e6) }));

    // ---- landmarks: each area's own vignettes, placed beside what they belong to
    const landmarks = [], taken = [];
    const byName = name => boulders.find(x => x.b.name === name);
    const removeTrees = (p, rad) => { for (let i = trees.length - 1; i >= 0; i--) if (Math.abs(trees[i].x - p[0]) < rad + 6 && Math.hypot(trees[i].x - p[0], trees[i].y - p[1]) < rad + trees[i].crownR * .55) { trees[i].gone = true; trees.splice(i, 1); } };
    function spot(c, d0, foot, prefer, rs) {
      // Around c at distance ~d0; behind (north of) or beside a boulder, so it never hides one.
      const rr = rand("spot" + c[0] + "," + c[1] + d0);
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 80; i++) {
        const a = (prefer ?? Math.PI / 2) + (rr() - .5) * Math.PI * (i < 25 ? .8 : 1.9), d = d0 * (1 + rr() * .6);
        const p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
        if (blocked(p, foot) || trailDist(p, 20) < foot + 1.6 || inWater(p, foot) || taken.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < q[2] + foot)) continue;
        if (rs && !rs(p)) continue;
        const score = -Math.abs(d - d0) - Math.abs(a - (prefer ?? Math.PI / 2)) * 2;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) taken.push([best[0], best[1], foot]);
      return best;
    }
    for (const [area, list] of Object.entries(VIGNETTES)) {
      const s = sec[area]; if (!s) continue;
      for (const v of list) {
        if (v.when === "never") continue;
        let c;
        if (v.near === "center") c = [s.x, s.y];
        else if (v.near === "summit") c = [s.x, s.y + s.radius * .35];
        else if (v.near === "at") c = [0, 0];
        else { const bb = byName(v.near); if (!bb) continue; c = [bb.b.x, bb.b.y]; }
        const nearR = v.near === "center" || v.near === "summit" || v.near === "at" ? 0 : byName(v.near).form.R;
        let p;
        if (v.exact) { p = [c[0] + v.exact[0], c[1] + v.exact[1]]; taken.push([p[0], p[1], v.foot ?? 2]); }
        else if (v.kind === "signpost") {
          // Beside the trail junction, a step off the path.
          const rr = rand("sign" + area);
          for (let i = 0; i < 120 && !p; i++) { const a = rr() * TAU, d = 3.5 + rr() * 6, q = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]; const t = trailDist(q, 10); if (t > 2 && t < 3.4 && !blocked(q, 1)) p = q; }
        } else p = spot(c, nearR + (v.gap ?? 4), v.foot ?? 2, v.prefer, v.onOpen ? q => openAt(q).kind !== "forest" : null);
        if (!p) continue;
        removeTrees(p, v.clear ?? (v.foot ?? 2) + 1.5);
        landmarks.push({ ...v, area, x: +p[0].toFixed(2), y: +p[1].toFixed(2), id: area + ":" + v.kind + ":" + (v.name || v.near) });
      }
    }
    // The game's own ruins, where it puts them: the schoolhouse foundation, the mill, the cellar holes, grout heaps, hay bales.
    for (const m of AS.marks) {
      if (!["foundation", "mill", "cellar", "grout", "bales"].includes(m.kind)) continue;
      const area = D.sectors.reduce((a, s) => Math.hypot(m.x - s.x, m.y - s.y) < Math.hypot(m.x - a.x, m.y - a.y) ? s : a).name;
      const foot = { foundation: 14, mill: 12, cellar: 7, grout: 12, bales: 18 }[m.kind];
      removeTrees([m.x, m.y], foot * .8);
      landmarks.push({ kind: m.kind, area, x: m.x, y: m.y, rot: m.rot, foot, ground: true, id: area + ":" + m.kind + ":" + m.x,
        note: { foundation: "the schoolhouse foundation", mill: "the old mill, burned 1891", cellar: null, grout: null, bales: null }[m.kind] });
    }
    for (const c of landmarks.filter(l => l.kind === "cellar")) { c.note = c === landmarks.find(l => l.kind === "cellar") ? "cellar holes" : null; }
    // Trail markers across open rock: cairns every so often.
    const cairns = [];
    for (const t of trails) {
      let acc = 0;
      for (let i = 1; i < t.pts.length; i++) {
        acc += Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]);
        if (acc < 22) continue;
        const p = t.pts[i], dx = t.pts[i][0] - t.pts[i - 1][0], dy = t.pts[i][1] - t.pts[i - 1][1], L = Math.hypot(dx, dy) || 1;
        const q = [p[0] - dy / L * 2.2, p[1] + dx / L * 2.2];
        if (bald.depth(q) > 4 && !blocked(q, 1) && Math.hypot(q[0] - hw.x, q[1] - hw.y) > 9) { cairns.push({ x: q[0], y: q[1], s: .8 + R() * .3 }); acc = 0; }
      }
    }

    // ---- the small things, one tile at a time (deterministic per tile)
    const nPatch = noise(seed + "patch"), nWet = noise(seed + "wet"), nGround = noise(seed + "ground");
    const crowdedAt = (p, rad) => { let n = 0; tIndex.some(p, rad, u => (Math.abs(u.x - p[0]) < rad && Math.abs(u.y - p[1]) < rad && ++n >= 4)); return n >= 4; };
    function detail(tx, ty) {
      const tb = [bounds[0] + tx * TILE, bounds[0] + (tx + 1) * TILE, bounds[2] + ty * TILE, bounds[2] + (ty + 1) * TILE];
      tb[1] = Math.min(tb[1], bounds[1]); tb[3] = Math.min(tb[3], bounds[3]);
      if (tb[1] <= tb[0] || tb[3] <= tb[2]) return null;
      const r = rand(`tile${tx},${ty}`), key = `${tx},${ty}`;
      const shrubs = [], ferns = [], grass = [], flowers = [], shrooms = [], logs = [], stumps = [], patches = [], reeds = [], rubble = [];
      const nearTree = p => tIndex.some(p, 3, t => Math.abs(t.x - p[0]) < 3 && Math.abs(t.y - p[1]) < 3);
      const gully = sec["Bracken Gully"], hollow = sec["Hemlock Hollow"];
      const fernBoost = p => Math.max(...[gully, hollow].filter(Boolean).map(s => 1 - smooth(s.radius * 1.2, s.radius * 2.6, Math.hypot(p[0] - s.x, p[1] - s.y))));
      for (const p of scatter("under" + key, tb, 2.6)) {
        const o = openAt(p), td = trailDist(p, 8);
        if (td < 2.2 || o.kind === "water" || o.kind === "lot" || o.kind === "road" || blocked(p, .8) || nearBoulder(p, 3)) continue;
        // the water's edge: reeds and cattails
        const wz = o.z && o.z.kind === "water" ? o : null;
        if (wz && -o.depth < 3.5 && !o.z.pit) { if (r() < .55) reeds.push({ x: p[0], y: p[1], s: .8 + r() * .6, rot: Math.round((r() - .5) * 30) }); continue; }
        const patch = fbm(nPatch, p[0] / 16, p[1] / 16, 2), wet = fbm(nWet, p[0] / 30, p[1] / 30, 2), fb = fernBoost(p);
        if (o.kind === "bald") {
          const rk = rockAt(p);
          if (rk > ROCK_T - .02) { if (rk < ROCK_T + .03 && r() < .25) grass.push({ x: p[0], y: p[1], s: .6 + r() * .4, rot: Math.round((r() - .5) * 30) }); }
          else if (patch > .6 && r() < .14) shrubs.push({ x: p[0], y: p[1], kind: "blueberry", s: 1.1 + r() * .6, v: Math.floor(r() * 3) });
          else if (r() < .38) grass.push({ x: p[0], y: p[1], s: .8 + r() * .6, rot: Math.round((r() - .5) * 30) });
        } else if (o.kind === "field") {
          if (r() < .7) grass.push({ x: p[0], y: p[1], s: 1 + r() * .7, rot: Math.round((r() - .5) * 26), tall: true });
        } else if (o.kind === "quarry") {
          if (r() < .3) rubble.push({ x: p[0], y: p[1], s: .4 + r() * .6, a: r() * 180 });
        } else if (o.kind === "grout") {
          if (r() < .4) rubble.push({ x: p[0], y: p[1], s: .4 + r() * .7, a: r() * 180 });
          else if (r() < .25) grass.push({ x: p[0], y: p[1], s: .7 + r() * .4, rot: Math.round((r() - .5) * 30) });
        } else if (o.kind === "clearing") {
          if (fb > .3 && r() < .4 * fb) ferns.push({ x: p[0], y: p[1], s: .9 + r() * .7, rot: Math.round((r() - .5) * 40) });
          else if (patch > .62 && r() < .12) shrubs.push({ x: p[0], y: p[1], kind: "laurel", s: .8 + r() * .5, v: Math.floor(r() * 3) });
          else if (r() < .4) grass.push({ x: p[0], y: p[1], s: .8 + r() * .5, rot: Math.round((r() - .5) * 30) });
        } else if (-o.depth < 7 && o.z && o.z.kind === "bald") {
          if (patch > .58 && r() < .3) shrubs.push({ x: p[0], y: p[1], kind: "blueberry", s: 1.1 + r() * .6, v: Math.floor(r() * 3) });
          else if (r() < .45) grass.push({ x: p[0], y: p[1], s: .8 + r() * .6, rot: Math.round((r() - .5) * 30) });
        } else if (!nearTree(p)) {
          const sd = streamDist(p, 10);
          if ((wet > .56 || sd < 8 || fb > .4) && r() < .35 + .4 * fb) ferns.push({ x: p[0], y: p[1], s: .9 + r() * .7 + fb * .3, rot: Math.round((r() - .5) * 40) });
          else if (patch > .66 && r() < .3) shrubs.push({ x: p[0], y: p[1], kind: "laurel", s: .8 + r() * .6, v: Math.floor(r() * 3) });
          else if ((td < 6 || -o.depth < 6) && r() < .5) grass.push({ x: p[0], y: p[1], s: .7 + r() * .5, rot: Math.round((r() - .5) * 30) });
        }
      }
      // Wildflowers grow in drifts: trail edges, open ground and its margins, the hayfield most of all.
      for (const c of scatter("drifts" + key, tb, 16)) {
        const o = openAt(c), td = trailDist(c, 10);
        const openish = o.kind === "field" || o.kind === "clearing" || (o.kind === "bald" && o.depth < 14) || (o.kind === "forest" && -o.depth < 10 && o.z && o.z.kind !== "water" && o.z.kind !== "road") || td < 7;
        if (!openish || r() > (o.kind === "field" ? .9 : .6)) continue;
        const col = Math.floor(r() * 4), n = (o.kind === "field" ? 14 : 8) + Math.floor(r() * 12), spread = 2.5 + r() * (o.kind === "field" ? 5 : 3);
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, d = Math.sqrt(r()) * spread, p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
          if (trailDist(p, 3) < 1.6 || blocked(p, .3) || nearBoulder(p, 4) || inWater(p, 1)) continue;
          flowers.push({ x: +p[0].toFixed(2), y: +p[1].toFixed(2), c: r() < .8 ? col : Math.floor(r() * 4), s: .7 + r() * .6 });
        }
      }
      // The forest floor's small things.
      for (const p of scatter("logs" + key, tb, 26)) {
        const o = openAt(p);
        if (o.kind !== "forest" || -o.depth < 8 || trailDist(p, 8) < 5 || blocked(p, 4) || r() < .35) continue;
        const a = (r() - .5) * 1.4, L = 5 + r() * 5;
        if (tIndex.some(p, L, t => Math.hypot(t.x - p[0], t.y - p[1]) < L * .5 + 1)) continue;
        logs.push({ x: p[0], y: p[1], a, L, r: .35 + r() * .2 });
        const n = 2 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) { const u = (r() - .5) * L * .8; shrooms.push({ x: p[0] + Math.cos(a) * u, y: p[1] + Math.sin(a) * u - .6 - r() * .5, kind: r() < .6 ? "bracket" : "cap", s: .6 + r() * .5 }); }
      }
      for (const p of scatter("stumps" + key, tb, 22)) {
        const o = openAt(p);
        if (o.kind === "water" || o.kind === "bald" || o.kind === "lot" || o.kind === "road" || o.kind === "quarry" || trailDist(p, 5) < 3 || blocked(p, 2) || r() < .8) continue;
        stumps.push({ x: p[0], y: p[1], r: .35 + r() * .25 });
        if (r() < .5) shrooms.push({ x: p[0] + .5, y: p[1] - .4, kind: "cap", s: .7 });
      }
      // The ground's own quiet variety: soft patches of leaf litter, moss and bare earth, in the open and at its edges.
      for (const p of scatter("patches" + key, tb, 7)) {
        const o = openAt(p);
        if (trailDist(p, 4) < 2.5 || r() < .35) continue;
        const g = fbm(nGround, p[0] / 22, p[1] / 22, 2);
        let kind;
        if (o.kind === "bald") { if (rockAt(p) > ROCK_T - .03) continue; kind = g < .42 ? "moss" : g < .62 ? "litter" : "earth"; }
        else if (o.kind === "clearing") kind = g < .4 ? "moss" : g < .65 ? "litter" : "earth";
        else if (o.kind === "field") { if (r() < .6) continue; kind = g < .5 ? "moss" : "earth"; }
        else if (o.kind === "forest" && -o.depth < 20 && o.z && o.z.kind !== "water" && o.z.kind !== "road") kind = g < .45 ? "moss" : "litter";
        else if (o.kind === "forest" && fernBoost(p) > .5) kind = "moss";
        else continue;
        patches.push({ x: p[0], y: p[1], r: 2.4 + r() * 3.6, kind, seed: Math.floor(r() * 1e6) });
      }
      return { key, tx, ty, bounds: tb, shrubs, ferns, grass, flowers, shrooms, logs, stumps, patches, reeds, rubble };
    }

    const tiles = { size: TILE, nx: Math.ceil((bounds[1] - bounds[0]) / TILE), ny: Math.ceil((bounds[3] - bounds[2]) / TILE) };
    const out = { bounds, tiles, zones, bald, baldC: bald.c, baldR, water, quarry, field, lot, road, streams, walls, trails, bridges, trees, boulders, landmarks, cairns, washes,
      rockGrid, rockAt, ROCK_T, openAt, inWater, trailDist, streamDist, wallDist, blocked, nearBoulder, elevAt, crowdedAt, detail, tIndex, marks: AS.marks, ms: 0 };
    out.ms = Date.now() - t0;
    return out;
  }
  // A polyline resampled through a smooth curve (Catmull-Rom), every `step` metres.
  function smoothLine(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Each area's vignettes, from its lore (naming.py's boulder descriptions).
  // near: a boulder's name, "center" (the area's trail junction), "summit", or "at" (the trailhead, 0,0).
  // when: a palette flag that has to be on for it to show (hawkWatch = Sept-Oct).
  // note: the field-guide annotation that goes with it on the map. find: its line in the notebook.
  const VIGNETTES = {
    "Hawkwatch": [
      { kind: "signpost", near: "center", note: null },
      { kind: "cairn", near: "summit", exact: [0, 0], foot: 1.5, note: null },
      { kind: "counters", near: "summit", exact: [-8, 2.5], foot: 3, when: "hawkWatch", note: "hawk counters, Sept–Oct", find: "Their chairs and tally board, every September and October" },
      { kind: "bigtree", species: "pitch", scale: 1.85, near: "summit", exact: [9, 7], foot: 2.5, clear: 6, note: "the Old Pitch Pine", name: "Old Pitch Pine", find: "Wind-bent, older than the trail" },
      { kind: "bigtree", species: "oak", scale: 1.6, near: "The Birdhouse", gap: 4, foot: 3, prefer: Math.PI * .4, clear: 6, feeder: true, note: "the feeder oak", name: "feeder oak", find: "Someone keeps it full for the chickadees" },
      { kind: "footings", near: "The Weathervane", gap: 5.5, foot: 4.5, prefer: Math.PI * .55, note: "old fire tower footings", find: "And the weathervane that outlived it" },
      { kind: "snag", near: "The Aerie", gap: 4, foot: 2, prefer: Math.PI * .6, clear: 4, note: "where the eagles nested", find: "Above The Aerie" },
      { kind: "bench", near: "The Lookout", gap: 3.5, foot: 1.8, prefer: Math.PI * .35, note: "best view in the park", find: "The reservoir one way, the quarry the other" },
    ],
    "The Tailgate": [
      { kind: "kiosk", near: "at", exact: [-6.5, 9], foot: 2.5, note: "trailhead kiosk", find: "Maps, the guestbook and Ranger Gus's notices" },   // west of the trail, clear of The Tollbooth
      { kind: "bins", near: "The Dumpster", gap: 2.5, foot: 2, prefer: Math.PI * .8, note: null, find: null },
      { kind: "dog", near: "Pickles' Rock", gap: 1.2, foot: 1, prefer: -Math.PI * .35, note: "Pickles, asleep", name: "Pickles", find: "The lot dog, napping in the shade" },
      { kind: "picnic", near: "The Cooler", gap: 3.5, foot: 2.5, prefer: Math.PI * .7, note: null, find: null },
      { kind: "signpost", near: "center", note: null },
    ],
    "The Schoolhouse": [
      { kind: "bell", near: "The Belfry", gap: 3, foot: 1.8, prefer: Math.PI * .5, note: "the old school bell", find: "Rung once a year, on the first warm day" },
      { kind: "sandpit", near: "The Sandbox", exact: [0, -1.5], foot: 0, note: null, find: null },
      { kind: "bigtree", species: "maple", scale: 1.7, near: "center", gap: 18, foot: 3, clear: 7, note: "the schoolyard maple", name: "schoolyard maple", find: "Every initial carved on The Desk started here" },
    ],
    "Millrace Caves": [
      { kind: "axle", near: "The Waterwheel", gap: 1.5, foot: 1.6, prefer: -Math.PI * .2, note: "the wheel's iron axle", find: "Still sticking out of the stone" },
      { kind: "frog", near: "The Bullfrog", gap: 1, foot: .6, prefer: -Math.PI * .3, note: null, find: null },
    ],
    "The Spillway": [
      { kind: "gauge", near: "The Floodgate", gap: 3, foot: 1.2, prefer: Math.PI * .3, note: "the flood gauge", find: "Every spring The Buoy goes under" },
    ],
    "Bracken Gully": [
      { kind: "seep", near: "The Sundew", gap: 3, foot: 3, prefer: -Math.PI * .4, note: "a seep full of sundews", find: "Small, red and carnivorous" },
      { kind: "oldstump", near: "The Stump", gap: 2, foot: 2.2, prefer: Math.PI * .7, note: "the old-growth stump", find: "Count the rings: older than the mill" },
    ],
    "The Cellar Holes": [
      { kind: "well", near: "The Well", gap: 2.5, foot: 1.8, prefer: Math.PI * .3, note: "the stone-lined well", find: "Don't drop your chalk bag" },
      { kind: "chimney", near: "The Hearthstone", gap: 2.5, foot: 2.2, prefer: Math.PI * .6, note: "a tumbled chimney", find: "Soot still on the stones" },
      { kind: "lilac", near: "center", gap: 14, foot: 2, prefer: Math.PI * .2, note: "the farmhouse lilacs", find: "Still blooming every May, a century on" },
      { kind: "bigtree", species: "apple", scale: 1.5, near: "center", gap: 22, foot: 2.5, clear: 5, note: "the old orchard", name: "old orchard", find: "Wild apples in October" },
    ],
    "Hemlock Hollow": [
      { kind: "owl", near: "The Owl", gap: 3.5, foot: 2.5, prefer: Math.PI * .5, clear: 5, note: "a barred owl's roost", find: "Listen at dusk: who cooks for you?" },
    ],
    "The Grout Piles": [
      { kind: "derrick", near: "The Derrick", gap: 4.5, foot: 2.5, prefer: Math.PI * .55, clear: 6, note: "the old derrick", find: "Its boom still points at the quarry" },
      { kind: "powderhouse", near: "The Powder House", gap: 3.5, foot: 3, prefer: Math.PI * .6, note: "the powder house", find: "Where the quarry kept its blasting powder" },
      { kind: "blocks", near: "The Offcut", gap: 4, foot: 3, prefer: Math.PI * .3, note: null, find: null },
      { kind: "nosign", near: "The Swimming Hole", gap: 3, foot: 1, prefer: Math.PI * .45, note: "no swimming (sure)", find: "Swimming is not allowed, which nobody believes" },
    ],
    "Back Forty": [
      { kind: "tractor", near: "The Tractor", gap: 3, foot: 3, prefer: Math.PI * .4, note: "the rusted tractor", find: "Nobody has moved it since the farm closed" },
      { kind: "milkcans", near: "The Milk Can", gap: 2, foot: 1.5, prefer: -Math.PI * .2, note: "milk cans by the gate", find: "The dairy left them here" },
    ],
  };

  const Illu = { facetForm, paletteAt, sunFaces, trailPoints, boulderForm, parkScene, VIGNETTES, TILE, noise, fbm, scatter, hullOf, polyDist, clamp, smooth };
  if (typeof module !== "undefined") module.exports = Illu; else root.Illu = Illu;
})(typeof window !== "undefined" ? window : globalThis);
