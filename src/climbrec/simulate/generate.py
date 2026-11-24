"""Generate a fake Lincoln-Woods-like crag, its climbers, and their tick logs.

The model, in brief:

* **Crag.** Sectors (with a walk-in time) contain boulders; each boulder has an
  angle (slab / vertical / overhang / roof), a rock texture, and a height.
  Problems inherit style tags from their boulder plus a few of their own, and
  get a grade (V0-V13), a hidden quality, and a hidden *reach* score in [-1, 1]
  (+1 = very reachy, -1 = very bunchy / favours short climbers).
* **Climbers.** Each has a visitor type (tourist ... local hero) that sets how
  often they come, a skill that improves over time, height + ape index, hidden
  style preferences ("likes crimps") and style strengths ("good at crimps",
  correlated with preferences), and logging habits.
* **Sessions.** On each visit a climber picks 1-2 sectors and tries a handful
  of problems, chosen by grade fit, style preference, quality, popularity, and
  whether it is an open project. Whether they send depends on
  ``skill + style strength + morphology offset - grade``. Sends (and a few
  attempts) are logged with the climber's logging probability, along with a
  star rating and a suggested grade.

Columns starting with ``true_`` are the simulator's hidden ground truth. Real
data would not have them, so recommenders must not use them
(``climbrec.data.load_dataset`` drops them by default).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from climbrec.simulate import names, naming

# --------------------------------------------------------------------------
# Vocabulary
# --------------------------------------------------------------------------

ANGLES = ["slab", "vertical", "overhang", "roof"]
TEXTURES = ["crimpy", "slopey", "mixed"]

# Styles a climber can like/dislike and be strong/weak at.
PREF_STYLES = [
    "crimpy", "slopey", "pinchy", "juggy",                       # holds
    "compression", "dyno", "technical", "powerful", "mantle",    # movement
    "slab", "overhang", "roof",                                  # angle
    "traverse", "eliminate", "highball",                         # form
]
# Morphology tags, derived from the hidden reach score; handled through
# height/ape index rather than preference.
MORPHO_STYLES = ["reachy", "bunchy"]
ALL_STYLES = PREF_STYLES + MORPHO_STYLES
_STYLE_IDX = {s: i for i, s in enumerate(PREF_STYLES)}

# Extra tags a problem may get, weighted by its boulder's angle.
_MOVE_POOL = ["crimpy", "slopey", "pinchy", "juggy", "compression", "dyno", "technical", "powerful", "mantle"]
_MOVE_WEIGHTS_BY_ANGLE = {
    "slab":     [3, 2, 0.5, 0.5, 0.2, 0.3, 5, 0.3, 3],
    "vertical": [4, 1.5, 2, 1.5, 1, 1.5, 2.5, 1.5, 2],
    "overhang": [2, 2, 3, 3, 3.5, 2, 0.8, 4, 0.8],
    "roof":     [1, 1.5, 2.5, 4, 3, 1.5, 0.5, 4, 1.5],
}

# Rough share of problems at each grade V0..V13 (Lincoln-Woods-ish: lots of
# moderates, a long thin tail of hard stuff).
GRADE_WEIGHTS = np.array([10, 11, 12, 12, 11, 10, 8, 7, 5.5, 4.5, 3.5, 2.5, 1.5, 1.0])
MAX_GRADE = len(GRADE_WEIGHTS) - 1

# Relative visit likelihood by month (Jan..Dec): New England bouldering is
# best in spring and fall, worst in mid-summer humidity.
SEASON_WEIGHTS = np.array([0.7, 0.6, 1.0, 1.3, 1.1, 0.6, 0.4, 0.4, 1.0, 1.4, 1.3, 0.9])

VISITOR_TYPES = {
    # name: (share of climbers, visits per year, mean *new* problems tried per
    # session; the rest of a session is repeats and warm-ups, which nobody logs)
    "tourist":    (0.35, None, 6),
    "occasional": (0.35, (2, 8), 3),
    "regular":    (0.22, (10, 30), 2),
    "local_hero": (0.08, (40, 80), 1.5),
}


@dataclass
class SimConfig:
    seed: int = 8
    crag_name: str = "Granite Hollow State Park"
    n_problems: int = 1000
    n_boulders: int = 75
    n_climbers: int = 600
    start_date: str = "2017-01-01"
    end_date: str = "2025-12-31"
    # Named climbers with fixed attributes, handy for eyeballing recommendations.
    personas: list[dict] = field(default_factory=lambda: [
        dict(climber_id="p_short_crimper", sex="F", height_cm=163, ape_cm=0,
             visitor_type="regular", skill_start=4.5, skill_gain=1.5,
             likes=["crimpy", "technical", "slab"], dislikes=["dyno", "compression"]),
        dict(climber_id="p_tall_dynoer", sex="M", height_cm=190, ape_cm=6,
             visitor_type="regular", skill_start=5.5, skill_gain=1.5,
             likes=["dyno", "overhang", "powerful"], dislikes=["slab", "technical"]),
        dict(climber_id="p_eliminate_local", sex="M", height_cm=175, ape_cm=2,
             visitor_type="local_hero", skill_start=6.5, skill_gain=1.0,
             likes=["eliminate", "traverse", "crimpy"], dislikes=["highball"]),
        dict(climber_id="p_classic_tourist", sex="F", height_cm=168, ape_cm=1,
             visitor_type="tourist", skill_start=4.0, skill_gain=0.0,
             likes=["juggy", "highball"], dislikes=["eliminate"], classic_chaser=2.0),
    ])


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


# --------------------------------------------------------------------------
# Crag
# --------------------------------------------------------------------------

def make_crag(cfg: SimConfig, rng: np.random.Generator) -> pd.DataFrame:
    n_sectors = len(names.SECTOR_NAMES)
    walk_min = np.sort(rng.integers(1, 25, size=n_sectors))
    walk_min[0] = 1  # the parking lot boulders really are at the parking lot

    # Boulders: assign to sectors, give each an angle, texture, height, and a
    # "size" that sets how many problems it holds (a few big ones dominate).
    b_sector = rng.integers(0, n_sectors, size=cfg.n_boulders)
    b_sector[:n_sectors] = np.arange(n_sectors)  # every sector has >= 1 boulder
    b_angle = rng.choice(ANGLES, size=cfg.n_boulders, p=[0.2, 0.35, 0.33, 0.12])
    b_texture = rng.choice(TEXTURES, size=cfg.n_boulders, p=[0.4, 0.3, 0.3])
    b_height_ft = np.clip(rng.lognormal(np.log(10), 0.35, size=cfg.n_boulders), 5, 30)
    b_quality = rng.normal(0, 0.4, size=cfg.n_boulders)
    b_size = rng.lognormal(0, 0.8, size=cfg.n_boulders)
    b_names = names.boulder_names(cfg.n_boulders, rng)

    counts = rng.multinomial(cfg.n_problems - cfg.n_boulders, b_size / b_size.sum()) + 1

    rows = []
    for b, n in enumerate(counts):
        angle, texture = b_angle[b], b_texture[b]
        crowded = n > 20  # big, busy boulders accumulate eliminates & link-ups
        for _ in range(n):
            traverse = rng.random() < (0.12 if angle in ("overhang", "roof") else 0.05)
            eliminate = rng.random() < (0.22 if crowded else 0.07)
            sit_start = rng.random() < (0.5 if angle in ("overhang", "roof") else 0.25)
            highball = b_height_ft[b] > 16 and not traverse

            tags: list[str] = []
            if angle != "vertical" and rng.random() < 0.85:
                tags.append(angle)
            if texture != "mixed" and rng.random() < 0.6:
                tags.append(texture)
            w = np.array(_MOVE_WEIGHTS_BY_ANGLE[angle], dtype=float)
            for t in rng.choice(_MOVE_POOL, size=rng.integers(1, 3), replace=False, p=w / w.sum()):
                if t not in tags:
                    tags.append(str(t))
            if traverse:
                tags.append("traverse")
            if eliminate:
                tags.append("eliminate")
            if highball:
                tags.append("highball")

            shift = {"slab": -1.0, "vertical": 0.0, "overhang": 0.6, "roof": 1.2}[angle]
            shift += 0.5 * traverse + 0.8 * eliminate + 0.3 * sit_start
            base = rng.choice(len(GRADE_WEIGHTS), p=GRADE_WEIGHTS / GRADE_WEIGHTS.sum())
            grade = int(np.clip(round(base + shift + rng.normal(0, 0.5)), 0, MAX_GRADE))

            reach = rng.normal(0, 0.45) + (0.45 if "dyno" in tags else 0) - (0.3 if "compression" in tags else 0)
            reach = float(np.clip(reach, -1, 1))
            if reach > 0.5:
                tags.append("reachy")
            elif reach < -0.5:
                tags.append("bunchy")

            quality = 2.0 + b_quality[b] + rng.normal(0, 0.7) - 1.1 * eliminate - 0.3 * traverse + 0.4 * highball
            rows.append(dict(
                name=names.problem_name(rng, sit_start=sit_start, eliminate=eliminate, traverse=traverse),
                sector=names.SECTOR_NAMES[b_sector[b]],
                sector_walk_min=int(walk_min[b_sector[b]]),
                boulder=b_names[b],
                grade=grade,
                grade_label=f"V{grade}",
                styles="|".join(tags),
                height_ft=round(float(b_height_ft[b]), 1),
                sit_start=sit_start,
                true_quality=round(float(np.clip(quality, 0, 4)), 3),
                true_reach=round(reach, 3),
            ))

    problems = pd.DataFrame(rows)
    problems.insert(0, "problem_id", [f"b{i:04d}" for i in range(len(problems))])
    # The draws above use placeholder names (kept so the random stream, and so
    # every grade, style and tick, stays the same); naming gives the real ones.
    return naming.rename_crag(problems, seed=cfg.seed)


# --------------------------------------------------------------------------
# Climbers
# --------------------------------------------------------------------------

def make_climbers(cfg: SimConfig, rng: np.random.Generator) -> pd.DataFrame:
    start, end = date.fromisoformat(cfg.start_date), date.fromisoformat(cfg.end_date)
    total_days = (end - start).days
    types = list(VISITOR_TYPES)
    shares = np.array([VISITOR_TYPES[t][0] for t in types])

    rows = []
    n_random = cfg.n_climbers - len(cfg.personas)
    specs: list[dict] = [dict(p) for p in cfg.personas] + [{} for _ in range(n_random)]
    for i, spec in enumerate(specs):
        vtype = spec.get("visitor_type") or str(rng.choice(types, p=shares))
        sex = spec.get("sex") or str(rng.choice(["M", "F"], p=[0.68, 0.32]))
        height = spec.get("height_cm") or float(rng.normal(178, 7) if sex == "M" else rng.normal(165, 6.5))
        ape = spec.get("ape_cm", float(rng.normal(1.5, 4)))

        skill_mu = {"tourist": 4.0, "occasional": 3.5, "regular": 4.5, "local_hero": 6.5}[vtype]
        skill_start = spec.get("skill_start", float(np.clip(rng.normal(skill_mu, 2.0), 0, 12)))
        gain_hi = {"tourist": 0.0, "occasional": 1.5, "regular": 3.0, "local_hero": 3.0}[vtype]
        skill_gain = spec.get("skill_gain", float(rng.uniform(0, gain_hi)))

        # Active period.
        if vtype == "tourist":
            span_days = int(rng.integers(1, 10))
        else:
            span_years = {"occasional": (1, 6), "regular": (1, 8), "local_hero": (3, 9)}[vtype]
            span_days = int(rng.uniform(*span_years) * 365)
        first = start + timedelta(days=int(rng.integers(0, max(1, total_days - min(span_days, total_days - 1)))))
        last = min(end, first + timedelta(days=span_days))

        # Preferences: mild noise, plus a couple of strong likes and dislikes.
        pref = rng.normal(0, 0.5, size=len(PREF_STYLES))
        likes = spec.get("likes") or list(rng.choice(PREF_STYLES, size=rng.integers(1, 4), replace=False))
        remaining = [s for s in PREF_STYLES if s not in likes]
        dislikes = spec.get("dislikes") or list(rng.choice(remaining, size=rng.integers(0, 3), replace=False))
        for s in likes:
            pref[_STYLE_IDX[s]] += 1.5
        for s in dislikes:
            pref[_STYLE_IDX[s]] -= 1.5
        # People tend to be good at what they like (and vice versa).
        strength = 0.35 * pref + rng.normal(0, 0.4, size=len(PREF_STYLES))

        row = dict(
            climber_id=spec.get("climber_id", f"c{i:04d}"),
            sex=sex,
            height_cm=round(height, 1),
            ape_cm=round(ape, 1),
            visitor_type=vtype,
            first_visit=first.isoformat(),
            last_visit=last.isoformat(),
            true_skill_start=round(skill_start, 2),
            true_skill_gain=round(skill_gain, 2),
            true_classic_chaser=spec.get("classic_chaser", float(rng.gamma(2, 0.4))),
            true_log_rate=float(rng.beta(5, 2)) if "log_rate" not in spec else spec["log_rate"],
            true_logs_hard_only=bool(rng.random() < 0.2),
            true_likes="|".join(likes),
            true_dislikes="|".join(dislikes),
        )
        row.update({f"true_pref_{s}": round(float(v), 3) for s, v in zip(PREF_STYLES, pref)})
        row.update({f"true_strength_{s}": round(float(v), 3) for s, v in zip(PREF_STYLES, strength)})
        rows.append(row)
    return pd.DataFrame(rows)


def _session_dates(c: pd.Series, rng: np.random.Generator) -> list[date]:
    first, last = date.fromisoformat(c.first_visit), date.fromisoformat(c.last_visit)
    days = [first + timedelta(days=d) for d in range((last - first).days + 1)]
    if c.visitor_type == "tourist":
        k = min(len(days), int(rng.integers(1, 4)))
        return sorted(rng.choice(days, size=k, replace=False).tolist())
    lo, hi = VISITOR_TYPES[c.visitor_type][1]
    per_year = rng.uniform(lo, hi)
    months = np.array([d.month - 1 for d in days])
    p = per_year / 365 * SEASON_WEIGHTS[months] / SEASON_WEIGHTS.mean()
    return [d for d, hit in zip(days, rng.random(len(days)) < p) if hit]


# --------------------------------------------------------------------------
# Ascents
# --------------------------------------------------------------------------

def simulate_ticks(problems: pd.DataFrame, climbers: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    n_p = len(problems)
    grade = problems.grade.to_numpy(float)
    quality = problems.true_quality.to_numpy(float)
    reach = problems.true_reach.to_numpy(float)
    walk = problems.sector_walk_min.to_numpy(float)
    sectors = problems.sector.unique()
    sector_of = problems.sector.map({s: i for i, s in enumerate(sectors)}).to_numpy()
    sector_access = np.array([1.0 / np.sqrt(walk[sector_of == s][0]) for s in range(len(sectors))])

    # Problem x style indicator matrix, normalised so multi-tag problems
    # aren't automatically more extreme.
    tag_mat = np.zeros((n_p, len(PREF_STYLES)))
    for i, tags in enumerate(problems.styles):
        for t in tags.split("|"):
            if t in _STYLE_IDX:
                tag_mat[i, _STYLE_IDX[t]] = 1.0
    tag_mat /= np.sqrt(np.maximum(tag_mat.sum(1, keepdims=True), 1))

    pref_cols = [f"true_pref_{s}" for s in PREF_STYLES]
    str_cols = [f"true_strength_{s}" for s in PREF_STYLES]
    affinity = climbers[pref_cols].to_numpy() @ tag_mat.T         # climbers x problems
    strength = climbers[str_cols].to_numpy() @ tag_mat.T
    reach_cm = (climbers.height_cm + climbers.ape_cm).to_numpy()
    morph = np.outer((reach_cm - 176) / 10 * 0.9, reach)           # + = easier for you

    popularity = np.zeros(n_p)  # running tick counts -> rich-get-richer effect
    ticks = []

    # Interleave everyone's sessions chronologically so popularity evolves
    # the way it would on a real website.
    sessions = []
    for ci, c in climbers.iterrows():
        for d in _session_dates(c, rng):
            sessions.append((d, ci))
    sessions.sort()

    n_c = len(climbers)
    sent = np.zeros((n_c, n_p), dtype=bool)
    project = np.zeros((n_c, n_p), dtype=bool)
    home = rng.dirichlet(np.full(len(sectors), 0.6), size=n_c)  # favourite sectors
    first_visit = pd.to_datetime(climbers.first_visit).dt.date.to_numpy()
    skill0 = climbers.true_skill_start.to_numpy()
    gain = climbers.true_skill_gain.to_numpy()
    chaser = climbers.true_classic_chaser.to_numpy()
    log_rate = climbers.true_log_rate.to_numpy()
    hard_only = climbers.true_logs_hard_only.to_numpy()
    vtype = climbers.visitor_type.to_numpy()
    cids = climbers.climber_id.to_numpy()
    pids = problems.problem_id.to_numpy()
    in_sector = np.stack([sector_of == s for s in range(len(sectors))])

    for d, ci in sessions:
        years_in = (d - first_visit[ci]).days / 365
        skill = skill0[ci] + gain[ci] * (1 - np.exp(-years_in / 1.5))

        sec_p = sector_access * (0.3 + home[ci]) if vtype[ci] != "tourist" else sector_access**2
        sec_p = sec_p / sec_p.sum()
        chosen = rng.choice(len(sectors), size=rng.integers(1, 3), replace=False, p=sec_p)
        cand = np.flatnonzero(in_sector[chosen].any(0) & ~sent[ci])
        if len(cand) == 0:
            continue

        target = skill - 1.2
        u = (
            -0.5 * ((grade[cand] - target) / 1.6) ** 2
            - 4.0 * np.maximum(0, grade[cand] - (skill + 1.5))
            + 0.9 * affinity[ci, cand]
            + 0.5 * quality[cand]
            + 0.25 * chaser[ci] * (quality[cand] + np.log1p(popularity[cand]))
            + 1.5 * project[ci, cand]
        )
        k = min(len(cand), int(rng.poisson(VISITOR_TYPES[vtype[ci]][2])) + 1)
        w = np.exp(u - u.max())
        tried = rng.choice(cand, size=k, replace=False, p=w / w.sum())

        for p in tried:
            margin = skill + strength[ci, p] + morph[ci, p] - grade[p]
            enjoy = 0.6 * (quality[p] - 2) + 0.8 * affinity[ci, p] + rng.normal(0, 0.5)
            first_go = not project[ci, p]
            if rng.random() < _sigmoid(1.5 * margin - 1.1):
                sent[ci, p] = True
                project[ci, p] = False
                popularity[p] += 1
                hard_enough = grade[p] >= skill - 2.5 or not hard_only[ci]
                if rng.random() < log_rate[ci] and hard_enough:
                    flash = first_go and rng.random() < _sigmoid(1.0 * margin - 2.0)
                    ticks.append(_tick(cids[ci], pids[p], int(grade[p]), d, "Flash" if flash else "Send",
                                       enjoy, strength[ci, p] + morph[ci, p], rng))
            else:
                if enjoy > 0.3 and margin > -2.5:
                    project[ci, p] = True
                if rng.random() < 0.04 * log_rate[ci]:
                    ticks.append(_tick(cids[ci], pids[p], int(grade[p]), d, "Attempt", enjoy, None, rng))

    df = pd.DataFrame(ticks)
    df.insert(0, "tick_id", [f"t{i:06d}" for i in range(len(df))])
    return df


def _tick(climber_id, problem_id, grade, d, style, enjoy, ease, rng) -> dict:
    stars = int(np.clip(round(2.2 + enjoy + rng.normal(0, 0.4)), 0, 4)) if rng.random() < 0.8 else None
    suggested = None
    if ease is not None and rng.random() < 0.6:
        # Problems that suit you feel soft, so you suggest a lower grade.
        suggested = int(np.clip(round(grade - 0.5 * ease + rng.normal(0, 0.45)), 0, MAX_GRADE + 1))
    return dict(
        climber_id=climber_id,
        problem_id=problem_id,
        date=d.isoformat(),
        style=style,
        stars=stars,
        suggested_grade=suggested,
    )


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def simulate(cfg: SimConfig | None = None) -> dict[str, pd.DataFrame]:
    cfg = cfg or SimConfig()
    rng = np.random.default_rng(cfg.seed)
    problems = make_crag(cfg, rng)
    climbers = make_climbers(cfg, rng)
    ticks = simulate_ticks(problems, climbers, rng)
    for col in ("stars", "suggested_grade"):
        ticks[col] = ticks[col].astype("Int64")
    return dict(problems=problems, climbers=climbers, ticks=ticks)


def write(tables: dict[str, pd.DataFrame], out_dir: Path, cfg: SimConfig) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        df.to_csv(out_dir / f"{name}.csv", index=False)
    (out_dir / "config.json").write_text(json.dumps(asdict(cfg), indent=2) + "\n")
