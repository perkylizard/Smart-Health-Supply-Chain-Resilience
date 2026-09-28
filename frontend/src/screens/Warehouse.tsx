import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
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
              <div key={x.indent_id} className="tcard">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="qty">{x.quantity.toLocaleString("en-IN")} <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>{x.commodity_name}</span></span><span className="faint" style={{ fontSize: 13 }}>{t.qtyToSend}</span></div>
                <div style={{ margin: "6px 0" }}><strong>{x.facility_name}</strong> <span className="faint">{x.type} · {t.causes[x.cause] ?? ""}</span></div>
                <Scale days={x.days_of_stock} severity={x.days_of_stock < 7 ? "red" : x.days_of_stock < 14 ? "amber" : "ok"} label={t.days} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {lane === "pending" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "dispatched" })}>{t.markDispatched}</button>}
                  {lane === "dispatched" && <button className="btn primary" onClick={() => set.mutate({ id: x.indent_id, status: "delivered" })}>{t.markDelivered}</button>}
                  {lane === "pending" && <button className="btn" onClick={() => set.mutate({ id: x.indent_id, status: "cancelled" })}>{t.cancel}</button>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>{q.data?.provenance}</p>
    </div>
  );
}

export function WarehouseStock() {
  const { unit, district, t } = useApp();
  const q = useQuery({ queryKey: ["warehouse", unit, district], queryFn: () => api.warehouse(unit, district) });
  if (q.isError) return <div className="quiet">No public HMIS ledger exists for this district.</div>;
  if (!q.data) return <p className="skeleton" style={{ height: 120 }}>Loading the store's ledger</p>;
  const monthName_ = (m: number) => ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m];
  const monthName = monthName_(q.data.month);
  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t.storeStock} <span className="faint" style={{ fontSize: "var(--t-sm)", fontWeight: 400 }}>{district} · {monthName} {q.data.fy}{q.data.provisional && <span className="faint" title="MoHFW labels FY 2020-21 figures provisional"> · provisional</span>}</span></h1>
      <p className="muted" style={{ marginTop: 0 }}>{q.data.provenance} <Badge kind="real" /></p>
      <div style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>commodity</th><th className="num">opening</th><th className="num">received</th><th className="num">unusable</th><th className="num">distributed</th><th className="num">closing</th><th className="num">{t.monthsOfStock}</th><th>distributed by month</th></tr></thead>
          <tbody>{q.data.rows.map((r) => <tr key={r.item_code}><td>{r.item_name}{r.stale && <span className="faint" style={{ fontSize: 12 }}> · as of {monthName_(r.month)} {r.fy}</span>}</td><td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.received)}</td><td className="num">{fmt(r.unusable)}</td><td className="num">{fmt(r.distributed)}</td><td className="num">{fmt(r.closing)}</td><td className="num" style={{ color: r.months_of_stock != null && r.months_of_stock < 1 ? "var(--red)" : undefined, fontWeight: 600 }}>{r.months_of_stock == null ? "…" : r.months_of_stock.toFixed(1)}</td><td><Bars v={r.distributed_by_month} /></td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function fmt(v: number | null) { return v == null ? "…" : Math.round(v).toLocaleString("en-IN"); }
function Bars({ v }: { v: (number | null)[] }) {
  const vals = v.map((x) => x ?? 0); const max = Math.max(...vals, 1);
  return <svg width={vals.length * 7} height="20" aria-hidden>{vals.map((x, i) => <rect key={i} x={i * 7} y={20 - (x / max) * 18} width="5" height={(x / max) * 18} fill="var(--teal)" />)}</svg>;
}
