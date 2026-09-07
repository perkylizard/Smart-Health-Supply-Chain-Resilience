import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../App";
import { api } from "../api";
import ScenarioDial from "./ScenarioDial";

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const icons = {
  briefing: "M4 6h16M4 12h10M4 18h7",
  dispatch: "M3 7h11l4 4v6H3zM14 7v4h4M7 17a2 2 0 1 0 0.01 0M16 17a2 2 0 1 0 0.01 0",
  ask: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z",
  system: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0.01 0",
};

export default function Shell({ children, offline }: { children: React.ReactNode; offline: boolean }) {
  const { t, lang, setLang, unit, district, setLocation } = useApp();
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/${unit}/${encodeURIComponent(district)}`;
  const onAsk = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    if (q?.trim()) nav(`${base}/ask?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <div className="shell">
      <header className="strip">
        <select className="select" aria-label={t.district} value={unit} onChange={(e) => { const u = e.target.value; setLocation(u, ""); }}>
          {(units.data?.units ?? [{ unit_id: unit, unit_name: unit }]).map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}
        </select>
        <select className="select" aria-label={t.district} value={district} onChange={(e) => setLocation(unit, e.target.value)}>
          {(districts.data?.districts ?? []).map((d) => <option key={d.district} value={d.district}>{d.district}</option>)}
          {!districts.data && <option value={district}>{district}</option>}
        </select>
        <ScenarioDial />
        <form className="grow" onSubmit={onAsk} role="search">
          <input className="input" name="q" placeholder={t.askPlaceholder} aria-label={t.ask} defaultValue={loc.pathname.endsWith("/ask") ? new URLSearchParams(loc.search).get("q") ?? "" : ""} />
        </form>
        <button className="btn quiet" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t.language}>{lang === "en" ? "हिंदी" : "English"}</button>
      </header>
      <nav className="tabs" aria-label="Main">
        <span className="brand"><i aria-hidden>S</i>Sanjeevani Grid</span>
        <NavLink to={base} end><Icon d={icons.briefing} />{t.briefing}</NavLink>
        <NavLink to={`${base}/dispatch`}><Icon d={icons.dispatch} />{t.dispatch}</NavLink>
        <NavLink to={`${base}/ask`}><Icon d={icons.ask} />{t.ask}</NavLink>
        <span className="spacer" />
        <NavLink to={`${base}/system`} className="settings-link"><Icon d={icons.system} />{t.system}</NavLink>
      </nav>
      <main className="content">
        {offline && <div className="banner" role="status">{t.offline}</div>}
        {children}
      </main>
    </div>
  );
}
