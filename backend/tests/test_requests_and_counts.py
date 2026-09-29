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
