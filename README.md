# climbrec

**Play the game set on this crag, Granite Hollow:** https://madeline-v-brandt.github.io/granite-hollow/ (source in [site/game/](site/game/)).

Recommending boulder problems from climbers' logbooks, based on what climbers with similar ticklists have done rather than on what's most popular. Background and plan: [8a.txt](8a.txt).

There is no real data yet. Everything currently runs on a **simulated crag**, *Granite Hollow State Park*, which is loosely modelled on Lincoln Woods. Its climbers have hidden preferences, so we can check whether a recommender actually picks up on them.

## Quick start

```bash
python3 -m venv .venv.nosync && ln -s .venv.nosync .venv && .venv/bin/pip install -e '.[dev]'

.venv/bin/python -m climbrec.simulate      # writes data/simulated/*.csv (~15 s)
.venv/bin/python -m climbrec.evaluate      # scores for each recommender
.venv/bin/python -m pytest
```

`python -m climbrec.simulate --seed 3 --climbers 1000` gives a different crag or more climbers.

**Granite Hollow, the game** ([site/game/](site/game/)): a bouldering game set on the simulated crag. `python -m climbrec.viz.game_data` exports its data. The climbing rules (send chances, XP, skill growth, weather) live in [mechanics.js](site/game/mechanics.js), and `node scripts/balance_game.js` plays 200 simulated players under those rules and reports how many climbing days each grade takes (currently about V3 by day 5, V5 by day 12, V7 by day 22, V9 by day 38).

`python -m climbrec.viz.crag_map` exports `site/map/map-data.json` for the crag map page ([site/map/index.html](site/map/index.html)). The map's layout is invented ([layout.py](src/climbrec/simulate/layout.py)): sectors sit on a trail network whose distances match their walk-in times.

The environment is named `.venv.nosync` because this folder syncs to iCloud, and iCloud marks files inside a synced `.venv` as hidden. Python 3.13+ skips hidden `.pth` files, so `import climbrec` breaks. iCloud ignores folders ending in `.nosync`, and the `.venv` link keeps the usual commands working.

## Layout

```
src/climbrec/
  simulate/generate.py      crag, climbers, and session-by-session ascent simulation
  simulate/naming.py        the crag's names: sector names, boulder themes, problem naming rules and lore
  simulate/layout.py        invented map positions for sectors, boulders, trails and landmarks
  data.py                   load_dataset(), temporal_split(), validation_split()
  evaluate.py               metrics + evaluation CLI
  diagnostics.py            style fit against the simulator's hidden preferences
  recommenders/
    base.py                 Recommender interface (fit / score / recommend)
    baselines.py            random, popularity, popularity near your grade
    collaborative.py        UserKNN, ItemKNN (with optional star-rating weighting)
    content.py              StyleProfile: learns each climber's style profile, explains recommendations
    hybrid.py               Hybrid: StyleProfile + "popular with climbers like you" (from UserKNN)
data/simulated/             generated CSVs + config.json
tests/
```

## Data format

Real data (from Mountain Project exports or anywhere else) should be converted to these same three tables.

| table | columns |
|---|---|
| `problems.csv` | problem_id, name, sector, sector_walk_min, boulder, grade (0–13), grade_label, styles (pipe-separated tags), height_ft, sit_start, sector_order, boulder_order |
| `climbers.csv` | climber_id, sex, height_cm, ape_cm, visitor_type, first_visit, last_visit |
| `ticks.csv` | tick_id, climber_id, problem_id, date, style (Flash / Send / Attempt), stars (0–4), suggested_grade |

`sector_order` and `boulder_order` only fix the order the map layout places things in, so renaming a sector or boulder never moves it on the map; real data can leave them out. Columns starting with `true_` are the simulator's hidden ground truth: problem quality and reachiness, and each climber's skill, style preferences, style strengths and logging habits. Real data won't have them. `load_dataset()` drops them unless you pass `include_latent=True`, which is only for checking results.

## How the simulation works

- **Crag:** 1,000 problems on 75 boulders in 10 sectors, each sector with a walk-in time. Each boulder has an angle (slab, vertical, overhang or roof), a rock texture and a height. Problems get style tags shaped by their boulder: crimpy, slopey, pinchy, juggy, compression, dyno, technical, powerful, mantle, slab, overhang, roof, traverse, eliminate and highball. They also get a grade from V0 to V13, a hidden quality, and a hidden reach score from −1 (bunchy) to +1 (reachy). Problems with |reach| > 0.5 get tagged `reachy` or `bunchy`. Big, busy boulders accumulate eliminates.
- **Names:** [naming.py](src/climbrec/simulate/naming.py) gives the crag a history (an old quarry and mill village, a drowned valley, a few local legends) and every boulder a theme. A boulder's best lines get its theme's best names, its hardest lines the ominous ones and its easy lines the playful ones. Sit starts and eliminates are often named after the line they vary ("Comb-Over (Slopers Only)"), and crag-wide pools of climbing culture, books, music and myth fill in the rest. Naming runs on its own random stream after everything else, so changing a name never changes a grade, a style or a tick.
- **Climbers:** 600 climbers of four visitor types (tourist, occasional, regular, local hero). Each has a skill level that improves over time, height and ape index, two or three strong style likes and dislikes, style strengths that correlate with those preferences, a tendency to chase classics, and logging habits (how often they log; some only log hard sends).
- **Sessions:** visits follow the season (spring and fall are busiest). In each session a climber picks one or two sectors (favourite sectors and short walk-ins are more likely) and tries a few new problems. Choices depend on grade, liked styles, quality, popularity and open projects. A problem is sent with probability based on `skill + style strength + reach effect − grade`. The reach effect makes reachy problems harder for shorter climbers and bunchy problems harder for taller ones. Sends are logged with a star rating and a suggested grade; a problem that suits you feels soft, so you suggest a lower grade.
- **Personas:** four named climbers to look at when checking recommendations by eye: `p_short_crimper` (163 cm, likes crimpy/technical/slab), `p_tall_dynoer`, `p_eliminate_local` and `p_classic_tourist`.

## Evaluation

For each climber with at least 5 sends, their most recent 20% of sends are held out as the **test** split. Recommenders train on the rest and must rank the held-out problems in their top 20. For tuning, `validation_split()` splits the training data the same way again, so you can tune on each climber's next-most-recent sends. `python -m climbrec.evaluate --validation` scores on that split and leaves the test split untouched. `python -m climbrec.evaluate` reports:

- **Recall@20 / NDCG@20:** did the top 20 contain what they climbed next?
- **Recall@20 liked:** the same, counting only held-out sends rated 3 stars or more. This is closer to the actual goal: climbs you'll *enjoy*, not just climbs you'll do.
- **Style fit** (simulated data only): the average true style preference of the top-20 list, from the hidden `true_pref_*` columns. Recall can rise just by learning grade, popularity and location; style fit shows whether the list matches the climber's taste. For reference, what climbers actually sent next scores 0.504, and a perfect style matcher about 1.46.

| recommender | Recall@20 | NDCG@20 | Recall@20 liked | style fit |
|---|---|---|---|---|
| random | 0.022 | 0.021 | 0.014 | 0.167 |
| popularity | 0.139 | 0.099 | 0.113 | 0.117 |
| popularity + grade | 0.162 | 0.120 | 0.141 | 0.085 |
| user-knn (k=100, idf), stars=0 | **0.197** | **0.135** | 0.154 | 0.122 |
| user-knn, stars=1 (default) | 0.173 | 0.124 | **0.166** | 0.181 |
| item-knn (k=50), stars=0 | 0.173 | 0.119 | 0.130 | 0.136 |
| item-knn, stars=1 (default) | 0.168 | 0.115 | 0.145 | 0.272 |
| style-profile | 0.187 | 0.127 | **0.219** | 0.644 |
| hybrid | 0.178 | 0.124 | 0.209 | **0.696** |

These are test-split scores on the default crag (seed 8). The CF and style-profile settings were tuned on this same split, so their scores are a bit optimistic. The hybrid was tuned on the validation split. **Differences of about 0.01 in Recall are within noise:** with about 480 climbers, a single split can't separate models that close (see the hybrid results below).

### What we've learned

- **Unweighted sends mostly capture grade and location.** Both CF models beat popularity on Recall@20, but their style fit is no better than random problems at the right grade (0.130). Co-occurrence on a busy crag hides style.
- **Star weighting helps** (`stars=1`). Each rated send is weighted `1 + (rating − climber's average) / 2`, so loved sends count for more and disappointing ones for less, possibly negative. Style fit roughly doubles for item-knn and rises by half for user-knn, and Recall on liked sends goes up for both. Overall Recall drops a little, because the model moves from "what you'll do next" toward "what you'll enjoy". Stronger weighting (`stars=2`–`4`) pushes further in that direction: item-knn reaches a style fit of 0.41 at `stars=4`, but overall Recall falls to 0.12.
- **Centering ratings** on each climber's average made no clear difference. That's expected: simulated climbers all rate on the same scale. On real data, centering should correct for generous versus stingy raters.
- **The style-profile model is the best so far at recommending climbs people enjoy.** It has the highest liked-sends recall and more than twice the style fit of any CF model, while overall Recall stays close to user-knn. Its learned profiles match the hidden preferences: `p_tall_dynoer` comes out as dyno +1.16, powerful +1.04, overhang +0.90 / slab −2.21, technical −1.60, which are exactly his true likes and dislikes.
- **It learns morphology from behaviour.** It's never told anyone's height, but short climbers' profiles lean `bunchy` and tall climbers' lean `reachy`: the correlation between reach and (bunchy − reachy) preference is −0.46 across climbers with 20+ sends. The CF models showed no height effect.
- **Caveat: the simulator favours this model.** Simulated preferences are defined on exactly these style tags, and every problem's tags are complete and correct. Real tags would have to be pulled from Mountain Project descriptions or added by hand, so they'll be patchier, and the advantage over CF will likely shrink.
- **Hybrid: better taste, the same accuracy.** The hybrid is style-profile with global popularity replaced by "how many of your 100 most similar climbers sent it". Compared with style-profile on four crags (the tuned one plus three fresh seeds), the paired difference per climber, with 95% bootstrap intervals, was:

  | crag | Recall@20 | Recall@20 liked | style fit |
  |---|---|---|---|
  | seed 8, validation | +0.018 [+0.005, +0.030] | +0.025 [+0.007, +0.042] | +0.061 [+0.053, +0.071] |
  | seed 8, test | −0.009 [−0.023, +0.004] | −0.010 [−0.026, +0.005] | +0.053 [+0.044, +0.062] |
  | seed 1, test | +0.003 [−0.010, +0.016] | +0.012 [−0.005, +0.029] | +0.037 [+0.028, +0.047] |
  | seed 2, test | −0.010 [−0.022, +0.002] | +0.002 [−0.017, +0.022] | +0.049 [+0.039, +0.059] |
  | seed 3, test | +0.016 [+0.004, +0.029] | +0.014 [+0.000, +0.029] | +0.042 [+0.032, +0.052] |

  Style fit improves on every crag. Recall is a wash: on average no gain, which contradicts the expectation that user-knn's sense of location would improve it. The hybrid is still the default, because it fits taste better at no cost in Recall and adds an explanation ("12 of your 100 most similar climbers sent this").
- **Blending scores directly didn't work.** Mixing normalized StyleProfile and UserKNN scores (z-score or rank, any weight) never beat StyleProfile on its own on validation. See the [hybrid.py](src/climbrec/recommenders/hybrid.py) docstring for why.
- **Popularity pulls against niche tastes.** `p_eliminate_local`'s profile ranks eliminate as his top like, but few eliminates make his top 10 because they're low-rated and rarely climbed. `pop_weight` controls that trade-off: higher gives safer, more classic lists; lower gives more personal ones.

## Using the style profile and hybrid

```python
from climbrec.data import load_dataset
from climbrec.recommenders import StyleProfile

ds = load_dataset("data/simulated")
rec = StyleProfile().fit(ds.ticks, ds.problems)
rec.profile("p_short_crimper")                 # tag -> learned preference, strongest first
recs = rec.recommend("p_short_crimper", 10)    # problem ids
rec.explain("p_short_crimper", recs[0])        # score broken into style tags, grade, quality, popularity

from climbrec.recommenders import Hybrid
hy = Hybrid().fit(ds.ticks, ds.problems)       # same API, plus:
hy.explain("p_short_crimper", recs[0])         # ... with a "similar_climbers" part instead of popularity
hy.similar_climbers_who_sent("p_short_crimper", recs[0])   # e.g. 12 (of 100)
```

Hybrid adds `neighbour_weight` and `k` (number of neighbours). StyleProfile settings: `style_weight` (how much taste matters), `rating_weight` (stars vs. what you choose to climb), `pop_weight` and `quality_weight` (pull towards classics), `smoothing` (how cautious to be with climbers who have few sends), and `below`/`width` (grade window).

## Next steps

1. **Multi-seed comparison:** turn the four-crag paired comparison above into a command, since single-split differences are too noisy to choose between models.
2. **Matrix factorization** (implicit ALS) as a stronger CF comparison.
3. **Real data:** your own Mountain Project export, then ticklists other climbers share. Style tags will need to be extracted from route descriptions or added by hand.
4. **Website:** show recommendations with their explanations ("crimpy +0.6, technical +0.4, near your grade, 12 climbers like you sent it") and filters for sector and grade.
