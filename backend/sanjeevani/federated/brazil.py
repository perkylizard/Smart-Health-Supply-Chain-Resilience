"""Simulated Brazil node, shaped on the public BNAFAR/Hórus sample structure; no facility data fetched.

Generates a 36-month facility x commodity stock ledger for the 27 Brazilian federative units (UFs), the same
shape the India simulator produces, so the federated pipeline in nodes.py can build one node per UF.
Everything here is synthetic: facility ids, municipality names, demand and stock. Real inputs are limited to the
list of UFs with approximate 2022 populations (hand-entered, rounded) and generic product descriptions of the
kind seen in the public Hórus sample (paracetamol 500 mg, dipirona 500 mg, ...).

Structure that makes the node Brazilian rather than India relabelled:
- dengue season January to May raises antipyretic and rehydration demand in the North and Northeast, with a
  stronger epidemic year in the second year of the series;
- Amazon-basin states (AM, PA, AC, RR, AP, RO) have long, variable delivery lead times and more missed deliveries;
- the South (RS, SC, PR) has a mild winter respiratory surge, June to August.
Stock-outs arise from the same mechanics as the India simulator: demand against opening stock plus deliveries
that are ordered up to a target and sometimes arrive late or not at all.
"""
import numpy as np
import pandas as pd

SOURCE = "simulated"

# (code, sigla, region, approximate 2022 population in millions; rounded, IBGE census order of magnitude)
UFS = [
    (12, "AC", "N", 0.8), (27, "AL", "NE", 3.1), (16, "AP", "N", 0.7), (13, "AM", "N", 3.9), (29, "BA", "NE", 14.1),
    (23, "CE", "NE", 8.8), (53, "DF", "CO", 2.8), (32, "ES", "SE", 3.8), (52, "GO", "CO", 7.1), (21, "MA", "NE", 6.8),
    (51, "MT", "CO", 3.7), (50, "MS", "CO", 2.8), (31, "MG", "SE", 20.5), (15, "PA", "N", 8.1), (25, "PB", "NE", 4.0),
    (41, "PR", "S", 11.4), (26, "PE", "NE", 9.1), (22, "PI", "NE", 3.3), (33, "RJ", "SE", 16.1), (24, "RN", "NE", 3.3),
    (43, "RS", "S", 10.9), (11, "RO", "N", 1.6), (14, "RR", "N", 0.6), (42, "SC", "S", 7.6), (35, "SP", "SE", 44.4),
    (28, "SE", "NE", 2.2), (17, "TO", "N", 1.5),
]
AMAZON = {"AM", "PA", "AC", "RR", "AP", "RO"}
SOUTH = {"RS", "SC", "PR"}
DENGUE_REGIONS = {"N", "NE"}

# commodity_id, generic description (as in the Hórus sample), category, base monthly demand per facility (units)
COMMODITIES = [
    ("br_paracetamol_500", "PARACETAMOL 500 MG COMPRIMIDO", "antipyretic", 900),
    ("br_dipirona_500", "DIPIRONA SÓDICA 500 MG COMPRIMIDO", "antipyretic", 1100),
    ("br_ibuprofeno_600", "IBUPROFENO 600 MG COMPRIMIDO", "antipyretic", 600),
    ("br_sro", "SAIS PARA REIDRATAÇÃO ORAL ENVELOPE", "rehydration", 120),
    ("br_soro_fisiologico_500", "CLORETO DE SÓDIO 0,9 % SOLUÇÃO INJETÁVEL 500 ML", "rehydration", 80),
    ("br_amoxicilina_500", "AMOXICILINA 500 MG CÁPSULA", "antibiotic", 500),
    ("br_azitromicina_500", "AZITROMICINA 500 MG COMPRIMIDO", "antibiotic", 150),
    ("br_cefalexina_500", "CEFALEXINA 500 MG COMPRIMIDO", "antibiotic", 400),
    ("br_doxiciclina_100", "DOXICICLINA 100 MG COMPRIMIDO", "antibiotic", 120),
    ("br_metformina_500", "METFORMINA, CLORIDRATO 500 MG COMPRIMIDO", "chronic", 2500),
    ("br_enalapril_5", "ENALAPRIL, MALEATO 5 MG COMPRIMIDO", "chronic", 1200),
    ("br_anlodipino_10", "ANLODIPINO, BESILATO 10 MG COMPRIMIDO", "chronic", 900),
    ("br_sinvastatina_20", "SINVASTATINA 20 MG COMPRIMIDO", "chronic", 1000),
    ("br_salbutamol_aerossol", "SALBUTAMOL, SULFATO 100 MCG/DOSE AEROSSOL 200 DOSES", "respiratory", 40),
    ("br_loratadina_xarope", "LORATADINA 1 MG/ML XAROPE 100 ML", "respiratory", 60),
]
MONTHS = 36


def facilities_per_uf(pop_millions: float) -> int:
    """Roughly 30 to 150 primary care units per UF node, scaled by population (a small sample, not the real count)."""
    return int(np.clip(30 + 3 * pop_millions, 30, 150))


def _season(month: np.ndarray, region: np.ndarray, category: np.ndarray, epidemic_year: np.ndarray) -> np.ndarray:
    """Multiplicative seasonal factor per (facility, commodity, month)."""
    m = month.astype(float)
    dengue = 1.0 + 0.6 * np.clip(np.sin(np.pi * (m - 0.5) / 5.0), 0, None) * (m <= 5)      # Jan..May, peak March
    dengue = np.where(epidemic_year, 1.0 + (dengue - 1.0) * 2.2, dengue)
    dengue_hit = np.isin(region, list(DENGUE_REGIONS)) & np.isin(category, ["antipyretic", "rehydration"])
    winter = 1.0 + 0.4 * np.isin(m, [6, 7, 8])
    winter_hit = (region == "S") & np.isin(category, ["respiratory", "antibiotic"])
    f = np.ones_like(m)
    f = np.where(dengue_hit, dengue, f)
    f = np.where(winter_hit, winter, f)
    return f


def generate(seed: int = 21, months: int = MONTHS) -> pd.DataFrame:
    """Deterministic synthetic ledger: one row per facility x commodity x month."""
    rng = np.random.default_rng(seed)
    fac_rows = []
    for code, uf, region, pop in UFS:
        n = facilities_per_uf(pop)
        n_mun = max(3, int(np.ceil(n / 4)))
        for k in range(n):
            fac_rows.append((f"BR-{uf}-{k + 1:03d}", uf, code, region, f"Município {uf}-{(k % n_mun) + 1:02d}"))
    fac = pd.DataFrame(fac_rows, columns=["facility_id", "state", "uf_code", "region", "district"])
    nf, nc = len(fac), len(COMMODITIES)
    com = pd.DataFrame(COMMODITIES, columns=["commodity_id", "description", "category", "base"])

    # per facility x commodity constants
    size = np.exp(rng.normal(0.0, 0.45, nf))[:, None]                     # facility scale
    base = com["base"].to_numpy(float)[None, :] * size * np.exp(rng.normal(0.0, 0.2, (nf, nc)))
    amazon = fac["state"].isin(AMAZON).to_numpy()
    lead_base = np.where(amazon, rng.uniform(18, 32, nf), rng.uniform(5, 14, nf))[:, None] * np.ones((1, nc))
    miss_p = np.where(amazon, 0.16, 0.07)[:, None] * np.ones((1, nc))
    target_cover = rng.uniform(1.3, 1.9, (nf, nc))                        # months of demand the order-up-to policy aims for
    region = np.repeat(fac["region"].to_numpy()[:, None], nc, axis=1)
    category = np.repeat(com["category"].to_numpy()[None, :], nf, axis=0)

    closing = base * rng.uniform(0.6, 1.6, (nf, nc))
    hist = np.zeros((3, nf, nc)) + base
    out = []
    for mi in range(months):
        month = (mi % 12) + 1
        epidemic = np.full((nf, nc), 12 <= mi < 24)
        season = _season(np.full((nf, nc), month), region, category, epidemic)
        shock = np.exp(rng.normal(0.0, 0.25, (nf, nc)))
        demand = np.round(base * season * shock)
        forecast = hist.mean(axis=0)
        lead = np.clip(lead_base + rng.normal(0, 3.0, (nf, nc)), 2, 45)
        target = forecast * (target_cover + lead / 30.0)
        delivered = rng.random((nf, nc)) >= miss_p
        received = np.where(delivered, np.maximum(0.0, target - closing), 0.0)
        available = closing + received
        stockout = demand > available
        distributed = np.minimum(demand, available)
        closing = available - distributed
        dos = np.where(demand > 0, closing / demand * 30.0, 120.0)
        out.append(pd.DataFrame({
            "facility_id": np.repeat(fac["facility_id"].to_numpy(), nc),
            "commodity_id": np.tile(com["commodity_id"].to_numpy(), nf),
            "state": np.repeat(fac["state"].to_numpy(), nc),
            "district": np.repeat(fac["district"].to_numpy(), nc),
            "region": np.repeat(fac["region"].to_numpy(), nc),
            "month_index": mi, "month": month, "year": 2024 + mi // 12,
            "demand": demand.ravel(), "received": received.ravel(), "distributed": distributed.ravel(),
            "closing": np.round(closing.ravel(), 1), "stockout": stockout.ravel(),
            "days_of_stock": np.round(np.clip(dos.ravel(), 0, 120), 1), "lead_days": np.round(lead.ravel(), 1),
            "source": SOURCE,
        }))
        hist = np.concatenate([hist[1:], demand[None]], axis=0)
    df = pd.concat(out, ignore_index=True)
    df["month_index"] = df["month_index"].astype("int16"); df["month"] = df["month"].astype("int8"); df["year"] = df["year"].astype("int16")
    for c in ("demand", "received", "distributed", "closing", "days_of_stock", "lead_days"):
        df[c] = df[c].astype("float32")
    return df
