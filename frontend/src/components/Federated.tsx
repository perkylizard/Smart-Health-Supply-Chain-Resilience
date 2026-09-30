import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type FedTier } from "../api";
import { useApp } from "../App";
import Badge from "./Badge";
import { sA } from "../stringsA";

/** Brazilian federative units: the node table shows full names, not two-letter codes. */
const UF: Record<string, string> = {"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"};
const TIERS = ["districts_bihar_coldstart", "districts_bihar", "states_india", "states_brazil", "countries_brics"] as const;

const FW = {
  en: {
    headline: (label: string, lo: string, fe: string, pct: number, better: number, n: number) => `${label}: pooling what each node learned lifts early-warning accuracy from ${lo} to ${fe} (${pct >= 0 ? "+" : ""}${pct}%). ${better} of ${n} nodes predict better or as well, and no record left any node.`,
    inWords: (k: number) => `Ranks a facility about to run out above one that isn't, ${k} times in 10`,
    catches: (k: number, r: number) => `The shared model catches about ${k} of every 10 stock-outs in months it never saw (recall ${r}).`,
    gainsTitle: "Who gains most", gainsSub: "Accuracy (AUC) trained alone vs federated, for the nodes that gain most. Nodes with little data of their own gain the most.",
    alone: "alone", fed: "federated", rows: "rows",
    travelTitle: "What travels, what stays home",
    travels: ["Model weights: a short list of numbers per round", "Row counts, used to weight the average"],
    stays: ["Facility stock ledgers and monthly counts", "Facility names, locations and patient numbers"],
    travelsH: "Travels to the aggregator", staysH: "Stays at the node",
  },
  hi: {
    headline: (label: string, lo: string, fe: string, pct: number, better: number, n: number) => `${label}: हर नोड की सीख मिलाने से पूर्व-चेतावनी की सटीकता ${lo} से ${fe} (${pct >= 0 ? "+" : ""}${pct}%) हो जाती है। ${n} में से ${better} नोड बेहतर या बराबर अनुमान लगाते हैं, और कोई रिकॉर्ड किसी नोड से बाहर नहीं गया।`,
    inWords: (k: number) => `जो सुविधा स्टॉक-आउट होने वाली है उसे 10 में से ${k} बार सही ऊपर रखता है`,
    catches: (k: number, r: number) => `साझा मॉडल अनदेखे महीनों में हर 10 में से लगभग ${k} स्टॉक-आउट पकड़ता है (रिकॉल ${r})।`,
    gainsTitle: "सबसे ज़्यादा लाभ किसे", gainsSub: "अकेले बनाम फ़ेडरेटेड सटीकता (AUC), सबसे ज़्यादा लाभ वाले नोड। कम डेटा वाले नोड सबसे ज़्यादा लाभ पाते हैं।",
    alone: "अकेले", fed: "फ़ेडरेटेड", rows: "पंक्तियाँ",
    travelTitle: "क्या जाता है, क्या रहता है",
    travels: ["मॉडल के भार: हर राउंड कुछ संख्याओं की सूची", "पंक्तियों की गिनती, औसत के भार के लिए"],
    stays: ["सुविधाओं के स्टॉक लेजर और मासिक गिनती", "सुविधाओं के नाम, स्थान और मरीज़ों की संख्या"],
    travelsH: "एग्रीगेटर तक जाता है", staysH: "नोड पर रहता है",
  },
};

/** Say what actually went wrong with a live round instead of one catch-all line. */
function runError(msg: string, lang: "en" | "hi") {
  const code = Number(msg.split(" ")[0]);
  const en = code === 429 ? "Another live round is running. Try again in a few seconds."
    : code === 502 || code === 503 || code === 504 ? "The server took too long this time. It may still be preparing the data after a restart; try again in a minute."
    : !code ? "Could not reach the server. Check the connection and try again." : "The live round failed. The replay above still shows the stored result.";
  const hi = code === 429 ? "एक और लाइव राउंड चल रहा है। कुछ सेकंड बाद फिर कोशिश करें।"
    : code === 502 || code === 503 || code === 504 ? "इस बार सर्वर को ज़्यादा समय लगा। रीस्टार्ट के बाद डेटा तैयार हो रहा हो सकता है; एक मिनट बाद फिर कोशिश करें।"
    : !code ? "सर्वर तक नहीं पहुँच सके। कनेक्शन जाँचें और फिर कोशिश करें।" : "लाइव राउंड विफल रहा। ऊपर का रीप्ले संग्रहीत परिणाम दिखाता है।";
  return lang === "hi" ? hi : en;
}

export default function Federated() {
  const { t, lang } = useApp();
  const replay = useQuery({ queryKey: ["fedReplay"], queryFn: api.fedReplay });
  const [tier, setTier] = useState<(typeof TIERS)[number]>("districts_bihar_coldstart");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const live = useMutation({ mutationFn: () => api.fedRun(tier, 5) });
  const labels = { districts_bihar_coldstart: t.tierColdstart, districts_bihar: t.tierDistricts, states_india: t.tierStates, states_brazil: t.tierBrazil, countries_brics: t.tierBrics };
  const label = labels[tier];
  const brazil = tier === "states_brazil" || tier === "countries_brics";
  const data: FedTier | undefined = mode === "live" && live.data ? live.data : replay.data?.tiers[tier];
  if (replay.isError) return <div className="quiet">{t.comingSoon}</div>;
  if (!data) return <p className="skeleton" style={{ height: 80 }}>Loading the federated replay</p>;
  const s = data.summary;
  const rounds = data.rounds;
  const last = rounds[rounds.length - 1];
  const nodes = Object.entries(last.per_node).sort((a, b) => a[1].rows - b[1].rows);
  const max = 1, min = 0.4;
  const w = 520, h = 120, pad = 24;
  const pts = rounds.map((r, i) => `${pad + (i / Math.max(1, rounds.length - 1)) * (w - 2 * pad)},${h - pad - ((r.global.auc - min) / (max - min)) * (h - 2 * pad)}`).join(" ");
  const gain = s.mean_auc_federated - s.mean_auc_local_only;
  const a = sA[lang];
  const fw = FW[lang];
  const gains = Object.entries(last.per_node).map(([name, v]) => ({ name: UF[name] ?? name, rows: v.rows, lo: v.local_only.auc, fe: v.federated.auc })).sort((x, y) => (y.fe - y.lo) - (x.fe - x.lo)).slice(0, 10);
  const groupOf = (name: string) => (UF[name] ? "Brazil" : brazil && tier === "countries_brics" ? "India" : tier.startsWith("districts") ? "District" : "State");
  return (
    <div className="fed">
      <p className="muted" style={{ marginTop: 0 }}>{t.fedIntro}</p>
      <div className="fed-tiers">
        {([[t.tierGroupIndia, TIERS.slice(0, 3)], [t.tierGroupBrazil, TIERS.slice(3)]] as const).map(([g, ks]) => (
          <div key={g} className="tier-group"><span className="tier-label">{g}</span>
            {ks.map((k) => <button key={k} className="chip" aria-pressed={tier === k} onClick={() => { setTier(k); setMode("replay"); }}>{labels[k]}</button>)}
          </div>))}
      </div>
      {brazil && <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "8px 0 0" }}><Badge kind="simulated" /> {t.brazilNote}</p>}
      <p className="fed-headline">{fw.headline(label, s.mean_auc_local_only.toFixed(3), s.mean_auc_federated.toFixed(3), Math.round((gain / Math.max(0.001, s.mean_auc_local_only)) * 1000) / 10, s.federated_better_or_equal_nodes, s.nodes)}</p>
      <div className="tiles tiles-3 fed-tiles">
        <div className="tile"><div className="tile-h"><span>{a.fedRows}</span><Badge kind="computed" /></div><div className="tile-n" style={{ color: s.rows_crossed_border === 0 ? "var(--green)" : "var(--red)" }}>{s.rows_crossed_border}</div><div className="tile-s">{a.fedRowsSub}</div></div>
        <div className="tile"><div className="tile-h"><span>{a.fedNodes}</span></div><div className="tile-n">{s.nodes}</div><div className="tile-s">{a.fedNodesSub(s.rounds)}{data.seconds ? ` · ${data.seconds}s` : ""}</div></div>
        <div className="tile"><div className="tile-h"><span>{a.fedAuc}</span></div><div className="tile-n" style={{ color: gain > 0.01 ? "var(--green)" : undefined }}>{s.mean_auc_federated.toFixed(3)}</div><div className="tile-s">{a.fedAucSub(s.mean_auc_local_only.toFixed(3))}</div><div className="tile-s fed-words">{fw.inWords(Math.round(s.mean_auc_federated * 10))}</div></div>
      </div>
      {last.global.recall != null && <p className="faint fed-catch">{fw.catches(Math.round(last.global.recall * 10), Number(last.global.recall.toFixed(2)))}</p>}
      <div className="fed-run">
        <button className="btn dark" disabled={live.isPending} onClick={() => { setMode("live"); live.mutate(); }}>{live.isPending ? <><span className="spin" aria-hidden />{a.running}</> : a.runLiveRound}</button>
        <button className={`btn${mode === "replay" ? " soft" : ""}`} onClick={() => setMode("replay")}>{a.replayLbl}</button>
        <Badge kind="computed" title={data.provenance ?? replay.data?.method} />
        {live.isError && <span className="chip red" role="alert">{runError(String((live.error as Error)?.message ?? ""), lang)}</span>}
        {mode === "live" && live.data && <span className="faint" style={{ fontSize: "var(--t-xs)" }}>{lang === "hi" ? `लाइव राउंड ${(live.data as FedTier & { seconds?: number }).seconds ?? ""} सेकंड में` : `Live round finished in ${(live.data as FedTier & { seconds?: number }).seconds ?? ""} s`}</span>}
      </div>
      <div className="fed-grid">
        <div>
          <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, marginTop: 8 }} role="img" aria-label="global AUC by round">
            <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--rule)" />
            <polyline fill="none" stroke="var(--teal)" strokeWidth="2.5" points={pts} />
            {rounds.map((r, i) => <text key={i} x={pad + (i / Math.max(1, rounds.length - 1)) * (w - 2 * pad)} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--ink-3)">r{r.round}</text>)}
            <text x={pad} y={14} fontSize="11" fill="var(--ink-2)">global model AUC: {last.global.auc.toFixed(3)}</text>
          </svg>
          <table className="table" style={{ marginTop: 8 }}>
            <tbody>
              <tr><td>{t.localOnly}</td><td className="num">{s.mean_auc_local_only.toFixed(3)}</td><td className="faint">mean AUC on each node's own held-out months</td></tr>
              <tr><td>{t.federatedLbl}</td><td className="num" style={{ fontWeight: 600, color: gain > 0.01 ? "var(--green)" : undefined }}>{s.mean_auc_federated.toFixed(3)}</td><td className="faint">better or equal on {s.federated_better_or_equal_nodes} of {s.nodes} nodes</td></tr>
              {s.mean_auc_personalised != null && <tr><td>{t.personalised}</td><td className="num">{s.mean_auc_personalised.toFixed(3)}</td><td className="faint">better or equal on {s.personalised_better_or_equal_nodes} of {s.nodes}</td></tr>}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: "var(--t-xs)" }}>{label}. {replay.data?.method}</p>
        </div>
        <div>
          <h3 className="fed-h3">{a.nodesTitle} <span className="faint">{nodes.length}</span></h3>
          <div className="tbl-wrap fed-nodes"><table className="table"><thead><tr><th>node</th><th className="num">rows</th><th className="num">{t.localOnly}</th><th className="num">{t.federatedLbl}</th></tr></thead>
            <tbody>{nodes.slice(0, 40).map(([name, v]) => <tr key={name}><td>{UF[name] ? UF[name] : name} <span className={`chip ${UF[name] ? "amber" : "teal"} fed-g`}>{groupOf(name)}</span></td><td className="num">{v.rows.toLocaleString("en-IN")}</td><td className="num">{v.local_only.auc.toFixed(2)}</td><td className="num" style={{ color: v.federated.auc > v.local_only.auc + 0.01 ? "var(--green)" : v.federated.auc < v.local_only.auc - 0.01 ? "var(--red)" : undefined }}>{v.federated.auc.toFixed(2)}</td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="fed-grid fed-more">
        <div>
          <h3 className="fed-h3">{fw.gainsTitle}</h3>
          <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "0 0 8px" }}>{fw.gainsSub}</p>
          <p className="fed-legend"><span><i style={{ background: "var(--ink-3)" }} />{fw.alone}</span><span><i style={{ background: "var(--teal)" }} />{fw.fed}</span></p>
          <Dumbbell rows={gains} alone={fw.alone} fed={fw.fed} rowsLbl={fw.rows} />
        </div>
        <div className="fed-travel">
          <h3 className="fed-h3">{fw.travelTitle}</h3>
          <div className="ft-cols">
            <div className="ft-col go"><b>↑ {fw.travelsH}</b><ul>{fw.travels.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div className="ft-col home"><b>⌂ {fw.staysH}</b><ul>{fw.stays.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "8px 0 0" }}>{a.fedRows}: <b style={{ color: "var(--green)" }}>{s.rows_crossed_border}</b> · {a.fedRowsSub}</p>
        </div>
      </div>
    </div>
  );
}

/** Per node: AUC trained alone (grey) to federated (teal), on one 0.4 to 1.0 axis. Figures are printed, so no value is read off a bar. */
function Dumbbell({ rows, alone, fed, rowsLbl }: { rows: { name: string; rows: number; lo: number; fe: number }[]; alone: string; fed: string; rowsLbl: string }) {
  const W = 560, rowH = 26, left = 150, right = 96, top = 22, lo = 0.4, hi = 1;
  const x = (v: number) => left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - left - right);
  const H = top + rows.length * rowH + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }} role="img" aria-label={`${alone} vs ${fed}`}>
      <g fontSize="10" fill="var(--ink-3)">
        {[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={top - 6} y2={H - 6} stroke="var(--rule)" /><text x={x(v)} y={12} textAnchor="middle">{v.toFixed(1)}</text></g>)}
      </g>
      {rows.map((r, i) => {
        const y = top + i * rowH + rowH / 2; const up = r.fe >= r.lo;
        return (
          <g key={r.name}>
            <text x={left - 10} y={y + 4} fontSize="11" textAnchor="end" fill="var(--ink)">{r.name.length > 20 ? r.name.slice(0, 19) + "…" : r.name}</text>
            <line x1={x(r.lo)} x2={x(r.fe)} y1={y} y2={y} stroke={up ? "var(--green)" : "var(--red)"} strokeWidth="2.5" />
            <circle cx={x(r.lo)} cy={y} r={4.5} fill="var(--ink-3)" />
            <circle cx={x(r.fe)} cy={y} r={5.5} fill="var(--teal)" />
            <text x={W - right + 10} y={y + 4} fontSize="11" fill={up ? "var(--green)" : "var(--red)"} fontWeight="600">{up ? "+" : ""}{(r.fe - r.lo).toFixed(2)}</text>
            <text x={W - right + 48} y={y + 4} fontSize="10" fill="var(--ink-3)">{r.rows.toLocaleString("en-IN")}</text>
          </g>
        );
      })}
      <text x={W - right + 48} y={top - 8} fontSize="10" fill="var(--ink-3)">{rowsLbl}</text>
      <text x={W - right + 10} y={top - 8} fontSize="10" fill="var(--ink-3)">Δ</text>
    </svg>
  );
}
