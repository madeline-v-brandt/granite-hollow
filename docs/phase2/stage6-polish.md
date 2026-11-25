# Phase 2, Stage 6: polish

Started 2026-11-25, from the user's notes after playing Stages 4 and 5.

## Walking was laggy (fixed)

- **Cause:** the climber was drawn inside the map's SVG. Their legs and position change every frame, so the browser repainted and re-rasterized the whole park every frame while walking. The map itself only slides (a GPU transform), which should cost nothing.
- **What the traces showed:** every version since Stage 4 painted about 1.5 million pixels a frame. Hiding the climber took headless Chrome from about 22 fps to 50.
- **Why it became noticeable now:** probably the faster walking and the four-facing figure. Headless Chrome showed no difference between versions, but a real Mac's raster is where the cost is.
- **The fix:** the climber now lives in a small SVG of their own (`.me-layer`, 72 × 84 px), layered over the map and moved with `translate3d` (`placeMe` in `paint.js`). Their legs re-raster only that small box.
  - Measured in headless Chrome at 2× density, walking with the user's late-game save:

    | | Frame rate | Slowest 5% of frames |
    |---|---|---|
    | Before (all versions since Stage 4) | about 18–28 fps | 83–183 ms |
    | After | about 40–45 fps | 17–33 ms |
  - Not yet seen in a real browser.
- **Rule for later:** nothing that changes every frame belongs inside the map's SVG.

## The parking lot

- **Every day starts by your car** (`PARK_SPOT` in `game.js`, behind the first car in the north row), still within The Tailgate's area. At dusk you're walked back to the same spot.
- **The cars are in their spaces** (`art.js`):
  - The painted stalls are x between the lines at ±11, ±17 and ±23; the north row runs from y −2 to 4 and the south row from −30 to −24.
  - North-row cars nose north. South-row cars are turned round to face the road (cars can now carry a rotation).
  - Cars are solid: you walk round them.
- **The trailhead kiosk** moved west of the trail, to (−6.5, 9), clear of The Tollbooth, which used to hide it.
- **The tree in the lot is gone.** The grass verge next to the lot let one maple grow on the asphalt at (−9.3, 2.7). Trees are now kept off the lot and its drive. The check comes after every random draw for the tree, so the rest of the woods is unchanged.

## Trails

- **Junctions are clean:** every trail's edge is drawn first, then every trail's dirt, so no trail's edge line crosses another trail's tread where they meet (the little rounded outlines at intersections).

## CragLog

- **"My first ascents"** in the ticks filter (new rules only).
- **First ascents in Recent logs:** a problem's logs end with its first ascent (someone else's, with a short note; old-era ones say "from the kiosk notebook"). Your own first ascent already shows among your ticks, marked "first ascent".

## Second batch (the user's picks and notes, 2026-11-25)

### The climber

- **Walking:** the far arm swings opposite the near one, the arms swing more head-on, and the climber leans into the walk a little.
- **A chalk bag** at the hip, in their own colour.
- **More clothes** (`outfitFor` in `game.js`):
  - Each climber owns three shirts and wears a different one each day; some are striped.
  - Pants in five colours, shorts in three.
  - A hoodie on some cool days (50–61°F).
  - A headband on some mild days, and a bucket hat or a cap on hot sunny ones.
  - Your pad, pants and chalk bag stay yours.
- **A bigger crash pad** on the back (about 20% larger in every view).
- **Not done:** the hop on uphill steps I suggested.

### Crash pads on the ground

- Pads are now foam blocks: a top, the front face and the end facing you.
- They're about half the climber's leg height at walking zoom (`PAD_T`, 0.85 m in map units). Length and width are unchanged.

### Boulders

- **Heights:** drawn heights run from the climber's height to four times it, by the boulder's real height (`drawnHeight` in `illustrate.js`: 5 m for a 5 ft boulder up to about 21 m for the tallest at 20 ft, with the climber about 5 m tall at walking zoom).
- **Tall shapes:** tall boulders flare at the foot and taper to the top, so they read as rock rather than pillars. This is drawing only; footprints (and so walking and clicking) are unchanged.
- **Trees stay put:** trees still avoid standing in front of a boulder by its old height (`H0`), so the woods didn't move.
- **More shapes, less beak:**
  - Every overhanging boulder whose description doesn't name a shape used to be a hooked prow, the "bird beak": 16 of 75.
  - Now each picks from its family, from its own random stream: prow, wave (a whole side overhanging evenly) or leaner (the top leaning out over an undercut).
  - Plain blocks pick from block, tiered (a step in the top), fin (a thin flake), loaf (long and rounded) and wedge (ramping up to one end); towers sometimes become fins.
  - Kinds now: 13 tower, 12 slab, 7 prow, 7 roof, 6 round, 6 loaf, 5 wave, 4 leaner, 3 block, 3 box, 2 each of fin, dome, wedge and tiered, and 1 beak.

### Passing behind things

- **What's copied:** boulders you're behind, and foreground trees whose crown covers you, are copied over you, so you pass behind them. A faint see-through outline of you is drawn on top, so you never lose yourself.
- **How it stays cheap:**
  - The copies sit in a layer only as big as what they cover, placed over the map and slid with it.
  - The layer is hidden when nothing's in front of you.
  - The outline is in a small layer like the climber's own.
- **What it costs:** a map-sized empty layer cost about 12 fps in headless Chrome, which is why the layer is sized to its contents. Measured against the pushed Stage 5 version under the same load, walking is 33–36 fps against 25–27, with occlusion on.
- **What isn't covered:** the forest canopy (trees merged into one drawing) doesn't hide you; only foreground trees do.

### The regulars on the map

- **Who's out:** each day, each regular who's around is out (Gus about 45% of days, the others 55%) at a boulder in one of their home areas. This is decided by the day (`peopleToday`), so a reload doesn't move them. The Bishop is only out on his days.
- **How they're drawn:** standing figures with their own look (`LOOKS` in `game.js`) and their pad down, placed where no tree stands in front of them (`P.setPeople`, `P.personAt`). They're part of the map drawing, so they cost nothing while you walk.
- **Meeting them:** walk up to someone, or click them (you walk over and stop beside them), and you start talking. Strangers still approach you on arrival, at most three a day.
- **Pickles:** naps by Pickles' Rock (the existing drawing). Walk up to him to say hello; he sometimes greets you by the car in the morning too.

### Sitting with someone

- **Sit and chat · 20 min:** a regular's card has this option.
- **What it does:**
  - A rest in company: 20 minutes and 15 energy back, against Rest's 12.
  - A story from that person, three each so far.
  - Counted in `G.know.met[who].chats`, groundwork for the Pickles and Rowan stories.

### Tests

- **`stage5.js`:** now clicks each person on the map, walks over and uses every offer, including Sit and chat. Pickles is met by walking up to him.
- **`v2test.js`:**
  - waits for a boulder's lines to appear instead of a fixed time
  - tries the easiest-feeling unclimbed line first; trying a hard one first could use up a new climber's energy before an easy line went, which made the test fail now and then

## Checked

- Node tests (36).
- The leak test, normal mode, walking (now checks you're walked back to the car at dusk) and Stage 5, all in headless Chrome.
- Screenshots of the lot, a junction, the climber walking, and a problem's logs.

None of this has been seen in a real browser yet.
