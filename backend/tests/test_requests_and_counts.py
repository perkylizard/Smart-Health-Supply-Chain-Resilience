import pytest
from fastapi.testclient import TestClient

from sanjeevani import paths

pytestmark = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytest.fixture(scope="module")
def client():
    from app.main import create_app
    return TestClient(create_app(warm=False))


def _alerting(client):
    al = client.get("/districts/bihar/Araria/summary").json()["alerts"]
    return next(a for a in al if a["alert"] and a["severity"] == "red" and a["commodity_id"] != "calcium_500")


def test_a_confirmed_count_changes_the_district_view(client):
    a = _alerting(client)
    big = 10_000_000
    client.post("/entries", json={"facility_id": a["facility_id"], "commodity_id": a["commodity_id"], "quantity": big, "channel": "chat"})
    al = client.get("/districts/bihar/Araria/summary").json()["alerts"]
    assert not any(x["facility_id"] == a["facility_id"] and x["commodity_id"] == a["commodity_id"] for x in al)  # no longer an alert
    fac = client.get(f"/facilities/{a['facility_id']}").json()["stock"]
    row = next(x for x in fac if x["commodity_id"] == a["commodity_id"])
    assert row["closing"] == big and row["alert"] is False and row["reported"] is True


def test_request_flow_requested_approved_dispatched_delivered(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][0]["facility_id"]
    r = client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 200, "note": "diarrhoea cases rising"}).json()
    assert r["status"] == "requested" and r["commodity_name"].startswith("ORS")
    rid = r["request_id"]
    assert any(x["request_id"] == rid for x in client.get("/districts/bihar/Araria/requests?status=requested").json()["requests"])
    assert client.post(f"/requests/{rid}/dispatched").status_code == 409  # the warehouse cannot skip the officer's approval
    assert client.post(f"/requests/{rid}/approved").json()["status"] == "approved"
    assert client.post(f"/requests/{rid}/dispatched").json()["status"] == "dispatched"
    assert client.post(f"/requests/{rid}/delivered").json()["status"] == "delivered"
    mine = client.get(f"/facilities/{fid}/requests").json()["requests"]
    assert next(x for x in mine if x["request_id"] == rid)["status"] == "delivered"


def test_decline_keeps_the_reason_and_bad_input_is_refused(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][0]["facility_id"]
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 5}).json()["request_id"]
    d = client.post(f"/requests/{rid}/declined", json={"reason": "stock sent last week"}).json()
    assert d["status"] == "declined" and d["decision_reason"] == "stock sent last week"
    assert client.post("/requests", json={"facility_id": fid, "commodity_id": "nope", "quantity": 5}).status_code == 400
    assert client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 0}).status_code == 422


def test_approved_request_appears_in_the_warehouse_queue(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][1]["facility_id"]
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": "zinc_20mg", "quantity": 90}).json()["request_id"]
    q = lambda: {x["indent_id"]: x for x in client.get("/districts/bihar/Araria/indents").json()["indents"]}
    assert rid not in q()  # not before the officer approves
    client.post(f"/requests/{rid}/approved")
    row = q()[rid]
    assert row["source"] == "request" and row["status"] == "pending" and row["quantity"] == 90
    client.post(f"/requests/{rid}/dispatched")
    assert q()[rid]["status"] == "dispatched"


def test_resilience_alerts_endpoint(client):
    r = client.get("/districts/bihar/Araria/resilience-alerts").json()
    assert set(r["counts"]) == {"critical", "warning", "watch"} and r["alerts"] and r["facilities_at_risk"] > 0
    first = r["alerts"][0]
    assert first["tier"] == "critical" and first["runs_out_in_days"] <= first["resupply_in_days"]
    assert any(a["fix_from"] for a in r["alerts"])


def test_state_sees_requests_by_district_and_count_history(client):
    facs = client.get("/districts/bihar/Araria/facilities").json()["facilities"]
    f = facs[2]["facility_id"]
    rid = client.post("/requests", json={"facility_id": f, "commodity_id": "ors", "quantity": 12}).json()["request_id"]
    u = client.get("/units/bihar/requests").json()
    assert any(r["request_id"] == rid for r in u["requests"])
    ara = next(d for d in u["by_district"] if d["district"] == "Araria")
    assert ara["requested"] >= 1 and ara["total"] >= ara["requested"]
    client.post("/entries", json={"facility_id": f, "commodity_id": "ors", "quantity": 77, "channel": "chat"})
    client.post("/entries", json={"facility_id": f, "commodity_id": "zinc_20mg", "quantity": 5, "channel": "chat"})
    d = client.get("/districts/bihar/Araria/counts").json()
    assert d["total"] >= 2 and d["counts"][0]["commodity_id"] == "zinc_20mg" and d["counts"][0]["facility_name"]
    s = client.get("/units/bihar/counts").json()
    assert any(x["district"] == "Araria" and x["counts"] >= 2 for x in s["by_district"])
    assert len(client.get(f"/facilities/{f}/counts").json()["counts"]) >= 2
    # escalations are entries too, but never show up as counts
    client.post("/escalations", json={"unit_id": "bihar", "district": "Araria", "reason": "x"})
    assert all("commodity_id" in c for c in client.get("/units/bihar/counts").json()["counts"])


def test_unknown_district_is_404_everywhere_not_a_crash(client):
    for p in ["summary", "facilities", "resilience-alerts", "indents", "brief", "counts", "requests"]:
        assert client.get(f"/districts/bihar/Nowhere/{p}").status_code == 404, p
    assert client.get("/transfers/bihar/Nowhere").status_code == 404
    assert client.get("/districts/nowhere/Araria/summary").status_code == 404
    assert client.get("/districts/bihar/Araria/summary").status_code == 200


def test_counts_only_for_real_facilities_and_medicines(client):
    f = "bihar-araria-chc-aadharbhut-community-health-center-13"
    assert client.post("/entries", json={"facility_id": "nope", "commodity_id": "ors", "quantity": 5}).status_code == 404
    assert client.post("/entries", json={"facility_id": f, "commodity_id": "nope", "quantity": 5}).status_code == 400
    assert client.post("/entries", json={"facility_id": f, "commodity_id": "ors", "quantity": 5}).status_code == 200
