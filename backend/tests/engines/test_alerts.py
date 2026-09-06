import pandas as pd
import pytest

from sanjeevani import paths
from sanjeevani.engines import alerts as A, forecast as F
from sanjeevani.engines.store import Store


def _frames():
    base = dict(unit_id="bihar", state="Bihar", district="Araria", type="PHC", category="outbreak", driver_item_code="10.11",
                facility_name="x", commodity_name="ORS", lat=26.0, lon=87.0, month=7, year=2027, scenario="normal", source="simulated")
    rows = [
        dict(base, facility_id="f_cases", commodity_id="ors", month_index=35, demand=300, opening=200, received=100, unusable=0, distributed=300, closing=0, lead_days=10),
        dict(base, facility_id="f_missed", commodity_id="ors", month_index=35, demand=100, opening=150, received=0, unusable=0, distributed=100, closing=50, lead_days=10),
        dict(base, facility_id="f_written", commodity_id="ors", month_index=35, demand=100, opening=400, received=120, unusable=150, distributed=100, closing=150, lead_days=10),
        dict(base, facility_id="f_neg", commodity_id="ors", month_index=35, demand=100, opening=100, received=100, unusable=0, distributed=100, closing=-20, lead_days=10),
        dict(base, facility_id="f_ok", commodity_id="ors", month_index=35, demand=100, opening=2000, received=120, unusable=0, distributed=100, closing=2020, lead_days=10),
    ]
    latest = pd.DataFrame(rows)
    prev = []
    for r in rows:
        for mi in (32, 33, 34):
            prev.append(dict(r, month_index=mi, demand=100, received=120, unusable=0, opening=500, closing=500))
    window = pd.concat([pd.DataFrame(prev), latest], ignore_index=True)
    hist = window[["facility_id", "commodity_id", "month_index", "demand"]]
    fc = F.forecast_frame(hist)
    return latest, window, fc


def test_causes_and_severity():
    latest, window, fc = _frames()
    out = A.compute_alerts(latest, window, fc).set_index("facility_id")
    assert out.loc["f_cases", "cause"] == "cases_up" and out.loc["f_cases", "severity"] == "red"
    assert out.loc["f_missed", "cause"] == "supply_missed"
    assert out.loc["f_written", "cause"] == "written_off"
    assert out.loc["f_neg", "severity"] == "data_issue" and not out.loc["f_neg", "alert"]
    assert out.loc["f_ok", "severity"] == "ok" and out.loc["f_ok", "surplus_days"] > 0


def test_scenario_raises_alerts():
    latest, window, fc = _frames()
    base = A.compute_alerts(latest, window, fc, "normal")
    surge = A.compute_alerts(latest, window, fc, "monsoon_surge", 1.0)
    assert surge.set_index("facility_id").loc["f_ok", "days_of_stock"] < base.set_index("facility_id").loc["f_ok", "days_of_stock"]
    assert (surge["lead_days"] > base["lead_days"]).all()


@pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")
def test_integration_bihar_araria():
    import time
    st = Store(); t0 = time.time()
    latest = st.ledger_latest("bihar", "Araria"); window = st.ledger_window("bihar", 4, "Araria")
    fc = F.forecast_frame(window[["facility_id", "commodity_id", "month_index", "demand"]])
    out = A.compute_alerts(latest, window, fc)
    assert time.time() - t0 < 5
    assert out["days_of_stock"].notna().all() and len(out) == len(latest)
    assert (out["severity"] == "red").sum() >= 0
