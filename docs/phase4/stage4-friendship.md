# Phase 4, Stage 4: friendship

Status: **built and reviewed (2026-11-26),** with the pace sped up after the review (see "After the review" at the end). The plan is `stage0-review.md` §3.2 and §4's Stage 4: tiers, unlocks, invitations, remembering.

Since Stage 0 the game has recorded what you do with each regular. Stage 4 makes those friendships show: they deepen over many climbing days, the regulars notice, and closer friends say and do more.

## How a friendship grows

Friendship is worked out from what you've done together, each kind counted at most once a day, so it can't be farmed. It's shown only in words, never as a number:

| Tier | Words | Roughly (a sociable player) |
|---|---|---|
| 1 | You've met | The first hello |
| 2 | You know each other | Within a week of climbing days |
| 3 | Friends | A first friend in about three weeks (14 climbing days) |
| 4 | Good friends | A first good friend in about two months (40 climbing days) |

What counts, from most to least:
- Climbing together, and sends together
- Taking a friend up on an invitation, sitting and chatting, and being taught something
- Saying hello, beta they gave you, and petting Pickles

**Each of them especially values something,** which counts extra with them and nothing with anyone else:

| | What they value |
|---|---|
| Gus | You looking after the park: brushing a line while he's out (and the lessons he teaches) |
| Hollis | A first ascent of yours while Hollis is out, for the binder (and being asked for beta) |
| Otis | Company on a wet or greasy day. Perfect sending weather, apparently. |
| Bea | Trying dynos near her (and sending with her) |
| Dez | Trying hard: a line above your level, near Dez |
| Rowan | The quiet days: sitting and talking when hardly anyone's about (and talking in general) |

You find out what each one values once you know each other: it's written under their name in Your people.

**It never goes down.** After a long gap they're just glad to see you. A save from before this stage keeps every friendship it had reached.

## When a friendship deepens

- **You're told:** a toast, "You and Gus are friends now", and a line in your journal.
- **They say so,** once, there and then if it happened while you were talking, or the next time you see them:
  - Gus: "You know, Pickles has decided you're all right. And between you and me, so have I."
  - Hollis: "I've moved you from “acquaintances” to “friends” in the index. It's a very exclusive section. Otis is in it."
  - Otis: "We're friends now, you know. Climbing friends. Sandwich friends. The best kind."
  - Rowan: "I'm really glad you keep coming up here. It's better with you around."
  - Bea: "We're friends now! Climbing friends! I'm going to text you dynos. I don't have your number. I'll text them in my head."
  - Dez: "…Glad you're around. Saying it once."
  - The Bishop, as good friends: "Dot would have liked you. That's the highest thing I can say about anybody."

## What opens up

- **Stories only friends hear.** Each regular has two for friends and one for good friends:
  - Gus's first day as ranger in 1985, and the twenty years of letters to the county that got the park reopened
  - why Hollis keeps the binder (a grandmother who climbed here in the sixties and never wrote anything down)
  - Otis's old partner Lenny, and why every day is "perfect"
  - why Rowan started drawing
  - Bea picking colleges by their bouldering
  - Dez's night shifts and the early mornings
  - For good friends: a gift or a confidence (Hollis gives you your own tab in the binder; Rowan, a charcoal drawing of the two of you).
- **Remembering.** Friends bring up a send you made together weeks ago ("I found the drawing from the day you sent …"). Everyone notices:
  - your level-ups ("V7 now, I hear! The whole lot's talking about it. Well. Pickles is.")
  - a hard first ascent ("A V6 first ascent! In my park! I'm going to have to make a little sign.")
  - a long gap ("Well, look who it is! Thought you'd found another park.")
  - from Stage 2, the project you told them about, sent or not
- **Invitations.** Some mornings a friend who's out that day leaves a note under your windscreen wiper:
  - "PERFECT SENDING WEATHER AT MILLRACE CAVES TODAY. Bring nothing. I have sandwiches. —Otis"
  - "If you're about, I'm trying a problem at The Tailgate today. Need a spotter. Pickles is useless. —Gus"
  - "Session at Millrace Caves, from about 1 PM. Coffee's on me. —Dez"

  How they work:
  - **Who:** friends and good friends who are out that day, in an area you know.
  - **How often:** at most one note a day, and never from the same person two days running.
  - **Where it shows:** in the day's opening text, and at the top of Out today, in handwriting, with Find.
  - **When you go:** they greet you for coming, and climbing together lasts the rest of their session.
  - **If you don't go,** nothing happens.
- **Your people** (the Climber tab) lists everyone you've met, closest first, with:
  - their portrait
  - how close you are
  - since when
  - what you've shared ("climbed together on 4 days · 3 sends together · 2 long chats")
  - once you know each other, what they especially value

## What's unchanged

- **No XP for company.** Climbing alone loses nothing.
- **Friends' benefits stay small:**
  - good vibes with a partner (Phase 3)
  - fuller beta from friends (Stage 3)
  - the invitations
- **Bea is a friend, and only ever a friend.**
- **Rowan's friendship lines are warm, not romantic.** Romance is Stage 6, and the friendship path stands on its own.
- **No gendered pronouns** for Rowan or your climber anywhere in the new lines (tested).

## Tuning

`node scripts/tune_friends.js` simulates two kinds of player through 240 climbing days in a crag that develops around them:
- **Sociable:** talks to most regulars who are out.
- **Casual:** talks to some.

The output is in `stage4-friends-output.txt`.

| Climbing day the first friendship reaches each tier (median) | Know each other | Friends | Good friends |
|---|---|---|---|
| Sociable | 6 | 14 | 40 |
| Casual | 15 | 53 | 140 |

**Who comes first:** a sociable player is soonest friends with Gus and Rowan (around day 21). Dez takes longest (around day 44), being out mostly in the early mornings.

**Thresholds:** know each other 8, friends 22, good friends 55. Two days in three is how often the simulated players climb, so 14 climbing days is about three weeks and 40 about two months.

## Saves

All the new fields are optional and cleaned on load:
- in the social record: `best` (the tier a friendship had reached before the retuning) and `up` (a deepening they haven't mentioned yet)
- `G.day.invite` (today's note) and `G.lastInvite`
- `G.lvlOn` (the day you reached each level, so people can congratulate you)

## Fixed along the way

- **Conversations save straight away.** One opened by clicking someone you're already standing next to, or by walking into them with the keys, used to save only at your next action.

## Tests

- **`node scripts/test_social.js`** (6 new):
  - what each regular values
  - deepening step by step, told once
  - no farming
  - old saves keep their friendships
  - what you've shared
  - bad records dropped
- **`node scripts/test_talk.js`** (1 new): every regular's deepening, long-gap, level-up, story and note lines render, with no gendered pronouns; an opening after a deepening says so once.
- **`scripts/browser/phase4_stage4.js`** (new), covering:
  - a long gap
  - a chat that makes you friends (toast, journal and their line)
  - the box's subtitle
  - Your people
  - a note in the Here tab, their greeting and the session after it
  - notes arriving by themselves
  - an old save's friendships
  - a bad note in a save file
  - fitting the window, and the phone layout
- **Every other suite passes,** with no page errors or leaks.
- **Seen only in headless Chrome.**

## For review

1. **The pace:** a first friend after about three weeks and a first good friend after about two months, for someone sociable.
2. **What each of them values:** do those fit the characters? (Gus brushing, Hollis first ascents, Otis bad weather, Bea dynos, Dez trying hard, Rowan quiet days.)
3. **Notes on the windscreen:** is that the right way for friends to invite you, and about the right number?

## After the review (2026-11-26)

1. **Quicker friendships:** a first friend in about three weeks and a first good friend in about two months.
   - The thresholds went from 10, 35 and 100 (built) to **8, 22 and 55**.
   - A sociable player now has a first friend around climbing day 14 and a first good friend around day 40; a casual player around days 53 and 140.
   - These are all a little below Stages 0–3's first guess (8, 25 and 60), so no save loses a tier. The safeguard that keeps old saves' friendships stays in, just in case.
2. **What each of them values:** approved as built.
3. **The notes on your windscreen:** approved as built.
