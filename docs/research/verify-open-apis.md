# Public API verification — Indian PHC medicine-stock forecasting + BRICS federated partner

Tested 2026-09-05 (04:35–05:25 UTC) from macOS with curl 8 / python3 3.9 stdlib. Every status code and sample below comes from a real call made today; raw responses are in `samples/apis/` (index: `samples/apis/SOURCES.txt`). No API keys or sign-ups were used; the only credential is the publicly documented DHIS2 demo login (admin / district).

Verdict legend: (a) = seeding an Indian PHC simulator, (b) = BRICS federated partner dataset, (c) = forecasting features.

---

## 1. Open-Meteo Historical Weather (archive-api)

- **Endpoint tested:** `GET https://archive-api.open-meteo.com/v1/archive?latitude=25.594&longitude=85.137&start_date=2024-06-01&end_date=2024-09-30&daily=precipitation_sum,temperature_2m_max,temperature_2m_mean&timezone=Asia/Kolkata` (Patna) and the same for Guwahati (26.144, 91.736).
- **Auth needed:** No. No key, no header, no User-Agent requirement.
- **HTTP status:** 200 (both). Response time well under 2 s.
- **Response shape:** top-level keys `latitude, longitude, generationtime_ms, utc_offset_seconds, timezone, timezone_abbreviation, elevation, daily_units, daily`. `daily` is column-oriented: `daily.time[]` (ISO dates) plus one parallel array per variable. 122 rows each (2024-06-01 → 2024-09-30). Units: mm and °C.
  - Patna first 5 days precipitation: `[0.0, 0.0, 1.7, 0.0, 0.0]`, tmax `[38.0, 38.1, 38.4 …]` (pre-monsoon heat).
  - Guwahati first 5 days precipitation: `[3.9, 7.3, 21.2, 15.2, 7.1]`, tmax `[30.8, 31.2, 31.4 …]`.
- **Rate limits (from https://open-meteo.com/en/terms, fetched today):** free non-commercial tier is "less than 10'000 API calls per day, 5'000 per hour and 600 per minute". A 122-day daily pull counts as ~1 call (they weight by variables × days, so keep pulls modest). Commercial use requires a paid key.
- **Licence:** data CC-BY 4.0 (attribution "Weather data by Open-Meteo.com"). Archive is ERA5/ERA5-Land reanalysis (~9–25 km grid), so it is modelled, not station-observed, data.
- **Files:** `openmeteo_archive_patna_2024jun-sep.json`, `openmeteo_archive_guwahati_2024jun-sep.json`.
- **Usefulness:** (a) Excellent — gives per-district daily rainfall/temperature back to 1940 for any lat/lon; the 9 states of interest can all be covered with one call each. (b) Works identically for Brazil/any BRICS coordinates, so the same feature pipeline serves both federated nodes. (c) Best-in-class free source for monsoon-driven demand features (rain-lagged diarrhoea/malaria/dengue proxies, heat-wave ORS demand).

## 2. Open-Meteo Forecast (7-day)

- **Endpoint tested:** `GET https://api.open-meteo.com/v1/forecast?latitude=25.594&longitude=85.137&daily=precipitation_sum,temperature_2m_max,temperature_2m_mean&forecast_days=7&timezone=Asia/Kolkata`
- **Auth needed:** No. **HTTP status:** 200.
- **Response shape:** identical schema to the archive. Returned dates 2026-09-05 → 2026-09-11; precipitation `[3.5, 3.7, 9.1, 18.8, 25.5, 5.4, 1.8]` mm, tmax `[31.9 … 31.3]` °C.
- **Limits/licence:** same as §1 (up to 16 forecast days supported).
- **File:** `openmeteo_forecast_patna_7d.json`.
- **Usefulness:** (c) Yes — lets the demo show "next-week" exogenous features driving a reorder alert. (a)/(b) same as §1.

## 3. DHIS2 public demo (play.dhis2.org)

- **Discovery:** `https://play.dhis2.org` now 301-redirects to `https://im.dhis2.org/public/instances` (an SPA). Its backing JSON is `GET https://api.im.dhis2.org/instances/public` (200, no auth). Live public instances listed today:
  `https://play.im.dhis2.org/stable-2-43-1`, `stable-2-42-6`, `stable-2-41-9-1`, `stable-2-40-12`, plus `dev`, `dev-2-40 … dev-2-43`. (Guessed patterns like `stable-2-40-x`, `stable-2-42-1` all returned 404 — always resolve via the instances endpoint.)
- **Base URL that works:** `https://play.im.dhis2.org/stable-2-43-1` (DHIS2 2.43.1, revision 9cbfbf3, serverDate 2026-09-05). `/dev` (2.44-SNAPSHOT) also answered 200.
- **Auth needed:** Yes — HTTP Basic `admin:district` (publicly documented demo login). Unauthenticated `/api/organisationUnits` → 302 to login page.
- **Test 1:** `GET /api/organisationUnits?level=4&pageSize=5&fields=id,name,level,parent[name]` → **200**. Shape: `{pager:{page,total:1166,pageSize,nextPage,pageCount:234}, organisationUnits:[{id,name,level,parent:{name}}]}`. Sample: `{"name":"Adonkia CHP","parent":{"name":"Rural Western Area"},"id":"Rp268JB6Ne4","level":4}`. Note: curl needs `-g` because of the `[` in `fields`.
- **Test 2:** `GET /api/analytics?dimension=dx:fbfJHSPpUQD;cYeuwXTCPkU&dimension=pe:202501;…;202512&dimension=ou:ImspTQPwCqd` (ANC 1st / 2nd visit, national) → **200**, 24 rows. Shape: `{headers:[dx,pe,ou,value], metaData:{items,dimensions}, rows:[["fbfJHSPpUQD","202502","ImspTQPwCqd","18786"],…], width, height}`. **Gotcha:** `pe:LAST_12_MONTHS` and `pe:2024xx` both returned 0 rows — the demo DB is populated for calendar 2025 only.
- **Rate limits:** none published; it is a shared demo, be polite. Instances are reset periodically.
- **Licence:** DHIS2 software is BSD-3-Clause; the demo database is synthetic **Sierra Leone** HMIS data (districts/chiefdoms/CHPs) — not Indian and not a real country's live data.
- **Files:** `dhis2_instances_public.json`, `dhis2_orgunits_level4.json`, `dhis2_analytics_sample_2025.json`.
- **Usefulness:** (a) Not as data, but as a **schema/architecture reference** — the orgUnit hierarchy (country→district→chiefdom→facility) and the analytics `dx/pe/ou` cube are exactly what an Indian PHC simulator should emit; DHIS2 also ships a stock-management (LMIS) data model. (b) Could stand in as a "third node" for the federated demo if you need a non-Indian source quickly, but it is synthetic. (c) Monthly service-volume series (ANC visits, etc.) are usable as a demand-proxy pattern.

## 4. WHO Global Health Observatory OData API

- **Endpoint 1:** `GET https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'hospital')` → **200**, 28 indicators. Shape `{"@odata.context", value:[{IndicatorCode, IndicatorName, Language}]}`. Confirmed the right code: **`WHS6_102` = "Hospital beds (per 10 000 population)"**. Also present: `DEVICES03` "Total density per 100 000 population: District/rural hospitals", `DEVICES00` hospitals density.
- **Endpoint 2:** `GET https://ghoapi.azureedge.net/api/WHS6_102?$filter=SpatialDim eq 'IND' or SpatialDim eq 'BRA' or SpatialDim eq 'ZAF' or SpatialDim eq 'RUS' or SpatialDim eq 'CHN'` → **200**, 96 rows.
  - **Gotcha:** the OData `in` operator (`SpatialDimension in ('IND',…)`) returned **HTTP 500 "Server Error"**; use chained `eq … or …`. (The WHO docs page only demonstrates eq/ne/ge/lt/contains/and.)
  - Row shape (25 keys): `Id, IndicatorCode, SpatialDimType, SpatialDim, ParentLocation, TimeDim, TimeDimType, Dim1/2/3(+Type), DataSourceDim, Value, NumericValue, Low, High, Comments, Date, TimeDimensionValue/Begin/End`.
  - Latest values: IND 15.9 (2021), BRA 25.2 (2021), CHN 56.3 (2023), RUS 68.1 (2023), ZAF 22.5 (2010).
- **Auth needed:** No. **Rate limits:** none stated on https://www.who.int/data/gho/info/gho-odata-api.
- **Licence:** WHO GHO data are released under **CC BY-NC-SA 3.0 IGO** (WHO terms of use) — non-commercial; fine for a hackathon, flag if the product goes commercial.
- **Files:** `who_gho_indicators_hospital.json`, `who_gho_WHS6_102_brics.json`.
- **Usefulness:** (a) National-level only (no sub-national India) — use for calibrating simulator priors (beds/10k, physicians). (b) Gives a consistent cross-BRICS baseline to normalise nodes. (c) Static covariates, not time-series features.

## 5. World Bank Indicators API

- **Endpoints:** `GET https://api.worldbank.org/v2/country/IND;BRA;ZAF;RUS;CHN/indicator/SH.MED.BEDS.ZS?format=json&per_page=400` and `…/SH.MED.PHYS.ZS?…` → **200** each, 330 rows (5 countries × 1960–2025). **Gotcha:** `per_page=200` (as in the brief) only returned page 1 of 2 — use `per_page=400` or follow `pages`.
- **Auth needed:** No.
- **Response shape:** JSON array `[ {page,pages,per_page,total,sourceid,lastupdated:"2026-07-13"}, [ {indicator:{id,value}, country:{id,value}, countryiso3code, date, value, unit, obs_status, decimal} ] ]`. Most recent years are `null`.
  - Beds per 1,000 (latest non-null): IND 1.59 (2021), BRA 2.52 (2021), CHN 5.63 (2023), RUS 6.81 (2023), ZAF 2.25 (2010).
  - Physicians per 1,000: IND 0.723 (2020), BRA 2.357 (2023), CHN 3.112 (2022), RUS 5.111 (2022), ZAF 0.794 (2022).
- **Rate limits:** none published; the API is unkeyed. **Licence:** CC-BY 4.0 (World Bank Terms of Use for Datasets).
- **Files:** `worldbank_SH.MED.BEDS.ZS_brics.json`, `worldbank_SH.MED.PHYS.ZS_brics.json`.
- **Usefulness:** same as §4 (national priors); CC-BY is a friendlier licence than WHO's NC clause, so prefer World Bank where the indicator overlaps.

## 6. Brazil DATASUS / open-data portal (federated "second nation")

### 6a. FTP `ftp.datasus.gov.br` (python ftplib, anonymous)
- Connect + `login()` → `220 Microsoft FTP Service`, `230 User logged in.` **Reachable.**
- `LIST /dissemin/publicos/` → 25 directories: ANS, CIH, CIHA, CMD, CNES, Dados_Abertos, ESUSNOTIFICA, IBGE, PCE, PNI, RESP, SIASUS, **SIHSUS**, SIM, SINAN, SINASC, SISCAN, SISPRENATAL, TABDOS, TABNET, TABWIN, painel_oncologia, Pesquisas, uploads, "EXTR ESP". Saved to `datasus_ftp_dissemin_publicos_listing.txt`.
- `LIST /dissemin/publicos/CNES/200508_/Dados/ST/` → 6,804 files (`ST<UF><YYMM>.dbc`, 2005-08 → 2026-07; e.g. `STTO2607.dbc` 160 KB).
- `LIST` and `NLST` of `/dissemin/publicos/SIHSUS/200801_/Dados/` → **timed out** twice (60 s and 90 s socket timeouts) — the directory is enormous (RD<UF><YYMM> for 27 states × 18 years). Fetch known filenames directly instead of listing.
- **Sample downloaded:** `datasus_CNES_STAC2607.dbc` (CNES establishments, Acre, July 2026; 74,802 bytes; first attempt timed out at 60 s, second succeeded in 42 s with a 180 s timeout). The HTTP mirror `https://ftp.datasus.gov.br/…` timed out (connect, 40 s).
- **Format caveat:** `.dbc` = DBF header + PKWare-"blast"-compressed body. Stdlib cannot decompress the body; needs `pyreaddbc`/`datasus-dbc` (Python) or `read.dbc` (R). The uncompressed DBF header **is** readable: parsed 209 fields, 1,752 records, record length 499 — field list saved in `datasus_CNES_STAC2607_fields.txt` (CNES, CODUFMUN, TP_UNID, NIV_HIER, QTLEITP1-3, LEITHOSP, ATEND_PR, COMPETEN, …).
- **Licence:** Brazilian government open data (LAI / dados abertos); no licence file on the FTP.

### 6b. Open-data portal
- `https://opendatasus.saude.gov.br/` → **302 → `https://dadosabertos.saude.gov.br/`** (200). The old CKAN paths (`/api/3/action/package_search`) now return **404** on both hosts — it is no longer a CKAN instance.
- The portal links to a REST API: **`https://apidadosabertos.saude.gov.br`** ("DEMAS - API de Dados Abertos", v1.8.32, Swagger 2.0 spec at `/static/swagger.json`, 200, 87 GET paths, `securitySchemes: none`, spec licence MIT). Swagger UI at `/v1/`.
- **Tested endpoints (all no auth, all 200):**
  - `GET /cnes/estabelecimentos?limit=20&codigo_uf=12` → `{estabelecimentos:[…]}`, 37 keys per facility incl. `codigo_cnes, codigo_uf, codigo_municipio, codigo_tipo_unidade, latitude/longitude_estabelecimento_decimo_grau, estabelecimento_possui_atendimento_hospitalar, …`. `limit` max 20 here. Contains facility phone/e-mail (treat as PII-adjacent; strip before demo).
  - `GET /assistencia-a-saude/unidade-basicas-de-saude?limit=10` → `{ubs:[{cnes, nome, uf, ibge, logradouro, bairro, latitude, longitude}]}` — Brazil's primary-care units (UBS/USF = PHC equivalent). Note lat/lon use decimal **commas** ("-8,21811").
  - **`GET /daf/estoque-medicamentos-bnafar-horus?limit=20`** → `{parametros:[…]}`. This is the **national pharmacy stock ledger (BNAFAR/Hórus)**: per facility (`codigo_cnes`, lat/lon, municipality, UF) × product (`codigo_catmat`, `descricao_produto` e.g. "FLUOXETINA, CLORIDRATO 20 MG CÁPSULA", "ALBENDAZOL 400 MG", "ACICLOVIR 200 MG") × **lot** (`numero_lote`, `data_validade`) → `quantidade_estoque` on `data_posicao_estoque`. Filters: `codigo_uf, codigo_municipio, codigo_cnes, anomes_posicao_estoque (AAAAMM), data_posicao_estoque, codigo_catmat, sigla_programa_saude, tipo_produto, sigla_sistema_origem`; `limit` ≤ 1000.
    - One facility (`codigo_cnes=8471223`, "FARMACIA MUNICIPAL", Igaraçu do Tietê/SP): 769 lot-rows, 158 distinct products, 753 lots, 529 rows at zero stock, quantities from −1260 to 90,625 (negatives exist — data-quality signal).
    - History depth: `anomes_posicao_estoque=202609` → 50 rows dated 2026-09-03 (origin HORUS); `202608` → rows dated 2026-08-22 (origin SI_BNAFAR); `202501` for Acre → **0 rows**. So it exposes recent monthly positions, not a deep multi-year history — to build a series, snapshot it periodically or restrict to whatever months return data.
- **Files:** `brazil_apidadosabertos_swagger.json`, `brazil_apidadosabertos_cnes_estabelecimentos_uf12_acre.json`, `brazil_apidadosabertos_ubs.json`, `brazil_apidadosabertos_daf_estoque_medicamentos_bnafar_horus.json`, `brazil_apidadosabertos_horus_cnes8471223.json`, `brazil_apidadosabertos_horus_uf12_202609.json`, `brazil_apidadosabertos_horus_uf12_202501.json` (empty result kept as evidence).
- Other relevant paths in the spec (not called): `/arboviroses/dengue` (notifications by year × municipality — filters `nu_ano, id_municip`), `/arboviroses/chikungunya`, `/assistencia-a-saude/hospitais-e-leitos`, `/vacinacao/doses-aplicadas-pni-2026`, `/vigilancia-e-meio-ambiente/srag-2019-2026`, `/sisvan/estado-nutricional`.
- **Licence:** Ministry of Health open data (dados abertos, government open-data policy PDA 2024-2026 linked from the portal); API spec says MIT.
- **Verdict as "second nation" for a federated demo: YES, and stronger than expected.** Brazil publishes, without login, facility-level medicine stock by product and lot with expiry dates and coordinates — the same entity model (facility → item → on-hand qty) an Indian PHC simulator needs. Pair it with Open-Meteo at the facility lat/lon and `/arboviroses/dengue` for demand shocks and you have a real Brazilian node; the Indian node stays simulated. Caveats: Portuguese labels, CATMAT product codes (need a mapping to INN/ATC to align with Indian EDL items), shallow history via the API (FTP `.dbc` files go back to 2005 but need a decoder), and PII-adjacent contact fields to drop.

## 7. data.gov.in (reachability only)

- `GET https://api.data.gov.in/` → **404**, body `404 page not found` (text/plain). The host is up; the root simply has no route (resource endpoints live under `/resource/<id>?api-key=…`). Detailed work is with the other agent. File: `datagovin_root.txt`.

## 8. India-specific quick checks (status only)

- **IMD (India Meteorological Department):** no documented public JSON API found. `https://mausam.imd.gov.in/` → 200 (HTML site); `https://mausam.imd.gov.in/api/` → **403**; the two community-known endpoints `https://mausam.imd.gov.in/api/current_wx_api.php?id=42182` and `https://city.imd.gov.in/api/cityweather.php?id=42182` → **401** (now require credentials). Verdict: not usable; Open-Meteo covers the need.
- **ABDM Health Facility Registry:** `https://facility.abdm.gov.in/` (and `/api/v1/facility/search`, `https://hfr.abdm.gov.in/`) all **301 → `https://nhpr.abdm.gov.in/nhpr/v4`** (200, an Angular SPA — National Health Provider Registry). One unauthenticated `POST https://facility.abdm.gov.in/v1/facility/search` → **403** from CloudFront. `https://facilitysbx.abdm.gov.in` → connection failed (curl 7). **Needs ABDM client credentials / gateway auth — stopped here, no bypass attempted.** Verdict: not available for a public prototype; use OSM (§9) or data.gov.in facility lists instead.

## 9. OpenStreetMap Overpass (PHC coverage around Patna)

- **Endpoint:** `POST https://overpass-api.de/api/interpreter` with `[out:json][timeout:60];(node[amenity=hospital](25.45,84.95,25.75,85.35);node[healthcare](bbox);way[amenity=hospital](bbox);way[healthcare](bbox););out center tags;` — one query, ~0.3°×0.4° bbox, identifying User-Agent set.
- **Auth needed:** No. **HTTP status:** 200, 103,888 bytes.
- **Result:** **320 elements** (292 nodes, 28 ways), 303 named. amenity: hospital 211, clinic 22, pharmacy 21, doctors 8, dentist 8. healthcare tag: hospital 96, **centre 41**, clinic 19, pharmacy 21, laboratory 6, doctor 8, alternative 3.
  - PHC-level facilities are present: 31 names match PHC/APHC/UPHC/CHC, e.g. **"PHC, Danapur"**, **"APHC Sherpur"**, **"UPHC East Lohanipur"**, also "PHC,Gopalpur", "APHC Mallikpur", "APHC Neora", "Patna Sadar,PHC,Sabalpur", "PHC, Kurkuri". They are tagged `healthcare=centre` (no `amenity`), often with `addr:district`, `addr:subdistrict`, `addr:state`, `description`, `source` (a bulk import), rarely phone.
  - Other sample names: "New Gardinar Road Hospital", "Tripolia Social Service Hospital", "Perfect Vision Eye Clinic".
- **Usage policy (wiki.openstreetmap.org/wiki/Overpass_API, fetched today):** public instance is fine for "less than 10,000 queries per day and less than 1 GB data per day"; regular apps should stay ~100× below that; no parallel scripts; set a User-Agent; back off 30 s on 429/406.
- **Licence:** ODbL 1.0, © OpenStreetMap contributors (share-alike applies to derived databases).
- **File:** `overpass_patna_healthcare.json`.
- **Usefulness:** (a) Yes — real PHC/APHC/UPHC names with coordinates and block (`addr:subdistrict`) for Patna district, enough to seed a realistic facility roster; query `healthcare=centre` + name regex `PHC|CHC` rather than `amenity=hospital`. Coverage will vary by state (Bihar looks bulk-imported; check Arunachal/J&K before relying on it). (b) Works for Brazil too, but CNES/UBS (§6b) is authoritative there. (c) Facility-density and distance-to-hospital features.

---

## Summary matrix

| API | Auth | Status | Licence | (a) India sim | (b) BRICS partner | (c) Features |
|---|---|---|---|---|---|---|
| Open-Meteo archive | none | 200 | CC-BY 4.0 | strong | strong | strong |
| Open-Meteo forecast | none | 200 | CC-BY 4.0 | – | – | strong |
| DHIS2 play (stable-2-43-1) | admin/district | 200 | BSD-3 / synthetic SL data | schema reference | weak (synthetic) | pattern only |
| WHO GHO OData | none | 200 (500 on `in`) | CC BY-NC-SA 3.0 IGO | priors | priors | static |
| World Bank v2 | none | 200 | CC-BY 4.0 | priors | priors | static |
| DATASUS FTP | anonymous | reachable; SIHSUS LIST timeout | gov open data | – | strong (needs .dbc decoder) | historical |
| apidadosabertos (Hórus stock, CNES, UBS) | none | 200 | gov open data / MIT spec | – | **strong, real stock ledger** | dengue, stock |
| data.gov.in root | – | 404 (host up) | – | (other agent) | – | – |
| IMD | – | 401/403 | – | no | – | no |
| ABDM HFR | required | 301→SPA, 403 API | – | no | – | no |
| Overpass | none | 200 | ODbL | strong (PHC names) | ok | density |

## Errors and blockers

1. **WHO GHO OData `in` operator → HTTP 500** ("Server Error 500" HTML). Workaround: chained `eq … or …` (200).
2. **DHIS2 play URL discovery:** `play.dhis2.org` redirects to an SPA; guessed instance names (`stable-2-40-x`, `stable-2-42-1`, `stable-2-41-4`, …) all 404. Resolve live names from `https://api.im.dhis2.org/instances/public`. `pe:LAST_12_MONTHS` and 2024 periods return 0 analytics rows on the demo (data is for 2025).
3. **World Bank `per_page=200` truncates** to page 1 of 2 for 5 countries (330 rows); use `per_page=400`.
4. **DATASUS FTP:** `LIST`/`NLST` of `/dissemin/publicos/SIHSUS/200801_/Dados/` timed out at 60 s and 90 s (twice). CNES `.dbc` download timed out once at 60 s, succeeded on retry with 180 s (42 s transfer for 75 KB — the server is slow; budget minutes for MB-scale files). HTTPS mirror `ftp.datasus.gov.br` connect timed out (40 s). `.dbc` body needs a non-stdlib decompressor.
5. **opendatasus.saude.gov.br CKAN API is gone** (302 to dadosabertos.saude.gov.br; `/api/3/action/*` → 404 on both). Replacement is `https://apidadosabertos.saude.gov.br` (Swagger at `/static/swagger.json`; `/openapi.json`, `/swagger.json`, `/docs` → 404).
6. **Hórus stock history is shallow via the API:** Acre `anomes=202501` → 0 rows; 202608/202609 return data. Plan to snapshot regularly or fall back to FTP archives.
7. **data.gov.in root → 404** (expected; not a real endpoint).
8. **IMD:** `/api/` 403, `current_wx_api.php` and `cityweather.php` 401 — no public JSON API.
9. **ABDM HFR:** everything redirects to `nhpr.abdm.gov.in/nhpr/v4` SPA; unauthenticated API call 403 (CloudFront); sandbox host unreachable (curl 7). Requires ABDM credentials — stopped.
10. **zsh quirk (local, not API):** unquoted `?` in URLs triggered "no matches found"; `[ ]` in DHIS2 `fields=` needs `curl -g`.
