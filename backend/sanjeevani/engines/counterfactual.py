"""With-versus-without counterfactual: replay the simulated ledger with the redistribution engine active every month,
and count the stock-out facility-months it avoids. Same seed and scenario in both runs, so only the transfers differ.

Assumptions: each month, once receipts are known and before the month's demand is served, facilities that cannot cover
the month are topped up from facilities in the same district that can spare stock (the district officer's scope; no
cross-district moves). Transfers land within the month, as the engine's one-to-two-day ETAs allow."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from sanjeevani import simulate
from sanjeevani.engines import redistribute as R
from sanjeevani.engines.alerts import LOW_DEMAND_WEEKLY

UNIT_TOTAL = "__unit__"
WEEKS_PER_MONTH = 52.0 / 12.0
P90_UPLIFT = 1.25  # same fallback as alerts.compute_alerts when no forecast row exists
FAC_COLS = ["facility_id", "name", "district", "lat", "lon"]


@dataclass
class Result:
    without: pd.DataFrame
    with_: pd.DataFrame
    transfers: pd.DataFrame


NEED_DAYS = 30.0      # a facility that cannot cover the month from stock on hand is a recipient
TARGET_DAYS = 35.0    # recipients are topped up to cover the month plus a few days (p90 demand)
DONOR_FLOOR = 35.0    # donors keep enough to cover their own month plus a few days


def monthly_redistributor(facilities: pd.DataFrame, max_km: float = 80.0, need_days: float = NEED_DAYS,
                          target_days: float = TARGET_DAYS, donor_floor: float = DONOR_FLOOR):
    """Hook for simulate.build_ledger: one call per commodity per month with the unit's facilities."""
    meta = facilities[FAC_COLS].rename(columns={"name": "facility_name"}).set_index("facility_id")
    log: list[pd.DataFrame] = []

    def hook(month_df: pd.DataFrame) -> pd.DataFrame:
        a = month_df.join(meta, on="facility_id")
        a["weekly_demand_p90"] = a["recent_demand"] / WEEKS_PER_MONTH * P90_UPLIFT
        daily = np.maximum(a["weekly_demand_p90"] / 7.0, 1e-6)
        a["closing"] = a["available"]  # what propose() reads as stock on hand
        a["days_of_stock"] = np.minimum(a["available"] / daily, 365.0)
        a["alert"] = (a["days_of_stock"] < need_days) & (a["weekly_demand_p90"] >= LOW_DEMAND_WEEKLY)
        a["data_issue"] = False
        a["cause"] = "projected_shortfall"
        if not a["alert"].any():
            return None
        cid = str(a["commodity_id"].iloc[0])
        parts = []
        for _, g in a.groupby("district", sort=False):
            if not g["alert"].any() or g["alert"].all():
                continue
            p = R.propose(g, cid, max_km=max_km, donor_floor_days=donor_floor, target_days=target_days, allow_cross_district=False)
            if len(p):
                parts.append(p)
        if not parts:
            return None
        tr = pd.concat(parts, ignore_index=True)
        tr["month_index"] = int(a["month_index"].iloc[0])
        log.append(tr)
        return tr[["from_id", "to_id", "quantity"]]

    hook.log = log
    return hook


def run(fac_demand: pd.DataFrame, facilities: pd.DataFrame, commodities: pd.DataFrame,
        scenario: str = "normal", intensity: float = 1.0, seed: int = 7, max_km: float = 80.0, **hook_kw) -> Result:
    without = simulate.build_ledger(fac_demand, facilities, commodities, scenario, intensity, seed)
    hook = monthly_redistributor(facilities, max_km, **hook_kw)
    with_ = simulate.build_ledger(fac_demand, facilities, commodities, scenario, intensity, seed, redistribute=hook)
    cols = ["month_index", "commodity_id", "from_id", "to_id", "quantity", "km"]
    transfers = pd.concat(hook.log, ignore_index=True)[cols] if hook.log else pd.DataFrame(columns=cols)
    return Result(without, with_, transfers)


def compare(res: Result, facilities: pd.DataFrame, unit_id: str, scenario: str) -> pd.DataFrame:
    """One row per district plus a UNIT_TOTAL row: stock-out facility-months without and with monthly transfers."""
    d = facilities.set_index("facility_id")["district"]
    key = ["facility_id", "commodity_id", "month_index"]
    w = res.without[key + ["stockout"]].rename(columns={"stockout": "so_without"})
    x = res.with_[key + ["stockout"]].rename(columns={"stockout": "so_with"})
    m = w.merge(x, on=key, how="inner")
    m["district"] = m["facility_id"].map(d)
    g = m.groupby("district").agg(facility_months=("so_without", "size"), stockout_months_without=("so_without", "sum"),
                                  stockout_months_with=("so_with", "sum")).reset_index()
    tr = res.transfers.copy()
    if len(tr):
        tr["district"] = tr["to_id"].map(d)
        tg = tr.groupby("district").agg(transfers=("quantity", "size"), units_moved=("quantity", "sum")).reset_index()
        g = g.merge(tg, on="district", how="left").fillna({"transfers": 0, "units_moved": 0})
    else:
        g["transfers"], g["units_moved"] = 0, 0
    total = g.drop(columns="district").sum().to_frame().T.assign(district=UNIT_TOTAL)
    out = pd.concat([g, total], ignore_index=True)
    for c in ["facility_months", "stockout_months_without", "stockout_months_with", "transfers", "units_moved"]:
        out[c] = out[c].astype(int)
    out["avoided"] = out["stockout_months_without"] - out["stockout_months_with"]
    out["avoided_pct"] = np.where(out["stockout_months_without"] > 0, out["avoided"] / out["stockout_months_without"].clip(lower=1), 0.0).round(4)
    out.insert(0, "scenario", scenario); out.insert(0, "unit_id", unit_id)
    return out[["unit_id", "scenario", "district", "facility_months", "stockout_months_without", "stockout_months_with",
                "avoided", "avoided_pct", "transfers", "units_moved"]]


def jobs(unit_ids: list[str], scenarios: dict) -> list[tuple[str, str]]:
    """(unit, scenario) pairs: a scenario restricted to some units runs only for those units."""
    return [(u, name) for u in unit_ids for name, sc in scenarios.items() if not sc.get("units") or u in sc["units"]]
