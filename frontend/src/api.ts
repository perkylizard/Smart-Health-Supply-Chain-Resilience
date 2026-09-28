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
  rank_in_unit: number | null; of: number; rank_pending?: boolean; alerts: Alert[]; sparklines: Record<string, number[]>; sparkline_deltas: Record<string, number | null>; provenance: Record<string, string>;
}
export interface FacilityDot { facility_id: string; facility_name: string; type: string; lat: number; lon: number; worst_severity: Severity; worst_days: number; worst_commodity: string; red: number; amber: number; data_issues: number; source: string; dist_to_warehouse_km: number; beds: number }
export interface DistrictRow { district: string; facilities: number; lat: number; lon: number; score: number | null; median_days_of_stock: number | null; red_alerts: number }
export interface Transfer { transfer_id: string; from_id: string; from_name: string; from_district: string; to_id: string; to_name: string; to_district: string; commodity_id: string; quantity: number; km: number; eta_days: number; donor_days_after: number; recipient_days_after: number; cross_district: boolean; reason: string; status: string; note?: string; decision_reason?: string }
export interface Briefing { headline: string; body: string[]; top_actions: string[]; lang: string; status: string; model: string; provenance: string }
export interface AskResult { mode: string; question: string; answer: string; rows: Record<string, unknown>[]; row_count?: number; chart?: { type: string; x?: string; y?: string } | null; sql?: string; sql_checked?: string | null; check?: { ok: boolean; reason: string }; error?: string | null; shape?: string; params?: Record<string, string>; status: string; attempts?: number; restate?: string }

export interface NationalState { state: string; districts: number; median_months_of_stock: number; share_districts_under_1_month: number; lat: number | null; lon: number | null; phc_level_available: boolean }
export interface Indent { indent_id: string; facility_id: string; facility_name: string; type: string; commodity_id: string; commodity_name: string; category: string; days_of_stock: number; cause: string; quantity: number; lead_days: number; status: string }
export interface WarehouseRow { item_code: string; item_name: string; fy: string; month: number; stale: boolean; opening: number; received: number; unusable: number; distributed: number; closing: number; months_of_stock: number | null; distributed_by_month: (number | null)[] }
export interface Brief { facts: { district: string; score: Score | null; rank: number | null; of: number; counts: Partial<Record<Severity, number>>; facilities: number; transfers_approved: number; transfers_delivered: number; data_issues: number; staffing_gap: number | null; top_risks: string[]; scenario: Scenario; trends: Record<string, number | null> }; narrative: { title: string; sections: { heading: string; bullets: string[] }[]; next_week_risks: string[] } | null; status: string; generated: string; provenance: string }

export interface FedMetrics { auc: number; logloss: number; precision: number; recall: number; n: number; positives: number }
export interface FedRound { round: number; global: FedMetrics; rows_crossed: number; per_node: Record<string, { federated: FedMetrics; local_only: FedMetrics; personalised?: FedMetrics; group: string; rows: number }> }
export interface FedTier { tier: string; summary: { nodes: number; groups: string[]; rounds: number; federated_better_or_equal_nodes: number; personalised_better_or_equal_nodes?: number; mean_auc_federated: number; mean_auc_local_only: number; mean_auc_personalised?: number; rows_crossed_border: number; global: FedMetrics }; nodes: { name: string; group: string; rows: number; holdout_rows?: number }[]; rounds: FedRound[]; seconds?: number; provenance?: string }
export interface FedReplay { generated: string; method: string; features: string[]; tiers: Record<string, FedTier> }

export const api = {
  fedReplay: () => get<FedReplay>("/federated/replay"),
  fedRun: (tier: string, rounds: number) => post<FedTier>("/federated/run", { tier, rounds }),
  unitTransfers: (u: string) => get<{ transfers: Transfer[]; districts_considered: string[]; provenance: string }>(`/units/${u}/transfers`),
  facilityTransfers: (id: string) => get<{ transfers: (Transfer & { direction: "incoming" | "outgoing" })[] }>(`/facilities/${id}/transfers`),
  nationalStates: (basis: "real" | "simulated" = "real") => get<{ states: NationalState[]; month: string; basis: string; provenance: string }>(`/national/states?basis=${basis}`),
  nationalDistricts: (s: string, basis: "real" | "simulated" = "real") => get<{ districts: { district: string; months_of_stock: number | null; forecast_months_of_stock?: number | null; items_reported: number; stockout_reports: number | null; unit_id: string | null }[]; provenance: string }>(`/national/states/${encodeURIComponent(s)}/districts?basis=${basis}`),
  indents: (u: string, d: string) => get<{ indents: Indent[]; provenance: string }>(`/districts/${u}/${encodeURIComponent(d)}/indents`),
  indentStatus: (id: string, status: string) => post<{ status: string }>(`/indents/${id}/${status}`),
  warehouse: (u: string, d: string) => get<{ rows: WarehouseRow[]; fy: string; month: number; provisional?: boolean; provenance: string }>(`/districts/${u}/${encodeURIComponent(d)}/warehouse`),
  brief: (u: string, d: string, lang: string) => get<Brief>(`/districts/${u}/${encodeURIComponent(d)}/brief?lang=${lang}`),
  escalate: (u: string, d: string, reason: string) => post<{ entry_id: string }>("/escalations", { unit_id: u, district: d, reason }),
  escalations: (u: string) => get<{ escalations: { district: string; reason: string; received: number }[] }>(`/escalations/${u}`),
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
