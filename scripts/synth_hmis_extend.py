"""Continue every real HMIS district x commodity stock series to March 2026 with labelled synthetic months.
Reads data/processed/hmis_ledger.parquet (on disk), writes data/processed/hmis_ledger_synth.parquet. No network."""
import time

import pandas as pd

from sanjeevani import hmis_extend as X, paths

if __name__ == "__main__":
    t0 = time.time()
    real = pd.read_parquet(paths.DATA_PROCESSED / "hmis_ledger.parquet")
    real = real[real["district"].str.lower() != real["state"].str.lower()]  # district rows only; state totals are sums
    out = X.extend(real, end_fy="2025-26", seed=2026)
    dst = paths.DATA_PROCESSED / "hmis_ledger_synth.parquet"
    out.to_parquet(dst, index=False, compression="zstd")
    print(f"series: {out.groupby(['state', 'district', 'item_code']).ngroups:,} | rows: {len(out):,} | months {out['fy'].min()} .. {out['fy'].max()} | "
          f"stock-out rate {out['stockout'].mean():.1%} | {dst.stat().st_size / 1e6:.1f} MB | {time.time() - t0:.0f}s")
