import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type Transfer } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Explain from "../components/Explain";
import MapView from "../components/MapView";
import Scale from "../components/Scale";

const STEPS = ["proposed", "approved", "picked_up", "delivered"];

export default function Dispatch() {
  const { unit, district, t } = useApp();
  const [sp] = useSearchParams();
  const commodity = sp.get("commodity") ?? undefined;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["transfers", unit, district, commodity], queryFn: () => api.transfers(unit, district, commodity) });
  const summary = useQuery({ queryKey: ["summary", unit, district], queryFn: () => api.summary(unit, district) });
  const dots = useQuery({ queryKey: ["dots", unit, district], queryFn: () => api.facilities(unit, district) });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const setStatus = (id: string, status: string) => setLocal((l) => ({ ...l, [id]: status }));
  const approve = useMutation({ mutationFn: (id: string) => api.approve(id), onMutate: (id) => { setLeaving(id); setTimeout(() => { setStatus(id, "approved"); setLeaving(null); }, 250); }, onSettled: () => qc.invalidateQueries({ queryKey: ["transfers"] }) });
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.reject(id, reason), onMutate: ({ id }) => setStatus(id, "rejected") });
  const delivered = useMutation({ mutationFn: (id: string) => api.delivered(id), onMutate: (id) => setStatus(id, "delivered") });
  const transfers = useMemo(() => (q.data?.transfers ?? []).map((x) => ({ ...x, status: local[x.transfer_id] ?? x.status })), [q.data, local]);
  const proposed = transfers.filter((x) => x.status === "proposed");
  const transit = transfers.filter((x) => ["approved", "picked_up", "delivered"].includes(x.status));
  const needs = (summary.data?.alerts ?? []).filter((a) => a.alert && (!commodity || a.commodity_id === commodity)).slice(0, 20);
  const byId = useMemo(() => Object.fromEntries((dots.data?.facilities ?? []).map((f) => [f.facility_id, f])), [dots.data]);
  const line = selected && byId[selected.from_id] && byId[selected.to_id] ? [[byId[selected.from_id].lon, byId[selected.from_id].lat], [byId[selected.to_id].lon, byId[selected.to_id].lat]] as [number, number][] : undefined;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1>{t.dispatch} <span className="faint" style={{ fontSize: "var(--t-sm)", fontWeight: 400 }}>{commodity ? commodity.replace(/_/g, " ") : ""}</span></h1>
        {proposed.length > 1 && (
          <Dialog.Root>
            <Dialog.Trigger asChild><button className="btn primary">{t.approveAll} ({proposed.length})</button></Dialog.Trigger>
            <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog">
              <Dialog.Title>{t.confirmAll(proposed.length)}</Dialog.Title>
              <ul style={{ paddingLeft: 18 }}>{proposed.map((x) => <li key={x.transfer_id}>{x.quantity} {x.commodity_id.replace(/_/g, " ")}: {x.from_name} → {x.to_name}</li>)}</ul>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Dialog.Close asChild><button className="btn primary" onClick={() => proposed.forEach((x) => approve.mutate(x.transfer_id))}>{t.approveAll}</button></Dialog.Close>
                <Dialog.Close asChild><button className="btn">{t.cancel}</button></Dialog.Close>
              </div>
            </Dialog.Content></Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
      {q.isLoading && <p className="skeleton" style={{ height: 80 }}>Loading proposals, the optimiser runs once per district</p>}
      <div className="lanes">
        <div className="lane needs"><h3>{t.needs} <span className="faint">{needs.length}</span></h3>
          {needs.map((a) => <div key={a.facility_id + a.commodity_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}><div style={{ fontWeight: 500 }}>{a.facility_name}</div><div className="sub faint">{a.commodity_name} · {t.causes[a.cause] ?? ""}</div><Scale days={a.days_of_stock} severity={a.severity} label={t.days} /></div>)}
        </div>
        <div className="lane proposed"><h3>{t.proposed} <span className="faint">{proposed.length}</span></h3>
          {!q.isLoading && proposed.length === 0 && <div className="quiet">No transfer needed. Every facility with an alert has no reachable donor above 21 days, or nothing is under threshold.</div>}
          {proposed.map((x) => <Card key={x.transfer_id} x={x} leaving={leaving === x.transfer_id} onSelect={() => setSelected(x)} actions={<>
            <button className="btn primary" onClick={() => approve.mutate(x.transfer_id)}>{t.approve}</button>
            <RejectMenu onPick={(r) => reject.mutate({ id: x.transfer_id, reason: r })} />
          </>} />)}
        </div>
        <div className="lane transit"><h3>{t.transit} <span className="faint">{transit.length}</span></h3>
          {transit.map((x) => <Card key={x.transfer_id} x={x} onSelect={() => setSelected(x)} actions={x.status !== "delivered" ? <button className="btn" onClick={() => delivered.mutate(x.transfer_id)}>{t.delivered}</button> : null} />)}
        </div>
      </div>
      {dots.data && (
        <section className="section" style={{ marginTop: 24 }}>
          <MapView dots={dots.data.facilities.filter((f) => selected ? [selected.from_id, selected.to_id].includes(f.facility_id) : f.worst_severity === "red")} line={line} />
          <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>{q.data?.provenance}</p>
        </section>
      )}
    </div>
  );
}

function Card({ x, actions, onSelect, leaving }: { x: Transfer; actions: React.ReactNode; onSelect: () => void; leaving?: boolean }) {
  const { t } = useApp();
  const doneIdx = STEPS.indexOf(x.status);
  return (
    <div className={`tcard${leaving ? " leaving" : ""}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="qty">{x.quantity} <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>{x.commodity_id.replace(/_/g, " ")}</span></span>
        <span className="faint" style={{ fontSize: 13 }}>{x.km} km · {x.eta_days} d{x.cross_district && <span className="chip teal" style={{ marginLeft: 6 }}>cross-district</span>}</span>
      </div>
      <div style={{ margin: "6px 0" }}>{x.from_name} <span className="faint">→</span> <strong>{x.to_name}</strong></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
        <div><span className="faint">donor after</span><Scale days={x.donor_days_after} severity="ok" label={t.days} /></div>
        <div><span className="faint">recipient after</span><Scale days={x.recipient_days_after} severity="ok" label={t.days} /></div>
      </div>
      {doneIdx >= 1 && <div className="stepper" style={{ marginTop: 8 }}>{STEPS.map((s, i) => <span key={s} className={`step${i <= doneIdx ? " done" : ""}`}>{s.replace("_", " ")}</span>)}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
        {actions}
        <Explain kind="transfer" item={x}><button className="btn quiet" style={{ color: "var(--teal)" }}>{t.whyLink}</button></Explain>
        <Badge kind="computed" title={x.note ? `optimiser · ${x.note}` : "optimiser"} />
      </div>
    </div>
  );
}

function RejectMenu({ onPick }: { onPick: (r: string) => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return open ? (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button className="btn" onClick={() => { onPick("donor_cannot_spare"); setOpen(false); }}>{t.cannotSpare}</button>
      <button className="btn" onClick={() => { onPick("road_closed"); setOpen(false); }}>{t.roadClosed}</button>
    </span>
  ) : <button className="btn" onClick={() => setOpen(true)}>{t.reject}</button>;
}
