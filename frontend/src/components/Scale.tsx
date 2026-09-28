import type { Severity } from "../api";
import { useApp } from "../App";

/** Days of stock as a plain statement: a coloured figure and what it means. No bar, no scale. */
export default function Scale({ days, severity, label }: { days: number; severity: Severity; label?: string }) {
  const { t } = useApp();
  const sev = severity === "data_issue" ? "data_issue" : days < 7 ? "red" : days < 14 ? "amber" : "green";
  const n = days >= 365 ? "365+" : String(Math.round(days));
  const note = sev === "data_issue" ? t.stockCheck : days < 1 ? t.stockOut : sev === "red" ? t.stockUnder7 : sev === "amber" ? t.stockUnder14 : t.stockOk;
  return (
    <div className={`stock ${sev}`} role="img" aria-label={`${n} ${label ?? t.days}, ${note}`}>
      <span className="stock-n">{n}<span className="stock-unit"> {label ?? t.days}</span></span>
      <span className="stock-note">{note}</span>
    </div>
  );
}
