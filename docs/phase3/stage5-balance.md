# Phase 3, Stage 5: final balance and play-testing

Status: **built (2026-11-26), for review.** The plan is `stage0-design.md`, section 8 (Stage 5), and the checklist in the original plan's Stage 6. Also in this round: the climbing scene's buttons reworded (asked for with the go-ahead), and the game made to lay itself out for phones.

**Two numbers changed:** `shiftTop` 0.3 → 0.36 (the pace) and `learnWork` 0.3 → 0.4 (working moves). The simulator's `--work` option had been broken since Stage 3 by a name clash, and is fixed.

## The buttons, reworded

In the climbing scene, each button now says what it does to your odds on one line and what it costs on the next:

| Button | First line | Second line |
|---|---|---|
| **Work a move** | Increase your odds of sending +3% | Cost: 5 energy |
| each move in its list | You know it a little (or "You don't know it yet") | Increase odds +2% |
| **Rest** | Add 12 energy. Increase odds +4% | Cost: 20 min |
| **Brush** (same pattern, for consistency) | Increase odds +3% | Cost: 5 min |
| **Tape up** | Half the skin per burn. Odds −9% | Cost: 5 min |
| **Take the tape off** | Odds +9% | Burns cost full skin again |

**How the numbers work:**
- **Odds** are percentage points of your send chance: "+0.4%" when it's small, "+0%" when it changes nothing.
- **Rest's energy** is what you'd actually get back (less than 12 when you're nearly fresh).
- **Send burn** keeps its chance in the label, with its energy and minutes underneath.

## The pace, back on target

By Stage 4, brushing, vibes and partners had moved steady climbers and projectors ahead of the agreed pace from V7 up (V13 at about day 135 against 180+).

Stage 0b's notes named the lever to use if the game felt quick: the top of the send curve, not the level costs. Raising V12–V13 costs had stranded projectors short of V13, and raising costs could lower existing climbers' levels.

**The change:** `BAL.shiftTop` goes from 0.3 to 0.36. Grades above V4 get a little steeper to send, more so the higher you go. Nothing else changes:
- XP for a send, the level costs and the proof needed are unchanged.
- No climber's level or XP changes, and no save is converted.
- Spotting lines is judged on the gentler low-grade curve, so it's unchanged.
- Climbers find their hardest projects a touch harder.

**Five settings were tried** (10 climbers each per style):

| Setting | Steady V13 | Projector V13 | Mileage V13 | Explorer V13 |
|---|---|---|---|---|
| Stage 4 (`shiftTop` 0.3) | 135 | 133 | 106 | 101 |
| **`shiftTop` 0.36 (chosen)** | **172** | **150** | **120** | **119** |
| 0.36, and above-level XP ×1.0 | 160 | 135 | 119 | 115 |
| 0.36, and less XP below your level (0.65) | 188, 80% get there | 153 | 131 | 122 |
| 0.42 | 200, 20% get there | 170 | 147 | 144 |
| 0.42, and less XP below your level | none | 179 | 166 | 153 |

**Final run** (16 climbers each, `stage5-output.txt`), days to each level:

| | V3 | V5 | V7 | V9 | V11 | V13 |
|---|---|---|---|---|---|---|
| target | 6 | 15 | 30 | 55 | 100 | 180+ |
| steady | 5 | 15 | 27 | 54 | 99 | 171 (94% by day 200) |
| projector | 5 | 15 | 30 | 56 | 91 | 149 |
| mileage | 5 | 10 | 21 | 42 | 71 | 117 |
| explorer | 4 | 9 | 19 | 35 | 60 | 119 |

## The checklist (from the original plan)

1. **Tries by grade relative to your level** (all climbers pooled):

   | Relative grade | Send chance per try |
   |---|---|
   | 3 or more below | 94–96% |
   | 1 below | 63–73% |
   | At your level | 18–28% (median 2–3 tries to send) |
   | 1 above | 5–8% |
   | 2 above | 1–3% |
   | 3 above | about 0 |

   The 90th percentile at your level is 8–16 tries, mostly tired climbers who keep going.
2. **Days to send a project one grade up:** 1–2 days to V8, and 2–6 from V9 up. Steady climbers take about 5 at V9+, a little over the 2–4 aimed for at V12–13. That's the steeper top of the curve doing its job.
3. **Working moves:** see "Working a move" below.
4. **Different strategies help in different places:**
   - Brushing: 650–1,100 times per climber over 200 days, mostly dirty lines (Climb it brushes those for you).
   - Rests and partners.
   - Tape is rare in the simulator (about one day per climber), because its climbers seldom run their skin down. It's there for players who do.
5. **Does one strategy dominate?** Mileage and explorer climbers reach V13 about a third sooner than steady climbers, as they have since Stage 0b. See "For review".
6. **Are brushing and taping repetitive?**
   - Brushing a dirty line is once per line, and Climb it does it for you.
   - Brushing friction holds is once a day per project, and only offered below 80%.
   - Tape is once a day.
   - None of them is needed before every burn.
7. **Does the XP economy support full progression?** Spare XP is at least 1.6× what's still needed for V13 at every checkpoint. 94–100% of climbers reach V13 by day 200.
8. **Do high-level climbers still have projects?** Yes: a one-grade-up project at V9+ takes 2–6 days.
   - By day 200 the simulated climbers have sent the whole park, all 1,000 problems.
   - The park is the game's content; climbers who reach V13 around day 120–170 have a few weeks of top-end projects left.
9. **Is easy climbing rewarding?**
   - Easy mileage pays about a third of the XP an hour of climbing at your level, so it's worth doing but never the quick way up.
   - Repeats pay three times a day.
   - First ascents, finding boulders and the regulars reward it in other ways.
10. **Can falling be farmed for XP?** No. Falls earn no XP; they teach the moves and a sliver of skill (tiny, and zero-sum).
11. **Is the climbing scene too slow?**
    - A burn plays in 2–4 seconds, and rest, brushing and tape are instant.
    - Easy problems keep the one-tap Climb it.
    - With reduced motion, everything is instant.
12. **First ascents and the developing crag:**
    - Keen climbers take 25–36% of first ascents by the end of 2025 (target about 30%).
    - Mileage and explorer climbers take more, as before.
    - The crag's own development (`tune_crag.js`) doesn't use these rules and is unchanged: 72% climbed by the end of 2025.
13. **Desktop and mobile:** see "Phones" and "Performance".

### Working a move

**Projectors who work moves** (`--work`) were no quicker than those who don't: V13 at about day 150 either way. In Stage 2 they were about 6% quicker; since then brushing, partners and the steeper top of the curve had crowded the advantage out.

**The change:** `BAL.learnWork` goes from 0.3 to 0.4, so working a move on its own teaches it a third more.
- Projectors who work moves now reach V13 at about day 142, against 149 for those who don't (16 each, `stage5-output-work.txt`).
- They find the better way through a crux twice as often: in 15% of their sends a grade or more up, against 8%.
- They spend about 23 hours over 200 days working single moves.

Working moves is worth doing on a project without being the fastest way up. It only changes things for players who choose to work moves.

### Climbing alone

**Simulated climbers who never climb with anyone and get no vibes,** but do brush (`--novibes`), are on the agreed pace:

| | V7 | V9 | V11 | V13 |
|---|---|---|---|---|
| steady | 29 | 60 | 107 | 179 (half by day 200) |
| projector | 32 | 63 | 100 | 161 |

- **Partners and the crag's good vibes** make it about 5–10% quicker.
- **Climbing alone** keeps to the targets.
- **Never brushing either** (`--novibes --noprep`) is slower: steady V13 at about day 193. That's mostly the dirt on first ascents, and Gus teaches brushing on day two.

## Phones

The page had no mobile viewport tag, so phones laid the whole game out at desktop width (about 980 px) and shrank it. The phone layouts already in the CSS never applied, on the map, in the panels or in the climbing scene.

It now has `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. At 390 × 844 (an iPhone-sized screen, in headless Chrome):
- **The creator** fits the width.
- **The status card, the map and the side panel** stack one above the other.
- **The climbing scene** uses its phone layout: the cards over the sky, the picture, the narration, then the menu.
- **Nothing scrolls sideways.**

One fix was needed: the map's "Tap where you want to go" hint was squeezed into a column a word wide. It now spans the map on narrow screens.

**Not yet seen on a real phone.** The map is fairly small on a phone, below the status card, and that's worth a look.

## Performance

- **Walking on the map:** 54 fps in headless Chrome, with 4% of frames janky, about as before (55–59). It was measured while the simulator ran alongside.
- **The climbing scene** is one small SVG and only redraws the climber while animating.

## Tests

- **Node:** `test_moves` 11, `test_prep` 8, `test_partners` 6, `test_world` 36, all passing.
- **Browser suites:** `v2test`, `live`, `stage3`, `stage4`, `stage5`, `walk_fixes`, `walk`: all pass, no page errors or leaks.
  - `stage3.js` reads the new button wording.
  - Its afternoon is now always dry, so a random 3 PM shower can't end its test day.
- **Seen only in headless Chrome,** on desktop and phone sizes, not on a real device.

## For review

1. **The new pace:** steady climbers on target, and projectors, mileage and explorer climbers quicker. Hard grades are a touch steeper for everyone, your own climber included.
2. **Mileage and explorer climbers are still about a third quicker to V13 than steady climbers.** The simulated steady climbers spend most of their tries on one-grade-up lines at 5–8% a try, while mileage climbers send lots at their level.
   - Cutting XP for easier lines (0.65 a grade) narrowed the gap a little, but left a fifth of steady climbers short of V13.
   - My suggestion is to leave it: climbing a lot is a fine way to get strong.
3. **Phones:** worth trying the game on your own phone now that it lays itself out for one.

## Small changes before the next stage (2026-11-26)

- **Climbers can be as short as 4 ft** (122 cm, down from 150). Reach still counts through the same capped adjustment, so the shortest climbers find reachy problems up to about 0.6 of a grade harder and bunchy ones easier.
- **Your car is parked two spaces along** from the trailhead end, the next free space after the cream car. Every day still starts at the same spot by the trailhead end, now in front of an empty space, so you can walk straight out.
- **My logbook is under CragLog,** beside Problems, Local Buzz and Rankings. The Logbook tab is gone, leaving Here, Climber, CragLog and Journal.
- **Rankings** can now rank everyone in two ways:
  - **Most first ascents** (as before).
  - **10 hardest ascents** since the park reopened, scored like the old rankings: 100 points per V-grade, plus 50 for a flash. A climber's 10 can be opened.
  - A local's ascents come from the ledger: their first ascents, plus the logs on each problem (the latest 20 per problem).
  - A line in an area you haven't found isn't named.
- **Rain stops the climbing, not the day.**
  - On a rained-out day, or once rain starts partway through, there are no burns, no working moves and no Climb it. The scene's Send burn says "Too wet to climb", and the status bar says "Raining: no climbing".
  - You can still walk the park, find boulders and lines, talk to the regulars, rest, and brush a dirty line clean "for when it dries".
  - Climbing together and tape wait for dry rock.
  - The day ends at dusk or when you head home. A day without climbing still counts as rest.
- **Two small fixes found on the way:**
  - The scene said a line "feels project". It now says "feels like a project", "like it should go" and so on.
  - On a rained-out day, a "rain is on its way" warning no longer appears.
- **Test:** `scripts/browser/polish.js` covers a 4 ft climber, the car, My logbook, both rankings, a rained-out day and rain partway through a day. The leak test now reads My logbook and opens the hardest-ascents rankings.
- **All browser suites pass with no page errors or leaks.** Walking runs at 59 fps.
