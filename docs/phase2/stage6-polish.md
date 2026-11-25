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
- **Second round (play-test feedback, 2026-11-25; screenshot `lot-wider.png`):**
  - **A wider lot, a U round a grass bay.** The lot is x −35..35 (was −27..27). The Billboard's foot (x −10..15, y −4..−13) used to spill out of its 20 m island and its tall face rose over the north lane. The island is now a bay 36 m wide, open to the verge at the top, so the whole rock stands on grass. Stall lines at ±21, ±27, ±33; the cars at ±24 and ±30; `PARK_SPOT` is now (−24, −4.6). The paper map's lot matches.
  - **Every car faces up**, the south row included (it was turned to face the road).
  - **The kiosk moved back** to (−2, 16), north of where The Billboard's top reaches; it was hidden behind it at (−6.5, 9).
  - **The Tollbooth moved** from (14.8, 5.8), where it sat on the lot's corner and the trailhead path, to (−22, 12) on the mown verge west of the trail. Its position is set by hand in `src/climbrec/simulate/layout.py` (`MOVED`, applied after every random draw, so nothing else moves); `game-data.json` and `site/map/map-data.json` were regenerated, and only its x and y changed. Boulders keep their indexes, so saves are unaffected. The landing page's `paper-map.svg` was re-exported.
- **The tree in the lot is gone.** The grass verge next to the lot let one maple grow on the asphalt at (−9.3, 2.7). Trees are now kept off the lot and its drive. The check comes after every random draw for the tree, so the rest of the woods is unchanged.

## Trails

- **Junctions are clean:** every trail's edge is drawn first, then every trail's dirt, so no trail's edge line crosses another trail's tread where they meet (the little rounded outlines at intersections).

## CragLog

- **"My first ascents"** in the ticks filter (new rules only).
- **First ascents in Recent logs:** a problem's logs end with its first ascent (someone else's, with a short note; old-era ones say "from the kiosk notebook"). Your own first ascent already shows among your ticks, marked "first ascent".
- **Local Buzz has its own tab** (Problems · Local Buzz · Rankings), no longer the box at the top of Problems. With the room, it shows up to 12 items from the last 30 days (was 5 from 21), and says so when there's nothing new. "See it" returns you to the Buzz tab. (Play-test feedback, 2026-11-25.)
- **"First to" is hidden** (`leadersShown()` in `game.js`) until the shared leaderboard is brought back online under the new rules. Development mode (`?dev`) still shows it, as does its link from the old rules' Rankings there.

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
- **How they're drawn:** standing figures with their own look (`LOOKS` in `game.js`) and their pad down, placed where no tree stands in front of them (`P.setPeople`, `P.personAt`). They're part of the map drawing, so they cost nothing while you walk. They're drawn the same size as you at every zoom (`sizePeople` rescales them when the zoom changes, since you're sized in screen pixels); a `look.size` below 1 would make someone a child.
- **Meeting them:** walk up to someone, or click them (you walk over and stop beside them), and you start talking. Strangers still approach you on arrival, at most three a day.
- **Pickles:** naps by Pickles' Rock at The Tailgate, about 100 m north-east of the car. He used to be the park drawing's landmark, about 1.7 m long beside a climber now about 6 m tall, so players couldn't find him. He's now drawn with the people (`drawDog` in `paint.js`; the game hides the landmark copy): about half your height long at any zoom, and clickable like them. Walk up to him or click him to say hello. He no longer turns up on arriving at The Tailgate, since you can see him asleep by his rock. He sometimes still greets you by the car in the morning.

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

## The intro (play-test feedback, 2026-11-25)

- **Height and ape index sliders drag smoothly.** They were already sliders, but every movement redrew the whole form, replacing the slider under the pointer, so it only moved a click at a time. Their readouts and the reach note now update in place.
- **The landing page lies over the park's paper trail map** (the user's direction, replacing a first try with a hero image cut from the illustrated map). The map is `site/game/paper-map.svg`, a static export of `paper.js`'s map without areas or "you are here" (`node scripts/browser/export_paper_map.js`; rerun it when the paper map or the park's layout changes), so the landing page doesn't build the park's scene. It's fetched once, fills the window behind the page (`#landing-map`, centred, cropped to fit), and has soft folds and a vignette; its ids are renamed (`lp-`) so they can't stand in for the trail map's patterns in the game. Everything on the landing page keeps the paper map's light inks in both themes, as the trail map does; dark mode dims the map behind.
- **Hierarchy:** the title is the map's cartouche (double ink rule: "A bouldering game", Granite Hollow, "State Park", the intro). Below it, one sheet like the map's legend panel holds the form (your climber | strengths and weakness), with a bar along its bottom: Drive to the crag, what's still needed ("Pick 2 more strengths to start", then "Ready"), and Load a save file at the right.
- **No suggested name** in the name field.
- **Removed:** "Every attempt is a roll against the grade…" (landing), "Height and ape index decide which problems suit your body." (landing), "Find boulders, look them over for lines, and if you're first up something, you get to name it." (kiosk), and "Looking doesn't move you or cost time. Walk takes you there along the trails." (trail map).
- **The kiosk's notebook page** has column headings, "Boulder name" and "Location / grade / FA", and no longer has Dot's "with a stick!" in the margin. (The CragLog story for Pets Must Be Leashed, in `world.js`, still mentions her note.)

Screenshots: `docs/screenshots/phase2-stage6/landing.png`, `landing-dark.png`, `landing-phone.png`, `kiosk-notebook.png`.

## Checked

- Node tests (36).
- The leak test, normal mode, walking (now checks you're walked back to the car at dusk) and Stage 5, all in headless Chrome.
- Screenshots of the lot, a junction, the climber walking, and a problem's logs.

None of this has been seen in a real browser yet.
