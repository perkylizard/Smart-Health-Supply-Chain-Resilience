"""Days-of-stock, severity, cause attribution and data-issue flags from the latest ledger month plus forecast."""
import numpy as np
import pandas as pd

from sanjeevani.engines import scenario as S

RED, AMBER, WATCH = 7.0, 14.0, 30.0
BUFFER_DAYS = 7.0
DONOR_FLOOR = 21.0


def _cause(row) -> tuple[str, str]:
    if row["data_issue"]:
        return "data_issue", row["data_issue_detail"]
    if row["demand_prev3"] > 0 and row["demand"] > 1.3 * row["demand_prev3"]:
        return "cases_up", f"demand up {row['demand'] / row['demand_prev3'] - 1:.0%} vs prior 3 months"
    if row["received"] == 0 and row["demand"] > 0:
        return "supply_missed", "no stock received this month against an expected indent"
    if row["opening"] > 0 and row["unusable"] > 0.2 * row["opening"]:
        return "written_off", f"{row['unusable'] / row['opening']:.0%} of opening stock unusable"
    return "none", ""


def compute_alerts(latest: pd.DataFrame, window: pd.DataFrame, fc: pd.DataFrame, scenario: str = "normal", intensity: float = 1.0) -> pd.DataFrame:
    """latest: one ledger row per facility x commodity (latest month, joined to facility/commodity fields).
    window: ledger rows for the last >= 4 months (same join). fc: forecast_frame output (weekly point, p90)."""
    if latest.empty:
        return pd.DataFrame()
    key = ["facility_id", "commodity_id"]
    latest_mi = int(latest["month_index"].max())
    prev = window[window["month_index"] < latest_mi]
    prev3 = prev[prev["month_index"] >= latest_mi - 3].groupby(key).agg(demand_prev3=("demand", "mean"), received_med=("received", "median")).reset_index()
    p90w = fc.groupby(key)["p90"].mean().rename("weekly_demand_p90").reset_index()
    df = latest.merge(prev3, on=key, how="left").merge(p90w, on=key, how="left")
    df["demand_prev3"] = df["demand_prev3"].fillna(df["demand"])
    df["received_med"] = df["received_med"].fillna(df["received"])
    df["weekly_demand_p90"] = df["weekly_demand_p90"].fillna(df["demand"] / 4.33 * 1.25)
    df = S.apply_to_frame(df, scenario, intensity)
    df["weekly_demand_p90"] = df["weekly_demand_p90"] * df["demand_mult"]
    df["lead_days"] = df["lead_days"] + df["lead_add"]
    daily = np.maximum(df["weekly_demand_p90"] / 7.0, 1e-6)
    df["days_of_stock"] = np.minimum(df["closing"] / daily, 365.0).round(1)
    # data issues (from spec): negative closing, sudden zero after a large opening, absurd receipts
    neg = df["closing"] < 0
    sudden_zero = (df["closing"] == 0) & (df["opening"] > 3 * df["demand_prev3"].clip(lower=1))
    absurd = df["received"] > 10 * df["received_med"].clip(lower=1)
    df["data_issue"] = neg | sudden_zero | absurd
    df["data_issue_detail"] = np.select([neg, sudden_zero, absurd],
                                        ["negative closing stock", "closing zero after a large opening balance", "received more than 10x the usual"], "")
    thr = df["lead_days"] + BUFFER_DAYS
    df["alert"] = (df["days_of_stock"] < thr) & ~df["data_issue"]
    df["severity"] = np.select([df["data_issue"], df["days_of_stock"] < RED, df["days_of_stock"] < AMBER, df["days_of_stock"] < WATCH],
                               ["data_issue", "red", "amber", "watch"], "ok")
    causes = df.apply(_cause, axis=1, result_type="expand")
    df["cause"], df["cause_detail"] = causes[0], causes[1]
    df["surplus_days"] = (df["days_of_stock"] - DONOR_FLOOR).clip(lower=0).round(1)
    cols = ["facility_id", "facility_name", "type", "commodity_id", "commodity_name", "category", "unit_id", "state", "district", "lat", "lon",
            "closing", "demand", "weekly_demand_p90", "days_of_stock", "lead_days", "severity", "alert", "cause", "cause_detail",
            "data_issue", "surplus_days", "scenario", "source"]
    df["scenario"] = scenario
    return df[[c for c in cols if c in df.columns]].sort_values(["alert", "days_of_stock"], ascending=[False, True]).reset_index(drop=True)
