"""Export the simulated crag as data for the Granite Hollow game.

python -m climbrec.viz.game_data [--data data/simulated] [--out site/game/game-data.json]

The game needs: the map layout, every problem, the simulated climbers (as
in-game NPCs and as the usernames on CragLog), each problem's most recent
logs, and each climber's well-rated sends (so NPCs can recommend climbs they
actually liked).
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
from climbrec.viz.crag_map import _boulder_angle

LOGS_PER_PROBLEM = 6
# CragLog rankings score a climber's ten best sends: 100 points per V-grade
# from V0 = 100, plus 50 for a flash. Must match rankPoints() in game.js.
GAME_START = pd.Timestamp("2025-09-06")
SEND_EPOCH = pd.Timestamp("2017-01-01")
RANK_TOP = 10


def rank_points(grade: int, flash: bool) -> int:
    return 100 * (grade + 1) + (50 if flash else 0)

_A = ["crimp", "sloper", "pinch", "jug", "heel", "toe", "chalk", "pad", "send", "beta", "dyno", "mantle",
      "slab", "crux", "highball", "flash", "pebble", "granite", "boulder", "tick", "spray", "smear", "gaston",
      "undercling", "kneebar", "dropknee", "topout", "lowball", "sitstart", "deadpoint"]
_B = ["queen", "king", "wizard", "goblin", "monkey", "lord", "witch", "fiend", "bandit", "goat", "gremlin",
      "pirate", "ninja", "otter", "crusher", "dreamer", "hunter", "punk", "wrangler", "whisperer", "addict",
      "bro", "sister", "nomad", "rat", "dad", "mom", "kid", "ghost", "bear"]
_NAMES = ["sam", "alex", "jo", "max", "lee", "ren", "kai", "ari", "noa", "mika", "rio", "tay", "jules",
          "devon", "robin", "casey", "quinn", "sky", "avery", "rowan", "emery", "sage", "remy", "nico"]


def _usernames(n: int, rng: np.random.Generator) -> list[str]:
    out, seen = [], set()
    while len(out) < n:
        kind = rng.integers(4)
        if kind == 0:
            u = f"{rng.choice(_A)}{rng.choice(_B)}"
        elif kind == 1:
            u = f"{rng.choice(_NAMES)}_{rng.choice(_A)}s"
        elif kind == 2:
            u = f"{rng.choice(_A)}{rng.choice(_NAMES)}{rng.integers(1, 99)}"
        else:
            u = f"{rng.choice(_NAMES)}{rng.choice(_B)}"
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def build(data_dir: str | Path, seed: int = 8) -> dict:
    full = load_dataset(data_dir, include_latent=True)
    p, c, t = full.problems.reset_index(drop=True), full.climbers.reset_index(drop=True), full.ticks
    layout = make_layout(p, seed=seed)
    pidx = {pid: i for i, pid in enumerate(p.problem_id)}
    cidx = {cid: i for i, cid in enumerate(c.climber_id)}

    sends = t[t["style"] != "Attempt"]
    n_sends = sends.drop_duplicates(["climber_id", "problem_id"]).groupby("problem_id").size()
    rated = t.dropna(subset=["stars"]).groupby("problem_id")["stars"].agg(["mean", "count"])

    # Trail tree: which sector each trail comes from.
    node_xy = {"Parking": (0.0, 0.0)} | {s["name"]: (s["x"], s["y"]) for s in layout["sectors"]}
    parents = {}
    for tr in layout["trails"]:
        start = tuple(tr["start"])
        parents[tr["to"]] = min(node_xy, key=lambda n: (node_xy[n][0] - start[0]) ** 2 + (node_xy[n][1] - start[1]) ** 2)

    boulder_index = {(b["sector"], b["name"]): i for i, b in enumerate(layout["boulders"])}
    problems = []
    for i, r in p.iterrows():
        problems.append(dict(
            name=r["name"], grade=int(r.grade), tags=r.styles, height_ft=float(r.height_ft), sit=bool(r.sit_start),
            b=boulder_index[(r.sector, r.boulder)],
            stars=round(float(rated["mean"].get(r.problem_id, np.nan)), 2) if r.problem_id in rated.index else None,
            ratings=int(rated["count"].get(r.problem_id, 0)),
            sends=int(n_sends.get(r.problem_id, 0)),
        ))

    boulders = []
    for i, b in enumerate(layout["boulders"]):
        members = [j for j, pr in enumerate(problems) if pr["b"] == i]
        members.sort(key=lambda j: (problems[j]["grade"], problems[j]["name"]))
        styles = p.loc[members, "styles"]
        boulders.append(dict(name=b["name"], sector=b["sector"], desc=BOULDER_DESC.get(b["name"], ""), x=b["x"], y=b["y"], r=b["r"],
                             height_ft=problems[members[0]]["height_ft"], angle=_boulder_angle(styles),
                             problems=members))

    # Climbers: skill at the end of their simulated history.
    last = pd.to_datetime(c.last_visit)
    first = pd.to_datetime(c.first_visit)
    years = (last - first).dt.days / 365
    level = c.true_skill_start + c.true_skill_gain * (1 - np.exp(-years / 1.5))
    names = _usernames(len(c), np.random.default_rng([seed, 99]))
    climbers = [[names[i], round(float(c.height_cm[i])), c.visitor_type[i], round(float(level[i]), 1), c.true_likes[i]]
                for i in range(len(c))]

    # Most recent logs per problem: [climber, date, style, stars, suggested grade]
    style_code = {"Flash": "F", "Send": "S", "Attempt": "A"}
    recent = t.sort_values("date", ascending=False).groupby("problem_id").head(LOGS_PER_PROBLEM)
    logs: list[list] = [[] for _ in problems]
    for r in recent.itertuples():
        logs[pidx[r.problem_id]].append([
            cidx[r.climber_id], r.date.strftime("%Y-%m-%d"), style_code[r.style],
            None if pd.isna(r.stars) else int(r.stars),
            None if pd.isna(r.suggested_grade) else int(r.suggested_grade),
        ])

    # Each climber's well-rated sends, for NPC recommendations.
    liked = sends[sends["stars"].fillna(0) >= 3].drop_duplicates(["climber_id", "problem_id"])
    liked_by = [[] for _ in climbers]
    for r in liked.itertuples():
        liked_by[cidx[r.climber_id]].append(pidx[r.problem_id])

    # Each climber's sends for the CragLog rankings, as a flat list
    # [problem, days since SEND_EPOCH, flash, ...]. The game's 12-month window
    # never starts before GAME_START - 1 year, so older sends only matter for
    # all-time scores, and only the RANK_TOP best of those can ever count.
    first_sends = sends.sort_values("date").drop_duplicates(["climber_id", "problem_id"]).copy()
    first_sends["g"] = first_sends["problem_id"].map(p.set_index("problem_id")["grade"]).astype(int)
    first_sends["pts"] = [rank_points(g, st == "Flash") for g, st in zip(first_sends.g, first_sends["style"])]
    window_start = GAME_START - pd.DateOffset(years=1)
    rank_sends = [[] for _ in climbers]
    for cid, grp in first_sends.groupby("climber_id"):
        old = grp[grp.date < window_start].sort_values(["pts", "date"], ascending=False).head(RANK_TOP)
        keep = pd.concat([old, grp[grp.date >= window_start]]).sort_values("date")
        flat = rank_sends[cidx[cid]]
        for r in keep.itertuples():
            flat += [pidx[r.problem_id], int((r.date - SEND_EPOCH).days), int(r.style == "Flash")]

    return dict(
        crag="Granite Hollow State Park", send_epoch=SEND_EPOCH.strftime("%Y-%m-%d"),
        pace_m_per_min=layout["pace_m_per_min"], base_elevation_m=layout["base_elevation_m"],
        sectors=[s | {"parent": parents[s["name"]]} for s in layout["sectors"]],
        trails=layout["trails"], features=layout["features"], hills=layout["hills"],
        boulders=boulders, problems=problems, climbers=climbers, logs=logs, liked=liked_by, sends=rank_sends,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Export game data as JSON.")
    ap.add_argument("--data", default="data/simulated")
    ap.add_argument("--out", type=Path, default=Path("site/game/game-data.json"))
    args = ap.parse_args()
    data = build(args.data)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.0f} KB): {len(data['problems'])} problems, "
          f"{len(data['climbers'])} climbers, {sum(map(len, data['logs']))} logs")


if __name__ == "__main__":
    main()
