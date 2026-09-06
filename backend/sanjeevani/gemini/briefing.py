"""Morning briefing writer: engine summary in, 3-4 sentences out."""
import json

from pydantic import BaseModel, Field

from sanjeevani.gemini.client import GeminiClient
from sanjeevani.gemini.prompts import lang_line


class BriefingOut(BaseModel):
    headline: str = Field(description="One sentence, under 20 words, the single most important fact for today")
    body: list[str] = Field(description="Three to four short sentences: what will run out, where, why, and what is ready to approve")
    top_actions: list[str] = Field(description="Up to three imperative actions the officer can take now")
    lang: str


def trim_payload(summary: dict) -> dict:
    """Keep the briefing prompt small and free of anything that is not needed."""
    al = summary.get("alerts", [])[:10]
    keep = ["facility_name", "commodity_name", "days_of_stock", "severity", "cause", "cause_detail", "lead_days", "type"]
    return {
        "district": summary.get("district"), "unit_id": summary.get("unit_id"),
        "scenario": summary.get("scenario", {}).get("name"), "scenario_intensity": summary.get("scenario", {}).get("intensity"),
        "counts": summary.get("counts"), "facilities": summary.get("facilities"),
        "resilience_score": (summary.get("score") or {}).get("score"), "rank_in_unit": summary.get("rank_in_unit"), "of": summary.get("of"),
        "top_alerts": [{k: a.get(k) for k in keep} for a in al],
        "transfers_ready": summary.get("transfers_ready", 0),
        "sparkline_last_vs_prev_month": summary.get("sparkline_deltas"),
    }


def build_prompt(payload: dict, lang: str) -> str:
    sc = payload.get("scenario")
    sc_line = (f"A what-if scenario is active: '{sc}' at intensity {payload.get('scenario_intensity')}. Say so in the first sentence."
               if sc and sc != "normal" else "No scenario is active; these are the current figures.")
    return (
        f"{lang_line(lang)}\n{sc_line}\n"
        "Write the morning briefing for the District Health Officer from this JSON. Days of stock are for each PHC and commodity; "
        "'cause' says why. Mention at most three facilities by name and always the number of days. Numbers marked simulated are demonstration data.\n\n"
        f"{json.dumps(payload, ensure_ascii=False)}"
    )


def run(client: GeminiClient, summary: dict, lang: str = "en", case: str | None = None) -> BriefingOut:
    payload = trim_payload(summary)
    out = client.generate_json(build_prompt(payload, lang), BriefingOut, service="briefing", case=case)
    out.lang = lang
    return out


def fallback(summary: dict, lang: str = "en") -> BriefingOut:
    c = summary.get("counts", {})
    d = summary.get("district", "")
    if lang == "hi":
        return BriefingOut(headline=f"{d}: {c.get('red', 0)} लाल और {c.get('amber', 0)} पीली चेतावनियाँ", body=["ब्रीफिंग सेवा अभी उपलब्ध नहीं है; नीचे अलर्ट सूची देखें।"], top_actions=["डिस्पैच बोर्ड खोलें"], lang="hi")
    return BriefingOut(headline=f"{d}: {c.get('red', 0)} red and {c.get('amber', 0)} amber alerts", body=["Briefing service is unavailable; the alert list below is current."], top_actions=["Open the dispatch board"], lang="en")
