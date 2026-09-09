import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "../App";
import { api } from "../api";
import { PERSONAS, icons, type PersonaId } from "../personas";
import ScenarioDial from "./ScenarioDial";

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

export default function Shell({ children, offline }: { children: React.ReactNode; offline: boolean }) {
  const { t, lang, setLang, unit, district, setLocation, persona, setPersona, base } = useApp();
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districts", unit], queryFn: () => api.districts(unit) });
  const nav = useNavigate();
  const loc = useLocation();
  const p = PERSONAS[persona];
  const showDistrict = persona !== "state";
  const askBase = persona === "phc" || persona === "dm" || persona === "warehouse" ? `/dho/${unit}/${encodeURIComponent(district)}` : base;
  const onAsk = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    if (q?.trim()) nav(`${askBase}/ask?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <div className="shell">
      <header className="strip">
        <select className="select persona" aria-label={t.persona} value={persona} onChange={(e) => setPersona(e.target.value as PersonaId)}>
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => <option key={id} value={id}>{t.personas[id]}</option>)}
        </select>
        <select className="select" aria-label="State" value={unit} onChange={(e) => setLocation(e.target.value, "")}>
          {(units.data?.units ?? [{ unit_id: unit, unit_name: unit }]).map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}
        </select>
        {showDistrict && (
          <select className="select" aria-label={t.district} value={district} onChange={(e) => setLocation(unit, e.target.value)}>
            {(districts.data?.districts ?? []).map((d) => <option key={d.district} value={d.district}>{d.district}</option>)}
            {!districts.data && <option value={district}>{district}</option>}
          </select>
        )}
        {persona !== "phc" && <ScenarioDial />}
        <form className="grow" onSubmit={onAsk} role="search">
          <input className="input" name="q" placeholder={t.askPlaceholder} aria-label={t.ask} defaultValue={loc.pathname.endsWith("/ask") ? new URLSearchParams(loc.search).get("q") ?? "" : ""} />
        </form>
        <button className="btn quiet" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t.language}>{lang === "en" ? "हिंदी" : "English"}</button>
      </header>
      <nav className="tabs" aria-label="Main">
        <span className="brand"><i aria-hidden>S</i>Sanjeevani Grid</span>
        {p.tabs.map((tab) => <NavLink key={tab.key} to={`${base}${tab.path}`} end={tab.path === ""}><Icon d={icons[tab.icon]} />{(t as unknown as Record<string, string>)[tab.key]}</NavLink>)}
        <span className="spacer" />
        {persona !== "phc" && <NavLink to={`${base}/system`} className="settings-link"><Icon d={icons.system} />{t.system}</NavLink>}
      </nav>
      <main className="content">
        {offline && <div className="banner" role="status">{t.offline}</div>}
        {children}
      </main>
    </div>
  );
}
