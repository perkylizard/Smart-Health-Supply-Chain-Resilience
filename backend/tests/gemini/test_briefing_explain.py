import json

import pytest

from sanjeevani import paths
from sanjeevani.gemini import briefing as B, explain as E
from sanjeevani.gemini.client import GeminiClient

FIX = paths.ROOT / "backend" / "tests" / "cassettes" / "fixtures_araria.json"
pytestmark = pytest.mark.skipif(not FIX.exists(), reason="fixtures not recorded")


@pytest.fixture(scope="module")
def fx():
    return json.loads(FIX.read_text())


@pytest.fixture(scope="module")
def client():
    return GeminiClient(mode="replay", api_key=None)


def test_briefing_en_replays(client, fx):
    out = B.run(client, fx["summary"], "en", case="araria_normal_en")
    assert out.lang == "en" and 3 <= len(out.body) <= 4 and out.headline
    assert any(ch.isdigit() for ch in " ".join(out.body))


def test_briefing_hi_is_devanagari(client, fx):
    out = B.run(client, fx["summary"], "hi", case="araria_normal_hi")
    assert any("ऀ" <= ch <= "ॿ" for ch in out.headline)


def test_surge_briefing_declares_scenario(client, fx):
    out = B.run(client, fx["surge"], "en", case="araria_surge_en")
    text = (out.headline + " ".join(out.body)).lower()
    assert "scenario" in text or "what-if" in text


def test_explain_alert_cites_facility_and_number(client, fx):
    out = E.run(client, fx["alert"], "alert", "en", case="alert_en")
    assert fx["alert"]["facility_name"].split()[0] in out.explanation
    assert out.numbers_used and out.confidence in ("high", "medium", "low")


def test_explain_transfer(client, fx):
    out = E.run(client, fx["transfer"], "transfer", "en", case="transfer_en")
    assert str(fx["transfer"]["quantity"]) in out.explanation or fx["transfer"]["to_name"].split()[0] in out.explanation


def test_trim_payload_drops_noise(fx):
    p = B.trim_payload(fx["summary"])
    assert len(p["top_alerts"]) <= 10 and "lat" not in json.dumps(p)


def test_fallback_shapes():
    f = B.fallback({"district": "X", "counts": {"red": 2}}, "hi")
    assert f.lang == "hi" and "X" in f.headline
