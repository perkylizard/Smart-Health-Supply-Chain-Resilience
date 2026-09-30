import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import { refreshRequestViews } from "./Requests";

/** Medicine given to a patient at the counter. It leaves the facility's stock at once; no patient name is ever asked for. */
const S = {
  en: { give: "Give to patient", giveRow: "Give", title: "Give medicine to a patient", hint: "Record what you hand over at the counter. Your stock goes down straight away.",
    medicine: "Medicine", qty: "Quantity given", slip: "OPD slip (optional)", slipPh: "OPD-117", patient: "Patient (optional)", pname: "Name", page: "Age", pplace: "Village or ward", pplacePh: "for example Bhabua, ward 4",
    privacy: "Seen only by this facility's staff. Never shown to other roles, sent to Gemini or used in federated learning.", onHand: "On hand", after: "After this", save: "Record", saving: "Recording",
    done: (q: string, n: string, left: string) => `Given ${q} ${n}. ${left} left.`, tooMany: (n: number) => `Only ${n} on hand. Record what you actually gave.`, failed: "That did not save. Check the connection and try again.",
    todayTitle: "Given out today", todaySub: "Medicine handed to patients at the counter, per medicine.", none: "Nothing given out yet today. Use Give on any medicine.", times: (n: number) => `${n} ${n === 1 ? "time" : "times"}`, close: "Close", another: "Record another", noneOnHand: "none on hand", recent: "Latest", yrs: "yrs", noPatient: "no patient details" },
  hi: { give: "मरीज़ को दें", giveRow: "दें", title: "मरीज़ को दवा दें", hint: "काउंटर पर जो दिया उसे दर्ज करें। आपका स्टॉक तुरंत घट जाता है।",
    medicine: "दवा", qty: "दी गई मात्रा", slip: "OPD पर्ची (वैकल्पिक)", slipPh: "OPD-117", patient: "मरीज़ (वैकल्पिक)", pname: "नाम", page: "उम्र", pplace: "गाँव या वार्ड", pplacePh: "उदाहरण भभुआ, वार्ड 4",
    privacy: "केवल इस सुविधा का स्टाफ़ देखता है। अन्य भूमिकाओं, Gemini या फ़ेडरेटेड लर्निंग को कभी नहीं भेजा जाता।", onHand: "मौजूद", after: "इसके बाद", save: "दर्ज करें", saving: "दर्ज हो रहा है",
    done: (q: string, n: string, left: string) => `${n} ${q} दिया। ${left} बचा।`, tooMany: (n: number) => `केवल ${n} मौजूद है। जितना सच में दिया वही दर्ज करें।`, failed: "सहेजा नहीं गया। कनेक्शन जाँचें और फिर कोशिश करें।",
    todayTitle: "आज दिया गया", todaySub: "काउंटर पर मरीज़ों को दी गई दवा, दवा के अनुसार।", none: "आज अभी कुछ नहीं दिया। किसी भी दवा पर दें दबाएँ।", times: (n: number) => `${n} बार`, close: "बंद करें", another: "एक और दर्ज करें", noneOnHand: "मौजूद नहीं", recent: "हाल के", yrs: "वर्ष", noPatient: "मरीज़ का विवरण नहीं" },
};
type Med = { commodity_id: string; commodity_name: string; closing: number };

export function DispenseDialog({ facilityId, stock: all, preset, children }: { facilityId: string; stock: Med[]; preset?: string; children: React.ReactNode }) {
  const { lang } = useApp(); const s = S[lang];
  // what the counter can actually give first (alphabetical), then what is out; a medicine with none on hand cannot be chosen
  const stock = [...all].sort((a, b) => Number(b.closing > 0) - Number(a.closing > 0) || a.commodity_name.localeCompare(b.commodity_name));
  const first = stock.find((x) => x.closing > 0)?.commodity_id ?? "";
  const qc = useQueryClient();
  const [med, setMed] = useState(preset ?? first);
  const [qty, setQty] = useState("1");
  const [slip, setSlip] = useState("");
  const [pname, setPname] = useState(""); const [page, setPage] = useState(""); const [pplace, setPplace] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = stock.find((x) => x.commodity_id === med);
  const onHand = Math.max(0, Math.round(m?.closing ?? 0));
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const give = useMutation({
    mutationFn: () => api.dispense(facilityId, { commodity_id: med, quantity: q, slip: slip.trim() || undefined, patient_name: pname.trim() || undefined,
      patient_age: page ? Number(page) : undefined, patient_place: pplace.trim() || undefined }),
    onSuccess: (r) => {
      setMsg({ ok: true, text: s.done(r.given.toLocaleString("en-IN"), r.commodity_name, Math.round(r.on_hand).toLocaleString("en-IN")) });
      setQty("1"); setSlip(""); setPname(""); setPage(""); setPplace("");
      // show the new stock at once, before the refresh lands
      qc.setQueryData(["facility", facilityId], (old: unknown) => {
        const o = old as { stock?: Med[] } | undefined;
        return o?.stock ? { ...o, stock: o.stock.map((x) => (x.commodity_id === r.commodity_id ? { ...x, closing: r.on_hand } : x)) } : old;
      });
      refreshRequestViews(qc); qc.invalidateQueries({ queryKey: ["dispensed", facilityId] });
    },
    onError: () => setMsg({ ok: false, text: s.failed }),
  });
  const over = q > onHand;
  return (
    <Dialog.Root onOpenChange={(o) => { if (o) { setMed(preset ?? first); setMsg(null); setQty("1"); } }}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog mdl" aria-describedby={undefined}>
          <div className="mdl-head"><span className="mdl-icon" aria-hidden>−</span><div><Dialog.Title asChild><h2>{s.title}</h2></Dialog.Title><p>{s.hint}</p></div>
            <Dialog.Close asChild><button className="mdl-x" aria-label={s.close}>×</button></Dialog.Close></div>
          <form className="mdl-body disp-form" onSubmit={(e) => { e.preventDefault(); if (q > 0 && !over) give.mutate(); }}>
            <label className="field"><span>{s.medicine}</span>
              <select className="select" value={med} onChange={(e) => { setMed(e.target.value); setMsg(null); }}>{stock.map((x) => <option key={x.commodity_id} value={x.commodity_id} disabled={x.closing <= 0}>{x.commodity_name}{x.closing <= 0 ? ` (${s.noneOnHand})` : ` · ${Math.round(x.closing).toLocaleString("en-IN")}`}</option>)}</select></label>
            <div className="disp-row">
              <label className="field"><span>{s.qty}</span><input className="input" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value.replace(/[^\d]/g, "")); setMsg(null); }} aria-invalid={over} autoFocus /></label>
              <div className="disp-quick" role="group" aria-label={s.qty}>{[1, 2, 5, 10].map((n) => <button key={n} type="button" className="chip" aria-pressed={q === n} onClick={() => setQty(String(n))}>{n}</button>)}</div>
            </div>
            <p className="disp-now"><span>{s.onHand}: <b>{onHand.toLocaleString("en-IN")}</b></span><span>{s.after}: <b className={over ? "red" : ""}>{Math.max(0, onHand - q).toLocaleString("en-IN")}</b></span></p>
            {over && <p className="disp-warn" role="alert">{s.tooMany(onHand)}</p>}
            <fieldset className="disp-patient"><legend>{s.patient}</legend>
              <div className="disp-row">
                <label className="field" style={{ flex: 2 }}><span>{s.pname}</span><input className="input" value={pname} maxLength={60} autoComplete="off" onChange={(e) => setPname(e.target.value)} /></label>
                <label className="field" style={{ flex: "0 0 96px", minWidth: 96 }}><span>{s.page}</span><input className="input" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} aria-invalid={Number(page) > 120} /></label>
              </div>
              <div className="disp-row">
                <label className="field" style={{ flex: 2 }}><span>{s.pplace}</span><input className="input" value={pplace} maxLength={80} placeholder={s.pplacePh} onChange={(e) => setPplace(e.target.value)} /></label>
                <label className="field"><span>{s.slip}</span><input className="input" value={slip} maxLength={40} placeholder={s.slipPh} onChange={(e) => setSlip(e.target.value)} /></label>
              </div>
              <p className="faint disp-privacy">{s.privacy}</p>
            </fieldset>
            {msg && <p className={msg.ok ? "saved-banner" : "disp-warn"} role="status">{msg.ok ? "✓ " : ""}{msg.text}</p>}
            <div className="mdl-foot" style={{ padding: 0, border: 0 }}>
              <Dialog.Close asChild><button type="button" className="btn">{s.close}</button></Dialog.Close>
              <button type="submit" className="btn primary" disabled={!med || q <= 0 || over || Number(page) > 120 || give.isPending}>{give.isPending ? s.saving : msg?.ok ? s.another : s.save}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function GivenToday({ facilityId, stock }: { facilityId: string; stock: Med[] }) {
  const { lang } = useApp(); const s = S[lang];
  const q = useQuery({ queryKey: ["dispensed", facilityId], queryFn: () => api.dispensed(facilityId), refetchInterval: 30_000 });
  const rows = q.data?.by_medicine ?? [];
  return (
    <div className="card given-today">
      <div className="card-head" style={{ marginBottom: 8 }}><div><h3 style={{ margin: 0 }}>{s.todayTitle}</h3><p className="faint" style={{ fontSize: "var(--t-xs)", margin: "4px 0 0" }}>{s.todaySub}</p></div></div>
      {q.data && rows.length === 0 && <p className="muted" style={{ margin: 0, fontSize: "var(--t-xs)" }}>{s.none}</p>}
      {rows.map((r) => <div key={r.commodity_id} className="req-line"><div><b>{r.commodity_name}</b><div className="faint" style={{ fontSize: 12 }}>{s.times(r.times)}</div></div><span className="qty-pill">−{r.given.toLocaleString("en-IN")}</span></div>)}
      {(q.data?.items.length ?? 0) > 0 && <><p className="gt-sub">{s.recent}</p>
        {q.data!.items.slice(0, 5).map((i, k) => <div key={k} className="gt-item"><span><b>−{i.given.toLocaleString("en-IN")}</b> {i.commodity_name}</span>
          <span className="faint">{[i.patient_name, i.patient_age != null ? `${i.patient_age} ${s.yrs}` : null, i.patient_place].filter(Boolean).join(", ") || s.noPatient}{i.slip ? ` · ${i.slip}` : ""} · {new Date(i.received * 1000).toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" })}</span></div>)}</>}
      <DispenseDialog facilityId={facilityId} stock={stock}><button className="btn primary" style={{ marginTop: 12, width: "100%" }}>− {s.give}</button></DispenseDialog>
    </div>
  );
}

export const dispenseLabels = S;
