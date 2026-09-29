"""GET /districts/{unit}/{district}/resilience-alerts: proactive stock-out warnings for the district view."""
from fastapi import APIRouter, Request

from sanjeevani.engines import resilience_alerts as RA
from sanjeevani.engines import scenario as S

router = APIRouter(tags=["resilience"])
COLS = ["facility_id", "facility_name", "type", "district", "commodity_id", "commodity_name", "category", "tier", "cause", "cause_detail",
        "closing", "days_of_stock", "runs_out_in_days", "resupply_in_days", "short_by_days", "fix_from", "fix_quantity", "fix_km", "fix_transfer_id", "reported"]


@router.get("/districts/{unit_id}/{district}/resilience-alerts")
def resilience_alerts(unit_id: str, district: str, request: Request, limit: int = 60):
    from app.main import _clean
    app = request.app
    sc = app.state.state.get_scenario()
    mult = 1.0 if sc["name"] == "normal" else 1.0 + float(sc.get("intensity", 1.0))
    al = RA.classify(app.state.alerts_for(unit_id, district), scenario_mult=mult)
    try:
        props = app.state.proposals_for(unit_id, district)
    except Exception:  # proposals are a suggestion, never a reason to fail the warnings
        props = None
    al = RA.attach_fixes(al, props)
    counts = al["tier"].value_counts().to_dict() if len(al) else {}
    rows = al[[c for c in COLS if c in al.columns]].head(limit)
    return {"district": district, "scenario": sc, "counts": {k: int(counts.get(k, 0)) for k in ("critical", "warning", "watch")},
            "facilities_at_risk": int(al["facility_id"].nunique()) if len(al) else 0, "alerts": _clean(rows),
            "provenance": "Alert engine days of stock (simulated facility ledger, forecast from BigQuery TimesFM where cached) against each facility's resupply lead time; fixes from the OR-Tools proposals"}
