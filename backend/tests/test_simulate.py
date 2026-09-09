import numpy as np
import pandas as pd
import pytest

from sanjeevani import simulate


def _facilities():
    return pd.DataFrame({
        "facility_id": ["f1", "f2", "f3", "f4"], "name": ["PHC A", "PHC B", "CHC C", "DH D"],
        "type": ["PHC", "PHC", "CHC", "DH"], "unit_id": ["bihar"] * 4, "state": ["Bihar"] * 4, "district": ["Araria"] * 4,
        "catchment_pop": [100000, 300000, 200000, 600000], "beds": [6, 30, 30, 200],
    })


def _district_demand():
    rows = []
    for fy in ("2017-18", "2018-19", "2019-20"):
        for m in simulate.FY_MONTH_ORDER:
            rows.append(("Bihar", "Araria", fy, m, "10.11", 1200.0 if m in (7, 8) else 600.0))
    df = pd.DataFrame(rows, columns=["state", "district", "fy", "month", "item_code", "value"])
    df["month_index"] = [simulate.month_index(f, m) for f, m in zip(df["fy"], df["month"])]
    return df


def _commodities():
    return pd.DataFrame([{"commodity_id": "ors", "category": "outbreak", "driver_item_code": "10.11", "units_per_case": 3.0}])


def test_month_index_and_calendar():
    assert simulate.month_index("2017-18", 4) == 0
    assert simulate.month_index("2017-18", 3) == 11
    assert simulate.month_index("2019-20", 1) == 24 + 9
    assert simulate.calendar_of(0) == (2024, 4)
    assert simulate.calendar_of(11) == (2025, 3)
    assert simulate.calendar_of(35) == (2027, 3)


def test_shares_sum_to_one_per_district():
    s = simulate.facility_shares(_facilities())
    assert set(s["facility_id"]) == {"f1", "f2", "f3"}
    assert abs(s["share"].sum() - 1.0) < 1e-9


def test_disaggregate_preserves_district_totals():
    dd = _district_demand(); shares = simulate.facility_shares(_facilities())
    fd = simulate.disaggregate(dd, shares, seed=1)
    tot = fd.groupby("month_index")["value"].sum().sort_index()
    exp = dd.set_index("month_index")["value"].sort_index()
    assert np.allclose(tot.values, exp.values, rtol=1e-3)


def test_ledger_identity_and_determinism():
    dd = _district_demand(); fac = _facilities(); shares = simulate.facility_shares(fac)
    fd = simulate.disaggregate(dd, shares, seed=1)
    a = simulate.build_ledger(fd, fac, _commodities(), seed=3)
    b = simulate.build_ledger(fd, fac, _commodities(), seed=3)
    assert a.equals(b)
    ident = a["opening"] + a["received"] - a["unusable"] - a["distributed"] - a["closing"]
    assert (ident.abs() < 0.2).all()
    assert (a["closing"] >= 0).all()
    assert set(a["source"]) == {"simulated"}


def test_monsoon_scenario_raises_ors_demand():
    dd = _district_demand(); fac = _facilities(); shares = simulate.facility_shares(fac)
    fd = simulate.disaggregate(dd, shares, seed=1)
    base = simulate.build_ledger(fd, fac, _commodities(), "normal", seed=3)
    surge = simulate.build_ledger(fd, fac, _commodities(), "monsoon_surge", 1.0, seed=3)
    jul_b = base[base["month"] == 7]["demand"].sum(); jul_s = surge[surge["month"] == 7]["demand"].sum()
    jan_b = base[base["month"] == 1]["demand"].sum(); jan_s = surge[surge["month"] == 1]["demand"].sum()
    assert abs(jul_s / jul_b - 3.5) < 0.01
    assert abs(jan_s / jan_b - 1.0) < 0.01
    assert (surge["lead_days"][surge["month"] == 7] > base["lead_days"][base["month"] == 7]).all()


def test_staff_and_beds_shapes():
    fac = _facilities()
    staff, beds = simulate.staff_and_beds(fac, [0, 1], {"Bihar": 0.3}, seed=1)
    assert len(beds) == 4 * 2 and (beds["occupied"] <= beds["beds"]).all()
    assert set(staff["cadre"]) == {"medical_officer", "pharmacist", "staff_nurse", "lab_technician"}
    assert (staff["in_position"] <= staff["sanctioned"]).all()


def _ledger_inputs():
    dd = _district_demand(); fac = _facilities(); shares = simulate.facility_shares(fac)
    return simulate.disaggregate(dd, shares, seed=1), fac


def test_ledger_noop_redistribute_hook_is_identical():
    fd, fac = _ledger_inputs()
    base = simulate.build_ledger(fd, fac, _commodities(), seed=3)
    hooked = simulate.build_ledger(fd, fac, _commodities(), seed=3, redistribute=lambda month_df: pd.DataFrame(columns=["from_id", "to_id", "quantity"]))
    assert hooked["transferred_in"].eq(0).all() and hooked["transferred_out"].eq(0).all()
    cols = ["transferred_in", "transferred_out"]
    assert base[cols].eq(0).all().all()
    assert base.drop(columns=cols).equals(hooked.drop(columns=cols))


def test_ledger_transfer_is_available_in_the_same_month():
    """The hook runs after receipts are known and before demand is served: a transfer that arrives within
    the month counts against that month's demand, which is how a missed indent gets covered."""
    fd, fac = _ledger_inputs()
    seen = []

    def hook(month_df):
        seen.append(set(month_df.columns))
        if int(month_df["month_index"].iloc[0]) == 0:
            return pd.DataFrame([{"from_id": "f2", "to_id": "f1", "quantity": 50}])
        return None

    led = simulate.build_ledger(fd, fac, _commodities(), seed=3, redistribute=hook)
    assert {"facility_id", "commodity_id", "month_index", "available", "recent_demand", "lead_days", "type"} <= seen[0]
    m0 = led[led["month_index"] == 0].set_index("facility_id")
    assert m0.loc["f1", "transferred_in"] == 50 and m0.loc["f2", "transferred_out"] == 50
    assert m0.loc["f3", "transferred_in"] == 0 and m0.loc["f3", "transferred_out"] == 0
    ident = led["opening"] + led["received"] - led["unusable"] + led["transferred_in"] - led["transferred_out"] - led["distributed"] - led["closing"]
    assert (ident.abs() < 0.2).all()
    base = simulate.build_ledger(fd, fac, _commodities(), seed=3)
    b0 = base[base["month_index"] == 0].set_index("facility_id")
    assert m0.loc["f1", "closing"] == pytest.approx(b0.loc["f1", "closing"] + 50, abs=0.2) or m0.loc["f1", "distributed"] > b0.loc["f1", "distributed"]
