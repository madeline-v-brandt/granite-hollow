# Phase 4, Stage 5: Pickles

Status: **built and reviewed (2026-11-26):** the pace approved as built. The plan is the Phase 4 brief's Pickles stage, with the decisions in `stage0-review.md` §5: you go and find him, and he rides home with you once he's adopted you.

Pickles is the parking-lot dog who naps by his rock at The Tailgate. Now, if you keep going to see him, he gets to know you, comes to meet you at your car, starts following you round the park, and in the end decides you're his human.

## He's only ever where he's drawn

Everything asks one question, "where is Pickles?", and gets one answer:
- the map
- the conversation box
- the hover card
- Out today
- the paper map
- the climbing scene

So you can never be asked to pet him somewhere he isn't. He's always in one of these places:

| Where | When | What you see |
|---|---|---|
| **Napping by his rock** | Most of the time, until he's yours | Drawn curled up by Pickles' Rock, as before |
| **Waiting by your car** | Some mornings (about half), once he greets you | Standing by your car, wagging. Walk over and say hello; afterwards he trots back to his rock. If you don't come within about 45 minutes, he gives up and goes home. |
| **Following you** | For an hour or two after you pet him, once he follows you (once a day) | Trotting along behind you, following the way you went. When you stop he sits beside you, and after a while curls up asleep. |
| **Heading home** | When he's had enough | Trotting back to his rock ("Pickles has had enough adventure for one day…", or Gus whistles him back) |
| **With you** | Every day, once he's your dog | At the car with you in the morning, with you all day, and home in the back seat at the end of it |

## How he comes to be yours

It's counted in days you've petted him (once a day each) and days he's followed you:

| | After | He… |
|---|---|---|
| A friendly crag dog | | Naps by his rock; his tail thumps when you come by |
| Knows you | 3 days of pets | Starts wagging before he's opened his eyes |
| Greets you at the lot | 6 | Is waiting by your car some mornings |
| Follows you around | 9 | Falls in at your heel after a pet |
| Your dog | 14 days of pets, and 3 days he's followed you | The next time he's following you and it's time for him to go home, he doesn't. At the end of that day he hops into your car. |

The moment it happens: "Pickles has decided you're his human."
- When you open the car door, he hops into the back seat, turns round three times, and lies down as if he's always ridden there.
- If Gus is out: "Well," he says. "Looks like he's picked." He doesn't quite manage to sound gruff about it.
- If Gus isn't out: "You'll have to tell Gus. Somehow you think Gus already knows."

**How long it takes:** someone who goes to see him most climbing days has him in about three weeks; someone who visits every few days, in a couple of months.

## Pickles himself

- **On the map** he has his own small layer, like your climber's, so his legs and tail can move without slowing the map. In headless Chrome, walking with him trotting behind runs at 59 fps, the same as without him. He has four poses:
  - walking, legs going and body bobbing
  - standing and wagging, by your car
  - sitting beside you, wagging for a moment, and facing you
  - curled up asleep, when you've stood still for a while
- **He's drawn in one piece:** the outlines first and his fur over them, so no joins show (the fix from the last round, applied to every pose).
- **In the climbing scene** he's curled up beside your pad, on the other side from a partner. When you top out he lifts his head and his tail goes.
- **Click him** when he's with you to say hello right where you are: Pet him, Throw his stick, or Good boy.
- **Personality:** now and then, while you climb, a line about what he's up to:
  - "Pickles has moved onto your pad while you weren't looking. You land next to him."
  - "Pickles is lying on the spot you were going to put your foot."
  - "Pickles barks, delighted, at nothing in particular. It feels like it's for you."
  - "Pickles brings you a stick to celebrate."
- **Others notice:**
  - Gus, once Pickles follows you: "I see Pickles has found himself a new favourite. He's not my dog, you understand. But I'll be keeping an eye on you."
  - Gus, once he's yours: "How's my— your dog? Our dog. The dog. He looks happy. That's all I wanted."
  - Bea: "PICKLES!! Oh, and hi. Hi. But PICKLES."
  - Dez: "Hey, Pickles. …And you."
  - Hollis has added him to the binder, under "Dogs, notable".
- **Your people** (the Climber tab) has him too:
  - how far along you are: "Knows you", "Follows you around", "Your dog"
  - since when
  - the days you've petted him and walked together

## No mechanical advantage

He's company, not a bonus:
- **No XP**, and **no change to send chances, energy or skin.** His lines while you climb are just words.
- **Pickles has nothing to do with friendship with the regulars.** His walks count only towards him.

## Saves

All new fields are optional and cleaned on load:
- **`G.dog.adopted`:** the date he became yours. It's permanent.
- **`G.day.dog`:** where he is today, plus whether he's followed you, gone home, or decided to stay.

Saves from before keep the pets they'd counted (from `G.know.met`), so someone who'd petted him ten times already has a dog who follows them.

## Tests

- **`node scripts/test_social.js`** (2 new): his stages in order, adopting only when ready, a pet a day at most, and an old save's pets counted.
- **`node scripts/test_talk.js`** (1 new): his greeting depends on where he is, every reply works in every place, and the regulars notice him.
- **`scripts/browser/phase4_stage5.js`** (new), covering:
  - day one at his rock, and nowhere else
  - at the car, Out today, hello, and back to his rock
  - following after a pet, keeping up, and clicking him
  - the frame rate walking with him: 59 fps
  - heading home
  - not going home once ready, and adopting you at the car
  - with you the next morning
  - the climbing scene, and Your people
  - a bad save file
- **Every other suite passes** (see the summary).
- **Seen only in headless Chrome.**

## For review

1. **The pace:** about three weeks of regular visits until he's yours. Too quick, too slow, or right?
2. **How he looks:** small, curled up asleep, sitting and trotting. Do the poses read well at map size?
3. **Waiting at the car about half the mornings** once he knows you, and following for an hour or two. Is that the right amount of dog?
