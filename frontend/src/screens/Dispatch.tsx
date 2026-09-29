import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Transfer } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";
import { s2 } from "../strings2";
import { sA } from "../stringsA";

const STEPS = ["proposed", "approved", "picked_up", "delivered"];

export default function Dispatch() {
  const { unit, district, t, base, lang } = useApp();
  const u = s2[lang];
  const [sp] = useSearchParams();
  const commodity = sp.get("commodity") ?? undefined;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["transfers", unit, district, commodity], queryFn: () => api.transfers(unit, district, commodity) });
  const summary = useQuery({ queryKey: ["summary", unit, district], queryFn: () => api.summary(unit, district) });
  const dots = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district) });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  // render in pages: 266 cards at once meant a thousand buttons and a 29-second first paint
  const [shown, setShown] = useState(20);
  // one view at a time, opening on the decision (proposals); "needs" is a phone-only segment (desktop shows it in the side column)
  const [view, setView] = useState<"proposed" | "transit" | "delivered" | "needs">("proposed");
  const [term, setTerm] = useState("");
  const a = sA[lang];
  const setStatus = (id: string, status: string) => setLocal((l) => ({ ...l, [id]: status }));
  // the signature moment: the approved card leaves Proposals, lands at the top of In transit with a brief highlight,
  // and a toast confirms what happened with a way to see it. Nothing here is destructive, so there is no undo to fake.
  const [landed, setLanded] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const transitRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 5000); return () => clearTimeout(h); }, [toast]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const approve = useMutation({ mutationFn: (id: string) => api.approve(id), onMutate: (id) => {
    setLeaving(id);
    setTimeout(() => { setStatus(id, "approved"); setLeaving(null); setLanded((l) => [id, ...l.filter((x) => x !== id)]); if (!reduced) { setFlash(id); setTimeout(() => setFlash(null), 650); } }, reduced ? 0 : 250);
  }, onSettled: () => qc.invalidateQueries({ queryKey: ["transfers"] }) });
  const approveOne = (x: Transfer) => { approve.mutate(x.transfer_id); setToast(`${u.approved}: ${x.quantity.toLocaleString("en-IN")} ${x.commodity_name ?? x.commodity_id.replace(/_/g, " ")} → ${x.to_name}`); };
  const viewTransit = () => { setView("transit"); setToast(null); transitRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); };
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.reject(id, reason), onMutate: ({ id }) => setStatus(id, "rejected") });
  const delivered = useMutation({ mutationFn: (id: string) => api.delivered(id), onMutate: (id) => setStatus(id, "delivered") });
  const transfers = useMemo(() => (q.data?.transfers ?? []).map((x) => ({ ...x, status: local[x.transfer_id] ?? x.status })), [q.data, local]);
  const proposed = transfers.filter((x) => x.status === "proposed");
  const transit = transfers.filter((x) => ["approved", "picked_up"].includes(x.status))
    .sort((a, b) => { const ia = landed.indexOf(a.transfer_id), ib = landed.indexOf(b.transfer_id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  const deliveredList = transfers.filter((x) => x.status === "delivered");
  const needs = (summary.data?.alerts ?? []).filter((a) => a.alert && (!commodity || a.commodity_id === commodity)).slice(0, 20);
  const norm = term.trim().toLowerCase();
  const hit = (...fields: (string | undefined)[]) => !norm || fields.some((f) => (f ?? "").toLowerCase().includes(norm));
  const tHit = (x: Transfer) => hit(x.commodity_name, x.commodity_id.replace(/_/g, " "), x.from_name, x.to_name, x.from_district, x.to_district);
  const list = view === "proposed" ? proposed.filter(tHit) : view === "transit" ? transit.filter(tHit) : view === "delivered" ? deliveredList.filter(tHit) : [];
  const needsShown = needs.filter((n) => hit(n.facility_name, n.commodity_name));
  const byId = useMemo(() => Object.fromEntries((dots.data?.facilities ?? []).map((f) => [f.facility_id, f])), [dots.data]);
  const line = selected && byId[selected.from_id] && byId[selected.to_id] ? [[byId[selected.from_id].lon, byId[selected.from_id].lat], [byId[selected.to_id].lon, byId[selected.to_id].lat]] as [number, number][] : undefined;
  const medName = commodity ? transfers.find((x) => x.commodity_id === commodity)?.commodity_name ?? needs[0]?.commodity_name ?? commodity.replace(/_/g, " ") : null;
  const counts = { proposed: proposed.length, transit: transit.length, delivered: deliveredList.length, needs: needs.length };
  const segLabel = { proposed: a.segProposed, transit: a.segTransit, delivered: a.segDelivered, needs: a.segNeeds };
  const needsList = needsShown.map((n) => <div key={n.facility_id + n.commodity_id} className="mv-need"><div><b>{n.facility_name}</b><div className="faint">{n.commodity_name}{t.causes[n.cause] ? ` · ${t.causes[n.cause]}` : ""}</div></div><Scale days={n.days_of_stock} severity={n.severity} label={t.days} /></div>);
  return (
    <div className="pg mv">
      <section className="card pg-hero">
        <div className="pg-hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{a.mvEyebrow}</span><span aria-hidden> · </span>{a.mvEyebrowSub}</p>
            <h1>{t.dispatch}{medName && <span className="pg-filter"> · {medName} · <Link to={`${base}/dispatch`}>{t.showAllMeds}</Link></span>}</h1>
            <p className="faint pg-sub">{a.mvSub}</p>
          </div>
          {proposed.length > 1 && (
            <Dialog.Root>
              <Dialog.Trigger asChild><button className="btn primary">{t.approveAll} ({proposed.length})</button></Dialog.Trigger>
              <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog">
                <Dialog.Title>{t.confirmAll(proposed.length)}</Dialog.Title>
                <ul style={{ paddingLeft: 16, maxHeight: "40vh", overflow: "auto" }}>{proposed.slice(0, 30).map((x) => <li key={x.transfer_id}>{x.quantity} {x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}: {x.from_name} → {x.to_name}</li>)}</ul>
                {proposed.length > 30 && <p className="faint" style={{ margin: 0 }}>{t.andMore(proposed.length - 30)}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Dialog.Close asChild><button className="btn primary" onClick={() => { proposed.forEach((x) => approve.mutate(x.transfer_id)); setToast(`${u.approved}: ${proposed.length}`); }}>{t.approveAll}</button></Dialog.Close>
                  <Dialog.Close asChild><button className="btn">{t.cancel}</button></Dialog.Close>
                </div>
              </Dialog.Content></Dialog.Portal>
            </Dialog.Root>
          )}
        </div>
        <div className="mv-bar">
          <div className="seg" role="tablist" aria-label={t.dispatch}>
            {(["proposed", "transit", "delivered", "needs"] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} className={`${view === k ? "on" : ""}${k === "needs" ? " phone-only" : ""}`} onClick={() => setView(k)}>{segLabel[k]} <span className="seg-n">{counts[k]}</span></button>)}
          </div>
          <input className="input mv-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={a.search} aria-label={a.search} />
        </div>
      </section>
      {q.isLoading && <p className="skeleton" style={{ height: 80 }}>Loading proposals, the optimiser runs once per district</p>}
      <div className="pg-grid">
        <div ref={transitRef}>
          {view === "needs" && <section className="card">{needsList.length ? needsList : <p className="muted">{norm ? a.noMatch : t.noAlerts}</p>}</section>}
          {view !== "needs" && (
            <section className="card mv-list">
              {!q.isLoading && list.length === 0 && <p className="muted mv-empty">{norm ? a.noMatch : view === "proposed" ? a.proposedEmpty : view === "transit" ? u.transitEmpty : a.deliveredEmpty}</p>}
              {view === "proposed" && list.slice(0, shown).map((x) => <Card key={x.transfer_id} x={x} leaving={leaving === x.transfer_id} onSelect={() => setSelected(x)} actions={<>
                <RejectMenu onPick={(r) => reject.mutate({ id: x.transfer_id, reason: r })} />
                <button className="btn primary" onClick={() => approveOne(x)}>{t.approve}</button>
              </>} />)}
              {view === "proposed" && list.length > shown && <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setShown((n) => n + 20)}>{t.showMore(Math.min(20, list.length - shown), list.length - shown)}</button>}
              {view === "transit" && list.map((x) => <Card key={x.transfer_id} x={x} landed={flash === x.transfer_id} onSelect={() => setSelected(x)} actions={<button className="btn" onClick={() => delivered.mutate(x.transfer_id)}>{a.markDelivered}</button>} />)}
              {view === "delivered" && list.map((x) => <Card key={x.transfer_id} x={x} onSelect={() => setSelected(x)} actions={null} />)}
            </section>
          )}
        </div>
        <aside>
          <section className="card desktop-only mv-needs">
            <div className="card-head"><div><h2>{a.needsTitle} <span className="faint">{needs.length}</span></h2><p className="faint">{a.needsSub}</p></div></div>
            {needsList.length ? needsList : <p className="muted">{norm ? a.noMatch : t.noAlerts}</p>}
          </section>
          {dots.data && (
            <section className="card">
              <div className="card-head"><div><h2>{a.mapTitle}</h2><p className="faint">{a.mapSub}</p></div></div>
              <MapView dots={dots.data.facilities.filter((f) => selected ? [selected.from_id, selected.to_id].includes(f.facility_id) : f.worst_severity === "red")} line={line} />
              <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 8 }}>{q.data?.provenance}</p>
            </section>
          )}
        </aside>
      </div>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button className="btn quiet" onClick={viewTransit}>{u.viewTransit}</button></div>}
    </div>
  );
}

function Card({ x, actions, onSelect, leaving, landed }: { x: Transfer; actions: React.ReactNode; onSelect: () => void; leaving?: boolean; landed?: boolean }) {
  const { t, lang } = useApp();
  const a = sA[lang];
  const doneIdx = STEPS.indexOf(x.status);
  return (
    <div className={`tcard mv-card${leaving ? " leaving" : ""}${landed ? " landed" : ""}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}>
      <div className="mv-top">
        <div className="mv-name"><b>{x.commodity_name ?? x.commodity_id.replace(/_/g, " ")}</b><span className="qty-pill">+{x.quantity.toLocaleString("en-IN")}</span>{x.cross_district && <span className="chip teal">{a.crossDistrict}</span>}</div>
        <span className="faint mv-dist">{x.km} km · {x.eta_days} d</span>
      </div>
      <div className="flow">
        <div><span className="lbl">{a.donor}</span><b>{x.from_name}</b>{x.from_district && <span className="faint"> · {x.from_district}</span>}</div>
        <span className="arrow" aria-hidden>→</span>
        <div><span className="lbl red">{a.recipient}</span><b>{x.to_name}</b>{x.to_district && <span className="faint"> · {x.to_district}</span>}</div>
      </div>
      <div className="mv-after">
        <div><span className="lbl">{a.donorAfter}</span><Scale days={x.donor_days_after} severity="ok" label={t.days} /></div>
        <div><span className="lbl">{a.recipientAfter}</span><Scale days={x.recipient_days_after} severity="ok" label={t.days} /></div>
      </div>
      {doneIdx >= 1 && <div className="stepper mv-steps">{STEPS.map((st, i) => <span key={st} className={`step${i <= doneIdx ? " done" : ""}`}>{st.replace("_", " ")}</span>)}</div>}
      <div className="mv-act" onClick={(e) => e.stopPropagation()}>
        <span className="mv-why"><Explain kind="transfer" item={x}><button className="btn quiet">{t.whyLink}</button></Explain><Badge kind="computed" title={x.note ? `optimiser · ${x.note}` : "optimiser"} /></span>
        <span className="mv-btns">{actions}</span>
      </div>
    </div>
  );
}

function RejectMenu({ onPick }: { onPick: (r: string) => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return open ? (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button className="btn" onClick={() => { onPick("donor_cannot_spare"); setOpen(false); }}>{t.cannotSpare}</button>
      <button className="btn" onClick={() => { onPick("road_closed"); setOpen(false); }}>{t.roadClosed}</button>
    </span>
  ) : <button className="btn" onClick={() => setOpen(true)}>{t.reject}</button>;
}
