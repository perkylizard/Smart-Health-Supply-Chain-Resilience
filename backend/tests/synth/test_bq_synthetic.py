"""Frame preparation for the three extra BigQuery tables: no network, files on disk only."""
import sys

import pandas as pd
import pytest

from sanjeevani import paths

sys.path.insert(0, str(paths.ROOT / "scripts"))
from bq_setup import month_start, synthetic_frames  # noqa: E402


def test_month_start_maps_financial_year_to_calendar_dates():
    out = month_start(pd.Series(["2020-21", "2020-21", "2019-20"]), pd.Series([4, 1, 3]))
    assert list(out.dt.strftime("%Y-%m")) == ["2020-04", "2021-01", "2020-03"]


@pytest.mark.skipif(not (paths.DATA_PROCESSED / "hmis_ledger_synth.parquet").exists() or not (paths.DATA_PROCESSED / "brazil_synth_ledger.parquet").exists(), reason="synthetic files not built")
def test_synthetic_frames_are_labelled_and_separate():
    f = synthetic_frames()
    assert set(f) == {"district_monthly_provisional", "district_monthly_synthetic", "brazil_synthetic"}
    prov, syn, br = f["district_monthly_provisional"][0], f["district_monthly_synthetic"][0], f["brazil_synthetic"][0]
    assert prov["provisional"].all() and prov["month_start"].min().strftime("%Y-%m") == "2020-04" and prov["month_start"].max().strftime("%Y-%m") == "2021-03"
    assert set(syn["source"]) == {"simulated"} and syn["month_start"].max().strftime("%Y-%m") == "2026-03"
    assert set(br["source"]) == {"simulated"} and br["uf"].nunique() == 27
    for name, (_, desc) in f.items():
        assert desc.startswith("REAL.") or desc.startswith("SIMULATED.")
