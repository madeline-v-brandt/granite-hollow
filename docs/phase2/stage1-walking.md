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

## Real browsers

(To come: the numbers from the browsers the game is played in.)
