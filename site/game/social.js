// Granite Hollow: you and the regulars (Phase 4, Stage 0). Pure functions over a
// save (G), no DOM, so they can be tested in Node (scripts/test_social.js).
//
// What you've been through with someone is kept as dated moments. How well you
// know each other is worked out from them, never stored, so it can be retuned
// without converting saves. Each kind of moment counts once a day: talking ten
// times in a day is one day of talking. Friendship never goes down.
//
//   G.social = { v: 1, npc: { [who]: { k, last, m } } }
//     k     { kind: days }  how many days each kind of moment has happened on
//     last  { kind: date }  the last day of each kind
//     m     [[date, kind, p]]  the latest moments, newest first (what they remember;
//           p is a problem id, or null)
//     said  { lineId: date }  what they last said to you, and when (Stage 2: so
//           nobody repeats themselves)
//
// Moments: met (you talked), chat (sat and talked), climb (climbed together),
// sendWith (a send with them there), beta (they gave you beta), proj (they know
// what you're projecting), pet (Pickles), lesson (they taught you something),
// invite (you took them up on an invitation: Phase 4, Stage 4).
// What each of them especially values (Stage 4; worth nothing to anyone else):
// brush (Gus: you brushed a line while he was out), fa (Hollis: a first ascent of
// yours while Hollis was out, for the binder), wet (Otis: you came out to see him
// on a wet or greasy day), dyno (Bea: you tried a dyno near her), hard (Dez: you
// tried something hard near Dez), quiet (Rowan: you sat and talked on a quiet day).
//   up  { key, date }  a friendship that's just deepened, for them to mention next
//       time you talk (cleared once they have)
// Saves from before Phase 4 start from what they already record: the days you've
// met each regular, your chats and pets (G.know.met), and your sends together
// (tick.with).
(function (root) {
  "use strict";
  const KINDS = { met: 1, chat: 2, climb: 3, sendWith: 3, beta: 1, proj: 0, pet: 1, lesson: 2, invite: 2,
    brush: 0, fa: 0, wet: 0, dyno: 0, hard: 0, quiet: 0 };
  // Each regular's own: what's worth more to them (added to KINDS), and how you'd notice.
  const LIKES = {
    "n:gus": { kinds: { brush: 3, lesson: 1 }, words: "Gus notices when you look after the park: brushing the holds, leaving it better than you found it." },
    "n:hollis": { kinds: { fa: 4, beta: 1 }, words: "Hollis loves a new first ascent for the binder, and loves being asked." },
    "n:otis": { kinds: { wet: 3 }, words: "Otis is always glad of company on a wet or greasy day. Perfect sending weather, apparently." },
    "n:bea": { kinds: { dyno: 3, sendWith: 1 }, words: "Bea lights up when you try dynos with her around." },
    "n:dez": { kinds: { hard: 3 }, words: "Dez respects trying hard: projecting near Dez counts for a lot." },
    "n:rowan": { kinds: { quiet: 3, chat: 1 }, words: "Rowan likes the quiet days best: sitting and talking when there's hardly anyone about." },
  };
  const MEMORY = 40, SAID = 300;
  // How well you know each other, in words (never a number on screen). Tuned in Stage 4
  // (scripts/tune_friends.js; the review asked for a first friend in about three weeks
  // and a good friend in about two months): a sociable player knows someone within a
  // week of climbing days, has a first friend after about 14 and a first good friend
  // after about 40; a casual one about 53 and 140.
  const TIERS = [
    { at: 0, key: "met", words: "You've met" },
    { at: 8, key: "know", words: "You know each other" },
    { at: 22, key: "friends", words: "Friends" },
    { at: 55, key: "good", words: "Good friends" },
  ];
  // Stages 0–3's first guess. A save from then keeps any tier it reached under them
  // (best), since friendship never goes down. (Today's are lower, so this is a safeguard.)
  const OLD_AT = [0, 8, 25, 60];
  const isDay = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s);
  const isNpc = w => typeof w === "string" && /^n:[a-z]{2,12}$/.test(w);
  const count = x => (typeof x === "number" && isFinite(x) && x >= 0 ? Math.min(100000, Math.floor(x)) : 0);

  function blank() { return { k: {}, last: {}, m: [], said: {} }; }
  // A save's social record: made from what it already knows if it has none, and
  // anything that doesn't check out dropped (save files are untrusted).
  function ensure(G, nP = Infinity) {
    if (!G || G.v !== 2 || !G.know) return null;
    if (!G.social || typeof G.social !== "object" || Array.isArray(G.social) || !G.social.npc || typeof G.social.npc !== "object") G.social = seed(G);
    const S = G.social;
    for (const [w, r] of Object.entries(S.npc)) {
      if (!isNpc(w) || !r || typeof r !== "object") { delete S.npc[w]; continue; }
      const k = {}, last = {};
      for (const kind of Object.keys(KINDS)) {
        if (r.k && count(r.k[kind])) k[kind] = count(r.k[kind]);
        if (r.last && isDay(r.last[kind])) last[kind] = r.last[kind];
      }
      const m = (Array.isArray(r.m) ? r.m : []).filter(x => Array.isArray(x) && x.length === 3 && isDay(x[0]) && x[1] in KINDS
        && (x[2] === null || (Number.isInteger(x[2]) && x[2] >= 0 && x[2] < nP))).slice(0, MEMORY);
      const said = {};
      if (r.said && typeof r.said === "object") for (const [id, d] of Object.entries(r.said).slice(-SAID)) if (/^[a-z0-9_.-]{1,48}$/.test(id) && isDay(d)) said[id] = d;
      const best = TIERS.some(t => t.key === r.best) ? r.best : null;
      const up = r.up && typeof r.up === "object" && TIERS.some(t => t.key === r.up.key) && isDay(r.up.date) ? { key: r.up.key, date: r.up.date } : null;
      S.npc[w] = { k, last, m, said, ...(up ? { up } : {}), ...(best ? { best } : {}) };
    }
    // From before Stage 4's tuning: keep what each friendship had reached.
    if (!(S.v >= 2)) {
      for (const w of Object.keys(S.npc)) {
        const b = bond(G, w); let n = 0; OLD_AT.forEach((at, i) => { if (b >= at) n = i; });
        if (n > 0 && n > tierIndex(G, w)) S.npc[w].best = TIERS[n].key;
      }
    }
    S.v = 2;
    return S;
  }
  function seed(G) {
    const npc = {}, met = (G.know && G.know.met) || {};
    for (const [w, r] of Object.entries(met)) {
      if (!isNpc(w) || !r) continue;
      const n = count(r.n), e = npc[w] = blank();
      if (n) { e.k.met = n; if (isDay(r.last)) e.last.met = r.last; }
      if (count(r.chats)) e.k.chat = Math.min(n || 1, count(r.chats));
      if (count(r.pets)) { e.k.pet = Math.min(n || 1, count(r.pets)); if (isDay(r.petted)) e.last.pet = r.petted; }
    }
    // Sends together (Phase 3): a day of climbing together, and the sends themselves.
    const ticks = (G.ticks || []).filter(t => t && isNpc(t.with) && isDay(t.date));
    for (const t of ticks) {
      const e = npc[t.with] || (npc[t.with] = blank());
      if (e.last.climb !== t.date) { e.k.climb = (e.k.climb || 0) + 1; e.k.sendWith = (e.k.sendWith || 0) + 1; e.last.climb = e.last.sendWith = t.date; }
      e.m.unshift([t.date, "sendWith", Number.isInteger(t.p) ? t.p : null]);
    }
    for (const e of Object.values(npc)) e.m = e.m.slice(0, MEMORY);
    return { v: 1, npc };          // ensure() upgrades it (and keeps any old tiers)
  }
  // Something happened with someone today. Counts once a day per kind; every
  // distinct moment (a different problem, say) is remembered. Returns true if it counted.
  function moment(G, who, kind, date, p = null) {
    if (!G || G.v !== 2 || !isNpc(who) || !(kind in KINDS) || !isDay(date)) return false;
    if (!G.social) { G.social = seed(G); G.social.v = 2; }  // a new climber, or one just converted (already on today's tiers)
    const e = G.social.npc[who] || (G.social.npc[who] = blank());
    const pp = Number.isInteger(p) ? p : null;
    if (!e.m.some(x => x[0] === date && x[1] === kind && x[2] === pp)) { e.m.unshift([date, kind, pp]); if (e.m.length > MEMORY) e.m.length = MEMORY; }
    if (e.last[kind] === date) return false;
    e.last[kind] = date; e.k[kind] = (e.k[kind] || 0) + 1;
    return true;
  }
  // How well you know each other, worked out from the moments.
  function bond(G, who) {
    const e = G && G.social && G.social.npc[who];
    if (!e) return 0;
    let b = 0;
    const own = (LIKES[who] && LIKES[who].kinds) || {};
    for (const [kind, n] of Object.entries(e.k)) b += ((KINDS[kind] || 0) + (own[kind] || 0)) * n;
    return b;
  }
  // The tier the moments add up to (never below one a friendship has already reached).
  function tierIndex(G, who) {
    const e = G && G.social && G.social.npc[who];
    if (!e) return 0;
    const b = bond(G, who);
    let n = 0; TIERS.forEach((x, i) => { if (b >= x.at) n = i; });
    const best = TIERS.findIndex(t => t.key === e.best);
    return Math.max(n, best);
  }
  function tier(G, who) {
    const e = G && G.social && G.social.npc[who];
    if (!e || !Object.keys(e.k).length) return null;
    const n = tierIndex(G, who);
    return { ...TIERS[n], n, bond: bond(G, who) };
  }
  // Record a moment and see whether the friendship deepened: returns the new tier
  // ({ key, words, n }) if it did, else null. A deepening is kept (up) until they've
  // mentioned it.
  function befriend(G, who, kind, date, p = null) {
    const before = tier(G, who);
    moment(G, who, kind, date, p);
    const after = tier(G, who);
    if (!after || (before ? after.n <= before.n : after.n === 0)) return null;
    G.social.npc[who].up = { key: after.key, date };
    return after;
  }
  // They've mentioned it.
  function heard(G, who) { const e = G && G.social && G.social.npc[who]; if (e) delete e.up; }
  // Who you've shared what with: days met, chats, days climbed together, sends together, beta.
  function shared(G, who) {
    const e = G && G.social && G.social.npc[who], k = (e && e.k) || {};
    return { met: k.met || 0, chats: k.chat || 0, climbs: k.climb || 0, sends: k.sendWith || 0, beta: k.beta || 0 };
  }
  // What they remember: moments of these kinds since a date, newest first.
  function remembers(G, who, kinds, since = "0000-00-00") {
    const e = G && G.social && G.social.npc[who];
    if (!e) return [];
    const ks = Array.isArray(kinds) ? kinds : [kinds];
    return e.m.filter(x => ks.includes(x[1]) && x[0] >= since);
  }

  // Lines: when someone last said a line to you (null if never), and noting that they just did.
  function saidOn(G, who, id) { const e = G && G.social && G.social.npc[who]; return (e && e.said && e.said[id]) || null; }
  function say(G, who, id, date) {
    if (!G || G.v !== 2 || !isNpc(who) || !/^[a-z0-9_.-]{1,48}$/.test(id) || !isDay(date)) return;
    if (!G.social) G.social = seed(G);
    const e = G.social.npc[who] || (G.social.npc[who] = blank()), s = e.said || (e.said = {});
    delete s[id]; s[id] = date;
    const ks = Object.keys(s); if (ks.length > SAID) for (const k of ks.slice(0, ks.length - SAID)) delete s[k];
  }

  const Social = { KINDS, LIKES, TIERS, MEMORY, ensure, seed, moment, befriend, heard, shared, bond, tier, remembers, saidOn, say };
  if (typeof module !== "undefined") module.exports = Social; else root.Social = Social;
})(typeof window !== "undefined" ? window : globalThis);
