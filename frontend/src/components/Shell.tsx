import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { PERSONAS, icons } from "../personas";
import LocationPicker from "./LocationPicker";
import RoleMenu from "./RoleMenu";
import WhatIf from "./WhatIf";

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

/** Material 2 top app bar with three intents: where you are, what you want to ask, who you are. Tabs below on desktop, bottom navigation on phones. */
export default function Shell({ children, offline }: { children: React.ReactNode; offline: boolean }) {
  const { t, lang, setLang, unit, district, persona, base, basis } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const p = PERSONAS[persona];
  const askBase = persona === "phc" || persona === "dm" || persona === "warehouse" ? `/dho/${unit}/${encodeURIComponent(district)}` : base;
  const onAsk = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    if (q?.trim()) nav(`${askBase}/ask?q=${encodeURIComponent(q.trim())}`);
  };
  const realScreen = loc.pathname.endsWith("/india") || loc.pathname.endsWith("/stock");
  const basisLabel = realScreen ? (basis === "real" ? t.basisReal : t.basisSimulated) : t.basisFacility;
  return (
    <div className="shell" lang={lang}>
      <header className="appbar">
        <div className="bar">
          <span className="brand"><i aria-hidden>S</i><span>Sanjeevani Grid</span></span>
          <span className="desktop-only"><LocationPicker /></span>
          <form className="grow desktop-only" onSubmit={onAsk} role="search">
            <input className="input" name="q" placeholder={t.askPlaceholder} aria-label={t.ask} defaultValue={loc.pathname.endsWith("/ask") ? new URLSearchParams(loc.search).get("q") ?? "" : ""} />
          </form>
          <span className="spacer" />
          <button className="lang" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t.language}>{lang === "en" ? "हिंदी" : "English"}</button>
          <RoleMenu />
        </div>
        {persona !== "phc" && <div className="bar2 phone-only"><WhatIf /></div>}
      </header>
      <nav className="tabs" aria-label="Main">
        <div className="inner">
          {p.tabs.map((tab) => <NavLink key={tab.key} to={`${base}${tab.path}`} end={tab.path === ""}><Icon d={icons[tab.icon]} />{(t as unknown as Record<string, string>)[tab.key]}</NavLink>)}
          <span className="phone-only navloc-slot"><LocationPicker variant="nav" /></span>
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
