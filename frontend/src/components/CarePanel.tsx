import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useApp } from "../App";
import Badge from "./Badge";
import "./care.css";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
const get = async <T,>(p: string): Promise<T> => { const r = await fetch(`${BASE}${p}`); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

interface Rollup { district: string; facilities: number; beds: number; occupied: number; occupancy: number | null; bed_alerts: number; bed_amber: number; staff_alerts: number; vacancy_share: number | null }
interface FacRow { facility_id: string; name: string; type: string; beds: number; occupied: number; occupancy: number | null; bed_severity: "red" | "amber" | "ok"; bed_alert: boolean; doctor_absent: boolean; mo_in: number; mo_days: number; refer_name: string | null; refer_km: number | null; refer_free_beds: number | null }

const S = {
  en: { title: "Beds and staff", hintD: "Occupancy and doctor attendance across the district's facilities", hintS: "Districts with the most bed and staff alerts first",
        occupied: "beds occupied", bedAlerts: "facilities over 90% full", staffAlerts: "facilities without a doctor", full: "full", nearlyFull: "nearly full",
        noDoctor: "No medical officer in post", fewDays: (d: number) => `Doctor present ${d} days this month`, refer: (n: string, km: number, b: number) => `Refer to ${n}, ${km} km, ${b} beds free`,
        noRefer: "No nearby CHC or hospital has beds free", allClear: "No facility is over 80% full and every facility has a doctor.", more: (n: number) => `and ${n} more`,
        district: "District", occupancy: "occupancy", bedsCol: "bed alerts", staffCol: "no doctor", vacancy: "vacancy", ok: "has room", busy: "busy", crowded: "crowded", loading: "Loading beds and staff" },
  hi: { title: "बिस्तर और स्टाफ़", hintD: "ज़िले की सुविधाओं में बिस्तर भराव और डॉक्टर उपस्थिति", hintS: "सबसे अधिक बिस्तर और स्टाफ़ अलर्ट वाले ज़िले पहले",
        occupied: "बिस्तर भरे", bedAlerts: "90% से अधिक भरी सुविधाएँ", staffAlerts: "बिना डॉक्टर की सुविधाएँ", full: "भरा", nearlyFull: "लगभग भरा",
        noDoctor: "कोई चिकित्सा अधिकारी तैनात नहीं", fewDays: (d: number) => `इस महीने डॉक्टर ${d} दिन उपस्थित`, refer: (n: string, km: number, b: number) => `${n} भेजें, ${km} किमी, ${b} बिस्तर खाली`,
        noRefer: "पास के किसी CHC या अस्पताल में बिस्तर खाली नहीं", allClear: "कोई सुविधा 80% से अधिक भरी नहीं है और हर सुविधा में डॉक्टर है।", more: (n: number) => `और ${n}`,
        district: "ज़िला", occupancy: "भराव", bedsCol: "बिस्तर अलर्ट", staffCol: "डॉक्टर नहीं", vacancy: "रिक्ति", ok: "जगह है", busy: "व्यस्त", crowded: "भीड़", loading: "बिस्तर और स्टाफ़ लोड हो रहे हैं" },
};

const pct = (x: number | null) => (x == null ? "…" : `${Math.round(x * 100)}%`);
const occSev = (x: number | null) => (x == null ? "" : x > 0.9 ? "red" : x > 0.8 ? "amber" : "green");

export default function CarePanel({ unit, district }: { unit: string; district?: string }) {
  return district ? <DistrictCare unit={unit} district={district} /> : <StateCare unit={unit} />;
}

function DistrictCare({ unit, district }: { unit: string; district: string }) {
  const { lang } = useApp(); const s = S[lang] ?? S.en;
  const q = useQuery({ queryKey: ["care", unit, district], queryFn: () => get<{ summary: Rollup; facilities: FacRow[]; provenance: string }>(`/care/${unit}/${encodeURIComponent(district)}`) });
  if (q.isError) return null;
  if (!q.data) return <div className="care"><p className="care-empty skeleton">{s.loading}</p></div>;
  const { summary: m, facilities } = q.data;
  const shown = facilities.slice(0, 5);
  return (
    <section className="care" aria-label={s.title}>
      <div className="care-head"><h3>{s.title}</h3><p>{s.hintD}</p></div>
      <div className="care-kpis">
        <div className={`care-kpi ${occSev(m.occupancy)}`}><span className="n">{pct(m.occupancy)}</span><span className="l">{s.occupied} <small>({m.occupied}/{m.beds})</small></span></div>
        <div className={`care-kpi ${m.bed_alerts > 0 ? "red" : ""}`}><span className="n">{m.bed_alerts}</span><span className="l">{s.bedAlerts}</span></div>
        <div className={`care-kpi ${m.staff_alerts > 0 ? "amber" : ""}`}><span className="n">{m.staff_alerts}</span><span className="l">{s.staffAlerts}</span></div>
      </div>
      {shown.length === 0 ? <p className="care-empty">{s.allClear}</p> : (
        <ul className="care-list">
          {shown.map((f) => (
            <li key={f.facility_id}>
              <Link to={`/facility/${f.facility_id}`} className="who" style={{ color: "inherit" }}>{f.name}</Link>
              {f.bed_severity !== "ok" && <div className={`what ${f.bed_severity}`}>{f.bed_severity === "red" ? s.full : s.nearlyFull}: {f.occupied} of {f.beds} beds ({pct(f.occupancy)})</div>}
              {f.bed_alert && <div className="refer">{f.refer_name ? s.refer(f.refer_name, f.refer_km ?? 0, f.refer_free_beds ?? 0) : s.noRefer}</div>}
              {f.doctor_absent && <div className="what amber">{f.mo_in === 0 ? s.noDoctor : s.fewDays(f.mo_days)}</div>}
            </li>
          ))}
        </ul>
      )}
      <div className="care-foot"><span>{facilities.length > shown.length ? s.more(facilities.length - shown.length) : ""}</span><Badge kind="simulated" title={q.data.provenance} /></div>
    </section>
  );
}

function StateCare({ unit }: { unit: string }) {
  const { lang } = useApp(); const s = S[lang] ?? S.en;
  const q = useQuery({ queryKey: ["care", unit], queryFn: () => get<{ totals: Rollup & { districts: number }; districts: Rollup[]; provenance: string }>(`/care/${unit}`) });
  if (q.isError) return null;
  if (!q.data) return <div className="care"><p className="care-empty skeleton">{s.loading}</p></div>;
  const { totals: m, districts } = q.data;
  const label = (x: number | null) => (x == null ? "" : x > 0.9 ? s.crowded : x > 0.8 ? s.busy : s.ok);
  return (
    <section className="care" aria-label={s.title}>
      <div className="care-head"><h3>{s.title}</h3><p>{s.hintS}</p></div>
      <div className="care-kpis">
        <div className={`care-kpi ${occSev(m.occupancy)}`}><span className="n">{pct(m.occupancy)}</span><span className="l">{s.occupied}</span></div>
        <div className={`care-kpi ${m.bed_alerts > 0 ? "red" : ""}`}><span className="n">{m.bed_alerts}</span><span className="l">{s.bedAlerts}</span></div>
        <div className={`care-kpi ${m.staff_alerts > 0 ? "amber" : ""}`}><span className="n">{m.staff_alerts}</span><span className="l">{s.staffAlerts}</span></div>
      </div>
      <table className="care-table">
        <thead><tr><th>{s.district}</th><th className="num">{s.occupancy}</th><th className="num">{s.bedsCol}</th><th className="num">{s.staffCol}</th></tr></thead>
        <tbody>{districts.slice(0, 10).map((d) => (
          <tr key={d.district}>
            <td>{d.district}</td>
            <td className="num"><span className={`care-occ ${occSev(d.occupancy)}`} title={label(d.occupancy)}>{pct(d.occupancy)}</span></td>
            <td className={`num ${d.bed_alerts ? "hot" : "zero"}`}>{d.bed_alerts}</td>
            <td className={`num ${d.staff_alerts ? "" : "zero"}`}>{d.staff_alerts}</td>
          </tr>))}
        </tbody>
      </table>
      <div className="care-foot"><span>{districts.length > 10 ? s.more(districts.length - 10) : ""}</span><Badge kind="simulated" title={q.data.provenance} /></div>
    </section>
  );
}
