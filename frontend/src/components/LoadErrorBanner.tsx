import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "../App";

/** One error surface for every screen: if any request on the page failed, say so and offer a retry of just those requests.
 *  Without it, a failed request left the loading shimmer on screen forever. Known "not found" answers (a district with no
 *  public ledger) are handled by their screens and are not counted here. */
export default function LoadErrorBanner() {
  const { t } = useApp();
  const qc = useQueryClient();
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const count = () => setFailed(qc.getQueryCache().getAll().filter((q) => q.state.status === "error" && q.getObserversCount() > 0 && !String((q.state.error as Error | null)?.message ?? "").startsWith("404")).length);
    // cache events fire while other components render; defer the state update to the next tick so React never sees
    // this banner updating during someone else's render
    let t: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { if (t === undefined) t = setTimeout(() => { t = undefined; count(); }, 0); };
    schedule();
    const unsub = qc.getQueryCache().subscribe(schedule);
    return () => { unsub(); if (t !== undefined) clearTimeout(t); };
  }, [qc]);
  if (!failed) return null;
  const retry = async () => {
    setBusy(true);
    await qc.refetchQueries({ predicate: (q) => q.state.status === "error" && q.getObserversCount() > 0 });
    setBusy(false);
  };
  return (
    <div className="banner error" role="alert">
      <span>{t.loadFailed}</span>
      <button className="btn" onClick={retry} disabled={busy}>{busy ? t.retrying : t.retry}</button>
    </div>
  );
}
