"""Sanjeevani Grid API. Every response carries provenance; scenario changes reproject, never re-simulate."""
import math
import time
from functools import lru_cache

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import EntryIn, RejectIn, ScenarioIn
from app.state import InMemoryState
from sanjeevani.engines import alerts as A, forecast as F, forecast_bq as FB, redistribute as R, resilience as Rs, scenario as S
from sanjeevani.engines.store import Store

PROVENANCE = {
    "facility_counts": "Rural Health Statistics 2021-22 (MoHFW) via data.gov.in, GODL",
    "district_demand": "HMIS item-wise district monthly 2017-18 to 2019-20 (MoHFW), time-shifted to 2024-27; facility split is simulated",
    "stock_ledger": "Simulated at facility level; district totals calibrated to HMIS real ledgers (sections M17, M19, M20)",
    "facility_names": "OpenStreetMap contributors (ODbL) where source=osm; otherwise simulated",
    "forecast": "BigQuery AI.FORECAST (TimesFM) district forecast x facility share, cached daily; seasonal-naive baseline for series without a cached district forecast",
    "transfers": "OR-Tools min-cost flow; distances haversine x1.3 (Google Maps Distance Matrix when configured)",
}


def _clean(df: pd.DataFrame) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    out = df.replace({np.nan: None}).to_dict(orient="records")
    for r in out:
        for k, v in r.items():
            if isinstance(v, (np.integer,)): r[k] = int(v)
            elif isinstance(v, (np.floating,)): r[k] = None if math.isnan(float(v)) else float(v)
            elif isinstance(v, (np.bool_,)): r[k] = bool(v)
    return out


def create_app(store: Store | None = None, state: InMemoryState | None = None, gemini=None, warm: bool = True) -> FastAPI:
    app = FastAPI(title="Sanjeevani Grid API", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    store = store or Store()
    state = state or InMemoryState()
    app.state.store, app.state.state = store, state
    from sanjeevani.gemini.client import GeminiClient
    app.state.gemini = gemini or GeminiClient()

    import threading as _th
    _locks: dict = {}
    _lock_guard = _th.Lock()

    @lru_cache(maxsize=256)
    def _alerts_cached(unit_id: str, district: str | None, scenario: str, intensity: float, stamp: int) -> pd.DataFrame:
        latest = store.ledger_latest(unit_id, district)
        window = store.ledger_window(unit_id, 13, district)
        meta = window[["facility_id", "commodity_id", "state", "district", "driver_item_code"]].drop_duplicates(["facility_id", "commodity_id"])
        meta = meta.merge(store.commodities()[["commodity_id", "units_per_case"]], on="commodity_id", how="left")
        fc = FB.forecast_frame(window[["facility_id", "commodity_id", "month_index", "demand"]], meta)
        return A.compute_alerts(latest, window[window["month_index"] > window["month_index"].max() - 4], fc, scenario, intensity)

    _ready: set = set()

    def _key_for(unit_id: str, district: str | None):
        sc = state.get_scenario()
        return (unit_id, district, sc["name"], sc["intensity"], int(sc["updated"]))

    def alerts_for(unit_id: str, district: str | None = None) -> pd.DataFrame:
        key = _key_for(unit_id, district)
        with _lock_guard:
            lock = _locks.setdefault(key, _th.Lock())
        with lock:  # one computation per key; concurrent callers wait for it instead of recomputing
            out = _alerts_cached(*key)
            _ready.add(key)
            return out

    def alerts_for_unit_if_ready(unit_id: str) -> pd.DataFrame | None:
        """Unit-wide alerts are expensive (whole state). Return them if cached; otherwise compute in the
        background and return None so the district page renders now and fills the rank on the next fetch."""
        key = _key_for(unit_id, None)
        if key in _ready:
            return _alerts_cached(*key)
        _th.Thread(target=lambda: alerts_for(unit_id), daemon=True).start()
        return None

    def _unit_or_404(unit_id: str):
        if unit_id not in set(store.units()["unit_id"]):
            raise HTTPException(404, f"unknown unit {unit_id}")

    @app.get("/health")
    def health():
        return {"ok": True, "latest_month": store.latest_month(), "scenario": state.get_scenario(), "time": time.time()}

    @app.get("/provenance")
    def provenance():
        return PROVENANCE

    @app.get("/units")
    def units():
        return {"units": _clean(store.units()), "provenance": PROVENANCE["facility_counts"]}

    @app.get("/units/{unit_id}/districts")
    def unit_districts(unit_id: str):
        _unit_or_404(unit_id)
        al = alerts_for(unit_id)
        ds = Rs.district_scores(al, store.staff_latest(unit_id))
        fac = store.facilities(unit_id).groupby("district").agg(facilities=("facility_id", "count"), lat=("district_lat", "first"), lon=("district_lon", "first")).reset_index()
        red = al[al["severity"] == "red"].groupby("district").size().rename("red_alerts").reset_index()
        out = fac.merge(ds, on="district", how="left").merge(red, on="district", how="left").fillna({"red_alerts": 0})
        return {"unit_id": unit_id, "districts": _clean(out), "scenario": state.get_scenario(), "provenance": PROVENANCE["stock_ledger"]}

    def summary_data(unit_id: str, district: str) -> dict:
        _unit_or_404(unit_id)
        al = alerts_for(unit_id, district)
        if al.empty:
            raise HTTPException(404, f"no data for {district}")
        top = al[al["alert"]].head(50)
        counts = al["severity"].value_counts().to_dict()
        ds = Rs.district_scores(al, store.staff_latest(unit_id, district))
        al_unit = alerts_for_unit_if_ready(unit_id)
        if al_unit is not None:
            rank = Rs.district_scores(al_unit, store.staff_latest(unit_id))
            rank_pos = int(rank.index[rank["district"] == district][0]) + 1 if (rank["district"] == district).any() else None
            n_rank = int(len(rank))
        else:
            rank_pos, n_rank = None, len(store.districts(unit_id))
        # sparklines: last 12 months of OPD driver demand (14.2.1) and diarrhoea (10.11) from the real district counts, plus red alerts trend proxy
        real = store.real_counts(al["state"].iloc[0], district, ["14.2.1", "10.11"])
        spark = {}
        for code, name in (("14.2.1", "opd"), ("10.11", "diarrhoea_u5")):
            r = real[real["item_code"] == code].sort_values(["fy", "month"], key=lambda s: s.map({4:0,5:1,6:2,7:3,8:4,9:5,10:6,11:7,12:8,1:9,2:10,3:11}) if s.name == "month" else s)
            spark[name] = [float(x) for x in r["value"].tail(12)]
        w = store.ledger_window(unit_id, 12, district)
        spark["stockouts"] = [int(x) for x in w.groupby("month_index")["stockout"].sum().sort_index().tail(12)]
        deltas = {k: (round(v[-1] / v[-2] - 1, 3) if len(v) >= 2 and v[-2] else None) for k, v in spark.items()}
        return {
            "unit_id": unit_id, "district": district, "scenario": state.get_scenario(),
            "counts": {k: int(v) for k, v in counts.items()}, "facilities": int(al["facility_id"].nunique()),
            "score": _clean(ds)[0] if len(ds) else None, "rank_in_unit": rank_pos, "of": n_rank, "rank_pending": rank_pos is None,
            "alerts": _clean(top), "sparklines": spark, "sparkline_deltas": deltas,
            "provenance": {"alerts": PROVENANCE["stock_ledger"], "sparklines": "HMIS real district counts (opd, diarrhoea_u5); simulated (stockouts)"},
        }

    app.state.summary_data = summary_data

    @app.get("/districts/{unit_id}/{district}/summary")
    def district_summary(unit_id: str, district: str):
        return summary_data(unit_id, district)

    @app.get("/districts/{unit_id}/{district}/facilities")
    def district_facilities(unit_id: str, district: str):
        _unit_or_404(unit_id)
        al = alerts_for(unit_id, district)
        sev_rank = {"red": 0, "amber": 1, "watch": 2, "ok": 3, "data_issue": 4}
        g = al.assign(rank=al["severity"].map(sev_rank)).sort_values("rank").groupby("facility_id").agg(
            facility_name=("facility_name", "first"), type=("type", "first"), lat=("lat", "first"), lon=("lon", "first"),
            worst_severity=("severity", "first"), worst_days=("days_of_stock", "min"), worst_commodity=("commodity_name", "first"),
            red=("severity", lambda s: int((s == "red").sum())), amber=("severity", lambda s: int((s == "amber").sum())),
            data_issues=("data_issue", "sum")).reset_index()
        fac = store.facilities(unit_id, district)[["facility_id", "source", "dist_to_warehouse_km", "beds"]]
        return {"district": district, "facilities": _clean(g.merge(fac, on="facility_id", how="left")), "provenance": PROVENANCE["facility_names"]}

    @app.get("/facilities/{facility_id}")
    def facility(facility_id: str):
        f = store.q("SELECT * FROM facilities WHERE facility_id = ?", [facility_id])
        if f.empty:
            raise HTTPException(404, "unknown facility")
        row = f.iloc[0]
        al = alerts_for(row["unit_id"], row["district"])
        mine = al[al["facility_id"] == facility_id].sort_values("days_of_stock")
        top = mine.head(5)["commodity_id"].tolist()
        hist = store.q("SELECT facility_id, commodity_id, month_index, demand FROM ledger WHERE facility_id = ? ORDER BY month_index", [facility_id])
        sc = state.get_scenario()
        fc = F.forecast_frame(hist[hist["commodity_id"].isin(top)])
        staff = store.q("SELECT cadre, sanctioned, in_position, days_present FROM staff WHERE facility_id = ? AND month_index = (SELECT max(month_index) FROM staff)", [facility_id])
        beds = store.q("SELECT beds, occupied FROM beds WHERE facility_id = ? ORDER BY month_index DESC LIMIT 1", [facility_id])
        return {"facility": _clean(f)[0], "stock": _clean(mine), "forecast": _clean(fc), "staff": _clean(staff),
                "beds": _clean(beds)[0] if len(beds) else None, "entries": state.entries(facility_id), "scenario": sc,
                "provenance": {"stock": PROVENANCE["stock_ledger"], "forecast": PROVENANCE["forecast"], "name": PROVENANCE["facility_names"]}}

    @app.get("/transfers/{unit_id}/{district}")
    def transfers(unit_id: str, district: str, commodity_id: str | None = None):
        _unit_or_404(unit_id)
        al_d = alerts_for(unit_id, district)
        # donors may come from the whole unit (cross-district), recipients from this district
        al_u = alerts_for(unit_id)
        sc = state.get_scenario()
        cids = [commodity_id] if commodity_id else al_d[al_d["alert"]]["commodity_id"].value_counts().head(8).index.tolist()
        parts = []
        for cid in cids:
            pool = al_u[(al_u["commodity_id"] == cid) & ((al_u["district"] == district) | (~al_u["alert"]))]
            pool = pool[(pool["district"] == district) | (pool["days_of_stock"] > 24)]
            lead_add = float(al_d["lead_days"].mean() - store.ledger_latest(unit_id, district)["lead_days"].mean()) if len(al_d) else 0.0
            p = R.propose(pool, cid, lead_add_days=max(0.0, lead_add))
            if not p.empty:
                p = p[p["to_district"] == district]
                parts.append(p)
        out = pd.concat(parts, ignore_index=True) if parts else R._empty()
        recs = _clean(out)
        for r in recs:
            st = state.transfer_status(r["transfer_id"])
            if st: r["status"], r["decision_reason"] = st["status"], st.get("reason")
        return {"district": district, "transfers": recs, "scenario": sc, "provenance": PROVENANCE["transfers"]}

    @app.post("/transfers/{transfer_id:path}/approve")
    def approve(transfer_id: str):
        return state.set_transfer(transfer_id, "approved")

    @app.post("/transfers/{transfer_id:path}/reject")
    def reject(transfer_id: str, body: RejectIn):
        return state.set_transfer(transfer_id, "rejected", body.reason)

    @app.post("/transfers/{transfer_id:path}/delivered")
    def delivered(transfer_id: str):
        return state.set_transfer(transfer_id, "delivered")

    @app.get("/transfers/status")
    def transfer_status_all():
        return {"transfers": list(state.all_transfers().values())}

    @app.get("/scenario")
    def get_scenario():
        return {"current": state.get_scenario(), "available": S.names()}

    @app.post("/scenario")
    def set_scenario(body: ScenarioIn):
        if body.name not in {n["name"] for n in S.names()}:
            raise HTTPException(400, "unknown scenario")
        out = state.set_scenario(body.name, body.intensity)
        hero = store.units().iloc[0]["unit_id"]
        _th.Thread(target=lambda: alerts_for(hero), daemon=True).start()
        return out

    @app.get("/forecast/{facility_id}/{commodity_id}")
    def forecast(facility_id: str, commodity_id: str):
        hist = store.q("SELECT facility_id, commodity_id, month_index, year, month, demand FROM ledger WHERE facility_id = ? AND commodity_id = ? ORDER BY month_index", [facility_id, commodity_id])
        if hist.empty:
            raise HTTPException(404, "no history")
        # hierarchical share needs the district's other facilities for this commodity
        f = store.q("SELECT state, district, unit_id FROM facilities WHERE facility_id = ?", [facility_id]).iloc[0]
        dist = store.q("SELECT l.facility_id, l.commodity_id, l.month_index, l.demand FROM ledger l JOIN facilities x USING (facility_id) WHERE x.district = ? AND x.unit_id = ? AND l.commodity_id = ? AND l.month_index > (SELECT max(month_index) FROM ledger) - 12", [f["district"], f["unit_id"], commodity_id])
        c = store.commodities().set_index("commodity_id").loc[commodity_id]
        meta = store.q("SELECT facility_id, state, district FROM facilities WHERE district = ? AND unit_id = ?", [f["district"], f["unit_id"]])
        meta["commodity_id"] = commodity_id; meta["driver_item_code"] = c["driver_item_code"]; meta["units_per_case"] = c["units_per_case"]
        fc = FB.forecast_frame(dist, meta)
        fc = fc[fc["facility_id"] == facility_id]
        return {"history": _clean(hist[["year", "month", "demand"]]), "forecast": _clean(fc), "provenance": PROVENANCE["forecast"]}

    @app.get("/real/{state_name}/{district}/ledger")
    def real_ledger(state_name: str, district: str):
        r = store.real_ledger(state_name, district)
        if r.empty:
            raise HTTPException(404, "no real ledger for this district")
        return {"rows": _clean(r), "provenance": "HMIS sections M17/M19/M20, district monthly stock ledger, MoHFW (GODL)"}

    @app.post("/entries")
    def add_entry(body: EntryIn):
        return state.add_entry(body.model_dump())

    from app.routes_ai import router as ai_router
    app.include_router(ai_router)

    # warm the hero unit so the first page a judge opens is fast
    import threading
    def _warm():
        try:
            hero = store.units().iloc[0]["unit_id"]
            alerts_for(hero)
        except Exception:
            pass
    if warm:
        threading.Thread(target=_warm, daemon=True).start()
    return app


def district_summary_data(app: FastAPI, unit_id: str, district: str) -> dict:
    return app.state.summary_data(unit_id, district)


app = create_app()
