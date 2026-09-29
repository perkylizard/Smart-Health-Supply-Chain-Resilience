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
    label = {"monsoon_surge": "monsoon flood with a diarrhoea surge", "dengue_season": "dengue season", "winter_closure": "winter road closure",
             "cyclone": "cyclone landfall", "warehouse_shock": "state warehouse supply shock"}.get(sc, str(sc).replace("_", " "))
    pct = int(round(float(payload.get("scenario_intensity") or 1.0) * 100))
    sc_line = (f"A what-if scenario is active: {label} at {pct} percent intensity. The headline must still be the most important stock fact "
               f"(a facility, a commodity, days left); mention the scenario in the body, not the headline, e.g. 'Under the {label} scenario, ...'."
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


CAUSE_EN = {"supply_missed": "a missed supply", "cases_up": "rising cases", "lead_time": "a long delivery time", "data_issue": "a reporting error"}
CAUSE_HI = {"supply_missed": "छूटी आपूर्ति", "cases_up": "बढ़ते मामले", "lead_time": "लंबा डिलीवरी समय", "data_issue": "रिपोर्टिंग त्रुटि"}


def fallback(summary: dict, lang: str = "en") -> BriefingOut:
    """Written from the engine's numbers when Gemini is unreachable or rate-limited: same shape as the AI briefing, so the
    officer never sees a 'service unavailable' message in place of the day's most important facts."""
    c = summary.get("counts", {}) or {}
    d = summary.get("district", "")
    red, amber = int(c.get("red", 0) or 0), int(c.get("amber", 0) or 0)
    top = [a for a in summary.get("alerts", []) if a.get("alert")][:3]
    ready = int(summary.get("transfers_ready", 0) or 0)
    if lang == "hi":
        body = [f"{a.get('facility_name')} में {a.get('commodity_name')} {round(float(a.get('days_of_stock') or 0))} दिन का बचा है ({CAUSE_HI.get(a.get('cause'), 'कारण अज्ञात')})।" for a in top]
        if ready: body.append(f"{ready} स्थानांतरण स्वीकृति के लिए तैयार हैं।")
        return BriefingOut(headline=f"{d}: {red} सुविधा-दवाएँ 7 दिन से कम, {amber} 14 दिन से कम", body=body or ["आज कोई तत्काल कमी नहीं है।"],
                           top_actions=[f"{top[0].get('facility_name')} के लिए स्टॉक भेजें"] if top else [], lang="hi")
    body = [f"{a.get('facility_name')} has {round(float(a.get('days_of_stock') or 0))} days of {a.get('commodity_name')} left, because of {CAUSE_EN.get(a.get('cause'), 'an unknown cause')}." for a in top]
    if ready: body.append(f"{ready} transfers are ready to approve.")
    return BriefingOut(headline=f"{d}: {red} medicines under a week of stock, {amber} under two weeks", body=body or ["Nothing is running short today."],
                       top_actions=[f"Send stock to {top[0].get('facility_name')}"] if top else [], lang="en")
