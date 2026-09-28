import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import ScenarioDial from "./ScenarioDial";
import { PERSONAS, icons } from "../personas";
import LocationPicker from "./LocationPicker";
import RoleMenu from "./RoleMenu";
import WhatIf from "./WhatIf";

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

/** Material 2 top app bar with three intents: where you are, what you want to ask, who you are. Tabs below on desktop, bottom navigation on phones. */
export default function Shell({ children, offline }: { children: React.ReactNode; offline: boolean }) {
  const { t, lang, setLang, unit, district, persona, base, basis, setLocation, setPersona, setBasis } = useApp();
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), staleTime: Infinity });
  const nav = useNavigate();
  const loc = useLocation();
  const p = PERSONAS[persona];
  const askBase = persona === "phc" || persona === "dm" || persona === "warehouse" ? `/dho/${unit}/${encodeURIComponent(district)}` : base;
  const onAsk = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    if (q?.trim()) nav(`${askBase}/ask?q=${encodeURIComponent(q.trim())}`);
  };
  /** The brand is the way home: forget the remembered role, place, basis and scenario, and open the default district. */
  const goHome = () => {
    try { for (const k of ["unit", "district", "facility", "basis"]) localStorage.removeItem(k); } catch { /* ignore */ }
    setBasis("real");
    api.setScenario("normal", 1).catch(() => {});
    if (persona !== "dho") setPersona("dho");
    nav("/dho/bihar/Araria");
  };
  const realScreen = loc.pathname.endsWith("/india") || loc.pathname.endsWith("/stock");
  const basisLabel = realScreen ? (basis === "real" ? t.basisReal : t.basisSimulated) : t.basisFacility;
  return (
    <div className="shell" lang={lang}>
      <header className="appbar">
        <div className="bar">
          <button className="brand" onClick={goHome} title={t.homeHint}><i aria-hidden>S</i><span>Sanjeevani Grid</span></button>
          <span className="desktop-only"><LocationPicker /></span>
          <form className="grow desktop-only" onSubmit={onAsk} role="search">
            <input className="input" name="q" placeholder={t.askPlaceholder} aria-label={t.ask} defaultValue={loc.pathname.endsWith("/ask") ? new URLSearchParams(loc.search).get("q") ?? "" : ""} />
          </form>
          <span className="spacer" />
          <button className="lang" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t.language}>{lang === "en" ? "हिंदी" : "English"}</button>
          <RoleMenu />
        </div>
      </header>
        <div className="phone-controls phone-only">
          <select className="select" aria-label="State" value={unit} onChange={(e) => setLocation(e.target.value, "")}>
            {(units.data?.units ?? [{ unit_id: unit, unit_name: unit }]).map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}
          </select>
          {persona !== "state" && (
            <select className="select" aria-label={t.district} value={district} onChange={(e) => setLocation(unit, e.target.value)}>
              {(districts.data?.districts ?? []).map((d) => <option key={d.district} value={d.district}>{d.district}</option>)}
              {!districts.data && <option value={district}>{district}</option>}
            </select>
          )}
          {persona !== "phc" && <ScenarioDial />}
        </div>
      <nav className="tabs" aria-label="Main">
        <div className="inner">
          {p.tabs.map((tab) => <NavLink key={tab.key} to={`${base}${tab.path}`} end={tab.path === ""}><Icon d={icons[tab.icon]} />{(t as unknown as Record<string, string>)[tab.key]}</NavLink>)}
          <span className="spacer" />
          <span className="basis desktop-only" title={t.basisHint}><i aria-hidden />{basisLabel}</span>
          {persona !== "phc" && <WhatIf className="desktop-only" />}
          {persona !== "phc" && <NavLink to={`${base}/system`} className="settings-link"><Icon d={icons.system} />{t.system}</NavLink>}
        </div>
      </nav>
      <main className="content">
        {offline && <div className="banner" role="status">{t.offline}</div>}
        {children}
      </main>
    </div>
  );
}
