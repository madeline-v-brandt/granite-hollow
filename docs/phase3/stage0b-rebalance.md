# Phase 3, Stage 0b: the rebalance

Status: **built (2026-11-25).** The plan is in `stage0-design.md` section 2, and the old balance it replaces is measured in `stage0a-baseline.md`. Full simulator output: `stage0b-output.txt` (40 climbers in each playstyle, 200 climbing days).

The new balance plays on today's Try button. There's no climbing scene yet; that's Stage 2.

## What changed in the rules (`site/game/mechanics.js`)

Every number is in one `BAL` object at the top of the file. `node scripts/balance_game.js --set '{...}'` tries other values without editing it.

**Levels:**
- XP costs come from a table: 70, 140 and 220 for the first three levels, then 600, 900, 1,800, 2,600, 4,800, 6,300, 9,000, 12,500, 19,000 and 27,000 to reach V13. That's 85,000 XP in all, against about 113,000 in the park if everything is sent near your level.
- **Proof:** moving up to level n + 1 also needs 3 first sends of grade n or harder.
  - `player.tops` counts first sends by grade.
  - While you wait for proof, the XP bar shows full and the status bar says "Send 2 more V7s or harder for V8". The extra XP isn't lost.

**XP:**
- A first send is worth 10 × 1.4^grade. That's multiplied by 1.8× one grade above your level, 2.6× two or more above, 0.5× one below, and 0.25× further below.
- Bonuses:
  - flash ×1.3
  - local's tip ×1.2
  - new hardest send ×1.25
  - each extra session on a project +10%, up to +50%
- Falling earns nothing.
- Repeats are worth a tenth of a first send, three times a day.

**Style skills are relative,** from −1 to +1.
- Sending a style raises it, with less gain as it nears +1. What's gained is taken evenly from the other styles, so skills rearrange instead of all rising.
- Strengths start at +0.4 and the weakness at −0.4.
- A skill is worth at most 0.7 of a grade.

**Reach** is worth at most ±0.6 of a grade.

**One shared ceiling.** The good adjustments are scaled down together so they approach 1.3 grades and never pass it:
- style
- reach
- beta
- conditions
- vibes (zero until Stage 4)

Bad ones aren't capped: tiredness, thin skin, greasy rock, a weakness, highball nerves.

**The send curve** gets steeper above V4, so hard grades take longer. Nothing goes above 95% a try, so easy problems aren't guaranteed flashes.

**Beta** from a fall is 0.08 at first and 0.7× less with each try on that problem the same day, so a project takes several sessions to learn.

**Rests** give back 12 energy, then 0.7× less each time the same day.

**Spotting lines** (`canSpot`) is judged on the low grades' gentler curve:
- Beginners see the same lines as before.
- At the top, a V12 can still see the V13s that suit them, even though those feel "Not yet" before any work.

**Ability.** `Mech.levelOf(player)` and `Mech.ability(player)` take the player, because proof matters. `world.js` and the scripts now use them.

## Results (medians from `stage0b-output.txt`)

**Level pace** (climbing day each level is reached):

| Level | Target | Steady | Projector | Mileage | Explorer |
|---|---|---|---|---|---|
| V3 | 6 | 6 | 6 | 5 | 5 |
| V5 | 15 | 16 | 17 | 12 | 10 |
| V7 | 30 | 31 | 35 | 23 | 21 |
| V9 | 55 | 58 | 65 | 45 | 38 |
| V11 | 100 | 98 | 109 | 73 | 64 |
| V13 | 180 | 159 | 173 (95% by day 200) | 115 | 114 |

**Level against hardest send.** In every playstyle and at every checkpoint, the median gap is one grade, and no climber is ever three grades apart. Before the rebalance, every climber's gap reached 4–5 by day 100.

**Chance per try by relative grade** (target in brackets):

| Problem vs. your level | Chance per try |
|---|---|
| 3 or more below | 95% (95%) |
| 1 below | 64–73% |
| At your level | 20–31%, median 2–3 tries (1–4 tries) |
| 1 above | 6–10% (a real project) |
| 2 above | 2–3% (rare) |
| 3 above | about 0 (almost never) |

**Days to send a project one grade up:**

| Levels | Days |
|---|---|
| V0–4 | 1–2 |
| V5–8 | 2 |
| V9 and above | 2–6 (target 2–4 at V12–13) |

**XP per hour** is roughly even from one grade below your level to one above:
- about 200–480 in that range
- about 85–160 on climbs two or more grades up
- about 85–120 on easy mileage

Falling far above your level is never the quick way up.

**Spare XP** is at least 1.66× what's still needed for V13 at every checkpoint, in every playstyle.

**Body type now shows:** at day 100, short steady climbers are a level behind tall ones (V10 against V11).

## Where it differs from the plan

**Mileage and explorer climbers reach V13 sooner,** about day 115 against 160–175 for steady climbers and projectors.
- XP per try is even across grades now. The gap comes from how the simulated styles choose climbs: steady climbers and projectors spend more of their tries on one-grade-up lines.
- Pushing V12 and V13 costs higher to slow everyone down left a quarter of projectors unable to reach V13 even after sending all 1,000 problems, so the costs stay where they are.
- If it feels quick in play, the next lever is the top of the send curve (`shiftTop`), not the costs.

**At your level, a try is 20–31%,** a little under the planned 38%. Tiredness accounts for most of that: the simulated climbers keep trying when tired. Sends still take the targeted 1–4 tries.

**Your share of first ascents:**
- In `tune_crag.js` a keen player now takes 33% by the end of 2025, down from 42% (target about 30%).
- How fast the crag develops is unchanged: 72% climbed by the end of 2025, and every boulder found on the same dates.
- In `balance_game.js` the share depends on playstyle, from 19% (steady) to 77% (mileage). Its climbers play every possible hour and send everything in reach the day they find it.
- `World.PARAMS` is unchanged.

**Two rules were added that weren't in the plan:**
- **Rests give back less each time the same day.** Without this, a climber who rested before every burn was never limited by energy, and projecting with endless rests out-paced every other style.
- **Spotting uses the gentler curve.** The first version always showed lines up to a grade above your level. That showed beginners lines they couldn't do, and the leak test's new climber spent its whole first day on one.

## Converting climbers (`regrade` in `game.js`)

Saves now carry `bal: 3`. An older save (localStorage, or a loaded save file) is converted once:

1. A copy is kept under `granite-hollow-save-before-regrade`, which can be downloaded from the welcome message.
2. The level is recomputed by replaying the ticks in order (`Mech.replay`):
   - each project's sessions come from its log
   - tips used come from `tips`
   - repeats count three a day
   - the level is never lowered
3. Skills become relative (`Mech.convertSkills`): each skill minus the climber's average, through tanh, so their order is kept.
4. A "Climbing has been rebalanced" message explains the changes.
   - A climber coming from the old rules sees "The park has reopened" first.
   - A save that's already converted only has its `tops` recounted from the ticks on load.

**The user's play-test save** goes from level V7 (hardest send V13) to **V12**:
- **Skills:** crimps +0.86, slopers +0.62 and overhangs +0.60 strongest; roofs −0.71 and traverses −0.70 weakest.
- **What's left:** the seven unsent V12s are 1–19% a try, and the twenty V13s 0.2–6%.

The conversion was checked on a local copy of the save in headless Chrome. The file itself wasn't changed or committed.

**Leaderboard:** climbers who started under this balance carry `balStart: 3` and post with `rules: 3` ("Since the reopening"). Regraded climbers stay on rules 2 ("Reopening, older rules"), because their progress happened under the old balance.

## Tests

- **Node:** `node scripts/test_world.js` (36 passed) and `node scripts/tune_crag.js`. `xpFor` now uses `Mech.levelCost`, and the crag's level curve follows the new pace.
- **Browser** (headless Chrome), all with no page errors:
  - `v2test.js`: no leaks; a first ascent and the naming dialog; the converted save is valid.
  - `live.js`: now checks the regrade (bal 3, level not lowered, both welcome messages).
  - `stage5.js`, `walk_fixes.js`
  - `walk.js`: 57 fps.
- **Not seen in a real browser:** none of this has been played in a real browser yet. The page version is now v39.
