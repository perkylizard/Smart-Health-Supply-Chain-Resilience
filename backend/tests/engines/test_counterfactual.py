import numpy as np
import pandas as pd

from sanjeevani import simulate
from sanjeevani.engines import counterfactual as CF


def _facilities():
    return pd.DataFrame({
        "facility_id": ["f1", "f2", "f3", "f4", "f5"], "name": ["PHC A", "PHC B", "CHC C", "PHC D", "PHC E"],
        "type": ["PHC", "PHC", "CHC", "PHC", "PHC"], "unit_id": ["bihar"] * 5, "state": ["Bihar"] * 5,
        "district": ["Araria", "Araria", "Araria", "Purnia", "Purnia"],
        "lat": [26.10, 26.15, 26.20, 25.80, 25.85], "lon": [87.40, 87.45, 87.50, 87.40, 87.45],
        "catchment_pop": [100000, 300000, 200000, 150000, 250000], "beds": [6, 30, 30, 6, 6],
    })


def _district_demand():
    rows = []
    for d in ("Araria", "Purnia"):
        for fy in ("2017-18", "2018-19", "2019-20"):
            for m in simulate.FY_MONTH_ORDER:
                rows.append(("Bihar", d, fy, m, "10.11", 1200.0 if m in (7, 8) else 600.0))
    df = pd.DataFrame(rows, columns=["state", "district", "fy", "month", "item_code", "value"])
    df["month_index"] = [simulate.month_index(f, m) for f, m in zip(df["fy"], df["month"])]
    return df


def _commodities():
    return pd.DataFrame([{"commodity_id": "ors", "category": "outbreak", "driver_item_code": "10.11", "units_per_case": 3.0}])


def _inputs():
    fac = _facilities()
    fd = simulate.disaggregate(_district_demand(), simulate.facility_shares(fac), seed=1)
    return fd, fac, _commodities()


def test_with_run_has_no_more_stockouts_and_moves_stock_within_district():
    fd, fac, com = _inputs()
    res = CF.run(fd, fac, com, scenario="warehouse_shock", seed=3)
    assert res.without["stockout"].sum() > 0
    assert res.with_["stockout"].sum() <= res.without["stockout"].sum()
    assert len(res.transfers) > 0 and (res.transfers["quantity"] > 0).all()
    d = fac.set_index("facility_id")["district"]
    assert (res.transfers["from_id"].map(d) == res.transfers["to_id"].map(d)).all()
    # the two runs share every random draw: demand is identical
    assert np.allclose(res.without["demand"].to_numpy(), res.with_["demand"].to_numpy())


def test_compare_reports_per_district_and_unit_total():
    fd, fac, com = _inputs()
    res = CF.run(fd, fac, com, scenario="warehouse_shock", seed=3)
    tab = CF.compare(res, fac, unit_id="bihar", scenario="warehouse_shock")
    assert {"unit_id", "scenario", "district", "facility_months", "stockout_months_without", "stockout_months_with",
            "avoided", "avoided_pct", "transfers", "units_moved"} <= set(tab.columns)
    assert set(tab["district"]) == {"Araria", "Purnia", CF.UNIT_TOTAL}
    total = tab[tab["district"] == CF.UNIT_TOTAL].iloc[0]
    parts = tab[tab["district"] != CF.UNIT_TOTAL]
    assert total["stockout_months_without"] == parts["stockout_months_without"].sum()
    assert total["avoided"] == total["stockout_months_without"] - total["stockout_months_with"]
    assert total["stockout_months_without"] == res.without["stockout"].sum()
    assert total["transfers"] == len(res.transfers)
