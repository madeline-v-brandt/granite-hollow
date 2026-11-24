# Phase 2, Stage 1: walking performance

The question: can the illustrated SVG world follow a walking climber smoothly,
and which approach keeps the art as it is?

The benchmark is `site/prototype/walk.html`. A climber walks the trail from the lot, past
The Tailgate and Hawkwatch, to The Cellar Holes (about 1 km) at a relaxed 7 m/s
on screen, while the camera follows. It times every frame (the gap between
animation frames) for 8 seconds, in three ways, at zooms 4, 6 and 9:

- **Today:** the whole SVG world is re-transformed every frame (how the game
  pans now), and the climber is drawn inside the SVG.
- **Sliding layer:** the map is drawn 220 px larger than the view on every side
  and slid with a GPU transform. It's redrawn only when the slide runs out of
  margin, every few seconds. The climber is a small separate layer on top.
- **Sliding layer, climber in the SVG:** the same, but with the climber inside the map,
  so it could pass behind boulders. This measures what moving one thing inside the big SVG costs.

Tiles along the route are built first, so only the camera is being timed. Building
tiles for new ground is a separate cost: about 3 s for this route at three zooms,
spread over frames.

## Headless Chrome (software rendering), 2026-11-24

960×680 view. The table shows frames a second, the slowest 5% of frames, and the share of frames over 25 ms.

| Zoom | Today | Sliding layer | Layer, climber in the SVG |
|---|---|---|---|
| 1× pixels, zoom 4 | 54 fps · 33 ms · 12% | 60 · 17 ms · 0.2% | 60 · 17 ms · 0.2% |
| 1× pixels, zoom 6 | 59 · 17 ms · 2% | 60 · 17 ms · 0% | 60 · 17 ms · 0.2% |
| 1× pixels, zoom 9 | 60 · 17 ms · 0% | 60 · 17 ms · 0.2% | 60 · 17 ms · 0.2% |
| 2× pixels, zoom 4 | 52 · 33 ms · 15% | 60 · 17 ms · 0.4% | 60 · 17 ms · 0.6% |
| 2× pixels, zoom 6 | 58 · 17 ms · 3% | 59 · 17 ms · 0.6% | 60 · 17 ms · 0.2% |
| 2× pixels, zoom 9 | 55 · 17 ms · 0.2% (one 733 ms stall) | 60 · 17 ms · 0.2% | 60 · 17 ms · 0% |

What this shows so far:
- **Today's approach** is fine close in, but stutters at zoom 4.
- **The sliding layer** holds about 60 fps everywhere. Its only cost is one slow frame (33–66 ms) at each redraw, every few seconds of walking.
- **A climber inside the SVG** costs nothing measurable on top of the layer, so the climber can live in the map, with proper depth behind boulders. The always-on-top overlay isn't needed just for performance.

Headless Chrome doesn't show what a real GPU, a Retina screen or Safari will do.
That's the next step: the same page in a real browser.

## A real browser: Chrome 158 on the user's Mac, 2026-11-24

The view was 960×554 at 1.8× pixel density. Tiles along the walk took 5.2 s to build.

| Zoom | Today | Sliding layer | Layer, climber in the SVG |
|---|---|---|---|
| 4 | 35 fps · 34 ms · **70%** | 60 · 17.5 ms · 0.2% | **60 · 17.5 ms · 0.4%** |
| 6 | 16 fps · 49 ms · **55%** (one 8.3 s pause) | 29 · 17.7 ms · 1.7% (one 4.0 s pause) | **60 · 17.6 ms · 0.2%** |
| 9 | 40 fps · 34 ms · **50%** | 60 · 17.5 ms · 0.2% | **60 · 17.4 ms · 0%** |

(Each cell shows frames a second, the slowest 5% of frames, and the share of frames over 25 ms.)

On a real Retina Mac, redrawing the SVG every frame takes about 33 ms at every zoom, so
it runs at 30 frames a second or worse. That's a visible stutter, and it's
probably how dragging the map in today's game feels too. Headless Chrome hid
this: it only showed trouble at zoom 4. The sliding layer holds 60 frames a second at every zoom, and its redraw every few
seconds costs at most one 33 ms frame. The two multi-second pauses at zoom 6 are
single outliers, probably the tab briefly in the background, and need confirming.

## Decision

**Follow the climber with a sliding layer, and draw the climber inside the SVG.**

- The world is drawn a margin larger than the view (220 px here) and slid with a
  GPU transform. It's redrawn, as today, when the slide nears the margin's edge.
- The climber stays in the map's own layers, so they can pass behind boulders
  and under trees. That costs nothing measurable.
- The art stays exactly as it is. No image tiles or canvas rewrite are needed.

To do when this goes into the painter (Stage 4, or earlier for dragging):
- **Dragging:** the same slide can carry mouse and touch panning, which is probably slow in today's game.
- **Building tiles ahead:** build tiles ahead of the climber in idle time, so walking onto new ground doesn't stall.
  Building them takes seconds per route.
- **Redraw timing:** redraw when the slide nears the margin's edge, and if possible start it a little early, in idle time.
- **Labels and badges:** these are screen-space and are placed at each redraw. They slide with the map in between, which looked right.
