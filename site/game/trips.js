// Granite Hollow: climbing trips (after Phase 4). A friend invites you away for two
// weeks to a real bouldering area in its season; you come back with a handful of its
// real classics sent, some mileage, the XP for them and a few stories.
//
// Pure and testable in Node (node scripts/test_trips.js). game.js decides when an
// invitation comes and records the trip; this module has the places, their problems,
// the invitations' and stories' words, and works out what you sent.
//
// The problems are real, with the grades published for them (checked against the
// areas' guide sites, 2026-11-27: 27 Crags and Rock+Run for Rocklands, 27 Crags and
// Rockbusters for Magic Wood, Mad Boulder and Mountain Project for Hueco Tanks and
// Joe's Valley, KAYA, Wikipedia and She Dreams of Alpine for Bishop, Wikipedia,
// Bleau Blocs and Boulderflash for Fontainebleau). Where sources disagreed about a
// grade the problem was left out. Nobody real is named: no first ascensionists.
// Font grades are converted to V grades the usual way (6A ≈ V3 … 8C ≈ V15).
//
// Pronouns: none for Rowan, Hollis, Dez or the player. Bea is 17: the Rocklands trip is
// Bea's family's, with a spare seat.
(function (root) {
  "use strict";
  const World = root.World || (typeof require !== "undefined" ? require("./world.js") : null);
  const Mech = root.Mech || (typeof require !== "undefined" ? require("./mechanics.js") : null);

  const LENGTH = 14;          // days away (you're back the morning after the 14th)
  const DAYS = 8;             // climbing days' worth of XP at home a trip is worth (tuned: test_trips.js)
  const LEAD = [6, 12];       // an invitation comes this many days ahead (they leave on a Saturday)
  const GAP = 80;             // days between invitations (about one a season)
  const NAMED = 6;            // the hardest sends get their names in the summary

  // XP a steady climber earns in a climbing day at home, by level: the level's cost over
  // the climbing days the balance simulator's steady climbers take over it (medians of 40,
  // node scripts/balance_game.js, 2026-11-27: V3 day 5, V5 14, V7 26, V9 53, V11 96, V13 170).
  // Past V13 nobody's measured, so it grows gently.
  const RATE = [41, 82, 130, 133, 200, 300, 433, 356, 467, 419, 581, 514, 730, 900, 1000, 1100, 1200];
  const rate = L => (L < RATE.length ? RATE[L] : RATE[RATE.length - 1] * Math.pow(1.3, L - RATE.length + 1));

  const font = { "3": 0, "4": 0, "5": 1, "5+": 2, "6A": 3, "6A+": 3, "6B": 4, "6B+": 4, "6C": 5, "6C+": 5, "7A": 6, "7A+": 7, "7B": 8, "7B+": 8,
    "7C": 9, "7C+": 10, "8A": 11, "8A+": 12, "8B": 13, "8B+": 14, "8C": 15 };
  // [name, grade (Font for Font-graded areas, else V), a note from the sources or ""]
  const P = (name, grade, note = "") => ({ name, grade: String(grade), v: typeof grade === "number" ? grade : font[grade], note });

  const DESTS = {
    rocklands: {
      name: "Rocklands", where: "South Africa", who: "n:bea", fontGrades: true,
      windows: [["06-27", "08-29"]],
      rock: "orange sandstone",
      lede: "Two weeks of orange sandstone, cold blue mornings and a sky with too many stars in it. Your skin is in pieces and you've never been happier.",
      note: (d) => `Bea has left a note on your windscreen: “My family's going to ROCKLANDS (South Africa!!) and there's a spare seat in the hire car. Mum says yes if you say yes. Two weeks of sandstone. ${d}. PLEASE.”`,
      ask: "Rocklands, with Bea's family",
      problems: [
        P("Take Off Your Shoes", "5+"), P("Up the Spout", "6A", "the first recorded problem in Rocklands"), P("Tonto", "6A"),
        P("Girl on Our Mind", "6B+"), P("Shaky Piper", "6B+", "flakes within a flake"), P("Creaking Heights", "6C", "big, with a big walk-in"),
        P("Orange Heart", "6C", "hard for the grade"), P("Welcome to Rocklands", "6C"), P("Tiger Claw", "6C", "a highball"),
        P("The Roof Is on Fire", "6C+"), P("Bamm Bamm", "6C+", "a perfect little dyno"), P("Sunset Traverse", "7A"),
        P("Silky Natural", "7A"), P("Vanity", "7A+"), P("Scorpion Slab", "7A+"), P("Minki", "7B", "steep and burly"),
        P("The Rhino", "7B+"), P("Pinotage", "7C"), P("Sunset Arete", "7C"), P("Caroline", "7C+"), P("Splash of Red", "7C+"),
        P("The End", "8A", "a huge jump to a jug"), P("Black Velvet", "8A"), P("Shosholoza", "8A+"), P("Sky", "8B"),
        P("Speed of Sound", "8B+"), P("Monkey Wedding", "8C"),
      ],
      tales: [
        "Bea's dad drove on the left for two whole weeks and only went round one roundabout the wrong way. Bea filmed it.",
        "A troop of baboons watched one of Bea's sessions from the next boulder, and as far as anyone could tell they weren't impressed.",
        "The farm stall did a pie and a rooibos for less than a coffee at home. You lost count of the pies at eleven.",
        "Bea's mum knew all the southern constellations and named them every night by the fire. You only ever found the Southern Cross, and only because it was pointed out every time.",
        "You learned what a dassie is. You didn't learn how to stop one getting into your chalk bag.",
        "Bea did Sunset Arete at sunset, because of course. A whole family from the next campsite clapped without quite knowing why.",
      ],
    },
    hueco: {
      name: "Hueco Tanks", where: "Texas", who: "n:dez",
      windows: [["01-06", "02-27"]],
      rock: "steep desert rock full of holes",
      lede: "Two weeks of steep desert rock, winter sun and huecos you could sit in. Your forearms may never recover.",
      note: (d) => `Dez has left a note on your windscreen. It says: “Hueco. ${d}. Car's got room. —D”`,
      ask: "Hueco Tanks, with Dez",
      problems: [
        P("Nobody Here Gets Out Alive", 2), P("Sign of the Cross", 3), P("Warm Up Roof", 4), P("Moonshine Roof Center", 4), P("T-Bone Shuffle", 4),
        P("Hobbit in a Blender", 5), P("Lobster Claw", 5), P("Animal Acts", 5), P("Dragonfly", 5),
        P("Baby Martini", 6), P("King Cobra", 6), P("Animal Acts Direct", 6), P("Baby Face", 7), P("Speed Bump", 7), P("Crash Dummy", 7),
        P("Mushroom Roof", 8), P("Bad Religion", 8), P("Funk's Arete", 8), P("Best of the Best", 9), P("Shamu", 9),
        P("Full Service", 10), P("Mojo", 10), P("Free Willy", 10), P("Sunshine", 11), P("Tequila Sunrise", 11), P("Dark Age", 11),
        P("Rumble in the Jungle", 12), P("Full Monty", 12), P("Barefoot on Sacred Ground", 12), P("Crown of Aragorn", 13), P("Neon Desert", 14),
      ],
      tales: [
        "The park's orientation video is long. Dez has seen it nine times and mouthed along to all of it.",
        "Dez spent four days under one roof and didn't say a word. On the fifth Dez sent it, sat down, and said “Hm.” From Dez, that's a speech.",
        "You learned to love a hueco: a hole in the rock just the right size for three fingers and, once, a very surprised lizard.",
        "Tacos every night from the same truck. By the second week they had your order ready before you got to the window.",
        "Getting into the guided-only parts of the park meant going with a guide, who warmed up on things you couldn't start.",
        "It was freezing at dawn and you were climbing in a T-shirt by eleven. Dez's whole wardrobe for the trip was one hoodie.",
      ],
    },
    magicwood: {
      name: "Magic Wood", where: "Switzerland", who: "n:rowan", fontGrades: true,
      windows: [["07-14", "09-12"]],
      rock: "mossy gneiss in a forest by a glacier river",
      lede: "Two weeks of mossy boulders in a forest high in the Alps, with a glacier river roaring past the whole time.",
      note: (d, o) => o.together
        ? `Rowan has left a note on your windscreen: “Magic Wood, in the Swiss Alps. A forest of boulders by a glacier river. I've got a tent, too many maps and one question: two weeks, just us? ${d}.” There's a little heart drawn in the corner.`
        : `Rowan has left a note on your windscreen: “Magic Wood, in the Swiss Alps: a whole forest of boulders by a glacier river. I've got a tent and far too many maps. Two weeks? ${d}.”`,
      ask: "Magic Wood, with Rowan",
      problems: [
        P("Wonderboy", "5", "easy, and a must"), P("Blue Sky of Mine", "6A+", "a fun highball"), P("Die Schöne", "6B"), P("Merlin", "6B+"),
        P("Seven of Nine", "6B+"), P("Jenny", "6C"), P("Big Cheese", "6C"), P("Beach Mantle", "6C"), P("U-Boot", "6C"), P("Freiwild", "6C+"),
        P("Enterprise", "7A", "a great arête"), P("Chiquita", "7A"), P("Red Roses", "7A+"), P("King Kong", "7A+", "one long move"),
        P("Blindfisch", "7B", "really technical"), P("Dinos Don't Dyno", "7B"), P("Höhenrausch", "7B+"), P("Goldfisch", "7B+"),
        P("Intermezzo", "7C", "one of the few that stays dry"), P("Schneebrett", "7C"), P("The Wizard", "7C"), P("Piranja", "7C+"), P("Down Under", "7C+"),
        P("Sofa Surfer", "8A"), P("Astronautenfieber", "8A", "a huge, crimpy arête"), P("Electric Boogie", "8A+"),
        P("The Riverbed", "8B"), P("Steppenwolf", "8B"), P("The Never Ending Story", "8B+"),
      ],
      tales: [
        "It rained four days out of fourteen. Rowan read aloud in the tent from a book about glaciers, doing all the voices, including the glaciers'.",
        "The river was so loud you couldn't hear each other at the boulders, so the two of you made up hand signals for beta. Most of them were rude about the moss.",
        "Everything in Switzerland costs a fortune. You lived on pasta, pesto and a block of cheese the size of a crash pad.",
        "A cow wandered into the forest and stood under one of the boulders for an hour, completely calm. Rowan named it, and visited it every morning.",
        "Rowan kept a list of every mushroom in the forest in the back of a guidebook. It ran to three pages and two of them were question marks.",
      ],
      sweet: [
        "On the last night the clouds cleared over the valley and neither of you said anything for a long time. Then Rowan said, “Same time next year?”",
        "Rowan bought you a tiny wooden cow at a farm shop on the way home. It lives on your dashboard now.",
      ],
    },
    font: {
      name: "Fontainebleau", where: "France", who: "n:mags", fontGrades: true,
      windows: [["04-04", "05-30"], ["09-08", "10-17"]],
      rock: "sandstone in a forest, with circuits",
      lede: "Two weeks in the Forest of Fontainebleau: rounded sandstone, painted circuits, sand in everything and very good bread.",
      note: (d) => `Mags has left a note on your windscreen, in beautiful joined-up writing: “I'm off to Fontainebleau for a fortnight (the forest! the circuits! the bread!) and I'd love the company. I've a gîte with two bedrooms and a very old bicycle. ${d}.”`,
      ask: "Fontainebleau, with Mags",
      problems: [
        P("La Prestat", "3", "a 1914 classic"), P("La Fissure Wehrlin", "3", "from 1908"), P("L'Arête de Larchant", "4"), P("Mozzarella", "4"), P("Le Statique", "4"),
        P("Ventru", "5"), P("Casse-Croûte", "5+"), P("La Poire", "5+"),
        P("La Marie Rose", "6A", "the forest's first 6A, from 1946"), P("L'Angle Allain", "6A", "from the 1930s"), P("La Farine", "6A"), P("L'Incommode", "6A+"),
        P("La Stalingrad", "6B", "from 1950"), P("Zip Zut", "6B"), P("Composition des Forces", "6C"), P("Le Carré d'As", "6C", "from 1950"), P("Nezzundorma", "6C+"),
        P("La Grisaille", "7A"), P("Treenee", "7A"), P("L'Abattoir", "7A+", "the forest's first grade 7"), P("L'Angle Bens", "7A+"),
        P("Alien", "7C"), P("Haute Prestation", "7C"), P("C'était Demain", "8A", "the forest's first 8A, from 1984"), P("Opium", "8A"),
        P("La Force du Destin", "8B+"), P("The Big Island", "8C"),
      ],
      tales: [
        "Mags did a whole orange circuit in a day, every painted arrow in order, and had an éclair at every tenth problem.",
        "You learned to wipe your shoes on a little mat before you step on. The polish on La Marie Rose says not everyone has.",
        "Mags's French is excellent and entirely from 1974. Everybody was charmed anyway.",
        "Sand in the pads, sand in the bread, sand in your socks. Mags says the forest is just reminding you it used to be a sea.",
        "On a rainy day you went round the château instead. Mags gave a better tour than the guide, and the guide said so.",
        "The very old bicycle got a puncture on day three. Mags fixed it with a plaster and a hair grip, and it held for the rest of the trip.",
      ],
    },
    joes: {
      name: "Joe's Valley", where: "Utah", who: "n:ade",
      windows: [["09-06", "10-24"]],
      rock: "rounded sandstone in a canyon",
      lede: "Two weeks of round sandstone boulders in a Utah canyon: slopers, mantles and a van full of new friends.",
      note: (d) => `Ade has left a note on your windscreen: “Taking the gym group to Joe's Valley, Utah. Two vans, nine climbers, one enormous cooler. There's a spare seat and it's yours if you want it. ${d}.”`,
      ask: "Joe's Valley, with Ade's gym group",
      problems: [
        P("Buoux Crack", 1), P("Crescent Moon", 2), P("The Angler", 2), P("Joe Cool", 3), P("Fortune Cookie", 3), P("Super Sloper", 3),
        P("Bowling Ball", 4), P("Kobra Khan", 4), P("Shaolin Slab", 4), P("Kill by Numbers", 5, "one of the most climbed problems in the valley"),
        P("Big Cheesy", 5), P("Frosted Flakes", 5), P("Walrus", 5), P("Scary Monsters", 6), P("Black & Blue", 6), P("Jaws", 6),
        P("Big Joe", 7), P("Planet of the Apes", 7), P("Mama Worm", 7), P("Anti-Future Plan", 8), P("Feels Like Grit", 8), P("White Buffalo", 8),
        P("Bubbatronic", 9), P("Fear Factor", 9), P("Smokin' Joe", 9), P("Resident Evil", 10), P("Beyond Life", 10), P("Eden", 10),
        P("Ghost King", 11), P("Monarch", 11), P("Lex Luthor", 12), P("Lonesome Animals", 12), P("Black Lung", 13), P("Blackout", 13), P("Insurgency", 14),
      ],
      tales: [
        "The gym group held a competition for the most problems in an hour. Ade won, then explained at length why it didn't count.",
        "One of the vans got a flat on the canyon road. Ade changed it in four minutes, and timed it.",
        "Every evening Ade made everyone stretch. You were sore in places you didn't know had names.",
        "Slopers, slopers, mantles and more slopers. You learned to trust your feet, and Ade's spotting, in that order.",
        "A ranch dog adopted the group for three days and sulked when you left. Pickles will smell it on your pads.",
        "Two of the gym kids sent their first V5 on the same day, on the same problem, and cried. Ade definitely didn't, and had something in his eye.",
      ],
    },
    bishop: {
      name: "Bishop", where: "California", who: "n:hollis",
      windows: [["11-07", "12-18"], ["01-06", "02-27"]],
      rock: "golden granite and volcanic tuff under the Sierra",
      lede: "Two weeks of granite and volcanic tuff under the snowy Sierra: highballs, cold mornings and a great many jokes about the Bishop.",
      note: (d) => `Hollis has left a note on your windscreen: “Bishop, California. Two weeks of granite and desert, ${d}. Yes, I know. No, I won't do the joke. (I will do the joke.)”`,
      ask: "Bishop, with Hollis",
      problems: [
        P("Celestial Trail", 0), P("Hero Roof", 0, "a classic first test"), P("Robinson's Rubber Tester", 0), P("Sunshine Slab", 0),
        P("Heavenly Path", 1, "a towering slab"), P("Green Wall Essential", 2, "a classic highball"), P("The Hunk", 2, "a world-class highball"), P("Monkey Dihedral", 2),
        P("Monkey Hang", 3, "a roof with a swing finish"), P("Funky Tut", 3), P("King Tut", 3), P("Iron Man Traverse", 4, "the iconic rail"), P("Solarium", 4),
        P("Bowling Pin", 4), P("Serengeti", 5), P("Fly Boy Arete", 5, "a rite of passage"), P("Seven Spanish Angels", 6), P("The Hulk", 6),
        P("High Plains Drifter", 7, "with its heartbreak finish"), P("Not Another Brit in Bishop", 7), P("The Checkerboard", 8, "proud and pumpy"), P("Disco Diva", 8),
        P("Last Dance", 9), P("Soul Slinger", 9), P("Finder's Fee", 9), P("Evilution Direct", 11, "a proud highball"),
        P("The Mandala", 12, "the legendary prow"), P("Evilution", 12, "a giant highball"), P("Spectre", 13), P("The Swarm", 14),
      ],
      tales: [
        "Hollis made the joke on the first morning (“Off to see the Bishop!”) and about forty more times after that.",
        "Hollis logged every send to CragLog from the top of the boulder. The app crashed twice, and Hollis fixed it in the car park with the laptop on the bonnet.",
        "The Buttermilks at sunset: pink granite under snowy peaks, and every climber on the hill stopped to watch.",
        "You found a bakery in town and went back every single day. There's a photo of Hollis carrying a loaf like a crash pad.",
        "Highballs are mostly in your head, you learned. The rest is in your legs, which shook the whole way up.",
        "Hollis kept a spreadsheet of every meal. It has a column for “would eat again” and every row says yes.",
      ],
    },
  };
  const DEST_OF = Object.fromEntries(Object.entries(DESTS).map(([k, d]) => [d.who, k]));
  const PICKLES = [
    "Gus looked after Pickles, and sent you a photo every day of Pickles asleep on your side of his truck's seat.",
    "Gus looked after Pickles. Pickles waited by your parking space every morning, Gus says, “just in case.”",
  ];

  // ---- dates
  const toDate = s => new Date(s + "T12:00:00Z");
  const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const mmdd = s => s.slice(5);
  const inWindow = (w, a, b) => mmdd(a) >= w[0] && mmdd(b) <= w[1] && a.slice(0, 4) === b.slice(0, 4);
  // A trip leaving on `leave` (back the morning after LENGTH days): in one of the place's
  // windows, and no event while you're away.
  function fits(key, leave) {
    const t = DESTS[key]; if (!t) return false;
    const last = addDays(leave, LENGTH - 1);
    if (!t.windows.some(w => inWindow(w, leave, last))) return false;
    for (let d = leave; d <= last; d = addDays(d, 1)) if (World && World.eventOn(d)) return false;
    return true;
  }
  // An invitation today from one of `who` (friends who might ask): { key, who, leave, back }, or
  // null. Leaves on the first Saturday from LEAD[0] days ahead (up to LEAD[1]).
  function offer(date, who) {
    for (let k = LEAD[0]; k <= LEAD[1]; k++) {
      const leave = addDays(date, k);
      if (toDate(leave).getUTCDay() !== 6) continue;
      for (const w of who) { const key = DEST_OF[w]; if (key && fits(key, leave)) return { key, who: w, leave, back: addDays(leave, LENGTH) }; }
      return null;
    }
    return null;
  }

  // ---- what you send
  function rng(seed) {
    let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const OFFSETS = [[-2, 1], [-1, 3], [0, 4], [1, 1.6], [2, 0.25]];
  const FLASH = { "-2": 0.75, "-1": 0.6, "0": 0.35, "1": 0.12, "2": 0.03 };
  const target = player => Math.round(DAYS * rate(Mech.levelOf(player).level));
  // The sends on a trip for a climber (a copy of the player is levelled up as they go,
  // so a trip can carry you up a level or two). Every send is a first send: no repeats.
  function plan(player, key, seed) {
    const t = DESTS[key], r = rng(seed + "|" + key);
    const pl = { ...player, xp: player.xp || 0, tops: (player.tops || []).slice() };
    const goal = target(player), sends = [];
    let xp = 0;
    while (xp < goal && sends.length < 80) {
      const L = Mech.levelOf(pl).level;
      let x = r() * OFFSETS.reduce((a, o) => a + o[1], 0), off = 0;
      for (const [o, w] of OFFSETS) { if ((x -= w) <= 0) { off = o; break; } }
      const g = Math.max(0, Math.min(Mech.BAL.levelMax, L + off));
      const flash = r() < FLASH[String(g - L)] ;
      const got = Mech.sendXp(pl, { grade: g }, { first: true, flash });
      pl.xp += got; pl.tops[g] = (pl.tops[g] || 0) + 1; xp += got;
      sends.push({ g, flash: !!flash, xp: got });
    }
    // Names for the hardest: the area's real problems at each grade, each once.
    const used = new Set();
    const order = sends.map((s, i) => i).sort((a, b) => sends[b].g - sends[a].g || r() - 0.5);
    let named = 0;
    for (const i of order) {
      if (named >= NAMED) break;
      const opts = t.problems.filter(p => p.v === sends[i].g && !used.has(p.name));
      if (!opts.length) continue;
      const p = opts[Math.floor(r() * opts.length)]; used.add(p.name);
      sends[i].n = p.name; named++;
    }
    return { sends, xp, goal };
  }
  // The trip's stories: two of the place's, a sweet one with Rowan when you're together,
  // and Pickles if Pickles is yours.
  function tales(key, seed, o = {}) {
    const t = DESTS[key], r = rng(seed + "|tales|" + key), pool = t.tales.slice(), out = [];
    for (let k = 0; k < 2 && pool.length; k++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    if (o.together && t.sweet) out.push(t.sweet[Math.floor(r() * t.sweet.length)]);
    if (o.dog) out.push(PICKLES[Math.floor(r() * PICKLES.length)]);
    return out;
  }
  // How a grade reads: "6C+ (V5)" in a Font-graded area, "V5" elsewhere.
  function gradeLabel(key, s) {
    const t = DESTS[key], p = s.n && t.problems.find(x => x.name === s.n);
    return t.fontGrades && p ? `${p.grade} (V${s.g})` : `V${s.g}`;
  }
  // A save's trips, cleaned (G.trips: [{ key, who, leave, back, sends: [{ g, flash, xp, n? }], xp, tales: [text] }]).
  function clean(list) {
    const isDay = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s);
    return (Array.isArray(list) ? list : []).filter(x => x && DESTS[x.key] && isDay(x.leave) && isDay(x.back) && Array.isArray(x.sends))
      .map(x => ({ key: x.key, who: DESTS[x.key].who, leave: x.leave, back: x.back, xp: Math.max(0, +x.xp || 0),
        sends: x.sends.filter(s => s && Number.isInteger(s.g) && s.g >= 0 && s.g <= 20).map(s => ({ g: s.g, flash: !!s.flash, xp: Math.max(0, +s.xp || 0), ...(typeof s.n === "string" ? { n: s.n.slice(0, 60) } : {}) })),
        tales: (Array.isArray(x.tales) ? x.tales : []).filter(s => typeof s === "string").map(s => s.slice(0, 400)) }));
  }
  // First sends by grade on your trips (they count as proof for levels, like the park's).
  function tops(list) { const t = []; for (const x of list || []) for (const s of x.sends) t[s.g] = (t[s.g] || 0) + 1; return t; }

  const Trips = { DESTS, DEST_OF, LENGTH, DAYS, LEAD, GAP, RATE, rate, fits, offer, plan, tales, target, gradeLabel, clean, tops, addDays };
  if (typeof module !== "undefined") module.exports = Trips; else root.Trips = Trips;
})(typeof window !== "undefined" ? window : globalThis);
