"""Run the simulator for the 13 demo units -> data/processed/sim_demand.parquet, sim_ledger.parquet,
sim_staff.parquet, sim_beds.parquet. Hero unit (Bihar) gets every commodity; other units get the core set."""
import sys
import time

import pandas as pd

from sanjeevani import paths, simulate, units

CORE = ["ors", "zinc_20mg", "ifa_adult", "albendazole_400", "paracetamol_500", "amoxicillin_500", "act_pf", "chloroquine_250",
        "iv_fluids_rl", "oxytocin_inj", "misoprostol_200", "antirabies_vac", "antisnake_venom", "metformin_500", "amlodipine_5",
        "vac_penta", "vac_opv", "vac_mr", "vac_bcg", "syr_ad_0_5", "cotrimoxazole", "doxycycline_100", "azithromycin_500", "salbutamol_inh"]


def vacancy_rates() -> dict[str, float]:
    """Share of sanctioned posts vacant per state, from RHS 2021 vacancy counts scaled by PHC count (demo-grade)."""
    from sanjeevani import facilities as fac, names
    v = pd.read_csv(paths.DATA_RAW / "datagovin" / "rhs2021_staff_vacancies_by_state.csv")
    v["state"] = v["state_ut"].map(names.canon_state)
    phc = fac.rhs_phc_counts().set_index("state")["phc"]
    out = {}
    for r in v.itertuples(index=False):
        n = phc.get(r.state, 0)
        if n:
            # doctors vacant (DH and below) relative to one MO per PHC plus CHC/DH share; clip to a sane band
            out[r.state] = float(min(0.6, max(0.05, float(r.doctors__dh_and_below_) / (n * 1.6))))
    return out


if __name__ == "__main__":
    t0 = time.time()
    scenario = sys.argv[1] if len(sys.argv) > 1 else "normal"
    fac = pd.read_parquet(paths.DATA_PROCESSED / "facilities.parquet")
    com = pd.read_parquet(paths.DATA_PROCESSED / "commodities.parquet")
    hero = units.demo_units().query("is_hero")["unit_id"].tolist()
    states = sorted(fac["state"].unique())
    drivers = sorted(com["driver_item_code"].unique())
    districts = pd.read_parquet(paths.DATA_PROCESSED / "districts.parquet")
    singles = set(districts.loc[districts["district"] == districts["state"], "state"])
    dd = simulate.district_demand(states, drivers, single_district_states=singles)
    shares = simulate.facility_shares(fac)
    fd = simulate.disaggregate(dd, shares)
    fd.to_parquet(paths.DATA_PROCESSED / "sim_demand.parquet", index=False)
    print(f"facility demand rows: {len(fd):,} ({time.time()-t0:.0f}s)", flush=True)
    parts = []
    for uid in units.demo_units()["unit_id"]:
        f_u = fac[fac["unit_id"] == uid]
        c_u = com if uid in hero else com[com["commodity_id"].isin(CORE)]
        led = simulate.build_ledger(fd[fd["facility_id"].isin(f_u["facility_id"])], f_u, c_u, scenario)
        led["unit_id"] = uid
        parts.append(led)
        print(f"  {uid}: {len(led):,} ledger rows ({time.time()-t0:.0f}s)", flush=True)
    ledger = pd.concat(parts, ignore_index=True)
    ledger.to_parquet(paths.DATA_PROCESSED / "sim_ledger.parquet", index=False)
    months = sorted(fd["month_index"].unique())
    staff, beds = simulate.staff_and_beds(fac, months, vacancy_rates())
    staff.to_parquet(paths.DATA_PROCESSED / "sim_staff.parquet", index=False)
    beds.to_parquet(paths.DATA_PROCESSED / "sim_beds.parquet", index=False)
    print(f"ledger {len(ledger):,} | staff {len(staff):,} | beds {len(beds):,} | stockout rate {ledger.stockout.mean():.3f} ({time.time()-t0:.0f}s)")
