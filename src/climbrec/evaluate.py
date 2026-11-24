"""Offline evaluation: can a recommender predict each climber's most recent sends?

python -m climbrec.evaluate [--data DIR] [--k 20] [--validation]

Use --validation while tuning settings: it scores on each climber's
next-most-recent sends instead, so the test split stays untouched.

On simulated data it also reports *style fit*: the average true style
preference of each climber's top-k list (see climbrec.diagnostics). Recall
can go up just by learning grade and popularity; style fit shows whether
the recommendations actually match the climber's taste.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from climbrec.data import Dataset, Split, load_dataset, temporal_split, validation_split
from climbrec.diagnostics import true_style_affinity
from climbrec.recommenders import (
    GradeAwarePopularity,
    Hybrid,
    ItemKNN,
    PopularityRecommender,
    RandomRecommender,
    Recommender,
    StyleProfile,
    UserKNN,
)


def recall_at_k(recs: list[str], relevant: set[str], k: int = 20) -> float:
    """Share of the held-out sends that appear in the top k.

    The denominator is min(|relevant|, k) so a perfect list scores 1.0 even
    for climbers with more than k held-out sends.
    """
    if not relevant:
        return np.nan
    hits = sum(r in relevant for r in recs[:k])
    return hits / min(len(relevant), k)


def ndcg_at_k(recs: list[str], relevant: set[str], k: int = 20) -> float:
    """Like recall, but hits near the top of the list count for more."""
    if not relevant:
        return np.nan
    dcg = sum(1 / np.log2(i + 2) for i, r in enumerate(recs[:k]) if r in relevant)
    ideal = sum(1 / np.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / ideal


def evaluate(
    rec: Recommender,
    ds: Dataset,
    split: Split,
    k: int = 20,
    affinity: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Fit on train, score every climber with held-out sends. One row per climber.
    Pass ``affinity`` (from ``true_style_affinity``) to add a style_fit column."""
    rec.fit(split.train, ds.problems, ds.climbers)
    rows = []
    for cid, grp in split.test.groupby("climber_id"):
        relevant = set(grp["problem_id"])
        recs = rec.recommend(cid, k)
        row = dict(climber_id=cid, n_test=len(relevant),
                   recall=recall_at_k(recs, relevant, k), ndcg=ndcg_at_k(recs, relevant, k))
        if affinity is not None:
            row["style_fit"] = affinity.loc[cid, recs].mean()
        rows.append(row)
    return pd.DataFrame(rows)


LIKED_STARS = 3


def liked_only(split: Split, min_stars: int = LIKED_STARS) -> Split:
    """Same training data, but only score the held-out sends the climber rated
    at least ``min_stars``: "did we find climbs they'll enjoy", rather than
    "did we predict what they'd climb next"."""
    return Split(train=split.train, test=split.test[split.test["stars"] >= min_stars])


def default_recommenders() -> list[Recommender]:
    return [
        RandomRecommender(),
        PopularityRecommender(),
        GradeAwarePopularity(),
        UserKNN(stars=0),
        UserKNN(),
        ItemKNN(stars=0),
        ItemKNN(),
        StyleProfile(),
        Hybrid(),
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", default="data/simulated")
    ap.add_argument("--k", type=int, default=20)
    ap.add_argument("--validation", action="store_true", help="score on the validation split (for tuning)")
    args = ap.parse_args()

    ds = load_dataset(args.data)
    split = temporal_split(ds)
    if args.validation:
        split = validation_split(ds, split)
        print("VALIDATION split")
    liked = liked_only(split)
    affinity = true_style_affinity(args.data)
    print(f"train ticks: {len(split.train)}, held-out sends: {len(split.test)} "
          f"across {split.test.climber_id.nunique()} climbers "
          f"({len(liked.test)} of them rated >= {LIKED_STARS} stars)\n")

    k = args.k
    header = f"{'recommender':<28}{f'Recall@{k}':>11}{f'NDCG@{k}':>10}{f'Recall@{k} liked':>17}"
    print(header + (f"{'style fit':>11}" if affinity is not None else ""))
    for rec in default_recommenders():
        res = evaluate(rec, ds, split, k, affinity)
        res_liked = evaluate(rec, ds, liked, k)
        line = (f"{describe(rec):<28}{res.recall.mean():>11.3f}{res.ndcg.mean():>10.3f}"
                f"{res_liked.recall.mean():>17.3f}")
        if affinity is not None:
            line += f"{res.style_fit.mean():>11.3f}"
        print(line)

    if affinity is not None:
        actual = np.mean([affinity.loc[c, g.problem_id].mean() for c, g in split.test.groupby("climber_id")])
        print(f"\nstyle fit of what climbers actually sent next: {actual:.3f}")


def describe(rec: Recommender) -> str:
    """Short label including the settings that matter, e.g. 'user-knn stars=1'."""
    stars = getattr(rec, "stars", 0)
    return rec.name + (f" stars={stars:g}" if stars else "")


if __name__ == "__main__":
    main()
