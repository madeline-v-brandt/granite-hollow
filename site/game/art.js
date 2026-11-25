// Granite Hollow: the look of the world. Pure functions, no DOM, so the map's
// seasons, light and scenery can be checked outside the browser.
//
//   seasonAt(date)              colours for the day of the year (blended between keyframes)
//   lightAt(minute, dusk, opts) sun position, shadows and the tint of the light
//   scenery(D)                  where trees, flowers, ferns and landmarks go (deterministic)
//   trailControls(t)            the wobbly control points every trail is drawn through
//
// Nothing here affects gameplay: it only decides how things look.
(function (root) {
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // A small seeded random stream (also used for trail and boulder shapes, so
  // they look the same every visit).
  function rand(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  // ---- colour helpers ----------------------------------------------------------
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const toHex = v => "#" + v.map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

  // ---- seasons -----------------------------------------------------------------
  // Keyframes by day of the year. Deciduous trees come in three kinds (maple,
  // oak, birch), each with three shades so a hillside isn't one flat colour.
  // leaf: how much canopy deciduous trees have. snow/ice/flowers: 0..1.
  const K = [
    { d: 1, leaf: 0, snow: .9, ice: .85, flowers: 0, ferns: 0,
      maple: ["#8a7867", "#8a7867", "#8a7867"], oak: ["#857563", "#857563", "#857563"], birch: ["#9a8c78", "#9a8c78", "#9a8c78"],
      ever: ["#3f5947", "#4b6650"], meadow: "#e6e8de", floor: "#dfe1d7", water: "#c8d7dd", tint: "#cfd8e0" },
    { d: 62, leaf: 0, snow: .4, ice: .3, flowers: 0, ferns: 0,
      maple: ["#8f7866", "#8f7866", "#8f7866"], oak: ["#887461", "#887461", "#887461"], birch: ["#9e8f7a", "#9e8f7a", "#9e8f7a"],
      ever: ["#42604a", "#4e6c52"], meadow: "#d9d6c1", floor: "#d6d1bb", water: "#bcd2d6", tint: "#d6d6cc" },
    { d: 100, leaf: .45, snow: 0, ice: 0, flowers: .45, ferns: .4,
      maple: ["#bcd07d", "#c9d98c", "#a9c56b"], oak: ["#c3c68a", "#cfcf96", "#b5bb7c"], birch: ["#d3df8e", "#dde59c", "#c6d580"],
      ever: ["#46664b", "#557657"], meadow: "#cadb9c", floor: "#d2d9ae", water: "#b5d2d6", tint: "#d5e3b3" },
    { d: 138, leaf: 1, snow: 0, ice: 0, flowers: 1, ferns: 1,
      maple: ["#8dbd58", "#9cc862", "#7cad4d"], oak: ["#84b155", "#93bb5f", "#76a24c"], birch: ["#a5cb62", "#b2d36d", "#98c158"],
      ever: ["#3f6545", "#4d7352"], meadow: "#b8d686", floor: "#c4d59c", water: "#acd0d5", tint: "#cfe3a8" },
    { d: 182, leaf: 1, snow: 0, ice: 0, flowers: .5, ferns: 1,
      maple: ["#5f8e3f", "#6c9a46", "#557f38"], oak: ["#5a8640", "#679148", "#4f7738"], birch: ["#77a14a", "#83aa52", "#6c9443"],
      ever: ["#355b3d", "#426848"], meadow: "#c8cd88", floor: "#b9c793", water: "#a8cbd2", tint: "#e6dcaa" },
    { d: 236, leaf: 1, snow: 0, ice: 0, flowers: .25, ferns: .9,
      maple: ["#6a8a3f", "#76933f", "#5e7c3a"], oak: ["#647f3c", "#718a42", "#587337"], birch: ["#82984a", "#8ea150", "#778d43"],
      ever: ["#385c3e", "#456948"], meadow: "#d3c983", floor: "#c3c490", water: "#a9cad0", tint: "#e9daa6" },
    { d: 263, leaf: 1, snow: 0, ice: 0, flowers: .1, ferns: .7,
      maple: ["#a4983b", "#bf8c33", "#83893a"], oak: ["#7f893e", "#8c8a41", "#747f3b"], birch: ["#bdb24a", "#c8b852", "#ada646"],
      ever: ["#395c3f", "#466a49"], meadow: "#d7c67f", floor: "#cfc08f", water: "#a9c8cf", tint: "#ebd3a0" },
    { d: 290, leaf: 1, snow: 0, ice: 0, flowers: 0, ferns: .35,
      maple: ["#cf532b", "#e2792d", "#b6392a"], oak: ["#a8622f", "#b9763a", "#8f5a2e"], birch: ["#e4b638", "#efc84a", "#d6a52c"],
      ever: ["#3a5c40", "#47694a"], meadow: "#d8bd7b", floor: "#d6b98c", water: "#a6c4cc", tint: "#f0c68c" },
    { d: 316, leaf: .4, snow: 0, ice: 0, flowers: 0, ferns: .1,
      maple: ["#9d5b35", "#8b5031", "#aa6a3d"], oak: ["#8b6a45", "#97744c", "#7e603f"], birch: ["#b89a56", "#c2a560", "#ad8f4e"],
      ever: ["#3c5c42", "#48684c"], meadow: "#cfc09a", floor: "#ccc0a1", water: "#aec3ca", tint: "#dccbb0" },
    { d: 341, leaf: .04, snow: .45, ice: .35, flowers: 0, ferns: 0,
      maple: ["#8b7866", "#8b7866", "#8b7866"], oak: ["#867563", "#867563", "#867563"], birch: ["#9b8c78", "#9b8c78", "#9b8c78"],
      ever: ["#3e5a46", "#4a664f"], meadow: "#dddccf", floor: "#d9d8cc", water: "#c2d4da", tint: "#d3d9de" },
  ];
  const NAMES = [[60, "Deep winter", "winter"], [90, "Late winter", "winter"], [120, "Mud season", "spring"],
    [152, "Spring", "spring"], [173, "Early summer", "summer"], [235, "High summer", "summer"], [266, "Late summer", "summer"],
    [278, "Early autumn", "autumn"], [301, "Peak foliage", "autumn"], [335, "Late autumn", "autumn"], [367, "Early winter", "winter"]];

  function dayOfYear(date) {
    const t = new Date(date + "T12:00:00Z"), start = Date.UTC(t.getUTCFullYear(), 0, 1);
    return Math.floor((t - start) / 864e5) + 1;
  }
  function seasonAt(date) {
    const d = dayOfYear(date);
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
    const [, name, key] = NAMES.find(([until]) => d < until);
    out.name = name; out.key = key;
    return out;
  }

  // ---- light through the day -----------------------------------------------------
  // The sun rises as far before solar noon (about 12:50) as dusk is after it.
  // The tint is a colour multiplied over the map: cool in the morning, clear at
  // midday, golden for the last three hours, then a long dusk (the last 90
  // minutes before the park closes) that slides from amber through rose to
  // violet, and night once you've headed home. Clouds and humidity add a veil.
  const NOON = 12 * 60 + 50;
  const DUSK_MIN = 90, GOLDEN_MIN = 180;
  function lightAt(minute, dusk, opts = {}) {
    const rise = 2 * NOON - dusk;
    const t = clamp((minute - rise) / (dusk - rise), 0, 1);
    const alt = Math.sin(Math.PI * t);
    const toDusk = dusk - minute;
    let tint = "#ffffff", op = 0, phase = "Midday";
    if (opts.over || toDusk < -20) { tint = "#2f3b68"; op = .5; phase = "Night"; }
    else if (toDusk <= 0) { tint = "#6a6a9c"; op = .34; phase = "Dusk"; }
    else if (toDusk < DUSK_MIN) {
      const f = 1 - toDusk / DUSK_MIN;
      tint = f < .5 ? mix("#f3b064", "#e39a8f", f * 2) : mix("#e39a8f", "#9479ab", f * 2 - 1); op = .2 + .13 * f; phase = "Dusk";
    }
    else if (toDusk < GOLDEN_MIN) { const f = 1 - (toDusk - DUSK_MIN) / (GOLDEN_MIN - DUSK_MIN); tint = "#f4bf72"; op = .2 * f; phase = "Golden hour"; }
    else if (minute < NOON - 120) { const f = clamp(1 - (minute - rise) / 300, 0, 1); tint = "#c9d8ee"; op = .2 * f; phase = "Morning"; }
    else if (minute >= NOON + 60) phase = "Afternoon";
    // Shadows fall away from the sun: west in the morning, north at noon, east
    // in the evening, longer when the sun is low. Map units: x east, y north.
    const len = clamp(.22 / Math.max(alt, .14), .22, 1.3);
    const shadow = [-Math.cos(Math.PI * t) * len, Math.sin(Math.PI * t) * len * .55 + .12];
    const sky = (opts.sky || "").toLowerCase();
    let veil = "#ffffff", veilOp = 0;
    if (/rain|snow|drizzle/.test(sky)) { veil = "#9aa3ab"; veilOp = .32; }
    else if (sky === "overcast") { veil = "#b5bcc2"; veilOp = .2; }
    else if (sky === "humid") { veil = "#efe2bd"; veilOp = .18; }
    const shadowOp = /overcast|rain|snow|drizzle/.test(sky) ? .12 : .28;
    return { t, alt, rise, phase, tint, op, veil, veilOp, shadow, shadowOp };
  }

  // ---- trails ------------------------------------------------------------------
  // Control points a trail is drawn through (with d3.curveBasis): start, two
  // wobbles, end. The walking animation and the tree placement use them too.
  function trailControls(t) {
    const r = rand("trail" + t.to), [x0, y0] = t.start, [x1, y1] = t.end, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const mid = [0.33, 0.66].map(f => { const off = (r() - 0.5) * Math.min(70, len * 0.25); return [x0 + dx * f - dy / len * off, y0 + dy * f + dx / len * off]; });
    return [[x0, y0], ...mid, [x1, y1]];
  }
  const segDist = (p, a, b) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], L = abx * abx + aby * aby || 1;
    const t = clamp(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L, 0, 1);
    return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby);
  };
  const polyDist = (p, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d; };

  // ---- scenery -----------------------------------------------------------------
  // Everything decorative on the map, placed once from the crag data. Each
  // area gets its own character: the lot, the schoolhouse foundation, the
  // millrace, the bald summit, the gully's ferns, the dam, the cellar holes
  // and stone walls, the hemlocks, the grout heaps and the Back Forty's field.
  function scenery(D) {
    const r = rand("granite-hollow-scenery");
    const sec = Object.fromEntries(D.sectors.map(s => [s.name, s]));
    const water = D.features.filter(f => f.kind === "water"), quarry = D.features.find(f => f.kind === "quarry");
    const pond = water.find(f => !f.dam_toward), reservoir = water.find(f => f.dam_toward);
    const trails = D.trails.map(trailControls);
    const xs = D.boulders.map(b => b.x), ys = D.boulders.map(b => b.y);
    const bounds = [Math.min(...xs) - 170, Math.max(...xs) + 170, -20, Math.max(...ys) + 170];
    const summit = sec["Hawkwatch"], field = sec["Back Forty"], gully = sec["Bracken Gully"];
    const fieldC = field && [field.x + 30, field.y + 60], fieldR = field ? field.radius + 70 : 0;

    const nearBoulder = (p, pad) => D.boulders.some(b => Math.hypot(p[0] - b.x, p[1] - b.y) < b.r + pad);
    const inWater = (p, pad = 0) => water.some(f => Math.hypot(p[0] - f.x, p[1] - f.y) < f.r * 1.2 + pad)
      || (quarry && Math.hypot(p[0] - quarry.x, p[1] - quarry.y) < quarry.r * 1.15 + pad);
    const nearTrail = (p, pad) => trails.some(t => polyDist(p, t) < pad);
    const nearestSector = p => D.sectors.reduce((a, s) => (Math.hypot(p[0] - s.x, p[1] - s.y) < Math.hypot(p[0] - a.x, p[1] - a.y) ? s : a));

    // Streams: brooks that feed Mill Pond from the gully and from the dam.
    const streams = [];
    const brook = (from, to, name) => {
      const rr = rand("brook" + name), pts = [from];
      for (let i = 1; i < 6; i++) {
        const f = i / 6, dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1, off = (rr() - .5) * 46;
        pts.push([from[0] + dx * f - dy / L * off, from[1] + dy * f + dx / L * off]);
      }
      pts.push(to);
      streams.push({ name, pts });
    };
    if (pond && reservoir) {
      const dir = [reservoir.dam_toward[0] - reservoir.x, reservoir.dam_toward[1] - reservoir.y], L = Math.hypot(...dir);
      const damPt = [reservoir.x + dir[0] / L * reservoir.r * 1.02, reservoir.y + dir[1] / L * reservoir.r * 1.02];
      const v = [damPt[0] - pond.x, damPt[1] - pond.y], vl = Math.hypot(...v);
      brook(damPt, [pond.x + v[0] / vl * pond.r * .9, pond.y + v[1] / vl * pond.r * .9], "Hollow Brook");
    }
    if (pond && gully) {
      const g = [gully.x + 20, gully.y - gully.radius - 10], v = [g[0] - pond.x, g[1] - pond.y], vl = Math.hypot(...v);
      brook(g, [pond.x + v[0] / vl * pond.r * .9, pond.y + v[1] / vl * pond.r * .9], "Fern Brook");
    }
    const nearStream = (p, pad) => streams.some(s => polyDist(p, s.pts) < pad);

    // Trees on a jittered grid, thinned in clearings and kept off rock, water and paths.
    const trees = [], step = 35;
    for (let y = bounds[2]; y < bounds[3]; y += step) for (let x = bounds[0]; x < bounds[1]; x += step) {
      const p = [x + (r() - .5) * step * .9, y + (r() - .5) * step * .9];
      if (p[1] < 26 || Math.hypot(p[0], p[1]) < 85) continue;                       // road, lot
      if (inWater(p, 6) || nearTrail(p, 13) || nearStream(p, 7) || nearBoulder(p, 7)) continue;
      if (summit && Math.hypot(p[0] - summit.x, p[1] - summit.y) < summit.radius * 1.05) continue;   // the bald summit
      if (fieldC && Math.hypot(p[0] - fieldC[0], p[1] - fieldC[1]) < fieldR) continue;               // the Back Forty field
      const s = nearestSector(p), ds = Math.hypot(p[0] - s.x, p[1] - s.y);
      if (ds < s.radius * 1.05 && r() < .85) continue;                                                // clearings among the boulders
      if (r() < .12) continue;
      let kind;
      const roll = r();
      if (s.name === "Hemlock Hollow" || s.name === "Bracken Gully") kind = roll < .72 ? "hemlock" : roll < .86 ? "birch" : "maple";
      else if (summit && Math.hypot(p[0] - summit.x, p[1] - summit.y) < summit.radius * 2.2) kind = roll < .55 ? "pine" : roll < .8 ? "oak" : "maple";
      else if (inWater(p, 60)) kind = roll < .4 ? "birch" : roll < .7 ? "maple" : roll < .85 ? "hemlock" : "oak";
      else kind = roll < .34 ? "maple" : roll < .62 ? "oak" : roll < .76 ? "birch" : roll < .88 ? "pine" : "hemlock";
      const ever = kind === "pine" || kind === "hemlock";
      trees.push({ x: +p[0].toFixed(1), y: +p[1].toFixed(1), kind, ever, v: Math.floor(r() * 3), s: +(ever ? 6.5 + r() * 3.5 : 5.8 + r() * 3.6).toFixed(1), shape: Math.floor(r() * 4) });
    }
    trees.sort((a, b) => b.y - a.y);   // draw back (north) to front (south)

    // Wildflowers in the open: the field, the summit's edge, clearings, the lot verge.
    const flowers = [];
    const sprinkle = (c, rad, n, avoidRock = true) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
        if (p[1] < 22 || inWater(p, 4) || nearTrail(p, 5) || (avoidRock && nearBoulder(p, 4))) continue;
        flowers.push({ x: +p[0].toFixed(1), y: +p[1].toFixed(1), c: Math.floor(r() * 4) });
      }
    };
    if (fieldC) sprinkle(fieldC, fieldR * .95, 70);
    if (summit) sprinkle([summit.x, summit.y], summit.radius * 1.15, 30);
    for (const s of D.sectors) sprinkle([s.x, s.y], s.radius * .9, 10);
    sprinkle([0, 70], 70, 18);

    // Ferns carpet the gully and the hemlocks.
    const ferns = [];
    for (const name of ["Bracken Gully", "Hemlock Hollow"]) {
      const s = sec[name]; if (!s) continue;
      for (let i = 0; i < 55; i++) {
        const a = r() * Math.PI * 2, d = s.radius * (.4 + r() * 1.1), p = [s.x + Math.cos(a) * d, s.y + Math.sin(a) * d];
        if (inWater(p, 4) || nearTrail(p, 6) || nearBoulder(p, 5) || nearStream(p, 4)) continue;
        ferns.push({ x: +p[0].toFixed(1), y: +p[1].toFixed(1), rot: Math.round((r() - .5) * 70), s: +(5 + r() * 3).toFixed(1) });
      }
    }

    // Landmarks, each tied to an area. Placed in the first free spot around it.
    const marks = [];
    const freeSpot = (c, d0, pad, tries = 40) => {
      for (let i = 0; i < tries; i++) {
        const a = r() * Math.PI * 2, d = d0 * (1 + i / 30), p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
        if (p[1] > 30 && !inWater(p, pad) && !nearTrail(p, pad) && !nearBoulder(p, pad) && !nearStream(p, pad)) return p;
      }
      return null;
    };
    const place = (name, kind, d0, pad, extra = {}) => {
      const s = sec[name]; if (!s) return;
      const p = freeSpot([s.x, s.y], s.radius * d0, pad);
      if (p) marks.push({ kind, x: +p[0].toFixed(1), y: +p[1].toFixed(1), rot: Math.round((r() - .5) * 30), ...extra });
    };
    // The lot (x -69..-15, y -18..4, west of The Billboard; see paint.js): a few cars in its
    // spaces, two rows of four, with the drive and the P sign down the middle.
    // Their own random stream, so the landmarks placed after them stay put.
    const rc = rand("lot-cars");
    // The spaces are the painted stalls, 6 m wide between lines at x -65, -59 … -17;
    // the north row from y -2 to 4 and the south row from y -18 to -12. Every car
    // faces north (up the map); the first is yours, nearest the trailhead
    // (PARK_SPOT in game.js is behind it).
    [[-20, -.6, 0], [-26, -.6, 0], [-50, -.6, 0], [-62, -.6, 0], [-20, -15.6, 0], [-26, -15.6, 0], [-56, -15.6, 0], [-62, -15.6, 0]]
      .forEach(([x, y, rot], i) => { if (rc() < .55 || i === 0) marks.push({ kind: "car", x, y, rot, c: Math.floor(rc() * 4) }); });
    for (let i = 0; i < 4; i++) if (r() < .8 || i === 0) r();   // the old cars' draws, so everything after them keeps its place
    place("The Schoolhouse", "foundation", .95, 16);
    place("Millrace Caves", "mill", .95, 14);
    place("The Cellar Holes", "cellar", .85, 12);
    place("The Cellar Holes", "cellar", 1.15, 12);
    place("The Grout Piles", "grout", 1.0, 8); place("The Grout Piles", "grout", 1.25, 8); place("The Grout Piles", "grout", .9, 8);
    place("Back Forty", "bales", 1.3, 10);
    if (summit) marks.push({ kind: "summit", x: summit.x, y: summit.y + summit.radius * .35, rot: 0, height: D.base_elevation_m + (D.hills[0] ? D.hills[0].amp : 0) });

    // Stone walls: old field boundaries wandering through the woods by the cellar holes and the farm.
    const walls = [];
    const wall = (c, ang, len, name) => {
      const rr = rand("wall" + name), pts = [];
      let x = c[0] - Math.cos(ang) * len / 2, y = c[1] - Math.sin(ang) * len / 2;
      for (let i = 0; i <= 8; i++) { pts.push([x, y]); const a = ang + (rr() - .5) * .35; x += Math.cos(a) * len / 8; y += Math.sin(a) * len / 8; }
      // Break the wall where it would cross a trail or a boulder.
      let run = [];
      for (const p of pts) {
        if (nearTrail(p, 10) || nearBoulder(p, 6) || inWater(p, 4)) { if (run.length > 1) walls.push(run); run = []; }
        else run.push(p.map(v => +v.toFixed(1)));
      }
      if (run.length > 1) walls.push(run);
    };
    const ch = sec["The Cellar Holes"];
    if (ch) { wall([ch.x - 20, ch.y + ch.radius + 25], .15, 230, "a"); wall([ch.x + ch.radius + 25, ch.y - 10], 1.5, 200, "b"); }
    if (fieldC) { wall([fieldC[0], fieldC[1] - fieldR], .05, fieldR * 1.6, "c"); wall([fieldC[0] - fieldR, fieldC[1]], 1.6, fieldR * 1.4, "d"); }

    return { trees, flowers, ferns, marks, walls, streams, field: fieldC && { x: fieldC[0], y: fieldC[1], r: fieldR },
      bald: summit && { x: summit.x, y: summit.y, r: summit.radius * 1.05 } };
  }

  const Art = { rand, mix, seasonAt, lightAt, dayOfYear, trailControls, scenery, NOON };
  if (typeof module !== "undefined") module.exports = Art; else root.Art = Art;
})(typeof window !== "undefined" ? window : globalThis);
