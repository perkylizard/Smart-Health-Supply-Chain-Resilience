import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";

interface Msg { me: boolean; text: string }
const ALIASES: [RegExp, string][] = [[/ors|ओआरएस|ओ आर एस/i, "ors"], [/zinc|जिंक/i, "zinc_20mg"], [/paracetamol|पैरासिटामोल/i, "paracetamol_500"], [/ifa|iron|आयरन/i, "ifa_adult"], [/amox/i, "amoxicillin_500"]];
const NUM: Record<string, number> = { ek: 1, do: 2, teen: 3, char: 4, paanch: 5, das: 10, bees: 20, tees: 30, chalis: 40, pachas: 50, sau: 100, एक: 1, दो: 2, दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, सौ: 100 };

/** Local parser for the simulated thread; Gemini voice/photo parsing replaces it when the /ai/entries routes are live. */
export function parseLocal(text: string): { commodity_id: string; quantity: number }[] {
  const out: { commodity_id: string; quantity: number }[] = [];
  for (const seg of text.split(/[,;।]| aur | और /i)) {
    const c = ALIASES.find(([re]) => re.test(seg))?.[1];
    if (!c) continue;
    const zero = /khatam|khatm|खत्म|zero|nil|nahi|नहीं/i.test(seg);
    const n = seg.match(/\d+/)?.[0];
    const word = Object.keys(NUM).find((k) => new RegExp(`\\b${k}\\b`, "i").test(seg));
    out.push({ commodity_id: c, quantity: zero ? 0 : n ? Number(n) : word ? NUM[word] : 0 });
  }
  return out;
}

export default function ChatWidget({ facilityId }: { facilityId: string }) {
  const { t } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([{ me: false, text: t.chatHint }]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ commodity_id: string; quantity: number }[] | null>(null);
  const save = useMutation({ mutationFn: (rows: { commodity_id: string; quantity: number }[]) => Promise.all(rows.map((r) => api.entry({ facility_id: facilityId, commodity_id: r.commodity_id, quantity: r.quantity, channel: "chat" }))) });
  const send = () => {
    const tx = text.trim(); if (!tx) return;
    setMsgs((m) => [...m, { me: true, text: tx }]); setText("");
    if (pending && tx === "1") { save.mutate(pending); setMsgs((m) => [...m, { me: false, text: `Saved ${pending.length} item(s). Dhanyavaad.` }]); setPending(null); return; }
    if (pending && tx === "2") { setMsgs((m) => [...m, { me: false, text: "Please send the update again." }]); setPending(null); return; }
    const rows = parseLocal(tx);
    if (!rows.length) { setMsgs((m) => [...m, { me: false, text: "I could not find a medicine name. Example: ORS ke 40 packet bache hain, zinc khatam" }]); return; }
    setPending(rows);
    setMsgs((m) => [...m, { me: false, text: rows.map((r) => `${r.commodity_id.replace(/_/g, " ")}: ${r.quantity}`).join("\n") + `\n${t.confirm}` }]);
  };
  return (
    <div>
      <div className="chat" aria-live="polite">{msgs.map((m, i) => <div key={i} className={`bubble${m.me ? " me" : ""}`} style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="ORS ke 40 packet bache hain, zinc khatam" aria-label={t.chatTitle} />
        <button className="btn primary" type="submit">{t.send}</button>
      </form>
    </div>
  );
}
