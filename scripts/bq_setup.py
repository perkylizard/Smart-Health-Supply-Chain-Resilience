"""BigQuery: connection check, dataset creation, and upload of the series used for Google forecasting.
Reads GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, BQ_DATASET from .env. Public/simulated data only.

Usage:
  uv run python scripts/bq_setup.py check      # one tiny query, prints project and location
  uv run python scripts/bq_setup.py load       # creates dataset and loads district_monthly + facility_monthly
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
    os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(paths.ROOT / vals.get("GOOGLE_APPLICATION_CREDENTIALS", "secrets/gcp-sa.json")))
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
        FROM ledger l JOIN facilities f USING (facility_id) JOIN commodities c USING (commodity_id)""").df()
    con.close()
    for name, df in (("district_monthly_real", dm), ("facility_monthly_sim", fm)):
        job = c.load_table_from_dataframe(df, f"{project}.{dataset}.{name}", job_config=bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE"))
        job.result()
        print(f"loaded {name}: {len(df):,} rows")


if __name__ == "__main__":
    project, dataset = env()
    if not project:
        sys.exit("GCP_PROJECT_ID missing in .env")
    if not os.path.exists(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]):
        sys.exit(f"key file not found at {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")
    {"check": check, "load": load}[sys.argv[1] if len(sys.argv) > 1 else "check"](project, dataset)
