from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DATA_RAW = DATA / "raw"
DATA_PROCESSED = DATA / "processed"
DATA_REF = DATA / "reference"
DATA_SCENARIOS = DATA / "scenarios"
RAW_HMIS_C2 = ROOT / "C2. Data Itemwise Monthly (up to sub district)" / "All States Across Districts"
