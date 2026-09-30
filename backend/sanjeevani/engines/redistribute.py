"""Redistribution proposals via OR-Tools min-cost flow: surplus facilities -> deficit facilities, per commodity."""
import math
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import pandas as pd
from ortools.graph.python import min_cost_flow

from sanjeevani import labels as L
from sanjeevani.engines.alerts import DONOR_FLOOR

ROAD_FACTOR = 1.3
FIXED_COST = 500
KM_COST = 10
KM_PER_DAY = 150.0


class DistanceProvider(Protocol):
    def km(self, a: tuple[float, float], b: tuple[float, float]) -> float: ...


@dataclass
class HaversineDistance:
    road_factor: float = ROAD_FACTOR

    def km(self, a, b) -> float:
        R = 6371.0
        p1, p2 = math.radians(a[0]), math.radians(b[0])
        dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * R * math.asin(math.sqrt(h)) * self.road_factor


def propose(alerts: pd.DataFrame, commodity_id: str, max_km: float = 80.0, donor_floor_days: float = DONOR_FLOOR,
            target_days: float = DONOR_FLOOR, lead_add_days: float = 0.0, dist: DistanceProvider | None = None,
            allow_cross_district: bool = True) -> pd.DataFrame:
    """alerts: compute_alerts output (one row per facility for this commodity), needs lat/lon, closing, weekly_demand_p90,
    days_of_stock, alert, data_issue, district. Returns transfer proposals."""
    dist = dist or HaversineDistance()
    a = alerts[(alerts["commodity_id"] == commodity_id) & (~alerts["data_issue"])].copy()
    if a.empty:
        return _empty()
    a["daily"] = np.maximum(a["weekly_demand_p90"] / 7.0, 1e-6)
    recipients = a[a["alert"]].copy()
    recipients["need"] = np.ceil((target_days - recipients["days_of_stock"]).clip(lower=0) * recipients["daily"]).astype(int)
    recipients = recipients[recipients["need"] > 0]
    donors = a[(~a["alert"]) & (a["days_of_stock"] > donor_floor_days + 3)].copy()
    donors["surplus"] = np.floor((donors["days_of_stock"] - donor_floor_days) * donors["daily"]).astype(int)
    donors = donors[donors["surplus"] > 0]
    if recipients.empty or donors.empty:
        return _empty()
    # candidate arcs: one vectorised distance matrix (recipients x donors) instead of a row-by-row double loop
    r_lat, r_lon = recipients["lat"].to_numpy(float), recipients["lon"].to_numpy(float)
    d_lat, d_lon = donors["lat"].to_numpy(float), donors["lon"].to_numpy(float)
    r_dist, d_dist = recipients["district"].to_numpy(object), donors["district"].to_numpy(object)
    if isinstance(dist, HaversineDistance):
        p1, p2 = np.radians(d_lat)[None, :], np.radians(r_lat)[:, None]
        dp = p2 - p1
        dl = np.radians(r_lon)[:, None] - np.radians(d_lon)[None, :]
        h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
        kmm = 2 * 6371.0 * np.arcsin(np.sqrt(h)) * dist.road_factor
    else:  # any other provider (for example a road-distance service) keeps the pairwise call
        kmm = np.array([[dist.km((d_lat[j], d_lon[j]), (r_lat[i], r_lon[i])) for j in range(len(d_lat))] for i in range(len(r_lat))])
    same_m = r_dist[:, None] == d_dist[None, :]
    ok = kmm <= np.where(same_m, max_km, max_km * 2)
    if not allow_cross_district:
        ok &= same_m
    ii, jj = np.nonzero(ok)
    arcs = [(int(j), int(i), float(kmm[i, j]), bool(same_m[i, j])) for i, j in zip(ii, jj)]
    if not arcs:
        return _empty()
    smcf = min_cost_flow.SimpleMinCostFlow()
    S, T = 0, 1
    dn = {j: 2 + j for j in range(len(donors))}
    rn = {i: 2 + len(donors) + i for i in range(len(recipients))}
    for j, sur in enumerate(donors["surplus"].to_numpy()):
        smcf.add_arc_with_capacity_and_unit_cost(S, dn[j], int(sur), 0)
    for i, need in enumerate(recipients["need"].to_numpy()):
        smcf.add_arc_with_capacity_and_unit_cost(rn[i], T, int(need), 0)
    arc_ids = []
    for (j, i, km, same) in arcs:
        cost = int(km * KM_COST + FIXED_COST + (0 if same else 2000))
        arc_ids.append((smcf.add_arc_with_capacity_and_unit_cost(dn[j], rn[i], 10**9, cost), j, i, km, same))
    total_need = int(recipients["need"].sum()); total_surplus = int(donors["surplus"].sum())
    supply = min(total_need, total_surplus)
    smcf.set_node_supply(S, supply); smcf.set_node_supply(T, -supply)
    status = smcf.solve()
    if status != smcf.OPTIMAL:
        return _empty()
    rows = []
    D = donors.reset_index(drop=True).to_dict("records"); Rr = recipients.reset_index(drop=True).to_dict("records")
    for arc, j, i, km, same in arc_ids:
        q = smcf.flow(arc)
        if q <= 0:
            continue
        d = _Row(D[j]); r = _Row(Rr[i])
        eta = round(km / KM_PER_DAY + 1 + lead_add_days, 1)
        rows.append({
            "transfer_id": f"{commodity_id}:{d.facility_id}->{r.facility_id}",
            "from_id": d.facility_id, "from_name": d.facility_name, "from_district": d.district,
            "to_id": r.facility_id, "to_name": r.facility_name, "to_district": r.district,
            "commodity_id": commodity_id, "commodity_name": L.medicine(r.get("commodity_name"), commodity_id), "quantity": int(q), "km": round(km, 1), "eta_days": eta,
            "donor_days_after": round((d.closing - q) / d.daily, 1), "recipient_days_after": round((r.closing + q) / r.daily, 1),
            "cross_district": not same,
            "reason": f"{r.facility_name} has {r.days_of_stock:.0f} days of {L.medicine(r.get('commodity_name'), commodity_id)}"
                      f"{' (' + L.cause(r.cause) + ')' if L.cause(r.cause) else ''}; "
                      f"{d.facility_name} keeps {((d.closing - q) / d.daily):.0f} days after giving {int(q)}",
            "status": "proposed", "source": "optimiser",
        })
    out = pd.DataFrame(rows)
    if total_surplus < total_need and not out.empty:
        out["note"] = "insufficient_surplus"
    return out.sort_values(["to_id", "km"]).reset_index(drop=True) if not out.empty else _empty()


class _Row(dict):
    """Attribute access over a plain dict row, so the proposal builder reads d.closing as before."""
    __getattr__ = dict.__getitem__


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=["transfer_id", "from_id", "from_name", "from_district", "to_id", "to_name", "to_district", "commodity_id", "commodity_name",
                                 "quantity", "km", "eta_days", "donor_days_after", "recipient_days_after", "cross_district", "reason", "status", "source"])
