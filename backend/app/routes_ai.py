"""AI routes: briefing, explain (Plan 3 Task 2); ask, entries, brief added in later tasks."""
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import duckdb

from sanjeevani import paths
from sanjeevani.gemini import ask_guided as G, ask_sql as Q, briefing as B, explain as E
from sanjeevani.gemini.client import CassetteMiss, GeminiClient, GeminiUnavailable

router = APIRouter(prefix="/ai", tags=["ai"])
_cache: dict[tuple, tuple[float, dict]] = {}
TTL = 600


class AskIn(BaseModel):
    question: str
    unit: str
    district: str | None = None
    lang: str = "en"
    mode: str = "guided"
    sql: str | None = None


class ExplainIn(BaseModel):
    kind: str = "alert"
    item: dict
    lang: str = "en"


def _client(request: Request) -> GeminiClient:
    return request.app.state.gemini


@router.get("/briefing/{unit_id}/{district}")
def briefing(unit_id: str, district: str, request: Request, lang: str = "en"):
    from app.main import district_summary_data  # late import to avoid a cycle
    summary = district_summary_data(request.app, unit_id, district)
    sc = summary["scenario"]
    key = (unit_id, district, sc["name"], round(sc["intensity"], 2), lang)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    client = _client(request)
    try:
        out = B.run(client, summary, lang).model_dump(); out["status"] = "ok"
    except (GeminiUnavailable, CassetteMiss) as e:
        out = B.fallback(summary, lang).model_dump(); out["status"] = f"fallback: {type(e).__name__}"
    except Exception as e:  # never 500 on the briefing
        out = B.fallback(summary, lang).model_dump(); out["status"] = f"fallback: {type(e).__name__}: {str(e)[:120]}"
    out["provenance"] = "Gemini-generated from engine outputs; numbers are from the summary endpoint"
    out["model"] = client.model
    _cache[key] = (time.time(), out)
    return out


@router.post("/explain")
def explain(body: ExplainIn, request: Request):
    if body.kind not in ("alert", "transfer"):
        raise HTTPException(400, "kind must be alert or transfer")
    client = _client(request)
    try:
        out = E.run(client, body.item, body.kind, body.lang).model_dump(); out["status"] = "ok"
    except (GeminiUnavailable, CassetteMiss) as e:
        out = {"explanation": body.item.get("reason") or body.item.get("cause_detail") or "Explanation unavailable.", "numbers_used": [], "confidence": "low", "status": f"fallback: {type(e).__name__}"}
    out["model"] = client.model
    return out


@router.post("/ask")
def ask(body: AskIn, request: Request):
    client = _client(request)
    if body.mode not in ("guided", "advanced"):
        raise HTTPException(400, "mode must be guided or advanced")
    try:
        if body.mode == "guided":
            con = duckdb.connect(str(paths.DATA / "demo.duckdb"), read_only=True)
            try:
                out = G.run(client, con, body.question[:2000], body.unit, body.district, body.lang)
            finally:
                con.close()
        else:
            out = Q.run(client, body.question[:2000], body.unit, body.district, body.lang, user_sql=body.sql)
        out["status"] = "ok"
    except (GeminiUnavailable, CassetteMiss) as e:
        out = {"mode": body.mode, "question": body.question, "answer": "", "rows": [], "error": f"AI unavailable ({type(e).__name__})", "status": "fallback"}
    out["model"] = client.model
    return out
