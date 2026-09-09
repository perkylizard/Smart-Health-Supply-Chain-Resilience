"""Federated averaging (McMahan et al., 2017), hierarchical: leaf nodes -> group aggregators -> a top aggregator.
Only Weights objects cross node boundaries. `Aggregator.rows_seen` is asserted to stay 0 in tests."""
from dataclasses import dataclass, field

import numpy as np

from sanjeevani.federated.model import Weights, evaluate, init_weights, train_local


@dataclass
class Node:
    name: str
    group: str                 # e.g. state name for a district node; "India" for a state node
    X_train: np.ndarray
    y_train: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    rows: int = 0

    def __post_init__(self):
        self.rows = int(len(self.y_train))


@dataclass
class Aggregator:
    name: str
    rows_seen: int = 0         # must remain 0: the aggregator only ever receives weights and sample counts

    def average(self, updates: list[tuple[Weights, int]]) -> Weights:
        total = sum(n for _, n in updates)
        w = sum(u.w * n for u, n in updates) / max(1, total)
        return Weights(w)


@dataclass
class RoundMetrics:
    round: int
    global_metrics: dict
    per_node: dict = field(default_factory=dict)   # node -> {"federated": metrics, "local_only": metrics}
    rows_crossed: int = 0


def run(nodes: list[Node], rounds: int = 5, local_epochs: int = 2, seed: int = 0) -> tuple[list[RoundMetrics], dict]:
    """Hierarchical FedAvg. Returns round metrics and the final comparison per node, including a 'personalised' variant:
    the final global model fine-tuned for one local epoch at each node (still no rows leave the node)."""
    if not nodes:
        raise ValueError("no nodes with enough data")
    groups = sorted({n.group for n in nodes})
    top = Aggregator("national" if len(groups) > 1 else groups[0])
    group_aggs = {g: Aggregator(g) for g in groups}
    global_w = init_weights()
    # local-only baselines: each node trains alone for rounds x local_epochs and is scored on its own holdout
    local_only = {}
    for i, n in enumerate(nodes):
        w = init_weights()
        for r in range(rounds):
            w = train_local(w, n.X_train, n.y_train, epochs=local_epochs, seed=seed + r * 100 + i)
        local_only[n.name] = evaluate(w, n.X_test, n.y_test)
    history: list[RoundMetrics] = []
    for r in range(rounds):
        group_updates: list[tuple[Weights, int]] = []
        for g in groups:
            updates = []
            for i, n in enumerate([x for x in nodes if x.group == g]):
                w_i = train_local(global_w, n.X_train, n.y_train, epochs=local_epochs, seed=seed + r * 100 + i)
                updates.append((w_i, n.rows))           # weights and a count leave the node; rows do not
            gw = group_aggs[g].average(updates)
            group_updates.append((gw, sum(n for _, n in updates)))
        global_w = top.average(group_updates)
        Xt = np.vstack([n.X_test for n in nodes]); yt = np.concatenate([n.y_test for n in nodes])
        rm = RoundMetrics(round=r + 1, global_metrics=evaluate(global_w, Xt, yt), rows_crossed=top.rows_seen + sum(a.rows_seen for a in group_aggs.values()))
        for n in nodes:
            rm.per_node[n.name] = {"federated": evaluate(global_w, n.X_test, n.y_test), "local_only": local_only[n.name], "group": n.group, "rows": n.rows}
        history.append(rm)
    final = history[-1].per_node
    for i, n in enumerate(nodes):  # personalisation: one local epoch from the global model, evaluated on the node's holdout
        pw = train_local(global_w, n.X_train, n.y_train, epochs=1, lr=0.1, seed=seed + 999 + i)
        final[n.name]["personalised"] = evaluate(pw, n.X_test, n.y_test)
    def _mean(k): return float(np.nanmean([v[k]["auc"] for v in final.values()]))
    wins = sum(1 for v in final.values() if not np.isnan(v["federated"]["auc"]) and v["federated"]["auc"] >= v["local_only"]["auc"])
    wins_p = sum(1 for v in final.values() if not np.isnan(v["personalised"]["auc"]) and v["personalised"]["auc"] >= v["local_only"]["auc"])
    summary = {"nodes": len(nodes), "groups": groups, "rounds": rounds, "federated_better_or_equal_nodes": wins, "personalised_better_or_equal_nodes": wins_p,
               "mean_auc_federated": _mean("federated"), "mean_auc_local_only": _mean("local_only"), "mean_auc_personalised": _mean("personalised"),
               "rows_crossed_border": history[-1].rows_crossed, "global": history[-1].global_metrics}
    return history, summary
