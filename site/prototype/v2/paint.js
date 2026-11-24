// Granite Hollow, illustrated: draws one area of the map from illustrate.js's
// scene, as layered SVG. Colours come from CSS custom properties (season and
// light), so changing the date or the clock never redraws anything:
// setDate() and setTime() only write variables (and slide a few shadow paths).
//
// Visual hierarchy, back to front:
//   ground      quiet: the forest floor, soft patches of litter, moss and earth, the bald, trails
//   understory  small plants, shrubs, snow, shade pools, cast shadows
//   canopy      the body of the forest, painted as one soft mass: the crowns of
//               every tree merged into a few paths per 90 m tile, no outlines
//   standing    what you look at: foreground trees, boulders, landmarks, logs,
//               each drawn on its own and sorted front to back
//   sky, light, labels (in screen space, by zoom and hover)
//
// Why merged paths: the first prototype drew every tree as a <use> with a
// dozen shapes inside (~9,300 elements). Chrome repaints every element of an
// SVG on each pan or zoom frame, so the cost was per element, even off screen.
(function (root) {
  const { Illu, Art } = root;
  const TAU = Math.PI * 2, clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const f1 = v => Math.round(v * 10) / 10, f2 = v => Math.round(v * 100) / 100;
  const ell = (x, y, rx, ry) => `M${f2(x - rx)},${f2(y)}a${f2(rx)},${f2(ry)} 0 1,0 ${f2(2 * rx)},0a${f2(rx)},${f2(ry)} 0 1,0 ${f2(-2 * rx)},0`;
  const circ = (x, y, r) => ell(x, y, r, r);
  const SP = p => [p[0], -p[1]];                       // world (y north) -> drawing (y down)
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- drawings as command lists ----------------------------------------------
  // Each tree, shrub and fern shape is built once, in its own frame (metres,
  // y down, the trunk's foot at 0,0), as lists of path commands per layer.
  // bake() places a copy anywhere (move, scale, mirror) as path text, so one
  // drawing serves a single foreground tree or a canopy of a thousand.
  const E = (x, y, rx, ry = rx) => [["M", x - rx, y], ["A", rx, ry, x + rx, y], ["A", rx, ry, x - rx, y]];
  function bake(cmds, X, Y, s, flip, dp = 1) {
    const r = dp === 1 ? f1 : f2, fx = flip ? -s : s;
    let out = "";
    for (const c of cmds) {
      switch (c[0]) {
        case "M": case "L": out += c[0] + r(X + fx * c[1]) + "," + r(Y + s * c[2]); break;
        case "Q": out += "Q" + r(X + fx * c[1]) + "," + r(Y + s * c[2]) + " " + r(X + fx * c[3]) + "," + r(Y + s * c[4]); break;
        case "A": out += "A" + r(s * c[1]) + "," + r(s * c[2]) + " 0 1,0 " + r(X + fx * c[3]) + "," + r(Y + s * c[4]); break;
        case "Z": out += "Z"; break;
      }
    }
    return out;
  }
  // A clump of lobes: a silhouette, a mid-tone lifted inside it, and sunlit
  // lobes on the east and west (only the sunward side is shown).
  function clump(lobes, flat = 1, lift = .12) {
    const cx = lobes.reduce((s, l) => s + l[0], 0) / lobes.length, cy = lobes.reduce((s, l) => s + l[1], 0) / lobes.length;
    const top = lobes.filter(l => l[1] <= cy + .25 * l[2]);
    return {
      dark: lobes.flatMap(([x, y, r]) => E(x, y, r, r * flat)),
      mid: lobes.flatMap(([x, y, r]) => E(cx + (x - cx) * .9, y - r * lift * flat - .04, r * .82, r * .82 * flat)),
      hlE: top.filter(l => l[0] >= cx - l[2] * .3).flatMap(([x, y, r]) => E(x + r * .2, y - r * .3 * flat, r * .5, r * .5 * flat)),
      hlW: top.filter(l => l[0] <= cx + l[2] * .3).flatMap(([x, y, r]) => E(x - r * .2, y - r * .3 * flat, r * .5, r * .5 * flat)),
      snow: top.flatMap(([x, y, r]) => E(x, y - r * flat * .5, r * .78, r * flat * .42)),
    };
  }
  const SPEC = {
    maple: { th: 3.0, R: 3.3, rx: 1, ry: .92, n: 9, lobe: .5, tw: .38 },
    oak: { th: 2.5, R: 3.8, rx: 1.2, ry: .8, n: 12, lobe: .44, tw: .5 },
    birch: { th: 4.3, R: 2.4, rx: .74, ry: 1.2, n: 10, lobe: .4, tw: .26 },
  };
  const glyphCache = new Map();
  // full: a foreground tree (trunk, branches, every lobe); otherwise a canopy tree (fewer, fuller lobes).
  function treeGlyph(kind, shape, full) {
    const key = kind + shape + full;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const r = Art.rand(`glyph-${kind}-${shape}`);
    let g;
    if (SPEC[kind]) {
      const S = SPEC[kind], R = S.R * (.88 + r() * .24), lean = (r() - .5) * .7, cx = lean * .8, cy = -(S.th + R * S.ry * .74);
      const lobes = [];
      const n = full ? S.n : Math.max(6, S.n - 4);
      for (let i = 0; i < n; i++) { const a = (i + r() * .7) / n * TAU, k = .6 + r() * .32; lobes.push([cx + Math.cos(a) * R * S.rx * k, cy + Math.sin(a) * R * S.ry * k, R * S.lobe * (.72 + r() * .5) * (full ? 1 : 1.12)]); }
      lobes.push([cx, cy, R * .7]);
      if (full) lobes.push([cx + (r() - .5) * R * .5, cy - R * .32, R * .5]);
      const C = clump(lobes);
      // Bare branches for winter, by thickness.
      const bare = [[], [], []];
      const grow = (x, y, a, len, depth) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len, mx = (x + x2) / 2 + (r() - .5) * len * .25, my = (y + y2) / 2 + (r() - .5) * len * .2;
        bare[Math.min(2, 2 - depth)].push(["M", x, y], ["Q", mx, my, x2, y2]);
        if (!depth) return;
        const k = depth >= 2 ? 3 : 2;
        for (let i = 0; i < k; i++) grow(x2, y2, a + (i - (k - 1) / 2) * (.5 + r() * .35) + (r() - .5) * .3, len * (.6 + r() * .14), depth - 1);
      };
      bare[0].push(["M", 0, 0], ["L", lean, -S.th - .2]);
      const nMain = kind === "birch" ? 2 : 3;
      for (let i = 0; i < nMain; i++) grow(lean, -S.th - .2, -Math.PI / 2 + (i - (nMain - 1) / 2) * (kind === "oak" ? .75 : .48) + (r() - .5) * .25, R * (kind === "oak" ? .62 : .58), full ? 2 : 1);
      const tw = S.tw;
      const trunk = [["M", -tw * 1.5, 0], ["Q", -tw * .9, -S.th * .5, -tw * .55 + lean, -S.th - .4], ["L", tw * .55 + lean, -S.th - .4], ["Q", tw * .9, -S.th * .5, tw * 1.5, 0], ["Z"]];
      const marks = kind === "birch" ? Array.from({ length: 6 }, () => { const y = -.4 - r() * (S.th - .4), x = lean * (-y / S.th) - tw * .5 + r() * tw * .3; return [["M", x, y], ["L", x + tw * (.3 + r() * .4), y]]; }).flat() : [];
      g = { ...C, bare, trunk, marks, birch: kind === "birch", tw, crownY: -cy, crownR: R * S.rx, ever: false };
    } else if (kind === "pitch") {
      // Gnarled and windswept: a crooked trunk leaning downwind, with tufts at the ends of the limbs.
      const H = 6.4 + r() * 1.6, wind = .8 + r() * .8, pts = [[0, 0]];
      for (let i = 1; i <= 5; i++) { const t = i / 5; pts.push([wind * t * t * 1.5 + (r() - .5) * .55, -H * t]); }
      const L = [], Rt = [];
      pts.forEach(([x, y], i) => { const w = .42 * (1 - i / 6) + .1; L.push([x - w, y]); Rt.push([x + w, y]); });
      const trunk = [["M", ...L[0]], ...L.slice(1).map(p => ["L", ...p]), ...Rt.reverse().map(p => ["L", ...p]), ["Z"]];
      const limbs = [], tufts = [];
      for (let i = 2; i <= 5; i++) {
        const [x, y] = pts[i], side = i % 2 ? 1 : -1, len = (side > 0 ? 1.9 : 1.1) * (1.15 - i * .1) * (.8 + r() * .5);
        const tx = x + side * len, ty = y - .3 - r() * .6;
        limbs.push(["M", x, y], ["Q", x + side * len * .5, y + .2, tx, ty]);
        const n = full ? 3 + Math.floor(r() * 2) : 2, s = 1.15 - i * .08;
        for (let k = 0; k < n; k++) tufts.push([tx + (k - (n - 1) / 2) * s * .9 + (r() - .5) * .3, ty + (r() - .5) * .45, s * (.75 + r() * .35) * 1.12]);
      }
      const [tx, ty] = pts[5];
      tufts.push([tx - .3, ty - .5, 1.3], [tx + .6, ty - .3, 1.1]);
      g = { ...clump(tufts, .78, .18), bare: [limbs, [], []], trunk, marks: [], tw: .42, crownY: H * .75, crownR: 2.6, ever: true, limbs };
    } else if (kind === "whitepine") {
      // Tall, with flat tiers of needles held out sideways, rarely symmetrical.
      const H = 10 + r() * 2, tiers = [];
      for (let k = 0; k < 5; k++) {
        const y = -3 - k * (H - 3.6) / 4.6, w = 3.1 * (1 - k / 5.6) * (.8 + r() * .4), off = (r() - .5) * 1.4, n = full ? 3 + Math.floor(r() * 2) : 2;
        for (let i = 0; i < n; i++) if (r() > .12 || i === 1) tiers.push([off + (i - (n - 1) / 2) * w * (full ? .55 : .8), y + (r() - .5) * .3, w * (.34 + r() * .12) * (full ? 1 : 1.25)]);
      }
      tiers.push([.1, -H + .2, .75]);
      g = { ...clump(tiers.sort((a, b) => b[1] - a[1]), .48, .25), bare: [[], [], []], trunk: [["M", -.36, 0], ["L", -.12, -H], ["L", .12, -H], ["L", .36, 0], ["Z"]], marks: [], tw: .36, crownY: H * .55, crownR: 2.8, ever: true };
    } else {
      // Hemlock: a soft cone of scalloped skirts with the drooping leader hemlocks always have.
      const H = 9 + r() * 2, W = 2.5 + r() * .5, n = full ? 6 : 4, lean = (r() - .5) * .5;
      const skirt = (w, yb, yt, x0) => {
        const sc = full ? 3 + Math.floor(w) : 2, c = [["M", x0 - w, yb]];
        for (let i = 0; i < sc; i++) { const xa = x0 - w + (2 * w) * (i + .5) / sc, xb = x0 - w + (2 * w) * (i + 1) / sc; c.push(["Q", xa, yb + .45, xb, yb]); }
        c.push(["Q", x0 + w * .45, (yb + yt) / 2, x0, yt], ["Q", x0 - w * .45, (yb + yt) / 2, x0 - w, yb], ["Z"]);
        return c;
      };
      const dark = [], mid = [], hlE = [], hlW = [], snow = [];
      for (let k = 0; k < n; k++) {
        const yb = -.9 - k * (H - 1.8) / n, yt = yb - (H - 1.8) / n * 1.9, w = W * Math.pow(1 - k / n, .85) + .35, x0 = lean * k / n;
        dark.push(...skirt(w, yb, yt, x0)); mid.push(...skirt(w * .8, yb - .32, yt, x0));
        hlE.push(["M", x0, yt + .2], ["Q", x0 + w * .5, (yb + yt) / 2, x0 + w * .78, yb - .3], ["Q", x0 + w * .3, yb - .1, x0 + .1, yb - .45], ["Z"]);
        hlW.push(["M", x0, yt + .2], ["Q", x0 - w * .5, (yb + yt) / 2, x0 - w * .78, yb - .3], ["Q", x0 - w * .3, yb - .1, x0 - .1, yb - .45], ["Z"]);
        snow.push(["M", x0, yt + .1], ["Q", x0 + w * .55, yb - .5, x0 + w * .85, yb - .15], ["Q", x0, yb - .8, x0 - w * .85, yb - .15], ["Q", x0 - w * .55, yb - .5, x0, yt + .1], ["Z"]);
      }
      g = { dark, mid, hlE, hlW, snow, bare: [[], [], []], trunk: [["M", -.3, 0], ["L", -.15, -1.4], ["L", .15, -1.4], ["L", .3, 0], ["Z"]], marks: [], tw: .3, crownY: H * .45, crownR: W, ever: true };
    }
    glyphCache.set(key, g);
    return g;
  }
  function shrubGlyph(kind, v) {
    const key = "shrub" + kind + v;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const r = Art.rand(`shrub-${kind}-${v}`), lobes = [];
    if (kind === "blueberry") {
      const n = 6 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const a = Math.PI + (i + .5) / n * Math.PI, k = .7 + r() * .3; lobes.push([Math.cos(a) * .62 * k, -.3 + Math.sin(a) * .3 * k, .26 + r() * .1]); }
      lobes.push([0, -.42, .36]);
    } else {
      for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; lobes.push([Math.cos(a) * .55 * (.8 + r() * .3), -.62 + Math.sin(a) * .42 * (.8 + r() * .3), .38 + r() * .12]); }
      lobes.push([0, -.7, .55]);
    }
    const g = clump(lobes, .85, .15);
    glyphCache.set(key, g);
    return g;
  }
  function fernGlyph(v) {
    const key = "fern" + v;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const r = Art.rand("fern" + v), fronds = [];
    const n = 5 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * .42 + (r() - .5) * .15, L = .9 + r() * .4, w = .2;
      const tx = Math.cos(a) * L, ty = Math.sin(a) * L * .8, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      fronds.push(["M", 0, 0], ["Q", tx * .5 + nx, ty * .5 + ny, tx, ty], ["Q", tx * .5 - nx, ty * .5 - ny, 0, 0], ["Z"]);
    }
    glyphCache.set(key, fronds);
    return fronds;
  }

  // ---- the painter ----------------------------------------------------------------
  function paint(svgEl, D, sectorName, opts = {}) {
    const d3 = root.d3;
    const S = Illu.sceneFor(D, sectorName);
    const svg = d3.select(svgEl), wrap = svgEl.parentElement;
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    // Soft-edged light, shade and earth: radial gradients that fade to nothing,
    // used for painterly shading without blur filters.
    for (const [id, cls] of [["soft-dark", "sd"], ["soft-light", "sl"], ["soft-earth", "se"]]) {
      const gr = defs.append("radialGradient").attr("id", id);
      gr.append("stop").attr("offset", 0).attr("class", cls + "0"); gr.append("stop").attr("offset", .55).attr("class", cls + "1"); gr.append("stop").attr("offset", 1).attr("class", cls + "2");
    }

    // A faint, irregular granite grain for the rocks (a few flecks per tile, not a speckle carpet).
    {
      const rg = Art.rand("rock-grain"), pat = defs.append("pattern").attr("id", "rock-grain").attr("patternUnits", "userSpaceOnUse").attr("width", 3.4).attr("height", 2.6);
      for (let i = 0; i < 9; i++) {
        const x = rg() * 3.4, y = rg() * 2.6, a = rg() * 180;
        pat.append("ellipse").attr("cx", f2(x)).attr("cy", f2(y)).attr("rx", f2(.05 + rg() * .09)).attr("ry", f2(.03 + rg() * .04))
          .attr("transform", `rotate(${a | 0} ${f2(x)} ${f2(y)})`).attr("class", rg() < .55 ? "grain-dk" : "grain-lt");
      }
    }
    const [bx0, bx1, by0, by1] = S.bounds;
    const W = bx1 - bx0, H = by1 - by0;
    const world = svg.append("g").attr("class", "world");
    const ground = world.append("g").attr("class", "ground");
    const under = world.append("g").attr("class", "under");
    const snowL = world.append("g").attr("class", "snowcover");
    const pools = world.append("g").attr("class", "pools");
    const shadows = world.append("g").attr("class", "shadows");
    const canopy = world.append("g").attr("class", "canopy");
    const stand = world.append("g").attr("class", "standing");
    const sky = world.append("g").attr("class", "sky");
    const light = svg.append("g").attr("class", "light").attr("pointer-events", "none");
    const glow = svg.append("g").attr("class", "glow").attr("pointer-events", "none");
    const labels = svg.append("g").attr("class", "labels");
    const marks = svg.append("g").attr("class", "marks");

    const blobPts = (seed, cx, cy, rx, ry, n = 9, wob = .4) => { const r = Art.rand(seed); return d3.range(n).map(i => { const a = i / n * TAU + r() * .3, k = 1 - wob / 2 + r() * wob; return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; }); };
    const closed = d3.line().curve(d3.curveCardinalClosed.tension(.15));
    const blobD = (...a) => closed(blobPts(...a).map(p => [f1(p[0]), f1(p[1])]));
    const smoothRing = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
    // A polygon with its corners eased (each corner cut by a short curve): crisp
    // planes, but no razor-sharp points. Used for the faceted rocks' silhouettes.
    const roundPoly = (pts, k = .18) => {
      const n = pts.length; let d = "";
      for (let i = 0; i < n; i++) {
        const p = pts[i], a = pts[(i + n - 1) % n], c = pts[(i + 1) % n];
        d += (i ? "L" : "M") + f2(p[0] + (a[0] - p[0]) * k) + "," + f2(p[1] + (a[1] - p[1]) * k) + "Q" + f2(p[0]) + "," + f2(p[1]) + " " + f2(p[0] + (c[0] - p[0]) * k) + "," + f2(p[1] + (c[1] - p[1]) * k);
      }
      return d + "Z";
    };

    // ---- ground: the forest floor, its quiet variety, the bald, trails
    ground.append("rect").attr("class", "floor").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80);
    for (const tone of [0, 1]) ground.append("path").attr("class", "wash w" + tone)
      .attr("d", S.washes.filter(w => w.tone === tone).map(w => blobD("w" + w.seed, w.x, -w.y, w.r, w.r)).join(""));
    const hill = defs.append("radialGradient").attr("id", "hill").attr("gradientUnits", "userSpaceOnUse").attr("cx", S.sector.x).attr("cy", -S.sector.y).attr("r", 190);
    hill.append("stop").attr("offset", 0).attr("class", "hill0"); hill.append("stop").attr("offset", .45).attr("class", "hill1"); hill.append("stop").attr("offset", 1).attr("class", "hill2");
    ground.append("rect").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80).attr("fill", "url(#hill)");

    const baldD = d3.line().curve(d3.curveBasisClosed)(S.bald.map(SP));
    // Trails go down first: where they cross the bald, the heath covers them and
    // only a faint worn line (drawn later) and the blazes show. (No masks: a mask
    // costs an off-screen render on every frame.)
    const tl = d3.line().curve(d3.curveLinear);
    const trailD = t => tl(t.pts.map(p => [f1(p[0]), f1(-p[1])]));
    const trailUnder = ground.append("g").attr("class", "trails");
    for (const t of S.trails) { trailUnder.append("path").attr("class", "trail-edge").attr("d", trailD(t)); trailUnder.append("path").attr("class", "trail-dirt").attr("d", trailD(t)); }
    const baldG = ground.append("g").attr("class", "bald-g");
    baldG.append("path").attr("class", "bald-fringe").attr("d", baldD).attr("transform", `translate(${f2(S.baldC[0] * -0.04)},${f2(S.baldC[1] * 0.04)}) scale(1.04)`);
    baldG.append("path").attr("class", "bald").attr("d", baldD);
    defs.append("clipPath").attr("id", "bald-clip").append("path").attr("d", baldD);
    // Granite ledges through the heath: flat, pale and quiet, so the boulders on them stand out.
    const RG = S.rockGrid, ring = d3.line().curve(d3.curveBasisClosed);
    const gpath = mp => mp.coordinates.map(poly => poly.map(r => ring(r.slice(0, -1).map(([x, y]) => [f1(RG.x0 + x * RG.cell), f1(-(RG.y0 + y * RG.cell))]))).join("")).join("");
    const ledges = d3.contours().size([RG.nx, RG.ny]).thresholds([RG.t, RG.t + .1])(RG.values);
    ledges.forEach((c, i) => baldG.append("path").attr("class", "ledge ledge" + i).attr("d", gpath(c)));
    defs.append("clipPath").attr("id", "rock-clip").append("path").attr("d", gpath(ledges[0]));
    baldG.append("path").attr("class", "joint").attr("clip-path", "url(#rock-clip)").attr("d", S.joints.map(([a, b]) => `M${f1(a[0])},${f1(-a[1])}L${f1(b[0])},${f1(-b[1])}`).join(""));
    // Soft patches of leaf litter, moss and bare earth on the heath and at the forest's edge.
    for (const kind of ["earth", "moss", "litter"]) ground.append("path").attr("class", "patch p-" + kind)
      .attr("d", S.patches.filter(p => p.kind === kind).map(p => blobD("p" + p.seed, p.x, -p.y, p.r * 1.3, p.r, 8, .5)).join(""));
    // Worn, quiet ground at the foot of every boulder.
    ground.append("g").attr("class", "worn").selectAll("ellipse").data(S.boulders).join("ellipse")
      .attr("cx", bo => f1(bo.b.x)).attr("cy", bo => f1(-bo.b.y + bo.form.R * .1)).attr("rx", bo => f1(bo.form.R * 1.75)).attr("ry", bo => f1(bo.form.R * 1.2)).attr("fill", "url(#soft-earth)");

    // Across the open rock the trail is a worn line marked by blue blazes and cairns.
    const trailG = ground.append("g").attr("class", "trails");
    const blazes = [];
    for (const t of S.trails) {
      const d = trailD(t);
      trailG.append("path").attr("class", "trail-worn").attr("d", d).attr("clip-path", "url(#bald-clip)");
      trailG.append("path").attr("class", "trail-ink only-far").attr("d", d);
      let acc = 0;
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc < 9) continue; acc = 0;
        const bz = S.baldness(b); if (!bz.inside || bz.depth < 3) continue;
        const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
        const pt = (u, v) => `${f2(b[0] + u * c - v * s)},${f2(-b[1] + u * s + v * c)}`;
        blazes.push(`M${pt(-.45, -.22)}L${pt(.45, -.22)}L${pt(.45, .22)}L${pt(-.45, .22)}Z`);
      }
    }
    trailG.append("path").attr("class", "blaze lod-a").attr("d", blazes.join(""));

    // ---- understory: flowers, grass, ferns, mushrooms, shrubs (each kind one or a few paths)
    for (let c = 0; c < 4; c++) under.append("path").attr("class", "fl fl" + c).attr("d", S.flowers.filter(f => f.c === c).map(f => circ(f.x, -f.y, .26 * f.s)).join(""));
    under.append("path").attr("class", "grass").attr("d", S.grass.map(g => {
      const x = g.x, y = -g.y, s = g.s;
      return [-.45, -.2, 0, .22, .42].map((o, i) => `M${f1(x + o * .25 * s)},${f1(y)}q${f2(o * .3 * s)},${f2(-.4 * s)} ${f2(o * .7 * s)},${f2(-(.55 + (i % 2) * .25) * s)}`).join("");
    }).join(""));
    under.append("path").attr("class", "fern").attr("d", S.ferns.map((f, i) => bake(fernGlyph(i % 3), f.x, -f.y, f.s, i % 2 === 0)).join(""));
    under.append("path").attr("class", "shroom lod-c").attr("d", S.shrooms.map(m => {
      const x = m.x, y = -m.y, s = m.s;
      return m.kind === "bracket" ? `M${f2(x - .3 * s)},${f2(y)}q${f2(.3 * s)},${f2(-.28 * s)} ${f2(.6 * s)},0z` : `M${f2(x - .24 * s)},${f2(y - .26 * s)}q${f2(.24 * s)},${f2(-.34 * s)} ${f2(.48 * s)},0z`;
    }).join(""));
    for (const kind of ["blueberry", "laurel"]) {
      const list = S.shrubs.filter(b => b.kind === kind), g = under.append("g").attr("class", "cs sb-" + kind);
      for (const layer of ["dark", "mid", "hlE", "hlW", "snow"]) g.append("path").attr("class", "L-" + layer).attr("d", list.map(b => bake(shrubGlyph(kind, b.v)[layer], b.x, -b.y, b.s, b.v === 1)).join(""));
    }

    // ---- snow over the ground (trails stay as packed tracks)
    snowL.append("rect").attr("class", "snow-cover").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80);
    for (const t of S.trails) snowL.append("path").attr("class", "trail-snowpack").attr("d", tl(t.pts.map(p => [f1(p[0]), f1(-p[1])])));

    // ---- shade: pools under close-standing trees, then cast shadows
    const crowded = t => S.trees.reduce((n, u) => n + (u !== t && Math.abs(u.x - t.x) < 7 && Math.abs(u.y - t.y) < 7 ? 1 : 0), 0) >= 3;
    const poolOf = ever => S.trees.filter(t => t.ever === ever && !S.baldness([t.x, t.y]).inside && crowded(t)).map(t => circ(t.x, -t.y - t.crownR * .2, t.crownR * 1.25)).join("");
    pools.append("path").attr("class", "pool-ever").attr("d", poolOf(true));
    pools.append("path").attr("class", "pool-decid").attr("d", poolOf(false));
    // Cast shadows, grouped by the height of what casts them: each group is one
    // path that slides by (the sun's shadow vector x height) in setTime().
    const BUCKET = 1.25, buckets = { ever: new Map(), decid: new Map(), rocknew: new Map(), rockold: new Map() };
    const addShadow = (type, h, d) => { const m = buckets[type === true ? "ever" : type === false ? "decid" : type], k = Math.max(1, Math.round(h / BUCKET)); m.set(k, (m.get(k) || "") + d); };

    // ---- trees
    const slot = t => t.ever ? `${t.kind}-${t.v % 2}` : `${t.kind}-${t.v}`;
    // The canopy: every non-foreground tree, merged per 90 m tile, per colour, per layer.
    const TILE = 90, tiles = new Map();
    for (const t of S.trees) {
      const g = treeGlyph(t.kind, t.shape, t.fg), s = t.size, X = t.x, Y = -t.y;
      if (t.fg) { addShadow(t.ever, g.crownY * s, ell(X, Y, g.crownR * s * .9, g.crownR * s * .62)); continue; }   // the canopy's shadows fall on more canopy
      const ty = Math.floor((t.y - by0) / TILE), key = ty * 100 + Math.floor((t.x - bx0) / TILE);
      if (!tiles.has(key)) tiles.set(key, { y: ty, slots: new Map(), bare: ["", "", ""] });
      const tile = tiles.get(key), sk = slot(t);
      if (!tile.slots.has(sk)) tile.slots.set(sk, { ever: t.ever, dark: "", mid: "", hlE: "", hlW: "", snow: "" });
      const L = tile.slots.get(sk);
      for (const layer of ["dark", "mid", "hlE", "hlW"]) L[layer] += bake(g[layer], X, Y, s, t.flip);
      if (t.ever) L.snow += bake(g.snow, X, Y, s, t.flip);
      else g.bare.forEach((b, i) => { if (b.length) tile.bare[i] += bake(b, X, Y, s, t.flip); });
    }
    for (const [, tile] of [...tiles].sort((a, b) => b[1].y - a[1].y)) {
      const tg = canopy.append("g").attr("class", "tile");
      tile.bare.forEach((d, i) => d && tg.append("path").attr("class", "bare b" + i).attr("d", d));
      for (const layer of ["ink", "dark", "mid", "hlE", "hlW", "snow"]) for (const [sk, L] of tile.slots) {
        if (layer === "snow" && !L.ever) continue;
        tg.append("path").attr("class", `cs c-${sk} ${L.ever ? "ever" : "decid"} L-${layer}`).attr("d", L[layer === "ink" ? "dark" : layer]);
      }
    }

    // ---- the standing layer, front to back
    const items = [];
    for (const t of S.trees) if (t.fg) items.push({ y: -t.y, draw: Lr => drawTree(Lr, t) });
    for (const l of S.logs) items.push({ y: -l.y, draw: Lr => drawLog(Lr, l) });
    for (const st of S.stumps) items.push({ y: -st.y, draw: Lr => drawStump(Lr, st) });
    for (const c of S.cairns) items.push({ y: -c.y, draw: Lr => drawCairn(Lr.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(c.x)},${f2(-c.y)}) scale(${f2(c.s)})`)) });
    const state = opts.state || {};
    for (const bo of S.boulders) {
      // Boulders being redesigned are drawn both ways, so the page can switch between them.
      const versions = bo.form3 ? [[bo.form, "rock-old", "rockold"], [bo.form3, "rock-new", "rocknew"]] : [[bo.form, "", true]];
      for (const [F, cls, sh] of versions) {
        items.push({ y: -bo.b.y, draw: Lr => drawBoulder(Lr, bo, state, F, cls) });
        const X = bo.b.x, Y = -bo.b.y, baseD = "M" + F.base.map(p => f1(X + p[0]) + "," + f1(Y + p[1])).join("L") + "Z";
        for (const t of [.35, .7, 1]) addShadow(sh, F.H * t * .9, baseD);
      }
    }
    for (const lm of S.landmarks) items.push({ y: -lm.y, draw: Lr => drawLandmark(Lr, lm) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw(stand);
    for (const lm of S.landmarks) if (lm.kind === "bigtree") { const g = treeGlyph(lm.species, 2, true); addShadow(lm.species === "pitch", g.crownY * lm.scale, ell(lm.x, -lm.y, g.crownR * lm.scale * .9, g.crownR * lm.scale * .62)); }
    for (const [type, m] of Object.entries(buckets)) {
      const sg = shadows.append("g").attr("class", "sh-" + type);
      for (const [k, d] of m) sg.append("path").attr("data-h", k * BUCKET).attr("d", d);
    }

    // A foreground tree: the full drawing, with a trunk you can see.
    function drawTree(Lr, t, scale = 1, extraCls = "") {
      const g = treeGlyph(t.kind, t.shape, true), s = t.size * scale, X = t.x, Y = -t.y;
      const tg = Lr.append("g").attr("class", `fg cs c-${slot(t)} ${t.ever ? "ever" : "decid"} ${extraCls}`);
      tg.append("path").attr("class", "contact").attr("d", ell(X, Y + .1, g.tw * 4 * s, g.tw * 1.4 * s));
      if (g.limbs) tg.append("path").attr("class", "limb").attr("d", bake(g.limbs, X, Y, s, t.flip, 2));
      else g.bare.forEach((b, i) => b.length && tg.append("path").attr("class", "bare b" + i).attr("d", bake(b, X, Y, s, t.flip, 2)));
      tg.append("path").attr("class", g.birch ? "trunk birch" : "trunk").attr("d", bake(g.trunk, X, Y, s, t.flip, 2));
      if (g.marks.length) tg.append("path").attr("class", "birch-mark").attr("d", bake(g.marks, X, Y, s, t.flip, 2));
      for (const layer of ["ink", "dark", "mid", "hlE", "hlW"]) tg.append("path").attr("class", "L-" + layer).attr("d", bake(g[layer === "ink" ? "dark" : layer], X, Y, s, t.flip, 2));
      if (g.ever) tg.append("path").attr("class", "L-snow").attr("d", bake(g.snow, X, Y, s, t.flip, 2));
      return { g, tg };
    }

    // ---- boulders: stacked rings of shaded granite, soft-lit, with a cast shadow
    function drawBoulder(Lr, bo, st, F = bo.form, extra = "") {
      const X = bo.b.x, Y = -bo.b.y, name = bo.b.name, facet = F.style === "facet";
      const g = Lr.append("g").attr("class", `boulder k-${F.kind} ${extra}`).attr("data-id", bo.id).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", `${name}, ${bo.b.sector}`).attr("transform", `translate(${f2(X)},${f2(Y)})`);
      const R = F.R, hullD = facet ? roundPoly(F.hull, .32) : smoothRing(F.hull);
      const clipId = `bclip-${bo.id}${extra ? "-" + extra : ""}`;
      defs.append("clipPath").attr("id", clipId).append("path").attr("d", hullD);
      g.append("path").attr("class", "r-contact").attr("d", smoothRing(F.base.map(p => [p[0] * 1.14, p[1] * 1.3 + R * .1]))).attr("fill", "url(#soft-dark)");
      if (st.project && st.project.includes(name)) g.append("path").attr("class", "r-project").attr("d", ell(0, R * .05, R * 1.5, R * .95));
      if (facet) {
        // Planes, but weathered: every edge bows a little (the same curve for both
        // faces that share it, so they meet without seams), the tones sit a bit
        // closer together, and a soft band of the in-between tone blurs each
        // internal edge.
        const rr = Art.rand("soften" + bo.b.name), key = p => f1(p[0]) + "," + f1(p[1]);
        const ekey = (a, b) => key(a) < key(b) ? key(a) + "|" + key(b) : key(b) + "|" + key(a);
        // Which edges two visible faces share (inside the rock) and which are on its outline.
        const owners = new Map();
        F.faces.forEach(f => f.pts.forEach((p, i) => { const q = f.pts[(i + 1) % f.pts.length], k = ekey(p, q); if (!owners.has(k)) owners.set(k, { p, q, faces: [] }); owners.get(k).faces.push(f); }));
        // Each edge's line, from its canonical end, shared by both faces so they meet without seams.
        // Outline edges keep their gentle bow (the silhouette doesn't change). Edges inside the rock
        // wander: the bow plus an uneven wave, so no transition between planes runs straight.
        const lines = new Map();
        const lineOf = (a, b) => {
          const k = ekey(a, b);
          if (!lines.has(k)) {
            const [p, q] = key(a) < key(b) ? [a, b] : [b, a], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
            const h = Art.rand(k), bow = (h() - .5) * .16, pts = [p];
            if ((owners.get(k)?.faces.length || 0) < 2) pts.push([(p[0] + q[0]) / 2 + nx * bow * L, (p[1] + q[1]) / 2 + ny * bow * L]);
            else {
              const ph = h() * TAU, amp = Math.min(.035 + h() * .03, R * .05 / L), m = L > R * .5 ? 5 : 3;
              for (let i = 1; i <= m; i++) {
                const t = i / (m + 1), o = L * (bow * 2 * t * (1 - t) * 2 + amp * Math.sin(t * TAU * 1.4 + ph) * Math.sin(Math.PI * t) + (h() - .5) * .02);
                pts.push([p[0] + dx * t + nx * o, p[1] + dy * t + ny * o]);
              }
            }
            pts.push(q);
            lines.set(k, pts);
          }
          const pts = lines.get(k);
          return key(a) < key(b) ? pts : [...pts].reverse();
        };
        // A chain of points as quadratic curves through the midpoints of its controls (reversible: the
        // same curve either way round).
        const chainD = pts => {
          const n = pts.length - 1; let d = "";
          if (n === 1) return "L" + f2(pts[1][0]) + "," + f2(pts[1][1]);
          for (let i = 1; i < n - 1; i++) { const c = pts[i], e = [(c[0] + pts[i + 1][0]) / 2, (c[1] + pts[i + 1][1]) / 2]; d += "Q" + f2(c[0]) + "," + f2(c[1]) + " " + f2(e[0]) + "," + f2(e[1]); }
          return d + "Q" + f2(pts[n - 1][0]) + "," + f2(pts[n - 1][1]) + " " + f2(pts[n][0]) + "," + f2(pts[n][1]);
        };
        // Points along that curve, evenly spaced, for the soft bands.
        const chainAt = (pts, m) => {
          const segs = [], n = pts.length - 1;
          let s = pts[0];
          for (let i = 1; i < n; i++) { const c = pts[i], e = i < n - 1 ? [(c[0] + pts[i + 1][0]) / 2, (c[1] + pts[i + 1][1]) / 2] : pts[n]; segs.push([s, c, e]); s = e; }
          const dense = [];
          for (const [a, c, e] of segs) for (let j = 0; j < 6; j++) { const t = j / 6, u = 1 - t; dense.push([u * u * a[0] + 2 * u * t * c[0] + t * t * e[0], u * u * a[1] + 2 * u * t * c[1] + t * t * e[1]]); }
          dense.push(pts[n]);
          const acc = [0]; for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
          const tot = acc[acc.length - 1] || 1, out = [];
          for (let j = 0, i = 0; j <= m; j++) { const want = tot * j / m; while (i < dense.length - 2 && acc[i + 1] < want) i++; const f = clamp((want - acc[i]) / ((acc[i + 1] - acc[i]) || 1), 0, 1); out.push([dense[i][0] + (dense[i + 1][0] - dense[i][0]) * f, dense[i][1] + (dense[i + 1][1] - dense[i][1]) * f]); }
          return out;
        };
        const facetD = f => {
          let d = "M" + f2(f.pts[0][0]) + "," + f2(f.pts[0][1]);
          f.pts.forEach((p, i) => { d += chainD(lineOf(p, f.pts[(i + 1) % f.pts.length])); });
          return d + "Z";
        };
        const fillOf = f => Art.mix(f.fill, F.rock.mid, .09);
        const body0 = g.append("g").attr("clip-path", `url(#${clipId})`);
        for (const f of F.faces) body0.append("path").attr("class", "r-facet").attr("d", facetD(f)).attr("fill", fillOf(f)).attr("stroke", fillOf(f));
        // Soft, uneven transitions: along each edge inside the rock, a few stacked feathered bands of the
        // two faces' blended tone. Each band swells and narrows and drifts to one side or the other, so the
        // change from light to shade wanders like weathering rather than following a ruled line. The bands
        // overlap at the corners, which takes the point off the triangles where three planes meet.
        const smoothClosed = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
        for (const [k, { p, q, faces }] of owners) if (faces.length === 2) {
          const tone = Art.mix(fillOf(faces[0]), fillOf(faces[1]), .5), h = Art.rand("feather" + k), m = 10;
          const c = chainAt(lineOf(p, q), m), ph = h() * TAU, drift = .25 + h() * .3, wob = d3.range(m + 1).map(() => .7 + h() * .6);
          const nrm = c.map((pt, j) => { const a = c[Math.max(0, j - 1)], b = c[Math.min(m, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; });
          for (const [W, cls] of [[R * .07, "r-feather f0"], [R * .042, "r-feather f1"], [R * .02, "r-feather f2"]]) {
            const L = [], Rt = [];
            c.forEach((pt, j) => {
              const t = j / m, env = .4 + .6 * Math.pow(Math.sin(Math.PI * t), .7), w = W * env * wob[j], s = W * drift * Math.sin(t * TAU * .9 + ph) * Math.sin(Math.PI * t);
              L.push([pt[0] + nrm[j][0] * (s + w), pt[1] + nrm[j][1] * (s + w)]);
              Rt.push([pt[0] + nrm[j][0] * (s - w), pt[1] + nrm[j][1] * (s - w)]);
            });
            body0.append("path").attr("class", cls).attr("d", smoothClosed([...L, ...Rt.reverse()].map(pt => [+f2(pt[0]), +f2(pt[1])]))).attr("fill", tone);
          }
        }
        // Light, shade, texture, lichen and snow stay on the rock itself (not the open ground under an overhang).
        defs.append("clipPath").attr("id", clipId + "-f").append("path").attr("d", F.faces.map(facetD).join(""));
        const body = body0.append("g").attr("clip-path", `url(#${clipId}-f)`);
        // The clock's light and shade, softly, over the planes.
        const cy = -F.H * .45, ry = (F.H + R * .6) * .75;
        for (const [cls, dx, grad] of [["r-light e", .55, "soft-light"], ["r-light w", -.55, "soft-light"], ["r-shade e", .7, "soft-dark"], ["r-shade w", -.7, "soft-dark"]])
          body.append("ellipse").attr("class", cls + " soft").attr("cx", f2(R * dx)).attr("cy", f2(cy)).attr("rx", f2(R * .95)).attr("ry", f2(ry)).attr("fill", `url(#${grad})`);
        // A little texture: a few broad weathering blotches, and a faint grain when you're close.
        const xs = F.hull.map(p => p[0]), ys = F.hull.map(p => p[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        for (let i = 0; i < 7; i++) {
          const light = rr() < .45, x = x0 + (x1 - x0) * (.15 + .7 * rr()), y = y0 + (y1 - y0) * (.15 + .7 * rr());
          body.append("ellipse").attr("class", "r-blotch " + (light ? "lt" : "dk")).attr("cx", f2(x)).attr("cy", f2(y)).attr("rx", f2(R * (.18 + rr() * .22))).attr("ry", f2(R * (.1 + rr() * .14)))
            .attr("transform", `rotate(${f2((rr() - .5) * 50)} ${f2(x)} ${f2(y)})`).attr("fill", light ? "url(#soft-light)" : "url(#soft-dark)");
        }
        body.append("rect").attr("class", "r-grain").attr("x", f2(x0)).attr("y", f2(y0)).attr("width", f2(x1 - x0)).attr("height", f2(y1 - y0)).attr("fill", "url(#rock-grain)");
        body.append("path").attr("class", "r-lichen").attr("fill", F.rock.lichen).attr("d", F.lichen.map(l => ell(l.x, l.y, l.r, l.r * .7)).join(""));
        body.append("path").attr("class", "r-chalk lod-c").attr("d", F.chalk.map(c => ell(c.x, c.y, c.r * 1.3, c.r)).join(""));
        body.append("path").attr("class", "r-snow").attr("d", F.faces.filter(f => f.up > .55).map(facetD).join(""));
      } else drawRingBody(g, bo, F, clipId);
      const front = F.base.filter(p => p[1] > -R * .15).sort((a, b) => a[0] - b[0]);
      g.append("path").attr("class", "r-foot").attr("d", d3.line().curve(d3.curveBasis)(front)).attr("clip-path", facet ? `url(#${clipId})` : null);
      // Selection: the second version's rocks get a light outline; the faceted ones a ring on the ground (their outlines aren't convex).
      if (facet) g.insert("path", ":first-child").attr("class", "r-outline ring").attr("d", ell(0, R * .1, R * 1.35, R * .95));
      else g.append("path").attr("class", "r-outline").attr("d", hullD);
      drawStory(g, bo, F, st);
      g.append("path").attr("class", "r-hit").attr("d", hullD);
      return g;
    }
    // The second version's body: stacked rings sharing one gradient.
    function drawRingBody(g, bo, F, clipId) {
      const R = F.R;
      // The body: every ring painted with one gradient by height, so they merge into continuous rock.
      const gid = `bg-${bo.id}`, lg = defs.append("linearGradient").attr("id", gid).attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", 0).attr("y1", f2(F.gy0)).attr("x2", 0).attr("y2", f2(F.gy1));
      for (const [o, c] of F.grad) lg.append("stop").attr("offset", o).attr("stop-color", c);
      F.rings.forEach(rg => g.append("path").attr("class", "r-ring").attr("d", smoothRing(rg.map(p => [f2(p[0]), f2(p[1])]))).attr("fill", `url(#${gid})`));
      // Blocks, prows and slabs have a top you could stand on: a lit surface with a crisp lip.
      if (!F.soft) {
        g.append("path").attr("class", "r-top").attr("d", smoothRing(F.top)).attr("fill", Art.mix(F.rock.light, F.rock.top, .55));
        const tc = F.topC;
        g.append("path").attr("class", "r-top").attr("d", smoothRing(F.top.map(p => [tc[0] + (p[0] - tc[0]) * .62, tc[1] + (p[1] - tc[1]) * .55 - .1]))).attr("fill", F.rock.top).attr("opacity", .7);
      }
      // Light from the sun's side, shade on the other, both soft-edged and following the clock.
      const body = g.append("g").attr("clip-path", `url(#${clipId})`);
      const cy = -F.H * .45, ry = (F.H + R * .6) * .75;
      body.append("ellipse").attr("class", "r-light e").attr("cx", f2(R * .55)).attr("cy", f2(cy)).attr("rx", f2(R * .95)).attr("ry", f2(ry)).attr("fill", "url(#soft-light)");
      body.append("ellipse").attr("class", "r-light w").attr("cx", f2(-R * .55)).attr("cy", f2(cy)).attr("rx", f2(R * .95)).attr("ry", f2(ry)).attr("fill", "url(#soft-light)");
      body.append("ellipse").attr("class", "r-shade e").attr("cx", f2(R * .7)).attr("cy", f2(cy + F.H * .2)).attr("rx", f2(R * .9)).attr("ry", f2(ry)).attr("fill", "url(#soft-dark)");
      body.append("ellipse").attr("class", "r-shade w").attr("cx", f2(-R * .7)).attr("cy", f2(cy + F.H * .2)).attr("rx", f2(R * .9)).attr("ry", f2(ry)).attr("fill", "url(#soft-dark)");
      // Under an overhang, the rock falls into deep shade.
      if (F.kind === "prow" || F.kind === "beak" || F.kind === "roof") {
        const ux = F.kind === "roof" ? 0 : F.lean[0], uy = F.kind === "roof" ? -1 : F.lean[1];
        body.append("ellipse").attr("class", "r-undercut").attr("cx", f2(ux * R * .55)).attr("cy", f2(-uy * R * .3 * F.FS - F.H * .25)).attr("rx", f2(R * .75)).attr("ry", f2(F.H * .55)).attr("fill", "url(#soft-dark)");
      }
      for (const t of F.tones2) body.append("ellipse").attr("class", t.light ? "r-tone lt" : "r-tone dk").attr("cx", f2(t.x)).attr("cy", f2(t.y)).attr("rx", f2(t.rx)).attr("ry", f2(t.ry))
        .attr("transform", `rotate(${f2(t.rot)} ${f2(t.x)} ${f2(t.y)})`).attr("fill", t.light ? "url(#soft-light)" : "url(#soft-dark)");
      // Restrained geology: sheeting lines, pale veins, dark water streaks down the faces, cracks, a little lichen.
      const line = d3.line().curve(d3.curveBasis);
      body.append("path").attr("class", "r-sheet-lip").attr("d", F.sheets.map(s => line(s.map(p => [p[0], p[1] - .16]))).join(""));
      body.append("path").attr("class", "r-sheet").attr("d", F.sheets.map(s => line(s)).join(""));
      body.append("path").attr("class", "r-vein").attr("d", F.veins.map(v => line(v)).join(""));
      body.append("path").attr("class", "r-streak").attr("d", F.streaks.map(s => `M${f2(s.x - s.w / 2)},${f2(s.y0)}Q${f2(s.x - s.w * .3)},${f2((s.y0 + s.y1) / 2)} ${f2(s.x)},${f2(s.y1)}Q${f2(s.x + s.w * .3)},${f2((s.y0 + s.y1) / 2)} ${f2(s.x + s.w / 2)},${f2(s.y0)}Z`).join(""));
      body.append("path").attr("class", "r-crack").attr("d", F.cracks.map(c => d3.line()(c.map(p => [f2(p[0]), f2(p[1])]))).join(""));
      body.append("path").attr("class", "r-lichen").attr("fill", F.rock.lichen).attr("d", F.lichen.map(l => ell(l.x, l.y, l.r, l.r * .7)).join(""));
      body.append("path").attr("class", "r-chalk lod-c").attr("d", F.chalk.map(c => ell(c.x, c.y, c.r * 1.3, c.r)).join(""));
      // Snow settles on the top and the upper shoulders.
      body.append("path").attr("class", "r-snow").attr("d", smoothRing(F.top) + smoothRing(F.rings[F.rings.length - 3].map(p => [p[0] * .85, p[1] - .1])));
    }
    // Each boulder's own small story, and your game state on the rock.
    function drawStory(g, bo, F, st) {
      const R = F.R, name = bo.b.name, T = F.topC;
      if (/\bbowl\b/i.test(bo.b.desc || "")) {
        g.append("path").attr("class", "r-bowl").attr("d", ell(T[0], T[1] + .1, R * .42, R * .2));
        g.append("path").attr("class", "r-needles lod-c").attr("d", d3.range(12).map(i => { const a = i * 2.4, rr = R * .3 * Math.sqrt((i + 1) / 12); return `M${f2(T[0] + Math.cos(a) * rr)},${f2(T[1] + Math.sin(a) * rr * .45)}l${f2(Math.cos(a * 3) * .3)},${f2(Math.sin(a * 3) * .12)}`; }).join(""));
      }
      if (/chickadee/i.test(name)) for (const [dx, flip] of [[-.5, 1], [.7, -1]]) drawBird(g.append("g").attr("class", "lod-c").attr("transform", `translate(${f2(T[0] + dx)},${f2(T[1] - .1)}) scale(${flip * .55},.55)`), "chickadee");
      if (/\bperch\b/i.test(name)) drawBird(g.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(T[0] + .3)},${f2(T[1])}) scale(.9)`), "hawk");
      // Your game state on the rock: a pennant on what you've sent, a star for a local's tip.
      if (st.sent && st.sent.includes(name)) {
        const p = g.append("g").attr("class", "pennant").attr("transform", `translate(${f2(T[0] - R * .2)},${f2(T[1] + .2)})`);
        p.append("path").attr("class", "pole").attr("d", "M0,0V-2.6");
        p.append("path").attr("class", "flag").attr("d", "M0,-2.6L1.5,-2.15L0,-1.7Z");
      }
      if (st.tip && st.tip.includes(name)) g.append("path").attr("class", "tipstar").attr("transform", `translate(${f2(T[0])},${f2(T[1] - 2.2)}) scale(.16)`)
        .attr("d", "M0-6 1.8-1.9 6.2-1.9 2.6.8 3.9 5.2 0 2.6-3.9 5.2-2.6.8-6.2-1.9-1.8-1.9Z");
      if (st.here === name) drawPads(g, F);
    }
    function drawPads(g, F) {
      const y0 = F.R * 1.0, R = F.R;
      g.append("path").attr("class", "pad p0").attr("d", `M${f2(-R * .55)},${f2(y0)}L${f2(R * .05)},${f2(y0 - .15)}L${f2(R * .12)},${f2(y0 + 1.1)}L${f2(-R * .5)},${f2(y0 + 1.25)}Z`);
      g.append("path").attr("class", "pad p1").attr("d", `M${f2(R * .1)},${f2(y0 - .1)}L${f2(R * .62)},${f2(y0 - .25)}L${f2(R * .72)},${f2(y0 + .85)}L${f2(R * .18)},${f2(y0 + 1.05)}Z`);
      g.append("path").attr("class", "bucket").attr("d", `M${f2(R * .85)},${f2(y0 + .2)}h.5l-.06,.55h-.38z`);
    }
    function drawBird(g, kind) {
      if (kind === "chickadee") {
        g.append("path").attr("class", "bird-body").attr("d", "M-.35,0C-.4,-.35 -.1,-.5 .15,-.42C.35,-.5 .45,-.35 .38,-.2C.3,0 0,.05 -.35,0Z");
        g.append("path").attr("class", "bird-cap").attr("d", "M.12,-.42C.3,-.55 .46,-.4 .4,-.25L.2,-.3Z");
      } else {
        g.append("path").attr("class", "hawk-body").attr("d", "M0,0C-.25,-.4 -.2,-1 .05,-1.15C.3,-1.25 .4,-1 .32,-.75C.38,-.4 .25,-.1 0,0ZM.05,0L-.08,.35L.18,.35Z");
        g.append("path").attr("class", "hawk-breast").attr("d", "M.08,-.85C.25,-.7 .25,-.3 .1,-.12C.05,-.4 .02,-.6 .08,-.85Z");
      }
    }
    function drawLog(Lr, l) {
      const g = Lr.append("g").attr("class", "log").attr("transform", `translate(${f2(l.x)},${f2(-l.y)}) rotate(${f2(-l.a * 180 / Math.PI)})`);
      const h = l.L / 2, r = l.r;
      g.append("path").attr("class", "log-bark").attr("d", `M${f2(-h)},${f2(-r)}H${f2(h)}A${f2(r * .45)},${f2(r)} 0 0,1 ${f2(h)},${f2(r)}H${f2(-h)}A${f2(r * .45)},${f2(r)} 0 0,1 ${f2(-h)},${f2(-r)}Z`);
      g.append("path").attr("class", "log-end").attr("d", ell(h, 0, r * .45, r));
      g.append("path").attr("class", "log-moss").attr("d", ell(-h * .4, -r * .75, h * .35, r * .35) + ell(h * .35, -r * .7, h * .22, r * .3));
      g.append("path").attr("class", "log-snow").attr("d", ell(0, -r * .85, h * .95, r * .35));
    }
    function drawStump(Lr, s) {
      const g = Lr.append("g").attr("class", "stump lod-a").attr("transform", `translate(${f2(s.x)},${f2(-s.y)})`), r = s.r;
      g.append("path").attr("class", "log-bark").attr("d", `M${f2(-r)},0V${f2(-r * 1.3)}A${f2(r)},${f2(r * .45)} 0 0,1 ${f2(r)},${f2(-r * 1.3)}V0A${f2(r)},${f2(r * .45)} 0 0,1 ${f2(-r)},0Z`);
      g.append("path").attr("class", "log-end").attr("d", ell(0, -r * 1.3, r, r * .45));
    }
    function drawCairn(g) {
      [[0, 0, .75, .3], [.05, -.42, .58, .25], [-.04, -.8, .42, .2], [.02, -1.12, .26, .16]].forEach(([x, y, rx, ry]) => g.append("path").attr("class", "cairn-stone").attr("d", ell(x, y, rx, ry)));
    }
    function drawLandmark(Lr, lm) {
      const big = lm.kind === "counters" || lm.kind === "signpost" || lm.kind === "bench";
      const g = Lr.append("g").attr("class", `lm lm-${lm.kind}${lm.when ? " when-" + lm.when : ""}`).attr("transform", `translate(${f2(lm.x)},${f2(-lm.y)})${big ? " scale(1.35)" : ""}`);
      switch (lm.kind) {
        case "bigtree": {
          const t = { x: 0, y: 0, kind: lm.species, shape: 2, size: lm.scale, flip: false, ever: lm.species === "pitch", v: 1 };
          const { g: gl } = drawTree(g, t, 1, "landmark");
          if (lm.feeder) {
            const fy = -gl.crownY * lm.scale + gl.crownR * lm.scale * .55;
            const fg = g.append("g").attr("class", "feeder").attr("transform", `translate(${f2(gl.crownR * lm.scale * .35)},${f2(fy)})`);
            fg.append("path").attr("class", "string").attr("d", "M0,-1.4V-.4");
            fg.append("path").attr("class", "feeder-roof").attr("d", "M-.55,-.35L0,-.75L.55,-.35Z");
            fg.append("path").attr("class", "feeder-box").attr("d", "M-.4,-.35H.4V.3H-.4Z");
            drawBird(fg.append("g").attr("class", "lod-c").attr("transform", "translate(.55,.35) scale(.5)"), "chickadee");
          }
          break;
        }
        case "cairn": drawCairn(g.append("g").attr("transform", "scale(1.6)")); break;
        case "counters": {
          for (const [x, c] of [[-1.1, "c0"], [.5, "c1"]]) {
            const ch = g.append("g").attr("transform", `translate(${x},0)`);
            ch.append("path").attr("class", "chair-legs").attr("d", "M-.4,0L.35,-.75M.4,0L-.35,-.75");
            ch.append("path").attr("class", "chair " + c).attr("d", "M-.42,-.75H.42L.38,-.5H-.38ZM-.4,-.78L-.32,-1.45H.32L.4,-.78Z");
          }
          const sc = g.append("g").attr("transform", "translate(2.2,-.1)");
          sc.append("path").attr("class", "tripod").attr("d", "M0,-1.25L-.45,0M0,-1.25L.42,0M0,-1.25L.05,.15");
          sc.append("path").attr("class", "scope").attr("d", "M-.55,-1.48L.5,-1.2L.45,-1.05L-.58,-1.32Z");
          const tb = g.append("g").attr("transform", "translate(-3,-.1)");
          tb.append("path").attr("class", "post").attr("d", "M-.5,0V-1.7M.5,0V-1.7");
          tb.append("path").attr("class", "board").attr("d", "M-.75,-2.6H.75V-1.5H-.75Z");
          tb.append("text").attr("class", "board-text lod-c").attr("x", 0).attr("y", -2.12).text("HAWKS");
          tb.append("text").attr("class", "board-num lod-c").attr("x", 0).attr("y", -1.66).text("1,284");
          break;
        }
        case "footings": {
          const s = 2.6;
          for (const [x, y] of [[-s, -s * .55], [s, -s * .55], [-s, s * .55], [s, s * .55]]) {
            g.append("path").attr("class", "footing-side").attr("d", `M${x - .5},${y}h1v.35h-1z`);
            g.append("path").attr("class", "footing-top").attr("d", `M${x - .5},${y - .5}h1v.5h-1z`);
          }
          const v = g.append("g").attr("transform", `translate(0,${f2(-s * .1)})`);
          v.append("path").attr("class", "vane-pole").attr("d", "M0,0V-4.4");
          v.append("path").attr("class", "vane-arms").attr("d", "M-.7,-3.5H.7");
          v.append("path").attr("class", "vane-arrow").attr("d", "M-1.1,-4.3L.8,-4.45L1.15,-4.3L.8,-4.15ZM-1.1,-4.3L-1.35,-4.62L-.95,-4.38Z");
          v.append("text").attr("class", "vane-letter lod-c").attr("x", -.95).attr("y", -3.25).text("W");
          v.append("text").attr("class", "vane-letter lod-c").attr("x", .95).attr("y", -3.25).text("E");
          break;
        }
        case "snag": {
          g.append("path").attr("class", "contact").attr("d", ell(0, .1, 1.2, .4));
          g.append("path").attr("class", "snag").attr("d", "M-.45,0L-.18,-9.6L.12,-10.2L.2,-9.4L.42,0Z");
          g.append("path").attr("class", "snag-limb").attr("d", "M0,-4.5L-1.6,-5.4M0,-6.4L1.5,-7.2M0,-7.8L-1.1,-8.6M0,-3L1.1,-3.5");
          g.append("path").attr("class", "nest").attr("d", "M-1.25,-8.25Q0,-7.4 1.2,-8.25Q1.1,-9.1 0,-9.1Q-1.1,-9.1 -1.25,-8.25Z");
          break;
        }
        case "bench": {
          g.append("path").attr("class", "bench-leg").attr("d", "M-.8,0V-.5M.8,0V-.5M-.8,-.55V-1.25M.8,-.55V-1.25");
          g.append("path").attr("class", "bench-seat").attr("d", "M-1.1,-.6H1.1V-.42H-1.1Z");
          g.append("path").attr("class", "bench-back").attr("d", "M-1.1,-1.3H1.1V-.95H-1.1Z");
          break;
        }
        case "signpost": {
          g.append("path").attr("class", "post").attr("d", "M0,0V-2.7");
          S.trails.forEach((t, i) => {
            const end = t.to === sectorName ? t.pts[0] : t.pts[t.pts.length - 1], dir = end[0] - lm.x >= 0 ? 1 : -1, y = -2.5 + i * .62, w = 2.6;
            g.append("path").attr("class", "sign-board").attr("d", dir > 0 ? `M-.15,${y}H${w - .3}L${w},${y + .24}L${w - .3},${y + .48}H-.15Z` : `M.15,${y}H${-w + .3}L${-w},${y + .24}L${-w + .3},${y + .48}H.15Z`);
            g.append("text").attr("class", "sign-text lod-c").attr("x", dir * (w / 2 - .1)).attr("y", y + .36).text(t.to === sectorName ? "Parking lot" : t.to);
          });
          break;
        }
      }
    }

    // ---- the sky: hawks circling over the summit, fireflies over the meadow edges
    const reduceMotion = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hawkC = [S.sector.x + 10, -(S.sector.y + 12)];
    const hawks = sky.append("g").attr("class", "hawks");
    const hawkPath = "M0,-.2C-.5,-.55 -1.1,-.45 -1.65,-.1C-1.1,-.2 -.6,-.05 -.25,.15L-.18,.75L0,.6L.18,.75L.25,.15C.6,-.05 1.1,-.2 1.65,-.1C1.1,-.45 .5,-.55 0,-.2Z";
    for (let i = 0; i < 7; i++) {
      const rr = Art.rand("hawk" + i), rad = 16 + rr() * 32, dur = 22 + rr() * 26, start = rr() * 360, sc = 1.1 + rr() * .5;
      const cx = f2(hawkC[0] + (rr() - .5) * 20), cy = f2(hawkC[1] + (rr() - .5) * 20);
      const b = hawks.append("g").attr("class", `hawk h${i}`).append("g").attr("transform", `rotate(${f2(start)} ${cx} ${cy})`).append("g");
      if (!reduceMotion) b.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate")
        .attr("from", `0 ${cx} ${cy}`).attr("to", `${i % 2 ? -360 : 360} ${cx} ${cy}`).attr("dur", f2(dur) + "s").attr("repeatCount", "indefinite");
      b.append("path").attr("class", "hawk-shadow").attr("d", hawkPath).attr("transform", `translate(${f2(cx + rad + 9)},${f2(cy + 7)}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
      b.append("path").attr("class", "hawk-bird").attr("d", hawkPath).attr("transform", `translate(${f2(cx + rad)},${f2(cy)}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
    }
    const ffly = glow.append("g").attr("class", "fireflies");
    {
      const rr = Art.rand("fireflies");
      for (let i = 0; i < 70; i++) {
        const a = rr() * TAU, d = S.baldR * (.75 + rr() * .7), x = S.baldC[0] + Math.cos(a) * d, y = S.baldC[1] + Math.sin(a) * d;
        const c = ffly.append("circle").attr("cx", f2(x)).attr("cy", f2(-y - 1 - rr() * 2)).attr("r", .45);
        if (!reduceMotion) c.append("animate").attr("attributeName", "opacity").attr("values", ".25;.25;1;.25;.25").attr("keyTimes", "0;.5;.6;.75;1")
          .attr("dur", f2(2.5 + rr() * 3) + "s").attr("begin", f2(-rr() * 6) + "s").attr("repeatCount", "indefinite");
      }
    }

    // ---- the drawn area fades into paper at its edges, like a page in a field guide
    {
      const fade = defs.append("radialGradient").attr("id", "edge-fade").attr("gradientUnits", "userSpaceOnUse")
        .attr("cx", (bx0 + bx1) / 2).attr("cy", -(by0 + by1) / 2).attr("r", Math.hypot(W, H) / 2).attr("gradientTransform", `translate(${(bx0 + bx1) / 2},${-(by0 + by1) / 2}) scale(1,${f2(H / W)}) translate(${-(bx0 + bx1) / 2},${(by0 + by1) / 2})`);
      for (const [o, op] of [[0, 0], [.74, 0], [.88, .85], [1, 1]]) fade.append("stop").attr("offset", o).attr("class", "edge-stop").attr("stop-opacity", op);
      sky.append("rect").attr("class", "edge-fade").attr("x", bx0 - 400).attr("y", -by1 - 400).attr("width", W + 800).attr("height", H + 800).attr("fill", "url(#edge-fade)");
    }

    // ---- light over everything below the labels
    const tint = light.append("rect").attr("class", "tint"), veil = light.append("rect").attr("class", "veil"), dim = light.append("rect").attr("class", "dim");

    // ---- labels in screen space. What shows depends on zoom: the area's name
    // always; boulder names close up, or when you hover or pick one; lore notes
    // only close up. Placed by priority so they never overlap.
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const FONT = { sector: "800 17px Fraunces, Georgia, serif", boulder: "600 18px Caveat, cursive", note: "500 15px Caveat, cursive", trail: "600 15px Caveat, cursive" };
    const LOD = { area: 3.2, close: 7 };
    const labelItems = [];
    labelItems.push({ kind: "sector", text: sectorName.toUpperCase(), wx: S.baldC[0], wy: S.baldC[1] + S.baldR * .95, pri: 0, minK: 0 });
    for (const bo of S.boulders) if (bo.b.sector === sectorName) labelItems.push({ kind: "boulder", id: bo.id, text: bo.b.name, wx: bo.b.x, wy: bo.b.y, R: (bo.form3 || bo.form).R, Hh: (bo.form3 || bo.form).H, pri: 1, minK: LOD.close });
    for (const lm of S.landmarks) if (lm.note) labelItems.push({ kind: "note", text: lm.note, wx: lm.x, wy: lm.y, pri: 3, minK: 9, when: lm.when });
    for (const t of S.trails) {
      const out = t.to === sectorName ? t.pts[Math.max(0, t.pts.findIndex(p => Math.hypot(p[0] - S.sector.x, p[1] - S.sector.y) < 105) - 1)] : t.pts.find(p => Math.hypot(p[0] - S.sector.x, p[1] - S.sector.y) > 105);
      if (out) labelItems.push({ kind: "trail", text: t.to === sectorName ? "to the parking lot" : `to ${t.to}`, wx: out[0], wy: out[1], pri: 2, minK: 2 });
    }
    const labelSel = labels.selectAll("g.lab").data(labelItems).join("g").attr("class", d => `lab lab-${d.kind}${d.when ? " when-" + d.when : ""}`);
    labelSel.append("path").attr("class", "leader");
    labelSel.append("text").attr("class", "lt").text(d => d.text);
    labelSel.filter(d => d.kind === "sector").append("text").attr("class", "lsub").attr("dy", 17).text(() => {
      const ps = D.problems.filter(p => D.boulders[p.b].sector === sectorName).map(p => p.grade);
      return `V${Math.min(...ps)}–V${Math.max(...ps)} · ${S.sector.walk_min} min walk`;
    });
    labelItems.forEach(d => { d.w = measure(d.text, FONT[d.kind]); });

    // ---- you
    const meG = marks.append("g").attr("class", "me");
    meG.append("circle").attr("class", "me-pulse").attr("r", 11); meG.append("circle").attr("class", "me-halo").attr("r", 9); meG.append("circle").attr("class", "me-dot").attr("r", 6.5);
    const hereB = S.boulders.find(bo => bo.b.name === state.here);
    const meWorld = hereB ? [hereB.b.x - hereB.form.R * .55, hereB.b.y - hereB.form.R * 1.45] : [S.sector.x, S.sector.y];

    // ---- interaction: hover shows a boulder's card and its name; a click picks it
    const tip = opts.tooltip;
    const ui = { hover: null, picked: hereB ? hereB.id : null };
    const boulderSel = stand.selectAll("g.boulder");
    const markBoulders = () => { boulderSel.classed("hot", function () { return +this.dataset.id === ui.hover; }).classed("picked", function () { return +this.dataset.id === ui.picked; }); };
    boulderSel.on("pointerenter pointermove", function (e) {
      const id = +this.dataset.id, b = S.boulders.find(x => x.id === id).b;
      if (ui.hover !== id) { ui.hover = id; markBoulders(); placeLabels(); }
      if (!tip) return;
      const g = d3.extent(b.problems, i => D.problems[i].grade);
      tip.innerHTML = `<strong>${esc(b.name)}</strong><div class="sub">${esc(b.sector)} · ${b.height_ft} ft · ${esc(b.angle)}</div>
        ${b.desc ? `<div class="tip-desc">${esc(b.desc)}</div>` : ""}${b.problems.length} problems, V${g[0]}${g[1] > g[0] ? "–V" + g[1] : ""}`;
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width - 8) x -= tip.offsetWidth + 28;
      if (y + tip.offsetHeight > r.height - 8) y -= tip.offsetHeight + 28;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }).on("pointerleave", () => { ui.hover = null; markBoulders(); placeLabels(); if (tip) tip.hidden = true; })
      .on("click", function (e) { e.stopPropagation(); ui.picked = +this.dataset.id; markBoulders(); placeLabels(); });
    markBoulders();
    svg.on("pointermove.zone", e => { const [mx, my] = d3.pointer(e), wx = T.invertX(mx), wy = -T.invertY(my);
      wrap.classList.toggle("zone-hot", Math.hypot(wx - S.sector.x, wy - S.sector.y) < S.baldR + 12); })
      .on("pointerleave.zone", () => wrap.classList.remove("zone-hot"));

    // ---- zoom and levels of detail
    let size = { w: wrap.clientWidth || 900, h: wrap.clientHeight || 700 }, T = d3.zoomIdentity, furniture = [];
    // The map's own furniture (cartouche, zoom buttons, compass), measured once per resize, not per frame.
    const measureFurniture = () => {
      const wr = wrap.getBoundingClientRect();
      furniture = [...wrap.querySelectorAll(".cartouche, .tools, .compass")].map(el => { const r = el.getBoundingClientRect(); return { x0: r.left - wr.left - 6, x1: r.right - wr.left + 6, y0: r.top - wr.top - 6, y1: r.bottom - wr.top + 6 }; });
    };
    const zoom = d3.zoom().scaleExtent([2.2, 16]).translateExtent([[bx0, -by1], [bx1, -by0]]).on("zoom", e => { T = e.transform; draw(); });
    svg.call(zoom).on("dblclick.zoom", null);
    let lod = "";
    function draw() {
      world.attr("transform", T); glow.attr("transform", T);
      const k = T.k, next = k < LOD.area ? "far" : k < LOD.close ? "area" : "close";
      if (next !== lod) { lod = next; wrap.classList.toggle("lod-far", lod === "far"); wrap.classList.toggle("lod-area", lod === "area"); wrap.classList.toggle("lod-close", lod === "close"); }
      placeLabels();
      meG.attr("transform", `translate(${f2(T.applyX(meWorld[0]))},${f2(T.applyY(-meWorld[1]))})`);
    }
    function placeLabels() {
      const k = T.k, boxes = furniture.slice();
      const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      for (const b of S.boulders) {
        const x = T.applyX(b.b.x), y = T.applyY(-b.b.y);
        boxes.push({ x0: x - b.form.R * k, x1: x + b.form.R * k, y0: y - (b.form.H + b.form.R * .4) * k, y1: y + b.form.R * .7 * k });
      }
      const rank = d => (d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked) ? -1 : d.pri);
      const order = [...labelItems].sort((a, b) => rank(a) - rank(b));
      for (const d of order) {
        d.show = false;
        const wanted = d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked);
        if (k < d.minK && !wanted) continue;
        const ax = T.applyX(d.wx), ay = T.applyY(-d.wy), h = d.kind === "sector" ? 34 : 18;
        let cands;
        if (d.kind === "boulder") { const rx = d.R * k, top = d.Hh * k; cands = [[ax + rx + 6, ay - top * .3, "start"], [ax - rx - 6, ay - top * .3, "end"], [ax, ay + rx * .8 + 18, "middle"], [ax, ay - top - rx * .35 - 6, "middle"]]; }
        else if (d.kind === "note") cands = [[ax + 12, ay - 16, "start"], [ax - 12, ay - 16, "end"], [ax + 12, ay + 20, "start"], [ax - 12, ay + 20, "end"]];
        else cands = [[ax, ay, "middle"]];
        for (const [x, y, anchor] of cands) {
          const x0 = anchor === "start" ? x : anchor === "end" ? x - d.w : x - d.w / 2;
          const box = { x0: x0 - 3, x1: x0 + d.w + 3, y0: y - h + 4, y1: y + 6 };
          if (box.x0 < 4 || box.x1 > size.w - 4 || box.y0 < 4 || box.y1 > size.h - 4) continue;
          if (hit(box) && d.kind !== "sector" && !wanted) continue;
          boxes.push(box); d.show = true; d.x = x; d.y = y; d.anchor = anchor; d.ax = ax; d.ay = ay; break;
        }
      }
      labelSel.attr("display", d => (d.show ? null : "none")).attr("transform", d => (d.show ? `translate(${f2(d.x)},${f2(d.y)})` : null))
        .classed("hot", d => d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked));
      labelSel.select("text.lt").attr("text-anchor", d => d.anchor);
      labelSel.select("text.lsub").attr("text-anchor", "middle");
      labelSel.select("path.leader").attr("d", d => (d.show && d.kind === "note" ? `M${f2(d.anchor === "end" ? -4 : 4)},${f2(d.y < d.ay ? 4 : -14)}L${f2(d.ax - d.x)},${f2(d.ay - d.y - 3)}` : null));
    }
    function sizeLight() { for (const r of [tint, veil, dim]) r.attr("width", size.w).attr("height", size.h); }
    const fitTo = (cx, cy, rad) => { const k = Math.min(size.w, size.h) / (2 * rad); return d3.zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * -cy).scale(k); };
    const home = () => fitTo(S.sector.x, S.sector.y + 6, S.sector.radius + 34);
    svg.attr("viewBox", `0 0 ${size.w} ${size.h}`); sizeLight(); measureFurniture();
    svg.call(zoom.transform, opts.view ? fitTo(...opts.view) : home());
    new ResizeObserver(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h || (w === size.w && h === size.h)) return;
      size = { w, h }; svg.attr("viewBox", `0 0 ${w} ${h}`); sizeLight(); measureFurniture(); svg.call(zoom.transform, home());
    }).observe(wrap);
    const go = (t, ms = 700) => svg.transition().duration(reduceMotion ? 0 : ms).call(zoom.transform, t);

    // ---- season and light, as variables only
    const rootStyle = wrap.style;
    function setDate(date) {
      const P = Illu.paletteAt(date);
      const v = { "--leaf": P.leaf, "--snow": P.snow, "--flowers": P.flowers, "--fernness": P.ferns, "--berries": P.berries, "--shrooms": P.shrooms,
        "--floor": P.floor, "--floor2": P.floor2, "--meadow": P.meadow, "--bald-c": P.bald, "--grass-c": P.grass, "--fern-c": P.fern,
        "--shrub-c": P.shrub, "--bb": P.blueberry, "--litter-0": P.litter[0], "--litter-1": P.litter[1], "--water": P.water,
        "--shade-c": P.shade, "--canopy": P.canopy, "--trunk": P.trunk, "--season-tint": P.tint };
      ["maple", "oak", "birch", "ever"].forEach(k => P[k].forEach((c, i) => { v[`--${k}-${i}`] = c; }));
      P.fl.forEach((c, i) => { v[`--fl-${i}`] = c; });
      v["--bare-d"] = P.leaf >= .97 ? "none" : "inline";      // bare branches only when the canopy isn't full
      for (const [k, x] of Object.entries(v)) rootStyle.setProperty(k, typeof x === "number" ? x.toFixed(3) : x);
      wrap.classList.toggle("is-hawkWatch", P.hawkWatch); wrap.classList.toggle("is-kettle", P.kettle); wrap.classList.toggle("is-fireflies", P.fireflies);
      wrap.dataset.season = P.key;
      return P;
    }
    const SUN = { "Morning": "#fff0cf", "Midday": "#fffbea", "Afternoon": "#fff3d0", "Golden hour": "#ffd17a", "Dusk": "#ffb38c", "Night": "#9fb0e0" };
    function setTime(minute, dusk, sky = "Sunny", over = false) {
      const L = Art.lightAt(minute, dusk, { sky, over });
      const sunX = -L.shadow[0] / (Math.hypot(...L.shadow) || 1);
      const cloudy = /overcast|rain|snow/i.test(sky);
      const sun = L.phase === "Dusk" ? Art.mix("#ffc58c", "#d9a3c8", Math.max(0, Math.min(1, 1 - (dusk - minute) / 90))) : SUN[L.phase];
      const hlE = cloudy ? .18 : .2 + .65 * Math.max(0, sunX) + .2 * L.alt, hlW = cloudy ? .18 : .2 + .65 * Math.max(0, -sunX) + .2 * L.alt;
      const v = { "--tint": L.tint, "--tint-op": L.op.toFixed(3), "--veil": L.veil, "--veil-op": L.veilOp.toFixed(3),
        "--shadow-op": (cloudy ? .14 : .3 + .08 * (1 - L.alt)).toFixed(3), "--sun": sun, "--hl-e": hlE.toFixed(3), "--hl-w": hlW.toFixed(3),
        "--hle-d": hlE < .3 ? "none" : "inline", "--hlw-d": hlW < .3 ? "none" : "inline",
        "--tint-d": L.op < .01 ? "none" : "inline" };          // the multiply blend costs a full-map composite: skip it when there's no tint
      for (const [k, x] of Object.entries(v)) rootStyle.setProperty(k, x);
      shadows.selectAll("path[data-h]").attr("transform", function () { const h = +this.dataset.h; return `translate(${f2(L.shadow[0] * h)},${f2(-L.shadow[1] * h)})`; });
      wrap.dataset.phase = L.phase.toLowerCase().replace(/\s+/g, "-");
      return L;
    }
    function setOutlines(mode) { wrap.dataset.outlines = mode; }
    function setRocks(mode) { wrap.dataset.rocks = mode; }
    function flyTo(what, k = 9) {
      let p = null;
      const lm = S.landmarks.find(l => l.kind === what || l.name === what || l.note === what);
      const bo = S.boulders.find(b => b.b.name === what);
      if (lm) p = [lm.x, lm.y + 2]; else if (bo) { p = [bo.b.x, bo.b.y + bo.form.H * .3]; ui.picked = bo.id; markBoulders(); }
      if (!p) return;
      go(d3.zoomIdentity.translate(size.w / 2 - k * p[0], size.h / 2 + k * p[1]).scale(k));
    }
    draw();
    return { setDate, setTime, setOutlines, setRocks, flyTo, home: () => go(home()), zoomBy: f => svg.transition().duration(reduceMotion ? 0 : 250).call(zoom.scaleBy, f), scene: S };
  }

  root.Paint = { paint };
})(window);
