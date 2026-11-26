# Phase 3: strategic climbing, projecting and progression (design for review)

Status: **Stages 0a, 0b and 1 done (2026-11-26).** Stage 0a measured the old balance (`stage0a-baseline.md`); Stage 0b built the new one (`stage0b-rebalance.md`); Stage 1 added moves (`stage1-moves.md`). Each records where it differs from this plan. Next is Stage 2, the climbing scene. The decisions are in section 9.

Phase 3 makes climbing itself the heart of the game. Today, sending is mostly clicking Try until a dice roll succeeds. By the end of Phase 3:

- Your level is an honest measure of what you climb.
- Projecting feels like learning a climb, move by move.
- Each attempt is a small scene at the boulder, with a few real choices.

It builds on Phase 2 and doesn't change it. The crag still develops as you play. First ascents, discovery and what you know all work as they do now.

## 1. What's wrong with progression today

The play-test save (Feb 3, 2026) shows the problem:

- the climber is level V7
- their hardest send is V13
- they've sent every V0–V11 in the park, with a median of 1–5 tries
- they still need about 780 XP to reach V8, with 27 problems left

The simulator (`scripts/balance_game.js`) agrees. After 256 climbing days, the median player has sent 981 of the 1,000 problems, their hardest send is V13, and their level is 7.8.

Three problems feed each other:

1. **Style skills became a second, bigger level.**
   - Every send raises your skill in each style on the problem, and the skill has no ceiling.
   - The play-test climber's 15 skills are now 2.3–4.4. At 0.7 of a grade per point, that is worth 1.6–3.1 grades on almost every problem.
   - Adding the built-in +0.6, crisp conditions (+0.45) and worked beta (+0.7), a "V7" climbs like a V11.
   - Since every style rises, the skills also stop describing your style.
2. **The XP curve outgrows the park.**
   - Each level costs 1.6× the last, and at-level sends earn a shrinking share of it.
   - V7 to V8 takes the XP of 566 at-level sends, and V8 to V9 takes 1,008. The park has 1,000 problems.
   - A harder send pays at most 3×, so V7 to V8 would take 189 V9s, and there are 54.
   - The math caps your level at about V8.
3. **Each problem makes the other worse.** Because the level lags, almost everything you try counts as "above your level". It pays the most XP and grows skills the fastest.

**The send curve itself is close to the goals,** once the bonuses that feed it are fixed. These are today's chances for a fresh, neutral climber in average conditions:

| Problem vs. your level | Chance per try today | Goal |
|---|---|---|
| 3 or more below | 99.6% | Easy, not a guaranteed flash (cap about 95%) |
| 1 below | 82% | Usually goes in a try or two |
| At your level | 38% | Achievable, not trivial: about 2–4 tries |
| 1 above | 7.6% | A real project: a session at low grades, 2–4 days at V12–13 |
| 2 above | 1.1% | Very hard; about 10% per try only with a good fit and worked beta |
| 3 or more above | 0.2% | Unrealistic |

## 2. The new model (Stage 0)

### 2a. Your level is the only thing that grows without limit

**Style skills become relative.**
- A skill says how a style compares with the rest of your climbing, from about −1 to +1 grade.
- Strengths start near +0.4 and the weakness near −0.4.
- Sending a style moves its skill towards the cap, with diminishing returns, so skills rearrange as you climb rather than all rising together.
- Being relatively good at overhangs can still make overhangs your thing.

**Reach is capped at about ±0.6 grade.** Today very tall or short climbers can get ±1.15.

**All favourable factors share one ceiling.** These are:
- style
- reach
- conditions
- beta (the moves you've worked out)
- good vibes (section 7)

Together, a soft limit keeps them between about +1.2 and +1.5 grades:
- Two grades above you becomes possible when everything lines up.
- Three grades above you doesn't.
- Bad factors (fatigue, thin skin, greasy conditions, a weakness) aren't capped, so a bad day can still sink you.

**The curve steepens slightly at higher grades.**
- At V2, a problem one grade above you might take an afternoon.
- At V12, one grade above is about 2–3% per cold try, which is days of work.

**Easy problems keep a small slip chance.** The send chance tops out at about 95%, so not every easy problem is a flash.

### 2b. XP by the problem's grade, not as a share of your level

**A first send earns a fixed amount for its grade,** growing about 1.4× per grade, times a factor for how hard it is for you:

| Problem vs. your level | XP factor |
|---|---|
| 2 above | about 2× |
| 1 above | about 1.5× |
| At your level | 1× |
| Well below | tapering to about 0.25× |

So projects pay well, and mileage still counts.

**Levels cost a bit more each time, but less than XP per grade grows.**
- The number of at-level sends needed to level up falls slightly at the top.
- This matches what the park has: 125 V3s, 65 V7s, 25 V11s and 16 V12s.

**Proof to level up.** You need a few sends (say 3) at your current level or harder.
- A level means you've climbed that grade, not just piled up easy mileage.
- Your hardest send and your level stay close: usually your hardest send is one grade above, sometimes two, never four.

**No XP for falling.** Instead:
- a sent project earns a bonus for the sessions you put in, capped at about +50%
- the first time you stick a crux move gives a small one-off reward (Stage 1)

Both are capped per problem, so failing over and over is never a way to grind.

**Repeats stay small.** They're worth about a tenth of a first send, with a daily cap.

**XP depends only on what a tick records:** grade, the order of sends, first send or repeat, flash, beta tip, first ascent. Then an existing climber's level can be recomputed exactly from their logbook (section 5).

**The XP budget is checked in the simulator.** Reaching V13 should take no more than about 60% of the XP the park holds, so explorers and players who skip areas still get there.

### 2c. Targets (agreed 2026-11-25)

**Typical pace for a player who climbs two days and rests one, as the simulator measures it:**

| Level | Around climbing day |
|---|---|
| V3 | 6 |
| V5 | 15 |
| V7 | 30 |
| V9 | 55 |
| V11 | 100 |
| V13 | 180+ (the endgame: about a year of play) |

**Other targets:**
- Your hardest send is usually one grade above your level, sometimes two, never four.
- A climb at your level takes 1–4 tries.
- A climb one grade above takes a session at low grades, and 2–4 days at V12–13.
- Falling can never earn XP faster per hour than sending.

### 2d. The simulator

**`balance_game.js` gains:**
- **Playstyles:**
  - climbs at their level
  - projects aggressively
  - climbs lots of easy problems
  - explores and goes after first ascents (using `world.js` and `knowledge.js`, as `tune_crag.js` does)
- **Climber profiles:** tall and short, ape index, different strengths and weaknesses.
- **Reports:**
  - level over time
  - the gap between level and hardest send
  - tries needed at each relative grade
  - days per project
  - how much spare XP the park holds
  - XP per hour of falling against XP per hour of sending
- **Totals, still reported:** the overall send rate and the median hardest grade.

The current pacing ("V3 by day 5, V9 by 39") measures your hardest send, not your level. From Phase 3 on, the targets are levels.

## 3. Moves (Stage 1)

**Each problem gets a sequence of moves,** generated by a pure function from:
- the problem's index
- its tags, grade and height
- whether it's a sit start
- its boulder's angle

Nothing is added to `game-data.json`, and only what you know is saved. Sequences stay stable because problem indexes never change (the save rules in `CLAUDE.md`).

**Shape:**
- 3–12 moves; sit starts, traverses and highballs add more.
- Most moves are well below the grade. There's one crux, or two at high grades.
- Highballs sometimes have a scary topout.
- Each move has a style from the problem's tags and a hold (crimp, sloper, pinch, jug).
- Reachy and bunchy cruxes carry the reach.

**The overall send chance still decides each try,** worked out as in section 2. The moves decide where you fall:
- Each move gets a share of the risk, mostly the crux, and the shares multiply back to exactly that chance.
- The balance stays checkable, and the simulator stays simple.
- Falls happen at the crux, not at a random move.

**What you know is tracked per move,** each from 0 to 1.
- A problem's beta becomes your knowledge of its moves, weighted towards the crux.
- Moves above your high point show as unknown until you reach or work them.
- The sequence is drawn as a little strip: ● ● ◆ ? ?
- The current per-problem beta (`ps.beta`) converts into move knowledge on load.

**Better beta.** Some cruxes hide an alternative that makes them easier:
- a drop-knee or heel hook
- skipping a hold if you're tall
- an extra intermediate hold if you're short

You find it by working the move, or a local tells you. Today a local's tip is a flat +0.25 beta; in Phase 3 it reveals the alternative or a move. This gives the vision's "finding better beta" its moment, and ties reach and style to particular moves.

**Learning settles in.**
- Some of a day's learning sticks overnight.
- Learning on a single problem has diminishing returns within a day.
- A long break fades what you knew a little, never below half.

Today's fall messages ("you came off the crimps; fell on move 4 of 9") will come from the real sequence. Today the crux is just your weakest tag, picked again at random on each fall.

This stage shows up in today's panel as the move strip, before the scene exists.

## 4. The climbing scene (Stage 2)

Clicking Try on a problem near or above your level opens a small scene at the boulder, laid out like a classic RPG battle in Granite Hollow's illustrated style.

**What it shows:**
- A large close-up of the boulder, drawn from its map shape (`facetForm`), with the problem's line, chalked holds, texture, the ground and the trees behind.
- Your climber and crash pad.
- The problem's name and grade, if it's established, through `K`: unclimbed lines show no grade.
- Its styles.
- Your energy, skin and the time of day.
- Your high point and the move strip.
- A short menu of actions, and Leave.
- Season and light, read from the same CSS variables `applyAtmosphere()` sets for the map.

**Actions in the first version:**

| Action | What it does |
|---|---|
| **Send burn** | From the start. Costs energy and skin. Ends in a send, a new high point, or learning a move. |
| **Work a move** | Pick a move: the crux or your high point by default. Cheaper on energy, teaches that move a lot, can't send. The projecting tool. |
| **Rest** | As today: 20 minutes for some energy back, no skin. |
| **Leave** | Back to the world. |

**Climb it.**
- Problems at least two grades below your level, or with a send chance of 80% or more, get a one-tap "Climb it" in the panel.
- It skips the scene and plays by the same rules and costs.
- If you fall, it offers to open the scene.

**Technical notes:**
- **The climber:** the map's climber is tiny. The scene needs a larger climber with a few poses (standing, on the wall, falling, topping out), dressed by the same outfit and season logic. This is the biggest new piece of art.
- **Which face:** the data doesn't say which face of a boulder a problem is on. It's assigned from the problem's place in its boulder's list.
- **Drawing and performance:** the scene is its own SVG over the map, and the map's walking layer pauses underneath.
- **Naming:** `G.day.encounter` already means meeting a regular. The scene lives in `G.day.climb`, and a regular can walk up during a session.
- **The clock:** rain, dusk warnings and the walk back to the lot still work while the scene is open, closing it first. Reloading mid-scene restores it.
- **First ascents:** a first ascent goes through `World.recordSend`. The naming dialog follows the topout, through `openModal`.
- **Layout:** full screen on phones, with the actions in a 2×2 grid at the bottom.
- **Prototype first:** the scene is prototyped as a standalone page (as `site/prototype/park.html` was for the map) and reviewed before it goes into the game.
- **Leak test:** `v2test.js` gains the scene.

## 5. Converting existing climbers (agreed: recompute)

On load, a climber made under today's balance is converted once:

- **Level:** recomputed by replaying their ticks, in order, under the new XP rules.
  - The play-test climber will come out well above V7, and the V12s and V13s still unsent become real projects.
  - The exact level is worked out when this stage is built.
- **Skills:** converted to the relative scale. Each skill minus the climber's average, squeezed into −1..+1, so their best and worst styles stay their best and worst, and their chosen strengths and weakness are kept.
- **Beta:** each problem's beta becomes move knowledge (section 3).
- **Never lost:**
  - ticks
  - first ascents and their names (the ledger is never rewritten)
  - the crag's history
  - what you know
  - the journal
- **A copy of the old save is kept,** as Phase 2 did with `granite-hollow-save-before-reopening`.
- **Save format:**
  - The new balance is marked on the save (for example `bal: 3`).
  - `World.validate` treats it as optional, since older saves won't have it.
  - Save files from before the change convert the same way.
- **The leaderboard:** new entries carry rules 3, so levels from the two balances aren't compared ("First to" is hidden anyway).

## 6. Phase 2 systems this touches

- **The crag's development** (`world.js`):
  - Grades just above your level develop more slowly (`nextBand`).
  - `tune_crag.js` has a hard-coded level curve from today's simulator.
  - Both are retuned to the targets: about 70% of the crag climbed by the end of 2025 for a keen player, who takes about 30% of first ascents.
- **Spotting lines** (`canSpot`):
  - Lines that feel "Not yet" (under 2.5%) stay hidden.
  - With capped bonuses, new climbers will spot fewer hard lines early. That suits the vision, and the first-ascent share is retuned for it.
- **Projects are safe:** a line you've tried can't be taken by an NPC's first ascent (`protectedLine`), so a project you're working over several days can't be stolen. This stays.
- **Locals' tips** reveal moves or better beta instead of a flat bonus.
- **Every screen still gets names and grades from `K`,** including the scene.

## 7. Good vibes (Stage 4, agreed: hidden)

There's no aura number anywhere. Good vibes at the crag are a small, hidden lift to your send chance, felt through words.

**Where vibes come from:**
- regulars nearby
- climbing with a partner
- a friend's send
- the crag buzzing on a prime day
- your own recent breakthrough

**How they show:**
- **Lines in the scene and the log.** "Vibes at the crag are good today. I should hop on the proj." "Bea's cheering you on."
- **The odds breakdown.** "Good vibes" appears in the panel that explains your chances, without a number.

**How much:** about +0.1 to +0.25 of a grade, counted inside the shared ceiling (section 2a). Vibes can tip a close project but never carry a climb you aren't ready for.

**Climbing alone loses nothing.** Vibes only ever add a little.

## 8. Order of work

| Stage | What | Playable result |
|---|---|---|
| **0a** | Measure: the simulator's playstyles, profiles and reports. Today's numbers against the targets. | A report |
| **0b** | Rebalance: the new math in `mechanics.js`, converting climbers, rules 3, retuning the crag and spotting. | The new balance on today's Try button |
| **1** | Moves: the generator, knowledge per move, the simulator working moves, the strip in the panel. | Falls at the crux, high points by move |
| **2** | The climbing scene: prototype, then the game, with Send burn, Work a move, Rest, Leave and Climb it. | **The first playable milestone** |
| **3** | Preparation, conditions and unlocks (the plan's Stages 3 and 4 merged). See below. | Strategy deepens as you improve |
| **4** | Partners and good vibes. | Climbing with friends |
| **5** | Final balance and play-testing across all four playstyles. | |

The simulator is updated in every stage, not only the last.

**Stage 3 in more detail:**
- **Brushing:** offered only where it matters, on friction-sensitive problems and on newly found lines, which start dirty. It lasts the day on that problem.
- **Tape:** a response to a flapper or thin skin. You lose less skin, but slopers and slab get harder.
- **Filing:** folded into overnight skin care.
- **Conditions through the day:** cool mornings and shade for slopers. Today conditions are one value for the whole day.
- **Unlocks:** each strategy unlocks as you improve, taught by a regular (Gus shows you how to brush, for example).

## 9. Decisions (2026-11-25)

- **Pace:** the targets in section 2c.
- **Existing climbers:** recompute their level from their ticks (section 5). The user's own climber is the only existing one.
- **Easy problems:** get a one-tap "Climb it" that skips the scene (section 4).
- **Aura:** hidden. It feeds the send chance subtly and only shows in words (section 7).
- **Confirmed later the same day:**
  - The stage order in section 8. The plan's Stages 3 and 4 are merged, and moves come before the scene.
  - The first actions: Send burn, Work a move (merging "work beta" and "try a move in isolation") and Rest. Brushing and taping come in Stage 3, and filing skin is folded into rest.
