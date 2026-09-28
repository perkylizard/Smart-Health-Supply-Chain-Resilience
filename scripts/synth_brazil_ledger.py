"""Write the simulated Brazil ledger: data/processed/brazil_synth_ledger.parquet.
Simulated Brazil node, shaped on the public BNAFAR/Hórus sample structure; no facility data fetched."""
import sys
import time

sys.path.insert(0, "backend")
from sanjeevani import paths  # noqa: E402
from sanjeevani.federated import brazil  # noqa: E402

if __name__ == "__main__":
    t0 = time.time()
    df = brazil.generate()
    out = paths.DATA_PROCESSED / "brazil_synth_ledger.parquet"
    df.to_parquet(out, index=False, compression="zstd")
    print(f"{len(df):,} rows, {df['facility_id'].nunique():,} facilities, {df['state'].nunique()} UFs, "
          f"stock-out rate {df['stockout'].mean():.1%}, {out.stat().st_size / 1e6:.1f} MB, {time.time() - t0:.0f}s")
