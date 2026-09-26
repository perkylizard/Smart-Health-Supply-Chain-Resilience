"""With-versus-without evaluation (task A1): replay every demo unit's 36-month ledger with the redistribution engine
active each month, under every scenario that applies to the unit, and count stock-out facility-months avoided.
Writes data/processed/counterfactual.parquet (one row per unit x scenario x district, plus a unit total row) and a
table into README between counterfactual markers. Runs (unit, scenario) jobs in parallel processes."""
import json
import re
import sys
import time
from multiprocessing import Pool

import pandas as pd

sys.path.insert(0, "backend")
from sanjeevani import paths, units  # noqa: E402
from sanjeevani.engines import counterfactual as CF  # noqa: E402

CORE = ["ors", "zinc_20mg", "ifa_adult", "albendazole_400", "paracetamol_500", "amoxicillin_500", "act_pf", "chloroquine_250",
        "iv_fluids_rl", "oxytocin_inj", "misoprostol_200", "antirabies_vac", "antisnake_venom", "metformin_500", "amlodipine_5",
        "vac_penta", "vac_opv", "vac_mr", "vac_bcg", "syr_ad_0_5", "cotrimoxazole", "doxycycline_100", "azithromycin_500", "salbutamol_inh"]
WORKERS = 4
_G = {}


def _init():
    _G["fac"] = pd.read_parquet(paths.DATA_PROCESSED / "facilities.parquet")
    _G["com"] = pd.read_parquet(paths.DATA_PROCESSED / "commodities.parquet")
    _G["fd"] = pd.read_parquet(paths.DATA_PROCESSED / "sim_demand.parquet")
    _G["hero"] = set(units.demo_units().query("is_hero")["unit_id"])


def _job(args):
    uid, scenario = args
    t0 = time.time()
    fac, com, fd = _G["fac"], _G["com"], _G["fd"]
    f_u = fac[fac["unit_id"] == uid]
    c_u = com if uid in _G["hero"] else com[com["commodity_id"].isin(CORE)]
    res = CF.run(fd[fd["facility_id"].isin(f_u["facility_id"])], f_u, c_u, scenario)
    tab = CF.compare(res, f_u, uid, scenario)
    t = tab[tab["district"] == CF.UNIT_TOTAL].iloc[0]
    print(f"  {uid:18s} {scenario:16s} without={t.stockout_months_without:6d} with={t.stockout_months_with:6d} "
          f"avoided={t.avoided:5d} ({t.avoided_pct:.1%}) transfers={t.transfers:6d} {time.time() - t0:.0f}s", flush=True)
    return tab


def readme_block(df: pd.DataFrame) -> str:
    tot = df[df["district"] == CF.UNIT_TOTAL]
    rows = ["| Scenario | Units | Facility-months | Stock-out months without | With monthly transfers | Avoided | Transfers |", "|---|---|---|---|---|---|---|"]
    for sc, g in tot.groupby("scenario", sort=False):
        w, x = int(g["stockout_months_without"].sum()), int(g["stockout_months_with"].sum())
        rows.append(f"| {sc} | {len(g)} | {int(g['facility_months'].sum()):,} | {w:,} | {x:,} | {w - x:,} ({(w - x) / max(w, 1):.1%}) | {int(g['transfers'].sum()):,} |")
    rows += ["", "| Unit (normal scenario) | Facility-months | Without | With | Avoided | Transfers |", "|---|---|---|---|---|---|"]
    for r in tot[tot["scenario"] == "normal"].sort_values("avoided", ascending=False).itertuples(index=False):
        rows.append(f"| {r.unit_id} | {r.facility_months:,} | {r.stockout_months_without:,} | {r.stockout_months_with:,} | {r.avoided:,} ({r.avoided_pct:.1%}) | {r.transfers:,} |")
    return "\n".join(rows)


def main():
    t0 = time.time()
    scenarios = json.loads((paths.DATA_SCENARIOS / "scenarios.json").read_text())
    unit_ids = units.demo_units()["unit_id"].tolist()
    only = sys.argv[1:]  # optional unit ids to restrict the run
    todo = [j for j in CF.jobs(unit_ids, scenarios) if not only or j[0] in only]
    # biggest jobs first so the pool stays busy
    weight = {u: n for u, n in pd.read_parquet(paths.DATA_PROCESSED / "facilities.parquet").groupby("unit_id").size().items()}
    todo.sort(key=lambda j: -weight.get(j[0], 0))
    print(f"{len(todo)} unit x scenario jobs on {WORKERS} workers", flush=True)
    with Pool(WORKERS, initializer=_init) as pool:
        tabs = pool.map(_job, todo, chunksize=1)
    df = pd.concat(tabs, ignore_index=True)
    df["produced"] = pd.Timestamp.today().strftime("%Y-%m-%d")
    df["source"] = "simulated"
    out = paths.DATA_PROCESSED / "counterfactual.parquet"
    if only and out.exists():  # partial run: replace only the rerun units
        old = pd.read_parquet(out)
        df = pd.concat([old[~old["unit_id"].isin(only)], df], ignore_index=True)
    df.to_parquet(out, index=False)
    table = readme_block(df)
    readme = (paths.ROOT / "README.md").read_text()
    block = f"<!-- counterfactual:start -->\n{table}\n<!-- counterfactual:end -->"
    if "<!-- counterfactual:start -->" in readme:
        readme = re.sub(r"<!-- counterfactual:start -->.*?<!-- counterfactual:end -->", block, readme, flags=re.S)
    else:
        intro = ("\n\n### With versus without redistribution\n\n"
                 "Produced by `uv run python scripts/counterfactual.py`. The simulated 36-month ledger is replayed twice per unit and scenario with the same "
                 "random draws: once as is, and once with the redistribution engine (`backend/sanjeevani/engines/redistribute.py`) run every month. "
                 "Each month, once deliveries are known and before the month's demand is served, facilities that cannot cover the month are topped up "
                 "from facilities in the same district with more than a month of stock, within 80 km. A stock-out facility-month is one facility, "
                 "one commodity, one month with demand above stock on hand. Stock-outs that remain are mostly surge months when a whole district runs short at once.\n\n")
        readme = readme.rstrip("\n") + intro + block + "\n"
    (paths.ROOT / "README.md").write_text(readme)
    print(table)
    print(f"done in {(time.time() - t0) / 60:.1f} min -> {out}")


if __name__ == "__main__":
    main()
