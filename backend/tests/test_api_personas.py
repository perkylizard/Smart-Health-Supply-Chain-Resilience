import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytest.fixture(scope="module")
def client():
    from app.main import create_app
    return TestClient(create_app(warm=False))


def test_national_states(client):
    r = client.get("/national/states").json()
    assert len(r["states"]) >= 30 and all("median_months_of_stock" in s for s in r["states"])
    assert any(s["state"] == "Bihar" and s["phc_level_available"] for s in r["states"])


def test_national_state_districts(client):
    r = client.get("/national/states/Kerala/districts").json()
    assert len(r["districts"]) >= 10 and r["districts"][0]["unit_id"] is None


def test_unit_transfers_cross_district(client):
    r = client.get("/units/ladakh/transfers").json()
    assert "transfers" in r and all(t["cross_district"] for t in r["transfers"])


def test_facility_transfers(client):
    f = client.get("/districts/ladakh/Kargil/facilities").json()["facilities"][0]["facility_id"]
    r = client.get(f"/facilities/{f}/transfers").json()
    assert r["facility_id"] == f and all(t["direction"] in ("incoming", "outgoing") for t in r["transfers"])


def test_indents_and_status(client):
    r = client.get("/districts/bihar/Araria/indents").json()
    assert len(r["indents"]) > 0 and r["indents"][0]["status"] == "pending"
    iid = r["indents"][0]["indent_id"]
    assert client.post(f"/indents/{iid}/dispatched").json()["status"] == "dispatched"
    assert client.post(f"/indents/{iid}/bogus").status_code == 400


def test_warehouse_is_real_ledger(client):
    r = client.get("/districts/bihar/Araria/warehouse").json()
    assert r["fy"] == "2019-20" and any(x["item_code"] == "19.12" for x in r["rows"])
    assert "not simulated" in r["provenance"]


def test_brief_and_escalation(client):
    r = client.get("/districts/bihar/Araria/brief").json()
    assert r["facts"]["district"] == "Araria" and "top_risks" in r["facts"] and r["status"]
    e = client.post("/escalations", json={"unit_id": "bihar", "district": "Araria", "reason": "ORS wave"}).json()
    assert e["kind"] == "escalation"
    assert len(client.get("/escalations/bihar").json()["escalations"]) == 1
