"""Canonical state and district names. HMIS spelling is canonical; other sources map to it."""
import csv
import re
from functools import lru_cache

from sanjeevani import paths

STATE_ALIASES = {
    "andaman & nicobar islands": "A & N Islands", "andaman and nicobar islands": "A & N Islands",
    "a & n islands": "A & N Islands", "a and n islands": "A & N Islands",
    "jammu and kashmir": "Jammu & Kashmir", "jammu & kashmir": "Jammu & Kashmir",
    "chattisgarh": "Chhattisgarh", "orissa": "Odisha", "pondicherry": "Puducherry",
    "dadra and nagar haveli": "Dadra & Nagar Haveli", "daman and diu": "Daman & Diu",
    "nct of delhi": "Delhi", "ladakh": "Ladakh",
}
STATE_CANON = ["A & N Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
               "Dadra & Nagar Haveli", "Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
               "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
               "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
               "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"]


def norm(s: str) -> str:
    s = str(s).lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@lru_cache(maxsize=1)
def _overrides() -> dict:
    out = {}
    with open(paths.DATA_REF / "name_overrides.csv", newline="") as f:
        for r in csv.DictReader(f):
            out[(canon_state(r["state"]), r["source"], norm(r["source_name"]))] = r["canonical_name"]
    return out


def canon_state(s: str) -> str:
    n = norm(s)
    if n in STATE_ALIASES:
        return STATE_ALIASES[n]
    for c in STATE_CANON:
        if norm(c) == n:
            return c
    return str(s).strip()


def canon_district(state: str, district: str, source: str, known: set[str] | None = None) -> str:
    """Map a source district name to HMIS spelling. `known` (HMIS names for the state) enables
    case-insensitive matching; otherwise the input is returned trimmed after override lookup."""
    st = canon_state(state)
    key = (st, source, norm(district))
    if key in _overrides():
        return _overrides()[key]
    d = str(district).strip()
    if known:
        for k in known:
            if norm(k) == norm(d):
                return k
    return d
