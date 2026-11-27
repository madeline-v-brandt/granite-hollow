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
    const canSpot = p => !!(Mech && Mech.canSpot(G().player, D.problems[p], G().bestGrade ?? -1));

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
      (k().looked = k().looked || {})[b] = date;
      const lines = D.boulders[b].problems.filter(p => line(p) === "hidden" && canSpot(p) && identify(p, "spot", date));
      return { found, lines };
    }
    // Lines on a known boulder you can see now but couldn't before (you got stronger).
    const spottable = b => D.boulders[b].problems.filter(p => line(p) === "hidden" && canSpot(p));
    // Have you looked this boulder over yourself (as opposed to hearing of it)?
    const inspected = b => !all() && (!!(k().looked && k().looked[b]) || D.boulders[b].problems.some(p => { const l = k().lines[p]; return l && l.how === "spot"; }));
    // Boulders you've looked over that now hold lines you couldn't see then.
    const lookAgain = () => (all() ? [] : Object.keys(k().boulders).map(Number).filter(b => inspected(b) && spottable(b).length));
    // Lines you've identified (spotted, been told about, or tried), by problem id.
    const identified = () => (all() ? [] : Object.keys(k().lines).map(Number));
    // Another problem you can see that already goes by this name: its area, or null.
    function sameName(p, nm) {
      const want = String(nm || "").trim().toLowerCase();
      if (!want) return null;
      const hit = guidebook().find(i => i !== p && String(name(i)).toLowerCase() === want);
      return hit == null ? null : D.boulders[D.problems[hit].b].sector;
    }

    // ---- Stage 5: what people tell you, and who you know
    // Someone tells you the way to an area: now you know where it is (Go there works).
    function hearOf(s, from, date) {
      if (all() || area(s) >= 1) return false;
      knowArea(s, 1);
      (k().told = k().told || {})[s] = { from, date };
      return true;
    }
    const toldOf = s => (all() ? null : (k().told && k().told[s]) || null);
    // You've met someone (a regular): how many times, and when.
    function meet(w, date) {
      if (all()) return { n: 1, first: date, last: date };
      const m = (k().met = k().met || {}), r = m[w] || (m[w] = { n: 0, first: date, last: null });
      if (r.last !== date) { r.n++; r.last = date; }
      return r;
    }
    const met = w => (all() ? null : (k().met && k().met[w]) || null);
    function chat(w, date) { const r = meet(w, date); r.chats = (r.chats || 0) + 1; return r; }
    function pet(w, date) { const r = meet(w, date); r.pets = (r.pets || 0) + 1; r.petted = date; return r.pets; }

    // Local Buzz: a few notable things from the crag's recent history, told the
    // way word gets around. Precise about places you know; vague about the rest
    // (never naming a boulder you haven't found, never unlocking Go there).
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const stiff = g => (g >= 11 ? `a desperate-sounding V${g}` : g >= 8 ? `a hard V${g}` : g >= 6 ? `a stiff V${g}` : `a V${g}`);
    function where(s, b) {
      if (area(s) < 1) return (World && World.AREAS[s] && World.AREAS[s].hint) || "somewhere in the woods";
      return b != null && boulder(b) >= 1 ? `on ${D.boulders[b].name} at ${s}` : `somewhere at ${s}`;
    }
    const goFor = (s, b) => (area(s) >= 1 ? { sector: s, boulder: b != null && boulder(b) >= 1 ? b : null } : null);
    function buzzItem(n) { const it = buzzText(n); if (it && n.by) it.by = n.by; return it; }
    // How long a regular's project took: "after three weeks on it", "after six sessions".
    const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    const num = k => WORDS[k] || String(k);
    function took(sessions, since, date) {
      const wk = since ? Math.round(World.daysBetween(since, date) / 7) : 0;
      return wk >= 2 ? `after ${num(wk)} weeks on it` : `after ${num(sessions)} sessions on it`;
    }
    function buzzText(n) {
      const W = G().world, who = n.by ? World.whoName(D, n.by) : "";
      const info = n.by ? World.whoInfo(D, n.by) : {};
      // A regular finally sends their project (an established line).
      if (n.kind === "proj") {
        if (!info.regular || n.p == null || !D.problems[n.p] || !W.est[n.p]) return null;
        const pr = D.problems[n.p], s = D.boulders[pr.b].sector, seen = line(n.p) === "est" && boulder(pr.b) >= 1, g = W.est[n.p].grade;
        return { date: n.date, kind: n.kind, p: seen ? n.p : null, go: goFor(s, pr.b),
          text: seen ? `${cap(who)} finally sent ${name(n.p)} (V${g}) on ${D.boulders[pr.b].name}, ${took(n.n, n.since, n.date)}.`
            : `${cap(who)} finally sent ${stiff(g)} project ${where(s, pr.b)}, ${took(n.n, n.since, n.date)}.` };
      }
      if (n.kind === "fa" || n.kind === "snipe") {
        if (n.by === "you" || n.p == null || !D.problems[n.p]) return null;
        const pr = D.problems[n.p], s = D.boulders[pr.b].sector, e = W.est[n.p];
        const g = e ? e.grade : pr.grade, seen = line(n.p) === "est" && boulder(pr.b) >= 1;
        if (n.kind === "snipe") return { date: n.date, kind: n.kind, p: n.p, go: goFor(s, pr.b), text: `${cap(who)} climbed ${name(n.p)} (V${g}) on ${D.boulders[pr.b].name}, the line you'd spotted. Word is it's brilliant.` };
        const known = area(s) >= 1, hint = (World.AREAS[s] || {}).hint || "out in the woods";
        const named = info.regular || known ? who : "someone";
        let text;
        const after = n.proj >= 3 && info.regular ? `, ${took(n.proj, n.since, n.date)}` : "";
        if (seen) text = `${cap(who)} put up ${name(n.p)} (V${g}) on ${D.boulders[pr.b].name} at ${s}${n.first ? ", the first problem there" : ""}${after}.`;
        else if (n.first) text = `Word is ${named} put up the first problem ${known ? "at " + s : hint}, ${stiff(g)}.`;
        else text = `Word is ${named} put up ${stiff(g)} ${where(s, pr.b)}.`;
        return { date: n.date, kind: n.kind, p: seen ? n.p : null, go: goFor(s, pr.b), text };
      }
      if (n.kind === "classic") {
        if (n.p == null || !D.problems[n.p]) return null;
        const pr = D.problems[n.p], s = D.boulders[pr.b].sector, seen = line(n.p) === "est" && boulder(pr.b) >= 1;
        return { date: n.date, kind: n.kind, p: seen ? n.p : null, go: goFor(s, pr.b),
          text: seen ? `${name(n.p)} (V${grade(n.p)}) ${where(s, pr.b)} is fast becoming a classic.` : `People keep talking about ${stiff(W.est[n.p] ? W.est[n.p].grade : pr.grade)} ${where(s, pr.b)}. It's becoming a classic.` };
      }
      // An area's name only appears once you know the area.
      if (n.kind === "named") { const h = (World.AREAS[n.s] || {}).hint || "further out";
        return { date: n.date, kind: n.kind, go: goFor(n.s, null), text: area(n.s) >= 1 ? `The boulders ${h} have a name now: people are calling them ${n.s}.` : `People have started climbing ${h}.` }; }
      if (n.kind === "found") return { date: n.date, kind: n.kind, go: goFor(n.s, null), text: area(n.s) >= 1 ? `Climbers have started poking around ${n.s}.` : `Climbers have started poking around ${(World.AREAS[n.s] || {}).hint || "further out"}.` };
      if (n.kind === "arrival") return null;          // who's started turning up isn't news (removed after Phase 4, from play-testing)
      return null;
    }
    // The most notable first: a line taken from you, the first problem in an area,
    // a newly named area, the regulars, hard lines; routine news only when it's quiet.
    function score(n, it) {
      if (n.kind === "snipe") return 10;
      if (n.first) return 8;
      if (n.kind === "named" || n.kind === "found") return 7;
      const reg = n.by && World.whoInfo(D, n.by).regular;
      if (n.kind === "arrival") return reg ? 6 : 4;
      if (n.kind === "proj") return 6;
      if (n.kind === "fa") { const g = G().world.est[n.p] ? G().world.est[n.p].grade : 0; return (reg ? 5 : 0) + (g >= 8 ? 3 : g >= 6 ? 1 : 0) + (it.p != null ? 1 : 0); }
      if (n.kind === "classic") return 2;
      return 1;
    }
    // ---- events and stories (Phase 4, Stage 7), worked out from the calendar and the ledger ----
    const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
    const ordinal = n => ORD[n] || `${n}th`;
    const short = (w, nm) => (w && w.startsWith("n:") ? World.whoName(D, w).replace(/^Ranger /, "").replace(/^the /, "").split(" ")[0] : nm);
    // The comp's results on a day: the field, with you in it if you climbed (G.events).
    function compResults(date) {
      const g = G(), field = World.compField(D, g, date).map(x => ({ ...x, short: short(x.who, x.name) }));
      const mine = g.events && g.events[date];
      if (mine && (World.eventOn(date) || {}).comp && mine.score > 0) field.push({ who: "you", name: "You", short: "you", score: mine.score, sends: [] });
      field.sort((a, b) => b.score - a.score || (a.who === "you" ? -1 : b.who === "you" ? 1 : 0));
      return field;
    }
    function eventBuzz(since) {
      const g = G(), out = [];
      const ahead = World.nextEvent(World.addDays(g.date, 1), 13);
      if (ahead) {
        const day = new Date(ahead.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
        out.push({ date: g.date, kind: "poster", go: null, text: `Gus has put up a poster at the kiosk: ${ahead.name}, ${day}.${ahead.comp ? " Every problem in the park counts." : ""}` });
      }
      for (let d = since; d < g.date; d = World.addDays(d, 1)) {
        const e = World.eventOn(d); if (!e) continue;
        let text;
        if (e.comp) {
          const f = compResults(d), at = f.findIndex(x => x.who === "you");
          if (f.length < 3) continue;
          const nm = x => (x.who === "you" ? "you" : x.short);
          text = `${e.name} went to ${nm(f[0])}, with ${f[0].score.toLocaleString("en-US")} points; ${nm(f[1])} came second and ${nm(f[2])} third.`;
          if (at >= 3) text += ` You came ${ordinal(at + 1)}, with ${f[at].score.toLocaleString("en-US")}.`;
        } else text = {
          bonfire: "Half the Hollow turned up for the Solstice Bonfire. The Bishop's story about 1977 got longer again.",
          trail: (t => (t ? `On Trail Day, Gus and a crowd of volunteers reopened ${t.name}, the old path between ${area(t.a) >= 1 ? t.a : (World.AREAS[t.a] || {}).hint || "two of the areas"} and ${area(t.b) >= 1 ? t.b : (World.AREAS[t.b] || {}).hint || "further out"}. It's on the trail map.` : "Gus and a crowd of volunteers cut back the summer's growth along the trails on Trail Day."))(World.oldTrailOn(d)),
          midsummer: "The Midsummer Dusk Session went on until the headlamps came out. Otis made forty sandwiches.",
        }[e.key];
        out.push({ date: d, kind: "event", go: null, text });
      }
      return out;
    }
    // Grade disputes: a regular who's repeated a line thinks it's a grade off.
    function gradeBuzz(since) {
      const g = G(), out = [];
      for (const [p, e] of Object.entries(g.world.est)) for (const l of e.logs || []) {
        const [who, d, , , sugg] = l;
        if (sugg == null || sugg === e.grade || d < since || d > g.date || !who.startsWith("n:") || !World.NAMED[who.slice(2)] || e.by === who) continue;
        const pr = D.problems[+p], s = D.boulders[pr.b].sector, seen = line(+p) === "est" && boulder(pr.b) >= 1, nm = short(who);
        const soft = sugg < e.grade ? "soft" : "sandbagged";
        const fa = e.by === "you" ? " You put it up, so it's your call." : e.by.startsWith("n:") && World.NAMED[e.by.slice(2)] ? ` ${short(e.by)}, who put it up, does not agree.` : "";
        out.push({ date: d, kind: "grade", by: who, p: seen ? +p : null, go: goFor(s, pr.b),
          text: seen ? `${nm} reckons ${name(+p)} (V${e.grade}) is ${soft}: more like V${sugg}.${fa}` : `${nm} reckons ${stiff(e.grade)} ${where(s, pr.b)} is ${soft}: more like V${sugg}.${fa}` });
      }
      return out;
    }
    function buzz(opts = {}) {
      if (all() || !World) return [];
      const g = G(), since = World.addDays(g.date, -(opts.days ?? 21)), cand = [];
      for (const n of g.world.news) {
        if (n.dev || n.date < since || n.date > g.date) continue;
        const it = buzzItem(n);
        if (it) cand.push([score(n, it), it]);
      }
      if (World.eventOn) {
        for (const it of eventBuzz(since)) cand.push([it.kind === "poster" ? 11 : 9, it]);
        for (const it of gradeBuzz(since)) cand.push([5, it]);
      }
      cand.sort((a, b) => b[0] - a[0] || (a[1].date < b[1].date ? 1 : a[1].date > b[1].date ? -1 : 0));
      const out = [], perDate = {}, perWho = {};
      let classics = 0;
      for (const [, it] of cand) {
        if (it.kind === "classic" && classics >= 1) continue;          // one "becoming a classic" at a time
        if (it.by && (perWho[it.by] || 0) >= 2) continue;          // a mix of people, not one person's week
        if ((perDate[it.date] || 0) >= (opts.perDay ?? 2)) continue;
        perDate[it.date] = (perDate[it.date] || 0) + 1; if (it.by) perWho[it.by] = (perWho[it.by] || 0) + 1;
        if (it.kind === "classic") classics++;
        out.push(it);
        if (out.length >= (opts.max ?? 6)) break;
      }
      return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }

    return { all, v2, est, area, boulder, line, visible, name, grade, boulderName, stats, knownBoulders, linesOn, guidebook,
      boulderStats, areaStats, canGo, canSpot, mapView, visitArea, visitBoulder, identify, tell, inspect, spottable,
      inspected, lookAgain, identified, sameName, hearOf, toldOf, meet, met, pet, chat, buzz, compResults,
      legend: p => (World && visible(p) ? World.legendOf(D, p) : null), faText: p => (World ? World.faText(D, est(p)) : "") };
  }
  const Know = { make };
  if (typeof module !== "undefined") module.exports = Know; else root.Know = Know;
})(typeof window !== "undefined" ? window : globalThis);
