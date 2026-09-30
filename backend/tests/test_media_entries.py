import base64
import json

import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths
from sanjeevani.gemini.client import GeminiClient

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


def test_voice_note_is_read_into_lines_from_the_facilitys_own_medicines():
    from app.main import create_app
    seen = {}

    def fake(prompt, schema, media, system):
        seen["prompt"], seen["media"] = prompt, media
        return json.dumps({"items": [{"commodity_id": "ors", "quantity": 40, "heard": "ORS chalis"}, {"commodity_id": "not_a_medicine", "quantity": 5, "heard": "x"}],
                           "transcript": "ORS chalis packet bache hain", "unclear": None})
    c = TestClient(create_app(gemini=GeminiClient(mode="live", transport=fake), warm=False))
    fid = c.get("/districts/bihar/Araria/facilities").json()["facilities"][0]["facility_id"]
    r = c.post("/ai/entries/parse", json={"facility_id": fid, "kind": "voice", "mime": "audio/wav", "data": base64.b64encode(b"RIFF....WAVE").decode()})
    assert r.status_code == 200
    out = r.json()
    assert [i["commodity_id"] for i in out["items"]] == ["ors"]  # anything not in the facility's list is dropped
    assert out["items"][0]["commodity_name"].startswith("ORS") and out["items"][0]["was"] is not None
    assert seen["media"][0][1] == "audio/wav" and "ors:" in seen["prompt"]
    assert c.post("/ai/entries/parse", json={"facility_id": fid, "kind": "photo", "mime": "text/plain", "data": "eA=="}).status_code == 415


def test_a_typed_line_the_device_cannot_read_goes_to_gemini_without_media():
    from app.main import create_app
    seen = {}

    def fake(prompt, schema, media, system):
        seen["prompt"], seen["media"] = prompt, media
        return json.dumps({"items": [{"commodity_id": "ors", "quantity": 0, "heard": "ors ekdum khatam"}], "transcript": "ors ekdum khatam", "unclear": None})
    c = TestClient(create_app(gemini=GeminiClient(mode="live", transport=fake), warm=False))
    fid = c.get("/districts/bihar/Araria/facilities").json()["facilities"][0]["facility_id"]
    r = c.post("/ai/entries/parse", json={"facility_id": fid, "kind": "text", "text": "ors ekdum khatam"})
    assert r.status_code == 200 and r.json()["items"][0]["quantity"] == 0
    assert not seen["media"] and "Message: ors ekdum khatam" in seen["prompt"]
    assert c.post("/ai/entries/parse", json={"facility_id": fid, "kind": "text", "text": " "}).status_code == 400
