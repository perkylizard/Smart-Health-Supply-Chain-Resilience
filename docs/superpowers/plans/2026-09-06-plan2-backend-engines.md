# Plan 2: Backend Engines and API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The decision engines behind the three screens: forecast, days-of-stock and alerts with cause attribution, redistribution optimiser, resilience score, runtime scenario dial, exposed through a FastAPI service reading the demo DuckDB.

**Architecture:** Pure functions over pandas frames in `backend/sanjeevani/engines/`, each with unit tests on small synthetic frames plus one integration test against `data/demo.duckdb`. A thin FastAPI layer in `backend/app/` composes them; approvals and scenario state live in an in-process store with a Firestore adapter added in Plan 5. Scenario changes never re-simulate history; they reproject forecast, lead time, and alerts from the latest ledger month, which keeps the dial instant.

**Tech Stack:** Python 3.12, pandas, numpy, duckdb, ortools (min-cost flow), fastapi, uvicorn, httpx (tests), pytest.

**Spec:** `docs/superpowers/specs/2026-09-06-sanjeevani-grid-design.md` Sections 3.1, 3.2, 3.3, 3.7, 5.1

## Global Constraints
- No network calls in this plan. Gemini, Maps, BigQuery arrive in Plans 3 and 5 behind the interfaces defined here.
- Every engine output carries `source` and, where relevant, `cause` and `data_issue` columns; the API never returns a number without provenance.
- Thresholds from the spec: red < 7 days, amber < 14, watch < 30; alert when days_of_stock < lead_days + 7; donor floor 21 days; one transfer per donor per commodity per week.
- Data-issue rule: negative closing, closing == 0 after opening > 3x median demand, or received > 10x median received ⇒ `data_issue`, never `stockout`.
- Deterministic under a seed; all engines finish for the full Bihar unit in under 5 s on a laptop.
- Commit after every task.

---

## File structure
```
backend/sanjeevani/engines/__init__.py
backend/sanjeevani/engines/store.py          DuckDB access: latest ledger month, history windows, facilities, commodities
backend/sanjeevani/engines/forecast.py       seasonal-naive + trend + exogenous forecaster; P90; backtest helper
backend/sanjeevani/engines/scenario.py       runtime multipliers from scenarios.json (demand, lead days, miss prob)
backend/sanjeevani/engines/alerts.py         days-of-stock, severity, cause attribution, data-issue flags
backend/sanjeevani/engines/redistribute.py   OR-Tools min-cost flow transfers, distance provider interface
backend/sanjeevani/engines/resilience.py     district and unit scores 0-100
backend/app/main.py                          FastAPI app factory and routes
backend/app/state.py                         in-process store: scenario, approved transfers, entries (Firestore adapter later)
backend/app/schemas.py                       pydantic response models
backend/tests/engines/test_*.py, backend/tests/test_api.py
scripts/backtest.py                          evaluation table for README
```

---

### Task 1: Store (DuckDB access layer)
**Files:** `backend/sanjeevani/engines/store.py`, `backend/tests/engines/test_store.py`
**Interfaces (produces):**
- `class Store(db_path: Path)` with `.con` (read-only duckdb) and methods:
  - `units() -> pd.DataFrame`
  - `facilities(unit_id: str | None = None, district: str | None = None) -> pd.DataFrame`
  - `commodities() -> pd.DataFrame`
  - `latest_month() -> int`
  - `ledger_window(unit_id: str, months: int = 12, district: str | None = None) -> pd.DataFrame` (ledger joined to facility type, district)
  - `ledger_latest(unit_id, district=None) -> pd.DataFrame`
  - `history_series(unit_id, commodity_id, district=None) -> pd.DataFrame` (facility_id, month_index, demand) for the hero this is 36 months, others 12
  - `real_ledger(state, district=None) -> pd.DataFrame` (hmis_ledger_real)
- [ ] Tests: `latest_month()==35`; `ledger_latest("ladakh")` non-empty; `facilities("bastar")` districts == 7; `history_series("bihar","ors","Araria")` has 36 distinct months.
- [ ] Add deps: `uv add fastapi uvicorn ortools httpx` (httpx dev).
- [ ] Commit `feat: DuckDB store for engines`.

### Task 2: Runtime scenario multipliers
**Files:** `backend/sanjeevani/engines/scenario.py`, `backend/tests/engines/test_scenario.py`
**Interfaces (produces):** `multipliers(name: str, intensity: float, unit_id: str, category: str, driver: str, cal_month: int) -> Multiplier(demand: float, lead_days_add: float, miss_prob_add: float)`; `apply_to_frame(df, name, intensity, month_col="month") -> df` adding `demand_mult`, `lead_add`, `miss_add` columns (vectorised over category/driver/unit).
- [ ] Tests: normal ⇒ all ones/zeros; monsoon at intensity 0.5 in July for outbreak ⇒ demand 1.75; winter_closure applies only to ladakh/jk/arunachal; cyclone ignores bihar.
- [ ] Commit `feat: runtime scenario multipliers`.

### Task 3: Forecaster
**Files:** `backend/sanjeevani/engines/forecast.py`, `backend/tests/engines/test_forecast.py`
**Interfaces (produces):**
- `forecast_series(y: np.ndarray, horizon_weeks: int = 8, season: int = 12, exog_mult: np.ndarray | None = None) -> Forecast(point: np.ndarray[horizon], p90: np.ndarray[horizon], method: str)`; monthly history in, weekly out (monthly seasonal naive x trend ⇒ split by 4.33, P90 from residual quantile x 1.28 with a 25 % floor).
- `forecast_frame(hist: pd.DataFrame, horizon_weeks=8, scenario=None) -> pd.DataFrame` (facility_id, commodity_id, week, point, p90, method, source="forecast").
- `backtest(hist, holdout_months=3) -> pd.DataFrame` (MAPE per series).
- [ ] Tests: a pure sine with period 12 forecasts next values within 10 %; constant series ⇒ P90 ≥ point x 1.25; horizon length 8; deterministic; scenario multiplier scales point.
- [ ] Commit `feat: seasonal forecaster with P90 and backtest`.

### Task 4: Days-of-stock and alerts
**Files:** `backend/sanjeevani/engines/alerts.py`, `backend/tests/engines/test_alerts.py`
**Interfaces (produces):** `compute_alerts(latest: pd.DataFrame, window: pd.DataFrame, fc: pd.DataFrame, scenario: str, intensity: float) -> pd.DataFrame` columns facility_id, commodity_id, unit_id, state, district, closing, weekly_demand_p90, days_of_stock, lead_days, severity in {red, amber, watch, ok}, alert(bool), cause in {cases_up, supply_missed, written_off, data_issue, none}, cause_detail(str), data_issue(bool), source.
- Cause attribution: compare last month vs mean of prior 3: demand up > 30 % ⇒ cases_up; received == 0 while indent expected ⇒ supply_missed; unusable > 20 % of opening ⇒ written_off; else none. Data-issue rule from Global Constraints overrides severity to "data_issue".
- [ ] Tests on a 6-row synthetic frame covering each cause and the data-issue rule; integration: Bihar latest yields > 0 red alerts and no NaN days_of_stock; runtime < 5 s.
- [ ] Commit `feat: days-of-stock alerts with cause attribution and data-issue flags`.

### Task 5: Redistribution optimiser
**Files:** `backend/sanjeevani/engines/redistribute.py`, `backend/tests/engines/test_redistribute.py`
**Interfaces (produces):**
- `class DistanceProvider` protocol: `km(a: (lat,lon), b: (lat,lon)) -> float`; `HaversineDistance` default (x1.3 road factor). Maps provider added in Plan 5.
- `propose(alerts: pd.DataFrame, latest: pd.DataFrame, facilities: pd.DataFrame, commodity_id: str, scenario_lead_add: float = 0, max_km: float = 80, donor_floor_days: float = 21, dist: DistanceProvider = HaversineDistance()) -> pd.DataFrame` columns transfer_id, from_id, to_id, commodity_id, quantity, km, eta_days, reason, donor_days_after, recipient_days_after, cross_district(bool), source="optimiser".
- Min-cost flow: sources = donors with surplus above floor, sinks = recipients' deficit to reach 21 days, arc cost = km x 10 + 500 fixed, capacity = donor surplus; escalate to neighbouring districts (within max_km x 2) only if district supply < demand.
- [ ] Tests: 3 donors 2 recipients toy ⇒ recipients reach floor, donors stay ≥ floor, nearest donor used first; infeasible case returns partial with reason "insufficient_surplus"; integration on Bihar ORS returns proposals in < 5 s.
- [ ] Commit `feat: OR-Tools redistribution optimiser`.

### Task 6: Resilience score
**Files:** `backend/sanjeevani/engines/resilience.py`, `backend/tests/engines/test_resilience.py`
**Interfaces (produces):** `district_scores(alerts, staff, transfers, reporting_share) -> pd.DataFrame` (unit_id, state, district, score 0-100, components dict) using weights median DoS 40, share under 14d 20, staffing gap 20, transfer latency 10, timeliness 10; `unit_scores(district_scores) -> pd.DataFrame`.
- [ ] Tests: all-perfect inputs ⇒ 100; all-worst ⇒ 0; monotone in each component.
- [ ] Commit `feat: resilience score`.

### Task 7: FastAPI service
**Files:** `backend/app/main.py`, `backend/app/state.py`, `backend/app/schemas.py`, `backend/tests/test_api.py`
**Routes (produces, all JSON, all include `provenance`):**
- `GET /health`
- `GET /units` ; `GET /units/{unit_id}/districts` (with resilience score)
- `GET /districts/{unit_id}/{district}/summary` → alerts (sorted), score, sparklines (OPD, top disease, red alerts, 12 months), counts
- `GET /districts/{unit_id}/{district}/facilities` → map dots with worst days_of_stock and severity
- `GET /facilities/{facility_id}` → facility card: all commodities DoS, forecast 8 weeks for top 5, staff, beds
- `GET /transfers/{unit_id}/{district}` → proposals; `POST /transfers/{transfer_id}/approve`, `POST /transfers/{transfer_id}/reject {reason}`; `GET /transfers/{unit_id}/{district}/status`
- `GET /scenario` ; `POST /scenario {name, intensity}` (global for the demo)
- `GET /forecast/{facility_id}/{commodity_id}`
- `GET /real/{state}/{district}/ledger` → HMIS real district ledger for the honesty panel
- [ ] `state.py`: `InMemoryState` with scenario, transfers dict, entries list; interface `StateStore` so Firestore can replace it.
- [ ] Tests with `httpx.AsyncClient`/TestClient: each route 200 with expected keys; approve flow changes status; scenario change alters alert counts for Araria.
- [ ] `Makefile`: `dev` target runs `uv run uvicorn app.main:app --reload --app-dir backend`.
- [ ] Commit `feat: FastAPI service over the engines`.

### Task 8: Backtest script and README table
**Files:** `scripts/backtest.py`, README section "Evaluation"
- [ ] Fit on months 0-32, hold out 33-35 for the hero unit; report MAPE by commodity category and red-alert precision/recall against simulated stockouts; write markdown table to README between `<!-- eval:start -->` and `<!-- eval:end -->` markers.
- [ ] Commit `docs: evaluation table from backtest`.

## Self-review
- Spec 3.1 forecasting → Task 3 (BigQuery path deferred to Plan 5 behind `method`); 3.2 → Task 4; 3.3 → Task 5 (Maps provider deferred); 3.7 → Task 6; 5.1 backend → Task 7; 3.6 evaluation → Task 8. Gemini services are Plan 3.
- Types: `facility_id: str`, `commodity_id: str`, `month_index: int`, `days_of_stock: float`, `severity: str` consistent across Tasks 4-7.
