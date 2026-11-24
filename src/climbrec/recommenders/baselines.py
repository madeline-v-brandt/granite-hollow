"""Non-personalised baselines. Anything clever has to beat these."""

from __future__ import annotations

import zlib

import numpy as np
import pandas as pd

from climbrec.recommenders.base import Recommender


class RandomRecommender(Recommender):
    name = "random"

    def __init__(self, seed: int = 0):
        self.seed = seed

    def score(self, climber_id: str) -> pd.Series:
        rng = np.random.default_rng([self.seed, zlib.crc32(climber_id.encode())])
        return pd.Series(rng.random(len(self.problems)), index=self.problems.index)


class PopularityRecommender(Recommender):
    """Most-sent problems overall: the 'classics list' everyone gets."""

    name = "popularity"

    def _fit(self, train, problems, climbers) -> None:
        counts = self.train_sends.groupby("problem_id")["climber_id"].nunique()
        self._pop = counts.reindex(self.problems.index, fill_value=0).astype(float)

    def score(self, climber_id: str) -> pd.Series:
        return self._pop


class GradeAwarePopularity(PopularityRecommender):
    """Popular problems near the climber's level.

    Level = 90th percentile of the grades they've sent. Scores are popularity
    weighted by a bell curve centred a little below that level, which is
    roughly what a guidebook-savvy friend would suggest.
    """

    name = "popularity+grade"

    def __init__(self, below: float = 1.0, width: float = 1.5):
        self.below, self.width = below, width

    def _fit(self, train, problems, climbers) -> None:
        super()._fit(train, problems, climbers)
        grades = self.train_sends.merge(problems[["problem_id", "grade"]], on="problem_id")
        self._level = grades.groupby("climber_id")["grade"].quantile(0.9).to_dict()

    def score(self, climber_id: str) -> pd.Series:
        level = self._level.get(climber_id)
        if level is None:
            return self._pop
        g = self.problems["grade"]
        return np.log1p(self._pop) * np.exp(-0.5 * ((g - (level - self.below)) / self.width) ** 2)
