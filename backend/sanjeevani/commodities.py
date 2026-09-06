"""Commodity catalogue: NLEM 2022 levels + HMIS ledger mapping + consumption ratios."""
import re

import pandas as pd

from sanjeevani import paths

CODE_RE = re.compile(r"^(\d+(?:\.\d+)+)\s+(.+?)\s*$")
LEVEL_RE = re.compile(r"\b([PST](?:\s*,\s*[PST]){0,2})\b")


def parse_nlem(text: str) -> pd.DataFrame:
    """Parse the PDFKit text dump of NLEM 2022 into rows (nlem_no, name, levels, dosage).
    Entries start with a dotted code; the P/S/T level token may sit on the same line or a later one."""
    rows, cur = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("=== PAGE") or line.startswith("Medicine Level of") or line.startswith("Healthcare Dosage"):
            continue
        m = CODE_RE.match(line)
        if m and not re.match(r"^\d+(\.\d+)?\s*[-–]", line):
            if cur:
                rows.append(cur)
            rest = m.group(2)
            lv = LEVEL_RE.search(rest)
            name = rest[: lv.start()].strip(" *") if lv else rest.strip(" *")
            dosage = rest[lv.end():].strip() if lv else ""
            cur = {"nlem_no": m.group(1), "name": name, "levels": set(re.findall(r"[PST]", lv.group(1))) if lv else set(), "dosage": dosage}
        elif cur is not None:
            lv = LEVEL_RE.fullmatch(line) or (LEVEL_RE.search(line) if not cur["levels"] else None)
            if lv and not cur["levels"]:
                cur["levels"] = set(re.findall(r"[PST]", lv.group(1)))
                line = (line[: lv.start()] + line[lv.end():]).strip()
            if line and not cur["levels"] and not cur["dosage"] and "(" in line and cur["name"].endswith("+"):
                cur["name"] = (cur["name"] + " " + line).strip()
            elif line:
                cur["dosage"] = (cur["dosage"] + " | " + line).strip(" |")
    if cur:
        rows.append(cur)
    df = pd.DataFrame(rows)
    df = df[df["name"].str.len() > 1]
    df["phc_level"] = df["levels"].map(lambda s: "P" in s)
    df["levels"] = df["levels"].map(lambda s: ",".join(sorted(s)))
    return df.reset_index(drop=True)


def load_ratios() -> pd.DataFrame:
    df = pd.read_csv(paths.DATA_REF / "consumption_ratios.csv", comment="#", dtype=str).fillna("")
    df["units_per_case"] = df["units_per_case"].astype(float)
    df["shelf_life_months"] = df["shelf_life_months"].astype(int)
    df["phc_level"] = df["phc_level"] == "1"
    return df


def catalogue(nlem: pd.DataFrame | None = None, hmis_items: pd.DataFrame | None = None) -> pd.DataFrame:
    """Join the curated ratio table to NLEM (for nlem_no and confirmed P level) and HMIS items (for ledger names)."""
    cat = load_ratios()
    if nlem is not None:
        def find(match):
            if not match:
                return None, None
            hay = (nlem["name"] + " " + nlem["dosage"].fillna(""))
            hit = nlem[hay.str.contains(re.escape(match), case=False, regex=True)]
            hit = hit[hit["phc_level"]] if (hit["phc_level"].any()) else hit
            return (hit.iloc[0]["nlem_no"], hit.iloc[0]["phc_level"]) if len(hit) else (None, None)
        found = [find(m) for m in cat["nlem_match"]]
        cat["nlem_no"] = [f[0] for f in found]
        cat["nlem_phc"] = [f[1] for f in found]
    if hmis_items is not None:
        names = hmis_items.set_index("item_code")["item_name"]
        cat["hmis_item_name"] = cat["hmis_item_code"].map(lambda c: names.get(c) if c else None)
        cat["has_real_ledger"] = cat["hmis_item_code"].map(lambda c: bool(c) and c in names.index)
    cat["source"] = cat["hmis_item_code"].map(lambda c: "hmis+simulated" if c else "simulated")
    return cat
