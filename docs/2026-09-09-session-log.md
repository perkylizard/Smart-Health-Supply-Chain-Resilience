# Session log: 7 to 9 September 2026

What was built, decided, and left open in this working session. Written on 9 September 2026 for the two-person Sanjeevani Grid team. Earlier work (data foundation, engines, Gemini services, first frontend) is recorded in the plans under `docs/design/plans/`.

## Where the project stands

- 57 commits on `main`, 43 of them not yet pushed to GitHub.
- 136 backend tests and 3 frontend tests pass.
- Five personas, fourteen demo units, Google forecasting in BigQuery, India-only federated learning, all running locally with `GEMINI_MODE=live make dev` and `cd frontend && npm run dev`.
- Not yet deployed to a public link. Not yet recorded on video.

## 1. Google predictive modelling in BigQuery

**Why.** Rubric asks for "shared predictive modelling" and the challenge is Google-hosted. Until this session the only forecaster was our own seasonal-naive model in Python.

**What was done.**

- Enabled the BigQuery API in the new Cloud project `sanjeevani-grid`, dataset `sanjeevani` in the `asia-south1` region. Service-account key creation is disabled by organisation policy, so auth uses Application Default Credentials from `gcloud auth application-default login`.
- Loaded two tables: the real HMIS district monthly ledger and the simulated Bihar facility ledger.
- Two Google forecasters run against the real district series: `AI.FORECAST` (TimesFM foundation model) and `ARIMA_PLUS` (multi-series model). Script: `scripts/bq_forecast.py`.
- Three-way backtest on real data, trained to December 2019, held out January to March 2020, one block per state written into the README between markers. TimesFM wins on the most series in both states tested.

| State | Series | Baseline median error | ARIMA_PLUS | TimesFM |
|---|---|---|---|---|
| Bihar | 738 | 34.2% | 20.6% | 17.7% |
| Uttar Pradesh | 1730 | 32.1% | 20.9% | 17.0% |

- The district TimesFM forecast is cached to `data/processed/bq_district_forecast.parquet` (committed) and used hierarchically: facility forecast = district forecast × the facility's historical share. Falls back to the baseline when there is no cached district series. Vectorised after the first version took eight minutes in tests.
- Error analysis in `docs/research/forecast-error-analysis.md`: March 2020 (lockdown) dominates the error; small series inflate mean MAPE; the paths to lower error are commodity-level series, pooling small series with the state, cleaning reporting gaps, and rain and OPD covariates through `ARIMA_PLUS_XREG`.

**Uncommitted at time of writing:** the UP block in `README.md` and a refreshed `facilities.parquet`. You said you would commit these later.

## 2. UI restructure and responsiveness

- Navigation reduced to three labelled tabs per persona. Bottom tab bar on phones, side-by-side on desktop. Phone preview at `/mobile.html`.
- Briefing screen answers three questions in order: what runs out, why, what to do.
- MapLibre map creation gated on a sized container. React StrictMode removed because the double mount broke MapLibre.
- A blank map in the automation screenshots turned out to be the automation tab being hidden, not a bug. Maps render in a visible browser. Please confirm the State and India maps in your own browser once.

## 3. Five personas with their own flows

Chosen from the persona dropdown in the header; persona, unit, district and language persist in the browser.

| Persona | Route | Screens |
|---|---|---|
| District health officer | `/dho/:unit/:district` | Briefing, Dispatch, Ask |
| State officer | `/state/:unit` | State map and districts table, India view on real HMIS data with drill-down, Ask |
| PHC staff | `/phc/:facilityId` | Home with stock and next delivery, Report entry, Deliveries |
| District magistrate | `/dm/:unit/:district` | Gemini-written weekly brief with print and escalation, Compare districts |
| District warehouse | `/warehouse/:unit/:district` | Indents with accept and dispatch, real stock book |

Backend for these lives in `backend/app/routes_personas.py`. Unit dropdown now redirects to the worst district so no unit lands on a blank page. Assam added as the fourteenth unit.

**Data entry at the granular level:** the PHC pharmacist or ANM enters the monthly stock position, the same person who fills HMIS today. The product replaces the paper register with the Report screen, with Gemini photo and voice entry planned for later (see open items).

## 4. India-only federated learning

**Decision.** You said "build the india-only federated version, leave brazil out". Brazil is parked, not decided against. Two Brazil JSON files (1.5 MB) still sit untracked in `data/raw/brazil/` from the stopped fetch; the folder is git-ignored. Say the word and I delete them.

**What was done.**

- Logistic stock-out-risk model in numpy, seven features (days of stock, log demand, demand trend, lead days, month sine and cosine, driver delta).
- Hierarchical FedAvg following McMahan 2017: districts aggregate to their state, states to a national model. A personalised variant fine-tunes the global model locally. Rows crossing any border are counted and asserted to be zero.
- Replay artefact `data/processed/federated_replay.json` (committed) plus a live run endpoint with a lock, both shown on the System panel.

| Tier | Nodes | Local-only AUC | Federated AUC | Nodes helped |
|---|---|---|---|---|
| Bihar districts, cold start (400 rows each) | 23 | 0.685 | 0.759 | 18 of 23 |
| Bihar districts, full data | 38 | 0.724 | 0.726 | 21 of 38 |
| States of India | 14 | 0.718 | 0.717 | 7 of 14 |

The honest reading: federation helps the data-poor nodes a lot and the data-rich ones almost not at all. That is the story for the deck.

**Who runs the nodes.** A district node is the district health society's server or the state's data centre tenancy; a state node is the state health mission; the national aggregator is the NHM. No facility data leaves its district.

## 5. Other things done in this session

- Improvements task list written, `docs/design/plans/2026-09-07-improvements-tasklist.md`, checked against the public-data rule. Status updated on 9 September.
- Resilience score card explained (weights 40/20/20/10/10).
- Confirmed there is no personal data anywhere in the product: only facility-level and district-level aggregates.
- Shared a ten-row sample of the data.gov.in data.
- Gemini free tier checked: 15 requests per minute per model, 2.5-series models retired for new accounts, per-model pacer set to 12.

## 6. Decisions made in this session

- Track 3, India-only prototype, Brazil parked.
- Fourteen demo units with Bihar as the hero.
- Predictive modelling from Google is BigQuery TimesFM with ARIMA_PLUS as the comparison, not Vertex AI.
- Five personas, no more for the prototype.
- No scraping, no logins, public data only, and stop and report on any block or rate limit before acting.

## 7. Open items, in the order I would take them

**Yours**

1. Push `main` (43 commits waiting).
2. Commit the README UP block and facilities.parquet, or tell me to.
3. Decide on the improvements order, or say "take the list as ranked".
4. Send the AI Studio rate-limit screenshot, or give the go-ahead to record voice and photo cassettes at 12 requests per minute.
5. Set up the Google Cloud free trial or Firebase so I can deploy.
6. Make the repository public before 29 September and email the organisers about credits.
7. Confirm the maps in your own browser.

**Mine, once you unblock them**

- Gemini photo register entry, Hindi voice entry, safety battery (Plan 3, tasks 5 to 7).
- Deployment to Cloud Run or Firebase with a public link (Plan 5, task 5).
- Improvements A1 to B5 as listed, about thirteen build days.
- Playwright hero flow, then the video and the twelve-slide deck.

## Timeline

| Date | Milestone |
|---|---|
| 21 Sep | Proposed feature freeze |
| 30 Sep | Prototype submission |
| 1 to 15 Oct | Evaluation |
| 16 Oct | Top 20 announced |
| 23 Oct | Virtual demo day |
