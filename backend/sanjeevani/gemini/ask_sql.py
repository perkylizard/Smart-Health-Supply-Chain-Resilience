"""Ask-the-district, advanced mode: Gemini writes SQL against a read-only schema; a static checker and a
read-only, time-limited DuckDB connection enforce the guardrails. The SQL is always returned for display and editing."""
import json
import re
import threading

import duckdb
import pandas as pd
from pydantic import BaseModel, Field

from sanjeevani import paths
from sanjeevani.gemini.client import CassetteMiss, GeminiClient, GeminiUnavailable
from sanjeevani.gemini.prompts import lang_line

ALLOWED_TABLES = {"facilities", "commodities", "ledger", "staff", "beds", "units", "districts", "hmis_ledger_real", "hmis_counts_real",
                  "hmis_items", "scenarios", "v_days_of_stock", "v_district_summary", "v_latest_month"}
FORBIDDEN = {"insert", "update", "delete", "drop", "alter", "create", "attach", "detach", "copy", "pragma", "install", "load", "export",
             "call", "set", "reset", "import", "vacuum", "checkpoint", "truncate", "merge", "grant", "begin", "commit", "rollback"}
ROW_CAP = 500
TIMEOUT_S = 10.0


class CheckResult(BaseModel):
    ok: bool
    reason: str = ""
    sql: str = ""


class SqlOut(BaseModel):
    sql: str = Field(description="One DuckDB SELECT statement answering the question, using only the listed tables and columns")
    rationale: str = Field(description="One sentence on how the query answers the question")


class SqlAnswerOut(BaseModel):
    answer: str = Field(description="One or two sentences answering the question from the rows, citing numbers")


def strip_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql.strip().rstrip(";").strip()


def check(sql: str) -> CheckResult:
    s = strip_comments(sql)
    if not s:
        return CheckResult(ok=False, reason="empty query")
    if ";" in s:
        return CheckResult(ok=False, reason="only one statement is allowed")
    head = s.lstrip("(").split(None, 1)[0].lower() if s else ""
    if head not in ("select", "with"):
        return CheckResult(ok=False, reason="query must start with SELECT or WITH")
    tokens = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", s.lower()))
    bad = tokens & FORBIDDEN
    if bad:
        return CheckResult(ok=False, reason=f"forbidden keyword: {sorted(bad)[0]}")
    if re.search(r"read_[a-z]+\s*\(|\bfrom\s+'[^']*'", s, re.I):
        return CheckResult(ok=False, reason="file access is not allowed")
    # every identifier after FROM / JOIN must be an allowlisted table or a CTE defined in this query
    ctes = set(m.lower() for m in re.findall(r"(?:with|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(", s, re.I))
    refs = [m.lower() for m in re.findall(r"\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_.]*)", s, re.I)]
    for r in refs:
        if r not in ALLOWED_TABLES and r not in ctes:
            return CheckResult(ok=False, reason=f"table not allowed: {r}")
    if not re.search(r"\blimit\s+\d+", s, re.I):
        s = f"{s}\nLIMIT {ROW_CAP}"
    else:
        s = re.sub(r"\blimit\s+(\d+)", lambda m: f"LIMIT {min(int(m.group(1)), ROW_CAP)}", s, flags=re.I)
    return CheckResult(ok=True, sql=s)


def execute(sql: str, db_path=None, timeout: float = TIMEOUT_S) -> pd.DataFrame:
    """Runs on a fresh read-only connection; interrupts after timeout."""
    con = duckdb.connect(str(db_path or (paths.DATA / "demo.duckdb")), read_only=True)
    result: dict = {}

    def work():
        try:
            result["df"] = con.execute(sql).df()
        except Exception as e:  # surfaced to the caller
            result["err"] = e

    t = threading.Thread(target=work, daemon=True); t.start(); t.join(timeout)
    if t.is_alive():
        con.interrupt(); t.join(2)
        raise TimeoutError(f"query exceeded {timeout:.0f} s")
    con.close()
    if "err" in result:
        raise result["err"]
    return result["df"]


def schema_text(db_path=None) -> str:
    con = duckdb.connect(str(db_path or (paths.DATA / "demo.duckdb")), read_only=True)
    lines = []
    for t in sorted(ALLOWED_TABLES):
        try:
            cols = con.execute(f"DESCRIBE {t}").df()
        except Exception:
            continue
        lines.append(f"{t}({', '.join(f'{c} {ty}' for c, ty in zip(cols['column_name'], cols['column_type']))})")
    con.close()
    return "\n".join(lines)


def build_prompt(question: str, unit_id: str, district: str | None, lang: str, schema: str, error: str | None = None, prior_sql: str | None = None) -> str:
    scope = f"unit_id = '{unit_id}'" + (f" and district = '{district}'" if district else "")
    fix = f"\nThe previous SQL failed with: {error}\nPrevious SQL:\n{prior_sql}\nWrite a corrected query." if error else ""
    return (f"{lang_line(lang)}\nWrite ONE DuckDB SELECT to answer the question. Use only these tables and columns:\n{schema}\n\n"
            f"Facts: ledger.month_index is the month number (max is the latest month); facilities.unit_id and facilities.district scope the data; "
            f"v_days_of_stock has the latest month per facility x commodity with days_of_stock. Filter to {scope} unless the question says otherwise. "
            f"Return at most 500 rows; prefer aggregates.{fix}\n\nQuestion: {question}")


def run(client: GeminiClient, question: str, unit_id: str, district: str | None, lang: str = "en", user_sql: str | None = None,
        case: str | None = None, db_path=None) -> dict:
    schema = schema_text(db_path)
    attempts, sql, rationale = 0, user_sql, ""
    if sql is None:
        out = client.generate_json(build_prompt(question, unit_id, district, lang, schema), SqlOut, service="ask_sql", case=case)
        sql, rationale, attempts = out.sql, out.rationale, 1
    chk = check(sql)
    rows, err = pd.DataFrame(), None
    if chk.ok:
        try:
            rows = execute(chk.sql, db_path)
        except Exception as e:
            err = str(e)[:300]
    else:
        err = chk.reason
    if err and user_sql is None and attempts == 1:
        out = client.generate_json(build_prompt(question, unit_id, district, lang, schema, err, sql), SqlOut, service="ask_sql", case=f"{case}_retry" if case else None)
        sql, rationale, attempts = out.sql, out.rationale, 2
        chk = check(sql); err = None
        if chk.ok:
            try:
                rows = execute(chk.sql, db_path)
            except Exception as e:
                err = str(e)[:300]
        else:
            err = chk.reason
    answer = ""
    if err is None and len(rows):
        sample = rows.head(30).to_dict(orient="records")
        try:
            a = client.generate_json(f"{lang_line(lang)}\nAnswer the question in one or two sentences from these rows, citing numbers. Write medicine and facility names as people say them; never a column name, an id or a word with an underscore.\nQuestion: {question}\nRows: {json.dumps(sample, default=str)[:6000]}",
                                     SqlAnswerOut, service="ask_sql", case=f"{case}_answer" if case else None)
            answer = a.answer
        except (CassetteMiss, GeminiUnavailable):
            answer = f"{len(rows)} row(s) returned." if lang == "en" else f"{len(rows)} पंक्तियाँ मिलीं।"
    return {"mode": "advanced", "question": question, "sql": sql, "sql_checked": chk.sql if chk.ok else None, "check": chk.model_dump(),
            "rationale": rationale, "rows": rows.head(ROW_CAP).to_dict(orient="records"), "row_count": int(len(rows)), "error": err,
            "answer": answer, "attempts": attempts, "provenance": "Gemini-written SQL over the demo database (read-only); see sql field"}
