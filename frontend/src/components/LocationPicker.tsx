import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import { sB } from "../stringsB";

const Pin = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>;
const Chevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>;

/** One control for "where am I": opens a dialog with the states on the left and the chosen state's districts on the right. */
export default function LocationPicker({ variant = "bar" }: { variant?: "bar" | "nav" }) {
  const { t, lang, unit, district, persona, setLocation } = useApp();
  const b = sB[lang];
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(unit);
  const [filter, setFilter] = useState("");
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  // names arrive instantly; alert counts and scores fill in when the state's figures are ready, without blocking the list
  const names = useQuery({ queryKey: ["districtNames", pick], queryFn: () => api.districtNames(pick), enabled: open, staleTime: Infinity });
  const scored = useQuery({ queryKey: ["districts", pick], queryFn: () => api.districts(pick), enabled: open });
  const needsDistrict = persona !== "state";
  const unitName = units.data?.units.find((u) => u.unit_id === unit)?.unit_name ?? unit;
  const byName = new Map((scored.data?.districts ?? []).map((d) => [d.district, d]));
  const districts = { data: names.data && { districts: names.data.districts.map((n) => ({ red_alerts: 0, score: null as number | null, ...byName.get(n.district), district: n.district })) } };
  const rows = (districts.data?.districts ?? []).filter((d) => d.district.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPick(unit); setFilter(""); } }}>
      <Dialog.Trigger asChild>
        {variant === "nav"
          ? <button className="navloc" aria-label={t.changeLocation}><Pin /><span className="navloc-text">{needsDistrict && district ? district : unitName}</span></button>
          : <button className="loc" aria-label={t.changeLocation}><Pin /><span className="loc-text">{unitName}{needsDistrict && district ? <><span className="sep">›</span>{district}</> : null}</span><Chevron /></button>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog mdl mdl-wide" aria-describedby={undefined}>
          <div className="mdl-head">
            <span className="mdl-icon" aria-hidden><Pin /></span>
            <div><Dialog.Title asChild><h2>{t.changeLocation}</h2></Dialog.Title><p>{needsDistrict ? t.chooseDistrictHint : b.stateOnly}</p></div>
            <Dialog.Close asChild><button className="mdl-x" aria-label={t.close}>×</button></Dialog.Close>
          </div>
          <div className="mdl-body loc-steps">
            <section>
              <h3 className="loc-step-t"><span aria-hidden>1</span>{b.step1}</h3>
              <ul className="loc-tiles" aria-label={t.chooseState}>
                {(units.data?.units ?? []).map((u) => (
                  <li key={u.unit_id}>
                    <button className={`loc-tile${pick === u.unit_id ? " on" : ""}`} aria-pressed={pick === u.unit_id} onClick={() => { if (needsDistrict) setPick(u.unit_id); else { setLocation(u.unit_id, ""); setOpen(false); } }}>
                      <span>{u.unit_name}</span>{u.is_hero ? <span className="chip teal" style={{ minHeight: 22, fontSize: "var(--t-xs)" }}>{t.hero}</span> : null}
                    </button>
                  </li>
                ))}
                {!units.data && <li className="faint">{t.loading}</li>}
              </ul>
            </section>
            {needsDistrict && (
              <section>
                <div className="toolbar" style={{ marginBottom: 8 }}>
                  <h3 className="loc-step-t"><span aria-hidden>2</span>{b.step2}</h3>
                  <input className="input" placeholder={t.filterDistricts} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t.filterDistricts} autoFocus />
                </div>
                <ul className="loc-tiles" aria-label={t.chooseDistrict}>
                  {!districts.data && <li className="faint">{t.loading}</li>}
                  {rows.map((d) => (
                    <li key={d.district}>
                      <button className={`loc-tile${pick === unit && d.district === district ? " on" : ""}`} onClick={() => { setLocation(pick, d.district); setOpen(false); }}>
                        <span>{d.district}</span>
                        <span className="meta">
                          {d.red_alerts > 0 ? <span className="loc-red">{d.red_alerts} {t.severity.red}</span> : null}
                          {d.score != null ? <span className="score-pill">{Math.round(d.score)}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="mdl-foot"><Dialog.Close asChild><button className="btn">{t.cancel}</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
