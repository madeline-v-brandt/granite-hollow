# Phase 4, Stage 6: Rowan

Status: **built and reviewed (2026-11-27):** see "After the review" at the end. The plan is the Phase 4 brief's romance stage, with the decisions in `stage0-review.md` §5:
- Rowan's pronouns are never used, and nor are yours.
- The romance is open to every climber.
- Bea is only ever a friend.
- No XP for company.

Rowan is the regular who sketches between burns. You could already become good friends. Now, if you want to, something more can grow slowly out of that friendship: a little flirting, then being sweet on each other, then one evening a sunset.

## Only if you want it

Nothing romantic happens unless you choose it:
- **The one way in:** something playful you say to Rowan. Once you know each other, a conversation with Rowan offers one playful line among the usual replies. It's at most one a day, and only with Rowan.
- **If you never pick it,** the friendship path is exactly as before, including the good-friends charcoal drawing.
- **If you stop,** it cools: after a month without flirting, Rowan's lines go back to friendship. Pick it up again whenever you like, and it carries on from where it was.
- **At the sunset you can just watch it.** Do that twice and it settles into friendship: Rowan tells you "I'm really glad we're friends. I mean that," and stops asking. After a month you could start again from the beginning.

## How it grows

It's shown only in words, never as a number. Your people (the Climber tab) puts a pink label next to Rowan's friendship one.

| | When | What changes |
|---|---|---|
| **A little flirting** | Your first playful line | Rowan's a bit flustered, and amused. ("What? No. It's the boulder. You're… in the corner. For scale.") |
| **Sweet on each other** | 4 days of flirting, once you're friends | You're told: "You're fairly sure Rowan's been hanging around your projects on purpose." Rowan flirts back: some hellos are new ("Oh, it's you. Good. I mean, hi. I'd hoped it would be you."), and Rowan's notes are warmer. Your playful lines get warmer answers too. |
| **The sunset** | 10 days of flirting, 5 days climbing together, and five weeks since the first | Late on a dry day when Rowan's out until dusk, Rowan asks you to stay for the sunset. On those days Rowan's windscreen note says so ("Stay for the sunset? I know a spot. —R."). If Rowan's climbing with you, Rowan asks as the light starts to go. |
| **Together** | You tell Rowan how you feel at the sunset | It's for good. |

**How long it takes** (`node scripts/tune_romance.js`; output in `stage6-romance-output.txt`):
- **Keen** (finds Rowan on most days Rowan's out, flirts, and climbs together now and then): sweet on each other in about 3 weeks, together in about 7.
- **Relaxed:** sweet on each other in about 7 weeks, together in about 5 months.

Seven weeks is a little sooner than a first good friend (about two months), for someone who's going out of their way.

## The sunset

It's a scene of its own: a small illustration of the two of you from behind, on a boulder above the trees, with the whole valley going pink, then gold, then orange. You get two choices:
- **Tell Rowan how you feel:**
  - Rowan goes very quiet, then laughs, and bumps your shoulder: "I was hoping you'd say that. I've been hoping for weeks. Did you not notice? I drew you into every boulder."
  - A few small hearts rise from the two of you, and the scene goes pink.
  - Then "Walk out together", and the day ends: "You watched the sunset with Rowan from the top of a boulder above the trees, and walked out together by headlamp."
- **Just watch the sunset:**
  - "Neither of you says much. It's nice, sitting up here."
  - Rowan asks again in a fortnight or so. The second time you just watch it, you're friends (above).

"Not tonight" in the conversation is fine too: "Another time, then. The sun's not going anywhere. Well. It is. But it'll be back."

## Together

- **Rowan's hellos:**
  - "Hi, you."
  - "Good morning. The light's lovely. You're lovely. I'm going to go back to drawing now."
  - after a week away, "I've got a whole week of drawings to show you. Most of them are rocks. Some of them aren't."
  - the day after the sunset ("Gus asked if I'd hurt my face")
  - a month after it, and a year after it
- **Small affectionate things** take the place of flirting:
  - Give Rowan a hug ("chalk and all. You both come away with handprints.")
  - "I missed you."
  - Steal Rowan's pencil
  - Sit with Rowan for a bit
  - "Can I see what you drew today?"
  - "I'll spot you on your project."
  - "I'm so proud of you."
- **Climbing together:** Rowan says yes with "Always. I'll bring the sketchbook, and the good sandwiches."
  - When you top out: "Rowan runs over and hugs you, chalk everywhere."
  - A small heart rises from Rowan in the climbing scene.
  - At the end of the day, Rowan walks you to your car.
- **Notes on your windscreen** come a bit more often: "I'll bring the good sandwiches. —R".
- **Your people:** "♥ Together", and since when. Out today has a small heart by Rowan's name.

## Rowan's own life

Rowan isn't there only to admire you:
- **Rowan's own climbing carries on:** routine, projects, slow progression.
- **Encouragement goes both ways:**
  - "Fell off a slopey slab on Gus's Rock again. Tell me something nice, and then I'll try it once more."
  - When Rowan sends: "I did it! … I wanted you to be the first to know. Well, second. Pickles was there."
- **The library shifts still come first.**

## Everyone notices

**While you're sweet on each other**, a few of the regulars notice before you've said anything:
- Gus: "Rowan's asked me what time the park closes twice this week. Looking at you, both times. Just an observation."
- Hollis: Rowan asked whether the binder has a section for "people who climb nicely".
- Otis: "Rowan's been drawing the same crash pad all morning. Your crash pad."
- Bea: "Rowan drew you AGAIN. I saw. Are you two— no. Never mind. (Are you, though?)"
- Dez: "Rowan keeps looking over here. Not at me."

**In the first six weeks together:**
- Gus: "So. You and Rowan. Pickles told me. … About time, if you ask me."
- Hollis: "I've updated the index. You and Rowan are cross-referenced now. It's the most romantic thing I know how to do."
- Otis: "You and Rowan! Perfect. Perfect weather for it."
- Bea: "OH MY GOD. You and ROWAN? I KNEW it. I called it weeks ago. Nobody ever listens to me."
- Dez: "Heard about you and Rowan. …Good. Really."
- The Bishop: "You and the one with the sketchbook, eh? Dot and I used to watch the sunset from up on the hill. Best seat in the park, that."

Bea comments as a friend, and only Rowan has anything playful or sweet (tested).

## How it looks

Charming and understated, not sentimental:
- **Rowan's three new expressions** (`portraits.js`, also on the portraits review page):
  - smitten: sparkly eyes, a blush, and one small pink heart
  - shy: glancing away, blushing
  - laughing
- **The conversation box** gets a warm pink border and wash for sweet moments.
- **Hearts:** three tiny hearts rise from Rowan's portrait when Rowan's smitten. With reduced motion, one heart just sits there.
- **Pink toasts** for the moments that matter. A pink "Tell Rowan how you feel" button.

## No mechanical advantage

- **No XP.** Send chances, energy and skin are unchanged.
- **Rowan's existing extra good vibes as a partner (Phase 3) are the same** whether you're together or not.
- **Flirting counts a little towards friendship with Rowan,** a day's flirting counting as much as a hello. Nothing else.

## Saves

All new fields are optional and cleaned on load:
- **`G.romance`:**
  - `since`: the first flirt
  - `base`: flirts from before you were just friends, no longer counted
  - `asked`: the days Rowan asked about the sunset
  - `declined`
  - `friends`
  - `together`: the date, permanent
- **`G.day.sunset`:** asked, no, yes (watching it), told or watched.
- **The social record's new kinds:** `flirt` (days you flirted) and `sunset`.
- **A reload during the sunset** picks it up again. Once you've chosen, a reload just ends the day.

## Fixed along the way

- **Rowan's Pickles line** ("He never moves") broke the no-pronouns-in-Rowan's-lines rule, unnoticed because the test never reached it. It's now "Such a good model. Never moves."
- **The pronoun check** now also catches "ROWAN" in capitals.

## Tests

- **`node scripts/test_social.js`** (4 new):
  - nothing unless you flirt, then each stage in turn
  - the sunset both ways, and starting again
  - cooling off
  - only Rowan, and bad records cleaned
- **`node scripts/test_talk.js`** (3 new):
  - every romance line at every stage, in every situation, renders with no gendered pronoun
  - each playful line has an early and a sweet answer, and affection once you're together
  - the sunset ask and note
  - everyone notices
  - nobody but Rowan has a playful or sweet line
- **`scripts/browser/phase4_stage6.js`** (new), covering:
  - friends with something playful on offer, once a day
  - becoming sweet on each other (told in words; Your people)
  - Rowan asking about the sunset
  - the sunset scene, a reload in the middle of it, and telling Rowan how you feel
  - the day ending
  - together: Your people, Out today, the hello the day after, affection, climbing together, walked to your car
  - just watching it twice
  - "Not tonight"
  - a phone
  - a bad save file
- **`node scripts/tune_romance.js`** (new): the pace.
- **Every other suite passes** (see the summary).
- **Seen only in headless Chrome.**

## For review

1. **The pace:** together in about 7 weeks for someone keen, 5 months for someone relaxed. Slow enough to feel like a slow burn?
2. **Who says it:** at the sunset *you* tell Rowan how you feel. Rowan only invites you up there. Is that the right way round, or would you like Rowan to say it first sometimes?
3. **No breaking up:** once you're together, it's for good. Turning down the sunset twice settles into friendship, but there's no way to end it after. Do you want one?
4. **The playful lines:** do they sound like flirting you'd enjoy picking, and do Rowan's answers sound like Rowan? (`node scripts/test_talk.js --show` prints samples; the full set is `PLAYFUL` in `talk.js`.)

## After the review (2026-11-27)

1. **The pace:** about 7 weeks for someone keen is right. Unchanged.
2. **Who says it:** always you, at the sunset. Rowan invites you up there, and never says it first.
3. **No breaking up.** Once you're together, it's for good.
4. **The lines:** approved, with one change. Becoming sweet on each other now says "You're fairly sure Rowan's been hanging around your projects on purpose" (it was "…been drawing you on purpose").
