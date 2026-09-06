"""District reference table: HMIS districts joined to Census 2011 population and NFHS-5 indicators."""
import duckdb
import numpy as np
import pandas as pd

from sanjeevani import names, paths

NFHS_COLS = {
    "Population_Below_15Years": "nfhs5_pop_under15_pct",
    "Underweight_Children_Under_Five": "nfhs5_underweight_pct",
    "Children_Fully_Vaccinated": "nfhs5_fully_vaccinated_pct",
    "Improved_Drinking-Water_Source": "nfhs5_improved_water_pct",
    "Household_Surveyed": "nfhs5_households_surveyed",
}


def hmis_districts(fy: str = "2019-20") -> pd.DataFrame:
    con = duckdb.connect()
    df = con.execute(
        f"SELECT DISTINCT state, district FROM '{paths.DATA_PROCESSED / 'hmis_c2.parquet'}' WHERE fy='{fy}'"
    ).df()
    con.close()
    is_state_row = df["district"].str.lower() == df["state"].str.lower()
    # UTs with no sub-district rows (e.g. Lakshadweep) use the state row as their single district
    singles = df[is_state_row & ~df["state"].isin(df.loc[~is_state_row, "state"])]
    return pd.concat([df[~is_state_row], singles], ignore_index=True)


def census_districts() -> pd.DataFrame:
    x = pd.read_excel(paths.DATA_RAW / "india-gov" / "census2011_PCA_district.xlsx", sheet_name=0)
    st = x[(x["Level"] == "STATE") & (x["TRU"] == "Total")][["State", "Name"]].rename(columns={"Name": "state_name"})
    d = x[(x["Level"] == "DISTRICT") & (x["TRU"] == "Total")].merge(st, on="State")
    r = x[(x["Level"] == "DISTRICT") & (x["TRU"] == "Rural")][["State", "District", "TOT_P"]].rename(columns={"TOT_P": "rural_pop_2011"})
    d = d.merge(r, on=["State", "District"], how="left")
    out = pd.DataFrame({
        "state": d["state_name"].map(names.canon_state),
        "census_name": d["Name"].str.strip(),
        "census_pop_2011": d["TOT_P"].astype("int64"),
        "rural_pop_2011": d["rural_pop_2011"].fillna(0).astype("int64"),
    })
    return out


def nfhs5_districts() -> pd.DataFrame:
    n = pd.read_csv(paths.DATA_RAW / "datagovin" / "nfhs5_district_factsheets.csv")
    cols = {k: v for k, v in NFHS_COLS.items() if k in n.columns}
    out = pd.DataFrame({"state": n["State_UT"].map(names.canon_state), "nfhs_name": n["District_Names"].str.strip()})
    for k, v in cols.items():
        out[v] = pd.to_numeric(n[k], errors="coerce")
    # NFHS lists Ladakh separately; HMIS 2019-20 keeps Leh and Kargil under J&K
    out.loc[out["state"] == "Ladakh", "state"] = "Jammu & Kashmir"
    return out


def build_districts() -> tuple[pd.DataFrame, pd.DataFrame]:
    hm = hmis_districts()
    cen, nf = census_districts(), nfhs5_districts()
    known = hm.groupby("state")["district"].apply(set).to_dict()
    cen["district"] = [names.canon_district(s, d, "census", known.get(s)) for s, d in zip(cen["state"], cen["census_name"])]
    nf["district"] = [names.canon_district(s, d, "nfhs5", known.get(s)) for s, d in zip(nf["state"], nf["nfhs_name"])]
    # single-district UTs: census/nfhs district name differs from the UT name; map by state
    single_states = set(hm[hm["district"] == hm["state"]]["state"])
    for df in (cen, nf):
        m = df["state"].isin(single_states)
        df.loc[m, "district"] = df.loc[m, "state"]
    cen = cen.drop_duplicates(["state", "district"]); nf = nf.drop_duplicates(["state", "district"])
    out = hm.merge(cen.drop(columns="census_name"), on=["state", "district"], how="left")
    out = out.merge(nf.drop(columns="nfhs_name"), on=["state", "district"], how="left")
    out["pop_source"] = np.where(out["census_pop_2011"].notna(), "census2011", "estimated")
    # estimate for post-2011 districts: the state's mean district population, so shares stay sane
    est = out.groupby("state")["census_pop_2011"].transform("mean")
    out["census_pop_2011"] = out["census_pop_2011"].fillna(est).fillna(0).round().astype("int64")
    out["rural_pop_2011"] = out["rural_pop_2011"].fillna(out["census_pop_2011"] * 0.7).round().astype("int64")
    out["nfhs5_present"] = out["nfhs5_pop_under15_pct"].notna()
    unmatched = out[(out["pop_source"] == "estimated") | (~out["nfhs5_present"])][["state", "district", "pop_source", "nfhs5_present"]]
    return out.sort_values(["state", "district"]).reset_index(drop=True), unmatched
