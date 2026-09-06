import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { strings, type Lang } from "./i18n";
import Shell from "./components/Shell";
import Briefing from "./screens/Briefing";
import Dispatch from "./screens/Dispatch";
import Ask from "./screens/Ask";
import Facility from "./screens/Facility";
import System from "./screens/System";

export interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: typeof strings.en; unit: string; district: string; setLocation: (u: string, d: string) => void }
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

function Located({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => { try { return (localStorage.getItem("lang") as Lang) || "en"; } catch { return "en"; } });
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("lang", l); } catch { /* ignore */ } };
  useEffect(() => { document.body.dataset.lang = lang; document.documentElement.lang = lang; }, [lang]);
  return (
    <Routes>
      <Route path="/" element={<Redirect />} />
      <Route path="/:unit/:district/*" element={<WithLocation lang={lang} setLang={setLang} />} />
      <Route path="/facility/:id" element={<WithLocation lang={lang} setLang={setLang} facilityMode />} />
    </Routes>
  );
}

function Redirect() {
  const nav = useNavigate();
  useEffect(() => { nav("/bihar/Araria", { replace: true }); }, [nav]);
  return null;
}

function WithLocation({ lang, setLang, facilityMode }: { lang: Lang; setLang: (l: Lang) => void; facilityMode?: boolean }) {
  const params = useParams();
  const nav = useNavigate();
  const [loc, setLoc] = useState({ unit: params.unit ?? "bihar", district: params.district ?? "Araria" });
  useEffect(() => { if (params.unit && params.district) setLoc({ unit: params.unit, district: params.district }); }, [params.unit, params.district]);
  const ctx = useMemo<Ctx>(() => ({
    lang, setLang, t: strings[lang], unit: loc.unit, district: loc.district,
    setLocation: (u, d) => { setLoc({ unit: u, district: d }); nav(`/${u}/${encodeURIComponent(d)}`); },
  }), [lang, loc, nav]);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
  return (
    <AppCtx.Provider value={ctx}>
      <Shell offline={health.isError}>
        <Located>
          {facilityMode ? <Facility id={params.id!} /> : (
            <Routes>
              <Route index element={<Briefing />} />
              <Route path="dispatch" element={<Dispatch />} />
              <Route path="ask" element={<Ask />} />
              <Route path="system" element={<System />} />
            </Routes>
          )}
        </Located>
      </Shell>
    </AppCtx.Provider>
  );
}
