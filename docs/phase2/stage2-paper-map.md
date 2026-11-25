# Phase 2, Stage 2: the paper trail map and the world's zoom

Built 2026-11-24. Screenshots: `docs/screenshots/phase2-stage2/`.

## The trail map (`site/game/paper.js`)

The park's trail map, opened over the game with **M** or the **MAP** button, and
closed with M, Esc, the ×, or a click outside it. It's drawn as a printed park
map, a different object from the illustrated world:

- **The park:** a forest wash with tree stamps inside a dash-dot boundary, and contour lines from the hills.
- **Water, roads and paths:** water with a double shoreline, streams, red dashed trails, stone walls as dotted lines, Quarry Hill Road, and the lot with its blue P.
- **Landmarks:** about a dozen, each with a small glyph: the trailhead kiosk, the hawk watch, the old mill, the schoolhouse foundation, the cellar holes, the old derrick, the powder house, the old farm and the flood gauge.
- **Climbing areas you know:** hatched, with walking time and grades. Areas you've visited are drawn more strongly. No boulders appear: those are for the world.
- **Where you are:** a "You are here" marker, and a dashed box showing what the world view shows now.
- **The sidebar:** a title cartouche ("Day use only · Gate closes at dusk"), a key, your areas by walking time, and, under the new rules while areas remain unknown, a hint that there's more climbing deeper in the woods.

Picking an area, in the map or in the list, moves the world's camera there.
Picking any other spot looks at that spot. Neither moves you or costs time.

The map uses the world's own shapes (`parkScene`'s zones, water, trails, streams,
walls and landmarks). It's built the first time it opens, in about 0.4 s in headless Chrome, as one
static SVG that costs nothing while closed. Only the areas, the "You are here" marker and the view
box are redrawn on each opening. Under the new rules, it shows only the areas
`K` says you know. Unknown areas' clearings are still drawn as open ground, unnamed.

## The world view

- **Minimum zoom 3.2** (`WORLD_MIN_ZOOM`, passed to the painter as `minZoom`).
  That's the closest zoom at which a whole area such as Hawkwatch fits on screen, with readable boulders
  and a well-drawn forest. Further out, the trees turn to confetti. The trail map
  is now how you see the whole park. The painter clamps every camera move to the floor, not
  only the wheel.
- **Buttons:** FIT is replaced by **MAP** (the trail map) and a **back to you** button (crosshair).
- **Each climbing day starts at The Tailgate**, the trailhead by the lot, with the camera on
  you. The area panel there lists your boulders and an **Other areas** list with
  walking times, since the lot's list of areas no longer opens each morning. Walks
  from The Tailgate are a minute shorter than from the lot used to be. A rest day is
  still offered until you walk or climb.
- An old mid-day save that's still at the lot (`loc.sector` null) shows the lot's area list as before.

## Checked

Headless Chrome only:
- Old-rules and new-rules climbers can open the map, pick an area (the camera moves; position and clock don't change) and come back to themselves.
- The wheel stops at zoom 3.2.
- The leak test now covers the trail map, and it's clean.
- Every other screen is unchanged apart from the Tailgate panel.
