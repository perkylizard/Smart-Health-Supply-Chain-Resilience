"""A small, transparent stock-out risk model: logistic regression trained with mini-batch SGD in numpy.
Features use fixed scalings only (no data-dependent statistics), so every node transforms rows identically without
sharing anything. Predicts: will this facility x commodity stock out next month?"""
from dataclasses import dataclass

import numpy as np

FEATURES = ["days_of_stock", "log_demand", "demand_trend", "lead_days", "month_sin", "month_cos", "driver_delta"]


def featurise(days_of_stock, demand, demand_prev3, lead_days, month, driver_delta) -> np.ndarray:
    d = np.asarray(days_of_stock, float); dm = np.asarray(demand, float); dp = np.asarray(demand_prev3, float)
    trend = np.clip((dm + 1.0) / (dp + 1.0), 0.2, 5.0)
    m = np.asarray(month, float)
    X = np.column_stack([
        np.clip(d, 0, 120) / 60.0, np.log1p(np.maximum(dm, 0)) / 10.0, (trend - 1.0), np.clip(np.asarray(lead_days, float), 0, 30) / 14.0,
        np.sin(2 * np.pi * m / 12), np.cos(2 * np.pi * m / 12), np.clip(np.asarray(driver_delta, float), -1, 3),
    ])
    return np.column_stack([np.ones(len(X)), X])  # bias column


@dataclass
class Weights:
    w: np.ndarray

    def copy(self) -> "Weights":
        return Weights(self.w.copy())


def init_weights(n_features: int = len(FEATURES)) -> Weights:
    return Weights(np.zeros(n_features + 1))


def predict_proba(W: Weights, X: np.ndarray) -> np.ndarray:
    z = X @ W.w
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def train_local(W: Weights, X: np.ndarray, y: np.ndarray, epochs: int = 2, lr: float = 0.3, batch: int = 512, l2: float = 1e-4, seed: int = 0) -> Weights:
    """Returns new weights after local SGD epochs from W. Class-balanced loss so rare stock-outs are not ignored."""
    rng = np.random.default_rng(seed)
    w = W.w.copy(); n = len(y)
    pos = max(1, int(y.sum())); neg = max(1, n - pos)
    wt = np.where(y > 0.5, 0.5 * n / pos, 0.5 * n / neg)
    for _ in range(epochs):
        idx = rng.permutation(n)
        for s in range(0, n, batch):
            b = idx[s:s + batch]
            p = 1.0 / (1.0 + np.exp(-np.clip(X[b] @ w, -30, 30)))
            g = (X[b] * ((p - y[b]) * wt[b])[:, None]).mean(axis=0) + l2 * np.r_[0.0, w[1:]]
            w -= lr * g
    return Weights(w)


def evaluate(W: Weights, X: np.ndarray, y: np.ndarray) -> dict:
    p = predict_proba(W, X)
    eps = 1e-7
    ll = float(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)))
    # AUC by rank statistic
    pos = p[y > 0.5]; neg = p[y <= 0.5]
    if len(pos) == 0 or len(neg) == 0:
        auc = float("nan")
    else:
        order = np.argsort(np.concatenate([pos, neg])); ranks = np.empty(len(order)); ranks[order] = np.arange(1, len(order) + 1)
        auc = float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))
    pred = p >= 0.5
    tp = int((pred & (y > 0.5)).sum()); fp = int((pred & (y <= 0.5)).sum()); fn = int((~pred & (y > 0.5)).sum())
    return {"auc": round(auc, 4), "logloss": round(ll, 4), "precision": round(tp / max(1, tp + fp), 4), "recall": round(tp / max(1, tp + fn), 4), "n": int(len(y)), "positives": int((y > 0.5).sum())}
