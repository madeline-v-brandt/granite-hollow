# Phase 2, Stage 4: the climber, walking, and getting around

Built 2026-11-24. Screenshots: `docs/screenshots/phase2-stage4/`.

## The climber

A small illustrated climber with a crash pad on their back replaces the dot.
- **Drawn above the canopy,** in screen space, with a pale halo, so the woods never hide them.
- **Sized to suit the zoom.**
- **Walking:** legs swing with the distance walked, the body bobs a little, and they face the way they're going.
- **At a boulder,** the pad comes off their back and lies on the ground.
- **Dressed for the day's weather** (`outfitFor` in `game.js`):
  - shorts from 72°F
  - long sleeves below 62°F
  - a jacket below 50°F
  - a beanie below 45°F
  - a scarf below 36°F
  - a cap on hot, sunny days
- **Colours:** shirt, pad, jacket and hat colours come from the climber's id, so they're the same every day, and the pad always stands out against the shirt.

## Walking

- **Keys:** WASD or the arrow keys walk anywhere on dry ground. The keys don't work while you're typing, while a dialog or the trail map is open, or once the day is over. Arrow keys still scroll the side panel when it has focus.
- **Click or tap** open ground to walk there, or a boulder to walk up to it. Touch screens get their own hint ("Tap where you want to go").
- **What's in the way:** boulders, the Mill Pond, the Reservoir and the quarry pool are solid, and you can't leave the park. Walking into something veers you around it rather than stopping you dead. Brooks aren't in the way (there are footbridges and stepping stones).
- **Arriving:**
  - Walk close to a boulder and you're *at* it: the Here panel shows it, with your pad down.
  - Walk into an area and you're *in* it: a new area is discovered, and you might meet someone.
  - Between areas, the panel says whether you're by the lot, on a trail, or in the woods, and lists the areas you know with walking times from where you stand.
  - The edges are slightly sticky, so they don't flicker.
- **An unfamiliar boulder** puts a prompt over the map: *Unfamiliar boulder · Inspect (E)*.
- **Walking costs daylight at the game's existing pace.**
  - Every area's old walking time is its trail distance from the lot at **45 m a minute**, so walking on a trail costs exactly that.
  - Walking off a trail costs **30 m a minute**.
  - On screen, the climber walks at 14 m/s on a trail and 9 m/s off it, the same 3 : 2.
  - The clock moves a minute at a time as you go. Fractions are kept, so nothing is lost or double-counted.
  - Walking doesn't cost energy or skin.

## Getting around (`site/game/travel.js`, pure)

- `Travel.make({ trails, blocked })` plans the cheapest walk between any two points:
  - straight through the woods
  - or out to a trail, along the trail network (Dijkstra over the trail junctions), and off again at the far end
  - never across water

  Each leg carries its own rate, so a walk can be charged as it happens and stopped part way (`Travel.along`). Node tests cover pacing, preferring trails, routing around water, and stopping part way.
- **Trips** (Go there in a panel, CragLog, the trail map's new **Walk** buttons, a clicked boulder or spot):
  - They start from where you actually are, and cost the planned walk's time, charged as you go.
  - A short trip is walked. A medium one is hurried along in about 3 seconds.
  - A long one walks off for a second, fades briefly, and has you walking into the destination. The skipped stretch is charged at the fade.
  - Pressing a movement key takes over part way.
  - Passing through areas on the way discovers them, but only your destination counts as arriving (for encounters and the area's note).
  - A trip that wouldn't arrive before dusk, or before rain you've been warned about, is refused, as before.
- **Times shown everywhere** (panels, hover cards, the trail map) come from the same planner, from where you stand.

## Dusk never strands you

- **"Light's fading":** about 45 minutes before dusk, plus however long the walk out takes. It says how far the lot is from where you are.
- **"Time to head out":** when the walk out would just finish by dusk.
- **At dusk:** you walk back to the lot ("…you follow the trail back to the lot, 8 minutes in the last of the daylight"), and the day ends with its summary as usual.
- **Rain** still ends the day where you are, as before.

## Following you with the camera (`paint.js`)

- **How it follows** (as decided in Stage 1, the "layerSvg" mode):
  - While you walk, the SVG is drawn 220 px larger than the map's frame on every side.
  - It's slid under the frame with a GPU `translate3d`, and only redrawn when the slide runs out of margin.
  - The climber is part of the SVG.
  - About a second after you stop, the margin is dropped again (one redraw), so ordinary panning and zooming don't pay for the bigger picture.
- **Dragging** the map lets go of the climber. The crosshair button turns green, and pressing it brings the camera back. The wheel and the zoom buttons zoom around the climber while following.
- **Accuracy:** pointer and wheel events settle the slide first, so clicks land where they look.
- **Every day** starts at The Tailgate's trail junction, with the camera on you. Your position (`G.pos`, metres) is saved, and an older save gets one from where it says you are.

## Save changes

All optional; older saves load as before:
- `G.pos`: `[x, y]` in metres. Checked on loading a file; if it's missing or bad, the map places you from `G.loc`.
- `G.walked`: set once you've walked, which retires the walking hint.
- `G.day.walkFrac`: the fraction of a minute walked but not yet charged.

`G.loc` keeps its meaning (the area and boulder you're at), with `sector: null` now meaning anywhere between areas.

## Checked

In headless Chrome only, not yet in a real browser (`scripts/browser/walk.js`):
- Keys move you at the trail and off-trail rates.
- Wandering among boulders never puts you inside one.
- Clicking an unfamiliar boulder walks you there and offers Inspect, which E does.
- The trail map's Walk to Hawkwatch takes 6.7 minutes, about its trail time from the Tailgate, with the fade on the way. You arrive to the area's note.
- Your position survives a reload.
- Near dusk you're warned twice, then walked to the lot, and the day ends.
- Tap-to-walk works with touch emulation.
- Frame rate while walking: about 57–60 fps in headless Chrome, which says little about a real Mac (see Stage 1).
- The leak test, normal mode and the Node tests (30) all pass.
  - Two of the browser tests now write saves from another page, because the game saves itself when its page is hidden.
  - The leak test now removes visible names before looking for hidden ones, so a sit start ("Kiosk Sit") no longer looks like its hidden parent line ("Kiosk").

## After the first play-test (2026-11-25)

Played in a real browser. The Go there animation was right; these changed:
- **Walking speed on screen:** 17 m/s on a trail and 12 off it (was 14 and 9).
- **Four facings:** the climber now faces away from you walking up the screen (the pad on show) and towards you walking down (a face, the pad peeking out behind), as well as left and right. Near a diagonal they keep the way they were facing, so it doesn't flicker.
- **Walking yourself takes a little less time:** 50 m a game minute on a trail and 35 off it (`Travel.MANUAL`), about 10% and 14% less than before.
- **Trips keep to the trails** (Go there, the trail map's Walk): `plan(from, to, { trails: true })` weighs time off the trail 2.5× when choosing the route (it still charges the real time), so a trip only leaves the trail for the last stretch, or walks a short hop (under 110 m) straight. Times from the lot still match every area's walking time.
- **Shortcuts pay:** walking yourself (the keys, or a tap or click on the map) goes straight through the woods when that's quicker, at the faster rate. Between areas that saves about 20% on average, and up to half where the trails loop round (The Schoolhouse to Hawkwatch: 12 minutes by the trails, about 6 cutting through). Hover cards on the map show the walk-it-yourself time, since a click walks it that way; panels and the trail map show Go there's.

## Not done yet

- **Seeing it in a real browser.** In Stage 1, a real Mac at 1.8× density showed occasional 4–8 s pauses at zoom 6 with no long tasks, probably raster or GPU work. Walking around for a few minutes in a real browser will show whether they're still there.
- Canopy transparency over the climber (they're drawn above the trees instead), walking animation polish, more clothing (Stage 6).
- NPCs giving directions that unlock Go there (Stage 5).
