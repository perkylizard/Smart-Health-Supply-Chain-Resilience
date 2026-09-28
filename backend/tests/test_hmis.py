import pandas as pd
import pytest

from sanjeevani import hmis, paths


@pytest.fixture(scope="module")
def bihar():
    p = paths.DATA_PROCESSED / "hmis_c2.parquet"
    if not p.exists():
        pytest.skip("hmis_c2.parquet not built")
    import duckdb
    return duckdb.connect().execute(f"SELECT * FROM '{p}' WHERE state='Bihar' AND fy='2019-20'").df()


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


def test_normalise_fy_handles_provisional_suffix():
    s = pd.Series(["2020-2021(Data is Provisional)", "2019-2020", "2018-19"])
    assert list(hmis.normalise_fy(s)) == ["2020-21", "2019-20", "2018-19"]


@pytest.fixture(scope="module")
def provisional():
    p = paths.DATA_PROCESSED / "hmis_c2.parquet"
    if not p.exists():
        pytest.skip("hmis_c2.parquet not built")
    import duckdb
    con = duckdb.connect()
    if "provisional" not in [c[0] for c in con.execute(f"DESCRIBE SELECT * FROM '{p}'").fetchall()]:
        pytest.skip("provisional year not appended")
    return con


def test_provisional_year_bihar_april_2020(provisional):
    p = paths.DATA_PROCESSED / "hmis_c2.parquet"
    q = f"SELECT value, provisional FROM '{p}' WHERE state='Bihar' AND district=? AND fy='2020-21' AND month=4 AND item_code='14.2.1' AND measure='Total'"
    assert provisional.execute(q, ["Bihar"]).fetchone() == (585671.0, True)
    assert provisional.execute(q, ["Patna"]).fetchone() == (44769.0, True)


def test_complete_years_are_not_provisional(provisional):
    p = paths.DATA_PROCESSED / "hmis_c2.parquet"
    rows = provisional.execute(f"SELECT fy, bool_or(provisional), bool_and(provisional) FROM '{p}' GROUP BY fy ORDER BY fy").fetchall()
    assert rows == [("2017-18", False, False), ("2018-19", False, False), ("2019-20", False, False), ("2020-21", True, True)]


def test_provisional_states_use_canonical_spellings(provisional):
    p = paths.DATA_PROCESSED / "hmis_c2.parquet"
    old = {r[0] for r in provisional.execute(f"SELECT DISTINCT state FROM '{p}' WHERE fy='2019-20'").fetchall()}
    new = {r[0] for r in provisional.execute(f"SELECT DISTINCT state FROM '{p}' WHERE fy='2020-21'").fetchall()}
    assert new <= old and len(new) == 16


def test_provisional_ledger_rows_exist(provisional):
    p = paths.DATA_PROCESSED / "hmis_ledger.parquet"
    # ORS stock is reported by 13 to 18 Bihar districts a month in 2020-21 (9 to 26 in 2019-20): sparse in both years
    n, months, prov = provisional.execute(f"SELECT count(*), count(DISTINCT month), bool_and(provisional) FROM '{p}' WHERE state='Bihar' AND fy='2020-21' AND item_code='19.12'").fetchone()
    assert n >= 12 * 12 and months == 12 and prov is True
