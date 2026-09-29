import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import { PERSONAS, type PersonaId } from "../personas";
import ScenarioDial from "../components/ScenarioDial";
import Federated from "../components/Federated";
import Badge from "../components/Badge";
import { sA } from "../stringsA";

export default function System() {
  const { t, unit, lang, persona, setPersona, basis, setBasis } = useApp();
  const a = sA[lang];
  const nav = useNavigate();
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const prov = useQuery({ queryKey: ["provenance"], queryFn: api.provenance });
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), staleTime: Infinity });
  const fac = districts.data?.districts.reduce((acc, d) => acc + d.facilities, 0) ?? 0;
  const unitName = units.data?.units.find((u) => u.unit_id === unit)?.unit_name ?? unit;
  /** Same as the header brand: forget remembered role, place and basis, switch the scenario off, open the default district. */
  const reset = () => {
    try { for (const k of ["unit", "district", "facility", "basis"]) localStorage.removeItem(k); } catch { /* ignore */ }
    setBasis("real");
    api.setScenario("normal", 1).then(() => qc.invalidateQueries()).catch(() => {});
    if (persona !== "dho") setPersona("dho");
    nav("/dho/bihar/Araria");
  };
  const Sec = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <section className="se-sec"><h2><span className="se-n">{n}</span>{title}</h2>{children}</section>
  );
  return (
    <div className="pg se">
      <h1 className="sr-only">{t.system}</h1>
      <section className="card pg-hero">
        <div className="pg-hero-top">
          <div>
            <p className="eyebrow"><span className="eyebrow-accent">{a.seEyebrow}</span></p>
            <h2 className="pg-h1">{a.seTitle}</h2>
            <p className="faint pg-sub">{a.seSub}</p>
          </div>
          <button className="btn se-reset" onClick={reset} title={a.resetHint}>{a.reset}</button>
        </div>
      </section>
      <div className="pg-grid">
        <div>
          <div className="card">
            <Sec n={1} title={a.secRole}>
              <div className="opt-grid" role="radiogroup" aria-label={a.secRole}>
                {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
                  <button key={id} role="radio" aria-checked={persona === id} className={`opt${persona === id ? " on" : ""}`} onClick={() => setPersona(id)}>
                    <span className="opt-t">{t.personas[id]}{persona === id && <span className="opt-on">{a.active}</span>}</span>
                    <span className="opt-d">{t.personaHints[id]}</span>
                  </button>))}
              </div>
            </Sec>
            <Sec n={2} title={a.secBasis}>
              <div className="opt-grid two" role="radiogroup" aria-label={a.secBasis}>
                <button role="radio" aria-checked={basis === "real"} className={`opt${basis === "real" ? " on" : ""}`} onClick={() => setBasis("real")}><span className="opt-t">{a.basisRealTitle} <Badge kind="real" />{basis === "real" && <span className="opt-on">{a.active}</span>}</span><span className="opt-d">{a.basisRealDesc}</span></button>
                <button role="radio" aria-checked={basis === "simulated"} className={`opt${basis === "simulated" ? " on" : ""}`} onClick={() => setBasis("simulated")}><span className="opt-t">{a.basisSimTitle} <Badge kind="simulated" />{basis === "simulated" && <span className="opt-on">{a.active}</span>}</span><span className="opt-d">{a.basisSimDesc}</span></button>
              </div>
              <p className="faint se-note">{a.basisNote}</p>
            </Sec>
            <Sec n={3} title={a.secWhatIf}>
              <p className="faint se-note" style={{ marginTop: 0 }}>{t.scenarioHint}</p>
              <ScenarioDial variant="cards" />
            </Sec>
            <Sec n={4} title={a.secFed}><Federated /></Sec>
          </div>
        </div>
        <aside>
          <section className="card">
            <h2 className="se-side-h"><span className="se-n">5</span>{a.secHealth}</h2>
            <dl className="kv">
              <dt>{t.facilitiesIn} {unitName}</dt><dd>{districts.data ? fac.toLocaleString("en-IN") : "…"}</dd>
              <dt>{t.districtsLbl}</dt><dd>{districts.data?.districts.length ?? "…"}</dd>
              <dt>{t.latestMonth}</dt><dd>{health.data ? t.monthIndex(health.data.latest_month) : health.isError ? "—" : "…"}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="se-side-h"><span className="se-n">6</span>{a.secProv}</h2>
            {prov.isLoading && <p className="skeleton" style={{ height: 120 }}>…</p>}
            <dl className="prov">{prov.data && Object.entries(prov.data).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</dt><dd>{v}</dd></div>)}</dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
