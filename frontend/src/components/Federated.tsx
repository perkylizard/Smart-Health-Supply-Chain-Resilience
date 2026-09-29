import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type FedTier } from "../api";
import { useApp } from "../App";
import Badge from "./Badge";

/** Brazilian federative units: the node table shows full names, not two-letter codes. */
const UF: Record<string, string> = {"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"};
const TIERS = ["districts_bihar_coldstart", "districts_bihar", "states_india", "states_brazil", "countries_brics"] as const;

export default function Federated() {
  const { t } = useApp();
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
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{t.fedIntro}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {([[t.tierGroupIndia, TIERS.slice(0, 3)], [t.tierGroupBrazil, TIERS.slice(3)]] as const).map(([g, ks]) => (
          <div key={g} className="tier-group"><span className="tier-label">{g}</span>
            {ks.map((k) => <button key={k} className="chip" aria-pressed={tier === k} onClick={() => { setTier(k); setMode("replay"); }}>{labels[k]}</button>)}
          </div>))}
      </div>
      {brazil && <p className="faint" style={{ fontSize: "var(--t-xs)", marginTop: -4 }}><Badge kind="simulated" /> {t.brazilNote}</p>}
      <div className="two-col">
        <div>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
            <div className="gauge"><span className="n">{s.rows_crossed_border}</span><span className="of">{t.rowsCrossed}</span></div>
            <span className="chip green">{s.nodes} nodes · {s.rounds} rounds{data.seconds ? ` · ${data.seconds}s` : ""}</span>
          </div>
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
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <button className={`btn${mode === "replay" ? " primary" : ""}`} onClick={() => setMode("replay")}>{t.replay}</button>
            <button className={`btn${mode === "live" ? " primary" : ""}`} disabled={live.isPending} onClick={() => { setMode("live"); live.mutate(); }}>{live.isPending ? t.running : t.runLive}</button>
            <Badge kind="computed" title={data.provenance ?? replay.data?.method} />
          </div>
          <p className="faint" style={{ fontSize: "var(--t-xs)" }}>{label}. {replay.data?.method}</p>
        </div>
        <aside>
          <table className="table"><thead><tr><th>node</th><th className="num">rows</th><th className="num">{t.localOnly}</th><th className="num">{t.federatedLbl}</th></tr></thead>
            <tbody>{nodes.slice(0, 40).map(([name, v]) => <tr key={name}><td>{UF[name] ? `${UF[name]} (Brazil)` : name}</td><td className="num">{v.rows.toLocaleString("en-IN")}</td><td className="num">{v.local_only.auc.toFixed(2)}</td><td className="num" style={{ color: v.federated.auc > v.local_only.auc + 0.01 ? "var(--green)" : v.federated.auc < v.local_only.auc - 0.01 ? "var(--red)" : undefined }}>{v.federated.auc.toFixed(2)}</td></tr>)}</tbody></table>
        </aside>
      </div>
    </div>
  );
}
