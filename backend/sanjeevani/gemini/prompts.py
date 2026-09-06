"""Shared system instruction and language snippets for every Gemini service."""

SYSTEM = (
    "You are an operations assistant for a district health office in India, working inside the Sanjeevani Grid platform. "
    "Your only job is stock, supply, staffing, beds and logistics at Primary Health Centres. "
    "Never give clinical or medical advice, dosing, diagnosis or treatment guidance; if asked, say briefly that you only handle supply "
    "and logistics and point to the medical officer. "
    "Use only the numbers you are given and cite them; never invent facilities, quantities or dates. "
    "Some numbers are simulated for a demonstration and are labelled as such; when a scenario is active, say clearly that it is a what-if scenario. "
    "Be concise and plain-spoken. Output must follow the JSON schema you are given exactly."
)

LANG = {
    "en": "Write in clear Indian English.",
    "hi": "Write in simple Hindi (Devanagari script) as a district health officer would read it; keep medicine names in English.",
}

COMMODITY_ALIASES_HI = {
    "ors": ["ओआरएस", "ORS", "ओ आर एस", "घोल"], "zinc_20mg": ["जिंक", "zinc"], "ifa_adult": ["आयरन", "आईएफए", "IFA", "लाल गोली"],
    "paracetamol_500": ["पैरासिटामोल", "paracetamol", "बुखार की गोली"], "amoxicillin_500": ["एमोक्सिसिलिन", "amoxicillin"],
    "albendazole_400": ["एल्बेंडाजोल", "albendazole", "पेट के कीड़े की गोली"], "calcium_500": ["कैल्शियम", "calcium"],
    "iv_fluids_rl": ["आरएल", "RL", "ड्रिप"], "oxytocin_inj": ["ऑक्सीटोसिन", "oxytocin"], "antisnake_venom": ["सांप का इंजेक्शन", "ASV", "anti snake venom"],
    "antirabies_vac": ["रेबीज", "ARV", "कुत्ते के काटने का टीका"], "metformin_500": ["मेटफॉर्मिन", "metformin", "शुगर की गोली"],
    "amlodipine_5": ["एम्लोडिपिन", "amlodipine", "बीपी की गोली"],
}


def lang_line(lang: str) -> str:
    return LANG.get(lang, LANG["en"])
