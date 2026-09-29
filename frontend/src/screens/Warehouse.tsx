import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type WarehouseRow } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import Scale from "../components/Scale";

export default function Warehouse() {
  const { unit, district, t } = useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["indents", unit, district], queryFn: () => api.indents(unit, district) });
  const [local, setLocal] = useState<Record<string, string>>({});
  const set = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.indentStatus(id, status), onMutate: ({ id, status }) => setLocal((l) => ({ ...l, [id]: status })), onSettled: () => qc.invalidateQueries({ queryKey: ["indents"] }) });
  const rows = (q.data?.indents ?? []).map((x) => ({ ...x, status: local[x.indent_id] ?? x.status }));
  const lanes = { pending: rows.filter((r) => r.status === "pending"), dispatched: rows.filter((r) => r.status === "dispatched"), delivered: rows.filter((r) => r.status === "delivered") };
  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>{t.indents} <span className="faint" style={{ fontSize: "var(--t-sm)", fontWeight: 400 }}>{district}</span></h1>
      {q.isLoading && <p className="skeleton" style={{ height: 60 }}>Building the indent queue from the alert engine</p>}
      <div className="lanes">
        {(["pending", "dispatched", "delivered"] as const).map((lane) => (
          <div key={lane} className={`lane ${lane === "pending" ? "needs" : lane === "dispatched" ? "proposed" : "transit"}`}>
            <h3>{lane === "pending" ? t.pending : lane === "dispatched" ? t.dispatched : t.deliveredStatus} <span className="faint">{lanes[lane].length}</span></h3>
            {lanes[lane].slice(0, 30).map((x) => (
              <div key={x.indent_id} className="tcard" style={{ cursor: "default" }}>
                <div className="tc-head">
                  <div>
                    <div className="tc-title">{x.commodity_name}</div>
                    <div className="tc-sub">{(x.units_per_case ?? 1) >= 10 && x.cases ? `${x.cases.toLocaleString("en-IN")} ${t.cases} ${t.ofN} ${x.units_per_case}, ${x.quantity.toLocaleString("en-IN")} ${t.units}` : `${x.quantity.toLocaleString("en-IN")} ${x.quantity === 1 ? t.unit1 : t.units}`}</div>
                  </div>
                  {t.causes[x.cause] && <div className="tc-meta"><span className={`chip ${x.cause === "cases_up" ? "red" : "amber"}`}>{t.causes[x.cause]}</span></div>}
                </div>
                <div className="tc-route"><span className="faint">{t.forFacility}</span><strong>{x.facility_name}</strong><span className="faint">{x.type}</span></div>
                <div className="tc-stats" style={{ gridTemplateColumns: "1fr" }}><Scale days={x.days_of_stock} severity={x.days_of_stock < 7 ? "red" : x.days_of_stock < 14 ? "amber" : "ok"} label={t.days} /></div>
                {lane !== "delivered" && <div className="tc-actions">
                  {lane === "pending" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "dispatched" })}>{t.markDispatched}</button>}
                  {lane === "dispatched" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "delivered" })}>{t.markDelivered}</button>}
                  {lane === "pending" && <button className="btn" onClick={() => set.mutate({ id: x.indent_id, status: "cancelled" })}>{t.cancel}</button>}
                </div>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: 12 }}>{q.data?.provenance}</p>
    </div>
  );
}

export function WarehouseStock() {
  const { unit, district, t, basis, setBasis } = useApp();
  const q = useQuery({ queryKey: ["warehouse", unit, district, basis], queryFn: () => api.warehouse(unit, district, basis) });
  const [open, setOpen] = useState<WarehouseRow | null>(null);
  if (q.isError) return <div className="quiet">No public HMIS ledger exists for this district.</div>;
  if (!q.data) return <p className="skeleton" style={{ height: 120 }}>Loading the store's ledger</p>;
  const monthName = MONTHS[q.data.month];
  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t.storeStock} <span className="faint" style={{ fontSize: "var(--t-sm)", fontWeight: 400 }}>{district} · {monthName} {q.data.fy}{q.data.provisional && <span className="faint" title="MoHFW labels FY 2020-21 figures provisional"> · provisional</span>}</span></h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 12px" }}>
        <button className="chip" aria-pressed={basis === "real"} onClick={() => setBasis("real")}>{t.basisRealLatest}</button>
        <button className="chip" aria-pressed={basis === "simulated"} onClick={() => setBasis("simulated")} title={t.basisSimulatedHint}>{t.basisSimulated}</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{q.data.provenance} <Badge kind={basis === "simulated" ? "simulated" : "real"} /></p>
      <div style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>{t.commodityHead}</th><th className="num">{t.openingHead}</th><th className="num">{t.receivedHead}</th><th className="num">{t.unusableHead}</th><th className="num">{t.distributedHead}</th><th className="num">{t.closingHead}</th><th className="num">{t.monthsOfStock}</th><th><span className="sr-only">{t.monthlyDetail}</span></th></tr></thead>
          <tbody>{q.data.rows.map((r) => <tr key={r.item_code}>
            <td>{r.item_name}{r.stale && <span className="faint" style={{ fontSize: "var(--t-xs)" }}> · {t.asOf} {MONTHS[r.month]} {r.fy}</span>}</td>
            <td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.received)}</td><td className="num">{fmt(r.unusable)}</td><td className="num">{fmt(r.distributed)}</td>
            <td className="num" style={r.reporting_error ? { color: "var(--blue)" } : undefined}>{fmt(r.closing)}</td>
            <td className="num">{r.reporting_error ? <span className="chip blue" title={t.reportErrorHint}>{t.reportError}</span> : <span style={{ color: r.months_of_stock != null && r.months_of_stock < 1 ? "var(--red)" : undefined, fontWeight: 500 }}>{r.months_of_stock == null ? "…" : r.months_of_stock.toFixed(1)}</span>}</td>
            <td className="num"><button className="btn quiet" onClick={() => setOpen(r)} aria-label={`${t.viewMonths}: ${r.item_name}`}>{t.viewMonths}</button></td>
          </tr>)}</tbody></table>
      </div>
      <Dialog.Root open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="sheet" aria-describedby={undefined}>
            {open && <>
              <div className="sheet-head">
                <div><Dialog.Title>{open.item_name}</Dialog.Title><p className="faint" style={{ margin: "4px 0 0" }}>{district} · {t.monthlyDetail} · FY {open.fy}</p></div>
                <Dialog.Close asChild><button className="btn quiet" aria-label={t.close}>✕</button></Dialog.Close>
              </div>
              <table className="table sheet-table"><thead><tr><th>{t.monthHead}</th><th className="num">{t.openingHead}</th><th className="num">{t.receivedHead}</th><th className="num">{t.distributedHead}</th><th className="num">{t.closingHead}</th></tr></thead>
                <tbody>{(open.history ?? []).map((m) => <tr key={`${m.fy}-${m.month}`}>
                  <td>{MONTHS[m.month]} {m.month >= 4 ? m.fy.slice(0, 4) : `20${m.fy.slice(5, 7)}`}</td>
                  <td className="num">{fmt(m.opening)}</td><td className="num">{fmt(m.received)}</td><td className="num">{fmt(m.distributed)}</td>
                  <td className="num" style={m.error ? { color: "var(--blue)" } : undefined}>{fmt(m.closing)}{m.error && <span className="sr-only"> {t.reportError}</span>}</td>
                </tr>)}</tbody></table>
              {(open.history ?? []).some((m) => m.error) && <p className="faint" style={{ fontSize: "var(--t-xs)" }}><span className="chip blue" style={{ minHeight: 22 }}>{t.reportError}</span> {t.reportErrorHint}</p>}
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
