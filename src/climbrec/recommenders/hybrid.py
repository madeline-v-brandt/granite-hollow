"""Hybrid: the style profile, plus "popular with climbers like you".

StyleProfile scores problems on taste, grade, and quality, plus a global
popularity term. The hybrid swaps global popularity for *neighbour*
popularity: how many of your k most similar climbers (from UserKNN) sent the
problem. That brings in what collaborative filtering is good at (where you
climb, what your crowd does) while keeping the style profile and its
explanations.

score = StyleProfile parts (with pop_weight=0)
        + neighbour_weight * log(1 + number of your k nearest neighbours who sent it)

Why not just blend the two models' scores? On the validation split, blending
normalised StyleProfile and UserKNN scores (z-score or rank, any weight) never
beat StyleProfile on its own. UserKNN's scores are near zero for most
problems, so z-scores let its few top picks dominate, and below those picks
its ordering is mostly noise, so rank blending adds noise. Using the
neighbour count as one extra term avoids both problems.
"""

from __future__ import annotations

import numpy as np

from climbrec.recommenders.collaborative import UserKNN
from climbrec.recommenders.content import StyleProfile


class Hybrid(StyleProfile):
    name = "hybrid"

    def __init__(self, neighbour_weight: float = 1.0, k: int = 100, **style_kwargs):
        style_kwargs.setdefault("pop_weight", 0.0)
        super().__init__(**style_kwargs)
        self.neighbour_weight, self.k = neighbour_weight, k

    def _fit(self, train, problems, climbers) -> None:
        super()._fit(train, problems, climbers)
        self.knn = UserKNN(k=self.k).fit(train, problems, climbers)
        counts = (self.knn.S > 0).astype(float) @ self.knn.X  # knn climbers x problems
        rows = self.knn._cids.get_indexer(self._cids)
        self.neighbour_counts = counts[rows]

    def _parts(self, i: int) -> dict[str, np.ndarray]:
        parts = super()._parts(i)
        parts["similar_climbers"] = self.neighbour_weight * np.log1p(self.neighbour_counts[i])
        return parts

    def similar_climbers_who_sent(self, climber_id: str, problem_id: str) -> int:
        """For explanations: "12 of your 100 most similar climbers sent this"."""
        return self.knn.explain(climber_id, problem_id)["similar_climbers_who_sent"]
