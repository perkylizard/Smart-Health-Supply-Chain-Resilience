"""The synthetic continuation of the real HMIS district ledger: built from files on disk only, labelled simulated."""
import numpy as np
import pandas as pd
import pytest

from sanjeevani import hmis_extend as X, paths

REAL = paths.DATA_PROCESSED / "hmis_ledger.parquet"
SYNTH = paths.DATA_PROCESSED / "hmis_ledger_synth.parquet"
pytestmark = pytest.mark.skipif(not REAL.exists(), reason="real ledger not built")


def _toy_real() -> pd.DataFrame:
    rows = []
    for fy, y in (("2017-18", 2017), ("2018-19", 2018), ("2019-20", 2019)):
        for i, m in enumerate(hmis.FY_MONTH_ORDER):
            season = 1.5 if m in (7, 8, 9) else 1.0
            dist = 1000 * season * (1.05 ** (y - 2017))
            rows.append(dict(state="S", district="D", fy=fy, month=m, item_code="19.12", item_name="ORS", provisional=False,
                             opening=3000.0, received=1200.0 if i % 2 == 0 else 0.0, unusable=5.0, distributed=dist, closing=3000.0 + (1200.0 if i % 2 == 0 else 0.0) - 5.0 - dist))
    return pd.DataFrame(rows)


from sanjeevani import hmis  # noqa: E402


def test_toy_series_continues_from_last_real_month():
    out = X.extend(_toy_real(), end_fy="2020-21", seed=1)
    assert set(out["source"]) == {"simulated"}
    assert list(out["fy"].unique()) == ["2020-21"] and len(out) == 12
    first = out.sort_values("t").iloc[0]
    assert first["month"] == 4 and first["opening"] == pytest.approx(_toy_real().iloc[-1]["closing"], abs=0.5)
    # accounting identity holds every month and stock never goes negative
    assert np.allclose(out["opening"] + out["received"] - out["unusable"] - out["distributed"], out["closing"])
    assert (out["closing"] >= 0).all() and (out["distributed"] >= 0).all()
    # monsoon months carry the learnt seasonality
    mon = out[out["month"].isin([7, 8, 9])]["demand"].mean(); rest = out[~out["month"].isin([7, 8, 9])]["demand"].mean()
    assert mon > 1.2 * rest


def test_extend_is_deterministic():
    a = X.extend(_toy_real(), end_fy="2021-22", seed=3); b = X.extend(_toy_real(), end_fy="2021-22", seed=3)
    pd.testing.assert_frame_equal(a, b)


def test_series_with_too_little_history_are_skipped():
    short = _toy_real().head(6)
    assert X.extend(short, end_fy="2020-21", seed=1).empty


@pytest.fixture(scope="module")
def synth():
    if not SYNTH.exists():
        pytest.skip("synthetic ledger not built; run scripts/synth_hmis_extend.py")
    return pd.read_parquet(SYNTH)


def test_built_synth_covers_every_real_series_to_march_2026(synth):
    assert set(synth["source"]) == {"simulated"}
    last = synth.loc[synth["t"].idxmax()]
    assert last["fy"] == "2025-26" and last["month"] == 3  # March 2026 is the last synthetic month
    # every state with at least a year of district stock reporting continues (Lakshadweep-sized UTs have none)
    real_states = set(pd.read_parquet(REAL, columns=["state"])["state"])
    assert set(synth["state"]) <= real_states and len(set(synth["state"])) >= 30
    # each state continues from the month after its own last real month: April 2021 for the provisional 16, April 2020 for most others
    start = synth.sort_values("t").groupby("state")["fy"].first()
    assert set(start.unique()) <= {"2019-20", "2020-21", "2021-22"} and start["Bihar"] == "2021-22" and start["Uttar Pradesh"] == "2020-21"


def test_built_synth_is_plausible(synth):
    rate = synth["stockout"].mean()
    assert 0.02 <= rate <= 0.30, rate
    assert (synth["closing"] >= 0).all()
    b = synth[(synth["state"] == "Bihar") & (synth["item_code"] == "19.12")]
    assert b["district"].nunique() >= 15  # only districts still reporting ORS in the last real year continue
