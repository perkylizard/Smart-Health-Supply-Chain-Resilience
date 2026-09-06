import numpy as np
import pandas as pd

from sanjeevani.engines import forecast as F


def test_sine_seasonality_recovered():
    t = np.arange(36); y = 100 + 40 * np.sin(2 * np.pi * t / 12)
    fc = F.forecast_series(y, horizon_weeks=8)
    expected_next_month_weekly = (100 + 40 * np.sin(2 * np.pi * 36 / 12)) / F.WEEKS_PER_MONTH
    assert abs(fc.point[0] - expected_next_month_weekly) / expected_next_month_weekly < 0.1
    assert len(fc.point) == 8 and len(fc.p90) == 8 and fc.method == "seasonal_naive_trend"


def test_constant_series_p90_floor():
    fc = F.forecast_series(np.full(24, 60.0))
    assert np.allclose(fc.p90, fc.point * 1.25)


def test_short_series_uses_mean():
    fc = F.forecast_series(np.array([10, 12, 11]))
    assert fc.method == "mean" and abs(fc.point[0] - 11 / F.WEEKS_PER_MONTH) < 1e-6


def test_exog_scales_point():
    y = np.full(24, 60.0)
    a = F.forecast_series(y); b = F.forecast_series(y, exog_mult=np.full(8, 2.0))
    assert np.allclose(b.point, a.point * 2)


def test_frame_and_backtest():
    t = np.arange(36)
    hist = pd.DataFrame({"facility_id": ["f1"] * 36, "commodity_id": ["ors"] * 36, "month_index": t, "demand": 100 + 40 * np.sin(2 * np.pi * t / 12)})
    fr = F.forecast_frame(hist)
    assert len(fr) == 8 and set(fr.columns) >= {"point", "p90", "method", "source"}
    bt = F.backtest(hist)
    assert len(bt) == 1 and bt["mape"].iloc[0] < 0.15
