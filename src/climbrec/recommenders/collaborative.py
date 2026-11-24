"""Collaborative filtering recommenders.

Both start from the climber x problem matrix of training sends (rows =
climbers, columns = problems). Attempts are ignored for now.

* X: 1 if the climber sent the problem, else 0.
* R: the same sends weighted by star rating, so "sent and loved it" counts for
  more than "sent it, meh" (see ``_MatrixRecommender``). With ``stars=0`` R == X.

* UserKNN: find the climbers whose ticklists look most like yours and
  recommend what they sent (and liked).
* ItemKNN: two problems are similar if the same climbers sent (and liked)
  both; recommend problems similar to the ones you've sent (and liked).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from climbrec.recommenders.base import Recommender


def _row_cosine(A: np.ndarray) -> np.ndarray:
    """Cosine similarity between the rows of A, with the diagonal zeroed."""
    norms = np.linalg.norm(A, axis=1, keepdims=True)
    An = A / np.where(norms == 0, 1, norms)
    S = An @ An.T
    np.fill_diagonal(S, 0)
    return S


def _keep_top_k(S: np.ndarray, k: int) -> np.ndarray:
    """Zero everything except the k largest entries in each row."""
    if k >= S.shape[1]:
        return S
    idx = np.argpartition(-S, k, axis=1)[:, :k]
    out = np.zeros_like(S)
    rows = np.arange(S.shape[0])[:, None]
    out[rows, idx] = S[rows, idx]
    return out


class _MatrixRecommender(Recommender):
    """Builds X and R, precomputes every climber's scores in ``_all_scores``,
    and falls back to popularity for climbers with no training sends.
    Popularity is also added as a tiny tie-breaker so problems no neighbour has
    sent are ordered sensibly rather than arbitrarily.

    Star weighting: a rated send gets weight ``1 + stars * (rating - ref) / 2``
    and an unrated send gets weight 1. ``ref`` is 2 (the middle of the 0-4
    scale), or the climber's own average rating if ``center_stars`` is true,
    which removes the difference between generous and stingy raters. Weights
    can go negative: a send the climber rated far below their norm counts as
    a mild "not for me".
    """

    def __init__(self, stars: float = 0.0, center_stars: bool = True):
        self.stars, self.center_stars = stars, center_stars

    def _fit(self, train, problems, climbers) -> None:
        pids = self.problems.index
        sends = self.train_sends
        # One row per (climber, problem); average the rating if they logged repeats.
        pairs = sends.groupby(["climber_id", "problem_id"], as_index=False)["stars"].mean()
        cids = pd.Index(pairs["climber_id"].unique())
        r, c = cids.get_indexer(pairs["climber_id"]), pids.get_indexer(pairs["problem_id"])

        X = np.zeros((len(cids), len(pids)))
        X[r, c] = 1.0

        rating = pairs["stars"].astype(float)
        if self.center_stars:
            ref = rating.groupby(pairs["climber_id"]).transform("mean")
        else:
            ref = pd.Series(2.0, index=pairs.index)
        weight = (1 + self.stars * (rating - ref) / 2).fillna(1.0)
        R = np.zeros_like(X)
        R[r, c] = weight.to_numpy()

        self._cids, self.X, self.R = cids, X, R
        pop = X.sum(0)
        self._pop = pop / max(pop.max(), 1)
        self._scores = self._all_scores(X, R)

    def _all_scores(self, X: np.ndarray, R: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def score(self, climber_id: str) -> pd.Series:
        i = self._cids.get_indexer([climber_id])[0]
        s = self._pop if i < 0 else self._scores[i] + 1e-6 * self._pop
        return pd.Series(s, index=self.problems.index)


class UserKNN(_MatrixRecommender):
    """User-based CF.

    Similarity between two climbers is the cosine of their (star-weighted)
    send vectors. With ``idf=True`` each problem is first weighted by
    log(n_climbers / n_senders), so sharing an obscure tick counts for more
    than sharing the warm-up everybody does. Each problem's score is the
    similarity-weighted sum of your ``k`` nearest neighbours' weights for it.
    """

    name = "user-knn"

    def __init__(self, k: int = 100, idf: bool = True, stars: float = 1.0, center_stars: bool = True):
        super().__init__(stars, center_stars)
        self.k, self.idf = k, idf

    def _all_scores(self, X, R):
        W = R
        if self.idf:
            W = R * np.log((X.shape[0] + 1) / (X.sum(0) + 1))
        S = _keep_top_k(_row_cosine(W), self.k)
        self.S = S
        return S @ R

    def explain(self, climber_id: str, problem_id: str) -> dict[str, int]:
        """How many of the climber's nearest neighbours sent the problem."""
        i = self._cids.get_loc(climber_id)
        j = self.problems.index.get_loc(problem_id)
        neighbours = self.S[i] > 0
        return dict(
            similar_climbers_who_sent=int((neighbours & (self.X[:, j] > 0)).sum()),
            similar_climbers=int(neighbours.sum()),
        )


class ItemKNN(_MatrixRecommender):
    """Item-based CF.

    Similarity between two problems is the cosine of their (star-weighted)
    sender vectors. With ``damp_heavy=True`` each climber's row is first
    divided by sqrt(their number of sends), to stop prolific locals from
    dominating (this hurt on the simulated data, so it's off by default).
    Each problem keeps only its ``k`` most similar neighbours, and your score
    for a problem is its similarity to the problems you've sent, weighted by
    how much you liked each one.
    """

    name = "item-knn"

    def __init__(self, k: int = 50, damp_heavy: bool = False, stars: float = 1.0, center_stars: bool = True):
        super().__init__(stars, center_stars)
        self.k, self.damp_heavy = k, damp_heavy

    def _all_scores(self, X, R):
        W = R
        if self.damp_heavy:
            W = R / np.sqrt(np.maximum(X.sum(1, keepdims=True), 1))
        S = _keep_top_k(_row_cosine(W.T), self.k)
        return R @ S
