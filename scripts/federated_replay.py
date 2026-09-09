"""Run hierarchical federated averaging on the demo ledger and store the replay for the System panel.
Tier 1: districts of the hero state as nodes (state aggregator). Tier 2: demo states as nodes (national aggregator).
Only weights and sample counts move between nodes; rows_crossed_border is recorded from the aggregators."""
import json
import sys
import time

sys.path.insert(0, "backend")
from sanjeevani import paths  # noqa: E402
from sanjeevani.federated import fedavg as F, nodes as N  # noqa: E402


def serialise(history, summary, tier, nodes):
    return {"tier": tier, "summary": summary, "nodes": [{"name": n.name, "group": n.group, "rows": n.rows, "holdout_rows": int(len(n.y_test))} for n in nodes],
            "rounds": [{"round": h.round, "global": h.global_metrics, "rows_crossed": h.rows_crossed, "per_node": h.per_node} for h in history]}


if __name__ == "__main__":
    t0 = time.time()
    out = {"generated": time.strftime("%Y-%m-%d %H:%M"), "method": "FedAvg (McMahan et al. 2017), hierarchical, logistic stock-out-risk model, numpy",
           "features": ["days_of_stock", "log_demand", "demand_trend", "lead_days", "month_sin", "month_cos", "driver_delta"], "tiers": {}}
    def report(key, label, nodes):
        h, s = F.run(nodes, rounds=6, local_epochs=2)
        out["tiers"][key] = serialise(h, s, label, nodes)
        print(f"  {key}: {s['nodes']} nodes | local-only {s['mean_auc_local_only']:.3f} | federated {s['mean_auc_federated']:.3f} | personalised {s['mean_auc_personalised']:.3f} | fed>=local on {s['federated_better_or_equal_nodes']}, personalised>=local on {s['personalised_better_or_equal_nodes']} | rows crossed {s['rows_crossed_border']} ({time.time()-t0:.0f}s)", flush=True)
    report("districts_bihar_coldstart", "Districts of Bihar, first months of reporting (600 rows each) -> Bihar state aggregator", N.district_nodes("bihar", sample_per_district=600))
    report("districts_bihar", "Districts of Bihar, three years of data -> Bihar state aggregator", N.district_nodes("bihar"))
    report("states_india", "Demo states and UTs -> national aggregator", N.state_nodes())
    (paths.DATA_PROCESSED / "federated_replay.json").write_text(json.dumps(out, indent=1, default=float))
    print("written data/processed/federated_replay.json")
