"""Beds and staff: district rollups for the state and facility rows for a district."""
import json
import math
from functools import lru_cache

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from sanjeevani import paths
from sanjeevani.engines import care as C

router = APIRouter(prefix="/care", tags=["care"])
PROVENANCE = "Beds and staff attendance are simulated at facility level; staffing vacancies calibrated to Rural Health Statistics 2021 (MoHFW) via data.gov.in, GODL"


def _clean(df: pd.DataFrame) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    out = df.replace({np.nan: None}).to_dict(orient="records")
    for r in out:
        for k, v in r.items():
            if isinstance(v, np.integer): r[k] = int(v)
            elif isinstance(v, np.floating): r[k] = None if math.isnan(float(v)) else float(v)
            elif isinstance(v, np.bool_): r[k] = bool(v)
    return out


@lru_cache(maxsize=1)
def _rules() -> dict:
    return {k: v.get("rules", []) for k, v in json.loads((paths.DATA_SCENARIOS / "scenarios.json").read_text()).items()}


_cache: dict = {}


def _status(request: Request, unit_id: str) -> tuple[pd.DataFrame, dict]:
    store, state = request.app.state.store, request.app.state.state
    if unit_id not in set(store.units()["unit_id"]):
        raise HTTPException(404, f"unknown unit {unit_id}")
    sc = state.get_scenario()
    key = (unit_id, sc["name"], sc["intensity"], int(sc["updated"]))
    if key not in _cache:
        fac = store.facilities(unit_id)
        beds = store.q("""SELECT b.facility_id, b.beds, b.occupied FROM beds b JOIN facilities f USING (facility_id)
                          WHERE f.unit_id = ? AND b.month_index = (SELECT max(month_index) FROM beds)""", [unit_id])
        staff = store.q("""SELECT s.facility_id, s.cadre, s.sanctioned, s.in_position, s.days_present FROM staff s JOIN facilities f USING (facility_id)
                           WHERE f.unit_id = ? AND s.month_index = (SELECT max(month_index) FROM staff)""", [unit_id])
        mult = C.occupancy_multiplier(_rules().get(sc["name"], []), float(sc["intensity"])) if sc["name"] != "normal" else 1.0
        if len(_cache) > 64:
            _cache.clear()
        _cache[key] = (C.facility_status(fac, beds, staff, mult), {**sc, "occupancy_multiplier": round(mult, 3)})
    return _cache[key]


@router.get("/{unit_id}")
def care_unit(unit_id: str, request: Request):
    f, sc = _status(request, unit_id)
    d = C.district_rollup(f)
    tot_beds, tot_occ = int(d["beds"].sum()), int(d["occupied"].sum())
    totals = {"districts": int(len(d)), "facilities": int(d["facilities"].sum()), "beds": tot_beds, "occupied": tot_occ,
              "occupancy": tot_occ / tot_beds if tot_beds else None, "bed_alerts": int(d["bed_alerts"].sum()),
              "bed_amber": int(d["bed_amber"].sum()), "staff_alerts": int(d["staff_alerts"].sum()),
              "vacancy_share": float(1 - d["in_position"].sum() / d["sanctioned"].sum()) if d["sanctioned"].sum() else None}
    return {"unit_id": unit_id, "totals": totals, "districts": _clean(d.drop(columns=["sanctioned", "in_position"])), "scenario": sc, "provenance": PROVENANCE}


@router.get("/{unit_id}/{district}")
def care_district(unit_id: str, district: str, request: Request):
    f, sc = _status(request, unit_id)
    g = f[f["district"] == district]
    if g.empty:
        raise HTTPException(404, "no facilities in this district")
    d = C.district_rollup(g).iloc[0].to_dict()
    rows = g[g["bed_alert"] | (g["bed_severity"] == "amber") | g["doctor_absent"]].copy()
    rows["rank"] = rows["bed_alert"].astype(int) * 2 + rows["doctor_absent"].astype(int) + (rows["bed_severity"] == "amber").astype(int)
    rows = rows.sort_values(["rank", "occupancy"], ascending=False)
    cols = ["facility_id", "name", "type", "beds", "occupied", "occupancy", "bed_severity", "bed_alert", "doctor_absent", "mo_in", "mo_days",
            "vacancy_share", "refer_id", "refer_name", "refer_km", "refer_free_beds"]
    summary = {k: (None if isinstance(v, float) and math.isnan(v) else (int(v) if isinstance(v, (np.integer,)) else (float(v) if isinstance(v, np.floating) else v))) for k, v in d.items() if k not in ("sanctioned", "in_position")}
    return {"unit_id": unit_id, "district": district, "summary": summary, "facilities": _clean(rows[cols]), "scenario": sc, "provenance": PROVENANCE}
