import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Alert } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Scale from "../components/Scale";
import ChatWidget from "../components/ChatWidget";
import { RequestDialog } from "../components/Requests";
import { sB } from "../stringsB";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
type CareRow = { facility_id: string; bed_alert: boolean; doctor_absent: boolean; mo_in: number; refer_name: string | null; refer_km: number | null; refer_free_beds: number | null };
const statusOf = (a: Alert): [string, keyof typeof sB.en] => a.severity === "data_issue" ? ["blue", "stData"] : a.severity === "red" ? ["red", "stCritical"] : a.severity === "amber" ? ["amber", "stWarn"] : ["green", "stOk"];

export default function Facility({ id }: { id: string }) {
  const { t, lang, base } = useApp();
  const b = sB[lang];
  const q = useQuery({ queryKey: ["facility", id], queryFn: () => api.facility(id) });
  const f0 = q.data?.facility as Record<string, string | number> | undefined;
  const care = useQuery({
    queryKey: ["care", f0?.unit_id, f0?.district], enabled: !!f0,
    queryFn: () => fetch(`${API}/care/${f0!.unit_id}/${encodeURIComponent(String(f0!.district))}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }) as Promise<{ facilities: CareRow[] }>,
  });
  if (q.isError) return <div className="quiet">{t.offline}</div>;
  if (!q.data || !f0) return <p className="skeleton" style={{ height: 120 }}>Loading facility</p>;
  const f = f0;
  const top = q.data.stock.slice(0, 5).map((s) => s.commodity_id);
  const nameOf = new Map(q.data.stock.map((s) => [s.commodity_id, s.commodity_name]));
  const beds = q.data.beds; const occ = beds ? beds.occupied / Math.max(1, beds.beds) : 0;
  const cr = care.data?.facilities.find((c) => c.facility_id === id);
  const mo = q.data.staff.find((s) => s.cadre.toLowerCase().startsWith("mo") || s.cadre.toLowerCase().includes("medical"));
  const moIn = cr ? cr.mo_in > 0 : mo ? mo.in_position > 0 : null;
  const options = [...q.data.stock].sort((a, c) => a.days_of_stock - c.days_of_stock).map((s) => ({ id: s.commodity_id, name: s.commodity_name }));
  return (
    <div className="pg">
      <section className="card">
        <p style={{ margin: "0 0 8px" }}><Link to={base}>← {b.backTo(String(f.district))}</Link></p>
        <div className="pg-head">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{String(f.type)}</span><span aria-hidden> · </span>{String(f.district)}</p>
            <h1>{String(f.name)}</h1>
            <p className="sub"><span className="chip">{String(f.type)}</span> {f.beds} {t.beds} · {b.kmStore(Number(f.dist_to_warehouse_km))} <Badge kind={f.source === "osm" ? "osm" : "simulated"} /></p>
          </div>
          <div className="pg-actions"><RequestDialog facilityId={id} facilityName={String(f.name)} options={options}><button className="btn primary">+ {b.requestFor}</button></RequestDialog></div>
        </div>
      </section>

      <div className="cap-grid">
        <section className="card">
          <div className="card-head"><h2>{b.bedsCard}</h2><Badge kind="simulated" /></div>
          {beds ? (<>
            <p className={`cap-big ${occ > 0.9 ? "red" : occ > 0.8 ? "amber" : "green"}`}>{Math.round(occ * 100)}%<small> · {beds.occupied} / {beds.beds} {t.occupied}</small></p>
            {cr?.bed_alert ? <p className="referral hot">{cr.refer_name ? b.referral(cr.refer_name, Math.round(cr.refer_km ?? 0), cr.refer_free_beds ?? 0) : b.noReferral}</p> : <p className="referral calm">{b.bedsOk}</p>}
          </>) : <p className="muted">…</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>{b.staffCard}</h2>{moIn != null && <span className={`status-badge ${moIn ? (cr?.doctor_absent ? "amber" : "green") : "red"}`}>{moIn ? b.moIn : b.moOut}{moIn && cr?.doctor_absent ? ` · ${b.docNo}` : ""}</span>}</div>
          <table className="dtable"><thead><tr><th>cadre</th><th className="num">{t.sanctioned}</th><th className="num">{t.inPosition}</th><th className="num">{t.present}</th></tr></thead>
            <tbody>{q.data.staff.map((s) => <tr key={s.cadre}><td>{s.cadre.replace("_", " ")}</td><td className="num">{s.sanctioned}</td><td className="num" style={{ color: s.in_position < s.sanctioned ? "var(--amber)" : undefined }}>{s.in_position}</td><td className="num">{s.days_present}</td></tr>)}</tbody></table>
          <p className="faint" style={{ fontSize: "var(--t-xs)", marginBottom: 0 }}><Badge kind="simulated" /></p>
        </section>
      </div>

      <div className="split">
        <div>
          <section className="card">
            <div className="card-head"><div><h2>{t.stock}</h2><p className="faint">{b.stockCardSub}</p></div></div>
            <div className="dtable-wrap"><table className="dtable stack"><thead><tr><th>{b.colMedicine}</th><th className="hide-sm">{b.colCategory}</th><th className="num">{b.colOnHand}</th><th>{b.colDays}</th><th>{b.colStatus}</th></tr></thead>
              <tbody>{q.data.stock.map((s) => { const [tone, key] = statusOf(s); return <tr key={s.commodity_id}>
                <td className="full"><span className="med-name">{s.commodity_name}</span>{t.causes[s.cause] ? <div className="med-sub">{t.causes[s.cause]}</div> : null}</td>
                <td className="hide-sm">{b.cat[s.category] ?? s.category}</td>
                <td className="num">{Math.round(s.closing).toLocaleString("en-IN")}</td>
                <td><Scale days={s.days_of_stock} severity={s.severity} label={t.days} /></td>
                <td><span className={`status-badge ${tone}`}>{b[key] as string}</span></td>
              </tr>; })}</tbody></table></div>
          </section>
          <section className="card">
            <div className="card-head"><h2>{t.forecast}</h2><Badge kind="forecast" /></div>
            <div className="dtable-wrap"><table className="dtable"><thead><tr><th>{b.colMedicine}</th>{[1, 2, 3, 4, 5, 6, 7, 8].map((w) => <th key={w} className="num">w{w}</th>)}</tr></thead>
              <tbody>{top.map((c) => <tr key={c}><td>{nameOf.get(c) ?? c.replace(/_/g, " ")}</td>{q.data!.forecast.filter((x) => x.commodity_id === c).map((x) => <td key={x.week} className="num" title={`P90 ${x.p90.toFixed(0)}`}>{x.point.toFixed(0)}</td>)}</tr>)}</tbody></table></div>
          </section>
        </div>
        <aside>
          <section className="card"><div className="card-head"><h2>{t.chatTitle}</h2></div><ChatWidget facilityId={id} /></section>
        </aside>
      </div>
    </div>
  );
}
