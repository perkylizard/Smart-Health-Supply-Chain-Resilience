import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type FacilityDot, type NationalState } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import MapView from "../components/MapView";

function sev(m: number): FacilityDot["worst_severity"] { return m < 1 ? "red" : m < 2 ? "amber" : "ok"; }

export default function NationalView() {
  const { t, basis, setBasis } = useApp();
  const q = useQuery({ queryKey: ["national", basis], queryFn: () => api.nationalStates(basis) });
  const [picked, setPicked] = useState<string | null>(null);
  const dq = useQuery({ queryKey: ["nationalDistricts", picked, basis], queryFn: () => api.nationalDistricts(picked!, basis), enabled: !!picked });
  const badge = basis === "real" ? "real" : "simulated";
  const dots = useMemo<FacilityDot[]>(() => (q.data?.states ?? []).filter((s: NationalState) => s.lat != null).map((s) => ({
    facility_id: s.state, facility_name: s.state, type: s.phc_level_available ? "DH" : "CHC", lat: s.lat!, lon: s.lon!, worst_severity: sev(s.median_months_of_stock), worst_days: s.median_months_of_stock * 30,
    worst_commodity: "", red: 0, amber: 0, data_issues: 0, source: basis, dist_to_warehouse_km: 0, beds: 0 })), [q.data, basis]);
  return (
    <div className="two-col">
      <div>
        <section className="qsection">
          <h2>{t.indiaTitle} <span className="count">{q.data ? `${q.data.states.length} states, ${t.indiaMonth.toLowerCase()}: ${q.data.month}` : ""}</span></h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button className="chip" aria-pressed={basis === "real"} onClick={() => setBasis("real")}>{t.basisReal}</button>
            <button className="chip" aria-pressed={basis === "simulated"} onClick={() => setBasis("simulated")} title={t.basisSimulatedHint}>{t.basisSimulated}</button>
          </div>
          {dots.length > 0 && <MapView dots={dots} center={[80, 22]} onSelect={(f) => setPicked(f.facility_id)} />}
          <div className="legend"><span><i className="dot" style={{ background: "var(--red)" }} />under 1 {t.monthsOfStock}</span><span><i className="dot" style={{ background: "var(--amber)" }} />1 to 2</span><span><i className="dot" style={{ background: "var(--green)" }} />over 2</span><span className="faint">larger dot = {t.phcLevel}</span></div>
          <p className="faint" style={{ fontSize: 12 }}>{q.data?.provenance} <Badge kind={badge} /></p>
        </section>
        {picked && (
          <section className="qsection">
            <h2>{picked} <span className="count">{dq.data ? `${dq.data.districts.length} districts` : ""}</span></h2>
            {dq.data && <table className="table"><thead><tr><th>district</th><th className="num">{t.monthsOfStock}</th>{basis === "simulated" && <th className="num" title="closing stock / mean of the next 3 forecast months (BigQuery TimesFM on the simulated series)">{t.forecastMonths}</th>}<th className="num">items reported</th>{basis === "real" && <th className="num">HMIS stock-out reports</th>}<th></th></tr></thead>
              <tbody>{dq.data.districts.map((d) => <tr key={d.district}><td>{d.district}</td><td className="num">{d.months_of_stock == null ? "…" : d.months_of_stock.toFixed(1)}</td>{basis === "simulated" && <td className="num">{d.forecast_months_of_stock == null ? "…" : d.forecast_months_of_stock.toFixed(1)}</td>}<td className="num">{d.items_reported}</td>{basis === "real" && <td className="num">{d.stockout_reports ?? "…"}</td>}<td>{d.unit_id ? <Link to={`/dho/${d.unit_id}/${encodeURIComponent(d.district)}`}>{t.phcLevel} →</Link> : <span className="faint">{t.districtLevel}</span>}</td></tr>)}</tbody></table>}
            <p className="faint" style={{ fontSize: 12 }}>{dq.data?.provenance}</p>
          </section>
        )}
      </div>
      <aside>
        <section className="section">
          <h2>States by {t.monthsOfStock}</h2>
          <table className="table"><thead><tr><th>state</th><th className="num">median</th><th className="num">{t.underOneMonth}</th></tr></thead>
            <tbody>{(q.data?.states ?? []).map((s) => <tr key={s.state} style={{ cursor: "pointer" }} onClick={() => setPicked(s.state)}><td>{s.state}{s.phc_level_available && <span className="chip teal" style={{ marginLeft: 6, fontSize: 10 }}>PHC</span>}</td><td className="num">{s.median_months_of_stock.toFixed(1)}</td><td className="num">{Math.round(s.share_districts_under_1_month * 100)}%</td></tr>)}</tbody></table>
        </section>
      </aside>
    </div>
  );
}
