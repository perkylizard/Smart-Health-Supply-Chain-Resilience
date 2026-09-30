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


@router.get("/units/{unit_id}/requests")
def for_unit(unit_id: str, request: Request, status: str | None = None):
    """State and magistrate view: every facility request in the state, newest first, with per-district status counts."""
    recs = _enrich(request, [r for r in _all(request) if r["unit_id"] == unit_id])
    by: dict = {}
    for r in recs:
        d = by.setdefault(r["district"], {"district": r["district"], "requested": 0, "approved": 0, "declined": 0, "dispatched": 0, "delivered": 0, "total": 0})
        d[r["status"]] += 1; d["total"] += 1
    return {"requests": [r for r in recs if status is None or r["status"] == status],
            "by_district": sorted(by.values(), key=lambda x: (-x["requested"], -x["total"]))}


def _counts(request: Request, keep) -> list[dict]:
    """Stock counts confirmed by PHC staff (Report screen), newest first, with the facility and medicine named."""
    store = request.app.state.store
    names = store.commodities().set_index("commodity_id")["name"].to_dict()
    ents = [e for e in request.app.state.state.entries() if e.get("kind") in (None, "count") and "commodity_id" in e and "quantity" in e]
    if not ents:
        return []
    ids = sorted({e["facility_id"] for e in ents})
    fac = store.q(f"SELECT facility_id, name, type, unit_id, district FROM facilities WHERE facility_id IN ({','.join('?' * len(ids))})", ids).set_index("facility_id")
    out = []
    for e in sorted(ents, key=lambda e: -e.get("received", 0)):
        if e["facility_id"] not in fac.index:
            continue
        f = fac.loc[e["facility_id"]]
        row = {"entry_id": e.get("entry_id"), "facility_id": e["facility_id"], "facility_name": f["name"], "type": f["type"], "unit_id": f["unit_id"],
               "district": f["district"], "commodity_id": e["commodity_id"], "commodity_name": names.get(e["commodity_id"], e["commodity_id"]),
               "quantity": e["quantity"], "channel": e.get("channel", "web"), "received": e.get("received"), "sample": bool(e.get("sample"))}
        if keep(row):
            out.append(row)
    return out


@router.get("/districts/{unit_id}/{district}/counts")
def counts_district(unit_id: str, district: str, request: Request, limit: int = 100):
    rows = _counts(request, lambda r: r["unit_id"] == unit_id and r["district"] == district)
    return {"counts": rows[:limit], "total": len(rows), "facilities": len({r["facility_id"] for r in rows})}


@router.get("/units/{unit_id}/counts")
def counts_unit(unit_id: str, request: Request, limit: int = 100):
    rows = _counts(request, lambda r: r["unit_id"] == unit_id)
    by: dict = {}
    for r in rows:
        d = by.setdefault(r["district"], {"district": r["district"], "counts": 0, "facilities": set(), "latest": 0})
        d["counts"] += 1; d["facilities"].add(r["facility_id"]); d["latest"] = max(d["latest"], r["received"] or 0)
    return {"counts": rows[:limit], "total": len(rows),
            "by_district": sorted(({**v, "facilities": len(v["facilities"])} for v in by.values()), key=lambda x: -x["latest"])}


@router.get("/facilities/{facility_id}/counts")
def counts_facility(facility_id: str, request: Request):
    return {"counts": _counts(request, lambda r: r["facility_id"] == facility_id)}
