"""Loading logbook data and splitting it for evaluation.

The expected format (simulated now, real later) is three tables:

* ``problems``: problem_id, name, sector, boulder, grade, styles, ...
* ``climbers``: climber_id, sex, height_cm, ...
* ``ticks``:    climber_id, problem_id, date, style (Flash/Send/Attempt), stars, suggested_grade
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

SEND_STYLES = ("Flash", "Send")


@dataclass
class Dataset:
    problems: pd.DataFrame
    climbers: pd.DataFrame
    ticks: pd.DataFrame

    @property
    def sends(self) -> pd.DataFrame:
        return self.ticks[self.ticks["style"].isin(SEND_STYLES)]


def load_dataset(path: str | Path = "data/simulated", *, include_latent: bool = False) -> Dataset:
    """Load the three CSVs. Hidden ``true_*`` columns are dropped unless asked for,
    so recommenders can't accidentally peek at the simulator's ground truth."""
    path = Path(path)
    problems = pd.read_csv(path / "problems.csv")
    climbers = pd.read_csv(path / "climbers.csv")
    ticks = pd.read_csv(path / "ticks.csv", parse_dates=["date"])
    ticks[["stars", "suggested_grade"]] = ticks[["stars", "suggested_grade"]].astype("Int64")
    if not include_latent:
        problems = problems.loc[:, ~problems.columns.str.startswith("true_")]
        climbers = climbers.loc[:, ~climbers.columns.str.startswith("true_")]
    return Dataset(problems, climbers, ticks)


@dataclass
class Split:
    train: pd.DataFrame   # all ticks (sends and attempts) not held out
    test: pd.DataFrame    # each eligible climber's most recent sends


def temporal_split(ds: Dataset, test_frac: float = 0.2, min_sends: int = 5) -> Split:
    """Hold out each climber's most recent ``test_frac`` of sends.

    Climbers with fewer than ``min_sends`` sends stay entirely in train (they
    still help the models, they just aren't scored). Attempts on a held-out
    problem made on or after its first held-out date are dropped too, so
    train doesn't leak that the climber was working on it.
    """
    sends = ds.sends.sort_values(["climber_id", "date", "tick_id"])
    sends = sends.drop_duplicates(["climber_id", "problem_id"], keep="first")
    n = sends.groupby("climber_id")["problem_id"].transform("size")
    rank = sends.groupby("climber_id").cumcount()
    n_test = (n * test_frac).round().clip(lower=1)
    is_test = (n >= min_sends) & (rank >= n - n_test)
    test = sends[is_test]

    held = test[["climber_id", "problem_id", "date"]].rename(columns={"date": "held_date"})
    t = ds.ticks.merge(held, on=["climber_id", "problem_id"], how="left")
    leak = t["held_date"].notna() & (t["date"] >= t["held_date"])
    train = t.loc[~leak, ds.ticks.columns]
    return Split(train=train.reset_index(drop=True), test=test.reset_index(drop=True))


def validation_split(ds: Dataset, split: Split, test_frac: float = 0.2, min_sends: int = 5) -> Split:
    """Split ``split.train`` again the same way, for tuning settings.

    Tune on the result (train on the older part, score on each climber's
    next-most-recent sends), then report on ``split.test``, which tuning
    never sees.
    """
    return temporal_split(Dataset(ds.problems, ds.climbers, split.train), test_frac, min_sends)
