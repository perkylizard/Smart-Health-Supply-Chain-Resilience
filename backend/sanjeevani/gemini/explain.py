"""Explain any alert or transfer in plain language, citing the numbers it was given."""
import json

from pydantic import BaseModel, Field

from sanjeevani.gemini.client import GeminiClient
from sanjeevani.gemini.prompts import lang_line


class ExplainOut(BaseModel):
    explanation: str = Field(description="Two to four sentences a district officer can act on")
    numbers_used: list[str] = Field(description="The specific figures cited, e.g. '6 days of ORS'")
    confidence: str = Field(description="high, medium or low, based on data_issue flags and how many months of history exist")


KEEP_ALERT = ["facility_name", "type", "district", "commodity_name", "closing", "demand", "weekly_demand_p90", "days_of_stock", "lead_days",
              "severity", "cause", "cause_detail", "data_issue", "scenario", "source"]
KEEP_TRANSFER = ["from_name", "from_district", "to_name", "to_district", "commodity_id", "quantity", "km", "eta_days", "donor_days_after",
                 "recipient_days_after", "cross_district", "reason", "note", "source"]


def build_prompt(item: dict, kind: str, lang: str) -> str:
    keep = KEEP_ALERT if kind == "alert" else KEEP_TRANSFER
    slim = {k: item.get(k) for k in keep if k in item}
    what = "a stock alert for one PHC and one commodity" if kind == "alert" else "a proposed stock transfer between two facilities"
    return (f"{lang_line(lang)}\nExplain {what} to the District Health Officer. State what is happening, why (use the cause fields), "
            f"and what happens if nothing is done. Cite the numbers. If data_issue is true, say the figures look like a reporting error, not a stock-out.\n\n{json.dumps(slim, ensure_ascii=False)}")


def run(client: GeminiClient, item: dict, kind: str = "alert", lang: str = "en", case: str | None = None) -> ExplainOut:
    return client.generate_json(build_prompt(item, kind, lang), ExplainOut, service="explain", case=case)
