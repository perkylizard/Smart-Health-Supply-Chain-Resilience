import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, type Alert } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";
import Sparkline from "../components/Sparkline";

export default function Briefing() {
  const { unit, district, lang, t } = useApp();
  const nav = useNavigate();
  const summary = useQuery({ queryKey: ["summary", unit, district], queryFn: () => api.summary(unit, district), enabled: !!district });
  const dots = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district), enabled: !!district });
  const brief = useQuery({ queryKey: ["briefing", unit, district, lang, summary.data?.scenario.updated], queryFn: () => api.briefing(unit, district, lang), enabled: !!summary.data });
  const s = summary.data;
  const perFacility: Record<string, number> = {};
  const alerts = (s?.alerts ?? []).filter((a) => a.alert).filter((a) => { perFacility[a.facility_id] = (perFacility[a.facility_id] ?? 0) + 1; return perFacility[a.facility_id] <= 3; });
  const base = `/${unit}/${encodeURIComponent(district)}`;
  const whatIf = s && s.scenario.name !== "normal";
  return (
    <div>
      <section className="section">
        {whatIf && <p className="chip amber" style={{ marginBottom: 12 }}>{t.whatIf}: {s.scenario.name.replace("_", " ")} {Math.round(s.scenario.intensity * 100)}%</p>}
        {brief.data ? (<>
          <h1 className="headline">{brief.data.headline}</h1>
          <p className="lead">{brief.data.body.join(" ")}</p>
          <p style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {alerts[0] && <Explain kind="alert" item={alerts[0]}><button className="btn quiet" style={{ color: "var(--teal)", paddingLeft: 0 }}>{t.whyLink}</button></Explain>}
            <Badge kind="ai" title={`${brief.data.model} · ${brief.data.status}`} />
          </p>
        </>) : (<>
          <h1 className="headline skeleton">Loading the morning briefing for this district</h1>
          <p className="lead skeleton">Three or four sentences will appear here once the briefing service answers.</p>
        </>)}
      </section>

      <div className="two-col">
        <div>
          <section className="section">
            {dots.data && <MapView dots={dots.data.facilities} onSelect={(f) => nav(`/facility/${f.facility_id}`)} />}
            <div className="legend">
              <span><i className="dot" style={{ background: "var(--red)" }} />{t.severity.red}</span>
              <span><i className="dot" style={{ background: "var(--amber)" }} />{t.severity.amber}</span>
              <span><i className="dot" style={{ background: "var(--green)" }} />{t.severity.ok}</span>
              <span><i className="dot" style={{ background: "var(--blue)" }} />{t.severity.data_issue}</span>
              <span className="faint">{dots.data ? `${dots.data.facilities.length} ${t.facilities}` : ""}</span>
            </div>
          </section>
          <section className="section">
            <h2>{t.alerts} <span className="faint" style={{ fontWeight: 400, fontSize: "var(--t-sm)" }}>{s ? `${s.counts.red ?? 0} ${t.severity.red}, ${s.counts.amber ?? 0} ${t.severity.amber}` : ""}</span></h2>
            {s && alerts.length === 0 && <div className="quiet">{t.noAlerts}</div>}
            <div className="list">
              {alerts.slice(0, 30).map((a) => <AlertRow key={a.facility_id + a.commodity_id} a={a} base={base} />)}
            </div>
          </section>
        </div>
        <aside>
          <section className="section">
            <h2>{t.resilience}</h2>
            {s?.score ? (<>
              <div className="gauge"><span className="n">{Math.round(s.score.score)}</span><span className="of">/ 100</span></div>
              <p className="muted">{s.rank_in_unit ? t.rankOf(s.rank_in_unit, s.of) : ""}</p>
              <p className="faint" style={{ fontSize: 13 }}>Median {Math.round(s.score.median_days_of_stock)} {t.days} · {Math.round(s.score.share_under_14d * 100)}% under 14 · staffing gap {Math.round(s.score.staffing_gap * 100)}% <Badge kind="computed" /></p>
            </>) : <div className="gauge skeleton"><span className="n">00</span></div>}
          </section>
          <section className="section">
            <h2>{t.trend}</h2>
            {s && (<>
              <Sparkline values={s.sparklines.opd} label={t.opd} delta={s.sparkline_deltas.opd} badge={<Badge kind="real" />} />
              <Sparkline values={s.sparklines.diarrhoea_u5} label={t.diarrhoea} delta={s.sparkline_deltas.diarrhoea_u5} badge={<Badge kind="real" />} />
              <Sparkline values={s.sparklines.stockouts} label={t.stockouts} delta={s.sparkline_deltas.stockouts} badge={<Badge kind="simulated" />} />
            </>)}
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
      <div><Link to={`/facility/${a.facility_id}`} className="name" style={{ color: "inherit" }}>{a.facility_name}</Link><div className="sub">{a.type} · {a.district} · <Badge kind={a.source === "osm" ? "osm" : "simulated"} /></div></div>
      <div>{a.commodity_name}<div className="sub">{cause && <span className={`chip ${a.cause === "data_issue" ? "blue" : a.cause === "cases_up" ? "red" : "amber"}`}>{cause}</span>}</div></div>
      <Scale days={a.days_of_stock} severity={a.severity} label={t.days} />
      <Link className="btn" to={`${base}/dispatch?commodity=${a.commodity_id}`}>{t.dispatch}</Link>
    </div>
  );
}
