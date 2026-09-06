"""HMIS C2 district-level monthly data: consolidation, item catalogue, stock ledger.

Input: long CSVs produced by scripts/parse_hmis_c2.py, one per state and financial year,
columns state, district, fy, month, section, item_code, item_name, measure, value.
"""
from pathlib import Path

import duckdb
import pandas as pd

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
    """'2017-2018' -> '2017-18'; already-short values pass through."""
    return series.str.replace(r"^(\d{4})-\d{2}(\d{2})$", r"\1-\2", regex=True)


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
               CAST(item_code AS VARCHAR) AS item_code, item_name, measure,
               TRY_CAST(value AS DOUBLE) AS value
        FROM read_csv('{csv_glob}', header=true, union_by_name=true,
                      types={{'item_code':'VARCHAR','value':'VARCHAR','district':'VARCHAR','state':'VARCHAR'}})
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
