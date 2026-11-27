# Phase 4, Stage 8: polish and play-testing the social world

Status: **built and reviewed (2026-11-27): approved as built. Phase 4 is complete.** This was the last stage of Phase 4. The brief asked for an evaluation of the whole social game against twelve questions, keeping it cozy and low-pressure. Each question below has what I measured, what I found, and what I changed.

## How it was play-tested

1. **A year of the social game, in Node** (`node scripts/playtest_social.js`).
   - **Who plays:** simulated players climb a full year (365 climbing days) in a crag that develops around them. The script uses the real `world.js`, `knowledge.js`, `social.js` and `talk.js`.
   - **What they do:** every climbing day they walk up to whoever's out and hear what they say. They ask what people are working on, mention their own project, and sometimes sit and chat. They pet Pickles, turn up to the events, and the keen ones flirt with Rowan.
   - **Two kinds of player:** *sociable* talks to almost everyone every day (about 790 conversations a year, a stress test), and *casual* about half as much.
   - **What it reports:** how much of what's said is new, how often something repeats too soon, how often a conversation is about you, the pace of friendships, Pickles and Rowan, and which lines nobody ever hears. Output: `stage8-playtest-output.txt`.
2. **Old saves, made by the old builds themselves.**
   - **Built for the test:** I extracted the committed game from the end of Phase 3 and from Stages 2, 4, 5 and 6.
   - **Their own saves:** I ran each build's own browser test against it and kept the save it left behind.
   - **Saves from your Downloads** (read locally, never copied into the project): two of your real saves, one from the original rules and one from Phase 2. Each went through **every** build in turn, as a player who updated after each stage would, playing a day in each and talking to whoever was out.
3. **A busy day in the browser** (`scripts/browser/phase4_stage8.js`). A late-game climber on comp day:
   - every regular and the Bishop out
   - Pickles yours and following
   - Rowan climbing beside you as your partner

   It measures walking and conversations, then checks every social screen at phone width (390 px).

## The twelve questions

| # | The brief asked | What I found | Changed |
|---|---|---|---|
| 1 | Are NPCs easy to recognize and find? | Yes. Name tags on hover, the hover or tap card, Out today with Find, and the trail map (Stage 1) all work with everyone out on comp day. | — |
| 2 | Does dialogue feel varied and specific? | **Not for a chatty player.** A sociable player heard 17% of lines again inside the 12-day no-repeat window. Almost all of those were the answers to "What are you working on?" (67% repeats) and "I'm working on …" (57%), plus the goodbye that ends every conversation. Each regular had one line per situation. | Yes: **More lines** (below) |
| 3 | Do NPCs remember relevant events? | Mostly. Your sends, first ascents, levels, comps, your project, days you climbed together, beta that worked, a long absence: about 60% of conversations are about something you did or share. **But nobody mentioned a bonfire, dusk session or Trail Day you'd been to.** | Yes: **Remembering gatherings** |
| 4 | Is beta useful but balanced? | See **Balance** below. | — |
| 5 | Do relationships progress at a satisfying pace? | On the targets you approved: a sociable player's first friend on climbing day 14, first good friend day 40; Rowan, together in about 7 weeks (keen) or 5 months (relaxed); Pickles yours around climbing day 18 if you pet him most days, 36 if casually. | — |
| 6 | Do friendship and romance feel natural, not mechanical? | One mechanical thing: **windscreen notes.** Once you have several good friends, each rolled separately for a note, so one came about three mornings in four, and they stopped feeling special. | Yes: **Fewer windscreen notes** |
| 7 | Does Pickles behave consistently? | Yes. He's where he's drawn in every mode, keeps up when you walk (58 fps), comes to the comp, and survives every old save. | — |
| 8 | Are events interesting without being distracting? | **The poster nagged a little.** Every morning for a week before each event, the day began "Gus has put up a poster at the kiosk…", as if it were new each day. | Yes: **The poster, once** |
| 9 | Do NPC movement and portraits affect performance? | No. On comp day, with everyone out, Pickles following and a partner, walking runs at 56–58 fps (59 on an empty day). The short freezes while walking (50–90 ms) are map tiles being drawn as you walk into new ground: they're the same on an empty day. Conversations open with no freeze over 200 ms. | — |
| 10 | Does everything work on desktop and a phone? | Two phone problems. **The conversation box could open below the bottom of the screen** (the page scrolls on a phone, and the box covers the map's lower half). **The box's × was 27×30 px**, small to tap. Everything else fits at 390 px: the Here tab with the comp, Out today, Your people and ribbons, Local Buzz, the podium, the summary. | Yes: **The phone** |
| 11 | Do existing saves migrate correctly? | Yes. Both of your saves went through all six builds with no errors and nothing lost: ticks, first ascents, XP, every social moment, friendships, Pickles, the romance. So did the saves each old build's tests made, loaded straight into this one. | — |
| 12 | Is it deterministic, and compatible with the crag simulation? | Yes. The crag's whole history (first ascents, arrivals, the regulars' lives, the news) is identical with and without the social game. The same player plays out identically twice, and the comp's field doesn't depend on anything social. | — |

One more thing turned up while answering 2 and 3: **the regulars were never just climbing.** Everyone but Dez started their next project the day they finished the last, so every session was on a project. The "did a lap of the warm-ups" lines were never heard in six simulated years, and Gus had a "nearly had it" day in about half his sessions. That's fixed: see **The regulars' days off-project**.

## What changed

### More lines

**"What are you working on?"** Each regular now has eight or nine answers, depending on where their project actually stands:
- **Asked again** about the same project: "still". Hollis: *"…as of my last entry. And the one before that. The notes are getting repetitive."*
- **Close:** Gus: *"I'm close. Don't say it out loud, it'll hear you."*
- **Just started:** Otis: *"Love at first sight. I've already eaten a sandwich under it."*
- **Weeks in:** Bea: *"My mom says I talk about it in my sleep."*
- **Just finished one:** Dez: *"Nothing. Did ___. Looking for the next one."*
- **The same line as yours** (rare, so it's special): Otis: *"We're project twins! I'll bring two sandwiches."*

**"I'm working on …"** Each regular now has seven answers:
- **Still at it,** after you've told them before: Bea: *"You're SO stubborn. I respect it."*
- **A long campaign** (20+ goes): Rowan: *"I like watching people not give up."*
- **The same line as theirs:** Gus: *"Whoever gets it first buys the coffee. I'm going to lose."*
- **Did their beta help?** Hollis: *"Be honest. I'll note your answer."*

**Goodbyes:** each regular now has six to ten, depending on:
- the time of day, the weather, a prime day
- your project
- Pickles being with you
- your name, once you're friends

When every goodbye has been said in the last 12 days, they **wave you off** instead, in their own way ("Otis waves with a sandwich.", "Dez lifts a hand. That's a wave, from Dez."). A goodbye ends every conversation, so with 120+ conversations a year with the same person, the spoken ones would otherwise come round every few days.

**The Bishop** has three more stories (he had three):
- Gerald the mule, "the better climber"
- coming up the week after the 1987 closure to tell the Billboard he'd be back ("It took thirty-eight years.")
- the boulder under the drowned valley

**After:**

| | Sociable player | Casual player |
|---|---|---|
| Repeats inside the no-repeat window | 17% → 5% | 7% → 2% |
| "What are you working on?" answers repeated | 67% → 17% | |
| "I'm working on …" answers repeated | 57% → 3% | |
| Goodbyes repeated | 35% → 0% (waves instead) | |

As before, every new line is checked for gendered pronouns where Rowan or the player is mentioned. Rowan's lines have none at all, not even about Pickles.

### Remembering gatherings

In the week after a **Solstice Bonfire** or **Midsummer Dusk Session** you were at, or a **Trail Day** you helped on, each regular (they were all there) says something about it, once:
- Gus: *"Pickles still smells of smoke. So do I, to be fair."*
- Rowan: *"I drew the bonfire. Everyone's in it. You're the one nearest the fire, holding the cocoa."*
- Bea: *"I did a problem by headlamp! It was V2 but it was in the DARK."*
- Hollis, after Trail Day: *"I've put the new path on my map. In pen. That's how sure I am."*

The comps already had this.

### Fewer windscreen notes

Now:
- **One friend** might leave a note each morning, rather than each of them rolling separately.
- **Never two mornings running.**
- **The chances are unchanged:** 18% for a friend, 30% for a good friend, more for Rowan.
- **Rowan's sunset note** is unaffected: it still always comes on a day Rowan's ready to ask.

With several good friends that's a note once or twice a week, instead of most mornings.

### The poster, once

The day's opening mentions the poster **the first morning you see it** ("Gus has put up a poster at the kiosk: …"), and **the day before** ("Tomorrow: The Granite Hollow Bouldering Comp. Somebody has added a drawing of Pickles to the poster at the kiosk."). In between, the gold forecast card and the Here tab's "Coming up" card are still there.

### The phone

- **The conversation box scrolls itself into view** when a conversation starts on a narrow screen, if it's partly off the screen.
- **The × is 36×36 px.**

### The regulars' days off-project

After finishing a project (or giving up on one), a regular now spends **five days just climbing** before picking the next one. Those sessions are warm-ups and mileage:
- Gus "did a lap of the warm-ups, strictly for inspection purposes"
- Rowan "mostly sketched"

That's now 10–25% of each regular's sessions; Dez's are about the same as before.

It uses no new random draws, so it only changes days a save hasn't simulated yet. The crag's development pace is unchanged (`tune_crag.js`, within about 1% everywhere).

## Balance

Beta and the off-project days together, from `node scripts/balance_game.js` (with beta, the default) and `--nobeta`:

Climbing day each level is reached (medians of 40 simulated climbers per style):

| Style | V9 with beta | V9 without | V13 with beta | V13 without | Tips per climber (a better way through) |
|---|---|---|---|---|---|
| Steady | 53 | 53 | 168 | 171 | 111 (12) |
| Projector | 55 | 55 | 147 | 147 | 96 (13) |
| Mileage | 40 | 41 | 121 | 120 | 82 (4) |
| Explorer | 35 | 34 | 118 | 117 | 79 (7) |

**Beta is useful but not a shortcut.** A simulated keen climber gets about 80–110 tips a year, and a handful of them are a better way through for their body. That moves V13 at most three days earlier, for steady climbers, and makes no difference for the other styles. Asking around is worth doing, and it isn't the way to optimize. Steady climbers stay on the agreed pace (V9 by day 55, V11 by day 100).

## Saves

- **One new optional field:** `G.poster`, the date of the event whose poster you've seen. It's cleaned on load: dropped unless it's an event's day.
- **Nothing else** in a save changes.
- **The regulars' new off-project days** apply only to days not yet simulated.
- **Tested** with your real saves (local only) through every build, and with saves made by the Stage 4, 5 and 6 builds. Those three are now fixtures in `scripts/browser/fixtures/` (test climbers, nothing personal).

## Tests

- **`node scripts/playtest_social.js`** (new; `--n`, `--days`, `--lines` lists lines nobody heard): the year-long play-test above, with the determinism checks.
- **`node scripts/test_talk.js`** (1 new):
  - "still" when asked again
  - the same project as yours
  - goodbyes: no repeats in a day, then waves
  - gatherings remembered for a week, only if you were there (and helped, for Trail Day)
  - no pronouns in any of Rowan's
- **`scripts/browser/phase4_stage8.js`** (new):
  - **Old saves:** the old-rules fixture and the Stage 4, 5 and 6 saves load, keep every moment and the romance, and play on to the next day.
  - **The poster:** shown on the first morning, not the next, then the day before.
  - **Notes:** never two mornings running.
  - **Comp day:** everyone out with Pickles yours, Rowan as partner, the frame rate walking, no long freezes talking.
  - **On a phone:** the Here tab, a conversation (started with the page scrolled to the top, every reply on screen), the Climber page, Local Buzz, the podium and the summary. Nothing off the side, and no buttons too small to tap.
- **Fixed along the way:** the Stage 4 browser test started a friendship one point short of "friends", so it passed only when the regular it happened to find had a bonus for something that day. The off-project days changed who it finds, which showed it up. It now starts at the right number.
- **Every other suite passes,** with no page errors or leaks. Walking runs at 59 fps, and at 58 fps with Pickles.
- **Seen only in headless Chrome.** This stage especially needs a real play-test, on a real phone too.

## What I didn't change, and why

- **Lines the play-test never heard.** Most are rare by design or need things the simulated players don't do: wet, cold or hot days, level-ups, comp results, beta that worked. The "same project as you" lines are rare because your projects and theirs seldom coincide. That's fine: it makes it special when it happens.
- **Gus is "nearly there" on his projects a lot.** He's the weakest climber of the regulars, and his projects take weeks. With the off-project days it's down a little, and it's in character.
- **Stories still repeat** for someone who sits and chats with the same person nearly every day (about 6% of chats), after 45 days. Adding more is easy if it bothers you in play.

## For review

1. **Windscreen notes:** once or twice a week (not most mornings) with several good friends. Right?
2. **Goodbyes that turn into waves** when every spoken one's been used lately. Does that read well?
3. **The regulars' days off-project** (five days after each project). Too many, too few?
4. **Anything you've noticed playing** that should be fixed before Phase 4 is done.

## Reviewed (2026-11-27)

Approved as built: windscreen notes once or twice a week, goodbyes that turn into waves, and five days off-project. **Phase 4 is complete.** Further changes come from the user's notes while playing.
