"""Resilience score 0-100 per district and unit."""
import numpy as np
import pandas as pd

WEIGHTS = {"median_dos": 40, "share_under_14": 20, "staffing": 20, "latency": 10, "timeliness": 10}


def _clip01(x):
    return float(np.clip(x, 0.0, 1.0))


def district_scores(alerts: pd.DataFrame, staff: pd.DataFrame | None = None, transfers: pd.DataFrame | None = None,
                    reporting_share: pd.Series | None = None) -> pd.DataFrame:
    """alerts: compute_alerts output for a unit. staff: staff_latest rows. transfers: proposals with eta_days.
    reporting_share: district -> share of facilities that reported this week (defaults to 1)."""
    rows = []
    for (uid, state, district), g in alerts.groupby(["unit_id", "state", "district"]):
        ok = g[~g["data_issue"]]
        med = float(ok["days_of_stock"].median()) if len(ok) else 0.0
        c_dos = _clip01(med / 45.0)
        c_u14 = 1.0 - _clip01((ok["days_of_stock"] < 14).mean() if len(ok) else 1.0)
        if staff is not None and len(staff):
            s = staff[staff["district"] == district]
            gap = 1.0 - (s["in_position"].sum() / max(1, s["sanctioned"].sum())) if len(s) else 0.5
        else:
            gap = 0.5
        c_staff = 1.0 - _clip01(gap / 0.5)
        if transfers is not None and len(transfers):
            t = transfers[transfers["to_district"] == district]
            lat = float(t["eta_days"].median()) if len(t) else 3.0
        else:
            lat = 3.0
        c_lat = 1.0 - _clip01((lat - 1.0) / 9.0)
        c_time = _clip01(float(reporting_share.get(district, 1.0)) if reporting_share is not None else 1.0)
        comps = {"median_dos": c_dos, "share_under_14": c_u14, "staffing": c_staff, "latency": c_lat, "timeliness": c_time}
        score = sum(WEIGHTS[k] * v for k, v in comps.items())
        rows.append({"unit_id": uid, "state": state, "district": district, "score": round(score, 1),
                     "median_days_of_stock": round(med, 1), "share_under_14d": round(1 - c_u14, 3), "staffing_gap": round(gap, 3),
                     "transfer_latency_days": round(lat, 1), "reporting_share": round(c_time, 3), "source": "computed"})
    return pd.DataFrame(rows).sort_values("score", ascending=False).reset_index(drop=True)


def unit_scores(ds: pd.DataFrame) -> pd.DataFrame:
    if ds.empty:
        return pd.DataFrame(columns=["unit_id", "score", "districts"])
    return ds.groupby("unit_id").agg(score=("score", "mean"), districts=("district", "count")).round(1).reset_index().sort_values("score", ascending=False)
