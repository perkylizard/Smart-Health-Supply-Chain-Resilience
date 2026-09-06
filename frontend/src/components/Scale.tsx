import type { Severity } from "../api";

/** Days-of-stock as a physical scale: ticks at 7, 14, 30; 60 days fills the track. */
export default function Scale({ days, severity, label }: { days: number; severity: Severity; label?: string }) {
  const max = 60;
  const pct = Math.max(0, Math.min(100, (days / max) * 100));
  const sev = severity === "data_issue" ? "data_issue" : days < 7 ? "red" : days < 14 ? "amber" : "green";
  const glyph = sev === "red" ? "▲" : sev === "amber" ? "◆" : sev === "data_issue" ? "?" : "●";
  return (
    <div className="scale" role="img" aria-label={`${Math.round(days)} ${label ?? "days"}`}>
      <div className="track">
        <div className={`fill ${sev}`} style={{ width: `${pct}%` }} />
        {[7, 14, 30].map((tk) => <span key={tk} className="tick" style={{ left: `${(tk / max) * 100}%` }} />)}
      </div>
      <span className={`days ${sev}`}>{glyph} {days >= 365 ? "365+" : Math.round(days)} {label ?? "d"}</span>
    </div>
  );
}
