"""Append one financial year of parsed HMIS long CSVs to the processed parquet files (no rebuild of earlier years).

Usage:
  uv run python scripts/parse_hmis_c2.py --years "2020-2021(Data is Provisional)"
  uv run python scripts/append_hmis_year.py 2020-21 --provisional
"""
import argparse

from sanjeevani import hmis, paths

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("fy", help="short financial year as in the CSV file names, e.g. 2020-21")
    ap.add_argument("--provisional", action="store_true", help="flag every row of this year as provisional (MoHFW label)")
    a = ap.parse_args()
    glob = str(paths.DATA_PROCESSED / f"hmis_c2_{a.fy}_*.csv")
    counts = hmis.append_year(glob, paths.DATA_PROCESSED, provisional=a.provisional)
    for k, v in counts.items():
        print(f"{k}: {v:,}" if isinstance(v, int) else f"{k}: {v}")
