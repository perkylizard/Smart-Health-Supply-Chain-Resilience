import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import ScenarioDial from "./ScenarioDial";
import { PERSONAS, icons } from "../personas";
import LocationPicker from "./LocationPicker";
import RoleMenu from "./RoleMenu";
import WhatIf from "./WhatIf";
import LoadErrorBanner from "./LoadErrorBanner";
import * as Dialog from "@radix-ui/react-dialog";
import { RequestForm } from "./Requests";

/** PHC staff: the header's Request stock action opens the same request form as the My stock screen. */
function RequestStockButton() {
  const { t, facilityId } = useApp();
  const f = useQuery({ queryKey: ["facility", facilityId], queryFn: () => api.facility(facilityId!), enabled: !!facilityId });
  if (!facilityId) return null;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="hdr-primary"><span aria-hidden>+</span> {t.requestStock}</button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog" aria-describedby={undefined}>
        <Dialog.Title style={{ marginBottom: 8 }}>{t.requestStock}</Dialog.Title>
        {f.data ? <RequestForm facilityId={facilityId} options={[...f.data.stock].sort((a, b) => a.days_of_stock - b.days_of_stock).map((s) => ({ id: s.commodity_id, name: s.commodity_name }))} /> : <p className="skeleton" style={{ height: 120 }}>…</p>}
        <Dialog.Close asChild><button className="btn quiet" style={{ marginTop: 8 }}>{t.close}</button></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

const Icon = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

/** Header in three zones (brand · the role's screens · who/where/what-if/actions); on phones a tab strip and plain dropdowns sit below it. */
export default function Shell({ children, offline }: { children: React.ReactNode; offline: boolean }) {
  const { t, lang, setLang, unit, district, persona, base, basis, setLocation, setPersona, setBasis } = useApp();
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), staleTime: Infinity });
  const nav = useNavigate();
  const loc = useLocation();
  const p = PERSONAS[persona];
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
      <header className="hdr">
        <div className="hdr-bar">
          {/* zone 1: brand (start over) */}
          <button className="hdr-brand" onClick={goHome} title={t.homeHint}><i aria-hidden>S</i><span>Sanjeevani Grid</span></button>
          {/* zone 2: the role's screens */}
          <nav className="hdr-tabs desktop-only" aria-label="Main">
            {p.tabs.map((tab) => <NavLink key={tab.key} to={`${base}${tab.path}`} end={tab.path === ""}>{(t as unknown as Record<string, string>)[tab.key]}</NavLink>)}
          </nav>
          <span className="spacer" />
          {/* zone 3: who, where, what-if, act, language, settings */}
          <div className="hdr-actions">
            <RoleMenu />
            <span className="desktop-only"><LocationPicker /></span>
            {persona !== "phc" && <WhatIf className="desktop-only" />}
            {persona === "phc" && <RequestStockButton />}
            <button className="hdr-btn" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t.language} title={t.language}>{lang === "en" ? "हिं" : "EN"}</button>
            {persona !== "phc" && <NavLink to={`${base}/system`} className="hdr-btn hdr-icon" aria-label={t.system} title={t.system}><Icon d={icons.system} /></NavLink>}
          </div>
        </div>
        {/* phones: the role's screens as a tab strip, then location and scenario as plain dropdowns */}
        <nav className="hdr-tabs-m phone-only" aria-label="Main">
          {p.tabs.map((tab) => <NavLink key={tab.key} to={`${base}${tab.path}`} end={tab.path === ""}>{(t as unknown as Record<string, string>)[tab.key]}</NavLink>)}
          {persona !== "phc" && <NavLink to={`${base}/system`}>{t.system}</NavLink>}
        </nav>
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
      <main className="content">
        {offline && <div className="banner" role="status">{t.offline}</div>}
        {!offline && <LoadErrorBanner />}
        {realScreen && <p className="basis-line"><span className="basis-dot" aria-hidden />{basisLabel}</p>}
        {children}
      </main>
      <footer className="ftr"><div><strong>Sanjeevani Grid</strong><span aria-hidden> · </span><span>{t.footerLine}</span></div><div className="faint">{t.footerData}</div></footer>
    </div>
  );
}
