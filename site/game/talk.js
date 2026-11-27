// Granite Hollow: what the regulars say (Phase 4, Stage 2). Pure: it reads a save
// through the knowledge layer (K) and the regulars' lives (World), and returns
// lines. Tested in Node (scripts/test_talk.js): every line, against several
// saves, must leak nothing, never say "undefined", and never use a gendered
// pronoun about Rowan or the player.
//
//   Talk.opening(env, who)        the first beats when you walk up to someone
//   Talk.reply(env, who, topic)   ask (what they're working on), tell (your
//                                 project), story (sit and chat), bye, again
//   env = { G, D, K, World, Social, minute, wet, rng }
//
// Lines are data: { id, mood, w (weight), when(c), say(c), narr (narration, not
// speech), story (a long story: not repeated for 45 days) }. The context c says
// what has really happened: their session today and their project (world.js),
// what they remember of you (social.js: your project, your sends together),
// your own recent sends and first ascents, and the other regulars' news. A line
// names a problem, a boulder or an area only if you know it (lineOf, whereOf);
// otherwise it describes it ("a crimpy slab up on the ridge"). Nobody repeats a
// line within 12 days (Social.say), unless they've nothing else to say.
(function (root) {
  "use strict";
  const KIND = [["dyno", "dyno"], ["highball", "highball"], ["roof", "roof"], ["traverse", "traverse"], ["compression", "squeeze"], ["slab", "slab"], ["mantle", "mantle"], ["overhang", "steep line"]];
  const HOLD = [["crimpy", "crimpy"], ["slopey", "slopey"], ["pinchy", "pinchy"], ["juggy", "juggy"], ["powerful", "powerful"], ["technical", "technical"]];
  const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const num = k => NUM[k] || String(k);
  const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const toDate = s => new Date(s + "T12:00:00Z");
  const days = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // ---- beta in words (Phase 4, Stage 3) ---------------------------------------------------
  // How to do a move, from what kind of move it is: the better way through (ALT_HOW), its
  // style, or its hold. Said by whoever's giving the beta, in their own words around it.
  const ALT_HOW = {
    extra: "There's a tiny intermediate at the crux. Shorter folks use it.",
    skip: "Skip the cramped hold at the crux. Just reach past it.",
    heel: "Heel hook at the crux. It takes all the weight off your arms.",
    toe: "Toe hook at the crux and your feet won't cut.",
    knee: "There's a knee bar at the crux. You can almost let go.",
    drop: "Drop-knee at the crux and it turns into a reach.",
    match: "Match on the crux hold before you go for the next one.",
    foot: "There's a better foot at the crux, low and left.",
  };
  const STYLE_HOW = {
    crimpy: "Thumb-catch the crimp and drive with your feet.", slopey: "Keep your hips tight to the wall on the sloper.",
    pinchy: "Squeeze the pinch with your thumb pad, not the tip.", juggy: "Climb it fast and shake out on the big jug.",
    compression: "Toe hook the right side so you can squeeze.", dyno: "Pre-load low and look at the hold, not your feet.",
    technical: "There's a tiny smear left of the arête. Trust it.", powerful: "Bump your left hand instead of doing the big lock-off.",
    mantle: "Turn your hand around and press. Don't pull.", slab: "Stand up straight and weight your feet.",
    overhang: "Heel hook out right and the move goes static.", roof: "Get a toe on the lip before you let go with your feet.",
    traverse: "There's a no-hands rest on the ledge halfway. Use it.", highball: "The top-out is easier than it looks. Commit.",
    eliminate: "Ignore the arête. The sequence goes left.",
  };
  const HOLD_HOW = {
    crimp: "Half-crimp it. Full crimp and you'll be off.", sloper: "Get your weight under the sloper before you move.", pinch: "Pinch hard and keep your elbow low.",
    jug: "It's a jug. Don't over-grip it; save it for the next one.", edge: "Stand up on the edge first, then reach.", sidepull: "Lean off the sidepull. Your feet have to push the other way.",
    undercling: "Feet high under the undercling, then stand up into it.", smear: "Trust the smear. Weight it, don't tiptoe.", ledge: "Get a heel on the ledge and rock over.",
    lip: "Heel on the lip and the rest is easy.", squeeze: "Squeeze with your feet as much as your hands.",
  };
  const REACH_HOW = { long: "Get your feet up as high as they'll go first. Then it's a reach, not a jump.", tight: "Keep your feet low and your elbows in. There isn't much room." };
  // r: a beta result (Mech.giveBeta); altKind: the line's better way through.
  function how(r, altKind) {
    if (!r || r.what === "none") return "Commit to the crux. You'll get it.";
    if (r.what === "alt" && ALT_HOW[altKind]) return ALT_HOW[altKind];
    return (r.style && STYLE_HOW[r.style]) || (r.hold && HOLD_HOW[r.hold]) || "Slow down on that move. Look for the feet first.";
  }
  // Where on the line: "the crux, move 4", "the top-out", "the first move", "move 3".
  const moveWord = r => (!r || r.at < 0 ? "the crux" : r.kind === "crux" ? `the crux, move ${r.at + 1}` : r.kind === "top" ? "the top-out" : r.at === 0 ? "the first move" : `move ${r.at + 1}`);

  // ---- what's true, from the save, through what you know -------------------------------
  function context(env, who) {
    const { G, D, K, World, Social } = env, key = who.slice(2), date = G.date, W = G.world;
    const tags = p => D.problems[p].tags.split("|");
    const kindOf = p => { const t = tags(p), k = (KIND.find(([x]) => t.includes(x)) || [, "line"])[1], h = (HOLD.find(([x]) => t.includes(x) && x !== k) || [, ""])[1]; return h ? `${h} ${k}` : k; };
    const whereOf = b => {
      const sec = D.boulders[b].sector;
      if (K.boulder(b) >= 1) return `on ${D.boulders[b].name}`;
      if (K.area(sec) >= 1) return `at ${sec}`;
      return (World.AREAS[sec] && World.AREAS[sec].hint) || "out in the woods";
    };
    // A problem as you know it: its name (and grade) if it's in your guidebook, else what it's like and where.
    const lineOf = p => {
      if (p == null || !D.problems[p]) return null;
      const b = D.problems[p].b, n = K.line(p) === "est" && K.boulder(b) >= 1 ? K.name(p) : null, g = n ? K.grade(p) : null;
      if (n) return { name: n, full: g != null ? `${n} (V${g})` : n, on: `${n} on ${D.boulders[b].name}`, known: true, kind: kindOf(p) };
      const k = kindOf(p), wh = whereOf(b), a = /^[aeiou]/.test(k) ? "an" : "a";
      return { name: null, full: `${a} ${k} ${wh}`, on: `${a} ${k} ${wh}`, known: false, kind: k };
    };
    const dur = (n, since) => { const d = since ? days(since, date) : 0; return d >= 14 ? `${num(Math.round(d / 7))} weeks` : `${num(n)} ${n === 1 ? "session" : "sessions"}`; };
    const first = World.whoName(D, who).replace(/^Ranger /, "").replace(/^the /, "").split(" ")[0];
    const met = K.met(who), R = World.regOf ? World.regOf(G, who) : null;
    const s = R && World.sessionOn(G, who, date);
    const c = {
      who, key, date, first, name: first,
      me: (n => (n && n.trim().toLowerCase() !== "you" ? n.trim() : null))(env.playerName || (G.player && G.player.name)),   // your name (lines that use it are skipped if you're just "you")
      firstMeeting: !met || (met.n <= 1 && met.first === date),
      tier: (Social.tier(G, who) || {}).key || null,
      part: env.minute < 720 ? "morning" : env.minute < 1020 ? "afternoon" : "evening",
      dow: toDate(date).getUTCDay(),
      month: +date.slice(5, 7),
      wx: { label: (G.day && G.day.weather && G.day.weather.label) || "", temp: (G.day && G.day.weather && G.day.weather.temp) || 60, cond: (G.day && G.day.weather && G.day.weather.cond) || 0, wet: !!env.wet },
      around: w => !!(W && W.npc && W.npc[w]),
      line: lineOf,
    };
    c.season = c.month >= 9 && c.month <= 11 ? "fall" : c.month === 12 || c.month <= 2 ? "winter" : c.month <= 5 ? "spring" : "summer";
    c.weekend = c.dow % 6 === 0;
    c.prime = c.wx.label === "Prime" || c.wx.cond >= 0.5;
    c.greasy = !c.wx.wet && c.wx.cond <= -0.3;
    c.cold = c.wx.temp < 45; c.hot = c.wx.temp > 80;
    // Their day and their projects (World.reg).
    if (s) c.today = { out: s.out, hi: s.hi, p: s.p, warm: s.w && s.w.length ? lineOf(s.w[0]) : null };
    if (R && R.proj) { const P = R.proj; c.proj = { ...lineOf(P.p), p: P.p, n: P.n, dur: dur(P.n, P.since), close: P.best >= 0.85 }; }
    const done = R && R.done.find(x => days(x[2], date) <= 21 && days(x[2], date) >= 0);
    if (done) c.done = { ...lineOf(done[0]), p: done[0], n: done[3], dur: dur(done[3], done[1]), sent: done[4] === "sent", today: done[2] === date, fa: !!(W.est[done[0]] && W.est[done[0]].by === who && W.est[done[0]].date === done[2]) };
    if (s && s.out === "send" && s.p != null) c.sentToday = { ...lineOf(s.p), p: s.p, n: done && done[0] === s.p ? done[3] : null, dur: done && done[0] === s.p ? dur(done[3], done[1]) : "a while" };
    const fas = W ? Object.entries(W.est).filter(([, e]) => e.by === who && days(e.date, date) <= 10 && days(e.date, date) >= 0) : [];
    if (fas.length) c.theirFa = lineOf(+fas.sort((a, b) => (a[1].date < b[1].date ? 1 : -1))[0][0]);
    c.anyFa = W ? Object.values(W.est).some(e => e.by === who) : false;
    // You: what you've done lately, and what they remember.
    const ticks = (G.ticks || []).filter(t => t.style !== "Repeat");
    const recent = ticks.filter(t => days(t.date, date) <= 3 && days(t.date, date) >= 0);
    if (recent.length) { const t = recent.reduce((a, b) => (D.problems[b.p].grade >= D.problems[a.p].grade ? b : a)); c.youSent = { ...lineOf(t.p), p: t.p, flash: t.style === "Flash", today: t.date === date }; }
    let best = -1; for (const t of ticks) { const g = D.problems[t.p].grade; if (g > best && days(t.date, date) <= 3 && days(t.date, date) >= 0 && best >= 2) c.youHardest = { ...lineOf(t.p), grade: g }; best = Math.max(best, g); }
    const myFa = W ? Object.entries(W.est).filter(([, e]) => e.by === "you" && days(e.date, date) <= 5 && days(e.date, date) >= 0).sort((a, b) => (a[1].date < b[1].date ? 1 : -1))[0] : null;
    if (myFa) c.youFa = lineOf(+myFa[0]);
    const projs = Object.keys(G.ps || {}).map(Number).filter(i => G.ps[i] && !G.ps[i].sent && G.ps[i].att >= 3 && K.visible(i) && (G.ps[i].log || []).some(x => Array.isArray(x) && days(String(x[0]), date) <= 10));
    if (projs.length) { const p = projs.sort((a, b) => G.ps[b].att - G.ps[a].att)[0]; c.yourProj = { ...lineOf(p), p, att: G.ps[p].att }; }
    const told = Social.remembers(G, who, "proj").find(x => x[0] < date && x[2] != null);
    if (told) c.told = { ...lineOf(told[2]), p: told[2], sent: !!(G.ps[told[2]] && G.ps[told[2]].sent), ago: days(told[0], date) };
    const together = Social.remembers(G, who, "sendWith", addDays(date, -30)).find(x => x[0] < date && x[2] != null);
    if (together) c.together = lineOf(together[2]);
    // Did they climb your project? (They'd know it.)
    if (c.yourProj && R) c.yourProj.theyDid = R.sent.includes(c.yourProj.p);
    if (c.yourProj) c.yourProj.tipped = !!(G.ps[c.yourProj.p].tips && G.ps[c.yourProj.p].tips[who]);
    // Other regulars' news (named: they're the regulars).
    if (W) {
      const n = W.news.find(x => (x.kind === "proj" || (x.kind === "fa" && x.proj >= 3)) && x.by && x.by !== who && x.by.startsWith("n:") && days(x.date, date) <= 5 && days(x.date, date) >= 0);
      if (n) c.other = { ...lineOf(n.p), who: n.by, person: World.whoName(D, n.by).replace(/^Ranger /, "").replace(/^the /, "").split(" ")[0], fa: n.kind === "fa", dur: dur(n.n || n.proj || 3, n.since) };
    }
    // Beta (Stage 3): what they're telling you now (env.beta, worked out by the game), or who
    // to ask instead (env.point), or a line they'd recommend (env.rec, one of their own sends).
    if (env.beta) {
      const B = env.beta, r = B.r || {};
      c.beta = { ...lineOf(B.p), p: B.p, what: r.what, knows: B.from && B.from.knows, fa: !!(B.from && B.from.fa), left: !!(B.from && B.from.left),
        body: r.body || null, at: moveWord(r), how: B.how || how(r, B.altKind), falls: B.falls || 0, style: r.style || null,
        kind: (B.from && B.from.knows === "style" && r.style) || null };
    }
    if (env.point !== undefined) c.point = env.point;
    if (env.rec != null) c.rec = { ...lineOf(env.rec), p: env.rec };
    // Beta they gave you on a line you've sent since (in the last ten days).
    for (const [p, st] of Object.entries(G.ps || {})) {
      const t = st && st.tips && st.tips[who];
      if (st && st.sent && Array.isArray(t) && st.sentOn && st.sentOn >= t[0] && days(st.sentOn, date) <= 10 && days(st.sentOn, date) >= 0) { c.betaWorked = { ...lineOf(+p), p: +p, alt: t[2] === "alt" }; break; }
    }
    // Friendship (Stage 4): how close you are, a deepening they've yet to mention, how
    // long since you last talked, what you've shared, and what you've done lately.
    const rec = G.social && G.social.npc && G.social.npc[who];
    c.tierN = (Social.tier(G, who) || { n: 0 }).n;
    c.close = c.tierN >= 2;                                        // friends or good friends
    c.up = rec && rec.up ? rec.up.key : null;
    c.gap = env.gap || 0;                                          // days since you last talked, before today
    c.knownFor = met && met.first ? days(met.first, date) : 0;
    c.since = met && met.first ? (n => (n >= 330 ? "about a year" : n >= 60 ? `${num(Math.round(n / 30))} months` : n >= 14 ? `${num(Math.round(n / 7))} weeks` : "a few days"))(days(met.first, date)) : null;
    const sh = Social.shared ? Social.shared(G, who) : {};
    c.shared = sh;
    const oldest = Social.remembers(G, who, ["sendWith"]).filter(x => x[2] != null && x[0] < date).pop();
    if (oldest && days(oldest[0], date) >= 14) c.memory = { ...lineOf(oldest[2]), ago: days(oldest[0], date) };
    if (c.youFa) { const p = +myFa[0]; c.youFa.grade = D.problems[p].grade; c.youFa.hard = D.problems[p].grade >= 4 && D.problems[p].grade >= (G.bestGrade ?? 0) - 1; }
    const lv = G.lvlOn && typeof G.lvlOn === "object" ? Object.entries(G.lvlOn).filter(([, d]) => typeof d === "string" && days(d, date) <= 6 && days(d, date) >= 0).map(([l]) => +l).sort((a, b) => b - a)[0] : null;
    if (lv != null && lv >= 2) c.youLevel = { level: lv };
    if (env.invite && env.invite.who === who) c.invite = env.invite;
    c.invited = !!(G.day && G.day.invite && G.day.invite.who === who && !G.day.invite.seen);
    c.pets = env.pets || 0; c.gusOut = !!env.gusOut;
    // Pickles (Stage 5): how he feels about you, where he is, and whether he's with you now.
    c.dog = Social.dog ? Social.dog(G) : { n: 0 };
    c.dogMode = env.dogMode || "rock";
    c.dogWith = c.dogMode === "with" || c.dogMode === "follow";
    c.yours = c.dog.n >= 4;
    // Rowan (Stage 6): how things stand (Social.romance), whether Rowan's asking you to stay
    // for the sunset (env.sunset), and, for everyone else, whether there's gossip to be had.
    c.ro = Social.romance ? Social.romance(G) : { n: 0 };
    c.sweet = c.ro.n === 2 || c.ro.n === 3;                         // sweet on each other
    c.us = c.ro.n === 4;                                           // together
    c.usDays = c.us ? c.ro.days : -1;
    c.sunsetAsk = !!env.sunset;
    c.rowanSweet = key !== "rowan" && c.sweet && K.met("n:rowan");
    c.rowanUs = key !== "rowan" && c.us && c.usDays <= 45 && K.met("n:rowan");
    // Events and stories (Stage 7): today's event; the last comp (in the fortnight after);
    // a grade they think is off, or someone thinking theirs is; a big new problem to celebrate.
    const nm = w => World.whoName(D, w).replace(/^Ranger /, "").replace(/^the /, "").split(" ")[0];
    const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
    const ev = World.eventOn ? World.eventOn(date) : null;
    c.event = ev ? ev.key : null;
    if (World.eventOn && K.compResults) for (let k = 1; k <= 14; k++) {
      const d = addDays(date, -k), e = World.eventOn(d);
      if (!e || !e.comp) continue;
      const f = K.compResults(d); if (f.length < 3) break;
      const at = w => { const i = f.findIndex(x => x.who === w); return i < 0 ? null : i + 1; };
      const you = at("you"), them = at(who);
      c.comp = { ago: k, winner: f[0].who === "you" ? "you" : f[0].short, winnerWho: f[0].who, score: f[0].score.toLocaleString("en-US"),
        you, youOrd: you ? ORD[you] || `${you}th` : null, them, themOrd: them ? ORD[them] || `${them}th` : null, beatThem: !!(you && them && you < them) };
      break;
    }
    if (W && W.est) {
      const since = addDays(date, -10);
      for (const [p, e] of Object.entries(W.est)) for (const lg of e.logs || []) {
        const [w, d, , , sugg] = lg;
        if (sugg == null || sugg === e.grade || d < since || d > date || e.by === w) continue;
        if (w.startsWith("n:") && World.NAMED[w.slice(2)]) c.anyDispute = true;
        const it = { ...lineOf(+p), p: +p, grade: e.grade, sugg, soft: sugg < e.grade ? "soft" : "sandbagged" };
        if (w === who && !c.dispute) c.dispute = { ...it, fa: e.by.startsWith("n:") && World.NAMED[e.by.slice(2)] ? nm(e.by) : null };
        if (e.by === who && w.startsWith("n:") && World.NAMED[w.slice(2)] && !c.disputed) c.disputed = { ...it, by: nm(w) };
      }
      const big = Object.entries(W.est).filter(([, e]) => e.by !== who && e.by.startsWith("n:") && World.NAMED[e.by.slice(2)] && e.grade >= 8 && days(e.date, date) >= 0 && days(e.date, date) <= 5)
        .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))[0];
      if (big) c.party = { ...lineOf(+big[0]), person: nm(big[1].by), grade: big[1].grade };
    }
    return c;
  }

  // ---- the lines -------------------------------------------------------------------------
  // l(id, mood, when, say, extra): when(c) and say(c) read the context; extra { w, narr, story }.
  const l = (id, mood, when, say, extra = {}) => ({ id, mood, when, say, ...extra });
  const T = () => true;
  const LINES = {
    gus: {
      nod: [l("gus.n.1", "happy", T, () => "Hello again."), l("gus.n.2", "happy", T, () => "Ah. Good to see you."), l("gus.n.3", "thoughtful", T, () => "Everything all right?")],
      first: [l("gus.hi1", "happy", T, () => "Ranger Gus. Welcome to the Hollow. You're one of the first climbers allowed back in since '87, you know."),
        l("gus.hi2", "happy", T, () => "Morning! Gus. I look after the park. Mostly I look after Pickles.")],
      hello: [
        l("gus.h.dog", "thoughtful", c => c.dog && c.dog.n === 3, () => "I see Pickles has found himself a new favourite. He's not my dog, you understand. But I'll be keeping an eye on you.", { w: 3 }),
        l("gus.h.yours", "happy", c => c.yours, () => "How's my— your dog? Our dog. The dog. He looks happy. That's all I wanted.", { w: 3 }),
        l("gus.h.gap", "happy", c => c.gap >= 21, c => `Well, look who it is! ${c.gap >= 45 ? "I was about to put up a missing poster." : "Thought you'd found another park."} Good to have you back.`, { w: 6 }),
        l("gus.h.ev", "happy", c => !!c.event, c => ({"spring": "Spring comp! And before you ask: no, it's not an April Fool. I checked the date twice. Five best sends, same as the fall.", "comp": "Comp day! I've got the clipboard, a coffee tin of pencils and no idea how the scoring works. Five best sends, they tell me. Results at the lot at dusk.", "bonfire": "Shortest day of the year. Climb while it's light; bonfire at The Tailgate at dusk. I've been saving the good logs.", "trail": "Trail Day! Grab a rake. Or a brush. Or a sandwich: Otis brought hundreds.", "midsummer": "Longest day of the year. Everyone's staying till the light goes. Otis has sandwiches. Of course Otis has sandwiches."})[c.event], { w: 8 }),
        l("gus.h.ro", "happy", c => c.rowanSweet, () => "Rowan's asked me what time the park closes twice this week. Looking at you, both times. Just an observation.", { w: 3, story: true }),
        l("gus.h.us", "happy", c => c.rowanUs, () => "So. You and Rowan. Pickles told me. Well, Pickles and everyone else in the lot. About time, if you ask me.", { w: 5, story: true }),
        l("gus.h.drill", "happy", T, () => "Pack it in, pack it out. You know the drill."),
        l("gus.h.early", "happy", c => c.part === "morning", () => "Morning! You're out early. Pickles was up before both of us."),
        l("gus.h.geese", "thoughtful", T, () => "If you see anyone feeding the geese, tell them Gus said no."),
        l("gus.h.wet", "frustrated", c => c.wx.wet, () => "Granite's like a bar of soap today. Stay off it, would you? Saves me the paperwork."),
        l("gus.h.prime", "happy", c => c.prime, () => "Now that's a sky. I'd climb today if I didn't have the gate to fix.", { w: 2 }),
        l("gus.h.cold", "thoughtful", c => c.cold, () => "Brr. Good friction, they tell me. I wouldn't know. I just fix the gate.", { w: 2 }),
        l("gus.h.fav", "happy", c => c.me && (c.tier === "friends" || c.tier === "good"), c => `There's my favourite climber. Don't tell the others, ${c.me}.`, { w: 2 }),
        l("gus.h.dusk", "thoughtful", c => c.part === "evening", () => "Light's going. Gate shuts at dusk, remember. I'll be the one jangling the keys."),
        l("gus.h.truck", "happy", T, () => "Pickles is asleep in my truck again. I've stopped pretending it's my truck."),
        l("gus.h.sign", "thoughtful", T, () => "Somebody drew a moustache on the kiosk map. I'm choosing to take it as a compliment."),
        l("gus.h.fall", "happy", c => c.season === "fall", () => "Leaves are turning. Best time of year out here. Don't tell spring I said that.", { w: 2 }),
        l("gus.h.wkd", "thoughtful", c => c.weekend, () => "Busy one. Three cars in the lot! Practically a festival.", { w: 2 }),
      ],
      today: [
        l("gus.t.fell", "frustrated", c => c.today && c.today.out === "fell" && c.proj, c => `I've been on ${c.proj.full} for ${c.proj.dur} now. Fell off the top again. I blame the boots. The boots are from 1994.`, { w: 3 }),
        l("gus.t.close", "happy", c => c.today && c.today.out === "close" && c.proj, c => `Nearly had ${c.proj.full} this morning. Pickles saw the whole thing. He was very supportive.`, { w: 3 }),
        l("gus.t.send", "excited", c => c.sentToday, c => `I sent ${c.sentToday.full}! First thing I've climbed since the reopening that I didn't have to fix afterwards.`, { w: 5 }),
        l("gus.t.laps", "happy", c => c.today && c.today.out === "mileage", () => "Did a lap of the warm-ups by the lot. Strictly for inspection purposes, you understand.", { w: 2 }),
        l("gus.t.wet", "thoughtful", c => c.today && c.today.out === "wet", () => "Spent the morning clearing the drain by the kiosk. Glamorous work. Pickles supervised."),
      ],
      theirs: [
        l("gus.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `Did I tell you I finally got ${c.done.full}? ${cap(c.done.dur)} on it.${c.around("n:hollis") ? " Hollis wrote it down, so it's official." : ""}`, { w: 3 }),
        l("gus.e.res", "happy", c => c.comp && !c.comp.you, c => `${cap(c.comp.winner)} won the comp, if you missed it. I read the results out by the lot. Pickles sat at the front, like he'd organised it.`, { w: 5, story: true }),
        l("gus.g.mine", "thoughtful", c => c.dispute, c => `${cap(c.dispute.full)}? Felt more like V${c.dispute.sugg} to me. Not that I know anything. I just fix the gate.`, { w: 5, story: true }),
        l("gus.d.fa", "excited", c => c.theirFa && !c.sentToday, c => `I put up ${c.theirFa.full} this week. A ranger's allowed one first ascent. It's in the rules. I wrote the rules.`, { w: 2 }),
      ],
      mine: [
        l("gus.m.level", "excited", c => c.youLevel, c => `V${c.youLevel.level} now, I hear! The whole lot's talking about it. Well. Pickles is.`, { w: 4 }),
        l("gus.e.you", "excited", c => c.comp && c.comp.you && c.comp.you <= 3, c => `${cap(c.comp.youOrd)} at the comp! I read your name out twice, I was that pleased. Pickles barked both times.`, { w: 5, story: true }),
        l("gus.m.hardfa", "excited", c => c.youFa && c.youFa.hard, c => `A V${c.youFa.grade} first ascent! In my park! I'm going to have to make a little sign.`, { w: 5 }),
        l("gus.m.memory", "happy", c => c.close && c.memory, c => `I still think about that day you sent ${c.memory.full}. Pickles does too, I reckon.`, { w: 2 }),
        l("gus.m.fa", "excited", c => c.youFa, c => `Saw ${c.youFa.full} on the CragLog. A first ascent in my park! I'll need to update the map.`, { w: 4 }),
        l("gus.m.send", "happy", c => c.youSent, c => `Heard you got up ${c.youSent.full}. Nice work. Did you leave the holds how you found them?`, { w: 2 }),
        l("gus.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! When you turned up you were climbing the kiosk steps.`, { w: 3 }),
        l("gus.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full} going? Still on it?`, { w: 3 }),
        l("gus.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! Pickles and I are very proud.`, { w: 4 }),
        l("gus.m.with", "happy", c => c.together, c => `Still thinking about that day on ${c.together.full}. Good climbing.`, { w: 2 }),
        l("gus.m.beta", "happy", c => c.betaWorked, c => `${cap(c.betaWorked.full)}! Told you. ${c.betaWorked.alt ? "That trick" : "Slow and steady"} works every time.`, { w: 5 }),
      ],
      others: [l("gus.o.news", "happy", c => c.other, c => `${c.other.person} finally ${c.other.fa ? "put up" : "sent"} ${c.other.full}. ${cap(c.other.dur)} on it. Whole lot heard about it.`, { w: 2 }),
        l("gus.o.party", "happy", c => c.party, c => `${c.party.person} put up ${c.party.full}, and half the Hollow turned up at the lot to celebrate. I pretended not to enjoy it.`, { w: 4, story: true })],
      ask: [
        l("gus.a.proj", "thoughtful", c => c.proj, c => `It's ${c.proj.full}. ${cap(c.proj.dur)} so far. The top's fine. It's the bottom that's the problem. And the middle.`),
        l("gus.a.none", "happy", c => !c.proj, () => "Me? I climb the warm-ups and check they're still there. They always are. Very reassuring."),
      ],
      tell: [
        l("gus.k.did", "happy", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `${cap(c.yourProj.full)}? I've done that one! Took me ages. Ask me how, if you like.`, { w: 3 }),
        l("gus.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}? Keep at it. And brush the holds when you're done; the next person will thank you.`),
      ],
      beta: [
        l("gus.b.alt", "happy", c => c.beta && c.beta.what === "alt", c => `Ah, there's a trick to ${c.beta.full}. ${c.beta.how} Took me a month to see it.`, { w: 3 }),
        l("gus.b.sent", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `${cap(c.beta.at)}. ${c.beta.how} That's how I did it, anyway. Slowly.`),
        l("gus.b.falls", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `You keep coming off ${c.beta.at}. I've seen you from the lot. ${c.beta.how}`, { w: 3 }),
        l("gus.b.proj", "frustrated", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `I haven't done it myself, mind. But I've got as far as ${c.beta.at}: ${c.beta.how}`),
        l("gus.b.style", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `Never been on it. But I know a ${c.beta.kind || "move"} when I see one. At ${c.beta.at}: ${c.beta.how}`),
        l("gus.b.body", "embarrassed", c => c.beta && c.beta.body, c => `I'm a fair bit ${c.beta.body} than you, so take this with a pinch of salt. At ${c.beta.at}: ${c.beta.how}`, { w: 4 }),
      ],
      nobeta: [
        l("gus.x.point", "thoughtful", c => c.point, c => `Not me, I'm afraid. ${c.point.person} has done it, though.${c.point.where ? ` ${cap(c.point.where)}.` : ""}`),
        l("gus.x.none", "embarrassed", c => !c.point, () => "Never been on it, I'm afraid. I mostly climb the ones by the lot."),
      ],
      rec: [
        l("gus.r.1", "happy", c => c.rec, c => `Try ${c.rec.full}. I did it last week. It's just right for a sunny afternoon.`),
        l("gus.r.2", "happy", c => c.rec, c => `If you want something nice, ${c.rec.full}. I've been up it a few times now. Strictly for inspection purposes.`),
      ],
      closer: [
        l("gus.c.know", "happy", c => c.up === "know", c => `${c.me ? c.me + "! " : ""}You're becoming a regular. I'll stop writing your licence plate down.`),
        l("gus.c.friends", "happy", c => c.up === "friends", () => "You know, Pickles has decided you're all right. And between you and me, so have I."),
        l("gus.c.good", "excited", c => c.up === "good", () => "I had a spare gate key cut. I'm not going to give it to you. But I had it cut. That's the sort of thing I do for friends."),
      ],
      note: [
        l("gus.v.1", "happy", c => c.invite, c => `Pickles and I are doing the rounds ${c.invite.where} ${c.invite.when}. Come and keep us company? —Gus`),
        l("gus.v.2", "happy", c => c.invite, c => `If you're about, I'm trying a problem ${c.invite.where} ${c.invite.when}. Need a spotter. Pickles is useless. —Gus`),
      ],
      invited: [l("gus.i.1", "happy", c => c.invited, () => "You got my note! I wasn't sure it would survive the wipers.", { w: 3 })],
      story: [
        l("gus.s.first", "thoughtful", c => c.close, () => "Gus tells you about his first day as ranger, in 1985: one truck, one map, and a radio that only picked up the polka station. “Two years later they shut the climbing. I kept the polka.”", { narr: true, story: true }),
        l("gus.s.keys", "happy", c => c.close, () => "Gus shows you the key ring: forty-one keys, and he knows what about nine of them open. “The other thirty-two are a mystery. I like a mystery.”", { narr: true, story: true }),
        l("gus.s.good", "thoughtful", c => c.tierN >= 3, () => "Gus admits the reopening was his idea, mostly: twenty years of letters to the county. “I just thought the rocks were lonely,” he says, and goes a bit pink.", { narr: true, story: true }),
        l("gus.s.closure", "thoughtful", T, () => "Gus tells you about the closure in '87: insurance, mostly, and one very loud town meeting. “Took thirty-eight years and a new county commissioner to get that gate open again.”", { narr: true, story: true }),
        l("gus.s.pickles", "happy", T, () => "Gus explains that Pickles turned up at the lot as a puppy one spring and simply never left. “He's not my dog. I just feed him. Every day. And he sleeps in my truck.”", { narr: true, story: true }),
        l("gus.s.walls", "thoughtful", T, () => "Gus points out the old quarry road through the trees, and the stone wall the farmers built before there was a park. “Everything out here was something else first.”", { narr: true, story: true }),
        l("gus.s.log", "happy", T, () => "Gus shows you the ranger station's logbook: forty years of weather, one line a day. “Rain. Rain. Sun. Pickles ate a sandwich.”", { narr: true, story: true }),
        l("gus.s.moose", "excited", T, () => "Gus tells you about the moose that walked through the lot in '91. He has clearly told this story many times, and clearly loves it every time.", { narr: true, story: true }),
      ],
      bye: [l("gus.b.gate", "happy", T, () => "Watch the time. Gate shuts at dusk, and I mean it. Mostly."), l("gus.b.go", "happy", T, () => "Off you go. Leave it better than you found it.")],
      again: [l("gus.g.again", "happy", T, () => "Back again? Everything all right out there?"), l("gus.g.more", "happy", T, () => "Forget something? Happens to me twice a day.")],
    },
    hollis: {
      nod: [l("hol.n.1", "neutral", T, () => "Ah, hello."), l("hol.n.2", "thoughtful", T, () => "Oh! Good. Hello."), l("hol.n.3", "happy", T, () => "There you are.")],
      first: [l("hol.hi1", "neutral", T, () => "Hollis Pruitt. I'm keeping notes on everything that goes up out here. Somebody has to."),
        l("hol.hi2", "thoughtful", T, () => "Hollis. I'm documenting every problem in this park. Some of them twice, in case the first one was wrong.")],
      hello: [
        l("hol.h.dog", "happy", c => c.yours && c.dogWith, () => "Hello, Pickles. I've added him to the binder, you know. Under “Dogs, notable”. It's a short section.", { w: 3 }),
        l("hol.h.gap", "excited", c => c.gap >= 21, c => `There you are! I'd marked you as “whereabouts unknown”. ${c.gap >= 45 ? "With a question mark." : "In pencil."} Welcome back.`, { w: 6 }),
        l("hol.h.ev", "excited", c => !!c.event, c => ({"spring": "The spring comp! New season, new scoresheet. I've ruled it by hand.", "comp": "I'm keeping my own scoresheet, as a check on Gus's. Not that I doubt Gus. I doubt arithmetic.", "bonfire": "I've brought the binder. If the Bishop tells the mule story again, I'm noting what changes.", "trail": "Trail Day! I'm recording which trails we fix. In the binder, under “Trails, improved”.", "midsummer": "The longest day. I'm aiming for a personal record: problems documented between sunrise and dark."})[c.event], { w: 8 }),
        l("hol.h.ro", "thoughtful", c => c.rowanSweet, () => "Rowan asked me whether the binder has a section for “people who climb nicely”. It doesn't. I'm thinking of adding one.", { w: 3, story: true }),
        l("hol.h.us", "happy", c => c.rowanUs, () => "I've updated the index. You and Rowan are cross-referenced now. It's the most romantic thing I know how to do.", { w: 5, story: true }),
        l("hol.h.witness", "thoughtful", T, () => "Ah, good. I need a witness. Does the Billboard traverse go left to right, or did I make that up?"),
        l("hol.h.twice", "happy", T, () => "Back again! I've updated the notes. Twice."),
        l("hol.h.prime", "happy", c => c.prime, () => "Prime conditions. I've written that down. I write the weather down every day. It'll matter one day.", { w: 2 }),
        l("hol.h.wet", "happy", c => c.wx.wet, () => "Rain. Excellent. A binder day.", { w: 2 }),
        l("hol.h.school", "thoughtful", T, () => "Did you know the schoolhouse kids used these boulders at recess? I have a whole page on it. Several, actually."),
        l("hol.h.good", "happy", c => c.me && (c.tier === "friends" || c.tier === "good"), c => `${c.me}! I was hoping you'd come by. I need a second opinion on a grade.`, { w: 2 }),
        l("hol.h.pencil", "thoughtful", T, () => "Have you got a pencil? Mine's worn down to nothing. I've been very thorough this week."),
        l("hol.h.correction", "embarrassed", T, () => "I've had to issue a correction to the notes. Page forty. It was a typo. It was a bad typo."),
        l("hol.h.cold", "happy", c => c.cold, () => "Cold enough to see your breath. Historically, that's when the hard problems went up. I checked.", { w: 2 }),
        l("hol.h.morning", "happy", c => c.part === "morning", () => "Good morning. I've been here since eight. Taking notes on the light. Rowan's influence, I suspect.", { w: 1 }),
      ],
      today: [
        l("hol.t.fell", "frustrated", c => c.today && c.today.out === "fell" && c.proj, c => `I've been on ${c.proj.full} for ${c.proj.dur}. I have the whole sequence written out. The sequence is not the problem.`, { w: 3 }),
        l("hol.t.close", "embarrassed", c => c.today && c.today.out === "close" && c.proj, c => `I fell off the last move of ${c.proj.full} today. I've made a note of it. Footnote fourteen.`, { w: 3 }),
        l("hol.t.send", "excited", c => c.sentToday, c => `I did it! ${cap(c.sentToday.full)}. I have to go and record it before I forget. I won't forget.`, { w: 5 }),
        l("hol.t.laps", "thoughtful", c => c.today && c.today.out === "mileage", () => "I've been checking the warm-ups against my notes. Two of the grades are wrong. Well. Disputed.", { w: 2 }),
        l("hol.t.wet", "happy", c => c.today && c.today.out === "wet", () => "Too wet to climb, so I'm re-indexing. The C section was a disgrace."),
      ],
      theirs: [
        l("hol.d.fa", "embarrassed", c => c.theirFa, c => `You might have seen: I made a first ascent. ${cap(c.theirFa.full)}. After all these years of writing down everyone else's.`, { w: 4 }),
        l("hol.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3 && !c.theirFa, c => `I finally sent ${c.done.full}. ${cap(c.done.dur)}. I've written it up. Three pages. I may have overdone it.`, { w: 3 }),
        l("hol.e.them", "excited", c => c.comp && c.comp.them && c.comp.them <= 3, c => `I came ${c.comp.themOrd} at the comp! I've written it in the binder. In pen.`, { w: 5, story: true }),
        l("hol.e.res", "thoughtful", c => c.comp && !(c.comp.them && c.comp.them <= 3), c => `${cap(c.comp.winner)} won the comp with ${c.comp.score} points. I checked Gus's arithmetic. Twice.`, { w: 5, story: true }),
        l("hol.g.mine", "thoughtful", c => c.dispute, c => `I've repeated ${c.dispute.full}. It's ${c.dispute.soft} for V${c.dispute.grade}, I'm afraid: more like V${c.dispute.sugg}. Filed under “Disputes, ongoing”.`, { w: 5, story: true }),
        l("hol.g.theirs", "frustrated", c => c.disputed, c => `${c.disputed.by} says ${c.disputed.full} is ${c.disputed.soft}. ${c.disputed.by} is entitled to an opinion. It's in the binder. In pencil.`, { w: 5, story: true }),
      ],
      mine: [
        l("hol.m.level", "excited", c => c.youLevel, c => `V${c.youLevel.level}! I've updated your entry. You have an entry, did I mention?`, { w: 4 }),
        l("hol.e.you", "excited", c => c.comp && c.comp.you && c.comp.you <= 3, c => `${cap(c.comp.youOrd)} at the comp. It's in the binder, with your scorecard stapled in.`, { w: 5, story: true }),
        l("hol.m.hardfa", "excited", c => c.youFa && c.youFa.hard, c => `${cap(c.youFa.full)}: a V${c.youFa.grade} first ascent. That's a proper addition to the record. I'll need a sketch. I'll do the sketch.`, { w: 5 }),
        l("hol.m.memory", "happy", c => c.close && c.memory, c => `I was re-reading my notes on ${c.memory.full}, from the day you sent it. I wrote “witnessed”. I don't write that for everyone.`, { w: 2 }),
        l("hol.m.fa", "excited", c => c.youFa, c => `I've added ${c.youFa.full} to the binder. I'll need you to confirm the start holds. Officially.`, { w: 4 }),
        l("hol.m.send", "thoughtful", c => c.youSent, c => `${cap(c.youSent.full)}! I'll make a note. What did you think of the grade?`, { w: 2 }),
        l("hol.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `Have you sent ${c.told.full} yet? I've left a gap in the notes.`, { w: 3 }),
        l("hol.m.toldYes", "excited", c => c.told && c.told.sent, c => `${cap(c.told.full)}, sent! I've filled in the gap in the notes. With a little star.`, { w: 4 }),
        l("hol.m.with", "happy", c => c.together, c => `I've written up our day on ${c.together.full}. You come out of it very well.`, { w: 2 }),
        l("hol.m.beta", "excited", c => c.betaWorked, c => `You sent ${c.betaWorked.full} with my beta! I'm adding a footnote. Several.`, { w: 5 }),
      ],
      others: [l("hol.o.news", "thoughtful", c => c.other, c => `For the record: ${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}, after ${c.other.dur}. I have it on good authority. Mine.`, { w: 2 }),
        l("hol.o.party", "excited", c => c.party, c => `${c.party.person} put up ${c.party.full}! I've given it its own page. Two pages.`, { w: 4, story: true })],
      ask: [
        l("hol.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. I have four pages on it. Three are about the crux. The fourth is also, if I'm honest, about the crux.`),
        l("hol.a.none", "embarrassed", c => !c.proj, () => "Nothing just now. I'm between projects. Which is to say I'm writing about other people's."),
      ],
      tell: [
        l("hol.k.did", "happy", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `${cap(c.yourProj.full)}. I've done it. I have notes, if you want them. Of course I have notes.`, { w: 3 }),
        l("hol.k.go", "thoughtful", c => c.yourProj, c => `Ah, ${c.yourProj.full}. Let me see… yes, I have notes. Mostly question marks. Tell me how it goes.`),
      ],
      beta: [
        l("hol.b.alt", "excited", c => c.beta && c.beta.what === "alt", c => `I have this in the binder. ${c.beta.how} Footnote nine. Nobody reads footnote nine.`, { w: 3 }),
        l("hol.b.sent", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `My notes on ${c.beta.at}: “${c.beta.how}” Underlined twice.`),
        l("hol.b.fa", "happy", c => c.beta && c.beta.what === "move" && c.beta.fa && !c.beta.body, c => `It's my first ascent, so technically the beta is mine. ${cap(c.beta.at)}: ${c.beta.how}`, { w: 3 }),
        l("hol.b.falls", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `You've fallen at ${c.beta.at} a good few times. I've been keeping count. Sorry. ${c.beta.how}`, { w: 3 }),
        l("hol.b.proj", "embarrassed", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `I'm still working it myself, so this is provisional. ${cap(c.beta.at)}: ${c.beta.how}`),
        l("hol.b.style", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `I haven't been on it. But I have three pages on ${c.beta.kind || "this kind of"} moves. At ${c.beta.at}: ${c.beta.how}`),
        l("hol.b.body", "thoughtful", c => c.beta && c.beta.body, c => `A caveat, for the record: I'm ${c.beta.body} than you, and it matters here. At ${c.beta.at}: ${c.beta.how}`, { w: 4 }),
      ],
      nobeta: [
        l("hol.x.point", "thoughtful", c => c.point, c => `I don't have notes on that one. ${c.point.person} has climbed it. Ask ${c.point.person}, and then tell me.${c.point.where ? ` ${cap(c.point.where)}.` : ""}`),
        l("hol.x.none", "embarrassed", c => !c.point, () => "Nothing in the binder on that one. An oversight. I'll be honest, it's keeping me up at night."),
      ],
      rec: [
        l("hol.r.1", "happy", c => c.rec, c => `May I recommend ${c.rec.full}? I climbed it recently. The grade is, for once, correct.`),
        l("hol.r.2", "thoughtful", c => c.rec, c => `Have you been on ${c.rec.full}? I did it last week. Very well documented. By me.`),
      ],
      closer: [
        l("hol.c.know", "happy", c => c.up === "know", () => "I've started recognising your chalk bag from across the clearing. That's a sign, in my experience."),
        l("hol.c.friends", "happy", c => c.up === "friends", () => "I've moved you from “acquaintances” to “friends” in the index. It's a very exclusive section. Otis is in it."),
        l("hol.c.good", "excited", c => c.up === "good", () => "I'd like you to have a copy of the binder. A photocopy. Of the important pages. Which is all of them."),
      ],
      note: [
        l("hol.v.1", "thoughtful", c => c.invite, c => `I'll be ${c.invite.where} ${c.invite.when}, checking grades. A second opinion would be very welcome. —H.P.`),
        l("hol.v.2", "happy", c => c.invite, c => `Session ${c.invite.where} ${c.invite.when}? I've brought two pencils, one for you. —Hollis`),
      ],
      invited: [l("hol.i.1", "happy", c => c.invited, () => "You came! I'd put you down as “probable”. I'll change it to “confirmed”.", { w: 3 })],
      story: [
        l("hol.s.why", "thoughtful", c => c.close, () => "Hollis explains the binder, properly, for the first time: a grandmother who climbed here in the sixties and never wrote anything down. “So nobody knows what she did. I didn't want that to happen again.”", { narr: true, story: true }),
        l("hol.s.dispute", "embarrassed", c => c.close, () => "Hollis confesses to the Great Grade Dispute of last spring, conducted entirely in footnotes with someone who turned out to be Hollis, from an earlier draft.", { narr: true, story: true }),
        l("hol.s.good", "happy", c => c.tierN >= 3, c => `Hollis shows you a new tab in the binder. It has your name on it${c.me ? ": “" + c.me + "”" : ""}, in very careful handwriting. “For your problems. All of them. Even the ones you fell off.”`, { narr: true, story: true }),
        l("hol.s.binder", "happy", T, () => "Hollis has a binder. An actual binder, with tabs. Every problem in the park is in it, with sketches, and some of them have footnotes.", { narr: true, story: true }),
        l("hol.s.attend", "thoughtful", T, () => "Hollis explains that the schoolhouse boulders are named after the 1920s attendance book. “Somebody had to. It might as well be accurate.”", { narr: true, story: true }),
        l("hol.s.nofa", "embarrassed", c => !c.anyFa, () => "Hollis admits to never having made a first ascent. “I'm a historian. Someone has to write it down.” Then, quieter: “There's one I've been looking at, though.”", { narr: true, story: true }),
        l("hol.s.fa", "embarrassed", c => c.anyFa, () => "Hollis shows you the binder's page for Hollis's own first ascent: three pages of notes, a sketch and a pressed fern. “I may have overdone it.”", { narr: true, story: true }),
        l("hol.s.dot", "thoughtful", T, () => "Hollis tells you what's known about Dot, which isn't much: a handful of first ascents in the notebook, a tick mark shaped like a dot, and the Bishop's stories, which Hollis files under “disputed”.", { narr: true, story: true }),
      ],
      bye: [l("hol.b.det", "happy", T, () => "Off you go. I'll want details."), l("hol.b.note", "thoughtful", T, () => "Mind how you go. And note the time you topped out, if you can.")],
      again: [l("hol.g.again", "thoughtful", T, () => "Back already? Good. I had a follow-up question."), l("hol.g.more", "happy", T, () => "Ah, you again. I've thought of another footnote.")],
    },
    otis: {
      nod: [l("oti.n.1", "happy", T, () => "Hey hey!"), l("oti.n.2", "happy", T, () => "Well, hello!"), l("oti.n.3", "excited", T, () => "Look who it is!")],
      first: [l("oti.hi1", "excited", T, () => "Otis! Isn't it perfect sending weather?"), l("oti.hi2", "happy", T, () => "Name's Otis. Perfect day for it, isn't it?")],
      hello: [
        l("oti.h.dog", "excited", c => c.yours && c.dogWith, () => "Pickles! Perfect dog weather. Here, he can have the crust.", { w: 3 }),
        l("oti.h.gap", "excited", c => c.gap >= 21, () => "Look who it is! You picked a perfect day to come back. Every day's perfect, but still.", { w: 6 }),
        l("oti.h.ev", "excited", c => !!c.event, c => ({"spring": "Spring comp! The friction's perfect. Well. It's always perfect. Today it's really perfect.", "comp": "Comp day! Perfect comp weather. I'm not going to win. I'm going to have a perfect time.", "bonfire": "I brought marshmallows. And a backup bag of marshmallows.", "trail": "Perfect trail-building weather!", "midsummer": "I made forty sandwiches. Forty-one. I ate one on the drive."})[c.event], { w: 8 }),
        l("oti.h.ro", "happy", c => c.rowanSweet, () => "Rowan's been drawing the same crash pad all morning. Your crash pad. Perfect drawing weather, I suppose.", { w: 3, story: true }),
        l("oti.h.us", "excited", c => c.rowanUs, () => "You and Rowan! Perfect. Perfect weather for it. Every weather is, really, but especially this one.", { w: 5, story: true }),
        l("oti.h.perfect", "happy", T, () => "Perfect sending weather!"),
        l("oti.h.wet", "happy", c => c.wx.wet, () => "Perfect sending weather! Well. Perfect sandwich weather.", { w: 3 }),
        l("oti.h.greasy", "happy", c => c.greasy || c.hot, () => "Bit warm. Perfect for… rest days. And sandwiches.", { w: 3 }),
        l("oti.h.cold", "excited", c => c.cold, () => "Crisp! Your skin'll thank you. Your fingers won't, but your skin will.", { w: 3 }),
        l("oti.h.prime", "excited", c => c.prime, () => "This is the most perfect sending weather I have ever seen. I say that a lot. Today it's true.", { w: 3 }),
        l("oti.h.friend", "happy", c => c.me && (c.tier === "friends" || c.tier === "good"), c => `${c.me}! Perfect timing. I brought too many sandwiches again.`, { w: 2 }),
        l("oti.h.sandwich", "happy", T, () => "Hello hello! I made extra sandwiches. I always make extra sandwiches."),
        l("oti.h.birds", "happy", T, () => "Listen to those chickadees. Perfect sending weather, they're saying. I speak chickadee."),
        l("oti.h.fall", "excited", c => c.season === "fall", () => "Fall! Crisp mornings! The best sending weather of the whole year. Apart from all the others.", { w: 2 }),
        l("oti.h.evening", "happy", c => c.part === "evening", () => "Golden hour! Perfect sending weather for one more go.", { w: 2 }),
      ],
      today: [
        l("oti.t.fell", "happy", c => c.today && c.today.out === "fell" && c.proj, c => `Fell off ${c.proj.full} six times today. Each one better than the last! Well. The last one wasn't.`, { w: 3 }),
        l("oti.t.close", "excited", c => c.today && c.today.out === "close" && c.proj, c => `So close on ${c.proj.full}! I could taste it. It tasted like granite.`, { w: 3 }),
        l("oti.t.send", "excited", c => c.sentToday, c => `I SENT IT. ${cap(c.sentToday.full)}! ${cap(c.sentToday.dur)} on it. I need to sit down. I need a sandwich.`, { w: 5 }),
        l("oti.t.laps", "happy", c => c.today && c.today.out === "mileage", () => "Just doing laps today. Good for the soul. And for the appetite.", { w: 2 }),
        l("oti.t.wet", "happy", c => c.today && c.today.out === "wet", () => "It's nearly dry. It's been nearly dry for two hours. Any minute now."),
      ],
      theirs: [
        l("oti.d.sent", "excited", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `Did you hear? I got ${c.done.full}! After ${c.done.dur}. Perfect conditions. Every one of them.`, { w: 3 }),
        l("oti.e.them", "excited", c => c.comp && c.comp.them, c => `I came ${c.comp.themOrd} at the comp! Perfect, honestly. I had seven sandwiches.`, { w: 5, story: true }),
        l("oti.g.mine", "happy", c => c.dispute, c => `${cap(c.dispute.full)} felt like V${c.dispute.sugg} to me. Perfect conditions, though, so maybe it was just me.`, { w: 5, story: true }),
        l("oti.g.theirs", "excited", c => c.disputed, c => `${c.disputed.by} reckons ${c.disputed.full} is ${c.disputed.soft}! Perfect. People are talking about it.`, { w: 5, story: true }),
        l("oti.d.slab", "happy", c => !c.done && c.proj && c.proj.n >= 6, c => `I've been on ${c.proj.full} for ${c.proj.dur}. It's a relationship now.`, { w: 2 }),
      ],
      mine: [
        l("oti.m.level", "excited", c => c.youLevel, c => `V${c.youLevel.level}! In perfect sending weather, I bet. This calls for a sandwich.`, { w: 4 }),
        l("oti.e.you", "excited", c => c.comp && c.comp.you && c.comp.you <= 3, c => `${cap(c.comp.youOrd)} at the comp! Perfect result. Perfect day.`, { w: 5, story: true }),
        l("oti.m.hardfa", "excited", c => c.youFa && c.youFa.hard, c => `A V${c.youFa.grade} first ascent! ${cap(c.youFa.full)}! I'd have named it “Perfect Sending Weather”. But yours is good too.`, { w: 5 }),
        l("oti.m.memory", "happy", c => c.close && c.memory, c => `Remember ${c.memory.full}? Perfect day. Perfect send. I had two sandwiches.`, { w: 2 }),
        l("oti.m.send", "happy", c => c.youSent, c => `${cap(c.youSent.full)}! I saw from over there. Beautiful. Perfect weather for it, too.`, { w: 2 }),
        l("oti.m.fa", "excited", c => c.youFa, c => `A first ascent! In perfect sending weather! ${cap(c.youFa.full)}. Ha! I love it.`, { w: 4 }),
        l("oti.m.toldNo", "happy", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full}? Don't tell me. It's going perfectly.`, { w: 3 }),
        l("oti.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! I knew it. Perfect conditions?`, { w: 4 }),
        l("oti.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! Look at you!`, { w: 3 }),
        l("oti.m.with", "happy", c => c.together, c => `That day on ${c.together.full}! Perfect sending weather, that was.`, { w: 2 }),
        l("oti.m.beta", "excited", c => c.betaWorked, c => `${cap(c.betaWorked.full)}! My beta! Well. Your climbing. But my beta!`, { w: 5 }),
      ],
      others: [l("oti.o.news", "excited", c => c.other, c => `Did you hear about ${c.other.person}? ${cap(c.other.fa ? "put up" : "sent")} ${c.other.full}! What a week for it.`, { w: 2 }),
        l("oti.o.party", "excited", c => c.party, c => `We had a little party at the lot for ${c.party.person}'s new one: ${c.party.full}. Perfect party weather.`, { w: 4, story: true })],
      ask: [
        l("oti.a.proj", "happy", c => c.proj, c => `${cap(c.proj.full)}! ${cap(c.proj.dur)}. It's the best thing I've never done.`),
        l("oti.a.none", "happy", c => !c.proj, () => "Nothing! Everything! It's that kind of day."),
      ],
      tell: [
        l("oti.k.did", "happy", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `${cap(c.yourProj.full)}! I did that one in a drizzle once. Perfect conditions. Want the beta?`, { w: 3 }),
        l("oti.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}? Oh, you'll get it. Maybe not today. But it's perfect weather for trying.`),
      ],
      beta: [
        l("oti.b.alt", "excited", c => c.beta && c.beta.what === "alt", c => `Oh, I know this one! ${c.beta.how} Changes everything. Perfect.`, { w: 3 }),
        l("oti.b.sent", "happy", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `${cap(c.beta.at)}! ${c.beta.how} And eat something first. That's half of it.`),
        l("oti.b.falls", "happy", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `${cap(c.beta.at)} keeps getting you, eh? ${c.beta.how} Next go's the one.`, { w: 3 }),
        l("oti.b.proj", "happy", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `I haven't sent it! But I've fallen off ${c.beta.at} more than anyone alive. ${c.beta.how}`),
        l("oti.b.style", "happy", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `Never been on it, but a ${c.beta.kind || "move"} is a ${c.beta.kind || "move"}! At ${c.beta.at}: ${c.beta.how}`),
        l("oti.b.body", "embarrassed", c => c.beta && c.beta.body, c => `Thing is, I'm ${c.beta.body} than you, so mine might not work. At ${c.beta.at}: ${c.beta.how} Give it a go anyway!`, { w: 4 }),
      ],
      nobeta: [
        l("oti.x.point", "happy", c => c.point, c => `Not a clue! But ${c.point.person} has done it.${c.point.where ? ` ${cap(c.point.where)}.` : ""} Take a sandwich as a bribe.`),
        l("oti.x.none", "happy", c => !c.point, () => "Never been on it! Sounds perfect, though."),
      ],
      rec: [
        l("oti.r.1", "excited", c => c.rec, c => `Get on ${c.rec.full}! I did it the other day. Perfect conditions. Perfect line.`),
        l("oti.r.2", "happy", c => c.rec, c => `You'd love ${c.rec.full}. I've done it a few times now. It's like a sandwich: good every time.`),
      ],
      closer: [
        l("oti.c.know", "happy", c => c.up === "know", () => "You know what, I'm going to start bringing an extra sandwich for you. Officially."),
        l("oti.c.friends", "excited", c => c.up === "friends", () => "We're friends now, you know. Climbing friends. Sandwich friends. The best kind."),
        l("oti.c.good", "excited", c => c.up === "good", () => "I told Lenny about you on the phone. He says hi. He says I talk about you more than the weather."),
      ],
      note: [
        l("oti.v.1", "happy", c => c.invite, c => `PERFECT SENDING WEATHER ${c.invite.where.toUpperCase()} ${c.invite.when.toUpperCase()}. Bring nothing. I have sandwiches. —Otis`),
        l("oti.v.2", "happy", c => c.invite, c => `I'll be ${c.invite.where} ${c.invite.when}! Come and climb! There will be sandwiches. —O.`),
      ],
      invited: [l("oti.i.1", "excited", c => c.invited, () => "You found my note! Perfect. Sandwich?", { w: 3 })],
      story: [
        l("oti.s.pal", "thoughtful", c => c.close, () => "Otis tells you about Lenny, who climbed with him every weekend from 1994 until Lenny moved to Arizona. “He said it was too humid here. Too humid! It was perfect.” Otis still makes Lenny's sandwich, out of habit.", { narr: true, story: true }),
        l("oti.s.rain", "happy", c => c.close, () => "Otis confides that he does, in fact, know when it's raining. “But if you say it's perfect, people stay. And then you've got company.”", { narr: true, story: true }),
        l("oti.s.good", "happy", c => c.tierN >= 3, () => "Otis hands you a sandwich wrapped in wax paper, with your initial on it in marker. “I've been making you one every time. You weren't always here. I ate those.”", { narr: true, story: true }),
        l("oti.s.1994", "thoughtful", T, () => "Otis has been climbing since 1994, mostly at the same three crags. “People ask why. Well, look at it.” You look at it. He has a point.", { narr: true, story: true }),
        l("oti.s.sandwich", "happy", T, () => "Otis shares half his sandwich. It's an excellent sandwich. He's been on the same slab for months and says it's the best thing he's never done.", { narr: true, story: true }),
        l("oti.s.bad", "thoughtful", T, () => "Otis tells you about the one time it was truly bad weather. Then he decides it wasn't that bad.", { narr: true, story: true }),
        l("oti.s.shoes", "happy", T, () => "Otis tells you about his first climb, in 1994, in borrowed shoes two sizes too small. He sent it. He's been happily chasing that feeling ever since.", { narr: true, story: true }),
      ],
      bye: [l("oti.b.go", "happy", T, () => "Off you go! Perfect sending weather!"), l("oti.b.sand", "happy", T, () => "Have a good one. There's a spare sandwich if you change your mind.")],
      again: [l("oti.g.again", "happy", T, () => "Back again! Still perfect out there?"), l("oti.g.more", "happy", T, () => "Hello again! I've had another sandwich since you left.")],
    },
    rowan: {
      nod: [l("row.n.1", "happy", T, () => "Oh, hi."), l("row.n.2", "happy", T, () => "Hey, you."), l("row.n.3", "embarrassed", T, () => "Hi! Sorry. Hi.")],
      first: [l("row.hi1", "embarrassed", T, () => "Oh! Hi. Sorry, I was sketching. I'm Rowan. This boulder has the best shadows in the morning."),
        l("row.hi2", "happy", T, () => "Hi, I'm Rowan. I come up here to draw the rocks and occasionally climb one.")],
      hello: [
        l("row.h.dog", "happy", c => c.yours && c.dogWith, () => "I've been drawing Pickles curled up by your pad. Such a good model. Never moves.", { w: 3 }),
        // Sweet on each other (Stage 6): Rowan flirts back, a little.
        l("row.h.sw1", "shy", c => c.sweet, () => "Oh, it's you. Good. I mean, hi. I'd hoped it would be you.", { w: 3, sweet: true }),
        l("row.h.sw2", "shy", c => c.sweet, () => "Rowan sees you coming down the trail and tries very hard to look busy with the sketchbook.", { w: 3, narr: true, sweet: true }),
        l("row.h.sw3", "shy", c => c.sweet, () => "I drew you into the corner of this one. For scale. Mostly for scale.", { w: 3, sweet: true }),
        l("row.h.sw4", "smitten", c => c.sweet && c.part === "morning", () => "I brought two pencils today, in case you wanted one. You don't draw. I know. I brought it anyway.", { w: 2, sweet: true }),
        // Together.
        l("row.h.us1", "smitten", c => c.us, () => "Hi, you.", { w: 3, sweet: true }),
        l("row.h.us2", "smitten", c => c.us, () => "There you are. I saved you the flat bit of the pad. And half a sandwich.", { w: 3, sweet: true }),
        l("row.h.us3", "shy", c => c.us && c.part === "morning", () => "Good morning. The light's lovely. You're lovely. I'm going to go back to drawing now.", { w: 3, sweet: true }),
        l("row.h.us4", "laugh", c => c.us && c.wx.wet, () => "It's pouring and I'm completely happy about it. That's your fault, I think.", { w: 3, sweet: true }),
        l("row.h.us5", "smitten", c => c.us && c.gap >= 5 && c.gap < 21, () => "You're back! I've got a whole week of drawings to show you. Most of them are rocks. Some of them aren't.", { w: 5, sweet: true }),
        l("row.h.after", "laugh", c => c.us && c.usDays >= 1 && c.usDays <= 4, () => "Hi. So. The sunset happened. I haven't stopped smiling. Gus asked if I'd hurt my face.", { w: 9, sweet: true, story: true }),
        l("row.h.month", "smitten", c => c.us && c.usDays >= 28 && c.usDays <= 40, () => "It's been a month since the sunset. I drew it from memory and got the colours wrong on purpose. They were better than that.", { w: 9, sweet: true, story: true }),
        l("row.h.year", "smitten", c => c.us && c.usDays >= 365 && c.usDays <= 380, () => "A year since the sunset. I've filled four sketchbooks since then. You're in most of them.", { w: 9, sweet: true, story: true }),
        l("row.h.gap", "happy", c => c.gap >= 21, () => "Oh! You're back. I kept looking up whenever someone came down the trail. Anyway. Hi.", { w: 6 }),
        l("row.h.ev", "happy", c => !!c.event, c => ({"spring": "I'm going to draw everyone's first go of the season. Nobody's warmed up yet. It's lovely.", "comp": "I'm mostly here to draw everyone looking nervous. I might climb a bit.", "bonfire": "The light goes so early today. I'm going to try to draw the fire later. Fire's impossible to draw.", "trail": "Trail Day! Gus gave me a rake and I've no idea what to do with it.", "midsummer": "The light goes on forever today. I've drawn the same boulder four times as it changes."})[c.event], { w: 8 }),
        l("row.h.back", "happy", T, () => "Hey, you're back! I was hoping someone would come up here."),
        l("row.h.light", "thoughtful", c => c.part === "morning", () => "The light's doing something lovely on the rock this morning. I've drawn it three times and it's still wrong.", { w: 2 }),
        l("row.h.glow", "happy", c => c.part !== "morning", () => "The afternoon light makes everything look like it's glowing. Even the chalk.", { w: 2 }),
        l("row.h.wet", "thoughtful", c => c.wx.wet, () => "I love the rock when it's wet. It goes nearly black. Terrible for climbing, though.", { w: 3 }),
        l("row.h.weird", "embarrassed", T, () => "You climb like you're listening to the rock. Is that a weird thing to say? That's a weird thing to say."),
        l("row.h.saved", "happy", c => c.tier === "friends" || c.tier === "good", () => "There you are. I saved you the flat bit of the pad.", { w: 2 }),
        l("row.h.shift", "thoughtful", c => c.dow >= 2 && c.dow <= 6 && c.part !== "morning", () => "I came straight from the library. I still smell like old paper. It's not the worst smell.", { w: 1 }),
        l("row.h.smudge", "embarrassed", T, () => "Sorry, I've got charcoal on my face again, haven't I. It's fine. It's a look."),
        l("row.h.color", "thoughtful", T, () => "Did you know granite has pink in it? Up close. I only noticed because I tried to paint it."),
        l("row.h.fall", "happy", c => c.season === "fall", () => "The maples are doing that thing where everything looks lit from inside. I can't keep up.", { w: 2 }),
        l("row.h.cold", "thoughtful", c => c.cold, () => "My fingers are too cold to draw and too cold to climb. I'm just here for the view, I think.", { w: 2 }),
      ],
      today: [
        l("row.t.fell", "embarrassed", c => c.today && c.today.out === "fell" && c.proj, c => `I've been working ${c.proj.full} for ${c.proj.dur}. I keep falling at the same move, so at least I've got a very good drawing of it.`, { w: 3 }),
        l("row.t.close", "excited", c => c.today && c.today.out === "close" && c.proj, c => `I got to the last move on ${c.proj.full} today. My hands were shaking so much I nearly dropped the pencil afterwards.`, { w: 3 }),
        l("row.t.send", "excited", c => c.sentToday, c => `I did it. ${cap(c.sentToday.full)}. I've been drawing it for weeks, and today I finally climbed it.`, { w: 5 }),
        l("row.t.sketch", "happy", c => c.today && c.today.out === "mileage", () => "I've mostly been sketching today. And climbing a bit, between drawings. Or the other way round.", { w: 2 }),
        l("row.t.wet", "happy", c => c.today && c.today.out === "wet", () => "Too wet to climb, so I'm drawing the drips."),
        l("row.t.usfell", "frustrated", c => c.us && c.today && c.today.out === "fell" && c.proj, c => `Fell off ${c.proj.full} again. Tell me something nice, and then I'll try it once more.`, { w: 4, sweet: true }),
        l("row.t.ussend", "laugh", c => c.us && c.sentToday, c => `I did it! ${cap(c.sentToday.full)}! I wanted you to be the first to know. Well, second. Pickles was there.`, { w: 6, sweet: true }),
      ],
      theirs: [l("row.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `I finally sent ${c.done.full}. The drawing of it is pinned up at the library now. Nobody knows it's a boulder.`, { w: 3 }),
        l("row.e.res", "happy", c => c.comp && !(c.comp.you && c.comp.you <= 3), c => `I drew the whole comp. ${cap(c.comp.winner)}${c.comp.winner === "you" ? "'re" : " is"} mostly a blur. Everyone else is mostly arms.`, { w: 5, story: true }),
        l("row.g.mine", "thoughtful", c => c.dispute, c => `I think ${c.dispute.full} is more like V${c.dispute.sugg}. Or maybe I've drawn it so many times it just feels easy.`, { w: 5, story: true }),
        l("row.g.theirs", "embarrassed", c => c.disputed, c => `${c.disputed.by} says ${c.disputed.full} is ${c.disputed.soft}. I'm choosing to take it as a compliment.`, { w: 5, story: true })],
      mine: [
        l("row.m.level", "excited", c => c.youLevel, c => `V${c.youLevel.level}! I could tell, you know. You climb differently now. Smoother.`, { w: 4 }),
        l("row.e.you", "happy", c => c.comp && c.comp.you && c.comp.you <= 3, () => "I drew you on the podium. You look so surprised in it.", { w: 5, story: true }),
        l("row.m.hardfa", "excited", c => c.youFa && c.youFa.hard, c => `${cap(c.youFa.full)}. A V${c.youFa.grade} first ascent. Can I draw it? I want to get it down before anyone else climbs it.`, { w: 5 }),
        l("row.m.memory", "happy", c => c.close && c.memory, c => `I found the drawing from the day you sent ${c.memory.full}. You're a little smudge at the top, with your arms up.`, { w: 2 }),
        l("row.m.send", "happy", c => c.youSent, c => `I saw you on ${c.youSent.full}. You looked so calm. Was it calm?`, { w: 2 }),
        l("row.m.fa", "excited", c => c.youFa, c => `You named a problem! ${cap(c.youFa.full)}. I'd like to draw it, if that's all right.`, { w: 4 }),
        l("row.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! I knew you would.`, { w: 4 }),
        l("row.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full} going? I've been thinking about that move you told me about.`, { w: 3 }),
        l("row.m.with", "happy", c => c.together, c => `I keep looking at the drawing from the day you sent ${c.together.full}. It's one of my favourites.`, { w: 3 }),
        l("row.m.beta", "happy", c => c.betaWorked, c => `You did ${c.betaWorked.full}! I'm glad the drawing helped.`, { w: 5 }),
        l("row.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! That's your hardest yet, isn't it?`, { w: 3 }),
      ],
      others: [l("row.o.news", "happy", c => c.other, c => `${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}. I drew the celebration. It's mostly arms.`, { w: 2 }),
        l("row.o.party", "happy", c => c.party, c => `Everyone cheered when ${c.party.person} came back to the lot after ${c.party.full}. I drew it. It's mostly arms again.`, { w: 4, story: true })],
      ask: [
        l("row.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. I like it because the holds look like a face. Once you see it you can't unsee it.`),
        l("row.a.none", "happy", c => !c.proj, () => "Nothing really. I'm drawing more than climbing today."),
      ],
      tell: [
        l("row.k.did", "happy", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `I've done ${c.yourProj.full}! I drew the moves afterwards. Do you want to see?`, { w: 3 }),
        l("row.k.go", "thoughtful", c => c.yourProj, c => `${cap(c.yourProj.full)}? Tell me about the hard move. I want to picture it.`),
      ],
      beta: [
        l("row.b.alt", "excited", c => c.beta && c.beta.what === "alt", c => `Wait, I drew this. Look. ${c.beta.how} It's easier to see on paper.`, { w: 3 }),
        l("row.b.sent", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `Rowan flips back through the sketchbook to a drawing of ${c.beta.at}, with little arrows. “${c.beta.how}”`, { narr: true }),
        l("row.b.falls", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `I've watched you on ${c.beta.at}. Your feet come off just before your hands do. ${c.beta.how}`, { w: 3 }),
        l("row.b.proj", "embarrassed", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `I haven't done it either. But I've drawn ${c.beta.at} a lot. ${c.beta.how}`),
        l("row.b.style", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `I haven't tried it. But I'd do ${c.beta.at} the way I'd draw it: ${c.beta.how}`),
        l("row.b.body", "embarrassed", c => c.beta && c.beta.body, c => `I'm ${c.beta.body} than you, so I might be no help. At ${c.beta.at}: ${c.beta.how}`, { w: 4 }),
      ],
      nobeta: [
        l("row.x.point", "thoughtful", c => c.point, c => `I haven't been on it. ${c.point.person} has, I think.${c.point.where ? ` ${cap(c.point.where)}.` : ""}`),
        l("row.x.none", "embarrassed", c => !c.point, () => "I haven't been on it. Sorry. I'd like to see it, though."),
      ],
      rec: [
        l("row.r.1", "happy", c => c.rec, c => `Have you tried ${c.rec.full}? I did it recently. The light on it in the afternoon is lovely.`),
        l("row.r.2", "thoughtful", c => c.rec, c => `${cap(c.rec.full)}. I climbed it last week and thought of you. Is that weird? It suits how you climb.`),
      ],
      closer: [
        l("row.c.know", "happy", c => c.up === "know", () => "I've started saving you a spot on the pad without thinking about it. I hope that's all right."),
        l("row.c.friends", "happy", c => c.up === "friends", () => "I'm really glad you keep coming up here. It's better with you around."),
        l("row.c.good", "embarrassed", c => c.up === "good", () => "I've started drawing you into the background of all my boulders. They look a bit empty without you now."),
      ],
      note: [
        l("row.v.1", "happy", c => c.invite, c => `I'll be ${c.invite.where} ${c.invite.when}, drawing and maybe climbing. Come by? —R.`),
        l("row.v.2", "happy", c => c.invite && !c.us, c => `${cap(c.invite.where)}, ${c.invite.when}. The light should be lovely. It'd be nice to climb together. —Rowan`),
        l("row.v.sw", "shy", c => c.invite && c.sweet, c => `${cap(c.invite.where)}, ${c.invite.when}. Come and climb? I'll save you the flat bit of the pad. —R.`, { w: 3 }),
        l("row.v.sun", "shy", c => c.invite && c.invite.sunset, c => `${cap(c.invite.where)}, ${c.invite.when}. Stay for the sunset? I know a spot. —R.`),
        l("row.v.us1", "smitten", c => c.invite && c.us, c => `${cap(c.invite.where)}, ${c.invite.when}. I'll bring the good sandwiches. —R`, { w: 3 }),
        l("row.v.us2", "smitten", c => c.invite && c.us, c => `Come and find me ${c.invite.where} ${c.invite.when}. I've drawn you something. —R`, { w: 3 }),
      ],
      invited: [l("row.i.1", "happy", c => c.invited && !c.us, () => "You came. I was hoping the note didn't blow away.", { w: 3 }),
        l("row.i.us", "shy", c => c.invited && c.us, () => "You found the note! I drew a little heart on it, then panicked and nearly rubbed it out.", { w: 3, sweet: true })],
      // Stay for the sunset? (Once it's ready: Social.romance's canAsk.)
      sunset: [
        l("row.u.ask1", "shy", c => c.sunsetAsk && !c.ro.declined, () => "Are you staying till dusk? I know a spot where the whole valley goes pink at sunset. It's not a— well. It might be. Do you want to come?", { sweet: true }),
        l("row.u.ask2", "shy", c => c.sunsetAsk && !c.ro.declined, () => "Stay for the sunset? There's a boulder up the hill with the best view in the park. I've been saving it.", { sweet: true }),
        l("row.u.again", "smitten", c => c.sunsetAsk && c.ro.declined > 0, () => "The sunset's meant to be good tonight. Same spot? No pressure. It's a very good spot either way.", { sweet: true }),
      ],
      sunsetNo: [
        l("row.u.no1", "happy", T, () => "Another time, then. The sun's not going anywhere. Well. It is. But it'll be back."),
        l("row.u.no2", "embarrassed", T, () => "That's all right! Honestly. I'll draw it for you instead."),
      ],
      story: [
        l("row.s.why", "thoughtful", c => c.close, () => "Rowan tells you why the drawing started: a year when everything felt too fast, and an art teacher who said “draw what's in front of you, slowly”. “Boulders are very good at staying still.”", { narr: true, story: true }),
        l("row.s.library", "happy", c => c.close, () => "Rowan tells you about the regulars at the library: a man who reads every bus timetable, a girl working through the encyclopedia, a cat nobody owns. “It's a bit like here, really.”", { narr: true, story: true }),
        l("row.s.good", "happy", c => c.tierN >= 3, () => "Rowan tears a page out of the sketchbook and gives it to you: the two of you, small, on a pad under a big grey boulder, done in charcoal. “I wanted you to have one.”", { narr: true, story: true }),
        l("row.s.book", "thoughtful", T, () => "Rowan shows you a sketchbook full of boulders, each with tiny arrows for the moves. “I can't always climb them. But I can draw them.”", { narr: true, story: true }),
        l("row.s.moved", "happy", T, () => "Rowan moved to the village in the spring for a job at the library, and found the park by accident on a walk. “I thought the rocks looked like they wanted to be climbed.”", { narr: true, story: true }),
        l("row.s.nothing", "happy", T, () => "You talk about nothing much for twenty minutes: the light on the rock, the best sandwich in the village, a song you both half remember. It's nice.", { narr: true, story: true }),
        l("row.s.winter", "thoughtful", T, () => "Rowan shows you a drawing of the Hollow in winter, all snow and dark rock. “I've never actually seen it in winter. I'm guessing.”", { narr: true, story: true }),
      ],
      bye: [l("row.b.see", "happy", c => !c.us, () => "See you around? I'll be here. Probably drawing."), l("row.b.careful", "happy", c => !c.us, () => "Climb well. Not that you need me to say that."),
        l("row.b.sw", "shy", c => c.sweet, () => "Bye. I mean, see you soon. I mean— bye!", { w: 2, sweet: true }),
        l("row.b.us1", "smitten", c => c.us, () => "See you later? Don't fall off anything. Or do, and I'll draw it.", { sweet: true }),
        l("row.b.us2", "smitten", c => c.us, () => "Rowan squeezes your hand. “Go on, then. Go and climb something.”", { narr: true, sweet: true })],
      again: [l("row.g.again", "happy", T, () => "Oh, hi again. I was just drawing your pad. Is that weird?"), l("row.g.more", "embarrassed", T, () => "Back already? Good. I mean, hi.")],
    },
    bea: {
      nod: [l("bea.n.1", "excited", T, () => "Hiii!"), l("bea.n.2", "happy", T, () => "Oh hey!"), l("bea.n.3", "excited", T, () => "Hey hey hey!")],
      first: [l("bea.hi1", "excited", T, () => "I'm Bea! Have you tried jumping for it? You should always try jumping for it."),
        l("bea.hi2", "excited", T, () => "Hi! Bea. Did you see that? I almost stuck it. Almost!")],
      hello: [
        l("bea.h.dog", "excited", c => c.yours && c.dogWith, () => "PICKLES!! Oh, and hi. Hi. But PICKLES.", { w: 3 }),
        l("bea.h.gap", "excited", c => c.gap >= 21, () => "WHERE HAVE YOU BEEN. Okay, sorry. Hi. I've learned SO many dynos since.", { w: 6 }),
        l("bea.h.ev", "excited", c => !!c.event, c => ({"spring": "SPRING COMP. I trained ALL WINTER. On a pull-up bar in my closet.", "comp": "COMP DAY. I've been training since September. Mostly dynos. Okay, only dynos.", "bonfire": "Bonfire! My mom says I can stay till it's over. Over-over.", "trail": "We get to MOVE ROCKS. On purpose!", "midsummer": "Climbing till dark!! With HEADLAMPS!"})[c.event], { w: 8 }),
        l("bea.h.ro", "excited", c => c.rowanSweet, () => "Rowan drew you AGAIN. I saw. Are you two— no. Never mind. Forget I said anything. (Are you, though?)", { w: 3, story: true }),
        l("bea.h.us", "excited", c => c.rowanUs, () => "OH MY GOD. You and ROWAN? I KNEW it. I called it weeks ago. Nobody ever listens to me.", { w: 5, story: true }),
        l("bea.h.almost", "excited", T, () => "Did you see that? I almost stuck it! Almost!"),
        l("bea.h.school", "excited", c => !c.weekend && c.part !== "morning" && c.season !== "summer", () => "School was SO long today. I've got till my mom gets here. Go go go.", { w: 3 }),
        l("bea.h.nine", "happy", c => c.weekend && c.part === "morning", () => "My mom dropped me off at nine. I've already done like forty dynos.", { w: 3 }),
        l("bea.h.wet", "frustrated", c => c.wx.wet, () => "Everything's wet and I'm going to scream.", { w: 3 }),
        l("bea.h.cold", "excited", c => c.cold, () => "My fingers are numb but the friction is UNREAL.", { w: 3 }),
        l("bea.h.jumped", "happy", T, () => "Okay but what if you just jumped?"),
        l("bea.h.friend", "excited", c => c.me && (c.tier === "friends" || c.tier === "good"), c => `${c.me}! Come watch this. Okay don't watch. Okay watch.`, { w: 2 }),
        l("bea.h.shoes", "excited", T, () => "I got new shoes! Okay they're my cousin's old shoes. They're new to me!"),
        l("bea.h.dyno", "happy", T, () => "I've decided every problem is a dyno if you believe in yourself."),
        l("bea.h.test", "frustrated", c => !c.weekend && c.season !== "summer", () => "I have a chemistry test tomorrow and I'm here. This is fine.", { w: 2 }),
        l("bea.h.summer", "excited", c => c.season === "summer", () => "Summer means I can climb EVERY DAY. Mom says that's not a plan. It's a plan.", { w: 2 }),
      ],
      today: [
        l("bea.t.fell", "frustrated", c => c.today && c.today.out === "fell" && c.proj, c => `I've been on ${c.proj.full} for ${c.proj.dur} and I keep jumping too early.${c.around("n:dez") ? " Dez says I jump too early." : ""} I jump too early.`, { w: 3 }),
        l("bea.t.close", "excited", c => c.today && c.today.out === "close" && c.proj, c => `I touched the top hold of ${c.proj.full}! Touched it! Didn't hold it. Touched it.`, { w: 3 }),
        l("bea.t.send", "excited", c => c.sentToday, c => `I SENT ${c.sentToday.full.toUpperCase()}! I'm telling everyone. You're the first. Second. Third.`, { w: 5 }),
        l("bea.t.warm", "happy", c => c.today && c.today.out !== "wet" && c.today.warm, c => `I stuck the dyno on ${c.today.warm.full} again this morning. Then I tried a slab for forty minutes and got absolutely nowhere. Slab is fake.`, { w: 3 }),
        l("bea.t.wet", "frustrated", c => c.today && c.today.out === "wet", () => "I've been practising dynos on a log. The log is winning."),
      ],
      theirs: [l("bea.d.sent", "excited", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `I sent ${c.done.full}! After ${c.done.dur}! I still can't believe it. I keep thinking about it in class.`, { w: 3 }),
        l("bea.e.them", "excited", c => c.comp && c.comp.them && c.comp.them <= 3 && !c.comp.beatThem, c => `I came ${c.comp.themOrd} at the comp!!! I'm putting it on my college applications.`, { w: 5, story: true }),
        l("bea.e.res", "excited", c => c.comp && !(c.comp.them && c.comp.them <= 3) && !c.comp.beatThem, c => `${cap(c.comp.winner)} won the comp. I'm going to beat ${c.comp.winner === "you" ? "you" : "everyone"} next year. I've decided.`, { w: 5, story: true }),
        l("bea.g.mine", "excited", c => c.dispute, c => `${cap(c.dispute.full)} is SO ${c.dispute.soft}. V${c.dispute.sugg}, max. I'm not being dramatic.`, { w: 5, story: true }),
        l("bea.g.theirs", "frustrated", c => c.disputed, c => `${c.disputed.by} says ${c.disputed.full} is ${c.disputed.soft}!! It is NOT. Okay, it might be.`, { w: 5, story: true })],
      mine: [
        l("bea.m.level", "excited", c => c.youLevel, c => `V${c.youLevel.level}!! That's so good! Okay now try a dyno at that grade.`, { w: 4 }),
        l("bea.e.beat", "frustrated", c => c.comp && c.comp.beatThem, () => "You BEAT me at the comp. Rematch. Next year. I'm already training.", { w: 5, story: true }),
        l("bea.m.hardfa", "excited", c => c.youFa && c.youFa.hard, c => `A V${c.youFa.grade} FIRST ASCENT?! ${c.youFa.full.toUpperCase()}! I'm telling my mom. She won't get it. I'm telling her.`, { w: 5 }),
        l("bea.m.memory", "happy", c => c.close && c.memory, c => `Remember when you did ${c.memory.full} and I screamed? I'm still proud of that scream.`, { w: 2 }),
        l("bea.m.send", "excited", c => c.youSent, c => `You got ${c.youSent.full}?! Did you jump for it? You should've jumped for it.`, { w: 2 }),
        l("bea.m.fa", "excited", c => c.youFa, c => `You made a first ascent! ${cap(c.youFa.full)}. That's SO good.`, { w: 4 }),
        l("bea.m.hard", "excited", c => c.youHardest, c => `Your hardest one yet?! V${c.youHardest.grade}! Okay that's amazing.`, { w: 3 }),
        l("bea.m.toldNo", "happy", c => c.told && !c.told.sent && c.told.ago >= 2, c => `Did you send ${c.told.full} yet? Just jump.`, { w: 3 }),
        l("bea.m.toldYes", "excited", c => c.told && c.told.sent, c => `YOU SENT ${c.told.full.toUpperCase()}!`, { w: 4 }),
        l("bea.m.with", "happy", c => c.together, c => `That day on ${c.together.full} was the best. I told my mom about it. She said “that's nice, sweetie.”`, { w: 2 }),
        l("bea.m.beta", "excited", c => c.betaWorked, c => `YOU DID ${c.betaWorked.full.toUpperCase()} WITH MY BETA. I'm telling everyone.`, { w: 5 }),
      ],
      others: [l("bea.o.news", "excited", c => c.other, c => `Did you hear ${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}?! I wasn't there. I heard about it. I'm basically a witness.`, { w: 2 }),
        l("bea.o.party", "excited", c => c.party, c => `${c.party.person} put up ${c.party.full}!! There was CAKE. Well, Otis had a muffin. We shared it.`, { w: 4, story: true })],
      ask: [
        l("bea.a.proj", "excited", c => c.proj, c => `${cap(c.proj.full)}! It's not a dyno. I'm making it a dyno.`),
        l("bea.a.none", "happy", c => !c.proj, () => "Nothing! Everything! Whatever looks jumpy."),
      ],
      tell: [
        l("bea.k.did", "embarrassed", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `I did ${c.yourProj.full}! Want the beta? It's not “jump”. Okay, it's a little bit “jump”.`, { w: 3 }),
        l("bea.k.go", "excited", c => c.yourProj, c => `${cap(c.yourProj.full)}! Have you tried jumping for it?`),
      ],
      beta: [
        l("bea.b.alt", "excited", c => c.beta && c.beta.what === "alt", c => `OKAY so. ${c.beta.how} It's SO much easier. Nobody believes me.`, { w: 3 }),
        l("bea.b.sent", "excited", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `${cap(c.beta.at)}! ${c.beta.how} Or jump. No. Do the first thing.`),
        l("bea.b.falls", "happy", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `I've seen you fall off ${c.beta.at} like a hundred times. Not in a mean way! ${c.beta.how}`, { w: 3 }),
        l("bea.b.proj", "frustrated", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `I'm working it too! I can do ${c.beta.at}: ${c.beta.how} After that I have no idea.`),
        l("bea.b.style", "excited", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `I haven't tried it, but it's a ${c.beta.kind || "move"}, so: at ${c.beta.at}, ${c.beta.how.charAt(0).toLowerCase() + c.beta.how.slice(1)}`),
        l("bea.b.body", "embarrassed", c => c.beta && c.beta.body, c => `Okay, I'm ${c.beta.body} than you, so this might be useless. At ${c.beta.at}: ${c.beta.how}`, { w: 4 }),
      ],
      nobeta: [
        l("bea.x.point", "excited", c => c.point, c => `No idea! Ask ${c.point.person}. ${c.point.person} has done it.${c.point.where ? ` ${cap(c.point.where)}.` : ""}`),
        l("bea.x.none", "happy", c => !c.point, () => "Never been on it! Have you tried jumping?"),
      ],
      rec: [
        l("bea.r.1", "excited", c => c.rec, c => `Try ${c.rec.full}! I did it like a week ago. It's basically a dyno if you want it to be.`),
        l("bea.r.2", "excited", c => c.rec, c => `${cap(c.rec.full)}! I just did it. You'd crush it. You should do it now. Or after lunch.`),
      ],
      closer: [
        l("bea.c.know", "excited", c => c.up === "know", () => "Okay you're officially one of my crag people now. There's no test. Well, there's one test. Jump for something."),
        l("bea.c.friends", "excited", c => c.up === "friends", () => "We're friends now! Climbing friends! I'm going to text you dynos. I don't have your number. I'll text them in my head."),
        l("bea.c.good", "excited", c => c.up === "good", () => "You're honestly one of my favourite people. At the crag. And in general. Okay, moving on, look at this dyno."),
      ],
      note: [
        l("bea.v.1", "excited", c => c.invite, c => `${c.invite.where.toUpperCase()} ${c.invite.when.toUpperCase()}!!! Dyno session. Be there!! —Bea`),
        l("bea.v.2", "excited", c => c.invite, c => `I'll be ${c.invite.where} ${c.invite.when} (mom's dropping me off). Come climb!!! —B`),
      ],
      invited: [l("bea.i.1", "excited", c => c.invited, () => "YOU CAME!! Okay okay okay, I have so many things to show you.", { w: 3 })],
      story: [
        l("bea.s.college", "thoughtful", c => c.close, () => "Bea admits she's been looking at colleges, but only the ones near good bouldering. “Mom says that's not how you pick. It's exactly how you pick.”", { narr: true, story: true }),
        l("bea.s.first", "happy", c => c.close, () => "Bea tells you about her first time climbing, at a birthday party at the gym when she was nine. She jumped for the top hold of a route. “They said you can't do that. I did that.”", { narr: true, story: true }),
        l("bea.s.good", "embarrassed", c => c.tierN >= 3, () => "Bea admits that before she met everyone here, she climbed alone and was a bit lonely. “Now it's like having a crag family. You're like my cool cousin. Don't make it weird.”", { narr: true, story: true }),
        l("bea.s.log", "happy", T, () => "Bea demonstrates a dyno on a log. She doesn't stick it. She is delighted anyway.", { narr: true, story: true }),
        l("bea.s.questions", "excited", T, () => "Bea wants to know your hardest send, your favourite problem, your shoe size and whether you've ever fallen off the top of something. All at once.", { narr: true, story: true }),
        l("bea.s.highball", "embarrassed", T, c => `Bea admits she's a bit scared of highballs. “Don't tell anyone.${c.around("n:dez") ? " Especially Dez." : ""}”`, { narr: true, story: true }),
        l("bea.s.snacks", "happy", T, () => "Bea explains her ranking of every snack at the gas station by the highway. It's very detailed. The peanut butter cups win by a mile.", { narr: true, story: true }),
      ],
      bye: [l("bea.b.bye", "excited", T, () => "Byeee! Jump for things!"), l("bea.b.mom", "happy", T, () => "Okay bye! If my mom asks, I was resting.")],
      again: [l("bea.g.again", "excited", T, () => "You're back! Did you see me just now? No? Okay, I'll do it again."), l("bea.g.more", "happy", T, () => "Hi again! I've done like ten more dynos since you left.")],
    },
    dez: {
      nod: [l("dez.n.1", "neutral", T, () => "Hey."), l("dez.n.2", "happy", T, () => "Mm. Hi."), l("dez.n.3", "neutral", c => c.part === "morning", () => "Morning.")],
      first: [l("dez.hi1", "neutral", T, () => "Dez. Good to meet you."), l("dez.hi2", "neutral", T, () => "…Dez. Hi.")],
      hello: [
        l("dez.h.dog", "happy", c => c.yours && c.dogWith, () => "Hey, Pickles. …And you.", { w: 3 }),
        l("dez.h.gap", "happy", c => c.gap >= 21, () => "Hey. Been a while. Good to see you.", { w: 6 }),
        l("dez.h.ev", "happy", c => !!c.event, c => ({"spring": "Comp again. …Good.", "comp": "Comp. …Good.", "bonfire": "Bonfire later. I'll stay for a bit.", "trail": "Trail Day. Brought gloves.", "midsummer": "Long day. Good."})[c.event], { w: 8 }),
        l("dez.h.ro", "thoughtful", c => c.rowanSweet, () => "Rowan keeps looking over here. Not at me.", { w: 3, story: true }),
        l("dez.h.us", "happy", c => c.rowanUs, () => "Heard about you and Rowan. …Good. Really.", { w: 5, story: true }),
        l("dez.h.mm", "neutral", T, () => "Mm. Good conditions."),
        l("dez.h.prime", "happy", c => c.prime, () => "Good day.", { w: 2 }),
        l("dez.h.wet", "thoughtful", c => c.wx.wet, () => "Wet.", { w: 2 }),
        l("dez.h.early", "happy", c => c.part === "morning", () => "You're up early.", { w: 2 }),
        l("dez.h.nice", "neutral", T, () => "Nice to see you out."),
        l("dez.h.friend", "happy", c => c.tier === "friends" || c.tier === "good", () => "Hey. Good to see you.", { w: 2 }),
        l("dez.h.coffee", "neutral", T, () => "Coffee's still warm, if you want some."),
        l("dez.h.quiet", "happy", T, () => "Quiet out today. Good."),
        l("dez.h.cold", "happy", c => c.cold, () => "Cold. Good friction.", { w: 2 }),
        l("dez.h.hot", "thoughtful", c => c.hot || c.greasy, () => "Too warm. Waiting for shade.", { w: 2 }),
      ],
      today: [
        l("dez.t.fell", "thoughtful", c => c.today && c.today.out === "fell" && c.proj, c => `${cap(c.proj.full)}. ${cap(c.proj.dur)}. Not yet.`, { w: 3 }),
        l("dez.t.close", "thoughtful", c => c.today && c.today.out === "close" && c.proj, c => `Close today. On ${c.proj.full}.`, { w: 3 }),
        l("dez.t.send", "happy", c => c.sentToday, c => `Did ${c.sentToday.full} this morning. …Felt good.`, { w: 5 }),
        l("dez.t.laps", "neutral", c => c.today && c.today.out === "mileage", () => "Just moving. Easy day.", { w: 2 }),
        l("dez.t.wet", "neutral", c => c.today && c.today.out === "wet", () => "Waiting."),
      ],
      theirs: [l("dez.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `Finished ${c.done.full}. ${cap(c.done.dur)}. Worth it.`, { w: 3 }),
        l("dez.e.won", "happy", c => c.comp && c.comp.them === 1, () => "Won the comp. …Don't tell anyone I was nervous.", { w: 5, story: true }),
        l("dez.g.mine", "neutral", c => c.dispute, c => `${cap(c.dispute.full)}. Felt like V${c.dispute.sugg}.`, { w: 5, story: true }),
        l("dez.g.theirs", "thoughtful", c => c.disputed, c => `${c.disputed.by} thinks ${c.disputed.full} is ${c.disputed.soft}. Could be.`, { w: 5, story: true })],
      mine: [
        l("dez.m.level", "happy", c => c.youLevel, c => `V${c.youLevel.level}. Nice.`, { w: 4 }),
        l("dez.e.beat", "happy", c => c.comp && c.comp.beatThem && c.comp.you === 1, () => "You beat me. At the comp. …Good. Again next year.", { w: 5, story: true }),
        l("dez.m.hardfa", "happy", c => c.youFa && c.youFa.hard, c => `${cap(c.youFa.full)}. V${c.youFa.grade}, first ascent. …Respect.`, { w: 5 }),
        l("dez.m.memory", "happy", c => c.close && c.memory, c => `${cap(c.memory.full)}. Still a good day, that.`, { w: 2 }),
        l("dez.m.send", "happy", c => c.youSent, c => `Saw ${c.youSent.full}. Clean.`, { w: 2 }),
        l("dez.m.fa", "happy", c => c.youFa, c => `${cap(c.youFa.full)}. Good name.`, { w: 4 }),
        l("dez.m.hard", "happy", c => c.youHardest, () => "You're getting strong.", { w: 3 }),
        l("dez.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `${cap(c.told.full)}. Still on it?`, { w: 3 }),
        l("dez.m.toldYes", "happy", c => c.told && c.told.sent, c => `Heard about ${c.told.full}. Nice.`, { w: 4 }),
        l("dez.m.with", "happy", c => c.together, c => `Good day, that one. ${cap(c.together.full)}.`, { w: 2 }),
        l("dez.m.beta", "happy", c => c.betaWorked, c => `${cap(c.betaWorked.full)}. Told you.`, { w: 5 }),
      ],
      others: [l("dez.o.news", "neutral", c => c.other, c => `${c.other.person} ${c.other.fa ? "put up" : "got"} ${c.other.full}. Good for them.`, { w: 2 }),
        l("dez.o.party", "neutral", c => c.party, c => `${c.party.person}. ${cap(c.party.full)}. Strong.`, { w: 4, story: true })],
      ask: [l("dez.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. Hard. Good.`), l("dez.a.none", "neutral", c => !c.proj, () => "Nothing right now. Looking.")],
      tell: [
        l("dez.k.did", "thoughtful", c => c.yourProj && c.yourProj.theyDid && !c.yourProj.tipped, c => `${cap(c.yourProj.full)}. Did it. Want the beta?`, { w: 3 }),
        l("dez.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}. You'll get it.`),
      ],
      beta: [
        l("dez.b.alt", "happy", c => c.beta && c.beta.what === "alt", c => `${c.beta.how} …Changes it.`, { w: 3 }),
        l("dez.b.sent", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "sent" && !c.beta.body, c => `${cap(c.beta.at)}. ${c.beta.how}`),
        l("dez.b.falls", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.falls >= 3 && !c.beta.body, c => `${cap(c.beta.at)}. You keep coming off there. ${c.beta.how}`, { w: 3 }),
        l("dez.b.proj", "thoughtful", c => c.beta && c.beta.what === "move" && c.beta.knows === "proj", c => `Working it too. ${cap(c.beta.at)}: ${c.beta.how}`),
        l("dez.b.style", "neutral", c => c.beta && c.beta.what === "move" && c.beta.knows === "style", c => `Haven't tried it. ${cap(c.beta.at)}, though. ${c.beta.how}`),
        l("dez.b.body", "thoughtful", c => c.beta && c.beta.body, c => `I'm ${c.beta.body}. Might not work for you. ${cap(c.beta.at)}: ${c.beta.how}`, { w: 4 }),
      ],
      nobeta: [
        l("dez.x.point", "neutral", c => c.point, c => `Not me. ${c.point.person}.${c.point.where ? ` ${cap(c.point.where)}.` : ""}`),
        l("dez.x.none", "neutral", c => !c.point, () => "Haven't been on it."),
      ],
      rec: [
        l("dez.r.1", "happy", c => c.rec, c => `${cap(c.rec.full)}. Did it last week. Good moves.`),
        l("dez.r.2", "neutral", c => c.rec, c => `Try ${c.rec.full}. You'd like it.`),
      ],
      closer: [
        l("dez.c.know", "happy", c => c.up === "know", () => "You're here a lot. Good."),
        l("dez.c.friends", "happy", c => c.up === "friends", () => "…Glad you're around. Saying it once."),
        l("dez.c.good", "happy", c => c.up === "good", () => "You're a good friend. Not many of those out here. Well. Not many of those anywhere."),
      ],
      note: [
        l("dez.v.1", "neutral", c => c.invite, c => `${cap(c.invite.where)}. ${cap(c.invite.when)}. Climb? —D`),
        l("dez.v.2", "neutral", c => c.invite, c => `Session ${c.invite.where}, ${c.invite.when}. Coffee's on me. —Dez`),
      ],
      invited: [l("dez.i.1", "happy", c => c.invited, () => "You came. Good.", { w: 3 })],
      story: [
        l("dez.s.mornings", "thoughtful", c => c.close, () => "Dez explains the early mornings: night shifts at the hospital, then straight here before sleep. “Quiet. Cold rock. Nobody asking anything.” A pause. “You don't count.”", { narr: true, story: true }),
        l("dez.s.fear", "thoughtful", c => c.close, () => "Dez tells you, unprompted, about being scared of highballs for years, and climbing them anyway, slowly, one move higher each time. “Still scared. Just better at it.”", { narr: true, story: true }),
        l("dez.s.good", "happy", c => c.tierN >= 3, () => "Dez hands you a thermos lid of coffee before you've asked, the way you'd hand one to an old friend. “You're one of the good ones,” Dez says, and goes back to the problem.", { narr: true, story: true }),
        l("dez.s.light", "thoughtful", T, () => "Dez doesn't say much. You sit and watch the light move across the rock. After a while: “That one's been bugging me for a month.”", { narr: true, story: true }),
        l("dez.s.rest", "happy", T, () => "Dez says the trick to hard climbing is resting properly. Then demonstrates, by lying down on the pad and closing their eyes.", { narr: true, story: true }),
        l("dez.s.listen", "happy", T, () => "Dez asks what you're working on, and listens properly to the whole answer. “You'll get it,” Dez says, as if it's a fact.", { narr: true, story: true }),
        l("dez.s.trip", "thoughtful", T, () => "Dez tells you about a boulder in another country that took three trips to send. It's the most words you've ever heard Dez say. At the end: “Worth it.”", { narr: true, story: true }),
      ],
      bye: [l("dez.b.see", "neutral", T, () => "See you."), l("dez.b.good", "happy", T, () => "Good session.")],
      again: [l("dez.g.again", "neutral", T, () => "Hey again."), l("dez.g.more", "happy", T, () => "Mm. Hi.")],
    },
  };
  // The Bishop: unreliable about the past, reliable about directions.
  const BISHOP_YEARS = [1971, 1973, 1974, 1976, 1977, 1978, 1979, 1981, 1983, 1986];
  const BISHOP_HOW = ["In work boots.", "Without a pad. We didn't have pads. We had a doormat.", "In the rain, mind you.", "Dot spotted me. Or I spotted her. One of the two.",
    "Backwards, as I recall.", "Twice. The second time for fun.", "Wearing a tie. It was a Sunday.", "With a stick. No, that was the other one."];
  const yy = r => String(BISHOP_YEARS[Math.floor(r() * BISHOP_YEARS.length)]).slice(2), bishopHow = r => BISHOP_HOW[Math.floor(r() * BISHOP_HOW.length)];
  LINES.bishop = {
    first: [l("bis.hi", "thoughtful", T, c => `They call me the Bishop. I climbed here before you were born. ${c.claim}`)],
    hello: [
      l("bis.h.sent", "happy", c => c.youSent && c.youSent.today, c => `${cap(c.youSent.full)}? Oh, I did that one in '${c.yy}. ${c.how} Nice to see somebody repeat it.`, { w: 4 }),
      l("bis.h.proj", "thoughtful", c => c.yourProj, c => `Still on ${c.yourProj.full}? I did that in '${c.yy}. ${c.how} Dot will tell you different, but Dot's not here, is she?`, { w: 3 }),
      l("bis.h.everything", "thoughtful", T, c => `Back in '${c.yy} we climbed everything out here. Everything. Nobody wrote any of it down, of course.`),
      l("bis.h.first", "happy", T, () => "You know who put up the first problem in this park? Me. Well. Me and Dot. Mostly me."),
      l("bis.h.name", "thoughtful", T, () => "They call me the Bishop. Don't ask why. It's a long story, and most of it's true."),
      l("bis.h.gap", "happy", c => c.gap >= 21, c => `Thought you'd given up! Back in '${c.yy}, people gave up all the time. You're made of sterner stuff.`, { w: 5 }),
      l("bis.h.ev", "happy", c => !!c.event, c => ({ spring: `A comp on April Fools' Day? In '${c.yy} we'd have done it in fancy dress.`, comp: `A comp! Back in '${c.yy} we had one too. I won. Nobody wrote it down, of course.`, bonfire: "Shortest day of the year. Dot and I used to light a fire right about here. Mind you, it was a different here.", trail: "Trail Day. I built half these trails. The good half.", midsummer: `Longest day. In '${c.yy} we climbed till midnight by the headlights of a car. Somebody else's car.` })[c.event], { w: 8 }),
      l("bis.h.grade", "thoughtful", c => !!c.anyDispute, c => `Arguing about grades again, are they? In '${c.yy} we had two grades: “hard” and “Dot did it”.`, { w: 2 }),
      l("bis.h.us", "happy", c => c.rowanUs, () => "You and the one with the sketchbook, eh? Dot and I used to watch the sunset from up on the hill. Best seat in the park, that.", { w: 5, story: true }),
    ],
    story: [
      l("bis.s.name", "happy", T, () => "The Bishop tells you how the crag got its name. The story takes nineteen minutes, involves a mule, and doesn't seem to be about the crag.", { narr: true, story: true }),
      l("bis.s.dot", "thoughtful", T, () => "The Bishop says Dot was the best climber he ever saw. He says it quietly, and for once he doesn't add anything funny.", { narr: true, story: true }),
      l("bis.s.tape", "happy", T, () => "The Bishop shows you how they used to tape their fingers in the seventies. It involves electrical tape. You decide not to try it.", { narr: true, story: true }),
    ],
    bye: [l("bis.b.bye", "happy", T, () => "Off you go. Mind the holds. Some of them are older than me.")],
    closer: [
      l("bis.c.know", "happy", c => c.up === "know", c => `You've got a good ear for a story. Rare, these days. Back in '${c.yy}, everyone listened.`),
      l("bis.c.friends", "thoughtful", c => c.up === "friends", () => "I'll tell you something I don't tell everyone. Some of my stories are true. I'll let you work out which."),
      l("bis.c.good", "happy", c => c.up === "good", () => "Dot would have liked you. That's the highest thing I can say about anybody."),
    ],
    again: [l("bis.g.again", "thoughtful", T, c => `Back for more? Did I tell you about '${c.yy}?`)],
  };
  // Pickles: narration.
  LINES.pickles = {
    first: [l("pic.hi", "sleepy", T, () => "A scruffy dog is napping in the shade of the boulder. His tag says PICKLES. His tail thumps when he sees you.", { narr: true })],
    hello: [
      l("pic.h.thump", "sleepy", c => c.dog.n <= 1, () => "Pickles is napping in the shade of his rock. His tail thumps twice when he sees you.", { narr: true }),
      l("pic.h.belly", "happy", c => c.dog.n <= 1, () => "Pickles opens one eye, decides you're a friend, and rolls over for a belly rub.", { narr: true }),
      l("pic.h.stick", "excited", T, () => "Pickles is guarding a very important stick beside his rock.", { narr: true }),
      l("pic.h.cold", "sleepy", c => c.cold, () => "Pickles is curled up so tight against the cold he's mostly tail. One ear lifts when you say his name.", { narr: true, w: 2 }),
      l("pic.h.wet", "frustrated", c => c.wx.wet, () => "Pickles is damp, and would like you to know he's damp.", { narr: true, w: 2 }),
      l("pic.h.knows", "happy", c => c.dog.n >= 1, () => "Pickles hears you coming. His tail starts going before he's even opened his eyes.", { narr: true, w: 3 }),
      l("pic.h.wriggle", "happy", c => c.dog.n >= 1, () => "Pickles lifts his head, sees it's you, and does his best happy wriggle without actually getting up.", { narr: true, w: 3 }),
      l("pic.h.trot", "excited", c => c.dog.n >= 2, () => "Pickles is up and trotting over before you've even reached his rock.", { narr: true, w: 4 }),
    ],
    // Waiting for you at the lot (once he knows you well enough to come and meet you).
    lot: [
      l("pic.l.wag", "excited", T, () => "Pickles is waiting by your car, his whole back end wagging.", { narr: true }),
      l("pic.l.expect", "happy", T, () => "Pickles is sitting by your car like he's been expecting you. He has. Since breakfast.", { narr: true }),
      l("pic.l.stick", "excited", T, () => "Pickles has brought a stick to the car. It's for you. He'd like it thrown immediately.", { narr: true }),
      l("pic.l.cold", "happy", c => c.cold, () => "Pickles is waiting by your car, breathing little clouds and wagging.", { narr: true, w: 2 }),
    ],
    // He's with you (following you round, or your dog): you crouch down to say hello.
    with: [
      l("pic.w.walk", "happy", c => !c.yours, () => "Pickles looks up at you: is it walk time? It's always walk time.", { narr: true }),
      l("pic.w.lean", "happy", T, () => "Pickles leans against your leg and sighs, happily.", { narr: true }),
      l("pic.w.yours", "excited", c => c.yours, () => "Your dog. Your actual dog. He thumps his tail like he can hear you thinking it.", { narr: true, w: 2 }),
      l("pic.w.chalk", "happy", c => c.yours, () => "Pickles has chalk on his nose again. He looks very pleased about it.", { narr: true, w: 2 }),
      l("pic.w.pad", "sleepy", c => c.yours, () => "Pickles has claimed the warm spot on your pad. Negotiations are ongoing.", { narr: true }),
    ],
    // He decides to come along.
    follow: [
      l("pic.f.heel", "excited", T, () => "Pickles gets up, shakes himself all over, and falls in at your heel.", { narr: true }),
      l("pic.f.too", "happy", T, () => "Pickles decides that whatever you're doing today, he's doing it too.", { narr: true }),
      l("pic.f.stick", "excited", T, () => "Pickles picks up his stick and trots after you, very serious about it.", { narr: true }),
    ],
    // He's had enough and goes home to his rock.
    home: [
      l("pic.o.enough", "sleepy", T, () => "Pickles has had enough adventure for one day. He trots off back towards his rock.", { narr: true }),
      l("pic.o.gus", "happy", c => c.gusOut, () => "Somewhere off by the lot, Gus whistles. Pickles' ears go up, and off he trots.", { narr: true, w: 2 }),
      l("pic.o.nap", "sleepy", T, () => "Pickles yawns enormously, looks at you apologetically, and heads home for a nap.", { narr: true }),
    ],
    pet: [
      l("pic.p.1", "happy", c => c.pets < 3, () => "He leans into your hand.", { narr: true }),
      l("pic.p.2", "happy", c => c.pets >= 3 && c.pets < 10, () => "He leans his whole weight against your leg and sighs.", { narr: true }),
      l("pic.p.3", "excited", c => c.pets >= 10 && c.gusOut && c.dog.n < 3, () => "He follows you a few steps toward the trail before Gus whistles him back.", { narr: true }),
      l("pic.p.4", "happy", c => c.pets >= 10 && !c.gusOut && c.dog.n < 3, () => "He follows you a few steps toward the trail, then thinks better of it and flops back down in the shade.", { narr: true }),
      l("pic.p.5", "happy", c => c.dog.n >= 2, () => "He presses his head into your hands and closes his eyes.", { narr: true, w: 2 }),
      l("pic.p.6", "excited", c => c.yours, () => "He rolls onto his back, all four paws in the air, entirely yours.", { narr: true, w: 2 }),
    ],
    stick: [
      l("pic.k.1", "excited", T, () => "You throw the stick. Pickles watches it go, looks at you, and lies back down. It was a good throw, though.", { narr: true }),
      l("pic.k.2", "excited", T, () => "You throw the stick. Pickles bolts after it, brings back a completely different stick, and drops it at your feet, very pleased.", { narr: true }),
      l("pic.k.3", "happy", T, () => "Pickles brings the stick back and won't let go of it. This is apparently the game.", { narr: true }),
    ],
    bye: [l("pic.b.nap", "sleepy", c => !c.dogWith && c.dogMode !== "lot", () => "You leave Pickles to his nap. He's asleep again before you've gone three steps.", { narr: true }),
      l("pic.b.car", "happy", c => c.dogMode === "lot", () => "Pickles watches you go, tail still going.", { narr: true }),
      l("pic.b.with", "happy", c => c.dogWith, () => "Pickles flops down at your feet. He's not going anywhere.", { narr: true })],
    again: [l("pic.g.again", "happy", T, () => "Pickles' tail thumps. You again! Excellent.", { narr: true })],
  };

  // ---- something playful, to Rowan (Stage 6) ----------------------------------------------
  // What you can say (label: your words, or what you do), and how Rowan takes it: early (a
  // little flirting), sweet (sweet on each other) and us (together). Before you're together
  // it's flirting; after, it's affection. One is offered per conversation, once a day.
  const q = t => `“${t}”`;
  const PLAYFUL = [
    { id: "draw", when: T, label: () => q("Is that a drawing of me?"),
      early: ["shy", "What? No. It's the boulder. You're… in the corner. For scale."], sweet: ["smitten", "Maybe. You're very hard to draw, you know. You never stand still."] },
    { id: "nose", when: T, label: () => q("You've got charcoal on your nose. No, the other side."),
      early: ["laugh", "Here? …You're making it worse on purpose, aren't you."], sweet: ["laugh", "Leave it. You've got chalk on yours. Now we match."] },
    { id: "view", when: T, label: () => q("I only come up here for the view."),
      early: ["shy", "The view's lovely from— oh. Oh. Right."], sweet: ["smitten", "“Me too,” Rowan says, and doesn't look at the view at all.", true] },
    { id: "pad", when: T, label: () => q("Save me the flat bit of the pad?"),
      early: ["embarrassed", "I always do. I mean, it's the best bit. Everyone wants it."], sweet: ["smitten", "It's already yours. I've been sitting on the lumpy bit for weeks."] },
    { id: "spot", when: c => c.proj, label: () => q("Want a spotter? I'll catch you."),
      early: ["laugh", "You'd better. I'm told I fall very dramatically."], sweet: ["shy", "I know you will. That's sort of the problem."] },
    { id: "light", when: c => c.part !== "morning", label: () => q("The light's lovely. So's the company."),
      early: ["shy", "Ha! That's— thank you. The light really is lovely, though."], sweet: ["smitten", "I was going to say that. I've been trying to say that all afternoon."] },
    { id: "coffee", when: c => c.part === "morning", label: () => q("I brought you a coffee. Don't read into it."),
      early: ["shy", "I'm reading into it a little bit. Thank you."], sweet: ["smitten", "Too late. I've read into it completely."] },
    { id: "cold", when: c => c.cold, label: () => "Warm Rowan's hands in yours",
      early: ["shy", "Rowan hesitates, laughs, and holds on a moment longer than strictly necessary.", true], sweet: ["smitten", "Rowan's hands are freezing. Neither of you lets go for quite a while.", true] },
    { id: "rain", when: c => c.wx.wet, label: () => q("Rain, a boulder and you. I can think of worse days."),
      early: ["laugh", "Can you? Name one. …Actually, this one's pretty good."], sweet: ["smitten", "This is my favourite kind of day now. I've decided."] },
    { id: "showoff", when: c => c.sentToday, label: () => q("Show-off."),
      early: ["laugh", "Says you! I've watched you climb. Show-off yourself."], sweet: ["smitten", "Only when you're watching."] },
    { id: "pose", when: T, label: () => q("Draw me like one of your boulders."),
      early: ["laugh", "Very still, then? And mostly grey? …I'll see what I can do."], sweet: ["shy", "I already have. Lots of times. Don't look in the back of the sketchbook."] },
    // Together: affection.
    { id: "hug", us: true, when: T, label: () => "Give Rowan a hug",
      say: ["laugh", "Rowan hugs you back, chalk and all. You both come away with handprints.", true] },
    { id: "missed", us: true, when: T, label: () => q("I missed you."),
      say: ["smitten", "It's been a day. Maybe two. …I missed you too."] },
    { id: "pencil", us: true, when: T, label: () => "Steal Rowan's pencil",
      say: ["laugh", "Rowan chases you twice round the boulder for it, laughing, and wins by cheating.", true] },
    { id: "hands", us: true, when: T, label: () => "Sit with Rowan for a bit",
      say: ["smitten", "You sit on the pad holding hands, chalky and warm, and watch someone fall off the warm-up.", true] },
    { id: "drawn", us: true, when: T, label: () => q("Can I see what you drew today?"),
      say: ["shy", "It's you again. Rowan shrugs, going pink. “You're my favourite thing to draw. Sorry. You'll have to get used to it.”", true] },
    { id: "cheer", us: true, when: c => c.proj, label: () => q("I'll spot you on your project."),
      say: ["smitten", "Good. I fall better when you're there. That makes no sense. It's true, though."] },
    { id: "proud", us: true, when: c => c.sentToday, label: () => q("I'm so proud of you."),
      say: ["laugh", "I kept thinking about telling you. Are you? Good. I am too, a bit."] },
  ];
  // Today's playful line for this conversation, one you haven't used lately: { id, label }, or null.
  function playful(env) {
    const c = ctxFor(env, "n:rowan"), r = env.rng || Math.random;
    const ok = PLAYFUL.filter(x => !!x.us === c.us && (() => { try { return !!x.when(c); } catch (e) { return false; } })());
    if (!ok.length) return null;
    const age = x => { const d = env.Social.saidOn(env.G, "n:rowan", "row.f." + x.id); return d ? days(d, c.date) : 999; };
    const fresh = ok.filter(x => age(x) >= AVOID), pool = fresh.length ? fresh : ok.slice().sort((a, b) => age(b) - age(a)).slice(0, 1);
    const x = pool[Math.floor(r() * pool.length)];
    return { id: x.id, label: x.label(c) };
  }
  // Rowan's answer, from how things stood before you said it (stage: Social.romance's n).
  function flirtBack(env, id, stage) {
    const x = PLAYFUL.find(y => y.id === id); if (!x) return null;
    const c = ctxFor(env, "n:rowan");
    const [mood, t, narr] = x.us ? x.say : stage >= 2 ? x.sweet : x.early;
    env.Social.say(env.G, "n:rowan", "row.f." + x.id, c.date);
    return { id: "row.f." + x.id, t: cap(t), mood, narr: !!narr, sweet: true };
  }
  // The sunset (a scene of its own): how it starts, and how it ends, whatever you say.
  const SUNSET = {
    start: "Rowan leads you up a faint path to a flat-topped boulder above the trees. You sit side by side with your legs dangling over the edge. The whole valley goes pink, then gold, then a deep, slow orange.",
    tell: "You tell Rowan how you feel. Rowan goes very quiet, then laughs, and bumps your shoulder. “I was hoping you'd say that. I've been hoping for weeks. Did you not notice? I drew you into every boulder.”",
    after: "You watch the last of the sun go down together, and walk out by headlamp, holding hands.",
    watch: "You watch the sun go down. Neither of you says much. It's nice, sitting up here. Rowan hums the whole way back down the hill.",
    friends: "You watch the sun go down together. On the walk out, Rowan says, “I'm really glad we're friends. I mean that.” You can tell Rowan does.",
  };

  // ---- choosing ------------------------------------------------------------------------------
  const AVOID = 12, STORY = 45;
  const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
  function render(line, c) {
    try {
      const t = line.say(c);
      if (typeof t !== "string" || !t || /undefined|null|NaN|\[object/.test(t)) return null;
      return cap(t.trim());
    } catch (e) { return null; }
  }
  function choose(env, who, topics, c, rng, freshOnly = false, only = null) {
    const { G, Social } = env, lib = LINES[c.key] || {};
    const cand = [];
    for (const tp of topics) for (const ln of lib[tp] || []) {
      if (only && !only(ln)) continue;
      let ok = false; try { ok = !ln.when || !!ln.when(c); } catch (e) { ok = false; }
      if (!ok) continue;
      const t = render(ln, c); if (!t) continue;
      cand.push({ ln, t, last: Social.saidOn(G, who, ln.id) });
    }
    if (!cand.length) return null;
    const fresh = cand.filter(x => !x.last || days(x.last, c.date) >= (x.ln.story ? STORY : AVOID));
    if (!fresh.length && freshOnly) return null;
    const pool = fresh.length ? fresh : [cand.slice().sort((a, b) => (a.last < b.last ? -1 : 1))[0]];
    let total = 0; for (const x of pool) total += x.ln.w || 1;
    let u = rng() * total, it = pool[0];
    for (const x of pool) { u -= x.ln.w || 1; if (u <= 0) { it = x; break; } }
    Social.say(G, who, it.ln.id, c.date);
    return { id: it.ln.id, t: it.t, mood: it.ln.mood || "neutral", narr: !!it.ln.narr, ...(it.ln.sweet ? { sweet: true } : {}) };
  }
  function ctxFor(env, who) {
    const c = context(env, who), r = env.rng || Math.random;
    if (c.key === "bishop") { c.yy = yy(r); c.how = bishopHow(r); c.claim = c.youSent && c.youSent.today ? `${cap(c.youSent.full)}? Oh, I did that one in '${c.yy}. ${c.how}` : `Back in '${c.yy} we climbed everything out here. Everything.`; }
    return c;
  }
  // Walking up to someone: a hello, then the most interesting thing they've got to say.
  function opening(env, who) {
    const c = ctxFor(env, who), r = env.rng || Math.random, out = [];
    // A hello they haven't used on you lately (or a nod), then news you haven't heard
    // from them; never the same news twice in a fortnight. At least one beat.
    if (c.key === "pickles") {            // where he is decides how he greets you (Stage 5)
      const tp = c.firstMeeting && c.dogMode === "rock" ? "first" : c.dogMode === "lot" ? "lot" : c.dogWith ? "with" : "hello";
      const b = choose(env, who, [tp], c, r, true) || choose(env, who, [tp], c, r);
      return b ? [b] : [];
    }
    const hi = c.firstMeeting ? choose(env, who, ["first"], c, r)
      : c.invited ? choose(env, who, ["invited"], c, r)
      : (c.event && choose(env, who, ["hello"], c, r, true, ln => /\.h\.ev$/.test(ln.id)))                       // an event today (Stage 7)
        || (c.us && choose(env, who, ["hello"], c, r, true, ln => /\.h\.(after|month|year)$/.test(ln.id)))     // the day after the sunset, and anniversaries (Stage 6)
        || (c.gap >= 21 && choose(env, who, ["hello"].filter(() => true), { ...c }, r, true, ln => /\.gap$/.test(ln.id))) || choose(env, who, ["hello"], c, r, true) || choose(env, who, ["nod"], c, r, true);
    if (hi) out.push(hi);
    // A friendship that's just deepened: they say so (once).
    if (c.up && !c.firstMeeting) { const b = choose(env, who, ["closer"], c, r); if (b) { out.push(b); env.Social.heard(env.G, who); return out; } }
    // Rowan asks you to stay for the sunset (Stage 6): that's the news.
    if (c.sunsetAsk && c.key === "rowan") { const b = choose(env, who, ["sunset"], c, r); if (b) { out.push(b); return out; } }
    if (c.key === "pickles" || c.key === "bishop") { if (!out.length) { const h = choose(env, who, ["hello"], c, r); if (h) out.push(h); } return out; }
    const news = choose(env, who, c.firstMeeting ? ["today"] : ["mine", "theirs", "today", "others"], c, r, true);
    if (news) out.push(news);
    if (!out.length) { const h = choose(env, who, ["nod", "hello"], c, r); if (h) out.push(h); }
    return out;
  }
  function reply(env, who, topic) {
    const c = ctxFor(env, who), r = env.rng || Math.random;
    const b = choose(env, who, [topic], c, r);
    return b ? [b] : [];
  }
  // For tests: every line, rendered against a save's context (no choosing, nothing recorded).
  function everyLine(env, who) {
    const c = ctxFor(env, who), out = [];
    for (const [tp, ls] of Object.entries(LINES[c.key] || {})) for (const ln of ls) {
      let ok = false; try { ok = !ln.when || !!ln.when(c); } catch (e) { ok = false; }
      if (ok) out.push({ id: ln.id, topic: tp, t: render(ln, c), mood: ln.mood });
    }
    if (c.key === "rowan") for (const x of PLAYFUL) {             // the playful lines: yours, and Rowan's answers
      let ok = false; try { ok = !!x.when(c); } catch (e) { ok = false; }
      if (!ok) continue;
      out.push({ id: "row.f." + x.id + ".label", topic: "playful", t: x.label(c), mood: "neutral" });
      for (const [k, v] of Object.entries({ early: x.early, sweet: x.sweet, us: x.say })) if (v) out.push({ id: `row.f.${x.id}.${k}`, topic: "playful", t: cap(v[1]), mood: v[0] });
    }
    if (c.key === "rowan") for (const [k, t] of Object.entries(SUNSET)) out.push({ id: "row.sunset." + k, topic: "sunset", t, mood: "smitten" });
    return out;
  }
  // An invitation, written on a note left on your windscreen (Stage 4): env.invite = { who, where, when }.
  function note(env, who) {
    const c = ctxFor(env, who), r = env.rng || Math.random;
    const sun = ln => !!(c.invite && c.invite.sunset) === /\.sun$/.test(ln.id);     // a sunset note, or an ordinary one
    const b = choose(env, who, ["note"], c, r, false, sun);
    return b ? b.t : null;
  }
  const Talk = { context, opening, reply, note, everyLine, LINES, PLAYFUL, SUNSET, playful, flirtBack, GENDERED, how, moveWord, ALT_HOW, STYLE_HOW, HOLD_HOW, mentions: (t, c) => /rowan/i.test(t) || !!(c && c.me && t.includes(c.me)) };
  if (typeof module !== "undefined") module.exports = Talk; else root.Talk = Talk;
})(typeof window !== "undefined" ? window : globalThis);
