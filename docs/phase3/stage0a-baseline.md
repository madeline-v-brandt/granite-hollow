# Phase 3, Stage 0a: measuring today's balance

Status: **done (2026-11-25).** No rules changed. This is the baseline Stage 0b's new rules will be measured against. The plan is in `stage0-design.md`.

## The simulator

`scripts/balance_game.js` was rewritten. Simulated climbers now play under the game's real code:

- the climbing rules in `mechanics.js` (or a candidate rules file, with `--rules`)
- a crag developed by its NPC community around them (`world.js`)
- discovery (`knowledge.js`)

They start on 2025-09-06, knowing the three kiosk areas. They hear of a new area every few days, look over boulders (5 game minutes each) to see the lines on them, and can only climb lines they can see, as in the game. The old simulator let everyone climb every problem from day one; `--open` still does.

**Four playstyles:**

| Playstyle | How it climbs |
|---|---|
| **steady** | Problems from two grades below to one above its level, best expected XP first. |
| **projector** | One hard project at a time, one to three grades up. Two warm-ups, then burns with rests between, then mileage. Switches after 12 days without a send. |
| **mileage** | Problems it will probably send, a grade or more below its level. |
| **explorer** | A new area every two climbing days, every boulder looked over. Prefers unclimbed lines (first ascents). |

Each playstyle falls back to anything with a real chance when it runs out of lines in its range, as a real player would.

**Three builds:** average (170 cm, +2 ape), tall (188, +6) and short (155, −1). Each has two random strengths and a weakness.

**Schedule:** everyone climbs two days and rests one, skipping days rained out, for 200 climbing days.

**Reports:**
- the climbing day each level is reached, against the targets
- level against hardest send
- what style skills are worth
- XP headroom: the XP from sending everything still unsent, over the XP still needed for V13
- by grade relative to your level: tries, send rate, flashes, tries per send, XP per hour
- days per project
- what lifted sends far above your level
- your share of first ascents
- level by build

**Running it:**
- `node scripts/balance_game.js`: four playstyles with 40 climbers each, about 2 minutes.
- `--n`, `--style`, `--days`, `--rules`, `--open` and `--json` change the run (see the file's header).

The full output from this baseline, with 30 climbers each, is in `stage0a-baseline-output.txt`.

**It matches real play.** At climbing day 100, the simulated climbers are level V7 with a hardest send of V11–12, after about 960 sends. The user's play-test save at day 85 is level V7, hardest send V13, after about 950 sends.

## What today's rules do

Medians across all four playstyles unless noted.

**1. Levels stop at V7.** No climber in any playstyle reached V9 in 200 climbing days, and the early levels are slower than the targets:

| Level | Target day | Today |
|---|---|---|
| V3 | 6 | 8–10 |
| V5 | 15 | 22–27 |
| V7 | 30 | 61–69 |
| V9 | 55 | never |
| V11 | 100 | never |
| V13 | 180 | never |

**2. V13 is out of reach from the start.** XP headroom is below 1 from day 15:
- At day 15, sending every problem in the park would give 13–15% of the XP V13 needs.
- At day 100 it would give 1–2%.

**3. Hardest sends pull away from the level:**

| Climbing day | Level | Hardest send | Gap |
|---|---|---|---|
| 30 | V5 | V6–8 | 1–3 |
| 55 | V6 | V9 | 3 |
| 100 | V7 | V11–12 | 4–5 |

By day 100, every simulated climber's hardest send is at least three grades above their level.

**4. Style skills are the cause.** The average skill, at 0.7 of a grade per point, is worth:

| Climbing day | Style skills worth |
|---|---|
| 30 | +1.1 grades |
| 55 | +1.6 |
| 100 | +2.0 to +2.1 |

On sends two or more grades above the climber's level, the median lifts were:

| Lift | Median |
|---|---|
| Style | +1.8 to +2.1 grades |
| Conditions | +0.24 |
| Beta | +0.2 |
| Reach | 0 (it only counts on reachy and bunchy problems) |

**5. Chance per try, by grade relative to your level:**

| Relative grade | Today | Target |
|---|---|---|
| 2 or more below | 99–100%, all flashes | up to about 95% |
| 1 below | 90–96% | a try or two |
| At your level | 71–77%, median 1 try | about 38%, 1–4 tries |
| 1 above | 51–66% | a session at low grades, days at V12–13 |
| 2 above | 44–50% | rare, about 10% at best |
| 3 above | 25–34% | almost never |
| 4 or more above | about 15% | almost never |

**6. Projects never take more than a day.** In every cell (grades above your level, at every level) the median is one day, even three grades up. The target for one grade above at V12–13 is 2–4 days.

**7. Falling far above your level earns the most.** XP per hour peaks two grades above your level, at 43–49, against about 30 at your level and 10–13 on easy problems. Today the most efficient way to earn XP is to climb well above your grade.

**8. The park runs out.**
- The median climber sends about 960 problems in their first ~100 climbing days, about 10 a day.
- After that, 77–114 of their 200 days had nothing left to try.

At that rate the park's 1,000 problems last about 100 climbing days. The target of V13 at about day 180 means the last ~80 days are spent on the hardest lines (37 at V12–13). That suits "a few days per V12–13 send" only if those lines are hard. Stage 0b needs to check how many lines at and just above your level remain unsent at each level.

**9. Your share of first ascents is high:** 35–75% by the end of 2025, against the target of about 30% for a keen player. `tune_crag.js` assumed a keen player sends 5 problems a day; real play and the simulator send about 10. Under the new rules, harder lines will take more tries, so this needs measuring again in 0b, before retuning `World.PARAMS`.

**10. Body type barely shows.**
- Every build is the same level at day 100 (V7), because XP sets the level.
- Tall climbers' hardest sends are about a grade higher.
- Reach only counts on the 30% of problems tagged reachy or bunchy.

## What this means for Stage 0b

- **Cap style skills and make them relative** (design, 2a). This alone removes the 2-grade lift that causes points 3–7.
- **XP by grade, and level costs that the park can pay for** (2b): headroom must be at least 1.6× through the whole game.
- **Check the content horizon:** at each level, the lines left at that level and one above it, and whether players run out.
- **Make projects at the top take days:** from a steeper curve at high grades, and from beta (now only +0.2 on hard sends) mattering more.
- **Put falling's XP per hour below sending's** at every relative grade.
- **Measure your share of first ascents again** before touching the crag's pacing.
