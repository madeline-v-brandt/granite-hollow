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
    // Other regulars' news (named: they're the regulars).
    if (W) {
      const n = W.news.find(x => (x.kind === "proj" || (x.kind === "fa" && x.proj >= 3)) && x.by && x.by !== who && x.by.startsWith("n:") && days(x.date, date) <= 5 && days(x.date, date) >= 0);
      if (n) c.other = { ...lineOf(n.p), who: n.by, person: World.whoName(D, n.by).replace(/^Ranger /, "").replace(/^the /, "").split(" ")[0], fa: n.kind === "fa", dur: dur(n.n || n.proj || 3, n.since) };
    }
    c.pets = env.pets || 0; c.gusOut = !!env.gusOut;
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
        l("gus.d.fa", "excited", c => c.theirFa && !c.sentToday, c => `I put up ${c.theirFa.full} this week. A ranger's allowed one first ascent. It's in the rules. I wrote the rules.`, { w: 2 }),
      ],
      mine: [
        l("gus.m.fa", "excited", c => c.youFa, c => `Saw ${c.youFa.full} on the CragLog. A first ascent in my park! I'll need to update the map.`, { w: 4 }),
        l("gus.m.send", "happy", c => c.youSent, c => `Heard you got up ${c.youSent.full}. Nice work. Did you leave the holds how you found them?`, { w: 2 }),
        l("gus.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! When you turned up you were climbing the kiosk steps.`, { w: 3 }),
        l("gus.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full} going? Still on it?`, { w: 3 }),
        l("gus.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! Pickles and I are very proud.`, { w: 4 }),
        l("gus.m.with", "happy", c => c.together, c => `Still thinking about that day on ${c.together.full}. Good climbing.`, { w: 2 }),
      ],
      others: [l("gus.o.news", "happy", c => c.other, c => `${c.other.person} finally ${c.other.fa ? "put up" : "sent"} ${c.other.full}. ${cap(c.other.dur)} on it. Whole lot heard about it.`, { w: 2 })],
      ask: [
        l("gus.a.proj", "thoughtful", c => c.proj, c => `It's ${c.proj.full}. ${cap(c.proj.dur)} so far. The top's fine. It's the bottom that's the problem. And the middle.`),
        l("gus.a.none", "happy", c => !c.proj, () => "Me? I climb the warm-ups and check they're still there. They always are. Very reassuring."),
      ],
      tell: [
        l("gus.k.did", "happy", c => c.yourProj && c.yourProj.theyDid, c => `${cap(c.yourProj.full)}? I've done that one! Took me ages. Go slow at the top; it's sandier than it looks.`, { w: 3 }),
        l("gus.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}? Keep at it. And brush the holds when you're done; the next person will thank you.`),
      ],
      story: [
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
      ],
      mine: [
        l("hol.m.fa", "excited", c => c.youFa, c => `I've added ${c.youFa.full} to the binder. I'll need you to confirm the start holds. Officially.`, { w: 4 }),
        l("hol.m.send", "thoughtful", c => c.youSent, c => `${cap(c.youSent.full)}! I'll make a note. What did you think of the grade?`, { w: 2 }),
        l("hol.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `Have you sent ${c.told.full} yet? I've left a gap in the notes.`, { w: 3 }),
        l("hol.m.toldYes", "excited", c => c.told && c.told.sent, c => `${cap(c.told.full)}, sent! I've filled in the gap in the notes. With a little star.`, { w: 4 }),
        l("hol.m.with", "happy", c => c.together, c => `I've written up our day on ${c.together.full}. You come out of it very well.`, { w: 2 }),
      ],
      others: [l("hol.o.news", "thoughtful", c => c.other, c => `For the record: ${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}, after ${c.other.dur}. I have it on good authority. Mine.`, { w: 2 })],
      ask: [
        l("hol.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. I have four pages on it. Three are about the crux. The fourth is also, if I'm honest, about the crux.`),
        l("hol.a.none", "embarrassed", c => !c.proj, () => "Nothing just now. I'm between projects. Which is to say I'm writing about other people's."),
      ],
      tell: [
        l("hol.k.did", "happy", c => c.yourProj && c.yourProj.theyDid, c => `${cap(c.yourProj.full)}. I've done it. My notes say: “Trust the left foot.” Underlined twice.`, { w: 3 }),
        l("hol.k.go", "thoughtful", c => c.yourProj, c => `Ah, ${c.yourProj.full}. Let me see… yes, I have notes. Mostly question marks. Tell me how it goes.`),
      ],
      story: [
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
        l("oti.d.slab", "happy", c => !c.done && c.proj && c.proj.n >= 6, c => `I've been on ${c.proj.full} for ${c.proj.dur}. It's a relationship now.`, { w: 2 }),
      ],
      mine: [
        l("oti.m.send", "happy", c => c.youSent, c => `${cap(c.youSent.full)}! I saw from over there. Beautiful. Perfect weather for it, too.`, { w: 2 }),
        l("oti.m.fa", "excited", c => c.youFa, c => `A first ascent! In perfect sending weather! ${cap(c.youFa.full)}. Ha! I love it.`, { w: 4 }),
        l("oti.m.toldNo", "happy", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full}? Don't tell me. It's going perfectly.`, { w: 3 }),
        l("oti.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! I knew it. Perfect conditions?`, { w: 4 }),
        l("oti.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! Look at you!`, { w: 3 }),
        l("oti.m.with", "happy", c => c.together, c => `That day on ${c.together.full}! Perfect sending weather, that was.`, { w: 2 }),
      ],
      others: [l("oti.o.news", "excited", c => c.other, c => `Did you hear about ${c.other.person}? ${cap(c.other.fa ? "put up" : "sent")} ${c.other.full}! What a week for it.`, { w: 2 })],
      ask: [
        l("oti.a.proj", "happy", c => c.proj, c => `${cap(c.proj.full)}! ${cap(c.proj.dur)}. It's the best thing I've never done.`),
        l("oti.a.none", "happy", c => !c.proj, () => "Nothing! Everything! It's that kind of day."),
      ],
      tell: [
        l("oti.k.did", "happy", c => c.yourProj && c.yourProj.theyDid, c => `${cap(c.yourProj.full)}! I did that one in a drizzle once. Perfect conditions. Hug the arête.`, { w: 3 }),
        l("oti.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}? Oh, you'll get it. Maybe not today. But it's perfect weather for trying.`),
      ],
      story: [
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
      ],
      theirs: [l("row.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `I finally sent ${c.done.full}. The drawing of it is pinned up at the library now. Nobody knows it's a boulder.`, { w: 3 })],
      mine: [
        l("row.m.send", "happy", c => c.youSent, c => `I saw you on ${c.youSent.full}. You looked so calm. Was it calm?`, { w: 2 }),
        l("row.m.fa", "excited", c => c.youFa, c => `You named a problem! ${cap(c.youFa.full)}. I'd like to draw it, if that's all right.`, { w: 4 }),
        l("row.m.toldYes", "excited", c => c.told && c.told.sent, c => `You got ${c.told.full}! I knew you would.`, { w: 4 }),
        l("row.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `How's ${c.told.full} going? I've been thinking about that move you told me about.`, { w: 3 }),
        l("row.m.with", "happy", c => c.together, c => `I keep looking at the drawing from the day you sent ${c.together.full}. It's one of my favourites.`, { w: 3 }),
        l("row.m.hard", "excited", c => c.youHardest, c => `V${c.youHardest.grade}! That's your hardest yet, isn't it?`, { w: 3 }),
      ],
      others: [l("row.o.news", "happy", c => c.other, c => `${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}. I drew the celebration. It's mostly arms.`, { w: 2 })],
      ask: [
        l("row.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. I like it because the holds look like a face. Once you see it you can't unsee it.`),
        l("row.a.none", "happy", c => !c.proj, () => "Nothing really. I'm drawing more than climbing today."),
      ],
      tell: [
        l("row.k.did", "happy", c => c.yourProj && c.yourProj.theyDid, c => `I've done ${c.yourProj.full}! The trick is to look at your feet for longer than feels sensible.`, { w: 3 }),
        l("row.k.go", "thoughtful", c => c.yourProj, c => `${cap(c.yourProj.full)}? Tell me about the hard move. I want to picture it.`),
      ],
      story: [
        l("row.s.book", "thoughtful", T, () => "Rowan shows you a sketchbook full of boulders, each with tiny arrows for the moves. “I can't always climb them. But I can draw them.”", { narr: true, story: true }),
        l("row.s.moved", "happy", T, () => "Rowan moved to the village in the spring for a job at the library, and found the park by accident on a walk. “I thought the rocks looked like they wanted to be climbed.”", { narr: true, story: true }),
        l("row.s.nothing", "happy", T, () => "You talk about nothing much for twenty minutes: the light on the rock, the best sandwich in the village, a song you both half remember. It's nice.", { narr: true, story: true }),
        l("row.s.winter", "thoughtful", T, () => "Rowan shows you a drawing of the Hollow in winter, all snow and dark rock. “I've never actually seen it in winter. I'm guessing.”", { narr: true, story: true }),
      ],
      bye: [l("row.b.see", "happy", T, () => "See you around? I'll be here. Probably drawing."), l("row.b.careful", "happy", T, () => "Climb well. Not that you need me to say that.")],
      again: [l("row.g.again", "happy", T, () => "Oh, hi again. I was just drawing your pad. Is that weird?"), l("row.g.more", "embarrassed", T, () => "Back already? Good. I mean, hi.")],
    },
    bea: {
      nod: [l("bea.n.1", "excited", T, () => "Hiii!"), l("bea.n.2", "happy", T, () => "Oh hey!"), l("bea.n.3", "excited", T, () => "Hey hey hey!")],
      first: [l("bea.hi1", "excited", T, () => "I'm Bea! Have you tried jumping for it? You should always try jumping for it."),
        l("bea.hi2", "excited", T, () => "Hi! Bea. Did you see that? I almost stuck it. Almost!")],
      hello: [
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
      theirs: [l("bea.d.sent", "excited", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `I sent ${c.done.full}! After ${c.done.dur}! I still can't believe it. I keep thinking about it in class.`, { w: 3 })],
      mine: [
        l("bea.m.send", "excited", c => c.youSent, c => `You got ${c.youSent.full}?! Did you jump for it? You should've jumped for it.`, { w: 2 }),
        l("bea.m.fa", "excited", c => c.youFa, c => `You made a first ascent! ${cap(c.youFa.full)}. That's SO good.`, { w: 4 }),
        l("bea.m.hard", "excited", c => c.youHardest, c => `Your hardest one yet?! V${c.youHardest.grade}! Okay that's amazing.`, { w: 3 }),
        l("bea.m.toldNo", "happy", c => c.told && !c.told.sent && c.told.ago >= 2, c => `Did you send ${c.told.full} yet? Just jump.`, { w: 3 }),
        l("bea.m.toldYes", "excited", c => c.told && c.told.sent, c => `YOU SENT ${c.told.full.toUpperCase()}!`, { w: 4 }),
        l("bea.m.with", "happy", c => c.together, c => `That day on ${c.together.full} was the best. I told my mom about it. She said “that's nice, sweetie.”`, { w: 2 }),
      ],
      others: [l("bea.o.news", "excited", c => c.other, c => `Did you hear ${c.other.person} ${c.other.fa ? "put up" : "sent"} ${c.other.full}?! I wasn't there. I heard about it. I'm basically a witness.`, { w: 2 })],
      ask: [
        l("bea.a.proj", "excited", c => c.proj, c => `${cap(c.proj.full)}! It's not a dyno. I'm making it a dyno.`),
        l("bea.a.none", "happy", c => !c.proj, () => "Nothing! Everything! Whatever looks jumpy."),
      ],
      tell: [
        l("bea.k.did", "embarrassed", c => c.yourProj && c.yourProj.theyDid, c => `I did ${c.yourProj.full}! Okay, real beta: don't jump. I know. I KNOW.`, { w: 3 }),
        l("bea.k.go", "excited", c => c.yourProj, c => `${cap(c.yourProj.full)}! Have you tried jumping for it?`),
      ],
      story: [
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
      theirs: [l("dez.d.sent", "happy", c => c.done && c.done.sent && !c.done.today && c.done.n >= 3, c => `Finished ${c.done.full}. ${cap(c.done.dur)}. Worth it.`, { w: 3 })],
      mine: [
        l("dez.m.send", "happy", c => c.youSent, c => `Saw ${c.youSent.full}. Clean.`, { w: 2 }),
        l("dez.m.fa", "happy", c => c.youFa, c => `${cap(c.youFa.full)}. Good name.`, { w: 4 }),
        l("dez.m.hard", "happy", c => c.youHardest, () => "You're getting strong.", { w: 3 }),
        l("dez.m.toldNo", "thoughtful", c => c.told && !c.told.sent && c.told.ago >= 2, c => `${cap(c.told.full)}. Still on it?`, { w: 3 }),
        l("dez.m.toldYes", "happy", c => c.told && c.told.sent, c => `Heard about ${c.told.full}. Nice.`, { w: 4 }),
        l("dez.m.with", "happy", c => c.together, c => `Good day, that one. ${cap(c.together.full)}.`, { w: 2 }),
      ],
      others: [l("dez.o.news", "neutral", c => c.other, c => `${c.other.person} ${c.other.fa ? "put up" : "got"} ${c.other.full}. Good for them.`, { w: 2 })],
      ask: [l("dez.a.proj", "thoughtful", c => c.proj, c => `${cap(c.proj.full)}. Hard. Good.`), l("dez.a.none", "neutral", c => !c.proj, () => "Nothing right now. Looking.")],
      tell: [
        l("dez.k.did", "thoughtful", c => c.yourProj && c.yourProj.theyDid, c => `${cap(c.yourProj.full)}. Did it. Keep your hips in.`, { w: 3 }),
        l("dez.k.go", "happy", c => c.yourProj, c => `${cap(c.yourProj.full)}. You'll get it.`),
      ],
      story: [
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
  const yy = r => String(BISHOP_YEARS[Math.floor(r() * BISHOP_YEARS.length)]).slice(2), how = r => BISHOP_HOW[Math.floor(r() * BISHOP_HOW.length)];
  LINES.bishop = {
    first: [l("bis.hi", "thoughtful", T, c => `They call me the Bishop. I climbed here before you were born. ${c.claim}`)],
    hello: [
      l("bis.h.sent", "happy", c => c.youSent && c.youSent.today, c => `${cap(c.youSent.full)}? Oh, I did that one in '${c.yy}. ${c.how} Nice to see somebody repeat it.`, { w: 4 }),
      l("bis.h.proj", "thoughtful", c => c.yourProj, c => `Still on ${c.yourProj.full}? I did that in '${c.yy}. ${c.how} Dot will tell you different, but Dot's not here, is she?`, { w: 3 }),
      l("bis.h.everything", "thoughtful", T, c => `Back in '${c.yy} we climbed everything out here. Everything. Nobody wrote any of it down, of course.`),
      l("bis.h.first", "happy", T, () => "You know who put up the first problem in this park? Me. Well. Me and Dot. Mostly me."),
      l("bis.h.name", "thoughtful", T, () => "They call me the Bishop. Don't ask why. It's a long story, and most of it's true."),
    ],
    story: [
      l("bis.s.name", "happy", T, () => "The Bishop tells you how the crag got its name. The story takes nineteen minutes, involves a mule, and doesn't seem to be about the crag.", { narr: true, story: true }),
      l("bis.s.dot", "thoughtful", T, () => "The Bishop says Dot was the best climber he ever saw. He says it quietly, and for once he doesn't add anything funny.", { narr: true, story: true }),
      l("bis.s.tape", "happy", T, () => "The Bishop shows you how they used to tape their fingers in the seventies. It involves electrical tape. You decide not to try it.", { narr: true, story: true }),
    ],
    bye: [l("bis.b.bye", "happy", T, () => "Off you go. Mind the holds. Some of them are older than me.")],
    again: [l("bis.g.again", "thoughtful", T, c => `Back for more? Did I tell you about '${c.yy}?`)],
  };
  // Pickles: narration.
  LINES.pickles = {
    first: [l("pic.hi", "sleepy", T, () => "A scruffy dog is napping in the shade of the boulder. His tag says PICKLES. His tail thumps when he sees you.", { narr: true })],
    hello: [
      l("pic.h.thump", "sleepy", T, () => "Pickles is napping in the shade of his rock. His tail thumps twice when he sees you.", { narr: true }),
      l("pic.h.belly", "happy", T, () => "Pickles opens one eye, decides you're a friend, and rolls over for a belly rub.", { narr: true }),
      l("pic.h.stick", "excited", T, () => "Pickles is guarding a very important stick beside his rock.", { narr: true }),
      l("pic.h.cold", "sleepy", c => c.cold, () => "Pickles is curled up so tight against the cold he's mostly tail. One ear lifts when you say his name.", { narr: true, w: 2 }),
      l("pic.h.wet", "frustrated", c => c.wx.wet, () => "Pickles is damp, and would like you to know he's damp.", { narr: true, w: 2 }),
    ],
    pet: [
      l("pic.p.1", "happy", c => c.pets < 3, () => "He leans into your hand.", { narr: true }),
      l("pic.p.2", "happy", c => c.pets >= 3 && c.pets < 10, () => "He leans his whole weight against your leg and sighs.", { narr: true }),
      l("pic.p.3", "excited", c => c.pets >= 10 && c.gusOut, () => "He follows you a few steps toward the trail before Gus whistles him back.", { narr: true }),
      l("pic.p.4", "happy", c => c.pets >= 10 && !c.gusOut, () => "He follows you a few steps toward the trail, then thinks better of it and flops back down in the shade.", { narr: true }),
    ],
    stick: [
      l("pic.k.1", "excited", T, () => "You throw the stick. Pickles watches it go, looks at you, and lies back down. It was a good throw, though.", { narr: true }),
      l("pic.k.2", "excited", T, () => "You throw the stick. Pickles bolts after it, brings back a completely different stick, and drops it at your feet, very pleased.", { narr: true }),
      l("pic.k.3", "happy", T, () => "Pickles brings the stick back and won't let go of it. This is apparently the game.", { narr: true }),
    ],
    bye: [l("pic.b.nap", "sleepy", T, () => "You leave Pickles to his nap. He's asleep again before you've gone three steps.", { narr: true })],
    again: [l("pic.g.again", "happy", T, () => "Pickles' tail thumps. You again! Excellent.", { narr: true })],
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
  function choose(env, who, topics, c, rng, freshOnly = false) {
    const { G, Social } = env, lib = LINES[c.key] || {};
    const cand = [];
    for (const tp of topics) for (const ln of lib[tp] || []) {
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
    return { id: it.ln.id, t: it.t, mood: it.ln.mood || "neutral", narr: !!it.ln.narr };
  }
  function ctxFor(env, who) {
    const c = context(env, who), r = env.rng || Math.random;
    if (c.key === "bishop") { c.yy = yy(r); c.how = how(r); c.claim = c.youSent && c.youSent.today ? `${cap(c.youSent.full)}? Oh, I did that one in '${c.yy}. ${c.how}` : `Back in '${c.yy} we climbed everything out here. Everything.`; }
    return c;
  }
  // Walking up to someone: a hello, then the most interesting thing they've got to say.
  function opening(env, who) {
    const c = ctxFor(env, who), r = env.rng || Math.random, out = [];
    // A hello they haven't used on you lately (or a nod), then news you haven't heard
    // from them; never the same news twice in a fortnight. At least one beat.
    const hi = c.firstMeeting ? choose(env, who, ["first"], c, r) : choose(env, who, ["hello"], c, r, true) || choose(env, who, ["nod"], c, r, true);
    if (hi) out.push(hi);
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
    return out;
  }
  const Talk = { context, opening, reply, everyLine, LINES, GENDERED, mentions: (t, c) => t.includes("Rowan") || !!(c && c.me && t.includes(c.me)) };
  if (typeof module !== "undefined") module.exports = Talk; else root.Talk = Talk;
})(typeof window !== "undefined" ? window : globalThis);
