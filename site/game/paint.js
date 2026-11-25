// Granite Hollow, illustrated: draws the park from illustrate.js's scene, as
// layered SVG. The game's map (game.js) and the art prototype (site/prototype/park.html)
// both use it; the game passes callbacks (walking to a boulder or an area, its
// tooltips, the scale bar) and keeps the markers up to date with setMarks(). Colours come from CSS custom properties (season and
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
  const TAU = Math.PI * 2, clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x)), smooth = Illu.smooth;
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
    apple: { th: 1.6, R: 2.5, rx: 1.15, ry: .78, n: 10, lobe: .5, tw: .36 },     // old orchard trees: low, wide, crooked
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
      // Apple trees carry blossom in May and fruit in October (one layer, coloured by the calendar).
      const fruit = kind === "apple" ? Array.from({ length: full ? 14 : 8 }, () => { const l = lobes[Math.floor(r() * lobes.length)]; return E(l[0] + (r() - .5) * l[2] * 1.1, l[1] + (r() - .5) * l[2] * .9, .2); }).flat() : null;
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
      for (let i = 0; i < nMain; i++) grow(lean, -S.th - .2, -Math.PI / 2 + (i - (nMain - 1) / 2) * (kind === "oak" || kind === "apple" ? .75 : .48) + (r() - .5) * .25, R * (kind === "oak" ? .62 : .58), full ? 2 : 1);
      const tw = S.tw;
      const trunk = [["M", -tw * 1.5, 0], ["Q", -tw * .9, -S.th * .5, -tw * .55 + lean, -S.th - .4], ["L", tw * .55 + lean, -S.th - .4], ["Q", tw * .9, -S.th * .5, tw * 1.5, 0], ["Z"]];
      const marks = kind === "birch" ? Array.from({ length: 6 }, () => { const y = -.4 - r() * (S.th - .4), x = lean * (-y / S.th) - tw * .5 + r() * tw * .3; return [["M", x, y], ["L", x + tw * (.3 + r() * .4), y]]; }).flat() : [];
      g = { ...C, bare, trunk, marks, fruit, birch: kind === "birch", tw, crownY: -cy, crownR: R * S.rx, ever: false };
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
  // The whole park. What's always drawn: the ground (open ground, water, the
  // quarry, the lot and road, trails, brooks, stone walls, ruins). Zoomed out
  // (the park view), the forest is one light drawing (a blob or cone per tree,
  // merged by colour) and the boulders are their bare planes. Zoomed in, the
  // park is drawn in 90 m tiles, each built the first time it comes into view
  // and hidden while it's off screen: canopy, foreground trees, understory,
  // shadows, boulders and landmarks.
  function paint(svgEl, D, opts = {}) {
    const d3 = root.d3;
    const S = Illu.parkScene(D);
    const svg = d3.select(svgEl), wrap = svgEl.parentElement;
    svg.selectAll("*").remove();
    // What the player knows (setKnown). null: everything, as on the prototype page
    // and under the game's old rules. Unknown boulders are still drawn, unnamed.
    let known = null;
    const nameOf = bo => (known ? known.boulders[bo.id] || null : bo.b.name);
    const ariaOf = bo => { const n = nameOf(bo); return n ? `${n}, ${bo.b.sector}` : "Unfamiliar boulder"; };
    const defs = svg.append("defs");
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
    const groundT = world.append("g").attr("class", "ground-t tiled");
    const under = world.append("g").attr("class", "under tiled");
    const snowL = world.append("g").attr("class", "snowcover");
    const waterL = world.append("g").attr("class", "waters");
    const ruins = world.append("g").attr("class", "ruins");
    const shadows = world.append("g").attr("class", "shadows tiled");
    const far = world.append("g").attr("class", "far");
    const canopy = world.append("g").attr("class", "canopy tiled");
    const rings = world.append("g").attr("class", "rings");          // project rings, on the ground under the rocks
    const stand = world.append("g").attr("class", "standing tiled");
    const over = world.append("g").attr("class", "over");            // your pads at the boulder you're at
    const sky = world.append("g").attr("class", "sky-layer");
    const light = svg.append("g").attr("class", "light").attr("pointer-events", "none");
    const glow = svg.append("g").attr("class", "glow").attr("pointer-events", "none");
    const labels = svg.append("g").attr("class", "labels");
    const badges = svg.append("g").attr("class", "badges");          // sent and tip badges, in screen space
    const marks = svg.append("g").attr("class", "marks");

    const blobPts = (seed, cx, cy, rx, ry, n = 9, wob = .4) => { const r = Art.rand(seed); return d3.range(n).map(i => { const a = i / n * TAU + r() * .3, k = 1 - wob / 2 + r() * wob; return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; }); };
    const closed = d3.line().curve(d3.curveCardinalClosed.tension(.15));
    const blobD = (...a) => closed(blobPts(...a).map(p => [f1(p[0]), f1(p[1])]));
    const smoothRing = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
    const basisRing = d3.line().curve(d3.curveBasisClosed);
    const ringD = pts => basisRing(pts.map(p => [f1(p[0]), f1(-p[1])]));
    const lineD = pts => d3.line().curve(d3.curveLinear)(pts.map(p => [f1(p[0]), f1(-p[1])]));
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
    const state = opts.state || {};
    const wl = d3.line().curve(d3.curveCatmullRom);
    const drystone = (Lr, lines, w = 1.25, stones = true) => {
      Lr.append("path").attr("class", "dry-shadow").attr("stroke-width", f2(w * 1.35)).attr("d", lines.map(l => wl(l.map(p => [f2(p[0] + .3), f2(p[1] + .45)]))).join(""));
      Lr.append("path").attr("class", "dry-body").attr("stroke-width", f2(w)).attr("d", lines.map(l => wl(l.map(p => [f2(p[0]), f2(p[1])]))).join(""));
      Lr.append("path").attr("class", "dry-top").attr("stroke-width", f2(w * .45)).attr("d", lines.map(l => wl(l.map(p => [f2(p[0]), f2(p[1] - w * .22)]))).join(""));
      if (!stones) return;
      const rr = Art.rand("stones" + lines.length + w), st = [];
      for (const l of lines) for (let i = 1; i < l.length; i++) {
        const a2 = l[i - 1], b2 = l[i], L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), n = Math.max(1, Math.round(L / (w * .7)));
        for (let j = 0; j < n; j++) { const f = j / n, x = a2[0] + (b2[0] - a2[0]) * f + (rr() - .5) * w * .3, y = a2[1] + (b2[1] - a2[1]) * f + (rr() - .5) * w * .25; st.push(ell(x, y - w * .1, w * (.26 + rr() * .14), w * (.17 + rr() * .08))); }
      }
      Lr.append("path").attr("class", "dry-stone lod-a").attr("d", st.join(""));
    };
    // A small block of cut granite in three-quarter view: top, front and side.
    const block = (g, x, y, w, d, h, cls = "") => {
      const fy = d * .62;
      g.append("path").attr("class", "blk-front " + cls).attr("d", `M${f2(x - w / 2)},${f2(y)}h${f2(w)}v${f2(-h)}h${f2(-w)}Z`);
      g.append("path").attr("class", "blk-side " + cls).attr("d", `M${f2(x + w / 2)},${f2(y)}l${f2(d * .3)},${f2(-fy)}v${f2(-h)}l${f2(-d * .3)},${f2(fy)}Z`);
      g.append("path").attr("class", "blk-top " + cls).attr("d", `M${f2(x - w / 2)},${f2(y - h)}h${f2(w)}l${f2(d * .3)},${f2(-fy)}h${f2(-w)}Z`);
    };

    // ---- ground: the forest floor and its light, then each kind of open ground
    ground.append("rect").attr("class", "floor").attr("x", bx0 - 400).attr("y", -by1 - 400).attr("width", W + 800).attr("height", H + 800);
    for (const tone of [0, 1]) ground.append("path").attr("class", "wash w" + tone)
      .attr("d", S.washes.filter(w => w.tone === tone).map(w => blobD("w" + w.seed, w.x, -w.y, w.r, w.r)).join(""));
    // The lie of the land: slopes facing the afternoon sun a little warmer, the far sides a little cooler.
    {
      const cell = 10, nx = Math.ceil(W / cell) + 3, ny = Math.ceil(H / cell) + 3, x0 = bx0 - cell, y0 = by0 - cell;
      const sh = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, y = y0 + j * cell, gx = (S.elevAt(x + 4, y) - S.elevAt(x - 4, y)) / 8, gy = (S.elevAt(x, y + 4) - S.elevAt(x, y - 4)) / 8;
        sh[j * nx + i] = (-gx * -.6 + -gy * .8) * 6;   // light from the south-west-ish (the map's drawing light)
      }
      const cpath = d3.geoPath(d3.geoTransform({ point(x, y) { this.stream.point(f1(x0 + x * cell), f1(-(y0 + y * cell))); } }));
      const lit = d3.contours().size([nx, ny]).thresholds([.25, .6])(sh), dark = d3.contours().size([nx, ny]).thresholds([-.25, -.6])(sh.map(v => -v));
      lit.forEach((c, i) => ground.append("path").attr("class", "relief lit r" + i).attr("d", cpath(c)));
      dark.forEach((c, i) => ground.append("path").attr("class", "relief shade r" + i).attr("d", cpath(c)));
    }
    // Clearings: each area's open ground, trampled by climbers; the verge by the lot.
    const zoneOf = k => S.zones.filter(z => z.kind === k);
    ground.append("path").attr("class", "clear-fringe").attr("d", zoneOf("clearing").map(z => ringD(z.ring(1.08))).join(""));
    ground.append("path").attr("class", "clear").attr("d", zoneOf("clearing").filter(z => !z.mossy).map(z => ringD(z.ring())).join(""));
    ground.append("path").attr("class", "clear mossy").attr("d", zoneOf("clearing").filter(z => z.mossy).map(z => ringD(z.ring())).join(""));
    // The grout piles: a pale apron of quarry waste.
    ground.append("path").attr("class", "grout-ground").attr("d", zoneOf("grout").map(z => ringD(z.ring())).join(""));
    // The Back Forty's hayfield: tall grass, mown in late summer.
    if (S.field) {
      const fd = ringD(S.field.ring());
      ground.append("path").attr("class", "field-fringe").attr("d", ringD(S.field.ring(1.05)));
      ground.append("path").attr("class", "hayfield").attr("d", fd);
      defs.append("clipPath").attr("id", "field-clip").append("path").attr("d", fd);
      const c = S.field.c, rr = S.field.R * 1.1, rows = [];
      for (let o = -rr; o <= rr; o += 4.5) rows.push(`M${f1(c[0] - rr)},${f1(-(c[1] + o - rr * .1))}L${f1(c[0] + rr)},${f1(-(c[1] + o + rr * .1))}`);
      ground.append("path").attr("class", "mown").attr("d", rows.join("")).attr("clip-path", "url(#field-clip)");
      // Drifts of taller grass and the odd thistle patch, so the field isn't one flat colour.
      const tufts = Illu.scatter("tufts", [c[0] - S.field.R, c[0] + S.field.R, c[1] - S.field.R, c[1] + S.field.R], 7).filter(p => S.field.depth(p) > 2);
      ground.append("path").attr("class", "field-tuft").attr("d", tufts.map((p, i) => blobD("t" + i, p[0], -p[1], 2.4 + (i % 5) * .5, 1.4 + (i % 3) * .3, 7, .45)).join("")).attr("clip-path", "url(#field-clip)");
    }
    // The quarry: a pit cut in benches, pale granite floor, its flooded hole drawn with the water.
    if (S.quarry) {
      const q = S.quarry;
      ground.append("path").attr("class", "quarry-apron").attr("d", ringD(q.ring(1.1)));
      ground.append("path").attr("class", "quarry-floor").attr("d", ringD(q.ring()));
      // Seen from the south, the pit's far (north) wall shows as a cliff of cut granite, its near wall is hidden.
      const rim = q.ring(1, 160), face = [], drop = 8;
      const north = rim.map((p, i) => ({ p, a: i / 160 * TAU })).filter(o => Math.sin(o.a) > -.15);
      const run = north.sort((u, v) => Math.cos(v.a) - Math.cos(u.a)).map(o => o.p);   // east to west across the north side
      const top = run.map(p => [f1(p[0]), f1(-p[1])]), bottom = run.map(p => [f1(p[0] + (q.c[0] - p[0]) * .04), f1(-p[1] + drop * Math.max(.15, (p[1] - q.c[1]) / q.R + .15))]);
      ground.append("path").attr("class", "quarry-face").attr("d", "M" + top.map(p => p.join(",")).join("L") + "L" + bottom.reverse().map(p => p.join(",")).join("L") + "Z");
      ground.append("path").attr("class", "quarry-lip").attr("d", "M" + top.map(p => p.join(",")).join("L"));
      // Drill marks down the cut face, close up.
      const rr = Art.rand("drill"), dm = [];
      run.forEach((p, i) => { if (i % 2 === 0 && rr() < .7) dm.push(`M${f2(p[0])},${f2(-p[1] + .6)}v${f2(drop * Math.max(.15, (p[1] - q.c[1]) / q.R + .15) * (.5 + rr() * .4))}`); });
      ground.append("path").attr("class", "drill lod-a").attr("d", dm.join(""));
    }
    // The bald summit: heath, granite ledges, sheet joints.
    const baldD = ringD(S.bald.ring());
    const tl = d3.line().curve(d3.curveLinear);
    const trailD = t => tl(t.pts.map(p => [f1(p[0]), f1(-p[1])]));
    // Trails go down first: where they cross the bald, the heath covers them and only a worn line and the blazes show.
    const trailUnder = ground.append("g").attr("class", "trails");
    for (const t of S.trails) { trailUnder.append("path").attr("class", "trail-edge").attr("d", trailD(t)); trailUnder.append("path").attr("class", "trail-dirt").attr("d", trailD(t)); }
    const baldG = ground.append("g").attr("class", "bald-g");
    baldG.append("path").attr("class", "bald-fringe").attr("d", ringD(S.bald.ring(1.04)));
    baldG.append("path").attr("class", "bald").attr("d", baldD);
    defs.append("clipPath").attr("id", "bald-clip").append("path").attr("d", baldD);
    const RG = S.rockGrid;
    const gpath = mp => mp.coordinates.map(poly => poly.map(r => basisRing(r.slice(0, -1).map(([x, y]) => [f1(RG.x0 + x * RG.cell), f1(-(RG.y0 + y * RG.cell))]))).join("")).join("");
    const ledges = d3.contours().size([RG.nx, RG.ny]).thresholds([RG.t, RG.t + .1])(RG.values);
    ledges.forEach((c, i) => baldG.append("path").attr("class", "ledge ledge" + i).attr("d", gpath(c)));
    // The lot and the road.
    {
      const g = ground.append("g").attr("class", "lot-g");
      g.append("path").attr("class", "road-edge").attr("d", `M${f1(bx0 - 400)},38H${f1(bx1 + 400)}`);
      g.append("path").attr("class", "road").attr("d", `M${f1(bx0 - 400)},38H${f1(bx1 + 400)}`);
      g.append("path").attr("class", "road-line").attr("d", `M${f1(bx0 - 400)},38H${f1(bx1 + 400)}`);
      // The lot goes round a grass island, where The Billboard stands facing the road.
      g.append("path").attr("class", "lot").attr("fill-rule", "evenodd").attr("d", `M-3.5,40V30H-24Q-27,30 -27,27V-1Q-27,-4 -24,-4H24Q27,-4 27,-1V27Q27,30 24,30H3.5V40Z` + `M-7,2.5H7Q10,2.5 10,5.5V14.5Q10,17.5 7,17.5H-7Q-10,17.5 -10,14.5V5.5Q-10,2.5 -7,2.5Z`);
      g.append("path").attr("class", "island").attr("d", `M-7,2.5H7Q10,2.5 10,5.5V14.5Q10,17.5 7,17.5H-7Q-10,17.5 -10,14.5V5.5Q-10,2.5 -7,2.5Z`);
      const stalls = [];
      for (const y of [-4, 30]) for (const x of [-23, -17, -11, 11, 17, 23]) stalls.push(`M${x},${y}v${y < 0 ? 6 : -6}`);
      g.append("path").attr("class", "stall").attr("d", stalls.join(""));
    }
    // Patches of sand: The Sandbox at the schoolhouse.
    for (const lm of S.landmarks.filter(l => l.kind === "sandpit")) {
      const bo = S.boulders.find(b => b.b.name === lm.near);
      ground.append("path").attr("class", "sand").attr("d", blobD("sand", lm.x, -lm.y + 1, bo.form.R * 2.1, bo.form.R * 1.5, 11, .25));
    }
    // A boggy seep (Bracken Gully).
    for (const lm of S.landmarks.filter(l => l.kind === "seep")) {
      ground.append("path").attr("class", "seep").attr("d", blobD("seep", lm.x, -lm.y, 3.6, 2.2, 10, .4));
      const rr = Art.rand("sundew"), dots = [];
      for (let i = 0; i < 18; i++) { const a = rr() * TAU, d = Math.sqrt(rr()) * 2.6; dots.push(circ(lm.x + Math.cos(a) * d, -lm.y + Math.sin(a) * d * .55, .11)); }
      ground.append("path").attr("class", "sundew lod-c").attr("d", dots.join(""));
    }
    // Worn, quiet ground at the foot of every boulder.
    ground.append("g").attr("class", "worn").selectAll("ellipse").data(S.boulders).join("ellipse")
      .attr("cx", bo => f1(bo.b.x)).attr("cy", bo => f1(-bo.b.y + bo.form.R * .1)).attr("rx", bo => f1(bo.form.R * 1.75)).attr("ry", bo => f1(bo.form.R * 1.2)).attr("fill", "url(#soft-earth)");
    // Across the open rock the trail is a worn line marked by blue blazes; elsewhere, dashed ink when zoomed out.
    const trailG = ground.append("g").attr("class", "trails");
    const blazes = [];
    for (const t of S.trails) {
      const d = trailD(t);
      trailG.append("path").attr("class", "trail-worn").attr("d", d).attr("clip-path", "url(#bald-clip)");
      trailG.append("path").attr("class", "trail-ink only-park").attr("d", d);
      let acc = 0;
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc < 9) continue; acc = 0;
        if (S.bald.depth(b) < 3) continue;
        const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
        const pt = (u, v) => `${f2(b[0] + u * c - v * s)},${f2(-b[1] + u * s + v * c)}`;
        blazes.push(`M${pt(-.45, -.22)}L${pt(.45, -.22)}L${pt(.45, .22)}L${pt(-.45, .22)}Z`);
      }
    }
    trailG.append("path").attr("class", "trail-blaze lod-a").attr("d", blazes.join(""));

    // ---- snow over the ground (trails stay as packed tracks)
    snowL.append("rect").attr("class", "snow-cover").attr("x", bx0 - 400).attr("y", -by1 - 400).attr("width", W + 800).attr("height", H + 800);
    for (const t of S.trails) snowL.append("path").attr("class", "trail-snowpack").attr("d", trailD(t));

    // ---- water: brooks, Mill Pond, the reservoir and its dam, the quarry's swimming hole. Drawn over
    // the snow, so in winter the ice still reads.
    {
      const brook = d3.line().curve(d3.curveBasis);
      const bd = s => brook(s.pts.map(p => [f1(p[0]), f1(-p[1])]));
      for (const s of S.streams) {
        if (s.race) { drystone(waterL, [s.pts.map(p => [p[0], -p[1]])], 2.6, true); waterL.append("path").attr("class", "race").attr("d", bd(s)); continue; }
        waterL.append("path").attr("class", "brook-bank").attr("d", bd(s));
        waterL.append("path").attr("class", "brook").attr("d", bd(s));
        waterL.append("path").attr("class", "brook-glint").attr("d", bd(s));
      }
      // Footbridges: a few planks where a trail crosses.
      for (const b of S.bridges) {
        const g = waterL.append("g").attr("class", "bridge").attr("transform", `translate(${f2(b.x)},${f2(-b.y)}) rotate(${f2(-b.a * 180 / Math.PI)})`);
        g.append("path").attr("class", "bridge-shadow").attr("d", "M-2.4,.9H2.4V1.5H-2.4Z");
        g.append("path").attr("class", "bridge-deck").attr("d", "M-2.4,-1H2.4V1H-2.4Z");
        g.append("path").attr("class", "bridge-planks lod-a").attr("d", d3.range(-2, 2.01, .6).map(x => `M${f2(x)},-1V1`).join(""));
      }
      for (const z of S.water) {
        const g = waterL.append("g").attr("class", "lake" + (z.pit ? " pit" : ""));
        const d = ringD(z.ring());
        g.append("path").attr("class", "shore").attr("d", ringD(z.ring(1.04)));
        g.append("path").attr("class", "water").attr("d", d);
        g.append("path").attr("class", "water-deep").attr("d", ringD(z.ring(.72).map(p => [p[0] + z.R * .03, p[1] - z.R * .02])));
        // Ripples: little paired arcs, more toward the middle.
        const rr = Art.rand("ripple" + z.name), rip = [];
        for (let i = 0; i < Math.round(z.R * z.R / 260); i++) {
          const a = rr() * TAU, dd = Math.sqrt(rr()) * .8, e = z.edge(a) * dd, x = z.c[0] + Math.cos(a) * e, y = -(z.c[1] + Math.sin(a) * e), w = 1.6 + rr() * 2.4;
          rip.push(`M${f1(x - w)},${f1(y)}q${f2(w / 2)},${f2(-.7)} ${f2(w)},0q${f2(w / 2)},.7 ${f2(w)},0`);
        }
        g.append("path").attr("class", "ripple lod-a").attr("d", rip.join(""));
        if (z.name === "Mill Pond") {
          // Lily pads in the shallows, summer only.
          const pads = [];
          for (let i = 0; i < 46; i++) { const a = rr() * TAU, e = z.edge(a) * (.7 + rr() * .22), x = z.c[0] + Math.cos(a) * e, y = -(z.c[1] + Math.sin(a) * e), r = .9 + rr() * .8, cut = rr() * TAU;
            pads.push(`M${f2(x)},${f2(y)}L${f2(x + Math.cos(cut) * r)},${f2(y + Math.sin(cut) * r * .7)}A${f2(r)},${f2(r * .7)} 0 1,1 ${f2(x + Math.cos(cut + .5) * r)},${f2(y + Math.sin(cut + .5) * r * .7)}Z`); }
          g.append("path").attr("class", "lily").attr("d", pads.join(""));
          g.append("path").attr("class", "lily-flower lod-a").attr("d", d3.range(9).map(() => { const a = rr() * TAU, e = z.edge(a) * (.72 + rr() * .2); return circ(z.c[0] + Math.cos(a) * e, -(z.c[1] + Math.sin(a) * e), .32); }).join(""));
        }
        g.append("path").attr("class", "ice").attr("d", ringD(z.ring(.99)));
        g.append("path").attr("class", "ice-crack lod-a").attr("d", d3.range(5).map(() => { const a = rr() * TAU, e = z.edge(a) * rr() * .7, x = z.c[0] + Math.cos(a) * e, y = -(z.c[1] + Math.sin(a) * e), L = 4 + rr() * 9, b = rr() * TAU; return `M${f1(x)},${f1(y)}l${f1(Math.cos(b) * L)},${f1(Math.sin(b) * L * .6)}l${f1(Math.cos(b + .6) * L * .6)},${f1(Math.sin(b + .6) * L * .4)}`; }).join(""));
        if (z.dam) drawDam(waterL, z);
      }
    }
    function drawDam(Lr, z) {
      const { p0, p1, a } = z.dam, g = Lr.append("g").attr("class", "dam-g");
      const ux = Math.cos(a), uy = Math.sin(a), t = 3.2;     // outward (downstream) direction and wall thickness
      const P = (p, o) => `${f2(p[0] + ux * o)},${f2(-(p[1] + uy * o))}`;
      // The wall in three-quarter view: its top, and its downstream face dropping to the spillway.
      g.append("path").attr("class", "dam-face").attr("d", `M${P(p0, t)}L${P(p1, t)}L${f2(p1[0] + ux * t)},${f2(-(p1[1] + uy * t) + 3.4)}L${f2(p0[0] + ux * t)},${f2(-(p0[1] + uy * t) + 3.4)}Z`);
      g.append("path").attr("class", "dam-top").attr("d", `M${P(p0, 0)}L${P(p1, 0)}L${P(p1, t)}L${P(p0, t)}Z`);
      // The spillway: a notch in the middle where the reservoir pours out into Hollow Brook.
      const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], vx = (p1[0] - p0[0]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), vy = (p1[1] - p0[1]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const a0 = [m[0] - vx * 2.2, m[1] - vy * 2.2], a1 = [m[0] + vx * 2.2, m[1] + vy * 2.2];
      g.append("path").attr("class", "spill").attr("d", `M${P(a0, -.5)}L${P(a1, -.5)}L${f2(a1[0] + ux * (t + 2))},${f2(-(a1[1] + uy * (t + 2)) + 3.4)}L${f2(a0[0] + ux * (t + 2))},${f2(-(a0[1] + uy * (t + 2)) + 3.4)}Z`);
      g.append("path").attr("class", "spill-foam").attr("d", d3.range(7).map(i => { const f = (i + .5) / 7, x = a0[0] + (a1[0] - a0[0]) * f + ux * (t + 2.6), y = -(a0[1] + (a1[1] - a0[1]) * f + uy * (t + 2.6)) + 3.6; return ell(x, y, .7, .35); }).join(""));
      // A line of safety buoys across the water in front of it.
      const bu = [];
      for (let i = 0; i <= 8; i++) { const f = i / 8, x = p0[0] + (p1[0] - p0[0]) * f - ux * 12, y = p0[1] + (p1[1] - p0[1]) * f - uy * 12; bu.push([x, -y]); }
      g.append("path").attr("class", "buoy-line lod-a").attr("d", "M" + bu.map(p => f2(p[0]) + "," + f2(p[1])).join("L"));
      g.append("path").attr("class", "buoy lod-a").attr("d", bu.filter((_, i) => i % 2 === 0).map(p => ell(p[0], p[1] - .2, .45, .4)).join(""));
    }

    // ---- stone walls: the farmers' field boundaries, wandering through the woods. A dry-stone wall
    // reads as a band (shadow, body, sunlit top), with its stones showing when you're close.
    drystone(ruins, S.walls.map(w => w.map(p => [p[0], -p[1]])));
    // ---- ruins and other things that lie on the ground: drawn whole-park, at every zoom
    for (const lm of S.landmarks.filter(l => l.ground)) drawRuin(ruins, lm);
    // ---- the lot's cars (where the game parks them)
    for (const m of S.marks.filter(m => m.kind === "car")) drawCar(ruins, m);

    // ---- the park view: the forest as one light drawing, boulders as their planes
    const slot = t => t.ever ? `${t.kind}-${t.v % 2}` : `${t.kind}-${t.v}`;
    {
      const bySlot = new Map(), clumps = new Map();
      const shadeD = [];
      for (const t of S.trees) {
        const g = treeGlyph(t.kind, t.shape, false), s = t.size, X = t.x, Y = -t.y, sk = slot(t);
        if (!bySlot.has(sk)) bySlot.set(sk, { ever: t.ever, dark: [], mid: [], snow: [] });
        const L = bySlot.get(sk);
        if (t.kind === "hemlock" || t.kind === "whitepine") {
          const top = Y - g.crownY / .45 * s * (t.kind === "whitepine" ? .82 : 1), bot = Y - .8 * s, w = g.crownR * s * (t.kind === "whitepine" ? 1.05 : 1);
          L.dark.push(`M${f1(X)},${f1(top)}L${f1(X + w)},${f1(bot)}L${f1(X - w)},${f1(bot)}Z`);
          L.mid.push(`M${f1(X - w * .08)},${f1(top + (bot - top) * .12)}L${f1(X + w * .55)},${f1(bot - .4 * s)}L${f1(X - w * .72)},${f1(bot - .4 * s)}Z`);
          L.snow.push(`M${f1(X)},${f1(top)}L${f1(X + w * .4)},${f1(top + (bot - top) * .4)}L${f1(X - w * .4)},${f1(top + (bot - top) * .4)}Z`);
        } else {
          // Round crowns are gathered into clumps (a few trees to a dab), so autumn reads as
          // drifts of colour rather than confetti.
          const cy = Y - g.crownY * s, r = g.crownR * s * .95, ck = Math.floor(X / 10) + "," + Math.floor(cy / 8.5);
          if (!clumps.has(ck)) clumps.set(ck, { sx: 0, sy: 0, a: 0, n: 0, best: 0, sk, ever: t.ever });
          const c = clumps.get(ck); c.sx += X * r * r; c.sy += cy * r * r; c.a += r * r; c.n++;
          if (r > c.best) { c.best = r; c.sk = sk; c.ever = t.ever; }
        }
      }
      for (const c of clumps.values()) {
        const X = c.sx / c.a, cy = c.sy / c.a, r = Math.min(8.5, Math.sqrt(c.a) * (c.n > 1 ? .8 : .95)), rr = Art.rand("clump" + X)();
        if (!bySlot.has(c.sk)) bySlot.set(c.sk, { ever: c.ever, dark: [], mid: [], snow: [] });
        const L = bySlot.get(c.sk);
        L.dark.push(blobD("c" + X, X, cy, r * 1.05, r * .92, 7, .28));
        L.mid.push(blobD("m" + X, X - r * .14, cy - r * .16, r * .74, r * .64, 6, .3));
        if (c.ever) L.snow.push(ell(X, cy - r * .3, r * .6, r * .3));
        void rr;
      }
      // Under the trees, the forest as soft masses (where crowns crowd together), so the park view
      // reads as woods rather than confetti; the trees on top give it texture.
      {
        const cell = 4, nx = Math.ceil(W / cell) + 2, ny = Math.ceil(H / cell) + 2;
        const grids = { decid: new Float32Array(nx * ny), ever: new Float32Array(nx * ny) };
        for (const t of S.trees) {
          const g = treeGlyph(t.kind, t.shape, false), r = g.crownR * t.size * .95, cyW = t.y + g.crownY * t.size * .55, G = grids[t.ever ? "ever" : "decid"];
          const i0 = Math.floor((t.x - r - bx0) / cell), i1 = Math.ceil((t.x + r - bx0) / cell), j0 = Math.floor((cyW - r - by0) / cell), j1 = Math.ceil((cyW + r - by0) / cell);
          for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++) {
            const dx = bx0 + i * cell - t.x, dy = by0 + j * cell - cyW, q = 1 - (dx * dx + dy * dy) / (r * r * 1.6);
            if (q > 0) G[j * nx + i] += q;
          }
        }
        const blur = G => { const o = new Float32Array(G.length); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { let s2 = 0; for (let a2 = -1; a2 <= 1; a2++) for (let b2 = -1; b2 <= 1; b2++) s2 += G[(j + b2) * nx + i + a2]; o[j * nx + i] = s2 / 9; } return o; };
        const cpath = d3.geoPath(d3.geoTransform({ point(x, y) { this.stream.point(f1(bx0 + x * cell), f1(-(by0 + y * cell))); } }));
        const both = new Float32Array(nx * ny); for (let i = 0; i < both.length; i++) both[i] = grids.decid[i] + grids.ever[i];
        const mass = (G, cls, t) => far.append("path").attr("class", "far-mass " + cls).attr("d", cpath(d3.contours().size([nx, ny]).thresholds([t])(blur(blur(G)))[0]));
        // The forest's shadow is its own outline, slid away from the sun (one path, not one per tree).
        far.append("path").attr("class", "far-shade").attr("d", cpath(d3.contours().size([nx, ny]).thresholds([.45])(blur(blur(both)))[0]));
        mass(both, "bare", .45); mass(grids.decid, "decid", .4); mass(grids.ever, "ever", .45);
      }
      const fc = far.append("g").attr("class", "far-canopy");
      for (const layer of ["dark", "mid", "snow"]) for (const [sk, L] of bySlot) {
        if (layer === "snow" && !L.ever) continue;
        fc.append("path").attr("class", `cs c-${sk} ${L.ever ? "ever" : "decid"} L-${layer}`).attr("d", L[layer].join(""));
      }
      const fr = far.append("g").attr("class", "far-rocks");
      for (const bo of [...S.boulders].sort((a, b) => b.b.y - a.b.y)) {
        const F = bo.form, g = fr.append("g").attr("class", "far-rock").attr("data-id", bo.id).attr("transform", `translate(${f2(bo.b.x)},${f2(-bo.b.y)})`);
        g.append("path").attr("class", "r-contact").attr("d", smoothRing(F.base.map(p => [p[0] * 1.14, p[1] * 1.3 + F.R * .1]))).attr("fill", "url(#soft-dark)");
        for (const f of F.faces) g.append("path").attr("d", "M" + f.pts.map(p => f2(p[0]) + "," + f2(p[1])).join("L") + "Z").attr("fill", Art.mix(f.fill, F.rock.mid, .09)).attr("class", "far-face" + (f.up > .55 ? " up" : ""));
      }
    }

    // ---- tiles: built on first view, hidden while off screen
    const TL = S.tiles.size, tiles = new Map(), queue = [];
    const tileOf = (x, y) => [Math.floor((x - bx0) / TL), Math.floor((y - by0) / TL)];
    // Big things are assigned to the tile their foot stands in.
    const tileKey = (tx, ty) => tx + "," + ty;
    const byTile = new Map();
    const assign = (x, y, item) => { const [tx, ty] = tileOf(x, y), k = tileKey(tx, ty); if (!byTile.has(k)) byTile.set(k, { trees: [], boulders: [], landmarks: [], cairns: [] }); byTile.get(k)[item[0]].push(item[1]); };
    for (const t of S.trees) assign(t.x, t.y, ["trees", t]);
    for (const bo of S.boulders) assign(bo.b.x, bo.b.y, ["boulders", bo]);
    for (const lm of S.landmarks) if (!lm.ground) assign(lm.x, lm.y, ["landmarks", lm]);
    for (const c of S.cairns) assign(c.x, c.y, ["cairns", c]);
    // Tiles draw north to south (row by row), so what's in front overlaps what's behind.
    const order = (tx, ty) => (S.tiles.ny - ty) * 1000 + tx;
    const insertSorted = (layer, o) => {
      const el = layer.node(); let before = null;
      for (const c of el.children) if (+c.dataset.o > o) { before = c; break; }
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.dataset.o = o; el.insertBefore(g, before);
      return d3.select(g);
    };
    const BUCKET = 1.25;
    let lastShadow = [0, 0];
    function buildTile(tx, ty) {
      const k = tileKey(tx, ty);
      if (tiles.has(k)) return tiles.get(k);
      const det = S.detail(tx, ty), big = byTile.get(k) || { trees: [], boulders: [], landmarks: [], cairns: [] };
      const o = order(tx, ty);
      const gG = insertSorted(groundT, o), uG = insertSorted(under, o), sG = insertSorted(shadows, o), cG = insertSorted(canopy, o), stG = insertSorted(stand, o);
      const tile = { k, tx, ty, groups: [gG, uG, sG, cG, stG], shown: true };
      tiles.set(k, tile);
      if (det) {
        // Ground: patches of litter, moss and earth.
        for (const kind of ["earth", "moss", "litter"]) { const l = det.patches.filter(p => p.kind === kind); if (l.length) gG.append("path").attr("class", "patch p-" + kind).attr("d", l.map(p => blobD("p" + p.seed, p.x, -p.y, p.r * 1.3, p.r, 8, .5)).join("")); }
        // Understory.
        for (let c = 0; c < 4; c++) { const l = det.flowers.filter(f => f.c === c); if (l.length) uG.append("path").attr("class", "fl fl" + c).attr("d", l.map(f => circ(f.x, -f.y, .26 * f.s)).join("")); }
        const gr = det.grass.map(g => { const x = g.x, y = -g.y, s = g.s * (g.tall ? 1.3 : 1); return [-.45, -.2, 0, .22, .42].map((q, i) => `M${f1(x + q * .25 * s)},${f1(y)}q${f2(q * .3 * s)},${f2(-.4 * s)} ${f2(q * .7 * s)},${f2(-(.55 + (i % 2) * .25) * s)}`).join(""); });
        if (gr.length) uG.append("path").attr("class", "grass").attr("d", gr.join(""));
        if (det.reeds.length) {
          uG.append("path").attr("class", "reed").attr("d", det.reeds.map(r => { const x = r.x, y = -r.y, s = r.s; return [-.3, 0, .28].map(q => `M${f2(x + q * s)},${f2(y)}q${f2(q * .2 * s)},${f2(-.8 * s)} ${f2(q * .5 * s)},${f2(-1.5 * s)}`).join(""); }).join(""));
          uG.append("path").attr("class", "cattail lod-a").attr("d", det.reeds.filter((_, i) => i % 3 === 0).map(r => ell(r.x + .05 * r.s, -r.y - 1.4 * r.s, .1 * r.s, .28 * r.s)).join(""));
        }
        if (det.rubble.length) uG.append("path").attr("class", "rubble").attr("d", det.rubble.map(b => { const x = b.x, y = -b.y, s = b.s; return `M${f2(x - s)},${f2(y)}L${f2(x - s * .5)},${f2(y - s * .7)}L${f2(x + s * .6)},${f2(y - s * .6)}L${f2(x + s)},${f2(y)}Z`; }).join(""));
        if (det.ferns.length) uG.append("path").attr("class", "fern").attr("d", det.ferns.map((f, i) => bake(fernGlyph(i % 3), f.x, -f.y, f.s, i % 2 === 0)).join(""));
        const shrooms = det.shrooms.concat(big.trees.filter(t => !t.ever && Art.rand("sh" + t.x)() < .06).map(t => ({ x: t.x + .6, y: t.y - .8, kind: "cap", s: .7 })));
        if (shrooms.length) uG.append("path").attr("class", "shroom lod-c").attr("d", shrooms.map(m => {
          const x = m.x, y = -m.y, s = m.s;
          return m.kind === "bracket" ? `M${f2(x - .3 * s)},${f2(y)}q${f2(.3 * s)},${f2(-.28 * s)} ${f2(.6 * s)},0z` : `M${f2(x - .24 * s)},${f2(y - .26 * s)}q${f2(.24 * s)},${f2(-.34 * s)} ${f2(.48 * s)},0z`;
        }).join(""));
        for (const kind of ["blueberry", "laurel"]) {
          const list = det.shrubs.filter(b => b.kind === kind); if (!list.length) continue;
          const g = uG.append("g").attr("class", "cs sb-" + kind);
          for (const layer of ["dark", "mid", "hlE", "hlW", "snow"]) g.append("path").attr("class", "L-" + layer).attr("d", list.map(b => bake(shrubGlyph(kind, b.v)[layer], b.x, -b.y, b.s, b.v === 1)).join(""));
        }
      }
      // Shade: pools under close-standing trees, then cast shadows grouped by height
      // (each group one path, slid by the sun in setTime).
      const pool = { ever: "", decid: "" };
      for (const t of big.trees) if (S.crowdedAt([t.x, t.y], 7) && S.openAt([t.x, t.y]).kind !== "bald") pool[t.ever ? "ever" : "decid"] += circ(t.x, -t.y - t.crownR * .2, t.crownR * 1.25);
      if (pool.ever) sG.append("path").attr("class", "pool pool-ever").attr("d", pool.ever);
      if (pool.decid) sG.append("path").attr("class", "pool pool-decid").attr("d", pool.decid);
      const buckets = { ever: new Map(), decid: new Map(), rock: new Map() };
      const addShadow = (type, h, d) => { const m = buckets[type], kk = Math.max(1, Math.round(h / BUCKET)); m.set(kk, (m.get(kk) || "") + d); };
      // Canopy: every non-foreground tree, merged per colour, per layer.
      const slots = new Map(), bare = ["", "", ""];
      for (const t of big.trees) {
        if (t.fg) continue;
        const g = treeGlyph(t.kind, t.shape, false), s = t.size, X = t.x, Y = -t.y, sk = slot(t);
        if (!slots.has(sk)) slots.set(sk, { ever: t.ever, dark: "", mid: "", hlE: "", hlW: "", snow: "", fruit: "" });
        const L = slots.get(sk);
        for (const layer of ["dark", "mid", "hlE", "hlW"]) L[layer] += bake(g[layer], X, Y, s, t.flip);
        if (t.ever) L.snow += bake(g.snow, X, Y, s, t.flip);
        else g.bare.forEach((b, i) => { if (b.length) bare[i] += bake(b, X, Y, s, t.flip); });
        if (g.fruit) L.fruit += bake(g.fruit, X, Y, s, t.flip);
      }
      bare.forEach((d, i) => d && cG.append("path").attr("class", "bare b" + i).attr("d", d));
      for (const layer of ["dark", "mid", "hlE", "hlW", "snow", "fruit"]) for (const [sk, L] of slots) {
        if (!L[layer]) continue;
        cG.append("path").attr("class", `cs c-${sk} ${L.ever ? "ever" : "decid"} L-${layer}`).attr("d", L[layer]);
      }
      // The standing layer, front to back.
      const items = [];
      for (const t of big.trees) if (t.fg) {
        items.push({ y: -t.y, draw: Lr => drawTree(Lr, t) });
        const g = treeGlyph(t.kind, t.shape, true);
        addShadow(t.ever ? "ever" : "decid", g.crownY * t.size, ell(t.x, -t.y, g.crownR * t.size * .9, g.crownR * t.size * .62));
      }
      if (det) {
        for (const l of det.logs) items.push({ y: -l.y, draw: Lr => drawLog(Lr, l) });
        for (const st of det.stumps) items.push({ y: -st.y, draw: Lr => drawStump(Lr, st) });
      }
      for (const c of big.cairns) items.push({ y: -c.y, draw: Lr => drawCairn(Lr.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(c.x)},${f2(-c.y)}) scale(${f2(c.s)})`)) });
      for (const bo of big.boulders) {
        const F = bo.form;
        items.push({ y: -bo.b.y, draw: Lr => drawBoulder(Lr, bo, state, F) });
        const X = bo.b.x, Y = -bo.b.y, baseD = "M" + F.base.map(p => f1(X + p[0]) + "," + f1(Y + p[1])).join("L") + "Z";
        for (const t of [.35, .7, 1]) addShadow("rock", F.H * t * .9, baseD);
      }
      for (const lm of big.landmarks) {
        items.push({ y: -lm.y, draw: Lr => drawLandmark(Lr, lm) });
        if (lm.kind === "bigtree" || lm.kind === "owl") { const sp = lm.species || "hemlock", g = treeGlyph(sp, 2, true), sc = lm.scale || 1.5; addShadow(["pitch", "hemlock"].includes(sp) ? "ever" : "decid", g.crownY * sc, ell(lm.x, -lm.y, g.crownR * sc * .9, g.crownR * sc * .62)); }
        if (lm.kind === "derrick") addShadow("rock", 9, ell(lm.x, -lm.y, .6, .4));
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) it.draw(stG);
      for (const [type, m] of Object.entries(buckets)) {
        if (!m.size) continue;
        const sg = sG.append("g").attr("class", "sh-" + type);
        for (const [kk, d] of m) sg.append("path").attr("data-h", kk * BUCKET).attr("d", d).attr("transform", `translate(${f2(lastShadow[0] * kk * BUCKET)},${f2(-lastShadow[1] * kk * BUCKET)})`);
      }
      markBoulders(stG);
      return tile;
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
      for (const layer of ["dark", "mid", "hlE", "hlW"]) tg.append("path").attr("class", "L-" + layer).attr("d", bake(g[layer], X, Y, s, t.flip, 2));
      if (g.fruit) tg.append("path").attr("class", "L-fruit").attr("d", bake(g.fruit, X, Y, s, t.flip, 2));
      if (g.ever) tg.append("path").attr("class", "L-snow").attr("d", bake(g.snow, X, Y, s, t.flip, 2));
      return { g, tg };
    }

    // ---- boulders: faceted granite, softly weathered, lit by the clock
    function drawBoulder(Lr, bo, st, F = bo.form) {
      const X = bo.b.x, Y = -bo.b.y, name = bo.b.name;
      const g = Lr.append("g").attr("class", `boulder k-${F.kind}`).attr("data-id", bo.id).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", ariaOf(bo)).attr("transform", `translate(${f2(X)},${f2(Y)})`);
      const R = F.R, hullD = roundPoly(F.hull, .32);
      const clipId = `bclip-${bo.id}`;
      defs.append("clipPath").attr("id", clipId).append("path").attr("d", hullD);
      g.append("path").attr("class", "r-contact").attr("d", smoothRing(F.base.map(p => [p[0] * 1.14, p[1] * 1.3 + R * .1]))).attr("fill", "url(#soft-dark)");
      {
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
      }
      const front = F.base.filter(p => p[1] > -R * .15).sort((a, b) => a[0] - b[0]);
      g.append("path").attr("class", "r-foot").attr("d", d3.line().curve(d3.curveBasis)(front)).attr("clip-path", `url(#${clipId})`);
      // Selection: a ring on the ground (the rocks' outlines aren't convex).
      g.insert("path", ":first-child").attr("class", "r-outline ring").attr("d", ell(0, R * .1, R * 1.35, R * .95));
      drawStory(g, bo, F, st);
      g.append("path").attr("class", "r-hit").attr("d", hullD);
      return g;
    }
    // Each boulder's own small story, and your game state on the rock.
    function drawStory(g, bo, F, st) {
      const R = F.R, name = bo.b.name, T = F.topC, desc = bo.b.desc || "";
      if (/\bbowl\b/i.test(desc)) {
        g.append("path").attr("class", "r-bowl").attr("d", ell(T[0], T[1] + .1, R * .42, R * .2));
        g.append("path").attr("class", "r-needles lod-c").attr("d", d3.range(12).map(i => { const a = i * 2.4, rr = R * .3 * Math.sqrt((i + 1) / 12); return `M${f2(T[0] + Math.cos(a) * rr)},${f2(T[1] + Math.sin(a) * rr * .45)}l${f2(Math.cos(a * 3) * .3)},${f2(Math.sin(a * 3) * .12)}`; }).join(""));
      }
      if (/chickadee/i.test(name)) for (const [dx, flip] of [[-.5, 1], [.7, -1]]) drawBird(g.append("g").attr("class", "lod-c").attr("transform", `translate(${f2(T[0] + dx)},${f2(T[1] - .1)}) scale(${flip * .55},.55)`), "chickadee");
      if (/\bperch\b/i.test(name)) drawBird(g.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(T[0] + .3)},${f2(T[1])}) scale(.9)`), "hawk");
      // A boulder carpeted in moss (Mossback).
      if (/carpeted in moss/i.test(desc)) g.append("path").attr("class", "r-moss").attr("d", F.faces.filter(f => f.up > .45).map(f => "M" + f.pts.map(p => f2(p[0]) + "," + f2(p[1])).join("L") + "Z").join(""));
      // The lantern on The Lamp Post: lit at dusk.
      if (/\blantern\b/i.test(desc)) {
        const lg = g.append("g").attr("class", "lantern").attr("transform", `translate(${f2(T[0])},${f2(T[1])})`);
        lg.append("circle").attr("class", "lantern-glow").attr("cy", -.7).attr("r", 2.4).attr("fill", "url(#soft-light)");
        lg.append("path").attr("class", "lantern-body").attr("d", "M-.28,0H.28L.22,-.85H-.22ZM-.32,-.85H.32L0,-1.15Z");
        lg.append("path").attr("class", "lantern-light").attr("d", "M-.17,-.1H.17L.13,-.75H-.13Z");
      }
      // A round opening into the gully bank (The Hobbit Hole).
      if (/round opening/i.test(desc)) { const fy = Math.max(...F.base.map(p => p[1])); g.append("path").attr("class", "r-hole").attr("d", `M${f2(-R * .3)},${f2(fy - .2)}A${f2(R * .3)},${f2(R * .32)} 0 0,1 ${f2(R * .3)},${f2(fy - .2)}Z`); }
      // Soot on The Hearthstone.
      if (/soot/i.test(desc)) g.append("path").attr("class", "r-soot").attr("d", ell(T[0] * .2, T[1] * .55, R * .5, R * .45)).attr("fill", "url(#soft-dark)").attr("clip-path", `url(#bclip-${bo.id})`);
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
      } else if (kind === "owl") {
        g.append("path").attr("class", "owl-body").attr("d", "M0,-1.5C.55,-1.5 .62,-1.05 .6,-.6C.58,-.15 .35,.15 0,.15C-.35,.15 -.58,-.15 -.6,-.6C-.62,-1.05 -.55,-1.5 0,-1.5Z");
        g.append("path").attr("class", "owl-face").attr("d", ell(-.2, -1.08, .2, .2) + ell(.2, -1.08, .2, .2));
        g.append("path").attr("class", "owl-eye").attr("d", circ(-.2, -1.08, .07) + circ(.2, -1.08, .07));
        g.append("path").attr("class", "owl-bars lod-c").attr("d", "M-.3,-.55h.18M.12,-.55h.18M-.25,-.3h.15M.1,-.3h.15");
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
    function drawCar(Lr, m) {
      const g = Lr.append("g").attr("class", "car c" + m.c).attr("transform", `translate(${f2(m.x)},${f2(-m.y)})`);
      g.append("path").attr("class", "car-shadow").attr("d", ell(.3, .4, 2.2, 1.1));
      // Nosed into its space: seen from behind and above.
      g.append("path").attr("class", "car-body").attr("d", "M-1.9,.6V-1.6Q-1.9,-2.4 -1.1,-2.5H1.1Q1.9,-2.4 1.9,-1.6V.6Q1.9,1 1.5,1H-1.5Q-1.9,1 -1.9,.6Z");
      g.append("path").attr("class", "car-roof").attr("d", "M-1.3,-1.2V-2.9Q-1.3,-3.3 -.9,-3.3H.9Q1.3,-3.3 1.3,-2.9V-1.2Z");
      g.append("path").attr("class", "car-glass").attr("d", "M-1.1,-1.3V-2.1H1.1V-1.3Z");
      g.append("path").attr("class", "car-light").attr("d", "M-1.75,-.2h.5v.35h-.5ZM1.25,-.2h.5v.35h-.5Z");
      g.append("path").attr("class", "car-snow").attr("d", "M-1.25,-2.9Q0,-3.5 1.25,-2.9V-2.6H-1.25Z");
    }
    // Ruins and things that lie on the ground (drawn at every zoom).
    function drawRuin(Lr, lm) {
      const g = Lr.append("g").attr("class", `lm ruin lm-${lm.kind}`).attr("transform", `translate(${f2(lm.x)},${f2(-lm.y)}) rotate(${lm.rot || 0})`);
      const rr = Art.rand("ruin" + lm.id), walls = [];
      const wall = (pts, h = .9, t = 1.3) => walls.push({ pts, h, t });
      const flush = () => { for (const t of [...new Set(walls.map(w => w.t))]) drystone(g, walls.filter(w => w.t === t).map(w => w.pts), t); };
      switch (lm.kind) {
        case "foundation": {
          // The schoolhouse: a granite foundation with its front steps and a gap where the door was.
          g.append("path").attr("class", "ruin-floor").attr("d", "M-12,-8H12V8H-12Z");
          wall([[-12, -8], [12, -8]]); wall([[-12, -8], [-12, 8]]); wall([[12, -8], [12, 8]]); wall([[-12, 8], [-3, 8]]); wall([[3, 8], [12, 8]]);
          wall([[-12, -1], [-4, -1]], .6, .9); flush();
          block(g, 0, 10.6, 4.6, 1.4, .45, "step"); block(g, 0, 9.4, 4, 1.2, .9, "step");
          break;
        }
        case "mill": {
          // The mill: three walls left standing, charred beams inside, the race running past.
          g.append("path").attr("class", "ruin-floor").attr("d", "M-9,-7H9V7H-9Z");
          g.append("path").attr("class", "char").attr("d", "M-6,-3.5L5,-1.8M-5.5,2.5L3.5,3.8");
          wall([[-9, -7], [9, -7]], 1.6, 1.7); wall([[-9, -7], [-9, 7]], 1.6, 1.7); wall([[9, -7], [9, 1]], 1.6, 1.7); wall([[-9, 7], [-2, 7]], 1.2, 1.7); flush();
          block(g, -6.5, 8.6, 2.2, 1.4, .8, "chim"); block(g, 2, 3, 1.6, 1, .5, "chim");
          break;
        }
        case "cellar": {
          // A cellar hole: a square pit lined with stone, a tree growing out of it.
          g.append("path").attr("class", "cellar-pit").attr("d", "M-5,-4H5V4H-5Z");
          g.append("path").attr("class", "cellar-shade").attr("d", "M-5,-4H5V-1.5H-5Z");
          wall([[-5.6, -4.6], [5.6, -4.6], [5.6, 4.6], [-5.6, 4.6], [-5.6, -4.6]], .5, 1.1); flush();
          break;
        }
        case "grout": {
          // A heap of quarry waste: a mound of broken granite, big blocks on top, rubble at its skirts.
          g.append("path").attr("class", "heap-shadow").attr("d", ell(2, 1.5, 14, 6.5));
          g.append("path").attr("class", "heap").attr("d", blobD("heap" + lm.id, 0, -1.2, 13, 6.5, 11, .25));
          const bl = [];
          for (let i = 0; i < 34; i++) { const a2 = rr() * TAU, d = Math.sqrt(rr()), x = Math.cos(a2) * d * 11, y = Math.sin(a2) * d * 5.2 - 1, up = (1 - d) * 3.2; bl.push([x, y - up, 1.3 + rr() * 2.2 * (1.2 - d), .9 + rr() * 1.4, .5 + rr() * 1.4 * (1.2 - d)]); }
          bl.sort((a2, b2) => a2[1] - b2[1]);
          for (const [x, y, w, d, h] of bl) block(g, x, y, w, d, h, "grout");
          break;
        }
        case "bales": {
          // Round hay bales, out in the field from August until the snow.
          const bales = [[-16, 3], [-4, -5], [9, 4], [20, -6], [4, -13], [-12, -12], [15, 9]];
          const bg = g.append("g").attr("class", "bales");
          for (const [x, y] of bales.sort((a, b) => a[1] - b[1])) {
            // A round bale lying on its side: its rolled face toward you, the curve of its back above.
            bg.append("path").attr("class", "bale-shadow").attr("d", ell(x + 1, y + .3, 2.6, .9));
            bg.append("path").attr("class", "bale-body").attr("d", `M${x - 1.9},${y}V${y - 1.4}Q${x - 1.9},${y - 2.5} ${x},${y - 2.6}Q${x + 1.9},${y - 2.5} ${x + 1.9},${y - 1.4}V${y}Z`);
            bg.append("path").attr("class", "bale-end").attr("d", ell(x - .4, y - 1.25, 1.25, 1.25));
            bg.append("path").attr("class", "bale-swirl lod-a").attr("d", ell(x - .4, y - 1.25, .8, .8) + ell(x - .4, y - 1.25, .35, .35));
          }
          break;
        }
      }
    }
    function drawLandmark(Lr, lm) {
      const big = ["counters", "signpost", "bench", "kiosk", "picnic", "tractor"].includes(lm.kind);
      const g = Lr.append("g").attr("class", `lm lm-${lm.kind}${lm.when ? " when-" + lm.when : ""}`).attr("transform", `translate(${f2(lm.x)},${f2(-lm.y)})${big ? " scale(1.35)" : ""}`);
      const contact = (rx, ry = rx * .35) => g.append("path").attr("class", "contact").attr("d", ell(0, .1, rx, ry));
      switch (lm.kind) {
        case "bigtree": {
          const t = { x: 0, y: 0, kind: lm.species, shape: 2, size: lm.scale, flip: false, ever: ["pitch", "hemlock", "whitepine"].includes(lm.species), v: 1 };
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
        case "owl": {
          // A big hemlock with a barred owl on its lowest limb.
          const t = { x: 0, y: 0, kind: "hemlock", shape: 3, size: 1.5, flip: false, ever: true, v: 0 };
          drawTree(g, t, 1, "landmark");
          g.append("path").attr("class", "limb").attr("d", "M0,-3.2L2.4,-3.6");
          drawBird(g.append("g").attr("class", "lod-a").attr("transform", "translate(1.9,-3.65) scale(.95)"), "owl");
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
          contact(1.2, .4);
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
          // Arms pointing along the trails that leave this junction.
          g.append("path").attr("class", "post").attr("d", "M0,0V-2.7");
          const s = D.sectors.find(x => x.name === lm.area), arr = D.trails.findIndex(t => t.to === lm.area);
          if (arr < 0) break;
          const J = D.trails[arr].end, list = [[S.trails[arr].pts, "back", s.parent === "Parking" ? "Parking lot" : s.parent]];
          D.trails.forEach((t, i) => { if (Math.hypot(t.start[0] - J[0], t.start[1] - J[1]) < 1) list.push([S.trails[i].pts, "out", t.to]); });
          list.slice(0, 4).forEach(([pts, way, name], i) => {
            const target = way === "back" ? pts[Math.max(0, pts.length - 15)] : pts[Math.min(pts.length - 1, 14)], dir = target[0] - lm.x >= 0 ? 1 : -1, y = -2.5 + i * .62, w = 2.6;
            g.append("path").attr("class", "sign-board").attr("d", dir > 0 ? `M-.15,${y}H${w - .3}L${w},${y + .24}L${w - .3},${y + .48}H-.15Z` : `M.15,${y}H${-w + .3}L${-w},${y + .24}L${-w + .3},${y + .48}H.15Z`);
            g.append("text").attr("class", "sign-text lod-c").attr("x", dir * (w / 2 - .1)).attr("y", y + .36).text(name);
          });
          break;
        }
        case "kiosk": {
          contact(1.8, .5);
          g.append("path").attr("class", "post").attr("d", "M-1.1,0V-2.6M1.1,0V-2.6");
          g.append("path").attr("class", "board").attr("d", "M-1.35,-2.7H1.35V-1.2H-1.35Z");
          g.append("path").attr("class", "notice n0").attr("d", "M-1.15,-2.5H-.45V-1.6H-1.15Z");
          g.append("path").attr("class", "notice n1").attr("d", "M-.3,-2.55H.55V-1.95H-.3Z");
          g.append("path").attr("class", "notice n2 lod-a").attr("d", "M.7,-2.45H1.15V-1.4H.7Z");
          g.append("path").attr("class", "kiosk-roof").attr("d", "M-1.75,-2.6L0,-3.4L1.75,-2.6L1.6,-2.45L0,-3.15L-1.6,-2.45Z");
          break;
        }
        case "bins": {
          for (const [x, c] of [[-.55, "bin0"], [.5, "bin1"]]) {
            g.append("path").attr("class", "bin " + c).attr("d", `M${x - .42},0L${x - .38},-1H${x + .38}L${x + .42},0Z`);
            g.append("path").attr("class", "bin-lid " + c).attr("d", `M${x - .46},-1H${x + .46}V-1.16H${x - .46}Z`);
          }
          // A raccoon, close up, of course.
          g.append("path").attr("class", "raccoon lod-c").attr("d", "M1.1,0C1.1,-.35 1.35,-.5 1.6,-.5C1.85,-.5 1.95,-.3 1.95,-.12L2.25,-.05L1.9,0Z");
          g.append("path").attr("class", "raccoon-mask lod-c").attr("d", "M1.72,-.38h.2v.08h-.2Z");
          break;
        }
        case "dog": {
          // Pickles, curled up asleep in the shade.
          g.append("path").attr("class", "dog-shadow").attr("d", ell(.1, .05, .75, .22));
          g.append("path").attr("class", "dog").attr("d", "M-.7,0C-.75,-.35 -.4,-.55 0,-.55C.42,-.55 .7,-.4 .72,-.15C.74,0 .55,.05 .4,.05H-.5C-.62,.05 -.7,.03 -.7,0Z");
          g.append("path").attr("class", "dog").attr("d", "M.45,-.12C.45,-.38 .62,-.48 .82,-.45C1,-.42 1.05,-.25 1,-.1C.95,0 .6,.02 .45,-.12Z");
          g.append("path").attr("class", "dog-ear").attr("d", "M.62,-.45L.7,-.62L.8,-.44Z");
          g.append("path").attr("class", "dog-patch lod-c").attr("d", ell(-.2, -.3, .22, .14));
          g.append("text").attr("class", "zzz lod-c").attr("x", .95).attr("y", -.75).text("z");
          g.append("text").attr("class", "zzz lod-c").attr("x", 1.2).attr("y", -1.1).attr("font-size", ".42px").text("z");
          break;
        }
        case "picnic": {
          contact(1.9, .6);
          g.append("path").attr("class", "picnic-leg").attr("d", "M-1.2,0L-.9,-.9M1.2,0L.9,-.9M-1.1,-.05L-.75,-.95M1.1,-.05L.75,-.95");
          g.append("path").attr("class", "picnic-bench").attr("d", "M-1.6,.2H1.6V.02H-1.6ZM-1.6,-1.5H1.6V-1.66H-1.6Z");
          g.append("path").attr("class", "picnic-top").attr("d", "M-1.5,-.85H1.5L1.35,-1.3H-1.35Z");
          g.append("path").attr("class", "picnic-cloth lod-c").attr("d", "M-.5,-.87H.5L.45,-1.28H-.45Z");
          break;
        }
        case "bell": {
          contact(1.1, .4);
          g.append("path").attr("class", "post").attr("d", "M-.8,0V-2.5M.8,0V-2.5M-1,-2.5H1");
          g.append("path").attr("class", "bell").attr("d", "M-.42,-1.25C-.4,-1.7 -.3,-2.15 0,-2.2C.3,-2.15 .4,-1.7 .42,-1.25Z");
          g.append("path").attr("class", "bell-lip").attr("d", "M-.48,-1.25H.48V-1.15H-.48Z");
          break;
        }
        case "axle": {
          // An iron axle sticking out of the rock, and what's left of the wheel's rim.
          g.append("path").attr("class", "iron").attr("d", "M-.8,-.9L.6,-1.15");
          g.append("path").attr("class", "iron-rim").attr("d", "M.9,0A1.6,1.6 0 0,1 .3,-2.2");
          break;
        }
        case "frog": {
          g.append("path").attr("class", "frog lod-c").attr("d", "M-.25,0C-.3,-.2 -.12,-.28 0,-.28C.15,-.28 .3,-.2 .25,0Z");
          g.append("path").attr("class", "frog-eye lod-c").attr("d", circ(-.1, -.27, .05) + circ(.1, -.27, .05));
          break;
        }
        case "gauge": {
          // A painted flood gauge on a post by the water: feet of water, every spring.
          g.append("path").attr("class", "post").attr("d", "M0,0V-2.6");
          g.append("path").attr("class", "flood-gauge").attr("d", "M.08,-.3H.5V-2.5H.08Z");
          g.append("path").attr("class", "gauge-ticks lod-c").attr("d", d3.range(8).map(i => `M.08,${f2(-.45 - i * .27)}h${i % 2 ? .18 : .3}`).join(""));
          break;
        }
        case "seep": break;    // drawn with the ground
        case "sandpit": {
          // A pail and a shovel left in the sand.
          g.append("path").attr("class", "pail lod-a").attr("d", "M1.2,1.4L1.3,.95H1.75L1.85,1.4Z");
          g.append("path").attr("class", "shovel lod-c").attr("d", "M2.2,1.3L2.8,.7");
          break;
        }
        case "oldstump": {
          contact(1.9, .55);
          g.append("path").attr("class", "log-bark").attr("d", "M-1.5,0C-1.6,-.6 -1.45,-1.2 -1.35,-1.5H1.35C1.45,-1.2 1.6,-.6 1.5,0C1.2,.25 -1.2,.25 -1.5,0ZM-1.5,0L-2.2,.25L-1.4,-.5ZM1.5,0L2.3,.3L1.4,-.45Z");
          g.append("path").attr("class", "log-end").attr("d", ell(0, -1.5, 1.35, .5));
          g.append("path").attr("class", "rings lod-c").attr("d", ell(0, -1.5, 1, .37) + ell(0, -1.5, .65, .24) + ell(0, -1.5, .3, .11));
          g.append("path").attr("class", "log-moss").attr("d", ell(-.9, -.7, .5, .35) + ell(.8, -.4, .4, .3));
          break;
        }
        case "well": {
          contact(1.5, .5);
          g.append("path").attr("class", "well-stone").attr("d", "M-1.1,0V-.75A1.1,.4 0 0,1 1.1,-.75V0A1.1,.4 0 0,1 -1.1,0Z");
          g.append("path").attr("class", "well-hole").attr("d", ell(0, -.75, .8, .28));
          g.append("path").attr("class", "post").attr("d", "M-1,-.6V-2.2M1,-.6V-2.2M-1.15,-2.1H1.15");
          g.append("path").attr("class", "well-roof").attr("d", "M-1.4,-2.05L0,-2.8L1.4,-2.05Z");
          g.append("path").attr("class", "bucket-rope lod-c").attr("d", "M.2,-2.1V-1.3");
          g.append("path").attr("class", "well-bucket lod-c").attr("d", "M0,-1.3H.4L.36,-.95H.04Z");
          break;
        }
        case "chimney": {
          // A tumbled stone chimney: what's standing, and what fell.
          contact(1.8, .55);
          block(g, -.3, 0, 1.3, 1, 2.6, "chim"); block(g, .9, .5, .8, .7, .5, "chim"); block(g, -1.3, .6, .7, .6, .4, "chim"); block(g, .2, 1.1, .6, .5, .3, "chim");
          break;
        }
        case "lilac": {
          // Lilacs outlive the farmhouses they were planted beside; they bloom every May.
          const gl = shrubGlyph("laurel", 1), s = 2.4;
          const lg = g.append("g").attr("class", "cs sb-lilac");
          for (const layer of ["dark", "mid", "hlE", "hlW", "snow"]) lg.append("path").attr("class", "L-" + layer).attr("d", bake(gl[layer], 0, 0, s, false, 2));
          const rr = Art.rand("lilac"), bl = [];
          for (let i = 0; i < 16; i++) { const x = (rr() - .5) * 2.4, y = -1.1 - rr() * 1.3; bl.push(`M${f2(x - .16)},${f2(y)}L${f2(x)},${f2(y - .42)}L${f2(x + .16)},${f2(y)}Z`); }
          g.append("path").attr("class", "lilac-bloom").attr("d", bl.join(""));
          break;
        }
        case "derrick": {
          // The quarry derrick: a tall wooden mast with its boom, guyed to the ground.
          contact(1.2, .4);
          g.append("path").attr("class", "guy").attr("d", "M0,-11L-6,1M0,-11L5.5,1.5M0,-11L-2,3");
          g.append("path").attr("class", "mast").attr("d", "M-.22,0L-.14,-11.2H.14L.22,0Z");
          g.append("path").attr("class", "boom").attr("d", "M0,-1.2L7.5,-7.2");
          g.append("path").attr("class", "guy").attr("d", "M0,-10.6L7.5,-7.2M7.5,-7.2V-4.6");
          g.append("path").attr("class", "iron").attr("d", "M7.2,-4.6H7.8V-4.2H7.2Z");
          break;
        }
        case "powderhouse": {
          // The powder house: a small stone hut, roofless now, its door a dark gap.
          contact(2.4, .7);
          g.append("path").attr("class", "hut-side").attr("d", "M1.6,0L2.4,-.6V-2.4L1.6,-1.9Z");
          g.append("path").attr("class", "hut-front").attr("d", "M-1.6,0H1.6V-1.9L1.1,-1.75L.6,-2.1L-.2,-1.8L-.8,-2.05L-1.6,-1.85Z");
          g.append("path").attr("class", "hut-door").attr("d", "M-.35,0V-1.1Q0,-1.4 .35,-1.1V0Z");
          g.append("path").attr("class", "hut-stones lod-c").attr("d", "M-1.6,-.6H-.5M.5,-.6H1.6M-1.6,-1.2H-.5M.5,-1.2H1.6M-1.1,0V-.6M1,-.6V-1.2M-.9,-1.2V-1.8");
          break;
        }
        case "blocks": {
          block(g, -1.4, 0, 2, 1.2, .9, "cut"); block(g, 1.2, .4, 1.6, 1, .7, "cut"); block(g, -.2, -1, 1.8, 1.1, .8, "cut");
          g.append("path").attr("class", "drill lod-c").attr("d", "M-2.2,-.2v-.5M-1.8,-.2v-.5M-1.4,-.2v-.5M-1,-.2v-.5");
          break;
        }
        case "nosign": {
          g.append("path").attr("class", "post").attr("d", "M0,0V-1.9");
          g.append("path").attr("class", "nosign-board").attr("d", "M-.85,-2.25H.85V-1.45H-.85Z");
          g.append("text").attr("class", "nosign-text lod-c").attr("x", 0).attr("y", -1.95).text("NO");
          g.append("text").attr("class", "nosign-text lod-c").attr("x", 0).attr("y", -1.6).text("SWIMMING");
          break;
        }
        case "tractor": {
          // An old tractor, rusting where the farm left it, grass grown up through its wheels.
          contact(2.3, .55);
          g.append("path").attr("class", "tractor-body").attr("d", "M-1.2,-.8H1.5L1.75,-1.15V-1.5H.1L-.2,-1.25H-1.2Z");
          g.append("path").attr("class", "tractor-hood").attr("d", "M-.2,-1.25L.1,-1.5H1.75V-1.25Z");
          g.append("path").attr("class", "tractor-seat").attr("d", "M-1.15,-1.25V-2H-.75V-1.25ZM-1.4,-2.05H-.55V-1.9H-1.4Z");
          g.append("path").attr("class", "tractor-stack").attr("d", "M1.2,-1.5V-2.3H1.35V-1.5Z");
          g.append("path").attr("class", "tractor-wheel").attr("d", ell(-1, -.75, .78, .78) + ell(1.35, -.42, .42, .42));
          g.append("path").attr("class", "tractor-hub").attr("d", ell(-1, -.75, .3, .3) + ell(1.35, -.42, .16, .16));
          g.append("path").attr("class", "grass").attr("d", "M-1.6,0q-.1,-.5 -.2,-.9M-1.3,0q0,-.5 .1,-.8M.9,0q-.05,-.4 -.15,-.6M1.6,0q.05,-.4 .15,-.55");
          break;
        }
        case "milkcans": {
          for (const [x, y] of [[-.55, -.15], [.35, -.2], [-.05, .25]]) {
            g.append("path").attr("class", "can").attr("d", `M${x - .28},${y}V${y - .7}Q${x - .28},${y - .9} ${x - .12},${y - 1}V${y - 1.12}H${x + .12}V${y - 1}Q${x + .28},${y - .9} ${x + .28},${y - .7}V${y}Z`);
            g.append("path").attr("class", "can-band lod-c").attr("d", `M${x - .28},${y - .3}h.56`);
          }
          break;
        }
      }
    }

    // ---- the sky: hawks over the summit, bats at the schoolhouse, fireflies over the meadows
    const reduceMotion = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const circling = (cls, n, c, path, rad0, rad1, sc0, seedName) => {
      const grp = sky.append("g").attr("class", cls);
      for (let i = 0; i < n; i++) {
        const rr = Art.rand(seedName + i), rad = rad0 + rr() * (rad1 - rad0), dur = 22 + rr() * 26, start = rr() * 360, sc = sc0 * (1 + rr() * .45);
        const cx = f2(c[0] + (rr() - .5) * 20), cy = f2(c[1] + (rr() - .5) * 20);
        const b = grp.append("g").attr("class", cls === "hawks" ? `hawk h${i}` : `bat-g b${i}`).append("g").attr("transform", `rotate(${f2(start)} ${cx} ${cy})`).append("g");
        if (!reduceMotion) b.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate")
          .attr("from", `0 ${cx} ${cy}`).attr("to", `${i % 2 ? -360 : 360} ${cx} ${cy}`).attr("dur", f2(dur * (cls === "bats" ? .35 : 1)) + "s").attr("repeatCount", "indefinite");
        if (cls === "hawks") b.append("path").attr("class", "hawk-shadow").attr("d", path).attr("transform", `translate(${f2(+cx + rad + 9)},${f2(+cy + 7)}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
        b.append("path").attr("class", cls === "hawks" ? "hawk-bird" : "bat").attr("d", path).attr("transform", `translate(${f2(+cx + rad)},${f2(cy)}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
      }
    };
    const hawkPath = "M0,-.2C-.5,-.55 -1.1,-.45 -1.65,-.1C-1.1,-.2 -.6,-.05 -.25,.15L-.18,.75L0,.6L.18,.75L.25,.15C.6,-.05 1.1,-.2 1.65,-.1C1.1,-.45 .5,-.55 0,-.2Z";
    const hwS = D.sectors.find(s => s.name === "Hawkwatch");
    circling("hawks", 7, [hwS.x + 10, -(hwS.y + 12)], hawkPath, 16, 48, 1.1, "hawk");
    const school = D.sectors.find(s => s.name === "The Schoolhouse"), belfry = S.boulders.find(b => b.b.name === "The Belfry");
    if (school) circling("bats", 6, [(belfry ? belfry.b.x : school.x), -((belfry ? belfry.b.y : school.y) + 8)], "M0,0C-.3,-.3 -.6,-.25 -.9,-.05C-.75,.02 -.6,.1 -.55,.25C-.4,.12 -.2,.12 0,.3C.2,.12 .4,.12 .55,.25C.6,.1 .75,.02 .9,-.05C.6,-.25 .3,-.3 0,0Z", 4, 11, .9, "bat");
    const ffly = glow.append("g").attr("class", "fireflies");
    {
      const rr = Art.rand("fireflies"), places = [];
      if (S.field) for (let i = 0; i < 160; i++) { const a = rr() * TAU, z = S.field, e = z.edge(a) * Math.sqrt(rr()) * .95; places.push([z.c[0] + Math.cos(a) * e, z.c[1] + Math.sin(a) * e]); }
      for (let i = 0; i < 70; i++) { const a = rr() * TAU, d = S.baldR * (.75 + rr() * .7); places.push([S.baldC[0] + Math.cos(a) * d, S.baldC[1] + Math.sin(a) * d]); }
      const pond = S.water.find(z => z.name === "Mill Pond");
      if (pond) for (let i = 0; i < 50; i++) { const a = rr() * TAU, e = pond.edge(a) * (1.02 + rr() * .25); places.push([pond.c[0] + Math.cos(a) * e, pond.c[1] + Math.sin(a) * e]); }
      for (const [x, y] of places) {
        const c = ffly.append("circle").attr("cx", f2(x)).attr("cy", f2(-y - 1 - rr() * 2)).attr("r", .45);
        if (!reduceMotion) c.append("animate").attr("attributeName", "opacity").attr("values", ".25;.25;1;.25;.25").attr("keyTimes", "0;.5;.6;.75;1")
          .attr("dur", f2(2.5 + rr() * 3) + "s").attr("begin", f2(-rr() * 6) + "s").attr("repeatCount", "indefinite");
      }
    }

    // ---- the park fades into paper at its edges, like a page in a field guide
    {
      const FADE = 120, defsG = [["fade-l", 1, 0, 0, 0], ["fade-r", 0, 0, 1, 0], ["fade-t", 0, 1, 0, 0], ["fade-b", 0, 0, 0, 1]];
      for (const [id, x1, y1, x2, y2] of defsG) {
        const gr = defs.append("linearGradient").attr("id", id).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
        const f = FADE / (900 + FADE);
        gr.append("stop").attr("offset", 0).attr("class", "edge-stop").attr("stop-opacity", 0);
        gr.append("stop").attr("offset", f2(f)).attr("class", "edge-stop").attr("stop-opacity", .9);
        gr.append("stop").attr("offset", 1).attr("class", "edge-stop").attr("stop-opacity", 1);
      }
      const big = 900;
      sky.append("rect").attr("class", "edge-fade").attr("fill", "url(#fade-l)").attr("x", bx0 - big).attr("y", -by1 - big).attr("width", big + FADE).attr("height", H + 2 * big);
      sky.append("rect").attr("class", "edge-fade").attr("fill", "url(#fade-r)").attr("x", bx1 - FADE).attr("y", -by1 - big).attr("width", big + FADE).attr("height", H + 2 * big);
      sky.append("rect").attr("class", "edge-fade").attr("fill", "url(#fade-t)").attr("x", bx0 - big).attr("y", -by1 - big).attr("width", W + 2 * big).attr("height", big + FADE);
      sky.append("rect").attr("class", "edge-fade").attr("fill", "url(#fade-b)").attr("x", bx0 - big).attr("y", -by0 - FADE).attr("width", W + 2 * big).attr("height", big + FADE);
    }

    // ---- light over everything below the labels
    const tint = light.append("rect").attr("class", "tint"), veil = light.append("rect").attr("class", "veil"), dim = light.append("rect").attr("class", "dim");

    // ---- labels in screen space. What shows depends on zoom: area names
    // always, water and landmarks' names from a little closer, boulder names
    // close up (or when you hover or pick one), lore notes closer still.
    // Placed by priority so they never overlap.
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const FONT = { sector: "800 17px Fraunces, Georgia, serif", boulder: "600 18px Caveat, cursive", note: "500 15px Caveat, cursive", water: "italic 600 16px Fraunces, Georgia, serif", road: "700 11px 'Nunito Sans', sans-serif" };
    const LOD = { park: 2.2, area: 3.2, close: 7 };
    const labelItems = [];
    for (const s of D.sectors) {
      const ps = D.problems.filter(p => D.boulders[p.b].sector === s.name).map(p => p.grade);
      const lift = s.name === "Hawkwatch" ? S.baldR * .95 : s.radius * .95;
      labelItems.push({ kind: "sector", name: s.name, text: s.name.toUpperCase(), sub: `V${Math.min(...ps)}–V${Math.max(...ps)} · ${s.walk_min} min walk`, wx: s.x, wy: s.y + lift, pri: 0, minK: 0 });
    }
    for (const z of S.water.filter(z => !z.pit)) labelItems.push({ kind: "water", text: z.name, wx: z.c[0], wy: z.c[1] - z.R * .05, pri: 1, minK: 0 });
    if (S.quarry) labelItems.push({ kind: "water", text: S.quarry.name, wx: S.quarry.c[0], wy: S.quarry.c[1] - S.quarry.R * .78, pri: 1, minK: 0 });
    for (const s of S.streams) { const p = s.pts[Math.floor(s.pts.length * .55)]; labelItems.push({ kind: "water", text: s.name, wx: p[0], wy: p[1], pri: 2, minK: 1.2, small: true }); }
    labelItems.push({ kind: "road", text: "QUARRY HILL ROAD", wx: 130, wy: -38, pri: 2, minK: 0 });
    for (const bo of S.boulders) labelItems.push({ kind: "boulder", id: bo.id, text: bo.b.name, wx: bo.b.x, wy: bo.b.y, R: bo.form.R, Hh: bo.form.H, pri: 3, minK: LOD.close });
    for (const lm of S.landmarks) if (lm.note) labelItems.push({ kind: "note", text: lm.note, wx: lm.x, wy: lm.y, pri: 4, minK: 9, when: lm.when });
    const labelSel = labels.selectAll("g.lab").data(labelItems).join("g").attr("class", d => `lab lab-${d.kind}${d.when ? " when-" + d.when : ""}${d.small ? " lab-small" : ""}`);
    labelSel.append("path").attr("class", "leader");
    labelSel.append("text").attr("class", "lt").text(d => d.text);
    labelSel.filter(d => d.kind === "sector").append("text").attr("class", "lsub").attr("dy", 17).attr("text-anchor", "middle").text(d => d.sub);
    // (Canvas measuring ignores letter-spacing, so add the CSS's: .14em for area names, .2em for the road.)
    const SPACING = { sector: 17 * .14, road: 11 * .2, water: 16 * .02 };
    labelItems.forEach(d => { d.w = measure(d.text, d.small ? "italic 600 13px Fraunces, Georgia, serif" : FONT[d.kind]) + (SPACING[d.kind] || 0) * d.text.length; });

    // ---- you
    const meG = marks.append("g").attr("class", "me");
    meG.append("circle").attr("class", "me-pulse").attr("r", 11); meG.append("circle").attr("class", "me-halo").attr("r", 9); meG.append("circle").attr("class", "me-dot").attr("r", 6.5);
    const hereB = S.boulders.find(bo => bo.b.name === state.here);
    let meWorld = hereB ? [hereB.b.x - hereB.form.R * .55, hereB.b.y - hereB.form.R * 1.45] : [0, 0];

    // ---- interaction: hover shows a boulder's card and its name; a click picks it
    const tip = opts.tooltip;
    const ui = { hover: null, picked: hereB ? hereB.id : null, hotSector: null };
    let badgeSel = null;          // sent and tip badges (see setMarks)
    function markBoulders(scope) {
      (scope || stand).selectAll("g.boulder").classed("hot", function () { return +this.dataset.id === ui.hover; }).classed("picked", function () { return +this.dataset.id === ui.picked; });
      far.selectAll("g.far-rock").classed("hot", function () { return +this.dataset.id === ui.hover; }).classed("picked", function () { return +this.dataset.id === ui.picked; });
    }
    const rockAt = e => { const el = e.target.closest && e.target.closest("g.boulder, g.far-rock"); return el ? +el.dataset.id : null; };
    svg.on("pointermove.rock", e => {
      const id = rockAt(e);
      if (id !== ui.hover) { ui.hover = id; markBoulders(); placeLabels(); }
      // Which area you're over: its label shows its grades and walk.
      const [mx, my] = d3.pointer(e), wx = T.invertX(mx), wy = -T.invertY(my);
      const s = D.sectors.find(s => Math.hypot(wx - s.x, wy - s.y) < (s.name === "Hawkwatch" ? S.baldR : s.radius) + 12);
      const hs = s ? s.name : null;
      if (hs !== ui.hotSector) { ui.hotSector = hs; labelSel.classed("zone-hot", d => d.kind === "sector" && d.name === hs); }
      wrap.classList.toggle("zone-hover", id == null && hs != null && !!opts.onSector);
      if (!tip) return;
      if (id == null) { tip.hidden = true; return; }
      const b = S.boulders.find(x => x.id === id).b, g = d3.extent(b.problems, i => D.problems[i].grade);
      tip.innerHTML = opts.tipHtml ? opts.tipHtml(b) : `<strong>${esc(b.name)}</strong><div class="sub">${esc(b.sector)} · ${b.height_ft} ft · ${esc(b.angle)}</div>
        ${b.desc ? `<div class="tip-desc">${esc(b.desc)}</div>` : ""}${b.problems.length} problems, V${g[0]}${g[1] > g[0] ? "–V" + g[1] : ""}`;
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width - 8) x -= tip.offsetWidth + 28;
      if (y + tip.offsetHeight > r.height - 8) y -= tip.offsetHeight + 28;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }).on("pointerleave.rock", () => { ui.hover = null; ui.hotSector = null; markBoulders(); labelSel.classed("zone-hot", false); placeLabels(); if (tip) tip.hidden = true; })
      .on("click.rock", e => {
        const id = rockAt(e);
        if (id == null) {
          // An area's open ground: in the game, a click walks you there.
          if (!opts.onSector) return;
          const [mx, my] = d3.pointer(e), wx = T.invertX(mx), wy = -T.invertY(my);
          const s = D.sectors.find(s => Math.hypot(wx - s.x, wy - s.y) < (s.name === "Hawkwatch" ? S.baldR : s.radius) + 12);
          if (s) { if (tip) tip.hidden = true; opts.onSector(s.name); }
          return;
        }
        if (tip) tip.hidden = true;
        if (opts.onBoulder) return opts.onBoulder(id);
        ui.picked = id; markBoulders(); placeLabels();
        if (T.k < LOD.area) flyTo(S.boulders.find(b => b.id === id).b.name, 9);     // from the park view, a click takes you there
      })
      .on("keydown.rock", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const id = rockAt(e); if (id == null) return;
        e.preventDefault();
        if (opts.onBoulder) opts.onBoulder(id); else { ui.picked = id; markBoulders(); placeLabels(); }
      });

    // ---- zoom, levels of detail, and which tiles are on screen
    let size = { w: wrap.clientWidth || 900, h: wrap.clientHeight || 700 }, T = d3.zoomIdentity, furniture = [];
    const measureFurniture = () => {
      const wr = wrap.getBoundingClientRect();
      furniture = [...wrap.querySelectorAll(opts.furniture || ".cartouche, .tools, .compass")].map(el => { const r = el.getBoundingClientRect(); return { x0: r.left - wr.left - 6, x1: r.right - wr.left + 6, y0: r.top - wr.top - 6, y1: r.bottom - wr.top + 6 }; });
    };
    // The park itself (boulders, water and the lot), without the forest margins beyond it.
    const pk = (() => { const xs = [...D.boulders.map(b => b.x), ...D.features.flatMap(f => [f.x - f.r, f.x + f.r])], ys = [...D.boulders.map(b => b.y), ...D.features.flatMap(f => [f.y - f.r, f.y + f.r]), -40];
      return [Math.min(...xs) - 50, Math.max(...xs) + 50, Math.min(...ys) - 10, Math.max(...ys) + 50]; })();
    const fitK = () => Math.min(size.w / (pk[1] - pk[0]), size.h / (pk[3] - pk[2]));
    // opts.minZoom: the game keeps the world close enough to look its best (its paper map shows the whole park).
    const minK = () => (opts.minZoom ? Math.max(opts.minZoom, 0) : fitK() * .8);
    const zoom = d3.zoom().scaleExtent([minK(), 16]).translateExtent([[bx0 - 60, -by1 - 60], [bx1 + 60, -by0 + 60]]).on("zoom", e => { T = e.transform; draw(); });
    svg.call(zoom).on("dblclick.zoom", null);
    let lod = "";
    const pending = new Set();
    root.__tilesPending = 0;
    let building = false;
    function updateTiles() {
      if (T.k < LOD.park) { for (const t of tiles.values()) if (t.shown) { t.shown = false; for (const g of t.groups) g.attr("display", "none"); } return; }
      // The world box on screen, with room for what stands south of it and reaches up into view.
      const wx0 = T.invertX(0) - 12, wx1 = T.invertX(size.w) + 12, wyTop = -T.invertY(0) + 6, wyBot = -T.invertY(size.h) - 34;
      const [tx0, ty0] = tileOf(wx0, wyBot), [tx1, ty1] = tileOf(wx1, wyTop);
      const want = new Set();
      for (let tx = Math.max(0, tx0); tx <= Math.min(S.tiles.nx - 1, tx1); tx++) for (let ty = Math.max(0, ty0); ty <= Math.min(S.tiles.ny - 1, ty1); ty++) want.add(tileKey(tx, ty));
      for (const [k, t] of tiles) { const on = want.has(k); if (on !== t.shown) { t.shown = on; for (const g of t.groups) g.attr("display", on ? null : "none"); } }
      for (const k of want) if (!tiles.has(k)) pending.add(k);
      root.__tilesPending = pending.size;
      if (pending.size && !building) { building = true; requestAnimationFrame(buildSome); }
    }
    // Build a few tiles per frame (nearest the middle of the view first), so zooming in never stalls.
    function buildSome() {
      const t0 = performance.now(), cx = T.invertX(size.w / 2), cy = -T.invertY(size.h / 2);
      const list = [...pending].map(k => { const [tx, ty] = k.split(",").map(Number); return { k, tx, ty, d: Math.hypot(bx0 + (tx + .5) * TL - cx, by0 + (ty + .5) * TL - cy) }; }).sort((a, b) => a.d - b.d);
      for (const it of list) {
        if (performance.now() - t0 > 40) break;
        pending.delete(it.k);
        const t = buildTile(it.tx, it.ty);
        const on = T.k >= LOD.park; t.shown = on; for (const g of t.groups) g.attr("display", on ? null : "none");
      }
      root.__tilesPending = pending.size;
      if (pending.size) requestAnimationFrame(buildSome); else { building = false; updateTiles(); }
    }
    function draw() {
      world.attr("transform", T); glow.attr("transform", T);
      const k = T.k, next = k < LOD.park ? "park" : k < LOD.area ? "far" : k < LOD.close ? "area" : "close";
      if (next !== lod) {
        lod = next;
        for (const l of ["park", "far", "area", "close"]) wrap.classList.toggle("lod-" + l, lod === l);
        wrap.classList.toggle("lod-far", lod === "far" || lod === "park");
      }
      updateTiles();
      placeLabels();
      placeMe();
      placeBadges();
      if (opts.onZoom) opts.onZoom(T);
    }
    const placeMe = () => meG.attr("transform", `translate(${f2(T.applyX(meWorld[0]))},${f2(T.applyY(-meWorld[1]))})`);
    function placeLabels() {
      const k = T.k, boxes = furniture.slice();
      const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      if (k >= LOD.area) for (const b of S.boulders) {
        const x = T.applyX(b.b.x), y = T.applyY(-b.b.y);
        if (x < -60 || x > size.w + 60 || y < -60 || y > size.h + 120) continue;
        boxes.push({ x0: x - b.form.R * k, x1: x + b.form.R * k, y0: y - (b.form.H + b.form.R * .4) * k, y1: y + b.form.R * .7 * k });
      }
      const rank = d => (d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked) ? -1 : d.pri);
      const order = [...labelItems].sort((a, b) => rank(a) - rank(b));
      for (const d of order) {
        d.show = false;
        if (d.off) continue;
        const wanted = d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked);
        if (k < d.minK && !wanted) continue;
        if (d.kind === "water" && k > 6) continue;
        if (d.kind === "road" && k > 5) continue;
        const ax = T.applyX(d.wx), ay = T.applyY(-d.wy), h = d.kind === "sector" ? 34 : 18;
        if (ax < -200 || ax > size.w + 200 || ay < -100 || ay > size.h + 100) continue;
        let cands;
        if (d.kind === "boulder") { const rx = d.R * k, top = d.Hh * k; cands = [[ax + rx + 6, ay - top * .3, "start"], [ax - rx - 6, ay - top * .3, "end"], [ax, ay + rx * .8 + 18, "middle"], [ax, ay - top - rx * .35 - 6, "middle"]]; }
        else if (d.kind === "note") cands = [[ax + 12, ay - 16, "start"], [ax - 12, ay - 16, "end"], [ax + 12, ay + 20, "start"], [ax - 12, ay + 20, "end"]];
        else if (d.kind === "sector") cands = [[ax, ay - 8, "middle"], [ax, ay + 30, "middle"]];
        else cands = [[ax, ay, "middle"]];
        for (const [x, y, anchor] of cands) {
          const x0 = anchor === "start" ? x : anchor === "end" ? x - d.w : x - d.w / 2;
          const box = { x0: x0 - 3, x1: x0 + d.w + 3, y0: y - h + 4, y1: y + 6 };
          if (box.x0 < 4 || box.x1 > size.w - 4 || box.y0 < 4 || box.y1 > size.h - 4) continue;
          if (hit(box) && !wanted) continue;
          boxes.push(box); d.show = true; d.x = x; d.y = y; d.anchor = anchor; d.ax = ax; d.ay = ay; break;
        }
      }
      // Only touch the DOM where something changed (most labels are hidden most of the time).
      labelSel.each(function (d) {
        const hot = d.kind === "boulder" && (d.id === ui.hover || d.id === ui.picked);
        if (d._show !== d.show) { this.setAttribute("display", d.show ? "inline" : "none"); d._show = d.show; }
        if (d._hot !== hot) { this.classList.toggle("hot", hot); d._hot = hot; }
        if (!d.show) return;
        const tf = `translate(${f2(d.x)},${f2(d.y)})`;
        if (d._tf !== tf) { this.setAttribute("transform", tf); d._tf = tf; }
        if (d._anchor !== d.anchor) { this.querySelector("text.lt").setAttribute("text-anchor", d.anchor); d._anchor = d.anchor; }
        if (d.kind === "note") this.querySelector("path.leader").setAttribute("d", `M${f2(d.anchor === "end" ? -4 : 4)},${f2(d.y < d.ay ? 4 : -14)}L${f2(d.ax - d.x)},${f2(d.ay - d.y - 3)}`);
      });
    }
    function sizeLight() { for (const r of [tint, veil, dim]) r.attr("width", size.w).attr("height", size.h); }
    const fitTo = (cx, cy, rad) => { const k = Math.min(size.w, size.h) / (2 * rad); return d3.zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * -cy).scale(k); };
    const home = () => { const k = fitK(); return d3.zoomIdentity.translate(size.w / 2 - k * (pk[0] + pk[1]) / 2, size.h / 2 + k * (pk[2] + pk[3]) / 2).scale(k); };
    svg.attr("viewBox", `0 0 ${size.w} ${size.h}`); sizeLight(); measureFurniture();
    zoom.scaleExtent([minK(), 16]);
    svg.call(zoom.transform, opts.view ? fitTo(...opts.view) : home());
    new ResizeObserver(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h || (w === size.w && h === size.h)) return;
      size = { w, h }; svg.attr("viewBox", `0 0 ${w} ${h}`); sizeLight(); measureFurniture(); zoom.scaleExtent([minK(), 16]); draw();
    }).observe(wrap);
    const go = (t, ms = 900) => {
      const lo = minK();
      if (t.k < lo) { const cx = (size.w / 2 - t.x) / t.k, cy = (size.h / 2 - t.y) / t.k; t = d3.zoomIdentity.translate(size.w / 2 - lo * cx, size.h / 2 - lo * cy).scale(lo); }
      return ms && !reduceMotion ? svg.transition().duration(ms).call(zoom.transform, t) : svg.call(zoom.transform, t);
    };

    // ---- season and light, as variables only
    const rootStyle = wrap.style;
    const bump = (d, a, b, w) => smooth(a - w, a, d) * (1 - smooth(b, b + w, d));
    function setDate(date) {
      const P = Illu.paletteAt(date), d = P.day;
      const v = { "--leaf": P.leaf, "--snow": P.snow, "--flowers": P.flowers, "--fernness": P.ferns, "--berries": P.berries, "--shrooms": P.shrooms,
        "--floor": P.floor, "--floor2": P.floor2, "--meadow": P.meadow, "--bald-c": P.bald, "--grass-c": P.grass, "--fern-c": P.fern,
        "--shrub-c": P.shrub, "--bb": P.blueberry, "--litter-0": P.litter[0], "--litter-1": P.litter[1], "--water": P.water,
        "--shade-c": P.shade, "--canopy": P.canopy, "--trunk": P.trunk, "--season-tint": P.tint };
      ["maple", "oak", "birch", "ever"].forEach(k => P[k].forEach((c, i) => { v[`--${k}-${i}`] = c; }));
      P.fl.forEach((c, i) => { v[`--fl-${i}`] = c; });
      v["--bare-d"] = P.leaf >= .97 ? "none" : "inline";      // bare branches only when the canopy isn't full
      v["--snow-d"] = P.snow < .01 ? "none" : "inline";       // nor snow when there's none
      // The calendar's own small events.
      const blossom = bump(d, 128, 146, 6), apples = bump(d, 246, 300, 10);
      v["--fruit"] = Math.max(blossom, apples * .95); v["--fruit-c"] = blossom > apples ? "#fbe6ee" : "#c8362b";
      v["--lilac"] = bump(d, 130, 152, 6);
      v["--lily"] = bump(d, 160, 262, 18);
      v["--bales"] = d >= 205 && d <= 340 ? 1 : 0;
      v["--mown"] = bump(d, 205, 300, 8);
      v["--ice"] = P.snow > .3 ? Math.min(1, (P.snow - .3) / .4) : 0;
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
      lastShadow = L.shadow;
      shadows.selectAll("path[data-h]").attr("transform", function () { const h = +this.dataset.h; return `translate(${f2(L.shadow[0] * h)},${f2(-L.shadow[1] * h)})`; });
      far.select(".far-shade").attr("transform", `translate(${f2(L.shadow[0] * 9)},${f2(-L.shadow[1] * 9 + 4)})`);
      wrap.dataset.phase = L.phase.toLowerCase().replace(/\s+/g, "-");
      return L;
    }
    function flyTo(what, k = 9, ms = 900) {
      let p = null;
      const sec = D.sectors.find(s => s.name === what);
      if (sec) { const rad = (sec.name === "Hawkwatch" ? S.baldR : sec.radius) + 30; return go(fitTo(sec.x, sec.y + 4, rad), ms); }
      const lm = S.landmarks.find(l => l.id === what || l.kind === what || l.name === what || l.note === what);
      const bo = S.boulders.find(b => b.b.name === what);
      if (lm) p = [lm.x, lm.y + 2]; else if (bo) { p = [bo.b.x, bo.b.y + bo.form.H * .3]; ui.picked = bo.id; markBoulders(); }
      if (!p) return;
      go(d3.zoomIdentity.translate(size.w / 2 - k * p[0], size.h / 2 + k * p[1]).scale(k), ms);
    }
    // ---- your game on the map: where you are, what you've sent, projects, locals' tips.
    // Drawn apart from the tiles (which come and go), and updated without redrawing anything else.
    let marksState = { here: hereB ? hereB.id : null, ticked: new Set(), project: new Set(), tip: new Set(), sector: null };
    function setMarks(m) {
      marksState = { ...marksState, ...m };
      const { here, ticked, project, tip: tips } = marksState;
      ui.picked = here; markBoulders(); placeLabels();
      labelSel.classed("here", d => d.kind === "sector" && d.name === marksState.sector);
      // Projects: a dashed ring on the ground around the boulder.
      rings.selectAll("path.r-project").data(S.boulders.filter(bo => project.has(bo.id)), bo => bo.id).join("path").attr("class", "r-project")
        .attr("d", bo => ell(bo.b.x, -bo.b.y + bo.form.R * .05, bo.form.R * 1.5, bo.form.R * .95));
      // Your pads, down at the boulder you're at.
      over.selectAll("*").remove();
      const hb = S.boulders.find(bo => bo.id === here);
      if (hb) drawPads(over.append("g").attr("transform", `translate(${f2(hb.b.x)},${f2(-hb.b.y)})`), hb.form);
      // Sent and tip badges, a fixed size on screen beside each boulder.
      const list = S.boulders.filter(bo => ticked.has(bo.id) || tips.has(bo.id));
      badgeSel = badges.selectAll("g.badge").data(list, bo => bo.id).join(enter => {
        const g = enter.append("g").attr("class", "badge");
        g.append("circle").attr("class", "badge-sent").attr("r", 5.5);
        g.append("path").attr("class", "badge-check").attr("d", "M-2.4,.1L-.7,1.8L2.5,-1.6");
        g.append("path").attr("class", "badge-tip").attr("d", "M0-6 1.8-1.9 6.2-1.9 2.6.8 3.9 5.2 0 2.6-3.9 5.2-2.6.8-6.2-1.9-1.8-1.9Z").attr("transform", "translate(11,0) scale(.9)");
        return g;
      });
      badgeSel.classed("sent", bo => ticked.has(bo.id)).classed("tip", bo => tips.has(bo.id));
      placeBadges();
    }
    function placeBadges() {
      if (!badgeSel) return;
      const k = T.k;
      badgeSel.attr("transform", bo => `translate(${f2(T.applyX(bo.b.x + bo.form.R * .75) + 4)},${f2(T.applyY(-bo.b.y - bo.form.H * .85) - Math.min(10, k * 1.2))})`);
    }
    function setMe(p) { meWorld = p; placeMe(); }
    // Put world point (x, y) in the middle of the view, at zoom k (the current one by default); instant unless ms.
    function centerOn(x, y, k = T.k, ms = 0) { go(d3.zoomIdentity.translate(size.w / 2 - k * x, size.h / 2 + k * y).scale(k), ms); }
    // The world box on screen: [x0, y0, x1, y1] in metres.
    const viewBox = () => [T.invertX(0), -T.invertY(size.h), T.invertX(size.w), -T.invertY(0)];
    // Label only what the player knows: { sectors: { name: { show, sub } }, boulders: { id: name | null } }.
    let freshTimer = null;
    function setKnown(view) {
      known = view || null;
      let fresh = false;
      for (const d of labelItems) {
        const was = d.off;
        if (d.kind === "sector") {
          const v = known && known.sectors[d.name];
          d.off = !!known && !(v && v.show);
          d.subNow = known ? (v && v.sub) || "" : d.sub;
        } else if (d.kind === "boulder") d.off = !!known && !known.boulders[d.id];
        // A place you've just found: its label is inked in, briefly highlighted.
        d.fresh = was === true && !d.off;
        fresh = fresh || d.fresh;
      }
      labelSel.classed("lab-new", d => !!d.fresh);
      clearTimeout(freshTimer);
      if (fresh) freshTimer = setTimeout(() => { for (const d of labelItems) d.fresh = false; labelSel.classed("lab-new", false); }, 2600);
      labelSel.filter(d => d.kind === "sector").select("text.lsub").text(d => d.subNow ?? d.sub);
      svg.selectAll("g.boulder").attr("aria-label", function () { return ariaOf(S.boulders[+this.dataset.id]); });
      placeLabels();
    }
    // Bring an area into view, if it isn't already (after a walk).
    function focus(name) {
      const s = D.sectors.find(x => x.name === name); if (!s) return;
      const rad = (name === "Hawkwatch" ? S.baldR : s.radius) + 40, t = fitTo(s.x, s.y + 4, rad);
      const x = T.applyX(s.x), y = T.applyY(-s.y), inView = x > 40 && x < size.w - 40 && y > 60 && y < size.h - 40;
      if (t.k > T.k * 1.15 || !inView) go(t, 700);
    }
    draw();
    return { setDate, setTime, flyTo, setMarks, setMe, setKnown, centerOn, view: () => T, viewBox, focus, home: () => go(home()), zoomBy: f => svg.transition().duration(reduceMotion ? 0 : 250).call(zoom.scaleBy, f), scene: S,
      tilesPending: () => pending.size + (building ? 1 : 0) };
  }

  root.Paint = { paint };
})(window);
