"""Checks against the simulator's hidden ground truth.

Only works on simulated data (it needs the ``true_pref_*`` columns). Real
data has no ground truth, so there the only measure is Recall/NDCG.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from climbrec.data import load_dataset
from climbrec.simulate.generate import PREF_STYLES


def true_style_affinity(path: str | Path) -> pd.DataFrame | None:
    """Climber x problem table of how much each climber truly likes each
    problem's styles (the same score the simulator uses). None for real data."""
    full = load_dataset(path, include_latent=True)
    pref_cols = [f"true_pref_{s}" for s in PREF_STYLES]
    if not set(pref_cols) <= set(full.climbers.columns):
        return None
    tags = np.array([[s in str(t).split("|") for s in PREF_STYLES] for t in full.problems.styles], float)
    tags /= np.sqrt(np.maximum(tags.sum(1, keepdims=True), 1))
    return pd.DataFrame(
        full.climbers[pref_cols].to_numpy() @ tags.T,
        index=full.climbers.climber_id,
        columns=full.problems.problem_id,
    )
