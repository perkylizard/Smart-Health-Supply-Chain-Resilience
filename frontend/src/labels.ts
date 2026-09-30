import { sB } from "./stringsB";
import { strings } from "./i18n";

/** People never see a database column, id or code: table headers and code-like values go through here. */
const COLS: Record<"en" | "hi", Record<string, string>> = {
  en: { commodity_name: "Medicine", commodity_id: "Medicine", facility_name: "Facility", facility_id: "Facility", type: "Type", district: "District", category: "Category",
    days_of_stock: "Days of stock", median_days: "Median days of stock", closing: "Stock on hand", opening: "Opening stock", received: "Received", distributed: "Distributed",
    demand: "Demand", weekly_demand_p90: "Weekly demand (high)", facilities_stocked_out: "Facilities stocked out", stockout: "Stocked out", severity: "Status",
    cause: "Cause", month: "Month", t: "Month", value: "Value", facilities: "Facilities", red_alerts: "Under 7 days", score: "Resilience score", lead_days: "Delivery time (days)" },
  hi: { commodity_name: "दवा", commodity_id: "दवा", facility_name: "सुविधा", facility_id: "सुविधा", type: "प्रकार", district: "ज़िला", category: "श्रेणी",
    days_of_stock: "स्टॉक के दिन", median_days: "मध्य स्टॉक दिन", closing: "मौजूदा स्टॉक", opening: "शुरुआती स्टॉक", received: "प्राप्त", distributed: "वितरित",
    demand: "मांग", weekly_demand_p90: "साप्ताहिक मांग (उच्च)", facilities_stocked_out: "स्टॉक-आउट सुविधाएँ", stockout: "स्टॉक-आउट", severity: "स्थिति",
    cause: "कारण", month: "महीना", t: "महीना", value: "मान", facilities: "सुविधाएँ", red_alerts: "7 दिन से कम", score: "सुदृढ़ता स्कोर", lead_days: "डिलीवरी समय (दिन)" },
};

export function colLabel(col: string, lang: "en" | "hi"): string {
  return COLS[lang][col] ?? col.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function cellLabel(col: string, v: unknown, lang: "en" | "hi"): string | null {
  if (typeof v !== "string") return null;
  if (col === "category") return sB[lang].cat[v] ?? v.replace(/_/g, " ");
  if (col === "cause") return strings[lang].causes[v] ?? v.replace(/_/g, " ");
  if (col === "severity") return strings[lang].severity[v] ?? v.replace(/_/g, " ");
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(v)) return v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return null;
}
