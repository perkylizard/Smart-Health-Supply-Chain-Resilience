import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "../App";

/** A calm, specific note while a screen's first data is loading. Shows only after 0.7 s (fast loads never flash),
 *  says what is being done, rotates gently, admits a cold start after 8 s, and fades out the moment data arrives.
 *  Background refreshes of data already on screen never trigger it. No progress bar (product rule). */
type Say = (d: string, s: string) => string;
const EN: Record<string, Say> = {
  summary: (d) => `Reading ${d}'s facilities and stock…`,
  resilience: () => "Checking what runs out before the next delivery…",
  transfers: () => "Matching surplus to shortage nearby…",
  briefing: () => "Gemini is writing this morning's briefing…",
  brief: () => "Gemini is writing the weekly brief…",
  districts: (_d, s) => `Scoring every district in ${s}…`,
  dots: (d) => `Placing ${d}'s facilities on the map…`,
  facility: () => "Opening the facility's stock and beds…",
  indents: () => "Building the district store's queue…",
  warehouse: () => "Reading the store's HMIS ledger…",
  fedReplay: () => "Loading the federated learning rounds…",
  careTotals: () => "Counting beds and staff…",
  national: () => "Reading every state's HMIS ledger…",
};
const HI: Record<string, Say> = {
  summary: (d) => `${d} की सुविधाएँ और स्टॉक पढ़े जा रहे हैं…`,
  resilience: () => "देखा जा रहा है कि अगली डिलीवरी से पहले क्या खत्म होगा…",
  transfers: () => "पास के अधिशेष को कमी से मिलाया जा रहा है…",
  briefing: () => "Gemini आज सुबह का ब्रीफ़िंग लिख रहा है…",
  brief: () => "Gemini साप्ताहिक ब्रीफ़ लिख रहा है…",
  districts: (_d, s) => `${s} के हर ज़िले का स्कोर निकाला जा रहा है…`,
  dots: (d) => `${d} की सुविधाएँ नक्शे पर रखी जा रही हैं…`,
  facility: () => "सुविधा का स्टॉक और बिस्तर खोले जा रहे हैं…",
  indents: () => "ज़िला भंडार की कतार बनाई जा रही है…",
  warehouse: () => "भंडार का HMIS लेजर पढ़ा जा रहा है…",
  fedReplay: () => "फ़ेडरेटेड लर्निंग के राउंड लोड हो रहे हैं…",
  careTotals: () => "बिस्तर और स्टाफ़ गिने जा रहे हैं…",
  national: () => "हर राज्य का HMIS लेजर पढ़ा जा रहा है…",
};
const GENERIC = { en: "Loading the latest figures…", hi: "नवीनतम आंकड़े लोड हो रहे हैं…" };
const WAKE = { en: "Waking the server after an update. This happens once.", hi: "अपडेट के बाद सर्वर शुरू हो रहा है। यह केवल एक बार होता है।" };
const SHOW_AFTER = 700, ROTATE = 2600, WAKE_AFTER = 8000;

export default function LoadingNote() {
  const qc = useQueryClient();
  const { lang, district, unit } = useApp();
  const [keys, setKeys] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [tick, setTick] = useState(0);
  const since = useRef<number | null>(null);

  // first loads only: a query that is fetching and has never had data
  useEffect(() => {
    const cache = qc.getQueryCache();
    const read = () => setKeys(cache.getAll().filter((q) => q.state.fetchStatus === "fetching" && q.state.data === undefined).map((q) => String(q.queryKey[0])));
    read();
    return cache.subscribe(read);
  }, [qc]);

  const busy = keys.length > 0;
  useEffect(() => {
    if (busy) {
      setLeaving(false);
      if (since.current == null) since.current = Date.now();
      const id = setTimeout(() => setShown(true), SHOW_AFTER);
      return () => clearTimeout(id);
    }
    since.current = null;
    if (!shown) return;
    setLeaving(true);  // fade out, then unmount
    const id = setTimeout(() => { setShown(false); setLeaving(false); }, 260);
    return () => clearTimeout(id);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!shown || leaving) return; const id = setInterval(() => setTick((n) => n + 1), ROTATE); return () => clearInterval(id); }, [shown, leaving]);

  if (!shown) return null;
  const say = lang === "hi" ? HI : EN;
  const stateName = (qc.getQueryData<{ units: { unit_id: string; unit_name: string }[] }>(["units"])?.units.find((u) => u.unit_id === unit)?.unit_name) ?? unit;
  const lines = [...new Set(keys.filter((k) => say[k]).map((k) => say[k](district, stateName)))];
  const waited = since.current != null && Date.now() - since.current > WAKE_AFTER;
  const pool = waited ? [WAKE[lang], ...lines] : lines.length ? lines : [GENERIC[lang]];
  const text = pool[tick % pool.length];
  return (
    <div className={`loading-note${leaving ? " out" : ""}`} role="status" aria-live="polite" aria-label={lang === "hi" ? "लोड हो रहा है" : "Loading"}>
      <span className="ln-dots" aria-hidden><i /><i /><i /></span>
      <span key={text} className="ln-text">{text}</span>
    </div>
  );
}
