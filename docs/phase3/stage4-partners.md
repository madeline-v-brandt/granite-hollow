# Phase 3, Stage 4: partners and good vibes

Status: **built and reviewed (2026-11-26),** with the changes in "After the review" at the end. The plan is `stage0-design.md`, section 7 (good vibes, agreed: hidden) and the original plan's Stage 5 (climbing partners). Climbing alone loses nothing, and there's no extra XP, so XP can still be worked out from your ticks alone.

## Climbing together

- **Who:** when you walk up to a regular who climbs (Ranger Gus, Hollis, Otis, Rowan, Bea or Dez), their card offers **Climb together** if there's an hour or more of light left.
  - They answer in their own way: Otis says "Perfect partner weather! I'll spot.", and Dez says "Sure."
  - One partner at a time.
- **How long:** two to four hours, then they head off with a line of their own ("Bea's mom is waiting in the lot. 'Bye! Try jumping for it!'"). You can also **Part ways** from the status bar, which says who you're climbing with.
- **On the map,** they come along: they stand by the boulder you're at.
- **In the climbing scene,** they stand by your pad, on their own pad, in their own clothes. They spot while you climb and throw their arms up when you top out. The narration says they've dropped a pad beside yours.

**What a partner is worth:**

- **They see what you can't from the ground.** With a partner watching, a fall teaches you half as much again about the moves. Sometimes they tell you what they saw.
- **Beta, once a line.** On a documented line they know (their own first ascent, or one comfortably within their grade), they call up the beta the first time you fall. It's the better way through if there's one for your body ("Heel hook at the crux…"), otherwise their tip for the crux. It's the same as a local's tip, and a line only gets one.
- **Good vibes:** the biggest single lift (below).
- **Sends together are remembered:**
  - They cheer: "Dez nods, once. From Dez, that's a standing ovation."
  - The tick records who you were with (`tick.with`), and the logbook shows "with Rowan".
  - For a month afterwards they may bring it up when you meet ("Still thinking about your send of Tooth and Nail. What a day.").
- **Resting together:** a rest with a partner has its own lines (they try your project and fall off the same move, you share a snack and talk through the moves). It gives the same energy as before.

## Good vibes (hidden)

Vibes are never shown as a number. They're a small lift to your send chance, counted inside the shared ceiling on good things (`Mech.vibes`):

| Where vibes come from | Grades |
|---|---|
| Climbing with a partner | 0.12 |
| Regulars climbing in the same area (not counting a partner) | 0.02 each, up to 0.04 |
| A prime day with the crag busy | 0.04 |
| Your own breakthrough in the last two days (a hardest-yet send, or a project that took four tries or more) | 0.04 |
| A friend's first ascent in the last two days (a regular you've met) | 0.03 |
| All together, at most | 0.25 |

**How they show:**
- **In the climbing scene's opening words:**
  - "Rowan drops a pad beside yours."
  - "Hollis is climbing nearby."
  - "The crag's buzzing today."
  - "You're still riding high from your last send."
  - "Everyone's talking about Bea's new first ascent."
  - On a project, with enough of them: "Vibes at the crag are good today. Time to hop on the proj."
- **In the odds panel,** as a **Good vibes** chip with no number. Its tooltip lists the reasons in words.

Only people you've met are named; otherwise it's "a few climbers around". Nothing names an area or a line you don't know.

**How much:** vibes can tip a close project but never carry a climb you aren't ready for. With every vibe at once, a V0 has under 3% on a V3 (tested).

## Balance

**Final run:** `node scripts/balance_game.js --n 16`, in `stage4-output.txt`. The simulated climbers climb with a partner on a quarter of their days (after the first few) for two to four hours, have a regular or two around most days, and ride the vibes of their own breakthroughs. `--novibes` turns all of it off.

Days to each level (medians):

| | V3 | V5 | V7 | V9 | V11 | V13 | V13 in Stage 3 |
|---|---|---|---|---|---|---|---|
| target | 6 | 15 | 30 | 55 | 100 | 180+ | |
| steady | 5 | 15 | 26 | 47 | 83 | 135 | 150 |
| projector | 5 | 14 | 29 | 51 | 87 | 133 | 143 |
| mileage | 5 | 10 | 20 | 39 | 66 | 106 | 109 |
| explorer | 4 | 9 | 18 | 32 | 53 | 101 | 108 |

(With the review's changes: Rowan on a sixth of partner days, and a partner staying all day on a fifth.)

**Everyone is about 5–8% faster than in Stage 3.**
- The first try had larger everyday vibes, and steady climbers reached V13 at day 133. Those vibes are now trimmed to the table above.
- Most of what's left is partner days. A quarter of days is a guess at how often players will climb with someone.

**Steady climbers and projectors are now ahead of the agreed pace from V7 up.** They reach V9 at about day 50 (target 55), V11 at 83–87 (100) and V13 at 133–135 (180+).
- That's three stages of additions (brushing, then vibes and partners), each small.
- I haven't made level-ups costlier to compensate, because raising level costs could lower existing climbers' levels. That's for Stage 5's final balance, with play-testing.

**First ascents** (keen climbers' share by the end of 2025): 28–31% for steady climbers and projectors, close to the 30% target.

## Tests

- **`node scripts/test_partners.js` (new, 5 tests):**
  - no vibes alone
  - each source and the cap
  - a close project tipped but three grades up still out of reach
  - vibes inside the ceiling
  - a partner's eyes teaching more
- **`node scripts/browser/stage4.js` (new):**
  - walking up to a regular a week in, and Climb together
  - the status bar
  - the partner on the map at your boulder
  - the partner by your pad in the scene, and the narration
  - a send together recorded in the tick and the logbook
  - Good vibes without a number
  - Part ways, and heading off when their time's up
  - a save can't make Pickles or a stranger your partner
- **`stage3.js` is steadier:** it no longer depends on the day's weather to find a line to try.
- **All browser suites pass with no page errors or leaks:** `v2test`, `live`, `stage3`, `stage4`, `stage5`, `walk_fixes`, `walk`. Walking runs at 59 fps.
- **Seen only in headless Chrome,** not a real browser.

## For review (answered below)

1. **Who can climb with you:** Gus, Hollis, Otis, Rowan, Bea and Dez. The Bishop chats but doesn't climb, and Pickles is saved for his own story. Should Rowan's be special, since a story is still to come?
2. **How long they stay:** two to four hours, then they go. All day, or until you leave the area?
3. **How much a partner's worth:** 0.12 of a grade of vibes, falls teaching 50% more, and their beta once a line. Too much or too little?
4. **Pace:** with brushing and partners, steady climbers are now about 25% ahead of the V13 target. Retune in Stage 5 as planned, or trim the partner bonus now?

## Not done

- **Partners don't climb their own problems.** Their climbing is only in the words.
- **A send together earns no extra XP.** The plan's "aura or karma for sends with friends" is the vibes and the memory instead, so XP can still be worked out from your ticks.
- **No partner stories yet.** Pickles and Rowan are still to come.

## After the review (2026-11-26)

1. **Rowan gives an extra lift.** Climbing with Rowan adds 0.06 more vibes on top of a partner's 0.12, still within the 0.25 cap.
   - The scene says it in words: "Rowan drops a pad beside yours, and somehow everything feels a little lighter."
   - The odds panel's tooltip adds "it's always a good day with Rowan".
2. **Partners sometimes stay all day:** one time in five, and Rowan one time in three. They say so when they agree ("Honestly, I've got nowhere else I'd rather be today."), and the status bar says "Climbing with Rowan all day". Otherwise it's still two to four hours.
3. **A partner's value stays as it is.**
4. **Pace is left for Stage 5,** as planned.
