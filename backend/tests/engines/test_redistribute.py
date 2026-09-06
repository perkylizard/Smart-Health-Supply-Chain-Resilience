import pandas as pd
import pytest

from sanjeevani import paths
from sanjeevani.engines import alerts as A, forecast as F, redistribute as R
from sanjeevani.engines.store import Store


def _alerts():
    rows = [
        # recipients (alert=True): need to reach 21 days
        dict(facility_id="r1", facility_name="PHC R1", district="D", lat=25.00, lon=85.00, closing=50, weekly_demand_p90=70, days_of_stock=5, alert=True, data_issue=False, cause="cases_up"),
        dict(facility_id="r2", facility_name="PHC R2", district="D", lat=25.30, lon=85.30, closing=100, weekly_demand_p90=70, days_of_stock=10, alert=True, data_issue=False, cause="supply_missed"),
        # donors
        dict(facility_id="d_near", facility_name="PHC Near", district="D", lat=25.05, lon=85.05, closing=900, weekly_demand_p90=70, days_of_stock=90, alert=False, data_issue=False, cause="none"),
        dict(facility_id="d_far", facility_name="PHC Far", district="D", lat=25.40, lon=85.40, closing=900, weekly_demand_p90=70, days_of_stock=90, alert=False, data_issue=False, cause="none"),
        dict(facility_id="d_tight", facility_name="PHC Tight", district="D", lat=25.01, lon=85.01, closing=220, weekly_demand_p90=70, days_of_stock=22, alert=False, data_issue=False, cause="none"),
    ]
    return pd.DataFrame(rows).assign(commodity_id="ors")


def test_toy_transfers():
    out = R.propose(_alerts(), "ors")
    assert not out.empty
    assert (out["donor_days_after"] >= 21 - 0.5).all()
    assert (out["recipient_days_after"] >= 21 - 0.5).all()
    first_r1 = out[out["to_id"] == "r1"].iloc[0]
    assert first_r1["from_id"] == "d_near"
    assert "d_tight" not in set(out["from_id"])


def test_no_donors_returns_empty():
    a = _alerts(); a.loc[a["facility_id"].str.startswith("d_"), "days_of_stock"] = 10
    a.loc[a["facility_id"].str.startswith("d_"), "alert"] = True
    assert R.propose(a, "ors").empty


def test_insufficient_surplus_flagged():
    a = _alerts(); a.loc[a["facility_id"].isin(["d_near", "d_far"]), "closing"] = 250
    a.loc[a["facility_id"].isin(["d_near", "d_far"]), "days_of_stock"] = 25
    out = R.propose(a, "ors")
    assert not out.empty and (out["note"] == "insufficient_surplus").all()


@pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")
def test_integration_bihar_ors():
    import time
    st = Store(); t0 = time.time()
    latest = st.ledger_latest("bihar"); window = st.ledger_window("bihar", 4)
    latest = latest[latest["commodity_id"] == "ors"]; window = window[window["commodity_id"] == "ors"]
    fc = F.forecast_frame(window[["facility_id", "commodity_id", "month_index", "demand"]])
    al = A.compute_alerts(latest, window, fc, "monsoon_surge", 1.0)
    out = R.propose(al, "ors")
    assert time.time() - t0 < 10
    assert len(out) > 0 and (out["quantity"] > 0).all()
