"""Pull selected data.gov.in resources to data/raw/datagovin/ as CSV + JSON metadata.

Usage: python3 scripts/fetch_datagovin.py
Reads DATA_GOV_IN_API_KEY from .env in the project root. Public data, GODL licence.
"""
import csv, json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "datagovin")

RESOURCES = {
    "nfhs5_district_factsheets":        "cf80173e-fece-439d-a0b1-6e9cb510593d",
    "nfhs5_state_factsheets":           "7c568619-b9b4-40bb-b563-68c28c27a6c1",
    "rhs2021-22_phc_shc_dh_by_state":   "f1cd67be-1623-4e43-8410-d71bea7ba11d",
    "rhs2020-21_phc_chc_rural_urban":   "4e3c855c-c10c-479e-ae6e-187bfed35ac1",
    "rhs2021_staff_vacancies_by_state": "782c19ad-5833-4745-95b2-31656af47bed",
    "karnataka_phc_non24x7_list":       "b92fda75-7373-40d3-96ba-67e2f352a5e8",
    "karnataka_chc_list":               "b9afe1e5-d1c5-4b41-a736-881c97d32397",
    "hmis_itemwise_bihar_2018-19":      "56fb250a-c59d-49a2-b752-e80c03c14678",
    "hmis_itemwise_arunachal_2017-18":  "fe988af6-5465-4909-94d6-998e1186cedd",
    "hmis_itemwise_arunachal_2018-19":  "df2d51ea-8fca-4581-bace-01fa78da65e6",
    "hmis_itemwise_assam_2017-18":      "acadd432-bdf8-4ea8-8c6e-78854df4bfd4",
    "hmis_itemwise_assam_2018-19":      "97275aa3-e607-4256-87aa-856b34f64854",
    "hmis_itemwise_bihar_2017-18":      "be1bb3aa-567a-4a5c-860a-100cd89ca437",
    "hmis_itemwise_jk_2017-18":         "ccc4ee97-2533-4c62-94f5-ca2bb353b9bd",
    "hmis_itemwise_jk_2018-19":         "c66c0448-bc68-4e02-9d08-f6be029b8f54",
    "hmis_itemwise_karnataka_2017-18":  "6d2cad3a-97f6-4ac8-b9ab-30b89413cfd6",
    "hmis_itemwise_karnataka_2018-19":  "5d6f6798-a380-47aa-8e27-7b76f50fcd30",
    "hmis_itemwise_kerala_2017-18":     "e8626a23-a635-4a4f-9ca1-b20dd41131ba",
    "hmis_itemwise_kerala_2018-19":     "7456b69a-00d5-4fb8-b751-1926f1355e20",
    "hmis_itemwise_rajasthan_2017-18":  "6d9d4536-ca11-48ee-bf6f-890387edc544",
    "hmis_itemwise_rajasthan_2018-19":  "e395f7a9-12b4-4d94-bd70-60a2e869fd5a",
    "hmis_itemwise_up_2017-18":         "cdd0116d-03a7-4120-8940-457a0309d15e",
    "hmis_itemwise_up_2018-19":         "31e0dcc3-f9fb-4d4c-9d19-11dac7997644",
    "hmis_itemwise_allindia_2019-20":   "e086e5ef-03ef-42ce-8302-d93d1fc7d30b",
}

def load_key():
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            if line.startswith("DATA_GOV_IN_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("DATA_GOV_IN_API_KEY not found in .env")

def fetch(rid, key, limit=250):
    records, offset, meta = [], 0, None
    while True:
        url = f"https://api.data.gov.in/resource/{rid}?api-key={key}&format=json&limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        for attempt in range(3):
            try:
                d = json.load(urllib.request.urlopen(req, timeout=120)); break
            except Exception as e:
                if attempt == 2: raise
                time.sleep(3 * (attempt + 1))
        if meta is None:
            meta = {k: d.get(k) for k in ("title", "desc", "org", "sector", "source", "updated_date", "created_date", "total", "field")}
        batch = d.get("records", [])
        records.extend(batch)
        if not batch or len(records) >= int(d.get("total") or 0): break
        offset += limit
        time.sleep(0.5)
    return meta, records

def main():
    key = load_key()
    os.makedirs(OUT, exist_ok=True)
    log = []
    for name, rid in RESOURCES.items():
        if os.path.exists(os.path.join(OUT, name + ".csv")):
            print(f"SKIP {name}: already downloaded"); log.append((name, rid, "SKIP", "exists")); continue
        try:
            meta, recs = fetch(rid, key)
        except Exception as e:
            print(f"FAIL {name}: {type(e).__name__}: {e}"); log.append((name, rid, "FAIL", str(e)[:120])); continue
        cols = []
        for r in recs:
            for k in r:
                if k not in cols: cols.append(k)
        with open(os.path.join(OUT, name + ".csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(recs)
        with open(os.path.join(OUT, name + ".meta.json"), "w") as f:
            json.dump({"resource_id": rid, "url": f"https://api.data.gov.in/resource/{rid}", "licence": "Government Open Data License - India (GODL)", "retrieved": time.strftime("%Y-%m-%d"), **meta}, f, indent=1)
        print(f"OK   {name}: {len(recs)} rows x {len(cols)} cols | updated {meta.get('updated_date')} | {str(meta.get('title'))[:70]}")
        log.append((name, rid, "OK", f"{len(recs)} rows"))
    with open(os.path.join(OUT, "SOURCES.txt"), "w") as f:
        f.write("data.gov.in pulls, GODL licence, retrieved " + time.strftime("%Y-%m-%d") + "\n")
        for l in log: f.write(" | ".join(l) + "\n")

if __name__ == "__main__":
    main()
