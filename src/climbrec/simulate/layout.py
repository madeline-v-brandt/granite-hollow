"""An invented map layout for the simulated crag.

The simulator only knows each sector's walk-in time, so this module makes up
positions that are consistent with it: sectors hang off a trail network that
starts at the parking lot, and the trail distance to each sector equals its
walk-in time at ``PACE_M_PER_MIN``. Boulders are scattered inside their
sector, sized by how many problems they hold. A few landmarks (a pond, a
reservoir and dam, a quarry, the summit hill) sit next to the sectors that
belong with them (see ``naming``). Sectors and boulders are placed in the order
of the ``sector_order``/``boulder_order`` columns, so renaming them never moves
anything on the map.

Uses its own random stream, so it never changes the simulated tick data.
Coordinates are metres, x east and y north, with the parking lot at (0, 0).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from climbrec.simulate import naming

PACE_M_PER_MIN = 45  # a woodsy approach trail with a pad on your back


def _unit(angle: float) -> np.ndarray:
    return np.array([np.cos(angle), np.sin(angle)])


def _seg_dist(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    """Distance from point p to the segment a-b."""
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / max(np.dot(ab, ab), 1e-9), 0, 1)
    return float(np.linalg.norm(p - (a + t * ab)))


def make_layout(problems: pd.DataFrame, seed: int = 8) -> dict:
    rng = np.random.default_rng([seed, 4242])
    if "boulder_order" not in problems:  # data generated before naming.py: order by name, as it was
        secs = {s: i for i, s in enumerate(sorted(set(problems["sector"])))}
        pairs = {k: i for i, k in enumerate(sorted(set(zip(problems["sector"], problems["boulder"]))))}
        problems = problems.assign(sector_order=problems["sector"].map(secs),
                                   boulder_order=[pairs[k] for k in zip(problems["sector"], problems["boulder"])])
    walks = (problems.groupby("sector").agg(walk=("sector_walk_min", "first"), order=("sector_order", "first"))
             .sort_values("order")["walk"].sort_values(kind="stable"))

    # ---- sectors on a trail tree -------------------------------------------
    nodes: dict[str, dict] = {"Parking": dict(xy=np.zeros(2), walk=0.0, heading=np.pi / 2)}
    trails: list[tuple[str, str]] = []
    min_sep = 170.0
    for name, walk in walks.items():
        parents = [p for p, n in nodes.items() if n["walk"] <= walk - 2] or ["Parking"]
        parents.sort(key=lambda p: -nodes[p]["walk"])
        placed = False
        for attempt in range(400):
            # Prefer branching off the furthest-in sector we can reach, so the
            # network looks like trails rather than a starburst.
            pool = parents[: 2 + attempt // 60]
            parent = pool[int(rng.integers(len(pool)))]
            pnode = nodes[parent]
            dist = max(walk - pnode["walk"], 1) * PACE_M_PER_MIN
            heading = pnode["heading"] + rng.normal(0, 0.75)
            heading = float(np.clip(heading, np.radians(12), np.radians(168)))  # stay north of the road
            xy = pnode["xy"] + dist * _unit(heading)
            sep = min_sep * (0.97 ** (attempt // 20))
            others = [n["xy"] for p, n in nodes.items() if p != "Parking"]
            if xy[1] > 30 and all(np.linalg.norm(xy - o) >= sep for o in others):
                nodes[name] = dict(xy=xy, walk=float(walk), heading=heading)
                trails.append((parent, name))
                placed = True
                break
        if not placed:
            raise RuntimeError(f"could not place sector {name!r}")

    # ---- boulders inside each sector ---------------------------------------
    per_boulder = (problems.groupby(["sector", "boulder"]).agg(n=("problem_id", "size"), order=("boulder_order", "first"))
                   .reset_index().sort_values("order").reset_index(drop=True))
    boulders = []
    sectors = []
    for sector, grp in per_boulder.groupby("sector", sort=False):
        centre = nodes[sector]["xy"]
        grp = grp.sort_values("n", ascending=False)
        spread = 18 + 13 * np.sqrt(len(grp))
        placed: list[tuple[np.ndarray, float]] = []
        for _, b in grp.iterrows():
            r = 2.5 + 1.1 * np.sqrt(b.n)
            for attempt in range(500):
                reach = spread * (1 + attempt / 150)
                xy = centre + rng.uniform(-reach, reach, size=2)
                if np.linalg.norm(xy - centre) > reach:
                    continue
                if all(np.linalg.norm(xy - q) >= r + qr + 5 for q, qr in placed):
                    break
            placed.append((xy, r))
            boulders.append(dict(name=b.boulder, sector=sector, x=round(float(xy[0]), 1),
                                 y=round(float(xy[1]), 1), r=round(float(r), 1)))
        extent = max(np.linalg.norm(q - centre) + qr for q, qr in placed)
        sectors.append(dict(name=sector, walk_min=int(nodes[sector]["walk"]),
                            x=round(float(centre[0]), 1), y=round(float(centre[1]), 1),
                            radius=round(float(extent), 1)))

    # ---- landmarks --------------------------------------------------------
    features: list[dict] = []

    def beside(sector: str, gap: float, size: float) -> np.ndarray:
        """A point just outside a sector, clear of every sector, landmark and
        the parking lot. Tries the far side first, then anywhere around it."""
        s = next(x for x in sectors if x["name"] == sector)
        centre = np.array([s["x"], s["y"]])
        for attempt in range(300):
            spread = 0.9 if attempt < 60 else np.pi
            heading = nodes[sector]["heading"] + rng.uniform(-spread, spread)
            xy = centre + (s["radius"] + gap + size) * _unit(heading)
            clear = all(np.linalg.norm(xy - np.array([o["x"], o["y"]])) >= o["radius"] + size + 15
                        for o in sectors if o["name"] != sector)
            clear &= all(np.linalg.norm(xy - np.array([f["x"], f["y"]])) >= f["r"] + size + 15 for f in features)
            clear &= all(_seg_dist(xy, nodes[a]["xy"], nodes[b]["xy"]) >= size + 20 for a, b in trails)
            if clear and xy[1] > size + 40:
                return xy
        raise RuntimeError(f"no room for a landmark beside {sector!r}")

    names = set(walks.index)
    pond, dam, quarry, summit = naming.POND_SECTOR, naming.DAM_SECTOR, naming.QUARRY_SECTOR, naming.SUMMIT_SECTOR
    if pond in names:
        c = beside(pond, 10, 70)
        features.append(dict(kind="water", name="Mill Pond", x=float(c[0]), y=float(c[1]), r=70.0))
    if dam in names:
        c = beside(dam, 15, 120)
        features.append(dict(kind="water", name="Hollow Reservoir", x=float(c[0]), y=float(c[1]), r=120.0,
                             dam_toward=[nodes[dam]["xy"][0], nodes[dam]["xy"][1]]))
    if quarry in names:
        c = beside(quarry, 5, 60)
        features.append(dict(kind="quarry", name="Old Quarry", x=float(c[0]), y=float(c[1]), r=60.0))

    # Terrain for contour lines: a hill under the summit sector, gentler rises
    # elsewhere, and dips under the water.
    hills = []
    if summit in names:
        s = nodes[summit]["xy"]
        hills.append(dict(x=float(s[0]), y=float(s[1]), amp=38.0, sigma=230.0))
    for _ in range(7):
        x = rng.uniform(-900, 900)
        y = rng.uniform(100, 1300)
        hills.append(dict(x=float(x), y=float(y), amp=float(rng.uniform(10, 26)), sigma=float(rng.uniform(150, 320))))
    for f in features:
        if f["kind"] == "water":
            hills.append(dict(x=f["x"], y=f["y"], amp=-14.0, sigma=f["r"] * 1.6))

    trail_list = [dict(start=nodes[a]["xy"].round(1).tolist(), end=nodes[b]["xy"].round(1).tolist(), to=b)
                  for a, b in trails]
    return dict(pace_m_per_min=PACE_M_PER_MIN, base_elevation_m=55, sectors=sectors,
                boulders=boulders, trails=trail_list, features=features, hills=hills)
