"""BigQuery: connection check, dataset creation, and upload of the series used for Google forecasting.
Reads GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, BQ_DATASET from .env. Public/simulated data only.

Usage:
  uv run python scripts/bq_setup.py check      # one tiny query, prints project and location
  uv run python scripts/bq_setup.py load       # creates dataset and loads district_monthly + facility_monthly
  uv run python scripts/bq_setup.py load-synthetic   # three more tables, kept apart from the real one: provisional year, synthetic continuation, Brazil node
"""
import os
import sys

import duckdb
import pandas as pd

from sanjeevani import paths


def env():
    vals = {}
    for line in (paths.ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); vals[k.strip()] = v.strip()
    key = paths.ROOT / vals.get("GOOGLE_APPLICATION_CREDENTIALS", "secrets/gcp-sa.json")
    if key.exists():  # service-account key if one exists; otherwise Application Default Credentials from `gcloud auth application-default login`
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(key))
    return vals.get("GCP_PROJECT_ID"), vals.get("BQ_DATASET", "sanjeevani")


def client(project):
    from google.cloud import bigquery
    return bigquery.Client(project=project)


def check(project, dataset):
    c = client(project)
    row = list(c.query("SELECT 1 AS ok, CURRENT_TIMESTAMP() AS ts").result())[0]
    print(f"connected: project={c.project} ok={row.ok} server_time={row.ts}")
    ds = [d.dataset_id for d in c.list_datasets()]
    print(f"datasets: {ds or 'none yet'}")


def load(project, dataset):
    from google.cloud import bigquery
    c = client(project)
    ds_ref = bigquery.Dataset(f"{project}.{dataset}"); ds_ref.location = "asia-south1"  # Mumbai
    c.create_dataset(ds_ref, exists_ok=True)
    con = duckdb.connect(str(paths.DATA / "demo.duckdb"), read_only=True)
    # 1. real district monthly counts for the driver items (all 36 states), as a proper date series
    dm = con.execute("""
        SELECT state, district, item_code, fy, month, value,
               CAST(CASE WHEN month >= 4 THEN CAST(substr(fy,1,4) AS INT) ELSE CAST(substr(fy,1,4) AS INT) + 1 END AS INT) AS year
        FROM hmis_counts_real""").df()
    dm["month_start"] = pd.to_datetime(dict(year=dm["year"], month=dm["month"], day=1))
    dm = dm[["state", "district", "item_code", "month_start", "value"]]
    # 2. simulated facility monthly demand for the hero unit (36 months) and others (12), with the time shift applied
    fm = con.execute("""
        SELECT l.facility_id, f.state, f.district, f.type, l.commodity_id, c.category, c.driver_item_code,
               make_date(l.year, l.month, 1) AS month_start, l.demand, l.closing, l.stockout
        FROM ledger l JOIN facilities f USING (facility_id) JOIN commodities c USING (commodity_id)
        WHERE l.unit_id = (SELECT unit_id FROM units WHERE is_hero = 1)""").df()
    con.close()
    for name, df in (("district_monthly_real", dm), ("facility_monthly_sim", fm)):
        job = c.load_table_from_dataframe(df, f"{project}.{dataset}.{name}", job_config=bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE"))
        job.result()
        print(f"loaded {name}: {len(df):,} rows")


def month_start(fy: pd.Series, month: pd.Series) -> pd.Series:
    """Financial-year label plus calendar month -> first day of that month. FY 2020-21 month 1 is January 2021."""
    y = fy.astype(str).str[:4].astype(int); m = month.astype(int)
    return pd.to_datetime(dict(year=y.where(m >= 4, y + 1), month=m, day=1))


def synthetic_frames() -> dict[str, tuple[pd.DataFrame, str]]:
    """The three extra tables and their descriptions, from files on disk. Every row of the two simulated tables carries source='simulated'."""
    led = pd.read_parquet(paths.DATA_PROCESSED / "hmis_ledger.parquet")
    prov = led[led.get("provisional", False) == True].copy()  # noqa: E712
    prov["month_start"] = month_start(prov["fy"], prov["month"])
    prov = prov[["state", "district", "item_code", "item_name", "month_start", "opening", "received", "unusable", "distributed", "closing"]].assign(provisional=True)
    syn = pd.read_parquet(paths.DATA_PROCESSED / "hmis_ledger_synth.parquet")
    syn["month_start"] = month_start(syn["fy"], syn["month"])
    syn = syn[["state", "district", "item_code", "item_name", "month_start", "demand", "opening", "received", "unusable", "distributed", "closing", "stockout", "source", "basis_fy"]]
    br = pd.read_parquet(paths.DATA_PROCESSED / "brazil_synth_ledger.parquet")
    br["month_start"] = pd.to_datetime(dict(year=br["year"].astype(int), month=br["month"].astype(int), day=1))
    br = br.rename(columns={"state": "uf"})[["facility_id", "commodity_id", "uf", "district", "region", "month_start", "demand", "received", "distributed", "closing", "stockout", "days_of_stock", "lead_days", "source"]]
    return {
        "district_monthly_provisional": (prov, "REAL. HMIS district stock ledger FY 2020-21 for 16 states, labelled provisional by MoHFW (GODL). Kept apart from district_monthly_real."),
        "district_monthly_synthetic": (syn, "SIMULATED. Synthetic continuation of each real district x commodity stock series to March 2026, generated by scripts/synth_hmis_extend.py. Not actual stock."),
        "brazil_synthetic": (br, "SIMULATED. Brazil federated partner node: 27 UFs, generated by scripts/synth_brazil_ledger.py, shaped on the public BNAFAR/Hórus record structure. Nothing fetched."),
    }


def load_synthetic(project, dataset):
    from google.cloud import bigquery
    c = client(project)
    for name, (df, desc) in synthetic_frames().items():
        ref = f"{project}.{dataset}.{name}"
        c.load_table_from_dataframe(df, ref, job_config=bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE")).result()
        t = c.get_table(ref); t.description = desc; c.update_table(t, ["description"])
        print(f"loaded {name}: {len(df):,} rows | {desc[:40]}")


if __name__ == "__main__":
    project, dataset = env()
    if not project:
        sys.exit("GCP_PROJECT_ID missing in .env")
    adc = os.path.expanduser("~/.config/gcloud/application_default_credentials.json")
    if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ and not os.path.exists(adc):
        sys.exit("no credentials: run `gcloud auth application-default login` (or place a service-account key at secrets/gcp-sa.json)")
    {"check": check, "load": load, "load-synthetic": load_synthetic}[sys.argv[1] if len(sys.argv) > 1 else "check"](project, dataset)
