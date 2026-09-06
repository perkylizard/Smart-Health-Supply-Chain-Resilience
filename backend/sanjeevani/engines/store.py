"""Read-only access to data/demo.duckdb for the engines and the API."""
from pathlib import Path

import duckdb
import pandas as pd

from sanjeevani import paths


class Store:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or (paths.DATA / "demo.duckdb")
        self.con = duckdb.connect(str(self.db_path), read_only=True)
        self._latest = None

    def q(self, sql: str, params: list | None = None) -> pd.DataFrame:
        return self.con.execute(sql, params or []).df()

    def units(self) -> pd.DataFrame:
        return self.q("SELECT unit_id, unit_name, kind, state, districts, is_hero FROM units ORDER BY is_hero DESC, unit_name")

    def facilities(self, unit_id: str | None = None, district: str | None = None) -> pd.DataFrame:
        sql, p = "SELECT * FROM facilities WHERE 1=1", []
        if unit_id: sql += " AND unit_id = ?"; p.append(unit_id)
        if district: sql += " AND district = ?"; p.append(district)
        return self.q(sql + " ORDER BY district, type, name", p)

    def commodities(self) -> pd.DataFrame:
        return self.q("SELECT * FROM commodities ORDER BY category, name")

    def latest_month(self) -> int:
        if self._latest is None:
            self._latest = int(self.con.execute("SELECT max(month_index) FROM ledger").fetchone()[0])
        return self._latest

    def ledger_window(self, unit_id: str, months: int = 12, district: str | None = None) -> pd.DataFrame:
        lo = self.latest_month() - months + 1
        sql = """SELECT l.*, f.type, f.state, f.district, f.name AS facility_name, f.lat, f.lon, f.dist_to_warehouse_km,
                        c.category, c.driver_item_code, c.name AS commodity_name
                 FROM ledger l JOIN facilities f USING (facility_id) JOIN commodities c USING (commodity_id)
                 WHERE l.unit_id = ? AND l.month_index >= ?"""
        p = [unit_id, lo]
        if district: sql += " AND f.district = ?"; p.append(district)
        return self.q(sql + " ORDER BY facility_id, commodity_id, month_index", p)

    def ledger_latest(self, unit_id: str, district: str | None = None) -> pd.DataFrame:
        return self.ledger_window(unit_id, 1, district)

    def history_series(self, unit_id: str, commodity_id: str, district: str | None = None) -> pd.DataFrame:
        sql = """SELECT l.facility_id, l.month_index, l.year, l.month, l.demand FROM ledger l JOIN facilities f USING (facility_id)
                 WHERE l.unit_id = ? AND l.commodity_id = ?"""
        p = [unit_id, commodity_id]
        if district: sql += " AND f.district = ?"; p.append(district)
        return self.q(sql + " ORDER BY facility_id, month_index", p)

    def staff_latest(self, unit_id: str, district: str | None = None) -> pd.DataFrame:
        sql = """SELECT s.* , f.district FROM staff s JOIN facilities f USING (facility_id)
                 WHERE f.unit_id = ? AND s.month_index = (SELECT max(month_index) FROM staff)"""
        p = [unit_id]
        if district: sql += " AND f.district = ?"; p.append(district)
        return self.q(sql, p)

    def beds_latest(self, unit_id: str, district: str | None = None) -> pd.DataFrame:
        sql = """SELECT b.*, f.district, f.type FROM beds b JOIN facilities f USING (facility_id)
                 WHERE f.unit_id = ? AND b.month_index = (SELECT max(month_index) FROM beds)"""
        p = [unit_id]
        if district: sql += " AND f.district = ?"; p.append(district)
        return self.q(sql, p)

    def real_ledger(self, state: str, district: str | None = None) -> pd.DataFrame:
        sql, p = "SELECT * FROM hmis_ledger_real WHERE state = ?", [state]
        if district: sql += " AND district = ?"; p.append(district)
        return self.q(sql + " ORDER BY item_code, fy, month", p)

    def real_counts(self, state: str, district: str, item_codes: list[str]) -> pd.DataFrame:
        codes = ",".join("?" * len(item_codes))
        return self.q(f"SELECT * FROM hmis_counts_real WHERE state=? AND district=? AND item_code IN ({codes}) ORDER BY item_code, fy, month",
                      [state, district, *item_codes])

    def districts(self, unit_id: str) -> list[str]:
        return self.q("SELECT DISTINCT district FROM facilities WHERE unit_id = ? ORDER BY district", [unit_id])["district"].tolist()
