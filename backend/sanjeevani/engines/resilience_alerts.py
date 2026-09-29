"""Resilience alerts: proactive stock-out warnings across a district's facilities.

The alert engine flags stock under the resupply threshold today. This layer looks ahead: for every facility and medicine it
asks whether stock will run out before the next delivery can arrive, and whether rising demand will get it there soon even
if it looks fine now. Tiers:
  critical  stock runs out before a resupply can arrive (days of stock under the lead time), or is already out
  warning   runs out within two weeks after the lead time
  watch     over that, but under 30 days while demand is rising (cases up, or a what-if scenario raising demand)
Each warning carries the projected stock-out day and, where the optimiser has one, the best transfer that prevents it."""
import numpy as np
import pandas as pd

WATCH_DAYS, WARNING_GAP = 30.0, 14.0


def classify(al: pd.DataFrame, scenario_mult: float = 1.0) -> pd.DataFrame:
    if al is None or al.empty:
        return pd.DataFrame()
    a = al[~al["data_issue"].astype(bool)].copy()
    lead = a["lead_days"].fillna(7.0).clip(lower=1.0)
    days = a["days_of_stock"].astype(float)
    rising = (a["cause"] == "cases_up") | (scenario_mult > 1.0)
    low_use = a["weekly_demand_p90"] < 1.0
    tier = np.select([~low_use & ((days <= 0) | (days < lead)), ~low_use & (days < lead + WARNING_GAP), ~low_use & rising & (days < WATCH_DAYS)],
                     ["critical", "warning", "watch"], "")
    a["tier"] = tier
    a = a[a["tier"] != ""].copy()
    a["runs_out_in_days"] = days.loc[a.index].round(1)
    a["resupply_in_days"] = lead.loc[a.index].round(1)
    a["short_by_days"] = (lead.loc[a.index] - days.loc[a.index]).clip(lower=0).round(1)  # days with no stock before a delivery can land
    order = {"critical": 0, "warning": 1, "watch": 2}
    return a.assign(_o=a["tier"].map(order)).sort_values(["_o", "runs_out_in_days"]).drop(columns="_o")


def attach_fixes(alerts: pd.DataFrame, proposals: pd.DataFrame) -> pd.DataFrame:
    """The best proposed transfer into each (facility, medicine): nearest donor with the largest quantity."""
    if alerts.empty:
        return alerts
    out = alerts.copy()
    out["fix_from"] = None; out["fix_quantity"] = np.nan; out["fix_km"] = np.nan; out["fix_transfer_id"] = None
    if proposals is None or proposals.empty:
        return out
    best = proposals.sort_values(["km", "quantity"], ascending=[True, False]).drop_duplicates(["to_id", "commodity_id"]).set_index(["to_id", "commodity_id"])
    for i, r in out.iterrows():
        k = (r["facility_id"], r["commodity_id"])
        if k in best.index:
            b = best.loc[k]
            out.at[i, "fix_from"], out.at[i, "fix_quantity"], out.at[i, "fix_km"], out.at[i, "fix_transfer_id"] = b["from_name"], b["quantity"], b["km"], b["transfer_id"]
    return out
