import duckdb
import pytest

from sanjeevani import paths
from sanjeevani.gemini import ask_sql as Q

BAD = [
    "DROP TABLE facilities", "SELECT * FROM facilities; DELETE FROM ledger", "INSERT INTO ledger VALUES (1)",
    "SELECT * FROM secrets", "SELECT * FROM read_csv('/etc/passwd')", "PRAGMA database_list", "SELECT * FROM 'x.parquet'",
    "UPDATE facilities SET name='x'", "", "COPY facilities TO 'out.csv'",
]
GOOD = [
    "SELECT * FROM facilities WHERE unit_id='bihar'",
    "WITH x AS (SELECT * FROM v_days_of_stock) SELECT district, count(*) FROM x GROUP BY 1",
    "select facility_name, days_of_stock from v_days_of_stock order by 2 limit 5 -- comment",
    "SELECT l.facility_id FROM ledger l JOIN facilities f USING (facility_id) LIMIT 9999",
]


@pytest.mark.parametrize("sql", BAD)
def test_checker_rejects(sql):
    assert not Q.check(sql).ok


@pytest.mark.parametrize("sql", GOOD)
def test_checker_accepts_and_caps(sql):
    r = Q.check(sql)
    assert r.ok and "LIMIT" in r.sql.upper()
    assert "9999" not in r.sql


@pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")
def test_execute_readonly_and_timeout():
    df = Q.execute(Q.check("SELECT count(*) AS n FROM facilities").sql)
    assert df["n"].iloc[0] > 1000
    with pytest.raises(TimeoutError):
        Q.execute("SELECT count(*) FROM ledger a, ledger b, ledger c", timeout=1.5)


@pytest.mark.skipif(not (paths.DATA / "demo.duckdb").exists(), reason="demo db not built")
def test_user_sql_path_without_gemini():
    from sanjeevani.gemini.client import GeminiClient
    c = GeminiClient(mode="replay", api_key=None)
    out = Q.run(c, "how many PHCs", "bihar", "Araria", user_sql="SELECT count(*) AS n FROM facilities WHERE district='Araria' AND type='PHC'")
    assert out["error"] is None and out["rows"][0]["n"] > 10 and out["attempts"] == 0
