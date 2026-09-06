"""Build data/processed/commodities.parquet and nlem_2022.parquet."""
import pandas as pd

from sanjeevani import commodities, paths

if __name__ == "__main__":
    text = (paths.DATA_RAW / "india-gov" / "nlem_2022.txt").read_text()
    nlem = commodities.parse_nlem(text)
    nlem.to_parquet(paths.DATA_PROCESSED / "nlem_2022.parquet", index=False)
    items = pd.read_parquet(paths.DATA_PROCESSED / "hmis_items.parquet")
    cat = commodities.catalogue(nlem, items)
    cat.to_parquet(paths.DATA_PROCESSED / "commodities.parquet", index=False)
    print(f"nlem: {len(nlem)} entries, {int(nlem.phc_level.sum())} at PHC level")
    print(f"commodities: {len(cat)}; with real HMIS ledger: {int(cat.has_real_ledger.sum())}; NLEM-matched: {int(cat.nlem_no.notna().sum())}")
    miss = cat[(cat.nlem_match != '') & cat.nlem_no.isna()]
    print("nlem_match not found:", miss.commodity_id.tolist() or "none")
    bad = cat[cat.hmis_item_code.ne('') & ~cat.has_real_ledger]
    print("hmis codes not in items:", bad.commodity_id.tolist() or "none")
