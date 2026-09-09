# Where the forecast error comes from (Bihar, real district series, 9 Sep 2026)

Holdout Jan-Mar 2020, trained to Dec 2019, 769 district x item series with mean monthly value >= 20.

## By holdout month (median absolute percentage error)
| Month | Baseline | ARIMA_PLUS | TimesFM | Median ensemble |
|---|---|---|---|---|
| Jan 2020 | 21.7% | 9.2% | 7.1% | 8.6% |
| Feb 2020 | 22.2% | 12.4% | 11.1% | 11.7% |
| Mar 2020 (lockdown from 24 Mar) | 59.5% | 36.4% | 34.0% | 37.0% |

## Volume-weighted error (WAPE, all three months)
Baseline 27.6%, ARIMA_PLUS 15.5%, TimesFM 13.2%, ensemble 14.9%. The ensemble does not beat TimesFM alone.

## By series size (TimesFM median APE)
| Mean monthly value | Error | Series |
|---|---|---|
| 20-50 | 75.0% | 67 |
| 50-200 | 42.0% | 123 |
| 200-1000 | 25.0% | 114 |
| 1000+ | 8.7% | 465 |

## Hardest items for TimesFM
9.2.2 Measles 1st dose (median APE 1701%: the item was being replaced by MR vaccine 9.2.1 during 2019-20, a structural break, not a forecasting failure); 14.6.4 snake bite (94%); 14.4.6 fever of unknown origin (70%); 14.4.3 typhoid inpatients (64%); 1.3.2 eclampsia (58%); 14.4.7 diarrhoea with dehydration inpatients (53%); 10.1 childhood pneumonia (49%); 10.10 childhood malaria (46%).
Easiest: routine immunisation doses (6-7%) and total outpatient attendance (8%).

9.1% of holdout months collapsed to under 30% of the training mean (reporting gaps and the lockdown).

## Conclusions
1. On ordinary months the Google forecaster is at 7-11% median error; the March 2020 lockdown is most of the reported 17-18%.
2. MAPE punishes small counts; for stock planning the volume-weighted error (13%) is the meaningful figure.
3. The remaining error is concentrated in sparse emergency counts and in item substitutions, both of which have known fixes (pooling, commodity-level series).
