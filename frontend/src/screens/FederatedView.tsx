import { useApp } from "../App";
import Federated from "../components/Federated";

const L = {
  en: { eyebrow: "State coordination", title: "Federated learning", sub: "Districts, states and BRICS partners train one shared stock-out model. Each keeps its records at home; only model weights and row counts travel." },
  hi: { eyebrow: "राज्य समन्वय", title: "फ़ेडरेटेड लर्निंग", sub: "ज़िले, राज्य और ब्रिक्स साझेदार एक साझा स्टॉक-आउट मॉडल सिखाते हैं। हर कोई अपने रिकॉर्ड अपने पास रखता है; केवल मॉडल के भार और पंक्तियों की गिनती साझा होती है।" },
};

/** State officer only: the federated learning panel as its own tab (it used to sit inside Settings for every role). */
export default function FederatedView() {
  const { lang } = useApp();
  const l = L[lang];
  return (
    <div className="pg">
      <section className="card pg-hero">
        <p className="eyebrow"><span className="eyebrow-accent">{l.eyebrow}</span></p>
        <h1>{l.title}</h1>
        <p className="faint pg-sub">{l.sub}</p>
      </section>
      <section className="card"><Federated /></section>
    </div>
  );
}
