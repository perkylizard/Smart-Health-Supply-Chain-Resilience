import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type AskResult } from "../api";
import { useApp } from "../App";
import Badge from "../components/Badge";
import { sA } from "../stringsA";
import { cellLabel, colLabel } from "../labels";

export default function Ask() {
  const { unit, district, lang, t } = useApp();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sql, setSql] = useState("");
  type Entry = { id: number; at: Date; r: AskResult };
  const [history, setHistory] = useState<Entry[]>([]);
  const nextId = useRef(0);
  const ask = useMutation({ mutationFn: (body: Parameters<typeof api.ask>[0]) => api.ask(body), onSuccess: (r) => { setHistory((h) => [{ id: nextId.current++, at: new Date(), r }, ...h]); if (r.sql) setSql(r.sql); } });
  const run = (question = q, userSql?: string) => { if (!question.trim() && !userSql) return; ask.mutate({ question: question || "(edited SQL)", unit, district, lang, mode, sql: userSql ?? null }); };
  const lastAuto = useRef<string | null>(null);
  useEffect(() => { const qq = sp.get("q"); if (qq && lastAuto.current !== qq) { lastAuto.current = qq; setQ(qq); run(qq); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get("q")]);
  const a = sA[lang];
  const [picked, setPicked] = useState<string | null>(null);
  const [current, ...earlier] = history;
  return (
    <div className="pg ask">
      <section className="card pg-hero">
        <p className="eyebrow"><span className="eyebrow-accent">{a.askEyebrow}</span><span aria-hidden> · </span>{a.askEyebrowSub}</p>
        <h1>{a.askTitle}</h1>
        <p className="faint pg-sub">{a.askSub}</p>
        <div className="ask-tabs2 seg" role="tablist" aria-label={t.ask}>
          <button type="button" role="tab" aria-selected={mode === "guided"} className={mode === "guided" ? "on" : ""} onClick={() => setMode("guided")} title={t.guidedHint}>{t.guided}</button>
          <button type="button" role="tab" aria-selected={mode === "advanced"} className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")} title={t.advancedHint}>{t.advanced}</button>
          <span className="faint ask-mode-hint">{mode === "guided" ? t.guidedHint : t.advancedHint}</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setPicked(null); run(); }} className="ask-box">
          <span className="ask-glass" aria-hidden>⌕</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.ask} />
          <button className="btn dark" type="submit" disabled={ask.isPending || !q.trim()}>{ask.isPending ? t.asking : t.askBtn}</button>
        </form>
        {mode === "advanced" && (
          <div className="ask-sql-edit">
            <textarea className="input" value={sql} onChange={(e) => setSql(e.target.value)} aria-label="SQL" placeholder="SELECT ... (one read-only statement; tables: facilities, ledger, v_days_of_stock ...)" />
            <button className="btn" style={{ marginTop: 8 }} onClick={() => run(q, sql)} disabled={!sql.trim() || ask.isPending}>{t.run} SQL</button>
          </div>
        )}
        <div className="ask-try"><span className="faint">{t.tryExample}</span>
          {t.examples.map((ex) => <button key={ex} type="button" className="chip" aria-pressed={picked === ex} onClick={() => { setPicked(ex); setQ(ex); run(ex); }}>{ex}</button>)}
        </div>
      </section>
      {!ask.isPending && history.length === 0 && (
        <section className="card ask-empty2">
          <h2>{t.askEmptyTitle}</h2>
          <ul>{t.askEmptyPoints.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
      {ask.isPending && <p className="skeleton" style={{ height: 48 }}>Thinking about the question and running the query</p>}
      {current && <Result key={current.id} r={current.r} />}
      {earlier.length > 0 && (
        <section className="card ask-history" aria-label={a.historyTitle}>
          <div className="card-head">
            <div><h2>{a.historyTitle}</h2><p className="faint">{a.historySub(earlier.length)}</p></div>
            <button type="button" className="lnk-btn" onClick={() => setHistory((h) => h.slice(0, 1))}>{a.historyClear}</button>
          </div>
          <ul className="ask-hist-list">
            {earlier.map((e) => (
              <li key={e.id}>
                <button type="button" className="ask-hist-item" onClick={() => { setHistory((h) => [e, ...h.filter((x) => x.id !== e.id)]); setQ(e.r.question); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <span className="ask-hist-q">{e.r.question}</span>
                  <span className="ask-hist-a">{e.r.answer || e.r.error || ""}</span>
                  <span className="ask-hist-meta faint">{e.at.toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" })} · {a.rowsShort(e.r.row_count ?? e.r.rows?.length ?? 0)}</span>
                  <span className="ask-hist-open">{a.historyOpen} ›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Result({ r }: { r: AskResult }) {
  const { t, lang } = useApp();
  const a = sA[lang];
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const cols = r.rows?.length ? Object.keys(r.rows[0]) : [];
  const csv = () => { const lines = [cols.map((c) => colLabel(c, lang)).join(","), ...r.rows.map((row) => cols.map((c) => JSON.stringify(row[c] ?? "")).join(","))]; const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); el.download = "answer.csv"; el.click(); };
  const sqlText = r.sql_checked ?? r.sql ?? "";
  const copy = () => { navigator.clipboard?.writeText(sqlText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const n = r.row_count ?? r.rows?.length ?? 0;
  return (
    <div className="pg-grid ask-result">
      <section className="card">
        <div className="card-head">
          <div><h2>{a.answerTitle}</h2><p className="faint">{r.question}</p></div>
          <Badge kind="ai" />
        </div>
        <div className="ask-answer">{r.answer || r.error || "No answer."}</div>
        {r.check && !r.check.ok && <p><span className="chip red">{r.check.reason}</span></p>}
        {r.chart && r.chart.type !== "table" && r.rows?.length > 0 && <><h3 className="ask-h3">{a.chartTitle}</h3><Chart rows={r.rows} x={r.chart.x!} y={r.chart.y!} kind={r.chart.type} /></>}
        {sqlText && <button className="lnk-btn ask-sqltoggle" onClick={() => setShowSql((v) => !v)}>{showSql ? a.hideSql : a.inspectSql}</button>}
        {showSql && sqlText && (
          <div className="ask-sql">
            <div className="ask-sql-head"><span>{a.verifiedQuery}</span><button className="lnk-btn" onClick={copy}>{copied ? a.copied : a.copy}</button></div>
            <pre>{sqlText}</pre>
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head">
          <div><h2>{a.recordsTitle(n)}</h2><p className="faint">{n} {t.rows}</p></div>
          {r.rows?.length > 0 && <button className="btn" onClick={csv}>{t.exportCsv}</button>}
        </div>
        {r.rows?.length > 0 ? (
          <div className="tbl-wrap">
            <table className="table"><thead><tr>{cols.map((c) => <th key={c} className={typeof r.rows[0][c] === "number" ? "num" : ""}>{colLabel(c, lang)}</th>)}</tr></thead>
              <tbody>{r.rows.slice(0, 25).map((row, i) => <tr key={i}>{cols.map((c) => <td key={c} className={typeof row[c] === "number" ? "num" : ""}>{cellLabel(c, row[c], lang) ?? fmt(row[c])}</td>)}</tr>)}</tbody></table>
          </div>
        ) : <p className="muted">{a.noRecords}</p>}
      </section>
    </div>
  );
}

function fmt(v: unknown) { return typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(1)) : String(v ?? ""); }

function Chart({ rows, x, y, kind }: { rows: Record<string, unknown>[], x: string; y: string; kind: string }) {
  const data = rows.slice(0, 40).map((r) => ({ x: String(r[x] ?? ""), y: Number(r[y] ?? 0) }));
  const w = 640, h = 160, pad = 24, max = Math.max(...data.map((d) => d.y), 1);
  if (kind === "line") {
    const pts = data.map((d, i) => `${pad + (i / Math.max(1, data.length - 1)) * (w - 2 * pad)},${h - pad - (d.y / max) * (h - 2 * pad)}`).join(" ");
    return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, marginTop: 8 }} role="img" aria-label={`${y.replace(/_/g, " ")} by ${x.replace(/_/g, " ")}`}><polyline fill="none" stroke="var(--teal)" strokeWidth="2.5" points={pts} /></svg>;
  }
  // comparisons: horizontal labelled bars with the value in figures, top 12
  const top = data.slice(0, 12);
  return (
    <ul className="hbars" role="img" aria-label={`${y.replace(/_/g, " ")} by ${x.replace(/_/g, " ")}`}>
      {top.map((d, i) => <li key={i}><span className="hb-l" title={d.x}>{d.x}</span><span className="hb-t"><i style={{ width: `${Math.max(2, (d.y / max) * 100)}%` }} /></span><span className="hb-v">{fmt(d.y)}</span></li>)}
    </ul>
  );
}
