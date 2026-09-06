# Verified data sources and APIs

Verified 5 September 2026 by direct requests from this machine. No sign-ups, no logins (except the publicly documented DHIS2 demo account), no scraping of interactive portals. Everything marked "downloaded" is in `data/raw/` with a `SOURCES.txt` beside it listing URL, date, and licence. The three detailed lane reports, including exact error text for every failed URL, are in `docs/research/`.

States checked: Bihar, Kerala, Uttar Pradesh, Madhya Pradesh, Arunachal Pradesh, Assam, Karnataka, Rajasthan, Jammu & Kashmir.

---

## 1. Needs your action

| # | What | Why | How |
|---|---|---|---|
| 1 | **HMIS pull** (you are doing this) | Only source of monthly footfall and disease counts by district and block | C2 itemwise for 9 states (FY 2017-18 to 2019-20, plus 2020-21 separately), F.1 for 9 states, F.2 for Bihar and Assam. Save under `data/raw/hmis/` as agreed. |
| 2 | **data.gov.in API key** | Unlocks the official NFHS-5 district table, RHS-derived PHC counts, staffing vacancies, and Karnataka facility lists via API | Register with an email at https://data.gov.in, key appears under My Account. Free. Paste the key into a local `.env` file, never into the repo. |
| 3 | **Health Dynamics of India 2022-23 PDF** (the renamed Rural Health Statistics) | Latest PHC counts, staffing in position vs sanctioned, district-wise facility tables. Every scripted download path returned HTTP 500 or 404. | Open https://mohfw.gov.in in a browser, go to Documents then Publications, download the PDF, save to `data/raw/india-gov/`. |
| 4 | **IDSP weekly outbreak PDFs** | Basis for the outbreak scenarios. The IDSP site refused every connection from here (timeouts and connection refused). It may be reachable from an Indian residential IP. | Try https://idsp.mohfw.gov.in, Weekly Outbreaks section, from your browser. Download 8 to 10 monsoon-week reports from 2019. If it fails for you too, we fall back to NCVBDC and NFHS disease tables and say so. |
| 5 | **Google accounts** | Gemini key for the product, Cloud free trial for hosting | AI Studio key at https://aistudio.google.com (no card). Cloud free trial at https://cloud.google.com/free (card for identity, no auto-charge). Firebase project on the Spark plan. |
| 6 | **Email the organisers** | The tools page says AI Studio and Vertex credit details are pending | Ask what credits registered teams get and when. |

Nothing else in this document needs you.

---

## 2. Indian government sources: verdicts

| Source | Verdict | What we have | Notes |
|---|---|---|---|
| data.gov.in | Use (API) | Catalogue search works without a key. Resource download needs the free key. | Licence: Government Open Data Licence India. Resource IDs for the 12 most useful datasets are in `docs/research/verify-india-gov-sources.md`. Facility-level PHC lists exist only for Karnataka among our 9 states. |
| NFHS-5 district factsheets | Use | Downloaded three compiled CSVs. Best one: 705 districts, 104 indicators, MIT licence, all 9 states present. | Official IIPS pages are broken (SSL errors and 404s). The official compiled table is also on data.gov.in once you have a key. |
| NCVBDC malaria, dengue, chikungunya | Use | Downloaded: malaria state-wise 2022 to July 2026, malaria district-wise annual report 2025 (14 pages), dengue state-wise 2021 to Feb 2026 as CSV, chikungunya 2021 to Apr 2026. | All 9 states present in malaria and dengue. PDFs need table extraction. Jammu & Kashmir appears as "J & K" in the dengue table. |
| Census 2011 district population | Use | Downloaded the official Primary Census Abstract: 640 districts, 94 columns, total and rural and urban rows. | 2011 boundaries differ from NFHS-5 (705 districts). District name reconciliation is a known chore. |
| NLEM 2022 | Use | Downloaded the official CDSCO PDF, 135 pages, 384 medicines, each tagged P, S, or T for PHC, secondary, tertiary. | This is our drug catalogue. The P-tagged medicines define what a PHC should stock. |
| Health Dynamics of India 2022-23 | Manual | Not downloaded. See action item 3. | Headline figures from the press release: 31,882 PHCs and 6,359 CHCs as of 31 March 2023. |
| IDSP weekly reports | Manual, possibly skip | Not downloaded. See action item 4. | Only a quarterly NCDC newsletter was reachable. |
| State open data portals | Manual | Karnataka has PHC and CHC lists through the data.gov.in API. Kerala's portal has no obvious facility CSV. Rajasthan's portal timed out twice. Nothing found for the other six. | Not worth more time. |

---

## 3. Open APIs: verdicts

| API | Auth | Status | Licence | Use for |
|---|---|---|---|---|
| Open-Meteo historical archive | None | Working. Daily rainfall and temperature for Patna and Guwahati, June to Sept 2024, saved. | CC-BY 4.0, non-commercial free tier, under 10,000 calls a day | Monsoon and heat features for forecasting, any state, back to 1940. Works identically for Brazil. |
| Open-Meteo 7-day forecast | None | Working. | Same | The "next week" signal in the early-warning engine. |
| Brazil Ministry of Health open API (apidadosabertos.saude.gov.br) | None | Working. 87 endpoints. | Government open data, spec under MIT | **Federated partner.** See section 4. |
| Brazil DATASUS FTP | Anonymous | Reachable but slow. Facility file for one state downloaded. Large directory listings time out. | Government open data | Deep historical archive if needed. Files are in a compressed DBF format that needs a decoder library. |
| OpenStreetMap Overpass | None | Working. 320 health facilities in a box around Patna, including 31 named PHC, APHC, and UPHC facilities with coordinates and block names. | ODbL, attribution and share-alike required | Real PHC names and coordinates to seed the Bihar facility roster. Coverage in Arunachal and J&K unverified. |
| WHO Global Health Observatory | None | Working. Hospital beds per 10,000 for all five BRICS nations saved. | CC BY-NC-SA 3.0 | National baselines for calibrating the simulator. Their "in" filter returns a server error, use chained "or" instead. |
| World Bank indicators | None | Working. Beds and physicians per 1,000 for BRICS saved. | CC-BY 4.0 | Same as WHO. Ask for 400 rows per page or results truncate. |
| DHIS2 public demo | Demo login | Working at the current instance URL. Data is synthetic Sierra Leone, 2025 only. | BSD-3 software, demo data | Schema reference only. Not for our data. |
| ABDM Health Facility Registry | Required | Blocked. Redirects to a login application, API returns 403. Stopped without any bypass attempt. | | Skip. |
| India Meteorological Department | | Blocked. 401 and 403 on all endpoints. No public API. | | Skip. Open-Meteo replaces it. |

---

## 4. Brazil as the federated partner: what changed

The Brazilian health ministry publishes, without login, a national pharmacy stock ledger at facility level. For each facility it lists product, lot number, expiry date, quantity on hand, and coordinates. One municipal pharmacy returned 158 products and 769 lot rows. It also publishes the list of primary care units (the PHC equivalent), a hospital and beds endpoint, and dengue and chikungunya notifications by municipality.

This is exactly the entity model our Indian PHC simulator needs, and it is real. The recommendation is now firm: **Brazil is the federated partner, not Kerala.** The story becomes "India's node runs on simulated PHC stock grounded in HMIS, Brazil's node runs on real ministry stock data, and the shared model learns from both without either country's data crossing the border."

Caveats to handle in the build: Portuguese labels, Brazilian product codes need a mapping to the medicine names in NLEM, the API only exposes recent monthly stock positions so we snapshot it during the build, and facility records carry phone and email fields that we strip before anything is shown.

---

## 5. Google free tiers: what matters for the build

| Service | Free without card | Notes |
|---|---|---|
| Gemini API via AI Studio | Yes | Free models include Gemini 2.5 Flash, 2.5 Pro, 3.5 Flash, 3.8 Flash and the Flash-Lite variants. All accept image and audio input directly and support structured JSON output. Per-model rate limits are no longer published, read them in AI Studio on day one. Free-tier prompts may be used by Google for product improvement and may be human-reviewed, so only synthetic or public data goes through it. Terms prohibit clinical use, which we are not doing. |
| Gemini audio input | Yes | Hindi voice can go straight to Gemini. **Cloud Speech-to-Text is no longer needed.** |
| Firebase Spark plan | Yes | Hosting, Firestore, Auth. Cloud Functions need the Blaze plan. |
| Google Cloud free trial | Card for identity | 300 USD for 90 days, does not auto-charge, account closes unless you manually upgrade. |
| Cloud Run | Billing account needed | Generous monthly free allowance. |
| BigQuery | Billing account needed | 1 TiB of queries and 10 GiB storage free per month. A no-card sandbox also exists. |
| BigQuery ML ARIMA_PLUS | Billing account needed | **Model training is not in the free tier** and is billed per TiB processed. Prediction is free. Use BigQuery's built-in forecasting function (TimesFM based, no training step, ordinary query rate) instead. |
| Vertex AI Forecasting | Billing account needed | Roughly 170 USD per default training job. **Avoid.** |
| Maps Platform Distance Matrix | Billing account needed | India accounts get 70,000 free calls per month per SKU under the 2025 pricing model. More than enough. |
| Translation API | Billing account needed | 500,000 characters a month free. Optional, Gemini can translate. |
| OR-Tools | Yes | Open source, Apache 2.0, installs with pip. |

Stack decisions this changes:
- Voice: Gemini audio input replaces Cloud Speech-to-Text.
- Forecasting: BigQuery's built-in forecast function replaces ARIMA_PLUS training. Vertex AI Forecasting is dropped.
- Everything needing a billing account waits for the free trial or organiser credits. Local development starts now with the Gemini key alone.

---

## 6. What is in `data/raw/`

`data/raw/india-gov/` (32 MB): NLEM 2022 PDF, Census 2011 district table, three NFHS-5 compiled CSVs, NCVBDC malaria (2 PDFs), dengue CSV, chikungunya PDF, one NCDC newsletter, SOURCES.txt.

`data/raw/apis/` (1.3 MB): Open-Meteo archive and forecast JSON, WHO and World Bank BRICS indicators, Brazil stock ledger and facility samples, Brazil API spec, DATASUS file and field list, Overpass Patna facilities, DHIS2 samples, SOURCES.txt.

---

## 7. Errors and blockers, in one place

| Target | What happened |
|---|---|
| idsp.mohfw.gov.in | Timed out on https, http, and with certificate checks off. Connection refused via a second route. |
| hmis.mohfw.gov.in download endpoint | HTTP 500 for every publication path tried. |
| mohfw.gov.in | Renders only in a browser. Scripted fetch returns an empty shell, second route returned 403. |
| rchiips.org (NFHS official) | SSL certificate error, then 404 on every documented page. |
| rajasthan.data.gov.in | Timed out twice. |
| nvbdcp.gov.in (old NCVBDC host) | No response. Same file path works on ncvbdc.mohfw.gov.in. |
| facility.abdm.gov.in | Redirects to login application, API 403. Requires ABDM credentials. |
| IMD | 401 and 403. No public API. |
| DATASUS FTP | Slow. Large directory listings time out at 90 seconds, single file downloads succeed on retry. |
| Brazil old CKAN portal | Gone. Replaced by apidadosabertos.saude.gov.br. |
| Kaggle "Hospital HMIS Dataset" (checked at your request) | Fully synthetic single-hospital data, not India's HMIS. Not used. MIT licence, schema is a fair reference. |

No portal blocked this machine. All failures were server-side or structural.

---

## 8. Update 6 September: manual HMIS and HDI downloads checked

The user downloaded the full C2 itemwise HMIS export (2008-09 to 2020-21, 30 GB) and eight RHS / Health Dynamics of India reports. Full check in `docs/research/hmis-download-check.md`. Headlines:

- District-level monthly files for 2017-18, 2018-19, 2019-20 are complete for all 36 states, including all 9 target states. Files are HTML tables with a .xls extension and parse cleanly.
- HMIS sections M17, M19, M20 carry real district-level monthly stock ledgers (opening balance, received, unusable, distributed, closing) for about 25 commodities including ORS, zinc, IFA, albendazole, vaccines, syringes. Item 14.17 is the stock-out rate for essential drugs. The Indian node now has real stock data for those items.
- HDI 2022-23 and 2023-24 PDFs are scanned images with no text layer. OCR required (Gemini vision).
- Action items 1 and 3 in section 1 are done. Item 4 (IDSP) is still open.
