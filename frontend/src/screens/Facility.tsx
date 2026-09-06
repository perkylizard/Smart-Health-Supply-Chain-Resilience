import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Scale from "../components/Scale";
import ChatWidget from "../components/ChatWidget";

export default function Facility({ id }: { id: string }) {
  const { t } = useApp();
  const q = useQuery({ queryKey: ["facility", id], queryFn: () => api.facility(id) });
  if (!q.data) return <p className="skeleton" style={{ height: 120 }}>Loading facility</p>;
  const f = q.data.facility as Record<string, string | number>;
  const top = q.data.stock.slice(0, 5).map((s) => s.commodity_id);
  return (
    <div>
      <p><Link to={`/${f.unit_id}/${encodeURIComponent(String(f.district))}`}>← {String(f.district)}</Link></p>
      <h1>{String(f.name)} <span className="faint" style={{ fontSize: "var(--t-sm)", fontWeight: 400 }}>{String(f.type)} · {f.beds} {t.beds} · {f.dist_to_warehouse_km} km <Badge kind={f.source === "osm" ? "osm" : "simulated"} /></span></h1>
      <div className="two-col" style={{ marginTop: 20 }}>
        <div>
          <section className="section"><h2>{t.stock}</h2>
            <div className="list">{q.data.stock.map((s) => <div className="row" key={s.commodity_id} style={{ gridTemplateColumns: "1fr 220px auto" }}>
              <div><span className="name">{s.commodity_name}</span><div className="sub">{s.category} · {t.causes[s.cause] ?? ""}</div></div>
              <Scale days={s.days_of_stock} severity={s.severity} label={t.days} />
              <span className="faint" style={{ fontSize: 12 }}>{Math.round(s.closing).toLocaleString("en-IN")} on hand</span>
            </div>)}</div>
          </section>
          <section className="section"><h2>{t.forecast} <Badge kind="forecast" /></h2>
            <table className="table"><thead><tr><th>commodity</th>{[1,2,3,4,5,6,7,8].map((w) => <th key={w} className="num">w{w}</th>)}</tr></thead>
              <tbody>{top.map((c) => <tr key={c}><td>{c.replace(/_/g, " ")}</td>{q.data!.forecast.filter((x) => x.commodity_id === c).map((x) => <td key={x.week} className="num" title={`P90 ${x.p90.toFixed(0)}`}>{x.point.toFixed(0)}</td>)}</tr>)}</tbody></table>
          </section>
        </div>
        <aside>
          <section className="section"><h2>{t.staff}</h2>
            <table className="table"><thead><tr><th>cadre</th><th className="num">{t.sanctioned}</th><th className="num">{t.inPosition}</th><th className="num">{t.present}</th></tr></thead>
              <tbody>{q.data.staff.map((s) => <tr key={s.cadre}><td>{s.cadre.replace("_", " ")}</td><td className="num">{s.sanctioned}</td><td className="num">{s.in_position}</td><td className="num">{s.days_present}</td></tr>)}</tbody></table>
            <p className="faint" style={{ fontSize: 12 }}><Badge kind="simulated" /></p>
          </section>
          {q.data.beds && <section className="section"><h2>{t.beds}</h2>
            <div className="scale"><div className="track" style={{ background: "var(--paper-2)" }}><div className="fill green" style={{ width: `${Math.round(100 * q.data.beds.occupied / Math.max(1, q.data.beds.beds))}%` }} /></div><span className="days">{q.data.beds.occupied}/{q.data.beds.beds} {t.occupied}</span></div>
          </section>}
          <section className="section"><h2>{t.chatTitle}</h2><ChatWidget facilityId={id} /></section>
        </aside>
      </div>
    </div>
  );
}
