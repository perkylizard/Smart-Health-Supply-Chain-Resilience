"""HMIS C2 district-level monthly data: consolidation, item catalogue, stock ledger.

Input: long CSVs produced by scripts/parse_hmis_c2.py, one per state and financial year,
columns state, district, fy, month, section, item_code, item_name, measure, value.
"""
import os
from pathlib import Path

import duckdb
import pandas as pd

from sanjeevani import names

STOCK_MEASURES = {
    "1. Balance From Previous Month": "opening",
    "2. Stocks Received": "received",
    "3. Unusable Stock": "unusable",
    "4. Stock Distributed": "distributed",
    "5. Total Stock": "closing",
}
COUNT_MEASURES = ["Total", "Public", "Private", "Urban", "Rural"]
FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]


def normalise_fy(series: pd.Series) -> pd.Series:
    """'2017-2018' -> '2017-18'; '2020-2021(Data is Provisional)' -> '2020-21'; already-short values pass through."""
    return series.str.replace(r"^(\d{4})-\d{2}(\d{2}).*$", r"\1-\2", regex=True)


def load_long_csvs(d: Path, pattern: str = "hmis_c2_20*.csv") -> pd.DataFrame:
    frames = [
        pd.read_csv(f, dtype={"item_code": str, "district": str, "state": str, "measure": str})
        for f in sorted(d.glob(pattern))
    ]
    if not frames:
        raise FileNotFoundError(f"no files matching {pattern} in {d}")
    df = pd.concat(frames, ignore_index=True)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["fy"] = normalise_fy(df["fy"].astype(str))
    return df


def item_catalogue(df: pd.DataFrame) -> pd.DataFrame:
    cat = (
        df.groupby("item_code")
        .agg(item_name=("item_name", "first"), section=("section", "first"))
        .reset_index()
    )
    stock_codes = set(df.loc[df["measure"].isin(STOCK_MEASURES), "item_code"])
    cat["kind"] = cat["item_code"].map(lambda c: "stock" if c in stock_codes else "count")
    return cat


def ledger(df: pd.DataFrame) -> pd.DataFrame:
    s = df[df["measure"].isin(STOCK_MEASURES)].copy()
    s["field"] = s["measure"].map(STOCK_MEASURES)
    out = s.pivot_table(
        index=["state", "district", "fy", "month", "item_code", "item_name"],
        columns="field", values="value", aggfunc="first",
    ).reset_index()
    out.columns.name = None
    for c in STOCK_MEASURES.values():
        if c not in out.columns:
            out[c] = float("nan")
    return out


def consolidate_with_duckdb(csv_glob: str, out_dir: Path) -> dict:
    """Stream every long CSV into three parquet files without loading them into RAM."""
    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(
        f"""
        CREATE VIEW raw AS
        SELECT state, district,
               regexp_replace(fy, '^(\\d{{4}})-\\d{{2}}(\\d{{2}})$', '\\1-\\2') AS fy,
               CAST(month AS INTEGER) AS month, section,
               regexp_replace(CAST(item_code AS VARCHAR), '(\\.\\d*?[1-9])0{{5,}}\\d*$', '\\1') AS item_code, item_name, measure,
               TRY_CAST(value AS DOUBLE) AS value
        FROM read_csv('{csv_glob}', header=true, union_by_name=true, all_varchar=true)
        """
    )
    con.execute(f"COPY (SELECT * FROM raw WHERE value IS NOT NULL) TO '{out_dir / 'hmis_c2.parquet'}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    stock_list = ", ".join(f"'{k}'" for k in STOCK_MEASURES)
    con.execute(
        f"""
        COPY (
          SELECT item_code, any_value(item_name) AS item_name, any_value(section) AS section,
                 CASE WHEN bool_or(measure IN ({stock_list})) THEN 'stock' ELSE 'count' END AS kind
          FROM raw GROUP BY item_code ORDER BY item_code
        ) TO '{out_dir / 'hmis_items.parquet'}' (FORMAT PARQUET)
        """
    )
    case = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in STOCK_MEASURES.items())
    con.execute(
        f"""
        COPY (
          PIVOT (SELECT state, district, fy, month, item_code, item_name,
                        CASE measure {case} END AS field, value
                 FROM raw WHERE measure IN ({stock_list}))
          ON field IN ('opening','received','unusable','distributed','closing')
          USING first(value)
          GROUP BY state, district, fy, month, item_code, item_name
        ) TO '{out_dir / 'hmis_ledger.parquet'}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    counts = {
        n: con.execute(f"SELECT count(*) FROM '{out_dir / f'{n}.parquet'}'").fetchone()[0]
        for n in ("hmis_c2", "hmis_items", "hmis_ledger")
    }
    con.close()
    return counts


def append_year(csv_glob: str, out_dir: Path, provisional: bool = True) -> dict:
    """Add one more financial year of long CSVs to the three parquet files without the original CSVs.

    Rows for the same financial year already in the parquet are replaced, so a re-run is idempotent. Every row gets a
    `provisional` flag (MoHFW marks 2020-21 onwards as provisional). State names are mapped to the canonical spelling
    used by the earlier years (the 2020-21 export spells some states differently)."""
    c2, items, led = (out_dir / f"{n}.parquet" for n in ("hmis_c2", "hmis_items", "hmis_ledger"))
    con = duckdb.connect()
    states = [r[0] for r in con.execute(f"SELECT DISTINCT state FROM read_csv('{csv_glob}', header=true, all_varchar=true)").fetchall()]
    case = "CASE state " + " ".join(f"WHEN '{s}' THEN '{names.canon_state(s)}'" for s in states) + " ELSE state END"
    con.execute(
        f"""
        CREATE VIEW new_rows AS
        SELECT {case} AS state, district,
               regexp_replace(fy, '^(\\d{{4}})-\\d{{2}}(\\d{{2}}).*$', '\\1-\\2') AS fy,
               CAST(month AS INTEGER) AS month, section,
               regexp_replace(CAST(item_code AS VARCHAR), '(\\.\\d*?[1-9])0{{5,}}\\d*$', '\\1') AS item_code, item_name, measure,
               TRY_CAST(value AS DOUBLE) AS value, {str(provisional).lower()} AS provisional
        FROM read_csv('{csv_glob}', header=true, union_by_name=true, all_varchar=true)
        WHERE TRY_CAST(value AS DOUBLE) IS NOT NULL
        """
    )
    new_fys = [r[0] for r in con.execute("SELECT DISTINCT fy FROM new_rows").fetchall()]
    fy_list = ", ".join(f"'{f}'" for f in new_fys)
    has_flag = "provisional" in [c[0] for c in con.execute(f"DESCRIBE SELECT * FROM '{c2}'").fetchall()]
    old_flag = "provisional" if has_flag else "false AS provisional"
    con.execute(
        f"""
        CREATE VIEW raw AS
        SELECT state, district, fy, month, section, item_code, item_name, measure, value, {old_flag}
        FROM '{c2}' WHERE fy NOT IN ({fy_list})
        UNION ALL SELECT * FROM new_rows
        """
    )
    tmp = out_dir / "hmis_c2.tmp.parquet"
    con.execute(f"COPY (SELECT * FROM raw) TO '{tmp}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.execute("DROP VIEW raw"); con.execute("DROP VIEW new_rows")
    os.replace(tmp, c2)
    con.execute(f"CREATE VIEW raw AS SELECT * FROM '{c2}'")
    stock_list = ", ".join(f"'{k}'" for k in STOCK_MEASURES)
    con.execute(
        f"""
        COPY (
          SELECT item_code, any_value(item_name) AS item_name, any_value(section) AS section,
                 CASE WHEN bool_or(measure IN ({stock_list})) THEN 'stock' ELSE 'count' END AS kind
          FROM raw GROUP BY item_code ORDER BY item_code
        ) TO '{items}' (FORMAT PARQUET)
        """
    )
    case_m = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in STOCK_MEASURES.items())
    con.execute(
        f"""
        COPY (
          PIVOT (SELECT state, district, fy, month, item_code, item_name, provisional,
                        CASE measure {case_m} END AS field, value
                 FROM raw WHERE measure IN ({stock_list}))
          ON field IN ('opening','received','unusable','distributed','closing')
          USING first(value)
          GROUP BY state, district, fy, month, item_code, item_name, provisional
        ) TO '{led}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    counts = {n: con.execute(f"SELECT count(*) FROM '{out_dir / f'{n}.parquet'}'").fetchone()[0] for n in ("hmis_c2", "hmis_items", "hmis_ledger")}
    counts["new_fys"] = new_fys
    con.close()
    return counts
