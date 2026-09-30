import { refreshRequestViews } from "./Requests";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import Badge from "./Badge";
import { sB } from "../stringsB";
import { audioToWav, photoToJpeg } from "../media";

type Row = { commodity_id: string; quantity: number; options?: string[]; give?: boolean };
type Status = "pending" | "saving" | "saved" | "error" | "edited" | "replaced";
type Msg =
  | { id: number; kind: "me"; text: string }
  | { id: number; kind: "note"; text: string }
  | { id: number; kind: "parsed"; source: string; rows: Row[]; status: Status; via?: "text" | "photo" | "voice" | "ai"; transcript?: string };

/** Photo of the register and voice notes are read by Gemini (/ai/entries/parse); typing uses the on-device parser. */
const LIVE_MEDIA = true;
/** Formula words staff actually type, the catalogue products each can mean, and the product used when no list is loaded. */
const FORMULAS: [RegExp, RegExp, string][] = [
  [/\bors\b|ओआरएस|ओ आर एस/i, /\bors\b/i, "ors"],
  [/zinc|जिंक/i, /zinc/i, "zinc_20mg"],
  [/paracetamol|पैरासिटामोल/i, /paracetamol/i, "paracetamol_500"],
  [/\bifa\b|iron|आयरन/i, /\bifa\b|iron/i, "ifa_adult"],
  [/amox/i, /amox/i, "amoxicillin_500"],
];
const NUM: Record<string, number> = { ek: 1, do: 2, teen: 3, char: 4, paanch: 5, das: 10, bees: 20, tees: 30, chalis: 40, pachas: 50, sau: 100, एक: 1, दो: 2, दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, सौ: 100 };

const ZERO = /\b(khatam|khatm|khtm|khatma|khatam ho gaya|finished|over|nil|none|out|zero|nahi|nahin|nhi)\b|खत्म|ख़त्म|समाप्त|नहीं|शून्य/i;
const STOP = new Set(["tablet", "tablets", "capsule", "injection", "syrup", "solution", "vaccine", "sachet", "kits", "kit", "adult", "child", "blue", "pink", "red", "with", "and"]);

/** Words that name a medicine: the first distinctive word of its catalogue name and of its id (amlodipine, metformin, ors). */
function keysFor(id: string, name: string): string[] {
  const words = `${name} ${id.replace(/_/g, " ")}`.toLowerCase().replace(/[()/,.-]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w) && !/^\d*mg$|^ml$|^iu$/.test(w));
  return [...new Set(words.slice(0, 2))];
}

export type ParsedRow = { commodity_id: string; quantity: number; options?: string[]; give?: boolean };
/** "ORS 2 diye", "2 given", "दो दिए": medicine handed to a patient, which lowers the stock, not a count of what is left */
const GIVE = /\b(diya|diye|dia|diyi|de diya|de diye|given|gave|dispensed|issued)\b|दिया|दिए|दी\b/i;

/** On-device parser. A formula word ("zinc", "IFA", "IV fluid") can mean several products in the facility's list: other words in
 *  the line (a dose like 20 mg or 0.5 ml, a form like syrup, a variant like blue or junior) narrow it; if several still fit, the
 *  row carries them as options and the read-back asks "Which one?" instead of guessing. */
export function parseLocal(text: string, names: Record<string, string> = {}): ParsedRow[] {
  const out: ParsedRow[] = [];
  const cat = Object.entries(names).map(([id, name]) => ({ id, name: name.toLowerCase(), keys: keysFor(id, name) }));
  let waiting: { id: string; options?: string[] } | undefined;  // "Amlodipine 5 mg tablet, khtm": a quantity after a comma belongs to the medicine before it
  for (const seg of text.split(/[,;।\n]| aur | और | and /i)) {
    const low = seg.toLowerCase();
    const tokens = low.split(/[^a-z\u0900-\u097f]+/).filter((w) => w.length >= 3);
    let cands: string[] = [];
    const f = FORMULAS.find(([re]) => re.test(seg));
    if (f) cands = cat.length ? cat.filter((m) => f[1].test(m.name) || f[1].test(m.id.replace(/_/g, " "))).map((m) => m.id) : [f[2]];
    if (!cands.length && cat.length)
      cands = cat.filter((m) => m.keys.some((k) => tokens.some((w) => (w.length >= 5 ? k.startsWith(w.slice(0, 5)) : w === k) || low.includes(k)))).map((m) => m.id);
    let pick: { id: string; options?: string[] } | undefined;
    if (cands.length === 1) pick = { id: cands[0] };
    else if (cands.length > 1) {
      const dose = [...low.matchAll(/(\d+(?:\.\d+)?)\s*(mg|ml|iu|mcg)\b/g)].map((m) => m[1] + " " + m[2]);
      const score = (id: string) => { const n = names[id].toLowerCase(); return tokens.filter((w) => !ZERO.test(w) && !(w in NUM) && !(f && f[0].test(w)) && n.includes(w)).length + dose.filter((d) => n.includes(d) || n.includes(d.replace(" ", ""))).length * 2; };
      const scored = cands.map((id) => [id, score(id)] as const).sort((a, b) => b[1] - a[1]);
      const top = scored.filter(([, v]) => v === scored[0][1]);
      pick = top.length === 1 && scored[0][1] > 0 ? { id: top[0][0] } : { id: "", options: top.map(([id]) => id) };
    }
    const named = !!pick;
    const target = pick ?? waiting;
    if (!target) continue;
    const zero = ZERO.test(seg);
    const nums = seg.replace(/\d+(?:\.\d+)?\s*(mg|ml|iu|mcg)\b/gi, " ").match(/\d+/g);  // "Amlodipine 5 mg, 40 left" is 40, not 5
    const n = nums?.[nums.length - 1];
    const word = Object.keys(NUM).find((k) => (/^[a-z]+$/i.test(k) ? new RegExp(`\\b${k}\\b`, "i") : new RegExp(k)).test(seg));
    if (!zero && !n && !word) { waiting = named ? target : waiting; continue; }  // a medicine without a quantity is not a count (yet)
    const give = GIVE.test(seg) && !zero;
    out.push({ commodity_id: target.id, quantity: zero ? 0 : n ? Number(n) : NUM[word!], ...(target.options ? { options: target.options } : {}), ...(give ? { give: true } : {}) });
    waiting = undefined;
  }
  return out;
}

const MW = {
  en: { readingPhoto: "Reading the register photo…", listening: "Recording… tap Stop when done", stop: "Stop", readingVoice: "Listening to the voice note…", readingText: "Reading your message with Gemini…",
    heard: "Heard", saw: "Read from the photo", unclear: "Could not read", none: "No medicine from your list was found. Try a clearer photo, or type it.",
    failed: "Could not read that. Check the connection, or type the stock instead.", noMic: "Microphone not available. Allow it in the browser, or type instead.",
    now: "now", was: "was", which: (n: number) => `Which one? ${n} products match`, givenLbl: "given to a patient", choose: "Choose the product", asking: "Waiting for microphone permission… allow it in the browser prompt.", byAi: "Read by Gemini; check each line before saving", mediaNote: "Photo and voice are read by Gemini; you confirm before anything is saved." },
  hi: { readingPhoto: "रजिस्टर की फ़ोटो पढ़ी जा रही है…", listening: "रिकॉर्ड हो रहा है… पूरा होने पर रोकें दबाएँ", stop: "रोकें", readingVoice: "वॉइस नोट सुना जा रहा है…", readingText: "Gemini आपका संदेश पढ़ रहा है…",
    heard: "सुना", saw: "फ़ोटो से पढ़ा", unclear: "पढ़ा नहीं जा सका", none: "आपकी सूची की कोई दवा नहीं मिली। साफ़ फ़ोटो लें, या टाइप करें।",
    failed: "पढ़ा नहीं जा सका। कनेक्शन जाँचें, या स्टॉक टाइप करें।", noMic: "माइक्रोफ़ोन उपलब्ध नहीं। ब्राउज़र में अनुमति दें, या टाइप करें।",
    now: "अब", was: "पहले", which: (n: number) => `कौन सा? ${n} उत्पाद मिलते हैं`, givenLbl: "मरीज़ को दिया", choose: "उत्पाद चुनें", asking: "माइक्रोफ़ोन अनुमति की प्रतीक्षा… ब्राउज़र में अनुमति दें।", byAi: "Gemini ने पढ़ा; सहेजने से पहले हर पंक्ति जाँचें", mediaNote: "फ़ोटो और आवाज़ Gemini पढ़ता है; सहेजने से पहले आप पुष्टि करते हैं।" },
};

export default function ChatWidget({ facilityId, names = {}, onHand = {}, withHeader = false }: { facilityId: string; names?: Record<string, string>; onHand?: Record<string, number>; withHeader?: boolean }) {
  const { t, lang } = useApp();
  const b = sB[lang];
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [text, setText] = useState("");
  const nextId = useRef(1);
  const input = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const label = (id: string) => names[id] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const mw = MW[lang];
  const [busy, setBusy] = useState<null | "photo" | "voice" | "text">(null);
  const [recording, setRecording] = useState(false);
  const [asking, setAsking] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const note = (text: string) => setMsgs((m) => [...m, { id: nextId.current++, kind: "note", text }]);
  /** "now 40 (was 2, +38)": a report states what is on hand, so it can move stock up or down */
  const gave = (id: string, q: number) => { const w = onHand[id]; return <span className="faint report-was"> ({mw.givenLbl}{w != null ? `; ${Math.round(w).toLocaleString("en-IN")} → ${Math.max(0, Math.round(w - q)).toLocaleString("en-IN")}` : ""})</span>; };
  const change = (id: string, q: number) => { const w = onHand[id]; if (w == null) return null; const d = Math.round(q - w); return <span className="faint report-was"> ({mw.was} {Math.round(w).toLocaleString("en-IN")}{d !== 0 ? `, ${d > 0 ? "+" : ""}${d.toLocaleString("en-IN")}` : ""})</span>; };
  const readMedia = async (kind: "photo" | "voice", payload: Promise<{ data: string; mime: string }>) => {
    setBusy(kind);
    try {
      const { data, mime } = await payload;
      const r = await api.parseMedia({ facility_id: facilityId, kind, mime, data, lang });
      const rows = r.items.map((i) => ({ commodity_id: i.commodity_id, quantity: i.quantity }));
      setMsgs((m) => [...m.map((x) => (x.kind === "parsed" && x.status === "pending" ? { ...x, status: "replaced" as Status } : x)),
        { id: nextId.current++, kind: "me", text: kind === "photo" ? `📷 ${t.photoRegister}` : `🎙 ${t.voiceNote}` },
        rows.length ? { id: nextId.current++, kind: "parsed", source: r.transcript, rows, status: "pending", via: kind, transcript: [r.transcript, r.unclear ? `${mw.unclear}: ${r.unclear}` : ""].filter(Boolean).join(" · ") }
          : { id: nextId.current++, kind: "note", text: mw.none }]);
    } catch { note(mw.failed); } finally { setBusy(null); }
  };
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readMedia("photo", photoToJpeg(f)); };
  const toggleVoice = async () => {
    if (recording) { rec.current?.stop(); return; }
    try {
      setAsking(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).finally(() => setAsking(false));
      const chunks: Blob[] = []; const r = new MediaRecorder(stream); rec.current = r;
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((tr) => tr.stop()); setRecording(false); readMedia("voice", audioToWav(new Blob(chunks, { type: r.mimeType }))); };
      r.start(); setRecording(true);
      setTimeout(() => { if (r.state === "recording") r.stop(); }, 30_000);
    } catch { note(mw.noMic); }
  };
  /** "Which one?": the staff member picks the product a formula word meant */
  const pickRow = (msgId: number, i: number, id: string) => setMsgs((ms) => ms.map((x) => (x.id === msgId && x.kind === "parsed" ? { ...x, rows: x.rows.map((r, j) => (j === i ? { commodity_id: id, quantity: r.quantity } : r)) } : x)));
  const setStatus = (id: number, status: Status) => setMsgs((m) => m.map((x) => (x.id === id && x.kind === "parsed" ? { ...x, status } : x)));

  const save = useMutation({
    // a count sets what is on the shelf; a "given" line lowers it (and can never exceed what is on hand)
    mutationFn: ({ rows }: { id: number; rows: Row[] }) => Promise.all(rows.map((r) => r.give
      ? api.dispense(facilityId, { commodity_id: r.commodity_id, quantity: r.quantity })
      : api.entry({ facility_id: facilityId, commodity_id: r.commodity_id, quantity: r.quantity, channel: "chat" }))),
    onMutate: ({ id }) => setStatus(id, "saving"),
    onSuccess: (_d, { id, rows }) => { setStatus(id, "saved"); setLastSaved(rows.length); refreshRequestViews(qc); qc.invalidateQueries({ queryKey: ["facility", facilityId] }); qc.invalidateQueries({ queryKey: ["resilience"] }); qc.invalidateQueries({ queryKey: ["dispensed", facilityId] }); },
    onError: (_e, { id }) => setStatus(id, "error"),
  });

  useEffect(() => { const el = thread.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const send = () => {
    const tx = text.trim(); if (!tx) return;
    const rows = parseLocal(tx, names);
    const me: Msg = { id: nextId.current++, kind: "me", text: tx };
    setText("");
    if (rows.length) {
      const reply: Msg = { id: nextId.current++, kind: "parsed", source: tx, rows, status: "pending" };
      setMsgs((m) => [...m.map((x) => (x.kind === "parsed" && x.status === "pending" ? { ...x, status: "replaced" as Status } : x)), me, reply]);
      return;
    }
    // the on-device parser found nothing: Gemini reads the line against this facility's medicines; still confirmed before saving
    setMsgs((m) => [...m.map((x) => (x.kind === "parsed" && x.status === "pending" ? { ...x, status: "replaced" as Status } : x)), me]);
    setBusy("text");
    api.parseMedia({ facility_id: facilityId, kind: "text", text: tx, lang })
      .then((r) => { const got = r.items.map((i) => ({ commodity_id: i.commodity_id, quantity: i.quantity }));
        setMsgs((m) => [...m, got.length ? { id: nextId.current++, kind: "parsed", source: tx, rows: got, status: "pending", via: "ai" } as Msg : { id: nextId.current++, kind: "note", text: t.notFound }]); })
      .catch(() => note(t.notFound))
      .finally(() => setBusy(null));
  };
  const edit = (m: Extract<Msg, { kind: "parsed" }>) => { setText(m.source); setStatus(m.id, "edited"); input.current?.focus(); };
  const fill = (ex: string) => { setText(ex); input.current?.focus(); };

  const live = parseLocal(text, names);
  const card = (
      <div className="report-card">
        {withHeader && <header className="report-head"><h2>{t.reportTitle}</h2><p className="muted">{t.reportHint}</p></header>}
        <div className="report-thread" ref={thread} role="log" aria-live="polite" aria-label={t.reportTitle}>
          {msgs.length === 0 && (
            <div className="report-empty">
              <p className="faint">{t.reportTry}</p>
              <div className="report-examples">{t.reportExamples.map((ex) => <button key={ex} type="button" className="chip" onClick={() => fill(ex)}>{ex}</button>)}</div>
            </div>
          )}
          {busy && <div className="report-bubble faint" role="status"><span className="spin" aria-hidden /> {busy === "photo" ? mw.readingPhoto : busy === "voice" ? mw.readingVoice : mw.readingText}</div>}
          {msgs.map((m) => {
            if (m.kind === "me") return <div key={m.id} className="report-bubble me">{m.text}</div>;
            if (m.kind === "note") return <div key={m.id} className="report-bubble">{m.text}</div>;
            const done = m.status === "saved";
            return (
              <div key={m.id} className={`report-confirm${m.status === "edited" || m.status === "replaced" ? " is-closed" : ""}`}>
                <p className="report-confirm-title">{t.readBack}</p>
                {m.via && m.via !== "text" && m.via !== "ai" && m.transcript && <p className="faint report-heard">{m.via === "voice" ? mw.heard : mw.saw}: “{m.transcript}”</p>}
                <ul>{m.rows.map((r, i) => <li key={i}>{r.options && !r.commodity_id ? (
                  <label className="report-which"><span>{mw.which(r.options.length)}</span>
                    <select className="select" value="" onChange={(e) => pickRow(m.id, i, e.target.value)} aria-label={mw.which(r.options.length)}>
                      <option value="" disabled>{mw.choose}</option>
                      {r.options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
                    </select></label>
                ) : <span>{label(r.commodity_id)}</span>}<strong>{r.give ? <>−{r.quantity.toLocaleString("en-IN")}{r.commodity_id && gave(r.commodity_id, r.quantity)}</> : <>{r.quantity.toLocaleString("en-IN")}{r.quantity === 0 && <span className="faint"> ({t.finished})</span>}{r.commodity_id && change(r.commodity_id, r.quantity)}</>}</strong></li>)}</ul>
                {(m.status === "pending" || m.status === "saving" || m.status === "error") && (
                  <div className="report-confirm-actions">
                    <button type="button" className="btn primary" disabled={m.status === "saving" || m.rows.some((r) => !r.commodity_id)} onClick={() => save.mutate({ id: m.id, rows: m.rows })}>{m.status === "saving" ? t.saving : t.confirmSave}</button>
                    <button type="button" className="btn" disabled={m.status === "saving"} onClick={() => edit(m)}>{t.edit}</button>
                  </div>
                )}
                {m.status === "error" && <p className="report-status error" role="alert">{t.saveFailed}</p>}
                {done && <p className="report-status saved">{t.savedN.replace("{n}", String(m.rows.length))} {m.via && m.via !== "text" ? <Badge kind="ai" title={mw.byAi} /> : <Badge kind="computed" title={t.localParser} />}</p>}
                {m.status === "edited" && <p className="report-status faint">{t.editing}</p>}
                {m.status === "replaced" && <p className="report-status faint">{t.replaced}</p>}
              </div>
            );
          })}
        </div>
        <form className="report-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="report-compose-row">
            <label htmlFor={`report-input-${facilityId}`} className="sr-only-report">{t.reportField}</label>
            <input id={`report-input-${facilityId}`} ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="ORS ke 40 packet bache hain, Zinc 20 mg khatam" autoComplete="off" />
            <button className="btn primary" type="submit" disabled={!text.trim() || !!busy}>{t.send}</button>
          </div>
          <div className="report-media">
            <span title={LIVE_MEDIA ? undefined : t.liveOnly}>
              <button type="button" className="btn" disabled={!LIVE_MEDIA || !!busy || recording} onClick={() => photo.current?.click()} aria-describedby={`report-live-${facilityId}`}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                {t.photoRegister}
              </button>
            </span>
            <input ref={photo} type="file" accept="image/*" hidden disabled={!LIVE_MEDIA} aria-label={t.photoRegister} onChange={onPhoto} />
            <span title={LIVE_MEDIA ? undefined : t.liveOnly}>
              <button type="button" className={`btn${recording ? " rose" : ""}`} disabled={!LIVE_MEDIA || !!busy} onClick={toggleVoice} aria-pressed={recording} aria-describedby={`report-live-${facilityId}`}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                {recording ? mw.stop : t.voiceNote}
              </button>
            </span>
          </div>
          <p id={`report-live-${facilityId}`} className="report-live faint" role={recording ? "status" : undefined}>{recording ? mw.listening : asking ? mw.asking : mw.mediaNote}</p>
        </form>
      </div>
  );
  if (!withHeader) return card;
  return (
    <div>
      {lastSaved != null && <div className="saved-banner" role="status">✓ {b.savedBanner(lastSaved)}</div>}
      {(
        <div className="report-split">
          {card}
          <aside className="parse-preview" aria-live="polite">
            <h3><span>{b.preview}</span>{live.length > 0 && <span className="status-badge green">{b.detected(live.length)}</span>}</h3>
            {live.length === 0 ? <p className="empty">{b.previewEmpty}</p> : (
              <ul>{live.map((r, i) => <li key={i}><span>{r.options && !r.commodity_id ? mw.which(r.options.length) : label(r.commodity_id)}</span><b>{r.give ? <>−{r.quantity.toLocaleString("en-IN")}{r.commodity_id && gave(r.commodity_id, r.quantity)}</> : <>{mw.now} {r.quantity.toLocaleString("en-IN")}{r.quantity === 0 && <span className="faint"> ({t.finished})</span>}{r.commodity_id && change(r.commodity_id, r.quantity)}</>}</b></li>)}</ul>
            )}
            <p className="faint" style={{ margin: "10px 0 0", fontSize: 11 }}><Badge kind="computed" title={t.localParser} /> {t.localParser}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
