import numpy as np
import pytest

from sanjeevani.federated import fedavg as F
from sanjeevani.federated.model import Weights, evaluate, featurise, init_weights, predict_proba, train_local


def _synthetic(n, seed, shift=0.0):
    """Nodes share the same true rule (stock-out when days_of_stock low and demand rising) with node-specific noise."""
    rng = np.random.default_rng(seed)
    days = rng.uniform(0, 60, n); demand = rng.uniform(10, 300, n); prev = demand * rng.uniform(0.6, 1.4, n)
    lead = rng.uniform(4, 14, n); month = rng.integers(1, 13, n); delta = rng.normal(shift, 0.3, n)
    logit = -1.5 + 3.0 * (14 - days) / 14 + 1.2 * ((demand + 1) / (prev + 1) - 1) + 0.8 * delta
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(float)
    X = featurise(days, demand, prev, lead, month, delta)
    return X, y


def _node(name, group, n=1500, seed=0, shift=0.0):
    X, y = _synthetic(n, seed, shift)
    k = int(n * 0.7)
    return F.Node(name, group, X[:k], y[:k], X[k:], y[k:])


def test_aggregator_weighted_average():
    a = F.Aggregator("x")
    out = a.average([(Weights(np.array([1.0, 2.0])), 1), (Weights(np.array([3.0, 6.0])), 3)])
    assert np.allclose(out.w, [2.5, 5.0]) and a.rows_seen == 0


def test_local_training_reduces_loss():
    X, y = _synthetic(3000, 1)
    w0 = init_weights(); w1 = train_local(w0, X, y, epochs=3)
    assert evaluate(w1, X, y)["logloss"] < evaluate(w0, X, y)["logloss"]
    assert evaluate(w1, X, y)["auc"] > 0.75


def test_hierarchical_fedavg_beats_small_local_nodes():
    # small district nodes alone learn poorly; federated across them approaches the pooled rule
    nodes = [_node(f"d{i}", "S1" if i < 4 else "S2", n=250, seed=i) for i in range(8)]
    hist, summary = F.run(nodes, rounds=6, local_epochs=2)
    assert summary["rows_crossed_border"] == 0
    assert len(hist) == 6 and hist[-1].global_metrics["auc"] > 0.75
    assert summary["mean_auc_federated"] >= summary["mean_auc_local_only"] - 0.02
    assert summary["federated_better_or_equal_nodes"] >= 4


def test_deterministic():
    nodes = [_node(f"d{i}", "S", n=400, seed=i) for i in range(3)]
    a = F.run(nodes, rounds=2)[1]; b = F.run(nodes, rounds=2)[1]
    assert a["mean_auc_federated"] == b["mean_auc_federated"]


def test_node_rows_never_reach_aggregator(monkeypatch):
    seen = []
    orig = F.Aggregator.average
    def spy(self, updates):
        for u, n in updates:
            assert isinstance(u, Weights) and isinstance(n, int) and u.w.ndim == 1 and u.w.shape[0] <= 12
            seen.append(n)
        return orig(self, updates)
    monkeypatch.setattr(F.Aggregator, "average", spy)
    nodes = [_node(f"d{i}", "S", n=300, seed=i) for i in range(3)]
    F.run(nodes, rounds=1)
    assert seen and all(isinstance(s, int) for s in seen)
