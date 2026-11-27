# Phase 4, Stage 3: beta

Status: **built and reviewed (2026-11-26),** with play-test fixes in "After the review" at the end. The plan is `stage0-review.md` §3.4.

Before this stage there was **one tip per line, ever, from anyone**, offered at random when someone happened to be in the same area. Now beta comes from people, and what it's worth depends on who they are.

## Asking someone

In a conversation with a regular who climbs, there's a reply for up to two of your lines:
- **Any beta for …?** for each line of yours they can help with (one you've tried twice or more in the last two weeks and haven't sent)
- your main project, even if they can't help. Then they tell you who can.

| They… | What they tell you | Worth (share of what you don't yet know of that move) |
|---|---|---|
| **Have climbed it** | Any move: the one you're stuck on, or the better way through | Half |
| **Are working it** (or tried it and moved on) | Only moves they've got to | A quarter |
| **Haven't been on it, but it's their style** | Only a move in that style | A little (15%) |
| **Can't help** | Who can: a regular you've met who's climbed it (or is on it), and where they are today if they're out | Nothing |
| **A stranger** | A hint on the crux | A fifth |

- **How well you know each other matters.**
  - Someone you've just met tells you a bit less (×0.8).
  - Friends tell you more (×1.2).
  - Good friends tell you the most (×1.4).
- **So do your bodies.** If their way through a move relies on a reach you don't have (or a tight squeeze they fit and you don't), it's worth half, and they say so: "I'm a fair bit taller than you, so take this with a pinch of salt."
- **The better way through** (a heel hook, a drop-knee, an intermediate) comes from someone who has got past it and could use it themselves. An intermediate for shorter people comes from someone short; a tall friend will have watched shorter people use it.
- **It's aimed at where you struggle.** The game now counts your falls on each move. Beta goes to the move you keep falling on and know least ("You keep coming off move 4. I've seen you from the lot.").
- **Each person, once per line.** Several people's beta adds up, but never past knowing the moves completely: beta is capped as before, inside the shared ceiling on bonuses.

**In their own words.** Each regular has beta lines for each case, built around the technique:
- **Gus:** "I'm a fair bit taller than you, so take this with a pinch of salt. At the crux, move 4: …"
- **Hollis:** "My notes on move 3: “Thumb-catch the crimp and drive with your feet.” Underlined twice."
- **Otis:** "The crux, move 3! There's a tiny smear left of the arête. Trust it. And eat something first. That's half of it."
- **Rowan:** flips back through the sketchbook to a drawing of the crux, with little arrows.
- **Bea:** "I've seen you fall off move 4 like a hundred times. Not in a mean way!"
- **Dez:** "The crux, move 4. You keep coming off there. Keep your hips tight to the wall on the sloper."

**Pointers:** "Not a clue! But Gus has done it. Gus's out today, somewhere at The Tailgate. Take a sandwich as a bribe."

**Partners** call beta up from the pad once on a line they know (not every time, if it's only their style): "Otis calls up from the pad: “The crux, move 3! Match on the crux hold before you go for the next one.”"

**Afterwards:** send a line someone gave you beta on, and they'll mention it next time ("YOU DID SECOND BREAKFAST WITH MY BETA. I'm telling everyone.").

## Seeking it out

- **A problem's panel** (click its name) says which regulars you've met have climbed it, made its first ascent, or are working on it, and who gave you beta: "Gus made the first ascent · Otis has climbed it (and gave you beta). Ask them about it when you see them."
- **The move strip** marks a move someone told you about with a small gold dot. Hover over the move: "Beta from Otis."
- **Out today** (Stage 1) shows where they are.

## Recommendations

"You should try X" from everyone you met was the old kiosk feeling. Now:
- Regulars recommend only something they've climbed lately (their warm-ups and finished projects) that would suit you.
- They do it less often: in under half of conversations, and only when they haven't something else to offer.
- They say it in their own voice ("May I recommend …? I climbed it recently. The grade is, for once, correct.").
- Strangers still recommend as before.
- A recommendation still earns its ×1.2 XP when you send it.

The "I've done it!" replies, when you tell someone about your project, now invite you to ask for the beta rather than giving it away in passing.

## Saves

- **Phase 3's single tip** becomes one tip from someone unknown, so nothing is lost, and you can still ask each regular.
- **New fields are optional:** `ps.tips` (who told you what, and when) and `ps.fx` (falls per move). They're checked on load, and anything in a save file that doesn't check out is dropped.
- **Unchanged:** XP. Beta changes what you know of the moves, not what a send is worth.

## Balance

The simulator (`scripts/balance_game.js`) now models beta. It's on by default; `--nobeta` turns it off.

**How it's modelled:** a keen climber who, every climbing day, asks every regular out that day who knows a line they're working. That's about 80–100 tips over 200 climbing days, more than most players will ask for.

Climbing day each level is reached (medians of 40 climbers):

| | V9 | V11 | V13 |
|---|---|---|---|
| **Steady**, no beta | 53 | 97 | 174 |
| **Steady**, with beta | 49 | 92 | 164 |
| **Projector**, no beta | 55 | 89 | 148 |
| **Projector**, with beta | 53 | 89 | 144 |
| **Mileage**, no beta | 42 | 71 | 121 |
| **Mileage**, with beta | 40 | 70 | 117 |
| **Explorer**, no beta | 35 | 62 | 119 |
| **Explorer**, with beta | 35 | 61 | 117 |

- **At most a few percent faster,** even for the keenest asker, and within the agreed pace. The targets (V9 by about day 55, V11 100, V13 180+) still hold.
- **No retuning needed.** Beta is worth having, but it doesn't replace working the moves.
- **The crag's pace is untouched:** the regulars' lives only gained a function that reads them.

The full outputs are in `stage3-balance.txt` and `stage3-balance-nobeta.txt`.

## Fixed along the way

- **Walking away from a conversation with the keys** now ends it straight away. Before, it only ended once you reached a different boulder or area, so stepping back a few metres from someone at the same boulder left the box open. The distance is now checked on every step, but only while you're talking to someone.

## Tests

- **`node scripts/test_beta.js`** (new, 12 tests):
  - sent > working it > style
  - friends tell you more
  - aimed at the move you fall on
  - someone working it only knows what they've reached
  - who can show you the better way through
  - the body caveat
  - nothing past the cap or the ceiling
  - falls counted
  - Phase 3's tip
  - `knowsLine`
  - the words
- **`node scripts/test_talk.js`:** every beta, pointer and recommendation line, in every voice, for every case. All render, with no gendered pronouns.
- **`scripts/browser/phase4_stage3.js`** (new), covering:
  - asking
  - their answer
  - once per line
  - being pointed to someone else
  - a partner calling it up
  - the panel and the move strip
  - an old save's tip
  - a bad save file
  - no leaks
  - the phone layout
- **Every suite passes,** with no page errors or leaks: `v2test`, `live`, `stage3`, `stage4`, `stage5`, `polish`, `walk_fixes`, `walk` (59 fps), `phase4_stage0`, `phase4_stage1`, `phase4_stage2` (its walk-away step now tries another direction if a boulder is in the way), and the Node suites.
- **Seen only in headless Chrome.**

## For review

1. **What beta's worth:** is half a move's gap from someone who's climbed it (less from someone working it) about right? It should feel like it helps, without replacing working the moves.
2. **The pointers:** is "ask Gus, Gus is out today at The Tailgate" the right way to send you to people?
3. **Fewer recommendations,** and only things they've climbed. Is that better, or do you miss "you should try…"?

## After the review (2026-11-26)

**Decided:**
- Beta's worth is right as built.
- The pointers ("ask Gus, Gus is out today at The Tailgate") stay.
- Fewer recommendations is right.

**Fixes from play-testing:**
1. **The whole game fits the window.**
   - **What was wrong:** the map and notebook were sized as the window's height minus 150 px, but the header and margins take about 170 px. The bottom of the map, and the conversation box with it, fell below the window.
   - **The fix:** on a desktop (wider than 1000 px), the game is now exactly the window's height: the header, then the map and notebook filling the rest. The notebook (CragLog included) scrolls inside itself.
   - **Checked** at 1100×700, 1280×560, 1280×720, 1440×900, 1536×864 and 1920×1080: no page scrolling at any of them.
   - **On a phone** the map and notebook still stack, and the page scrolls as before.
2. **You can walk when rain's coming.**
   - **What was wrong:** a trip was refused if it would arrive after the rain was due ("It'll be raining before you get there"). That was left over from before rain stopped only the climbing.
   - **The fix:** only the dark stops a walk now.
   - **Tested** with rain on its way and with rain already falling.
3. **Pickles is in one piece.**
   - **Portrait:** his head floated over his collar. There's now a neck rising from his shoulders up behind his head, with the collar around it, so he stays joined when he tilts his head.
   - **On the map:** his head was a separate outlined shape laid over his body. He's now one curled-up outline, with a line for his cheek, a closed sleepy eye and a nose.

**Tests:**
- `phase4_stage3.js` checks walking with rain coming and falling.
- Every suite passes.
