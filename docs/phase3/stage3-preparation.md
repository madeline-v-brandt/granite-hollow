# Phase 3, Stage 3: preparation, conditions and unlocks

Status: **built and reviewed (2026-11-26),** with the changes in "After the review" at the end. The plan is `stage0-design.md`, section 8 ("Stage 3 in more detail"). The plan's Stages 3 and 4 (unlocks, and resources and preparation) are merged here.

## What's new

### Conditions through the day, and shade

The day's forecast (Prime, Good, Meh, Greasy) still describes the day as a whole. Where and when you climb now changes it:

- **The hour.** Friction is best in the cool of the morning and evening, and worst in mid-afternoon.
- **Shade.** On a warm day, a boulder in the shade stays cooler than one in the sun. On a cold day the sun is welcome instead (warm fingers). Clouds even it out.
- **Where shade comes from:**
  - **The area's woods,** set by hand from each area's lore. Hemlock Hollow, Bracken Gully and Millrace Caves are the shadiest; Back Forty's hayfield, Hawkwatch and the Grout Piles are the sunniest.
    - Hemlocks keep their shade all year.
    - The maple and oak woods (the Schoolhouse, the Cellar Holes) let the winter sun through.
  - **The rock's own angle.** It's always cool under a roof; slabs face the sky.

The rules are `Mech.condAt(w, minute, shade)` and `Mech.shadeOf(boulder, month)`.

**How big it is:**
- On a hot, sunny day, a shaded boulder at 9 AM is about a third of a grade better on slopers than a sunny one at 3 PM.
- Over a day, the park as a whole averages out close to the forecast (tested).

The table is keyed by area name, so a renamed area needs its entry renamed (`test_prep.js` checks every area has one).

### Brushing

- **Lines nobody has climbed start dirty:** gritty and lichened, 0.3 of a grade harder. The Tailgate's are the exception: Gus scrubbed the lines by the lot for the reopening, so your first day is clean.
  - Brushing cleans one for good (`ps.clean`). Once anyone climbs a line, it's clean too.
  - The problem card says so ("Gritty and lichened: nobody has climbed it").
- **On friction holds** (slopers, slab, and other friction-sensitive problems), a fresh brushing helps for the rest of the day: up to 0.1 of a grade, scaled by how much friction matters.
  - It's offered only below 80%, so warm-ups don't get the button.
  - It counts inside the shared ceiling on good things.
- **It takes 5 minutes,** and the button shows what it'll do: "Brush it clean · 5 min · send 25% → 31%".
- **Climb it** brushes a dirty line first, once you know how, so easy first ascents stay one tap ("You brush the grit and lichen off the holds first.").

### Tape

- **Tape up** is offered once your skin is under 60.
  - Taped, a burn costs half the skin, and thin skin hurts 40% as much.
  - No flappers through tape.
  - **A flapper forces tape:** you're taped on the spot for the rest of the day, and Take the tape off is greyed out. If you didn't know how to tape, Otis (or Gus, before Otis arrives) shows you, and you've learned it.
- **But you lose feel:**
  - −0.25 of a grade on slopers and slab
  - −0.12 on pinches and compression
  - nothing on crimps
- **It stays on for the day,** or until you take it off (free). The button shows the cost, for example "Tape up · 5 min · half the skin · send 73% → 64%" on a slopey slab.
- A flapper now says "Tape it up or call it a day" only if you know how to tape.

### Unlocks: learning from the regulars

A new climber knows how to burn and rest. Everything else is taught in the climbing scene, by a regular, the first time it would help. A strategy is also taught once you're strong enough that you'd have picked it up anyway.

| What | Who | When |
|---|---|---|
| **Brushing** | Ranger Gus | From your second day, under a line that's dirty or on friction holds, or at V2 |
| **Working a move** | Hollis Pruitt (a climber nearby if Hollis hasn't arrived yet) | A line you've fallen off four times over at least two days, or V3 |
| **Tape** | Otis Fairweather (Ranger Gus, before Otis arrives) | At V3 with skin under 50, or V5; or on the spot, with your first flapper |
| **Reading the conditions** | the Bishop | At V4 in the afternoon or in poor friction, or at V6 |

Your first day is just burns and rests.

**How a lesson appears:**
- It's told in the narration, after whatever just happened.
- The new button is marked **New** until you use it.
- It goes in the journal's feed ("Learned: brushing.").

**Before you've learned something,** it still works on you; you just can't act on it or read it:
- Dirty lines are harder.
- Afternoons are greasier, and the fall text says so ("The holds feel greasy in the warmth of the day").

**Reading the conditions shows:**
- **On the problem card:** the boulder's shade and how the friction is right now ("In the sun · friction meh now").
- **In the status bar:** when the friction is best for the rest of today, and whether to look for shade or sun ("Best after about 5:45 PM. Afternoons are cooler in the shade.").
- **In the odds breakdown:** "Friction here now (in the sun)".

The Bishop's lesson names no area ("went down where the hemlocks keep the sun off"), so nothing leaks.

**Climbers from before Stage 3** know what their level would have taught them, with nothing marked New:
- brushing from V1 (or with any sends)
- working moves from V3, or if they've projected (three or more tries on a line)
- tape from V5
- reading the conditions from V6

The user's climber knows all four. The rest come up as they're needed.

### The menu

- **The menu keeps its 2×2:** Send burn, Work a move, Rest, Leave.
- **Preparation goes in a slimmer, dashed row under it,** only where it matters:
  - Brush on a dirty line, or on friction holds you haven't brushed today
  - Tape up / Take the tape off with thin skin
- **Once you know a preparation,** the menu keeps room for that row, so the picture doesn't jump as buttons come and go.
- **Before Hollis's lesson,** Work a move isn't there, and Send burn spans the top row.
- **Previews look ahead by the time an action takes,** so a rest's or brushing's promise matches the burn after it, even as the afternoon warms up.

## Balance

**Final run:** `node scripts/balance_game.js --n 16`, in `stage3-output.txt`. Days to each level (medians):

| | V3 | V5 | V7 | V9 | V11 | V13 |
|---|---|---|---|---|---|---|
| target | 6 | 15 | 30 | 55 | 100 | 180+ |
| steady | 5 | 14 | 28 | 51 | 94 | 150 (Stage 2: 161) |
| projector | 6 | 15 | 32 | 55 | 95 | 143 (152) |
| mileage | 5 | 11 | 22 | 42 | 67 | 109 (112) |
| explorer | 4 | 9 | 19 | 33 | 59 | 108 (111) |

(With the slower unlocks after the review. The run before them was within a few days of this everywhere.)

- **The simulated climbers** brush dirty lines before their first burn and friction holds on a line they're working, and tape up when their skin wears thin. With 16 climbers each, medians vary by about a week from run to run.
- **Brushing was set at 0.1 of a grade** after trying 0, 0.08 and 0.15. At 0.15 steady climbers and projectors were about 10% faster than in Stage 2; at 0.08 they matched it.
- **Climbers who never brush or tape** (`--noprep`) are slower: steady V13 at about day 176, and not all of them get there.
  - The difference is mostly the dirt on first ascents.
  - In the game that's hard to miss: Gus teaches brushing on day one, and Climb it brushes for you.
- **Tape is rarely needed** by the simulated climbers (about one day each). It's for players who run their skin down on a big day.
- **First ascents** (keen climbers' share by the end of 2025, steady to explorer): 22–80%, as before. The crag's own development (`tune_crag.js`) is unchanged: 72% climbed by the end of 2025.

## Tests

- **`node scripts/test_prep.js` (new, 8 tests):**
  - shade by area, angle and season
  - friction through the day, with shade and sun
  - the park averaging close to the forecast
  - dirt and brushing
  - tape
  - brushing inside the ceiling
  - old days unchanged
- **`node scripts/browser/stage3.js` (new):**
  - nothing taught on day one
  - Gus's lesson on day two, and the first menu
  - brushing matching its preview
  - no work lesson from a few falls in one day
  - a V4 with thin skin taught the rest
  - tape on the card
  - the status bar's reading
  - a flapper forcing (and teaching) tape
  - an old save learning by level
- **All browser suites pass with no page errors or leaks:** `v2test`, `live`, `stage3`, `stage5`, `walk_fixes`, `walk`. Walking runs at 56 fps.
- **The scene prototype page** still loads without errors.
- **Seen only in headless Chrome,** not a real browser.

## For review (answered below)

1. **Brushing a dirty line:** one tap in the scene before you climb a new line (Climb it does it for you). Is that a pleasant ritual, or should the scene brush dirty lines automatically too, keeping the button for friction holds?
2. **The unlock order and timing:** brushing on day one, working moves after a few falls, tape around V2–V4, reading the conditions around V3–V5. Earlier or later?
3. **How much the hour and shade matter:** about a third of a grade between the best and worst spot on a hot day. Enough to plan around, or too little to notice?
4. **Tape:** worth it on crimps with thin skin, costly on slopers. Should a flapper force tape (or the end of crimping) rather than just hurting?

## Not done

- **Filing** stays folded into overnight skin care, with nothing to do.
- **Teachers don't need to be standing nearby.** A lesson's teacher "wanders over" wherever you are. Only whether they've arrived in the park changes who teaches.
- **The simulated climbers don't plan their day** around the hour or shade.

## After the review (2026-11-26)

1. **Brushing a new line in the scene** stays a choice you make (one tap per new line; Climb it does it for you).
2. **Unlocks are slower:**
   - Nothing is taught on your first day, and the Tailgate's lines start clean (Gus brushed them for the reopening).
   - Brushing comes from day two.
   - Working a move comes after a line has held you off over two days (or V3).
   - Tape comes at V3 with thin skin (or V5).
   - Reading the conditions comes at V4 (or V6).
   - Older saves learn by the same levels.
3. **The hour and shade** stay as they are, about a third of a grade between the best and worst spot on a hot day.
4. **A flapper forces tape** for the rest of the day, and teaches tape if you didn't know it.
