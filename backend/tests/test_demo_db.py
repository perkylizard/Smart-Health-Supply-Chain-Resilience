import duckdb
import pytest

from sanjeevani import paths

DB = paths.DATA / "demo.duckdb"


@pytest.fixture(scope="module")
def con():
    if not DB.exists():
        pytest.skip("demo.duckdb not built")
    c = duckdb.connect(str(DB), read_only=True)
    yield c
    c.close()


def test_size_under_200mb():
    if not DB.exists():
        pytest.skip("demo.duckdb not built")
    assert DB.stat().st_size < 200 * 1048576


def test_bihar_phc_count(con):
    n = con.execute("SELECT count(*) FROM facilities WHERE state='Bihar' AND type='PHC'").fetchone()[0]
    assert abs(n - 1760) / 1760 < 0.05


def test_days_of_stock_view_complete(con):
    nulls = con.execute("SELECT count(*) FROM v_days_of_stock WHERE days_of_stock IS NULL").fetchone()[0]
    assert nulls == 0
    assert con.execute("SELECT count(DISTINCT unit_id) FROM v_days_of_stock").fetchone()[0] == 14


def test_real_ledger_present(con):
    v = con.execute("SELECT closing FROM hmis_ledger_real WHERE state='Bihar' AND district='Bihar' AND fy='2019-20' AND month=4 AND item_code='19.12'").fetchone()
    assert v and v[0] == 1497797
