import pandas as pd
import pytest

from sanjeevani import hmis, paths


@pytest.fixture(scope="module")
def bihar():
    p = paths.DATA_PROCESSED / "hmis_c2_2019-20_Bihar.csv"
    if not p.exists():
        pytest.skip("processed CSV not built")
    return hmis.load_long_csvs(paths.DATA_PROCESSED, pattern="hmis_c2_2019-20_Bihar.csv")


def test_fy_normalised(bihar):
    assert set(bihar["fy"]) == {"2019-20"}


def test_state_opd_april_2019(bihar):
    v = bihar.query("district=='Bihar' and month==4 and item_code=='14.2.1' and measure=='Total'")["value"].iloc[0]
    assert v == 5187499


def test_patna_opd_april_2019(bihar):
    v = bihar.query("district=='Patna' and month==4 and item_code=='14.2.1' and measure=='Total'")["value"].iloc[0]
    assert v == 273010


def test_ledger_has_five_fields(bihar):
    led = hmis.ledger(bihar)
    row = led.query("district=='Bihar' and month==4 and item_code=='19.12'").iloc[0]
    assert row["opening"] == 1742316
    assert row["distributed"] == 873560
    assert row["closing"] == 1497797


def test_item_catalogue_kinds(bihar):
    cat = hmis.item_catalogue(bihar).set_index("item_code")
    assert cat.loc["19.12", "kind"] == "stock"
    assert cat.loc["14.2.1", "kind"] == "count"


def test_unit_functions_on_synthetic_frame():
    df = pd.DataFrame({
        "state": ["X"] * 3, "district": ["D"] * 3, "fy": ["2017-2018"] * 3, "month": [4] * 3,
        "section": ["M19"] * 3, "item_code": ["19.12"] * 3, "item_name": ["ORS"] * 3,
        "measure": ["1. Balance From Previous Month", "4. Stock Distributed", "5. Total Stock"],
        "value": [100.0, 40.0, 60.0],
    })
    df["fy"] = hmis.normalise_fy(df["fy"])
    led = hmis.ledger(df)
    assert led.iloc[0]["fy"] == "2017-18" and led.iloc[0]["closing"] == 60.0
