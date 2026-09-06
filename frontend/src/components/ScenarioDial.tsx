import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";

export default function ScenarioDial({ large }: { large?: boolean }) {
  const { t } = useApp();
  const qc = useQueryClient();
  const sc = useQuery({ queryKey: ["scenario"], queryFn: api.scenario });
  const set = useMutation({
    mutationFn: ({ name, intensity }: { name: string; intensity: number }) => api.setScenario(name, intensity),
    onSuccess: () => { qc.invalidateQueries(); },
  });
  const cur = sc.data?.current ?? { name: "normal", intensity: 1 };
  return (
    <div className="dial" style={large ? { flexDirection: "column", alignItems: "stretch", gap: 12 } : undefined}>
      <select className="select" aria-label={t.scenario} value={cur.name} onChange={(e) => set.mutate({ name: e.target.value, intensity: cur.intensity })}>
        {(sc.data?.available ?? [{ name: "normal", label: t.scenarioOff }]).map((s) => <option key={s.name} value={s.name}>{s.name === "normal" ? t.scenarioOff : s.label}</option>)}
      </select>
      {cur.name !== "normal" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="faint" style={{ fontSize: 13 }}>{t.intensity}</span>
          <input type="range" min={0} max={1} step={0.25} value={cur.intensity} aria-label={t.intensity}
            onChange={(e) => set.mutate({ name: cur.name, intensity: Number(e.target.value) })} />
          <span style={{ minWidth: 36, fontWeight: 600 }}>{Math.round(cur.intensity * 100)}%</span>
        </label>
      )}
    </div>
  );
}
