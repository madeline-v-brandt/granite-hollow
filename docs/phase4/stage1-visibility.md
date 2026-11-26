# Phase 4, Stage 1: finding people

Status: **built and reviewed (2026-11-26),** with the changes in "After the review" at the end. The plan is `stage0-review.md` §4, Stage 1: visibility only (portraits come with the dialogue box in Stage 2).

The goal: recognise someone on the map and think "Oh, that's Bea! I wonder what she's working on today", then go and find her.

## On the map

- **A name tag over everyone you've met:** first names ("Bea", "Gus", "Pickles"), small and inked like the map's labels.
  - They're the same size on screen on any device and at any zoom.
  - People you haven't met have no tag; you find out who they are by saying hello.
- **Hover over someone** (or tap them on a phone, which also walks you over) for a small card:
  - **Who they are:** "Rowan Ellery", or "Someone you haven't met".
  - **What they're up to**, in their own way, without naming a line or a place:

    | | On a project | Otherwise | When it's wet |
    |---|---|---|---|
    | Rowan | Working a project, sketchbook on the pad | Sketching the boulders between burns | Sketching in the rain |
    | Bea | Throwing for a project, over and over | Jumping for things | Practising dynos on a log while the rock dries |
    | Dez | Quietly working something hard | Climbing, quietly | Sitting under the trees, waiting it out |
    | Otis | On a project, in perfect sending weather | Climbing, cheerfully | Insisting it's nearly dry |
    | Hollis | Working a project, binder open on the pad | Climbing, and taking notes | Writing up notes under a tarp |
    | Gus | Trying a problem by the lot, between patrols | On patrol, more or less | Checking the trails after the rain |

    The Bishop is "Telling anyone who'll listen about 1977". Pickles is "Napping in the shade of his rock".
  - **How long they're around:** "Around until about 11 AM", or "Climbing with you until about 3 PM".
  - Whether you've talked today.
- **People come and go at their own hours** (the routines from Stage 0). Rowan is only around before work on weekdays; Bea turns up after school; Dez is gone by noon. Nobody stays past dusk.
  - They just appear and disappear: no notifications.
  - Your partner stays with you whatever the hour.

## Out today (the Here tab)

At the end of the Here tab, wherever you are, there's a list of the regulars you've met who are out today:

| When | What it says | Button |
|---|---|---|
| Around now | Where they are · until when · what they're up to | **Find**: walks you over, and you say hello when you get there |
| Not here yet | "at Gus's Rock, The Tailgate, from about 3:30 PM" | Later |
| Already gone | "Was out this morning, at …" | Gone |
| Pickles | "Napping by his rock, The Tailgate" | Find |

- **Where it says they are** depends on what you know:
  - a boulder you know by name ("at The Thermal Slab, Hawkwatch")
  - an area you know ("somewhere at Hawkwatch")
  - an area you don't know yet: only how locals describe it ("somewhere up the fern gully")
- **Find only appears** for people in areas you know.
- **People you haven't met are only counted:** "2 people you haven't met are out too. Look for them on the map."

## On the paper map (M)

- **The regulars you've met who are out now** are pencilled onto the trail map: a dot in their shirt colour, and their name in handwriting.
  - People close together share one label ("Hollis, Bea"). Labels keep clear of the map's printed names and "You are here".
- **The sidebar has an "Out now" list.**
- Picking a person or a dot moves the camera there, as picking an area does. It never moves you.
- **Only people in areas you know are shown,** so the paper map never gives away where an area is.

## Performance

- **Name tags** are one text element per person, inside the map. They only change when you zoom, or when someone comes or goes.
- **The cards** use the same tooltip as the boulders.
- **The paper map** draws its people once each time it's opened.
- **Walking:** 59 fps in headless Chrome, as before.

## Tests

- **`scripts/browser/phase4_stage1.js`** (new):
  - name tags on the people you've met, and none on someone you haven't
  - Pickles' tag
  - the hover card (who, what, until when)
  - Out today, without naming an area or a boulder you haven't found
  - Find walking you over to say hello
  - the paper map's dots and "Out now", never in an area you haven't found
  - someone not there before their hours and there after, with Out today saying "Later"
  - on a phone, a tap shows who someone is
- **`phase4_stage0.js`** now expects people only within their hours.
- **Every other suite passes,** with no page errors or leaks: `v2test`, `live`, `stage3`, `stage4`, `stage5`, `polish`, `walk_fixes`, `walk`, and the Node suites.
- **Seen only in headless Chrome,** at desktop and phone sizes.

## For review

1. **Name tags always on, for people you've met.** Or would you rather see names only on hover?
2. **People you haven't met** have no name and no card details beyond what they're doing. Is that the right amount of mystery?
3. **Comings and goings:** with their hours, fewer people are on the map at any one moment than before. Rowan is only around on weekday mornings and on Sundays and Mondays. Is that how it should feel?

## After the review (2026-11-26)

1. **Name tags only on hover.** A name shows over someone you've met while you hover over them, or for a moment after you tap them on a phone, along with their card. Otherwise the map is clear.
2. **People you haven't met** stay a mystery, as built.
3. **A busier park: longer hours.** On average 2.65 regulars are around between 9 and 6, against 2.27 before.

   | | Before | Now |
   |---|---|---|
   | Gus | 8–5 | 7:30 till the gate shuts (7 PM, or dusk) |
   | Hollis | 10–5 | 9–6 |
   | Otis | 9–6 | 8:30–7 |
   | Rowan, Sunday and Monday | 9–6 | 8:30–7 |
   | Rowan, other days | 7–11 | Wednesday and Friday 7–1; Tuesday, Thursday and Saturday 1–7:30 (a half-day shift) |
   | Bea, weekends / summer | 9:30–7 / 10–7 | 9–7:30 / 9:30–7:30 |
   | Bea, after school | 3:30 on | 3 on |
   | Dez, weekdays / weekends | 6–noon / 7–6 | 6–1:30 / 6:30–6:30 |
   | The Bishop, on his days | 10–3:30 | 9:30–4:30 |

   Nobody stays past dusk, so in winter the evenings are short. Their hours are read from the routine each time (not from the saved session), so a change like this applies straight away.

   **Tests:**
   - `phase4_stage1.js` now checks that tags are hidden until you hover, and that a tap shows one.
   - Every suite passes, with no page errors or leaks.
   - Walking runs at 59 fps.
