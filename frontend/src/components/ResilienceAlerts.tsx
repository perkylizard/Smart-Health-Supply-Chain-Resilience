import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ResilienceAlert } from "../api";
import { useApp } from "../App";
import Badge from "./Badge";
import Explain from "./Explain";

const S = {
  en: {
    title: "Resilience alerts", sub: "Looks ahead across every facility: what runs out before the next delivery can arrive",
    all: "All", critical: "Critical", warning: "Warning", watch: "Watch", atRisk: (n: number) => `${n} facilities at risk`,
    out: "Stocked out", left: (d: number) => `${d}d left`, onHand: "On hand", cause: "Cause",
    before: (s: number, r: number) => `Runs out ${s} days before a delivery can land (resupply takes ${r} days)`,
    outNow: (r: number) => `Already out; a delivery takes ${r} days to land`,
    after: (d: number, r: number) => `Runs out in ${d} days; resupply takes ${r} days`,
    rising: (d: number) => `Demand rising: about ${d} days of stock at forecast demand`,
    fix: (q: string, from: string, km: number) => `Fix ready: +${q} from ${from}, ${km} km`, noFix: "No nearby facility has stock to spare; request it from the district store",
    why: "Why?", move: "Move stock", more: (n: number) => `Show ${n} more`, none: "Nothing is projected to run out. Every facility has stock beyond its next delivery.",
    reported: "reported by facility", failed: "Warnings could not load. Use Retry at the top of the page.",
    tierHint: { critical: "Runs out before a resupply can arrive", warning: "Runs out within two weeks after the resupply time", watch: "Fine today, but demand is rising" } as Record<string, string>,
  },
  hi: {
    title: "सुदृढ़ता अलर्ट", sub: "हर सुविधा पर आगे देखता है: अगली डिलीवरी से पहले क्या खत्म होगा",
    all: "सभी", critical: "गंभीर", warning: "चेतावनी", watch: "निगरानी", atRisk: (n: number) => `${n} सुविधाएँ जोखिम में`,
    out: "स्टॉक खत्म", left: (d: number) => `${d} दिन बचे`, onHand: "उपलब्ध", cause: "कारण",
    before: (s: number, r: number) => `डिलीवरी पहुँचने से ${s} दिन पहले खत्म होगा (आपूर्ति में ${r} दिन)`,
    outNow: (r: number) => `स्टॉक खत्म; डिलीवरी पहुँचने में ${r} दिन`,
    after: (d: number, r: number) => `${d} दिन में खत्म; आपूर्ति में ${r} दिन`,
    rising: (d: number) => `मांग बढ़ रही है: पूर्वानुमानित मांग पर लगभग ${d} दिन का स्टॉक`,
    fix: (q: string, from: string, km: number) => `समाधान तैयार: ${from} से +${q}, ${km} किमी`, noFix: "पास में कोई अतिरिक्त स्टॉक नहीं; ज़िला भंडार से इंडेंट करें",
    why: "क्यों?", move: "स्टॉक भेजें", more: (n: number) => `${n} और दिखाएँ`, none: "कुछ भी खत्म होने का अनुमान नहीं। हर सुविधा के पास अगली डिलीवरी तक स्टॉक है।",
    reported: "सुविधा द्वारा दर्ज", failed: "चेतावनियाँ लोड नहीं हुईं। पेज के ऊपर फिर से कोशिश करें।",
    tierHint: { critical: "आपूर्ति पहुँचने से पहले खत्म", warning: "आपूर्ति समय के बाद दो हफ़्ते में खत्म", watch: "आज ठीक, पर मांग बढ़ रही है" } as Record<string, string>,
  },
};

/** Proactive stock-out warnings for a district: critical (runs out before a resupply can land), warning (within two weeks
 *  after that), watch (fine now, demand rising). Each warning names the fix the optimiser already has, if any. */
export default function ResilienceAlerts({ unit, district }: { unit: string; district: string }) {
  const { lang, base, t } = useApp(); const s = S[lang];
  const q = useQuery({ queryKey: ["resilience", unit, district], queryFn: () => api.resilienceAlerts(unit, district), refetchInterval: 30_000 });
  const [tier, setTier] = useState<"all" | "critical" | "warning" | "watch">("all");
  const [shown, setShown] = useState(6);
  const rows = (q.data?.alerts ?? []).filter((a) => tier === "all" || a.tier === tier);
  const c = q.data?.counts;
  return (
    <section className="card ra" aria-labelledby="ra-title">
      <div className="ra-head">
        <div>
          <h2 id="ra-title"><span className="ra-icon" aria-hidden>!</span>{s.title} {c && <span className="faint">({c.critical + c.warning + c.watch})</span>}</h2>
          <p className="faint">{s.sub}{q.data ? ` · ${s.atRisk(q.data.facilities_at_risk)}` : ""}</p>
        </div>
        <div className="seg" role="tablist" aria-label={s.title}>
          {(["all", "critical", "warning", "watch"] as const).map((k) => <button key={k} role="tab" aria-selected={tier === k} className={tier === k ? "on" : ""} onClick={() => { setTier(k); setShown(6); }} title={k === "all" ? undefined : s.tierHint[k]}>
            {s[k]}{k !== "all" && c ? <span className="seg-n">{c[k]}</span> : null}</button>)}
        </div>
      </div>
      {q.isLoading && <p className="skeleton" style={{ height: 120 }}>…</p>}
      {q.isError && <p className="muted ra-empty">{s.failed}</p>}
      {q.data && rows.length === 0 && <p className="muted ra-empty">{s.none}</p>}
      <ul className="ra-list">
        {rows.slice(0, shown).map((a) => <Row key={a.facility_id + a.commodity_id} a={a} s={s} base={base} />)}
      </ul>
      {rows.length > shown && <button className="btn quiet" onClick={() => setShown((n) => n + 10)}>{s.more(Math.min(10, rows.length - shown))}</button>}
      {q.data && <p className="faint ra-prov">{q.data.provenance} <Badge kind="computed" /></p>}
      <span hidden>{t.days}</span>
    </section>
  );
}

function Row({ a, s, base }: { a: ResilienceAlert; s: typeof S.en; base: string }) {
  const { t } = useApp();
  const days = Math.round(a.runs_out_in_days * 10) / 10;
  const line = a.tier === "watch" ? s.rising(Math.round(days)) : days <= 0 ? s.outNow(Math.round(a.resupply_in_days)) : a.short_by_days > 0 ? s.before(Math.round(a.short_by_days), Math.round(a.resupply_in_days)) : s.after(Math.round(days), Math.round(a.resupply_in_days));
  return (
    <li className={`ra-item ${a.tier}`}>
      <div className="ra-top">
        <div>
          <div className="ra-med">{a.commodity_name}</div>
          <div className="ra-fac"><Link to={`/facility/${a.facility_id}`}>{a.facility_name}</Link><span className="faint"> · {a.type}</span>{a.reported && <span className="chip teal" style={{ minHeight: 20, marginLeft: 6 }}>{s.reported}</span>}</div>
        </div>
        <span className={`ra-days ${a.tier}`}>{days <= 0 ? s.out : s.left(days)}</span>
      </div>
      <div className="ra-facts"><span>{s.onHand}: <b>{Math.round(a.closing).toLocaleString("en-IN")}</b></span><span>{s.cause}: <b>{t.causes[a.cause] || a.cause.replace(/_/g, " ")}</b></span></div>
      <p className="ra-line">{line}</p>
      <p className={`ra-fix${a.fix_from ? "" : " none"}`}>{a.fix_from ? s.fix(Math.round(a.fix_quantity ?? 0).toLocaleString("en-IN"), a.fix_from, Math.round(a.fix_km ?? 0)) : s.noFix}</p>
      <div className="ra-actions">
        <Explain kind="alert" item={a}><button className="btn quiet">{s.why}</button></Explain>
        <Link className="btn quiet" to={`${base}/dispatch?commodity=${a.commodity_id}`}>{s.move} →</Link>
      </div>
    </li>
  );
}
