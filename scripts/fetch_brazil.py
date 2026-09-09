"""Brazil node data from the Ministry of Health open API (no key). Pulls Hórus facility-level stock rows for one
state and month range, strips contact fields, maps products to our commodity ids. Cached under data/raw/brazil/."""
import json
import re
import time
from pathlib import Path

import pandas as pd
import requests

from sanjeevani import paths

BASE = "https://apidadosabertos.saude.gov.br"
UA = {"User-Agent": "SanjeevaniGrid/0.1 (hackathon prototype; contact: pavanprabhav1299@gmail.com)"}
RAW = paths.DATA_RAW / "brazil"
UF = 12            # Acre: small state, complete data, fast
MONTHS = ["202608", "202609"]
PAGE = 1000
MAX_PAGES = 8      # per month, about 8,000 rows; enough for a node
KEEP = ["codigo_cnes", "codigo_uf", "codigo_municipio", "nome_municipio", "latitude_estabelecimento_decimo_grau", "longitude_estabelecimento_decimo_grau",
        "codigo_catmat", "descricao_produto", "numero_lote", "data_validade", "quantidade_estoque", "data_posicao_estoque", "anomes_posicao_estoque", "sigla_programa_saude", "tipo_produto"]
PRODUCT_RULES = [  # (regex on descricao_produto, commodity_id)
    (r"SAIS PARA REIDRATA|REIDRATA", "ors"), (r"\bZINCO\b", "zinc_20mg"), (r"ALBENDAZOL", "albendazole_400"), (r"AMOXICILINA", "amoxicillin_500"),
    (r"PARACETAMOL", "paracetamol_500"), (r"METFORMINA", "metformin_500"), (r"ANLODIPINO|AMLODIPINO", "amlodipine_5"), (r"SULFATO FERROSO|FERRO", "ifa_adult"),
    (r"AZITROMICINA", "azithromycin_500"), (r"DOXICICLINA", "doxycycline_100"), (r"CIPROFLOXACINO", "ciprofloxacin_500"), (r"METRONIDAZOL", "metronidazole_400"),
    (r"CLOROQUINA", "chloroquine_250"), (r"PRIMAQUINA", "primaquine"), (r"IBUPROFENO", "ibuprofen_400"), (r"OMEPRAZOL", "omeprazole_20"),
    (r"SALBUTAMOL", "salbutamol_inh"), (r"CARBONATO DE CALCIO|CALCIO", "calcium_500"), (r"OCITOCINA", "oxytocin_inj"), (r"MISOPROSTOL", "misoprostol_200"),
    (r"CETIRIZINA|LORATADINA", "cetirizine_10"), (r"FENITOINA", "phenytoin_100"), (r"GLIBENCLAMIDA|GLIMEPIRIDA", "glimepiride_2"),
]


def get(path, params, cache_name):
    p = RAW / cache_name
    if p.exists():
        return json.loads(p.read_text())
    r = requests.get(f"{BASE}{path}", params=params, headers=UA, timeout=120)
    print(f"GET {path} {params} -> HTTP {r.status_code}", flush=True)
    if r.status_code in (403, 429):
        raise RuntimeError(f"Brazil API returned HTTP {r.status_code}; stopping per policy (report to user)")
    r.raise_for_status()
    time.sleep(1.0)
    RAW.mkdir(parents=True, exist_ok=True)
    p.write_text(r.text)
    return r.json()


def main():
    rows = []
    for m in MONTHS:
        for page in range(MAX_PAGES):
            j = get("/daf/estoque-medicamentos-bnafar-horus", {"codigo_uf": UF, "anomes_posicao_estoque": m, "limit": PAGE, "offset": page * PAGE}, f"horus_uf{UF}_{m}_p{page}.json")
            batch = j.get("parametros", [])
            rows.extend({k: r.get(k) for k in KEEP} for r in batch)
            if len(batch) < PAGE:
                break
    df = pd.DataFrame(rows)
    df["commodity_id"] = None
    for pat, cid in PRODUCT_RULES:
        m = df["descricao_produto"].fillna("").str.upper().str.contains(pat, regex=True)
        df.loc[m & df["commodity_id"].isna(), "commodity_id"] = cid
    for c in ("latitude_estabelecimento_decimo_grau", "longitude_estabelecimento_decimo_grau"):
        df[c] = pd.to_numeric(df[c].astype(str).str.replace(",", "."), errors="coerce")
    df = df.rename(columns={"latitude_estabelecimento_decimo_grau": "lat", "longitude_estabelecimento_decimo_grau": "lon", "codigo_cnes": "cnes",
                            "nome_municipio": "municipality", "quantidade_estoque": "quantity", "data_posicao_estoque": "position_date", "anomes_posicao_estoque": "yyyymm"})
    df["source"] = "brazil_horus_real"
    df.to_parquet(paths.DATA_PROCESSED / "brazil_stock.parquet", index=False)
    ubs = []
    for page in range(3):
        j = get("/assistencia-a-saude/unidade-basicas-de-saude", {"uf": "AC", "limit": 20, "offset": page * 20}, f"ubs_ac_p{page}.json")
        ubs.extend(j.get("ubs", []))
    u = pd.DataFrame(ubs)
    keep = [c for c in ("cnes", "nome", "uf", "ibge", "latitude", "longitude") if c in u.columns]
    u = u[keep].copy()
    for c in ("latitude", "longitude"):
        if c in u:
            u[c] = pd.to_numeric(u[c].astype(str).str.replace(",", "."), errors="coerce")
    u["source"] = "brazil_cnes_real"
    u.to_parquet(paths.DATA_PROCESSED / "brazil_facilities.parquet", index=False)
    print(f"stock rows {len(df):,} | facilities {df['cnes'].nunique()} | months {sorted(df['yyyymm'].unique())} | mapped commodities {df['commodity_id'].notna().sum():,} rows across {df['commodity_id'].nunique()} ids")
    print(df[df["commodity_id"].notna()].groupby("commodity_id").size().sort_values(ascending=False).head(12).to_string())
    print(f"ubs facilities {len(u)}")


if __name__ == "__main__":
    main()
