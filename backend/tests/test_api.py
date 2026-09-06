import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytest.fixture(scope="module")
def client():
    from app.main import create_app
    return TestClient(create_app())


def test_health_and_units(client):
    assert client.get("/health").json()["ok"]
    u = client.get("/units").json()["units"]
    assert len(u) == 14 and u[0]["unit_id"] == "bihar"


def test_unit_districts_have_scores(client):
    d = client.get("/units/bihar/districts").json()["districts"]
    assert len(d) == 38 and all("score" in x for x in d)


def test_district_summary_keys(client):
    s = client.get("/districts/bihar/Araria/summary").json()
    assert {"counts", "alerts", "sparklines", "score", "provenance"} <= set(s)
    assert len(s["sparklines"]["opd"]) == 12


def test_facilities_and_facility_card(client):
    f = client.get("/districts/bihar/Araria/facilities").json()["facilities"]
    assert len(f) > 20 and {"worst_severity", "lat", "lon", "source"} <= set(f[0])
    card = client.get(f"/facilities/{f[0]['facility_id']}").json()
    assert {"facility", "stock", "forecast", "staff", "beds", "provenance"} <= set(card)


def test_scenario_changes_alerts(client):
    base = client.get("/districts/bihar/Araria/summary").json()["counts"]
    r = client.post("/scenario", json={"name": "monsoon_surge", "intensity": 1.0}); assert r.status_code == 200
    surge = client.get("/districts/bihar/Araria/summary").json()["counts"]
    assert surge.get("red", 0) + surge.get("amber", 0) >= base.get("red", 0) + base.get("amber", 0)
    client.post("/scenario", json={"name": "normal", "intensity": 1.0})


def test_transfers_and_approval_flow(client):
    client.post("/scenario", json={"name": "monsoon_surge", "intensity": 1.0})
    t = client.get("/transfers/bihar/Araria").json()["transfers"]
    client.post("/scenario", json={"name": "normal", "intensity": 1.0})
    assert len(t) > 0 and t[0]["status"] == "proposed"
    tid = t[0]["transfer_id"]
    assert client.post(f"/transfers/{tid}/approve").json()["status"] == "approved"
    assert client.post(f"/transfers/{tid}/reject", json={"reason": "road_closed"}).json()["status"] == "rejected"
    assert client.post(f"/transfers/{tid}/reject", json={"reason": "bad"}).status_code == 422


def test_forecast_and_real_ledger(client):
    f = client.get("/districts/bihar/Araria/facilities").json()["facilities"][0]["facility_id"]
    fc = client.get(f"/forecast/{f}/ors").json()
    assert len(fc["forecast"]) == 8
    r = client.get("/real/Bihar/Araria/ledger").json()
    assert any(x["item_code"] == "19.12" for x in r["rows"])


def test_entry(client):
    r = client.post("/entries", json={"facility_id": "x", "commodity_id": "ors", "quantity": 40, "channel": "voice"})
    assert r.status_code == 200 and r.json()["entry_id"].startswith("e")
