/** Provenance badge: every number carries where it came from. */
export default function Badge({ kind, title }: { kind: "real" | "simulated" | "forecast" | "osm" | "computed" | "ai"; title?: string }) {
  const text = { real: "HMIS real", simulated: "simulated", forecast: "forecast", osm: "OpenStreetMap", computed: "computed", ai: "Gemini" }[kind];
  return <span className="badge" title={title ?? text}>{text}</span>;
}
