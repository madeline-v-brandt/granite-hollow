# Phase 2, Stage 0: foundations (design for review)

Status: **Stage 0 built (2026-11-24).** What was built, and where it differs from the plan, is in section 14 at the end.

Stage 0 builds the systems every later stage reads and writes:
- the reopening lore,
- a world history ledger, with a seeded NPC simulation,
- one knowledge layer that decides what the player can see,
- save format v2 and the migration from v1,
- a versioned leaderboard,
- a development mode.

Stage 0 adds no new gameplay. The aim is that Stages 1–6 can be built without changing these foundations.

## 1. Four layers, kept separate

| Layer | What it is | Where it lives | Who changes it |
|---|---|---|---|
| **Roster** | All 1,000 problems and 75 boulders: grades, styles, curated names, latent quality. The crag's hidden potential. | `game-data.json` (`D`), unchanged | Nobody, during play |
| **History** | What has happened in *this save's* Granite Hollow: who established what, when, under what name, plus repeats, ratings and classics. | `G.world` (new) | `world.js` only |
| **Knowledge** | What *this player* knows: areas, boulders and lines. | `G.know` (new) | `knowledge.js` only |
| **Climbing** | The player's own attempts, sends, ticks and projects. | `G.ps`, `G.ticks` (unchanged) | `game.js`, as today |

Two rules hold everything together:
- The interface never reads the roster or the history directly to decide what to show. It asks the knowledge layer (`K`). Game logic may read the history directly, for example to decide whether a send is a first ascent.
- A problem's identity is its index in `D.problems`, as it is today. Names, states and first ascents are all keyed by that index.

## 2. Lore: the reopening

This adapts the `naming.py` lore without renaming anything, so `game-data.json` doesn't need regenerating.

> Climbers found Granite Hollow in the early 70s. Dot, a 5'2" crimper, and the Bishop, a 6'5" reach merchant, climbed most of what got climbed, and argued about all of it. Nobody wrote anything down. There was no guidebook, only chalk arrows and a notebook in the ranger kiosk that went missing years ago.
>
> In 1987, after an accident at the quarry rim, the state closed the park to climbing. For years Ranger Gus ticketed anyone caught with a crash pad. Then, near retirement, he took up bouldering himself and spent a decade campaigning to reopen it.
>
> When the kiosk was cleared out for the reopening, one page of the old notebook turned up behind the corkboard. It records four problems by the parking lot, and it's now pinned under glass at the trailhead.
>
> Climbing reopened on **1 September 2025** under a new climbing management plan. Apart from the four problems on the notebook page, nothing is documented. Each new ascent is the first *documented* ascent of the new era.
>
> The old days survive as legend: Dot's faded tick marks, the lost notebook, and the Bishop, now in his seventies, who is sure he did your problem in 1979.

How this shows up in the game:
- **Starter problems:** the four problems on the notebook page, which are surviving old-era climbs rather than new first ascents. They sit on the two Tailgate boulders closest to the car, a V0–V2 ladder. They're fixed in `world.js`, not random, so the first day always works. The FAs and years below are proposals.

  | Problem | Boulder (distance from the car) | Grade | FA (from the notebook page) |
  |---|---|---|---|
  | *Your Ad Here* (3.3★) | The Billboard (9 m, in the lot) | V0 | Dot, 1974 |
  | *Billboard Traverse* | The Billboard (9 m, in the lot) | V0 | "no name given," 1970s |
  | *Carry In, Carry Out* (3.3★) | Gus's Rock (59 m) | V1 | Dot, 1975 |
  | *Pets Must Be Leashed* | Gus's Rock (59 m) | V2 | the Bishop, 1976 (Dot's note in the margin: "with a stick") |

  These keep their curated names, which by this account were what the notebook called them.
- **Known areas at the start:** the kiosk map marks three climbing areas. You know where they are, but haven't been there or found their boulders.
  - The Tailgate.
  - The Schoolhouse (6 min).
  - Hawkwatch (8 min), the old hawk-count platform, which is also a park landmark.

  Millrace Caves (also 8 min, along the pond) is left as the first area you find yourself. Everything further out is unknown until you find it or someone tells you.
- **How areas get their names:** a climbing area's name appears only once you know the area. Each area has an `origin` in `world.js`:
  - **Place names** from the park and village (Hawkwatch, Millrace Caves, The Schoolhouse, The Spillway, The Cellar Holes, The Grout Piles, Back Forty) are simply what the spot is called.
  - **Community names** (The Tailgate, Bracken Gully, Hemlock Hollow) "emerge": the first NPC activity there adds a buzz item such as "People have started calling the boulders up the fern gully *Bracken Gully*."

  The sector names stay unchanged, so saves are unaffected.
- **Legends:** a short curated list (about 10–15 entries in `world.js`) of genuine old-era stories attached to specific problems. Example: "Dot's tick mark is still on the starting crimp." It shows on the problem page as *Local legend*. It never affects the FA record.
- **The Bishop's claims** are generated dialogue (Stage 5) and are never stored as history. They're funny because they're unreliable.
- **Curated names that reference the era**, such as *Dot's First* and *Gus Was Here*, read as homage when an NPC establishes the problem.
- **Pickles** is still the parking-lot dog of today.

## 3. Save format v2

Unchanged v1 fields: `player`, `date`, `dayNo`, `loc`, `ps`, `ticks`, `tips`, `todo`, `ach`, `feed`, `bestGrade`, `day`, `forecast`.

```ts
type PID = number                 // index into D.problems, stable forever
type BID = number                 // index into D.boulders
type Who = "you"                  // the player
         | `c${number}`           // a climber from D.climbers (the arriving community)
         | `n:${string}`          // a named NPC: "n:gus", "n:bishop", …
type Day = string                 // "YYYY-MM-DD"

interface SaveV2 {
  v: 2
  rules: 1 | 2          // the rules this climber STARTED under. Migrated saves: 1. Leaderboard bucket.
  id: string            // as v1; also seeds a migrated world
  dev?: true            // made in development mode: never posts to the leaderboard
  board: { joined: boolean }
  visited: string[]     // kept for one release so older code still reads it; derived from know.areas
  world: World
  know: Knowledge
  /* …all v1 fields, unchanged… */
}

interface World {
  seed: string                     // fixed at creation (new game: random; migrated: hash of id)
  simDate: Day                     // last day the NPC simulation has run, inclusive
  est: { [pid: string]: FA }       // established problems. Append-only.
  found: BID[]                     // boulders the community has found (where NPCs can develop)
  npc: { [who: string]: Npc }      // NPCs who have arrived
  hold: { [pid: string]: Hold }    // NPCs' current projects (for stories and the rare "they sent it")
  news: News[]                     // newest first, capped at 150
  snipe: { last: number | null }   // dayNo of the last "someone sent your project" story
  migrated?: { from: 1, on: Day }
}

interface FA {
  by: Who
  date: Day
  grade: number         // what CragLog shows. Equals D's grade for now; consensus grading later.
  name?: string         // only when the player named it; otherwise the curated D name
  flash?: true
  old?: number          // year of an old-era ascent (the notebook problems). `date` is then the reopening day it was documented.
  reps: number          // repeats by others
  rs: number, rn: number                     // ratings: sum and count, so stars = rs / rn
  logs: [Who, Day, "F"|"S", number|null, number|null][]   // last 5: who, date, style, stars, suggested grade
  classic?: Day         // when it became a classic
}
interface Npc  { arrived: Day, fas: number, area?: string }
interface Hold { by: Who, since: Day }
interface News { date: Day, kind: "fa" | "classic" | "arrival" | "snipe" | "found" | "named", p?: PID, b?: BID, s?: string, by?: Who }

interface Knowledge {
  areas:    { [sector: string]: 1 | 2 }   // 1 known, 2 visited; absent means unknown
  boulders: { [bid: string]: 1 | 2 }
  lines:    { [pid: string]: Line }        // lines the player has identified
  looked?:  { [bid: string]: Day }          // boulders you've inspected, and when (added in Stage 3)
  newsSeen: Day                            // for "new since you last looked" in CragLog
}
interface Line { how: "spot" | "told" | "tried" | "migrated", date: Day, from?: Who }
```

Notes:
- **No stored "player knows this problem is established" flag.** It's derived: the player sees an established problem if its boulder is known, or if they've identified or been told about the line. This means an NPC first ascent on a boulder you know appears in your CragLog, and one somewhere you've never been doesn't.
- **First ascents aren't flagged on ticks.** A tick is your FA when `est[p].by === "you"` and it's your first non-repeat tick of `p`. That keeps a single source of truth.
- **Size:** at most about 120 KB for `est`, plus about 40 KB for `lines`. That fits easily in localStorage, and in a future Firestore cloud save (1 MiB document limit).

## 4. The history ledger and simulation (`world.js`, new, pure, Node-testable)

**API:**
- `World.create(D, seed, date)`: writes the four notebook problems (`old` records by `n:dot`, `n:bishop` and an unnamed climber), Gus, and the first two or three arrivals.
- `World.step(D, G, upTo)`: runs each day from `simDate + 1` through `upTo`, then returns that day's events for notifications. Called from `startDay`, including every day of a multi-day rest.
- `World.recordSend(D, G, p, date, flash)` returns `{ fa }`. It writes `est[p]` for the player if no record exists; otherwise it updates the repeat stats.
- `World.migrate(D, g)`: v1 to v2 (section 6).
- `World.check(D, G)`: lists any invariant violations. Used by tests and the dev panel.

**Randomness.** Each day draws from its own stream, seeded by `hash(seed + "|" + date)`. Nothing needs saving beyond the seed, and reloading never rerolls a day. Player attempt rolls keep using `Math.random`, as today: they happen live and their results are saved.

**Invariants** (checked in tests, and in dev mode on every save):
1. `est` is append-only. `by` and `date` never change once written. Only a player-made record's `name` can be edited, and only by the player.
2. The player gets an FA exactly when they send `p` and `est[p]` doesn't exist yet.
3. NPCs never FA a protected line (one the player has identified or tried), except through a snipe story. A snipe is recorded as `news.kind = "snipe"`.
4. `simDate` only moves forward. `step` for a day at or before `simDate` does nothing.
5. Knowledge only grows, except through a reset in dev mode.
6. A known line implies a known boulder, which implies a known area.
7. Every FA date falls between 2025-09-01 and `G.date`.

**The development model.** Every number below is a named parameter in one `World.PARAMS` object, to be tuned by simulation (`balance_game.js`) and playtesting in Stage 5. Stage 0 only needs enough to exercise the ledger. Saves don't store these parameters, so retuning them changes future days only, never recorded history.
- **Development clock:** `dc = dayNo + 0.25 × calendar days since reopening`. The crag mostly develops on days you climb. Ten rest days add only 2.5.
- **Target:** about `1000 × 0.9 × (1 − e^(−dc/60))` established problems. NPCs close about 30% of the gap each day, up to 15 FAs a day. The target is a curve that levels off, not a deadline.
- **Who:** an active NPC, weighted by type (local hero > regular > occasional > tourist). The NPC must be able to climb the grade (`D.climbers[i][3]`). Their style likes (`[4]`) attract them to matching lines, so strong climbers put up the hard lines.
- **Which line:** on boulders the community has found, weighted by latent quality, because good lines go first.
- **Harder grades develop later:** each grade's weight is multiplied by `sigmoid((dc − 6 × grade) / 4)`. V0–V2 lines are available from the start, V5 lines around dc 30, and V10 lines around dc 60.
- **Strong climbers break that rule now and then:** each day there's a small chance (about 3%) that an arrived local hero who climbs V10 or harder puts up a V8+ line, ignoring the grade gate. Protection and the reservation of your next grades still apply.
- **Protected:** lines the player has identified or tried (weight 0).
- **Your next grades are reserved:** grades between ability + 0.5 and ability + 4 get weight × 0.3, so the player has a realistic shot at significant hard lines.
- **A late reserve:** about 10% of lines, chosen by seed, get weight × 0.05 indefinitely, so first ascents stay possible long after the 2025–26 season.
- **Community growth:** active NPCs ≈ 4 + 0.08 × established + 2 × √(your FAs), drawn in order from the 600 climbers in `D.climbers`. The area NPCs know grows outward from The Tailgate along the trails, and boulders the player discovers join it ("word spreads").
- **Repeats:** active NPCs repeat established problems within their grade range, weighted by latent popularity (`p.sends`). Their ratings are drawn around the latent stars. A problem becomes a classic at 15+ repeats averaging 3.0★ or more.
- **Snipe stories:** your identified lines and projects are protected by default. The only exception is a rare, deliberate story event:
  - A line is eligible only if you identified it but haven't tried it in 10 or more climbing days.
  - Never before day 20.
  - At most one every 25 climbing days, aiming for about one per 40–60 days.
  - Always told by an NPC, warmly.
  - It can be switched off with a parameter.
- **Cost:** a daily step is about 1,000 weight calculations, so a few milliseconds. Catching a migrated save up through 300 days takes well under a second.

## 5. The knowledge layer (`knowledge.js`, new, pure, Node-testable)

`const K = Know.make(D, G)` is cheap to rebuild after every action.

**Player-facing states:**
- **Area / boulder:** `0` unknown, `1` known, `2` visited.
  - **Areas:** a new game knows three areas from the kiosk (The Tailgate, The Schoolhouse, Hawkwatch), but no boulders.
  - **Unknown boulders** are still drawn in the world, with no name, label or climbing information. They aren't listed in any panel or in CragLog, so there's no checklist of things to find.
  - **Approaching an unknown boulder** offers a small **"Unfamiliar boulder · Inspect"** prompt. Until Stage 4 brings walking, clicking it on the map walks you there and the prompt appears in the Here panel. Inspecting discovers the boulder and spots its lines. Only then does it appear in the area panel and CragLog.
- **Line:**
  - `"hidden"`: not identified, and not a visible established problem.
  - `"open"`: identified but unclimbed, so an open project. Shows the difficulty feel and a descriptive label such as *Unclimbed crimpy traverse (sit)*, built from its styles and lettered A/B on a crowded boulder.
  - `"est"`: established and visible. Shows its name, grade, who did the FA and when, its stars and its logs.
- **Your relationship** (tried, sent, project) still comes from `G.ps`.

**Queries** (the only way screens get names, grades and lists):
- `area(s)`, `boulder(b)`, `line(p)`: the states above.
- `name(p)`, `gradeText(p)` (`V5`, or the feel for an open line), `boulderName(b)` (`null` when unknown), `areaLabel(s)`.
- `linesOn(b)`: what the Here panel lists on your boulder.
- `guidebook(filters)`: CragLog's problem list (visible established problems only).
- `canGo(target)`: whether a destination is known, which gates "Go there".
- `mapView()`: what the painter may label (section 5a).
- `recommendable(npc)`: what an NPC may recommend. Passing on a recommendation *reveals* knowledge through `tell`, so it's never a leak.

**Changes** (each returns events for the discovery toasts):
- `discoverArea`, `discoverBoulder(b, how)`, `visit(b)`.
- `spot(b)`: identifies every line on `b` that `Mech.canSpot` allows (below).
- `identify(p, how, from)`, and `tell(p, from)`, which also makes the boulder and area known.

**The discovery rule** goes in `mechanics.js` as a pure rule:
```js
canSpot(player, p) = feel(sendChance(margin({ ...player, energy: 100, skin: 100 }, p, null, { cond: 0 }))).key !== "nope"
```
That's a fresh climber, average conditions and no beta. Only "Not yet" lines stay hidden, so Warm-up, Should go, Hard and Project lines can all be spotted. It can't flicker, because once identified, a line stays identified.

**An "everything known" mode** (`K.all`) makes every query return what the game shows today. Live builds run in this mode until Stage 3, so routing every screen through `K` can be checked against today's game for regressions.

### 5a. What has to go through K

These are every place that reads the roster today:

| Where | Reads today | With K |
|---|---|---|
| Here panel: the parking lot list | every sector's grade range, problem counts and sends | known areas only; counts and ranges from visible problems |
| Here panel: area view | every boulder, with problem counts and ranges | known boulders only; never a count of unfound ones. With none yet: "You haven't found any boulders here yet. Have a look around." |
| Here panel: boulder view | every problem on the boulder | `K.linesOn(b)` |
| CragLog: list, search, filters, sort | all 1,000 problems, latent stars and sends | `K.guidebook()`; stars and sends from the ledger |
| CragLog: problem page | latent stars, ratings, 2017–25 logs, suggested grades | ledger FA, ratings and logs; legend; open lines show the feel only |
| CragLog: Rankings | NPC sends since 2017 (`D.sends`) | rebuilt from the ledger (Stage 5); hidden in rules 2 until then |
| CragLog: First to (leaderboard) | other players' top sends, as problem indexes and names | in rules 2, grades only ("a V7 first ascent"), never names, because other players' problems aren't in your world |
| Map (`paint.js`) | sector labels (name, V-range, walk), boulder labels, hover card | `P.setKnown(K.mapView())`, which redraws labels only; the hover card comes from `tipHtml`, which reads K |
| Map clicks | travel to any boulder or area | interim rule until Stage 4: any boulder you can see is reachable (it's physically there); areas need to be known |
| Encounters | recommend from `D.liked` and sector problems | `K.recommendable` plus `tell` |
| Tips, to-do list | any problem | only visible problems; adding one reveals it |
| Achievements | Classic Hunter uses latent stars; Explorer uses all 10 sectors | ledger stars; unchanged |
| Toasts, banners, day summary, journal, logbook | `p.name`, `p.grade` | `K.name`, `K.gradeText` |

**Leak test** (automated, in headless Chrome):
1. Start a fresh rules-2 game.
2. Open every tab, CragLog view, hover card and modal.
3. Collect all page text.
4. Assert that no hidden problem name, unknown boulder name or unestablished grade appears.

The test runs again after each later stage.

## 6. Migrating v1 saves

`World.migrate` is deterministic: the seed is `hash(g.id)`, so the same v1 save always produces the same v2 save. It runs only when `v === 1`, and sets `v: 2`. It never duplicates or changes records.

1. `rules: 1`, `world = World.create(D, hash(id), "2025-09-01")`.
2. **Your sends become your FAs.** For each first-send tick in date order, write `est[p] = { by: "you", date, grade, flash? }`, unless `p` is a starter problem. The notebook problems keep their old-era FAs, and your send of one is an ordinary first send.
3. **What you've tried becomes identified lines.** Every `ps` entry with attempts gets `know.lines[p] = { how: "migrated" }`. Problems on your to-do list or tips get the same, with `how: "told"` and `from` for tips.
4. **Where you've been becomes visited.** Boulders with any attempts, and your current boulder, are visited. Areas in `G.visited`, and areas containing a visited boulder, are visited. Areas and boulders of known lines become known.
5. **Catch-up history.** `World.step` runs from the reopening to `g.date`, with *everything* in steps 2–3 protected throughout. NPCs can therefore never take a problem you sent.
6. XP, levels, grades, skills, ticks and projects are left exactly as they were. There's no retroactive FA bonus.

**Tests:**
- Migrating the same v1 save twice gives byte-identical JSON.
- Migrate, save, reload and play a day: nothing in `est` changes except new entries.
- An old *mid-day* save keeps its day exactly as it was.
- A downloaded v1 save file loads, and migrates the same way.

**Timing:** live saves stay v1 until Stage 3 ships (see the plan below), so no real player is migrated into a half-finished system.

## 7. Leaderboard versioning

- Entries gain `rules` (1 or 2) and `fa` (your FA count). Both are validated as small integers on read, like every other field there.
- *First to* shows rules-2 climbers by default, with a toggle for *Before the reopening* (rules 1, which includes migrated climbers).
- Rules-2 entries never post problem names or indexes, only grades. That avoids leaking lines to other players and showing names that only exist in one person's save.
- Dev saves never post. `syncBoard` returns early when `G.dev` or dev mode is on, and `validateSave` forces `board.joined = false` when `dev` is set.

## 8. Names the player gives problems

- **`cleanName(s)`**, applied when you type and checked again in `validateSave`:
  - Unicode NFC.
  - Strip control characters and bidirectional-override characters (U+202A–202E, U+2066–2069).
  - Strip `<` and `>`.
  - Collapse whitespace, then trim.
  - 1–40 characters, at least one letter or digit.

  Everything else is fine: apostrophes, quotes, `&`, `!`, `?`, `#`, accents and emoji.
- **Display:** always through `esc()`, which already escapes `& < > " '`, in text and in attributes.
- **Why strip `<>` rather than escape only:** the existing save-file check rejects any save containing them anywhere, and keeping that blanket defence is worth losing two characters.
- **Duplicates** are allowed, as at real crags, with a gentle note: "There's already a *Moonshine* at Hawkwatch."
- **When to name:** the naming dialog opens on an FA. Its default is the curated name, which you can accept. If you close it without choosing, you get the curated name and can rename later from the problem's CragLog page. Only your own FAs can be renamed.

## 9. Development mode

- **Turning it on:** `?dev` in the URL, which then sticks in sessionStorage. It uses its own save slot (`granite-hollow-save-dev`), so it never touches your real climber. Saves made there carry `dev: true`.
- **The panel**, toggled with a button in the HUD:
  - Rules 1 / rules 2 switch.
  - Reveal everything, or reset knowledge.
  - Teleport to any boulder.
  - Simulate N days of NPC development, without the player.
  - Establish the selected problem as you or as an NPC.
  - Inspect any problem's layer states (roster, history, knowledge, yours).
  - Run `World.check`, and show the seed.
  - Load a copy of your real save, to test migration on it.
- **Safety:** it never posts to the leaderboard, as section 7 describes.

## 10. Reinterpreting the existing data

Everything is kept. Only the meaning changes, so `game-data.json` doesn't need regenerating in Stage 0.

| Data | Was | Becomes |
|---|---|---|
| `p.stars`, `p.ratings` | the crag's ratings | **latent quality**: decides which lines NPCs develop first, and seeds their ratings. Shown stars come from the ledger. |
| `p.sends` | how often it's been climbed | **latent popularity**: weights NPC repeats |
| `D.climbers` (600: name, height, type, max grade, style likes) | the crag's climbers | the **arriving community**, in seeded order. Grade sets what they can establish; likes set what they choose. |
| `D.liked` | each climber's favourites | what they'd love to climb, and recommend once it's established and you know it |
| `D.logs` (2017–25) | recent logs | retired as history. The comment generator (`commentFor`) is reused for ledger logs. |
| `D.sends` (rankings since 2017) | Rankings | retired. Rankings are rebuilt from the ledger in Stage 5. Kept in the data until then. |

## 11. Stage 0 plan

Each step leaves the live game playable and unchanged:

1. **Lore.** Update the `naming.py` docstring and the lore line in CLAUDE.md, and add the starter and legend tables to `world.js`. No names change, so the data stays the same.
2. **`mechanics.js`:** add `canSpot`, with a Node test.
3. **`world.js`:** randomness, `create`, `step` (the first development model), `recordSend`, `migrate` and `check`. Node tests for determinism, idempotent migration, invariants, protection, and the time taken for 300 days.
4. **`knowledge.js`:** states, queries, changes and the everything-known mode, with Node tests.
5. **Route `game.js` through K** (the 5a table), plus `P.setKnown` in `paint.js`. Check that the everything-known mode matches today's game (DOM text and screenshots before and after), then run the leak test in rules 2.
6. **Save v2:**
   - Have `validateSave` read both versions.
   - Hook `World.step` into `startDay` and `World.recordSend` into `tryProblem`.
   - Test with an old mid-day save, a downloaded save file, and repeated reloads.
7. **Dev mode** and the leaderboard `rules` field.
8. **Interim rules-2 play (dev only):**
   - Clicking an unfamiliar boulder on the map walks you there.
   - A plain **Inspect** button discovers it and spots its lines.
   - An FA uses the curated name.

   This lets the ledger be played end to end before Stage 3 adds the real inspection moment, the naming dialog, and the first-day flow from the kiosk.
9. **Docs:** update CLAUDE.md (layers, invariants, how to test) and the memory notes.

**What ships after Stage 0:** the same game for players (rules 1, v1 saves), with all of the above underneath and reachable in dev mode. Rules 2 and the v1 → v2 migration go live together with Stage 3, once players can actually discover and inspect.

## 12. Local Buzz (decided; built in Stage 5)

CragLog gets a small **Local Buzz** section with occasional, atmospheric hints about new ascents and discoveries, including in areas you haven't found.

- **The source is `world.news`**, which Stage 0 already records, so the buzz is a view over it with no new state.
- **Unknown areas stay vague.** Items there use a per-area phrase from `world.js`, such as "somewhere past the quarry", "up on the ridge" or "down in the hemlocks": *"Word is someone put up a stiff V6 somewhere past the quarry."* They never change `G.know` and never unlock "Go there".
- **Known areas are precise:** *"Bea put up* Moonshine *(V6) at Hawkwatch."* "Go there" appears only when `K.canGo` allows it.
- **A few notable items, not a feed:** a first ascent in a new area, a hard FA, a new classic, a newly named area. At most a couple a day.

## 13. Decisions (2026-11-24)

1. **Starter problems:** two on Gus's Rock and two on The Billboard, the old notebook page (section 2).
2. **Areas at the start:** The Tailgate, The Schoolhouse and Hawkwatch, from the kiosk map (sections 2 and 5).
3. **Unfamiliar boulders:** visible in the world, never listed. Approaching one offers "Unfamiliar boulder · Inspect" (section 5).
4. **Rumours:** yes, as Local Buzz: vague about unknown areas, never unlocking travel (section 12).
5. **Pacing:** the proposed numbers are a starting point, all held as parameters. Harder grades develop later, with occasional early hard FAs by strong climbers. Your lines are protected, with rare deliberate exceptions (section 4).

Guiding priorities:
- A welcoming first day, not an empty wilderness.
- Discovery that feels organic, never a checklist.
- A crag lively enough to feel real that still leaves you meaningful first ascents.
- The old era as part of the world's personality.
- A simple first version, refined later.

## 14. Stage 0 as built

**Files:**
- `site/game/world.js`: the ledger, the simulation, the migration, validation, the invariant check, and the lore tables (`NOTEBOOK`, `LEGENDS`, `AREAS`, `NAMED`).
- `site/game/knowledge.js`: the K layer.
- `mechanics.js`: `canSpot`.
- `game.js`: every screen goes through K, plus the dev tools.
- `paint.js`: `setKnown`.
- Tests: `scripts/test_world.js` (23 tests, plus `--curve`) and `scripts/browser/` (headless Chrome: the leak test, the normal-mode checks, the before/after screen snapshot, and the old mid-day save fixture).

**Verified:**
- **Today's game is unchanged.** Every screen of an old mid-day save renders the same text as before Stage 0, apart from randomly worded log comments. New climbers still get v1 saves, an old save file loads, and a development save file is refused outside dev mode. `balance_game.js` pacing is unchanged.
- **New rules (dev mode):**
  - A new climber knows the three kiosk areas and the notebook's two boulders.
  - Nothing hidden appears on any screen, in a map label, in an accessible name or in a hover card.
  - Walking to an unfamiliar boulder, inspecting it, and sending an unclimbed line gives a first ascent that survives a reload.
  - A week's rest simulates once, and the invariants hold.
  - The old mid-day save migrates with its XP and ticks intact, and its sends become its FAs.

None of this has been seen in a real browser yet, only headless Chrome.

**Differences from the plan:**
- **The community climbs during reopening week** (Sept 1–5), before you arrive, so CragLog starts with the notebook's four problems plus one or two more on those two boulders. That still counts as "a few".
- **Ranger Gus is the first member of the community** (about V3, likes slabs), so his name appears as a first ascensionist.
- **Inspecting a boulder costs 5 minutes.** Stage 3 makes it a proper moment.
- **A snipe is marked on its FA record** (`snipe: true`) as well as in the news, because the news list is capped.
- **Migration also clears today's encounter and last result**, which are stored text written under the old rules.
- **Under the new rules, a problem's description never names another line** ("an eliminate of …"), and the leaderboard never names other players' problems you don't know.
- **The leak test can't tell a sit start's name from its parent line's** ("Kiosk Sit" contains "Kiosk"). Curated names do this, as real crags do, so it's accepted.

**How the crag develops** (`node scripts/test_world.js --curve`): a simple simulated player climbs two days in three at the current pacing, inspects one boulder per climbing day, and sends up to three lines at their level. These are first numbers for Stage 5 to tune.

| Calendar days | Climbing days | Player | Established | By the player | Hardest NPC FA | Climbers | Boulders the community knows |
|---|---|---|---|---|---|---|---|
| 7 | 6 | V3 | 28 | 9 | V2 | 10 | 15 |
| 30 | 22 | V7 | 154 | 55 | V6 | 30 | 60 |
| 60 | 42 | V9 | 450 | 115 | V9 | 61 | 75 |
| 120 | 82 | V11 | 757 | 235 | V11 | 95 | 75 |
| 365 | 246 | V11 | 962 | 435 | V11 | 122 | 75 |

The shape is right: slow at first, hard lines later, and a few dozen lines still unclimbed after a year. The simulated player takes about 45% of all FAs, which is probably generous, because they send three lines every climbing day. The community also finds every boulder within about six weeks, which may be faster than we want for exploration. Both are Stage 5 tuning questions.
