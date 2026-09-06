const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export type Severity = "red" | "amber" | "watch" | "ok" | "data_issue";
export interface Unit { unit_id: string; unit_name: string; kind: string; state: string; is_hero: number }
export interface Scenario { name: string; intensity: number; updated: number }
export interface Alert {
  facility_id: string; facility_name: string; type: string; commodity_id: string; commodity_name: string; category: string; district: string;
  closing: number; demand: number; weekly_demand_p90: number; days_of_stock: number; lead_days: number; severity: Severity; alert: boolean;
  cause: string; cause_detail: string; data_issue: boolean; low_demand?: boolean; lat: number; lon: number; source: string;
}
export interface Score { score: number; median_days_of_stock: number; share_under_14d: number; staffing_gap: number; transfer_latency_days: number; reporting_share: number }
export interface Summary {
  unit_id: string; district: string; scenario: Scenario; counts: Partial<Record<Severity, number>>; facilities: number; score: Score | null;
  rank_in_unit: number | null; of: number; alerts: Alert[]; sparklines: Record<string, number[]>; sparkline_deltas: Record<string, number | null>; provenance: Record<string, string>;
}
export interface FacilityDot { facility_id: string; facility_name: string; type: string; lat: number; lon: number; worst_severity: Severity; worst_days: number; worst_commodity: string; red: number; amber: number; data_issues: number; source: string; dist_to_warehouse_km: number; beds: number }
export interface DistrictRow { district: string; facilities: number; lat: number; lon: number; score: number | null; median_days_of_stock: number | null; red_alerts: number }
export interface Transfer { transfer_id: string; from_id: string; from_name: string; from_district: string; to_id: string; to_name: string; to_district: string; commodity_id: string; quantity: number; km: number; eta_days: number; donor_days_after: number; recipient_days_after: number; cross_district: boolean; reason: string; status: string; note?: string; decision_reason?: string }
export interface Briefing { headline: string; body: string[]; top_actions: string[]; lang: string; status: string; model: string; provenance: string }
export interface AskResult { mode: string; question: string; answer: string; rows: Record<string, unknown>[]; row_count?: number; chart?: { type: string; x?: string; y?: string } | null; sql?: string; sql_checked?: string | null; check?: { ok: boolean; reason: string }; error?: string | null; shape?: string; params?: Record<string, string>; status: string; attempts?: number; restate?: string }

export const api = {
  health: () => get<{ ok: boolean; latest_month: number; scenario: Scenario }>("/health"),
  units: () => get<{ units: Unit[] }>("/units"),
  districts: (u: string) => get<{ districts: DistrictRow[]; scenario: Scenario }>(`/units/${u}/districts`),
  summary: (u: string, d: string) => get<Summary>(`/districts/${u}/${encodeURIComponent(d)}/summary`),
  facilities: (u: string, d: string) => get<{ facilities: FacilityDot[]; provenance: string }>(`/districts/${u}/${encodeURIComponent(d)}/facilities`),
  facility: (id: string) => get<{ facility: Record<string, unknown>; stock: Alert[]; forecast: { commodity_id: string; week: number; point: number; p90: number; method: string }[]; staff: { cadre: string; sanctioned: number; in_position: number; days_present: number }[]; beds: { beds: number; occupied: number } | null; entries: Record<string, unknown>[]; provenance: Record<string, string> }>(`/facilities/${id}`),
  transfers: (u: string, d: string, commodity?: string) => get<{ transfers: Transfer[]; provenance: string }>(`/transfers/${u}/${encodeURIComponent(d)}${commodity ? `?commodity_id=${commodity}` : ""}`),
  approve: (id: string) => post<{ status: string }>(`/transfers/${id}/approve`),
  reject: (id: string, reason: string) => post<{ status: string }>(`/transfers/${id}/reject`, { reason }),
  delivered: (id: string) => post<{ status: string }>(`/transfers/${id}/delivered`),
  scenario: () => get<{ current: Scenario; available: { name: string; label: string; units: string[] | null }[] }>("/scenario"),
  setScenario: (name: string, intensity: number) => post<Scenario>("/scenario", { name, intensity }),
  briefing: (u: string, d: string, lang: string) => get<Briefing>(`/ai/briefing/${u}/${encodeURIComponent(d)}?lang=${lang}`),
  explain: (kind: "alert" | "transfer", item: unknown, lang: string) => post<{ explanation: string; numbers_used: string[]; confidence: string; status: string }>("/ai/explain", { kind, item, lang }),
  ask: (body: { question: string; unit: string; district?: string | null; lang: string; mode: "guided" | "advanced"; sql?: string | null }) => post<AskResult>("/ai/ask", body),
  entry: (body: { facility_id: string; commodity_id: string; quantity: number; channel: string; note?: string }) => post<{ entry_id: string }>("/entries", body),
  provenance: () => get<Record<string, string>>("/provenance"),
};
