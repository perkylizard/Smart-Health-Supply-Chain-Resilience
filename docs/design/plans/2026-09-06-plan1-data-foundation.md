# Plan 1: Data Foundation and Repo Scaffold


**Goal:** Turn the verified raw data into versioned Parquet tables plus a simulator that produces facility-level stock ledgers for the 13-unit demo set, packaged in a DuckDB file the backend can ship.

**Architecture:** A single Python package `sanjeevani` under `backend/` holds pure functions (parsers, reconciliation, simulator). Thin scripts under `scripts/` call them and write to `data/processed/`. Every table has a schema constant and a golden-value test taken from real HMIS rows already verified by hand.

**Tech Stack:** Python 3.12 via uv, pandas, pyarrow, duckdb, pytest, requests (OSM only). No cloud services in this plan.

**Spec:** `docs/design/specs/2026-09-06-sanjeevani-grid-design.md` (Sections 1, 2, 5.3)

## Global Constraints
- Python 3.12 managed by uv; run everything with `uv run`. No system pip installs.
- Raw HMIS folder `C2. Data Itemwise Monthly (up to sub district)/` and `HDI Reports/` are git-ignored and never copied.
- Every processed table is written to `data/processed/<name>.parquet` with snake_case columns and a `source` column where rows mix real and simulated data (`hmis`, `rhs`, `census`, `nfhs5`, `osm`, `simulated`).
- District and state names follow HMIS spelling as canonical; other sources are mapped to it via `data/reference/name_overrides.csv`.
- Demo set (13 units) from spec Section 1; Bihar is the hero. Ladakh = Leh + Kargil; Bastar division = Bastar, Bijapur, Dantewada, Kanker, Kondagaon, Narayanpur, Sukma.
- Simulated values are always labelled `source = simulated`.
- Commit after every task with a `feat:`/`data:`/`test:` prefix.

---

## File structure

```
pyproject.toml                       uv project, package = backend/sanjeevani
Makefile                             dev, test, data targets
backend/sanjeevani/__init__.py
backend/sanjeevani/paths.py          ROOT, DATA_RAW, DATA_PROCESSED, DATA_REF constants
backend/sanjeevani/hmis.py           consolidate CSV -> parquet, item catalogue, ledger extraction
backend/sanjeevani/names.py          state/district canonicalisation with overrides
backend/sanjeevani/reference.py      census + nfhs + rhs loaders -> districts.parquet
backend/sanjeevani/facilities.py     OSM fetch + synthetic fill -> facilities.parquet
backend/sanjeevani/commodities.py    NLEM parse + ledger mapping + consumption ratios
backend/sanjeevani/units.py          demo units (13) incl. Ladakh and Bastar carve-outs
backend/sanjeevani/simulate.py       district -> facility disaggregation, ledger, scenarios
backend/sanjeevani/demo_db.py        build data/demo.duckdb
backend/tests/                       one test file per module + conftest with fixtures
scripts/build_hmis_parquet.py
scripts/build_reference.py
scripts/build_commodities.py
scripts/build_facilities.py
scripts/simulate.py
scripts/build_demo_db.py
data/reference/name_overrides.csv    manual name fixes (state,source,source_name,canonical_name)
data/reference/consumption_ratios.csv   commodity -> driver item code -> units per case
data/reference/demo_units.csv
```

---

### Task 1: Repo scaffold

**Files:**
- Create: `pyproject.toml`, `Makefile`, `backend/sanjeevani/__init__.py`, `backend/sanjeevani/paths.py`, `backend/tests/test_paths.py`, `.github/workflows/test.yml`, `README.md`

**Interfaces:**
- Produces: `sanjeevani.paths.ROOT: Path`, `DATA_RAW`, `DATA_PROCESSED`, `DATA_REF`, `RAW_HMIS_C2` (Path to the district-level raw folder).

- [ ] **Step 1: git init and first commit of existing docs**
```bash
git init -b main
git add .gitignore .env.example HACKATHON-CHECKLIST.md DATA-SOURCES-VERIFIED.md docs scripts data/raw/apis data/raw/india-gov/SOURCES.txt data/raw/datagovin/*.meta.json data/raw/datagovin/SOURCES.txt
git commit -m "docs: hackathon checklist, verified data sources, design spec"
```
(Large CSVs under data/raw stay untracked for now; add `data/raw/datagovin/*.csv` and `data/raw/india-gov/*` to .gitignore except SOURCES.txt.)

- [ ] **Step 2: pyproject**
```toml
[project]
name = "sanjeevani"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["pandas>=2.2", "pyarrow>=17", "duckdb>=1.1", "requests>=2.32", "numpy>=2.0"]
[dependency-groups]
dev = ["pytest>=8", "pytest-cov>=5"]
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
[tool.hatch.build.targets.wheel]
packages = ["backend/sanjeevani"]
[tool.pytest.ini_options]
testpaths = ["backend/tests"]
```

- [ ] **Step 3: paths module and test**
```python
# backend/sanjeevani/paths.py
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DATA_RAW = DATA / "raw"
DATA_PROCESSED = DATA / "processed"
DATA_REF = DATA / "reference"
RAW_HMIS_C2 = ROOT / "C2. Data Itemwise Monthly (up to sub district)" / "All States Across Districts"
```
```python
# backend/tests/test_paths.py
from sanjeevani import paths
def test_root_has_pyproject():
    assert (paths.ROOT / "pyproject.toml").exists()
```

- [ ] **Step 4: Makefile**
```make
.PHONY: test data
test: ; uv run pytest -q
data: ; uv run python scripts/build_hmis_parquet.py && uv run python scripts/build_reference.py && uv run python scripts/build_commodities.py && uv run python scripts/build_facilities.py && uv run python scripts/simulate.py && uv run python scripts/build_demo_db.py
```

- [ ] **Step 5: run** `uv sync && uv run pytest -q` → 1 passed. **Commit** `chore: python project scaffold`.

---

### Task 2: HMIS consolidation to Parquet

**Files:**
- Create: `backend/sanjeevani/hmis.py`, `backend/tests/test_hmis.py`, `scripts/build_hmis_parquet.py`
- Modify: `scripts/parse_hmis_c2.py` (fix output filename bug: use `fy[:4]+"-"+fy[7:9]`)

**Interfaces:**
- Produces: `hmis.load_long_csvs(dir: Path) -> pd.DataFrame` (columns state, district, fy, month, section, item_code, item_name, measure, value:float); `hmis.write_parquet(df, out: Path)`; `hmis.item_catalogue(df) -> pd.DataFrame` (item_code, item_name, section, kind in {"count","stock"}); `hmis.ledger(df) -> pd.DataFrame` (state, district, fy, month, item_code, opening, received, unusable, distributed, closing). Parquet files: `hmis_c2.parquet`, `hmis_items.parquet`, `hmis_ledger.parquet`.

- [ ] **Step 1: failing golden tests** (values verified by hand on 6 Sep from the raw files)
```python
# backend/tests/test_hmis.py
import pandas as pd, pytest
from sanjeevani import hmis, paths
@pytest.fixture(scope="module")
def bihar():
    p = paths.DATA_PROCESSED / "hmis_c2_2019-20_Bihar.csv"
    if not p.exists(): pytest.skip("processed CSV not built")
    return hmis.load_long_csvs(paths.DATA_PROCESSED, pattern="hmis_c2_2019-20_Bihar.csv")
def test_state_opd_april_2019(bihar):
    v = bihar.query("district=='Bihar' and month==4 and item_code=='14.2.1' and measure=='Total'").value.iloc[0]
    assert v == 5187499
def test_patna_opd_april_2019(bihar):
    v = bihar.query("district=='Patna' and month==4 and item_code=='14.2.1' and measure=='Total'").value.iloc[0]
    assert v == 273010
def test_ledger_has_five_fields(bihar):
    led = hmis.ledger(bihar)
    row = led.query("district=='Bihar' and month==4 and item_code=='19.12'").iloc[0]
    assert row.opening == 1742316 and row.distributed == 873560 and row.closing == 1497797
def test_item_catalogue_kinds(bihar):
    cat = hmis.item_catalogue(bihar)
    assert cat.set_index("item_code").loc["19.12","kind"] == "stock"
    assert cat.set_index("item_code").loc["14.2.1","kind"] == "count"
```

- [ ] **Step 2: run** → fails (module missing).

- [ ] **Step 3: implement**
```python
# backend/sanjeevani/hmis.py
from pathlib import Path
import pandas as pd
STOCK_MEASURES = {"1. Balance From Previous Month":"opening","2. Stocks Received":"received","3. Unusable Stock":"unusable","4. Stock Distributed":"distributed","5. Total Stock":"closing"}
def load_long_csvs(d: Path, pattern="hmis_c2_20*.csv") -> pd.DataFrame:
    frames=[pd.read_csv(f, dtype={"item_code":str,"district":str,"state":str}) for f in sorted(d.glob(pattern))]
    df=pd.concat(frames, ignore_index=True)
    df["value"]=pd.to_numeric(df["value"], errors="coerce")
    df["fy"]=df["fy"].str.replace(r"^(\d{4})-\d{2}(\d{2})$", r"\1-\2", regex=True)
    return df
def item_catalogue(df):
    cat=df.groupby("item_code").agg(item_name=("item_name","first"), section=("section","first")).reset_index()
    stock=set(df.loc[df.measure.isin(STOCK_MEASURES), "item_code"])
    cat["kind"]=cat.item_code.map(lambda c: "stock" if c in stock else "count")
    return cat
def ledger(df):
    s=df[df.measure.isin(STOCK_MEASURES)].copy(); s["field"]=s.measure.map(STOCK_MEASURES)
    return s.pivot_table(index=["state","district","fy","month","item_code","item_name"], columns="field", values="value", aggfunc="first").reset_index()
def write_parquet(df, out: Path): out.parent.mkdir(parents=True, exist_ok=True); df.to_parquet(out, index=False)
```

- [ ] **Step 4: script** `scripts/build_hmis_parquet.py`: rename any `hmis_c2_2017-20_*`→`2017-18`, `2018-20_*`→`2018-19` files; load all; write the three parquet files; print row counts. Run it. Expected: hmis_c2.parquet with about 40M rows, hmis_ledger about 1M.

- [ ] **Step 5: tests pass; commit** `data: consolidate HMIS C2 2017-2020 into parquet`.

---

### Task 3: Name canonicalisation and district reference table

**Files:**
- Create: `backend/sanjeevani/names.py`, `backend/sanjeevani/reference.py`, `data/reference/name_overrides.csv`, `backend/tests/test_names.py`, `scripts/build_reference.py`

**Interfaces:**
- Produces: `names.canon_state(s) -> str`, `names.canon_district(state, d, source) -> str` (applies overrides then normalisation: casefold, strip punctuation, "&"→"and"); `reference.build_districts() -> pd.DataFrame` with columns state, district, census_pop_2011, rural_pop_2011, nfhs5_pop_share_under15, hmis_present (bool), source. Output `districts.parquet`.

- [ ] **Step 1: failing tests**
```python
from sanjeevani import names
def test_state_aliases():
    assert names.canon_state("Jammu and Kashmir") == "Jammu & Kashmir"
    assert names.canon_state("A & N Islands") == "Andaman & Nicobar Islands"
def test_district_override():
    assert names.canon_district("Bihar","Kaimur (Bhabua)","census") == "Kaimur Bhabua"
```

- [ ] **Step 2: implement** normalisation + CSV overrides (start with the 20 known: Kaimur, Purba/Paschim Champaran → East/West Champaran, Y.S.R. → YSR, Ahmadabad → Ahmedabad, etc.). Script builds `districts.parquet` by joining Census PCA (Level==DISTRICT, TRU==Total) and NFHS-5 district CSV to the set of HMIS districts, and prints unmatched names per state so overrides can be added until every HMIS district in the 13 demo units matches Census.

- [ ] **Step 3: tests pass; run script; commit** `data: district reference with census and NFHS-5`.

---

### Task 4: Commodity catalogue and consumption ratios

**Files:**
- Create: `backend/sanjeevani/commodities.py`, `data/reference/consumption_ratios.csv`, `backend/tests/test_commodities.py`, `scripts/build_commodities.py`

**Interfaces:**
- Produces: `commodities.parse_nlem(text: str) -> pd.DataFrame` (nlem_no, name, levels set of P/S/T, dosage); `commodities.catalogue() -> pd.DataFrame` columns commodity_id, name, unit, phc_level(bool), hmis_item_code (nullable), driver_item_code, units_per_case, shelf_life_months, source. Output `commodities.parquet`, about 60 rows: the 25 HMIS ledger items plus 35 PHC-level NLEM medicines.

- [ ] **Step 1: extract NLEM text** with macOS PDFKit (osascript JXA) into `data/raw/india-gov/nlem_2022.txt` (script step, not Python).
- [ ] **Step 2: failing test**: `parse_nlem` returns a row for "Paracetamol" with "P" in levels; catalogue has `19.12` mapped to commodity "ORS" with driver `10.11` (childhood diarrhoea) and `phc_level == True`.
- [ ] **Step 3: consumption_ratios.csv** hand-curated (WHO Managing Drug Supply norms, documented in a comment header): e.g. ORS sachets per diarrhoea case 3, Zinc tablets 14, Amoxicillin 250 mg per pneumonia case 15, ACT course per Pf malaria case 1, Paracetamol 500 mg per OPD fever proxy 0.15, IFA per ANC registration 180, Oxytocin per institutional delivery 1, anti-rabies vials per animal bite 4, anti-snake-venom vials per snake bite 10, Metformin per diabetes OPD 60, Amlodipine per hypertension OPD 30.
- [ ] **Step 4: implement, test, run, commit** `data: commodity catalogue with NLEM levels and consumption ratios`.

---

### Task 5: Demo units

**Files:**
- Create: `backend/sanjeevani/units.py`, `data/reference/demo_units.csv`, `backend/tests/test_units.py`

**Interfaces:**
- Produces: `units.demo_units() -> pd.DataFrame` (unit_id, unit_name, kind in {state, ut, carveout}, state, district or null, is_hero). `units.districts_for(unit_id) -> list[str]`.

- [ ] `demo_units.csv` rows: bihar (hero), uttar_pradesh, rajasthan, madhya_pradesh, andhra_pradesh, telangana, karnataka, arunachal_pradesh, jammu_kashmir (districts excluding Leh, Kargil), ladakh (carveout: Leh, Kargil from J&K files), lakshadweep, andaman_nicobar, bastar (carveout: Bastar, Bijapur, Dantewada, Kanker, Kondagaon, Narayanpur, Sukma from Chhattisgarh).
- [ ] Test: `districts_for("ladakh") == ["Kargil","Leh"]` (sorted), Bastar has 7, and every district exists in `districts.parquet` for the right state.
- [ ] Commit `data: 13 demo units incl. Ladakh and Bastar carve-outs`.

---

### Task 6: Facility roster

**Files:**
- Create: `backend/sanjeevani/facilities.py`, `backend/tests/test_facilities.py`, `scripts/build_facilities.py`, `data/raw/osm/` (cached Overpass JSON per district)

**Interfaces:**
- Produces: `facilities.fetch_osm(state, district, bbox) -> list[dict]` (cached to JSON; one Overpass query per district, 1 s sleep, User-Agent set); `facilities.target_counts(state) -> dict[district, int]` (state PHC count from RHS 2021-22 split by district rural population share, rounded, min 1); `facilities.build(unit_ids) -> pd.DataFrame` columns facility_id, name, type in {PHC, CHC, DH}, state, district, block, lat, lon, catchment_pop, dist_to_warehouse_km, beds, source in {osm, karnataka_ogd, simulated}. Output `facilities.parquet`.

- [ ] District centroids and bbox: from OSM Nominatim (`https://nominatim.openstreetmap.org/search?q=<district>,<state>,India&format=json&polygon=0`), cached, 1 request/second, one per district in the demo set (about 200).
- [ ] Real facilities: Overpass `healthcare=centre` or name matching `PHC|APHC|UPHC|CHC` inside the district bbox; Karnataka CHCs from the data.gov.in list with geocoded district centroid.
- [ ] Fill: for each district, generate `target - real` synthetic PHCs named "PHC <District> <n>" with coordinates uniformly within the bbox, `source = simulated`. One DH per district at the centroid; CHCs at RHS state ratio.
- [ ] Test: for Bihar total PHC count within 5 percent of 1,760; every facility has lat/lon inside India's bbox; `source` never null; Ladakh facilities have district in {Leh, Kargil}.
- [ ] Commit `data: facility roster for 13 demo units (OSM + RHS-scaled synthetic)`.

---

### Task 7: Simulator

**Files:**
- Create: `backend/sanjeevani/simulate.py`, `data/scenarios/scenarios.json`, `backend/tests/test_simulate.py`, `scripts/simulate.py`

**Interfaces:**
- Produces: `simulate.facility_shares(facilities, districts) -> pd.DataFrame` (facility_id, share within district, sums to 1 per district); `simulate.disaggregate(hmis_district_df, shares, seed) -> pd.DataFrame` facility monthly demand for driver items (lognormal noise sigma 0.15, renormalised so district totals are preserved exactly); `simulate.build_ledger(demand, commodities, ratios, seed) -> pd.DataFrame` columns facility_id, commodity_id, month_index (0..35 mapped to 2024-04 .. 2027-03), demand, opening, received, unusable, distributed, closing, days_of_stock, source; `simulate.apply_scenario(ledger, scenario, intensity) -> pd.DataFrame`. Scenarios JSON: normal, monsoon_surge (diarrhoea x2.5 Jun-Sep, lead +3d), dengue_season (dengue x3 Sep-Nov), winter_closure (units ladakh, jammu_kashmir: lead +14d Dec-Mar), cyclone (andhra, andaman: lead +7d, demand x1.3 for 1 month), warehouse_shock (received x0 for 1 month).
- [ ] Time shift: fy 2017-18 → 2024-25, 2018-19 → 2025-26, 2019-20 → 2026-27; rescale by facility count ratio (HDI 2023-24 vs RHS 2017-18 state totals; until OCR lands, use RHS 2021-22).
- [ ] Ledger rule: received follows a monthly indent equal to last 3 months mean demand x 1.2, delivered with lead time; closing = opening + received − unusable − distributed; distributed = min(demand, available); stock-out when demand > available.
- [ ] Tests: district totals preserved within 0.1 percent after disaggregation; ledger identity holds every row; monsoon scenario raises ORS demand in July by about 2.5x; deterministic under seed.
- [ ] Commit `feat: facility-level simulator with scenario multipliers`.

---

### Task 8: Demo DuckDB

**Files:**
- Create: `backend/sanjeevani/demo_db.py`, `scripts/build_demo_db.py`, `backend/tests/test_demo_db.py`

**Interfaces:**
- Produces: `demo_db.build(out: Path)` creating tables districts, facilities, commodities, units, demand, ledger, hmis_ledger_real (district level real), scenarios; views `v_days_of_stock` (latest month per facility x commodity) and `v_district_summary`. File `data/demo.duckdb` under 256 MB (raised from 200 MB when Assam joined the demo set).
- [ ] Test: `SELECT count(*) FROM facilities WHERE state='Bihar'` about 1,760 PHC rows; `v_days_of_stock` has no nulls in days_of_stock; file size < 200 MB.
- [ ] Commit `feat: demo DuckDB with views for the backend`.

---

## Self-review
- Spec coverage: Section 2 entities → Tasks 2 to 8 (StaffAttendance and BedOccupancy simulated in Task 7's ledger builder as two extra tables `staff` and `beds`; add to Task 7 outputs). Alerts, Transfers, ModelRound belong to Plans 2 and 5.
- Placeholder scan: none.
- Type consistency: `facility_id` string everywhere; `commodity_id` string; `month_index` int; district names canonical via `names.canon_district`.
