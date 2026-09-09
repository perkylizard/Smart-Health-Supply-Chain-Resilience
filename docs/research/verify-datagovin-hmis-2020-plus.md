# data.gov.in: does it carry HMIS district data for FY 2020-21 onward?

Checked 9 September 2026 via the data.gov.in `lists` API (project key from `.env`), filtering by `catalog_uuid` and by title `HMIS`. 1,308 HMIS-titled resources on the whole platform were tabulated by financial year.

## Verdict: no. Nothing at district or sub-district level after FY 2019-20.

| Financial year | HMIS resources | Note |
|---|---|---|
| 2008-09 to 2018-19 | 78 to 141 per year | Item-wise district, state and sub-district catalogs, all last updated Feb 2021 |
| 2019-20 | 104 | Last year with district item-wise files |
| 2020-21 | 0 | |
| 2021-22 to 2023-24 | 1 each | State-level single tables only (IFA coverage, menstrual hygiene beneficiaries) |

Main catalogs and their coverage:

| Catalog | uuid | Resources | Years |
|---|---|---|---|
| Item-wise HMIS report of all States and Districts Across the Months | `3eb6339e-df13-4684-9b80-3acea3fcf1ac` | 335 | 2008-09 to 2019-20 (one 2019-20 file) |
| Item-wise HMIS report at District level | `a3b3f71e-8940-4cba-9c72-91440c10a76c` | 288 | 2008-09 to 2019-20, 24 per year |
| Item-wise HMIS report at State level | `00284808-21a3-4b0f-9910-a13cb474be7e` | 288 | 2008-09 to 2019-20 |
| Performance of Key HMIS Indicators (sub-district) | `a412dee5-3e5c-467b-b93c-55369bfe45b5` | 352 | 2008-09 to 2019-20 |

The catalog page's "updated 14 Feb 2025" stamp reflects metadata edits, not new years. The per-state catalogs (e.g. Uttar Pradesh) were last updated May 2021.

## API notes

- `filters[title]=HMIS` on `https://api.data.gov.in/lists` works as a token match. `filters[catalog_uuid]=<uuid>` gives an exact catalog listing. The catalog uuid appears in the catalog HTML page.
- Responses above roughly 3 MB are truncated mid-JSON. Use `limit=300` or less. This is the same failure the earlier `fetch_datagovin.py` run hit as `IncompleteRead`.

## Implication

For 2020-21 onward the only official district-level routes left are the new HMIS portal (`hmis.mohfw.gov.in`, Standard Reports, login status unverified) and third-party mirrors such as India Data Portal. Not yet checked.
