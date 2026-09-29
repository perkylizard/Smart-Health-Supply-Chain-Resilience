import * as Menu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";

const Flask = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 3h6M10 3v6l-5.5 9a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" /></svg>;

/** The what-if dial as a chip: quiet when off, amber with the scenario name and intensity when on. */
export default function WhatIf({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useApp();
  const qc = useQueryClient();
  const sc = useQuery({ queryKey: ["scenario"], queryFn: api.scenario });
  const set = useMutation({ mutationFn: ({ name, intensity }: { name: string; intensity: number }) => api.setScenario(name, intensity), onSuccess: () => { qc.invalidateQueries(); } });
  const cur = sc.data?.current ?? { name: "normal", intensity: 1 };
  const on = cur.name !== "normal";
  const label = on ? `${(sc.data?.available.find((s) => s.name === cur.name)?.label ?? cur.name).replace(/_/g, " ")} · ${Math.round(cur.intensity * 100)}%` : t.whatIfLabel;
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        {compact
          ? <button className={`iconbtn${on ? " on" : ""} ${className}`} aria-label={`${t.scenario}: ${label}`} title={label}><Flask />{on && <i className="dot" aria-hidden />}</button>
          : <button className={`hdr-btn whatif${on ? " on" : ""} ${className}`} aria-label={t.scenario}><Flask /><span className="faint role-lbl">{t.scenarioLbl}</span> <strong>{on ? label : t.scenarioOff}</strong></button>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={8}>
          <Menu.Label className="menu-label">{t.scenario}</Menu.Label>
          <Menu.RadioGroup value={cur.name} onValueChange={(v) => set.mutate({ name: v, intensity: cur.intensity })}>
            <Menu.RadioItem value="normal" className="menu-item"><span className="menu-title">{t.scenarioOff}</span></Menu.RadioItem>
            {(sc.data?.available ?? []).filter((s) => s.name !== "normal").map((s) => (
              <Menu.RadioItem key={s.name} value={s.name} className="menu-item"><span className="menu-title">{s.label}</span></Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          {on && (
            <div className="menu-slider" onKeyDown={(e) => e.stopPropagation()}>
              <label><span className="faint">{t.intensity}</span>
                <input type="range" min={0} max={1} step={0.25} value={cur.intensity} aria-label={t.intensity} onChange={(e) => set.mutate({ name: cur.name, intensity: Number(e.target.value) })} />
                <span style={{ minWidth: 40, fontWeight: 500 }}>{Math.round(cur.intensity * 100)}%</span></label>
            </div>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
