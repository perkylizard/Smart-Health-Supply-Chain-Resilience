import pandas as pd

from sanjeevani.engines import scenario


def test_normal_is_identity():
    m = scenario.multipliers("normal", 1.0, "bihar", "outbreak", "10.11", 7)
    assert m == scenario.Multiplier()


def test_monsoon_half_intensity_july():
    m = scenario.multipliers("monsoon_surge", 0.5, "bihar", "outbreak", "10.11", 7)
    assert abs(m.demand - 1.75) < 1e-9 and m.lead_days_add == 1.5


def test_monsoon_not_in_january_when_respecting_months():
    assert scenario.multipliers("monsoon_surge", 1.0, "bihar", "outbreak", "10.11", 1, respect_months=True) == scenario.Multiplier()
    assert scenario.multipliers("monsoon_surge", 1.0, "bihar", "outbreak", "10.11", 1).demand == 2.5


def test_winter_closure_unit_scoped():
    assert scenario.multipliers("winter_closure", 1.0, "ladakh", "chronic", "14.1.1", 1).lead_days_add == 14
    assert scenario.multipliers("winter_closure", 1.0, "bihar", "chronic", "14.1.1", 1) == scenario.Multiplier()


def test_apply_to_frame():
    df = pd.DataFrame({"unit_id": ["bihar", "bihar", "andhra_pradesh"], "category": ["outbreak", "chronic", "outbreak"],
                       "driver_item_code": ["10.11", "14.1.1", "10.11"], "month": [7, 7, 10]})
    out = scenario.apply_to_frame(df, "monsoon_surge", 1.0)
    assert list(out["demand_mult"].round(2)) == [2.5, 1.0, 2.5]
    out = scenario.apply_to_frame(df, "monsoon_surge", 1.0, respect_months=True)
    assert list(out["demand_mult"].round(2)) == [2.5, 1.0, 1.0]
    out = scenario.apply_to_frame(df, "cyclone", 1.0)
    assert list(out["demand_mult"].round(2)) == [1.0, 1.0, 1.3]


def test_names():
    assert {n["name"] for n in scenario.names()} >= {"normal", "monsoon_surge", "cyclone"}
