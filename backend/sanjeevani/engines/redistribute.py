"""Redistribution proposals via OR-Tools min-cost flow: surplus facilities -> deficit facilities, per commodity."""
import math
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import pandas as pd
from ortools.graph.python import min_cost_flow

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
    # candidate arcs
    arcs = []
    for i, r in enumerate(recipients.itertuples(index=False)):
        for j, d in enumerate(donors.itertuples(index=False)):
            same = d.district == r.district
            if not same and not allow_cross_district:
                continue
            km = dist.km((d.lat, d.lon), (r.lat, r.lon))
            limit = max_km if same else max_km * 2
            if km <= limit:
                arcs.append((j, i, km, same))
    if not arcs:
        return _empty()
    smcf = min_cost_flow.SimpleMinCostFlow()
    S, T = 0, 1
    dn = {j: 2 + j for j in range(len(donors))}
    rn = {i: 2 + len(donors) + i for i in range(len(recipients))}
    for j, d in enumerate(donors.itertuples(index=False)):
        smcf.add_arc_with_capacity_and_unit_cost(S, dn[j], int(d.surplus), 0)
    for i, r in enumerate(recipients.itertuples(index=False)):
        smcf.add_arc_with_capacity_and_unit_cost(rn[i], T, int(r.need), 0)
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
    for arc, j, i, km, same in arc_ids:
        q = smcf.flow(arc)
        if q <= 0:
            continue
        d = donors.iloc[j]; r = recipients.iloc[i]
        eta = round(km / KM_PER_DAY + 1 + lead_add_days, 1)
        rows.append({
            "transfer_id": f"{commodity_id}:{d.facility_id}->{r.facility_id}",
            "from_id": d.facility_id, "from_name": d.facility_name, "from_district": d.district,
            "to_id": r.facility_id, "to_name": r.facility_name, "to_district": r.district,
            "commodity_id": commodity_id, "quantity": int(q), "km": round(km, 1), "eta_days": eta,
            "donor_days_after": round((d.closing - q) / d.daily, 1), "recipient_days_after": round((r.closing + q) / r.daily, 1),
            "cross_district": not same,
            "reason": f"{r.facility_name} has {r.days_of_stock:.0f} days of {commodity_id} ({r.cause.replace('_', ' ')}); "
                      f"{d.facility_name} keeps {((d.closing - q) / d.daily):.0f} days after giving {int(q)}",
            "status": "proposed", "source": "optimiser",
        })
    out = pd.DataFrame(rows)
    if total_surplus < total_need and not out.empty:
        out["note"] = "insufficient_surplus"
    return out.sort_values(["to_id", "km"]).reset_index(drop=True) if not out.empty else _empty()


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=["transfer_id", "from_id", "from_name", "from_district", "to_id", "to_name", "to_district", "commodity_id",
                                 "quantity", "km", "eta_days", "donor_days_after", "recipient_days_after", "cross_district", "reason", "status", "source"])
