import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type Alert, type FacilityDot } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";
import Sparkline from "../components/Sparkline";
import CarePanel from "../components/CarePanel";
import { CountHistory, NotSupplied, RequestTracker, RequestsInbox, RequestsWaiting } from "../components/Requests";
import ResilienceAlerts from "../components/ResilienceAlerts";

const TABS = ["requests", "transfers", "alerts", "map", "care", "counts"] as const;
type Tab = (typeof TABS)[number];
const badgeTone: Partial<Record<Tab, string>> = { requests: "amber", alerts: "red" };
const TL = {
  en: { tabsLabel: "District sections", tabs: { requests: "Requests", transfers: "Transfers", alerts: "Stock alerts", map: "Map", care: "Beds & staff", counts: "Stock counts" } as Record<Tab, string>,
    openMoveStock: "Open Move stock", showMore: (n: number, left: number) => `Show ${n} more (${left} left)`, mapHint: "tap a dot to open the facility", ahead: "Before the next delivery", now: "Under two weeks now", more: "Read full briefing", less: "Show less", facList: "Facilities", facListHint: "Worst first. Open one to see its stock, beds and staff.", findFac: "Find a facility", allFac: "All", noFac: "No facility matches.", nAlerts: (n: number) => `${n} ${n === 1 ? "alert" : "alerts"}` },
  hi: { tabsLabel: "ज़िले के खंड", tabs: { requests: "अनुरोध", transfers: "स्थानांतरण", alerts: "स्टॉक चेतावनियाँ", map: "नक्शा", care: "बिस्तर और स्टाफ़", counts: "स्टॉक गिनती" } as Record<Tab, string>,
    openMoveStock: "स्टॉक भेजें खोलें", showMore: (n: number, left: number) => `${n} और देखें (${left} बाकी)`, mapHint: "सुविधा खोलने के लिए बिंदु पर टैप करें", ahead: "अगली डिलीवरी से पहले", now: "अभी दो हफ़्ते से कम", more: "पूरा ब्रीफ़िंग पढ़ें", less: "कम दिखाएँ", facList: "सुविधाएँ", facListHint: "सबसे गंभीर पहले। स्टॉक, बिस्तर और स्टाफ़ देखने के लिए कोई सुविधा खोलें।", findFac: "सुविधा खोजें", allFac: "सभी", noFac: "कोई सुविधा मेल नहीं खाती।", nAlerts: (n: number) => `${n} चेतावनियाँ` },
};

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
  const [propShown, setPropShown] = useState(6);
  const [alertView, setAlertView] = useState<"ahead" | "now">("ahead");
  const [briefOpen, setBriefOpen] = useState(false);
  const L = TL[lang];
  const [sp, setSp] = useSearchParams();
  const waiting = useQuery({ queryKey: ["districtRequests", unit, district], staleTime: 0, refetchOnMount: "always", queryFn: () => api.districtRequests(unit, district, "requested"), refetchInterval: 15_000 });
  const counts = useQuery({ queryKey: ["counts", unit, district], staleTime: 0, refetchOnMount: "always", queryFn: () => api.districtCounts(unit, district), refetchInterval: 15_000 });
  const back = useQuery({ queryKey: ["districtRequests", unit, district, "cancelled"], staleTime: 0, queryFn: () => api.districtRequests(unit, district, "cancelled"), refetchInterval: 15_000 });
  const nWaiting = (waiting.data?.requests.length ?? 0) + (back.data?.requests.length ?? 0);
  const asked = sp.get("tab") as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : nWaiting > 0 ? "requests" : "alerts";
  const tabsRef = useRef<HTMLElement | null>(null);
  const open = (k: Tab) => {
    const next = new URLSearchParams(sp); next.set("tab", k); setSp(next, { replace: true });
    // bring the tabs into view when they are off screen or low on it (from the tiles or the requests banner)
    const top = tabsRef.current?.getBoundingClientRect().top;
    if (top != null && (top < 0 || top > window.innerHeight * 0.6)) tabsRef.current!.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const s = summary.data;
  const perFacility: Record<string, number> = {};
  const alerts = (s?.alerts ?? []).filter((a) => a.alert).filter((a) => { perFacility[a.facility_id] = (perFacility[a.facility_id] ?? 0) + 1; return perFacility[a.facility_id] <= 3; });
  const whatIf = s && s.scenario.name !== "normal";
  const proposed = (transfers.data?.transfers ?? []).filter((x) => x.status === "proposed");
  const stateName = units.data?.units.find((u) => u.unit_id === unit)?.state ?? "";
  const c = care.data?.summary;
  const opd = s?.sparklines.opd ?? [];
  const badge: Partial<Record<Tab, number>> = { requests: nWaiting, transfers: proposed.length, alerts: s?.counts.red ?? 0, care: c?.staff_alerts ?? 0, counts: counts.data?.total ?? 0 };
  return (
    <div className="today">
      <div className="rw-phone"><RequestsWaiting unit={unit} district={district} onReview={() => open("requests")} /></div>
      {whatIf && <p className="chip amber" style={{ marginBottom: 12 }}>{t.whatIf}: {s.scenario.name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} {Math.round(s.scenario.intensity * 100)}%</p>}

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
          <button type="button" className="tile tile-btn" onClick={() => open("alerts")} aria-label={`${t.tileShort}: ${L.tabs.alerts}`}><div className="tile-h"><span>{t.tileShort}</span><i className="dot red" /></div><div className="tile-n">{s ? (s.counts.red ?? 0) + (s.counts.amber ?? 0) : "…"} <small className="red">({s?.counts.red ?? 0} {t.critical})</small></div><div className="tile-s">{t.tileShortSub}</div></button>
          <button type="button" className="tile tile-btn" onClick={() => open("care")}><div className="tile-h"><span>{t.tileBeds}</span><Badge kind="simulated" /></div><div className="tile-n">{c?.occupancy != null ? `${(c.occupancy * 100).toFixed(1)}%` : "…"}</div><div className="tile-s">{c ? t.tileBedsSub(c.occupied, c.beds) : ""}</div></button>
          <button type="button" className="tile tile-btn" onClick={() => open("care")}><div className="tile-h"><span>{t.tileStaff}</span><Badge kind="simulated" /></div><div className="tile-n">{c?.vacancy_share != null ? `${((1 - c.vacancy_share) * 100).toFixed(1)}%` : "…"}</div><div className="tile-s">{c ? t.tileStaffSub(c.staff_alerts) : ""}</div></button>
          <button type="button" className="tile tile-btn" onClick={() => open("care")}><div className="tile-h"><span>{t.tileOpd}</span><Badge kind="real" /></div><div className="tile-n">{opd.length ? Math.round(opd[opd.length - 1]).toLocaleString("en-IN") : "…"}</div><div className="tile-s">{t.tileOpdSub}</div></button>
        </div>
      </section>

      {/* open facility requests: surfaced first; Review opens the Requests tab */}
      <div className="rw-wide"><RequestsWaiting unit={unit} district={district} onReview={() => open("requests")} /></div>

      {/* the morning briefing (Gemini, or written from the numbers when Gemini is unreachable) */}
      <section className="card brief-card">
        {brief.data ? (<>
          <p className="eyebrow"><span className="eyebrow-accent">{t.briefLbl}</span></p>
          <h2 className="headline">{brief.data.headline}</h2>
          <p className={`lead${briefOpen ? "" : " clamp2"}`}>{brief.data.body.join(" ")}</p>
          <p style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn quiet" style={{ paddingLeft: 0 }} aria-expanded={briefOpen} onClick={() => setBriefOpen((v) => !v)}>{briefOpen ? L.less : L.more}</button>
            {alerts[0] && <Explain kind="alert" item={alerts[0]}><button className="btn quiet" style={{ paddingLeft: 0 }}>{t.whyLink}</button></Explain>}
            <Badge kind={brief.data.status.startsWith("fallback") ? "computed" : "ai"} title={brief.data.status.startsWith("fallback") ? "Written from the alert numbers; Gemini was not reachable" : `${brief.data.model} · ${brief.data.status}`} />
          </p>
        </>) : (<>
          <h2 className="headline skeleton">Loading the morning briefing for this district</h2>
          <p className="lead skeleton">Three or four sentences will appear here once the briefing service answers.</p>
        </>)}
      </section>

      {/* secondary tabs: one job per tab, counts on each so the officer knows where work is waiting */}
      <nav className="subtabs" ref={tabsRef} role="tablist" aria-label={L.tabsLabel}>
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`} aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => open(k)}>
            <span>{L.tabs[k]}</span>{badge[k] != null && badge[k]! > 0 && <span className={`subtab-n ${badgeTone[k] ?? ""}`}>{badge[k]!.toLocaleString("en-IN")}</span>}
          </button>
        ))}
      </nav>

      <div className="subpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "requests" && (
          <div className="sp-grid">
            <div><NotSupplied unit={unit} district={district} /><RequestsInbox unit={unit} district={district} /></div>
            <RequestTracker unit={unit} district={district} />
          </div>
        )}

        {tab === "transfers" && (
          <section className="card proposals">
            <div className="card-head">
              <div><h2>{t.proposalsTitle}</h2><p className="faint">{t.proposalsSub}</p></div>
              <Link className="btn soft" to={`${base}/dispatch`}>{L.openMoveStock} →</Link>
            </div>
            {!transfers.data && <p className="skeleton" style={{ height: 96 }}>…</p>}
            {transfers.data && proposed.length === 0 && <p className="muted empty">{t.noneReady}</p>}
            <div className="prop-grid">
              {proposed.slice(0, propShown).map((x) => (
                <div key={x.transfer_id} className="prop">
                  <div className="prop-top"><div><b>{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}</b> <span className="qty-pill">+{x.quantity.toLocaleString("en-IN")}</span></div><span className="faint">{x.km} km · {x.eta_days} d</span></div>
                  <div className="flow"><div><span className="lbl">{t.donorLbl}</span><b>{x.from_name}</b></div><span className="arrow" aria-hidden>→</span><div><span className="lbl red">{t.recipientLbl}</span><b>{x.to_name}</b></div></div>
                  <div className="prop-act">
                    <Explain kind="transfer" item={x}><button className="btn quiet" style={{ paddingLeft: 0 }}>{t.whyTransfer}</button></Explain>
                    <button className="btn primary" disabled={approve.isPending} onClick={() => approve.mutate(x.transfer_id)}>{t.approve}</button>
                  </div>
                </div>))}
            </div>
            {proposed.length > propShown && <button className="btn quiet" onClick={() => setPropShown((n) => n + 6)}>{L.showMore(Math.min(6, proposed.length - propShown), proposed.length - propShown)}</button>}
          </section>
        )}

        {tab === "alerts" && (<>
          {/* two ways to read the same shortages: ahead of the next delivery, or everything under two weeks right now */}
          <div className="seg sp-switch" role="tablist" aria-label={L.tabs.alerts}>
            <button type="button" role="tab" aria-selected={alertView === "ahead"} className={alertView === "ahead" ? "on" : ""} onClick={() => setAlertView("ahead")}>{L.ahead}</button>
            <button type="button" role="tab" aria-selected={alertView === "now"} className={alertView === "now" ? "on" : ""} onClick={() => setAlertView("now")}>{L.now} {s && <span className="seg-n">{(s.counts.red ?? 0) + (s.counts.amber ?? 0)}</span>}</button>
          </div>
          {alertView === "ahead" ? <div className="sp-wide"><ResilienceAlerts unit={unit} district={district} /></div> : (
            <section className="card">
              <div className="card-head"><div><h2>{t.q1}</h2><p className="faint">{s ? `${s.counts.red ?? 0} ${t.severity.red}, ${s.counts.amber ?? 0} ${t.severity.amber}` : ""}</p></div></div>
              {s && alerts.length === 0 && <div className="quiet">{t.noAlerts}</div>}
              <div className="list flat">
                {alerts.length > 0 && <div className="list-head" aria-hidden><span>{t.stockHead}</span><span>{t.medHead}</span><span>{t.daysHead}</span><span>{t.actionHead}</span></div>}
                {alerts.slice(0, showAll ? 60 : 12).map((a) => <AlertRow key={a.facility_id + a.commodity_id} a={a} base={base} />)}
              </div>
              {alerts.length > 12 && <button className="btn quiet" onClick={() => setShowAll((v) => !v)}>{showAll ? t.showFewer : `${t.showAll} (${alerts.length})`}</button>}
            </section>
          )}
        </>)}

        {tab === "map" && (
          <div className="map-split">
            <section className="card map-card">
              <div className="card-head"><div><h2>{t.q2}</h2><p className="faint">{dots.data ? `${dots.data.facilities.length} ${t.facilities} · ${L.mapHint}` : ""}</p></div></div>
              {dots.data ? <MapView dots={dots.data.facilities} onSelect={(f) => nav(`/facility/${f.facility_id}`)} /> : <p className="skeleton map" />}
              <div className="legend">
                <span><i className="dot" style={{ background: "var(--red)" }} />{t.severity.red}</span>
                <span><i className="dot" style={{ background: "var(--amber)" }} />{t.severity.amber}</span>
                <span><i className="dot" style={{ background: "var(--green)" }} />{t.severity.ok}</span>
                <span><i className="dot" style={{ background: "var(--blue)" }} />{t.severity.data_issue}</span>
              </div>
            </section>
            <FacilityList dots={dots.data?.facilities} />
          </div>
        )}

        {tab === "care" && (
          <div className="sp-grid">
            <CarePanel unit={unit} district={district} />
            <section className="card">
              <h2>{t.trend}</h2>
              {s && (<>
                <Sparkline values={s.sparklines.opd} label={t.opd} delta={s.sparkline_deltas.opd} badge={<Badge kind="real" />} />
                <Sparkline values={s.sparklines.diarrhoea_u5} label={t.diarrhoea} delta={s.sparkline_deltas.diarrhoea_u5} badge={<Badge kind="real" />} />
                <Sparkline values={s.sparklines.stockouts} label={t.stockouts} delta={s.sparkline_deltas.stockouts} badge={<Badge kind="simulated" />} />
              </>)}
              {s?.score && <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 12 }}>{t.scoreParts(Math.round(s.score.median_days_of_stock), Math.round(s.score.share_under_14d * 100), Math.round(s.score.staffing_gap * 100))} <Badge kind="computed" /></p>}
            </section>
          </div>
        )}

        {tab === "counts" && <CountHistory unit={unit} district={district} />}
      </div>
    </div>
  );
}

const SEV_ORDER: Record<string, number> = { red: 0, amber: 1, data_issue: 2, ok: 3 };
/** Beside the map: every facility in the district, worst first, one tap to open it. */
function FacilityList({ dots }: { dots?: FacilityDot[] }) {
  const { t, lang } = useApp();
  const L = TL[lang];
  const [find, setFind] = useState("");
  const [only, setOnly] = useState<"all" | "red" | "amber">("all");
  const all = [...(dots ?? [])].sort((a, b) => (SEV_ORDER[a.worst_severity] ?? 9) - (SEV_ORDER[b.worst_severity] ?? 9) || (b.red + b.amber) - (a.red + a.amber) || a.worst_days - b.worst_days);
  const rows = all.filter((d) => (only === "all" || d.worst_severity === only) && (!find || d.facility_name.toLowerCase().includes(find.toLowerCase())));
  const n = (k: string) => all.filter((d) => d.worst_severity === k).length;
  return (
    <section className="card fac-list" aria-label={L.facList}>
      <div className="card-head"><div><h2>{L.facList}</h2><p className="faint">{L.facListHint}</p></div></div>
      <input className="input" placeholder={L.findFac} value={find} onChange={(e) => setFind(e.target.value)} aria-label={L.findFac} />
      <div className="seg fl-seg" role="tablist" aria-label={L.facList}>
        {(["all", "red", "amber"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={only === k} className={only === k ? "on" : ""} onClick={() => setOnly(k)}>{k === "all" ? L.allFac : t.severity[k]} <span className="seg-n">{k === "all" ? all.length : n(k)}</span></button>)}
      </div>
      {!dots && <p className="skeleton" style={{ height: 200 }}>…</p>}
      {dots && rows.length === 0 && <p className="muted">{L.noFac}</p>}
      <ul className="fl-items">
        {rows.map((d) => (
          <li key={d.facility_id}>
            <Link to={`/facility/${d.facility_id}`} className="fl-item">
              <i className={`dot fl-dot ${d.worst_severity}`} aria-hidden />
              <span className="fl-main"><b>{d.facility_name}</b><span className="faint">{d.type}{d.worst_severity !== "ok" && d.worst_commodity ? ` · ${d.worst_commodity}, ${Math.max(0, Math.round(d.worst_days))} ${t.days}` : ""}</span></span>
              {d.red + d.amber > 0 && <span className={`chip ${d.red > 0 ? "red" : "amber"} nowrap`}>{L.nAlerts(d.red + d.amber)}</span>}
              <span className="fl-go" aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
