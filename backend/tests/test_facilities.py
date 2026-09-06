import pandas as pd
import pytest

from sanjeevani import facilities, paths


def test_classify():
    assert facilities.classify("PHC, Danapur", {}) == "PHC"
    assert facilities.classify("APHC Sherpur", {}) == "PHC"
    assert facilities.classify("Community Health Centre Barh", {}) == "CHC"
    assert facilities.classify("Sadar Hospital Araria", {}) == "DH"
    assert facilities.classify("Perfect Vision Eye Clinic", {}) is None
    assert facilities.classify("Asthawan", {"healthcare": "centre"}) is None
    assert facilities.classify("HSC Rampur", {}) is None


def test_assign_to_districts_prefers_tag_then_nearest():
    geos = {"A": {"lat": 25.0, "lon": 85.0, "bbox": [24.5, 25.5, 84.5, 85.5]},
            "B": {"lat": 25.4, "lon": 85.4, "bbox": [25.0, 26.0, 85.0, 86.0]}}
    feats = [{"name": "x", "lat": 25.2, "lon": 85.2, "district_tag": "B"},
             {"name": "y", "lat": 25.05, "lon": 85.05, "district_tag": None},
             {"name": "z", "lat": 30.0, "lon": 90.0, "district_tag": None}]
    out = facilities.assign_to_districts(feats, geos)
    assert [f["name"] for f in out["B"]] == ["x"]
    assert [f["name"] for f in out["A"]] == ["y"]


def test_target_counts_sum_to_rhs():
    d = pd.read_parquet(paths.DATA_PROCESSED / "districts.parquet") if (paths.DATA_PROCESSED / "districts.parquet").exists() else None
    if d is None:
        pytest.skip("districts.parquet not built")
    t = facilities.target_counts("Bihar", d)
    assert int(t.sum()) == 1760 and (t >= 1).all() and len(t) == 38


def test_haversine():
    assert abs(facilities.haversine_km(25.594, 85.137, 26.144, 91.736) - 663) < 15


def test_roster_if_built():
    p = paths.DATA_PROCESSED / "facilities.parquet"
    if not p.exists():
        pytest.skip("facilities.parquet not built")
    f = pd.read_parquet(p)
    bihar_phc = f[(f.state == "Bihar") & (f.type == "PHC")]
    assert abs(len(bihar_phc) - 1760) / 1760 < 0.05
    assert f.lat.between(6, 37).all() and f.lon.between(68, 98).all()
    assert f.source.notna().all() and f.facility_id.is_unique
    assert set(f[f.unit_id == "ladakh"].district) <= {"Leh Ladakh", "Kargil"}
