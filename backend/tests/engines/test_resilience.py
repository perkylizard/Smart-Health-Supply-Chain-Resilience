import pandas as pd

from sanjeevani.engines import resilience as Rs


def _alerts(dos):
    return pd.DataFrame({"unit_id": "u", "state": "S", "district": "D", "days_of_stock": dos, "data_issue": [False] * len(dos)})


def _staff(gap):
    return pd.DataFrame({"district": ["D"] * 10, "sanctioned": [1] * 10, "in_position": [1] * int(10 * (1 - gap)) + [0] * int(10 * gap)})


def test_perfect_is_100():
    ds = Rs.district_scores(_alerts([60, 90, 120]), _staff(0.0), pd.DataFrame({"to_district": ["D"], "eta_days": [1.0]}), pd.Series({"D": 1.0}))
    assert ds.iloc[0]["score"] == 100.0


def test_worst_is_0():
    ds = Rs.district_scores(_alerts([0, 0, 0]), _staff(0.5), pd.DataFrame({"to_district": ["D"], "eta_days": [10.0]}), pd.Series({"D": 0.0}))
    assert ds.iloc[0]["score"] == 0.0


def test_monotone_in_stock():
    lo = Rs.district_scores(_alerts([5, 10, 12])).iloc[0]["score"]
    hi = Rs.district_scores(_alerts([20, 30, 40])).iloc[0]["score"]
    assert hi > lo
    assert not Rs.unit_scores(Rs.district_scores(_alerts([20, 30]))).empty
