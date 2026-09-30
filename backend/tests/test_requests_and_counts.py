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


def test_sample_activity_fills_every_stage(client):
    from app.demo_seed import seed
    from app.main import create_app
    from fastapi.testclient import TestClient
    app = create_app(warm=False); c = TestClient(app)
    made = seed(app)
    assert made["requests"] >= 12 and made["transfers"] >= 7 and made["counts"] >= 3
    rs = c.get("/districts/bihar/Araria/requests").json()["requests"]
    assert {r["status"] for r in rs} >= {"requested", "approved", "declined", "dispatched", "delivered"} and all(r.get("sample") for r in rs)
    tr = c.get("/transfers/bihar/Araria").json()["transfers"]
    assert {"approved", "picked_up", "delivered"} <= {x["status"] for x in tr}
    ind = c.get("/districts/bihar/Araria/indents").json()["indents"]
    assert {"dispatched", "delivered"} <= {x["status"] for x in ind} and any(x["source"] == "request" for x in ind)
    assert seed(app) == {"skipped": "already seeded"}


def _stock(client, fid, cid):
    return next(x for x in client.get(f"/facilities/{fid}").json()["stock"] if x["commodity_id"] == cid)["closing"]


def test_dispatch_logs_a_store_issue_and_facility_receipt_adds_stock(client):
    a = _alerting(client)
    fid, cid = a["facility_id"], a["commodity_id"]
    before = _stock(client, fid, cid)
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": cid, "quantity": 5000}).json()["request_id"]
    assert client.post(f"/requests/{rid}/received").status_code == 409  # nothing to receive before approval and dispatch
    client.post(f"/requests/{rid}/approved")
    # the district store dispatches from its queue: the issue is logged against the store, the facility's stock is unchanged
    assert client.post(f"/indents/{rid}/dispatched").json()["status"] == "dispatched"
    issues = client.get("/districts/bihar/Araria/issues").json()
    assert any(i["ref"] == rid and i["quantity"] == 5000 for i in issues["issues"])
    assert next(t for t in issues["by_medicine"] if t["commodity_id"] == cid)["quantity"] >= 5000
    assert _stock(client, fid, cid) == before
    # the store records the handover, then the facility confirms receipt: now the stock goes up by the quantity
    assert client.post(f"/indents/{rid}/delivered").json()["status"] == "delivered"
    assert _stock(client, fid, cid) == before
    assert client.post(f"/requests/{rid}/received").json()["status"] == "received"
    assert _stock(client, fid, cid) == before + 5000
    assert client.post(f"/indents/{rid}/dispatched").status_code == 409  # a received request never moves back
    assert client.post(f"/requests/{rid}/received").status_code == 409  # and is credited once
    assert _stock(client, fid, cid) == before + 5000
    lane = {x["indent_id"]: x["status"] for x in client.get("/districts/bihar/Araria/indents").json()["indents"]}
    assert lane[rid] == "delivered"  # done, from the store's side


def test_facility_can_confirm_receipt_straight_after_dispatch(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][2]["facility_id"]
    before = _stock(client, fid, "ors")
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 120}).json()["request_id"]
    client.post(f"/requests/{rid}/approved")
    client.post(f"/indents/{rid}/dispatched")
    assert client.post(f"/requests/{rid}/received").json()["status"] == "received"
    assert _stock(client, fid, "ors") == before + 120


def test_store_can_say_it_cannot_supply_an_approved_request(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][3]["facility_id"]
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 50}).json()["request_id"]
    assert client.post(f"/indents/{rid}/cancelled", json={"reason": "Out of stock at the store"}).status_code == 409  # not approved yet
    client.post(f"/requests/{rid}/approved")
    row = next(x for x in client.get("/districts/bihar/Araria/indents").json()["indents"] if x["indent_id"] == rid)
    assert row["days_of_stock"] is not None  # the store sees the requesting facility's stock
    assert client.post(f"/indents/{rid}/cancelled", json={"reason": "Out of stock at the store"}).json()["status"] == "cancelled"
    mine = next(x for x in client.get(f"/facilities/{fid}/requests").json()["requests"] if x["request_id"] == rid)
    assert mine["status"] == "cancelled" and mine["decision_reason"] == "Out of stock at the store"
    assert rid not in {x["indent_id"] for x in client.get("/districts/bihar/Araria/indents").json()["indents"]}


def test_not_supplied_goes_back_to_the_officer_who_resends_or_closes(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][4]["facility_id"]
    rid = client.post("/requests", json={"facility_id": fid, "commodity_id": "ors", "quantity": 40}).json()["request_id"]
    client.post(f"/requests/{rid}/approved")
    client.post(f"/indents/{rid}/cancelled", json={"reason": "Out of stock at the store"})
    back = client.get("/districts/bihar/Araria/requests?status=cancelled").json()["requests"]
    assert any(x["request_id"] == rid and x["decision_reason"] == "Out of stock at the store" for x in back)
    assert client.post(f"/requests/{rid}/approved").json()["status"] == "approved"  # sent to the store again
    assert rid in {x["indent_id"] for x in client.get("/districts/bihar/Araria/indents").json()["indents"]}
    client.post(f"/indents/{rid}/cancelled", json={"reason": "Out of stock at the store"})
    assert client.post(f"/requests/{rid}/closed").json()["status"] == "closed"
    assert client.post(f"/requests/{rid}/approved").status_code == 409  # closed is final


def test_a_fractional_count_does_not_break_the_district_view(client):
    a = _alerting(client)
    client.post("/entries", json={"facility_id": a["facility_id"], "commodity_id": a["commodity_id"], "quantity": 502.2000000476837, "channel": "chat"})
    assert client.get("/districts/bihar/Araria/summary").status_code == 200
    assert client.get(f"/facilities/{a['facility_id']}").status_code == 200


def test_transfer_handover_and_arrival_move_stock_between_facilities(client):
    tr = next(t for t in client.get("/transfers/bihar/Araria").json()["transfers"] if t["status"] == "proposed")
    tid, cid, q = tr["transfer_id"], tr["commodity_id"], tr["quantity"]
    donor0, rec0 = _stock(client, tr["from_id"], cid), _stock(client, tr["to_id"], cid)
    assert client.post(f"/transfers/{tid}/delivered").status_code == 409  # not before approval
    client.post(f"/transfers/{tid}/approve")
    out = client.get(f"/facilities/{tr['from_id']}/transfers").json()["transfers"]
    assert any(t["transfer_id"] == tid and t["direction"] == "outgoing" for t in out)  # the donor sees it to hand over
    assert client.post(f"/transfers/{tid}/picked_up").json()["status"] == "picked_up"
    assert client.post(f"/transfers/{tid}/delivered", json={"quantity": q}).json()["status"] == "delivered"
    assert _stock(client, tr["to_id"], cid) == round(rec0 + q)
    assert _stock(client, tr["from_id"], cid) == max(0, round(donor0 - q))
    assert client.post(f"/transfers/{tid}/delivered", json={"quantity": q}).status_code == 409  # moved once
    inc = client.get(f"/facilities/{tr['to_id']}/transfers").json()["transfers"]
    assert next(t for t in inc if t["transfer_id"] == tid)["status"] == "delivered"


def test_giving_medicine_to_a_patient_lowers_the_stock_and_cannot_exceed_it(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][5]["facility_id"]
    client.post("/entries", json={"facility_id": fid, "commodity_id": "ors", "quantity": 50, "channel": "chat"})  # 50 on the shelf
    r = client.post(f"/facilities/{fid}/dispense", json={"commodity_id": "ors", "quantity": 4, "slip": "OPD-117"}).json()
    assert r["given"] == 4 and r["on_hand"] == 46
    assert _stock(client, fid, "ors") == 46
    assert client.post(f"/facilities/{fid}/dispense", json={"commodity_id": "ors", "quantity": 47}).status_code == 409  # more than on hand
    assert client.post(f"/facilities/{fid}/dispense", json={"commodity_id": "nope", "quantity": 1}).status_code == 400
    d = client.get(f"/facilities/{fid}/dispensed").json()
    assert d["items"][0]["given"] == 4 and d["by_medicine"][0]["commodity_id"] == "ors"
    counts = client.get(f"/facilities/{fid}/counts").json()["counts"]
    assert all(c["channel"] != "dispensed" for c in counts)  # the count history shows what people counted, not the counter's giving


def test_patient_details_stay_with_the_facility_and_answers_are_never_cached(client):
    fid = client.get("/districts/bihar/Araria/facilities").json()["facilities"][6]["facility_id"]
    client.post("/entries", json={"facility_id": fid, "commodity_id": "ors", "quantity": 30, "channel": "chat"})
    r = client.post(f"/facilities/{fid}/dispense", json={"commodity_id": "ors", "quantity": 3, "patient_name": "Sita Devi", "patient_age": 34, "patient_place": "Bhabua ward 4"})
    assert r.status_code == 200 and r.json()["on_hand"] == 27
    item = client.get(f"/facilities/{fid}/dispensed").json()["items"][0]
    assert item["patient_name"] == "Sita Devi" and item["patient_age"] == 34 and item["patient_place"] == "Bhabua ward 4" and item["on_hand"] == 27
    assert client.post(f"/facilities/{fid}/dispense", json={"commodity_id": "ors", "quantity": 1, "patient_age": 200}).status_code == 422
    assert client.get(f"/facilities/{fid}").headers["cache-control"] == "no-store"
    # names never reach district or state views
    for u in ["/districts/bihar/Araria/summary", "/districts/bihar/Araria/counts", "/units/bihar/counts", "/districts/bihar/Araria/requests"]:
        assert "Sita Devi" not in client.get(u).text
