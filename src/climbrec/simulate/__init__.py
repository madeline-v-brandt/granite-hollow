"""Simulated crag, climbers, and ascent logs.

Everything here is invented. The simulation exists so the recommenders and
evaluation can be built and sanity-checked before real logbook data exists,
and because the simulated climbers' true preferences are known (the `true_*`
columns), we can check whether a recommender actually recovers them.
"""

from climbrec.simulate.generate import SimConfig, simulate

__all__ = ["SimConfig", "simulate"]
