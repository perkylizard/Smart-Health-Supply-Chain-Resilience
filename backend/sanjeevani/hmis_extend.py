"""Synthetic continuation of the real HMIS district stock ledger, built only from the parquet files on disk.

Every district x commodity series with at least a year of real months is continued month by month after its last real
month: demand follows the series' own learnt seasonality, level, year-on-year trend and noise; stock follows the same
accounting identity as HMIS (opening + received - unusable - distributed = closing) with lumpy deliveries sized to the
series' own historical months of stock. A month is a stock-out when demand exceeds what the store held. All rows carry
source = 'simulated'. Nothing is fetched."""
import numpy as np
import pandas as pd

from sanjeevani.hmis import FY_MONTH_ORDER

_K = {m: i for i, m in enumerate(FY_MONTH_ORDER)}
COLUMNS = ["state", "district", "fy", "month", "t", "item_code", "item_name", "opening", "received", "unusable", "distributed",
           "closing", "demand", "stockout", "source", "basis_fy", "basis_month"]


def month_index(fy: pd.Series, month: pd.Series) -> pd.Series:
    """Global month counter: April of FY 2017-18 -> 2017*12 + 0."""
    return fy.astype(str).str[:4].astype(int) * 12 + month.astype(int).map(_K)


def fy_of(t: int) -> tuple[str, int]:
    y, k = divmod(int(t), 12)
    return f"{y}-{str(y + 1)[2:]}", FY_MONTH_ORDER[k]


def _profiles(real: pd.DataFrame, min_months: int) -> pd.DataFrame:
    df = real.dropna(subset=["distributed"]).copy()
    df = df[df["distributed"] >= 0]
    df["t"] = month_index(df["fy"], df["month"])
    key = ["state", "district", "item_code"]
    g = df.groupby(key, sort=True)
    p = g.agg(n=("t", "size"), last_t=("t", "max"), item_name=("item_name", "first"), mean_all=("distributed", "mean")).reset_index()
    p = p[p["n"] >= min_months].copy()
    state_last = df.groupby("state")["t"].max().rename("state_last_t")
    p = p.merge(state_last, on="state")
    p = p[p["last_t"] > p["state_last_t"] - 12].copy()  # series that stopped reporting more than a year before the state did are not continued
    if p.empty:
        return p
    df = df.merge(p[key + ["last_t"]], on=key)
    last12 = df[df["t"] > df["last_t"] - 12].groupby(key)["distributed"].mean().rename("mean_last12")
    prev12 = df[(df["t"] <= df["last_t"] - 12) & (df["t"] > df["last_t"] - 24)].groupby(key)["distributed"].mean().rename("mean_prev12")
    p = p.merge(last12, on=key, how="left").merge(prev12, on=key, how="left")
    p["level"] = 0.5 * p["mean_last12"].fillna(p["mean_all"]) + 0.5 * p["mean_all"]
    p.loc[p["level"] <= 0, "level"] = p["mean_all"].clip(lower=1.0)
    p["trend"] = ((p["mean_last12"] + 1) / (p["mean_prev12"] + 1)).fillna(1.0).clip(0.85, 1.15)
    # seasonality: ratio to the series mean by calendar month, shrunk toward 1 with two pseudo-observations
    by_m = df.merge(p[key + ["mean_all"]], on=key)
    by_m["ratio"] = (by_m["distributed"] + 1) / (by_m["mean_all"] + 1)
    s = by_m.groupby(key + ["month"])["ratio"].agg(["mean", "size"]).reset_index()
    s["season"] = (s["size"] * s["mean"] + 2.0) / (s["size"] + 2.0)
    season = s.pivot_table(index=key, columns="month", values="season").reindex(columns=FY_MONTH_ORDER).fillna(1.0)
    season = season.div(season.mean(axis=1), axis=0)
    p = p.merge(season.add_prefix("s_").reset_index(), on=key, how="left")
    # noise from log residuals against level x season
    r = by_m.merge(season.add_prefix("s_").reset_index(), on=key, how="left")
    r["s"] = np.take_along_axis(r[[f"s_{m}" for m in FY_MONTH_ORDER]].to_numpy(float), r["month"].map(_K).to_numpy()[:, None], axis=1)[:, 0]
    r = r.merge(p[key + ["level"]], on=key)
    r["res"] = np.log((r["distributed"] + 1) / (r["level"] * r["s"] + 1))
    p = p.merge(r.groupby(key)["res"].std().rename("sigma").reset_index(), on=key, how="left")
    p["sigma"] = p["sigma"].fillna(0.3).clip(0.15, 0.6)
    # stock policy learnt from the series: target months of stock, delivery frequency, unusable share, last closing
    st = df.copy()
    st["mos"] = np.where(st["distributed"] > 0, st["closing"] / st["distributed"].replace(0, np.nan), np.nan)
    st["deliv"] = (st["received"].fillna(0) > 0).astype(float)
    st["unus"] = np.where(st["distributed"] > 0, st["unusable"].fillna(0) / st["distributed"].replace(0, np.nan), np.nan)
    pol = st.groupby(key).agg(target=("mos", "median"), deliv_p=("deliv", "mean"), unus=("unus", "median")).reset_index()
    p = p.merge(pol, on=key, how="left")
    p["target"] = p["target"].fillna(1.5).clip(0.3, 6.0); p["deliv_p"] = p["deliv_p"].fillna(0.5).clip(0.15, 1.0); p["unus"] = p["unus"].fillna(0.0).clip(0.0, 0.05)
    lastrow = df.sort_values("t").groupby(key).tail(1)[key + ["closing", "fy", "month"]].rename(columns={"closing": "open0", "fy": "basis_fy", "month": "basis_month"})
    p = p.merge(lastrow, on=key, how="left")
    p["open0"] = p["open0"].fillna(p["level"] * p["target"]).clip(lower=0)
    return p.reset_index(drop=True)


def extend(real: pd.DataFrame, end_fy: str = "2025-26", seed: int = 2026, min_months: int = 12) -> pd.DataFrame:
    p = _profiles(real, min_months)
    if p.empty:
        return pd.DataFrame(columns=COLUMNS)
    rng = np.random.default_rng(seed)
    S = len(p)
    season = p[[f"s_{m}" for m in FY_MONTH_ORDER]].to_numpy(float)
    level, trend, sigma = p["level"].to_numpy(float), p["trend"].to_numpy(float), p["sigma"].to_numpy(float)
    target, deliv_p, unus = p["target"].to_numpy(float), p["deliv_p"].to_numpy(float), p["unus"].to_numpy(float)
    last_t = p["state_last_t"].to_numpy(int); opening = p["open0"].to_numpy(float).copy()  # continue after the state's last real month
    end_t = int(end_fy[:4]) * 12 + 11
    frames = []
    for t in range(int(last_t.min()) + 1, end_t + 1):
        active = t > last_t
        if not active.any():
            continue
        k = t % 12
        years = np.minimum((t - last_t) / 12.0, 3.0)
        expect = level * season[:, k] * trend ** years
        demand = expect * rng.lognormal(-sigma ** 2 / 2, sigma)
        deliver = rng.random(S) < deliv_p
        order_up_to = expect * (1.0 / deliv_p + target) * rng.lognormal(0, 0.15)  # cover the months until the next delivery, plus the learnt safety months
        received = np.where(deliver, np.maximum(0.0, order_up_to - opening), 0.0)
        unusable = np.minimum(unus * demand, opening + received)
        avail = opening + received - unusable
        distributed = np.minimum(demand, avail)
        stockout = demand > avail + 1e-9
        closing = avail - distributed
        fy, m = fy_of(t)
        frames.append(pd.DataFrame({
            "state": p["state"].to_numpy()[active], "district": p["district"].to_numpy()[active], "fy": fy, "month": m, "t": t,
            "item_code": p["item_code"].to_numpy()[active], "item_name": p["item_name"].to_numpy()[active],
            "opening": np.round(opening[active]), "received": np.round(received[active]), "unusable": np.round(unusable[active]),
            "distributed": np.round(distributed[active]), "closing": np.round(closing[active]), "demand": np.round(demand[active]),
            "stockout": stockout[active], "source": "simulated", "basis_fy": p["basis_fy"].to_numpy()[active], "basis_month": p["basis_month"].to_numpy()[active],
        }))
        opening = np.where(active, closing, opening)
    out = pd.concat(frames, ignore_index=True)
    # rounding must keep the accounting identity exact and stock non-negative: absorb rounding residue in `distributed`
    out["closing"] = (out["opening"] + out["received"] - out["unusable"] - out["distributed"]).clip(lower=0.0)
    out["distributed"] = out["opening"] + out["received"] - out["unusable"] - out["closing"]
    return out[COLUMNS]
