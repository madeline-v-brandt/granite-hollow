# Phase 4, Stage 0: the foundations

Status: **built and reviewed (2026-11-26).** The audit and the plan are in `stage0-review.md`.

This stage is mostly underneath the game: the regulars now have climbing lives, and the game remembers what you do with each of them. Three things show on screen:
- The regulars stand where they're actually climbing that day.
- Pickles is only ever where he's drawn.
- Local Buzz has the regulars' long projects in it, and only one classic at a time.

## The regulars' lives (`world.js`)

Gus, Hollis, Otis, Rowan, Bea and Dez now each have three things.

### A routine

Which days they come, and the hours they're around:

| | When |
|---|---|
| Gus | Most days (60%), near the lot, 8–5 |
| Hollis | Midweek and Saturdays, 10–5 |
| Otis | Half of all days, **rain or shine**, 9–6 |
| Rowan | About five days a week: Sundays and Mondays when the library's shut (85%), and most other days before work, 7–11 (65%) |
| Bea | Weekends in term time (80%), after school on weekdays (30%, 3:30 on); most of the summer (75%) |
| Dez | Early mornings, 6–noon; longer at weekends |

On a wet day half as many come (Otis doesn't care), and nobody climbs.

**The hours were lengthened in Stage 1's review** (`stage1-visibility.md`), when people started coming and going. Everyone who's out is still there all day. Comings and goings are for Stage 1, with the "Out today" list.

### A project

A line near their limit, in their style, in one of their home areas. Once those are worked out, it can be anywhere the community climbs.

- **They work it over several sessions:** tries, a high point creeping up, days of "so close".
- **Eventually they send it, or give up after 20 sessions.**
- **Projects on established lines:** projects take 4–8 sessions on average, over one to three weeks. Some take longer: 14 months of simulation has projects of two weeks or more for every regular.
- **Projects on unclimbed lines** become their first ascents:
  - They come out of the day's first-ascent budget, plus at most one extra a day late in the season, so the crag develops at the same pace as before (below).
  - **A line you've found is never theirs to take.** If you find their project, they can't send it until you've done it, and they move on after 12 sessions.
- **Other people leave a regular's project alone.**

### A session on each day they're out

- Where they are: their project's boulder, or one in a home area.
- One to three warm-ups.
- How the project went: send, close, fell, mileage, or wet.

Their warm-ups are logged in the ledger as repeats, once per climber per line.

**They also keep a record of everything they've climbed,** so who has climbed what no longer depends on the ledger's five logs per problem.

**They get stronger, for two years:**

| | Grades a year | Over two years |
|---|---|---|
| Bea | 1.5 | V9.6 → V12.6 |
| Rowan | 1.2 | V5.8 → V8.2 |
| Hollis | 0.4 | |
| Dez | 0.4 | V13.4 → V14.2 |
| Otis | 0.3 | |
| Gus | 0.2 | |

The park tops out at V13, so a strong player can match Dez at the comp by their second fall.

**Determinism:**
- Each regular's day comes from their own seeded stream (`reg|who|date`).
- Simulating in pieces or all at once gives the same lives (tested), and a reload never changes anyone's day.
- The rest of the community's simulation is untouched, apart from projects drawing on the first-ascent budget.

**Storage:** `G.world.reg[who] = { proj, sent, recent, done }`.
- `recent` is the last 30 sessions; `done` is the last 30 finished projects.
- It's written only by world.js.
- `World.validate` checks it when it's there. It's optional, so older saves are valid without it.
- **Older saves are filled in on load** (`World.ensureReg`):
  - Each regular's sends come from the ledger.
  - Today's sessions are added, with no first ascents (today's community day had already been simulated).
  - A record that doesn't check out is rebuilt.

## The social record (`social.js`, new)

**What you do with each regular is kept as dated moments:**
- met (you talked)
- chat (sat and talked)
- climb (climbed together)
- sendWith (a send with them there)
- beta (they gave you some)
- proj (they know what you're projecting)
- lesson (they taught you a skill)
- pet (Pickles)

**How it counts:**
- Each kind counts once a day, so ten chats in a day is one day of chatting.
- Every distinct moment is remembered (the latest 40 per person), for later lines like "did you ever send that?".
- **Friendship is worked out from the moments, never stored,** so it can be retuned without converting saves. It never goes down.
- The tiers ("You've met", "You know each other", "Friends", "Good friends") are a first guess, for Stage 4 to tune.
- **Nothing shows it yet,** apart from the dev panel.

**Saves from before Phase 4 start from what they already record:**
- the days you've met each regular, your chats and your pets (`G.know.met`)
- your sends together (`tick.with`)

A social record in a save file is cleaned on load, never trusted.

## Fixes

- **Pickles is only ever at his rock.** On about a third of mornings he used to "trot over from the lot" while the map drew him asleep at Pickles' Rock, 95 m away. That's gone: you go and find him.
  - His lines now fit where he is ("Pickles thumps his tail at you from the shade of his rock").
  - "Gus whistles him back" only plays when Gus is out.
- **Local Buzz:**
  - **Classics are capped at one at a time.** From about April of the first year, the crag is nearly fully climbed: in a simulated year, first ascents fell to 1–5 a month while "becoming a classic" rose to 9–14.
  - **The regulars' long projects are news now:** "Bea Marchetti finally sent The Machine Stops (V11) on The Engine Room, after four sessions on it." (from a simulated season; the output is in `stage0-tune-output.txt` and `stage0-balance-output.txt`)
  - **A regular's first ascent of a long project says so too.**
  - Both are as vague as the rest of the buzz about places you haven't found.

## Balance: unchanged

**The crag** (`node scripts/tune_crag.js`, climbed by the end of 2025 / the share of first ascents that are the player's):

| | Before Stage 0 | After |
|---|---|---|
| real | 723 / 14% | 723 / 14% |
| keen | 639 / 36% | 639 / 36% |
| casual | 587 / 7% | 588 / 7% |
| homebody | 343 | 348 |

**The climbers** (`node scripts/balance_game.js --n 16`, V13 by climbing day):

| | Stage 5 | Now |
|---|---|---|
| steady | 171 | 167 |
| projector | 149 | 149 |
| mileage | 117 | 121 |
| explorer | 119 | 123 |

The differences are within the noise of 16 climbers each.

## Tests

- **`node scripts/test_world.js`:** 45 tests, 9 of them new, covering:
  - the regulars have records and finish projects
  - their sends are in the ledger
  - nobody takes a line you'd found
  - projects take several sessions
  - the routines
  - getting stronger, and levelling off
  - simulating in pieces or all at once gives the same lives
  - old saves filled in without new first ascents
  - damaged records refused and rebuilt
  - Local Buzz's projects and one classic
- **`node scripts/test_social.js`:** 8 tests, new, covering:
  - seeding from old saves
  - once a day per kind
  - no farming
  - never going down
  - bounded memory
  - bad records cleaned
  - only the regulars
  - new climbers
- **`node scripts/browser/phase4_stage0.js`:** new, covering:
  - over 16 mornings, Pickles is never at the lot
  - the regulars drawn are exactly those out, where their sessions are
  - walking up to a regular is remembered
  - an older save gets both records on load, with no new or rewritten first ascents
- **Also passing:**
  - the other Node suites (`test_moves`, `test_prep`, `test_partners`)
  - every browser suite (`v2test`, `live`, `stage3`, `stage4`, `stage5`, `polish`, `walk_fixes`, `walk`), with no page errors or leaks
- **Walking:** 59 fps.
- **Seen only in headless Chrome.**

## Reviewed (2026-11-26)

1. **Routines:** as above, with Rowan out more: about five days a week instead of about three.
2. **Project length:** one to three weeks is right.
3. **The order of the remaining stages:**
   1. visibility
   2. dialogue, portraits and reply choices
   3. beta
   4. friendship
   5. Pickles
   6. romance
   7. events
   8. polish
