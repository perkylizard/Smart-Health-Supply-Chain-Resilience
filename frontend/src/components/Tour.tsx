import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import type { PersonaId } from "../personas";

/** A guided tour per role: the real screen stays visible, one element is spotlit, a card explains it. No library. */
type Step = { target: string; path?: string; click?: string; en: [string, string]; hi: [string, string] };

const ROLE = ".hdr-actions .role";
const STEPS: Record<PersonaId, Step[]> = {
  dho: [
    { target: ".card.hero", path: "", en: ["Your district at a glance", "The resilience score, the state league and four numbers. Tap any tile to open its tab."], hi: ["आपका ज़िला एक नज़र में", "सुदृढ़ता स्कोर, राज्य में स्थान और चार मुख्य आंकड़े। किसी टाइल पर टैप करें, उसका टैब खुलेगा।"] },
    { target: ".req-waiting", en: ["Requests waiting for you", "Facilities asked for stock. Review requests takes you straight to them."], hi: ["आपकी प्रतीक्षा में अनुरोध", "सुविधाओं ने स्टॉक माँगा है। अनुरोध देखें से सीधे वहाँ पहुँचें।"] },
    { target: ".subtabs", en: ["One job per tab", "Requests, transfers, stock alerts, map, beds and counts. The number on each tab is what is waiting."], hi: ["हर टैब में एक काम", "अनुरोध, स्थानांतरण, स्टॉक चेतावनियाँ, नक्शा, बिस्तर और गिनती। हर टैब की संख्या बताती है कितना बाकी है।"] },
    { target: "#req-inbox", click: "#tab-requests", en: ["Approve or decline", "Approve sends it to the district store. Decline asks for a reason, which the facility sees."], hi: ["स्वीकृत या अस्वीकार करें", "स्वीकृति ज़िला भंडार को भेजती है। अस्वीकार करने पर कारण पूछा जाता है, जो सुविधा देखती है।"] },
    { target: ".req-track", click: "#tab-requests", en: ["Follow it to delivery", "Approved, on the way, received, or sent back by the store with a reason."], hi: ["डिलीवरी तक नज़र रखें", "स्वीकृत, रास्ते में, प्राप्त, या भंडार ने कारण के साथ लौटाया।"] },
    { target: ".prop-grid .prop", click: "#tab-transfers", en: ["Move stock between facilities", "Surplus next door, matched by distance and days of stock. Why this transfer? explains each one."], hi: ["सुविधाओं के बीच स्टॉक भेजें", "पास की सुविधा का अधिशेष, दूरी और स्टॉक के दिनों से मिलाया गया। यह स्थानांतरण क्यों? हर एक समझाता है।"] },
    { target: ".ra", click: "#tab-alerts", en: ["See it coming", "What runs out before the next delivery can land, with the fix attached."], hi: ["पहले से देखें", "अगली डिलीवरी से पहले क्या खत्म होगा, और उसका समाधान साथ में।"] },
    { target: ".fac-list", click: "#tab-map", en: ["Every facility, worst first", "Open any facility to see its stock, beds and staff."], hi: ["हर सुविधा, सबसे गंभीर पहले", "किसी भी सुविधा का स्टॉक, बिस्तर और स्टाफ़ देखने के लिए खोलें।"] },
    { target: ROLE, click: "#tab-requests", en: ["See it from every side", "Switch role to follow the same request as facility staff, the district store or the state."], hi: ["हर तरफ़ से देखें", "भूमिका बदलकर वही अनुरोध सुविधा स्टाफ़, ज़िला भंडार या राज्य की नज़र से देखें।"] },
  ],
  phc: [
    { target: ".tiles", path: "", en: ["Your facility today", "What you track, what is critical and how full your beds are."], hi: ["आज आपकी सुविधा", "आप क्या ट्रैक करते हैं, क्या गंभीर है और बिस्तर कितने भरे हैं।"] },
    { target: ".dtable-wrap", path: "", en: ["Every medicine, days left", "Sorted by what runs out first. Request any row in one tap."], hi: ["हर दवा, कितने दिन बचे", "जो पहले खत्म होगी वह ऊपर। किसी भी पंक्ति से एक टैप में माँगें।"] },
    { target: ".report-card", path: "/report", en: ["Report what is on the shelf", "Type it in your own words. It is read back to you, with before and after, before anything is saved."], hi: ["शेल्फ़ पर क्या है, बताएँ", "अपने शब्दों में लिखें। सहेजने से पहले पहले और बाद के आंकड़ों के साथ पढ़कर दिखाया जाता है।"] },
    { target: ".report-media", path: "/report", en: ["Or a photo, or your voice", "Photograph the stock register or send a Hindi voice note. Gemini reads it; you confirm."], hi: ["या फ़ोटो, या आवाज़", "स्टॉक रजिस्टर की फ़ोटो लें या हिंदी वॉइस नोट भेजें। Gemini पढ़ता है; आप पुष्टि करते हैं।"] },
    { target: ".hdr-primary", en: ["Ask the district for stock", "Your request goes to the District Health Officer for approval, then to the district store."], hi: ["ज़िले से स्टॉक माँगें", "अनुरोध ज़िला स्वास्थ्य अधिकारी की स्वीकृति के लिए, फिर ज़िला भंडार को जाता है।"] },
    { target: ".tcard", path: "/deliveries", en: ["Follow it, then confirm", "When stock reaches you, tap Received. Your stock goes up on every screen."], hi: ["नज़र रखें, फिर पुष्टि करें", "स्टॉक पहुँचने पर प्राप्त हुआ दबाएँ। हर स्क्रीन पर आपका स्टॉक बढ़ जाता है।"] },
    { target: ROLE, en: ["See it from every side", "Switch role to see how the district officer and the store handle your request."], hi: ["हर तरफ़ से देखें", "भूमिका बदलकर देखें कि ज़िला अधिकारी और भंडार आपका अनुरोध कैसे संभालते हैं।"] },
  ],
  warehouse: [
    { target: ".tiles", path: "", en: ["Your queue at a glance", "What is pending, dispatched and delivered, and what facilities asked for."], hi: ["आपकी कतार एक नज़र में", "क्या लंबित, रवाना और पहुँचा है, और सुविधाओं ने क्या माँगा।"] },
    { target: ".pg .seg", path: "", en: ["Three lanes", "Pending, dispatched, delivered. Approved facility requests always come first."], hi: ["तीन चरण", "लंबित, रवाना, पहुँचा। स्वीकृत सुविधा अनुरोध हमेशा सबसे पहले।"] },
    { target: ".fac-group", path: "", en: ["One card per facility", "Mark dispatched when it leaves. Can't supply sends it back to the officer with a reason."], hi: ["हर सुविधा का एक कार्ड", "निकलते ही रवाना चिह्नित करें। नहीं भेज सकते तो कारण के साथ अधिकारी को लौटाएँ।"] },
    { target: "[data-tour=issues]", path: "/stock", en: ["Every dispatch is logged", "What left the store, for whom, per medicine. The HMIS ledger below is never edited."], hi: ["हर प्रेषण दर्ज है", "भंडार से क्या, किसे, किस दवा का गया। नीचे का HMIS लेजर कभी नहीं बदला जाता।"] },
    { target: ROLE, en: ["See it from every side", "Switch role to see the request as the facility or the district officer."], hi: ["हर तरफ़ से देखें", "भूमिका बदलकर अनुरोध सुविधा या ज़िला अधिकारी की नज़र से देखें।"] },
  ],
  dm: [
    { target: ".digest", path: "", en: ["Your weekly brief", "Written by Gemini from the week's numbers, in plain words."], hi: ["आपका साप्ताहिक ब्रीफ़", "सप्ताह के आंकड़ों से Gemini ने सरल शब्दों में लिखा।"] },
    { target: ".bench", path: "", en: ["Against the state", "Your district next to the state median, so you know where you stand."], hi: ["राज्य की तुलना में", "आपका ज़िला राज्य के मध्य के साथ, ताकि पता रहे आप कहाँ हैं।"] },
    { target: ".split .req-inbox", path: "", en: ["Requests from facilities", "Every request by status, from waiting to received."], hi: ["सुविधाओं के अनुरोध", "हर अनुरोध उसकी स्थिति के साथ, प्रतीक्षा से प्राप्ति तक।"] },
    { target: ".btn.rose", path: "", en: ["Escalate to the state", "One click sends a note the state officer sees."], hi: ["राज्य को सूचित करें", "एक क्लिक से राज्य अधिकारी को संदेश जाता है।"] },
    { target: ROLE, en: ["See it from every side", "Switch role to see the district officer's cockpit or the state view."], hi: ["हर तरफ़ से देखें", "भूमिका बदलकर ज़िला अधिकारी या राज्य का दृश्य देखें।"] },
  ],
  state: [
    { target: "[data-tour=st-hero]", path: "", en: ["Your state", "Every district's stock, beds and staff, in one place."], hi: ["आपका राज्य", "हर ज़िले का स्टॉक, बिस्तर और स्टाफ़, एक जगह।"] },
    { target: "[data-tour=st-map]", path: "", en: ["Every district on one map", "Colour shows resilience; open a district to see its cockpit."], hi: ["हर ज़िला एक नक्शे पर", "रंग सुदृढ़ता दिखाता है; किसी ज़िले का कॉकपिट खोलें।"] },
    { target: "[data-tour=st-approvals]", path: "", en: ["Transfers across districts", "When stock moves between districts, the state approves."], hi: ["ज़िलों के बीच स्थानांतरण", "जब स्टॉक ज़िलों के बीच जाता है, राज्य स्वीकृति देता है।"] },
    { target: "[data-tour=st-league]", path: "", en: ["The district league", "Who is most at risk this week, and who is doing well."], hi: ["ज़िलों की सूची", "इस सप्ताह सबसे ज़्यादा जोखिम में कौन है, और कौन अच्छा कर रहा है।"] },
    { target: '.hdr-tabs a[href$="/federated"], .hdr-tabs-m a[href$="/federated"]', path: "", en: ["Federated learning", "Districts, states and a Brazil partner train one model. No record ever leaves home."], hi: ["फ़ेडरेटेड लर्निंग", "ज़िले, राज्य और ब्राज़ील साथी एक मॉडल सिखाते हैं। कोई रिकॉर्ड बाहर नहीं जाता।"] },
    { target: ROLE, en: ["See it from every side", "Switch role to walk down the chain to one facility."], hi: ["हर तरफ़ से देखें", "भूमिका बदलकर एक सुविधा तक पूरी श्रृंखला देखें।"] },
  ],
};

const UI = {
  en: { of: (i: number, n: number) => `Step ${i} of ${n}`, next: "Next", back: "Back", done: "Done", skip: "Skip tour", prompt: "New to this role? Take a one-minute tour of the screen.", start: "Take the tour", later: "Not now" },
  hi: { of: (i: number, n: number) => `चरण ${i} / ${n}`, next: "आगे", back: "पीछे", done: "पूरा", skip: "टूर छोड़ें", prompt: "इस भूमिका में नए हैं? स्क्रीन का एक मिनट का टूर लें।", start: "टूर शुरू करें", later: "अभी नहीं" },
};

// a tiny store so the role menu can start the tour from anywhere
let active = false; const subs = new Set<() => void>();
export function startTour() { active = true; subs.forEach((f) => f()); }
const stop = () => { active = false; subs.forEach((f) => f()); };
const useActive = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => active);
const seenKey = (p: string) => `tour-seen-${p}`;
const readSeen = (p: string) => { try { return localStorage.getItem(seenKey(p)) === "1"; } catch { return true; } };
const markSeen = (p: string) => { try { localStorage.setItem(seenKey(p), "1"); } catch { /* private window */ } };

const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
const waitFor = (sel: string, ms = 4000) => new Promise<HTMLElement | undefined>((res) => {
  const t0 = Date.now(); const tick = () => { const el = visible(sel); if (el || Date.now() - t0 > ms) res(el); else setTimeout(tick, 120); }; tick();
});

export default function Tour() {
  const { persona, base, lang } = useApp();
  const on = useActive();
  const nav = useNavigate();
  const loc = useLocation();
  const steps = STEPS[persona];
  const ui = UI[lang];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [prompt, setPrompt] = useState(false);
  const elRef = useRef<HTMLElement | undefined>(undefined);
  const card = useRef<HTMLDivElement>(null);
  const dir = useRef(1);

  // first visit to a role: offer the tour once
  useEffect(() => { setPrompt(false); if (readSeen(persona)) return; const id = setTimeout(() => setPrompt(true), 1800); return () => clearTimeout(id); }, [persona]);

  const close = useCallback(() => { markSeen(persona); stop(); setI(0); setRect(null); elRef.current = undefined; }, [persona]);

  // enter a step: open its screen or tab, wait for the element, skip it if this screen has none (e.g. no waiting requests)
  useEffect(() => {
    if (!on) return;
    let dead = false;
    (async () => {
      const s = steps[i]; if (!s) { close(); return; }
      setRect(null);
      if (s.path !== undefined) { const want = base + s.path; if (loc.pathname !== want) nav(want + (s.path === "" && persona === "dho" ? loc.search : "")); }
      if (s.click) { const c = await waitFor(s.click, 2500); c?.click(); }
      const el = await waitFor(s.target);
      if (dead) return;
      if (!el) { const n = i + dir.current; if (n < 0 || n >= steps.length) close(); else setI(n); return; }
      elRef.current = el;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => { if (!dead) setRect(el.getBoundingClientRect()); }, 380);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, i, persona]);

  // keep the spotlight on its element while the page scrolls or resizes
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const upd = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const el = elRef.current; if (el && el.isConnected) setRect(el.getBoundingClientRect()); }); };
    window.addEventListener("scroll", upd, true); window.addEventListener("resize", upd);
    return () => { window.removeEventListener("scroll", upd, true); window.removeEventListener("resize", upd); cancelAnimationFrame(raf); };
  }, [on]);

  const go = (d: number) => { dir.current = d; const n = i + d; if (n >= steps.length) close(); else if (n >= 0) setI(n); };
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  useLayoutEffect(() => { if (on && rect) card.current?.focus({ preventScroll: true }); }, [on, rect, i]);

  if (!on) {
    if (!prompt) return null;
    return (
      <div className="tour-prompt" role="dialog" aria-label={ui.start}>
        <p>{ui.prompt}</p>
        <div className="tour-actions">
          <button className="btn quiet" onClick={() => { markSeen(persona); setPrompt(false); }}>{ui.later}</button>
          <button className="btn primary" onClick={() => { setPrompt(false); setI(0); dir.current = 1; startTour(); }}>{ui.start}</button>
        </div>
      </div>
    );
  }
  const s = steps[i];
  const [title, body] = s ? s[lang] : ["", ""];
  const pad = 8, vw = window.innerWidth, vh = window.innerHeight, phone = vw < 600, cw = Math.min(380, vw - 32);
  let style: React.CSSProperties = { width: cw };
  if (rect && !phone) {
    const below = rect.bottom + pad + 12, above = rect.top - pad - 12;
    const left = Math.min(Math.max(16, rect.left), vw - cw - 16);
    style = below + 220 < vh ? { ...style, top: below, left } : above > 240 ? { ...style, top: Math.max(16, above - 220), left } : { ...style, top: Math.max(16, Math.min(vh - 240, rect.top)), left: rect.right + 16 + cw < vw ? rect.right + 16 : Math.max(16, rect.left - cw - 16) };
  }
  return (
    <div className="tour-layer">
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect && <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      <div ref={card} className={`tour-card${phone ? " docked" : ""}`} style={phone ? undefined : style} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} aria-live="polite">
        <p className="tour-step">{ui.of(i + 1, steps.length)}</p>
        <h2 id="tour-title">{title}</h2>
        <p className="tour-body">{body}</p>
        <div className="tour-actions">
          <button className="btn quiet" onClick={close}>{ui.skip}</button>
          <span className="spacer" />
          {i > 0 && <button className="btn" onClick={() => go(-1)}>{ui.back}</button>}
          <button className="btn primary" onClick={() => go(1)}>{i === steps.length - 1 ? ui.done : ui.next}</button>
        </div>
      </div>
    </div>
  );
}
