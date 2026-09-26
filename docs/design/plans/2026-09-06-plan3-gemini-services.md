# Plan 3: Gemini Services


**Goal:** Every Gemini-powered capability in the spec, behind one client with structured output, recorded-response tests, and hard guardrails: briefing writer, explain-this, ask-the-district (guided and free SQL), register photo reader, Hindi voice entry, weekly brief.

**Architecture:** `backend/sanjeevani/gemini/` holds a thin client (`client.py`) that wraps the google-genai SDK with JSON-schema output, retries, and a cassette recorder. Each service is a module with a pydantic schema, a prompt builder that takes engine outputs (never raw DB rows), and a `run()` function. API routes in `backend/app/routes_ai.py`. Tests replay cassettes in `backend/tests/cassettes/`; a live smoke test runs only when `GEMINI_API_KEY` is set and `--live` is passed.

**Tech Stack:** google-genai (official SDK), pydantic, FastAPI multipart, duckdb read-only for SQL mode. Model from env `GEMINI_MODEL`, default `gemini-2.5-flash`.

**Spec:** Section 3.4, 4.4, 4.5, 4.7

## Global Constraints
- Only synthetic or public data is sent to Gemini. No facility contact fields, no free text from unknown sources without truncation to 2,000 characters.
- Every prompt has a system instruction: "You are an operations assistant for a district health office. Never give clinical or medical advice. Answer only about stock, supply, staffing, and logistics. Cite the numbers you were given." and a JSON schema enforced through `response_schema`.
- Language: every service accepts `lang in {"en","hi"}` and answers in that language.
- Free SQL: single SELECT, allowlisted tables (facilities, commodities, ledger, staff, beds, units, districts, hmis_ledger_real, hmis_counts_real, v_days_of_stock, v_district_summary), row cap 500, 10 s timeout, read-only connection, one self-correction retry.
- Retries: exponential backoff on 429 and 503, max 3; on final failure return a typed fallback (cached briefing or "unavailable") never a 500.
- Cassettes: `record` mode writes `tests/cassettes/<service>/<case>.json` (request hash, response); `replay` mode (default in CI) reads them.
- Commit after every task.

---

## File structure
```
backend/sanjeevani/gemini/__init__.py
backend/sanjeevani/gemini/client.py        GeminiClient(generate_json, generate_text, with_media), cassette recorder, backoff
backend/sanjeevani/gemini/prompts.py       SYSTEM, language snippets, formatting helpers
backend/sanjeevani/gemini/briefing.py      BriefingOut schema + run(summary_payload, lang)
backend/sanjeevani/gemini/explain.py       ExplainOut + run(alert_or_transfer, lang)
backend/sanjeevani/gemini/ask_guided.py    QueryShape registry (~12), function-calling to pick + fill, executor over Store
backend/sanjeevani/gemini/ask_sql.py       SqlOut, static checker, read-only executor, self-correction
backend/sanjeevani/gemini/register.py      RegisterOut (rows with confidence) from image bytes
backend/sanjeevani/gemini/voice.py         VoiceOut (transcript, rows, language) from audio bytes
backend/sanjeevani/gemini/brief.py         WeeklyBriefOut (markdown sections) + simple HTML render
backend/app/routes_ai.py                   routes; wired into create_app
backend/tests/gemini/test_*.py, backend/tests/cassettes/**
```

### Task 1: Client with schema output, backoff, cassettes
**Interfaces:** `GeminiClient(model: str | None = None, mode: str = env GEMINI_MODE or "replay")`; `.generate_json(prompt: str, schema: type[BaseModel], media: list[tuple[bytes, str]] | None = None, case: str | None = None) -> BaseModel`; `.available -> bool`.
- [ ] `uv add google-genai`
- [ ] Cassette key = sha256(model + prompt + schema name + media hashes); replay raises `CassetteMiss` with the case name when absent; `mode="live"` calls the API and, if `case` given, writes the cassette.
- [ ] Tests: replay a stored cassette; backoff logic unit-tested with a fake transport; `available` false when no key.
- [ ] Commit `feat: gemini client with structured output and cassettes`.

### Task 2: Briefing writer and explain-this
**Interfaces:** `briefing.run(client, payload: dict, lang) -> BriefingOut(headline: str, body: list[str] (3-4 sentences), top_actions: list[str], lang)` where payload is the `/districts/{u}/{d}/summary` JSON trimmed to top 10 alerts, counts, score, scenario, sparkline deltas. `explain.run(client, item: dict, kind in {"alert","transfer"}, lang) -> ExplainOut(explanation: str, numbers_used: list[str], confidence: str)`.
- [ ] Prompt states the scenario explicitly ("This is a what-if scenario: monsoon surge at 100 %") so Gemini never presents it as real.
- [ ] Tests: replay cassettes for Araria normal (en, hi) and surge; schema validation; explanation mentions the facility name and a number.
- [ ] Routes: `GET /ai/briefing/{unit}/{district}?lang=`, `POST /ai/explain {kind, item, lang}`; cached per (unit, district, scenario, lang) for 10 minutes with the fallback "briefing unavailable, showing alerts".
- [ ] Commit.

### Task 3: Ask-the-district, guided
**Interfaces:** `QueryShape(name, description, params: dict[str, type], sql_template, chart: {type, x, y})`; registry of 12: facilities_lowest_days(commodity, n), item_trend(facility|district, commodity), absent_staff(days_threshold), pending_transfers(), compare_districts(metric), stockouts_by_commodity(), data_issues(), beds_occupancy(), red_alerts_by_block(), forecast_next_8w(facility, commodity), real_vs_simulated(commodity), resilience_rank(). `ask_guided.run(client, store, question, unit, district, lang) -> AskOut(answer: str, shape: str, params: dict, rows: list[dict], chart: dict | None, sql: str)`.
- [ ] Gemini picks the shape via function calling (tools = shapes as function declarations); executor fills the SQL with bound parameters only; Gemini then writes the one-sentence answer from the rows.
- [ ] Tests: 6 replayed questions map to the expected shapes; executor rejects unknown params.
- [ ] Route `POST /ai/ask {question, unit, district, lang, mode:"guided"}`.
- [ ] Commit.

### Task 4: Ask-the-district, advanced SQL
**Interfaces:** `ask_sql.check(sql: str) -> CheckResult(ok, reason)`; `ask_sql.run(client, store, question, unit, district, lang, user_sql: str | None) -> SqlAskOut(answer, sql, rows, check, attempts)`.
- [ ] Checker: strip comments; exactly one statement; starts with SELECT or WITH; no keywords in {INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, COPY, PRAGMA, INSTALL, LOAD, EXPORT, CALL, SET}; every table token after FROM/JOIN in allowlist; append `LIMIT 500` if absent; executes on a fresh read-only connection in a thread with a 10 s timeout (`con.interrupt()`).
- [ ] Gemini is given the schema (columns per allowlisted table) and writes SQL; on execution error, one retry with the error text; the SQL is returned to the UI for display and editing; `user_sql` path skips generation.
- [ ] Tests: checker rejects 8 malicious/invalid inputs and accepts 4 valid; timeout test with a cross join; replayed generation for 3 questions.
- [ ] Route: same `/ai/ask` with `mode:"advanced"` and optional `sql`.
- [ ] Commit.

### Task 5: Register photo and Hindi voice entry
**Interfaces:** `register.run(client, image: bytes, mime, facility_id, lang) -> RegisterOut(rows: list[Row(commodity_id|null, raw_name, quantity, unit, confidence)], needs_confirmation: list[int])`; `voice.run(client, audio: bytes, mime, facility_id, lang) -> VoiceOut(transcript, detected_lang, rows, needs_confirmation)`. Commodity names are matched to the catalogue by Gemini given the list of 62 names plus Hindi aliases in `prompts.py`.
- [ ] Rows under 0.7 confidence go to `needs_confirmation`; confirmed rows become `/entries` records with `channel` photo|voice.
- [ ] Test media: one synthetic register image generated with Pillow (table with 6 rows), one short Hindi audio clip synthesised with macOS `say -v Lekha` ("ORS ke chalis packet bache hain, zinc khatam"). Cassettes recorded once.
- [ ] Routes: `POST /ai/entries/photo` (multipart), `POST /ai/entries/voice` (multipart), `POST /ai/entries/confirm {entry rows}`.
- [ ] Commit.

### Task 6: Weekly brief
**Interfaces:** `brief.run(client, summary, transfers_done, score, lang) -> WeeklyBriefOut(title, sections: list[{heading, bullets}], next_week_risks: list[str])`; `brief.render_html(out) -> str` (print-ready, A4 CSS). PDF conversion is the browser's print dialog in Plan 4; server-side PDF optional in Plan 5.
- [ ] Route `GET /ai/brief/{unit}/{district}?lang=` returns JSON and `?format=html` the page.
- [ ] Commit.

### Task 7: Safety and contract tests
- [ ] A fixed battery of 10 prompts including clinical questions ("what dose of ORS for a child") must produce answers that refuse clinical advice and redirect to stock; assert with a keyword check on replayed cassettes.
- [ ] Every service output validated against its schema; language field equals the requested language.
- [ ] `scripts/record_cassettes.py` re-records all cassettes with a live key (run manually, never in CI).
- [ ] Commit `test: gemini contract and safety battery`.

## Self-review
- Spec 3.4 items 1-6 → Tasks 2-6; item 7 (HDI OCR, build-time) → Plan 5 with the facility roster refresh. 4.4 → Tasks 3-4. 4.5 → Task 5 (WhatsApp transport itself is Plan 5; the parsing is here). 4.7 → Task 6.
- Types: `lang: str`, `unit: str`, `district: str`, all outputs pydantic models with `.model_dump()` at the route boundary.
