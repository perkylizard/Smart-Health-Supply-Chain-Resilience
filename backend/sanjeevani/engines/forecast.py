"""Demand forecaster: seasonal-naive x trend on monthly history, weekly horizon, P90 from residuals.
This is the always-available fallback; BigQuery AI.FORECAST plugs in behind the same Forecast type (Plan 5)."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

WEEKS_PER_MONTH = 52.0 / 12.0
P90_Z = 1.2816
P90_FLOOR = 0.25


@dataclass
class Forecast:
    point: np.ndarray
    p90: np.ndarray
    method: str


def forecast_series(y: np.ndarray, horizon_weeks: int = 8, season: int = 12, exog_mult: np.ndarray | None = None) -> Forecast:
    y = np.asarray(y, dtype=float)
    y = np.where(np.isfinite(y), y, 0.0)
    n = len(y)
    horizon_months = int(np.ceil(horizon_weeks / WEEKS_PER_MONTH)) + 1
    if n == 0:
        z = np.zeros(horizon_weeks)
        return Forecast(z, z, "empty")
    if n >= 2 * season:
        last, prev = y[-season:], y[-2 * season:-season]
        trend = (last.sum() + 1e-9) / (prev.sum() + 1e-9)
        trend = float(np.clip(trend, 0.7, 1.5))
        monthly = np.array([last[(i) % season] * trend for i in range(horizon_months)])
        fitted = prev * trend
        resid = last - fitted
        method = "seasonal_naive_trend"
    elif n >= season:
        last = y[-season:]
        monthly = np.array([last[i % season] for i in range(horizon_months)])
        resid = last - last.mean()
        method = "seasonal_naive"
    else:
        level = float(np.mean(y[-3:]))
        monthly = np.full(horizon_months, level)
        resid = y - level
        method = "mean"
    weekly = np.repeat(monthly / WEEKS_PER_MONTH, int(np.ceil(WEEKS_PER_MONTH)) + 1)[:horizon_weeks]
    if exog_mult is not None:
        weekly = weekly * np.asarray(exog_mult, dtype=float)[:horizon_weeks]
    sigma_w = float(np.std(resid)) / WEEKS_PER_MONTH if len(resid) > 1 else 0.0
    p90 = np.maximum(weekly + P90_Z * sigma_w, weekly * (1 + P90_FLOOR))
    return Forecast(np.maximum(weekly, 0.0), np.maximum(p90, 0.0), method)


def forecast_frame(hist: pd.DataFrame, horizon_weeks: int = 8, demand_mult: pd.Series | None = None) -> pd.DataFrame:
    """hist: facility_id, commodity_id, month_index, demand. demand_mult: optional per (facility_id, commodity_id) scalar."""
    rows = []
    for (fid, cid), g in hist.sort_values("month_index").groupby(["facility_id", "commodity_id"], sort=False):
        mult = float(demand_mult.get((fid, cid), 1.0)) if demand_mult is not None else 1.0
        fc = forecast_series(g["demand"].to_numpy(), horizon_weeks, exog_mult=np.full(horizon_weeks, mult))
        for w in range(horizon_weeks):
            rows.append((fid, cid, w + 1, float(fc.point[w]), float(fc.p90[w]), fc.method))
    return pd.DataFrame(rows, columns=["facility_id", "commodity_id", "week", "point", "p90", "method"]).assign(source="forecast")


def backtest(hist: pd.DataFrame, holdout_months: int = 3) -> pd.DataFrame:
    """Fit on all but the last holdout months, compare monthly totals of the weekly forecast to actuals."""
    out = []
    for (fid, cid), g in hist.sort_values("month_index").groupby(["facility_id", "commodity_id"], sort=False):
        y = g["demand"].to_numpy()
        if len(y) <= holdout_months + 12:
            continue
        train, test = y[:-holdout_months], y[-holdout_months:]
        fc = forecast_series(train, horizon_weeks=int(round(holdout_months * WEEKS_PER_MONTH)) + 1)
        pred_month = [fc.point[int(i * WEEKS_PER_MONTH):int((i + 1) * WEEKS_PER_MONTH)].sum() for i in range(holdout_months)]
        denom = np.maximum(np.abs(test), 1.0)
        mape = float(np.mean(np.abs(np.array(pred_month) - test) / denom))
        out.append((fid, cid, mape, fc.method))
    return pd.DataFrame(out, columns=["facility_id", "commodity_id", "mape", "method"])
