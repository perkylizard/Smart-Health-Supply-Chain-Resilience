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
    """Hybrid forecast, vectorised. meta: one row per (facility_id, commodity_id) with state, district, driver_item_code, units_per_case."""
    if not available():
        return F.forecast_frame(hist, horizon_weeks)
    c = load_cache()
    key = ["facility_id", "commodity_id"]
    m = meta.drop_duplicates(key)[key + ["state", "district", "driver_item_code", "units_per_case"]]
    # district weekly forecast arrays, one row per (state, district, item_code): first horizon_weeks weeks
    reps = int(np.ceil(F.WEEKS_PER_MONTH)) + 1
    need = m[["state", "district", "driver_item_code"]].drop_duplicates()
    cc = c.merge(need.rename(columns={"driver_item_code": "item_code"}), on=["state", "district", "item_code"])
    dist = {}
    for (st, d, ic), g in cc.groupby(["state", "district", "item_code"], sort=False):
        monthly = np.maximum(g["forecast_value"].to_numpy(float), 0.0); hi = np.maximum(g["hi"].to_numpy(float), monthly)
        pt = np.repeat(monthly / F.WEEKS_PER_MONTH, reps)[:horizon_weeks]; p9 = np.repeat(hi / F.WEEKS_PER_MONTH, reps)[:horizon_weeks]
        if len(pt) == horizon_weeks:
            dist[(st, d, ic)] = (pt, p9)
    shares = facility_shares(hist, meta)  # index (commodity_id, facility_id)
    sh = shares.rename("share").reset_index()
    m = m.merge(sh, on=["commodity_id", "facility_id"], how="left").fillna({"share": 0.0})
    series = hist.drop_duplicates(key)[key]
    m = series.merge(m, on=key, how="left")
    keys = list(zip(m["state"], m["district"], m["driver_item_code"]))
    have = np.array([k in dist for k in keys]) & (m["share"].to_numpy() > 0)
    out_pt = np.zeros((len(m), horizon_weeks)); out_p9 = np.zeros((len(m), horizon_weeks)); method = np.array(["baseline"] * len(m), dtype=object)
    upc = m["units_per_case"].to_numpy(float); share = m["share"].to_numpy(float)
    for i in np.flatnonzero(have):
        pt, p9 = dist[keys[i]]
        out_pt[i] = pt * upc[i] * share[i]; out_p9[i] = np.maximum(p9 * upc[i] * share[i], out_pt[i] * (1 + F.P90_FLOOR)); method[i] = "bigquery_timesfm"
    if (~have).any():
        fb = F.forecast_frame(hist.merge(m.loc[~have, key], on=key), horizon_weeks)
        fb_pt = fb.pivot(index=key, columns="week", values="point"); fb_p9 = fb.pivot(index=key, columns="week", values="p90"); fb_m = fb.groupby(key)["method"].first()
        idx = pd.MultiIndex.from_frame(m.loc[~have, key])
        out_pt[~have] = fb_pt.reindex(idx).to_numpy(); out_p9[~have] = fb_p9.reindex(idx).to_numpy(); method[~have] = fb_m.reindex(idx).to_numpy()
    fid = np.repeat(m["facility_id"].to_numpy(), horizon_weeks); cid = np.repeat(m["commodity_id"].to_numpy(), horizon_weeks)
    week = np.tile(np.arange(1, horizon_weeks + 1), len(m))
    return pd.DataFrame({"facility_id": fid, "commodity_id": cid, "week": week, "point": out_pt.ravel(), "p90": out_p9.ravel(),
                         "method": np.repeat(method, horizon_weeks), "source": "forecast"})
