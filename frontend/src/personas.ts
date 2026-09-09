export type PersonaId = "dho" | "state" | "phc" | "dm" | "warehouse";
export interface Tab { key: string; path: string; icon: string }
export interface Persona { id: PersonaId; tabs: Tab[] }

export const icons: Record<string, string> = {
  briefing: "M4 6h16M4 12h10M4 18h7",
  dispatch: "M3 7h11l4 4v6H3zM14 7v4h4M7 17a2 2 0 1 0 0.01 0M16 17a2 2 0 1 0 0.01 0",
  ask: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z",
  system: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0.01 0",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  india: "M12 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  stock: "M4 7h16v13H4zM4 11h16M9 7V4h6v3",
  report: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12zM8 11h8M8 14h5",
  truck: "M3 7h11l4 4v6H3zM14 7v4h4M7 17a2 2 0 1 0 0.01 0M16 17a2 2 0 1 0 0.01 0",
  brief: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6",
  compare: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l2 3h4l2-3h5",
};

export const PERSONAS: Record<PersonaId, Persona> = {
  dho: { id: "dho", tabs: [{ key: "briefing", path: "", icon: "briefing" }, { key: "dispatch", path: "/dispatch", icon: "dispatch" }, { key: "ask", path: "/ask", icon: "ask" }] },
  state: { id: "state", tabs: [{ key: "stateTab", path: "", icon: "map" }, { key: "districtsTab", path: "/districts", icon: "table" }, { key: "indiaTab", path: "/india", icon: "india" }, { key: "ask", path: "/ask", icon: "ask" }] },
  phc: { id: "phc", tabs: [{ key: "myStock", path: "", icon: "stock" }, { key: "report", path: "/report", icon: "report" }, { key: "deliveries", path: "/deliveries", icon: "truck" }] },
  dm: { id: "dm", tabs: [{ key: "brief", path: "", icon: "brief" }, { key: "compare", path: "/compare", icon: "compare" }] },
  warehouse: { id: "warehouse", tabs: [{ key: "indents", path: "", icon: "inbox" }, { key: "storeStock", path: "/stock", icon: "stock" }] },
};

export function homePath(p: PersonaId, unit: string, district: string, facilityId?: string): string {
  const d = encodeURIComponent(district);
  switch (p) {
    case "dho": return `/dho/${unit}/${d}`;
    case "state": return `/state/${unit}`;
    case "phc": return facilityId ? `/phc/${facilityId}` : `/phc-pick/${unit}/${d}`;
    case "dm": return `/dm/${unit}/${d}`;
    case "warehouse": return `/warehouse/${unit}/${d}`;
  }
}
