export default function Sparkline({ values, label, delta, badge }: { values: number[]; label: string; delta: number | null | undefined; badge: React.ReactNode }) {
  const w = 160, h = 36;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ");
  const d = delta == null ? "" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`;
  return (
    <div className="spark">
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>{label}</span><span className={delta != null && delta > 0.15 ? "chip amber" : "faint"} style={{ fontSize: "var(--t-xs)" }}>{d}</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden><polyline fill="none" stroke="var(--teal)" strokeWidth="2" points={pts} /></svg>
      </div>
      <div>{badge}</div>
    </div>
  );
}
