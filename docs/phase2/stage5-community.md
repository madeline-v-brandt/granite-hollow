# Phase 2, Stage 5: the community, the regulars, directions and Local Buzz

Built 2026-11-25. Screenshots: `docs/screenshots/phase2-stage5/`.

## The community's pace

Targets set by the user on 2026-11-25:
- About 70% of the crag climbed by the end of 2025.
- A keen player takes about 30% of first ascents.
- The community knows every boulder by about May 2026.
- The far areas are left alone for a while.

Run `node scripts/tune_crag.js` to see the numbers. It simulates four players through 2026:
- **real:** climbs 2 days in 3, finds a new area every 5 climbing days, looks over a boulder a day, sends up to 4.
- **keen:** looks over 2 boulders a day anywhere.
- **casual:** climbs 1 day in 3.
- **homebody:** never explores, so this measures the community alone.

| End of 2025 | Climbed | Your share then | By May 2026 | Your share then | Community knows every boulder |
|---|---|---|---|---|---|
| real | 73% | 15% | 88% | 27% | mid-February |
| keen | 64% | 42% | 88% | 58% | mid-December (mostly by word of your finds) |
| casual | 59% | 12% | 80% | 15% | late February |

Changes in `World.PARAMS`:
- **`target.tau` 60 → 65.** The development curve.
- **`explore`:**
  - The community finds boulders more slowly (`perNpc` 0.015, at most 1 a day).
  - It only ventures as far as `reach` allows: 9 minutes from the lot at the reopening, plus 0.09 minutes a day. So the 16-minute areas open up in late November and Back Forty (24) in mid-February.
- **`explore.spreadDays` 10.** A boulder you find becomes common knowledge 10 days after you inspect it (straight away if you were told about it). So finding a far boulder yourself still means untouched rock for a while.
- **`trickle` 0.15.** Past the development target, the community still climbs about one new line a week while any are left. Without this, a save past 90% (the target's ceiling) never saw another NPC first ascent. That's how the user's late-game save got stuck with 16 lines nobody could see.
- **`regularBoost` 1.4.** The regulars put up a bit more than their share.

Protection is unchanged: lines you've identified or tried stay yours (apart from the rare snipe story). With the faster pace, the community reaches most lines before you do, so protection no longer swallows the community's share.

## Spotting counts your hardest send

`Mech.canSpot(player, p, best)`: any line at least a grade below your hardest send is readable, whatever your XP level says. A climber who has sent V13 sees every V12 right away. `K.canSpot` passes `G.bestGrade`.

## The regulars

A cast in `World.NAMED`, all fictional, with a home area, an arrival day (your climbing days) and a one-line description:

| Who | Climbs | Home | Notes |
|---|---|---|---|
| Ranger Gus | V3 | The Tailgate | the park ranger (arrives first, as before) |
| Pickles | — | The Tailgate | the parking-lot dog; never climbs, never in the ledger |
| the Bishop | — | The Schoolhouse, Millrace Caves, The Tailgate, Hawkwatch | old-era; around about 1 day in 8; never climbs now |
| Rowan Ellery | V6 | Hawkwatch, The Schoolhouse | sketches the boulders between burns |
| Hollis Pruitt | V5 | The Schoolhouse, The Tailgate | has documented everything, twice; most likely to give directions |
| Otis Fairweather | V4 | Hemlock Hollow, Millrace Caves | thinks every day is perfect sending weather |
| Bea Marchetti | V10 | Bracken Gully, Millrace Caves | seventeen, jumps for everything |
| Dez Kowalczyk | V13 | Millrace Caves, The Grout Piles | the strongest and quietest; can put up the V13s |

- **Arrival:** the climbing regulars join the community on their arrival day (2–18) and put up problems under their own names (`n:rowan` and so on). They're kept out of the ordered arrivals of the 600 simulated climbers, so older saves' arrival order is unchanged.
- **Stories still to come** (not built): Pickles may one day claim you as his person if you pet him consistently, and Rowan is the love interest. For now, petting is counted (`G.know.met["n:pickles"].pets`), and Pickles leans in more the more you've petted him.

### Meeting them

On arriving in an area (`regularFor` in `game.js`):
- **Pickles** is there half the time at The Tailgate, and sometimes waiting by the car in the morning.
- **The Bishop** turns up in his haunts on the days he's out (`G.day.bishop`, 13%).
- **A regular** is met 30% of the time in their home area, and 5% elsewhere.
- **A stranger** from the 600 is met as before.

`G.know.met` records who you've met, how many times and when. The card says "first meeting" or "met 4 times".

What a regular says:
- **A greeting:** their own hello the first time, then one of their usual lines.
- **A remark:** sometimes your latest first ascent ("Saw your name in CragLog"), or theirs (named only if you know the line; otherwise "something new at …" or the area's vague phrase).

Then one offer:
- **Directions** (Ask the way):
  - Offered only for an area you don't know that the community has known for 5+ of your climbing days, so explorers get there first.
  - Phrased vaguely until you ask ("Have you been down along the millrace yet?").
  - Asking makes the area known (`K.hearOf`, stored in `G.know.told`). Go there then works, and the trail map says "The Bishop told you the way".
  - Hollis and Gus offer most often.
- **A line you hadn't noticed** (Where exactly?):
  - A hidden line on a boulder you know is identified as told (`K.tell`).
  - Dez, Bea and the Bishop point out hard ones; the others only lines near your level.
  - This is how you'll find the lines you can't read yet.
- **A recommendation and beta,** as strangers give.

**The Bishop:**
- Claims he did whatever you sent today or are projecting, in a random year between 1971 and 1986 and in a random manner ("In work boots", "Wearing a tie. It was a Sunday").
- His claims are never stored. His directions and pointed-out lines are real.

**Pickles:** a Pet Pickles button.

## Someone climbed a line you'd spotted

A snipe (rare, unchanged rules) is now told the next morning: "Word from Bea Marchetti: they climbed X on Y, the line you'd spotted. 'Hope you don't mind. It's brilliant, you'll love it.'" It also appears in Local Buzz.

## Local Buzz (CragLog, top of Problems)

`K.buzz()` reads `world.news` from the last three weeks, so it adds no new state. It shows at most 5 items, 2 a day, and 2 per climber. The most notable come first:
1. a line taken from you
2. the first problem in an area
3. a newly named area
4. a regular's arrival or first ascent
5. hard lines
6. classics

**Places you know** get precise items: "Bea Marchetti put up Pacer Test (V9) on The Gymnasium at The Schoolhouse", with See it or Go there.

**Places you don't** stay vague:
- "Word is someone put up a stiff V6 out past the old village", "somewhere at The Schoolhouse" (an area you know, a boulder you don't).
- Never a Go there.
- An unknown area's name never appears: a newly named area you don't know reads "People have started climbing up the fern gully". This changes section 12's example, which named the area, to keep section 2's rule that a name appears only once you know the area.

The world now records news for the first problem in every area (`first: true`), and when the community first found each area (`world.areas`, used for the directions rule).

## Rankings (rebuilt from the ledger)

Under the new rules, CragLog's Rankings lists first ascents since the reopening: climbers by number of first ascents and their hardest, with the regulars marked and you highlighted. The old points table remains under the old rules (development mode).

## Save changes

All optional; older saves load as before (`World.validate` checks them when present):
- `world.areas`: `{ area: [date found, your climbing day] }`.
- `know.told`: `{ area: { from, date } }`.
- `know.met`: `{ who: { n, first, last, pets? } }`.
- `tips[].from` may now be a named regular (`"n:hollis"`) as well as a climber index.
- `day.bishop`: whether the Bishop is out today.

## Checked

In Node and headless Chrome only, not yet in a real browser:
- **Node tests (36),** 5 of them new:
  - spotting from your best send
  - the regulars arrive and the dog and the Bishop never climb
  - the far areas are left alone at first
  - being told the way, and meeting counts
  - Local Buzz never names what you don't know
- **`scripts/browser/stage5.js`:** a mid-October climber walks between areas and meets the Bishop, Pickles, Gus, Hollis, Bea, Dez and Rowan, and uses each kind of offer:
  - the Bishop's directions put Millrace Caves on the trail map
  - pointed-out lines go into the journal
  - Pickles is petted
  - Local Buzz and Rankings render
  - no leaks in any of the new text
  - `SHOTS=dir` saves the screenshots
- **Earlier browser tests:** the leak test (`v2test.js`, which also now ignores hidden problem names found inside places you know, such as "Millrace" in "Millrace Caves"), normal mode and walking all pass.
- **The user's own save** (January 2026, converted from the old rules) loads without errors. Over the next 60 simulated days Dez and a strong local climb about 8 of its remaining V12–V13 lines, and its 6 hidden V12s are now readable.

## Not done yet

- The Pickles and Rowan stories.
- NPCs you can see on the map.
- Climbing partners.
- Regulars' lines that change with your history together.
