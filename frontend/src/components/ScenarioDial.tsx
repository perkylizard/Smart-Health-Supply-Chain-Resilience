import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import { sA } from "../stringsA";

/** What-if control. Default: a native select plus the intensity slider (phone header row). variant="cards": one card per
 *  scenario from the server's list, the active one marked, and the same 0-100% intensity slider (Settings). */
export default function ScenarioDial({ large, variant }: { large?: boolean; variant?: "cards" }) {
  const { t, lang } = useApp();
  const a = sA[lang];
  const qc = useQueryClient();
  const sc = useQuery({ queryKey: ["scenario"], queryFn: api.scenario });
  const set = useMutation({
    mutationFn: ({ name, intensity }: { name: string; intensity: number }) => api.setScenario(name, intensity),
    onSuccess: () => { qc.invalidateQueries(); },
  });
  const cur = sc.data?.current ?? { name: "normal", intensity: 1 };
  const slider = cur.name !== "normal" && (
    <label className="dial-slider" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="faint" style={{ fontSize: "var(--t-xs)" }}>{t.intensity}</span>
      <input type="range" min={0} max={1} step={0.25} value={cur.intensity} aria-label={t.intensity}
        onChange={(e) => set.mutate({ name: cur.name, intensity: Number(e.target.value) })} />
      <span style={{ minWidth: 36, fontWeight: 600, fontFamily: "var(--mono)" }}>{Math.round(cur.intensity * 100)}%</span>
    </label>
  );
  if (variant === "cards") {
    const list = sc.data?.available ?? [];
    return (
      <div>
        {sc.isLoading && <p className="skeleton" style={{ height: 80 }}>…</p>}
        <div className="opt-grid" role="radiogroup" aria-label={t.scenario}>
          {list.map((s) => {
            const on = cur.name === s.name;
            return (
              <button key={s.name} role="radio" aria-checked={on} className={`opt${on ? " on" : ""}${s.name !== "normal" ? " warn" : ""}`} disabled={set.isPending} onClick={() => set.mutate({ name: s.name, intensity: cur.intensity || 1 })}>
                <span className="opt-t">{s.name === "normal" ? a.scenarioNone : s.label}{on && <span className="opt-on">{a.active}</span>}</span>
                <span className="opt-d">{s.name === "normal" ? a.scenarioNoneDesc : a.scenarioOnly(s.units && s.units.length ? s.units.join(", ").replace(/_/g, " ") : a.allUnits)}</span>
              </button>
            );
          })}
        </div>
        {slider && <div style={{ marginTop: 12 }}>{slider}</div>}
      </div>
    );
  }
  return (
    <div className="dial" style={large ? { flexDirection: "column", alignItems: "stretch", gap: 12 } : undefined}>
      <select className="select" aria-label={t.scenario} value={cur.name} onChange={(e) => set.mutate({ name: e.target.value, intensity: cur.intensity })}>
        {(sc.data?.available ?? [{ name: "normal", label: t.scenarioOff }]).map((s) => <option key={s.name} value={s.name}>{s.name === "normal" ? t.scenarioOff : s.label}</option>)}
      </select>
      {slider}
    </div>
  );
}
