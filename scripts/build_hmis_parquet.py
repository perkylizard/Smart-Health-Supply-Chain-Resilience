"""Consolidate data/processed/hmis_c2_<fy>_<state>.csv into parquet (streams via DuckDB)."""
from sanjeevani import hmis, paths

if __name__ == "__main__":
    glob = str(paths.DATA_PROCESSED / "hmis_c2_20*.csv")
    counts = hmis.consolidate_with_duckdb(glob, paths.DATA_PROCESSED)
    for k, v in counts.items():
        print(f"{k}: {v:,} rows")
