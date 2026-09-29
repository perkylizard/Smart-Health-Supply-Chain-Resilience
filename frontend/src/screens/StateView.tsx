import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type DistrictRow, type FacilityDot, type Transfer } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";
import CarePanel from "../components/CarePanel";
import { s2 } from "../strings2";
import { sA } from "../stringsA";

function scoreSeverity(s: number | null): FacilityDot["worst_severity"] { return s == null ? "data_issue" : s < 45 ? "red" : s < 60 ? "amber" : "ok"; }

export default function StateView() {
  const { unit, t, lang } = useApp();
  const a = sA[lang];
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const tr = useQuery({ queryKey: ["unitTransfers", unit], queryFn: () => api.unitTransfers(unit) });
  const esc = useQuery({ queryKey: ["escalations", unit], queryFn: () => api.escalations(unit), refetchInterval: 15_000 });
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const care = useQuery({ queryKey: ["careState", unit], queryFn: () => fetch(`${(import.meta.env.VITE_API_URL as string | undefined) ?? "/api"}/care/${unit}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }) as Promise<{ totals: { beds: number; occupied: number; occupancy: number | null } }> });
  const [local, setLocal] = useState<Record<string, string>>({});
  const approve = useMutation({ mutationFn: (id: string) => api.approve(id), onMutate: (id) => setLocal((l) => ({ ...l, [id]: "approved" })), onSettled: () => qc.invalidateQueries({ queryKey: ["unitTransfers"] }) });
  const reject = useMutation({ mutationFn: (id: string) => api.reject(id, "state_declined"), onMutate: (id) => setLocal((l) => ({ ...l, [id]: "rejected" })), onSettled: () => qc.invalidateQueries({ queryKey: ["unitTransfers"] }) });
  const rows = d.data?.districts ?? [];
  const dots = useMemo<FacilityDot[]>(() => rows.map((x: DistrictRow) => ({
    facility_id: x.district, facility_name: x.district, type: "DH", lat: x.lat, lon: x.lon, worst_severity: scoreSeverity(x.score), worst_days: x.median_days_of_stock ?? 0,
    worst_commodity: "", red: x.red_alerts, amber: 0, data_issues: 0, source: "computed", dist_to_warehouse_km: 0, beds: 0,
  })), [rows]);
  const worst = [...rows].sort((x, y) => (x.score ?? 0) - (y.score ?? 0)).slice(0, 5);
  const transfers = (tr.data?.transfers ?? []).map((x: Transfer) => ({ ...x, status: local[x.transfer_id] ?? x.status }));
  const pending = transfers.filter((x) => x.status === "proposed").length;
  const underWatch = rows.filter((x) => x.score != null && x.score < 60).length;
  const days = rows.map((x) => x.median_days_of_stock).filter((v): v is number => v != null).sort((x, y) => x - y);
  const medDays = days.length ? days[Math.floor(days.length / 2)] : null;
  const stateName = units.data?.units.find((x) => x.unit_id === unit)?.unit_name ?? "";
  const c = care.data?.totals;
  return (
    <div className="pg st">
      <h1 className="sr-only">{t.stateTab}</h1>
      <section className="card pg-hero">
        <div className="pg-hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{stateName}</span><span aria-hidden> · </span>{a.stEyebrow}</p>
            <h2 className="pg-h1">{stateName}</h2>
            <p className="faint pg-sub">{d.data ? a.stSub(rows.length) : "…"}</p>
          </div>
          <Link className="btn dark" to={`/state/${unit}/districts`}>{a.viewLeague} →</Link>
        </div>
        <div className="tiles">
          <div className="tile"><div className="tile-h"><span>{a.tileAlert}</span><Badge kind="computed" /></div><div className="tile-n">{d.data ? underWatch : "…"} <small>/ {rows.length}</small></div><div className="tile-s">{a.tileAlertSub(rows.length)}</div></div>
          <div className="tile"><div className="tile-h"><span>{a.tileStock}</span><Badge kind="simulated" /></div><div className="tile-n">{medDays != null ? (medDays / 30).toFixed(1) : "…"} <small>{a.months}</small></div><div className="tile-s">{a.tileStockSub}</div></div>
          <div className="tile"><div className="tile-h"><span>{a.tileBeds}</span><Badge kind="simulated" /></div><div className="tile-n">{c?.occupancy != null ? `${(c.occupancy * 100).toFixed(1)}%` : "…"}</div><div className="tile-s">{c ? a.tileBedsSub(c.occupied, c.beds) : ""}</div></div>
          <div className="tile"><div className="tile-h"><span>{a.tilePending}</span><Badge kind="computed" /></div><div className="tile-n">{tr.data ? pending : "…"}</div><div className="tile-s">{a.tilePendingSub}</div></div>
        </div>
      </section>
      <div className="pg-grid">
        <div>
          <section className="card">
            <div className="card-head"><div><h2>{a.mapTitle2}</h2><p className="faint">{d.data ? `${rows.length} ${t.districtsTab.toLowerCase()}` : ""}</p></div></div>
            {d.isLoading && <p className="skeleton" style={{ height: 240 }}>…</p>}
            {dots.length > 0 && <MapView dots={dots} />}
            <div className="legend">
              <span><i className="dot" style={{ background: "var(--red)" }} />score under 45</span><span><i className="dot" style={{ background: "var(--amber)" }} />45 to 60</span><span><i className="dot" style={{ background: "var(--green)" }} />over 60</span>
            </div>
            {worst.length > 0 && <p className="faint st-lowest">{a.lowest}: {worst.map((w) => <Link key={w.district} to={`/dho/${unit}/${encodeURIComponent(w.district)}`}>{w.district} <b>{Math.round(w.score ?? 0)}</b></Link>)}</p>}
          </section>
          <section className="card">
            <div className="card-head"><div><h2>{a.approvalsTitle} <span className="faint">{pending}</span></h2><p className="faint">{a.approvalsSub}</p></div></div>
            {tr.isLoading && <p className="skeleton" style={{ height: 60 }}>{a.approvalsLoading}</p>}
            {tr.data && transfers.length === 0 && <p className="muted">{a.approvalsEmpty}</p>}
            {transfers.slice(0, 20).map((x) => (
              <div key={x.transfer_id} className="st-tr">
                <div className="mv-top"><div className="mv-name"><b>{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}</b><span className="qty-pill">+{x.quantity.toLocaleString("en-IN")}</span></div><span className="faint mv-dist">{x.km} km · {x.eta_days} d</span></div>
                <div className="flow">
                  <div><span className="lbl">{a.donor}</span><b>{x.from_name}</b><span className="faint"> · {x.from_district}</span></div>
                  <span className="arrow" aria-hidden>→</span>
                  <div><span className="lbl red">{a.recipient}</span><b>{x.to_name}</b><span className="faint"> · {x.to_district}</span></div>
                </div>
                <div className="mv-after">
                  <div><span className="lbl">{a.donorAfter}</span><Scale days={x.donor_days_after} severity="ok" label={t.days} /></div>
                  <div><span className="lbl">{a.recipientAfter}</span><Scale days={x.recipient_days_after} severity="ok" label={t.days} /></div>
                </div>
                {x.reason && <p className="st-reason"><b>{a.reasonLbl}:</b> {x.reason}</p>}
                <div className="mv-act">
                  <span className="mv-why"><Explain kind="transfer" item={x}><button className="btn quiet">{t.whyLink}</button></Explain><Badge kind="computed" /></span>
                  <span className="mv-btns">{x.status === "proposed" ? <>
                    <button className="btn" onClick={() => reject.mutate(x.transfer_id)}>{a.rejectLbl}</button>
                    <button className="btn primary" onClick={() => approve.mutate(x.transfer_id)}>{t.approve}</button>
                  </> : <span className={`chip ${x.status === "rejected" ? "red" : "green"}`}>{x.status === "rejected" ? a.rejected : x.status === "approved" ? a.approvedLbl : x.status}</span>}</span>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><div><h2>{t.escalationsTitle} <span className="faint">{esc.data?.escalations.length ?? 0}</span></h2></div></div>
            {esc.data && esc.data.escalations.length === 0 && <p className="muted">{a.escEmpty}</p>}
            {esc.data?.escalations.map((e, i) => <div key={i} className="st-esc"><strong>{e.district}</strong><p>{e.reason}</p><p className="faint">{new Date(e.received * 1000).toLocaleString("en-IN")}</p></div>)}
          </section>
          <section className="card">
            <div className="card-head"><div><h2>{t.leagueTitle}</h2></div><Link to={`/state/${unit}/districts`}>{a.allDistricts} →</Link></div>
            {d.isLoading ? <p className="skeleton" style={{ height: 200 }}>…</p> : <LeagueTable rows={[...rows].sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 12)} />}
          </section>
          <div style={{ marginBottom: "var(--s6)" }}><CarePanel unit={unit} /></div>
        </aside>
      </div>
    </div>
  );
}

function band(score: number | null) { return score == null ? "" : score < 45 ? "red" : score < 60 ? "amber" : "green"; }

type SortKey = "score" | "district" | "median_days_of_stock" | "red_alerts" | "facilities" | "reporting_share";

function LeagueTable({ rows, start = 0, sortable }: { rows: DistrictRow[]; start?: number; sortable?: { key: SortKey; dir: 1 | -1; set: (k: SortKey) => void } }) {
  const { unit, t, lang } = useApp();
  const u = s2[lang]; const a = sA[lang];
  const H = ({ k, children, num }: { k: SortKey; children: React.ReactNode; num?: boolean }) => sortable
    ? <th className={num ? "num" : ""} aria-sort={sortable.key === k ? (sortable.dir === 1 ? "ascending" : "descending") : "none"}><button className="th-sort" onClick={() => sortable.set(k)}>{children}{sortable.key === k ? (sortable.dir === 1 ? " ↑" : " ↓") : ""}</button></th>
    : <th className={num ? "num" : ""}>{children}</th>;
  return (
    <div className="tbl-wrap">
      <table className="table"><thead><tr><th>#</th><H k="district">{t.district}</H><H k="score" num>{u.colScore}</H><H k="median_days_of_stock" num>{u.colDays}</H><H k="red_alerts" num>{u.colRed}</H>{sortable && <H k="facilities" num>{a.colFacilities}</H>}{sortable && <th></th>}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.district}><td className="num-l">{start + i + 1}</td><td><Link to={`/dho/${unit}/${encodeURIComponent(r.district)}`}>{r.district}</Link></td>
          <td className="num"><span className={`score-pill ${band(r.score)}`}>{r.score == null ? "…" : Math.round(r.score)}</span></td>
          <td className="num">{r.median_days_of_stock == null ? "…" : Math.round(r.median_days_of_stock)}</td><td className="num">{r.red_alerts}</td>
          {sortable && <td className="num">{r.facilities}</td>}
          {sortable && <td className="num"><Link className="btn quiet" to={`/dho/${unit}/${encodeURIComponent(r.district)}`}>{a.inspect} ›</Link></td>}</tr>)}</tbody></table>
    </div>
  );
}

export function ScoreCard() {
  const { lang } = useApp();
  const u = s2[lang];
  return (
    <section className="card side-card">
      <h2>{u.scoreCard}</h2>
      <ul className="bands"><li className="red"><span>{u.bandLow}</span></li><li className="amber"><span>{u.bandMid}</span></li><li className="green"><span>{u.bandHigh}</span></li></ul>
      <dl className="kv">{u.weights.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "12px 0 0" }}><Badge kind="computed" /></p>
    </section>
  );
}

export function DistrictsTable() {
  const { unit, t, lang } = useApp();
  const a = sA[lang];
  const d = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const [key, setKey] = useState<SortKey>("score");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"all" | "green" | "amber" | "red">("all");
  const setSort = (k: SortKey) => { if (k === key) setDir((x) => (x === 1 ? -1 : 1)); else { setKey(k); setDir(k === "district" ? 1 : -1); } };
  const val = (r: DistrictRow, k: SortKey): number | string => k === "district" ? r.district : k === "reporting_share" ? ((r as unknown as { reporting_share?: number }).reporting_share ?? 0) : ((r[k as keyof DistrictRow] as number | null) ?? 0);
  const rows = [...(d.data?.districts ?? [])]
    .filter((r) => r.district.toLowerCase().includes(name.trim().toLowerCase()))
    .filter((r) => tier === "all" || band(r.score) === tier)
    .sort((x, y) => { const p = val(x, key), q = val(y, key); return (typeof p === "string" ? p.localeCompare(q as string) : p - (q as number)) * dir; });
  const tiers = [["all", a.tierAll], ["green", a.tierRes], ["amber", a.tierWatch], ["red", a.tierRisk]] as const;
  return (
    <div className="pg lg">
      <section className="card pg-hero">
        <div className="pg-hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{a.lgEyebrow}</span></p>
            <h1>{t.leagueTitle}</h1>
            <p className="faint pg-sub">{a.lgSub}</p>
          </div>
        </div>
        <div className="mv-bar">
          <div className="seg" role="tablist" aria-label={a.lgEyebrow}>{tiers.map(([k, l]) => <button key={k} role="tab" aria-selected={tier === k} className={tier === k ? "on" : ""} onClick={() => setTier(k)}>{l}</button>)}</div>
          <input className="input mv-search" type="search" value={name} onChange={(e) => setName(e.target.value)} placeholder={a.filterName} aria-label={a.filterName} />
        </div>
      </section>
      <div className="pg-grid">
        <section className="card">
          {d.isLoading ? <p className="skeleton" style={{ height: 200 }}>Scoring every district</p> : rows.length === 0 ? <p className="muted">{a.noDistricts}</p> : <LeagueTable rows={rows} sortable={{ key, dir, set: setSort }} />}
        </section>
        <aside><ScoreCard /></aside>
      </div>
    </div>
  );
}
