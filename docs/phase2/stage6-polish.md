# Phase 2, Stage 6: polish

Started 2026-11-25, from the user's notes after playing Stages 4 and 5. **Done** the same day, after several rounds of play-testing; this was Phase 2's last stage.

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
- **Second and third rounds (play-test feedback, 2026-11-25; screenshots `lot-west.png`, `paper-lot-west.png`):**
  - **The lot is a plain rectangle west of The Billboard** (x −69..−15, y −18..4; the user didn't like a U-shaped lot round The Billboard, tried in between). Two rows of 6 m stalls (lines at x −65, −59 … −17), the south row broken by the drive down to the road at x −41. Every car faces up. Your car is the east end of the north row, nearest the trailhead; `PARK_SPOT` is (−20, −4.6).
  - **The path to the trails runs straight** from the lot's north-east corner (−15.5, 4.5) to the Tailgate's trail junction (20.2, 40.2), replacing the Tailgate trail, which began in the old lot's middle behind The Billboard (`LOT_PATH` in `illustrate.js`, put in after the trees, which are kept off it; the user found a curving path with a sharp turn awkward). From the car to the junction is 61 m. The trail index (`trailDist`) learns it at the end of `parkScene`, after the landmarks and cairns are placed, so the junction's signpost stays in the fork between the two trails north of it (rebuilding it earlier had moved the signpost down onto the junction); walking on the path counts as the trail.
  - **The woods stayed put.** The trees are placed with the old lot's footprint in the zones, so every random draw is as before; the new lot (and drive) is cleared of trees afterwards, and the old footprint becomes a mown lawn round The Billboard (`lawn`).
  - **The trail map** shows the lot in its new place, the P sign west of it, and puts "You are here" below the marker near the kiosk so the labels don't overlap. The landing page's `paper-map.svg` was re-exported.
  - **The kiosk** is at (4, 17.5), beside the path (4.6 m off it) and north of where The Billboard's top reaches (it was hidden behind it at (−6.5, 9)).
  - **The Tollbooth** is at (−22, 12), left of the kiosk on the verge north of the lot, placed by hand in `src/climbrec/simulate/layout.py` (`MOVED`, applied after every random draw, so nothing else moves); `game-data.json` and `site/map/map-data.json` were regenerated, and only its x and y changed. Boulders keep their indexes, so saves are unaffected.
  - **The data files now carry the page's version** (`ASSET_V` in `game.js`: `game-data.json?v=N`, `paper-map.svg?v=N`). GitHub Pages lets a browser keep files for 10 minutes, and the user's browser ran the new game on the old crag data (The Tollbooth in its old place).
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
- **Pickles** (grey, since 2026-11-25): naps by Pickles' Rock at The Tailgate, about 100 m north-east of the car. He used to be the park drawing's landmark, about 1.7 m long beside a climber now about 6 m tall, so players couldn't find him. He's now drawn with the people (`drawDog` in `paint.js`; the game hides the landmark copy): about half your height long at any zoom, and clickable like them. Walk up to him or click him to say hello. He no longer turns up on arriving at The Tailgate, since you can see him asleep by his rock. He sometimes still greets you by the car in the morning.

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

## Walking (play-test feedback, 2026-11-25)

- **The arrows walk whatever has focus.** Clicking anything in the side panel (a CragLog tab, a sort menu) used to leave the arrows scrolling the panel or changing the menu, until you clicked the map again. Now only a text field keeps the keys.
- **No arriving inside a boulder.** Walk to an area went to its centre, and The Schoolhouse's centre is inside The Blackboard, where you were stuck. Areas now take the nearest open spot to their centre (`freeSpot` in `game.js`: no boulder within its radius × 1.1 + 1.2 m, no water, no car), as do a tap on a boulder's body and a boulder's last-resort approach point. A save found inside something is moved out on load, and a climber somehow inside a boulder can always step out.
- **Walking is a bit quicker on screen:** 20 m/s on trails and 14 off (was 17 and 12). The clock's rates are unchanged.
- **A tap on somewhere far keeps to the trails** (past `Travel.DIRECT_OK`, 110 m). Taps used the cheapest route, which cut through the woods between areas: Hawkwatch to The Schoolhouse was 221 m through the trees, and is now 543 m by the trails (6.3 → 10.9 minutes). The keys still cut through, so the shortcut is still yours to take.
- **Test:** `scripts/browser/walk_fixes.js`.

## Last round: the lot's entrance, boulder shapes, water (play-test feedback, 2026-11-25)

- **The lot's entrance meets the road.** The drive used to run on over the road. It now stops at the road's edge with rounded curb returns, and the curb line is drawn as an open line (`lot-edge`), so there's no seam where the drive joins the road. Trees are kept back far enough south of the lot that their crowns (drawn upward) don't overlap it.
- **Boulders without floating pieces or spikes** (`boulders-fixed.png`):
  - *Floating slabs* (the overhanging forms: prow, beak, wave, leaner): the top jutted out with nothing visible under it, so it read as a pale flap. Now the solid's far and under sides are drawn first in deep shade (`back` in the form, `.r-back`), the shoulder under any overhang drops to half height (as the prow's already did), giving the lip a shaded underside, and the overhang casts a soft shadow on the ground (`overhang`). The wave's overhang (.36 → .26) and every undercut (.45 → .32) are a little gentler.
  - *Spikes and notches* (slab and tiered forms): the shoulders were placed before the step lowered half the top, so they folded over it. They're now placed after the step (no change to the random draws).
- **Lakes with bays and points** (`lakeShape` in `illustrate.js`): a lobed outline (harmonics 2–7 on top of the old noise), tried with up to 80 seeds; of the shapes that fit, the least convex is kept. A shape fits if no boulder, trail or ruin is in the water and it stays inside the circle the scenery leaves for it (`art.js`, 1.2 × r). Where a brook or the millrace meets it the shore reaches out to them, and along the dam the shore is the dam's straight line (`reservoir-dam.png`). Mill Pond is now 0.76 of its old circle's area, and the reservoir 0.73. The trees around them were placed again (their random draws depend on where the water is), so the woods look a little different everywhere; nothing else moved.
- **The water, drawn better** (`lake-mill-pond-seasons.png`, `lake-reservoir-seasons.png`):
  - pale shallows round the shore, then deeper, then deepest a little off centre
  - a wet line at the water's edge
  - reeds in clumps along the shallows (not by the dam)
  - the sky's colour in long soft streaks (`--sky`, so it follows the time of day)
  - **Seasonal reflections:** the treeline mirrored along the far (north) shore, in short dabs broken by ripple lines, in the colour slots of the trees standing behind each stretch of shore (`.refl c-<slot>`). So it's pale green in spring, deep green in summer, red and orange at peak foliage, faint where the leaves are gone, and hidden under winter ice.
  - The prototype page (`site/prototype/park.html`) has the same water and lot styles.

## Checked

- Node tests (36).
- In headless Chrome: the leak test, normal mode, walking (checks you're walked back to the car at dusk), Stage 5, and `walk_fixes.js`.
- Screenshots of the lot, a junction, the climber walking, a problem's logs, the landing page, the lakes through the seasons and the fixed boulders.
- The user played each round in a real browser and sent the next round's notes; the last round (the lot's entrance, boulder shapes, water) was checked in headless Chrome only.

**Not done in Stage 6** (left for later, build only when asked): the small hop walking uphill, the canopy hiding the climber, the Pickles and Rowan stories, climbing partners, and bringing "First to" back online.
