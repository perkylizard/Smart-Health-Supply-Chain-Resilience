import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type FacilityDot, type NationalState } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import MapView from "../components/MapView";
import { s2 } from "../strings2";
import { sA } from "../stringsA";

function sev(m: number): FacilityDot["worst_severity"] { return m < 1 ? "red" : m < 2 ? "amber" : "ok"; }

export default function NationalView() {
  const { t, basis, setBasis, lang } = useApp();
  const u = s2[lang];
  const q = useQuery({ queryKey: ["national", basis], queryFn: () => api.nationalStates(basis) });
  const [picked, setPicked] = useState<string | null>(null);
  const dq = useQuery({ queryKey: ["nationalDistricts", picked, basis], queryFn: () => api.nationalDistricts(picked!, basis), enabled: !!picked });
  const badge = basis === "real" ? "real" : "simulated";
  const dots = useMemo<FacilityDot[]>(() => (q.data?.states ?? []).filter((s: NationalState) => s.lat != null).map((s) => ({
    facility_id: s.state, facility_name: s.state, type: s.phc_level_available ? "DH" : "CHC", lat: s.lat!, lon: s.lon!, worst_severity: sev(s.median_months_of_stock), worst_days: s.median_months_of_stock * 30,
    worst_commodity: "", red: 0, amber: 0, data_issues: 0, source: basis, dist_to_warehouse_km: 0, beds: 0 })), [q.data, basis]);
  const a = sA[lang];
  const states = q.data?.states ?? [];
  const med = (xs: number[]) => { const v = [...xs].sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const natMed = med(states.map((x) => x.median_months_of_stock));
  const under = states.length ? states.reduce((acc, x) => acc + x.share_districts_under_1_month * x.districts, 0) / Math.max(1, states.reduce((acc, x) => acc + x.districts, 0)) : null;
  return (
    <div className="pg in">
      <h1 className="sr-only">{t.indiaTitle}</h1>
      <section className="card pg-hero">
        <div className="pg-hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{a.inEyebrow}</span><span aria-hidden> · </span>{q.data ? q.data.month : "…"}</p>
            <h2 className="pg-h1">{t.indiaTitle}</h2>
            <p className="faint pg-sub">{a.inSub}</p>
          </div>
          <div className="seg" role="tablist" aria-label={t.basisHint}>
            <button role="tab" aria-selected={basis === "real"} className={basis === "real" ? "on" : ""} onClick={() => setBasis("real")}>{t.basisReal}</button>
            <button role="tab" aria-selected={basis === "simulated"} className={basis === "simulated" ? "on" : ""} onClick={() => setBasis("simulated")} title={t.basisSimulatedHint}>{t.basisSimulated}</button>
          </div>
        </div>
        <div className="tiles tiles-3">
          <div className="tile"><div className="tile-h"><span>{a.tileStates}</span><Badge kind={badge} /></div><div className="tile-n">{q.data ? states.length : "…"} <small>/ 36</small></div><div className="tile-s">{q.data ? u.reporting(states.length, 36) : ""}</div></div>
          <div className="tile"><div className="tile-h"><span>{a.tileNatStock}</span><Badge kind={badge} /></div><div className="tile-n">{natMed != null ? natMed.toFixed(1) : "…"} <small>{a.months}</small></div><div className="tile-s">{a.tileNatStockSub}</div></div>
          <div className="tile"><div className="tile-h"><span>{a.tileUnder}</span><Badge kind={badge} /></div><div className="tile-n">{under != null ? `${Math.round(under * 100)}%` : "…"}</div><div className="tile-s">{a.tileUnderSub}</div></div>
        </div>
      </section>
      <div className="pg-grid">
        <div>
          <section className="card">
            <div className="card-head"><div><h2>{t.indiaTitle}</h2><p className="faint">{q.data ? `${u.reporting(states.length, 36)} · ${q.data.month}` : ""}</p></div></div>
            {q.isLoading && <p className="skeleton" style={{ height: 240 }}>…</p>}
            {dots.length > 0 && <MapView dots={dots} center={[80, 22]} onSelect={(f) => setPicked(f.facility_id)} />}
            <div className="legend"><span><i className="dot" style={{ background: "var(--red)" }} />under 1 {t.monthsOfStock}</span><span><i className="dot" style={{ background: "var(--amber)" }} />1 to 2</span><span><i className="dot" style={{ background: "var(--green)" }} />over 2</span><span className="faint">larger dot = {t.phcLevel}</span></div>
            <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 8 }}>{q.data?.provenance} <Badge kind={badge} /></p>
          </section>
          {!picked && <p className="muted in-hint">{u.tapState}</p>}
          {picked && (
            <section className="card">
              <div className="card-head"><div><h2>{picked}</h2><p className="faint">{dq.data ? `${dq.data.districts.length} districts` : "…"}</p></div></div>
              {dq.isLoading && <p className="skeleton" style={{ height: 120 }}>…</p>}
              {dq.data && <div className="tbl-wrap"><table className="table"><thead><tr><th>district</th><th className="num">{t.monthsOfStock}</th>{basis === "simulated" && <th className="num" title="closing stock / mean of the next 3 forecast months (BigQuery TimesFM on the simulated series)">{t.forecastMonths}</th>}<th className="num">items reported</th>{basis === "real" && <th className="num">HMIS stock-out reports</th>}<th></th></tr></thead>
                <tbody>{dq.data.districts.map((d) => <tr key={d.district}><td>{d.district}</td><td className="num">{d.months_of_stock == null ? "…" : d.months_of_stock.toFixed(1)}</td>{basis === "simulated" && <td className="num">{d.forecast_months_of_stock == null ? "…" : d.forecast_months_of_stock.toFixed(1)}</td>}<td className="num">{d.items_reported}</td>{basis === "real" && <td className="num">{d.stockout_reports ?? "…"}</td>}<td>{d.unit_id ? <Link to={`/dho/${d.unit_id}/${encodeURIComponent(d.district)}`}>{t.phcLevel} →</Link> : <span className="faint">{t.districtLevel}</span>}</td></tr>)}</tbody></table></div>}
              <p className="faint" style={{ fontSize: "var(--t-xs)" }}>{dq.data?.provenance} {dq.data && <Badge kind={basis === "simulated" ? "forecast" : "real"} />}</p>
            </section>
          )}
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><div><h2>States by {t.monthsOfStock}</h2></div></div>
            <div className="tbl-wrap"><table className="table states-table"><thead><tr><th>{u.stateCol}</th><th className="num">{u.medianCol}</th><th className="num">{t.underOneMonth}</th></tr></thead>
              <tbody>{states.map((st) => <tr key={st.state} aria-selected={picked === st.state} tabIndex={0} onClick={() => setPicked(st.state)} onKeyDown={(e) => { if (e.key === "Enter") setPicked(st.state); }}>
                <td><span className="state-name">{st.state}</span>{st.phc_level_available && <span className="state-sub">{u.phcDetail}</span>}</td>
                <td className="num"><span style={{ color: st.median_months_of_stock < 1 ? "var(--red)" : st.median_months_of_stock < 2 ? "var(--amber)" : "var(--green)", fontWeight: 700 }}>{st.median_months_of_stock.toFixed(1)}</span></td>
                <td className="num">{Math.round(st.share_districts_under_1_month * 100)}%</td></tr>)}</tbody></table></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
