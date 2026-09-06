"""Ask-the-district, guided mode: Gemini chooses one of a fixed set of query shapes and fills its parameters;
the executor binds parameters into a prepared SQL template. Safe by construction."""
import json
import re
from dataclasses import dataclass, field

import pandas as pd
from pydantic import BaseModel, Field

from sanjeevani.gemini.client import CassetteMiss, GeminiClient, GeminiUnavailable
from sanjeevani.gemini.prompts import lang_line


@dataclass
class QueryShape:
    name: str
    description: str
    params: dict[str, str]          # param -> type name (str|int|float)
    sql: str                        # uses $unit, $district and $param placeholders (DuckDB named params)
    chart: dict | None = None
    defaults: dict = field(default_factory=dict)


SHAPES: dict[str, QueryShape] = {s.name: s for s in [
    QueryShape("facilities_lowest_days", "Facilities with the fewest days of stock for one commodity", {"commodity": "str", "n": "int"},
               """SELECT facility_name, type, district, days_of_stock, closing, commodity_name FROM v_days_of_stock
                  WHERE unit_id=$unit AND ($district IS NULL OR district=$district) AND (commodity_id=$commodity OR lower(commodity_name) LIKE '%' || lower($commodity) || '%')
                  ORDER BY days_of_stock LIMIT $n""", {"type": "bar", "x": "facility_name", "y": "days_of_stock"}, {"n": 10}),
    QueryShape("item_trend", "Monthly demand trend of one commodity across the district", {"commodity": "str"},
               """SELECT l.year, l.month, sum(l.demand) AS demand, sum(l.distributed) AS distributed, sum(CASE WHEN l.stockout THEN 1 ELSE 0 END) AS stockouts
                  FROM ledger l JOIN facilities f USING (facility_id) JOIN commodities c USING (commodity_id)
                  WHERE f.unit_id=$unit AND ($district IS NULL OR f.district=$district) AND (c.commodity_id=$commodity OR lower(c.name) LIKE '%' || lower($commodity) || '%')
                  GROUP BY 1,2 ORDER BY 1,2""", {"type": "line", "x": "month", "y": "demand"}),
    QueryShape("absent_staff", "Facilities where a cadre was present fewer than a threshold of days this month", {"days_threshold": "int", "cadre": "str"},
               """SELECT f.name AS facility_name, f.district, s.cadre, s.sanctioned, s.in_position, s.days_present FROM staff s JOIN facilities f USING (facility_id)
                  WHERE f.unit_id=$unit AND ($district IS NULL OR f.district=$district) AND s.month_index=(SELECT max(month_index) FROM staff)
                    AND ($cadre='' OR s.cadre=$cadre) AND s.in_position>0 AND s.days_present < $days_threshold ORDER BY s.days_present""",
               {"type": "table"}, {"days_threshold": 15, "cadre": ""}),
    QueryShape("stockouts_by_commodity", "Which commodities stocked out most across the district in the latest month", {},
               """SELECT commodity_name, category, sum(CASE WHEN stockout THEN 1 ELSE 0 END) AS facilities_stocked_out, round(median(days_of_stock),1) AS median_days
                  FROM v_days_of_stock WHERE unit_id=$unit AND ($district IS NULL OR district=$district) GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15""",
               {"type": "bar", "x": "commodity_name", "y": "facilities_stocked_out"}),
    QueryShape("compare_districts", "Compare districts of the unit on median days of stock and stock-out rate", {},
               """SELECT district, facilities, round(median_days_of_stock,1) AS median_days_of_stock, round(share_under_14d,3) AS share_under_14d, round(stockout_rate,3) AS stockout_rate
                  FROM v_district_summary WHERE unit_id=$unit ORDER BY median_days_of_stock""", {"type": "bar", "x": "district", "y": "median_days_of_stock"}),
    QueryShape("data_issues", "Facility-commodity rows that look like reporting errors (negative or implausible stock)", {},
               """SELECT facility_name, district, commodity_name, closing, demand FROM v_days_of_stock
                  WHERE unit_id=$unit AND ($district IS NULL OR district=$district) AND (closing < 0 OR closing > 50*demand+1000) ORDER BY closing LIMIT 50""", {"type": "table"}),
    QueryShape("beds_occupancy", "Bed occupancy by facility type in the latest month", {},
               """SELECT f.type, count(*) AS facilities, sum(b.beds) AS beds, sum(b.occupied) AS occupied, round(sum(b.occupied)*1.0/sum(b.beds),3) AS occupancy
                  FROM beds b JOIN facilities f USING (facility_id) WHERE f.unit_id=$unit AND ($district IS NULL OR f.district=$district)
                    AND b.month_index=(SELECT max(month_index) FROM beds) GROUP BY 1 ORDER BY 1""", {"type": "bar", "x": "type", "y": "occupancy"}),
    QueryShape("red_by_district", "Number of facility-commodity pairs under 7 days of stock per district", {},
               """SELECT district, sum(CASE WHEN days_of_stock<7 THEN 1 ELSE 0 END) AS red, sum(CASE WHEN days_of_stock>=7 AND days_of_stock<14 THEN 1 ELSE 0 END) AS amber
                  FROM v_days_of_stock WHERE unit_id=$unit GROUP BY 1 ORDER BY red DESC""", {"type": "bar", "x": "district", "y": "red"}),
    QueryShape("facility_stock", "All commodities and days of stock at one named facility", {"facility": "str"},
               """SELECT facility_name, commodity_name, category, days_of_stock, closing, demand FROM v_days_of_stock
                  WHERE unit_id=$unit AND lower(facility_name) LIKE '%' || lower($facility) || '%' ORDER BY days_of_stock LIMIT 80""", {"type": "table"}),
    QueryShape("real_vs_simulated", "Real HMIS district ledger for a commodity versus the simulated facility total", {"item_code": "str"},
               """SELECT r.fy, r.month, r.opening, r.received, r.distributed, r.closing FROM hmis_ledger_real r
                  WHERE r.state=(SELECT state FROM units WHERE unit_id=$unit) AND r.district=$district AND r.item_code=$item_code ORDER BY r.fy, r.month""",
               {"type": "line", "x": "month", "y": "closing"}, {"item_code": "19.12"}),
    QueryShape("facility_count", "How many facilities of each type exist in the district or unit, and how many are real named facilities", {},
               """SELECT district, type, count(*) AS facilities, sum(CASE WHEN source='osm' THEN 1 ELSE 0 END) AS named_from_openstreetmap
                  FROM facilities WHERE unit_id=$unit AND ($district IS NULL OR district=$district) GROUP BY 1,2 ORDER BY 1,2""", {"type": "table"}),
    QueryShape("lead_time_risk", "Facilities farthest from the district warehouse with low stock of any commodity", {"n": "int"},
               """SELECT v.facility_name, v.district, f.dist_to_warehouse_km, min(v.days_of_stock) AS worst_days, count(*) FILTER (WHERE v.days_of_stock<14) AS items_under_14d
                  FROM v_days_of_stock v JOIN facilities f USING (facility_id) WHERE v.unit_id=$unit AND ($district IS NULL OR v.district=$district)
                  GROUP BY 1,2,3 ORDER BY f.dist_to_warehouse_km DESC LIMIT $n""", {"type": "table"}, {"n": 10}),
]}


class Param(BaseModel):
    name: str
    value: str


class PickOut(BaseModel):
    shape: str = Field(description="Exactly one shape name from the list")
    params: list[Param] = Field(default_factory=list, description="Parameter values as strings; only the listed parameters of that shape")
    restate: str = Field(description="The question restated in one short sentence")


class AnswerOut(BaseModel):
    answer: str = Field(description="One or two sentences answering the question from the rows, citing numbers")


def shapes_catalogue() -> str:
    return "\n".join(f"- {s.name}: {s.description}. params: {s.params or 'none'}" for s in SHAPES.values())


def coerce(shape: QueryShape, params: dict) -> dict:
    out = dict(shape.defaults)
    for k, ty in shape.params.items():
        v = params.get(k, out.get(k))
        if v is None or v == "":
            if k not in out:
                out[k] = "" if ty == "str" else 0
            continue
        try:
            out[k] = int(float(v)) if ty == "int" else float(v) if ty == "float" else str(v)
        except (TypeError, ValueError):
            raise ValueError(f"bad value for {k}: {v!r}")
    extra = set(params) - set(shape.params)
    if extra:
        raise ValueError(f"unknown params: {sorted(extra)}")
    if "n" in out:
        out["n"] = max(1, min(int(out["n"]), 200))
    return out


def execute(shape: QueryShape, params: dict, unit_id: str, district: str | None, con) -> pd.DataFrame:
    bound = {"unit": unit_id, "district": district, **coerce(shape, params)}
    used = set(re.findall(r"\$([a-zA-Z_]+)", shape.sql))   # DuckDB rejects unused named parameters
    return con.execute(shape.sql, {k: v for k, v in bound.items() if k in used}).df()


def run(client: GeminiClient, con, question: str, unit_id: str, district: str | None, lang: str = "en", case: str | None = None) -> dict:
    pick = client.generate_json(
        f"{lang_line(lang)}\nChoose the single best query shape for the officer's question and fill its parameters. Shapes:\n{shapes_catalogue()}\n"
        f"Commodity parameters accept a name fragment like 'ORS' or 'zinc'. If nothing fits, choose 'stockouts_by_commodity'.\nQuestion: {question}",
        PickOut, service="ask_guided", case=f"{case}_pick" if case else None)
    shape = SHAPES.get(pick.shape) or SHAPES["stockouts_by_commodity"]
    params = {p.name: p.value for p in pick.params if p.name in shape.params}
    try:
        rows = execute(shape, params, unit_id, district, con)
        err = None
    except Exception as e:
        rows, err = pd.DataFrame(), str(e)[:200]
    answer = ""
    if err is None and len(rows):
      try:
        ans = client.generate_json(f"{lang_line(lang)}\nAnswer in one or two sentences from these rows, citing numbers.\nQuestion: {question}\nRows: {json.dumps(rows.head(30).to_dict(orient='records'), default=str)[:6000]}",
                                   AnswerOut, service="ask_guided", case=f"{case}_answer" if case else None)
        answer = ans.answer
      except (CassetteMiss, GeminiUnavailable):
        answer = f"{len(rows)} row(s) returned." if lang == "en" else f"{len(rows)} पंक्तियाँ मिलीं।"
    elif err is None:
        answer = "No rows matched." if lang == "en" else "कोई पंक्ति नहीं मिली।"
    return {"mode": "guided", "question": question, "restate": pick.restate, "shape": shape.name, "params": params,
            "rows": rows.to_dict(orient="records"), "row_count": int(len(rows)), "chart": shape.chart, "sql": shape.sql.strip(), "error": err,
            "answer": answer, "provenance": "Guided query over the demo database; shape and parameters chosen by Gemini, SQL is a fixed template"}
