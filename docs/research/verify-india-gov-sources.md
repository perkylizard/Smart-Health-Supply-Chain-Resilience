# India government health data sources - verification report

Verified 2026-09-05 with curl/python3 (stdlib) from macOS. HMIS skipped per instructions.
Samples: `samples/india-gov/` (see `SOURCES.txt` there). States of interest: Bihar, Kerala, Uttar Pradesh, Madhya Pradesh, Arunachal Pradesh, Assam, Karnataka, Rajasthan, Jammu & Kashmir ("the 9 states").

Verdict summary

| # | Source | Verdict | One-line reason |
|---|--------|---------|-----------------|
| 1 | data.gov.in (OGD) | Use (API) | Catalog API works keyless; demo key returned HTTP 200 on a resource; several RHS-derived PHC/staffing tables + full NFHS-5 district factsheet resource |
| 2 | RHS / Health Dynamics of India 2022-23 | Manual | Latest edition is "Health Dynamics of India 2022-23" (RHS renamed); HMIS download endpoint returns HTTP 500, MoHFW site is JS-rendered - PDF not retrievable by script |
| 3 | IDSP weekly outbreak reports | Manual / Skip | idsp.mohfw.gov.in unreachable (timeouts, ECONNREFUSED); NCDC mirror PDFs 404 |
| 4 | NFHS-5 district factsheets | Use | Compiled CSVs on GitHub (MIT / CC-BY-4.0) cover all 9 states, ~705-709 districts, 104-105 indicators; official rchiips.org pages 404 |
| 5 | NCVBDC malaria/dengue/chikungunya | Use (PDF/HTML) | State-wise tables for 2021/2022-2026 (provisional) downloaded; all 9 states present in malaria and dengue tables (J&K appears as "J & K") |
| 6 | Census 2011 district population | Use | Official PCA xlsx: 640 districts x 94 columns, all 35 states/UTs of 2011 |
| 7 | NLEM 2022 | Use | Official CDSCO PDF, 135 pages, 384 medicines, each tagged with level P/S/T |
| 8 | State open-data portals | Manual / partial | Karnataka has PHC/CHC lists on karnataka.data.gov.in (via OGD API); Kerala portal has no obvious health-facility CSV; Rajasthan portal times out; nothing found for the other 6 |

---

## 1. data.gov.in (Open Government Data platform)

Working URLs
- Catalog/list API (NO key needed): `https://api.data.gov.in/lists?format=json&notfilters[source]=visualize.data.gov.in&filters[title]=primary+health+centre&offset=0&limit=40` -> HTTP 200, JSON (`total`, `records[]` with `index_name` = resource id, `title`, `updated_date`, `field[]` schema). Use `curl -g` (brackets in URL).
- Resource API (key required): `https://api.data.gov.in/resource/<resource_id>?api-key=<KEY>&format=json&limit=N`
  - Without key: HTTP 400 `{"error":"Authorization field missing"}`.
  - Demo key `579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b` tried ONCE on resource `81fdeaea-f15e-4179-8526-7eb74f2c72ca`: HTTP 200, returned resource metadata + field schema (capture truncated at 1500 chars before the records array, so record payload itself not inspected; the key was accepted).
- Website resource pages: e.g. `https://www.data.gov.in/resource/stateuts-wise-number-phcs-primary-health-centre-chcs-community-health-centres-functioning` HTTP 200 (page mentions GODL licence).

API key sign-up (from data.gov.in docs / datagovindia client docs, not tested): free; register on data.gov.in with an email, then the key appears under "My Account". Instant per those docs - unverified by me (no sign-up done, per rules).

Relevant resources found (resource id | last updated | title | fields)
1. `cf80173e-fece-439d-a0b1-6e9cb510593d` | 2025-04-11 | India Districts Factsheets of NFHS-5, 2019-2021 | 111 fields: District Names, State/UT, Number of Households surveyed, ... (full NFHS-5 district factsheet as one table)
2. `7c568619-b9b4-40bb-b563-68c28c27a6c1` | 2026-02-10 | All India and State/UT-wise Factsheets of NFHS-5 | States/UTs, Area, ...
3. `f1cd67be-1623-4e43-8410-d71bea7ba11d` | 2024-11-03 | State/UT-wise Total Number of PHCs, SHCs and District Hospitals as per RHS 2021-22 | State/UT, Sub-Health Centres, Primary Health Centres, District Hospitals
4. `4e3c855c-c10c-479e-ae6e-187bfed35ac1` | 2023-11-19 | State/UTs-wise Number of PHCs, CHCs Functioning in Rural and Urban Areas as per RHS 2020-21 | State/UT, PHCs Rural/Urban/Total, CHCs Rural/Urban/Total
5. `782c19ad-5833-4745-95b2-31656af47bed` | 2023-11-20 | State/UTs-wise Vacancy status at Rural and Urban facilities as per RHS 2021 | Doctors (DH and below), Specialist-Physician (CHC), Lab Technicians, Radiographer, Pharmacists (CHC and below), Staff Nurses, MPW at PHC and below, Paramedical (DH/SDH)
6. `288508e5-9597-4668-b4d4-ba420ceeef6d` | 2023-11-20 | District-wise Ayushman Bharat HWC operational status as on 14-12-2022 (aspirational districts only) | Name of Aspirational Districts, SHC, PHC, UPHC, Total
7. `b51adc87-c097-464e-8758-e81560b8e03c` | 2022-07-29 | State/UTs-wise PHCs and CHCs as on 31 March 2020
8. `b92fda75-7373-40d3-96ba-67e2f352a5e8` | 2022-07-26 | District Wise Public Primary Health Centers Non24x7 in Karnataka | Sl No, DISTRICT_NAME, Hospital, TYPE_OF_FACILITY (facility-level list)
9. `b9afe1e5-d1c5-4b41-a736-881c97d32397` | 2022-07-26 | District Wise Public Community Health Centers in Karnataka | same fields
10. `10bc28ff-78ac-41e8-92d0-dff7fcec2971` | 2023-10-23 | List of District Wise Functional Health Sub Centre in Bihar as on 2015 | District, No. of Health Sub-Center (Functional)
11. `45870415-b8f0-41aa-981f-19689e9b443f` | 2026-02-26 | State-wise Pharmacists at PHCs & CHCs as on 31 March 2013 (old data, recently re-indexed) | State/UT, Required, Sanctioned, In Position, Vacant, Shortfall
12. `e259e0c7-8e81-4805-a69c-dbecf9a04429` | 2025-09-13 | List of Government Health Facilities in Meghalaya (not a target state, but shows facility-level lists exist for some states)

Coverage of 9 states: the RHS-derived tables (items 3-5, 7) are state-level and include all states/UTs. Facility-level lists exist only for Karnataka (items 8-9) and Bihar sub-centres (2015, counts only). No facility-level PHC list found for Kerala, UP, MP, Arunachal, Assam, Rajasthan, J&K on OGD.
Licence: Government Open Data License - India (GODL) shown on resource pages.
Access method: API (needs a free key for `/resource/`; `/lists` is keyless).
Verdict: Use.

## 2. Rural Health Statistics (RHS), MoHFW

- Latest edition: RHS was renamed. The 2022-23 edition is "Health Dynamics of India (Infrastructure and Human Resources) 2022-23", released 9 Sep 2024 (PIB PRID 2053070, fetched HTTP 200). PIB text confirms it contains state comparisons 2005-2023 and district-wise SC/PHC/CHC/SDH/DH/MC counts; headline: 31,882 PHCs, 1,69,615 SCs, 6,359 CHCs as of 31 Mar 2023. No 2023-24 edition found in search (unverified whether it exists).
- Download URLs tried:
  - `https://hmis.mohfw.gov.in/downloadfile?filepath=publications%2FRural-Health-Statistics%2FRHS+2021-22.pdf` -> HTTP 500 "An error occurred"
  - same with `RHS+2022-23.pdf` and `RHS%202021-22.pdf` -> HTTP 500
  - `https://hmis.mohfw.gov.in/downloadfile?fileid=10` / `11` -> HTTP 500
  - `https://mohfw.gov.in/?q=en/pressrelease-59` -> HTTP 200 but 5 KB Next.js shell (client-rendered; no PDF link in HTML). WebFetch -> 403.
  - Guessed `https://mohfw.gov.in/sites/default/files/Health%20Dynamics%20of%20India%20(Infrastructure%20&%20Human%20Resources)%202022-23_RE%20(1).pdf` -> HTTP 404
  - `https://main.mohfw.gov.in/...` -> connection failed (HTTP 000)
- State-wise PHC counts and staffing: confirmed present by PIB description and by the data.gov.in RHS-derived tables (section 1, items 3-5), but the PDF/Excel itself was NOT downloaded.
- Format: PDF (Excel not found). Latest year: 2022-23 (data as on 31 Mar 2023).
- Verdict: Manual - open `https://mohfw.gov.in` > Documents > Publications in a browser and download the PDF; or use the data.gov.in RHS tables via API instead.

## 3. IDSP weekly outbreak reports

- Official page: `https://idsp.mohfw.gov.in/index4.php?lang=1&level=0&linkid=406&lid=3689` (Weekly Outbreaks). Reports are per-week PDFs at `https://idsp.mohfw.gov.in/WriteReadData/l892s/<id>.pdf` (from search index, e.g. `1382217141766997965.pdf`, `62327898311773118282.pdf`).
- Results: `https://idsp.mohfw.gov.in/` timed out (60 s) x1; weekly page timed out over https, https -k and http (45 s each); direct PDF timed out; WebFetch -> `ECONNREFUSED 164.100.54.41:443`. NCDC-hosted copies `https://ncdc.mohfw.gov.in/wp-content/uploads/2024/02/262023.pdf` and `312023.pdf` -> HTTP 404; `https://ncdc.mohfw.gov.in/weekly-outbreaks/` -> HTTP 404.
- Table structure: NOT observed (no PDF obtained). Unverified.
- Only related file obtained: `idsp_event_chronicle_JanMar2026.pdf` (NCDC quarterly newsletter, 4 pages, HTTP 200) - narrative, not the weekly table.
- Coverage of 9 states: unverified.
- Verdict: Manual (site may be geo-blocked or down; try from an Indian IP / browser). Skip for the prototype unless a manual download is done.

## 4. NFHS-5 district factsheets

(a) Official pages
- `https://rchiips.org/nfhs/districtfactsheet_NFHS-5.shtml` -> curl SSL error "unable to get local issuer certificate"; with `-k` -> HTTP 404; `http://` -> 404; `https://rchiips.org/nfhs/` and `Factsheet_Compendium_NFHS-5.shtml` -> 404. Official IIPS page currently not reachable at documented URLs.
- Working official mirror: DHS Program `https://dhsprogram.com/publications/publication-OF43-Other-Fact-Sheets.cfm` HTTP 200 (India national + state factsheet compendia Phase I/II PDFs; district PDFs listed there too).
- data.gov.in resource `cf80173e-fece-439d-a0b1-6e9cb510593d` (section 1) is an official compiled district table (111 fields, updated 2025-04-11).

(b) Compiled CSVs (GitHub raw, no login) - downloaded and inspected
- `nfhs5_districts_all_SaiSiddhardhaKalla.csv` (10.8 MB): 73,632 rows, 9 cols: State, ST_CEN_CD, District, DISTRICT, DT_CEN_CD, Category, Indicator, NFHS 5, NFHS 4. Long format. 709 distinct state-district pairs, 105 indicators, 38 states/UTs. All 9 states present (Bihar 3952 rows, Kerala 1456, UP 7800, MP 5304, Arunachal 2080, Assam 3432, Karnataka 3120, Rajasthan 3432, "Jammu & Kashmir" 2184). Includes 2011 census codes. Licence: none in repo.
- `nfhs5_phase2_districts_jvargh7.csv` (9.2 MB): 73,315 rows, 7 cols: state, district, Indicator, NFHS5, NFHS4, Flag_NFHS5, Flag_NFHS4. 705 districts, 104 indicators, 34 states/UTs; all 9 states present ("Jammu Kashmir"). Licence: MIT.
- `nfhs5_districts_pratapvardhan.csv` (4.2 MB): 35,464 rows, 8 cols; only 341 districts / 21 states (Phase 1 only) - missing UP, MP, Arunachal, Rajasthan. Licence CC-BY-4.0. `nfhs5_states_pratapvardhan.csv`: 4,847 rows, 131 indicators x 37 states, urban/rural/total - all 9 states present.
- Latest year: NFHS-5 (2019-21). Format CSV. Access: download.
- Verdict: Use (prefer jvargh7 MIT file, or the data.gov.in resource via API for an official wide table).

## 5. NCVBDC (malaria / dengue / chikungunya)

- Site `https://ncvbdc.mohfw.gov.in/` HTTP 200. Tables are inline HTML or PDFs (no Excel found).
- Malaria, state-wise 2022-2026: `https://ncvbdc.mohfw.gov.in/WriteReadData/l892s/44132297901787558433.pdf` (1 page). Columns per year: Tested, Positive, Pf, Deaths for 2022, 2023, 2024, 2025, 2026 (up to July). 36 states/UTs + India; all 9 states present (Jammu And Kashmir row 13).
- Malaria Monthly Epidemiological Situation, State-wise & District-wise Annual Report 2025: `.../87226817751785920429.pdf` (14 pages). Columns: Population, samples collected/tested (Slides/RDT/Others), Indigenous/Imported/Total cases by species (Pv, Pf, Mix, Pm, Po), Pf%, ABER, API, AFI, TFR, TPR, deaths, treatment done. District-level rows for every state - useful for district-level disease load.
- Dengue, state-wise 2021-2026 (provisional till 28 Feb 2026): inline table on `https://ncvbdc.mohfw.gov.in/index4.php?lang=1&level=0&linkid=431&lid=3715`, saved as `ncvbdc_dengue_statewise_2021-2026.csv` (40 rows; header: State, then Cases/Deaths per year). All 9 states present (J&K appears as "J & K", row 10; Ladakh row 36 is blank). Note: the "D&N Haveli" and "Daman & Diu" rows are split oddly in the source HTML - check those two rows manually.
- Chikungunya 2021-2026 (prov. till 30 Apr 2026): `.../63661226801781154716.pdf` (1 page; page links to `nvbdcp.gov.in` host which timed out, same path on `ncvbdc.mohfw.gov.in` worked). Columns: suspected and confirmed cases per year. Text extraction is messy (multi-column layout); Bihar, Assam, Arunachal, Karnataka, Rajasthan clearly present; Kerala/MP/UP/J&K rows appear but are garbled in extraction - verify visually.
- Latest year: 2025 full year; 2026 provisional (malaria to July, dengue to Feb, chikungunya to Apr).
- Licence: not stated. Access: download (PDF) / HTML table.
- Verdict: Use (state-level; district-level for malaria 2025). Parsing PDFs needs a PDF text tool (macOS PDFKit via osascript worked; no pdftotext installed).

## 6. Census 2011 district population

- URL: `https://censusindia.gov.in/nada/index.php/catalog/6191/download/9268/DDW_PCA0000_2011_Indiastatedist.xlsx` HTTP 200, 1.38 MB, Excel 2007+ (catalog page `https://censusindia.gov.in/nada/index.php/catalog/6191`).
- Structure (Sheet1): 2,028 data rows = (India + 35 states/UTs + 640 districts) x (Total/Rural/Urban). 94 columns: State, District, Subdistt, Town/Village, Ward, EB, Level (India/STATE/DISTRICT), Name, TRU, No_HH, TOT_P, TOT_M, TOT_F, P_06, ..., P_SC, P_ST, P_LIT, ..., worker categories, NON_WORK_P/M/F. State code 01 = Jammu & Kashmir (pre-2019, includes Ladakh districts). Sheet2/Sheet3 not inspected.
- Coverage: all 35 2011 states/UTs incl. all 9 target states (J&K as undivided state). Note: 2011 district boundaries (640) differ from NFHS-5 (~705) and current districts.
- Licence: not stated on link. Access: download. Latest year: 2011.
- Verdict: Use.

## 7. NLEM 2022

- URL: `https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadConsumer/nlem2022.pdf` HTTP 200, 4.7 MB, PDF 1.7, 135 pages.
- Content verified from extracted text: medicines listed by therapeutic section with columns "Medicine | Level of Healthcare | Dosage form(s) and strength(s)"; level codes are P, S, T (e.g. "2.1.5 Paracetamol** P,S,T", "2.2.1 Fentanyl S,T"). Alphabetical index ends at "384. Zolpidem", confirming 384 medicines (matches PIB launch note). 441 numbered sub-entries (section numbering includes combination entries).
- Format PDF; text extraction works (PDFKit); table columns will need parsing since level codes sit on the medicine line.
- Licence: not stated. Access: download. Verdict: Use.

## 8. State open-data portals

- Karnataka: `https://karnataka.data.gov.in/resource/district-wise-public-community-health-centers-karnataka` HTTP 200 (OGD state instance). Data available via the OGD resource API (ids `b9afe1e5...` CHCs, `b92fda75...` non-24x7 PHCs; 2022). Also `data.opencity.in` (CKAN, CSV) lists Karnataka health datasets but only Bengaluru births/deaths and COVID - no PHC list.
- Kerala: `https://kerala.data.gov.in/` HTTP 200; search page returned no dataset links in static HTML; OGD API title search "Kerala hospital" returned only generic "Hospital directory" resources (2018-2020, unclear scope). No verified PHC/FHC CSV. Needs manual browse.
- Rajasthan: `https://rajasthan.data.gov.in/` timed out twice (HTTP 000). OGD API: `857rt057vu1faabnjzlwpmsrdz45bxkf` "hanumangarh data of rajasthan health facilities" (2020) - single district only.
- Bihar, UP, MP, Assam, Arunachal, J&K: OGD API filter `org_type=State` + state name returned 0-37 datasets with no health-facility titles. No state portals with health CSVs found in the quick search.
- Verdict: Manual (Karnataka: Use via OGD API).

---

## Errors and blockers

| Target | URL | Error |
|--------|-----|-------|
| IDSP home | https://idsp.mohfw.gov.in/ | curl (28) Connection timed out after 60008 ms |
| IDSP weekly page | https://idsp.mohfw.gov.in/index4.php?lang=1&level=0&linkid=406&lid=3689 | timed out (45 s) over https, https -k, and http |
| IDSP weekly PDF | https://idsp.mohfw.gov.in/WriteReadData/l892s/1382217141766997965.pdf | timed out (45 s) |
| IDSP via WebFetch | same page | connect ECONNREFUSED 164.100.54.41:443 |
| NCDC weekly mirror | https://ncdc.mohfw.gov.in/weekly-outbreaks/ ; /wp-content/uploads/2024/02/262023.pdf ; 312023.pdf | HTTP 404 |
| RHS PDF (HMIS) | https://hmis.mohfw.gov.in/downloadfile?filepath=publications%2FRural-Health-Statistics%2FRHS+2021-22.pdf (and 2022-23, %20 variant, fileid=10/11) | HTTP 500, body "An error occurred" |
| RHS page (HMIS) | https://hmis.mohfw.gov.in/publications/rhs | HTTP 200 but body is an error page ("This page can't be displayed") |
| MoHFW press release / documents | https://mohfw.gov.in/?q=en/pressrelease-59 ; ?q=en/documents/publications | HTTP 200, 5 KB Next.js client-rendered shell, no content/links; WebFetch HTTP 403 |
| MoHFW guessed PDF | https://mohfw.gov.in/sites/default/files/Health%20Dynamics%20...2022-23_RE%20(1).pdf | HTTP 404 |
| main.mohfw.gov.in | https://main.mohfw.gov.in/newshighlights-90 ; /sites/default/files/RHS%202021-22_2.pdf | HTTP 000 (connection failed) |
| PIB press release via WebFetch | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2053070 | HTTP 403 (curl with browser UA succeeded, HTTP 200) |
| NFHS-5 official (IIPS) | https://rchiips.org/nfhs/districtfactsheet_NFHS-5.shtml | curl (60) SSL certificate problem: unable to get local issuer certificate; with -k HTTP 404; http HTTP 404; /nfhs/ and Factsheet_Compendium page 404 |
| Chikungunya PDF (linked host) | https://nvbdcp.gov.in/WriteReadData/l892s/63661226801781154716.pdf | HTTP 000 (no response); worked on ncvbdc.mohfw.gov.in host |
| Rajasthan portal | https://rajasthan.data.gov.in/ | HTTP 000 timeout (2 attempts) |
| api.data.gov.in root | https://api.data.gov.in/ | HTTP 404 (expected; only /lists and /resource endpoints exist) |
| api.data.gov.in with brackets | filters[title]=... | curl (3) "bad range in URL" unless `-g/--globoff` is used |
| data.gov.in resource without key | https://api.data.gov.in/resource/<id>?format=json | HTTP 400 {"error":"Authorization field missing"} |
| Local tooling | pdftotext / mutool / qpdf | not installed; used `osascript -l JavaScript` + PDFKit for PDF text |
