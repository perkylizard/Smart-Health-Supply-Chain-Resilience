"""Build federated nodes from the demo DuckDB ledger. Features are computed inside each node from its own rows."""
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from sanjeevani import paths
from sanjeevani.federated.fedavg import Node
from sanjeevani.federated.model import featurise


def _frame(con, where: str, params: list, sample: int, seed: int) -> pd.DataFrame:
    df = con.execute(f"""
        WITH l AS (
          SELECT l.facility_id, l.commodity_id, f.state, f.district, l.month_index, l.month, l.demand, l.days_of_stock, l.lead_days, l.stockout,
                 avg(l.demand) OVER (PARTITION BY l.facility_id, l.commodity_id ORDER BY l.month_index ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS demand_prev3,
                 lead(l.stockout) OVER (PARTITION BY l.facility_id, l.commodity_id ORDER BY l.month_index) AS stockout_next
          FROM ledger l JOIN facilities f USING (facility_id) WHERE {where})
        SELECT * FROM l WHERE stockout_next IS NOT NULL AND demand_prev3 IS NOT NULL""", params).df()
    if len(df) > sample:
        df = df.sample(n=sample, random_state=seed)
    # district driver change: total demand this month vs prior 3, from the node's own rows only
    g = df.groupby(["district", "month_index"])["demand"].sum().rename("d_tot").reset_index()
    g["d_prev"] = g.groupby("district")["d_tot"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    g["driver_delta"] = ((g["d_tot"] + 1) / (g["d_prev"].fillna(g["d_tot"]) + 1) - 1).clip(-1, 3)
    return df.merge(g[["district", "month_index", "driver_delta"]], on=["district", "month_index"], how="left").fillna({"driver_delta": 0.0})


def _node(name: str, group: str, df: pd.DataFrame, holdout_months: int = 6) -> Node | None:
    if df.empty or df["stockout_next"].sum() < 12:
        return None
    cut = df["month_index"].max() - holdout_months
    tr, te = df[df["month_index"] <= cut], df[df["month_index"] > cut]
    if te["stockout_next"].sum() < 3 or len(te) < 60:
        return None
    Xtr = featurise(tr["days_of_stock"], tr["demand"], tr["demand_prev3"], tr["lead_days"], tr["month"], tr["driver_delta"])
    Xte = featurise(te["days_of_stock"], te["demand"], te["demand_prev3"], te["lead_days"], te["month"], te["driver_delta"])
    return Node(name, group, Xtr, tr["stockout_next"].to_numpy(float), Xte, te["stockout_next"].to_numpy(float))


def district_nodes(unit_id: str, sample_per_district: int = 12000, seed: int = 7, db=None) -> list[Node]:
    con = duckdb.connect(str(db or (paths.DATA / "demo.duckdb")), read_only=True)
    state = con.execute("SELECT state FROM units WHERE unit_id = ?", [unit_id]).fetchone()[0]
    districts = [r[0] for r in con.execute("SELECT DISTINCT district FROM facilities WHERE unit_id = ? ORDER BY 1", [unit_id]).fetchall()]
    nodes = []
    for i, d in enumerate(districts):
        df = _frame(con, "f.unit_id = ? AND f.district = ?", [unit_id, d], sample_per_district, seed + i)
        n = _node(d, state, df)
        if n: nodes.append(n)
    con.close()
    return nodes


def state_nodes(sample_per_state: int = 30000, seed: int = 7, db=None) -> list[Node]:
    con = duckdb.connect(str(db or (paths.DATA / "demo.duckdb")), read_only=True)
    units = con.execute("SELECT unit_id, unit_name FROM units ORDER BY unit_id").fetchall()
    nodes = []
    for i, (uid, name) in enumerate(units):
        df = _frame(con, "f.unit_id = ?", [uid], sample_per_state, seed + i)
        n = _node(name, "India", df)
        if n: nodes.append(n)
    con.close()
    return nodes


BRAZIL_LEDGER = paths.DATA_PROCESSED / "brazil_synth_ledger.parquet"


def _frame_pandas(df: pd.DataFrame, sample: int, seed: int) -> pd.DataFrame:
    """Same derived columns as _frame, for a ledger held in pandas rather than DuckDB."""
    df = df.sort_values(["facility_id", "commodity_id", "month_index"]).copy()
    g = df.groupby(["facility_id", "commodity_id"], sort=False)
    df["demand_prev3"] = g["demand"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    df["stockout_next"] = g["stockout"].shift(-1)
    df = df.dropna(subset=["demand_prev3", "stockout_next"])
    df["stockout_next"] = df["stockout_next"].astype(bool)
    if len(df) > sample:
        df = df.sample(n=sample, random_state=seed)
    d = df.groupby(["district", "month_index"])["demand"].sum().rename("d_tot").reset_index()
    d["d_prev"] = d.groupby("district")["d_tot"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    d["driver_delta"] = ((d["d_tot"] + 1) / (d["d_prev"].fillna(d["d_tot"]) + 1) - 1).clip(-1, 3)
    return df.merge(d[["district", "month_index", "driver_delta"]], on=["district", "month_index"], how="left").fillna({"driver_delta": 0.0})


def brazil_uf_nodes(sample_per_uf: int = 20000, seed: int = 7, ledger: Path | None = None) -> list[Node]:
    """One node per Brazilian UF from the simulated ledger (group "Brazil").
    Simulated Brazil node, shaped on the public BNAFAR/Hórus sample structure; no facility data fetched."""
    df = pd.read_parquet(ledger or BRAZIL_LEDGER)
    nodes = []
    for i, uf in enumerate(sorted(df["state"].unique())):
        n = _node(uf, "Brazil", _frame_pandas(df[df["state"] == uf], sample_per_uf, seed + i))
        if n: nodes.append(n)
    return nodes
