import pandas as pd

from sanjeevani.engines.alerts import apply_reports

BASE = pd.DataFrame([
    {"facility_id": "F1", "commodity_id": "ors", "closing": 0.0, "weekly_demand_p90": 70.0, "lead_days": 7.0, "days_of_stock": 0.0, "alert": True, "severity": "red", "data_issue": False},
    {"facility_id": "F2", "commodity_id": "ors", "closing": 300.0, "weekly_demand_p90": 70.0, "lead_days": 7.0, "days_of_stock": 30.0, "alert": False, "severity": "ok", "data_issue": False},
])


def test_a_count_replaces_closing_and_recomputes_the_alert():
    out = apply_reports(BASE, [{"facility_id": "F1", "commodity_id": "ors", "quantity": 400, "received": 1}]).set_index("facility_id")
    assert out.loc["F1", "closing"] == 400 and out.loc["F1", "days_of_stock"] == 40.0
    assert not out.loc["F1", "alert"] and out.loc["F1", "severity"] == "ok" and out.loc["F1", "reported"]
    assert not out.loc["F2", "reported"]


def test_latest_count_wins_and_a_zero_count_raises_a_red_alert():
    reps = [{"facility_id": "F2", "commodity_id": "ors", "quantity": 500, "received": 1}, {"facility_id": "F2", "commodity_id": "ors", "quantity": 0, "received": 2}]
    out = apply_reports(BASE, reps).set_index("facility_id")
    assert out.loc["F2", "days_of_stock"] == 0 and out.loc["F2", "alert"] and out.loc["F2", "severity"] == "red"


def test_no_reports_returns_the_frame_unchanged():
    assert apply_reports(BASE, []) is BASE
