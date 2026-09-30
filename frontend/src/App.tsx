import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { strings, type Lang } from "./i18n";
import { homePath, type PersonaId } from "./personas";
import Shell from "./components/Shell";

// Screens load on demand so the app bar paints before any screen's code arrives; each import is kept as a
// function so the same chunk can be warmed on idle (see Located) and by React.lazy without loading it twice.
const loadBriefing = () => import("./screens/Briefing");
const loadDispatch = () => import("./screens/Dispatch");
const loadAsk = () => import("./screens/Ask");
const loadFederatedView = () => import("./screens/FederatedView");
const loadFacility = () => import("./screens/Facility");
const loadSystem = () => import("./screens/System");
const loadStateView = () => import("./screens/StateView");
const loadNationalView = () => import("./screens/NationalView");
const loadPhcHome = () => import("./screens/PhcHome");
const loadDmBrief = () => import("./screens/DmBrief");
const loadWarehouse = () => import("./screens/Warehouse");
const Briefing = lazy(loadBriefing);
const Dispatch = lazy(loadDispatch);
const Ask = lazy(loadAsk);
const FederatedView = lazy(loadFederatedView);
const Facility = lazy(loadFacility);
const System = lazy(loadSystem);
const StateView = lazy(loadStateView);
const DistrictsTable = lazy(() => loadStateView().then((m) => ({ default: m.DistrictsTable })));
const NationalView = lazy(loadNationalView);
const PhcHome = lazy(loadPhcHome);
const PhcPick = lazy(() => loadPhcHome().then((m) => ({ default: m.PhcPick })));
const DmBrief = lazy(loadDmBrief);
const DmCompare = lazy(() => loadDmBrief().then((m) => ({ default: m.DmCompare })));
const Warehouse = lazy(loadWarehouse);
const WarehouseStock = lazy(() => loadWarehouse().then((m) => ({ default: m.WarehouseStock })));

/** The other screens a role can reach from its app bar, warmed once the browser is idle after the first screen shows. */
const SIBLINGS: Record<string, (() => Promise<unknown>)[]> = {
  dho: [loadBriefing, loadDispatch, loadAsk, loadSystem, loadFacility],
  state: [loadStateView, loadNationalView, loadFederatedView, loadAsk, loadSystem],
  dm: [loadDmBrief, loadSystem],
  warehouse: [loadWarehouse, loadSystem],
  phc: [loadPhcHome],
  "phc-pick": [loadPhcHome],
  facility: [loadFacility, loadBriefing],
};
function warmSiblings(which: string) {
  const run = () => { SIBLINGS[which]?.forEach((load) => { load().catch(() => { /* a failed warm-up is retried by the route itself */ }); }); };
  // wait a few seconds first: while the first screen's data is still on its way the main thread is idle, and the
  // warm-up must not share the network with that data
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  let idle: number | undefined;
  const timer = window.setTimeout(() => { if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: 4000 }); else run(); }, 3000);
  return () => { window.clearTimeout(timer); if (idle !== undefined) w.cancelIdleCallback?.(idle); };
}

/** Shown in the content area while a screen's code is on its way; the same shimmer the screens use for their own data. */
/** While a screen's code loads: the page's shape in soft shimmer (hero, then two columns), never a blank frame. */
const ScreenFallback = () => (
  <div aria-busy="true" className="screen-fallback">
    <p className="skeleton" style={{ height: 150, marginBottom: 24 }}>…</p>
    <div className="sf-cols"><p className="skeleton" style={{ height: 340 }}>…</p><p className="skeleton" style={{ height: 340 }}>…</p></div>
  </div>
);

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

function NotFound({ lang, kind, persona, bad }: { lang: Lang; kind: "facility" | "place"; persona: PersonaId; bad?: string }) {
  // the last place that worked, unless that is the broken one
  const [u, d] = kind === "place" && readLS("district", "") === bad ? ["bihar", "Araria"] : [readLS("unit", "bihar"), readLS("district", "Araria")];
  const hi = lang === "hi";
  const title = kind === "facility" ? (hi ? "यह सुविधा नहीं मिली" : "We could not find this facility") : (hi ? "यह ज़िला नहीं मिला" : "We could not find this district");
  const body = hi ? "लिंक में गलती हो सकती है या यह पुराना हो सकता है। नीचे से सही जगह चुनें।" : "The link may be mistyped or out of date. Pick the right place below.";
  const to = persona === "phc" ? `/phc-pick/${u}/${encodeURIComponent(d)}` : homePath(persona, u, d);
  return (
    <section className="card" role="alert" style={{ maxWidth: 560, margin: "32px auto" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted">{body}</p>
      <Link className="btn primary" to={to}>{persona === "phc" ? (hi ? "सुविधा चुनें" : "Choose a facility") : (hi ? `${d} खोलें` : `Open ${d}`)}</Link>
    </section>
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
    nav(worst ? (persona === "phc" ? `/phc-pick/${unit}/${encodeURIComponent(worst.district)}` : homePath(persona, unit!, worst.district)) : "/", { replace: true });
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
  // a mistyped or stale link: say so plainly instead of loading forever, and never remember it as the user's place
  const names = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), enabled: !!unit && which !== "facility" && which !== "phc", staleTime: Infinity });
  const badFacility = (which === "phc" || which === "facility") && facility.isError;
  const badPlace = !!params.unit && (names.isError || (!!params.district && !!names.data && !names.data.districts.some((d) => d.district === params.district)));
  const known = which === "phc" || which === "facility" ? !!fac : !params.district || !!names.data?.districts.some((d) => d.district === params.district);
  useEffect(() => { if (!known) return; if (unit) writeLS("unit", unit); if (district) writeLS("district", district); if (which === "phc" && params.id) writeLS("facility", params.id); }, [known, unit, district, which, params.id]);
  const effectivePersona: PersonaId = which === "phc" || which === "phc-pick" ? "phc" : which === "facility" ? persona : (which as PersonaId);
  const base = which === "phc" ? `/phc/${params.id}` : homePath(effectivePersona, unit, district);
  const ctx = useMemo<Ctx>(() => ({
    lang, setLang, t: strings[lang], persona: effectivePersona, unit, district, facilityId: which === "phc" ? params.id : undefined, base, basis, setBasis,
    setPersona: (p) => { setPersona(p); nav(homePath(p, unit, district, readLS("facility", "") || undefined)); },
    setLocation: (u, d) => { if (!d) { nav(`/${u}`); return; } nav(effectivePersona === "phc" ? `/phc-pick/${u}/${encodeURIComponent(d)}` : homePath(effectivePersona, u, d)); },
  }), [lang, effectivePersona, unit, district, base, which, params.id, nav, setPersona, basis, setBasis]);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
  useEffect(() => warmSiblings(which), [which]);
  let body: React.ReactNode;
  switch (which) {
    case "dho": body = <Routes><Route index element={<Briefing />} /><Route path="dispatch" element={<Dispatch />} /><Route path="ask" element={<Ask />} /><Route path="system" element={<System />} /></Routes>; break;
    case "state": body = <Routes><Route index element={<StateView />} /><Route path="districts" element={<DistrictsTable />} /><Route path="india" element={<NationalView />} /><Route path="federated" element={<FederatedView />} /><Route path="ask" element={<Ask />} /><Route path="system" element={<System />} /></Routes>; break;
    case "dm": body = <Routes><Route index element={<DmBrief />} /><Route path="compare" element={<DmCompare />} /><Route path="system" element={<System />} /></Routes>; break;
    case "warehouse": body = <Routes><Route index element={<Warehouse />} /><Route path="stock" element={<WarehouseStock />} /><Route path="system" element={<System />} /></Routes>; break;
    case "phc-pick": body = <PhcPick />; break;
    case "phc": body = <Routes><Route index element={<PhcHome tab="stock" />} /><Route path="report" element={<PhcHome tab="report" />} /><Route path="deliveries" element={<PhcHome tab="deliveries" />} /></Routes>; break;
    default: body = <Facility id={params.id!} />;
  }
  if (badFacility || badPlace) body = <NotFound lang={lang} kind={badFacility ? "facility" : "place"} persona={effectivePersona} bad={params.district} />;
  return (
    <AppCtx.Provider value={ctx}>
      <Shell offline={health.isError}><Suspense fallback={<ScreenFallback />}>{body}</Suspense></Shell>
    </AppCtx.Provider>
  );
}
