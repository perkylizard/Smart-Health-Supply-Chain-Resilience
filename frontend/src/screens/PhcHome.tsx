import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, type Alert } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import ChatWidget from "../components/ChatWidget";
import Scale from "../components/Scale";
import { MyRequests, RequestDialog, RequestForm } from "../components/Requests";
import { sB } from "../stringsB";

export function PhcPick() {
  const { unit, district, t } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const f = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district) });
  const list = (f.data?.facilities ?? []).filter((x) => x.facility_name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <div className="pg" style={{ maxWidth: 640 }}>
      <section className="card">
        <p className="eyebrow"><span className="eyebrow-accent">{district}</span></p>
        <h1 style={{ margin: "4px 0 12px" }}>{t.pickFacility}</h1>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t.facility} · ${district}`} aria-label={t.facility} autoFocus />
        {f.isLoading && <p className="skeleton" style={{ height: 120, marginTop: 12 }}>…</p>}
        <div className="list flat pick-list" style={{ marginTop: 12 }}>
          {list.map((x) => <div key={x.facility_id} className="row" style={{ gridTemplateColumns: "1fr auto" }}><div><span className="name">{x.facility_name}</span><div className="sub">{x.type} · <Badge kind={x.source === "osm" ? "osm" : "simulated"} /></div></div><button className="btn primary" onClick={() => nav(`/phc/${x.facility_id}`)}>{t.myStock}</button></div>)}
        </div>
      </section>
    </div>
  );
}

// a medicine the facility barely uses (under a unit a week) is never an alert, but it is not "adequate" either when it is out
const statusOf = (a: Alert): [string, keyof typeof sB.en] => a.severity === "data_issue" ? ["blue", "stData"] : (a as Alert & { low_demand?: boolean }).low_demand ? ["grey", "stRare"] : a.severity === "red" ? ["red", "stCritical"] : a.severity === "amber" ? ["amber", "stWarn"] : ["green", "stOk"];

export default function PhcHome({ tab }: { tab: "stock" | "report" | "deliveries" }) {
  const { facilityId, t, lang } = useApp();
  const b = sB[lang];
  const qc = useQueryClient();
  const f = useQuery({ queryKey: ["facility", facilityId], queryFn: () => api.facility(facilityId!), enabled: !!facilityId });
  const tr = useQuery({ queryKey: ["facilityTransfers", facilityId], queryFn: () => api.facilityTransfers(facilityId!), enabled: !!facilityId && tab !== "report" });
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [cat, setCat] = useState("all");
  const [find, setFind] = useState("");
  const delivered = useMutation({ mutationFn: (id: string) => api.delivered(id), onMutate: (id) => setDone((d) => ({ ...d, [id]: true })), onSettled: () => qc.invalidateQueries({ queryKey: ["facilityTransfers"] }) });
  if (!facilityId) return <PhcPick />;
  if (f.isError) return <div className="quiet">{t.offline}</div>;
  if (!f.data) return <p className="skeleton" style={{ height: 120 }}>Loading your facility</p>;
  const fac = f.data.facility as Record<string, string | number>;
  const stock = f.data.stock;
  const low = stock.filter((s) => s.alert);
  const options = [...stock].sort((a, b2) => a.days_of_stock - b2.days_of_stock).map((s) => ({ id: s.commodity_id, name: s.commodity_name }));

  const tx = tr.data?.transfers ?? [];
  const isDone = (x: (typeof tx)[number]) => x.status === "delivered" || !!done[x.transfer_id];
  const isMoving = (x: (typeof tx)[number]) => ["approved", "picked_up", "dispatched"].includes(x.status) && !done[x.transfer_id];
  const nMoving = tx.filter(isMoving).length;
  const nDone = tx.filter(isDone).length;
  const beds = f.data.beds; const staff = f.data.staff as { cadre: string; in_position: number; days_present: number }[];
  const mo = staff.find((r) => r.cadre === "medical_officer" || r.cadre === "medical officer");
  const critical = stock.filter((s) => s.severity === "red").length;
  const covered = stock.filter((s) => !s.data_issue && s.days_of_stock >= 14).length;
  const cats = Array.from(new Set(stock.map((s) => s.category))).sort();
  const shown = stock.filter((s) => (cat === "all" || s.category === cat) && s.commodity_name.toLowerCase().includes(find.trim().toLowerCase()));
  const name = String(fac.name);

  const Side = (
    <aside className="phc-side">
      <div className="card"><h3>{t.phcThisMonth}</h3>
        {beds && <div style={{ marginBottom: 12 }}><span className="big">{beds.occupied}</span><span className="faint"> / {beds.beds}</span><div className="faint" style={{ fontSize: "var(--t-xs)" }}>{t.phcBeds}</div></div>}
        {mo && (mo.in_position === 0
          ? <div><span className="chip red">{b.doctorNone}</span><div className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 6 }}>{b.doctorWhy}</div></div>
          : <div><span className="big">{mo.in_position}</span><div className="faint" style={{ fontSize: "var(--t-xs)" }}>{t.phcDoctors}, {mo.days_present} {t.days}</div></div>)}
        <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "8px 0 0" }}><Badge kind="simulated" /></p>
      </div>
      {tab !== "deliveries" && <div className="card"><h3>{t.phcDeliveriesCard}</h3>
        {tr.data ? <p className="muted" style={{ margin: "0 0 12px" }}>{nMoving} {t.phcMoving} · {tx.length - nMoving - nDone} {t.phcWaiting}</p> : <p className="faint" style={{ margin: "0 0 12px" }}>…</p>}
        <Link className="btn" to={`/phc/${facilityId}/deliveries`}>{t.phcDeliveriesCard} →</Link></div>}
      {tab === "deliveries" && tr.data && <div className="card"><h3>{t.phcDeliveriesCard}</h3>
        <dl className="kv"><dt>{t.phcMoving}</dt><dd>{nMoving}</dd><dt>{t.phcWaiting}</dt><dd>{tx.length - nMoving - nDone}</dd><dt>{t.phcDone}</dt><dd>{nDone}</dd></dl></div>}
      <div className="card"><h3>{t.requestStock}</h3><RequestForm facilityId={facilityId!} options={options} /></div>
      {tab !== "report" && <div className="card"><h3>{t.phcOpenReport}</h3><p className="muted" style={{ margin: "0 0 12px" }}>{t.chatHint}</p><Link className="btn primary" to={`/phc/${facilityId}/report`}>{t.phcOpenReport}</Link></div>}
    </aside>
  );

  const Head = (
    <section className="card">
      <div className="pg-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-accent">{String(fac.type)} · {String(fac.district)}</span><span aria-hidden> · </span><Link to={`/phc-pick/${fac.unit_id}/${encodeURIComponent(String(fac.district))}`}>{t.facility}</Link></p>
          <h1>{tab === "deliveries" ? b.delivTitle(name) : tab === "report" ? name : b.phcTitle(name)}</h1>
          <p className="sub">{tab === "deliveries" ? b.delivSub : null}<Badge kind={fac.source === "osm" ? "osm" : "simulated"} /></p>
        </div>
        <div className="pg-actions">
          {tab !== "report" && <Link className="btn" to={`/phc/${facilityId}/report`}>{b.updateRegister}</Link>}
          <RequestDialog facilityId={facilityId!} facilityName={name} options={options}><button className="btn primary">+ {b.requestStock}</button></RequestDialog>
        </div>
      </div>
      {tab === "stock" && <div className="tiles">
        <div className="tile"><div className="tile-h"><span>{b.tItems}</span></div><div className="tile-n">{stock.length}</div><div className="tile-s">{b.tItemsSub}</div></div>
        <div className="tile"><div className="tile-h"><span>{b.tCritical}</span>{critical > 0 && <i className="dot red" />}</div><div className={`tile-n${critical ? " red" : ""}`}>{critical}</div><div className="tile-s">{b.tCriticalSub}</div></div>
        <div className="tile"><div className="tile-h"><span>{b.tCovered}</span></div><div className="tile-n">{stock.length ? Math.round((covered / stock.length) * 100) : 0}%</div><div className="tile-s">{b.tCoveredSub(covered, stock.length)}</div></div>
        <div className="tile"><div className="tile-h"><span>{b.tBeds}</span><Badge kind="simulated" /></div><div className="tile-n">{beds ? `${beds.occupied}/${beds.beds}` : "…"}</div><div className="tile-s" style={mo && mo.in_position === 0 ? { color: "var(--red)" } : undefined}>{b.tDoctor}: {mo ? (mo.in_position === 0 ? b.doctorNone : b.doctorPresent(mo.days_present)) : "…"}</div></div>
      </div>}
    </section>
  );

  return (
    <div className="pg">
      {Head}
      {tab !== "report" && <div className="phc-layout"><div>
        {tab === "stock" && (<>
          {low.length > 0 && <section className="card action-card what-card"><strong>{t.q1}</strong>
            <ul>{low.slice(0, 3).map((s) => <li key={s.commodity_id}>{s.commodity_name}: <span className="d" style={{ color: s.days_of_stock < 7 ? "var(--red)" : "var(--amber)" }}>{Math.round(s.days_of_stock)} {t.days}</span></li>)}</ul>
            {low.length > 3 && <p className="faint" style={{ margin: 0, fontSize: "var(--t-xs)" }}>+{low.length - 3}</p>}</section>}
          <section className="card">
            <div className="card-head"><div><h2>{b.stockCard} <span className="faint">({low.length} {t.severity.amber})</span></h2><p className="faint">{b.stockCardSub}</p></div></div>
            <div className="toolbar">
              <div className="seg" role="tablist" aria-label={b.colCategory}>
                <button role="tab" aria-selected={cat === "all"} className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>{b.allCats}</button>
                {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{b.cat[c] ?? c.replace(/_/g, " ")}</button>)}
              </div>
              <input className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={b.findMed} aria-label={b.findMed} />
            </div>
            <div className="dtable-wrap">
              <table className="dtable stack">
                <thead><tr><th>{b.colMedicine}</th><th>{b.colCategory}</th><th className="num">{b.colOnHand}</th><th className="days-col">{b.colDays}</th><th>{b.colStatus}</th><th className="num">{b.colAction}</th></tr></thead>
                <tbody>{shown.map((s) => { const [tone, key] = statusOf(s); return (
                  <tr key={s.commodity_id}>
                    <td className="full"><div className="med-name">{s.commodity_name}</div>{(s as { reported?: boolean }).reported && <div className="med-sub"><span className="chip teal" style={{ minHeight: 20 }}>{t.reportedByYou}</span></div>}</td>
                    <td className="hide-sm">{b.cat[s.category] ?? s.category}</td>
                    <td className="num">{Math.round(s.closing).toLocaleString("en-IN")}</td>
                    <td><Scale days={s.days_of_stock} severity={s.severity} label={t.days} /></td>
                    <td><span className={`status-badge ${tone}`}>{b[key] as string}</span></td>
                    <td className="num"><RequestDialog facilityId={facilityId!} facilityName={name} options={options} preset={s.commodity_id}><button className="btn quiet nowrap">+ {b.requestRow}</button></RequestDialog></td>
                  </tr>); })}</tbody>
              </table>
            </div>
            {shown.length === 0 && <p className="muted">{b.noMatch}</p>}
          </section>
        </>)}
        {tab === "deliveries" && (<>
          <MyRequests facilityId={facilityId!} />
          <section className="card">
            <div className="card-head"><div><h2>{t.deliveries} <span className="faint">({tx.length})</span></h2></div></div>
            {tr.isLoading && <p className="skeleton" style={{ height: 60 }}>Checking transfers for this facility</p>}
            {tr.isError && <p className="muted">{t.offline}</p>}
            {tr.data && tx.length === 0 && <div className="quiet">{t.nothingArriving}</div>}
            {tr.data && tx.length > 0 && (<>
              <h3 className="sec-title">{b.activeTitle} <span className="count">{tx.length - nDone}</span></h3>
              {tx.filter((x) => !isDone(x)).length === 0 && <p className="muted">{b.activeEmpty}</p>}
              {tx.filter((x) => !isDone(x)).map((x) => <DeliveryCard key={x.transfer_id} x={x} moving={isMoving(x)} done={false} onArrived={() => delivered.mutate(x.transfer_id)} />)}
              <h3 className="sec-title">{b.receivedTitle} <span className="count">{nDone}</span></h3>
              {nDone === 0 && <p className="muted">{b.receivedEmpty}</p>}
              {tx.filter(isDone).map((x) => <DeliveryCard key={x.transfer_id} x={x} moving={false} done onArrived={() => {}} />)}
            </>)}
          </section>
        </>)}
      </div>{Side}</div>}
      {tab === "report" && (
        <section className="qsection report-section" style={{ maxWidth: 960 }}><ChatWidget facilityId={facilityId} names={Object.fromEntries(stock.map((s) => [s.commodity_id, s.commodity_name]))} withHeader /></section>
      )}
    </div>
  );
}

function DeliveryCard({ x, moving, done, onArrived }: { x: { transfer_id: string; commodity_id: string; commodity_name?: string; quantity: number; direction: "incoming" | "outgoing"; km: number; eta_days: number; from_name: string; to_name: string }; moving: boolean; done: boolean; onArrived: () => void }) {
  const { t } = useApp();
  const status = done ? t.deliveredStatus : moving ? t.onTheWay : t.awaitingApproval;
  return (
    <div className="tcard" style={{ cursor: "default" }}>
      <div className="tc-head">
        <div><div className="tc-title">{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")} <span className="qty-pill">+{x.quantity.toLocaleString("en-IN")}</span></div><div className="tc-sub">{x.quantity.toLocaleString("en-IN")} {x.quantity === 1 ? t.unit1 : t.units}</div></div>
        <div className="tc-meta"><span className={`chip ${x.direction === "incoming" ? "teal" : "amber"}`}>{x.direction === "incoming" ? t.incoming : t.outgoing}</span><span>{x.km} km · {x.eta_days} d</span></div>
      </div>
      <div className="tc-route"><span>{x.from_name}</span><span className="arrow" aria-hidden>→</span><strong>{x.to_name}</strong></div>
      <div className="tc-actions"><span className={`status-badge ${done ? "green" : moving ? "blue" : "amber"}`}>{status}</span>
        {x.direction === "incoming" && moving && <button className="btn emerald" style={{ marginLeft: "auto" }} onClick={onArrived}>{t.confirmArrived}</button>}
      </div>
    </div>
  );
}
