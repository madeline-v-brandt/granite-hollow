// Granite Hollow: the paper park map (Phase 2, Stage 2). The trailhead map you
// keep folded in your pocket, opened over the game with M or the Map button:
// trails, water, the road and the lot, contours, a few landmarks, and the
// climbing areas you know about. No boulders: those are for the world view.
// Picking an area (or any spot) moves the world's camera there; it never moves
// you or costs time.
//
//   const map = Paper.make(D, scene, hostEl);
//   map.open({ areas, me, view, onPick, onClose });   map.close();   map.isOpen()
//     areas  the climbing areas to mark: [{ name, state: 1 known | 2 visited, sub }]
//     me     where you are [x, y]; view: the world view's box [x0, y0, x1, y1]
//     onPick({ x, y, sector })   called when an area or a spot is picked
//
// It's drawn once, the first time it opens (a static SVG, so it costs nothing
// while closed), with only the areas, "you are here" and the view box redrawn
// on each opening. Coordinates are the game's: metres, x east, y north. The
// paper keeps its own colours in both themes, like the world map.
(function (root) {
  "use strict";
  const d3 = root.d3;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toString();

  // A few landmarks worth printing on a park map, by kind (first of each kind only).
  const LANDMARKS = {
    kiosk: "Trailhead kiosk", counters: "Hawk watch", foundation: "Schoolhouse foundation", mill: "Old mill (burned 1891)",
    cellar: "Cellar holes", well: null, derrick: "Old derrick", powderhouse: "Powder house", tractor: "Old farm",
    gauge: "Flood gauge",
  };

  function make(D, S, host) {
    // ---- the sheet's frame: the park's bounds, scaled to a design size in pixels
    const xs = [...D.boulders.map(b => b.x), ...D.features.flatMap(f => [f.x - f.r, f.x + f.r])];
    const ys = [...D.boulders.map(b => b.y), ...D.features.flatMap(f => [f.y - f.r, f.y + f.r]), -45];
    const X0 = Math.min(...xs) - 80, X1 = Math.max(...xs) + 80, Y0 = Math.min(...ys) - 40, Y1 = Math.max(...ys) + 70;
    const SC = 0.6, PAD = 26;                                           // px per metre; margin inside the frame
    const MW = (X1 - X0) * SC + PAD * 2, MH = (Y1 - Y0) * SC + PAD * 2;
    const px = (x, y) => [PAD + (x - X0) * SC, PAD + (Y1 - y) * SC];
    const toWorld = (u, v) => [X0 + (u - PAD) / SC, Y1 - (v - PAD) / SC];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wob = (pts, a = .7) => pts.map(([x, y]) => [x + (rnd() - .5) * a, y + (rnd() - .5) * a]);
    const lineD = d3.line().curve(d3.curveCatmullRom.alpha(.5));
    const ringD = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
    const P = pts => pts.map(p => px(p[0], p[1]));

    let built = false, isOpen = false, state = null, lastFocus = null;
    host.innerHTML = "";
    host.style.setProperty("--paper-ratio", (MW / MH).toFixed(4));
    const back = d3.select(host).append("div").attr("class", "paper-back").attr("hidden", true);
    const sheet = back.append("div").attr("class", "paper-sheet").attr("role", "dialog").attr("aria-modal", "true").attr("aria-label", "Granite Hollow State Park trail map");
    const mapBox = sheet.append("div").attr("class", "paper-map");
    const side = sheet.append("div").attr("class", "paper-side");
    const svg = mapBox.append("svg").attr("viewBox", `0 0 ${f1(MW)} ${f1(MH)}`).attr("class", "paper-svg");

    function build() {
      built = true;
      const defs = svg.append("defs");
      const grain = defs.append("filter").attr("id", "pp-grain").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
      grain.append("feTurbulence").attr("type", "fractalNoise").attr("baseFrequency", .9).attr("numOctaves", 2).attr("seed", 4);
      grain.append("feColorMatrix").attr("values", "0 0 0 0 .45  0 0 0 0 .37  0 0 0 0 .25  0 0 0 .09 0");
      const hatch = defs.append("pattern").attr("id", "pp-field").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(35)");
      hatch.append("path").attr("d", "M0,3H6").attr("stroke", "#c9b77e").attr("stroke-width", .9);
      const climb = defs.append("pattern").attr("id", "pp-climb").attr("width", 7).attr("height", 7).attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(-40)");
      climb.append("path").attr("d", "M0,3.5H7").attr("stroke", "#b5462e").attr("stroke-width", 1.1).attr("stroke-opacity", .45);

      const g = svg.append("g").attr("class", "pp-base");
      g.append("rect").attr("width", MW).attr("height", MH).attr("fill", "#f3e9cf");
      // The park: a forest wash inside a dash-dot boundary.
      const bx0 = PAD + 8, by0 = PAD + 8, bx1 = MW - PAD - 8, by1 = MH - PAD - 8;
      const edge = []; const per = 60;
      for (let i = 0; i < per; i++) { const t = i / per; edge.push([bx0 + (bx1 - bx0) * t, by0]); }
      for (let i = 0; i < per; i++) { const t = i / per; edge.push([bx1, by0 + (by1 - by0) * t]); }
      for (let i = 0; i < per; i++) { const t = i / per; edge.push([bx1 - (bx1 - bx0) * t, by1]); }
      for (let i = 0; i < per; i++) { const t = i / per; edge.push([bx0, by1 - (by1 - by0) * t]); }
      const edgeD = ringD(wob(edge, 2.2));
      g.append("path").attr("d", edgeD).attr("fill", "#dfe4c3");
      // Contours from the hills: thin brown, every fourth a little heavier.
      const step = 10, nx = Math.ceil((X1 - X0) / step) + 1, ny = Math.ceil((Y1 - Y0) / step) + 1, vals = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[j * nx + i] = S.elevAt(X0 + i * step, Y0 + j * step);
      const th = d3.range(60, 112, 4);
      for (const c of d3.contours().size([nx, ny]).thresholds(th)(vals)) {
        const heavy = (c.value - 60) % 16 === 0;
        const d = c.coordinates.flatMap(poly => poly.map(ring => ringD(ring.map(([i, j]) => px(X0 + i * step, Y0 + j * step))))).join("");
        if (d) g.append("path").attr("d", d).attr("fill", "none").attr("stroke", "#a8916a").attr("stroke-width", heavy ? .9 : .5).attr("stroke-opacity", heavy ? .55 : .4);
      }
      // Open ground: clearings, the bald, the field (hatched), the grout heaps.
      const zone = k => S.zones.filter(z => z.kind === k && z.ring);
      g.append("path").attr("d", [...zone("clearing"), ...zone("bald")].map(z => ringD(wob(P(z.ring(1, 48)), 1.2))).join("")).attr("fill", "#efe6c6").attr("stroke", "#c8b98f").attr("stroke-width", .6).attr("stroke-dasharray", "1.5 2.5");
      for (const z of zone("field")) { const d = ringD(wob(P(z.ring(1, 48)), 1.2)); g.append("path").attr("d", d).attr("fill", "#eee1b5"); g.append("path").attr("d", d).attr("fill", "url(#pp-field)").attr("stroke", "#b9a46a").attr("stroke-width", .7); }
      g.append("path").attr("d", zone("grout").map(z => ringD(wob(P(z.ring(1, 40)), 1))).join("")).attr("fill", "#ddd5c4").attr("stroke", "#a39a88").attr("stroke-width", .6);
      if (S.quarry && S.quarry.ring) g.append("path").attr("d", ringD(wob(P(S.quarry.ring(1, 64)), 1))).attr("fill", "#d6cfbf").attr("stroke", "#7f7565").attr("stroke-width", 1.1);
      // Tree stamps on the forest: little lollipops and pines, where nothing else is.
      const crowns = [], pines = [], stems = [];
      for (let v = by0 + 8; v < by1 - 6; v += 15) for (let u = bx0 + 8 + ((v / 15) % 2) * 7; u < bx1 - 6; u += 15) {
        const uu = u + (rnd() - .5) * 9, vv = v + (rnd() - .5) * 9, w = toWorld(uu, vv), p = [w[0], w[1]];
        if (S.openAt(p).kind !== "forest" || S.inWater(p, 8) || S.trailDist(p) < 9 || S.streamDist(p) < 6 || rnd() < .25) continue;
        const r = 2.6 + rnd() * 1.2;
        if (rnd() < .38) pines.push(`M${f1(uu)},${f1(vv - r * 1.9)}l${f1(r * .9)},${f1(r * 1.9)}h${f1(-r * 1.8)}z`);
        else crowns.push(`M${f1(uu - r)},${f1(vv - r)}a${f1(r)},${f1(r)} 0 1,0 ${f1(2 * r)},0a${f1(r)},${f1(r)} 0 1,0 ${f1(-2 * r)},0`);
        stems.push(`M${f1(uu)},${f1(vv - .5)}v${f1(r * .9)}`);
      }
      g.append("path").attr("d", stems.join("")).attr("stroke", "#7c6a4e").attr("stroke-width", .8);
      g.append("path").attr("d", crowns.join("")).attr("fill", "#a9b986").attr("stroke", "#6f7c52").attr("stroke-width", .6);
      g.append("path").attr("d", pines.join("")).attr("fill", "#8fa67a").attr("stroke", "#5f7050").attr("stroke-width", .6).attr("stroke-linejoin", "round");
      // Water: a fill, a shoreline and the old cartographer's inner line.
      for (const z of S.water) {
        const d = ringD(wob(P(z.ring(1, 72)), .8));
        g.append("path").attr("d", d).attr("fill", "#b8d3d3").attr("stroke", "#5e8c9c").attr("stroke-width", 1.2);
        g.append("path").attr("d", ringD(P(z.ring(.86, 72)))).attr("fill", "none").attr("stroke", "#5e8c9c").attr("stroke-width", .5).attr("stroke-opacity", .6);
      }
      g.append("path").attr("d", S.streams.map(s => lineD(wob(P(s.pts.filter((p, i) => i % 3 === 0 || i === s.pts.length - 1)), .5))).join("")).attr("fill", "none").attr("stroke", "#5e8c9c").attr("stroke-width", 1.3).attr("stroke-linecap", "round");
      // Stone walls: dotted.
      g.append("path").attr("d", S.walls.map(w => lineD(P(w))).join("")).attr("fill", "none").attr("stroke", "#8d8471").attr("stroke-width", 1.6).attr("stroke-linecap", "round").attr("stroke-dasharray", ".1 3.4");
      // The road and the lot.
      const [, ry] = px(0, -38);
      g.append("path").attr("d", `M${f1(bx0 - 14)},${f1(ry)}H${f1(bx1 + 14)}`).attr("stroke", "#7d6e58").attr("stroke-width", 6.2);
      g.append("path").attr("d", `M${f1(bx0 - 14)},${f1(ry)}H${f1(bx1 + 14)}`).attr("stroke", "#f6eed8").attr("stroke-width", 3.8);
      g.append("text").attr("class", "pp-road").attr("x", px(150, 0)[0]).attr("y", ry + 13).text("QUARRY HILL ROAD");
      const [lx0, ly0] = px(-26, 4), [lx1, ly1] = px(26, -28);
      g.append("rect").attr("x", lx0).attr("y", ly0).attr("width", lx1 - lx0).attr("height", ly1 - ly0).attr("rx", 3).attr("fill", "#e2dccd").attr("stroke", "#8a8070").attr("stroke-width", .8);
      const [pxp, pyp] = px(-34, -12);
      g.append("rect").attr("x", pxp - 6).attr("y", pyp - 6).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", "#3f6f9a");
      g.append("text").attr("class", "pp-p").attr("x", pxp).attr("y", pyp + 4.2).text("P");
      // Trails: red dashes.
      g.append("path").attr("d", S.trails.map(t => lineD(wob(P(t.pts), .6))).join("")).attr("fill", "none").attr("stroke", "#a9442c").attr("stroke-width", 1.6).attr("stroke-dasharray", "4.5 3").attr("stroke-linecap", "round");
      // Landmarks: a small glyph and a note in a fine italic.
      const seen = new Set(), lm = g.append("g").attr("class", "pp-lm");
      for (const l of S.landmarks) {
        if (!(l.kind in LANDMARKS) || seen.has(l.kind) || !LANDMARKS[l.kind]) continue;
        seen.add(l.kind);
        const [u, v] = px(l.x, l.y), a = lm.append("g").attr("transform", `translate(${f1(u)},${f1(v)})`);
        a.append("path").attr("d", GLYPH[l.kind] || GLYPH.dot).attr("fill", "#f3e9cf").attr("stroke", "#4a3f30").attr("stroke-width", .9).attr("stroke-linejoin", "round");
        a.append("text").attr("x", 6).attr("y", 3).text(LANDMARKS[l.kind]);
      }
      // The world's drawn edge, the frame, the compass and a scale.
      svg.append("rect").attr("width", MW).attr("height", MH).attr("filter", "url(#pp-grain)").attr("pointer-events", "none");
      svg.append("path").attr("d", edgeD).attr("fill", "none").attr("stroke", "#6f7f4c").attr("stroke-width", 1.1).attr("stroke-dasharray", "7 2.5 1 2.5").attr("pointer-events", "none");
      svg.append("rect").attr("x", 6).attr("y", 6).attr("width", MW - 12).attr("height", MH - 12).attr("fill", "none").attr("stroke", "#4a3f30").attr("stroke-width", 1.4).attr("pointer-events", "none");
      svg.append("rect").attr("x", 10).attr("y", 10).attr("width", MW - 20).attr("height", MH - 20).attr("fill", "none").attr("stroke", "#4a3f30").attr("stroke-width", .5).attr("pointer-events", "none");
      const cp = svg.append("g").attr("transform", `translate(${f1(MW - PAD - 30)},${f1(PAD + 40)})`).attr("pointer-events", "none");
      cp.append("circle").attr("r", 17).attr("fill", "none").attr("stroke", "#4a3f30").attr("stroke-width", .7).attr("stroke-dasharray", "1 2.2");
      cp.append("path").attr("d", "M0,-24L5,0L0,24L-5,0Z").attr("fill", "none").attr("stroke", "#4a3f30").attr("stroke-width", 1);
      cp.append("path").attr("d", "M0,-24L5,0H-5Z").attr("fill", "#4a3f30");
      cp.append("text").attr("class", "pp-n").attr("y", -28).text("N");
      const sb = svg.append("g").attr("transform", `translate(${f1(PAD + 14)},${f1(MH - PAD - 16)})`).attr("pointer-events", "none"), m100 = 100 * SC;
      for (let i = 0; i < 2; i++) sb.append("rect").attr("x", i * m100).attr("y", -3).attr("width", m100).attr("height", 5).attr("fill", i ? "#f3e9cf" : "#4a3f30").attr("stroke", "#4a3f30").attr("stroke-width", .8);
      for (const [i, t] of [[0, "0"], [1, "100"], [2, "200 m"]]) sb.append("text").attr("class", "pp-scale").attr("x", i * m100).attr("y", -7).text(t);
      // What changes with each opening sits on top.
      svg.append("g").attr("class", "pp-areas");
      svg.append("g").attr("class", "pp-view").attr("pointer-events", "none");
      svg.append("g").attr("class", "pp-me").attr("pointer-events", "none");
      // A click on the map (not on an area) looks at that spot.
      svg.on("click", e => {
        if (e.target.closest(".pp-area")) return;
        const r = svg.node().getBoundingClientRect(), u = (e.clientX - r.left) / r.width * MW, v = (e.clientY - r.top) / r.height * MH;
        const [x, y] = toWorld(u, v);
        if (x < X0 || x > X1 || y < Y0 || y > Y1) return;
        pick({ x, y });
      });
    }
    const GLYPH = {
      dot: "M-2.5,0a2.5,2.5 0 1,0 5,0a2.5,2.5 0 1,0-5,0",
      kiosk: "M-3.5,3V-1.5L0,-4.5L3.5,-1.5V3Z",
      counters: "M-3,3.5L-1.2,-4.5H1.2L3,3.5M-2.2,0H2.2",
      foundation: "M-4,3V-3H4V3ZM-4,0H4",
      mill: "M-3.2,0a3.2,3.2 0 1,0 6.4,0a3.2,3.2 0 1,0-6.4,0M0,-3.2V3.2M-3.2,0H3.2",
      cellar: "M-3.5,-3.5H3.5V3.5H-3.5Z",
      derrick: "M-3.5,3.5L0,-4.5L3.5,3.5M-1.8,-.5H1.8",
      powderhouse: "M-3,3.5V-1L0,-4L3,-1V3.5Z",
      tractor: "M-4,1.5a2,2 0 1,0 4,0a2,2 0 1,0-4,0M1,2.5h2.5V-1H-1",
      gauge: "M-.8,-4.5H.8V4.5H-.8ZM-3,-2H.8M-3,1H.8",
    };

    // ---- each opening: the areas you know, the view, and you
    function drawState() {
      const s = state;
      const areas = svg.select(".pp-areas"); areas.selectAll("*").remove();
      for (const a of s.areas) {
        const sec = D.sectors.find(x => x.name === a.name); if (!sec) continue;
        const z = S.zones.find(z => z.name === a.name && z.ring && (z.kind === "clearing" || z.kind === "bald"));
        const ring = z ? P(z.ring(1.18, 48)) : d3.range(40).map(i => px(sec.x + Math.cos(i / 40 * Math.PI * 2) * sec.radius, sec.y + Math.sin(i / 40 * Math.PI * 2) * sec.radius));
        const [u, v] = px(sec.x, sec.y);
        const gA = areas.append("g").attr("class", `pp-area ${a.state === 2 ? "visited" : "known"}${s.here === a.name ? " here" : ""}`)
          .attr("tabindex", 0).attr("role", "button").attr("aria-label", `${a.name}${a.sub ? ", " + a.sub : ""}. Look at it in the world.`);
        const d = ringD(ring);
        gA.append("path").attr("class", "pp-zone-fill").attr("d", d);
        gA.append("path").attr("class", "pp-zone").attr("d", d);
        const top = d3.min(ring, p => p[1]);
        gA.append("text").attr("class", "pp-area-name").attr("x", u).attr("y", top - 14).text(a.name.toUpperCase());
        if (a.sub) gA.append("text").attr("class", "pp-area-sub").attr("x", u).attr("y", top - 3).text(a.sub);
        const go = () => pick({ x: sec.x, y: sec.y, sector: a.name });
        gA.on("click", e => { e.stopPropagation(); go(); }).on("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      }
      const vg = svg.select(".pp-view"); vg.selectAll("*").remove();
      if (s.view) {
        const [a0, b0] = px(s.view[0], s.view[3]), [a1, b1] = px(s.view[2], s.view[1]);
        vg.append("rect").attr("x", a0).attr("y", b0).attr("width", Math.max(4, a1 - a0)).attr("height", Math.max(4, b1 - b0)).attr("rx", 3);
      }
      const me = svg.select(".pp-me"); me.selectAll("*").remove();
      if (s.me) {
        const [u, v] = px(s.me[0], s.me[1]);
        const right = u < MW - 120, gm = me.append("g").attr("transform", `translate(${f1(u)},${f1(v)})`);
        gm.append("circle").attr("r", 8.5).attr("fill", "#fff8e6").attr("fill-opacity", .85);
        gm.append("circle").attr("r", 5).attr("fill", "#c0392b").attr("stroke", "#4a3f30").attr("stroke-width", 1.2);
        gm.append("path").attr("d", right ? "M8,-6C16,-14 24,-16 32,-15" : "M-8,-6C-16,-14 -24,-16 -32,-15").attr("fill", "none").attr("stroke", "#4a3f30").attr("stroke-width", 1);
        gm.append("text").attr("class", "pp-you").attr("x", right ? 35 : -35).attr("y", -12).attr("text-anchor", right ? "start" : "end").text("You are here");
      }
      // The sidebar: title, key, and the areas you know.
      const known = s.areas.slice().sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99));
      side.html(`<div class="pp-title"><span class="pp-kicker">Trail map</span><b>Granite Hollow</b><span class="pp-sub">State Park</span><span class="pp-note">Day use only · Gate closes at dusk</span></div>
        <div class="pp-key">
          <span><svg width="26" height="8"><path d="M1,4H25" stroke="#a9442c" stroke-width="1.6" stroke-dasharray="4.5 3"/></svg>Trail</span>
          <span><svg width="26" height="8"><path d="M1,4H25" stroke="#8d8471" stroke-width="1.6" stroke-linecap="round" stroke-dasharray=".1 3.4"/></svg>Stone wall</span>
          <span><svg width="26" height="12"><rect x="7" y="0" width="12" height="12" rx="2" fill="#3f6f9a"/><text x="13" y="10" text-anchor="middle" fill="#fff" font-weight="800" font-size="10" font-family="Nunito Sans, sans-serif">P</text></svg>Parking</span>
          <span><svg width="26" height="14"><ellipse cx="13" cy="7" rx="11" ry="6" fill="url(#pp-climb)" stroke="#b5462e" stroke-dasharray="2 2"/></svg>Climbing area</span>
          <span><svg width="26" height="14"><circle cx="13" cy="7" r="4.5" fill="#c0392b" stroke="#4a3f30"/></svg>You are here</span>
        </div>
        <h3>Climbing areas</h3>
        <ul class="pp-list">${known.map(a => `<li><button type="button" data-pp-area="${esc(a.name)}" class="${s.here === a.name ? "here" : ""}"><b>${esc(a.name)}</b><span>${esc(a.sub || "")}</span></button></li>`).join("") || `<li class="pp-none">None yet.</li>`}</ul>
        ${s.footnote ? `<p class="pp-foot">${esc(s.footnote)}</p>` : ""}
        <p class="pp-hint">Pick an area, or anywhere on the map, to look at it. Looking doesn't move you or cost time.</p>
        <button type="button" class="pp-x" data-pp-close aria-label="Fold up the trail map (M or Esc)" title="Fold it up (M)">×</button>`);
      side.selectAll("[data-pp-area]").on("click", function () { const sec = D.sectors.find(x => x.name === this.dataset.ppArea); pick({ x: sec.x, y: sec.y, sector: sec.name }); });
      side.selectAll("[data-pp-close]").on("click", close);
    }
    function pick(where) { const cb = state && state.onPick; close(); if (cb) cb(where); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    function open(s) {
      state = s;
      if (!built) build();
      drawState();
      lastFocus = document.activeElement;
      back.attr("hidden", null); isOpen = true;
      document.addEventListener("keydown", onKey);
      const first = side.select("[data-pp-area]").node() || side.select("[data-pp-close]").node(); if (first) first.focus();
    }
    function close() {
      if (!isOpen) return;
      back.attr("hidden", true); isOpen = false;
      document.removeEventListener("keydown", onKey);
      const cb = state && state.onClose; if (cb) cb();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    back.on("click", e => { if (e.target === back.node()) close(); });
    return { open, close, isOpen: () => isOpen, size: [MW, MH] };
  }

  root.Paper = { make };
})(window);
