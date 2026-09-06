"""Runtime scenario multipliers. History is never re-simulated; the dial reprojects forecast, lead time
and alerts from the latest ledger month using the same rules as data/scenarios/scenarios.json."""
import json
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from sanjeevani import paths


@dataclass(frozen=True)
class Multiplier:
    demand: float = 1.0
    lead_days_add: float = 0.0
    miss_prob_add: float = 0.0


@lru_cache(maxsize=1)
def _scenarios() -> dict:
    return json.loads((paths.DATA_SCENARIOS / "scenarios.json").read_text())


def names() -> list[dict]:
    return [{"name": k, "label": v["label"], "units": v.get("units")} for k, v in _scenarios().items()]


def multipliers(name: str, intensity: float, unit_id: str, category: str, driver: str, cal_month: int) -> Multiplier:
    sc = _scenarios().get(name)
    if not sc:
        raise KeyError(f"unknown scenario {name}")
    if sc.get("units") and unit_id not in sc["units"]:
        return Multiplier()
    d, la, ma = 1.0, 0.0, 0.0
    for r in sc.get("rules", []):
        if cal_month in r["months"] and ("*" in r["categories"] or category in r["categories"]) \
                and ("*" in r["drivers"] or driver in r["drivers"]):
            d *= 1 + (r["demand_mult"] - 1) * intensity
            la += r["lead_days_add"] * intensity
            ma += r["miss_prob_add"] * intensity
    return Multiplier(d, la, ma)


def apply_to_frame(df: pd.DataFrame, name: str, intensity: float, month_col: str = "month") -> pd.DataFrame:
    """Vectorised: adds demand_mult, lead_add, miss_add for rows with unit_id, category, driver_item_code, month."""
    out = df.copy()
    out["demand_mult"], out["lead_add"], out["miss_add"] = 1.0, 0.0, 0.0
    sc = _scenarios()[name]
    if sc.get("units"):
        in_unit = out["unit_id"].isin(sc["units"]).to_numpy()
    else:
        in_unit = np.ones(len(out), bool)
    for r in sc.get("rules", []):
        m = in_unit & out[month_col].isin(r["months"]).to_numpy()
        if "*" not in r["categories"]:
            m &= out["category"].isin(r["categories"]).to_numpy()
        if "*" not in r["drivers"]:
            m &= out["driver_item_code"].isin(r["drivers"]).to_numpy()
        out.loc[m, "demand_mult"] *= 1 + (r["demand_mult"] - 1) * intensity
        out.loc[m, "lead_add"] += r["lead_days_add"] * intensity
        out.loc[m, "miss_add"] += r["miss_prob_add"] * intensity
    return out
