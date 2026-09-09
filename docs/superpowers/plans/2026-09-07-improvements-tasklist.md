# Improvements task list (7 Sep 2026)

Brainstormed 7 Sep. Brazil and the federated demo are excluded until the user decides on the partner.
Every task lists the data it needs and how that data is obtained. Rule: public data only, downloads or documented APIs, no scraping of interactive portals, no logins, no personal data. "On disk" means already verified and stored under `data/` with a SOURCES.txt.

Legend: effort in build-days for Claude Code; rubric = the judging criterion it mainly serves.

## A. Score movers

- [ ] **A1. With-versus-without simulation** (2 d, Impact Potential)
  Re-run the 36-month ledger with the redistribution engine active each month; report stock-out facility-months avoided per unit; show on Today and in README.
  Data: simulated ledger (on disk, derived from HMIS real district counts). No new data.

- [x] **A2. National view on real data** (done 9 Sep as the state officer's India tab) (2 d, Depth and Reach)
  India map coloured by district resilience for all 36 states from the real HMIS district ledgers; 14 demo units drill down to PHC level; others stop at district and say so.
  Data: HMIS district ledger 2017-2020 (on disk, GODL). District boundaries: none needed for a dot or choropleth-by-centroid version; if polygon boundaries are wanted, use the Survey of India / data.gov.in district boundary shapefile or the DataMeet community GeoJSON (both public, downloadable, licensed for reuse; check the licence line on the dataset page before adding). No scraping.

- [ ] **A3. Rain-driven forecasting** (1.5 d, AI/Technical Execution)
  Open-Meteo 7-day forecast per district as an exogenous multiplier for diarrhoea and malaria commodities; Today shows the rain reason.
  Data: Open-Meteo forecast API (verified 5 Sep, no key, CC-BY 4.0, under 10,000 calls/day; we need about 330 calls a day at most, cached per district per day). Attribution already in README.

- [ ] **A4. Alerts grouped into actions** (1.5 d, Problem-Solution Fit)
  Today groups alerts by cause into action cards with one button each; facility rows fold under the group.
  Data: none new.

- [ ] **A5. Route batching** (2 d, AI/Technical Execution)
  OR-Tools vehicle routing: trips from donors or the district warehouse serving several recipients; manifest per trip.
  Data: facility coordinates (on disk: OpenStreetMap ODbL plus simulated); distances by haversine now, Google Maps Distance Matrix later when a billing account exists (documented API, not scraping).

- [ ] **A6. Expiry and wastage** (2 d, Deployability, Impact)
  Simulated lots with expiry per facility and commodity; "expiring in 60 days" moves lots into transfers first; rupees of wastage avoided.
  Data: shelf-life months per commodity (on disk, from our catalogue). Unit prices: Jan Aushadhi published price list (public PDF/CSV on janaushadhi.gov.in, download once, cite) or the NLEM-linked ceiling prices from NPPA (public notifications). Do not scrape any e-commerce site for prices. If neither list is downloaded, use a small hand-entered table marked "indicative".

- [ ] **A7. Guided demo tour** (1 d, AI/Technical Execution, evaluation safety)
  Five-step overlay: open Araria, move the dial, watch alerts flip, approve a transfer, ask a question.
  Data: none.

- [x] **A8. Weekly brief** (done 9 Sep as the District Magistrate persona) (1 d, Deployability)
  Two-page printable brief for the District Magistrate, Gemini-written, from the summary and transfers.
  Data: none new. Gemini calls: about 1 per district per week, cached.

## B. Improvements to what exists

- [ ] **B1. Headline quality** (0.5 d): prompt leads with the most consequential fact; pass block names and next delivery date. Data: block from OpenStreetMap subdistrict tag where present, otherwise "district".
- [ ] **B2. Forecast accuracy** (1 d): hierarchical pooling of district seasonality with facility scale; README shows before and after. Data: none new.
- [ ] **B3. Fewer, ranked proposals** (0.5 d): rank by patient-days protected; top ten visible. Data: none.
- [ ] **B4. Merge duplicate facility names** (0.5 d): normalise punctuation in the roster build. Data: none new; rebuild from cache.
- [ ] **B5. Staffing and bed alerts** (1 d): doctor absent over 10 days; CHC occupancy over 90 percent during a surge; referral suggestion to the nearest facility with free beds. Data: simulated staff and beds (on disk), RHS staffing vacancies (on disk, GODL).
- [x] **B6. Real HMIS stock-out rate (done 9 Sep in the India drill-down) on the district page** (0.5 d): item 14.17 shown beside our alerts and used as ground truth in the backtest. Data: on disk.
- [x] **B7. Precompute all units at startup** (hero unit at startup and on scenario change; others on demand) (0.5 d). Data: none.

## C. Reach and deployability extras

- [ ] **C1. More languages** (0.5 d): Assamese, Telugu, Kannada string files translated once by Gemini, reviewed, committed. Data: none.
- [ ] **C2. Offline-capable frontend** (1 d): progressive web app caching the last briefing. Data: none.
- [ ] **C3. Connectors page and CSV export** (0.5 d): how HMIS, e-Aushadhi, ABDM plug in; export in a drug-corporation-style CSV. Data: none; documentation only. No calls to those systems.
- [ ] **C4. Privacy page** (0.5 d): what is stored, no patient data, DPDP Act fit. Data: none.
- [ ] **C5. Alert digest message preview** (0.5 d): the 8 am WhatsApp or SMS in three lines. Data: none; no message is sent.

## D. Not doing

IoT sensors, blockchain, patient-facing app, full authentication, bed forecasting beyond occupancy.

## Data compliance summary for this list

| Source touched | How | Licence | Scraping? |
|---|---|---|---|
| HMIS district ledgers and counts | Already on disk from the user's manual portal download and the data.gov.in API | GODL | No |
| Open-Meteo forecast | Documented public API, cached daily, attributed | CC-BY 4.0 | No |
| OpenStreetMap facilities | Already on disk via Nominatim and Overpass under their usage policies | ODbL | No |
| District boundaries (optional, A2) | One-time download of a published GeoJSON or shapefile | Check dataset page (GODL or CC-BY) | No |
| Jan Aushadhi or NPPA prices (optional, A6) | One-time download of a published list | Government publication | No |
| Gemini | Documented API, free tier, paced, synthetic data only | Google terms | No |

Nothing in this list requires logging into any portal, reading any interactive dashboard, or collecting any personal data.


## Added outside the list
- [x] Google predictive modelling in BigQuery (TimesFM, ARIMA_PLUS), backtest in README, cached forecasts used hierarchically (9 Sep)
- [x] Five personas with own screens and flows (9 Sep)
- [x] India-only hierarchical federated learning with replay and live run (9 Sep, user decision)
