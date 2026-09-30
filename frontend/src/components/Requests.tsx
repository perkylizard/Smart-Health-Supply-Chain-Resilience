import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StockCount, type StockRequest } from "../api";
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
/** A request or a decision changes what every role sees: refresh them all, not just the screen that acted. */
export const REQUEST_KEYS = ["myRequests", "districtRequests", "districtRequestsAll", "unitRequests", "indents", "counts", "summary", "resilience"];
export function refreshRequestViews(qc: ReturnType<typeof useQueryClient>) { for (const k of REQUEST_KEYS) qc.invalidateQueries({ queryKey: [k] }); }

const tone: Record<string, string> = { requested: "amber", approved: "teal", declined: "red", dispatched: "blue", delivered: "green" };

/** PHC side: raise a request for a medicine. `options` are the facility's own medicines, most urgent first. */
export function RequestForm({ facilityId, options, preset, hideHint = false }: { facilityId: string; options: { id: string; name: string }[]; preset?: string; hideHint?: boolean }) {
  const { lang } = useApp(); const s = S[lang];
  const qc = useQueryClient();
  const [cid, setCid] = useState(preset ?? options[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({ mutationFn: () => api.createRequest({ facility_id: facilityId, commodity_id: cid, quantity: Number(qty), note: note || undefined }),
    onSuccess: () => { setQty(""); setNote(""); refreshRequestViews(qc); } });
  const ok = cid && Number(qty) > 0;
  return (
    <form className="req-form" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }}>
      {!hideHint && <p className="muted" style={{ margin: "0 0 12px" }}>{s.requestHint}</p>}
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
  const q = useQuery({ queryKey: ["myRequests", facilityId], staleTime: 0, refetchOnMount: "always", queryFn: () => api.facilityRequests(facilityId), refetchInterval: 15_000 });
  const rows = q.data?.requests ?? [];
  return (
    <section className="card">
      <div className="card-head"><div><h2>{s.mine} {rows.length > 0 && <span className="faint">({rows.length})</span>}</h2></div></div>
      {q.isLoading && <p className="skeleton" style={{ height: 60 }}>…</p>}
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
/** Top-of-page notice on the district officer's Today screen: open facility requests, so they are never missed below the alerts. */
export function RequestsWaiting({ unit, district }: { unit: string; district: string }) {
  const { lang } = useApp(); const v = V[lang];
  const q = useQuery({ queryKey: ["districtRequests", unit, district], staleTime: 0, refetchOnMount: "always", queryFn: () => api.districtRequests(unit, district, "requested"), refetchInterval: 15_000 });
  const reqs = q.data?.requests ?? [];
  if (!reqs.length) return null;
  const names = [...new Set(reqs.map((r) => r.facility_name))];
  const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  const oldest = Math.min(...reqs.map((r) => r.received));
  const go = () => { const el = document.getElementById("req-inbox"); if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true }); };
  return (
    <section className="card req-waiting" role="status">
      <span className="req-waiting-n" aria-hidden>{reqs.length}</span>
      <div className="req-waiting-t"><b>{v.waitingTitle(reqs.length)}</b><span className="faint">{v.waitingFrom(shown, ago(oldest, lang))}</span></div>
      <button type="button" className="btn primary" onClick={go}>{v.review} ↓</button>
    </section>
  );
}

export function RequestsInbox({ unit, district }: { unit: string; district: string }) {
  const { lang } = useApp(); const s = S[lang]; const v = V[lang];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["districtRequests", unit, district], staleTime: 0, refetchOnMount: "always", queryFn: () => api.districtRequests(unit, district, "requested"), refetchInterval: 15_000 });
  const [asking, setAsking] = useState<string | null>(null);
  const [groupsShown, setGroupsShown] = useState(4);
  const [find, setFind] = useState("");
  const done = () => { setAsking(null); refreshRequestViews(qc); };
  const m = useMutation({ mutationFn: ({ id, st, reason }: { id: string; st: "approved" | "declined"; reason?: string }) => api.moveRequest(id, st, reason), onSuccess: done });
  const bulk = useMutation({ mutationFn: async (ids: string[]) => { for (const id of ids) await api.moveRequest(id, "approved"); }, onSettled: done });
  const rows = (q.data?.requests ?? []).filter((r) => !find || `${r.facility_name} ${r.commodity_name}`.toLowerCase().includes(find.toLowerCase()));
  // many requests: one group per facility (oldest waiting first), each item decided on its own or all at once
  const groups = Object.values(rows.reduce((g, r) => { (g[r.facility_id] ??= []).push(r); return g; }, {} as Record<string, StockRequest[]>))
    .map((items) => items.sort((a, b) => a.received - b.received)).sort((a, b) => a[0].received - b[0].received);
  const total = q.data?.requests.length ?? 0;
  return (
    <div className="card req-inbox" id="req-inbox" tabIndex={-1}>
      <h2 style={{ fontSize: "var(--t-lg)" }}>{s.inbox} {total > 0 && <span className="chip amber" style={{ marginLeft: 8, minHeight: 24 }}>{total}</span>}</h2>
      <p className="faint" style={{ margin: "4px 0 12px", fontSize: "var(--t-xs)" }}>{s.inboxHint}{total > 0 ? ` ${v.fromN(groups.length)}` : ""}</p>
      {total > 3 && <input className="input" style={{ minHeight: 36, marginBottom: 12 }} placeholder={v.find} value={find} onChange={(e) => setFind(e.target.value)} aria-label={v.find} />}
      {q.data && total === 0 && <p className="muted" style={{ margin: 0 }}>{s.inboxEmpty}</p>}
      {groups.slice(0, groupsShown).map((items) => (
        <div key={items[0].facility_id} className="req-group">
          <div className="req-group-head">
            <div><b>{items[0].facility_name}</b> <span className="faint">· {items[0].type} · {v.waitingFor(ago(items[0].received, lang))}</span></div>
            {items.length > 1 && <button className="btn soft" disabled={bulk.isPending} onClick={() => bulk.mutate(items.map((r) => r.request_id))}>{v.approveAll(items.length)}</button>}
          </div>
          {items.map((r) => (
            <div key={r.request_id} className="req-item">
              <div className="req-item-main"><b>{r.commodity_name}</b>{(r as StockRequest & { sample?: boolean }).sample && <span className="badge" title="Loaded at server start so every stage has an example">sample</span>}<span className="req-qty">{r.quantity.toLocaleString("en-IN")} {s.units}</span>{r.note && <span className="faint req-note">“{r.note}”</span>}</div>
              <div className="req-item-act">{asking === r.request_id ? <>
                {s.declineReasons.map((why) => <button key={why} className="btn" onClick={() => m.mutate({ id: r.request_id, st: "declined", reason: why })}>{why}</button>)}
                <button className="btn quiet" onClick={() => setAsking(null)}>{v.cancel}</button>
              </> : <>
                <button className="btn primary" disabled={m.isPending || bulk.isPending} onClick={() => m.mutate({ id: r.request_id, st: "approved" })}>{s.approve}</button>
                <button className="btn" onClick={() => setAsking(r.request_id)}>{s.decline}</button>
              </>}</div>
            </div>
          ))}
        </div>
      ))}
      {groups.length > groupsShown && <button className="btn quiet" onClick={() => setGroupsShown((n) => n + 4)}>{v.moreFac(groups.length - groupsShown)}</button>}
    </div>
  );
}

const V = {
  en: { fromN: (n: number) => `From ${n} ${n === 1 ? "facility" : "facilities"}, oldest first.`, find: "Find a facility or medicine", waitingFor: (a: string) => `waiting ${a}`, approveAll: (n: number) => `Approve all ${n}`, cancel: "Cancel", moreFac: (n: number) => `Show ${n} more facilities`,
    waitingTitle: (n: number) => `${n} ${n === 1 ? "request" : "requests"} from facilities ${n === 1 ? "is" : "are"} waiting for your approval`, waitingFrom: (names: string, a: string) => `From ${names} · oldest waiting ${a}`, review: "Review requests",
    stateTitle: "Requests from facilities, statewide", stateHint: "Each district's health officer approves or declines. Shown here so the state can see where demand is building.", district: "District", waiting: "Waiting", approved: "Approved", declined: "Declined", moving: "On the way", delivered: "Delivered", latest: "Latest requests", none: "No facility has raised a request yet.",
    dmTitle: "Requests from facilities", dmHint: "Raised by PHC staff in this district; the District Health Officer decides.",
    countsTitle: "Stock counts from facilities", countsHint: "What PHC staff reported through the Report screen. Each count replaces that medicine's stock and recomputes its alerts.", countsState: "Stock counts from facilities, statewide", when: "When", facility: "Facility", medicine: "Medicine", qty: "Count", via: "Via", noCounts: "No facility has reported a count yet.", nFacilities: (n: number, c: number) => `${c} counts from ${n} facilities`, more: (n: number) => `Show ${n} more`, chat: "message", web: "form" },
  hi: { fromN: (n: number) => `${n} सुविधाओं से, सबसे पुराना पहले।`, find: "सुविधा या दवा खोजें", waitingFor: (a: string) => `${a} से प्रतीक्षा`, approveAll: (n: number) => `सभी ${n} स्वीकृत करें`, cancel: "रद्द करें", moreFac: (n: number) => `${n} और सुविधाएँ`,
    waitingTitle: (n: number) => `सुविधाओं के ${n} अनुरोध आपकी स्वीकृति की प्रतीक्षा में हैं`, waitingFrom: (names: string, a: string) => `${names} से · सबसे पुराना ${a} से प्रतीक्षा में`, review: "अनुरोध देखें",
    stateTitle: "सुविधाओं के अनुरोध, पूरे राज्य में", stateHint: "हर ज़िले के स्वास्थ्य अधिकारी निर्णय लेते हैं। राज्य देख सके कि मांग कहाँ बढ़ रही है।", district: "ज़िला", waiting: "प्रतीक्षा", approved: "स्वीकृत", declined: "अस्वीकृत", moving: "रास्ते में", delivered: "पहुँचा", latest: "नवीनतम अनुरोध", none: "अभी किसी सुविधा ने अनुरोध नहीं किया।",
    dmTitle: "सुविधाओं के अनुरोध", dmHint: "इस ज़िले के PHC स्टाफ के अनुरोध; निर्णय ज़िला स्वास्थ्य अधिकारी का।",
    countsTitle: "सुविधाओं की स्टॉक गिनती", countsHint: "PHC स्टाफ ने रिपोर्ट स्क्रीन से जो बताया। हर गिनती उस दवा का स्टॉक बदलती है और अलर्ट फिर से गणना होते हैं।", countsState: "सुविधाओं की स्टॉक गिनती, पूरे राज्य में", when: "कब", facility: "सुविधा", medicine: "दवा", qty: "गिनती", via: "माध्यम", noCounts: "अभी किसी सुविधा ने गिनती नहीं भेजी।", nFacilities: (n: number, c: number) => `${n} सुविधाओं से ${c} गिनतियाँ`, more: (n: number) => `${n} और दिखाएँ`, chat: "संदेश", web: "फ़ॉर्म" },
};

const short = (lang: "en" | "hi"): Record<string, string> => { const v = V[lang]; return { requested: v.waiting, approved: v.approved, declined: v.declined, dispatched: v.moving, delivered: v.delivered }; };

function ago(ts: number, lang: "en" | "hi") {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  if (lang === "hi") return m < 1 ? "अभी" : m < 60 ? `${m} मिनट` : m < 1440 ? `${Math.round(m / 60)} घंटे` : `${Math.round(m / 1440)} दिन`;
  return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}

/** State officer: every request in the state by district, read-only (the district's health officer decides). */
export function StateRequests({ unit }: { unit: string }) {
  const { lang } = useApp(); const v = V[lang]; const s = S[lang];
  const q = useQuery({ queryKey: ["unitRequests", unit], staleTime: 0, refetchOnMount: "always", queryFn: () => api.unitRequests(unit), refetchInterval: 15_000 });
  const d = q.data;
  return (
    <div className="card req-inbox">
      <h2 style={{ fontSize: "var(--t-lg)" }}>{v.stateTitle} {d && d.requests.length > 0 && <span className="chip amber" style={{ marginLeft: 8, minHeight: 24 }}>{d.requests.filter((r) => r.status === "requested").length}</span>}</h2>
      <p className="faint" style={{ margin: "4px 0 12px", fontSize: "var(--t-xs)" }}>{v.stateHint}</p>
      {d && d.requests.length === 0 && <p className="muted" style={{ margin: 0 }}>{v.none}</p>}
      {d && d.by_district.length > 0 && (
        <table className="table" style={{ marginBottom: 12 }}><thead><tr><th>{v.district}</th><th className="num">{v.waiting}</th><th className="num">{v.approved}</th><th className="num">{v.moving}</th><th className="num">{v.delivered}</th><th className="num">{v.declined}</th></tr></thead>
          <tbody>{d.by_district.slice(0, 10).map((x) => <tr key={x.district}><td>{x.district}</td><td className="num" style={x.requested ? { color: "var(--amber)", fontWeight: 600 } : undefined}>{x.requested}</td><td className="num">{x.approved}</td><td className="num">{x.dispatched}</td><td className="num">{x.delivered}</td><td className="num">{x.declined}</td></tr>)}</tbody></table>
      )}
      {d && d.requests.length > 0 && <><h3 className="req-sub">{v.latest}</h3>{d.requests.slice(0, 5).map((r) => <StatusLine key={r.request_id} r={r} s={s} lang={lang} showDistrict />)}</>}
    </div>
  );
}

/** District Magistrate: the district's requests and where each stands, read-only. */
export function DistrictRequestsView({ unit, district }: { unit: string; district: string }) {
  const { lang } = useApp(); const v = V[lang]; const s = S[lang];
  const q = useQuery({ queryKey: ["districtRequestsAll", unit, district], staleTime: 0, refetchOnMount: "always", queryFn: () => api.districtRequests(unit, district), refetchInterval: 15_000 });
  const rows = q.data?.requests ?? [];
  const n = (st: string) => rows.filter((r) => r.status === st).length;
  return (
    <div className="card req-inbox">
      <h2 style={{ fontSize: "var(--t-lg)" }}>{v.dmTitle}</h2>
      <p className="faint" style={{ margin: "4px 0 12px", fontSize: "var(--t-xs)" }}>{v.dmHint}</p>
      {q.data && rows.length === 0 && <p className="muted" style={{ margin: 0 }}>{v.none}</p>}
      {rows.length > 0 && <div className="req-counts">{(["requested", "approved", "dispatched", "delivered", "declined"] as const).map((st) => <div key={st} title={s.status[st]}><span className="big">{n(st)}</span><span className="faint">{short(lang)[st]}</span></div>)}</div>}
      {rows.slice(0, 6).map((r) => <StatusLine key={r.request_id} r={r} s={s} lang={lang} />)}
    </div>
  );
}

function StatusLine({ r, s, lang, showDistrict }: { r: StockRequest; s: typeof S.en; lang: "en" | "hi"; showDistrict?: boolean }) {
  return (
    <div className="req-line">
      <div><b>{r.commodity_name}</b> {(r as StockRequest & { sample?: boolean }).sample && <span className="badge" title="Loaded at server start so every stage has an example">sample</span>} <span className="req-qty">{r.quantity.toLocaleString("en-IN")}</span><div className="faint" style={{ fontSize: 12 }}>{r.facility_name}{showDistrict ? ` · ${r.district}` : ""} · {ago(r.received, lang)}{r.decision_reason ? ` · ${r.decision_reason}` : ""}</div></div>
      <span className={`chip ${tone[r.status]} nowrap`} style={{ minHeight: 24 }} title={s.status[r.status]}>{short(lang)[r.status]}</span>
    </div>
  );
}

/** Count history: what PHC staff reported, newest first. District view, or statewide with a per-district summary. */
export function CountHistory({ unit, district }: { unit: string; district?: string }) {
  const { lang } = useApp(); const v = V[lang];
  type Counts = { counts: StockCount[]; total: number; facilities?: number; by_district?: { district: string; counts: number; facilities: number; latest: number }[] };
  const q = useQuery<Counts>({ queryKey: ["counts", unit, district ?? "*"], staleTime: 0, refetchOnMount: "always", queryFn: () => (district ? api.districtCounts(unit, district) : api.unitCounts(unit)) as Promise<Counts>, refetchInterval: 15_000 });
  const [shown, setShown] = useState(8);
  const rows = q.data?.counts ?? [];
  const byD = q.data?.by_district;
  return (
    <div className="card req-inbox">
      <h2 style={{ fontSize: "var(--t-lg)" }}>{district ? v.countsTitle : v.countsState}</h2>
      <p className="faint" style={{ margin: "4px 0 12px", fontSize: "var(--t-xs)" }}>{v.countsHint}{q.data && q.data.total > 0 && district ? ` ${v.nFacilities(q.data.facilities ?? 0, q.data.total)}.` : ""}</p>
      {q.data && rows.length === 0 && <p className="muted" style={{ margin: 0 }}>{v.noCounts}</p>}
      {byD && byD.length > 0 && <p className="faint" style={{ fontSize: 12, margin: "0 0 8px" }}>{byD.slice(0, 6).map((x) => `${x.district} ${x.counts}`).join(" · ")}</p>}
      {rows.length > 0 && (
        <table className="table"><thead><tr><th>{v.when}</th><th>{v.facility}</th><th>{v.medicine}</th><th className="num">{v.qty}</th></tr></thead>
          <tbody>{rows.slice(0, shown).map((c) => <tr key={c.entry_id}><td className="nowrap faint">{ago(c.received, lang)}</td><td>{c.facility_name}{district ? "" : <span className="faint"> · {c.district}</span>}</td><td>{c.commodity_name}{(c as StockCount & { sample?: boolean }).sample && <span className="badge" style={{ marginLeft: 6 }}>sample</span>}</td><td className="num">{Math.round(c.quantity).toLocaleString("en-IN")}</td></tr>)}</tbody></table>
      )}
      {rows.length > shown && <button className="btn quiet" onClick={() => setShown((n) => n + 20)}>{v.more(Math.min(20, rows.length - shown))}</button>}
    </div>
  );
}

/** The request form in the design's modal pattern: icon tile header, body, slate footer. `children` is the trigger. */
export function RequestDialog({ facilityId, facilityName, options, preset, children }: { facilityId: string; facilityName?: string; options: { id: string; name: string }[]; preset?: string; children: React.ReactNode }) {
  const { lang } = useApp(); const s = S[lang];
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog mdl" aria-describedby={undefined}>
          <div className="mdl-head">
            <span className="mdl-icon" aria-hidden>+</span>
            <div><Dialog.Title asChild><h2>{s.request}</h2></Dialog.Title><p>{facilityName ? `${facilityName} · ` : ""}{s.requestHint}</p></div>
            <Dialog.Close asChild><button className="mdl-x" aria-label="Close">×</button></Dialog.Close>
          </div>
          <div className="mdl-body"><RequestForm key={preset ?? "any"} facilityId={facilityId} options={options} preset={preset} hideHint /></div>
          <div className="mdl-foot"><Dialog.Close asChild><button className="btn">{lang === "hi" ? "बंद करें" : "Close"}</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
