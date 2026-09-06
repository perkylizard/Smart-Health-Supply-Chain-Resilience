# Check of the manually downloaded HMIS and HDI files

Checked 6 September 2026. Folders: `C2. Data Itemwise Monthly (up to sub district)/` and `HDI Reports/`.

## Summary

| Folder | Contents | Verdict |
|---|---|---|
| C2 / All States Across Districts / 2017-18, 2018-19, 2019-20 | 36 states x 12 months x (monthwise + cumulative), district columns, 318 data items. HTML tables saved with a .xls extension. Complete for all 9 target states. | Use. This is the core dataset. |
| C2 / All States Across Districts / 2008-09 to 2016-17 | Same layout, older item list. | Keep for long seasonality if needed. Not required. |
| C2 / All States Across Districts / 2020-21 | Only 7 states (A&N to Chhattisgarh) downloaded, real xlsx format. Bihar, Arunachal, Assam present. Provisional. | Partial. Complete only if we want the COVID-shock year for Kerala, UP, MP, Karnataka, Rajasthan, J&K. |
| C2 / All States Across Districts / 2021-22 | Empty. | Portal seems to stop here. |
| C2 / All India Across States | State-level summaries, real Excel 97 (.xls) binary for most years. | Redundant: district files carry a state total column. Skip. |
| HDI Reports / RHS 2016-17 to 2021-22 | 240 to 297 pages each. Text extractable except 2017-18. | Use for PHC counts and staffing. |
| HDI Reports / HDI 2022-23 and 2023-24 | 240 and 272 pages. **Scanned images, no text layer.** | Need OCR (Gemini vision is the natural fit and a good story). |
| HDI Reports / RHS 2017-18 | 252 pages, only 4 pages with text. | Needs OCR too, or use data.gov.in RHS tables for that year. |

Totals: 10,486 HTML-as-xls files plus 138 xlsx, 30 GB. Only 2 folder anomalies across 2017-2020 (Telangana 2017-18 has 10 monthwise files and no cumulative). No zero-byte or truncated files found among the 9 target states.

## The important discovery: HMIS carries real stock ledgers

Sections M17 (Vaccines), M19 (Other Items), and M20 (Syringes) report, per district per month, five stock fields:
1. Balance from previous month
2. Stocks received
3. Unusable stock
4. Stock distributed
5. Total stock

Commodities covered: DPT, Pentavalent, OPV, TT, BCG, Measles, JE, Hepatitis B, IPV, MR, Rotavirus vaccines; ORS, Zinc 20 mg, IFA adult / adolescent / junior / paediatric syrup, Albendazole 400 mg, Calcium, Vitamin A syrup, paediatric antibiotics (Amoxycillin and Gentamicin), Fluconazole, RTI/STI kits, gloves, MVA syringes, blood transfusion sets, AD syringes 0.1 and 0.5 ml, 5 ml disposable syringes.

Item 14.17 is "Stock out rate of essential drugs", reported per district.

Consequence: the Indian node is no longer fully simulated. For roughly 25 commodities we have real monthly district-level stock movements for 3 years across all states. The simulator only needs to (a) disaggregate district to PHC and (b) extend the catalogue to the rest of NLEM using consumption ratios.

## Demand-signal items confirmed present (codes stable 2017-2020)

- 14.2.1 Allopathic outpatient attendance, 14.2.2 AYUSH outpatient
- 14.3.x Inpatient by sex and age
- 14.4.1 to 14.4.8 Inpatient by disease: malaria, dengue, typhoid, respiratory, TB, fever of unknown origin, diarrhoea with dehydration, hepatitis
- 14.5 to 14.6.7 Emergency attendance incl. snake bite, trauma, burns, obstetric
- 10.1 to 10.12 Childhood diseases: pneumonia, TB, measles, malaria, diarrhoea
- 11.x NVBDCP: blood smears, dengue positives
- 9.x child immunisation doses; 2.2 institutional deliveries; 1.x ANC and IFA
- 16.x deaths by cause; 14.17 stock-out rate

## File formats and parsing

| Files | Real format | Parser |
|---|---|---|
| 2008-09 to 2019-20 district files (.xls) | HTML table from SAS, cp1252 | Python html.parser, verified on 5 states |
| 2020-21 district files (.xlsx) | OOXML with inline strings, one sheet | Python zipfile + XML, verified on Bihar |
| All-India state files (.xls) | Excel 97 binary | Would need xlrd. Not needed. |

Layout of every district file: row 2 = district names (first column is the state total, prefixed with underscore), row 3 = five sub-columns per district (Total, Public, Private, Urban, Rural), then one row per data item with section label, item code, item name, and either "TOTAL" or a stock-field label in the third column. 539 rows per file.

Granularity is district. No sub-district files were downloaded. India Data Portal's sub-district dataset remains the route to block level.

## Recommended next steps

1. Keep 2017-18 to 2019-20 district files for all 36 states as the canonical raw set. Move them to `data/raw/hmis/c2-district/` and leave the rest where they are (do not delete; not needed in the repo).
2. Write one parser that converts every district file into a long table: state, district, year, month, item code, item name, measure (Total/Public/Private/Urban/Rural or the five stock fields), value.
3. OCR HDI 2023-24 district PHC tables with Gemini vision as the first Google AI task in the build.
4. Do not commit the 30 GB folder to GitHub. Commit the parsed long table (a few hundred MB at most, or per-state parquet) plus a script that rebuilds it from the raw folder.
