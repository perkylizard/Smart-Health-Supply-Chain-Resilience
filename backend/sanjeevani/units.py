"""The 13 demo units. A unit is a state, a UT, or a carve-out (subset of a state's districts).
`districts` column: empty = all districts of the state; 'A;B' = only these; '-A;-B' = all except these."""
from functools import lru_cache

import pandas as pd

from sanjeevani import paths


@lru_cache(maxsize=1)
def demo_units() -> pd.DataFrame:
    df = pd.read_csv(paths.DATA_REF / "demo_units.csv", dtype=str).fillna("")
    df["is_hero"] = df["is_hero"] == "1"
    return df


def districts_for(unit_id: str, all_districts: pd.DataFrame) -> list[str]:
    """all_districts: DataFrame with state, district (from districts.parquet)."""
    u = demo_units().set_index("unit_id").loc[unit_id]
    pool = sorted(all_districts.loc[all_districts["state"] == u["state"], "district"])
    spec = [s for s in u["districts"].split(";") if s]
    if not spec:
        return pool
    if all(s.startswith("-") for s in spec):
        drop = {s[1:] for s in spec}
        return [d for d in pool if d not in drop]
    return [d for d in pool if d in set(spec)]


def unit_of(state: str, district: str, all_districts: pd.DataFrame) -> str | None:
    for uid in demo_units()["unit_id"]:
        u = demo_units().set_index("unit_id").loc[uid]
        if u["state"] == state and district in districts_for(uid, all_districts):
            return uid
    return None
