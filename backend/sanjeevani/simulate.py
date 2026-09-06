"""Facility-level simulator: disaggregate real district HMIS counts to facilities, derive commodity demand
through consumption ratios, and run a monthly stock ledger with scenario multipliers.
All outputs carry source='simulated' except where noted."""
import json

import duckdb
import numpy as np
import pandas as pd

from sanjeevani import paths

FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
FY_BASE = {"2017-18": 0, "2018-19": 1, "2019-20": 2}
SHIFT_YEARS = 7  # 2017-18 plays as 2024-25
NOISE_SIGMA = 0.15
BASE_MISS_PROB = 0.08
BASE_LEAD_DAYS = {"PHC": 10, "CHC": 7, "DH": 4}


def month_index(fy: str, month: int) -> int:
    return FY_BASE[fy] * 12 + FY_MONTH_ORDER.index(int(month))


def calendar_of(mi: int) -> tuple[int, int]:
    """month_index -> (year, month) after the time shift."""
    fy_off, pos = divmod(int(mi), 12)
    m = FY_MONTH_ORDER[pos]
    y = 2017 + SHIFT_YEARS + fy_off + (1 if m <= 3 else 0)
    return y, m


def facility_shares(facilities: pd.DataFrame) -> pd.DataFrame:
    f = facilities[facilities["type"].isin(["PHC", "CHC"])].copy()
    f["w"] = f["catchment_pop"].astype(float).clip(lower=1)
    f["share"] = f["w"] / f.groupby(["state", "district"])["w"].transform("sum")
    return f[["facility_id", "state", "district", "type", "share"]]


def district_demand(states: list[str], driver_codes: list[str], parquet=None) -> pd.DataFrame:
    parquet = parquet or paths.DATA_PROCESSED / "hmis_c2.parquet"
    con = duckdb.connect()
    st = ",".join(f"'{s}'" for s in states); dr = ",".join(f"'{c}'" for c in driver_codes)
    df = con.execute(
        f"""SELECT state, district, fy, month, item_code, value FROM '{parquet}'
            WHERE state IN ({st}) AND item_code IN ({dr}) AND measure='Total'
              AND lower(district) <> lower(state)"""
    ).df()
    con.close()
    df["month_index"] = [month_index(f, m) for f, m in zip(df["fy"], df["month"])]
    return df


def disaggregate(dd: pd.DataFrame, shares: pd.DataFrame, seed: int = 7) -> pd.DataFrame:
    """Split district monthly counts across facilities by share x lognormal noise; district totals preserved."""
    rng = np.random.default_rng(seed)
    m = dd.merge(shares, on=["state", "district"], how="inner")
    noise = rng.lognormal(0.0, NOISE_SIGMA, size=len(m))
    m["raw"] = m["value"] * m["share"] * noise
    tot = m.groupby(["state", "district", "month_index", "item_code"])["raw"].transform("sum")
    m["value"] = np.where(tot > 0, m["raw"] * m["value"] / tot, 0.0)
    return m[["facility_id", "state", "district", "type", "month_index", "item_code", "value"]]


def scenario_rules(name: str, intensity: float = 1.0) -> dict:
    sc = json.loads((paths.DATA_SCENARIOS / "scenarios.json").read_text())[name]
    rules = []
    for r in sc.get("rules", []):
        rules.append({**r, "demand_mult": 1 + (r["demand_mult"] - 1) * intensity,
                      "miss_prob_add": r["miss_prob_add"] * intensity, "lead_days_add": r["lead_days_add"] * intensity})
    return {"units": sc.get("units"), "rules": rules}


def _rule_applies(rule, category, driver, cal_month):
    return (cal_month in rule["months"]) and ("*" in rule["categories"] or category in rule["categories"]) \
        and ("*" in rule["drivers"] or driver in rule["drivers"])


def build_ledger(fac_demand: pd.DataFrame, facilities: pd.DataFrame, commodities: pd.DataFrame,
                 scenario: str = "normal", intensity: float = 1.0, seed: int = 7) -> pd.DataFrame:
    """Monthly ledger per facility x commodity over all month_index values present in fac_demand."""
    rng = np.random.default_rng(seed)
    sc = scenario_rules(scenario, intensity)
    fac = facilities.set_index("facility_id")
    months = sorted(fac_demand["month_index"].unique())
    piv = fac_demand.pivot_table(index=["facility_id", "item_code"], columns="month_index", values="value", aggfunc="sum").fillna(0.0)
    out = []
    for _, c in commodities.iterrows():
        drv = c["driver_item_code"]
        if drv not in set(piv.index.get_level_values("item_code")):
            continue
        d = piv.xs(drv, level="item_code")
        d = d.reindex(columns=months, fill_value=0.0)
        fids = d.index.values
        if len(fids) == 0:
            continue
        unit_ids = fac.loc[fids, "unit_id"].values
        ftype = fac.loc[fids, "type"].values
        base_demand = d.values * float(c["units_per_case"])
        n = len(fids)
        demand_mult = np.ones_like(base_demand); miss_add = np.zeros_like(base_demand); lead_add = np.zeros_like(base_demand)
        for j, mi in enumerate(months):
            _, cal_m = calendar_of(mi)
            for r in sc["rules"]:
                if _rule_applies(r, c["category"], drv, cal_m):
                    mask = np.ones(n, bool) if not sc["units"] else np.isin(unit_ids, sc["units"])
                    demand_mult[mask, j] *= r["demand_mult"]; miss_add[mask, j] += r["miss_prob_add"]; lead_add[mask, j] += r["lead_days_add"]
        demand = base_demand * demand_mult
        opening = np.maximum(demand[:, 0] * 2.0, 0.0)
        hist = []
        for j in range(len(months)):
            recent = np.mean(np.stack(hist[-3:] + [demand[:, j]]), axis=0) if hist else demand[:, j]
            indent = np.round(recent * 1.2)
            missed = rng.random(n) < np.clip(BASE_MISS_PROB + miss_add[:, j], 0, 0.98)
            received = np.where(missed, 0.0, indent)
            unusable = np.round(opening * rng.uniform(0.0, 0.02, n))
            available = np.maximum(opening + received - unusable, 0.0)
            distributed = np.minimum(demand[:, j], available)
            closing = available - distributed
            stockout = demand[:, j] > available
            daily = np.maximum(demand[:, j] / 30.0, 1e-6)
            dos = np.minimum(closing / daily, 365.0)
            lead = np.array([BASE_LEAD_DAYS[t] for t in ftype]) + lead_add[:, j]
            y, m = calendar_of(months[j])
            out.append(pd.DataFrame({
                "facility_id": fids, "commodity_id": c["commodity_id"], "month_index": months[j], "year": y, "month": m,
                "demand": np.round(demand[:, j], 1), "opening": np.round(opening, 1), "received": received,
                "unusable": unusable, "distributed": np.round(distributed, 1), "closing": np.round(closing, 1),
                "stockout": stockout, "days_of_stock": np.round(dos, 1), "lead_days": np.round(lead, 1),
                "scenario": scenario, "source": "simulated",
            }))
            hist.append(demand[:, j]); opening = closing
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def staff_and_beds(facilities: pd.DataFrame, months: list[int], vacancy_rate: dict[str, float], seed: int = 7) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Simulated monthly staff attendance and bed occupancy. vacancy_rate: state -> share of sanctioned posts vacant."""
    rng = np.random.default_rng(seed)
    sanctioned = {"PHC": {"medical_officer": 1, "pharmacist": 1, "staff_nurse": 2, "lab_technician": 1},
                  "CHC": {"medical_officer": 4, "pharmacist": 2, "staff_nurse": 8, "lab_technician": 2},
                  "DH": {"medical_officer": 20, "pharmacist": 6, "staff_nurse": 60, "lab_technician": 8}}
    srows, brows = [], []
    for f in facilities.itertuples(index=False):
        vac = vacancy_rate.get(f.state, 0.25)
        for cadre, n in sanctioned[f.type].items():
            in_pos = int(rng.binomial(n, 1 - vac)) if n > 1 else int(rng.random() > vac)
            for mi in months:
                y, m = calendar_of(mi)
                present = int(rng.binomial(26, 0.86)) if in_pos > 0 else 0
                srows.append((f.facility_id, cadre, mi, y, m, n, in_pos, present, "simulated"))
        occ_base = {"PHC": 0.35, "CHC": 0.55, "DH": 0.8}[f.type]
        for mi in months:
            y, m = calendar_of(mi)
            occ = float(np.clip(rng.normal(occ_base + (0.1 if m in (7, 8, 9) else 0), 0.1), 0.05, 1.0))
            brows.append((f.facility_id, mi, y, m, int(f.beds), int(round(f.beds * occ)), "simulated"))
    staff = pd.DataFrame(srows, columns=["facility_id", "cadre", "month_index", "year", "month", "sanctioned", "in_position", "days_present", "source"])
    beds = pd.DataFrame(brows, columns=["facility_id", "month_index", "year", "month", "beds", "occupied", "source"])
    return staff, beds
