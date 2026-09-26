# Sanjeevani Grid: design spec

Hack2Skill x Google BRICS Hackathon, Track 3 "Smart Health & Supply Chain Resilience".
Status: Sections 1 to 4 approved 6 Sep 2026. Section 5 proposed.
Working name "Sanjeevani Grid" is a placeholder.

---

## 1. Users, hero scenario, demo set (approved)

**Primary user: District Health Officer.** Responsible for 30 to 60 PHCs. Today learns about a stock-out when a PHC phones. Our product is their morning screen.

**Secondary user: PHC pharmacist or nurse.** Updates stock weekly. Today a paper register and a monthly indent form. Our product gives them a 30-second path via WhatsApp voice note or register photo.

**Hero state: Bihar.** Demo set of 13 units: Bihar, Uttar Pradesh, Rajasthan, Madhya Pradesh, Andhra Pradesh, Telangana, Karnataka, Arunachal Pradesh, Jammu & Kashmir, Ladakh (Leh and Kargil, extracted from J&K files for 2017 to 2019), Lakshadweep, Andaman & Nicobar, Bastar division of Chhattisgarh (7 tribal districts). National map covers all 36 states and UTs.

**Federated partner: Brazil**, via the Ministry of Health open API (real facility-level medicine stock ledger, no login).

**Hero scenario (video and Demo Day):**
1. Officer opens the morning briefing for Araria district, Bihar. Mostly green.
2. Outbreak dial moved to "monsoon surge". Diarrhoea cases rise in three blocks.
3. Forecast reprojects. Three PHCs flip red: ORS and zinc run out in 5 to 7 days.
4. Gemini briefing explains why, and the dispatch board shows two transfers from surplus PHCs with route, quantity, and reason.
5. Officer approves with one tap. WhatsApp confirmation goes to both PHCs.
6. Federated ledger panel: model trained across India and Brazil, records crossed the border: 0.

## 2. Product concept, data model, simulator (approved)

### Concept
- **One number: days of stock left.** Every PHC, every commodity. Green above 30 days, amber under 14, red under 7.
- **Three screens, no dashboard.** Morning briefing, dispatch board, ask-the-district.
- **Data entry that disappears.** PHC staff send a WhatsApp voice note in Hindi or a photo of the paper register. No app install. Works on an 8,000 rupee phone.
- **Memorable pieces:** outbreak dial (judges can drag it), resilience score per district and state, honesty badges on every number (HMIS real, simulated, reported today), federated ledger with two flags and a zero counter, one-tap weekly brief PDF for the District Magistrate.

### Entities
State, District, Block, Facility (PHC, CHC, DH; name, type, lat, lon, catchment population, distance to district warehouse), Commodity (NLEM code, name, unit, PHC-level flag, shelf life), StockLedger (facility, commodity, month: opening, received, unusable, distributed, closing), Demand (facility, item code, month, value), Alert (facility, commodity, days of stock, severity, cause, created), Transfer (from, to, commodity, quantity, distance, status), StaffAttendance (facility, cadre, month, sanctioned, in position, days present), BedOccupancy (facility, month, beds, occupied), Scenario (name, multipliers), ModelRound (federated round, node, metric).

### Real layer (sources verified, see DATA-SOURCES-VERIFIED.md)
- HMIS C2 district monthly, 2017-18 to 2019-20, all 36 states: 318 items including OPD, IPD by disease, emergency by cause, childhood diseases, immunisation; real stock ledgers for about 25 commodities (ORS, zinc, IFA x4, albendazole, calcium, vitamin A, paediatric antibiotics, all routine vaccines, syringes, gloves); item 14.17 stock-out rate of essential drugs.
- Facility counts and staffing gaps: Rural Health Statistics 2016-17 to 2021-22, Health Dynamics of India 2022-23 and 2023-24 (scanned; OCR via Gemini).
- Population: Census 2011 district PCA; NFHS-5 district factsheets (707 districts).
- Disease context: NCVBDC malaria (district-level 2025), dengue, chikungunya to 2026.
- Weather: Open-Meteo archive and 7-day forecast, per facility coordinate.
- Facility names and coordinates: OpenStreetMap (healthcare=centre), Karnataka official PHC and CHC lists from data.gov.in.
- Brazil node: Hórus stock ledger, UBS facility list, dengue notifications.

### Simulated layer (always labelled)
- District figures split across the district's PHCs by catchment population share plus lognormal noise, preserving district totals.
- Commodity catalogue extended from the 25 real ledger items to about 60 PHC-level NLEM medicines using consumption-per-case ratios (WHO Managing Drug Supply norms), driven by the real disease counts.
- Time shifted: 2017-18 to 2019-20 patterns play as 2024-25 to 2026-27, rescaled to Health Dynamics 2023-24 facility counts and projected population.
- Staff attendance and bed occupancy fully simulated, seeded from RHS staffing gaps and RHS bed norms (PHC 4 to 6 beds, CHC 30).
- Scenarios as multiplier curves on demand and lead time: normal, monsoon diarrhoea surge, dengue season, winter road closure (Ladakh, J&K), cyclone (Andhra, Andaman), state warehouse supply shock.

### Storage
Parquet in the repo for processed HMIS and facility tables. Firestore for live state (current stock, alerts, transfers, entries). BigQuery for history and forecast queries. Raw 30 GB HMIS folder stays local, rebuilt by `scripts/parse_hmis_c2.py`.

## 3. AI layer (approved)

All runtime intelligence is Google. Gemini via AI Studio free tier for language and vision, BigQuery for forecasting, OR-Tools for optimisation, Flower for federated learning. Only public or simulated data is sent to Gemini.

### 3.1 Demand forecasting
- Unit: facility x commodity, weekly horizon of 8 weeks, from monthly history disaggregated to weeks.
- Primary engine: BigQuery `AI.FORECAST` (built-in TimesFM, no training job, ordinary query rate) on district-level series with exogenous columns: rainfall (2 and 4 week lags), temperature, relevant disease count (diarrhoea for ORS and zinc, malaria for antimalarials, ANC registrations for IFA).
- PHC-level forecast = district forecast x facility share, share learned from the simulated split and adjusted by recent reported entries.
- Local fallback: seasonal naive plus trend, in Python, so the demo never depends on BigQuery being up.
- Output per series: point forecast and P90. Stored to Firestore nightly and on scenario change.

### 3.2 Days-of-stock and early warning
- days_of_stock = closing_stock / (P90 weekly demand / 7).
- lead_time_days = base by facility type and distance to warehouse, times the scenario multiplier (road closure, cyclone).
- Alert when days_of_stock < lead_time_days + 7 buffer. Severity: red under 7, amber under 14, watch under 30.
- Cause attribution: which driver moved most since last month (cases up, supply missed, unusable stock). This feeds the Gemini explanation.
- Data-quality flag: negative closing stock, sudden zero after high balance, or received > 10x median become "data issue", never "stock-out". HMIS contains such values, and flagging them is an honesty feature.

### 3.3 Redistribution optimiser
- OR-Tools min-cost flow per district, escalating to neighbouring districts when the district total is short.
- Constraints: donor stays above 21 days, one transfer per donor per commodity per week, max distance by scenario, expiry-first (earliest expiring lot moves first), vehicle capacity by facility type.
- Cost = distance km + penalty for donor dropping below 30 days + fixed cost per trip.
- Distances from Google Maps Distance Matrix, cached per facility pair; haversine fallback offline.
- Output: ranked transfer proposals with reason codes, approved in one tap; approval writes a Transfer and sends confirmations.

### 3.4 Gemini services (model: gemini-2.5-flash or newer flash on free tier; structured JSON output everywhere)
1. **Briefing writer.** Input: top alerts, proposed transfers, week-on-week trend, scenario. Output: 3 to 4 sentences in English or Hindi, plus a one-line headline. Deterministic prompt, JSON schema enforced.
2. **Explain this.** Any alert or transfer to a plain-language explanation citing the actual numbers and the cause attribution. Same schema.
3. **Ask the district.** Two modes, one toggle.
   - *Guided (default):* natural language to one of about 20 predefined query shapes via function calling (rank facilities by days of stock, trend of an item, absent staff, transfers pending, compare districts). Returns rows, a chart spec, and a sentence. Safe by construction.
   - *Advanced (free SQL):* Gemini writes SQL against a read-only replica of the whitelisted schema. The SQL is shown to the user, editable, and run only after a static check: single SELECT statement, allowlisted tables and columns, no DDL/DML, row cap 500, 10 second timeout, executed under a read-only database role. Errors are returned to Gemini once for a self-correction attempt, then surfaced. Officers see the guided mode; a "show SQL / advanced" switch reveals the free mode for analysts and judges.
   Hindi and English in both modes.
4. **Register reader.** Photo of the paper stock register to JSON rows (commodity, quantity, unit, confidence). Rows under 0.7 confidence are echoed back for confirmation before writing.
5. **Voice entry.** Hindi (and English) audio sent directly to Gemini, no Speech-to-Text. Transcript to the same JSON rows. Confirmation returned as text in the same language; TTS optional.
6. **Weekly brief.** Alerts, transfers, resilience score, and trends to a two-page PDF for the District Magistrate.
7. **HDI table OCR (build-time, not runtime).** Scanned Health Dynamics of India pages to district PHC and staffing tables.
Rules: system prompt forbids clinical advice; every response carries source refs; no personal data is sent; prompts and outputs logged locally for the demo, not to third parties.

### 3.5 Federated learning demo

**Decision 9 Sep 2026 (user): India-only federation.** Tiers: Bihar districts -> state aggregator; demo states -> national aggregator. Hand-rolled hierarchical FedAvg in numpy (transparent, no heavy dependency); a personalised variant fine-tunes the global model locally. Brazil is parked and not part of the build. The original two-nation text below is retained for history.
- Framework: Flower. Two clients: India (simulated PHC ledger seeded from HMIS) and Brazil (real Hórus ledger, product codes mapped to NLEM names for shared commodities like ORS, albendazole, amoxicillin).
- Model: small gradient-boosted or MLP demand model on lag and weather features, shared architecture, FedAvg for 5 rounds.
- Shown: per-round MAE for local-only versus federated on each node, and a counter "patient records that crossed the border: 0".
- Two modes on the panel: *Replay* (pre-computed rounds, loads instantly, used in the video and as the safe default) and *Run live* (starts two Flower clients in-process on the backend, streams round-by-round metrics to the panel over a websocket, 5 rounds in under 60 seconds on a small model). Both are built; Demo Day opens on Replay and switches to Run live for the judges.

### 3.6 Evaluation (judge-proof)
- Backtest: fit on April 2017 to December 2019, hold out January to March 2020. Report MAPE by commodity and state.
- Stock-out warning quality: precision and recall of red alerts against HMIS item 14.17 and against simulated stock-outs in the held-out window.
- Published in the README as a table with the exact script that produced it.

### 3.7 Resilience score
Per district and state, 0 to 100: weighted mix of median days of stock (40), share of PHCs under 14 days (20), staffing gap versus sanctioned (20), median transfer latency (10), data timeliness (10). Shown on the map and in the deck's league table.

## 4. UX flows and screens (approved)

Design principle: the officer never analyses, the system does. Every screen opens on a decision, not a chart. No Figma: the visual design is produced directly in code by the AI coding agent (decided 6 Sep), following the direction in 4.9. The team reviews on the deployed staging link and gives feedback there.

### 4.1 Shell
- Top bar: district and state switcher (typeahead across all 36 states, demo set pinned), language toggle EN / HI, scenario dial (visible in demo mode only), ask-the-district bar.
- Left rail, three icons only: Briefing, Dispatch, Ask. Settings and the federated panel live under a fourth "System" icon.
- Every number carries a small provenance badge on hover or long-press: HMIS real, Simulated, Reported today, Forecast.
- Offline banner with last-sync time when the backend is unreachable; cached data stays readable.

### 4.2 Screen 1: Morning briefing (home)
- Headline card (Gemini): one sentence in bold, three sentences under it, generated for this district and today. Regenerates on scenario change. Shows a "why" link that opens explain-this.
- Map: district boundary, PHC dots coloured by worst days-of-stock, CHC and DH as larger markers, district warehouse as a square. Tap a dot for the facility card. Cluster at zoom-out; state and national view use choropleth by resilience score.
- Alert list under the map, sorted by severity then days: facility, commodity, days left, cause chip (cases up / supply missed / written off / data issue), and a single action button that deep-links to the matching transfer on Dispatch or to "call PHC".
- Right column: resilience score gauge for the district with the state rank, and three trend sparklines (OPD, top disease, red alerts) week on week.
- Empty and quiet states are designed: "No PHC under 14 days. Next review Monday." is a real screen, not an error.

### 4.3 Screen 2: Dispatch board
- Two columns: Needs (deficit facilities, red and amber) and Offers (surplus facilities, above 30 days). Matched pairs are drawn as cards in the centre with quantity, distance, ETA, and a reason line.
- One-tap Approve per card; Approve all for a district with a confirmation sheet listing every transfer. Reject opens a two-option reason picker (donor can't spare, road closed) that feeds back into the optimiser.
- Approved transfers move to an In transit lane with a status stepper: proposed, approved, picked up, delivered, each confirmable from the PHC side by WhatsApp.
- Route preview per card on the map with Maps Distance Matrix ETA; scenario multipliers shown explicitly ("road closure: +2 days").
- Cross-district transfers are visually distinct and require the state-level role.

### 4.4 Screen 3: Ask the district
- Single input bar, voice button, example chips (top questions). Answer renders as a sentence, a chart, and a table with export. Guided mode by default; "Advanced" switch shows the generated SQL in an editor with a Run button and the static-check result.
- Conversation history down the page, each answer pinned with its provenance badge and a "add to weekly brief" action.

### 4.5 PHC staff channel (WhatsApp, no app)
- Onboarding: facility sends "HI" to the number, receives a Hindi and English menu with two actions: send a voice note with stock, or send a photo of the register page.
- Voice: "ORS ke 40 packet bache hain, zinc khatam" returns a confirmation card in the same language listing parsed rows with quantities; reply "1" to confirm, "2" to correct. Unconfirmed after 24 hours becomes a reminder.
- Photo: same flow, rows under 0.7 confidence are marked and asked about individually.
- Transfer notifications arrive on the same thread with a "delivered" quick reply.
- Fallback for the demo without a WhatsApp Business account: an identical web chat widget that mimics the thread, clearly labelled as simulated channel. Both are built; the real WhatsApp path is enabled if the sandbox number is approved in time.

### 4.6 System panel
- Federated ledger: two flag cards (India, Brazil) with node stats, round-by-round MAE chart for local versus federated, the zero-records-crossed counter, Replay and Run live buttons.
- Data health: last HMIS load, facility count, share of facilities reporting this week, data-issue flags by district.
- Scenario dial (also in top bar): normal, monsoon surge, dengue season, winter closure, cyclone, warehouse shock, with an intensity slider.

### 4.7 Weekly brief
- One button on the briefing screen. Gemini writes a two-page PDF: headline, resilience score and rank, red alerts resolved and open, transfers completed, next week's forecast risks, data issues. Officer can edit the summary text before export. Stored under the district for history.

### 4.8 Accessibility and constraints
- Touch targets 44 px minimum, works at 360 px width, Hindi Devanagari typography tested, colour is never the only signal (icons and numbers accompany red/amber/green), keyboard navigable, contrast AA.
- Performance budget: briefing screen interactive under 2 seconds on a mid-range Android over 3G; map tiles cached.

### 4.9 Visual design direction (built in code, no Figma)
- Tone: calm and authoritative, closer to a well-made government service than a startup dashboard. Generous whitespace, dense only where the officer needs density (alert list, dispatch cards).
- Type: Inter for Latin, Noto Sans Devanagari for Hindi, both from Google Fonts. Numbers in tabular figures.
- Colour: one deep teal primary for actions and the brand, warm sand neutrals for surfaces, and a semantic scale for days-of-stock (red, amber, green) chosen to remain distinct under deuteranopia and always paired with an icon and the number. Choropleth uses a single-hue sequential ramp. Light theme is primary; dark theme supported through tokens.
- Components: one design-token file (spacing, radius, type scale, colour) shared by every screen; a small component set (card, badge, gauge, sparkline, stepper, map marker, chat bubble). No component library beyond a headless one for accessibility (menus, dialogs).
- Motion: only where it carries meaning: alerts re-sorting after the scenario dial moves, transfer cards sliding to In transit, the federated round counter ticking.
- Review loop: every screen is deployed to staging as it lands; the team comments; changes ship the same day.

## 5. Deployment, testing, and the plan (proposed)

### 5.1 Architecture
- **Frontend:** React + Vite + TypeScript, Firebase Hosting (Spark plan, free). Map via MapLibre with OpenStreetMap tiles by default; Google Maps JS where the Maps key is available.
- **Backend:** Python 3.12 FastAPI on Cloud Run, one service, one container. Holds the days-of-stock engine, optimiser (OR-Tools), Gemini client, forecast fallback, Flower runner, WhatsApp webhook, and the read-only SQL sandbox. Min instances 1 during evaluation to avoid cold starts when a judge opens the link.
- **Data:** BigQuery dataset with the full national HMIS history (Parquet loaded once) and forecast queries. Firestore for live state: current stock per facility, alerts, transfers, entries, scenario, briefing cache. A compact DuckDB file with the 13-unit demo set ships inside the container as the offline fallback.
- **AI:** Gemini API via AI Studio key (free tier). Maps Distance Matrix with a cache in Firestore. OR-Tools and Flower run in-process.
- **Secrets:** Google Secret Manager on Cloud Run; `.env` locally. Never in the repo.
- **Auth:** demo role picker (District Officer, State Officer, PHC staff) backed by Firebase anonymous auth for session identity. No real accounts; stated in the README.
- **Degrade paths, all built:** no BigQuery, use the Python seasonal forecast; no Maps key, use haversine; no WhatsApp number, use the web chat widget; Gemini rate-limited, serve the cached briefing and show a "regenerating" state; backend down, frontend shows cached data with the offline banner.

### 5.2 Environments
- **Local:** `make dev` starts backend, frontend, and the Firestore emulator; needs only the Gemini key. Everything in the hero scenario runs locally.
- **Staging:** Cloud Run + Firebase preview channel, deployed on every merge to main from GitHub Actions. This is the team's review surface.
- **Production:** the submitted link. Deployed by tag. Frozen 28 Sep except for hotfixes. Uptime check every 5 minutes with an alert email through 23 Oct.

### 5.3 Repository layout
```
sanjeevani-grid/
  README.md              problem, architecture diagram, setup, evaluation table, CREDITS
  backend/               FastAPI app, engines, gemini/, optimiser/, federated/, tests/
  frontend/              React app, tokens/, components/, screens/
  data/
    processed/           Parquet: hmis_c2 (national), facilities, commodities, population
    scenarios/           scenario multiplier curves
    raw/                 small verified samples with SOURCES.txt (large raw stays local)
  scripts/               fetch_datagovin.py, parse_hmis_c2.py, build_facilities.py,
                         ocr_hdi.py, simulate.py, backtest.py, federated_replay.py
  docs/                  specs, research, data sources, pitch material
  .github/workflows/     test + deploy
```

### 5.4 Testing
- **Unit:** parsers (golden files from real HMIS rows), days-of-stock arithmetic, alert thresholds and cause attribution, data-issue flags, optimiser constraints (donor floor, expiry-first, distance cap), scenario multipliers, SQL static checker (rejects DML, non-allowlisted tables, multiple statements).
- **Contract tests for Gemini:** every prompt has a JSON schema; tests validate structure, language, and absence of clinical advice on a fixed set of inputs. Recorded responses are replayed in CI so tests do not spend quota.
- **End-to-end:** Playwright runs the hero scenario against staging: open Araria, move the dial, see three red alerts, approve two transfers, confirm from the PHC widget, open the federated panel. This is also the script for the video.
- **Backtest:** `scripts/backtest.py` produces the evaluation table in the README from the held-out January to March 2020 window.
- **Performance:** Lighthouse on the briefing screen; target interactive under 2 s on simulated 3G mid-range mobile.
- **Verification rule:** nothing is reported as done without the command and its output.

### 5.5 Day-by-day plan (6 to 30 September)
| Dates | Build (AI coding agent) | Team |
|---|---|---|
| 6 to 8 Sep | Finish HMIS parse to Parquet; facility roster (OSM + Karnataka + RHS counts); simulator v1 for the 13 units; DuckDB demo file; repo, CI, local `make dev`. | Set up Gemini key, Cloud free trial, Firebase project, GitHub org. Email organisers. Start IDSP browser download. |
| 9 to 11 Sep | Days-of-stock engine, alerts, cause attribution, data-issue flags; scenario dial backend; Briefing screen v1 with tokens and map. Staging live. | First review of Briefing on staging. Draft persona and hero script. |
| 12 to 14 Sep | Forecast (BigQuery AI.FORECAST + Python fallback); Gemini briefing writer and explain-this; resilience score. | Impact numbers research (PHC counts, footfall, stock-out studies). |
| 15 to 17 Sep | Optimiser + Dispatch board; Maps distances with cache; transfer stepper. | Review Dispatch. Deck outline. |
| 18 to 20 Sep | Ask-the-district guided and advanced modes; PHC WhatsApp flow with web widget; register photo and Hindi voice through Gemini. | Test voice and photo entry with real register photos and Hindi notes. |
| 21 to 23 Sep | Federated demo (replay + live); System panel; weekly brief PDF; HDI OCR for facility tables; backtest and README evaluation table. | Deck draft. Video storyboard from the Playwright script. |
| 24 to 26 Sep | Polish to design direction; accessibility pass; Playwright e2e; performance; CREDITS; production deploy and uptime check. | Record video. Finalise deck and 2 to 3 line description. |
| 27 to 28 Sep | Bug fixes only. Freeze production 28 Sep. | Dry-run the submission form. |
| 29 Sep | Submit, one day early. | Submit. |
| 1 to 22 Oct | Keep the link alive; prepare judge Q&A sheet; rehearse live federated run. | Rehearse the 5-minute demo weekly. |

### 5.6 Risks and mitigations
| Risk | Mitigation |
|---|---|
| Google Cloud credits or free trial not available | Firebase-only path: Cloud Run replaced by Cloud Functions is Blaze-only too, so the fallback is Render or Fly.io free tier for the backend with Gemini still doing all AI; disclosed in README. |
| Gemini free-tier rate limits during judging | Briefing and explanations cached per district per day; retry with backoff; upgrade to Tier 1 (card, no minimum) if limits bite. |
| WhatsApp Business sandbox not approved in time | Web chat widget, identical flow, labelled simulated. |
| BigQuery forecast unavailable or costly | Python seasonal fallback is the tested default; BigQuery is the upgrade. |
| Scope creep in the last week | Feature list frozen 21 Sep; anything new goes to a "v2" section of the README. |
| Data quality surprises in HMIS | Data-issue flags are a feature; backtest reports them. |
| Judges open the link on a slow connection | Min instances 1, cached data, map tiles cached, 2 s budget. |

### 5.7 Submission mapping
| Required | Where it comes from |
|---|---|
| Source code, public repo | GitHub, with dated history and CREDITS |
| Demo video 3 to 5 min | Recorded from the Playwright hero script on production |
| Pitch deck 10 to 12 slides | Team, using the resilience league table, impact numbers, architecture diagram from README |
| Brief description | Team, 2 to 3 lines |
| Deployed link | Firebase Hosting production URL |

