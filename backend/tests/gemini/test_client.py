import json

import pytest
from pydantic import BaseModel

from sanjeevani.gemini import client as C


class Out(BaseModel):
    headline: str
    n: int


def test_replay_from_cassette(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CASSETTES", tmp_path)
    (tmp_path / "svc").mkdir()
    (tmp_path / "svc" / "case1.json").write_text(json.dumps({"response": '{"headline":"hi","n":3}'}))
    c = C.GeminiClient(mode="replay", api_key=None)
    out = c.generate_json("p", Out, service="svc", case="case1")
    assert out.headline == "hi" and out.n == 3 and c.calls == 0


def test_replay_miss_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CASSETTES", tmp_path)
    c = C.GeminiClient(mode="replay", api_key=None)
    with pytest.raises(C.CassetteMiss):
        c.generate_json("p", Out, service="svc", case="nope")


def test_live_with_fake_transport_records(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CASSETTES", tmp_path)
    fake = lambda prompt, schema, media, system: '{"headline":"from fake","n":1}'
    c = C.GeminiClient(mode="live", transport=fake, api_key=None)
    assert c.available
    out = c.generate_json("prompt", Out, service="svc", case="rec")
    assert out.headline == "from fake"
    assert (tmp_path / "svc" / "rec.json").exists()
    # and now replays without transport
    c2 = C.GeminiClient(mode="replay", api_key=None)
    assert c2.generate_json("prompt", Out, service="svc", case="rec").n == 1


def test_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(C, "_load_env_key", lambda: None)
    c = C.GeminiClient(mode="live", api_key=None)
    assert not c.available
    with pytest.raises(C.GeminiUnavailable):
        c.generate_json("p", Out)


def test_key_is_stable_and_media_sensitive():
    k1 = C.GeminiClient._key("m", "p", "S", None, "sys")
    k2 = C.GeminiClient._key("m", "p", "S", [(b"img", "image/png")], "sys")
    assert k1 != k2 and k1 == C.GeminiClient._key("m", "p", "S", None, "sys")
