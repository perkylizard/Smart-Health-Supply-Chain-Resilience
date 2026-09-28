import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import ScenarioDial from "../components/ScenarioDial";
import Federated from "../components/Federated";

export default function System() {
  const { t, unit } = useApp();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const prov = useQuery({ queryKey: ["provenance"], queryFn: api.provenance });
  const districts = useQuery({ queryKey: ["districtNames", unit], queryFn: () => api.districtNames(unit), staleTime: Infinity });
  const fac = districts.data?.districts.reduce((a, d) => a + d.facilities, 0) ?? 0;
  return (
    <div className="two-col">
      <div>
        <section className="section"><h2>{t.scenario}</h2><ScenarioDial large /></section>
        <section className="section"><h2>{t.federated}</h2><Federated /></section>
      </div>
      <aside>
        <section className="section"><h2>{t.dataHealth}</h2>
          <table className="table"><tbody>
            <tr><td>{t.latestMonth}</td><td className="num">{health.data?.latest_month ?? "…"}</td></tr>
            <tr><td>{t.facilities} ({unit})</td><td className="num">{fac.toLocaleString("en-IN")}</td></tr>
            <tr><td>districts</td><td className="num">{districts.data?.districts.length ?? "…"}</td></tr>
          </tbody></table>
        </section>
        <section className="section"><h2>Provenance</h2>
          {prov.data && Object.entries(prov.data).map(([k, v]) => <p key={k} style={{ fontSize: 13 }}><strong>{k.replace(/_/g, " ")}</strong><br /><span className="muted">{v}</span></p>)}
        </section>
      </aside>
    </div>
  );
}
