"""Google predictive modelling in BigQuery: TimesFM (AI.FORECAST) and ARIMA_PLUS on the real district series.

  uv run python scripts/bq_forecast.py backtest   # hold out Jan-Mar 2020, compare baseline vs ARIMA_PLUS vs TimesFM (hero state)
  uv run python scripts/bq_forecast.py cache      # 8-month TimesFM forecast for every district x driver item, all states -> parquet cache

The app reads the parquet cache (method 'bigquery_timesfm'); nothing calls BigQuery at request time."""
import re
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "backend"); sys.path.insert(0, "scripts")
from bq_setup import client, env  # noqa: E402
from sanjeevani import paths  # noqa: E402
from sanjeevani.engines import forecast as F  # noqa: E402

CUT = "2020-01-01"  # holdout = Jan, Feb, Mar 2020 (last 3 months of the real series)


def _mape(pred, actual):
    a = np.asarray(actual, float); p = np.asarray(pred, float)
    return float(np.mean(np.abs(p - a) / np.maximum(np.abs(a), 1.0)))


def backtest(project, dataset, state="Bihar"):
    c = client(project); T = f"`{project}.{dataset}.district_monthly_real`"
    t0 = time.time()
    hist = c.query(f"SELECT district, item_code, month_start, value FROM {T} WHERE state='{state}' ORDER BY district, item_code, month_start").result().to_dataframe()
    hist["month_start"] = pd.to_datetime(hist["month_start"])
    train = hist[hist["month_start"] < CUT]; test = hist[hist["month_start"] >= CUT]
    print(f"{state}: {hist.groupby(['district','item_code']).ngroups} series, holdout rows {len(test)} ({time.time()-t0:.0f}s)")
    # 1. baseline (our engine, monthly resolution: sum the weekly forecast back into months)
    base = {}
    for (d, i), g in train.groupby(["district", "item_code"]):
        fc = F.forecast_series(g["value"].to_numpy(), horizon_weeks=14)
        monthly = [fc.point[int(k * F.WEEKS_PER_MONTH):int((k + 1) * F.WEEKS_PER_MONTH)].sum() for k in range(3)]
        base[(d, i)] = monthly
    # 2. TimesFM via AI.FORECAST, all series in one statement
    tfm = c.query(f"""
        SELECT district, item_code, forecast_timestamp, forecast_value FROM AI.FORECAST(
          (SELECT district, item_code, month_start, value FROM {T} WHERE state='{state}' AND month_start < '{CUT}'),
          data_col => 'value', timestamp_col => 'month_start', id_cols => ['district', 'item_code'], horizon => 3)""").result().to_dataframe()
    print(f"TimesFM forecast rows {len(tfm)} ({time.time()-t0:.0f}s)")
    # 3. ARIMA_PLUS: one multi-series model, trained on the same window
    model = f"`{project}.{dataset}.arima_{re.sub(r'[^a-z0-9]+', '_', state.lower())}`"
    c.query(f"""
        CREATE OR REPLACE MODEL {model}
        OPTIONS(model_type='ARIMA_PLUS', time_series_timestamp_col='month_start', time_series_data_col='value',
                time_series_id_col=['district', 'item_code'], data_frequency='MONTHLY', holiday_region='IN', auto_arima=TRUE) AS
        SELECT district, item_code, month_start, value FROM {T} WHERE state='{state}' AND month_start < '{CUT}'""").result()
    arima = c.query(f"SELECT district, item_code, forecast_timestamp, forecast_value FROM ML.FORECAST(MODEL {model}, STRUCT(3 AS horizon, 0.9 AS confidence_level))").result().to_dataframe()
    print(f"ARIMA_PLUS forecast rows {len(arima)} ({time.time()-t0:.0f}s)")
    # score
    rows = []
    for (d, i), g in test.groupby(["district", "item_code"]):
        actual = g.sort_values("month_start")["value"].to_numpy()[:3]
        if len(actual) < 3 or (d, i) not in base:
            continue
        b = base[(d, i)]
        t = tfm[(tfm["district"] == d) & (tfm["item_code"] == i)].sort_values("forecast_timestamp")["forecast_value"].to_numpy()[:3]
        a = arima[(arima["district"] == d) & (arima["item_code"] == i)].sort_values("forecast_timestamp")["forecast_value"].to_numpy()[:3]
        if len(t) < 3 or len(a) < 3:
            continue
        rows.append({"district": d, "item_code": i, "baseline": _mape(b, actual), "arima_plus": _mape(a, actual), "timesfm": _mape(t, actual), "mean_actual": float(actual.mean())})
    r = pd.DataFrame(rows)
    r = r[r["mean_actual"] >= 20]  # ignore near-empty series where MAPE is meaningless
    summary = r[["baseline", "arima_plus", "timesfm"]].agg(["median", "mean"]).T.round(3)
    summary["series"] = len(r)
    wins = {m: int((r[m] <= r[["baseline", "arima_plus", "timesfm"]].min(axis=1) + 1e-9).sum()) for m in ("baseline", "arima_plus", "timesfm")}
    print(summary.to_string()); print("series where method is best:", wins)
    md = ["| Method | Median MAPE | Mean MAPE | Best on N series |", "|---|---|---|---|",
          f"| Seasonal-naive baseline (Python, always on) | {summary.loc['baseline','median']:.1%} | {summary.loc['baseline','mean']:.1%} | {wins['baseline']} |",
          f"| BigQuery ML ARIMA_PLUS (Google) | {summary.loc['arima_plus','median']:.1%} | {summary.loc['arima_plus','mean']:.1%} | {wins['arima_plus']} |",
          f"| BigQuery AI.FORECAST, TimesFM (Google) | {summary.loc['timesfm','median']:.1%} | {summary.loc['timesfm','mean']:.1%} | {wins['timesfm']} |",
          "", f"Real HMIS district series for {state}, {len(r)} district x item series with mean monthly value >= 20, trained to Dec 2019, held out Jan-Mar 2020. "
          f"Produced by `uv run python scripts/bq_forecast.py backtest` on {time.strftime('%Y-%m-%d')}."]
    table = "\n".join(md)
    readme = (paths.ROOT / "README.md").read_text()
    block = f"<!-- bq-eval:start -->\n{table}\n<!-- bq-eval:end -->"
    if "<!-- bq-eval:start -->" in readme:
        readme = re.sub(r"<!-- bq-eval:start -->.*?<!-- bq-eval:end -->", block, readme, flags=re.S)
    else:
        readme += f"\n\n### Google predictive modelling: district-level backtest\n\n{block}\n"
    (paths.ROOT / "README.md").write_text(readme)
    r.to_csv(paths.ROOT / "docs" / "research" / f"bq_backtest_{state.lower()}.csv", index=False)
    print(table)


def cache(project, dataset):
    c = client(project); T = f"`{project}.{dataset}.district_monthly_real`"
    t0 = time.time()
    df = c.query(f"""
        SELECT state, district, item_code, forecast_timestamp, forecast_value, prediction_interval_lower_bound AS lo, prediction_interval_upper_bound AS hi
        FROM AI.FORECAST((SELECT state, district, item_code, month_start, value FROM {T}),
                         data_col => 'value', timestamp_col => 'month_start', id_cols => ['state', 'district', 'item_code'], horizon => 8, confidence_level => 0.8)""").result().to_dataframe()
    df["method"] = "bigquery_timesfm"; df["generated"] = time.strftime("%Y-%m-%d")
    df.to_parquet(paths.DATA_PROCESSED / "bq_district_forecast.parquet", index=False)
    print(f"cached {len(df):,} forecast rows for {df.groupby(['state','district','item_code']).ngroups:,} series ({time.time()-t0:.0f}s)")


if __name__ == "__main__":
    project, dataset = env()
    {"backtest": backtest, "cache": cache}[sys.argv[1]](project, dataset)
