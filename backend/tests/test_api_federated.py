import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytest.fixture(scope="module")
def client():
    from app.main import create_app
    return TestClient(create_app(warm=False))


def test_replay_and_nodes(client):
    r = client.get("/federated/replay").json()
    assert {"districts_bihar_coldstart", "districts_bihar", "states_india"} <= set(r["tiers"])
    assert r["tiers"]["districts_bihar_coldstart"]["summary"]["rows_crossed_border"] == 0
    n = client.get("/federated/nodes").json()
    assert len(n["states_india"]["nodes"]) >= 10


def test_live_run_small(client):
    r = client.post("/federated/run", json={"tier": "districts_bihar_coldstart", "rounds": 2, "rows_per_node": 600})
    assert r.status_code == 200
    j = r.json()
    assert j["summary"]["rows_crossed_border"] == 0 and len(j["rounds"]) == 2 and j["seconds"] < 30
    assert client.post("/federated/run", json={"tier": "nope"}).status_code == 422


def test_brazil_tiers_present_and_live(client):
    r = client.get("/federated/replay").json()
    assert {"states_brazil", "countries_brics"} <= set(r["tiers"])
    assert r["tiers"]["countries_brics"]["summary"]["groups"] == ["Brazil", "India"]
    assert r["tiers"]["countries_brics"]["summary"]["rows_crossed_border"] == 0
    assert "simulated" in r["tiers"]["states_brazil"]["tier"]
    j = client.post("/federated/run", json={"tier": "states_brazil", "rounds": 2, "rows_per_node": 1500}).json()
    assert j["summary"]["nodes"] >= 20 and j["summary"]["rows_crossed_border"] == 0 and "no facility data fetched" in j["provenance"]
