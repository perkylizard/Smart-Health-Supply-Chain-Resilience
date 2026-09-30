"""Stock reports from a photo of the stock register or a voice note (Hindi or English), read by Gemini into lines the
facility confirms before anything is saved. Gemini may only choose medicines from the facility's own list."""
from pydantic import BaseModel, Field

from sanjeevani.gemini.client import GeminiClient
from sanjeevani.gemini.prompts import lang_line


class EntryLine(BaseModel):
    commodity_id: str = Field(description="exactly one id from the list given")
    quantity: float = Field(description="units on hand now, as written or said; 0 if finished or out")
    heard: str = Field(description="the words or register row this line was read from")


class EntriesOut(BaseModel):
    items: list[EntryLine]
    transcript: str = Field(description="for a voice note, what was said; for a photo, a short description of the register")
    unclear: str | None = Field(None, description="anything that could not be read with confidence")


def build_prompt(kind: str, catalogue: list[tuple[str, str]], lang: str) -> str:
    listing = "\n".join(f"- {cid}: {name}" for cid, name in catalogue)
    what = {"photo": "a photo of a primary health centre's stock register (handwritten or printed; columns are often medicine, opening, received, issued, balance)",
            "voice": "a voice note from primary health centre staff saying how much of each medicine is left (Hindi, English or a mix)"}.get(
            kind, "a typed message from primary health centre staff saying how much of each medicine is left (Hindi, English or Hinglish, often with typos)")
    return (f"{lang_line(lang)}\nYou read {what}. For each medicine mentioned, report the quantity ON HAND NOW (for a register, the closing balance). "
            "Words such as khatam, nahi hai, finished or out mean 0. Hindi numbers (bees = 20, chalis = 40, sau = 100) are numbers. "
            "Use only medicines from this list, by id; skip anything not on it and mention it in 'unclear'. Never guess a quantity.\n\n"
            f"Medicines at this facility:\n{listing}")


def run(client: GeminiClient, data: bytes, mime: str, kind: str, catalogue: list[tuple[str, str]], lang: str = "en", text: str | None = None) -> EntriesOut:
    if kind == "text":
        out = client.generate_json(build_prompt(kind, catalogue, lang) + f"\n\nMessage: {text}", EntriesOut, service="explain")
    else:
        out = client.generate_json(build_prompt(kind, catalogue, lang), EntriesOut, media=[(data, mime)], service="register" if kind == "photo" else "voice")
    ids = {c for c, _ in catalogue}
    out.items = [EntryLine(commodity_id=i.commodity_id, quantity=max(0.0, float(i.quantity)), heard=i.heard) for i in out.items if i.commodity_id in ids]
    return out
