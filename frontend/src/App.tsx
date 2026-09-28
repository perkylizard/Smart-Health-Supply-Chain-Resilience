import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { strings, type Lang } from "./i18n";
import { homePath, type PersonaId } from "./personas";
import Shell from "./components/Shell";
import Briefing from "./screens/Briefing";
import Dispatch from "./screens/Dispatch";
import Ask from "./screens/Ask";
import Facility from "./screens/Facility";
import System from "./screens/System";
import StateView, { DistrictsTable } from "./screens/StateView";
import NationalView from "./screens/NationalView";
import PhcHome, { PhcPick } from "./screens/PhcHome";
import DmBrief, { DmCompare } from "./screens/DmBrief";
import Warehouse, { WarehouseStock } from "./screens/Warehouse";

export type Basis = "real" | "simulated";
export interface Ctx {
  lang: Lang; setLang: (l: Lang) => void; t: typeof strings.en; persona: PersonaId; setPersona: (p: PersonaId) => void;
  basis: Basis; setBasis: (b: Basis) => void;
  unit: string; district: string; facilityId?: string; setLocation: (u: string, d: string) => void; base: string;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

function readLS(k: string, d: string) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function writeLS(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => readLS("lang", "en") as Lang);
  const [persona, setPersonaState] = useState<PersonaId>(() => readLS("persona", "dho") as PersonaId);
  const setLang = (l: Lang) => { setLangState(l); writeLS("lang", l); };
  const setPersona = (p: PersonaId) => { setPersonaState(p); writeLS("persona", p); };
  const [basis, setBasisState] = useState<Basis>(() => (readLS("basis", "real") === "simulated" ? "simulated" : "real"));
  const setBasis = (b: Basis) => { setBasisState(b); writeLS("basis", b); };
  useEffect(() => { document.body.dataset.lang = lang; document.documentElement.lang = lang; }, [lang]);
  const common = { lang, setLang, persona, setPersona, basis, setBasis };
  return (
    <Routes>
      <Route path="/" element={<Navigate to={homePath(persona, readLS("unit", "bihar"), readLS("district", "Araria"), readLS("facility", "") || undefined)} replace />} />
      <Route path="/:unit" element={<UnitRedirect persona={persona} />} />
      <Route path="/dho/:unit/:district/*" element={<Located {...common} which="dho" />} />
      <Route path="/state/:unit/*" element={<Located {...common} which="state" />} />
      <Route path="/dm/:unit/:district/*" element={<Located {...common} which="dm" />} />
      <Route path="/warehouse/:unit/:district/*" element={<Located {...common} which="warehouse" />} />
      <Route path="/phc-pick/:unit/:district" element={<Located {...common} which="phc-pick" />} />
      <Route path="/phc/:id/*" element={<Located {...common} which="phc" />} />
      <Route path="/facility/:id" element={<Located {...common} which="facility" />} />
      {/* legacy district-officer URLs */}
      <Route path="/:unit/:district/*" element={<LegacyRedirect />} />
    </Routes>
  );
}

function LegacyRedirect() {
  const { unit, district } = useParams();
  return <Navigate to={`/dho/${unit}/${encodeURIComponent(district!)}`} replace />;
}

/** A unit alone in the URL: jump to its district with the most red alerts. */
function UnitRedirect({ persona }: { persona: PersonaId }) {
  const { unit } = useParams();
  const nav = useNavigate();
  // names are instant; the worst-district choice is used only when the state's scores are already cached, so switching state never waits
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit!), enabled: !!unit, staleTime: Infinity });
  useEffect(() => {
    if (!q.data) return;
    const scored = qc.getQueryData<{ districts: { district: string; red_alerts: number }[] }>(["districts", unit]);
    const worst = scored ? [...scored.districts].sort((a, b) => (b.red_alerts ?? 0) - (a.red_alerts ?? 0))[0] : q.data.districts[0];
    nav(worst ? homePath(persona === "phc" ? "dho" : persona, unit!, worst.district) : "/", { replace: true });
  }, [q.data, unit, nav, persona, qc]);
  if (q.isError) return <p style={{ padding: 24 }}>Unknown state. <a href="/">Back</a></p>;
  return <p className="skeleton" style={{ margin: 24, height: 40 }}>Loading the district with the most alerts</p>;
}

function Located({ lang, setLang, persona, setPersona, basis, setBasis, which }: { lang: Lang; setLang: (l: Lang) => void; persona: PersonaId; setPersona: (p: PersonaId) => void; basis: Basis; setBasis: (b: Basis) => void; which: string }) {
  const params = useParams();
  const nav = useNavigate();
  const facility = useQuery({ queryKey: ["facility", params.id], queryFn: () => api.facility(params.id!), enabled: which === "phc" || which === "facility" });
  const fac = facility.data?.facility as Record<string, string> | undefined;
  const unit = params.unit ?? fac?.unit_id ?? readLS("unit", "bihar");
  const district = params.district ?? fac?.district ?? readLS("district", "Araria");
  useEffect(() => { if (unit) writeLS("unit", unit); if (district) writeLS("district", district); if (which === "phc" && params.id) writeLS("facility", params.id); }, [unit, district, which, params.id]);
  const effectivePersona: PersonaId = which === "phc" || which === "phc-pick" ? "phc" : which === "facility" ? persona : (which as PersonaId);
  const base = which === "phc" ? `/phc/${params.id}` : homePath(effectivePersona, unit, district);
  const ctx = useMemo<Ctx>(() => ({
    lang, setLang, t: strings[lang], persona: effectivePersona, unit, district, facilityId: which === "phc" ? params.id : undefined, base, basis, setBasis,
    setPersona: (p) => { setPersona(p); nav(homePath(p, unit, district, readLS("facility", "") || undefined)); },
    setLocation: (u, d) => { if (!d) { nav(`/${u}`); return; } nav(homePath(effectivePersona === "phc" ? "dho" : effectivePersona, u, d)); },
  }), [lang, effectivePersona, unit, district, base, which, params.id, nav, setPersona, basis, setBasis]);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
  let body: React.ReactNode;
  switch (which) {
    case "dho": body = <Routes><Route index element={<Briefing />} /><Route path="dispatch" element={<Dispatch />} /><Route path="ask" element={<Ask />} /><Route path="system" element={<System />} /></Routes>; break;
    case "state": body = <Routes><Route index element={<StateView />} /><Route path="districts" element={<DistrictsTable />} /><Route path="india" element={<NationalView />} /><Route path="ask" element={<Ask />} /><Route path="system" element={<System />} /></Routes>; break;
    case "dm": body = <Routes><Route index element={<DmBrief />} /><Route path="compare" element={<DmCompare />} /><Route path="system" element={<System />} /></Routes>; break;
    case "warehouse": body = <Routes><Route index element={<Warehouse />} /><Route path="stock" element={<WarehouseStock />} /><Route path="system" element={<System />} /></Routes>; break;
    case "phc-pick": body = <PhcPick />; break;
    case "phc": body = <Routes><Route index element={<PhcHome tab="stock" />} /><Route path="report" element={<PhcHome tab="report" />} /><Route path="deliveries" element={<PhcHome tab="deliveries" />} /></Routes>; break;
    default: body = <Facility id={params.id!} />;
  }
  return (
    <AppCtx.Provider value={ctx}>
      <Shell offline={health.isError}>{body}</Shell>
    </AppCtx.Provider>
  );
}
