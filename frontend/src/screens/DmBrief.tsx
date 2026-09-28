import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";

export default function DmBrief() {
  const { unit, district, lang, t } = useApp();
  const b = useQuery({ queryKey: ["brief", unit, district, lang], queryFn: () => api.brief(unit, district, lang) });
  const [reason, setReason] = useState("");
  const esc = useMutation({ mutationFn: () => api.escalate(unit, district, reason) });
  if (!b.data) return <p className="skeleton" style={{ height: 160 }}>Assembling the weekly brief for {district}</p>;
  const f = b.data.facts; const n = b.data.narrative;
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1>{n?.title ?? `${t.brief}: ${district}`}</h1>
        <span style={{ display: "flex", gap: 8 }}><button className="btn" onClick={() => window.print()}>{t.printBrief}</button><Badge kind={b.data.status === "ok" ? "ai" : "computed"} title={b.data.status} /></span>
      </div>
      <p className="muted">{b.data.generated} · {f.facilities} {t.facilities} · {t.resilience} {f.score ? Math.round(f.score.score) : "…"}/100{f.rank ? `, ${t.rankOf(f.rank, f.of)}` : ""}{f.scenario.name !== "normal" && <span className="chip amber" style={{ marginLeft: 8 }}>{t.whatIf}</span>}</p>
      <div className="two-col" style={{ marginTop: 16 }}>
        <div>
          {n ? (<>{n.sections.map((s) => <section key={s.heading} className="section"><h2>{s.heading}</h2><ul style={{ paddingLeft: 18 }}>{s.bullets.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}</ul></section>)}
            {n.next_week_risks?.length > 0 && !n.sections.some((s) => s.heading === t.riskNext) && <section className="section"><h2>{t.riskNext}</h2><ul style={{ paddingLeft: 18 }}>{n.next_week_risks.slice(0, 5).map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}</ul></section>}</>) : (<>
            <section className="section"><h2>{t.stockPosition}</h2><ul style={{ paddingLeft: 18 }}><li>{f.counts.red ?? 0} items under 7 days, {f.counts.amber ?? 0} under 14, across {f.facilities} facilities.</li><li>Median stock {f.score ? Math.round(f.score.median_days_of_stock) : "…"} days; staffing gap {f.staffing_gap != null ? Math.round(f.staffing_gap * 100) : "…"}%.</li></ul></section>
            <section className="section"><h2>{t.actionsTaken}</h2><ul style={{ paddingLeft: 18 }}><li>{f.transfers_approved} transfers approved, {f.transfers_delivered} delivered this week.</li></ul></section>
            <section className="section"><h2>{t.riskNext}</h2><ul style={{ paddingLeft: 18 }}>{f.top_risks.map((r, i) => <li key={i}>{r}</li>)}</ul></section>
            <section className="section"><h2>{t.dataQuality}</h2><ul style={{ paddingLeft: 18 }}><li>{f.data_issues} facility-commodity rows look like reporting errors and were excluded from alerts.</li></ul></section>
          </>)}
        </div>
        <aside>
          <section className="section card">
            <h2>{t.escalate}</h2>
            <textarea className="input" style={{ minHeight: 90, fontFamily: "inherit" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.escalateReason} />
            <button className="btn primary" style={{ marginTop: 8 }} disabled={!reason.trim() || esc.isSuccess} onClick={() => esc.mutate()}>{esc.isSuccess ? t.escalated : t.escalate}</button>
            <p className="faint" style={{ fontSize: 12 }}>The state officer sees escalations on the State screen.</p>
          </section>
          <p><Link to={`/dm/${unit}/${encodeURIComponent(district)}/compare`}>{t.neighbours} →</Link></p>
        </aside>
      </div>
      <p className="faint" style={{ fontSize: 12 }}>{b.data.provenance}</p>
    </div>
  );
}

export function DmCompare() {
  const { unit, district, t } = useApp();
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const rows = [...(d.data?.districts ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const idx = rows.findIndex((r) => r.district === district);
  const window = rows.slice(Math.max(0, idx - 4), idx + 5);
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginBottom: 12 }}>{t.neighbours}</h1>
      <p className="muted">{district} is {idx + 1} of {rows.length} on the resilience score.</p>
      <table className="table"><thead><tr><th>#</th><th>{t.district}</th><th className="num">score</th><th className="num">median {t.days}</th><th className="num">red</th></tr></thead>
        <tbody>{window.map((r) => <tr key={r.district} style={r.district === district ? { background: "var(--teal-soft)" } : {}}><td>{rows.indexOf(r) + 1}</td><td>{r.district}</td><td className="num">{r.score == null ? "…" : Math.round(r.score)}</td><td className="num">{r.median_days_of_stock == null ? "…" : Math.round(r.median_days_of_stock)}</td><td className="num">{r.red_alerts}</td></tr>)}</tbody></table>
      <p className="faint" style={{ fontSize: 12 }}><Badge kind="computed" /></p>
    </div>
  );
}
