"""Beds and staff: facility alerts rolled up to district and state.

Rules (improvement B5):
- Bed alert: a CHC or district hospital with occupancy over 90 percent is red, over 80 percent amber. PHCs are not
  flagged on beds (they hold a handful of observation beds).
- Staff alert ("doctor absent"): the facility has a sanctioned medical officer post and either none in position or
  the medical officers present fewer than 10 days in the month.
- Vacancy share: 1 - in_position / sanctioned, summed over all cadres.
- Referral: for each bed alert, the nearest CHC or district hospital in the same district (haversine) with at least
  20 percent of its beds and at least 5 beds free, excluding itself. PHCs are not referral targets for admissions.
- Scenario: a what-if that raises outbreak or emergency demand raises occupancy by a quarter as much (beds absorb only
  the admitted share of a surge): occupancy x (1 + (max demand multiplier - 1) x intensity x 0.25), capped at 100 percent.
Beds and staff are simulated; staffing vacancies are calibrated to Rural Health Statistics 2021."""
import numpy as np
import pandas as pd

BED_RED, BED_AMBER = 0.90, 0.80
DOCTOR_MIN_DAYS = 10
REFER_FREE_SHARE = 0.20
REFER_MIN_FREE = 5
SURGE_SHARE = 0.25
BED_TYPES = ("CHC", "DH")


def occupancy_multiplier(rules: list[dict], intensity: float) -> float:
    """rules: a scenario's rule list from scenarios.json. Only outbreak, emergency or all-category rules move beds."""
    mults = [r["demand_mult"] for r in rules if set(r.get("categories", [])) & {"outbreak", "emergency", "*"}]
    top = max(mults) if mults else 1.0
    return 1.0 + max(0.0, top - 1.0) * intensity * SURGE_SHARE


def _km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2) - np.radians(lon1)
    h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(h)) * 1.3  # road factor, same as the redistribution engine


def facility_status(fac: pd.DataFrame, beds: pd.DataFrame, staff: pd.DataFrame, occ_mult: float = 1.0) -> pd.DataFrame:
    """fac: facility_id, name, type, district, lat, lon. beds: facility_id, beds, occupied (latest month).
    staff: facility_id, cadre, sanctioned, in_position, days_present (latest month). One row per facility."""
    f = fac[["facility_id", "name", "type", "district", "lat", "lon"]].merge(beds[["facility_id", "beds", "occupied"]], on="facility_id", how="left")
    f["beds"] = f["beds"].fillna(0).astype(int)
    f["occupied"] = np.minimum(np.round(f["occupied"].fillna(0) * occ_mult), f["beds"]).astype(int)
    f["occupancy"] = np.where(f["beds"] > 0, f["occupied"] / f["beds"].where(f["beds"] > 0, 1), np.nan)
    has_beds = f["type"].isin(BED_TYPES) & (f["beds"] > 0)
    f["bed_severity"] = np.select([has_beds & (f["occupancy"] > BED_RED), has_beds & (f["occupancy"] > BED_AMBER)], ["red", "amber"], "ok")
    s = staff.groupby("facility_id").agg(sanctioned=("sanctioned", "sum"), in_position=("in_position", "sum")).reset_index()
    mo = staff[staff["cadre"] == "medical_officer"].groupby("facility_id").agg(mo_sanctioned=("sanctioned", "sum"), mo_in=("in_position", "sum"), mo_days=("days_present", "max")).reset_index()
    f = f.merge(s, on="facility_id", how="left").merge(mo, on="facility_id", how="left")
    for c in ("sanctioned", "in_position", "mo_sanctioned", "mo_in", "mo_days"):
        f[c] = f[c].fillna(0).astype(int)
    f["vacancy_share"] = np.where(f["sanctioned"] > 0, 1 - f["in_position"] / f["sanctioned"].where(f["sanctioned"] > 0, 1), np.nan)
    f["doctor_absent"] = (f["mo_sanctioned"] > 0) & ((f["mo_in"] == 0) | (f["mo_days"] < DOCTOR_MIN_DAYS))
    f["bed_alert"] = f["bed_severity"] == "red"
    # referrals, per district, vectorised
    f["refer_id"] = None; f["refer_name"] = None; f["refer_km"] = np.nan; f["refer_free_beds"] = np.nan
    for d, g in f.groupby("district"):
        need = g[g["bed_alert"]]
        free = g["beds"] - g["occupied"]
        cap = g[g["type"].isin(BED_TYPES) & (free >= np.ceil(g["beds"] * REFER_FREE_SHARE)) & (free >= REFER_MIN_FREE)]
        if need.empty or cap.empty:
            continue
        km = _km(need["lat"].to_numpy()[:, None], need["lon"].to_numpy()[:, None], cap["lat"].to_numpy()[None, :], cap["lon"].to_numpy()[None, :])
        km[need["facility_id"].to_numpy()[:, None] == cap["facility_id"].to_numpy()[None, :]] = np.inf
        best = km.argmin(axis=1)
        for k, idx in enumerate(need.index):
            j = best[k]
            if not np.isfinite(km[k, j]):
                continue
            c = cap.iloc[j]
            f.loc[idx, ["refer_id", "refer_name"]] = [c["facility_id"], c["name"]]
            f.loc[idx, ["refer_km", "refer_free_beds"]] = [round(float(km[k, j]), 1), int(c["beds"] - c["occupied"])]
    return f


def district_rollup(f: pd.DataFrame) -> pd.DataFrame:
    g = f.groupby("district").agg(facilities=("facility_id", "count"), beds=("beds", "sum"), occupied=("occupied", "sum"),
                                  bed_alerts=("bed_alert", "sum"), bed_amber=("bed_severity", lambda x: int((x == "amber").sum())),
                                  staff_alerts=("doctor_absent", "sum"), sanctioned=("sanctioned", "sum"), in_position=("in_position", "sum")).reset_index()
    g["occupancy"] = np.where(g["beds"] > 0, g["occupied"] / g["beds"].where(g["beds"] > 0, 1), np.nan)
    g["vacancy_share"] = np.where(g["sanctioned"] > 0, 1 - g["in_position"] / g["sanctioned"].where(g["sanctioned"] > 0, 1), np.nan)
    for c in ("bed_alerts", "staff_alerts", "bed_amber"):
        g[c] = g[c].astype(int)
    return g.sort_values(["bed_alerts", "staff_alerts", "occupancy"], ascending=False).reset_index(drop=True)
