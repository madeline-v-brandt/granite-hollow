# Phase 4, Stage 2: conversations, portraits and voices

Status: **built and reviewed (2026-11-26):** the portraits were approved as drawn. The plan is `stage0-review.md` §3.3 and §3.5, and §4's Stage 2: dialogue, portraits and reply choices.

## Talking to someone

**Walking up to a regular** (or clicking them, which walks you over) opens a box over the bottom of the map:
- their portrait on the left
- their name, who they are, and how well you know each other
- what they're saying, one beat at a time ("Next ▸")
- then your replies

| Reply | When it's offered | What happens |
|---|---|---|
| **What are you working on?** | Always | Their project, in their words |
| **I'm working on …** | You have a project (tried 3+ times this week) | They react: encouragement, or what they remember from climbing it themselves. They remember you told them. |
| **Climb together?** | As in Phase 3 | As in Phase 3 |
| **Any tips for …?** | They saw you working a project here | Their beta, as before |
| **Know any other good spots?** | As before | The way to an area you haven't found: a little map on the back of a receipt, then **Walk to …** |
| **Seen any lines I'd miss?** | As before | A line you hadn't noticed, then **Go and look** |
| **What should I try?** | As before | Their recommendation, then **Add it to my list**. You only learn the line's name if you ask. |
| **Sit and chat · 20 min** | Once a day each | A story, and the same rest as before |
| **Bye!** | Always | Their goodbye; then it closes |

**Pickles** has his own: **Pet him**, **Throw his stick**, **Leave him to his nap**. Petting counts toward him adopting you, as before.

**Strangers** use the same box, with a portrait drawn for them from their name. They offer a recommendation and beta, as before.

**Controls:**
- **Number keys** 1–9 pick a reply. **Enter** or **Space** goes on. **Esc** or **×** leaves.
- **Walking away** ends the conversation.
- **Clicking someone you've already talked to today** talks again: a short "back already?" and whatever replies are left.

## Portraits (`portraits.js`)

The portraits are SVG, drawn from the same colours and clothes as the figures on the map, inked like the map. Each regular has their own face and something that's theirs:

| | What's theirs |
|---|---|
| Gus | Ranger cap with a badge, grey sideburns, moustache, a star on the shirt |
| Hollis | Bucket hat, round glasses, collared shirt |
| Otis | Gold headband, a little stubble |
| Rowan | Tousled hair, a pencil behind the ear |
| Bea | High ponytail, hair clip, striped shirt |
| Dez | Beanie, a small gold earring |
| The Bishop | White tufts, a big white beard, bushy eyebrows, a striped flannel shirt |

**Expressions:**
- Six for everyone: neutral, happy, excited, thoughtful, frustrated, embarrassed. Every line chooses its own, so a face changes as the conversation goes.
- **Pickles** has the six plus sleepy, with a head tilt when thoughtful and his ears up when excited.
- **Strangers** get a look drawn from a seed: skin, hair, shirt, sometimes a hat. It's the same every time you meet them.

**Review page:** every character in every expression, in light and dark, plus a sample box, at `site/prototype/portraits.html`. It's on GitHub Pages at `prototype/portraits.html` once pushed.

## What they say (`talk.js`)

**Lines are data:** each regular has about 50, sorted into:
- **first:** first meeting
- **hello**, and short **nods** for when they've used all their hellos on you lately
- **today:** their session
- **theirs:** their projects and first ascents
- **mine:** about you
- **others:** another regular's news
- **ask, tell, story, bye, again**

**Each line has a condition,** so it's only said when it's true. It draws on:
- **Their day** (Stage 0's sessions):
  - "I've been on Andirons (V4) for two weeks now. Fell off the top again. I blame the boots. The boots are from 1994."
  - "I stuck the dyno on Rocket Science again this morning. Then I tried a slab for forty minutes and got absolutely nowhere. Slab is fake."
- **Their finished projects and first ascents:** "You might have seen: I made a first ascent. … After all these years of writing down everyone else's."
- **You:**
  - your sends from the last three days
  - your first ascents
  - a new hardest grade
  - your sends together
  - **what you told them about your project**: a few days later they ask "How's … going?", or congratulate you once you've sent it
- **Other regulars' news:** "For the record: Bea sent …, after three weeks. I have it on good authority. Mine."
- **The weather, the season, the time of day:**
  - Bea after school on a weekday
  - Rowan straight from the library
  - Otis being cheerful about rain

**Their voices:**
- **Gus:** the ranger, gently dad-ish, always about Pickles and the gate.
- **Hollis:** the binder, footnotes and disputed grades.
- **Otis:** everything is perfect sending weather, and there are always sandwiches.
- **Rowan:** quiet and observant, sees things as drawings.
- **Bea:** seventeen, in capitals, jumping for everything.
- **Dez:** a few words, each one meant.
- **The Bishop:** his claims about '77 are as unreliable as ever.

**Fixed along the way:**
- Hollis's "I've never made a first ascent" story only plays while that's true. Once Hollis has one, there's a story about the page in the binder instead.

**Repeats:**
- **Nobody says the same line to you within 12 days,** or a story within 45, while they have anything else to say. What each regular has said, and when, is kept in `G.social` (`said`).
- **The opening is a hello plus news you haven't heard from them.** When they've no fresh news, it's just the hello.

**Rules every line keeps** (tested):
- **Places and lines:** a line names a problem, boulder or area only if it's in your guidebook. Otherwise it describes it ("a slopey squeeze on The Haybale", "a crimpy roof up on the ridge").
- **Pronouns:** no gendered pronoun in any line about Rowan or the player. Your name is used, and lines that need it are skipped if your climber is called "you".
- **Names:** other regulars are only named once they've arrived at the Hollow.

## Not changed yet

- **Beta** is still Phase 3's: one tip per line, from anyone. Stage 3 makes it per person and gives it its own replies.
- **Friendship** is recorded but only shown as words under the name ("You know each other", "Friends"). Stage 4 decides what it unlocks.
- **No romance lines yet** (Stage 6). Rowan is warm, nothing more.

## Tests

- **`node scripts/test_talk.js`** (new, 9 tests). Every line, against four saves (12, 40, 70 and 220 days in, one of them a climber called "you"), checking that:
  - it renders, with no undefined and a sensible length
  - nothing names an unknown area, boulder or line
  - there are no gendered pronouns about Rowan or the player
  - news is grounded in the save
  - an opening is a hello plus news, with few repeats over ten days
  - every reply works
  - Hollis's first-ascent story is right
  - every portrait is valid SVG, and strangers differ but stay stable
- **`--show`** prints a sample conversation for everyone.
- **`scripts/browser/phase4_stage2.js`** (new), covering:
  - the box and portrait
  - clicking through
  - replies by number key
  - goodbye and closing
  - lines remembered
  - talking again
  - Esc
  - walking away
  - no leaks
  - Pickles' replies
  - the phone layout (the box fits the map, and nothing scrolls sideways)
- **Older tests** click through conversations with a new helper (`talkThrough` in `scripts/browser/lib.js`).
- **Every suite passes,** with no page errors or leaks: `v2test`, `live`, `stage3`, `stage4`, `stage5`, `polish`, `walk_fixes`, `walk`, `phase4_stage0`, `phase4_stage1`, and the Node suites.
- **Walking:** 59 fps.
- **Seen only in headless Chrome.**

## For review

1. **The portraits:** do they look like the characters you imagine? Are any expressions off?
2. **The voices:** run `node scripts/test_talk.js --show` for a sample, or just walk up to people. Who sounds right, and who doesn't yet?
3. **Clicking through:** the opening is one or two beats, then the replies. Too many clicks, or about right?
