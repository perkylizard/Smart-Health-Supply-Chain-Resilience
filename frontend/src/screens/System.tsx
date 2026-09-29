import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import ScenarioDial from "../components/ScenarioDial";
import Federated from "../components/Federated";

export default function System() {
  const { t, unit } = useApp();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const prov = useQuery({ queryKey: ["provenance"], queryFn: api.provenance });
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const districts = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), staleTime: Infinity });
  const fac = districts.data?.districts.reduce((a, d) => a + d.facilities, 0) ?? 0;
  const unitName = units.data?.units.find((u) => u.unit_id === unit)?.unit_name ?? unit;
  return (
    <div className="two-col settings">
      <h1 className="sr-only">{t.system}</h1>
      <div>
        <section className="card settings-card"><h2>{t.scenario}</h2><p className="faint" style={{ margin: "4px 0 12px" }}>{t.scenarioHint}</p><ScenarioDial large /></section>
        <section className="card settings-card"><h2>{t.federated}</h2><Federated /></section>
      </div>
      <aside>
        <section className="card settings-card"><h2>{t.dataHealth}</h2>
          <dl className="kv">
            <dt>{t.facilitiesIn} {unitName}</dt><dd>{fac.toLocaleString("en-IN")}</dd>
            <dt>{t.districtsLbl}</dt><dd>{districts.data?.districts.length ?? "…"}</dd>
            <dt>{t.latestMonth}</dt><dd>{health.data ? t.monthIndex(health.data.latest_month) : "…"}</dd>
          </dl>
        </section>
        <section className="card settings-card"><h2>{t.provenanceTitle}</h2>
          <dl className="prov">{prov.data && Object.entries(prov.data).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</dt><dd>{v}</dd></div>)}</dl>
        </section>
      </aside>
    </div>
  );
}
