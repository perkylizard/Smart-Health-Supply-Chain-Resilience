"""Federated learning routes: replay (stored), live run (seconds), node listing. India-only tiers."""
import json
import threading
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from sanjeevani import paths
from sanjeevani.federated import fedavg as F, nodes as N

router = APIRouter(prefix="/federated", tags=["federated"])
_lock = threading.Lock()
REPLAY = paths.DATA_PROCESSED / "federated_replay.json"


class RunIn(BaseModel):
    tier: str = Field("districts_bihar_coldstart", pattern="^(districts_bihar_coldstart|districts_bihar|states_india)$")
    rounds: int = Field(5, ge=1, le=10)
    rows_per_node: int | None = Field(None, ge=100, le=30000)


@router.get("/replay")
def replay():
    if not REPLAY.exists():
        raise HTTPException(404, "replay not built; run scripts/federated_replay.py")
    return json.loads(REPLAY.read_text())


@router.get("/nodes")
def nodes():
    if not REPLAY.exists():
        raise HTTPException(404, "replay not built")
    rep = json.loads(REPLAY.read_text())
    return {k: {"label": v["tier"], "nodes": v["nodes"]} for k, v in rep["tiers"].items()}


@router.post("/run")
def run(body: RunIn):
    """Runs hierarchical FedAvg now, in-process, and returns per-round metrics. Takes 3 to 15 seconds."""
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "a federated run is already in progress")
    try:
        t0 = time.time()
        if body.tier == "states_india":
            ns = N.state_nodes(sample_per_state=body.rows_per_node or 30000)
        else:
            ns = N.district_nodes("bihar", sample_per_district=body.rows_per_node or (600 if body.tier.endswith("coldstart") else 12000))
        if not ns:
            raise HTTPException(400, "no node has enough rows at that size")
        hist, summary = F.run(ns, rounds=body.rounds, local_epochs=2, seed=int(time.time()) % 1000)
        return {"tier": body.tier, "summary": summary, "seconds": round(time.time() - t0, 1),
                "nodes": [{"name": n.name, "group": n.group, "rows": n.rows} for n in ns],
                "rounds": [{"round": h.round, "global": h.global_metrics, "rows_crossed": h.rows_crossed, "per_node": h.per_node} for h in hist],
                "provenance": "Live hierarchical FedAvg over simulated facility ledgers seeded from real HMIS; only weight vectors and row counts leave a node"}
    finally:
        _lock.release()
