"""Sample activity loaded when the server starts, so every screen shows a working flow on first open.

Demand, stock and alerts are computed; this module only adds the human decisions a live district would have made: facility
requests at every stage, transfers approved, in transit and delivered, warehouse dispatches, and stock counts. Every record it
creates carries sample=True and the screens badge it "sample". Deterministic (fixed choices), so every restart looks the same."""
import time

SEED_DISTRICTS = [("bihar", "Araria"), ("bihar", "Kaimur Bhabua"), ("bihar", "Purnia"), ("assam", "Barpeta")]


def seed(app) -> dict:
    st, store = app.state.state, app.state.store
    if any(e.get("sample") for e in st.entries()):
        return {"skipped": "already seeded"}
    now = time.time()
    made = {"requests": 0, "counts": 0, "transfers": 0, "indents": 0}
    for i, (unit, district) in enumerate(SEED_DISTRICTS):
        al = app.state.alerts_for(unit, district)
        if al is None or al.empty:
            continue
        fac = store.facilities(unit, district)
        low = al[al["alert"] & ~al["data_issue"].astype(bool)].drop_duplicates("facility_id")
        picks = low.head(6).to_dict("records")
        # requests: two waiting, one approved, one declined, one dispatched, one delivered
        stages = ["requested", "requested", "approved", "declined", "dispatched", "delivered"]
        for j, (a, stage) in enumerate(zip(picks, stages)):
            f = fac[fac["facility_id"] == a["facility_id"]].iloc[0]
            qty = int(max(20, round(float(a.get("weekly_demand_p90") or 10) * 4 / 10) * 10))
            rid = f"request:{a['facility_id']}:{a['commodity_id']}:sample{i}{j}"
            st.add_entry({"kind": "request", "request_id": rid, "facility_id": a["facility_id"], "facility_name": f["name"], "type": f["type"],
                          "unit_id": unit, "district": district, "commodity_id": a["commodity_id"], "quantity": qty,
                          "note": ["Cases rising this week", "Last indent was not supplied", None, "Stock needed before the monsoon", None, "Outreach camp next week"][j], "sample": True})
            flow = {"approved": ["approved"], "declined": ["declined"], "dispatched": ["approved", "dispatched"], "delivered": ["approved", "dispatched", "delivered"]}.get(stage, [])
            for k, s in enumerate(flow):
                st.set_transfer(rid, s, "Stock sent to this facility last week" if s == "declined" else None)
            made["requests"] += 1
        # stock counts from three facilities
        for j, a in enumerate(al[~al["data_issue"].astype(bool)].drop_duplicates("facility_id").iloc[6:9].to_dict("records")):
            st.add_entry({"kind": "count", "facility_id": a["facility_id"], "commodity_id": a["commodity_id"], "quantity": float(round(a["closing"])), "channel": "chat", "sample": True})
            made["counts"] += 1
        # transfers: approve, move and deliver a few of the optimiser's proposals
        try:
            props = app.state.proposals_for(unit, district)
        except Exception:
            props = None
        if props is not None and len(props):
            for j, tid in enumerate(props["transfer_id"].head(7)):
                path = [["approved"], ["approved"], ["approved", "picked_up"], ["approved", "picked_up"], ["approved", "picked_up", "delivered"], ["approved", "picked_up", "delivered"], ["approved", "picked_up", "delivered"]][j]
                for s in path:
                    st.set_transfer(tid, s)
                made["transfers"] += 1
        # warehouse: dispatch and deliver a few alert indents
        for j, a in enumerate(low.iloc[6:11].to_dict("records")):
            iid = f"indent:{a['facility_id']}:{a['commodity_id']}"
            st.set_transfer(iid, "dispatched")
            if j >= 3:
                st.set_transfer(iid, "delivered")
            made["indents"] += 1
    return made
