"""Words shown to people for internal codes. No screen or generated sentence should print a database id or code
(metformin_500, cases_up); everything user-facing goes through these."""

CAUSE = {"cases_up": "cases rising", "supply_missed": "supply missed", "written_off": "stock written off",
         "data_issue": "reporting error", "none": "", "requested": "requested by the facility"}


def cause(code: object) -> str:
    return CAUSE.get(str(code), "" if code is None else str(code).replace("_", " "))


def medicine(name: object, commodity_id: str) -> str:
    """The catalogue name; if a row has none, a readable form of the id (never the raw id)."""
    if isinstance(name, str) and name.strip():
        return name
    return commodity_id.replace("_", " ").strip().capitalize()
