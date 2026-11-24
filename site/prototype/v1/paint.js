// Granite Hollow, illustrated: draws one area of the map from illustrate.js's
// scene, as layered SVG. Like the game's map, colours come from CSS custom
// properties (season and light), so changing the date or the clock never
// redraws anything; setDate() and setTime() only write variables.
//
// Layers, back to front: ground (forest floor, washes, leaf litter, the bald,
// trails), small plants, snow, shade pools, cast shadows, everything that
// stands (trees, shrubs, logs, rocks, landmarks, sorted front to back so
// nearer things overlap farther ones), the sky (hawks, fireflies), the light
// (tint and veil), then labels in screen space.
(function (root) {
  const { Illu, Art } = root;
  const TAU = Math.PI * 2;
  const f2 = v => Math.round(v * 100) / 100;
  const circ = (x, y, r) => `M${f2(x - r)},${f2(y)}a${f2(r)},${f2(r)} 0 1,0 ${f2(2 * r)},0a${f2(r)},${f2(r)} 0 1,0 ${f2(-2 * r)},0`;
  const ell = (x, y, rx, ry) => `M${f2(x - rx)},${f2(y)}a${f2(rx)},${f2(ry)} 0 1,0 ${f2(2 * rx)},0a${f2(rx)},${f2(ry)} 0 1,0 ${f2(-2 * rx)},0`;
  const poly = pts => "M" + pts.map(p => f2(p[0]) + "," + f2(p[1])).join("L") + "Z";
  const SP = p => [p[0], -p[1]];                       // world (y north) -> drawing (y down)

  // ---- glyphs -----------------------------------------------------------------
  // Styles are inline because CSS rules don't reach inside <use> clones, but
  // custom properties do: each tree's class sets --crown, and the season and
  // light set the rest.
  const ST = {
    contact: "fill:var(--canopy);opacity:.3",
    trunk: "fill:var(--trunk-c);stroke:var(--tree-ink);stroke-width:.9px;vector-effect:non-scaling-stroke;stroke-linejoin:round",
    birch: "fill:var(--birch-bark);stroke:var(--tree-ink);stroke-width:.9px;vector-effect:non-scaling-stroke;stroke-linejoin:round",
    mark: "fill:none;stroke:#3b3531;stroke-width:.13;stroke-linecap:round;opacity:.8",
    branch: "fill:none;stroke:var(--trunk-c);stroke-linecap:round;stroke-linejoin:round;display:var(--bare-d,inline)",
    ink: "fill:var(--crown-d);stroke:var(--tree-ink);stroke-width:1.1px;vector-effect:non-scaling-stroke;stroke-linejoin:round",
    dark: "fill:var(--crown-d)",
    mid: "fill:var(--crown)",
    hlE: "fill:var(--crown-l);opacity:var(--hl-e);display:var(--hle-d,inline)",
    hlW: "fill:var(--crown-l);opacity:var(--hl-w);display:var(--hlw-d,inline)",
    snow: "fill:var(--snow-white);opacity:var(--snow)",
    berry: "fill:#3d4f9a;opacity:var(--berries)",
    fern: "fill:var(--fern-c);stroke:color-mix(in oklab,var(--fern-c),#1d2a16 35%);stroke-width:.5px;vector-effect:non-scaling-stroke",
    rib: "fill:none;stroke:color-mix(in oklab,var(--fern-c),#1d2a16 40%);stroke-width:.05",
  };
  // Clumps of lobes, drawn as an inked silhouette, a lighter mid-tone lifted
  // inside it, and sunlit lobes on the east and west (only one side shows,
  // depending on where the sun is).
  function clump(lobes, flat = 1, lift = .12) {
    const E = ([x, y, r]) => ell(x, y, r, r * flat);
    const cx = lobes.reduce((s, l) => s + l[0], 0) / lobes.length, cy = lobes.reduce((s, l) => s + l[1], 0) / lobes.length;
    const top = lobes.filter(l => l[1] <= cy + .25 * l[2]);
    return {
      ink: lobes.map(E).join(""),
      mid: lobes.map(([x, y, r]) => E([cx + (x - cx) * .9, y - r * lift * flat - .04, r * .82])).join(""),
      hlE: top.filter(l => l[0] >= cx - l[2] * .3).map(([x, y, r]) => E([x + r * .2, y - r * .3 * flat, r * .48])).join(""),
      hlW: top.filter(l => l[0] <= cx + l[2] * .3).map(([x, y, r]) => E([x - r * .2, y - r * .3 * flat, r * .48])).join(""),
      snow: top.map(([x, y, r]) => ell(x, y - r * flat * .5, r * .78, r * flat * .42)).join(""),
    };
  }
  const SPEC = {
    maple: { th: 3.0, R: 3.3, rx: 1, ry: .92, n: 9, lobe: .5, tw: .38 },
    oak: { th: 2.5, R: 3.8, rx: 1.2, ry: .8, n: 12, lobe: .44, tw: .5 },
    birch: { th: 4.3, R: 2.4, rx: .74, ry: 1.2, n: 10, lobe: .4, tw: .26 },
  };
  function deciduous(kind, shape) {
    const r = Art.rand(`glyph-${kind}-${shape}`), S = SPEC[kind];
    const R = S.R * (.88 + r() * .24), lean = (r() - .5) * .7, cx = lean * .8, cy = -(S.th + R * S.ry * .74);
    const lobes = [];
    for (let i = 0; i < S.n; i++) {
      const a = (i + r() * .7) / S.n * TAU, k = .6 + r() * .32;
      lobes.push([cx + Math.cos(a) * R * S.rx * k, cy + Math.sin(a) * R * S.ry * k, R * S.lobe * (.72 + r() * .5)]);
    }
    lobes.push([cx, cy, R * .7], [cx + (r() - .5) * R * .5, cy - R * .32, R * .5]);
    const C = clump(lobes, 1);
    const tw = S.tw;
    const trunk = `M${f2(-tw * 1.5)},0C${f2(-tw)},-.3 ${f2(-tw * .85 + lean * .3)},${f2(-S.th * .5)} ${f2(-tw * .55 + lean)},${f2(-S.th - .4)}L${f2(tw * .55 + lean)},${f2(-S.th - .4)}C${f2(tw * .85 + lean * .3)},${f2(-S.th * .5)} ${f2(tw)},-.3 ${f2(tw * 1.5)},0Z`;
    // Bare branches, seen in winter when the crown is gone.
    const byDepth = [[], [], [], []];
    const grow = (x, y, a, len, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len, mx = (x + x2) / 2 + (r() - .5) * len * .25, my = (y + y2) / 2 + (r() - .5) * len * .2;
      byDepth[3 - depth].push(`M${f2(x)},${f2(y)}Q${f2(mx)},${f2(my)} ${f2(x2)},${f2(y2)}`);
      if (!depth) return;
      const k = depth >= 2 ? 3 : 2;
      for (let i = 0; i < k; i++) grow(x2, y2, a + (i - (k - 1) / 2) * (.5 + r() * .35) + (r() - .5) * .3, len * (.6 + r() * .14), depth - 1);
    };
    const nMain = kind === "birch" ? 2 : 3;
    for (let i = 0; i < nMain; i++) grow(lean, -S.th - .2, -Math.PI / 2 + (i - (nMain - 1) / 2) * (kind === "oak" ? .75 : .48) + (r() - .5) * .25, R * (kind === "oak" ? .62 : .58), 3);
    const marks = kind === "birch" ? Array.from({ length: 7 }, () => { const y = -.4 - r() * (S.th - .4), x = lean * (-y / S.th) - tw * .5 + r() * tw * .3; return `M${f2(x)},${f2(y)}h${f2(tw * (.3 + r() * .4))}`; }).join("") : "";
    return {
      parts: [
        ["path", ST.contact, ell(0, .1, tw * 4, tw * 1.4)],
        ...byDepth.map((d, i) => ["path", ST.branch + `;stroke-width:${[tw * .9, tw * .5, tw * .28, tw * .15][i].toFixed(2)}`, d.join("")]),
        ["path", kind === "birch" ? ST.birch : ST.trunk, trunk],
        marks && ["path", ST.mark, marks],
        ["g", "opacity:var(--leaf-o)", [["path", ST.ink, C.ink], ["path", ST.dark, C.ink], ["path", ST.mid, C.mid], ["path", ST.hlE, C.hlE], ["path", ST.hlW, C.hlW]]],
      ].filter(Boolean),
      crownY: -cy, crownR: R * S.rx, height: -cy + R * S.ry,
    };
  }
  function pitchPine(shape, big = false) {
    // Gnarled and windswept: a crooked trunk leaning downwind, with tufts at the ends of the limbs.
    const r = Art.rand(`glyph-pitch-${shape}${big ? "-big" : ""}`);
    const H = 6.4 + r() * 1.6, wind = .8 + r() * .8, pts = [[0, 0]];
    for (let i = 1; i <= 5; i++) { const t = i / 5; pts.push([wind * t * t * 1.5 + (r() - .5) * .55, -H * t]); }
    const L = [], Rt = [];
    pts.forEach(([x, y], i) => { const w = .42 * (1 - i / 6) + .1; L.push([x - w, y]); Rt.push([x + w, y]); });
    const trunk = "M" + [...L, ...Rt.reverse()].map(p => f2(p[0]) + "," + f2(p[1])).join("L") + "Z";
    const limbs = [], tufts = [];
    for (let i = 2; i <= 5; i++) {
      const [x, y] = pts[i], side = i % 2 ? 1 : -1, len = (side > 0 ? 1.9 : 1.1) * (1.15 - i * .1) * (.8 + r() * .5);
      const tx = x + side * len, ty = y - .3 - r() * .6;
      limbs.push(`M${f2(x)},${f2(y)}Q${f2(x + side * len * .5)},${f2(y + .2)} ${f2(tx)},${f2(ty)}`);
      const n = 3 + Math.floor(r() * 2), s = 1.15 - i * .08;
      for (let k = 0; k < n; k++) tufts.push([tx + (k - (n - 1) / 2) * s * .9 + (r() - .5) * .3, ty + (r() - .5) * .45, s * (.75 + r() * .35)]);
    }
    const [tx, ty] = pts[5];
    tufts.push([tx - .3, ty - .5, 1.2], [tx + .6, ty - .3, 1.0], [tx + .1, ty - 1.1, .9]);
    const C = clump(tufts.map(([x, y, rr]) => [x, y, rr * 1.12]), .78, .18);
    return {
      parts: [["path", ST.contact, ell(0, .1, 1.5, .5)], ["path", ST.branch + ";stroke-width:.24", limbs.join("")], ["path", ST.trunk, trunk],
        ["path", ST.ink, C.ink], ["path", ST.dark, C.ink], ["path", ST.mid, C.mid], ["path", ST.hlE, C.hlE], ["path", ST.hlW, C.hlW], ["path", ST.snow, C.snow]],
      crownY: H * .75, crownR: 2.6, height: H + 1.5,
    };
  }
  function whitePine(shape) {
    // Tall, with flat tiers of needles held out sideways, rarely symmetrical.
    const r = Art.rand(`glyph-wpine-${shape}`);
    const H = 10 + r() * 2, tiers = [];
    for (let k = 0; k < 5; k++) {
      const y = -3 - k * (H - 3.6) / 4.6, w = 3.1 * (1 - k / 5.6) * (.8 + r() * .4), off = (r() - .5) * 1.4;
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) if (r() > .12 || i === 1) tiers.push([off + (i - (n - 1) / 2) * w * .55, y + (r() - .5) * .3, w * (.34 + r() * .12)]);
    }
    tiers.push([.1, -H + .2, .75]);
    const C = clump(tiers.sort((a, b) => b[1] - a[1]), .48, .25);
    const trunk = `M-.36,0L-.12,${f2(-H)}L.12,${f2(-H)}L.36,0Z`;
    return {
      parts: [["path", ST.contact, ell(0, .1, 1.6, .5)], ["path", ST.trunk, trunk],
        ["path", ST.ink, C.ink], ["path", ST.dark, C.ink], ["path", ST.mid, C.mid], ["path", ST.hlE, C.hlE], ["path", ST.hlW, C.hlW], ["path", ST.snow, C.snow]],
      crownY: H * .55, crownR: 2.8, height: H + .6,
    };
  }
  function hemlock(shape) {
    // A soft cone of scalloped skirts with the drooping leader hemlocks always have.
    const r = Art.rand(`glyph-hem-${shape}`);
    const H = 9 + r() * 2, W = 2.5 + r() * .5, n = 6, lean = (r() - .5) * .5;
    const skirt = (w, yb, yt, x0) => {
      const sc = 3 + Math.floor(w), pts = [`M${f2(x0 - w)},${f2(yb)}`];
      for (let i = 0; i < sc; i++) { const xa = x0 - w + (2 * w) * (i + .5) / sc, xb = x0 - w + (2 * w) * (i + 1) / sc; pts.push(`Q${f2(xa)},${f2(yb + .45)} ${f2(xb)},${f2(yb)}`); }
      pts.push(`Q${f2(x0 + w * .45)},${f2((yb + yt) / 2)} ${f2(x0)},${f2(yt)}Q${f2(x0 - w * .45)},${f2((yb + yt) / 2)} ${f2(x0 - w)},${f2(yb)}Z`);
      return pts.join("");
    };
    const ink = [], mid = [], hlE = [], hlW = [], snow = [];
    for (let k = 0; k < n; k++) {
      const yb = -.9 - k * (H - 1.8) / n, yt = yb - (H - 1.8) / n * 1.9, w = W * Math.pow(1 - k / n, .85) + .35, x0 = lean * k / n;
      ink.push(skirt(w, yb, yt, x0)); mid.push(skirt(w * .8, yb - .32, yt, x0));
      hlE.push(`M${f2(x0)},${f2(yt + .2)}Q${f2(x0 + w * .5)},${f2((yb + yt) / 2)} ${f2(x0 + w * .78)},${f2(yb - .3)}Q${f2(x0 + w * .3)},${f2(yb - .1)} ${f2(x0 + .1)},${f2(yb - .45)}Z`);
      hlW.push(`M${f2(x0)},${f2(yt + .2)}Q${f2(x0 - w * .5)},${f2((yb + yt) / 2)} ${f2(x0 - w * .78)},${f2(yb - .3)}Q${f2(x0 - w * .3)},${f2(yb - .1)} ${f2(x0 - .1)},${f2(yb - .45)}Z`);
      snow.push(`M${f2(x0)},${f2(yt + .1)}Q${f2(x0 + w * .55)},${f2(yb - .5)} ${f2(x0 + w * .85)},${f2(yb - .15)}Q${f2(x0)},${f2(yb - .8)} ${f2(x0 - w * .85)},${f2(yb - .15)}Q${f2(x0 - w * .55)},${f2(yb - .5)} ${f2(x0)},${f2(yt + .1)}Z`);
    }
    const tip = `M${f2(lean)},${f2(-H + .9)}q.15,-.9 .85,-1.05`;
    return {
      parts: [["path", ST.contact, ell(0, .1, 1.8, .55)], ["path", ST.trunk, "M-.3,0L-.15,-1.4L.15,-1.4L.3,0Z"],
        ["path", ST.ink, ink.join("")], ["path", ST.mid, mid.join("")], ["path", ST.hlE, hlE.join("")], ["path", ST.hlW, hlW.join("")], ["path", ST.snow, snow.join("")],
        ["path", "fill:none;stroke:var(--crown-d);stroke-width:.3;stroke-linecap:round", tip]],
      crownY: H * .45, crownR: W, height: H + .4,
    };
  }
  function shrubGlyph(kind, v) {
    const r = Art.rand(`shrub-${kind}-${v}`), lobes = [];
    if (kind === "blueberry") {
      const n = 6 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const a = Math.PI + (i + .5) / n * Math.PI, k = .7 + r() * .3; lobes.push([Math.cos(a) * .62 * k, -.3 + Math.sin(a) * .3 * k, .26 + r() * .1]); }
      lobes.push([0, -.42, .36], [(r() - .5) * .4, -.36, .3]);
    } else {
      for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; lobes.push([Math.cos(a) * .55 * (.8 + r() * .3), -.62 + Math.sin(a) * .42 * (.8 + r() * .3), .38 + r() * .12]); }
      lobes.push([0, -.7, .55]);
    }
    const C = clump(lobes, .85, .15);
    const parts = [["path", ST.contact, ell(0, .02, kind === "blueberry" ? 1.4 : 1.1, .32)], ["path", ST.ink, C.ink], ["path", ST.dark, C.ink], ["path", ST.mid, C.mid], ["path", ST.hlE, C.hlE], ["path", ST.hlW, C.hlW], ["path", ST.snow, C.snow]];
    if (kind === "blueberry") parts.push(["path", ST.berry, lobes.map(([x, y, rr]) => circ(x + (r() - .5) * rr, y - rr * .2, .075) + circ(x + (r() - .5) * rr, y + rr * .1, .07)).join("")]);
    return { parts };
  }
  function fernGlyph(v) {
    const r = Art.rand("fern" + v), fronds = [], ribs = [];
    const n = 5 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * .42 + (r() - .5) * .15, L = .9 + r() * .4, w = .2;
      const tx = Math.cos(a) * L, ty = Math.sin(a) * L * .8, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      fronds.push(`M0,0Q${f2(tx * .5 + nx)},${f2(ty * .5 + ny)} ${f2(tx)},${f2(ty)}Q${f2(tx * .5 - nx)},${f2(ty * .5 - ny)} 0,0Z`);
      ribs.push(`M0,0L${f2(tx * .92)},${f2(ty * .92)}`);
    }
    return { parts: [["g", "opacity:calc(var(--fernness) * (1 - var(--snow)))", [["path", ST.fern, fronds.join("")], ["path", ST.rib, ribs.join("")]]]] };
  }
  function appendParts(sel, parts) {
    for (const [tag, style, d] of parts) {
      if (tag === "g") appendParts(sel.append("g").attr("style", style), d);
      else sel.append("path").attr("style", style).attr("d", d);
    }
  }

  // ---- the painter ----------------------------------------------------------------
  function paint(svgEl, D, sectorName, opts = {}) {
    const d3 = root.d3;
    const S = Illu.sceneFor(D, sectorName);
    const svg = d3.select(svgEl), wrap = svgEl.parentElement;
    svg.selectAll("*").remove();
    const defs = svg.append("defs");
    const glyph = {};
    const addGlyph = (id, g) => { appendParts(defs.append("g").attr("id", id), g.parts); glyph[id] = g; };
    for (let i = 0; i < 6; i++) {
      for (const k of ["maple", "oak", "birch"]) addGlyph(`t-${k}-${i}`, deciduous(k, i));
      addGlyph(`t-pitch-${i}`, pitchPine(i)); addGlyph(`t-whitepine-${i}`, whitePine(i)); addGlyph(`t-hemlock-${i}`, hemlock(i));
    }
    addGlyph("t-pitch-big", pitchPine(0, true));
    for (let v = 0; v < 3; v++) { addGlyph(`s-blueberry-${v}`, shrubGlyph("blueberry", v)); addGlyph(`s-laurel-${v}`, shrubGlyph("laurel", v)); addGlyph(`fern-${v}`, fernGlyph(v)); }
    // Leaf litter and granite speckle, as patterns that tile under everything.
    {
      const rr = Art.rand("litter"), p = defs.append("pattern").attr("id", "litter").attr("patternUnits", "userSpaceOnUse").attr("width", 9).attr("height", 9);
      for (let i = 0; i < 26; i++) {
        const x = rr() * 9, y = rr() * 9, a = rr() * 180, c = rr();
        p.append("ellipse").attr("cx", f2(x)).attr("cy", f2(y)).attr("rx", .28).attr("ry", .14).attr("transform", `rotate(${a | 0} ${f2(x)} ${f2(y)})`)
          .attr("class", c < .45 ? "lt0" : c < .85 ? "lt1" : "lt2");
      }
      for (let i = 0; i < 5; i++) { const x = rr() * 9, y = rr() * 9, a = rr() * TAU; p.append("path").attr("class", "twig").attr("d", `M${f2(x)},${f2(y)}l${f2(Math.cos(a) * .9)},${f2(Math.sin(a) * .9)}`); }
      const q = defs.append("pattern").attr("id", "speckle").attr("patternUnits", "userSpaceOnUse").attr("width", 2.4).attr("height", 2.4);
      for (let i = 0; i < 14; i++) q.append("circle").attr("cx", f2(rr() * 2.4)).attr("cy", f2(rr() * 2.4)).attr("r", f2(.035 + rr() * .05)).attr("class", rr() < .5 ? "spk0" : "spk1");
    }

    const [bx0, bx1, by0, by1] = S.bounds;
    const W = bx1 - bx0, H = by1 - by0;
    const world = svg.append("g").attr("class", "world");
    const ground = world.append("g").attr("class", "ground");
    const flat = world.append("g").attr("class", "flat");
    const snowL = world.append("g").attr("class", "snowcover");
    const pools = world.append("g").attr("class", "pools");
    const shadows = world.append("g").attr("class", "shadows");
    const stand = world.append("g").attr("class", "standing");
    const sky = world.append("g").attr("class", "sky");
    const light = svg.append("g").attr("class", "light").attr("pointer-events", "none");
    const glow = svg.append("g").attr("class", "glow").attr("pointer-events", "none");   // fireflies shine through the dusk
    const labels = svg.append("g").attr("class", "labels");
    const marks = svg.append("g").attr("class", "marks");

    // ---- ground
    ground.append("rect").attr("class", "floor").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80);
    const blob = (seed, n = 10, wob = .3) => { const r = Art.rand(seed); return d3.line().curve(d3.curveCardinalClosed.tension(.15))(d3.range(n).map(i => { const a = i / n * TAU + r() * .3, k = 1 - wob / 2 + r() * wob; return [Math.cos(a) * k, Math.sin(a) * k]; })); };
    ground.append("g").attr("class", "washes").selectAll("path").data(S.washes).join("path")
      .attr("class", w => "wash w" + w.tone).attr("d", w => blob("w" + w.seed, 9, .45)).attr("transform", w => `translate(${f2(w.x)},${f2(-w.y)}) scale(${f2(w.r)})`);
    ground.append("rect").attr("class", "litter lod-a").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80).attr("fill", "url(#litter)");
    // A gentle hill: lighter toward the summit, darker down the slopes.
    const hill = defs.append("radialGradient").attr("id", "hill").attr("gradientUnits", "userSpaceOnUse").attr("cx", S.sector.x).attr("cy", -S.sector.y).attr("r", 190);
    hill.append("stop").attr("offset", 0).attr("class", "hill0"); hill.append("stop").attr("offset", .45).attr("class", "hill1"); hill.append("stop").attr("offset", 1).attr("class", "hill2");
    ground.append("rect").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80).attr("fill", "url(#hill)");

    // The bald summit: open granite, exfoliating in sheets, crossed by joints, spotted with lichen.
    const baldD = d3.line().curve(d3.curveBasisClosed)(S.bald.map(SP));
    defs.append("clipPath").attr("id", "bald-clip").append("path").attr("d", baldD);
    const baldG = ground.append("g").attr("class", "bald-g");
    baldG.append("path").attr("class", "bald-fringe").attr("d", baldD).attr("transform", `translate(${f2(S.baldC[0] * -0.04)},${f2(S.baldC[1] * 0.04)}) scale(1.04)`);
    baldG.append("path").attr("class", "bald").attr("d", baldD);
    // Granite ledges through the heath: contours of the rock field, stepped like exfoliating sheets.
    const RG = S.rockGrid;
    // Contour rings drawn as smooth curves, so the grid they come from never shows.
    const ring = d3.line().curve(d3.curveBasisClosed);
    const gpath = mp => mp.coordinates.map(poly => poly.map(r => ring(r.slice(0, -1).map(([x, y]) => [RG.x0 + x * RG.cell, -(RG.y0 + y * RG.cell)]))).join("")).join("");
    const ledges = d3.contours().size([RG.nx, RG.ny]).thresholds([RG.t, RG.t + .07, RG.t + .15])(RG.values);
    defs.append("clipPath").attr("id", "rock-clip").append("path").attr("d", gpath(ledges[0]));
    // Blueberry carpets under the bushes on the heath.
    baldG.append("path").attr("class", "heath-bb").attr("d", gpath(d3.contours().size([RG.nx, RG.ny]).thresholds([S.bbGrid.t])(S.bbGrid.values)[0]));
    ledges.forEach((c, i) => baldG.append("path").attr("class", "ledge ledge" + i).attr("d", gpath(c)));
    const bc = baldG.append("g").attr("clip-path", "url(#rock-clip)");
    {
      const rr = Art.rand("baldtone");
      for (let i = 0; i < 24; i++) {
        const a = rr() * TAU, d = Math.sqrt(rr()) * S.baldR, x = S.baldC[0] + Math.cos(a) * d, y = S.baldC[1] + Math.sin(a) * d;
        bc.append("path").attr("class", rr() < .5 ? "rocktone0" : "rocktone1").attr("d", blob("bt" + i, 9, .5)).attr("transform", `translate(${f2(x)},${f2(-y)}) scale(${f2(6 + rr() * 14)},${f2(4 + rr() * 9)}) rotate(${(rr() * 180) | 0})`);
      }
    }
    const sl = d3.line().curve(d3.curveBasis);
    bc.append("g").attr("class", "sheets").selectAll("g").data(S.sheets.filter(s => s.length > 2)).join("g").call(g => {
      g.append("path").attr("class", "sheet-lip").attr("d", s => sl(s.map(p => [p[0], -p[1] - .35])));
      g.append("path").attr("class", "sheet-step").attr("d", s => sl(s.map(SP)));
    });
    bc.append("path").attr("class", "joint").attr("d", S.joints.map(([a, b]) => `M${f2(a[0])},${f2(-a[1])}L${f2(b[0])},${f2(-b[1])}`).join(""));
    bc.append("g").attr("class", "rosettes").selectAll("path").data([0, 1, 2]).join("path").attr("class", c => "ro ro" + c)
      .attr("d", c => S.rosettes.filter(x => x.c === c).map(x => circ(x.x, -x.y, x.r)).join(""));
    bc.append("path").attr("class", "pebble").attr("d", S.pebbles.map(p => ell(p.x, -p.y, p.s, p.s * .7)).join(""));

    // Trails: packed dirt in the woods, faded where they cross open rock (marked there by blazes and cairns).
    const tl = d3.line().curve(d3.curveLinear);
    const trailG = ground.append("g").attr("class", "trails");
    const mask = defs.append("mask").attr("id", "off-bald").attr("maskUnits", "userSpaceOnUse").attr("x", bx0 - 60).attr("y", -by1 - 60).attr("width", W + 120).attr("height", H + 120);
    mask.append("rect").attr("x", bx0 - 60).attr("y", -by1 - 60).attr("width", W + 120).attr("height", H + 120).attr("fill", "#fff");
    mask.append("path").attr("d", baldD).attr("fill", "#000").attr("transform", `translate(${f2(S.baldC[0] * .06)},${f2(-S.baldC[1] * .06)}) scale(.94)`);
    for (const t of S.trails) {
      const d = tl(t.pts.map(SP));
      trailG.append("path").attr("class", "trail-worn").attr("d", d);
      trailG.append("path").attr("class", "trail-edge").attr("d", d).attr("mask", "url(#off-bald)");
      trailG.append("path").attr("class", "trail-dirt").attr("d", d).attr("mask", "url(#off-bald)");
      trailG.append("path").attr("class", "trail-ink only-far").attr("d", d);
      // Blue blazes painted on the open rock.
      let acc = 0;
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc < 7) continue; acc = 0;
        const bz = S.baldness(b); if (!bz.inside || bz.depth < 3) continue;
        const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI;
        trailG.append("rect").attr("class", "blaze lod-a").attr("x", -.45).attr("y", -.22).attr("width", .9).attr("height", .44).attr("rx", .08)
          .attr("transform", `translate(${f2(b[0])},${f2(-b[1])}) rotate(${ang | 0})`);
      }
    }

    // ---- small plants on the ground
    const fl = flat.append("g").attr("class", "flowers");
    for (let c = 0; c < 4; c++) {
      fl.append("path").attr("class", "fl fl" + c).attr("d", S.flowers.filter(f => f.c === c).map(f => circ(f.x, -f.y, .26 * f.s)).join(""));
      fl.append("path").attr("class", "fl-eye lod-c").attr("d", S.flowers.filter(f => f.c === c).map(f => circ(f.x, -f.y, .08 * f.s)).join(""));
    }
    flat.append("path").attr("class", "grass").attr("d", S.grass.map(g => {
      const x = g.x, y = -g.y, s = g.s;
      return [-.45, -.2, 0, .22, .42].map((o, i) => `M${f2(x + o * .25 * s)},${f2(y)}q${f2(o * .3 * s)},${f2(-.4 * s)} ${f2(o * .7 * s)},${f2(-(.55 + (i % 2) * .25) * s)}`).join("");
    }).join(""));
    flat.append("g").attr("class", "ferns").selectAll("use").data(S.ferns).join("use")
      .attr("href", (f, i) => `#fern-${i % 3}`).attr("transform", f => `translate(${f2(f.x)},${f2(-f.y)}) rotate(${f.rot}) scale(${f2(f.s)})`);
    const shroomG = flat.append("g").attr("class", "shrooms lod-c");
    for (const m of S.shrooms) {
      const x = m.x, y = -m.y, s = m.s;
      if (m.kind === "bracket") shroomG.append("path").attr("class", "bracket").attr("d", `M${f2(x - .3 * s)},${f2(y)}q${f2(.3 * s)},${f2(-.28 * s)} ${f2(.6 * s)},0z`);
      else {
        shroomG.append("path").attr("class", "stem").attr("d", `M${f2(x - .05 * s)},${f2(y)}v${f2(-.28 * s)}h${f2(.1 * s)}v${f2(.28 * s)}z`);
        shroomG.append("path").attr("class", m.kind === "fly" ? "cap fly" : "cap").attr("d", `M${f2(x - .24 * s)},${f2(y - .26 * s)}q${f2(.24 * s)},${f2(-.34 * s)} ${f2(.48 * s)},0z`);
        if (m.kind === "fly") shroomG.append("path").attr("class", "spots").attr("d", circ(x - .08 * s, y - .38 * s, .035 * s) + circ(x + .09 * s, y - .34 * s, .03 * s));
      }
    }

    // ---- snow lies over the ground and the small plants
    snowL.append("rect").attr("class", "snow-cover").attr("x", bx0 - 40).attr("y", -by1 - 40).attr("width", W + 80).attr("height", H + 80);
    for (const t of S.trails) snowL.append("path").attr("class", "trail-snowpack").attr("d", tl(t.pts.map(SP)));

    // ---- shade pools under the canopy, then cast shadows (each layer one flat colour, so overlaps don't darken)
    const poolE = pools.append("g").attr("class", "pool-ever"), poolD = pools.append("g").attr("class", "pool-decid");
    // Pools of shade only where trees stand close together, so a lone tree never gets a halo.
    const crowded = t => S.trees.reduce((n, u) => n + (u !== t && Math.abs(u.x - t.x) < 7 && Math.abs(u.y - t.y) < 7 ? 1 : 0), 0) >= 3;
    for (const t of S.trees) if (!S.baldness([t.x, t.y]).inside && crowded(t)) (t.ever ? poolE : poolD).append("circle").attr("cx", f2(t.x)).attr("cy", f2(-t.y - t.crownR * .2)).attr("r", f2(t.crownR * 1.25));
    // Cast shadows, grouped by the height of what casts them: each group slides by
    // (sun's shadow vector x height), set in setTime() with one attribute per group.
    // (Per-element CSS transforms here cost ~8x the frame time when panning.)
    const shE = shadows.append("g"), shD = shadows.append("g").attr("class", "sh-decid");
    const BUCKET = 1.25, bucketsE = new Map(), bucketsD = new Map();
    const bucket = (ever, h) => {
      const k = Math.max(1, Math.round(h / BUCKET)), m = ever ? bucketsE : bucketsD;
      if (!m.has(k)) m.set(k, (ever ? shE : shD).append("g").attr("data-h", k * BUCKET));
      return m.get(k);
    };

    // ---- the standing layer, front to back
    const items = [];
    const treeGlyphId = t => t.kind === "pitch" || t.kind === "whitepine" || t.kind === "hemlock" ? `t-${t.kind}-${t.shape}` : `t-${t.kind}-${t.shape}`;
    for (const t of S.trees) {
      const id = treeGlyphId(t), g = glyph[id], s = t.size;
      items.push({ y: -t.y, draw: L => L.append("use").attr("href", "#" + id).attr("class", `t ${t.kind} v${t.v} ${t.ever ? "ever" : "decid"}`)
        .attr("transform", `translate(${f2(t.x)},${f2(-t.y)}) scale(${f2(t.flip ? -s : s)},${f2(s)})`) });
      bucket(t.ever, g.crownY * s).append("ellipse").attr("cx", f2(t.x)).attr("cy", f2(-t.y)).attr("rx", f2(g.crownR * s * .9)).attr("ry", f2(g.crownR * s * .62));
    }
    for (const b of S.shrubs) items.push({ y: -b.y, draw: L => L.append("use").attr("href", `#s-${b.kind}-${b.v}`).attr("class", `sb ${b.kind}`)
      .attr("transform", `translate(${f2(b.x)},${f2(-b.y)}) scale(${f2(b.s)})`) });
    for (const l of S.logs) items.push({ y: -l.y, draw: L => drawLog(L, l) });
    for (const st of S.stumps) items.push({ y: -st.y, draw: L => drawStump(L, st) });
    for (const c of S.cairns) items.push({ y: -c.y, draw: L => drawCairn(L.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(c.x)},${f2(-c.y)}) scale(${f2(c.s)})`)) });
    const state = opts.state || {};
    const boulderSel = new Map();
    for (const bo of S.boulders) {
      items.push({ y: -bo.b.y, draw: L => boulderSel.set(bo.id, drawBoulder(L, bo, state)) });
      const F = bo.form;
      for (const t of [.3, .6, 1]) bucket(true, F.H * t * .9).append("path").attr("d", poly(F.base)).attr("transform", `translate(${f2(bo.b.x)},${f2(-bo.b.y)})`);
    }
    for (const lm of S.landmarks) items.push({ y: -lm.y, draw: L => drawLandmark(L, lm) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw(stand);
    for (const lm of S.landmarks) if (lm.kind === "bigtree") {
      const g = glyph[lm.species === "pitch" ? "t-pitch-big" : `t-${lm.species}-2`];
      bucket(lm.species === "pitch", g.crownY * lm.scale).append("ellipse").attr("cx", f2(lm.x)).attr("cy", f2(-lm.y)).attr("rx", f2(g.crownR * lm.scale * .9)).attr("ry", f2(g.crownR * lm.scale * .62));
    }

    // ---- boulders
    function drawBoulder(L, bo, st) {
      const F = bo.form, X = bo.b.x, Y = -bo.b.y;
      const g = L.append("g").attr("class", `boulder k-${F.kind}`).attr("data-id", bo.id).attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", `${bo.b.name}, ${bo.b.sector}`).attr("transform", `translate(${f2(X)},${f2(Y)})`)
        .attr("style", `--rock:${F.rock.rock};--rock-top:${F.rock.top};--rock-shade:${F.rock.shade};--rock-ink:${F.rock.ink}`);
      g.append("path").attr("class", "r-contact").attr("d", ell(0, F.R * .12, F.R * 1.12, F.R * .58));
      if (st.project && st.project.includes(bo.b.name)) g.append("path").attr("class", "r-project").attr("d", ell(0, F.R * .05, F.R * 1.45, F.R * .9));
      const hullD = F.smoothEdge ? d3.line().curve(d3.curveBasisClosed)(F.hull) : poly(F.hull);
      defs.append("clipPath").attr("id", `bclip-${bo.id}`).append("path").attr("d", hullD);
      if (F.smoothEdge) {
        // Domes and round boulders: stacked rings from the base up, lighter as they rise.
        const gid = "dome-" + bo.id, gr = defs.append("radialGradient").attr("id", gid).attr("cx", .5).attr("cy", .32).attr("r", .72).attr("fx", .5).attr("fy", .22);
        gr.append("stop").attr("offset", 0).attr("stop-color", Art.mix(F.rock.top, "#ffffff", .25));
        gr.append("stop").attr("offset", .45).attr("stop-color", F.rock.top);
        gr.append("stop").attr("offset", .8).attr("stop-color", F.rock.rock);
        gr.append("stop").attr("offset", 1).attr("stop-color", Art.mix(F.rock.rock, F.rock.shade, .45));
        g.append("path").attr("class", "rd-body").attr("d", hullD).attr("fill", `url(#${gid})`);
        // The flank away from the sun falls into shade; the sunward shoulder catches light.
        const flank = dx => ell(dx * F.R * .55, -F.H * .35, F.R * .62, F.H * .62 + F.R * .2);
        g.append("path").attr("class", "rd-shade e").attr("d", flank(1)).attr("clip-path", `url(#bclip-${bo.id})`);
        g.append("path").attr("class", "rd-shade w").attr("d", flank(-1)).attr("clip-path", `url(#bclip-${bo.id})`);
        const sheetD = [.3, .55, .78].map((u, i) => { const y = -F.H * u, w = F.R * (1.05 - u * .5), sag = F.R * (.28 - u * .12); return `M${f2(-w)},${f2(y + sag * .2)}Q${f2(-w * .1 + (i - 1) * F.R * .1)},${f2(y + sag)} ${f2(w)},${f2(y - sag * .1)}`; }).join("");
        g.append("path").attr("class", "r-sheet-lip").attr("d", sheetD).attr("transform", "translate(0,-.18)").attr("clip-path", `url(#bclip-${bo.id})`);
        g.append("path").attr("class", "r-sheet").attr("d", sheetD).attr("clip-path", `url(#bclip-${bo.id})`);
        g.append("path").attr("class", "r-sunspot hl-e").attr("d", ell(F.R * .28, -F.H * .8, F.R * .34, F.R * .2));
        g.append("path").attr("class", "r-sunspot hl-w").attr("d", ell(-F.R * .28, -F.H * .8, F.R * .34, F.R * .2));
      } else {
        if (F.kind === "roof" || F.kind === "prow") g.append("path").attr("class", "r-cave").attr("d", ell(F.lean * F.R * .3, F.R * .2, F.R * .8, F.R * .3));
        for (const f of F.faces) g.append("path").attr("class", `rf rf${f.dir}${f.under ? " rf-under" : ""}`).attr("d", poly(f.pts));
        g.append("path").attr("class", "rtop").attr("d", poly(F.top));
      }
      // Surface details, clipped to the rock's outline (the clip is in the boulder's own frame).
      const clipId = `bclip-${bo.id}`;
      const dc = g.append("g").attr("class", "r-detail").attr("clip-path", `url(#${clipId})`);
      const front = F.base.filter(p => p[1] > -F.R * .1).sort((a, b) => a[0] - b[0]);
      if (front.length > 1) dc.append("path").attr("class", "r-moss lod-a").attr("style", `opacity:calc(${F.moss} * (1 - var(--snow)))`)
        .attr("d", d3.line().curve(d3.curveBasis)(front.map(p => [p[0], p[1] - .15])));
      dc.append("path").attr("class", "r-speckle lod-c").attr("d", hullD);
      for (let c = 0; c < 3; c++) dc.append("path").attr("class", `r-lichen lc${c}`).attr("d", F.lichen.filter(l => l.c === c).map(l => ell(l.x, l.y, l.r, l.r * .7)).join(""));
      dc.append("path").attr("class", "r-crack").attr("d", F.cracks.map(c => d3.line().curve(d3.curveBasis)(c)).join(""));
      dc.append("path").attr("class", "r-chalk lod-c").attr("d", F.chalk.map(c => ell(c.x, c.y, c.r * 1.3, c.r)).join(""));
      dc.append("path").attr("class", "r-snow").attr("d", F.smoothEdge ? d3.line().curve(d3.curveBasisClosed)(F.base.map(p => [p[0] * .62, p[1] * .62 - F.H * .9])) : poly(F.top));
      if (!F.smoothEdge) g.append("path").attr("class", "r-rim").attr("d", poly(F.top));
      g.append("path").attr("class", "r-ink").attr("d", hullD);
      // Each boulder's own small story.
      const name = bo.b.name, T = F.topC;
      if (/\bbowl\b/i.test(bo.b.desc || "")) {
        g.append("path").attr("class", "r-bowl").attr("d", ell(T[0], T[1] + .1, F.R * .42, F.R * .2));
        g.append("path").attr("class", "r-needles lod-c").attr("d", d3.range(12).map(i => { const a = i * 2.4, rr = F.R * .3 * Math.sqrt((i + 1) / 12); return `M${f2(T[0] + Math.cos(a) * rr)},${f2(T[1] + Math.sin(a) * rr * .45)}l${f2(Math.cos(a * 3) * .3)},${f2(Math.sin(a * 3) * .12)}`; }).join(""));
      }
      if (/chickadee/i.test(name)) for (const [dx, flip] of [[-.5, 1], [.7, -1]]) drawBird(g.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(T[0] + dx)},${f2(T[1] - .1)}) scale(${flip * .55},.55)`), "chickadee");
      if (/\bperch\b/i.test(name)) drawBird(g.append("g").attr("class", "lod-a").attr("transform", `translate(${f2(T[0] + .3)},${f2(T[1])}) scale(.9)`), "hawk");
      // Your game state, drawn on the rock: a pennant on what you've sent, a star for a local's tip.
      if (st.sent && st.sent.includes(name)) {
        const p = g.append("g").attr("class", "pennant").attr("transform", `translate(${f2(T[0] - F.R * .2)},${f2(T[1] + .2)})`);
        p.append("path").attr("class", "pole").attr("d", "M0,0V-2.6");
        p.append("path").attr("class", "flag").attr("d", "M0,-2.6L1.5,-2.15L0,-1.7Z");
      }
      if (st.tip && st.tip.includes(name)) g.append("path").attr("class", "tipstar").attr("transform", `translate(${f2(T[0])},${f2(T[1] - 2.2)}) scale(.16)`)
        .attr("d", "M0-6 1.8-1.9 6.2-1.9 2.6.8 3.9 5.2 0 2.6-3.9 5.2-2.6.8-6.2-1.9-1.8-1.9Z");
      if (st.here === name) drawPads(g, F);
      g.append("path").attr("class", "r-hit").attr("d", hullD);
      return g;
    }
    function drawPads(g, F) {
      // Your crash pads, spread under the start, and a chalk bucket.
      const y0 = F.R * .92;
      g.append("path").attr("class", "pad p0").attr("d", poly([[-F.R * .55, y0], [F.R * .05, y0 - .15], [F.R * .12, y0 + 1.1], [-F.R * .5, y0 + 1.25]]));
      g.append("path").attr("class", "pad p1").attr("d", poly([[F.R * .1, y0 - .1], [F.R * .62, y0 - .25], [F.R * .72, y0 + .85], [F.R * .18, y0 + 1.05]]));
      g.append("path").attr("class", "pad-seam lod-c").attr("d", `M${f2(-F.R * .25)},${f2(y0 - .05)}L${f2(-F.R * .19)},${f2(y0 + 1.2)}M${f2(F.R * .4)},${f2(y0 - .17)}L${f2(F.R * .45)},${f2(y0 + .95)}`);
      g.append("path").attr("class", "bucket").attr("d", `M${f2(F.R * .85)},${f2(y0 + .2)}h.5l-.06,.55h-.38z`);
    }
    function drawBird(g, kind) {
      if (kind === "chickadee") {
        g.append("path").attr("class", "bird-body").attr("d", "M-.35,0C-.4,-.35 -.1,-.5 .15,-.42C.35,-.5 .45,-.35 .38,-.2C.3,0 0,.05 -.35,0Z");
        g.append("path").attr("class", "bird-cap").attr("d", "M.12,-.42C.3,-.55 .46,-.4 .4,-.25L.2,-.3Z");
        g.append("path").attr("class", "bird-tail").attr("d", "M-.33,-.08L-.65,.05L-.32,.02Z");
      } else {
        g.append("path").attr("class", "hawk-body").attr("d", "M0,0C-.25,-.4 -.2,-1 .05,-1.15C.3,-1.25 .4,-1 .32,-.75C.38,-.4 .25,-.1 0,0ZM.05,0L-.08,.35L.18,.35Z");
        g.append("path").attr("class", "hawk-breast").attr("d", "M.08,-.85C.25,-.7 .25,-.3 .1,-.12C.05,-.4 .02,-.6 .08,-.85Z");
      }
    }
    function drawLog(L, l) {
      const g = L.append("g").attr("class", "log").attr("transform", `translate(${f2(l.x)},${f2(-l.y)}) rotate(${f2(-l.a * 180 / Math.PI)})`);
      const h = l.L / 2, r = l.r;
      g.append("path").attr("class", "log-shadow").attr("d", ell(0, r * .6, h + .2, r * .7));
      g.append("path").attr("class", "log-bark").attr("d", `M${f2(-h)},${f2(-r)}H${f2(h)}A${f2(r * .45)},${f2(r)} 0 0,1 ${f2(h)},${f2(r)}H${f2(-h)}A${f2(r * .45)},${f2(r)} 0 0,1 ${f2(-h)},${f2(-r)}Z`);
      g.append("path").attr("class", "log-grain lod-a").attr("d", `M${f2(-h * .8)},${f2(-r * .2)}H${f2(h * .3)}M${f2(-h * .3)},${f2(r * .35)}H${f2(h * .7)}`);
      g.append("path").attr("class", "log-end").attr("d", ell(h, 0, r * .45, r));
      g.append("path").attr("class", "log-ring lod-c").attr("d", ell(h, 0, r * .22, r * .5));
      g.append("path").attr("class", "log-moss").attr("d", ell(-h * .4, -r * .75, h * .35, r * .35) + ell(h * .35, -r * .7, h * .22, r * .3));
      g.append("path").attr("class", "log-snow").attr("d", ell(0, -r * .85, h * .95, r * .35));
    }
    function drawStump(L, s) {
      const g = L.append("g").attr("class", "stump lod-a").attr("transform", `translate(${f2(s.x)},${f2(-s.y)})`);
      const r = s.r;
      g.append("path").attr("class", "log-bark").attr("d", `M${f2(-r)},0V${f2(-r * 1.3)}A${f2(r)},${f2(r * .45)} 0 0,1 ${f2(r)},${f2(-r * 1.3)}V0A${f2(r)},${f2(r * .45)} 0 0,1 ${f2(-r)},0Z`);
      g.append("path").attr("class", "log-end").attr("d", ell(0, -r * 1.3, r, r * .45));
      g.append("path").attr("class", "log-ring lod-c").attr("d", ell(0, -r * 1.3, r * .5, r * .22));
    }
    function drawCairn(g) {
      [[0, 0, .75, .3], [.05, -.42, .58, .25], [-.04, -.8, .42, .2], [.02, -1.12, .26, .16]].forEach(([x, y, rx, ry]) =>
        g.append("path").attr("class", "cairn-stone").attr("d", ell(x, y, rx, ry)));
    }
    function drawLandmark(L, lm) {
      const g = L.append("g").attr("class", `lm lm-${lm.kind}${lm.when ? " when-" + lm.when : ""}`).attr("transform", `translate(${f2(lm.x)},${f2(-lm.y)})${lm.kind === "counters" || lm.kind === "signpost" || lm.kind === "bench" ? " scale(1.35)" : ""}`);
      switch (lm.kind) {
        case "bigtree": {
          const id = lm.species === "pitch" ? "t-pitch-big" : `t-${lm.species}-2`;
          g.append("use").attr("href", "#" + id).attr("class", `t ${lm.species} v1 ${lm.species === "pitch" ? "ever" : "decid"} landmark`).attr("transform", `scale(${lm.scale})`);
          if (lm.feeder) {
            const fy = -glyph[id].crownY * lm.scale + glyph[id].crownR * lm.scale * .55;
            const fg = g.append("g").attr("class", "feeder").attr("transform", `translate(${f2(glyph[id].crownR * lm.scale * .35)},${f2(fy)})`);
            fg.append("path").attr("class", "string").attr("d", "M0,-1.4V-.4");
            fg.append("path").attr("class", "feeder-roof").attr("d", "M-.55,-.35L0,-.75L.55,-.35Z");
            fg.append("path").attr("class", "feeder-box").attr("d", "M-.4,-.35H.4V.3H-.4Z");
            fg.append("path").attr("class", "feeder-seed").attr("d", "M-.3,.05H.3V.3H-.3Z");
            drawBird(fg.append("g").attr("class", "lod-c").attr("transform", "translate(.55,.35) scale(.5)"), "chickadee");
          }
          break;
        }
        case "cairn": drawCairn(g.append("g").attr("transform", "scale(1.6)")); break;
        case "counters": {
          // Two camp chairs, a spotting scope on its tripod, and the day's tally board.
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
          // Four concrete footings of the old fire tower, and the weathervane that outlived it.
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
          // A long-dead white pine, silver and bare, with the old stick nest in its crook.
          g.append("path").attr("class", "contact").attr("d", ell(0, .1, 1.2, .4));
          g.append("path").attr("class", "snag").attr("d", "M-.45,0L-.18,-9.6L.12,-10.2L.2,-9.4L.42,0Z");
          g.append("path").attr("class", "snag-limb").attr("d", "M0,-4.5L-1.6,-5.4M0,-6.4L1.5,-7.2M0,-7.8L-1.1,-8.6M0,-3L1.1,-3.5");
          g.append("path").attr("class", "nest").attr("d", "M-1.25,-8.25Q0,-7.4 1.2,-8.25Q1.1,-9.1 0,-9.1Q-1.1,-9.1 -1.25,-8.25Z");
          g.append("path").attr("class", "nest-sticks lod-a").attr("d", "M-1.1,-8.5L1,-8.7M-.9,-8.2L1.1,-8.4M-1,-8.85L.6,-8.9");
          break;
        }
        case "bench": {
          g.append("path").attr("class", "bench-leg").attr("d", "M-.8,0V-.5M.8,0V-.5M-.8,-.55V-1.25M.8,-.55V-1.25");
          g.append("path").attr("class", "bench-seat").attr("d", "M-1.1,-.6H1.1V-.42H-1.1Z");
          g.append("path").attr("class", "bench-back").attr("d", "M-1.1,-1.3H1.1V-.95H-1.1Z");
          break;
        }
        case "signpost": {
          // Arrows toward each trail's next stop, from the trail junction.
          g.append("path").attr("class", "post").attr("d", "M0,0V-2.7");
          const dests = S.trails.map(t => {
            const end = t.to === sectorName ? t.pts[0] : t.pts[t.pts.length - 1];
            const name = t.to === sectorName ? (D.sectors.find(x => x.name === sectorName).parent === "Parking" ? "Parking" : "Parking lot") : t.to;
            return { name: t.to === sectorName ? "Parking lot" : name, dx: end[0] - lm.x };
          });
          dests.forEach((d, i) => {
            const y = -2.5 + i * .62, dir = d.dx >= 0 ? 1 : -1, w = 2.6;
            g.append("path").attr("class", "sign-board").attr("d", dir > 0 ? `M-.15,${y}H${w - .3}L${w},${y + .24}L${w - .3},${y + .48}H-.15Z` : `M.15,${y}H${-w + .3}L${-w},${y + .24}L${-w + .3},${y + .48}H.15Z`);
            g.append("text").attr("class", "sign-text lod-c").attr("x", dir * (w / 2 - .1)).attr("y", y + .36).text(d.name);
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
      const hg = hawks.append("g").attr("class", `hawk h${i}`);
      const spin = hg.append("g").attr("transform", `rotate(${f2(start)} ${f2(hawkC[0] + (rr() - .5) * 20)} ${f2(hawkC[1] + (rr() - .5) * 20)})`);
      const center = spin.attr("transform").match(/rotate\(\S+ (\S+) (\S+)\)/).slice(1).map(Number);
      const b = spin.append("g");
      if (!reduceMotion) b.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate")
        .attr("from", `0 ${center[0]} ${center[1]}`).attr("to", `${i % 2 ? -360 : 360} ${center[0]} ${center[1]}`).attr("dur", f2(dur) + "s").attr("repeatCount", "indefinite");
      b.append("path").attr("class", "hawk-shadow").attr("d", hawkPath).attr("transform", `translate(${f2(center[0] + rad + 9)},${f2(center[1] + 7)}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
      b.append("path").attr("class", "hawk-bird").attr("d", hawkPath).attr("transform", `translate(${f2(center[0] + rad)},${f2(center[1])}) rotate(${i % 2 ? 180 : 0}) scale(${f2(sc)})`);
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

    // ---- light over everything below the labels
    const tint = light.append("rect").attr("class", "tint"), veil = light.append("rect").attr("class", "veil"), dim = light.append("rect").attr("class", "dim");

    // ---- labels in screen space, placed so they never overlap
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const FONT = { sector: "800 17px Fraunces, Georgia, serif", sub: "700 12px 'Nunito Sans', sans-serif", boulder: "600 18px Caveat, cursive", note: "500 16px Caveat, cursive", trail: "600 15px Caveat, cursive" };
    const labelItems = [];
    labelItems.push({ kind: "sector", text: sectorName.toUpperCase(), wx: S.baldC[0], wy: S.baldC[1] + S.baldR * .95, pri: 0, minK: 0 });
    for (const bo of S.boulders) if (bo.b.sector === sectorName) labelItems.push({ kind: "boulder", id: bo.id, text: bo.b.name, wx: bo.b.x, wy: bo.b.y, R: bo.form.R, Hh: bo.form.H, pri: 1, minK: 3.4 });
    for (const lm of S.landmarks) if (lm.note) labelItems.push({ kind: "note", text: lm.note, wx: lm.x, wy: lm.y, pri: 2, minK: 3.4, when: lm.when });
    for (const t of S.trails) {
      // A trail's name where it leaves the area, toward its far end.
      const out = t.to === sectorName ? t.pts[Math.max(0, t.pts.findIndex(p => Math.hypot(p[0] - S.sector.x, p[1] - S.sector.y) < 105) - 1)] : t.pts.find(p => Math.hypot(p[0] - S.sector.x, p[1] - S.sector.y) > 105);
      if (out) labelItems.push({ kind: "trail", text: t.to === sectorName ? "to the parking lot" : `to ${t.to}`, wx: out[0], wy: out[1], pri: 3, minK: 2.5 });
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
    const meWorld = hereB ? [hereB.b.x - hereB.form.R * .55, hereB.b.y - hereB.form.R * 1.35] : [S.sector.x, S.sector.y];

    // ---- interaction
    const tip = opts.tooltip;
    let hoverId = null;
    stand.selectAll("g.boulder").on("pointerenter pointermove", function (e) {
      const id = +this.dataset.id, bo = S.boulders.find(x => x.id === id), b = bo.b;
      hoverId = id; labels.selectAll("g.lab-boulder").classed("hot", d => d.id === id);
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
    }).on("pointerleave", () => { hoverId = null; labels.selectAll("g.lab-boulder").classed("hot", false); if (tip) tip.hidden = true; });
    // Hovering anywhere over the area shows its grades and walk time under its name.
    svg.on("pointermove.zone", e => { const [mx, my] = d3.pointer(e), wx = T.invertX(mx), wy = -T.invertY(my);
      wrap.classList.toggle("zone-hot", Math.hypot(wx - S.sector.x, wy - S.sector.y) < S.baldR + 12); })
      .on("pointerleave.zone", () => wrap.classList.remove("zone-hot"));

    // ---- zoom and levels of detail
    let size = { w: wrap.clientWidth || 900, h: wrap.clientHeight || 700 }, T = d3.zoomIdentity;
    const zoom = d3.zoom().scaleExtent([2.2, 16]).translateExtent([[bx0, -by1], [bx1, -by0]]).on("zoom", e => { T = e.transform; draw(); });
    svg.call(zoom).on("dblclick.zoom", null);
    function draw() {
      const k = T.k;
      world.attr("transform", T); glow.attr("transform", T);
      wrap.classList.toggle("lod-far", k < 3.2); wrap.classList.toggle("lod-area", k >= 3.2 && k < 7); wrap.classList.toggle("lod-close", k >= 7);
      // Labels, by priority; a label that would overlap one already placed waits for a closer zoom.
      // Labels keep clear of the map's own furniture (cartouche, zoom buttons, compass).
      const wr = wrap.getBoundingClientRect();
      const boxes = [...wrap.querySelectorAll(".cartouche, .tools, .compass")].map(el => { const r = el.getBoundingClientRect(); return { x0: r.left - wr.left - 6, x1: r.right - wr.left + 6, y0: r.top - wr.top - 6, y1: r.bottom - wr.top + 6 }; });
      const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      for (const b of S.boulders) {   // boulders themselves are obstacles for notes and trail names
        const x = T.applyX(b.b.x), y = T.applyY(-b.b.y);
        boxes.push({ x0: x - b.form.R * k, x1: x + b.form.R * k, y0: y - (b.form.H + b.form.R * .4) * k, y1: y + b.form.R * .7 * k, solid: true });
      }
      const order = [...labelItems].sort((a, b) => a.pri - b.pri);
      for (const d of order) {
        d.show = false;
        if (k < d.minK) continue;
        const ax = T.applyX(d.wx), ay = T.applyY(-d.wy), h = d.kind === "sector" ? 34 : 18;
        let cands;
        if (d.kind === "boulder") {
          const rx = d.R * k, top = d.Hh * k;
          cands = [[ax + rx + 6, ay - top * .35, "start"], [ax - rx - 6, ay - top * .35, "end"], [ax, ay + rx * .75 + 16, "middle"], [ax, ay - top - rx * .3 - 6, "middle"]];
        } else if (d.kind === "note") cands = [[ax + 12, ay - 16, "start"], [ax - 12, ay - 16, "end"], [ax + 12, ay + 20, "start"], [ax - 12, ay + 20, "end"]];
        else cands = [[ax, ay, "middle"]];
        for (const [x, y, anchor] of cands) {
          const x0 = anchor === "start" ? x : anchor === "end" ? x - d.w : x - d.w / 2;
          const box = { x0: x0 - 3, x1: x0 + d.w + 3, y0: y - h + 4, y1: y + 6 };
          if (box.x0 < 4 || box.x1 > size.w - 4 || box.y0 < 4 || box.y1 > size.h - 4) continue;
          if (hit(box) && d.kind !== "sector") continue;
          boxes.push(box); d.show = true; d.x = x; d.y = y; d.anchor = anchor; d.ax = ax; d.ay = ay; break;
        }
      }
      labelSel.attr("display", d => (d.show ? null : "none")).attr("transform", d => (d.show ? `translate(${f2(d.x)},${f2(d.y)})` : null));
      labelSel.select("text.lt").attr("text-anchor", d => d.anchor);
      labelSel.select("text.lsub").attr("text-anchor", "middle");
      labelSel.select("path.leader").attr("d", d => (d.show && d.kind === "note" ? `M${f2(d.anchor === "end" ? -4 : 4)},${f2(d.y < d.ay ? 4 : -14)}L${f2(d.ax - d.x)},${f2(d.ay - d.y - 3)}` : null));
      meG.attr("transform", `translate(${f2(T.applyX(meWorld[0]))},${f2(T.applyY(-meWorld[1]))})`);
    }
    function sizeLight() { for (const r of [tint, veil, dim]) r.attr("width", size.w).attr("height", size.h); }
    const fitTo = (cx, cy, rad) => {
      const k = Math.min(size.w, size.h) / (2 * rad);
      return d3.zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * -cy).scale(k);
    };
    const home = () => fitTo(S.sector.x, S.sector.y + 6, S.sector.radius + 34);
    svg.attr("viewBox", `0 0 ${size.w} ${size.h}`); sizeLight();
    svg.call(zoom.transform, opts.view ? fitTo(...opts.view) : home());
    new ResizeObserver(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h || (w === size.w && h === size.h)) return;
      size = { w, h }; svg.attr("viewBox", `0 0 ${w} ${h}`); sizeLight(); svg.call(zoom.transform, home());
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
      v["--bare-d"] = P.leaf >= .97 ? "none" : "inline";      // bare branches only show when the canopy isn't full
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
      const lit = Illu.sunFaces(L.shadow, cloudy ? .15 : L.alt).map(x => cloudy ? .35 + x * .3 : x);
      const sun = L.phase === "Dusk" ? Art.mix("#ffc58c", "#d9a3c8", Math.max(0, Math.min(1, 1 - (dusk - minute) / 90))) : SUN[L.phase];
      const v = { "--tint": L.tint, "--tint-op": L.op.toFixed(3), "--veil": L.veil, "--veil-op": L.veilOp.toFixed(3),
        "--shx": L.shadow[0].toFixed(3), "--shy": (-L.shadow[1]).toFixed(3), "--shadow-op": (cloudy ? .14 : .3 + .08 * (1 - L.alt)).toFixed(3),
        "--sun": sun, "--hl-e": (cloudy ? .18 : .2 + .65 * Math.max(0, sunX) + .2 * L.alt).toFixed(3), "--hl-w": (cloudy ? .18 : .2 + .65 * Math.max(0, -sunX) + .2 * L.alt).toFixed(3),
        "--rtop-sun": (cloudy ? 0 : 10 + 22 * L.alt) + "%" };
      lit.forEach((x, i) => { v[`--rs${i}`] = Math.round((1 - x) * 74) + "%"; });
      v["--hle-d"] = +v["--hl-e"] < .3 ? "none" : "inline"; v["--hlw-d"] = +v["--hl-w"] < .3 ? "none" : "inline";   // only the sunlit side is drawn
      shadows.selectAll("g[data-h]").attr("transform", function () { const h = +this.dataset.h; return `translate(${f2(L.shadow[0] * h)},${f2(-L.shadow[1] * h)})`; });
      for (const [k, x] of Object.entries(v)) rootStyle.setProperty(k, x);
      wrap.dataset.phase = L.phase.toLowerCase().replace(/\s+/g, "-");
      return L;
    }
    function setState() {}
    function flyTo(what, k = 9) {
      let p = null;
      const lm = S.landmarks.find(l => l.kind === what || l.name === what || l.note === what);
      const bo = S.boulders.find(b => b.b.name === what);
      if (lm) p = [lm.x, lm.y + 2]; else if (bo) p = [bo.b.x, bo.b.y + bo.form.H * .3];
      else if (what === "barrens") { const s = S.shrubs.filter(x => x.kind === "blueberry"); p = [d3.mean(s, x => x.x), d3.mean(s, x => x.y)]; k = 6; }
      if (!p) return;
      go(d3.zoomIdentity.translate(size.w / 2 - k * p[0], size.h / 2 + k * p[1]).scale(k));
    }
    draw();
    return { setDate, setTime, setState, flyTo, home: () => go(home()), zoomBy: f => svg.transition().duration(reduceMotion ? 0 : 250).call(zoom.scaleBy, f),
      zoomTo: k => go(d3.zoomIdentity.translate(size.w / 2 - k * S.sector.x, size.h / 2 - k * -(S.sector.y + 6)).scale(k)), scene: S };
  }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  root.Paint = { paint };
})(window);
