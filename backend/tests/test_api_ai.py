import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths
from sanjeevani.gemini.client import GeminiClient

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


def _fake(prompt, schema, media, system):
    if schema.__name__ == "BriefingOut":
        return '{"headline":"Fake headline 3 PHCs","body":["a","b","c"],"top_actions":["x"],"lang":"en"}'
    if schema.__name__ == "ExplainOut":
        return '{"explanation":"because","numbers_used":["6 days"],"confidence":"medium"}'
    return "{}"


@pytest.fixture(scope="module")
def client():
    from app.main import create_app
    return TestClient(create_app(gemini=GeminiClient(mode="live", transport=_fake, api_key=None)))


@pytest.fixture(scope="module")
def replay_client():
    from app.main import create_app
    return TestClient(create_app(gemini=GeminiClient(mode="replay", api_key=None)))


def test_briefing_route_wired_and_cached(client):
    r = client.get("/ai/briefing/bihar/Araria").json()
    assert r["status"] == "ok" and r["headline"].startswith("Fake") and "provenance" in r
    r2 = client.get("/ai/briefing/bihar/Araria").json()
    assert r2 == r


def test_briefing_falls_back_without_cassette(replay_client):
    r = replay_client.get("/ai/briefing/bihar/Araria?lang=hi").json()
    assert r["status"].startswith("fallback") and r["lang"] == "hi" and r["headline"]


def test_explain_route(client):
    s = client.get("/districts/bihar/Araria/summary").json()
    r = client.post("/ai/explain", json={"kind": "alert", "item": s["alerts"][0], "lang": "en"}).json()
    assert r["explanation"] == "because"
    assert client.post("/ai/explain", json={"kind": "bad", "item": {}}).status_code == 400
