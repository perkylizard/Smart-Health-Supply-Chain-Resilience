import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, type Alert } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";
import Sparkline from "../components/Sparkline";
import CarePanel from "../components/CarePanel";
import { CountHistory, RequestsInbox, RequestsWaiting } from "../components/Requests";
import ResilienceAlerts from "../components/ResilienceAlerts";

export default function Briefing() {
  const { unit, district, lang, t, base } = useApp();
  const nav = useNavigate();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["summary", unit, district], queryFn: () => api.summary(unit, district), enabled: !!district,
    refetchInterval: (q) => (q.state.data?.rank_pending ? 6000 : false) });
  const dots = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district), enabled: !!district });
  const brief = useQuery({ queryKey: ["briefing", unit, district, lang, summary.data?.scenario.updated], queryFn: () => api.briefing(unit, district, lang), enabled: !!summary.data });
  const transfers = useQuery({ queryKey: ["transfers", unit, district, undefined], queryFn: () => api.transfers(unit, district), enabled: !!summary.data });
  const care = useQuery({ queryKey: ["careTotals", unit, district], queryFn: () => fetch(`${(import.meta.env.VITE_API_URL as string | undefined) ?? "/api"}/care/${unit}/${encodeURIComponent(district)}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }) as Promise<{ summary: { beds: number; occupied: number; occupancy: number | null; staff_alerts: number; vacancy_share: number | null; facilities: number } }> });
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const approve = useMutation({ mutationFn: (id: string) => api.approve(id), onSettled: () => { qc.invalidateQueries({ queryKey: ["transfers"] }); qc.invalidateQueries({ queryKey: ["resilience"] }); } });
  const [showAll, setShowAll] = useState(false);
  const s = summary.data;
  const perFacility: Record<string, number> = {};
  const alerts = (s?.alerts ?? []).filter((a) => a.alert).filter((a) => { perFacility[a.facility_id] = (perFacility[a.facility_id] ?? 0) + 1; return perFacility[a.facility_id] <= 3; });
  const whatIf = s && s.scenario.name !== "normal";
  const proposed = (transfers.data?.transfers ?? []).filter((x) => x.status === "proposed");
  const stateName = units.data?.units.find((u) => u.unit_id === unit)?.state ?? "";
  const c = care.data?.summary;
  const opd = s?.sparklines.opd ?? [];
  return (
    <div className="today">
      <div className="rw-phone"><RequestsWaiting unit={unit} district={district} /></div>
      {whatIf && <p className="chip amber" style={{ marginBottom: 12 }}>{t.whatIf}: {s.scenario.name.replace(/_/g, " ")} {Math.round(s.scenario.intensity * 100)}%</p>}

      {/* hero: where you are, how the district stands, the four numbers that matter */}
      <section className="card hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{stateName} {t.networkLbl}</span><span aria-hidden> · </span>{t.cockpitLbl}</p>
            <h1>{t.districtSystem(district)}</h1>
            <p className="faint hero-sub">{s ? t.heroSub(s.facilities) : "…"}</p>
          </div>
          <div className="hero-right">
            <div className="score-box">
              <div><span className="lbl">{t.resilienceLbl}</span><span className="big">{s?.score ? Math.round(s.score.score) : "…"}<small> / 100</small></span></div>
              <div className="vr" />
              <div><span className="lbl">{t.leagueLbl}</span><span className="rank">{s?.rank_in_unit ? <>#{s.rank_in_unit} <small>{t.ofN} {s.of}</small></> : <span className="faint">…</span>}</span></div>
            </div>
            <Link className="btn dark" to={`${base}/dispatch`}>{t.manageTransfers} →</Link>
          </div>
        </div>
        <div className="tiles">
          <div className="tile"><div className="tile-h"><span>{t.tileShort}</span><i className="dot red" /></div><div className="tile-n">{s ? (s.counts.red ?? 0) + (s.counts.amber ?? 0) : "…"} <small className="red">({s?.counts.red ?? 0} {t.critical})</small></div><div className="tile-s">{t.tileShortSub}</div></div>
          <div className="tile"><div className="tile-h"><span>{t.tileBeds}</span><Badge kind="simulated" /></div><div className="tile-n">{c?.occupancy != null ? `${(c.occupancy * 100).toFixed(1)}%` : "…"}</div><div className="tile-s">{c ? t.tileBedsSub(c.occupied, c.beds) : ""}</div></div>
          <div className="tile"><div className="tile-h"><span>{t.tileStaff}</span><Badge kind="simulated" /></div><div className="tile-n">{c?.vacancy_share != null ? `${((1 - c.vacancy_share) * 100).toFixed(1)}%` : "…"}</div><div className="tile-s">{c ? t.tileStaffSub(c.staff_alerts) : ""}</div></div>
          <div className="tile"><div className="tile-h"><span>{t.tileOpd}</span><Badge kind="real" /></div><div className="tile-n">{opd.length ? Math.round(opd[opd.length - 1]).toLocaleString("en-IN") : "…"}</div><div className="tile-s">{t.tileOpdSub}</div></div>
        </div>
      </section>

      {/* open facility requests: surfaced first so the officer never has to scroll past the alerts to find them */}
      <div className="rw-wide"><RequestsWaiting unit={unit} district={district} /></div>

      {/* the morning briefing (Gemini, or written from the numbers when Gemini is unreachable) */}
      <section className="card brief-card">
        {brief.data ? (<>
          <p className="eyebrow"><span className="eyebrow-accent">{t.briefLbl}</span></p>
          <h2 className="headline">{brief.data.headline}</h2>
          <p className="lead">{brief.data.body.join(" ")}</p>
          <p style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {alerts[0] && <Explain kind="alert" item={alerts[0]}><button className="btn quiet" style={{ paddingLeft: 0 }}>{t.whyLink}</button></Explain>}
            <Badge kind={brief.data.status.startsWith("fallback") ? "computed" : "ai"} title={brief.data.status.startsWith("fallback") ? "Written from the alert numbers; Gemini was not reachable" : `${brief.data.model} · ${brief.data.status}`} />
          </p>
        </>) : (<>
          <h2 className="headline skeleton">Loading the morning briefing for this district</h2>
          <p className="lead skeleton">Three or four sentences will appear here once the briefing service answers.</p>
        </>)}
      </section>

      <div className="today-grid">
        <div className="today-main">
          {/* narrow screens: the proactive warnings come right after the briefing, not below every other card */}
          <div className="narrow-only"><ResilienceAlerts unit={unit} district={district} /></div>
          {/* rebalancing proposals: the decision, first */}
          <section className="card proposals">
            <div className="card-head">
              <div><h2>{t.proposalsTitle}</h2><p className="faint">{t.proposalsSub}</p></div>
              {proposed.length > 0 && <Link className="btn soft" to={`${base}/dispatch`}>{t.reviewAll(proposed.length)}</Link>}
            </div>
            {!transfers.data && <p className="skeleton" style={{ height: 96 }}>…</p>}
            {transfers.data && proposed.length === 0 && <p className="muted empty">{t.noneReady}</p>}
            {proposed.slice(0, 3).map((x) => (
              <div key={x.transfer_id} className="prop">
                <div className="prop-top"><div><b>{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}</b> <span className="qty-pill">+{x.quantity.toLocaleString("en-IN")}</span></div><span className="faint">{x.km} km · {x.eta_days} d</span></div>
                <div className="flow"><div><span className="lbl">{t.donorLbl}</span><b>{x.from_name}</b></div><span className="arrow" aria-hidden>→</span><div><span className="lbl red">{t.recipientLbl}</span><b>{x.to_name}</b></div></div>
                <div className="prop-act">
                  <Explain kind="transfer" item={x}><button className="btn quiet" style={{ paddingLeft: 0 }}>{t.whyTransfer}</button></Explain>
                  <button className="btn primary" disabled={approve.isPending} onClick={() => approve.mutate(x.transfer_id)}>{t.approve}</button>
                </div>
              </div>))}
          </section>

          {/* every current alert, as a table */}
          <section className="card">
            <div className="card-head"><div><h2>{t.q1}</h2><p className="faint">{s ? `${s.counts.red ?? 0} ${t.severity.red}, ${s.counts.amber ?? 0} ${t.severity.amber}` : ""}</p></div></div>
            {s && alerts.length === 0 && <div className="quiet">{t.noAlerts}</div>}
            <div className="list flat">
              {alerts.length > 0 && <div className="list-head" aria-hidden><span>{t.stockHead}</span><span>{t.medHead}</span><span>{t.daysHead}</span><span>{t.actionHead}</span></div>}
              {alerts.slice(0, showAll ? 60 : 8).map((a) => <AlertRow key={a.facility_id + a.commodity_id} a={a} base={base} />)}
            </div>
            {alerts.length > 8 && <button className="btn quiet" onClick={() => setShowAll((v) => !v)}>{showAll ? t.showFewer : `${t.showAll} (${alerts.length})`}</button>}
          </section>

          <section className="card">
            <div className="card-head"><div><h2>{t.q2}</h2><p className="faint">{dots.data ? `${dots.data.facilities.length} ${t.facilities}` : ""}</p></div></div>
            {dots.data && <MapView dots={dots.data.facilities} onSelect={(f) => nav(`/facility/${f.facility_id}`)} />}
            <div className="legend">
              <span><i className="dot" style={{ background: "var(--red)" }} />{t.severity.red}</span>
              <span><i className="dot" style={{ background: "var(--amber)" }} />{t.severity.amber}</span>
              <span><i className="dot" style={{ background: "var(--green)" }} />{t.severity.ok}</span>
              <span><i className="dot" style={{ background: "var(--blue)" }} />{t.severity.data_issue}</span>
            </div>
          </section>
        </div>
        <aside className="today-side">
          <RequestsInbox unit={unit} district={district} />
          <div className="wide-only"><ResilienceAlerts unit={unit} district={district} /></div>
          <CountHistory unit={unit} district={district} />
          <div style={{ marginBottom: "var(--s6)" }}><CarePanel unit={unit} district={district} /></div>
          <section className="card">
            <h2>{t.trend}</h2>
            {s && (<>
              <Sparkline values={s.sparklines.opd} label={t.opd} delta={s.sparkline_deltas.opd} badge={<Badge kind="real" />} />
              <Sparkline values={s.sparklines.diarrhoea_u5} label={t.diarrhoea} delta={s.sparkline_deltas.diarrhoea_u5} badge={<Badge kind="real" />} />
              <Sparkline values={s.sparklines.stockouts} label={t.stockouts} delta={s.sparkline_deltas.stockouts} badge={<Badge kind="simulated" />} />
            </>)}
            {s?.score && <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 12 }}>{t.scoreParts(Math.round(s.score.median_days_of_stock), Math.round(s.score.share_under_14d * 100), Math.round(s.score.staffing_gap * 100))} <Badge kind="computed" /></p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function AlertRow({ a, base }: { a: Alert; base: string }) {
  const { t } = useApp();
  const cause = t.causes[a.cause] ?? a.cause;
  return (
    <div className="row">
      <div><Link to={`/facility/${a.facility_id}`} className="name" style={{ color: "inherit" }}>{a.facility_name}</Link><div className="sub"><span>{a.type}, {a.district}</span><Badge kind={a.source === "osm" ? "osm" : "simulated"} /></div></div>
      <div><div>{a.commodity_name}</div>{cause && <div className="sub"><span className={`chip ${a.cause === "data_issue" ? "blue" : a.cause === "cases_up" ? "red" : "amber"}`}>{cause}</span></div>}</div>
      <Scale days={a.days_of_stock} severity={a.severity} label={t.days} />
      <Link className="btn quiet" to={`${base}/dispatch?commodity=${a.commodity_id}`}>{t.dispatch} →</Link>
    </div>
  );
}
