"""Facility forecasts from the cached BigQuery TimesFM district forecast (hierarchical: district forecast x facility share).
Falls back to the seasonal baseline for any series without a cached district forecast. Never calls BigQuery at request time."""
from functools import lru_cache

import numpy as np
import pandas as pd

from sanjeevani import paths
from sanjeevani.engines import forecast as F

CACHE = paths.DATA_PROCESSED / "bq_district_forecast.parquet"
P90_FROM_80_UPPER = 1.0  # the cache stores an 80 % interval: its upper bound is the one-sided 90 % point, i.e. the P90


@lru_cache(maxsize=1)
def load_cache() -> pd.DataFrame | None:
    if not CACHE.exists():
        return None
    df = pd.read_parquet(CACHE)
    df["forecast_timestamp"] = pd.to_datetime(df["forecast_timestamp"])
    return df.sort_values(["state", "district", "item_code", "forecast_timestamp"])


def available() -> bool:
    return load_cache() is not None


def district_weekly(state: str, district: str, item_code: str, horizon_weeks: int = 8) -> tuple[np.ndarray, np.ndarray] | None:
    """Weekly point and P90 for the district driver series, from the first cached forecast month onward."""
    c = load_cache()
    if c is None:
        return None
    g = c[(c["state"] == state) & (c["district"] == district) & (c["item_code"] == item_code)]
    if g.empty:
        return None
    monthly = np.maximum(g["forecast_value"].to_numpy(float), 0.0)
    hi = np.maximum(g["hi"].to_numpy(float), monthly)
    reps = int(np.ceil(F.WEEKS_PER_MONTH)) + 1
    point = np.repeat(monthly / F.WEEKS_PER_MONTH, reps)[:horizon_weeks]
    p90 = np.repeat(hi / F.WEEKS_PER_MONTH, reps)[:horizon_weeks]
    if len(point) < horizon_weeks:
        return None
    return point, p90


def facility_shares(hist: pd.DataFrame, meta: pd.DataFrame, months: int = 12) -> pd.Series:
    """Share of each facility in its district's demand for a commodity, from the last `months` of history.
    hist: facility_id, commodity_id, month_index, demand. meta: facility_id, district (unique per facility)."""
    last = hist["month_index"].max()
    h = hist[hist["month_index"] > last - months].merge(meta[["facility_id", "district"]].drop_duplicates(), on="facility_id", how="left")
    fac_mean = h.groupby(["district", "commodity_id", "facility_id"])["demand"].mean()
    dist_sum = fac_mean.groupby(level=["district", "commodity_id"]).transform("sum")
    share = (fac_mean / dist_sum.replace(0, np.nan)).fillna(0.0)
    return share.droplevel(["district"])  # index: (commodity_id, facility_id)


def forecast_frame(hist: pd.DataFrame, meta: pd.DataFrame, horizon_weeks: int = 8) -> pd.DataFrame:
    """Hybrid forecast. meta: one row per (facility_id, commodity_id) with state, district, driver_item_code, units_per_case."""
    if not available():
        return F.forecast_frame(hist, horizon_weeks)
    shares = facility_shares(hist, meta)
    m = meta.drop_duplicates(["facility_id", "commodity_id"]).set_index(["facility_id", "commodity_id"])
    rows = []
    for (fid, cid), g in hist.sort_values("month_index").groupby(["facility_id", "commodity_id"], sort=False):
        info = m.loc[(fid, cid)] if (fid, cid) in m.index else None
        dw = district_weekly(info["state"], info["district"], info["driver_item_code"], horizon_weeks) if info is not None else None
        share = float(shares.get((cid, fid), 0.0)) if dw is not None else 0.0
        if dw is not None and share > 0:
            point = dw[0] * float(info["units_per_case"]) * share
            p90 = np.maximum(dw[1] * float(info["units_per_case"]) * share, point * (1 + F.P90_FLOOR))
            method = "bigquery_timesfm"
        else:
            fc = F.forecast_series(g["demand"].to_numpy(), horizon_weeks)
            point, p90, method = fc.point, fc.p90, fc.method
        for w in range(horizon_weeks):
            rows.append((fid, cid, w + 1, float(point[w]), float(p90[w]), method))
    return pd.DataFrame(rows, columns=["facility_id", "commodity_id", "week", "point", "p90", "method"]).assign(source="forecast")
