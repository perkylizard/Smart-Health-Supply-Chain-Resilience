"""Stock requests raised by PHC staff.

Flow (mirrors how indents move in Indian district supply chains): the facility requests a medicine and quantity ->
the District Health Officer approves or declines -> the district warehouse dispatches -> the facility confirms delivery.
Statuses live in the same state store as transfer decisions, keyed by request_id."""
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["requests"])
FLOW = {"requested": {"approved", "declined"}, "approved": {"dispatched"}, "dispatched": {"delivered"}}


class RequestIn(BaseModel):
    facility_id: str
    commodity_id: str
    quantity: int = Field(..., gt=0, le=10_000_000)
    note: str | None = Field(None, max_length=300)


class DecisionIn(BaseModel):
    reason: str | None = Field(None, max_length=300)


def _enrich(request: Request, recs: list[dict]) -> list[dict]:
    store, state = request.app.state.store, request.app.state.state
    names = store.commodities().set_index("commodity_id")["name"].to_dict()
    out = []
    for r in recs:
        st = state.transfer_status(r["request_id"])
        out.append({**r, "commodity_name": names.get(r["commodity_id"], r["commodity_id"]), "status": st["status"] if st else "requested",
                    "decision_reason": st.get("reason") if st else None, "updated": st["updated"] if st else r["received"]})
    return sorted(out, key=lambda x: -x["received"])


def _all(request: Request) -> list[dict]:
    return [e for e in request.app.state.state.entries() if e.get("kind") == "request"]


@router.post("/requests")
def create(body: RequestIn, request: Request):
    store, state = request.app.state.store, request.app.state.state
    f = store.q("SELECT facility_id, name, unit_id, district, type FROM facilities WHERE facility_id = ?", [body.facility_id])
    if f.empty:
        raise HTTPException(404, "unknown facility")
    if body.commodity_id not in set(store.commodities()["commodity_id"]):
        raise HTTPException(400, "unknown medicine")
    row = f.iloc[0]
    rid = f"request:{body.facility_id}:{body.commodity_id}:{int(time.time() * 1000)}"
    rec = state.add_entry({"kind": "request", "request_id": rid, "facility_id": body.facility_id, "facility_name": row["name"], "type": row["type"],
                           "unit_id": row["unit_id"], "district": row["district"], "commodity_id": body.commodity_id,
                           "quantity": body.quantity, "note": body.note})
    return _enrich(request, [rec])[0]


@router.get("/facilities/{facility_id}/requests")
def for_facility(facility_id: str, request: Request):
    return {"requests": _enrich(request, [r for r in _all(request) if r["facility_id"] == facility_id])}


@router.get("/districts/{unit_id}/{district}/requests")
def for_district(unit_id: str, district: str, request: Request, status: str | None = None):
    recs = _enrich(request, [r for r in _all(request) if r["unit_id"] == unit_id and r["district"] == district])
    return {"requests": [r for r in recs if status is None or r["status"] == status]}


@router.post("/requests/{request_id:path}/{status}")
def move(request_id: str, status: str, request: Request, body: DecisionIn | None = None):
    state = request.app.state.state
    rec = next((r for r in _all(request) if r["request_id"] == request_id), None)
    if rec is None:
        raise HTTPException(404, "unknown request")
    cur = (state.transfer_status(request_id) or {}).get("status", "requested")
    if status not in FLOW.get(cur, set()):
        raise HTTPException(409, f"a {cur} request cannot become {status}")
    state.set_transfer(request_id, status, body.reason if body else None)
    return _enrich(request, [rec])[0]
