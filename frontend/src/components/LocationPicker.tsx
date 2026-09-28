import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";

const Pin = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>;
const Chevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>;

/** One control for "where am I": opens a dialog with the states on the left and the chosen state's districts on the right. */
export default function LocationPicker({ variant = "bar" }: { variant?: "bar" | "nav" }) {
  const { t, unit, district, persona, setLocation } = useApp();
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
        <Dialog.Content className="dialog dialog-wide" aria-describedby={undefined}>
          <Dialog.Title style={{ marginBottom: 4 }}>{t.changeLocation}</Dialog.Title>
          <p className="faint" style={{ marginBottom: 12, fontSize: 13 }}>{needsDistrict ? t.chooseDistrictHint : t.chooseStateHint}</p>
          <div className="loclist">
            <div className="loclist-col"><div className="menu-label" style={{ paddingLeft: 12 }}>{t.chooseState}</div><ul aria-label={t.chooseState}>
              {(units.data?.units ?? []).map((u) => (
                <li key={u.unit_id}>
                  <button className={`loc-item${pick === u.unit_id ? " on" : ""}`} onClick={() => { if (needsDistrict) setPick(u.unit_id); else { setLocation(u.unit_id, ""); setOpen(false); } }}>
                    <span>{u.unit_name}</span>{u.is_hero ? <span className="chip teal" style={{ minHeight: 22, fontSize: 11 }}>{t.hero}</span> : null}
                  </button>
                </li>
              ))}
            </ul></div>
            {needsDistrict && (
              <div className="loclist-col">
                <div className="menu-label" style={{ paddingLeft: 12 }}>{t.chooseDistrict}</div>
                <input className="input" placeholder={t.filterDistricts} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t.filterDistricts} autoFocus />
                <ul aria-label={t.chooseDistrict} style={{ marginTop: 8 }}>
                  {!districts.data && <li className="faint" style={{ padding: 8 }}>{t.loading}</li>}
                  {rows.map((d) => (
                    <li key={d.district}>
                      <button className={`loc-item${pick === unit && d.district === district ? " on" : ""}`} onClick={() => { setLocation(pick, d.district); setOpen(false); }}>
                        <span>{d.district}</span>
                        <span className="faint" style={{ fontSize: 12 }}>{d.red_alerts > 0 ? <span style={{ color: "var(--red)" }}>{d.red_alerts} {t.severity.red}</span> : null}{d.score != null ? <span style={{ marginLeft: 8 }}>{Math.round(d.score)}</span> : null}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <Dialog.Close asChild><button className="btn quiet" style={{ marginTop: 12 }}>{t.cancel}</button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
