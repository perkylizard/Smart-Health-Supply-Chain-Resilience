import { CountHistory, DistrictRequestsView } from "../components/Requests";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { s2 } from "../strings2";
import { sB } from "../stringsB";
import Badge from "../components/Badge";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
const median = (xs: number[]) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
type DRow = { district: string; score: number | null; median_days_of_stock: number | null; red_alerts: number; staffing_gap?: number | null };

function Delta({ v, higherIsGood, fmt = (x: number) => String(Math.round(x)) }: { v: number; higherIsGood: boolean; fmt?: (x: number) => string }) {
  const { lang } = useApp(); const b = sB[lang];
  const even = Math.abs(v) < 0.5; const good = higherIsGood ? v > 0 : v < 0;
  return <span className={`delta-chip ${even ? "even" : good ? "good" : "bad"}`} title={even ? undefined : good ? b.better : b.worse}>{v > 0 ? "+" : ""}{fmt(v)}</span>;
}

export default function DmBrief() {
  const { unit, district, lang, t } = useApp();
  const b = sB[lang];
  const q = useQuery({ queryKey: ["brief", unit, district, lang], queryFn: () => api.brief(unit, district, lang) });
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const [reason, setReason] = useState("");
  const esc = useMutation({ mutationFn: () => api.escalate(unit, district, reason) });
  if (q.isError) return <div className="quiet">{t.offline}</div>;
  if (!q.data) return <p className="skeleton" style={{ height: 160 }}>Assembling the weekly brief for {district}</p>;
  const f = q.data.facts; const n = q.data.narrative;
  const rows = (d.data?.districts ?? []) as DRow[];
  const me = rows.find((r) => r.district === district);
  const ai = q.data.status === "ok";
  const digestLine = n?.sections?.[0]?.bullets?.slice(0, 2).join(" ") || `${f.counts.red ?? 0} items under 7 days, ${f.counts.amber ?? 0} under 14, across ${f.facilities} facilities.`;
  const bench = me ? [
    { k: b.bScore, v: me.score ?? 0, m: median(rows.map((r) => r.score ?? NaN)), good: true, fmt: (x: number) => String(Math.round(x)) },
    { k: b.bDays, v: me.median_days_of_stock ?? 0, m: median(rows.map((r) => r.median_days_of_stock ?? NaN)), good: true, fmt: (x: number) => String(Math.round(x)) },
    { k: b.bRed, v: me.red_alerts, m: median(rows.map((r) => r.red_alerts)), good: false, fmt: (x: number) => String(Math.round(x)) },
    ...(me.staffing_gap != null ? [{ k: b.bStaff, v: me.staffing_gap * 100, m: median(rows.map((r) => (r.staffing_gap ?? NaN) * 100)), good: false, fmt: (x: number) => `${Math.round(x)}%` }] : []),
  ] : [];
  return (
    <div className="pg">
      <section className="card">
        <div className="pg-head">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{b.dmEyebrow}</span><span aria-hidden> · </span>{q.data.generated}</p>
            <h1>{n?.title ?? `${t.brief}: ${district}`}</h1>
            <p className="sub">{f.facilities} {t.facilities} · {t.resilience} {f.score ? Math.round(f.score.score) : "…"}/100{f.rank ? `, ${t.rankOf(f.rank, f.of)}` : ""}{f.scenario.name !== "normal" && <span className="chip amber">{t.whatIf}</span>}<Badge kind={ai ? "ai" : "computed"} title={q.data.status} /></p>
          </div>
          <div className="pg-actions">
            <button className="btn" onClick={() => window.print()}>{b.printMemo}</button>
            <Dialog.Root onOpenChange={(o) => { if (!o && esc.isSuccess) { esc.reset(); setReason(""); } }}>
              <Dialog.Trigger asChild><button className="btn rose">{b.escalateState}</button></Dialog.Trigger>
              <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog mdl" aria-describedby={undefined}>
                <div className="mdl-head"><span className="mdl-icon rose" aria-hidden>!</span><div><Dialog.Title asChild><h2>{b.escalateTitle}</h2></Dialog.Title><p>{b.escalateHint}</p></div><Dialog.Close asChild><button className="mdl-x" aria-label={t.close}>×</button></Dialog.Close></div>
                <div className="mdl-body">
                  {esc.isSuccess ? <div className="saved-banner" role="status">✓ {b.sentOk}</div> : (<>
                    <textarea className="input" style={{ minHeight: 110, fontFamily: "inherit" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.escalateReason} aria-label={t.escalateReason} />
                    {esc.isError && <p className="muted" role="alert" style={{ color: "var(--red)" }}>{t.offline}</p>}
                  </>)}
                </div>
                <div className="mdl-foot">
                  <Dialog.Close asChild><button className="btn">{esc.isSuccess ? t.close : t.cancel}</button></Dialog.Close>
                  {!esc.isSuccess && <button className="btn rose" disabled={!reason.trim() || esc.isPending} onClick={() => esc.mutate()}>{esc.isPending ? "…" : b.send}</button>}
                </div>
              </Dialog.Content></Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </section>

      <section className="digest">
        <p className="eyebrow">{b.digest}</p>
        <h2>{n?.title ?? `${district}: ${f.counts.red ?? 0} ${t.severity.red}`}</h2>
        <p>{digestLine}</p>
        <p style={{ marginTop: 10 }}><Badge kind={ai ? "ai" : "computed"} title={q.data.status} /></p>
      </section>

      {bench.length > 0 && <section className="card">
        <div className="card-head"><div><h2>{b.benchTitle}</h2><p className="faint">{t.rankOf(f.rank ?? 0, f.of)}</p></div><Badge kind="computed" /></div>
        <div className="bench">
          {bench.map((x) => <div key={x.k} className="tile"><div className="tile-h"><span>{x.k}</span></div><div className="tile-n">{x.fmt(x.v)}<Delta v={x.v - x.m} higherIsGood={x.good} fmt={x.fmt} /></div><div className="tile-s">{b.stateMedian} <b>{x.fmt(x.m)}</b></div></div>)}
        </div>
      </section>}

      <div className="split">
        <div>
        <section className="card brief-sec">
          {n ? (<>{n.sections.map((s) => <div key={s.heading}><h2>{s.heading}</h2><ul>{s.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
            {n.next_week_risks?.length > 0 && !n.sections.some((s) => s.heading === t.riskNext) && <div><h2>{t.riskNext}</h2><ul>{n.next_week_risks.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}</ul></div>}</>) : (<>
            <h2>{t.stockPosition}</h2><ul><li>{f.counts.red ?? 0} items under 7 days, {f.counts.amber ?? 0} under 14, across {f.facilities} facilities.</li><li>Median stock {f.score ? Math.round(f.score.median_days_of_stock) : "…"} days; staffing gap {f.staffing_gap != null ? Math.round(f.staffing_gap * 100) : "…"}%.</li></ul>
            <h2>{t.actionsTaken}</h2><ul><li>{f.transfers_approved} transfers approved, {f.transfers_delivered} delivered this week.</li></ul>
            <h2>{t.riskNext}</h2><ul>{f.top_risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </>)}
        </section>
        <DistrictRequestsView unit={unit} district={district} />
        </div>
        <aside>
          <section className="card brief-sec">
            <h2>{t.dataQuality}</h2><ul><li>{f.data_issues} facility-commodity rows look like reporting errors and were excluded from alerts.</li></ul>
            <p style={{ margin: 0 }}><Link to={`/dm/${unit}/${encodeURIComponent(district)}/compare`}>{t.neighbours} →</Link></p>
          </section>
          <CountHistory unit={unit} district={district} />
        </aside>
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)" }}>{q.data.provenance}</p>
    </div>
  );
}

type CareFac = { facility_id: string; occupancy: number | null; doctor_absent: boolean; mo_in: number; mo_days: number };

export function DmCompare() {
  const { unit, district, t, lang } = useApp();
  const u = s2[lang]; const b = sB[lang];
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const dots = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district) });
  const care = useQuery({ queryKey: ["care", unit, district], queryFn: () => fetch(`${API}/care/${unit}/${encodeURIComponent(district)}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }) as Promise<{ facilities: CareFac[] }> });
  const [find, setFind] = useState("");
  const rows = [...(d.data?.districts ?? [])].sort((a, b2) => (b2.score ?? 0) - (a.score ?? 0));
  const idx = rows.findIndex((r) => r.district === district);
  const win = rows.slice(Math.max(0, idx - 4), idx + 5);
  const me = rows[idx];
  const medScore = median(rows.map((r) => r.score ?? 0));
  const medRed = median(rows.map((r) => r.red_alerts));
  const above = idx > 0 ? rows[idx - 1] : null, below = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;
  const careBy = new Map((care.data?.facilities ?? []).map((c) => [c.facility_id, c]));
  const facs = (dots.data?.facilities ?? []).filter((x) => x.facility_name.toLowerCase().includes(find.trim().toLowerCase()))
    .map((x) => { const c = careBy.get(x.facility_id); const occ = c?.occupancy ?? 0; const docOut = !!c && (c.mo_in === 0 || c.doctor_absent); const tier = x.red >= 5 || occ > 0.9 || (docOut && x.red >= 3) ? "high" : x.red > 0 || occ > 0.8 || docOut ? "watch" : "stable"; return { ...x, c, tier }; })
    .sort((a, b2) => ({ high: 0, watch: 1, stable: 2 }[a.tier]! - { high: 0, watch: 1, stable: 2 }[b2.tier]!) || b2.red - a.red);
  if (d.isLoading) return <p className="skeleton" style={{ height: 200 }}>Scoring every district</p>;
  if (d.isError) return <div className="quiet">{t.offline}</div>;
  return (
    <div className="pg">
      <section className="card">
        <div className="pg-head"><div><p className="eyebrow"><span className="eyebrow-accent">{b.dmEyebrow}</span></p><h1>{t.neighbours}</h1><p className="sub">{district} is {idx + 1} of {rows.length} on the resilience score.</p></div></div>
      </section>
      <div className="compare-layout">
        <section className="card">
          <table className="dtable"><thead><tr><th>#</th><th>{t.district}</th><th className="num">{u.colScore}</th><th className="num">{u.colDays}</th><th className="num">{u.colRed}</th></tr></thead>
            <tbody>{win.map((r) => <tr key={r.district} style={r.district === district ? { background: "var(--teal-soft)", fontWeight: 600 } : {}}><td className="num" style={{ textAlign: "left" }}>{rows.indexOf(r) + 1}</td><td>{r.district}</td><td className="num">{r.score == null ? "…" : Math.round(r.score)}</td><td className="num">{r.median_days_of_stock == null ? "…" : Math.round(r.median_days_of_stock)}</td><td className="num">{r.red_alerts}</td></tr>)}</tbody></table>
          <p className="faint" style={{ fontSize: "var(--t-xs)", marginBottom: 0 }}><Badge kind="computed" /></p>
        </section>
        {me && <aside>
          <section className="card side-card">
            <h2>{u.standsTitle(district)}</h2>
            <dl className="kv">
              <dt>{u.rank}</dt><dd><span className="big-fig">{idx + 1}</span><span className="faint"> / {rows.length}</span></dd>
              <dt>{u.scoreVsMedian}</dt><dd>{Math.round(me.score ?? 0)} <span className="faint">vs {Math.round(medScore)}</span><Delta v={(me.score ?? 0) - medScore} higherIsGood /></dd>
              <dt>{u.redVsMedian}</dt><dd>{me.red_alerts} <span className="faint">vs {Math.round(medRed)}</span><Delta v={me.red_alerts - medRed} higherIsGood={false} /></dd>
              <dt>{u.above}</dt><dd>{above ? `${above.district} (${Math.round(above.score ?? 0)})` : u.none}</dd>
              <dt>{u.below}</dt><dd>{below ? `${below.district} (${Math.round(below.score ?? 0)})` : u.none}</dd>
            </dl>
          </section>
        </aside>}
      </div>
      <section className="card">
        <div className="card-head"><div><h2>{b.facTitle(district)}</h2><p className="faint">{b.facSub}</p></div><Badge kind="simulated" /></div>
        <div className="toolbar"><span /><input className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={b.findFac} aria-label={b.findFac} /></div>
        {dots.isLoading && <p className="skeleton" style={{ height: 80 }}>…</p>}
        <div className="dtable-wrap">
          <table className="dtable stack"><thead><tr><th>{b.cFac}</th><th className="num">{b.cBeds}</th><th className="num">{b.cOcc}</th><th>{b.cDoc}</th><th className="num">{b.cWorst}</th><th className="num">{b.cRed}</th><th>{b.cTier}</th></tr></thead>
            <tbody>{facs.slice(0, 40).map((x) => <tr key={x.facility_id}>
              <td className="full"><Link to={`/facility/${x.facility_id}`} className="med-name" style={{ color: "inherit" }}>{x.facility_name}</Link><div className="med-sub">{x.type}</div></td>
              <td className="num">{x.beds}</td>
              <td className="num" style={{ color: (x.c?.occupancy ?? 0) > 0.9 ? "var(--red)" : (x.c?.occupancy ?? 0) > 0.8 ? "var(--amber)" : undefined }}>{x.c?.occupancy != null ? `${Math.round(x.c.occupancy * 100)}%` : care.isLoading ? "…" : "—"}</td>
              <td>{x.c ? <span className={`status-badge ${x.c.mo_in === 0 || x.c.doctor_absent ? "red" : "green"}`}>{x.c.mo_in === 0 || x.c.doctor_absent ? b.docNo : b.docYes}</span> : <span className="faint">{care.isLoading ? "…" : "—"}</span>}</td>
              <td className="num" style={{ color: x.worst_days < 7 ? "var(--red)" : undefined }}>{Math.round(x.worst_days)} {t.days}</td>
              <td className="num">{x.red}</td>
              <td><span className={`status-badge ${x.tier === "high" ? "red" : x.tier === "watch" ? "amber" : "green"}`}>{x.tier === "high" ? b.tierHigh : x.tier === "watch" ? b.tierWatch : b.tierStable}</span></td>
            </tr>)}</tbody></table>
        </div>
        {dots.data && facs.length === 0 && <p className="muted">{b.noMatch}</p>}
      </section>
    </div>
  );
}
