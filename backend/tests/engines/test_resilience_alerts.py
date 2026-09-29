import pandas as pd

from sanjeevani.engines import resilience_alerts as RA


def _row(fid, days, lead=10.0, cause="supply_missed", weekly=70.0):
    return {"facility_id": fid, "commodity_id": "ors", "days_of_stock": days, "lead_days": lead, "cause": cause, "weekly_demand_p90": weekly, "data_issue": False}


def test_tiers_look_ahead_of_today():
    al = pd.DataFrame([_row("out", 0), _row("before_resupply", 6), _row("soon", 20), _row("rising", 28, cause="cases_up"), _row("fine", 28), _row("tiny", 0, weekly=0.2)])
    out = RA.classify(al).set_index("facility_id")
    assert out.loc["out", "tier"] == "critical" and out.loc["before_resupply", "tier"] == "critical"
    assert out.loc["before_resupply", "short_by_days"] == 4.0
    assert out.loc["soon", "tier"] == "warning" and out.loc["rising", "tier"] == "watch"
    assert "fine" not in out.index and "tiny" not in out.index


def test_a_what_if_scenario_turns_rising_demand_on_for_everyone():
    out = RA.classify(pd.DataFrame([_row("fine", 28)]), scenario_mult=2.0)
    assert list(out["tier"]) == ["watch"]


def test_the_nearest_proposal_is_attached_as_the_fix():
    al = RA.classify(pd.DataFrame([_row("F1", 2)]))
    props = pd.DataFrame([{"to_id": "F1", "commodity_id": "ors", "from_name": "Far", "quantity": 500, "km": 40.0, "transfer_id": "t1"},
                          {"to_id": "F1", "commodity_id": "ors", "from_name": "Near", "quantity": 300, "km": 9.0, "transfer_id": "t2"}])
    out = RA.attach_fixes(al, props).iloc[0]
    assert out["fix_from"] == "Near" and out["fix_quantity"] == 300 and out["fix_transfer_id"] == "t2"
