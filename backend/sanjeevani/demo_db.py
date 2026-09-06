"""Build data/demo.duckdb: the compact, self-contained database the backend ships with."""
from pathlib import Path

import duckdb

from sanjeevani import paths

TABLES = {
    "districts": "districts.parquet",
    "facilities": "facilities.parquet",
    "commodities": "commodities.parquet",
    "hmis_items": "hmis_items.parquet",
    "sim_demand": "sim_demand.parquet",
    "ledger": "sim_ledger.parquet",
    "staff": "sim_staff.parquet",
    "beds": "sim_beds.parquet",
}


def build(out: Path, processed: Path | None = None) -> dict:
    processed = processed or paths.DATA_PROCESSED
    if out.exists():
        out.unlink()
    con = duckdb.connect(str(out))
    for t, f in TABLES.items():
        con.execute(f"CREATE TABLE {t} AS SELECT * FROM '{processed / f}'")
    con.execute("CREATE TABLE units AS SELECT * FROM read_csv_auto(?)", [str(paths.DATA_REF / "demo_units.csv")])
    # real district-level HMIS ledger and demand drivers, only for demo states, to keep the file small
    con.execute(f"""CREATE TABLE hmis_ledger_real AS SELECT l.* FROM '{processed / 'hmis_ledger.parquet'}' l
                    WHERE l.state IN (SELECT DISTINCT state FROM facilities)""")
    con.execute(f"""CREATE TABLE hmis_counts_real AS SELECT state, district, fy, month, item_code, measure, value
                    FROM '{processed / 'hmis_c2.parquet'}'
                    WHERE state IN (SELECT DISTINCT state FROM facilities) AND measure='Total'
                      AND item_code IN (SELECT DISTINCT driver_item_code FROM commodities UNION SELECT '14.17' UNION SELECT '14.2.1' UNION SELECT '14.3.1.a')""")
    con.execute("CREATE TABLE scenarios AS SELECT * FROM read_json_auto(?)", [str(paths.DATA_SCENARIOS / "scenarios.json")])
    con.execute("""CREATE VIEW v_latest_month AS SELECT max(month_index) AS mi FROM ledger""")
    con.execute("""CREATE VIEW v_days_of_stock AS
        SELECT l.facility_id, f.name AS facility_name, f.type, f.unit_id, f.state, f.district, f.lat, f.lon,
               l.commodity_id, c.name AS commodity_name, c.category, l.year, l.month, l.demand, l.closing,
               l.days_of_stock, l.lead_days, l.stockout, c.source AS commodity_source, f.source AS facility_source
        FROM ledger l JOIN facilities f USING (facility_id) JOIN commodities c USING (commodity_id)
        WHERE l.month_index = (SELECT mi FROM v_latest_month)""")
    con.execute("""CREATE VIEW v_district_summary AS
        SELECT unit_id, state, district,
               count(DISTINCT facility_id) AS facilities,
               median(days_of_stock) AS median_days_of_stock,
               avg(CASE WHEN days_of_stock < 14 THEN 1 ELSE 0 END) AS share_under_14d,
               avg(CASE WHEN stockout THEN 1 ELSE 0 END) AS stockout_rate
        FROM v_days_of_stock GROUP BY 1,2,3""")
    stats = {t: con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in list(TABLES) + ["units", "hmis_ledger_real", "hmis_counts_real"]}
    con.close()
    stats["size_mb"] = round(out.stat().st_size / 1048576, 1)
    return stats
