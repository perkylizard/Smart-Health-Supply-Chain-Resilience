import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StockRequest } from "../api";
import { useApp } from "../App";

const S = {
  en: {
    request: "Request stock", requestHint: "Ask the district for a medicine. The District Health Officer approves it, then the district store sends it.",
    medicine: "Medicine", quantity: "Quantity", note: "Reason (optional)", notePh: "For example: diarrhoea cases rising this week", send: "Send request", sending: "Sending",
    sent: "Request sent. You can follow it under Deliveries.", failed: "The request did not go through. Check the quantity and try again.",
    mine: "My requests", none: "No requests yet.", inbox: "Requests from facilities", inboxHint: "PHC staff asked for these. Approving sends them to the district store's queue.",
    approve: "Approve", decline: "Decline", declineWhy: "Why decline?", declineReasons: ["Stock sent recently", "Will move stock from a nearby facility", "Quantity too high"],
    inboxEmpty: "No open requests from facilities.", units: "units",
    status: { requested: "Waiting for district approval", approved: "Approved, waiting for the district store", declined: "Declined", dispatched: "On the way", delivered: "Delivered" } as Record<string, string>,
  },
  hi: {
    request: "स्टॉक माँगें", requestHint: "ज़िले से दवा माँगें। ज़िला स्वास्थ्य अधिकारी स्वीकृति देते हैं, फिर ज़िला भंडार भेजता है।",
    medicine: "दवा", quantity: "मात्रा", note: "कारण (वैकल्पिक)", notePh: "उदाहरण: इस हफ़्ते दस्त के मामले बढ़ रहे हैं", send: "अनुरोध भेजें", sending: "भेजा जा रहा है",
    sent: "अनुरोध भेजा गया। डिलीवरी में इसे देखें।", failed: "अनुरोध नहीं गया। मात्रा जाँचें और फिर कोशिश करें।",
    mine: "मेरे अनुरोध", none: "अभी कोई अनुरोध नहीं।", inbox: "सुविधाओं के अनुरोध", inboxHint: "PHC स्टाफ ने ये माँगे हैं। स्वीकृति देने पर ये ज़िला भंडार की कतार में जाते हैं।",
    approve: "स्वीकृति दें", decline: "अस्वीकार करें", declineWhy: "अस्वीकार क्यों?", declineReasons: ["हाल ही में स्टॉक भेजा गया", "पास की सुविधा से स्टॉक भेजेंगे", "मात्रा बहुत अधिक"],
    inboxEmpty: "सुविधाओं का कोई खुला अनुरोध नहीं।", units: "इकाइयाँ",
    status: { requested: "ज़िला स्वीकृति की प्रतीक्षा", approved: "स्वीकृत, ज़िला भंडार की प्रतीक्षा", declined: "अस्वीकृत", dispatched: "रास्ते में", delivered: "पहुँच गया" } as Record<string, string>,
  },
};
const tone: Record<string, string> = { requested: "amber", approved: "teal", declined: "red", dispatched: "blue", delivered: "green" };

/** PHC side: raise a request for a medicine. `options` are the facility's own medicines, most urgent first. */
export function RequestForm({ facilityId, options, preset }: { facilityId: string; options: { id: string; name: string }[]; preset?: string }) {
  const { lang } = useApp(); const s = S[lang];
  const qc = useQueryClient();
  const [cid, setCid] = useState(preset ?? options[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({ mutationFn: () => api.createRequest({ facility_id: facilityId, commodity_id: cid, quantity: Number(qty), note: note || undefined }),
    onSuccess: () => { setQty(""); setNote(""); qc.invalidateQueries({ queryKey: ["myRequests", facilityId] }); } });
  const ok = cid && Number(qty) > 0;
  return (
    <form className="req-form" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }}>
      <p className="muted" style={{ margin: "0 0 12px" }}>{s.requestHint}</p>
      <label>{s.medicine}<select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label>{s.quantity}<input className="input" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" required /></label>
      <label>{s.note}<input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={s.notePh} /></label>
      <button className="btn primary" type="submit" disabled={!ok || m.isPending}>{m.isPending ? s.sending : s.send}</button>
      <p role="status" aria-live="polite" style={{ margin: "8px 0 0", fontSize: "var(--t-xs)", color: m.isError ? "var(--red)" : "var(--green)" }}>{m.isSuccess ? s.sent : m.isError ? s.failed : ""}</p>
    </form>
  );
}

/** PHC side: the facility's requests and where each one is. */
export function MyRequests({ facilityId }: { facilityId: string }) {
  const { lang } = useApp(); const s = S[lang];
  const q = useQuery({ queryKey: ["myRequests", facilityId], queryFn: () => api.facilityRequests(facilityId), refetchInterval: 15_000 });
  const rows = q.data?.requests ?? [];
  return (
    <section className="qsection">
      <h2>{s.mine} <span className="count">{rows.length || ""}</span></h2>
      {q.data && rows.length === 0 && <div className="quiet">{s.none}</div>}
      {rows.map((r) => <RequestCard key={r.request_id} r={r} />)}
    </section>
  );
}

function RequestCard({ r, actions }: { r: StockRequest; actions?: React.ReactNode }) {
  const { lang } = useApp(); const s = S[lang];
  return (
    <div className="tcard" style={{ cursor: "default" }}>
      <div className="tc-head">
        <div><div className="tc-title">{r.commodity_name}</div><div className="tc-sub">{r.quantity.toLocaleString("en-IN")} {s.units}{r.note ? ` · ${r.note}` : ""}</div></div>
        <div className="tc-meta"><span className={`chip ${tone[r.status]}`}>{s.status[r.status]}</span></div>
      </div>
      <div className="tc-route"><strong>{r.facility_name}</strong><span className="faint">{r.type}</span>{r.decision_reason && <span className="faint">· {r.decision_reason}</span>}</div>
      {actions && <div className="tc-actions">{actions}</div>}
    </div>
  );
}

/** District Health Officer side: open requests from the district's facilities, approve or decline with a reason. */
export function RequestsInbox({ unit, district }: { unit: string; district: string }) {
  const { lang } = useApp(); const s = S[lang];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["districtRequests", unit, district], queryFn: () => api.districtRequests(unit, district, "requested"), refetchInterval: 15_000 });
  const [asking, setAsking] = useState<string | null>(null);
  const m = useMutation({ mutationFn: ({ id, st, reason }: { id: string; st: "approved" | "declined"; reason?: string }) => api.moveRequest(id, st, reason),
    onSuccess: () => { setAsking(null); qc.invalidateQueries({ queryKey: ["districtRequests"] }); qc.invalidateQueries({ queryKey: ["indents"] }); } });
  const rows = q.data?.requests ?? [];
  return (
    <div className="card req-inbox">
      <h2 style={{ fontSize: "var(--t-lg)" }}>{s.inbox} {rows.length > 0 && <span className="chip amber" style={{ marginLeft: 8, minHeight: 24 }}>{rows.length}</span>}</h2>
      <p className="faint" style={{ margin: "4px 0 12px", fontSize: "var(--t-xs)" }}>{s.inboxHint}</p>
      {q.data && rows.length === 0 && <p className="muted" style={{ margin: 0 }}>{s.inboxEmpty}</p>}
      {rows.slice(0, 6).map((r) => <RequestCard key={r.request_id} r={r} actions={asking === r.request_id ? <>
          <span className="faint" style={{ fontSize: "var(--t-xs)" }}>{s.declineWhy}</span>
          {s.declineReasons.map((why) => <button key={why} className="btn" onClick={() => m.mutate({ id: r.request_id, st: "declined", reason: why })}>{why}</button>)}
        </> : <>
          <button className="btn primary" disabled={m.isPending} onClick={() => m.mutate({ id: r.request_id, st: "approved" })}>{s.approve}</button>
          <button className="btn" onClick={() => setAsking(r.request_id)}>{s.decline}</button>
        </>} />)}
    </div>
  );
}
