# Phase 4, Stage 0: review of the plan against the code

Status: **reviewed, with decisions (2026-11-26); see §5 and §6.** Stage 0's foundations are built: see `stage0-foundations.md`. The plan is the user's "Phase 4: Bringing Granite Hollow to Life" (Stages 0–8). This is the audit it asks for, what can be reused, what's missing, and the changes I'd suggest to the plan and its order.

## 1. How the NPCs work now

| Question | Where | What it does today |
|---|---|---|
| Who they are | `World.NAMED` (world.js) | Eight regulars, each with a height, a fixed `level`, `likes` (style tags), home areas, an arrival day and a one-line `blurb`. The other 600 climbers come from `game-data.json` (`D.climbers`: name, height, type, level, likes). |
| Where they go | `peopleToday()` (game.js) | Each regular who's around has a 45–55% chance of being out (Gus 55%, the Bishop only on his 13% days). They're placed at a random boulder in one of their home areas, from a seeded stream (`people\|date`), and they **stand there all day**. Where they are has nothing to do with what they climb. |
| How they climb | `World.step` → `stepDay` | The community's first ascents come from a development budget. `pickNpc` chooses who gets each one, weighted by type, shared style tags and `regularBoost`. Repeats, ratings and grade opinions go into each problem's `logs` (capped at 5). **The regulars have no projects, attempts, sessions or progression**: their levels are constants (Bea 9.6, Dez 13.4), and nobody tries a line and fails. |
| What they say | `REGULAR_TALK`, `CHATS`, `PARTNER`, `remarkFor`, `bishopClaim`, `buildRegular` (game.js) | About 2–4 greetings each, 3 chat stories each, partner lines, and one "remark" (a send together, your recent FA, or their recent FA). Then an offer: directions, a hidden line, or a recommendation, plus `betaFor` (beta for a project of yours in this area, 70% of the time). Lines are chosen by `Math.random()`. |
| Relationships | `K.meet/chat/pet` → `G.know.met[who]` | `{ n (days met), first, last, chats, pets, petted }`. That's all. No friendship level; nothing unlocks. `tick.with` records sends made together. |
| Pickles | `NAMED.pickles`, `drawDog` (paint.js), `buildRegular` | He's always drawn asleep by Pickles' Rock (The Tailgate, about 95 m from the lot). Walk up to him to pet him; `pets` is counted, and after 10 the text says he follows you a few steps. |
| Storage | `G.world` (world.js only), `G.know` (knowledge.js only), `G.day.encounter` | The history is append-only and seeded per day. One conversation at a time (`G.day.encounter`), once a day per person (`G.day.met`). |
| Beta | `Mech.tip`, `ps.tipped`, `partnerBeta`, `takeBeta` | **One tip per line, ever, from anyone.** It either reveals the better way through for your body (`alt`) or closes half the gap on the crux you know least. Partners use the same tip. Recommendations (`G.tips`) are separate and give ×1.2 XP when sent (`BAL.tip`, in the tick replay). |

**Already there for Stage 1:**
- Each figure on the map has an SVG `<title>` with their name, so a desktop browser shows it on hover.
- On touch screens there's no hover, so nothing shows.
- The paper map shows no people.

## 2. Findings that shape the plan

1. **The regulars don't have lives yet, and Stages 2, 3, 4 and 7 all depend on them.** "Bea stuck the dyno on Rocket Science again, then spent forty minutes getting nowhere on her slab project" needs things the game doesn't have:
   - a project Bea is on
   - sessions on it, with results
   - a record of what she's sent

   Today a regular's only history is the ledger's first ascents and five logs per problem. **I'd make "the regulars' lives" the foundation, built in Stage 0** (§3.1).

2. **The Pickles bug is real, and easy to fix.** `startDay` (game.js:244) gives a 35% chance of an encounter where "Pickles trots over from the lot", while the map draws him asleep at Pickles' Rock.
   - The fix: delete that encounter. You go and find him, as you prefer.
   - "Gus whistles him back" also plays when Gus isn't out.

3. **The Local Buzz classics problem comes from the crag's own timeline.** I simulated a world for 14 months:
   - Until March 2026, first ascents dominate the news (36–110 a month).
   - From April the crag is nearly developed, and first ascents drop to 1–5 a month.
   - Meanwhile classics rise to 9–14 a month, so they fill the 21-day buzz window.

   The fix is part of Stage 7: cap classics in the buzz, and fill the late-game quiet with the regulars' stories (projects sent, grade disputes, meetups). That needs §3.1 too. A cap on classics could ship sooner as a small fix.

4. **Determinism.**
   - `World.step` is seeded per day.
   - Everything social is decided with `Math.random()` (who's waiting, which line, partner length) and kept in `G.day`. That's fine for the player's day, but anything other people "remember" or that becomes history must come from world.js streams.
   - New streams need their own keys (`reg|<who>|<date>`). Adding draws to the existing `day|<date>` stream would change every later first ascent in existing saves and move the tuned development pace.

5. **Performance.**
   - Anything that moves every frame must live in the overlay layer with the climber (`.me-layer`), never in the map SVG (Phase 2, Stage 6).
   - So Pickles following you belongs in that layer.
   - Regulars moving between boulders should jump only at session changes, re-running `setPeople` (about 8 small groups). It's cheap if it happens a few times a day.

6. **Leaks.** Everything an NPC says about places and lines must go through `K`, like Local Buzz does with `where()`. More generated dialogue means more ways to name an undiscovered boulder, so the dialogue needs its own Node test that renders every line against fixture saves.

7. **game.js is 3,300 lines.** Social code should go in new pure modules, testable in Node like world.js and knowledge.js, not grow game.js further.

8. **The simulator doesn't model beta at all** (`balance_game.js` passes `tip: false`, and no simulated climber gets a local's tip). Stage 3 changes the projecting pace, so the simulator needs a beta model first.

9. **Bea is seventeen.** She should only ever be a friend: no flirt options, no romance lines.

## 3. Recommended architecture

### 3.1 The regulars' lives (NPC scheduling) — world.js

Each regular gets a small, deterministic life, simulated in `stepDay` from its own stream:

- **A routine:** which days they climb, which part of the day, and where.
  - Bea: weekends and after school; all summer.
  - Rowan: around the library's hours.
  - Gus: every day, near the lot.
  - Dez: early mornings.
  - Otis: whenever the weather is "perfect".

  Routines make people findable on purpose ("Rowan's usually at Hawkwatch on Tuesday mornings"), and they're written straight from each character.
- **A project:** a line near their limit in their style, in an area they climb. It's an open line, or an established one they haven't done.
  - They work it over sessions: tries, a high point, a few bad days.
  - Eventually they send it. If it's unclimbed, that's a first ascent entered through the existing first-ascent budget, so the crag's development pace doesn't change.
  - Then they pick another project.
- **A session each day they're out:** where (the boulder they stand at becomes their project's boulder or a warm-up), what they tried and how it went. That's the "Bea stuck the dyno again" material.
- **Their own ascents** (a list per regular), so "who has climbed this" doesn't depend on the five-log cap.
- **Slow progression:** levels rise a little over the seasons (Rowan especially), as a function of the date, so nothing needs migrating.

**Storage:** `G.world.reg[who] = { proj, sent, recent }`.
- `proj`: { p, since, sessions, best }
- `sent`: the lines they've climbed
- `recent`: their last ~30 sessions

It's written only by world.js and optional in `World.validate`. Old saves get it filled in on load from their ledger (their first ascents become their sent lines; a project is picked).

**Timing:** today is simulated at dawn, so a send "today" is known in the morning. Each session gets a time, and nobody talks about it before then.

### 3.2 Relationships and memory — new `social.js`

**Store moments, work out the friendship.** This is the same idea as levels being recounted from ticks.

`G.social.npc[who]` keeps:
- **Dated moments**, the latest ~40:
  - chats
  - hours climbed together
  - sends together
  - beta they gave that led to a send
  - being there for their send
  - your first ascents they heard about
  - the project you told them about
- **The ids of lines recently said**, so nothing repeats.

How it works:
- **Friendship is a function of the moments, with each kind counted at most once a day.** Talking ten times in a day counts as once, so nothing can be farmed.
- **It's shown only in words, never a number:**
  - "you've met"
  - "you know each other"
  - "friends"
  - "good friends"
- **Thresholds can be tuned later** without converting saves.
- **Old saves start from what's already there:** days met and chats from `G.know.met`, and sends together from `tick.with`.
- **Friendship never goes down.** That keeps it cozy. After a long gap they just say "it's been a while".
- **Each character values different things:**
  - Bea: trying dynos with her
  - Gus: brushing and looking after the park
  - Hollis: naming your first ascents
  - Otis: turning up in bad weather
  - Dez: trying hard
  - Rowan: the quiet days
- **Memory is the same list.** "Did you ever send that project from last week?" means the moment you told them is still there, and `G.ps` now says it's sent.

### 3.3 Dialogue — a data file plus a small engine

No runtime text generation. A line looks like this:

```js
{ id: "bea.dyno-again", who: "bea", mood: "excited", when: c => c.today.session?.kind === "dyno",
  say: c => `I stuck the ${c.lineName(c.today.session.p)} dyno again! Then fell off my slab project for forty minutes. Slab is fake.` }
```

- **The context `c` is built once per conversation** from the save, through `K`. That covers:
  - the weather and conditions
  - their session
  - their project
  - your recent sends, projects and first ascents
  - your shared moments
  - the friendship level
  - news about other regulars
- **Lines can only name what `c` lets them name.**
- **Choosing a line:** the lines that qualify, weighted by how fresh and specific they are. The engine skips anything said to you in the last few weeks. It's seeded by person and date, so a reload says the same thing.
- **A conversation is 2–4 beats,** sometimes with 2–3 replies you can choose. Romance needs replies, and they also make talk feel less like a kiosk, so I'd build them in Stage 2.
- **Tests:** every line, rendered against several fixture saves, must:
  - leak nothing
  - never produce `undefined`
  - stay a sensible length

**Most of this work is writing.** I'd draft each character's lines for review in batches.

### 3.4 Beta — extends Phase 3's moves

Phase 3's moves already carry `style`, `hold` and `reach` per move, so beta can be specific ("drop your right knee before the crimp", "skip the intermediate if you can reach").

What a regular's beta is worth depends on how well they know the line, and how much you can use it:

| Their knowledge | Effect (first draft, to be tuned) |
|---|---|
| Sent it (first ascent, a log, or `reg.sent`) | As now: the better way through if your body can use it, else half the gap on your weakest crux |
| Projected it | A quarter of the gap on the crux they fell at |
| Only their style (`likes` match the crux) | A small nudge, only on that style's crux |
| Different body | Honest text ("I'm six inches taller, so…"). The effect is small if their way relies on reach you don't have (`altFor` for their body versus yours). |

How it fits the existing system:
- **One tip per person per line,** replacing the single `ps.tipped`. Old saves' `tipped` becomes one anonymous tip, so nothing is lost.
- **Several people's beta can't stack past what's possible,** because beta is already capped (`betaMax + altBeta`) inside the shared ceiling.
- **Aimed at where you struggle:** the crux with the most attempts and the least knowledge. That's "you keep cutting feet on that move". Storing falls per move (`ps.fx`, optional) would make it exact.
- **You can seek it out:** a problem's page lists the regulars you've met who've climbed it or are working it. Walk up to them and ask about it.
- **Friends give fuller beta;** strangers give a hint.
- **Recommendations become rarer,** and when people do recommend something it's their own project or a recent send, not "you should try X".

**Before tuning:** add `--beta` to `balance_game.js` and check that projectors still keep to the agreed pace.

### 3.5 Portraits

I'd draw them in SVG, built from each regular's existing `LOOKS` (skin, hair, hat, shirt), in the map's ink-and-wash style:
- A face shape and hair per character.
- About 6 expressions from brow, eye and mouth paths: neutral, happy, excited, thoughtful, frustrated, embarrassed.
- Rowan gets two or three extra.

They stay sharp at any size, work in dark mode and cost nothing to load. I'd prototype them on a review page first, as the park map was (`site/prototype/portraits.html`). If you'd rather have hand-painted art, the dialogue box could show an image per expression instead, but I can't paint raster art myself.

## 4. Suggested changes to the plan and its order

| # | Your plan | Suggested | Why |
|---|---|---|---|
| 0 | Audit | **Audit + foundations:** the regulars' lives (§3.1), `G.social` with migration from `met`/`tick.with`, and the two quick fixes (Pickles at the lot, capping classics) | Stages 2, 3, 4 and 7 all need NPCs who actually climb |
| 1 | Visibility and portraits | **Visibility only:** a name label on hover and tap, an "Out today" list of regulars you've met and where they are (only areas you know), their markers on the paper map, routines | Portraits belong with the dialogue box that shows them |
| 2 | Dialogue and personality | **Dialogue + portraits + reply choices:** the engine, voices, the portrait prototype, then the dialogue box | Replies are needed later for romance; build them once |
| 3 | Beta | Beta (§3.4), with the simulator's `--beta` | Unchanged |
| 4 | Friendship | Friendship: tiers, unlocks, invitations, remembering | Moments have been recorded since Stage 0, so friendships start with history |
| 5 | Romance | **Pickles** (swapped) | Pickles needs only Stage 0's fix and the overlay layer. Romance needs friendship tuned by play first. |
| 6 | Pickles | **Romance** | It's the most writing, and builds on everything before |
| 7 | Events | Events and stories | Unchanged; much of it comes straight out of §3.1 |
| 8 | Polish | Polish | Unchanged |

**One part of the plan I'd push back on: "a little extra aura/karma for sends with friends".**
- XP is recounted from ticks, and `tick.with` is in the ticks, so it could be done.
- But it would make climbing with people the efficient path, which the plan itself wants to avoid. It would also raise old saves' XP retroactively.
- I'd keep Phase 3's decision of no XP for company. The reward is vibes, beta, memories and the journal.
- If you want something visible, a send with a friend could get a mark in the logbook.

## 5. Decided (2026-11-26)

1. **Gender stays open.** Rowan's pronouns are never used: Rowan is always "Rowan", so players can see Rowan however they like.
   - The romance is open to every climber.
   - Your climber's gender stays open too. NPCs refer to you by name, never with pronouns, including when they talk about you to someone else.
   - Every line gets checked for this. The dialogue test fails any line about Rowan or the player that contains he/she/him/her/his/hers.
2. **The dialogue box goes over the bottom of the map,** with the portrait. On a phone it covers the map's lower half.
3. **Portraits are SVG,** drawn by Claude from each character's looks, and prototyped on a review page first.
4. **No XP for company** (left to Claude, and kept as Phase 3 decided). A send made with a friend gets a mark in the logbook; vibes, beta and memories are the rest of the reward.
5. **Pickles rides home with you** once he's adopted you: he hops in the car at the end of the day.
6. **Friendship never goes down.** After a long gap, people just say it's been a while.
7. **Events:** one big community event per season, and its day is always dry. The fall one is the user's idea: **a bouldering comp on November 1** (below). Smaller things (a busy prime day, someone's long project going down, a grade argument) are stories in conversation and Local Buzz, not events.

## 6. Seasonal events (draft, for review in Stage 7)

**One a season, each on a fixed date:**

- **It's on the forecast screen** from the day it comes into view, as a card marked with the event.
- **Its weather is always dry,** at least Good. Saves whose forecast already covers the date get it corrected on load.
- **Missing it costs nothing.** If you're resting, it happens without you: the results go into Local Buzz, and people talk about it afterwards.

| Season | Event | Date | The day |
|---|---|---|---|
| Fall | **The Granite Hollow Bouldering Comp** | November 1 | Your 5 best sends of the day count, with a podium at the end (below) |
| Winter | **The Solstice Bonfire** | December 21 | The shortest day. Everyone gathers at The Tailgate at dusk; Gus and the Bishop tell stories, and the Bishop's are unreliable. Climbing is in the cold, crisp friction beforehand. |
| Spring | **Trail Day** with Ranger Gus | the first Saturday in April | Rebuild a trail and brush the winter's dirt off. It could reopen a forgotten trail (Stage 7's "historical areas"). Gus is delighted. |
| Summer | **The Midsummer Dusk Session** | June 21 | The longest day. Everyone climbs until dark; headlamps come out at the end. Otis brings sandwiches. |

### The fall comp (decided 2026-11-26)

- **Every problem in the park counts,** repeats included.
- **There are no divisions.** Everyone is on one podium.
- **Score:** your 5 best sends of the day. The points work like the Rankings: 100 per V-grade, plus 50 for a flash.
- **Beating Dez:** a strong climber should be able to by their second fall. The regulars get stronger over time (Stage 0), but Dez levels off about V14, and the park tops out at V13.
- **At dusk, before the day summary,** everyone gathers at The Tailgate:
  - Gus reads out the results.
  - A small podium animation: three figures step up, first in the middle.
  - Pickles sits in front of the podium.
- **What you keep:**
  - your place in the journal and the logbook
  - a ribbon on your Climber page if you place
  - conversations about it for a week or two
- **No XP beyond the sends themselves.**

## 7. What I'd keep exactly as it is

- The ledger's rules: append-only, first ascents permanent.
- `K` as the only way to names.
- The seeded per-day simulation and `tune_crag.js`'s development targets.
- Partners and vibes (Phase 3, Stage 4): extend them, don't replace them.
- `LESSONS` (regulars teaching skills) becomes one kind of friendship moment.
- Saves stay `v: 2`. Every new field is optional, and old saves are filled in on load.
