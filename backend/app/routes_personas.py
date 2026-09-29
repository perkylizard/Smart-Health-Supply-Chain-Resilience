"""Persona routes: state officer (unit-wide transfers, national view on real HMIS) and PHC staff (own deliveries)."""
import time

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Request

from sanjeevani.engines import redistribute as R

router = APIRouter(tags=["personas"])

# State centroids (approximate, degrees) for the all-India view; public knowledge, no lookup needed.
STATE_CENTROIDS = {
    "A & N Islands": (11.7, 92.7), "Andhra Pradesh": (15.9, 79.7), "Arunachal Pradesh": (28.2, 94.7), "Assam": (26.2, 92.9), "Bihar": (25.7, 85.6),
    "Chandigarh": (30.7, 76.8), "Chhattisgarh": (21.3, 81.9), "Dadra & Nagar Haveli": (20.2, 73.0), "Daman & Diu": (20.4, 72.8), "Delhi": (28.6, 77.2),
    "Goa": (15.4, 74.0), "Gujarat": (22.7, 71.6), "Haryana": (29.2, 76.3), "Himachal Pradesh": (31.8, 77.2), "Jammu & Kashmir": (33.8, 75.0),
    "Jharkhand": (23.6, 85.3), "Karnataka": (15.0, 75.9), "Kerala": (10.5, 76.3), "Lakshadweep": (10.6, 72.6), "Madhya Pradesh": (23.5, 78.5),
    "Maharashtra": (19.6, 76.0), "Manipur": (24.7, 93.9), "Meghalaya": (25.5, 91.3), "Mizoram": (23.3, 92.9), "Nagaland": (26.1, 94.5),
    "Odisha": (20.5, 84.6), "Puducherry": (11.9, 79.8), "Punjab": (31.0, 75.4), "Rajasthan": (26.6, 73.8), "Sikkim": (27.5, 88.5),
    "Tamil Nadu": (11.0, 78.4), "Telangana": (17.9, 79.3), "Tripura": (23.8, 91.6), "Uttar Pradesh": (26.9, 80.8), "Uttarakhand": (30.1, 79.2), "West Bengal": (23.9, 87.8),
}
LEDGER_ITEMS = ["19.12", "19.14", "19.6", "19.15", "19.16", "19.10", "17.2", "17.3", "17.6", "17.7", "20.2"]


def _clean(df: pd.DataFrame) -> list[dict]:
    from app.main import _clean as c
    return c(df)


@router.get("/units/{unit_id}/transfers")
def unit_transfers(unit_id: str, request: Request, top_districts: int = 6):
    """Cross-district proposals for the unit's worst districts; the state officer approves these."""
    app = request.app; store, state = app.state.store, app.state.state
    if unit_id not in set(store.units()["unit_id"]):
        raise HTTPException(404, "unknown unit")
    al = app.state.alerts_for(unit_id)
    worst = al[al["severity"] == "red"].groupby("district").size().sort_values(ascending=False).head(top_districts).index.tolist()
    parts = []
    for d in worst:
        al_d = al[al["district"] == d]
        cids = al_d[al_d["alert"]]["commodity_id"].value_counts().head(4).index.tolist()
        for cid in cids:
            pool = al[(al["commodity_id"] == cid) & ((al["district"] == d) | ((~al["alert"]) & (al["days_of_stock"] > 24)))]
            p = R.propose(pool, cid)
            if not p.empty:
                p = p[(p["to_district"] == d) & (p["cross_district"])]
                parts.append(p)
    out = pd.concat(parts, ignore_index=True) if parts else R._empty()
    total = int(len(out))
    if not out.empty:  # the officer sees the most urgent forty; recipients with the fewest days first
        out = out.sort_values(["recipient_days_after", "km"]).head(40)
    recs = _clean(out)
    for r in recs:
        st = state.transfer_status(r["transfer_id"])
        if st: r["status"], r["decision_reason"] = st["status"], st.get("reason")
    return {"unit_id": unit_id, "districts_considered": worst, "transfers": recs, "total_proposals": total, "scenario": state.get_scenario(),
            "provenance": "OR-Tools min-cost flow across districts; distances haversine x1.3"}


@router.get("/facilities/{facility_id}/transfers")
def facility_transfers(facility_id: str, request: Request):
    """Transfers that touch one facility (as donor or recipient), with status; PHC staff confirm deliveries here."""
    app = request.app; store, state = app.state.store, app.state.state
    f = store.q("SELECT unit_id, district FROM facilities WHERE facility_id = ?", [facility_id])
    if f.empty:
        raise HTTPException(404, "unknown facility")
    unit_id, district = f.iloc[0]["unit_id"], f.iloc[0]["district"]
    al = app.state.alerts_for(unit_id)
    mine = al[al["facility_id"] == facility_id]
    cids = mine[mine["alert"]]["commodity_id"].tolist()[:6]
    parts = []
    for cid in cids:
        pool = al[(al["commodity_id"] == cid) & ((al["district"] == district) | ((~al["alert"]) & (al["days_of_stock"] > 24)))]
        p = R.propose(pool, cid)
        if not p.empty:
            parts.append(p[(p["to_id"] == facility_id) | (p["from_id"] == facility_id)])
    out = pd.concat(parts, ignore_index=True) if parts else R._empty()
    recs = _clean(out)
    for r in recs:
        st = state.transfer_status(r["transfer_id"])
        if st: r["status"], r["decision_reason"] = st["status"], st.get("reason")
        r["direction"] = "incoming" if r["to_id"] == facility_id else "outgoing"
    # include approved/delivered decisions for this facility that came from the district board
    return {"facility_id": facility_id, "transfers": recs, "provenance": "OR-Tools proposals filtered to this facility"}


def _national_ledger(basis: str, state_name: str | None = None) -> tuple[pd.DataFrame, str, str]:
    """The national district ledger at one month. basis='real': the last month every state reported publicly (March 2020).
    basis='simulated': the synthetic continuation of each real series to March 2026 (scripts/synth_hmis_extend.py), labelled simulated."""
    from sanjeevani import paths
    import duckdb
    if basis not in ("real", "simulated"):
        raise HTTPException(400, "basis must be real or simulated")
    con = duckdb.connect()  # the full national ledger parquet (all 36 states); the demo DB only keeps demo-state ledgers
    items = ",".join(f"'{i}'" for i in LEDGER_ITEMS)
    where_state = " AND state = ?" if state_name else ""
    params = [state_name] if state_name else []
    if basis == "real":
        led = con.execute("SELECT state, district, item_code, closing, distributed FROM '%s' WHERE fy='2019-20' AND month=3 AND item_code IN (%s) AND lower(district) <> lower(state)%s"
                          % (paths.DATA_PROCESSED / "hmis_ledger.parquet", items, where_state), params).df()
        month, prov = "March 2020 (latest public HMIS ledger month)", "HMIS sections M17/M19/M20 district stock ledgers (MoHFW, GODL): closing stock / monthly distribution, median over 11 commodities"
    else:
        src = paths.DATA_PROCESSED / "hmis_ledger_synth.parquet"
        if not src.exists():
            raise HTTPException(404, "synthetic continuation not built; run scripts/synth_hmis_extend.py")
        led = con.execute("SELECT state, district, item_code, closing, distributed FROM '%s' WHERE fy='2025-26' AND month=3 AND item_code IN (%s)%s"
                          % (src, items, where_state), params).df()
        month, prov = "March 2026 (simulated continuation of each district's real series; see README)", "Simulated: every real district x commodity series continued from its last public month with its own seasonality, trend and delivery pattern; not a report of actual stock"
    con.close()
    return led, month, prov


@router.get("/national/states")
def national_states(request: Request, basis: str = "real"):
    """All states from the HMIS district ledgers: months of stock on hand. basis=real (Mar 2020) or basis=simulated (continuation to Mar 2026)."""
    store = request.app.state.store
    led, month_label, prov = _national_ledger(basis)
    led["months_of_stock"] = np.where(led["distributed"] > 0, led["closing"] / led["distributed"], np.nan)
    d = led.groupby(["state", "district"]).agg(months_of_stock=("months_of_stock", "median"), items=("item_code", "count")).reset_index()
    d["share_under_1_month"] = led.assign(u=led["months_of_stock"] < 1).groupby(["state", "district"])["u"].mean().values
    s = d.groupby("state").agg(districts=("district", "count"), median_months_of_stock=("months_of_stock", "median"),
                               share_districts_under_1_month=("months_of_stock", lambda x: float((x < 1).mean()))).reset_index()
    s["lat"] = s["state"].map(lambda x: STATE_CENTROIDS.get(x, (None, None))[0]); s["lon"] = s["state"].map(lambda x: STATE_CENTROIDS.get(x, (None, None))[1])
    demo = set(store.units()["state"])
    s["phc_level_available"] = s["state"].isin(demo)
    return {"states": _clean(s.sort_values("median_months_of_stock")), "month": month_label, "basis": basis, "provenance": prov}


@router.get("/national/states/{state_name}/districts")
def national_state_districts(state_name: str, request: Request, basis: str = "real"):
    store = request.app.state.store
    from sanjeevani import paths
    import duckdb
    led, month_label, prov = _national_ledger(basis, state_name)
    led = led.drop(columns=["state"])
    con = duckdb.connect()
    # the HMIS stock-out report count (item 14.17) is real only; the simulated continuation has no such report
    so = con.execute("SELECT district, value AS stockout_reports FROM '%s' WHERE state = ? AND fy='2019-20' AND month=3 AND item_code='14.17' AND measure='Total' AND lower(district) <> lower(state)"
                     % (paths.DATA_PROCESSED / "hmis_c2.parquet"), [state_name]).df() if basis == "real" else pd.DataFrame({"district": [], "stockout_reports": []})
    con.close()
    if led.empty:
        raise HTTPException(404, "no ledger for this state")
    led["months_of_stock"] = np.where(led["distributed"] > 0, led["closing"] / led["distributed"], np.nan)
    d = led.groupby("district").agg(months_of_stock=("months_of_stock", "median"), items_reported=("item_code", "count")).reset_index()
    d = d.merge(so, on="district", how="left")
    fc_cache = paths.DATA_PROCESSED / "bq_district_forecast_synth.parquet"
    if basis == "simulated" and fc_cache.exists():
        # months of stock at forecast demand: closing at Mar 2026 / mean TimesFM forecast of the next 3 months (input and output both simulated)
        fc = pd.read_parquet(fc_cache, columns=["state", "district", "item_code", "forecast_timestamp", "forecast_value"])
        fc = fc[fc["state"] == state_name].sort_values("forecast_timestamp").groupby(["district", "item_code"]).head(3)
        fc = fc.groupby(["district", "item_code"])["forecast_value"].mean().rename("fc").reset_index()
        m = led.merge(fc, on=["district", "item_code"], how="inner")
        m["fmos"] = np.where(m["fc"] > 0, m["closing"] / m["fc"], np.nan)
        d = d.merge(m.groupby("district")["fmos"].median().rename("forecast_months_of_stock").reset_index(), on="district", how="left")
        prov += "; forecast_months_of_stock = closing / mean of the next 3 months of a BigQuery TimesFM forecast run on the simulated series"
    units = store.units(); unit = units[units["state"] == state_name]["unit_id"].tolist()
    d["unit_id"] = unit[0] if unit else None
    return {"state": state_name, "districts": _clean(d.sort_values("months_of_stock")), "month": month_label, "basis": basis,
            "provenance": prov + ("; stockout_reports = HMIS item 14.17 (stock-out rate of essential drugs, as reported)" if basis == "real" else "; no HMIS stock-out report exists for simulated months")}


# ---------- District Magistrate and district warehouse ----------

def _months_of_stock(closing, distributed):
    return float(closing / distributed) if distributed and distributed > 0 else None


@router.get("/districts/{unit_id}/{district}/indents")
def indents(unit_id: str, district: str, request: Request):
    """Warehouse queue: facilities whose indent was missed or whose stock is under lead time, with the quantity that
    brings them to two months of forecast demand. Status (dispatched/delivered) is kept in the state store."""
    app = request.app; state = app.state.state
    al = app.state.alerts_for(unit_id, district)
    need = al[(al["alert"]) & (al["cause"].isin(["supply_missed", "cases_up", "none"]))].copy()
    # a single facility's forecast can spike (reporting error or surge); cap its weekly demand at 3x the district's typical level
    # for the same medicine so one outlier cannot ask the store for hundreds of thousands of tablets
    typical = al.groupby("commodity_id")["weekly_demand_p90"].transform("median")
    weekly = np.minimum(al["weekly_demand_p90"], 3 * typical.clip(lower=1))
    need["quantity"] = np.ceil((60.0 - need["days_of_stock"]).clip(lower=0) * weekly.loc[need.index] / 7.0).astype(int)
    need = need[need["quantity"] > 0].sort_values(["days_of_stock", "facility_name"])
    need["indent_id"] = "indent:" + need["facility_id"] + ":" + need["commodity_id"]
    upc = app.state.store.commodities().set_index("commodity_id")["units_per_case"]
    need["units_per_case"] = need["commodity_id"].map(upc).fillna(1).clip(lower=1)
    need["cases"] = np.ceil(need["quantity"] / need["units_per_case"]).astype(int)  # stores dispatch whole cases
    recs = _clean(need[["indent_id", "facility_id", "facility_name", "type", "commodity_id", "commodity_name", "category", "days_of_stock", "cause", "quantity", "units_per_case", "cases", "lead_days"]])
    for r in recs:
        st = state.transfer_status(r["indent_id"])
        r["status"] = st["status"] if st else "pending"
    return {"district": district, "indents": recs, "scenario": state.get_scenario(),
            "provenance": "Quantity = stock to reach 60 days of P90 forecast demand, each facility's demand capped at 3x the district median for that medicine; facilities and stock are simulated, forecast from BigQuery TimesFM where cached"}


@router.post("/indents/{indent_id:path}/{status}")
def indent_status(indent_id: str, status: str, request: Request):
    if status not in ("dispatched", "delivered", "cancelled"):
        raise HTTPException(400, "status must be dispatched, delivered or cancelled")
    return request.app.state.state.set_transfer(indent_id, status)


@router.get("/districts/{unit_id}/{district}/warehouse")
def warehouse_stock(unit_id: str, district: str, request: Request, basis: str = "real"):
    """The district store's own stock book, per commodity at its latest reported month.
    basis=real: the HMIS district ledger. basis=simulated: the synthetic continuation to March 2026 (labelled simulated)."""
    store = request.app.state.store
    units = store.units(); st = units[units["unit_id"] == unit_id]["state"].iloc[0]
    if basis not in ("real", "simulated"):
        raise HTTPException(400, "basis must be real or simulated")
    if basis == "simulated":
        from sanjeevani import paths
        src = paths.DATA_PROCESSED / "hmis_ledger_synth.parquet"
        if not src.exists():
            raise HTTPException(404, "synthetic continuation not built")
        led = pd.read_parquet(src, filters=[("state", "==", st), ("district", "==", district)])
        led = led.drop(columns=["t", "demand", "stockout", "source", "basis_fy", "basis_month"], errors="ignore").assign(provisional=False)
    else:
        led = store.real_ledger(st, district)
    if led.empty:
        raise HTTPException(404, "no ledger for this district")
    order = {4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 12: 8, 1: 9, 2: 10, 3: 11}
    led = led.assign(o=led["month"].map(order)).sort_values(["fy", "o"])
    # every commodity the district has ever reported, each at its own latest reported month (districts drop items between years)
    last = led.groupby("item_code").tail(1).copy()
    latest_fy, latest_o = led["fy"].iloc[-1], int(led["o"].iloc[-1])
    latest_month = int(led["month"].iloc[-1])
    last["stale"] = (last["fy"] != latest_fy) | (last["o"] != latest_o)
    last["months_of_stock"] = [_months_of_stock(c, d) for c, d in zip(last["closing"], last["distributed"])]
    own_fy = led.merge(last[["item_code", "fy"]], on=["item_code", "fy"])  # each item's history within its own latest FY
    hist = own_fy.groupby("item_code")["distributed"].apply(lambda x: [None if pd.isna(v) else float(v) for v in x]).rename("distributed_by_month").reset_index()
    out = last.merge(hist, on="item_code", how="left")
    # full month-by-month ledger per item for the detail sheet; a negative closing is a reporting error in the source, flagged not hidden
    months = own_fy.assign(error=own_fy["closing"] < 0)[["item_code", "fy", "month", "opening", "received", "unusable", "distributed", "closing", "error"]]
    history = {k: _clean(g.drop(columns=["item_code"])) for k, g in months.groupby("item_code")}
    out["history"] = out["item_code"].map(history)
    out["reporting_error"] = out["closing"] < 0
    provisional = bool(led["provisional"].iloc[-1]) if "provisional" in led.columns else False
    prov = ("Simulated continuation of this district's real HMIS series to March 2026 (scripts/synth_hmis_extend.py); not actual stock" if basis == "simulated"
            else "HMIS sections M17/M19/M20, real district monthly stock ledger (MoHFW, GODL), not simulated; each commodity at its latest reported month"
                 + (" ; FY 2020-21 figures are labelled provisional by MoHFW" if provisional else ""))
    return {"district": district, "state": st, "fy": latest_fy, "month": latest_month, "provisional": provisional, "basis": basis,
            "rows": _clean(out.assign(months_of_stock=out["months_of_stock"].where(~out["reporting_error"]))[["item_code", "item_name", "fy", "month", "stale", "opening", "received", "unusable", "distributed", "closing", "months_of_stock", "reporting_error", "history"]].sort_values(["reporting_error", "months_of_stock"], na_position="last")),
            "provenance": prov}


@router.get("/districts/{unit_id}/{district}/brief")
def weekly_brief(unit_id: str, district: str, request: Request, lang: str = "en"):
    """The District Magistrate's one-page brief: assembled from engine outputs; Gemini narrative when available."""
    app = request.app; state = app.state.state
    summary = app.state.summary_data(unit_id, district)
    al = app.state.alerts_for(unit_id, district)
    tr = {k: v for k, v in state.all_transfers().items()}
    approved = sum(1 for v in tr.values() if v["status"] == "approved"); delivered = sum(1 for v in tr.values() if v["status"] == "delivered")
    data_issues = int(al["data_issue"].sum())
    top = al[al["alert"]].sort_values("days_of_stock").head(5)
    risks = [f"{r.facility_name}: {r.commodity_name}, {r.days_of_stock:.0f} days ({r.cause.replace('_', ' ')})" for r in top.itertuples()]
    staff = app.state.store.staff_latest(unit_id, district)
    gap = 1 - staff["in_position"].sum() / max(1, staff["sanctioned"].sum()) if len(staff) else None
    facts = {"district": district, "score": summary["score"], "rank": summary["rank_in_unit"], "of": summary["of"], "counts": summary["counts"],
             "facilities": summary["facilities"], "transfers_approved": approved, "transfers_delivered": delivered, "data_issues": data_issues,
             "staffing_gap": round(gap, 3) if gap is not None else None, "top_risks": risks, "scenario": summary["scenario"], "trends": summary["sparkline_deltas"]}
    narrative, status = None, "template"
    client = app.state.gemini
    try:
        from sanjeevani.gemini import brief as B
        narrative = B.run(client, facts, lang).model_dump(); status = "ok"
    except Exception as e:
        status = f"fallback: {type(e).__name__}"
    return {"facts": facts, "narrative": narrative, "status": status, "generated": time.strftime("%Y-%m-%d"),
            "provenance": "Assembled from the alert, transfer and staffing engines; narrative by Gemini when available"}


@router.post("/escalations")
def escalate(body: dict, request: Request):
    """District Magistrate escalates to the state: recorded with reason; the state officer sees it on the State screen."""
    state = request.app.state.state
    rec = state.add_entry({"kind": "escalation", "unit_id": body.get("unit_id"), "district": body.get("district"), "reason": body.get("reason", "")[:500], "by": "district_magistrate"})
    return rec


@router.get("/escalations/{unit_id}")
def escalations(unit_id: str, request: Request):
    state = request.app.state.state
    return {"escalations": [e for e in state.entries() if e.get("kind") == "escalation" and e.get("unit_id") == unit_id]}
