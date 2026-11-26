// Granite Hollow: the climbing scene (Phase 3, Stage 2). When you try a problem,
// the game opens a close-up of its boulder: the rock drawn by the map's own
// painter (paint.js boulderArt), the trees and plants that grow around it on the
// map, your climber and pad at the foot of the line, a card for the problem and
// one for you, a line of narration and a short menu. It looks like a little
// scene in the woods, in the season and light of the game's date and clock.
//
// This file only draws and animates. What happens (the rules, XP, what you
// know) is decided by whoever drives it, the game or the prototype page, which
// pass in the text for the cards (through knowledge.js, so nothing leaks) and
// call play() to show what happened.
//
//   const sc = Scene.create(hostElement, { onAction: key => ... });
//   sc.show({ park, bo, problem, line: { index, count }, seq, outfit, seen });
//   sc.setAtmosphere({ date, minute, dusk, sky });
//   sc.setCards({ prob: {...}, me: {...} }); sc.setMenu([...]); sc.say(text);
//   await sc.play("burn", { fallAt });   // "burn" | "work" | "rest" | "ready"
//   sc.destroy();
//
// Drawing units are the map's (the climber is 5 units tall, as on the map), in
// the map's convention: positions seen from above, things standing side-on.
// Performance: one small SVG of its own, a few hundred elements; only the
// climber's dozen paths change while animating.
(function (root) {
  const { Paint, Art } = root;
  const TAU = Math.PI * 2, clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t, lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f2 = v => Math.round(v * 100) / 100, P2 = p => f2(p[0]) + "," + f2(p[1]);
  const ell = (x, y, rx, ry) => `M${f2(x - rx)},${f2(y)}a${f2(rx)},${f2(ry)} 0 1,0 ${f2(2 * rx)},0a${f2(rx)},${f2(ry)} 0 1,0 ${f2(-2 * rx)},0`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // The sky by the clock (as the game's interface uses), greyer when it's overcast.
  const SKY = { "Morning": "#cfe0f1", "Midday": "#b9d6ee", "Afternoon": "#c4dbea", "Golden hour": "#f1cd88", "Dusk": "#c29fc3", "Night": "#46527f" };
  // The climber, in scene units: the map's figure (31 units tall) at the map's size (5).
  const BODY = { thigh: .78, shin: .74, upper: .8, fore: .78, torso: 2.0, half: .62, hip: .42, head: .72, neck: .22 };

  // A two-bone limb from a to target t: where the joint goes (bent to one side, dir ±1).
  function bend(a, t, l1, l2, dir) {
    let dx = t[0] - a[0], dy = t[1] - a[1], d = Math.hypot(dx, dy) || 1e-6;
    const max = (l1 + l2) * .999;
    if (d > max) { t = [a[0] + dx / d * max, a[1] + dy / d * max]; dx = t[0] - a[0]; dy = t[1] - a[1]; d = max; }
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)), ux = dx / d, uy = dy / d;
    return { j: [a[0] + ux * x - uy * h * dir, a[1] + uy * x + ux * h * dir], t };
  }

  function create(host, opts = {}) {
    const d3 = root.d3;
    host.innerHTML = `
      <div class="sc" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <div class="sc-stage">
          <svg class="sc-svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet"></svg>
          <section class="sc-card sc-prob" aria-label="The problem"></section>
          <section class="sc-card sc-me" aria-label="You"></section>
          <div class="sc-banner" aria-hidden="true"></div>
        </div>
        <div class="sc-foot">
          <p class="sc-say" aria-live="polite"></p>
          <div class="sc-menu" role="group" aria-label="What next"></div>
        </div>
      </div>`;
    const el = host.querySelector(".sc"), stage = el.querySelector(".sc-stage"), svgEl = el.querySelector(".sc-svg");
    const svg = d3.select(svgEl), cardP = el.querySelector(".sc-prob"), cardMe = el.querySelector(".sc-me");
    const sayEl = el.querySelector(".sc-say"), menuEl = el.querySelector(".sc-menu"), banner = el.querySelector(".sc-banner");
    const PRE = "sc-";
    let view = [0, 0, 10, 10], subject = null, geo = null, cur = null, outfit = {}, busy = false, ro = null;
    let fig = null;

    // ---- the picture -------------------------------------------------------------
    // spec: { park (illustrate.js parkScene), bo (one of park.boulders), problem
    // (its data: tags, sit, grade), line: { index, count } (which of the boulder's
    // lines, left to right), seq (Mech.sequence), outfit (paint.js colours), seen
    // (moves seen, for the chalk), known (per-move knowledge, for tick marks) }.
    // The map looks down on its boulders (FS: how much it foreshortens the ground);
    // the scene stands lower, so the same rock is drawn again from nearer eye level,
    // and positions on the ground are squeezed front to back (DZ) to match.
    const FS = .4, DZ = .42;
    function show(spec) {
      const { park, bo } = spec, R = bo.form.R;
      const F = root.Illu ? root.Illu.facetForm(bo.b, spec.probs || [], { ...bo.form, FS }) : bo.form;
      outfit = spec.outfit || {};
      svg.selectAll("*").remove();
      const defs = svg.append("defs");
      Paint.artDefs(defs, PRE);
      // Where the line goes: across the boulder's near side, by its place among the
      // boulder's lines, from the ground to the lip.
      const front = F.base.filter(p => p[1] > -R * .1).sort((a, b) => a[0] - b[0]);
      const xs = F.hull.map(p => p[0]), ys = F.hull.map(p => p[1]);
      const minX = Math.min(...front.map(p => p[0])), maxX = Math.max(...front.map(p => p[0]));
      const { index = 0, count = 1 } = spec.line || {};
      const x0 = lerp(minX, maxX, .2 + .6 * (count > 1 ? (index + .5) / count : .5));
      const baseAt = x => { let best = null; for (let i = 1; i < front.length; i++) { const a = front[i - 1], b = front[i]; if (x >= a[0] && x <= b[0]) { const t = (x - a[0]) / ((b[0] - a[0]) || 1); best = lerp(a[1], b[1], t); } } return best ?? Math.max(...front.map(p => p[1])); };
      const topAt = x => { let best = Infinity; const h = F.hull; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) { const y = lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); best = Math.min(best, y); } } return isFinite(best) ? best : Math.min(...ys); };
      const yb = baseAt(x0), yt = topAt(x0) + .25, n = spec.seq.n, sit = !!(spec.problem && spec.problem.sit);
      const trav = !!(spec.problem && /traverse/.test(spec.problem.tags || ""));
      const r = Art.rand("line" + bo.b.name + index);
      // Holds: the start at chest height (or low, for a sit start), the last at the lip.
      const start = yb - (sit ? 1.1 : 2.7), holds = [];
      for (let k = 0; k < n; k++) {
        let t = n === 1 ? 1 : k / (n - 1), x, y;
        if (trav && k < n - 2) { x = x0 - 2.6 + 5.2 * (k / Math.max(1, n - 3)); y = lerp(start, yt + 1.6, .25) + (r() - .5) * .5; }
        else if (trav) { x = x0 + 2.6 - (n - 1 - k) * .8; y = k === n - 1 ? yt : lerp(start, yt, .7); }
        else { x = x0 + (k % 2 ? .82 : -.82) + (r() - .5) * .45; y = lerp(start, yt, Math.pow(t, .95)); }   // left hand, right hand, up the line
        if (k === n - 1) { x = clamp(x, minX + .6, maxX - .6); y = topAt(x) + .25; }
        holds.push([x, y]);
      }
      const padY = yb + 1.05, padX = holds[0][0];
      geo = { x0, yb, yt, holds, padX, padY, sit, n, seq: spec.seq, topY: topAt(holds[n - 1][0]) };
      // What to frame: the boulder, a climber standing on top, the pad in front.
      const left = Math.min(...xs) - 2.5, right = Math.max(...xs) + 2.5;
      subject = [left, Math.min(...ys, geo.topY - 6.2) - 1.2, right, padY + 2.6];
      fitView();

      // Layers, back to front.
      const sky = svg.append("g").attr("class", "sc-skyL"), far = svg.append("g").attr("class", "sc-farL");
      const ground = svg.append("g").attr("class", "sc-groundL"), farTrees = svg.append("g").attr("class", "sc-farTrees");
      const mist = svg.append("g").attr("class", "sc-mistL"), behind = svg.append("g").attr("class", "sc-behind");
      const rock = svg.append("g").attr("class", "sc-rock"), holdL = svg.append("g").attr("class", "sc-holds");
      const padL = svg.append("g").attr("class", "sc-padL"), meL = svg.append("g").attr("class", "sc-me-fig");
      const before = svg.append("g").attr("class", "sc-before"), light = svg.append("g").attr("class", "sc-light");
      // Wide enough for any window shape.
      const W0 = subject[0] - 60, W1 = subject[2] + 60, H0 = subject[1] - 40, H1 = subject[3] + 30, skyline = Math.min(...ys) + (geo.yb - Math.min(...ys)) * .18;
      geo.skyline = skyline;
      sky.append("rect").attr("class", "sc-sky").attr("x", W0).attr("y", H0).attr("width", W1 - W0).attr("height", skyline - H0 + 4);
      // A few soft clouds, more when it's grey.
      const rc = Art.rand("clouds" + bo.b.name);
      sky.append("path").attr("class", "sc-cloud").attr("d", d3.range(5).map(() => { const x = lerp(subject[0], subject[2], rc()), y = lerp(H0 + 30, skyline - 2, rc()), w = 2 + rc() * 4; return ell(x, y, w, w * .32) + ell(x + w * .5, y - w * .18, w * .6, w * .3); }).join(""));
      // The far woods along the skyline: a dark band of pines, then the season's
      // crowns in front of it (bare, twiggy grey in winter).
      {
        const rf = Art.rand("far" + bo.b.name), base = skyline + 10;
        let d = `M${f2(W0)},${f2(base)}L${f2(W0)},${f2(skyline - .8)}`;
        for (let x = W0; x <= W1; x += .7 + rf() * .9) { const h = 1 + rf() * 1.8; d += `L${f2(x + .35)},${f2(skyline - .8 - h)}L${f2(x + .7)},${f2(skyline - .6)}`; }
        far.append("path").attr("class", "sc-far1").attr("d", d + `L${f2(W1)},${f2(base)}Z`);
        const slots = ["maple-0", "maple-1", "oak-0", "oak-1", "oak-2", "birch-1", "maple-2"], crowns = slots.map(() => ""), twigs = [];
        for (let x = W0; x <= W1; x += .9 + rf() * 1.1) {
          const r = .8 + rf() * 1.1, y = skyline - .2 + rf() * .9, k = Math.floor(rf() * slots.length);
          crowns[k] += ell(x, y - r * .6, r, r * .78);
          twigs.push(ell(x, y - r * .6, r * .9, r * .72));
        }
        far.append("path").attr("class", "sc-far-bare").attr("d", twigs.join(""));
        slots.forEach((sl, k) => { if (crowns[k]) far.append("path").attr("class", `sc-far-crown cs c-${sl}`).attr("d", crowns[k]); });
        far.append("path").attr("class", "sc-far2").attr("d", `M${f2(W0)},${f2(skyline + .4)}H${f2(W1)}V${f2(base)}H${f2(W0)}Z`);
      }
      ground.append("rect").attr("class", "sc-ground").attr("x", W0).attr("y", skyline).attr("width", W1 - W0).attr("height", H1 - skyline);
      ground.append("rect").attr("class", "sc-snowcover").attr("x", W0).attr("y", skyline).attr("width", W1 - W0).attr("height", H1 - skyline);
      // Leaf litter and moss, soft patches.
      const rp = Art.rand("patch" + bo.b.name);
      for (const cls of ["sc-litter0", "sc-litter1", "sc-moss"]) ground.append("path").attr("class", cls).attr("d", d3.range(36).map(() => { const x = lerp(W0 + 45, W1 - 45, rp()), y = lerp(skyline + 1, H1 - 4, rp()), w = .35 + rp() * 1.3; return ell(x, y, w, w * .32); }).join(""));
      mist.append("rect").attr("class", "sc-haze").attr("x", W0).attr("y", skyline - 20).attr("width", W1 - W0).attr("height", (geo.yb - skyline) * .75 + 20).attr("fill", `url(#${PRE}haze)`);
      const hz = defs.append("linearGradient").attr("id", PRE + "haze").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
      hz.append("stop").attr("offset", 0).attr("class", "sc-hz0"); hz.append("stop").attr("offset", 1).attr("class", "sc-hz1");

      // The trees and plants around this boulder on the map, where they stand.
      const bx = bo.b.x, by = bo.b.y, near = [];
      const halfW = (Math.max(...xs) - Math.min(...xs)) / 2;
      for (const t of park.trees || []) {
        const X = t.x - bx, Y = -(t.y - by) * DZ;
        if (X < subject[0] - 10 || X > subject[2] + 10 || Y < skyline - 2 || Y > subject[3] + 6) continue;
        if (Y < -R * FS * 1.2 && Y > skyline + 4 && Math.abs(X) < halfW * .55 && Art.rand("gap" + t.x)() < .5) continue;   // a gap or two behind the rock
        near.push({ ...t, x: X, y: -Y, _Y: Y });
      }
      near.sort((a, b) => a._Y - b._Y);
      for (const t of near) {
        const inFront = t._Y > R * FS * .9, clear = Math.abs(t.x) > halfW + 2.5;
        if (inFront && !clear) continue;                    // never between you and the rock
        const far = t._Y < skyline + (geo.yb - skyline) * .45;
        Paint.drawTree(inFront ? before : far ? farTrees : behind, t, far ? .85 : 1, "sc-tree");
      }
      // The understory from the map's tiles around it: ferns, shrubs, rubble.
      if (park.detail) {
        const T = (root.Illu && root.Illu.TILE) || 90, tiles = new Set();
        for (const dx of [subject[0] - 10, 0, subject[2] + 10]) for (const dy of [-30, 0, 15]) tiles.add([Math.floor((bx + dx - park.bounds[0]) / T), Math.floor((by + dy - park.bounds[2]) / T)].join(","));
        const ferns = [], shrubs = [];
        for (const k of tiles) {
          const [tx, ty] = k.split(",").map(Number), det = park.detail(tx, ty);
          if (!det) continue;
          for (const f of det.ferns || []) ferns.push({ ...f, x: f.x - bx, y: (f.y - by) * DZ });
          for (const s of det.shrubs || []) shrubs.push({ ...s, x: s.x - bx, y: (s.y - by) * DZ });
        }
        const inWin = p => p.x > subject[0] - 4 && p.x < subject[2] + 4 && -p.y > skyline + 1 && -p.y < subject[3] + 3 && !(Math.abs(p.x - x0) < 3 && -p.y > yb - 1);
        const fernsIn = ferns.filter(inWin);
        if (fernsIn.length) ground.append("path").attr("class", "fern").attr("d", fernsIn.map((f, i) => Paint.bake(Paint.fernGlyph(i % 3), f.x, -f.y, f.s, i % 2 === 0, 2)).join(""));
        for (const kind of ["blueberry", "laurel"]) {
          const list = shrubs.filter(b => b.kind === kind && inWin(b)); if (!list.length) continue;
          const g = ground.append("g").attr("class", "cs sb-" + kind);
          for (const layer of ["dark", "mid", "hlE", "hlW", "snow"]) g.append("path").attr("class", "L-" + layer).attr("d", list.map(b => Paint.bake(Paint.shrubGlyph(kind, b.v)[layer], b.x, -b.y, b.s, b.v === 1, 2)).join(""));
        }
      }
      // Grass tufts and a few flowers near the foot of the rock.
      const rg = Art.rand("grass" + bo.b.name);
      ground.append("path").attr("class", "grass").attr("d", d3.range(70).map(() => { const x = lerp(subject[0] - 4, subject[2] + 4, rg()), y = lerp(yb - 1, subject[3] + 2, rg()); if (Math.abs(x - x0) < 2.6 && y < padY + 1.4) return ""; return `M${f2(x)},${f2(y)}l${f2(-.12)},${f2(-.42)}M${f2(x + .08)},${f2(y)}l${f2(.04)},${f2(-.5)}M${f2(x + .16)},${f2(y)}l${f2(.16)},${f2(-.38)}`; }).join(""));
      for (let i = 0; i < 4; i++) ground.append("path").attr("class", `fl fl${i}`).attr("d", d3.range(5).map(() => { const x = lerp(subject[0], subject[2], rg()), y = lerp(yb, subject[3] + 1, rg()); return Math.abs(x - x0) < 3 ? "" : ell(x, y, .14, .1); }).join(""));

      // The rock itself, as the map draws it.
      Paint.boulderArt(rock.append("g").attr("class", `boulder k-${F.kind}`), F, { defs, id: "scene", seed: bo.b.name, pre: PRE });

      // The holds on the line: a small feature each, chalked once you've been there.
      geo.holdL = holdL;
      drawHolds(spec.seen || 0, spec.known || []);

      // Your pad, at the foot of the line.
      const pw = 2.7, pd = 1.5, th = .42, px = padX, py = padY;
      const q = [[px - pw / 2 - .25, py - pd / 2], [px + pw / 2 - .25, py - pd / 2], [px + pw / 2 + .25, py + pd / 2], [px - pw / 2 + .25, py + pd / 2]].map(p => [p[0], p[1] * 1]);
      const top = q.map(p => [p[0], p[1] - th]);
      padL.append("path").attr("class", "sc-pad-shadow").attr("d", ell(px, py + pd / 2 + .05, pw * .62, .32));
      padL.append("path").attr("class", "sc-pad-side").attr("fill", outfit.pad || "#2f6b8f").attr("d", `M${P2(q[3])}L${P2(q[2])}L${P2(top[2])}L${P2(top[3])}Z`);
      padL.append("path").attr("class", "sc-pad-top").attr("fill", outfit.pad || "#2f6b8f").attr("d", `M${top.map(P2).join("L")}Z`);
      padL.append("path").attr("class", "sc-pad-seam").attr("d", `M${P2(lerp2(top[0], top[1], .5))}L${P2(lerp2(top[3], top[2], .5))}`);
      geo.padTop = py - th - .05;

      // The light of the hour over everything.
      for (const cls of ["tint", "veil"]) light.append("rect").attr("class", cls).attr("x", W0).attr("y", H0).attr("width", W1 - W0).attr("height", H1 - H0);

      // You, ready at the foot of the line.
      fig = makeFigure(meL);
      cur = poses.ready();
      render(cur);
    }
    function drawHolds(seen, known) {
      if (!geo) return;
      const L = geo.holdL; L.selectAll("*").remove();
      const shapes = {
        crimp: (x, y) => `M${f2(x - .32)},${f2(y)}h${f2(.64)}v${f2(.07)}h${f2(-.64)}Z`,
        edge: (x, y) => `M${f2(x - .4)},${f2(y)}l${f2(.8)},${f2(-.04)}l${f2(-.05)},${f2(.12)}l${f2(-.72)},${f2(.03)}Z`,
        ledge: (x, y) => `M${f2(x - .7)},${f2(y)}l${f2(1.4)},${f2(-.05)}l${f2(-.08)},${f2(.16)}l${f2(-1.25)},${f2(.04)}Z`,
        jug: (x, y) => `M${f2(x - .3)},${f2(y - .05)}q${f2(.3)},${f2(.4)} ${f2(.6)},0q${f2(-.3)},${f2(.16)} ${f2(-.6)},0Z`,
        sloper: (x, y) => `M${f2(x - .42)},${f2(y + .1)}q${f2(.42)},${f2(-.52)} ${f2(.84)},0Z`,
        pinch: (x, y) => `M${f2(x - .06)},${f2(y - .34)}l${f2(.14)},${f2(.02)}l${f2(.02)},${f2(.62)}l${f2(-.16)},${f2(.02)}Z`,
        sidepull: (x, y) => `M${f2(x)},${f2(y - .32)}l${f2(.09)},${f2(.04)}l${f2(-.03)},${f2(.58)}l${f2(-.08)},${f2(-.02)}Z`,
        undercling: (x, y) => `M${f2(x - .34)},${f2(y)}q${f2(.34)},${f2(-.34)} ${f2(.68)},0q${f2(-.34)},${f2(-.14)} ${f2(-.68)},0Z`,
        squeeze: (x, y) => `M${f2(x - .7)},${f2(y - .3)}l${f2(.12)},${f2(.02)}l${f2(.02)},${f2(.6)}l${f2(-.14)},${f2(0)}ZM${f2(x + .6)},${f2(y - .3)}l${f2(.12)},${f2(.02)}l${f2(.02)},${f2(.6)}l${f2(-.14)},${f2(0)}Z`,
        lip: (x, y) => `M${f2(x - .5)},${f2(y)}h${f2(1)}`,
        smear: () => "",
      };
      geo.holds.forEach((h, k) => {
        const m = geo.seq.moves[k], [x, y] = h, s = shapes[m.hold] || shapes.edge, been = k < seen;
        const g = L.append("g").attr("transform", `translate(${P2(h)}) scale(1.7) translate(${f2(-x)},${f2(-y)})`);
        g.append("path").attr("class", "sc-chalk" + (been ? " been" : "")).attr("d", ell(x, y - .04, .36, .18));
        g.append("path").attr("class", "sc-hold").attr("d", s(x, y));
        // A tick mark under a crux you know fairly well, as climbers chalk them.
        if (been && m.kind === "crux" && (known[k] || 0) >= .34) L.append("path").attr("class", "sc-tick").attr("d", `M${f2(x - .25)},${f2(y + .45)}h${f2(.5)}`);
      });
    }

    // ---- framing -------------------------------------------------------------------
    // The subject (boulder, a climber on top, the pad) always fits; whatever's spare
    // in the window's shape goes to the woods around it, mostly above.
    function fitView() {
      if (!subject) return;
      const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight), want = w / h;
      let [x0, y0, x1, y1] = subject, sw = x1 - x0, sh = y1 - y0;
      // Room for the cards: a bit more around the subject on wide windows.
      if (want > 1.2) { sw *= 1.18; } else { sh *= 1.12; }
      let vw = sw, vh = sh;
      if (vw / vh < want) vw = vh * want; else vh = vw / want;
      const cx = (x0 + x1) / 2, bottom = y1 + (vh - (y1 - y0)) * .15;
      view = [cx - vw / 2, bottom - vh, vw, vh];
      svg.attr("viewBox", view.map(f2).join(" "));
    }
    if (root.ResizeObserver) { ro = new ResizeObserver(() => fitView()); ro.observe(stage); }

    // ---- the climber -----------------------------------------------------------------
    function makeFigure(L) {
      const o = outfit, ink = "#2b2620";
      const sleeve = o.jacket || (o.longSleeves ? o.shirt : o.skin || "#e6bf98"), top = o.jacket || o.shirt || "#c2553a";
      const g = L.append("g").attr("class", "sc-climber");
      const shadow = g.append("path").attr("class", "sc-me-shadow");
      const leg = [0, 1].map(() => ({ up: g.append("path").attr("class", "sc-limb leg").attr("stroke", o.pants || "#3f4f63"),
        low: g.append("path").attr("class", "sc-limb leg").attr("stroke", o.shorts ? o.skin || "#e6bf98" : o.pants || "#3f4f63"),
        shoe: g.append("path").attr("class", "sc-shoe") }));
      const torso = g.append("g");
      torso.append("rect").attr("class", "sc-torso").attr("x", -.78).attr("y", -2.02).attr("width", 1.55).attr("height", 2.02).attr("rx", .5).attr("fill", top).attr("stroke", ink);
      if (o.stripes && !o.jacket) torso.append("path").attr("class", "sc-stripes").attr("stroke", o.stripes).attr("d", "M-.78,-1.5h1.55M-.78,-1.02h1.55M-.78,-.54h1.55");
      if (o.scarf) torso.append("path").attr("fill", o.scarf).attr("stroke", ink).attr("stroke-width", .1).attr("d", "M-.6,-2h1.2v.38h-1.2z");
      torso.append("path").attr("class", "sc-chalkbag").attr("fill", o.chalk || "#d0a23a").attr("d", "M.25,-.2h.5v.42q0,.16-.16,.16h-.18q-.16,0-.16,-.16z");
      const arm = [0, 1].map(() => ({ up: g.append("path").attr("class", "sc-limb arm").attr("stroke", sleeve), low: g.append("path").attr("class", "sc-limb arm").attr("stroke", sleeve),
        hand: g.append("circle").attr("class", "sc-hand").attr("r", .16).attr("fill", o.skin || "#e6bf98") }));
      const headG = g.append("g");
      headG.append("circle").attr("class", "sc-head").attr("r", BODY.head).attr("fill", o.hair || "#4a3426").attr("stroke", ink);
      const hatC = o.hatC || (o.hat === "cap" ? "#2f6b4f" : "#b5462e");
      if (o.hat === "beanie") { headG.append("path").attr("fill", hatC).attr("stroke", ink).attr("stroke-width", .12).attr("d", "M-.74,.05a.74,.82 0 0 1 1.48,0z"); headG.append("circle").attr("fill", hatC).attr("stroke", ink).attr("stroke-width", .1).attr("cy", -.9).attr("r", .22); }
      else if (o.hat === "cap") headG.append("path").attr("fill", hatC).attr("stroke", ink).attr("stroke-width", .12).attr("d", "M-.72,-.05a.72,.74 0 0 1 1.44,0z");
      else if (o.hat === "headband") headG.append("path").attr("fill", "none").attr("stroke", hatC).attr("stroke-width", .26).attr("d", "M-.7,-.22h1.4");
      else if (o.hat === "bucket") headG.append("path").attr("fill", hatC).attr("stroke", ink).attr("stroke-width", .12).attr("d", "M-.6,-.15Q-.55,-.85 0,-.86Q.55,-.85 .6,-.15ZM-1,-.12Q0,.2 1,-.12Q0,-.32 -1,-.12Z");
      return { g, shadow, leg, arm, torso, headG };
    }
    // Draw a pose: { hip, sh (shoulders' centre), hand: [l, r], foot: [l, r], ground (y of the
    // ground under you, or null on the wall) }.
    function render(p) {
      if (!fig) return;
      const ax = [p.sh[0] - p.hip[0], p.sh[1] - p.hip[1]], L = Math.hypot(...ax) || 1, u = [ax[0] / L, ax[1] / L], n = [-u[1], u[0]];
      const ang = Math.atan2(u[1], u[0]) * 180 / Math.PI + 90;
      fig.torso.attr("transform", `translate(${P2(p.hip)}) rotate(${f2(ang)}) scale(1,${f2(L / BODY.torso)})`);
      const head = [p.sh[0] + u[0] * (BODY.neck + BODY.head), p.sh[1] + u[1] * (BODY.neck + BODY.head)];
      fig.headG.attr("transform", `translate(${P2(head)}) rotate(${f2(ang)})`);
      [-1, 1].forEach((s, i) => {
        const shP = [p.sh[0] + n[0] * BODY.half * s - u[0] * .12, p.sh[1] + n[1] * BODY.half * s - u[1] * .12];
        const hipP = [p.hip[0] + n[0] * BODY.hip * s, p.hip[1] + n[1] * BODY.hip * s];
        // Elbows out when reaching up, knees out (frog-legged) unless lying down.
        const a = bend(shP, p.hand[i], BODY.upper, BODY.fore, p.hand[i][1] < shP[1] ? s : -s), l = bend(hipP, p.foot[i], BODY.thigh, BODY.shin, p.kneesIn ? s : -s);
        fig.arm[i].up.attr("d", `M${P2(shP)}L${P2(a.j)}`); fig.arm[i].low.attr("d", `M${P2(a.j)}L${P2(a.t)}`); fig.arm[i].hand.attr("cx", f2(a.t[0])).attr("cy", f2(a.t[1]));
        fig.leg[i].up.attr("d", `M${P2(hipP)}L${P2(l.j)}`); fig.leg[i].low.attr("d", `M${P2(l.j)}L${P2(l.t)}`);
        fig.leg[i].shoe.attr("d", `M${P2(l.t)}l${f2(.22 * s)},${f2(.02)}`);
      });
      const gy = p.ground;
      fig.shadow.attr("d", gy != null ? ell((p.foot[0][0] + p.foot[1][0]) / 2, gy + .05, 1, .26) : "");
    }
    // Poses, from the line's geometry.
    const handAt = k => geo.holds[clamp(k, 0, geo.n - 1)];
    const poses = {
      ready() {
        const x = geo.padX + .1, y = geo.padTop;
        return { hip: [x, y - 1.5], sh: [x, y - 3.5], hand: [[x - .85, y - 1.75], [x + .55, y - 1.35]], foot: [[x - .36, y], [x + .36, y]], ground: y };
      },
      chalk() {
        const p = poses.ready(); p.hand = [[p.hip[0] + .3, p.hip[1] + .05], [p.hip[0] + .55, p.hip[1] - .05]]; return p;
      },
      // Hands on move k's hold and the one before; feet on the rock below, or the ground.
      on(k) {
        const a = handAt(k), b = handAt(k - 1 < 0 ? 0 : k - 1), hc = mid(a, b);
        const right = a[0] >= b[0];
        const hands = right ? [b, a] : [a, b];
        // Hanging nearly straight-armed below the holds, hips in, feet high on the rock.
        const sh = [hc[0] + (a[0] - b[0]) * .12, hc[1] + 1.4], hip = [sh[0] + .12, sh[1] + BODY.torso * .97];
        const groundY = geo.padTop;
        const fy = Math.min(groundY, hip[1] + 1.05 + (k % 2) * .25), fy2 = Math.min(groundY, hip[1] + 1.3 - (k % 2) * .25);
        const p = { hip, sh, hand: hands, foot: [[hip[0] - .7, fy], [hip[0] + .62, fy2]], ground: Math.max(fy, fy2) >= groundY - .01 ? groundY : null };
        if (geo.sit && k === 0) { p.hip = [hc[0], groundY - .5]; p.sh = [hc[0] - .2, groundY - 2.3]; p.foot = [[hc[0] - .8, groundY - .1], [hc[0] + .8, groundY]]; p.ground = groundY; }
        return p;
      },
      top() {
        const h = geo.holds[geo.n - 1], x = h[0], y = geo.topY - .1;
        return { hip: [x, y - 1.5], sh: [x, y - 3.5], hand: [[x - 1.25, y - 5.05], [x + 1.25, y - 5.05]], foot: [[x - .4, y], [x + .4, y]], ground: y };
      },
      topRide() { const h = geo.holds[geo.n - 1]; return { hip: [h[0], h[1] - .3], sh: [h[0] - .2, h[1] - 2.1], hand: [[h[0] - 1.2, h[1] - .6], [h[0] + .9, h[1] - .5]], foot: [[h[0] - .6, h[1] + 1], [h[0] + .9, h[1] - .1]], ground: null }; },
      air(from) {
        const y = lerp(from.hip[1], geo.padTop - 1.5, .55);
        return { hip: [from.hip[0] + .3, y], sh: [from.hip[0] + .15, y - 1.9], hand: [[from.hip[0] - .8, y - 2.9], [from.hip[0] + 1.1, y - 2.7]], foot: [[from.hip[0] - .4, y + 1.4], [from.hip[0] + .7, y + 1.3]], ground: geo.padTop };
      },
      landed() {
        const x = geo.padX, y = geo.padTop;
        return { hip: [x + .4, y - .45], sh: [x - 1.5, y - .9], hand: [[x - 2.3, y - .3], [x - .6, y - .2]], foot: [[x + 1.8, y - .15], [x + 1.5, y + .05]], ground: y, kneesIn: true };
      },
      sit() {
        const x = geo.padX, y = geo.padTop;
        return { hip: [x, y - .45], sh: [x - .05, y - 2.4], hand: [[x - .7, y - .95], [x + .72, y - .9]], foot: [[x - .95, y + .45], [x + .95, y + .45]], ground: y + .45 };
      },
    };
    // Tween between poses: every joint moves in a straight line, eased.
    const EASE = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t, inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, lin: t => t };
    const mixPose = (a, b, t) => ({ hip: lerp2(a.hip, b.hip, t), sh: lerp2(a.sh, b.sh, t), hand: [lerp2(a.hand[0], b.hand[0], t), lerp2(a.hand[1], b.hand[1], t)],
      foot: [lerp2(a.foot[0], b.foot[0], t), lerp2(a.foot[1], b.foot[1], t)], ground: t < .5 ? a.ground : b.ground, kneesIn: t < .5 ? a.kneesIn : b.kneesIn });
    function tween(to, ms, ease = EASE.inOut) {
      const from = cur;
      if (reduceMotion() || ms <= 0) { cur = to; render(cur); return Promise.resolve(); }
      return new Promise(done => {
        const t0 = performance.now();
        const step = now => {
          const t = clamp((now - t0) / ms, 0, 1);
          render(mixPose(from, to, ease(t)));
          if (t < 1) requestAnimationFrame(step); else { cur = to; done(); }
        };
        requestAnimationFrame(step);
      });
    }
    const wait = ms => (reduceMotion() ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));

    // ---- what happened, shown ---------------------------------------------------------
    // burn: { fallAt } (-1: sent). work: { at, stuck }. rest, ready.
    async function play(kind, data = {}) {
      if (!geo) return;
      busy = true; el.classList.add("busy");
      try {
        if (kind === "burn") {
          await tween(poses.chalk(), 260); await tween(poses.ready(), 220);
          const last = data.fallAt < 0 ? geo.n - 1 : data.fallAt;
          for (let k = 0; k <= last; k++) {
            const fall = k === data.fallAt;
            await tween(poses.on(k), k === 0 ? 420 : fall ? 520 : 330 + (geo.seq.moves[k].kind === "crux" ? 260 : 0), EASE.inOut);
            if (fall) { await wait(260); await tumble(); break; }
          }
          if (data.fallAt < 0) { await tween(poses.topRide(), 420); await tween(poses.top(), 520, EASE.out); }
        } else if (kind === "work") {
          const k = data.at;
          await tween(k > 0 ? poses.on(k - 1) : poses.ready(), 420);
          await tween(poses.on(k), 560);
          if (data.stuck) { await wait(500); await tween(poses.ready(), 520, EASE.inOut); }
          else { await wait(220); await tumble(); }
        } else if (kind === "rest") {
          await tween(poses.ready(), 0);             // instant: you can rest several times in a row
        } else await tween(poses.ready(), 400);
      } finally { busy = false; el.classList.remove("busy"); }
    }
    async function tumble() {
      await tween(poses.air(cur), 260, EASE.in);
      await tween(poses.landed(), 220, EASE.in);
      el.classList.add("thud"); setTimeout(() => el.classList.remove("thud"), 260);
      await wait(520);
      await tween(poses.ready(), 600, EASE.inOut);
    }

    // ---- cards, words, menu -------------------------------------------------------------
    // prob: { name, grade (text or null), tags: [..], strip (HTML from the game's
    // moveStrip, trusted), hp, beta, feel }. me: { name, level, energy, skin, clock,
    // light, note }.
    function setCards({ prob, me } = {}) {
      if (prob) cardP.innerHTML = `
        <div class="sc-row"><h2 id="sc-title">${esc(prob.name)}</h2>${prob.grade ? `<span class="sc-grade">${esc(prob.grade)}</span>` : `<span class="sc-grade open" title="Nobody has climbed it, so nobody knows its grade">?</span>`}</div>
        ${prob.where ? `<div class="sc-where">${esc(prob.where)}</div>` : ""}
        <div class="sc-tags">${(prob.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}</div>
        ${prob.strip ? `<div class="sc-strip">${prob.strip}</div>` : ""}
        <div class="sc-sub">${esc(prob.hp || "")}${prob.feel ? ` · <b>${esc(prob.feel)}</b>` : ""}</div>
        ${prob.beta ? `<div class="sc-sub">${esc(prob.beta)}</div>` : ""}`;
      if (me) cardMe.innerHTML = `
        <div class="sc-row"><b class="sc-name">${esc(me.name)}</b>${me.level != null ? `<span class="sc-lv">V${esc(me.level)}</span>` : ""}</div>
        <div class="sc-bar"><span>Energy</span><i class="sc-meter en"><i style="width:${clamp(me.energy, 0, 100).toFixed(0)}%"></i></i><span class="n">${Math.round(me.energy)}</span></div>
        <div class="sc-bar"><span>Skin</span><i class="sc-meter sk"><i style="width:${clamp(me.skin, 0, 100).toFixed(0)}%"></i></i><span class="n">${Math.round(me.skin)}</span></div>
        <div class="sc-sub">${esc(me.clock || "")}${me.light ? ` · ${esc(me.light)}` : ""}</div>
        ${me.note ? `<div class="sc-sub">${esc(me.note)}</div>` : ""}`;
    }
    function say(text) { sayEl.textContent = text || ""; sayEl.classList.remove("in"); void sayEl.offsetWidth; sayEl.classList.add("in"); }
    // items: [{ key, label, sub, disabled, primary }], or a sub-menu with a "back" item.
    function setMenu(items) {
      menuEl.innerHTML = items.map(it => `<button type="button" class="sc-act${it.primary ? " primary" : ""}${it.wide ? " wide" : ""}" data-act="${esc(it.key)}" ${it.disabled ? "disabled" : ""}>
        <span class="l">${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ""}</button>`).join("");
      menuEl.classList.toggle("many", items.length > 4);
      menuEl.querySelectorAll("[data-act]").forEach(b => { b.onclick = () => { if (!busy && opts.onAction) opts.onAction(b.dataset.act); }; });
      const first = menuEl.querySelector("button:not([disabled])"); if (first && el.contains(document.activeElement) === false) first.focus({ preventScroll: true });
    }
    function focusMenu() { const first = menuEl.querySelector("button:not([disabled])"); if (first) first.focus({ preventScroll: true }); }
    function flash(text, kind = "") {
      banner.textContent = text; banner.className = "sc-banner on " + kind;
      setTimeout(() => { banner.className = "sc-banner"; }, reduceMotion() ? 1600 : 2200);
    }
    // The season and the hour, written on the scene itself (as the map does on its wrapper).
    function setAtmosphere({ date, minute, dusk, sky = "Sunny", over = false }) {
      const st = el.style;
      const { vars: dv, P } = Paint.dateVars(date);
      for (const [k, x] of Object.entries(dv)) st.setProperty(k, typeof x === "number" ? x.toFixed(3) : x);
      const { vars: tv, L } = Paint.timeVars(minute, dusk, sky, over);
      for (const [k, x] of Object.entries(tv)) st.setProperty(k, x);
      const grey = /overcast|rain|snow|humid/i.test(sky);
      let skyC = SKY[L.phase] || SKY.Midday;
      if (grey) skyC = Art.mix(skyC, "#c9cdd0", .6);
      if (P.snow > .3) skyC = Art.mix(skyC, "#e4e9ee", .35);
      st.setProperty("--sc-sky", skyC);
      st.setProperty("--sc-cloud", grey ? .75 : .38);
      el.dataset.season = P.key; el.dataset.phase = L.phase.toLowerCase().replace(/\s+/g, "-");
      return { P, L };
    }
    el.addEventListener("keydown", e => { if (e.key === "Escape" && opts.onAction && !busy) { e.preventDefault(); opts.onAction("leave"); } });
    function destroy() { if (ro) ro.disconnect(); host.innerHTML = ""; }
    return { show, setCards, setMenu, say, play, flash, setAtmosphere, setSeen: drawHolds, focusMenu, destroy, fit: fitView, busy: () => busy, el, geo: () => geo,
      poses: () => poses, __render: p => { cur = p; render(p); } };     // poses and __render: for the prototype's pose checks
  }

  root.Scene = { create };
})(window);
