"""AI routes: briefing, explain (Plan 3 Task 2); ask, entries, brief added in later tasks."""
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

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
    except Exception as e:
        out = {"explanation": body.item.get("reason") or body.item.get("cause_detail") or "Explanation unavailable.", "numbers_used": [], "confidence": "low", "status": f"fallback: {type(e).__name__}"}
    out["model"] = client.model_for("explain")
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
    except Exception as e:  # never 500 on an AI route
        out = {"mode": body.mode, "question": body.question, "answer": "", "rows": [], "error": f"AI error: {str(e)[:160]}", "status": "fallback"}
    out["model"] = client.model_for("ask_guided" if body.mode == "guided" else "ask_sql")
    return out


class MediaIn(BaseModel):
    facility_id: str
    kind: str = Field(pattern="^(photo|voice|text)$")
    mime: str = ""
    data: str = Field("", max_length=14_000_000)  # base64; about 10 MB of image or audio
    text: str | None = Field(None, max_length=1000)  # a typed line the on-device parser could not read
    lang: str = "en"


MEDIA_TYPES = {"photo": {"image/jpeg", "image/png", "image/webp", "image/heic"}, "voice": {"audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/flac", "audio/webm", "audio/mp4"}}


@router.post("/entries/parse")
def parse_media(body: MediaIn, request: Request):
    """A register photo or a voice note, read into stock lines for the facility to confirm. Nothing is saved here."""
    import base64
    from sanjeevani.gemini import entries as EN
    app = request.app
    f = app.state.store.q("SELECT unit_id, district FROM facilities WHERE facility_id = ?", [body.facility_id])
    if f.empty:
        raise HTTPException(404, "unknown facility")
    mime, data = "", b""
    if body.kind == "text":
        if not (body.text or "").strip():
            raise HTTPException(400, "text is empty")
    else:
        mime = body.mime.split(";")[0].strip().lower()
        if mime not in MEDIA_TYPES[body.kind]:
            raise HTTPException(415, f"{body.kind} must be one of {sorted(MEDIA_TYPES[body.kind])}")
        try:
            data = base64.b64decode(body.data, validate=True)
        except Exception:
            raise HTTPException(400, "data is not base64")
    al = app.state.alerts_for(f.iloc[0]["unit_id"], f.iloc[0]["district"])
    mine = al[al["facility_id"] == body.facility_id]
    catalogue = list(dict.fromkeys(zip(mine["commodity_id"], mine["commodity_name"])))
    closing = dict(zip(mine["commodity_id"], mine["closing"]))
    try:
        out = EN.run(_client(request), data, mime, body.kind, catalogue, body.lang, text=body.text)
    except (GeminiUnavailable, CassetteMiss) as e:
        raise HTTPException(503, f"live AI is not available here ({type(e).__name__}); type the stock instead")
    except Exception as e:
        raise HTTPException(502, f"could not read the {body.kind}: {str(e)[:160]}")
    names = dict(catalogue)
    return {"items": [{**i.model_dump(), "commodity_name": names.get(i.commodity_id), "was": None if closing.get(i.commodity_id) is None else float(closing[i.commodity_id])} for i in out.items],
            "transcript": out.transcript, "unclear": out.unclear, "model": _client(request).model_for({"photo": "register", "voice": "voice"}.get(body.kind, "explain"))}
