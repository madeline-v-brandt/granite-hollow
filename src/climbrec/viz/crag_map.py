"""Export everything the crag map page needs into one JSON file.

python -m climbrec.viz.crag_map [--data data/simulated] [--out site/map/map-data.json]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from climbrec.data import load_dataset
from climbrec.simulate.layout import make_layout
from climbrec.simulate.naming import BOULDER_DESC

ANGLE_TAGS = ("slab", "overhang", "roof")


def _boulder_angle(styles: pd.Series) -> str:
    """The boulder's angle, read off its problems' tags (vertical if none dominate)."""
    tags = styles.str.split("|").explode()
    counts = tags[tags.isin(ANGLE_TAGS)].value_counts()
    if len(counts) and counts.iloc[0] >= 0.4 * len(styles):
        return str(counts.index[0])
    return "vertical"


def build(data_dir: str | Path, seed: int = 8) -> dict:
    ds = load_dataset(data_dir)
    p = ds.problems
    layout = make_layout(p, seed=seed)

    sends = ds.sends.drop_duplicates(["climber_id", "problem_id"]).groupby("problem_id").size()
    rated = ds.ticks.dropna(subset=["stars"]).groupby("problem_id")["stars"].agg(["sum", "count"])
    p = p.assign(
        sends=p.problem_id.map(sends).fillna(0).astype(int),
        star_sum=p.problem_id.map(rated["sum"]).fillna(0),
        ratings=p.problem_id.map(rated["count"]).fillna(0).astype(int),
    )

    boulders = []
    for b in layout["boulders"]:
        bp = p[(p.boulder == b["name"]) & (p.sector == b["sector"])].sort_values(["grade", "name"])
        n_ratings = int(bp.ratings.sum())
        boulders.append(dict(
            **b,
            desc=BOULDER_DESC.get(b["name"], ""),
            height_ft=float(bp.height_ft.iloc[0]),
            angle=_boulder_angle(bp.styles),
            sends=int(bp.sends.sum()),
            stars=round(float(bp.star_sum.sum() / n_ratings), 2) if n_ratings else None,
            ratings=n_ratings,
            # [name, grade, avg stars or null, number of ratings, sends, styles]
            problems=[
                [r.name, int(r.grade),
                 round(float(r.star_sum / r.ratings), 2) if r.ratings else None,
                 int(r.ratings), int(r.sends), r.styles]
                for r in bp.itertuples()
            ],
        ))

    return dict(
        crag="Granite Hollow State Park",
        simulated=True,
        n_problems=int(len(p)),
        n_climbers=int(ds.climbers.climber_id.nunique()),
        n_sends=int(len(ds.sends)),
        date_range=[str(ds.ticks.date.min().date()), str(ds.ticks.date.max().date())],
        **{k: v for k, v in layout.items() if k != "boulders"},
        boulders=boulders,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Export crag map data as JSON.")
    ap.add_argument("--data", default="data/simulated")
    ap.add_argument("--out", type=Path, default=Path("site/map/map-data.json"))
    args = ap.parse_args()
    data = build(args.data)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, separators=(",", ":"), default=lambda o: float(o) if isinstance(o, np.floating) else int(o)))
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.0f} KB): "
          f"{len(data['sectors'])} sectors, {len(data['boulders'])} boulders")


if __name__ == "__main__":
    main()
