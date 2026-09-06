"""Geocode districts (Nominatim, cached), fetch OSM facilities per state (Overpass, cached),
build data/processed/facilities.parquet for the 13 demo units. Network calls only on cache misses."""
import pandas as pd

from sanjeevani import facilities, paths, units

if __name__ == "__main__":
    districts = pd.read_parquet(paths.DATA_PROCESSED / "districts.parquet")
    uids = units.demo_units()["unit_id"].tolist()
    df = facilities.build(uids, districts, fetch=True)
    df.to_parquet(paths.DATA_PROCESSED / "facilities.parquet", index=False)
    print(df.groupby(["unit_id", "type", "source"]).size().unstack(fill_value=0).to_string())
    print("total:", len(df), "| osm-named:", int((df.source == "osm").sum()), flush=True)
