# Phase 2, Stage 3: finding boulders, spotting lines, first ascents

Built 2026-11-24. Screenshots: `docs/screenshots/phase2-stage3/`.

**The new rules are now live** (`RULES2_LIVE = true` in `game.js`). Every new climber starts in a
Granite Hollow that has just reopened, and every old climber is converted when they next load.

## The first day

- **The trailhead kiosk** greets a new climber. It tells the reopening story and shows the old notebook page, handwritten on lined paper under glass: the four problems by the lot, who climbed them and when, and Dot's margin note on the Bishop's ascent ("with a stick!"). It ends with what to do (find boulders, look them over, climb something first and name it) and a button to open the trail map. It can be reread from The Tailgate's panel (**Read the kiosk**).
- **The Tailgate's panel** gives one gentle hint at a time:
  1. Start with the notebook's problems on The Billboard and Gus's Rock.
  2. Once you've climbed, a hint that other boulders aren't in any guidebook and are on the map without a name.
  3. After your first inspection, just a reminder that unnamed boulders on the map are ones you haven't looked at.

  There's never a count of what's left to find.

## Finding a boulder and spotting lines

- **An unfamiliar boulder** has no name or label on the map. Its hover card says "Unfamiliar boulder", with its height and angle. Clicking it walks you there (until Stage 4 brings walking), and the Here panel offers **Inspect**.
- **Inspecting** takes 5 minutes and is a small moment:
  - **A field note:** "New boulder: The Dumpster. You walk around it, chalk up a hold or two…", then what you can see.
  - **What's on the rock:** any problems already documented there, the unclimbed lines you spot, and, when there's more on the rock than you can read yet, a line saying so.
  - **The map:** the boulder's name is inked onto the map with a brief gold highlight.
  - **The panel:** newly spotted lines slide in one after another, marked *just spotted*.
  - **A toast:** "Found: The Dumpster · 3 unclimbed lines to try."
- **Spotting** uses `Mech.canSpot`: a fresh climber in average conditions sees everything up to *Hard*, including *Project*. Lines that would feel *Not yet* stay hidden.
- **Stronger eyes:** when you level up, the level-up card names the boulders you've looked over that now hold lines you couldn't see before. The area list marks them *worth another look*, and the boulder offers **Look it over** again.
- **Knowing you looked:** inspections are now recorded in what the player knows (`G.know.looked`: boulder → date), including inspections that found nothing you could climb. Migration counts boulders you'd tried lines on as looked over. `World.validate` checks the field and accepts saves without it.

## First ascents

- **The send:**
  - The banner reads **FIRST ASCENT!** with the boulder and grade.
  - The result card says "First ascent on The Dumpster, V1". The text calls it "the unclimbed juggy mantle" and says it's yours to name.
  - The suggested name isn't shown until you've chosen one.
- **The naming dialog** opens just after the banner:
  - It says what you climbed, its grade, and that it's your first ascent.
  - The name field starts with the curated name, selected, so typing replaces it.
  - **Name it** saves your name. **Keep "…"**, Esc, or closing keeps the suggestion.
  - A note appears as you type: a name needs a letter or number; `<` and `>` will be left out; or "There's already a Moonshine at Hawkwatch. That's allowed: real crags have plenty of duplicates."
  - Duplicates are checked only against problems you can see, so a hidden line's name never leaks.
- **Renaming:** your own first ascents can be renamed from their CragLog page (**Rename**, or **Use "…"** to go back to the suggestion). Nobody else's can.
- **The record:** `World.nameFa` is the only change the ledger allows to a written record. It sets or clears `name` on your own FA and never touches `by` or `date`. Choosing the curated name stores no name. Names pass through `World.cleanName` (emoji, accents and punctuation are fine).
- **Repeats of other people's problems:**
  - Your first send of one says whose first ascent it was and which ascent yours is: "Ranger Gus made the first ascent on Sep 5. Yours is the 3rd documented ascent."
  - For the notebook's problems, it says who the notebook credits.
- **Dialogs take turns:** a modal queue in `game.js` shows the naming dialog, then a level-up, then (if the day has ended) the day summary. The summary counts first ascents: "2 new sends, 1 first ascent".

## Your record

- **Logbook:**
  - *Your first ascents*: each with its boulder, date, flash, repeats and whether it has become a classic.
  - The heading line counts first ascents.
  - Ticks are marked *· FA*.
- **Climber tab:** a *first ascents* count.
- **Journal, Projects**, in three views:
  - **Attempted:** tried and not sent, with highpoints, as before.
  - **Open:** lines you've spotted, been told about, or read on the notebook page and haven't tried yet. Each shows whether it's unclimbed ("the first ascent is up for grabs") or whose first ascent it was, how you know about it, and how it feels today. It sorts by recently found, closest to sending, or unclimbed first.
  - **Sent:** projects you sent after more than one try.
- **Achievements** (new rules only):
  - *First Ascent*
  - *Developer* (10 FAs)
  - *Test Piece* (an FA of V6 or harder)
  - *Your Boulder* (every line on a boulder)
- **Leaderboard:** the *Since the reopening* board's *Everyone* table has an FAs column.

## Converting old climbers

- **On load:** a v1 save in this browser is converted on load, on a copy.
  - The old save is first kept in localStorage under `granite-hollow-save-before-reopening`.
  - If conversion fails for any reason, the climber keeps playing under the old rules and the error is reported on screen. Nothing is lost.
- **A welcome back** explains what changed:
  - Their sends are first ascents ("2 of your 3 sends are first ascents… the others are on the old notebook page").
  - Lines they'd tried are in the journal.
  - Other climbers have documented problems too.
  - Boulders they hadn't been to are unfamiliar again.
  - Their level, skills, ticks and projects are unchanged.
  - They stay on the *Before the reopening* board.
  - The old copy can be downloaded from the dialog or the Climber tab.
- **Old save files** (v1) convert the same way when loaded, to the same history, since conversion is seeded by the climber's id.
- **Development-mode save files** are refused outside development mode, because they can carry revealed knowledge.
- **The old rules in development mode:** the dev panel can still start climbers under the old rules, and those aren't converted. That's how the old screens are checked for regressions.

## Checked

In headless Chrome only (not yet in a real browser):
- **The leak test** (`scripts/browser/v2test.js`) now also reads the kiosk, the naming dialog, the welcome back and all three journal views. It's clean at the start, at an unfamiliar boulder, after an FA, a week later and after migrating.
- **Naming:** typing a name with an apostrophe, `<b>` and an emoji stores `Pickles' Revenge b 🍉`. An empty name can't be saved. Renaming back to the suggestion clears the stored name. All of it survives a reload.
- **Normal mode** (`scripts/browser/live.js`):
  - A new climber starts under the new rules with the kiosk.
  - An old climber in the browser is converted once, with the copy kept and offered.
  - A reload doesn't convert again.
  - A v1 save file converts to the same history.
  - A dev save file is refused.
- **The dialog order** (banner, naming, level-up, summary) was checked with a first ascent at dusk that also levels up.
- **The old rules' screens** (dev mode) match the pre-Phase-2 snapshot except for intended changes: Stage 2's area panel, the dev-mode note, and the relabelled *Attempted* and *Projects in progress*.
- `node scripts/test_world.js`: 26 tests, including naming, duplicates without leaks, *Open* lines, and stronger eyes.

## Left for later stages

- NPCs revealing harder lines, the Bishop's claims, and Local Buzz (Stage 5).
- Walking up to a boulder rather than clicking it (Stage 4).
- Tuning how many first ascents the player gets (Stage 5).
