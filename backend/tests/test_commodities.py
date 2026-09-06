import pandas as pd
import pytest

from sanjeevani import commodities, paths

SAMPLE = """=== PAGE 20 ===
Medicine Level of
Healthcare Dosage form(s) and strength(s)
6.2.1.1 Amoxicillin P,S,T
Capsule 250 mg
Capsule 500 mg
6.2.1.2 Amoxicillin (A) +
Clavulanic acid (B)
Tablet 500 mg (A) + 125 mg (B)
S,T
2.1.5 Paracetamol** P,S,T Tablet 500 mg
1.1.1 Halothane S,T Liquid for inhalation
"""


def test_parse_nlem_levels_same_line():
    df = commodities.parse_nlem(SAMPLE).set_index("name")
    assert df.loc["Paracetamol", "levels"] == "P,S,T" and df.loc["Paracetamol", "phc_level"]
    assert df.loc["Halothane", "phc_level"] is False or not df.loc["Halothane", "phc_level"]


def test_parse_nlem_levels_later_line():
    df = commodities.parse_nlem(SAMPLE)
    amox = df[df["name"].str.startswith("Amoxicillin (A)")].iloc[0]
    assert amox["levels"] == "S,T" and not amox["phc_level"]
    assert "Capsule 250 mg" in df.set_index("name").loc["Amoxicillin", "dosage"]


def test_ratio_table_integrity():
    r = commodities.load_ratios()
    assert r["commodity_id"].is_unique
    assert (r["units_per_case"] > 0).all()
    assert r.set_index("commodity_id").loc["ors", "hmis_item_code"] == "19.12"
    assert r.set_index("commodity_id").loc["ors", "driver_item_code"] == "10.11"


def test_catalogue_with_real_files():
    p = paths.DATA_PROCESSED / "hmis_items.parquet"
    t = paths.DATA_RAW / "india-gov" / "nlem_2022.txt"
    if not (p.exists() and t.exists()):
        pytest.skip("inputs not built")
    cat = commodities.catalogue(commodities.parse_nlem(t.read_text()), pd.read_parquet(p))
    c = cat.set_index("commodity_id")
    assert c.loc["ors", "has_real_ledger"] and c.loc["ors", "source"] == "hmis+simulated"
    assert c.loc["paracetamol_500", "nlem_no"] is not None and c.loc["paracetamol_500", "source"] == "simulated"
    assert cat["has_real_ledger"].sum() >= 25
