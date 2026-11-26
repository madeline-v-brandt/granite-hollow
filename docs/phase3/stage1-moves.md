# Phase 3, Stage 1: moves

Status: **built (2026-11-26).** The plan is `stage0-design.md`, section 3. Simulator output: `stage1-output.txt` (all four playstyles, 40 climbers each) and `stage1-output-work.txt` (projectors who also work moves).

Every problem now has a sequence of moves. You fall at a particular move, usually the crux. What you learn is kept move by move, and some cruxes hide a better way through. All of this shows in today's panel. The climbing scene comes in Stage 2, and so does the "Work a move" button; its rules are already in `mechanics.js` and the simulator.

## The sequence (`Mech.sequence(p)`)

Each sequence is generated from the problem's own data: its index, tags, grade, height and sit start.
- It's the same in every save.
- It's never stored, and nothing is added to `game-data.json`.
- The game keeps it as `p.seq`.

| Part | How it's set |
|---|---|
| Number of moves | 3–12, by height: about one move per 5 ft, plus one for a sit start and 4–6 for a traverse. Most problems have 5–7. |
| Cruxes | One, or two on V9 and up, on long traverses, and on a third of V5–V8s. A crux is never the last move, and a sit start's first move can be one. Each crux takes the problem's leading style (dyno first, then compression, power, crimps, slopers…). |
| Top-out | Mantles, highballs and some slabs end with one: a mantle, a scary top, or a smear. |
| Other moves | Holds from the problem's tags (crimp, sloper, pinch, jug, edge, sidepull…). Reachy cruxes are long moves; bunchy ones are cramped. |
| Risk | Each move carries a share of the risk: cruxes 70–90% between them, a top-out 6–14%, and every other move 2–5%. |
| A better way through | On 38% of problems, more often at hard grades, one crux has one: a heel hook, toe hook, knee bar, drop-knee, matching, a better foot, an intermediate hold (only for climbers with a reach under 175 cm) or a cramped hold to skip (only for 178 cm and over). |

## Where you fall

A burn's send chance is exactly what it was in Stage 0b; the test checks it.
- **If you don't send,** the move you came off is drawn from each move's share of the risk.
- **Knowing a move** moves up to 60% of its risk onto the moves you know less.
- **Where falls land:** about 80% of falls are on a crux. On a climb far above you (1% chance), you often come off early.
- **The fall message** now names the move: the crux's style (the old messages), the first move or the sit start, a hold on the way up, or the top-out, followed by "Fell on move 3 of 6, the crux."

## What you learn (`ps.mk`, `ps.alt`, `ps.seen`)

- **A fall teaches** the move you came off 15% of what's left to learn, and the moves you passed 6%.
- **Repeated tries teach less:** each try on that problem the same day teaches 0.7× the last, so a project takes several sessions.
- **Beta (`ps.beta`, which the send chance reads)** is worked out from the moves, weighted by their risk, so it's mostly the cruxes. It's worth up to 0.7 of a grade, plus 0.2 once you've found the better way through.
- **Older saves:** a problem tried before Stage 1 spreads its saved beta evenly over its moves, so its chances don't change.
- **Finding the better way through:** each fall on that crux, once you know it 40% well, has a 12% chance of showing it to you.
- **After two weeks away,** what you knew fades, to half over two months and never further. A better way through, once found, is never forgotten.
- **Locals' beta:** a tip now shows you the better way through if there's one for you. Otherwise it gives you a good look at the crux you know least. It used to be a flat +0.25.
- **Working a move (`Mech.workMove`, for Stage 2):**
  - A move on its own is 0.6 of a grade easier than on a burn, and you aren't tired.
  - It teaches that move 30% of what's left (39% if you stick it) and can show the better way through (30% a try).
  - Sticking it shows you the next move.
  - It costs 60% of a burn's energy and 80% of its skin, and takes 8 minutes.

## In the game

**The move strip** (`moveStrip` in `game.js`) appears on tried problems, in the problem list and in the Journal's Projects:
- one mark per move: a dot, or a diamond for a crux
- filled in as you learn the move
- outlined in gold where you've found the better way through
- dashed for moves you haven't reached
- a ring around your highpoint

**No spoilers:** nothing about a move (where the crux is, what the hold is) shows until you've reached it, and a move's description never gives a grade.

**Screen readers** get a summary: "6 moves, 3 seen. Crux at move 3, known a little."

The Journal's "Beta: x% worked out" now stops at 100% and adds "a better way found".

## Balance (from `stage1-output.txt`, medians)

| Level | Target | Steady | Projector | Mileage | Explorer |
|---|---|---|---|---|---|
| V3 | 6 | 6 | 6 | 5 | 5 |
| V7 | 30 | 31 | 36 | 23 | 21 |
| V9 | 55 | 60 | 68 | 45 | 39 |
| V11 | 100 | 104 | 116 | 75 | 66 |
| V13 | 180 | 176 (75% by day 200) | 179 (83%) | 123 | 122 |

- **Pace:** moves slow the top end a little against Stage 0b (V13 at 176–179 days instead of 159–173 for steady climbers and projectors), which is closer to the target.
- **Spare XP:** at least 1.67× at every checkpoint.
- **Everything else holds:** chances by relative grade, days per project and the gap between level and hardest send are all as in Stage 0b.

**Working moves helps without dominating.** Projectors who work the crux between burns (`--work`) reach every level at the same pace as those who don't. They spend about 41 hours over 200 days working moves, and find the better way through twice as often: 15% of hard sends against 8%.

## Where it differs from the plan

- **"Learning settles in overnight"** isn't built as its own rule. Spacing comes from tries teaching less as the day goes on, so learning a project is spread over sessions without a separate rule.
- **The better way through is rarer than expected** without working moves: used on 4–10% of sends a grade or more up. That leaves it as a nice surprise from falls, while Stage 2's "Work a move" and locals' tips are the main ways to find it.

## Tests

- **Node:** `node scripts/test_moves.js` (new, 10 passed), covering:
  - sequences are well formed and deterministic
  - old beta carries over exactly
  - the send rate is the chance
  - falls land on cruxes
  - learning, fading and the better way through
  - working a move
  - tips
- **Node:** `node scripts/test_world.js` (36 passed).
- **Browser** (headless Chrome), all with no page errors or leaks:
  - `v2test.js`
  - `live.js`
  - `stage5.js`
  - `walk_fixes.js`
  - `walk.js`: 59 fps

The move strip was checked in headless Chrome screenshots (problem row and Journal), not in a real browser. The page version is now v40.

Also fixed: "a overcast September morning" now reads "an overcast…".
