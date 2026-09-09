"""Weekly brief for the District Magistrate: facts in, four short sections out."""
import json

from pydantic import BaseModel, Field

from sanjeevani.gemini.client import GeminiClient
from sanjeevani.gemini.prompts import lang_line


class Section(BaseModel):
    heading: str
    bullets: list[str] = Field(description="Two to four bullets, each one sentence with a number")


class WeeklyBriefOut(BaseModel):
    title: str
    sections: list[Section] = Field(description="Exactly four: Stock position, Actions taken, Risks next week, Data quality")
    next_week_risks: list[str]
    lang: str = "en"


def run(client: GeminiClient, facts: dict, lang: str = "en", case: str | None = None) -> WeeklyBriefOut:
    prompt = (f"{lang_line(lang)}\nWrite the weekly one-page brief for the District Magistrate from these facts. Four sections with the headings "
              f"'Stock position', 'Actions taken', 'Risks next week', 'Data quality'. Cite numbers. If a scenario is active, say it is a what-if.\n\n{json.dumps(facts, ensure_ascii=False, default=str)}")
    out = client.generate_json(prompt, WeeklyBriefOut, service="brief", case=case)
    out.lang = lang
    return out
