"""Federated learning routes: replay (stored), live run (seconds), node listing. India tiers plus a simulated Brazil node."""
import functools
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
    tier: str = Field("districts_bihar_coldstart", pattern="^(districts_bihar_coldstart|districts_bihar|states_india|states_brazil|countries_brics)$")
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


@functools.lru_cache(maxsize=8)
def _nodes(tier: str, rows: int | None) -> tuple[tuple, str | None]:
    """Loading and sampling the node ledgers is the slow part (seconds; training itself is well under one), so each
    tier is built once per server and reused. Training only reads these arrays, so sharing them between runs is safe."""
    if tier == "states_india":
        return tuple(N.state_nodes(sample_per_state=rows or 30000)), None
    if tier == "states_brazil":
        return tuple(N.brazil_uf_nodes(sample_per_uf=rows or 20000)), None
    if tier == "countries_brics":
        return tuple(_nodes("states_india", rows)[0] + _nodes("states_brazil", rows)[0]), "BRICS"
    return tuple(N.district_nodes("bihar", sample_per_district=rows or (600 if tier.endswith("coldstart") else 12000))), None


def load_nodes(tier: str, rows: int | None = None) -> tuple[list, str | None]:
    ns, top = _nodes(tier, rows)
    return list(ns), top


def warm() -> None:
    """Build every tier's nodes in the background at start, so the first live round answers in about a second."""
    for tier in ("districts_bihar_coldstart", "districts_bihar", "countries_brics"):
        try:
            load_nodes(tier)
        except Exception:
            pass


@router.post("/run")
def run(body: RunIn):
    """Runs hierarchical FedAvg now, in-process, and returns per-round metrics. Takes 3 to 15 seconds."""
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "a federated run is already in progress")
    try:
        t0 = time.time()
        ns, top_name = load_nodes(body.tier, body.rows_per_node)
        if not ns:
            raise HTTPException(400, "no node has enough rows at that size")
        hist, summary = F.run(ns, rounds=body.rounds, local_epochs=2, seed=int(time.time()) % 1000, top_name=top_name)
        return {"tier": body.tier, "summary": summary, "seconds": round(time.time() - t0, 1),
                "nodes": [{"name": n.name, "group": n.group, "rows": n.rows} for n in ns],
                "rounds": [{"round": h.round, "global": h.global_metrics, "rows_crossed": h.rows_crossed, "per_node": h.per_node} for h in hist],
                "provenance": "Live hierarchical FedAvg over simulated facility ledgers seeded from real HMIS; only weight vectors and row counts leave a node"
                              + ("; Brazil: simulated node, shaped on the public BNAFAR/Hórus sample structure; no facility data fetched" if body.tier in ("states_brazil", "countries_brics") else "")}
    finally:
        _lock.release()
