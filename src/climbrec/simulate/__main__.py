"""python -m climbrec.simulate [--seed N] [--climbers N] [--problems N] [--out DIR]"""

from __future__ import annotations

import argparse
from pathlib import Path

from climbrec.simulate.generate import SimConfig, simulate, write


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a simulated crag + tick logs.")
    ap.add_argument("--seed", type=int, default=SimConfig.seed)
    ap.add_argument("--climbers", type=int, default=SimConfig.n_climbers)
    ap.add_argument("--problems", type=int, default=SimConfig.n_problems)
    ap.add_argument("--out", type=Path, default=Path("data/simulated"))
    args = ap.parse_args()

    cfg = SimConfig(seed=args.seed, n_climbers=args.climbers, n_problems=args.problems)
    tables = simulate(cfg)
    write(tables, args.out, cfg)

    p, c, t = tables["problems"], tables["climbers"], tables["ticks"]
    sends = t[t["style"] != "Attempt"]
    per_climber = sends.groupby("climber_id").size()
    print(f"{cfg.crag_name}: {len(p)} problems on {p.boulder.nunique()} boulders in {p.sector.nunique()} sectors")
    print(f"{len(c)} climbers, {len(t)} ticks ({len(sends)} sends), {t.date.min()} to {t.date.max()}")
    print(f"sends per logging climber: median {per_climber.median():.0f}, max {per_climber.max()}; "
          f"{(per_climber >= 5).sum()} climbers with >= 5 sends")
    print(f"problems with no ticks: {(~p.problem_id.isin(t.problem_id)).sum()}")
    print(f"wrote {args.out}/")


if __name__ == "__main__":
    main()
