import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LedgerMonth, type WarehouseRow } from "../api";
import { sB } from "../stringsB";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Scale from "../components/Scale";

type Lane = "pending" | "dispatched" | "delivered";
const priorityOf = (d: number | null): ["red" | "amber" | "slate", "prEmergency" | "prHigh" | "prRoutine"] => d == null ? ["amber", "prHigh"] : d < 1 ? ["red", "prEmergency"] : d < 7 ? ["amber", "prHigh"] : ["slate", "prRoutine"];

export default function Warehouse() {
  const { unit, district, t, lang } = useApp();
  const b = sB[lang];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["indents", unit, district], queryFn: () => api.indents(unit, district) });
  const [local, setLocal] = useState<Record<string, string>>({});
  const [lane, setLane] = useState<Lane>("pending");
  const [nShown, setNShown] = useState(12);
  const set = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.indentStatus(id, status), onMutate: ({ id, status }) => setLocal((l) => ({ ...l, [id]: status })), onSettled: () => qc.invalidateQueries({ queryKey: ["indents"] }) });
  const rows = (q.data?.indents ?? []).map((x) => ({ ...x, status: local[x.indent_id] ?? x.status }));
  const count = (l: Lane) => rows.filter((r) => r.status === l).length;
  const inLane = rows.filter((r) => r.status === lane);
  // one card per facility, facilities with the most urgent item first; facility requests always lead
  const groups = Object.values(inLane.reduce<Record<string, typeof inLane>>((acc, r) => { (acc[r.facility_id] ??= []).push(r); return acc; }, {}))
    .map((items) => items.sort((a, c) => (a.source === "request" ? -1 : 0) - (c.source === "request" ? -1 : 0) || (a.days_of_stock ?? 0) - (c.days_of_stock ?? 0)))
    .sort((a, c) => Number(c.some((x) => x.source === "request")) - Number(a.some((x) => x.source === "request")) || Math.min(...a.map((x) => x.days_of_stock ?? 99)) - Math.min(...c.map((x) => x.days_of_stock ?? 99)));
  const qty = (x: (typeof rows)[number]) => (x.units_per_case ?? 1) >= 10 && x.cases
    ? <><span className="qty-cases">{x.cases.toLocaleString("en-IN")} {t.cases}</span><span className="qty-units">{t.ofN} {x.units_per_case}, {x.quantity.toLocaleString("en-IN")} {t.units}</span></>
    : <span className="qty-cases">{x.quantity.toLocaleString("en-IN")} {x.quantity === 1 ? t.unit1 : t.units}</span>;
  const next: Record<Lane, string | null> = { pending: "dispatched", dispatched: "delivered", delivered: null };
  return (
    <div className="pg">
      <section className="card">
        <div className="pg-head">
          <div><p className="eyebrow"><span className="eyebrow-accent">{b.storeEyebrow}</span></p><h1>{b.indentsTitle(district)}</h1><p className="sub">{b.indentsSub}</p></div>
        </div>
        <div className="tiles">
          {(["pending", "dispatched", "delivered"] as const).map((l) => <div key={l} className="tile"><div className="tile-h"><span>{l === "pending" ? t.pending : l === "dispatched" ? t.dispatched : t.deliveredStatus}</span></div><div className="tile-n">{q.data ? count(l) : "…"}</div><div className="tile-s">{q.data ? b.items(count(l)) : ""}</div></div>)}
          <div className="tile"><div className="tile-h"><span>{t.requestedByFacility}</span></div><div className="tile-n">{q.data ? rows.filter((r) => r.source === "request" && r.status !== "delivered").length : "…"}</div><div className="tile-s">{t.pending} · {t.dispatched}</div></div>
        </div>
      </section>
      <section className="card">
        <div className="toolbar">
          <div className="seg" role="tablist" aria-label={t.indents}>
            {(["pending", "dispatched", "delivered"] as const).map((l) => <button key={l} role="tab" aria-selected={lane === l} className={lane === l ? "on" : ""} onClick={() => { setLane(l); setNShown(12); }}>{l === "pending" ? t.pending : l === "dispatched" ? t.dispatched : t.deliveredStatus}<span className="seg-n">{count(l)}</span></button>)}
          </div>
          {groups.length > 0 && <span className="faint" style={{ fontSize: 12 }}>{b.groupsShown(Math.min(nShown, groups.length), groups.length)}</span>}
        </div>
        {q.isLoading && <p className="skeleton" style={{ height: 60 }}>Building the indent queue from the alert engine</p>}
        {q.isError && <p className="muted">{t.offline}</p>}
        {q.data && groups.length === 0 && <p className="muted">{b.laneEmpty}</p>}
        {groups.slice(0, nShown).map((items) => { const x0 = items[0]; const worst = Math.min(...items.map((x) => x.days_of_stock ?? 99)); const [pt, pk] = priorityOf(items.some((x) => x.source === "request") && worst === 99 ? null : worst); return (
          <div key={x0.facility_id} className="fac-group">
            <div className="fac-group-head">
              <div><div className="name">{x0.facility_name}</div><div className="meta"><span>{x0.type}</span><span>·</span><span>{b.items(items.length)}</span></div></div>
              <span className={`status-badge ${pt}`}>{b[pk]}</span>
            </div>
            <div className="dtable-wrap" style={{ margin: 0, padding: 0 }}>
              <table className="dtable stack">
                <thead><tr><th>{b.colMedicine}</th><th>{b.colCurrent}</th><th className="num">{b.colQty}</th><th>{b.colSource}</th><th className="num"><span className="sr-only">{b.colAction}</span></th></tr></thead>
                <tbody>{items.map((x) => (
                  <tr key={x.indent_id}>
                    <td className="full"><div className="med-name">{x.commodity_name}</div></td>
                    <td>{x.days_of_stock != null ? <Scale days={x.days_of_stock} severity={x.days_of_stock < 7 ? "red" : x.days_of_stock < 14 ? "amber" : "ok"} label={t.days} /> : <span className="faint">…</span>}</td>
                    <td className="num">{qty(x)}</td>
                    <td>{x.source === "request" ? <><span className="chip blue">{t.requestedByFacility}</span>{x.note && <div className="note-q">“{x.note}”</div>}</> : t.causes[x.cause] ? <span className={`chip ${x.cause === "cases_up" ? "red" : "amber"}`}>{t.causes[x.cause]}</span> : null}</td>
                    <td className="num full"><div className="row-acts">
                      {lane === "pending" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "dispatched" })}>{t.markDispatched}</button>}
                      {lane === "dispatched" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "delivered" })}>{t.markDelivered}</button>}
                      {lane === "pending" && x.source !== "request" && <button className="btn" onClick={() => set.mutate({ id: x.indent_id, status: "cancelled" })}>{t.cancel}</button>}
                    </div></td>
                  </tr>))}</tbody>
              </table>
            </div>
            {next[lane] && items.length > 1 && <div className="fac-group-foot"><button className="btn soft" onClick={() => items.forEach((x) => set.mutate({ id: x.indent_id, status: next[lane]! }))}>{lane === "pending" ? b.dispatchAll : b.deliverAll}</button></div>}
          </div>); })}
        {groups.length > nShown && <button className="btn" style={{ width: "100%" }} onClick={() => setNShown((n) => n + 12)}>{b.showMoreFac}</button>}
        <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 12 }}>{q.data?.provenance}</p>
      </section>
    </div>
  );
}

export function WarehouseStock() {
  const { unit, district, t, basis, setBasis, lang } = useApp();
  const b = sB[lang];
  const q = useQuery({ queryKey: ["warehouse", unit, district, basis], queryFn: () => api.warehouse(unit, district, basis) });
  const [open, setOpen] = useState<WarehouseRow | null>(null);
  const [find, setFind] = useState("");
  if (q.isError) return <div className="pg"><section className="card"><div className="quiet">No public HMIS ledger exists for this district.</div></section></div>;
  if (!q.data) return <p className="skeleton" style={{ height: 120 }}>Loading the store's ledger</p>;
  const monthName = MONTHS[q.data.month];
  const rows = q.data.rows.filter((r) => r.item_name.toLowerCase().includes(find.trim().toLowerCase()));
  const hist = open?.history ?? [];
  const balances = (m: LedgerMonth) => [m.opening, m.received, m.distributed, m.closing].every((v) => v != null) && Math.abs((m.opening ?? 0) + (m.received ?? 0) - (m.unusable ?? 0) - (m.distributed ?? 0) - (m.closing ?? 0)) < 0.5;
  const nBal = hist.filter(balances).length;
  const csv = () => {
    if (!open) return;
    const head = ["month", "fy", "opening", "received", "unusable", "distributed", "closing", "balances"];
    const lines = [head.join(","), ...hist.map((m) => [MONTHS[m.month], m.fy, m.opening ?? "", m.received ?? "", m.unusable ?? "", m.distributed ?? "", m.closing ?? "", balances(m) ? "yes" : "no"].join(","))];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = `${district}-${open.item_name}-${open.fy}.csv`.replace(/\s+/g, "_"); a.click();
  };
  return (
    <div className="pg">
      <section className="card">
        <div className="pg-head">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{b.storeEyebrow}</span><span aria-hidden> · </span>{district} · {monthName} {q.data.fy}{q.data.provisional && <span className="faint" title="MoHFW labels FY 2020-21 figures provisional"> · provisional</span>}</p>
            <h1>{b.stockTitle}</h1>
            <p className="sub">{b.stockSub}</p>
          </div>
          <div className="pg-actions">
            <button className="chip" aria-pressed={basis === "real"} onClick={() => setBasis("real")}>{t.basisRealLatest}</button>
            <button className="chip" aria-pressed={basis === "simulated"} onClick={() => setBasis("simulated")} title={t.basisSimulatedHint}>{t.basisSimulated}</button>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="toolbar">
          <p className="muted" style={{ margin: 0, fontSize: 12, flex: 1, minWidth: 220 }}>{q.data.provenance} <Badge kind={basis === "simulated" ? "simulated" : "real"} /></p>
          <input className="input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={b.findMed} aria-label={b.findMed} />
        </div>
        <div className="dtable-wrap">
          <table className="dtable"><thead><tr><th>{t.commodityHead}</th><th className="num">{t.openingHead}</th><th className="num">+ {t.receivedHead}</th><th className="num">− {t.unusableHead}</th><th className="num">− {t.distributedHead}</th><th className="num">= {t.closingHead}</th><th className="num">{t.monthsOfStock}</th><th><span className="sr-only">{t.monthlyDetail}</span></th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.item_code}>
              <td><div className="med-name">{r.item_name}</div>{r.stale && <div className="med-sub">{t.asOf} {MONTHS[r.month]} {r.fy}</div>}</td>
              <td className="num">{fmt(r.opening)}</td><td className="num plus">{fmt(r.received)}</td><td className="num minus">{fmt(r.unusable)}</td><td className="num">{fmt(r.distributed)}</td>
              <td className="num" style={r.reporting_error ? { color: "var(--blue)", fontWeight: 700 } : { fontWeight: 700 }}>{fmt(r.closing)}</td>
              <td className="num">{r.reporting_error ? <span className="chip blue" title={t.reportErrorHint}>{t.reportError}</span> : <span style={{ color: r.months_of_stock != null && r.months_of_stock < 1 ? "var(--red)" : undefined, fontWeight: 700 }}>{r.months_of_stock == null ? "…" : r.months_of_stock.toFixed(1)}</span>}</td>
              <td className="num"><button className="btn quiet" onClick={() => setOpen(r)} aria-label={`${t.viewMonths}: ${r.item_name}`}>{t.viewMonths}</button></td>
            </tr>)}</tbody></table>
        </div>
        {rows.length === 0 && <p className="muted">{b.noMatch}</p>}
      </section>
      <Dialog.Root open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="sheet" aria-describedby={undefined}>
            {open && <>
              <div className="sheet-head">
                <div><Dialog.Title>{open.item_name}</Dialog.Title><p className="faint" style={{ margin: "4px 0 0" }}>{district} · {t.monthlyDetail} · FY {open.fy}</p></div>
                <div style={{ display: "flex", gap: 4 }}><button className="btn" onClick={csv}>{b.csv}</button><Dialog.Close asChild><button className="btn quiet" aria-label={t.close}>✕</button></Dialog.Close></div>
              </div>
              <table className="dtable sheet-table"><thead><tr><th>{t.monthHead}</th><th className="num">{t.openingHead}</th><th className="num">+ {t.receivedHead}</th><th className="num">− {t.unusableHead}</th><th className="num">− {t.distributedHead}</th><th className="num">= {t.closingHead}</th></tr></thead>
                <tbody>{hist.map((m) => <tr key={`${m.fy}-${m.month}`}>
                  <td>{MONTHS[m.month]} {m.month >= 4 ? m.fy.slice(0, 4) : `20${m.fy.slice(5, 7)}`}{!balances(m) && <span className="sr-only"> {b.mismatch}</span>}</td>
                  <td className="num">{fmt(m.opening)}</td><td className="num plus">{fmt(m.received)}</td><td className="num minus">{fmt(m.unusable)}</td><td className="num">{fmt(m.distributed)}</td>
                  <td className="num" style={m.error ? { color: "var(--blue)", fontWeight: 700 } : { fontWeight: 700 }} title={balances(m) ? undefined : b.mismatch}>{fmt(m.closing)}{!balances(m) && " *"}{m.error && <span className="sr-only"> {t.reportError}</span>}</td>
                </tr>)}</tbody></table>
              <div className={`sheet-foot${nBal < hist.length ? " bad" : ""}`}><span>{nBal === hist.length ? "✓ " : "* "}{b.balanced(nBal, hist.length)}</span></div>
              {hist.some((m) => m.error) && <p className="faint" style={{ fontSize: "var(--t-xs)" }}><span className="chip blue" style={{ minHeight: 22 }}>{t.reportError}</span> {t.reportErrorHint}</p>}
              <p className="faint" style={{ fontSize: "var(--t-xs)" }}>{q.data.provenance}</p>
            </>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(v: number | null) { return v == null ? "…" : Math.round(v).toLocaleString("en-IN"); }
