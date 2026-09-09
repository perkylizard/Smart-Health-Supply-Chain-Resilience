import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type DistrictRow, type FacilityDot, type Transfer } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";

function scoreSeverity(s: number | null): FacilityDot["worst_severity"] { return s == null ? "data_issue" : s < 45 ? "red" : s < 60 ? "amber" : "ok"; }

export default function StateView() {
  const { unit, t } = useApp();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const tr = useQuery({ queryKey: ["unitTransfers", unit], queryFn: () => api.unitTransfers(unit) });
  const esc = useQuery({ queryKey: ["escalations", unit], queryFn: () => api.escalations(unit), refetchInterval: 15_000 });
  const [local, setLocal] = useState<Record<string, string>>({});
  const approve = useMutation({ mutationFn: (id: string) => api.approve(id), onMutate: (id) => setLocal((l) => ({ ...l, [id]: "approved" })), onSettled: () => qc.invalidateQueries({ queryKey: ["unitTransfers"] }) });
  const dots = useMemo<FacilityDot[]>(() => (d.data?.districts ?? []).map((x: DistrictRow) => ({
    facility_id: x.district, facility_name: x.district, type: "DH", lat: x.lat, lon: x.lon, worst_severity: scoreSeverity(x.score), worst_days: x.median_days_of_stock ?? 0,
    worst_commodity: "", red: x.red_alerts, amber: 0, data_issues: 0, source: "computed", dist_to_warehouse_km: 0, beds: 0,
  })), [d.data]);
  const worst = [...(d.data?.districts ?? [])].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5);
  const transfers = (tr.data?.transfers ?? []).map((x: Transfer) => ({ ...x, status: local[x.transfer_id] ?? x.status }));
  return (
    <div className="two-col">
      <div>
        <section className="qsection">
          <h2>{t.stateTab} <span className="count">{d.data ? `${d.data.districts.length} ${t.districtsTab.toLowerCase()}` : ""}</span></h2>
          {dots.length > 0 && <MapView dots={dots} />}
          <div className="legend">
            <span><i className="dot" style={{ background: "var(--red)" }} />score under 45</span><span><i className="dot" style={{ background: "var(--amber)" }} />45 to 60</span><span><i className="dot" style={{ background: "var(--green)" }} />over 60</span>
          </div>
          <p className="faint" style={{ fontSize: 13 }}>{worst.length > 0 && <>Lowest: {worst.map((w) => <Link key={w.district} to={`/dho/${unit}/${encodeURIComponent(w.district)}`} style={{ marginRight: 10 }}>{w.district} {Math.round(w.score ?? 0)}</Link>)}</>}</p>
        </section>
        <section className="qsection">
          <h2>{t.crossDistrict} <span className="count">{transfers.filter((x) => x.status === "proposed").length}</span></h2>
          {tr.isLoading && <p className="skeleton" style={{ height: 60 }}>Running the optimiser across the worst districts</p>}
          {tr.data && transfers.length === 0 && <div className="quiet">No cross-district transfer is needed in the worst districts right now.</div>}
          {transfers.slice(0, 20).map((x) => (
            <div key={x.transfer_id} className="tcard">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="qty">{x.quantity} <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>{x.commodity_id.replace(/_/g, " ")}</span></span><span className="faint" style={{ fontSize: 13 }}>{x.km} km · {x.eta_days} d</span></div>
              <div style={{ margin: "6px 0" }}>{x.from_name} <span className="faint">({x.from_district})</span> <span className="faint">→</span> <strong>{x.to_name}</strong> <span className="faint">({x.to_district})</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}><div><span className="faint">donor after</span><Scale days={x.donor_days_after} severity="ok" label={t.days} /></div><div><span className="faint">recipient after</span><Scale days={x.recipient_days_after} severity="ok" label={t.days} /></div></div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                {x.status === "proposed" ? <button className="btn primary" onClick={() => approve.mutate(x.transfer_id)}>{t.approve}</button> : <span className="chip green">{x.status}</span>}
                <Explain kind="transfer" item={x}><button className="btn quiet" style={{ color: "var(--teal)" }}>{t.whyLink}</button></Explain>
                <Badge kind="computed" />
              </div>
            </div>
          ))}
        </section>
      </div>
      <aside>
        <section className="section">
          <h2>{t.escalationsTitle} <span className="faint">{esc.data?.escalations.length ?? 0}</span></h2>
          {esc.data && esc.data.escalations.length === 0 && <p className="muted">None yet. District Magistrates escalate from their weekly brief.</p>}
          {esc.data?.escalations.map((e, i) => <div key={i} className="card" style={{ marginBottom: 8 }}><strong>{e.district}</strong><p style={{ margin: "4px 0 0" }}>{e.reason}</p><p className="faint" style={{ fontSize: 12, margin: "4px 0 0" }}>{new Date(e.received * 1000).toLocaleString("en-IN")}</p></div>)}
        </section>
        <section className="section">
          <h2>{t.leagueTitle}</h2>
          <LeagueTable rows={[...(d.data?.districts ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 12)} />
          <p><Link to={`/state/${unit}/districts`}>All districts →</Link></p>
        </section>
      </aside>
    </div>
  );
}

function LeagueTable({ rows }: { rows: DistrictRow[] }) {
  const { unit, t } = useApp();
  return (
    <table className="table"><thead><tr><th>#</th><th>{t.district}</th><th className="num">score</th><th className="num">median {t.days}</th><th className="num">red</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.district}><td>{i + 1}</td><td><Link to={`/dho/${unit}/${encodeURIComponent(r.district)}`}>{r.district}</Link></td><td className="num">{r.score == null ? "…" : Math.round(r.score)}</td><td className="num">{r.median_days_of_stock == null ? "…" : Math.round(r.median_days_of_stock)}</td><td className="num">{r.red_alerts}</td></tr>)}</tbody></table>
  );
}

export function DistrictsTable() {
  const { unit, t } = useApp();
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const [sort, setSort] = useState<"score" | "red_alerts" | "median_days_of_stock">("score");
  const rows = [...(d.data?.districts ?? [])].sort((a, b) => sort === "score" ? (b.score ?? 0) - (a.score ?? 0) : sort === "red_alerts" ? b.red_alerts - a.red_alerts : (b.median_days_of_stock ?? 0) - (a.median_days_of_stock ?? 0));
  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>{t.leagueTitle}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{(["score", "red_alerts", "median_days_of_stock"] as const).map((k) => <button key={k} className="chip" style={sort === k ? { background: "var(--teal-soft)" } : {}} onClick={() => setSort(k)}>{k.replace(/_/g, " ")}</button>)}</div>
      <LeagueTable rows={rows} />
      <p className="faint" style={{ fontSize: 12 }}>Score: median days of stock 40, share under 14 days 20, staffing gap 20, transfer latency 10, reporting 10. <Badge kind="computed" /></p>
    </div>
  );
}
