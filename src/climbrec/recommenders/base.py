from __future__ import annotations

import pandas as pd

from climbrec.data import SEND_STYLES


class Recommender:
    """Subclasses implement ``_fit`` and ``score``; filtering and ranking live here.

    ``score(climber_id)`` returns a Series of scores indexed by problem_id
    (higher = better). ``recommend`` drops problems the climber already sent
    in the training data and returns the top-k ids.
    """

    name = "base"

    def fit(self, train: pd.DataFrame, problems: pd.DataFrame, climbers: pd.DataFrame | None = None):
        self.problems = problems.set_index("problem_id")
        self.train = train
        self.train_sends = train[train["style"].isin(SEND_STYLES)]
        self._sent = self.train_sends.groupby("climber_id")["problem_id"].agg(set).to_dict()
        self._fit(train, problems, climbers)
        return self

    def _fit(self, train, problems, climbers) -> None:
        pass

    def score(self, climber_id: str) -> pd.Series:
        raise NotImplementedError

    def recommend(self, climber_id: str, k: int = 20) -> list[str]:
        s = self.score(climber_id)
        s = s.drop(list(self._sent.get(climber_id, ())), errors="ignore")
        return s.nlargest(k).index.tolist()
