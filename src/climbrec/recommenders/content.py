"""Content-based recommender: learn each climber's style profile from the
problems they've sent and rated, then recommend problems that match it.

Unlike collaborative filtering this uses the problems' style *tags*, so it can
say why it recommended something ("crimpy +0.6, technical +0.4") and works on
problems nobody similar to you has climbed yet.

Profile
-------
For each style tag t, a climber's profile has two parts:

* **Frequency lift**: is t over-represented in your sends compared with what
  climbers at the same grades usually send? Comparing like-for-like grades
  matters: if you climb V2-V4, your ticks will be full of slab and mantle
  simply because that's what V2-V4 at this crag is, not because you like it.
  Computed as log(your share / expected share), with the expected share
  mixed in as a prior (``smoothing`` pseudo-sends) so a climber with 3 sends
  doesn't get extreme values.
* **Rating signal**: on your sends tagged t, how did you rate them compared
  with your own average? Shrunk towards 0 by ``smoothing`` pseudo-ratings.

profile[t] = lift[t] + rating_weight * rating[t]. The tags include ``reachy``
and ``bunchy``, so morphology is learned from behaviour like any other style.

Score
-----
score = style_weight * (profile . problem tags)
        + grade fit (a bell curve around a bit below your level, in log space)
        + quality_weight * (problem's average stars, shrunk, centred)
        + pop_weight * log(1 + number of climbers who sent it)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from climbrec.recommenders.base import Recommender


def _tag_matrix(problems: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    lists = problems["styles"].fillna("").str.split("|")
    tags = sorted({t for ts in lists for t in ts if t})
    idx = {t: i for i, t in enumerate(tags)}
    T = np.zeros((len(problems), len(tags)))
    for j, ts in enumerate(lists):
        for t in ts:
            if t:
                T[j, idx[t]] = 1.0
    return T, tags


class StyleProfile(Recommender):
    name = "style-profile"

    def __init__(
        self,
        style_weight: float = 1.0,
        rating_weight: float = 1.0,
        smoothing: float = 5.0,
        quality_weight: float = 0.5,
        pop_weight: float = 1.0,
        below: float = 1.0,
        width: float = 1.5,
    ):
        self.style_weight = style_weight
        self.rating_weight = rating_weight
        self.smoothing = smoothing
        self.quality_weight = quality_weight
        self.pop_weight = pop_weight
        self.below = below
        self.width = width

    # ------------------------------------------------------------------ fit

    def _fit(self, train, problems, climbers) -> None:
        P = self.problems  # indexed by problem_id
        pids = P.index
        T, self.tags = _tag_matrix(P.reset_index())
        self.T = T
        self.Tn = T / np.sqrt(np.maximum(T.sum(1, keepdims=True), 1))
        grade = P["grade"].to_numpy(float)

        pairs = self.train_sends.groupby(["climber_id", "problem_id"], as_index=False)["stars"].mean()
        cids = pd.Index(pairs["climber_id"].unique())
        r, c = cids.get_indexer(pairs["climber_id"]), pids.get_indexer(pairs["problem_id"])
        X = np.zeros((len(cids), len(pids)))
        X[r, c] = 1.0
        n = X.sum(1, keepdims=True)

        # Expected tag share given the grades you send, from everyone's sends.
        sends_per_problem = X.sum(0)
        share_by_grade = {}
        for g in np.unique(grade):
            at_g = grade == g
            w = sends_per_problem[at_g]
            share_by_grade[g] = (w @ T[at_g]) / w.sum() if w.sum() > 0 else T[at_g].mean(0)
        expected_by_problem = np.stack([share_by_grade[g] for g in grade])
        eps = 1e-3
        expected = np.maximum((X @ expected_by_problem) / n, eps)
        observed = (X @ T) / n
        k = self.smoothing
        lift = np.log((n * observed + k * expected) / (n + k)) - np.log(expected)

        # Ratings relative to the climber's own average.
        rating = pairs["stars"].astype(float)
        centred = (rating - rating.groupby(pairs["climber_id"]).transform("mean")).to_numpy()
        rated = ~np.isnan(centred)
        Rc = np.zeros_like(X)
        Rm = np.zeros_like(X)
        Rc[r[rated], c[rated]] = centred[rated]
        Rm[r[rated], c[rated]] = 1.0
        rating_signal = (Rc @ T) / (Rm @ T + k)

        self._cids = cids
        self.profiles = lift + self.rating_weight * rating_signal

        # Climber level: 90th percentile of the grades they've sent.
        sent_grades = pd.Series(grade[c], index=pairs["climber_id"])
        self.level = sent_grades.groupby(level=0).quantile(0.9).reindex(cids).to_numpy()

        # Problem quality from everyone's star ratings (attempts included),
        # shrunk towards the crag average.
        st = train.dropna(subset=["stars"]).groupby("problem_id")["stars"].agg(["sum", "count"])
        st = st.reindex(pids, fill_value=0)
        mean_star = st["sum"].sum() / max(st["count"].sum(), 1)
        self.quality = ((st["sum"] + 5 * mean_star) / (st["count"] + 5) - mean_star).to_numpy()
        self.pop = np.log1p(sends_per_problem)
        self.grade = grade

    # --------------------------------------------------------------- scoring

    def _parts(self, i: int) -> dict[str, np.ndarray]:
        target = self.level[i] - self.below
        return dict(
            style=self.style_weight * (self.Tn * self.profiles[i]),  # problems x tags
            grade=-0.5 * ((self.grade - target) / self.width) ** 2,
            quality=self.quality_weight * self.quality,
            popularity=self.pop_weight * self.pop,
        )

    def score(self, climber_id: str) -> pd.Series:
        i = self._cids.get_indexer([climber_id])[0]
        if i < 0:  # no sends yet: popular, well-rated problems
            s = self.pop + self.quality_weight * self.quality
        else:
            p = self._parts(i)
            s = p.pop("style").sum(1) + sum(p.values())
        return pd.Series(s, index=self.problems.index)

    # ----------------------------------------------------------- explaining

    def profile(self, climber_id: str) -> pd.Series:
        """The climber's style profile, strongest likes first."""
        i = self._cids.get_loc(climber_id)
        return pd.Series(self.profiles[i], index=self.tags).sort_values(ascending=False)

    def explain(self, climber_id: str, problem_id: str) -> dict[str, float]:
        """Score broken into parts: one entry per style tag on the problem,
        plus grade, quality and popularity (and any parts a subclass adds).
        The values sum to the score."""
        i = self._cids.get_loc(climber_id)
        j = self.problems.index.get_loc(problem_id)
        p = self._parts(i)
        style = p.pop("style")
        out = {t: float(style[j, k]) for k, t in enumerate(self.tags) if self.T[j, k]}
        out.update({name: float(v[j]) for name, v in p.items()})
        return out
