import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import ChatWidget from "../components/ChatWidget";
import Scale from "../components/Scale";

export function PhcPick() {
  const { unit, district, t } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const f = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district) });
  const list = (f.data?.facilities ?? []).filter((x) => x.facility_name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ marginBottom: 12 }}>{t.pickFacility}</h1>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t.facility} · ${district}`} aria-label={t.facility} autoFocus />
      <div className="list" style={{ marginTop: 12 }}>
        {list.map((x) => <div key={x.facility_id} className="row" style={{ gridTemplateColumns: "1fr auto" }}><div><span className="name">{x.facility_name}</span><div className="sub">{x.type} · <Badge kind={x.source === "osm" ? "osm" : "simulated"} /></div></div><button className="btn primary" onClick={() => nav(`/phc/${x.facility_id}`)}>{t.myStock}</button></div>)}
      </div>
    </div>
  );
}

export default function PhcHome({ tab }: { tab: "stock" | "report" | "deliveries" }) {
  const { facilityId, t } = useApp();
  const qc = useQueryClient();
  const f = useQuery({ queryKey: ["facility", facilityId], queryFn: () => api.facility(facilityId!), enabled: !!facilityId });
  const tr = useQuery({ queryKey: ["facilityTransfers", facilityId], queryFn: () => api.facilityTransfers(facilityId!), enabled: !!facilityId && tab === "deliveries" });
  const [done, setDone] = useState<Record<string, boolean>>({});
  const delivered = useMutation({ mutationFn: (id: string) => api.delivered(id), onMutate: (id) => setDone((d) => ({ ...d, [id]: true })), onSettled: () => qc.invalidateQueries({ queryKey: ["facilityTransfers"] }) });
  if (!facilityId) return <PhcPick />;
  if (!f.data) return <p className="skeleton" style={{ height: 120 }}>Loading your facility</p>;
  const fac = f.data.facility as Record<string, string | number>;
  const low = f.data.stock.filter((s) => s.alert);
  return (
    <div style={{ maxWidth: 880 }}>
      <p className="faint" style={{ fontSize: 13 }}><Link to={`/phc-pick/${fac.unit_id}/${encodeURIComponent(String(fac.district))}`}>{t.facility}</Link> · {String(fac.district)}</p>
      <h1 style={{ marginBottom: 4 }}>{String(fac.name)}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{String(fac.type)} · <Badge kind={fac.source === "osm" ? "osm" : "simulated"} /></p>
      {tab === "stock" && (
        <section className="qsection">
          <h2>{t.myStock} <span className="count">{low.length} {low.length === 1 ? "item" : "items"} {t.severity.amber.replace("under", "under")}</span></h2>
          {low.length > 0 && <div className="action-card" style={{ marginBottom: 12 }}><strong>{t.q1}</strong>
            <ul>{low.slice(0, 3).map((s) => <li key={s.commodity_id}>{s.commodity_name}: <span style={{ color: s.days_of_stock < 7 ? "var(--red)" : "var(--amber)", fontWeight: 500 }}>{Math.round(s.days_of_stock)} {t.days}</span></li>)}</ul>
            {low.length > 3 && <p className="faint" style={{ margin: 0, fontSize: 13 }}>+{low.length - 3}</p>}</div>}
          <div className="list">{f.data.stock.map((s) => <div className="row" key={s.commodity_id} style={{ gridTemplateColumns: "1fr 200px" }}><div><span className="name">{s.commodity_name}</span><div className="sub">{Math.round(s.closing).toLocaleString("en-IN")} on hand</div></div><Scale days={s.days_of_stock} severity={s.severity} label={t.days} /></div>)}</div>
        </section>
      )}
      {tab === "report" && (
        <section className="qsection report-section"><ChatWidget facilityId={facilityId} names={Object.fromEntries(f.data.stock.map((s) => [s.commodity_id, s.commodity_name]))} withHeader /></section>
      )}
      {tab === "deliveries" && (
        <section className="qsection">
          <h2>{t.deliveries} <span className="count">{tr.data?.transfers.length ?? ""}</span></h2>
          {tr.isLoading && <p className="skeleton" style={{ height: 60 }}>Checking transfers for this facility</p>}
          {tr.data && tr.data.transfers.length === 0 && <div className="quiet">{t.nothingArriving}</div>}
          {tr.data?.transfers.map((x) => {
            const moving = ["approved", "picked_up", "dispatched"].includes(x.status) && !done[x.transfer_id];
            const status = done[x.transfer_id] || x.status === "delivered" ? t.deliveredStatus : moving ? t.onTheWay : t.awaitingApproval;
            return <div key={x.transfer_id} className="tcard" style={{ cursor: "default" }}>
              <div className="tc-head">
                <div><div className="tc-title">{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}</div><div className="tc-sub">{x.quantity.toLocaleString("en-IN")} {x.quantity === 1 ? t.unit1 : t.units}</div></div>
                <div className="tc-meta"><span className={`chip ${x.direction === "incoming" ? "teal" : "amber"}`}>{x.direction === "incoming" ? t.incoming : t.outgoing}</span><span>{x.km} km · {x.eta_days} d</span></div>
              </div>
              <div className="tc-route"><span>{x.from_name}</span><span className="arrow" aria-hidden>→</span><strong>{x.to_name}</strong></div>
              <div className="tc-actions"><span className={moving ? "" : "faint"} style={{ fontSize: 13 }}>{status}</span>
                {x.direction === "incoming" && moving && <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => delivered.mutate(x.transfer_id)}>{t.confirmArrived}</button>}
              </div>
            </div>;
          })}
        </section>
      )}
    </div>
  );
}
