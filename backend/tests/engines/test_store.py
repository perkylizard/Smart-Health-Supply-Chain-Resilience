import pytest

from sanjeevani import paths
from sanjeevani.engines.store import Store


@pytest.fixture(scope="module")
def store():
    if not (paths.DATA / "demo.duckdb").exists():
        pytest.skip("demo.duckdb not built")
    return Store()


def test_latest_month(store):
    assert store.latest_month() == 35


def test_units_and_hero(store):
    u = store.units()
    assert len(u) == 14 and u.iloc[0]["unit_id"] == "bihar"


def test_ledger_latest_ladakh(store):
    df = store.ledger_latest("ladakh")
    assert len(df) > 0 and set(df["district"]) <= {"Leh Ladakh", "Kargil"}


def test_bastar_districts(store):
    assert len(store.districts("bastar")) == 7


def test_history_series_hero_36_months(store):
    h = store.history_series("bihar", "ors", "Araria")
    assert h["month_index"].nunique() == 36 and h["facility_id"].nunique() > 10


def test_real_ledger(store):
    r = store.real_ledger("Bihar", "Bihar")
    assert (r["item_code"] == "19.12").any()
