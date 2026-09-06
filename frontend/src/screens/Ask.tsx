import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type AskResult } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";

export default function Ask() {
  const { unit, district, lang, t } = useApp();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sql, setSql] = useState("");
  const [history, setHistory] = useState<AskResult[]>([]);
  const ask = useMutation({ mutationFn: (body: Parameters<typeof api.ask>[0]) => api.ask(body), onSuccess: (r) => { setHistory((h) => [r, ...h]); if (r.sql) setSql(r.sql); } });
  const run = (question = q, userSql?: string) => { if (!question.trim() && !userSql) return; ask.mutate({ question: question || "(edited SQL)", unit, district, lang, mode, sql: userSql ?? null }); };
  const lastAuto = useRef<string | null>(null);
  useEffect(() => { const qq = sp.get("q"); if (qq && lastAuto.current !== qq) { lastAuto.current = qq; setQ(qq); run(qq); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get("q")]);
  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>{t.ask}</h1>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="input" style={{ flex: 1, minWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.ask} />
        <button className="btn primary" type="submit" disabled={ask.isPending}>{t.run}</button>
        <span style={{ display: "inline-flex", border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden" }}>
          <button type="button" className="btn quiet" style={mode === "guided" ? { background: "var(--teal-soft)" } : {}} onClick={() => setMode("guided")}>{t.guided}</button>
          <button type="button" className="btn quiet" style={mode === "advanced" ? { background: "var(--teal-soft)" } : {}} onClick={() => setMode("advanced")}>{t.advanced}</button>
        </span>
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 20px" }}>
        {t.examples.map((ex) => <button key={ex} className="chip" onClick={() => { setQ(ex); run(ex); }}>{ex}</button>)}
      </div>
      {mode === "advanced" && (
        <div className="section">
          <textarea className="input" value={sql} onChange={(e) => setSql(e.target.value)} aria-label="SQL" placeholder="SELECT ... (one read-only statement; tables: facilities, ledger, v_days_of_stock ...)" />
          <button className="btn" style={{ marginTop: 8 }} onClick={() => run(q, sql)} disabled={!sql.trim() || ask.isPending}>{t.run} SQL</button>
        </div>
      )}
      {ask.isPending && <p className="skeleton" style={{ height: 48 }}>Thinking about the question and running the query</p>}
      {history.map((r, i) => <Result key={i} r={r} />)}
    </div>
  );
}

function Result({ r }: { r: AskResult }) {
  const { t } = useApp();
  const [showSql, setShowSql] = useState(false);
  const cols = r.rows?.length ? Object.keys(r.rows[0]) : [];
  const csv = () => { const lines = [cols.join(","), ...r.rows.map((row) => cols.map((c) => JSON.stringify(row[c] ?? "")).join(","))]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "answer.csv"; a.click(); };
  return (
    <section className="section card">
      <p className="faint" style={{ fontSize: 13 }}>{r.question}{r.shape ? ` · ${r.shape}` : ""}{r.status !== "ok" ? ` · ${r.status}` : ""}</p>
      <p style={{ fontSize: "var(--t-md)", fontWeight: 500 }}>{r.answer || r.error || "No answer."}</p>
      {r.chart && r.chart.type !== "table" && r.rows?.length > 0 && <Chart rows={r.rows} x={r.chart.x!} y={r.chart.y!} kind={r.chart.type} />}
      {r.rows?.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="table"><thead><tr>{cols.map((c) => <th key={c} className={typeof r.rows[0][c] === "number" ? "num" : ""}>{c}</th>)}</tr></thead>
            <tbody>{r.rows.slice(0, 25).map((row, i) => <tr key={i}>{cols.map((c) => <td key={c} className={typeof row[c] === "number" ? "num" : ""}>{fmt(row[c])}</td>)}</tr>)}</tbody></table>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        {r.rows?.length > 0 && <span className="faint" style={{ fontSize: 13 }}>{r.row_count ?? r.rows.length} {t.rows}</span>}
        {r.rows?.length > 0 && <button className="btn quiet" onClick={csv}>{t.exportCsv}</button>}
        {r.sql && <button className="btn quiet" onClick={() => setShowSql((s) => !s)}>{t.showSql}</button>}
        <Badge kind="ai" /> {r.check && !r.check.ok && <span className="chip red">{r.check.reason}</span>}
      </div>
      {showSql && r.sql && <pre className="pre" style={{ marginTop: 8 }}>{r.sql_checked ?? r.sql}</pre>}
    </section>
  );
}

function fmt(v: unknown) { return typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(1)) : String(v ?? ""); }

function Chart({ rows, x, y, kind }: { rows: Record<string, unknown>[], x: string; y: string; kind: string }) {
  const data = rows.slice(0, 40).map((r) => ({ x: String(r[x] ?? ""), y: Number(r[y] ?? 0) }));
  const w = 640, h = 160, pad = 24, max = Math.max(...data.map((d) => d.y), 1);
  if (kind === "line") {
    const pts = data.map((d, i) => `${pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad)},${h - pad - (d.y / max) * (h - 2 * pad)}`).join(" ");
    return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, marginTop: 8 }} role="img" aria-label={`${y} by ${x}`}><polyline fill="none" stroke="var(--teal)" strokeWidth="2.5" points={pts} /></svg>;
  }
  const bw = (w - 2 * pad) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} style={{ width: "100%", maxWidth: w, marginTop: 8 }} role="img" aria-label={`${y} by ${x}`}>
      {data.map((d, i) => { const bh = (d.y / max) * (h - 2 * pad); return <g key={i}>
        <rect x={pad + i * bw + 2} y={h - pad - bh} width={Math.max(2, bw - 4)} height={bh} fill="var(--teal)" rx="2" />
        <text x={pad + i * bw + bw / 2} y={h + 12} fontSize="9" textAnchor="end" transform={`rotate(-35 ${pad + i * bw + bw / 2} ${h + 12})`} fill="var(--ink-3)">{d.x.slice(0, 18)}</text>
      </g>; })}
    </svg>
  );
}
