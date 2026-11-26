# Phase 3, Stage 2: the climbing scene

Status: **built into the game (2026-11-26).** The prototype was reviewed and approved, with the changes in "After the review". "In the game" and "Play-test changes" are at the end. The plan is `stage0-design.md`, section 4: prototype the scene first, review it, then build it in.

**Try it:** `site/prototype/climb.html`, served from `site/`. Locally that's `python3 -m http.server 8765 -d site`, then open http://127.0.0.1:8765/prototype/climb.html.

## What's built

**`site/game/scene.js`** (new). The scene only draws and animates; whoever drives it (the game, or the prototype page) decides what happens and supplies the card text.

**The picture:**
- **The boulder:** the map's own rock (`Paint.boulderArt`), redrawn from nearer eye level. It's the same rock, re-projected through `Illu.facetForm` with less foreshortening, so the close-up looks like standing in front of it.
- **Around it:** the trees and understory that grow around that boulder on the map (the park's own trees, ferns and shrubs, with depth squeezed to match). Behind them, the far woods in the season's colours, and the sky by the hour, greyer when overcast.
- **The line:** holds for each move, zig-zagging left and right up the face. Chalk brightens where you've been, and a red tick mark appears under a crux you know fairly well.
- **You:** your pad at the foot of the line, and your climber, dressed by the same outfit colours as on the map.
- **The light:** season and light come from the same variables as the map (`Paint.dateVars`/`timeVars`), so snow, bare trees, autumn colour, golden hour and dusk all carry over.

**The climber** is posable, drawn at the map's size, with poses for:
- standing ready and chalking up
- each move on the line, reaching hand over hand with knees out
- coming off, the fall and landing on the pad (with a little thud)
- sitting on the pad to rest
- topping out, arms up

The animations tween every joint. With reduced motion, poses switch instantly.

**The cards:**
- **The problem** (top left): name, grade or "?", where it is, styles, the move strip, highpoint, how it feels, beta worked out.
- **You** (bottom right): level, energy, skin, clock and light left.

**The words and the menu:**
- a narration box (read aloud by screen readers)
- a 2×2 menu: **Send burn**, **Work a move** (opens a list of the moves you've seen, each with its hold and how well you know it), **Rest** and **Leave**
- after a send: **Climb it again** and **Leave**
- Escape leaves

**Phones:** the picture on top, smaller cards over the sky, then the narration and the 2×2 menu. Dark mode switches the cards and menu and dims the picture a little, as the map does.

**`site/game/scene.css`** (new) holds the scene's styles. Rock, trees and plants keep the map's own classes from `index.html`.

**`site/game/paint.js`** now shares the map's art: `artDefs`, `boulderArt`, `drawTree`, `dateVars`, `timeVars`, plus `treeGlyph`, `shrubGlyph`, `fernGlyph`, `bake`, `slot` and `roundPoly`. The map calls the same functions it always did, so the map is unchanged:
- `walk.js`: 55–59 fps
- `v2test`, `live`, `stage5`, `walk_fixes`: pass, no page errors
- the park prototype page still draws

**`site/prototype/climb.html`** (new):
- the real rules: `Mech.attempt`, `learnBurn`, `workMove`, `restGain`, costs and the clock
- controls for boulder, problem, date, time, sky, conditions, your level, height and ape index
- it takes the game's own styles from the game page

## Also in this round

- **Fall messages for smears** read as footwork ("Your feet skated off the slab on the first move"), in the game too.
- **The leak test (`v2test.js`)** leaves lines that feel like a project until last. Its new climber was sometimes spending the whole day on one, which is right for the game but made the test flaky.

## For review

1. **The look:** the lower, eye-level view; the boulder's own trees and plants; sky and far woods. Is the climber the right size against the rock?
2. **The layout:** the problem card top left and yours bottom right, narration and a 2×2 menu underneath. On phones, everything stacked.
3. **Pace:** a burn takes about 2–4 seconds to play out. Too slow, or about right?
4. **In the game:**
   - **Where it opens:** a full-screen scene over the map, the side panel and the status bar, as planned.
   - **What opens it:** Try opens the scene, while easy problems keep a one-tap "Climb it" in the panel.
   - **When to close it:** after a send, after Leave, at dusk or rain, or when you're out of energy or skin.

## After the review (2026-11-26)

The look, the layout and the pace are approved. Changes asked for, and made:

- **Rest is instant.** There's no animation or pause, so you can rest several times in a row.
- **Send burn shows your chance:** "Send burn · 11%".
- **Rest and Work a move show what they'd do to it:**

  | Button | Example |
  |---|---|
  | Rest | "+12 energy · send 11% → 14%" |
  | Work a move | "Best: the crux, send 11% → 13%" |
  | Each move in its list | "a crimp, known a little · send 17% → 20%", or "barely changes" |

  The numbers come from the rules (`Mech.previewRest`, `Mech.previewWork`, tested in `test_moves.js`). For working a move they show what you'd learn and keep (`kept`), not your very next burn, which is also lower for the energy it costs (`next`). Otherwise working always looked worse than it is.

- **Burns no longer tire your working.** Each working try on a problem the same day teaches less than the last, but burns don't count toward that. You can work the crux after a session of burns and still learn from it; before, after a few burns a work taught almost nothing.
  - **Simulated projectors who work moves** now reach V13 about 6% sooner than those who don't (day 168 against 178, 16 climbers each).
  - That's still well behind mileage and explorer climbers, so working is worth doing without being the best strategy.

## In the game (2026-11-26)

**Try and Climb it:**
- **Try** opens the scene: `openClimb` and `showClimb` in `game.js`, drawn in `#scene-root` over the map, the side panel and the status bar.
- **Problems you'd probably send** (80% or better, and not yet fallen off) get **Climb it** instead: one burn right in the panel, as before. If you fall on one, it becomes Try.
- **Sent problems** keep **Repeat** in the panel.

**The same rules:** a burn in the scene is `tryProblem(i, { scene: true })`. It's saved first, then the scene plays it, and only after that do the dialogs open (naming a first ascent, a level-up, the day's summary).

**Working a move** (`workInScene`):
- costs energy, skin and time
- starts a session in the project's log
- can fade the moves after a long break, like a burn
- each working try on a problem the same day teaches less (`G.day.worked`), but burns don't count toward it

**Rest** in the scene is the game's own `rest()`, instant.

**The cards** go through `K`, so an unclimbed line shows "?", and nothing in the narration or the menu gives its grade. `v2test.js` checks this. The chalk on the rock follows how often its lines have been climbed in this save's world.

**The menu:**
- Send burn shows your chance.
- Rest and Work a move show what they'd do to it (`Mech.previewRest`, `Mech.previewWork`).
- After a send: Climb it again, or Leave.
- Escape leaves.

**While you're climbing:** `G.day.climb` is saved, so a reload brings the scene back. The walking keys and M (the trail map) do nothing. If the day ends (dusk, rain, or you're out of energy or skin), the scene closes and the summary follows.

**Tests:**
- `lib.js` has `burnIfScene` and `TRY`.
- `live.js` and `v2test.js` run with reduced motion, so each burn plays at once.
- All five browser suites pass with no page errors or leaks; walking runs at 56 fps.

## Play-test changes (2026-11-26, from a first-time player)

**Rests are back to a full 12 energy every time** (`BAL.restDay` = 1). You can rest and climb the whole day instead of falling into an energy hole.
- The simulator's climbers reach V13 sooner as a result: steady 161 days (was 176), projectors 152 (179), mileage 112 (123), explorer 111 (122).
- The early and middle levels barely move.
- Stage 0b had added diminishing rests because projecting with endless rests out-paced the other styles. Projectors are now no faster than steady climbers, and mileage and explorer climbers are still quickest.

**No NPC first ascents before September 7** (`World.PARAMS.faFrom`). A new climber's first day (Sept 6) has the crag to themselves.
- The crag's development is unchanged: 72% climbed by the end of 2025, and every boulder found on the same dates.
- A keen player's share of first ascents moves from 33% to 36%.
- Saves already past September 7 keep their recorded history.

**The first day's conditions are at least Good** (`Mech.atLeast`, cond 0.2). There's plenty that goes on your first day: a humid sky clears, and the rest of the forecast (any chance of rain) stays.
