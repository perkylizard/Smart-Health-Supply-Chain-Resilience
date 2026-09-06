"""Facility roster: geocode districts (Nominatim), fetch real PHC/CHC names (Overpass),
scale to RHS PHC counts, fill with clearly-labelled synthetic facilities."""
import json
import math
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from sanjeevani import names, paths, units

UA = {"User-Agent": "SanjeevaniGrid/0.1 (hackathon prototype; contact: pavanprabhav1299@gmail.com)"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"
STATE_QUERY_NAME = {"A & N Islands": "Andaman and Nicobar Islands", "Jammu & Kashmir": "Jammu and Kashmir"}
DISTRICT_QUERY_NAME = {"Leh Ladakh": "Leh", "C S M Nagar": "Amethi", "Kashi Ram Nagar": "Kasganj", "Maunathbhanjan": "Mau",
                       "Hathras": "Hathras", "Cuddapah": "Kadapa", "Vishakapatnam": "Visakhapatnam", "Chhindwada": "Chhindwara",
                       "Singroli": "Singrauli", "Unnav": "Unnao", "Bagpat": "Baghpat", "Karim Nagar": "Karimnagar"}
PHC_RE = re.compile(r"\b(A?PHC|UPHC|CHC|PRIMARY HEALTH|COMMUNITY HEALTH|HEALTH CENTRE|HEALTH CENTER)\b", re.I)


def _cache_path(kind: str, state: str, district: str) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "_", f"{state}_{district}".lower()).strip("_")
    return paths.DATA_RAW / kind / f"{slug}.json"


def geocode_district(state: str, district: str, sleep: float = 1.1) -> dict | None:
    p = _cache_path("nominatim", state, district)
    if p.exists():
        return json.loads(p.read_text())
    q_state = STATE_QUERY_NAME.get(state, state)
    q_dist = DISTRICT_QUERY_NAME.get(district, district)
    q = f"{q_dist} district, {q_state}, India" if district != state else f"{q_state}, India"
    r = requests.get(NOMINATIM, params={"q": q, "format": "json", "limit": 1, "polygon_geojson": 0}, headers=UA, timeout=30)
    time.sleep(sleep)
    if r.status_code != 200 or not r.json():
        r = requests.get(NOMINATIM, params={"q": f"{q_dist}, {q_state}", "format": "json", "limit": 1}, headers=UA, timeout=30)
        time.sleep(sleep)
    if r.status_code != 200 or not r.json():
        p.write_text("null"); return None
    j = r.json()[0]
    out = {"lat": float(j["lat"]), "lon": float(j["lon"]), "bbox": [float(x) for x in j["boundingbox"]], "display": j.get("display_name")}
    p.write_text(json.dumps(out)); return out


def fetch_osm(state: str, district: str, bbox: list[float], sleep: float = 1.0) -> list[dict]:
    """bbox = [south, north, west, east] as returned by Nominatim."""
    p = _cache_path("osm", state, district)
    if p.exists():
        return json.loads(p.read_text())
    s, n, w, e = bbox
    bb = f"({s},{w},{n},{e})"
    q = f"[out:json][timeout:60];(node[healthcare=centre]{bb};way[healthcare=centre]{bb};node[amenity=hospital]{bb};way[amenity=hospital]{bb};node[amenity=clinic]{bb};);out center tags;"
    for attempt in range(3):
        r = requests.post(OVERPASS, data={"data": q}, headers=UA, timeout=120)
        if r.status_code == 200:
            break
        time.sleep(30 * (attempt + 1))
    time.sleep(sleep)
    if r.status_code != 200:
        return []
    out = []
    for el in r.json().get("elements", []):
        t = el.get("tags", {}); name = t.get("name") or t.get("name:en") or ""
        lat = el.get("lat") or el.get("center", {}).get("lat"); lon = el.get("lon") or el.get("center", {}).get("lon")
        if not name or lat is None:
            continue
        out.append({"name": name, "lat": lat, "lon": lon, "healthcare": t.get("healthcare"), "amenity": t.get("amenity"),
                    "district_tag": t.get("addr:district"), "subdistrict": t.get("addr:subdistrict"), "osm_id": el.get("id")})
    p.write_text(json.dumps(out)); return out


def fetch_osm_state(state: str, bbox: list[float], sleep: float = 2.0) -> list[dict]:
    """One Overpass query for a whole state bbox [south, north, west, east]; cached."""
    p = paths.DATA_RAW / "osm" / f"state_{re.sub(r'[^a-z0-9]+', '_', state.lower()).strip('_')}.json"
    if p.exists():
        return json.loads(p.read_text())
    s, n, w, e = bbox
    bb = f"({s},{w},{n},{e})"
    q = (f"[out:json][timeout:180][maxsize:1073741824];(node[healthcare=centre]{bb};way[healthcare=centre]{bb};"
         f"node[amenity=hospital]{bb};way[amenity=hospital]{bb};node[amenity=clinic][name~'PHC|CHC|Health',i]{bb};);out center tags;")
    r = None
    for attempt in range(2):
        try:
            r = requests.post(OVERPASS, data={"data": q}, headers=UA, timeout=300)
        except requests.RequestException as e:
            print(f"overpass {state}: request error {type(e).__name__}", flush=True); r = None; continue
        print(f"overpass {state}: HTTP {r.status_code}, {len(r.content)/1e6:.1f} MB", flush=True)
        if r.status_code in (403, 429):
            raise RuntimeError(f"Overpass returned HTTP {r.status_code} for {state}; stopping per policy (report to user)")
        if r.status_code == 200:
            break
        time.sleep(45)
    time.sleep(sleep)
    if r is None or r.status_code != 200:
        return []
    out = []
    for el in r.json().get("elements", []):
        t = el.get("tags", {}); name = t.get("name") or t.get("name:en") or ""
        lat = el.get("lat") or el.get("center", {}).get("lat"); lon = el.get("lon") or el.get("center", {}).get("lon")
        if not name or lat is None:
            continue
        out.append({"name": name, "lat": lat, "lon": lon, "healthcare": t.get("healthcare"), "amenity": t.get("amenity"),
                    "district_tag": t.get("addr:district"), "subdistrict": t.get("addr:subdistrict"), "osm_id": el.get("id")})
    p.write_text(json.dumps(out)); return out


def assign_to_districts(features: list[dict], geos: dict[str, dict]) -> dict[str, list[dict]]:
    """geos: district -> nominatim dict. A feature goes to the district whose bbox contains it and whose
    centroid is nearest; addr:district tag wins when it matches a known district name."""
    by_norm = {names.norm(d): d for d in geos}
    out = {d: [] for d in geos}
    for f in features:
        tag = f.get("district_tag")
        if tag and names.norm(tag) in by_norm:
            out[by_norm[names.norm(tag)]].append(f); continue
        best, bestd = None, 1e9
        for d, g in geos.items():
            s, n, w, e = g["bbox"]
            if s <= f["lat"] <= n and w <= f["lon"] <= e:
                dist = (f["lat"] - g["lat"]) ** 2 + (f["lon"] - g["lon"]) ** 2
                if dist < bestd:
                    best, bestd = d, dist
        if best:
            out[best].append(f)
    return out


def classify(name: str, tags: dict) -> str | None:
    n = name.upper()
    if re.search(r"\b(HSC|SUB[- ]?CENT|ANM)\b", n):
        return None
    if re.search(r"\b(CHC|COMMUNITY HEALTH)\b", n):
        return "CHC"
    if re.search(r"\b(A?PHC|UPHC|PRIMARY HEALTH)\b", n):
        return "PHC"
    if re.search(r"\b(DISTRICT HOSPITAL|SADAR HOSPITAL|CIVIL HOSPITAL|GENERAL HOSPITAL|DISTT\.? HOSPITAL)\b", n):
        return "DH"
    return None


def rhs_phc_counts() -> pd.DataFrame:
    r = pd.read_csv(paths.DATA_RAW / "datagovin" / "rhs2021-22_phc_shc_dh_by_state.csv")
    r["state"] = r["state_ut"].map(names.canon_state)
    return r.rename(columns={"primary_health_centres__phcs_": "phc", "sub_health_centres__shcs_": "shc", "district_hospitals": "dh"})[["state", "phc", "shc", "dh"]]


def target_counts(state: str, districts: pd.DataFrame) -> pd.Series:
    """PHC target per district = state RHS PHC count split by rural population share (min 1)."""
    rhs = rhs_phc_counts().set_index("state")
    total = int(rhs.loc[state, "phc"]) if state in rhs.index else 0
    d = districts[districts["state"] == state].copy()
    w = d["rural_pop_2011"].astype(float).clip(lower=1)
    alloc = np.floor(total * w / w.sum()).astype(int).clip(lower=1)
    # distribute the rounding remainder to the largest districts
    rem = total - int(alloc.sum())
    if rem > 0:
        for i in w.sort_values(ascending=False).index[:rem]:
            alloc[i] += 1
    return pd.Series(alloc.values, index=d["district"].values)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def build(unit_ids: list[str], districts: pd.DataFrame, seed: int = 7, fetch: bool = True) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for uid in unit_ids:
        u = units.demo_units().set_index("unit_id").loc[uid]
        state = u["state"]
        targets = target_counts(state, districts)
        dlist = units.districts_for(uid, districts)
        geos = {}
        for district in dlist:
            g = geocode_district(state, district) if fetch else (json.loads(_cache_path("nominatim", state, district).read_text()) if _cache_path("nominatim", state, district).exists() else None)
            if g:
                s, n, w, e = g["bbox"]
                if (n - s) < 0.05 or (e - w) < 0.05:
                    g = {**g, "bbox": [g["lat"] - 0.15, g["lat"] + 0.15, g["lon"] - 0.15, g["lon"] + 0.15]}
                geos[district] = g
        if not geos:
            continue
        sb = [min(g["bbox"][0] for g in geos.values()), max(g["bbox"][1] for g in geos.values()),
              min(g["bbox"][2] for g in geos.values()), max(g["bbox"][3] for g in geos.values())]
        feats = fetch_osm_state(state, sb) if fetch else (json.loads((paths.DATA_RAW / "osm" / f"state_{re.sub(r'[^a-z0-9]+', '_', state.lower()).strip('_')}.json").read_text()) if (paths.DATA_RAW / "osm" / f"state_{re.sub(r'[^a-z0-9]+', '_', state.lower()).strip('_')}.json").exists() else [])
        assigned = assign_to_districts(feats, geos)
        for district, geo in geos.items():
            s, n, w, e = geo["bbox"]
            real, seen = [], set()
            for f in assigned.get(district, []):
                kind = classify(f["name"], f)
                key = f["name"].strip().lower()
                if not kind or key in seen:
                    continue
                seen.add(key)
                real.append({"name": f["name"].strip(), "type": kind, "lat": f["lat"], "lon": f["lon"], "block": f.get("subdistrict") or "", "source": "osm"})
            target = int(targets.get(district, 1))
            phc_real = [r for r in real if r["type"] == "PHC"]
            if len(phc_real) > target:
                phc_real.sort(key=lambda r: (0 if re.search(r"\bPHC\b", r["name"].upper()) else 1, r["name"]))
                keep = set(id(r) for r in phc_real[:target])
                real = [r for r in real if r["type"] != "PHC" or id(r) in keep]
            dh_real = [r for r in real if r["type"] == "DH"]
            if len(dh_real) > 1:
                dh_real.sort(key=lambda r: (0 if "DISTRICT" in r["name"].upper() else 1, r["name"]))
                real = [r for r in real if r["type"] != "DH"] + dh_real[:1]
            n_phc_real = sum(1 for r in real if r["type"] == "PHC")
            pop = float(districts.loc[(districts["state"] == state) & (districts["district"] == district), "census_pop_2011"].iloc[0])
            if not any(r["type"] == "DH" for r in real):
                real.append({"name": f"District Hospital {district}", "type": "DH", "lat": geo["lat"], "lon": geo["lon"], "block": "", "source": "simulated"})
            n_chc_target = max(1, round(target / 4))
            n_chc_real = sum(1 for r in real if r["type"] == "CHC")
            for i in range(max(0, n_chc_target - n_chc_real)):
                real.append({"name": f"CHC {district} {i+1}", "type": "CHC", "lat": rng.uniform(s, n), "lon": rng.uniform(w, e), "block": "", "source": "simulated"})
            for i in range(max(0, target - n_phc_real)):
                real.append({"name": f"PHC {district} {i+1}", "type": "PHC", "lat": rng.uniform(s, n), "lon": rng.uniform(w, e), "block": "", "source": "simulated"})
            phcs = [r for r in real if r["type"] == "PHC"]
            share = rng.dirichlet(np.ones(len(phcs)) * 4) if phcs else []
            k = 0
            for r in real:
                if r["type"] == "PHC":
                    r["catchment_pop"] = int(pop * 0.7 * share[k]); k += 1
                elif r["type"] == "CHC":
                    r["catchment_pop"] = int(pop * 0.7 / max(1, n_chc_target))
                else:
                    r["catchment_pop"] = int(pop)
                r["beds"] = {"PHC": int(rng.integers(4, 7)), "CHC": 30, "DH": int(min(500, max(100, pop / 8000)))}[r["type"]]
                r["dist_to_warehouse_km"] = round(haversine_km(r["lat"], r["lon"], geo["lat"], geo["lon"]) * 1.3, 1)
                r.update({"unit_id": uid, "state": state, "district": district, "district_lat": geo["lat"], "district_lon": geo["lon"]})
                rows.append(r)
    df = pd.DataFrame(rows)
    df["facility_id"] = [f"{re.sub(r'[^a-z0-9]+', '-', (r.state + '-' + r.district + '-' + r.type + '-' + r['name']).lower()).strip('-')}-{i}" for i, r in df.iterrows()]
    cols = ["facility_id", "name", "type", "unit_id", "state", "district", "block", "lat", "lon", "catchment_pop", "beds", "dist_to_warehouse_km", "district_lat", "district_lon", "source"]
    return df[cols]
