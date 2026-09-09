import numpy as np
import pandas as pd
import pytest

from sanjeevani.engines import forecast_bq as FB


def _cache(monkeypatch, tmp_path, rows):
    p = tmp_path / "bq.parquet"; pd.DataFrame(rows).to_parquet(p, index=False)
    monkeypatch.setattr(FB, "CACHE", p); FB.load_cache.cache_clear()


def test_hybrid_uses_district_forecast_times_share(monkeypatch, tmp_path):
    rows = [{"state": "S", "district": "D", "item_code": "10.11", "forecast_timestamp": f"2020-0{m}-01", "forecast_value": 433.0, "lo": 300.0, "hi": 866.0} for m in range(4, 7)]
    _cache(monkeypatch, tmp_path, rows)
    hist = pd.DataFrame({"facility_id": ["f1"] * 12 + ["f2"] * 12, "commodity_id": "ors", "month_index": list(range(24, 36)) * 2, "demand": [30.0] * 12 + [10.0] * 12})
    meta = pd.DataFrame({"facility_id": ["f1", "f2"], "commodity_id": "ors", "state": "S", "district": "D", "driver_item_code": "10.11", "units_per_case": 3.0})
    fc = FB.forecast_frame(hist, meta)
    f1 = fc[fc["facility_id"] == "f1"]
    assert set(fc["method"]) == {"bigquery_timesfm"} and len(fc) == 16
    # district weekly = 433/4.333 = 100 cases; x3 units x share 0.75 = 225
    assert abs(f1["point"].iloc[0] - 225.0) < 1.0
    assert f1["p90"].iloc[0] > f1["point"].iloc[0]


def test_falls_back_without_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(FB, "CACHE", tmp_path / "missing.parquet"); FB.load_cache.cache_clear()
    hist = pd.DataFrame({"facility_id": "f1", "commodity_id": "ors", "month_index": range(12), "demand": 20.0})
    fc = FB.forecast_frame(hist, pd.DataFrame({"facility_id": ["f1"], "commodity_id": ["ors"], "state": "S", "district": "D", "driver_item_code": "x", "units_per_case": 1.0}))
    assert set(fc["method"]) == {"seasonal_naive"}


def test_falls_back_for_uncached_district(monkeypatch, tmp_path):
    _cache(monkeypatch, tmp_path, [{"state": "S", "district": "Other", "item_code": "10.11", "forecast_timestamp": "2020-04-01", "forecast_value": 1.0, "lo": 0.0, "hi": 2.0}])
    hist = pd.DataFrame({"facility_id": "f1", "commodity_id": "ors", "month_index": range(12), "demand": 20.0})
    fc = FB.forecast_frame(hist, pd.DataFrame({"facility_id": ["f1"], "commodity_id": ["ors"], "state": "S", "district": "D", "driver_item_code": "10.11", "units_per_case": 1.0}))
    assert set(fc["method"]) == {"seasonal_naive"}


@pytest.mark.skipif(not FB.CACHE.exists(), reason="bq cache not built")
def test_real_cache_covers_bihar():
    FB.load_cache.cache_clear()
    assert FB.district_weekly("Bihar", "Araria", "10.11") is not None
