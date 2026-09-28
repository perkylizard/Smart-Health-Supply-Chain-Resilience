"""Beds and staff rules, and the care routes on the demo database."""
import pandas as pd
import pytest

from sanjeevani import paths
from sanjeevani.engines import care as C


def _toy():
    fac = pd.DataFrame([
        dict(facility_id="a", name="CHC A", type="CHC", district="D", lat=25.0, lon=85.0),
        dict(facility_id="b", name="CHC B", type="CHC", district="D", lat=25.05, lon=85.0),   # near, has room
        dict(facility_id="c", name="DH C", type="DH", district="D", lat=25.5, lon=85.0),      # far, has room
        dict(facility_id="e", name="CHC E", type="CHC", district="D", lat=25.01, lon=85.0),   # nearest but full
        dict(facility_id="p", name="PHC P", type="PHC", district="D", lat=25.2, lon=85.0),
    ])
    beds = pd.DataFrame([dict(facility_id="a", beds=30, occupied=29), dict(facility_id="b", beds=30, occupied=10),
                         dict(facility_id="c", beds=200, occupied=50), dict(facility_id="e", beds=30, occupied=25),
                         dict(facility_id="p", beds=6, occupied=6)])
    staff = pd.DataFrame([
        dict(facility_id="a", cadre="medical_officer", sanctioned=2, in_position=2, days_present=22),
        dict(facility_id="b", cadre="medical_officer", sanctioned=2, in_position=0, days_present=0),
        dict(facility_id="c", cadre="medical_officer", sanctioned=10, in_position=8, days_present=6),
        dict(facility_id="e", cadre="staff_nurse", sanctioned=4, in_position=1, days_present=20),
        dict(facility_id="p", cadre="medical_officer", sanctioned=1, in_position=1, days_present=20),
    ])
    return fac, beds, staff


def test_bed_thresholds_and_phcs_are_not_flagged_on_beds():
    f = C.facility_status(*_toy()).set_index("facility_id")
    assert f.loc["a", "bed_severity"] == "red" and f.loc["a", "bed_alert"]      # 97 percent
    assert f.loc["e", "bed_severity"] == "amber" and not f.loc["e", "bed_alert"]  # 83 percent
    assert f.loc["p", "bed_severity"] == "ok"                                    # a full PHC is not a bed alert


def test_doctor_absent_and_vacancy():
    f = C.facility_status(*_toy()).set_index("facility_id")
    assert f.loc["b", "doctor_absent"] and f.loc["c", "doctor_absent"] and not f.loc["a", "doctor_absent"]
    assert not f.loc["e", "doctor_absent"]  # no medical officer post sanctioned
    assert f.loc["e", "vacancy_share"] == pytest.approx(0.75)


def test_referral_is_nearest_facility_with_a_fifth_of_beds_free():
    f = C.facility_status(*_toy()).set_index("facility_id")
    assert f.loc["a", "refer_id"] == "b" and f.loc["a", "refer_free_beds"] == 20  # e is nearer but has only 5 of 30 free


def test_surge_multiplier_raises_occupancy_and_caps_at_capacity():
    m = C.occupancy_multiplier([{"categories": ["outbreak"], "demand_mult": 3.0}], 1.0)
    assert m == pytest.approx(1.5) and C.occupancy_multiplier([{"categories": ["chronic"], "demand_mult": 3.0}], 1.0) == 1.0
    f = C.facility_status(*_toy(), occ_mult=m).set_index("facility_id")
    assert (f["occupied"] <= f["beds"]).all() and f.loc["e", "bed_alert"]


pytestmark_db = pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")


@pytestmark_db
def test_care_routes_on_bihar():
    from fastapi.testclient import TestClient
    from app.main import create_app
    c = TestClient(create_app(warm=False))
    r = c.get("/care/bihar").json()
    assert r["totals"]["districts"] == 38 == len(r["districts"])
    assert r["totals"]["beds"] == sum(d["beds"] for d in r["districts"]) and r["totals"]["bed_alerts"] == sum(d["bed_alerts"] for d in r["districts"])
    assert "simulated" in r["provenance"]
    d = c.get("/care/bihar/Araria").json()
    assert d["summary"]["district"] == "Araria" and all(x["doctor_absent"] or x["bed_severity"] != "ok" for x in d["facilities"])
    assert c.get("/care/nowhere").status_code == 404 and c.get("/care/bihar/Nowhere").status_code == 404
