import pandas as pd
import pytest

from climbrec.data import load_dataset, temporal_split
from climbrec.evaluate import evaluate
from climbrec.recommenders import GradeAwarePopularity, PopularityRecommender
from climbrec.simulate.generate import SimConfig, simulate, write

SMALL = SimConfig(seed=1, n_problems=150, n_boulders=15, n_climbers=80)


@pytest.fixture(scope="module")
def ds(tmp_path_factory):
    out = tmp_path_factory.mktemp("sim")
    write(simulate(SMALL), out, SMALL)
    return load_dataset(out)


def test_simulation_is_deterministic():
    a, b = simulate(SMALL), simulate(SMALL)
    for name in a:
        pd.testing.assert_frame_equal(a[name], b[name])


def test_schema_and_ranges(ds):
    assert len(ds.problems) == SMALL.n_problems
    assert ds.problems.grade.between(0, 13).all()
    assert ds.ticks["style"].isin(["Flash", "Send", "Attempt"]).all()
    assert ds.ticks.problem_id.isin(ds.problems.problem_id).all()
    assert ds.ticks.climber_id.isin(ds.climbers.climber_id).all()
    assert "p_short_crimper" in set(ds.climbers.climber_id)


def test_latent_columns_hidden_by_default(ds):
    assert not any(c.startswith("true_") for c in ds.problems.columns)
    assert not any(c.startswith("true_") for c in ds.climbers.columns)


def test_split_does_not_leak_held_out_problems(ds):
    split = temporal_split(ds)
    assert len(split.test) > 0
    held = split.test.set_index(["climber_id", "problem_id"])["date"]
    tr = split.train.set_index(["climber_id", "problem_id"])
    overlap = tr.index.isin(held.index)
    # Only attempts made *before* the held-out send may remain in train.
    leftover = split.train[overlap]
    assert (leftover["style"] == "Attempt").all()
    assert (leftover["date"].to_numpy() < held.loc[tr.index[overlap]].to_numpy()).all()


def test_recommendations_exclude_sent_problems(ds):
    split = temporal_split(ds)
    rec = PopularityRecommender().fit(split.train, ds.problems)
    cid = split.test.climber_id.iloc[0]
    sent = set(split.train[(split.train.climber_id == cid) & (split.train["style"] != "Attempt")].problem_id)
    recs = rec.recommend(cid, 20)
    assert len(recs) == 20 and not sent & set(recs)


def test_baselines_run(ds):
    split = temporal_split(ds)
    for rec in (PopularityRecommender(), GradeAwarePopularity()):
        res = evaluate(rec, ds, split)
        assert res.recall.between(0, 1).all() and res.ndcg.between(0, 1).all()


def test_collaborative_recommenders_beat_random(ds):
    from climbrec.recommenders import ItemKNN, RandomRecommender, UserKNN

    split = temporal_split(ds)
    base = evaluate(RandomRecommender(), ds, split).recall.mean()
    for rec in (UserKNN(k=20), ItemKNN(k=20)):
        res = evaluate(rec, ds, split)
        assert res.recall.mean() > base
        cid = split.test.climber_id.iloc[0]
        recs = rec.recommend(cid, 20)
        sent = set(rec.train_sends.problem_id[rec.train_sends.climber_id == cid])
        assert len(recs) == 20 and not sent & set(recs)


def test_unknown_climber_falls_back_to_popularity(ds):
    from climbrec.recommenders import UserKNN

    split = temporal_split(ds)
    rec = UserKNN().fit(split.train, ds.problems)
    pop = PopularityRecommender().fit(split.train, ds.problems)
    assert rec.recommend("nobody", 10) == pop.recommend("nobody", 10)


def test_star_weighting():
    from climbrec.recommenders import UserKNN

    problems = pd.DataFrame({"problem_id": ["a", "b", "c"], "grade": [3, 4, 5]})
    train = pd.DataFrame({
        "climber_id": ["u", "u", "u", "v"],
        "problem_id": ["a", "b", "c", "a"],
        "date": pd.to_datetime(["2024-01-01"] * 4),
        "style": ["Send"] * 4,
        "stars": pd.array([4, 2, pd.NA, 3], dtype="Int64"),
    })
    plain = UserKNN(stars=0).fit(train, problems)
    assert (plain.R == plain.X).all()

    rec = UserKNN(stars=1, center_stars=True).fit(train, problems)
    u = rec._cids.get_loc("u")
    # u's mean rating is 3: the 4-star send weighs 1.5, the 2-star 0.5, unrated 1.
    assert rec.R[u].tolist() == [1.5, 0.5, 1.0]
    # v rated their only send at their own average -> weight 1.
    assert rec.R[rec._cids.get_loc("v")].tolist() == [1.0, 0.0, 0.0]


def test_style_profile_learns_tags_and_explains_itself():
    from climbrec.recommenders import StyleProfile

    # Climber "u" only sends crimpy problems; everyone else sends a mix.
    problems = pd.DataFrame({
        "problem_id": [f"p{i}" for i in range(8)],
        "grade": [3] * 8,
        "styles": ["crimpy", "crimpy|slab", "crimpy", "dyno", "dyno", "slab", "dyno|crimpy", "crimpy"],
    })
    rows = [("u", "p0"), ("u", "p1"), ("u", "p2")]
    rows += [(f"o{i}", p) for i in range(5) for p in ("p0", "p3", "p4", "p5")]
    train = pd.DataFrame(rows, columns=["climber_id", "problem_id"]).assign(
        date=pd.Timestamp("2024-01-01"), style="Send", stars=pd.array([pd.NA] * len(rows), dtype="Int64"))
    rec = StyleProfile(pop_weight=0).fit(train, problems)  # isolate the style term

    prof = rec.profile("u")
    assert prof["crimpy"] > 0 > prof["dyno"]
    assert rec.recommend("u", 1) == ["p7"]  # the unsent pure-crimp problem

    ex = rec.explain("u", "p6")
    assert set(ex) == {"dyno", "crimpy", "grade", "quality", "popularity"}
    assert sum(ex.values()) == pytest.approx(rec.score("u")["p6"])


def test_hybrid(ds):
    from climbrec.recommenders import Hybrid, RandomRecommender

    split = temporal_split(ds)
    rec = Hybrid(k=20)
    assert evaluate(rec, ds, split).recall.mean() > evaluate(RandomRecommender(), ds, split).recall.mean()

    cid = split.test.climber_id.iloc[0]
    top = rec.recommend(cid, 5)
    ex = rec.explain(cid, top[0])
    assert "similar_climbers" in ex and "popularity" in ex
    assert sum(ex.values()) == pytest.approx(rec.score(cid)[top[0]])
    assert 0 <= rec.similar_climbers_who_sent(cid, top[0]) <= 20
    assert rec.recommend("nobody", 5)  # cold start still returns something
