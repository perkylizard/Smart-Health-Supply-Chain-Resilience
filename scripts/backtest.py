"""Evaluation: forecast MAPE by commodity category on a 3-month holdout (hero unit), and red-alert precision/recall
against simulated stock-outs in the holdout window. Writes a markdown table into README between eval markers."""
import re
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "backend")
from sanjeevani import paths  # noqa: E402
from sanjeevani.engines import alerts as A, forecast as F  # noqa: E402
from sanjeevani.engines.store import Store  # noqa: E402

HOLDOUT = 3


def main():
    t0 = time.time()
    st = Store()
    com = st.commodities().set_index("commodity_id")
    hero = st.units().query("is_hero == 1").iloc[0]["unit_id"]
    # sample facilities to keep the run under a minute
    fac = st.facilities(hero)
    sample = fac[fac["type"] == "PHC"].sample(n=min(150, (fac["type"] == "PHC").sum()), random_state=7)["facility_id"].tolist()
    hist = st.q("SELECT facility_id, commodity_id, month_index, demand, stockout, closing FROM ledger WHERE unit_id = ? AND facility_id IN (SELECT unnest(?::VARCHAR[])) ORDER BY facility_id, commodity_id, month_index", [hero, sample])
    # 1. forecast accuracy
    bt = F.backtest(hist[["facility_id", "commodity_id", "month_index", "demand"]], HOLDOUT)
    bt["category"] = bt["commodity_id"].map(com["category"])
    acc = bt.groupby("category")["mape"].agg(["median", "mean", "count"]).round(3).reset_index()
    # 2. alert quality: alerts computed at cut month, compared to any stock-out in the next HOLDOUT months
    last = int(hist["month_index"].max()); cut = last - HOLDOUT
    window = st.ledger_window(hero, 4 + HOLDOUT)
    window = window[window["facility_id"].isin(sample)]
    train = window[window["month_index"] <= cut]
    latest = train[train["month_index"] == cut]
    fc = F.forecast_frame(train[["facility_id", "commodity_id", "month_index", "demand"]])
    al = A.compute_alerts(latest, train, fc)
    fut = hist[(hist["month_index"] > cut)].groupby(["facility_id", "commodity_id"])["stockout"].max().rename("future_stockout").reset_index()
    ev = al.merge(fut, on=["facility_id", "commodity_id"], how="left").fillna({"future_stockout": False})
    ev = ev[~ev["data_issue"]]
    pred = ev["severity"].isin(["red", "amber"]); truth = ev["future_stockout"].astype(bool)
    tp = int((pred & truth).sum()); fp = int((pred & ~truth).sum()); fn = int((~pred & truth).sum())
    prec = tp / max(1, tp + fp); rec = tp / max(1, tp + fn)
    rows = ["| Metric | Value |", "|---|---|",
            f"| Hero unit | {hero} |", f"| Facilities sampled | {len(sample)} PHCs |", f"| Holdout | last {HOLDOUT} months of 36 |",
            f"| Forecast median MAPE (all categories) | {bt['mape'].median():.1%} |",
            f"| Red/amber alert precision vs stock-out in next {HOLDOUT} months | {prec:.1%} |",
            f"| Red/amber alert recall | {rec:.1%} |", f"| Series evaluated | {len(bt):,} |", f"| Runtime | {time.time() - t0:.0f} s |",
            "", "| Category | Median MAPE | Mean MAPE | Series |", "|---|---|---|---|"]
    rows += [f"| {r.category} | {r['median']:.1%} | {r['mean']:.1%} | {int(r['count'])} |" for _, r in acc.iterrows()]
    table = "\n".join(rows)
    readme = (paths.ROOT / "README.md").read_text()
    block = f"<!-- eval:start -->\n{table}\n<!-- eval:end -->"
    if "<!-- eval:start -->" in readme:
        readme = re.sub(r"<!-- eval:start -->.*?<!-- eval:end -->", block, readme, flags=re.S)
    else:
        readme += f"\n\n## Evaluation\n\nProduced by `uv run python scripts/backtest.py` on the simulated hero-unit ledger (see Data sources for what is real and what is simulated).\n\n{block}\n"
    (paths.ROOT / "README.md").write_text(readme)
    print(table)


if __name__ == "__main__":
    main()
