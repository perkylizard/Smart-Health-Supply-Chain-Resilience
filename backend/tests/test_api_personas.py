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
    # Bihar has the provisional 2020-21 year; the stock book shows the latest reported month and says so
    assert r["fy"] == "2020-21" and r["month"] == 3 and r["provisional"] is True
    ors = next(x for x in r["rows"] if x["item_code"] == "19.12")  # Araria stopped reporting ORS after 2019-20: shown at its own month
    assert ors["fy"] == "2019-20" and ors["stale"] is True  # last reported Feb 2020
    assert all(x["stale"] is False for x in r["rows"] if x["fy"] == "2020-21" and x["month"] == 3)
    assert "not simulated" in r["provenance"] and "provisional" in r["provenance"]
    r = client.get("/districts/uttar_pradesh/Agra/warehouse").json()
    assert r["fy"] == "2019-20" and r["provisional"] is False


def test_brief_and_escalation(client):
    r = client.get("/districts/bihar/Araria/brief").json()
    assert r["facts"]["district"] == "Araria" and "top_risks" in r["facts"] and r["status"]
    e = client.post("/escalations", json={"unit_id": "bihar", "district": "Araria", "reason": "ORS wave"}).json()
    assert e["kind"] == "escalation"
    assert len(client.get("/escalations/bihar").json()["escalations"]) == 1


def test_national_view_has_real_and_simulated_basis(client):
    real = client.get("/national/states?basis=real").json()
    assert real["basis"] == "real" and "March 2020" in real["month"] and len(real["states"]) >= 30
    sim = client.get("/national/states?basis=simulated").json()
    assert sim["basis"] == "simulated" and "March 2026" in sim["month"] and "imulated" in sim["provenance"] and len(sim["states"]) >= 30
    d = client.get("/national/states/Bihar/districts?basis=simulated").json()
    assert d["basis"] == "simulated" and len(d["districts"]) >= 20 and all(x["stockout_reports"] is None for x in d["districts"])
    assert client.get("/national/states?basis=guess").status_code == 400
