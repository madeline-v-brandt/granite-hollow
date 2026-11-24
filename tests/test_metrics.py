import math

from climbrec.evaluate import ndcg_at_k, recall_at_k


def test_recall_counts_hits_over_min_relevant_k():
    assert recall_at_k(["a", "b", "c"], {"a", "c", "z"}, k=3) == 2 / 3
    assert recall_at_k(["a", "b"], {"a", "b", "c", "d"}, k=2) == 1.0  # capped at k
    assert math.isnan(recall_at_k(["a"], set(), k=5))


def test_ndcg_rewards_hits_near_the_top():
    assert ndcg_at_k(["a", "b"], {"a"}, k=2) == 1.0
    assert ndcg_at_k(["b", "a"], {"a"}, k=2) < 1.0
    assert ndcg_at_k(["x", "y"], {"a"}, k=2) == 0.0
